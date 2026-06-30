const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { broadcast } = require('../services/broadcaster');

const router = express.Router();

const presence = new Map();
const typing = new Map();

router.post('/api/presence', requireAuth, async (req, res) => {
  const active = Boolean(req.body?.active);
  const username = req.authUsername;
  const next = { active, lastActiveAt: Date.now() };
  presence.set(username, next);
  broadcast('presence:update', { username, ...next });
  res.json({ ok: true });
});

router.post('/api/typing', requireAuth, async (req, res) => {
  const isTyping = Boolean(req.body?.typing);
  const username = req.authUsername;
  const next = { typing: isTyping, updatedAt: Date.now() };
  typing.set(username, next);
  broadcast('typing:update', { username, ...next });
  res.json({ ok: true });
});

module.exports = { router, presence, typing };
