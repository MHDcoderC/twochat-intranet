const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const path = require('path');
const multer = require('multer');

const { PORT, SESSION_SECRET, TRUST_PROXY, ALLOWED_USERS, UPLOAD_DIR } = require('./src/config');
const { ensureStorage } = require('./src/services/messageStore');
const authRoutes = require('./src/routes/auth');
const messageRoutes = require('./src/routes/messages');
const mediaRoutes = require('./src/routes/media');
const { router: presenceRoutes, presence, typing } = require('./src/routes/presence');
const { router: sseRoutes, setPresenceTyping, startPresenceCleanup } = require('./src/routes/sse');

const app = express();

if (ALLOWED_USERS.length !== 2) {
  throw new Error('ALLOWED_USERS must contain exactly two usernames.');
}

if (TRUST_PROXY) {
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
  })
);
app.use(express.json({ limit: '300kb' }));
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 160,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

const sessionMiddleware = session({
  name: 'twochat.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 30,
  },
});
app.use(sessionMiddleware);

app.use('/uploads', express.static(UPLOAD_DIR, { index: false }));
app.use('/stickers', express.static(path.join(__dirname, 'public', 'stickers'), { index: false }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.use(authRoutes);
app.use(messageRoutes);
app.use(mediaRoutes);
app.use(presenceRoutes);
app.use(sseRoutes);

setPresenceTyping(presence, typing);

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptimeSec: Math.round(process.uptime()) });
});

app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err && err.message && err.message.includes('Unsupported file type')) {
    return res.status(400).json({ error: err.message });
  }
  if (err && typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
    return res.status(err.statusCode).json({ error: err.message || 'Bad request.' });
  }
  return res.status(500).json({ error: 'Internal server error.' });
});

ensureStorage()
  .then(() => {
    startPresenceCleanup();
    app.listen(PORT, () => {
      console.log(`Two-chat server running on http://localhost:${PORT}`);
      console.log(`Allowed users: ${ALLOWED_USERS.join(', ')}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
