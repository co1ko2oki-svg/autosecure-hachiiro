module.exports = (possibility, secEmail) => {
  if (!possibility || !secEmail || typeof possibility !== "string" || typeof secEmail !== "string") {
    return false;
  }

  const pDomain = possibility.split("@")[1];
  const sDomain = secEmail.split("@")[1];

  if (!pDomain || !sDomain || pDomain.toLowerCase() !== sDomain.toLowerCase()) {
    return false;
  }

  if (possibility.slice(0, 2).toLowerCase() === secEmail.slice(0, 2).toLowerCase()) {
    return true;
  }

  const pPrefixLen = possibility.split("*")[0].length;
  const sPrefixLen = secEmail.split("*")[0].length;

  if (
    ((pPrefixLen === 1 || possibility.split("@").length === 1) && sPrefixLen === 1) ||
    secEmail.split("@")[0].length === 1
  ) {
    if (possibility.slice(0, 1).toLowerCase() === secEmail.slice(0, 1).toLowerCase()) {
      return true;
    }
  }

  return false;
};