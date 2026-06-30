const express = require('express');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { readMessages, appendMessage, updateMessages } = require('../services/messageStore');
const { sanitizeReplyTo, ALLOWED_REACTIONS } = require('../utils/helpers');

const router = express.Router();

router.get('/api/messages', requireAuth, async (_req, res) => {
  const messages = await readMessages();
  res.json({ messages });
});

router.post('/api/messages', requireAuth, async (req, res) => {
  const text = String(req.body?.text || '').replace(/\r\n/g, '\n').trim();
  if (!text) return res.status(400).json({ error: 'Text is required.' });
  if (text.length > 2000) return res.status(400).json({ error: 'Message too long.' });

  const replyTo = sanitizeReplyTo(req.body?.replyTo);
  const message = {
    id: crypto.randomUUID(),
    type: 'text',
    text,
    sender: req.authUsername,
    createdAt: new Date().toISOString(),
    replyTo,
    readBy: [],
    reactions: {},
  };
  await appendMessage(message);
  res.status(201).json({ message });
});

router.patch('/api/messages/:id', requireAuth, async (req, res) => {
  const id = String(req.params?.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id is required.' });

  const nextText = String(req.body?.text || '').replace(/\r\n/g, '\n').trim();
  if (!nextText) return res.status(400).json({ error: 'Text is required.' });
  if (nextText.length > 2000) return res.status(400).json({ error: 'Message too long.' });

  const { result, failure } = await updateMessages((messages) => {
    const msg = messages.find((m) => m && m.id === id);
    if (!msg) return { updated: null, failure: 'not_found' };
    if (msg.type !== 'text') return { updated: null, failure: 'not_text' };
    if (msg.sender !== req.authUsername) return { updated: null, failure: 'not_owner' };
    msg.text = nextText;
    msg.editedAt = new Date().toISOString();
    return { updated: { ...msg }, failure: null, broadcastEvent: 'message:update' };
  });

  if (!result) {
    if (failure === 'not_owner') return res.status(403).json({ error: 'You can only edit your own messages.' });
    if (failure === 'not_text') return res.status(415).json({ error: 'Only text messages are editable.' });
    return res.status(404).json({ error: 'Message not found.' });
  }
  return res.json({ message: result });
});

router.post('/api/messages/:id/reactions', requireAuth, async (req, res) => {
  const id = String(req.params?.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id is required.' });

  const emoji = String(req.body?.emoji || '').trim();
  if (!ALLOWED_REACTIONS.has(emoji)) return res.status(400).json({ error: 'Unsupported reaction.' });

  const { result, failure } = await updateMessages((messages) => {
    const msg = messages.find((m) => m && m.id === id);
    if (!msg) return { updated: null, failure: 'not_found' };
    if (!msg.reactions || typeof msg.reactions !== 'object') msg.reactions = {};
    const current = Array.isArray(msg.reactions[emoji]) ? msg.reactions[emoji] : [];
    if (current.includes(req.authUsername)) {
      msg.reactions[emoji] = current.filter((u) => u !== req.authUsername);
    } else {
      msg.reactions[emoji] = [...current, req.authUsername];
    }
    if (Array.isArray(msg.reactions[emoji]) && msg.reactions[emoji].length === 0) {
      delete msg.reactions[emoji];
    }
    return { updated: { ...msg }, failure: null, broadcastEvent: 'message:update' };
  });

  if (!result) {
    if (failure === 'not_found') return res.status(404).json({ error: 'Message not found.' });
    return res.status(400).json({ error: 'Unable to react.' });
  }
  return res.json({ message: result });
});

router.post('/api/messages/read', requireAuth, async (req, res) => {
  const rawIds = req.body?.ids;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return res.status(400).json({ error: 'ids is required.' });
  }
  const username = req.authUsername;
  const ids = rawIds.map((id) => String(id)).slice(0, 200);
  const idSet = new Set(ids);

  const updatedMessages = [];
  await updateMessages((messages) => {
    for (const msg of messages) {
      if (!msg || !msg.id || !idSet.has(msg.id)) continue;
      if (!Array.isArray(msg.readBy)) msg.readBy = [];
      if (!msg.readBy.includes(username)) {
        msg.readBy.push(username);
        updatedMessages.push({ ...msg, readBy: msg.readBy });
      }
    }
    return { updated: updatedMessages.length > 0 ? updatedMessages : null, failure: null, broadcastEvent: 'message:read' };
  });

  res.json({ ok: true });
});

module.exports = router;
