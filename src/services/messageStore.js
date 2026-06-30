const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { MESSAGE_FILE, MAX_MESSAGES } = require('../config');
const { broadcast } = require('./broadcaster');

let messageWriteQueue = Promise.resolve();

async function readMessages() {
  const raw = await fs.readFile(MESSAGE_FILE, 'utf8');
  let parsed = { messages: [] };
  try {
    parsed = JSON.parse(raw);
  } catch (_err) {
    return [];
  }
  if (!parsed || !Array.isArray(parsed.messages)) return [];
  return parsed.messages;
}

async function writeMessages(messages) {
  const tmpPath = `${MESSAGE_FILE}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify({ messages }, null, 2), 'utf8');
  await fs.rename(tmpPath, MESSAGE_FILE);
}

async function pruneMessages(messages) {
  if (messages.length <= MAX_MESSAGES) return messages;
  const keep = messages.slice(-MAX_MESSAGES);
  const removed = messages.slice(0, messages.length - MAX_MESSAGES);
  const toDelete = removed
    .map((msg) => (msg.file && msg.file.path ? path.join(__dirname, '..', '..', msg.file.path) : null))
    .filter(Boolean);
  await Promise.all(
    toDelete.map(async (fullPath) => {
      try { await fs.unlink(fullPath); } catch (_err) {}
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
    broadcast('message:new', message);
  });
  await messageWriteQueue;
}

async function updateMessages(fn) {
  let result = null;
  let failure = null;
  messageWriteQueue = messageWriteQueue.then(async () => {
    const messages = await readMessages();
    const out = await fn(messages);
    if (out.updated) {
      const pruned = await pruneMessages(messages);
      await writeMessages(pruned);
      broadcast(out.broadcastEvent, out.updated);
    }
    result = out.updated;
    failure = out.failure;
  });
  await messageWriteQueue;
  return { result, failure };
}

async function ensureStorage() {
  await fs.mkdir(path.dirname(MESSAGE_FILE), { recursive: true });
  await fs.mkdir(path.join(__dirname, '..', '..', 'uploads'), { recursive: true });
  if (!fsSync.existsSync(MESSAGE_FILE)) {
    await fs.writeFile(MESSAGE_FILE, JSON.stringify({ messages: [] }, null, 2), 'utf8');
  }
}

module.exports = { readMessages, writeMessages, pruneMessages, appendMessage, updateMessages, ensureStorage };
