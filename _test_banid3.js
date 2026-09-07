const reason = '{"extra":[{"color":"red","text":"Your account has been blocked.\\n\\n"},{"color":"gray","text":"Reason: "},{"color":"white","text":"Suspicious activity has been detected on your account.\\n"},{"color":"gray","text":"Find out more: "},{"color":"aqua","underlined":true,"text":"https://www.hypixel.net/security-block\\n\\n"},{"color":"gray","text":"Block ID: "},{"color":"white","text":"#8F5F021F\\n"},{"color":"gray","text":"Sharing your Block ID may affect the processing of your appeal!"}],"text":""}';

const parsed = JSON.parse(reason);
console.log('extra[6].text:', JSON.stringify(parsed.extra[6].text));
console.log('extra[7].text:', JSON.stringify(parsed.extra[7].text));
let text = '';
if (parsed.text) text += parsed.text;
for (const item of parsed.extra) text += item.text;
console.log('joined:', JSON.stringify(text));
console.log('trimmed:', JSON.stringify(text.trim()));
console.log('regex replace:', JSON.stringify(text.replace(/§[0-9a-fk-or]/gi, '').trim()));
