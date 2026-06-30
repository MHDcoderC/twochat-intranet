const express = require('express');
const { ALLOWED_USERS } = require('../config');

const router = express.Router();

router.get('/api/public-config', (_req, res) => {
  res.json({ allowedUsers: ALLOWED_USERS });
});

router.post('/api/login', async (req, res) => {
  const requestedUsername = String(req.body?.username || '').trim();
  if (!ALLOWED_USERS.includes(requestedUsername)) {
    return res.status(400).json({ error: 'نام کاربری نامعتبر است.' });
  }
  req.session.username = requestedUsername;
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'Unable to login.' });
    return res.json({ ok: true, username: requestedUsername });
  });
});

router.post('/api/logout', (req, res) => {
  req.session.destroy((_err) => {
    res.clearCookie('twochat.sid');
    res.json({ ok: true });
  });
});

router.get('/api/me', (req, res) => {
  res.json({ username: req.session?.username || null });
});

module.exports = router;
