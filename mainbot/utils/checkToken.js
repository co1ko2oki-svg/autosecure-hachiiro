const axios = require("axios");

module.exports = async (token) => {
  if (typeof token !== 'string' || !token.trim()) {
    return false;
  }
  const cleanToken = token.trim();
  // Basic sanity check to prevent HTTP header splitting / invalid format
  if (/[\r\n]/.test(cleanToken) || cleanToken.length < 20 || cleanToken.length > 150) {
    return false;
  }

  try {
    const response = await axios({
      url: 'https://discord.com/api/users/@me',
      method: "GET",
      headers: {
        Authorization: `Bot ${cleanToken}`,
      },
      timeout: 8000
    });

    return response.status === 200;
  } catch (error) {
    // If Discord returned 429 Rate Limit or 5xx Server Error, do NOT assume the token is invalid
    if (error.response) {
      if (error.response.status === 429) {
        console.warn('[CHECK-TOKEN] Hit Discord API rate limit (429) during token check. Preserving token state.');
        return true;
      }
      if (error.response.status >= 500) {
        console.warn(`[CHECK-TOKEN] Discord API server error (${error.response.status}). Preserving token state.`);
        return true;
      }
      if (error.response.status === 401) {
        return false;
      }
    }
    return false;
  }
};