/**
 * Centralized token and canary decoder.
 * Safely decodes Unicode escapes (\u002b), HTML entities (&amp;, &#43;),
 * and URL encoding without double-decoding or throwing exceptions.
 */

const HTML_ENTITY_MAP = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&#43;": "+",
  "&#x2b;": "+",
  "&#x2B;": "+",
  "&#61;": "=",
  "&#x3d;": "=",
  "&#x3D;": "=",
  "&#47;": "/",
  "&#x2f;": "/",
  "&#x2F;": "/"
};

function decode(rawCode) {
  if (rawCode === null || rawCode === undefined) return null;
  if (typeof rawCode !== "string") return String(rawCode);

  let result = rawCode;

  // 1. Decode Unicode escapes (e.g., \u002b -> +, \u002f -> /, \u003d -> =)
  if (result.includes("\\u") || result.includes("\\U")) {
    result = result.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch (e) {
        return `\\u${hex}`;
      }
    });
  }

  // 2. Decode common HTML entities
  for (const [entity, char] of Object.entries(HTML_ENTITY_MAP)) {
    if (result.includes(entity)) {
      result = result.split(entity).join(char);
    }
  }

  // Numeric decimal/hex HTML entities (&#...;)
  if (result.includes("&#")) {
    result = result.replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch (e) {
        return `&#${dec};`;
      }
    });
    result = result.replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch (e) {
        return `&#x${hex};`;
      }
    });
  }

  // 3. Decode URL percent encoding if present (%2B, %2F, etc.)
  if (result.includes("%")) {
    try {
      result = decodeURIComponent(result);
    } catch (e) {
      // If full decode fails, decode only known percent chars safely
      result = result
        .replace(/%2b/gi, "+")
        .replace(/%2f/gi, "/")
        .replace(/%3d/gi, "=")
        .replace(/%26/gi, "&");
    }
  }

  return result.trim();
}

module.exports = decode;