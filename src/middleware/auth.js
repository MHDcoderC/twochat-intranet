const { ALLOWED_USERS } = require('../config');

function requireAuth(req, res, next) {
  const sessionUsername = req.session?.username;
  const queryUsernameRaw = typeof req.query?.username === 'string' ? req.query.username : '';
  const queryUsername = queryUsernameRaw.trim();

  const username =
    ALLOWED_USERS.includes(queryUsername)
      ? queryUsername
      : sessionUsername && ALLOWED_USERS.includes(sessionUsername)
        ? sessionUsername
        : null;

  if (!username) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.authUsername = username;
  return next();
}

module.exports = { requireAuth };
