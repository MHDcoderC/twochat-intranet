const path = require('path');

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a',
]);

const MIME_EXTENSION = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  'audio/webm': '.webm', 'audio/ogg': '.ogg', 'audio/mpeg': '.mp3',
  'audio/wav': '.wav', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a',
};

const ALLOWED_REACTIONS = new Set(['💕', '❤️', '😍', '👌']);

function sanitizeOriginalName(fileName) {
  return path.basename(fileName).replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(0, 80) || 'file';
}

function sanitizeReplyTo(input) {
  if (!input || typeof input !== 'object') return null;
  const id = typeof input.id === 'string' ? input.id.slice(0, 200) : null;
  if (!id) return null;
  const typeRaw = typeof input.type === 'string' ? input.type : 'text';
  const type = ['text', 'image', 'audio'].includes(typeRaw) ? typeRaw : 'text';
  const sender = typeof input.sender === 'string' ? input.sender.slice(0, 50) : '';
  const text = typeof input.text === 'string' ? input.text.slice(0, 200) : '';
  return { id, type, sender, text };
}

function extensionFromMime(mimeType) {
  return MIME_EXTENSION[mimeType] || '';
}

module.exports = {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_AUDIO_TYPES,
  ALLOWED_REACTIONS,
  sanitizeOriginalName,
  sanitizeReplyTo,
  extensionFromMime,
};
