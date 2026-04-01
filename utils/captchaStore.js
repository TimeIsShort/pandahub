/**
 * Shared captcha challenge store - in-memory Map
 * Used by both /api/captcha (challenge generation) and /api/auth (registration CAPTCHA check)
 */
const challenges = new Map();

// Clean up expired challenges every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of challenges.entries()) {
    if (data.expiresAt < now) challenges.delete(token);
  }
}, 5 * 60 * 1000);

function getChallenge(token) {
  return challenges.get(token);
}

function setChallenge(token, data) {
  challenges.set(token, data);
}

function deleteChallenge(token) {
  challenges.delete(token);
}

module.exports = { getChallenge, setChallenge, deleteChallenge };
