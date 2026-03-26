const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs/promises");
const fsSync = require("fs");
const crypto = require("crypto");
const sharp = require("sharp");

const app = express();
const PORT = Number(process.env.PORT || 5730);
const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-in-production";
const MAX_MESSAGES = Number(process.env.MAX_MESSAGES || 1000);
const TRUST_PROXY = String(process.env.TRUST_PROXY || "false").toLowerCase() === "true";
const MESSAGE_FILE = path.join(__dirname, "data", "messages.json");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const ALLOWED_USERS = (process.env.ALLOWED_USERS || "user1,user2")
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean)
  .slice(0, 2);

if (ALLOWED_USERS.length !== 2) {
  throw new Error("ALLOWED_USERS must contain exactly two usernames.");
}

if (TRUST_PROXY) {
  app.set("trust proxy", 1);
}

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const allowedAudioTypes = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "audio/x-m4a",
]);

const sseClients = new Set();
let messageWriteQueue = Promise.resolve();

async function ensureStorage() {
  await fs.mkdir(path.dirname(MESSAGE_FILE), { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  if (!fsSync.existsSync(MESSAGE_FILE)) {
    await fs.writeFile(MESSAGE_FILE, JSON.stringify({ messages: [] }, null, 2), "utf8");
  }
}

async function readMessages() {
  const raw = await fs.readFile(MESSAGE_FILE, "utf8");
  let parsed = { messages: [] };
  try {
    parsed = JSON.parse(raw);
  } catch (_err) {
    // If storage is corrupted, fail safely and keep service available.
    return [];
  }
  if (!parsed || !Array.isArray(parsed.messages)) {
    return [];
  }
  return parsed.messages;
}

async function writeMessages(messages) {
  const tmpPath = `${MESSAGE_FILE}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify({ messages }, null, 2), "utf8");
  await fs.rename(tmpPath, MESSAGE_FILE);
}

async function pruneMessages(messages) {
  if (messages.length <= MAX_MESSAGES) return messages;

  const keep = messages.slice(-MAX_MESSAGES);
  const removed = messages.slice(0, messages.length - MAX_MESSAGES);

  const toDelete = removed
    .map((msg) => (msg.file && msg.file.path ? path.join(__dirname, msg.file.path) : null))
    .filter(Boolean);

  await Promise.all(
    toDelete.map(async (fullPath) => {
      try {
        await fs.unlink(fullPath);
      } catch (_err) {
        // Cleanup is best-effort; missing files should not fail requests.
      }
    })
  );

  return keep;
}

async function appendMessage(message) {
  messageWriteQueue = messageWriteQueue.then(async () => {
    const messages = await readMessages();
    messages.push(message);
    const pruned = await pruneMessages(messages);
    await writeMessages(pruned);
    broadcast("message:new", message);
  });

  await messageWriteQueue;
}

function broadcast(event, payload) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(data);
    } catch (_err) {
      sseClients.delete(res);
    }
  }
}

function sanitizeOriginalName(fileName) {
  return path.basename(fileName).replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(0, 80) || "file";
}

async function optimizeImageOnDisk(absInputPath) {
  const outName = `${Date.now()}-${crypto.randomUUID()}-opt.jpg`;
  const outAbs = path.join(UPLOAD_DIR, outName);

  const input = await fs.readFile(absInputPath);
  const meta = await sharp(input).metadata();
  let pipeline = sharp(input).rotate();
  if ((meta.width && meta.width > 1280) || (meta.height && meta.height > 1280)) {
    pipeline = pipeline.resize({
      width: 1280,
      height: 1280,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  await pipeline
    .jpeg({
      quality: 62,
      mozjpeg: true,
      progressive: true,
    })
    .toFile(outAbs);

  await fs.unlink(absInputPath).catch(() => {});

  const stat = await fs.stat(outAbs);
  return {
    filename: outName,
    mime: "image/jpeg",
    size: stat.size,
  };
}

function extensionFromMime(mimeType) {
  const map = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
  };
  return map[mimeType] || "";
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = extensionFromMime(file.mimetype);
      const base = sanitizeOriginalName(file.originalname).replace(/\.[^.]+$/, "");
      cb(null, `${Date.now()}-${crypto.randomUUID()}-${base}${ext}`);
    },
  }),
  limits: {
    fileSize: 12 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const mediaType = req.body.mediaType;
    if (mediaType === "image" && allowedImageTypes.has(file.mimetype)) return cb(null, true);
    if (mediaType === "audio" && allowedAudioTypes.has(file.mimetype)) return cb(null, true);
    cb(new Error("Unsupported file type for selected mediaType."));
  },
});

app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
        imgSrc: ["'self'", "data:", "https://cdn.jsdelivr.net", "blob:"],
        mediaSrc: ["'self'", "blob:"],
        scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
      },
    },
  })
);
app.use(express.json({ limit: "300kb" }));
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 160,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

const sessionMiddleware = session({
  name: "twochat.sid",
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 30,
  },
});
app.use(sessionMiddleware);

function requireAuth(req, res, next) {
  if (!req.session || !req.session.username) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

app.use("/uploads", requireAuth, express.static(UPLOAD_DIR, { index: false }));
app.use("/stickers", express.static(path.join(__dirname, "public", "stickers"), { index: false }));
app.use(express.static(path.join(__dirname, "public"), { index: false }));

app.get("/api/public-config", (_req, res) => {
  res.json({ allowedUsers: ALLOWED_USERS });
});

app.post("/api/login", async (req, res) => {
  const requestedUsername = String(req.body?.username || "").trim();
  if (!ALLOWED_USERS.includes(requestedUsername)) {
    return res.status(400).json({ error: "نام کاربری نامعتبر است." });
  }

  req.session.username = requestedUsername;
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: "Unable to login." });
    return res.json({ ok: true, username: requestedUsername });
  });
});

app.post("/api/logout", requireAuth, (req, res) => {
  req.session.destroy((_err) => {
    res.clearCookie("twochat.sid");
    res.json({ ok: true });
  });
});

app.get("/api/me", (req, res) => {
  res.json({ username: req.session?.username || null });
});

app.get("/api/messages", requireAuth, async (_req, res) => {
  const messages = await readMessages();
  res.json({ messages });
});

app.post("/api/messages", requireAuth, async (req, res) => {
  const text = String(req.body?.text || "").replace(/\r\n/g, "\n").trim();
  if (!text) return res.status(400).json({ error: "Text is required." });
  if (text.length > 2000) return res.status(400).json({ error: "Message too long." });

  const message = {
    id: crypto.randomUUID(),
    type: "text",
    text,
    sender: req.session.username,
    createdAt: new Date().toISOString(),
  };
  await appendMessage(message);
  res.status(201).json({ message });
});

app.post("/api/media", requireAuth, upload.single("file"), async (req, res) => {
  const mediaType = String(req.body?.mediaType || "").trim();
  if (!req.file) return res.status(400).json({ error: "File is required." });
  if (!["image", "audio"].includes(mediaType)) {
    return res.status(400).json({ error: "mediaType must be image or audio." });
  }

  let storedName = req.file.filename;
  let mime = req.file.mimetype;
  let size = req.file.size;

  if (mediaType === "image") {
    const absIn = req.file.path;
    try {
      const opt = await optimizeImageOnDisk(absIn);
      storedName = opt.filename;
      mime = opt.mime;
      size = opt.size;
    } catch (_err) {
      // Keep original upload when optimization fails unexpectedly.
    }
  }

  const message = {
    id: crypto.randomUUID(),
    type: mediaType,
    text: "",
    sender: req.session.username,
    createdAt: new Date().toISOString(),
    file: {
      path: path.join("uploads", storedName).replace(/\\/g, "/"),
      url: `/uploads/${encodeURIComponent(storedName)}`,
      mime,
      size,
      originalName: sanitizeOriginalName(req.file.originalname),
    },
  };

  await appendMessage(message);
  res.status(201).json({ message });
});

app.get("/api/events", requireAuth, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  sseClients.add(res);
  const heartbeat = setInterval(() => {
    try {
      res.write(`event: ping\ndata: ${Date.now()}\n\n`);
    } catch (_err) {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 30000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
    res.end();
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    uptimeSec: Math.round(process.uptime()),
    connectedClients: sseClients.size,
  });
});

app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err && err.message && err.message.includes("Unsupported file type")) {
    return res.status(400).json({ error: err.message });
  }
  if (err && typeof err.statusCode === "number" && err.statusCode >= 400 && err.statusCode < 500) {
    return res.status(err.statusCode).json({ error: err.message || "Bad request." });
  }
  return res.status(500).json({ error: "Internal server error." });
});

ensureStorage()
  .then(() => {
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Two-chat server running on http://localhost:${PORT}`);
      // eslint-disable-next-line no-console
      console.log(`Allowed users: ${ALLOWED_USERS.join(", ")}`);
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Failed to start server:", err);
    process.exit(1);
  });
