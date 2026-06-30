const path = require('path');

require('dotenv').config();

const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-in-production';
const MAX_MESSAGES = Number(process.env.MAX_MESSAGES || 1000);
const TRUST_PROXY = String(process.env.TRUST_PROXY || 'false').toLowerCase() === 'true';
const PRESENCE_TTL_MS = Number(process.env.PRESENCE_TTL_MS || 20000);

const MESSAGE_FILE = path.join(__dirname, '..', 'data', 'messages.json');
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

const ALLOWED_USERS = (process.env.ALLOWED_USERS || 'user1,user2')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean)
  .slice(0, 2);

module.exports = {
  PORT,
  SESSION_SECRET,
  MAX_MESSAGES,
  TRUST_PROXY,
  PRESENCE_TTL_MS,
  MESSAGE_FILE,
  UPLOAD_DIR,
  ALLOWED_USERS,
};
