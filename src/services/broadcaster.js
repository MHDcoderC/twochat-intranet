const sseClients = new Set();
const sseClientUser = new Map();

function broadcast(event, payload) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(data);
    } catch (_err) {
      sseClients.delete(res);
    }
  }
}

module.exports = { sseClients, sseClientUser, broadcast };
