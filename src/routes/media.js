const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const { UPLOAD_DIR } = require('../config');
const { requireAuth } = require('../middleware/auth');
const { appendMessage } = require('../services/messageStore');
const { optimizeImageOnDisk } = require('../services/imageOptimizer');
const {
  ALLOWED_IMAGE_TYPES, ALLOWED_AUDIO_TYPES,
  sanitizeOriginalName, sanitizeReplyTo, extensionFromMime,
} = require('../utils/helpers');

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = extensionFromMime(file.mimetype);
      const base = sanitizeOriginalName(file.originalname).replace(/\.[^.]+$/, '');
      cb(null, `${Date.now()}-${crypto.randomUUID()}-${base}${ext}`);
    },
  }),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const mediaType = req.body.mediaType;
    if (mediaType === 'image' && ALLOWED_IMAGE_TYPES.has(file.mimetype)) return cb(null, true);
    if (mediaType === 'audio' && ALLOWED_AUDIO_TYPES.has(file.mimetype)) return cb(null, true);
    cb(new Error('Unsupported file type for selected mediaType.'));
  },
});

router.post('/api/media', requireAuth, upload.single('file'), async (req, res) => {
  const mediaType = String(req.body?.mediaType || '').trim();
  if (!req.file) return res.status(400).json({ error: 'File is required.' });
  if (!['image', 'audio'].includes(mediaType)) {
    return res.status(400).json({ error: 'mediaType must be image or audio.' });
  }

  let replyTo = null;
  const rawReplyTo = req.body?.replyTo;
  if (rawReplyTo) {
    try {
      const parsed = typeof rawReplyTo === 'string' ? JSON.parse(rawReplyTo) : rawReplyTo;
      replyTo = sanitizeReplyTo(parsed);
    } catch (_err) { replyTo = null; }
  }

  let storedName = req.file.filename;
  let mime = req.file.mimetype;
  let size = req.file.size;

  if (mediaType === 'image') {
    try {
      const opt = await optimizeImageOnDisk(req.file.path);
      storedName = opt.filename;
      mime = opt.mime;
      size = opt.size;
    } catch (_err) {}
  }

  const message = {
    id: crypto.randomUUID(),
    type: mediaType,
    text: '',
    sender: req.authUsername,
    createdAt: new Date().toISOString(),
    replyTo,
    readBy: [],
    reactions: {},
    file: {
      path: path.join('uploads', storedName).replace(/\\/g, '/'),
      url: `/uploads/${encodeURIComponent(storedName)}`,
      mime,
      size,
      originalName: sanitizeOriginalName(req.file.originalname),
    },
  };

  await appendMessage(message);
  res.status(201).json({ message });
});

module.exports = router;
