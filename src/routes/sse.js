const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { sseClients, sseClientUser, broadcast } = require('../services/broadcaster');
const { PRESENCE_TTL_MS } = require('../config');

const router = express.Router();

let presence, typing;
function setPresenceTyping(p, t) { presence = p; typing = t; }

router.get('/api/events', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  sseClients.add(res);
  sseClientUser.set(res, req.authUsername);

  if (presence && !presence.has(req.authUsername)) {
    presence.set(req.authUsername, { active: true, lastActiveAt: Date.now() });
    broadcast('presence:update', { username: req.authUsername, active: true, lastActiveAt: Date.now() });
  }

  if (presence) {
    for (const [username, data] of presence.entries()) {
      res.write(`event: presence:update\ndata: ${JSON.stringify({
        username, active: Boolean(data?.active), lastActiveAt: data?.lastActiveAt || Date.now(),
      })}\n\n`);
    }
  }

  if (typing) {
    for (const [username, data] of typing.entries()) {
      res.write(`event: typing:update\ndata: ${JSON.stringify({
        username, typing: Boolean(data?.typing), updatedAt: data?.updatedAt || Date.now(),
      })}\n\n`);
    }
  }

  const heartbeat = setInterval(() => {
    try { res.write(`event: ping\ndata: ${Date.now()}\n\n`); }
    catch (_err) { clearInterval(heartbeat); sseClients.delete(res); }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
    const username = sseClientUser.get(res);
    sseClientUser.delete(res);
    if (username && presence) {
      presence.set(username, { active: false, lastActiveAt: Date.now() });
      broadcast('presence:update', { username, active: false, lastActiveAt: Date.now() });
    }
    res.end();
  });
});

function startPresenceCleanup() {
  setInterval(() => {
    if (!presence) return;
    const now = Date.now();
    for (const [username, data] of presence.entries()) {
      if (!data?.active) continue;
      if (now - data.lastActiveAt > PRESENCE_TTL_MS) {
        presence.set(username, { active: false, lastActiveAt: data.lastActiveAt });
        broadcast('presence:update', { username, active: false, lastActiveAt: data.lastActiveAt });
      }
    }
  }, 5000).unref?.();
}

module.exports = { router, setPresenceTyping, startPresenceCleanup };
