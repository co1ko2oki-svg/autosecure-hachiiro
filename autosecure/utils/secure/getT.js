const axios = require("axios")

function extractT(html) {
    if (!html || typeof html !== "string") return null;
    let match = html.match(/<input[^>]+name=["']t["'][^>]+value=["']([^"']+)["']/i);
    if (match && match[1]) return match[1];
    match = html.match(/<input[^>]+value=["']([^"']+)["'][^>]+name=["']t["']/i);
    if (match && match[1]) return match[1];
    match = html.match(/name="t"\s+id="t"\s+value="([^"]+)"/i);
    if (match && match[1]) return match[1];
    return null;
}

module.exports = async function getT(host, amsc) {
  let fetchT = await axios({
    method: "GET",
    url: `https://login.live.com/login.srf?wa=wsignin1.0&rpsnv=21&ct=1708978285&rver=7.5.2156.0&wp=SA_20MIN&wreply=https://account.live.com/proofs/Add?apt=2&uaid=0637740e739c48f6bf118445d579a786&lc=1033&id=38936&mkt=en-US&uaid=0637740e739c48f6bf118445d579a786`,
    headers: {
      cookie: `__Host-MSAAUTH=${host}; __Host-MSAAUTHP=${host}; amsc=${amsc}`,
    },
    maxRedirects: 0,
    validateStatus: (status) => status >= 200 && status < 400,
  });
  if (fetchT.data?.includes("Abuse")) {
    return `locked`
  } else if (fetchT.data?.includes("working to restore all services")) {
    return `down`
  }
  let t = extractT(fetchT?.data);
  if (t) {
    return t;
  } else {
    return null;
  }
}