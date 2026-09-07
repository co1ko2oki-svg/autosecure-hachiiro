// Reproduce banId parsing with the exact production kick reason.
function extractKickText(reason) {
    if (!reason) return '';
    if (typeof reason === 'string') {
        try {
            const parsed = JSON.parse(reason);
            return extractKickText(parsed);
        } catch {
            return reason.replace(/§[0-9a-fk-or]/gi, '').trim();
        }
    }
    let text = '';
    if (reason.text) text += reason.text;
    if (Array.isArray(reason.extra)) {
        for (const item of reason.extra) text += extractKickText(item);
    }
    if (Array.isArray(reason.with)) {
        for (const item of reason.with) text += extractKickText(item);
    }
    if (reason.translate) text += ' ' + reason.translate;
    return text.replace(/§[0-9a-fk-or]/gi, '').trim();
}

function getBanId(text) {
    const fullText = text.toLowerCase();
    let m = fullText.match(/ban id: (#[a-z0-9]+)/i);
    if (!m) m = fullText.match(/block id: (#[a-z0-9]+)/i);
    if (!m) m = fullText.match(/punishment id: (#[a-z0-9]+)/i);
    if (!m) m = fullText.match(/#([a-z0-9]{4,16})\b/i);
    return m ? (m[1].startsWith('#') ? m[1] : '#' + m[1]) : null;
}

// This is the raw string mineflayer gives for a "kicked" event (literal \n escapes).
const reason = '{"extra":[{"color":"red","text":"Your account has been blocked.\\n\\n"},{"color":"gray","text":"Reason: "},{"color":"white","text":"Suspicious activity has been detected on your account.\\n"},{"color":"gray","text":"Find out more: "},{"color":"aqua","underlined":true,"text":"https://www.hypixel.net/security-block\\n\\n"},{"color":"gray","text":"Block ID: "},{"color":"white","text":"#8F5F021F\\n"},{"color":"gray","text":"Sharing your Block ID may affect the processing of your appeal!"}],"text":""}';

const t = extractKickText(reason);
console.log('TEXT:', JSON.stringify(t));
console.log('BANID:', getBanId(t));
