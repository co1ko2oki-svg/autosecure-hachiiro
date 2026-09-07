const reason = '{"extra":[{"color":"red","text":"Your account has been blocked.\\n\\n"},{"color":"gray","text":"Reason: "},{"color":"white","text":"Suspicious activity has been detected on your account.\\n"}],"text":""}';

console.log('raw reason:', JSON.stringify(reason));
const parsed = JSON.parse(reason);
console.log('parsed.extra[0].text:', JSON.stringify(parsed.extra[0].text));
console.log('parsed.extra[1].text:', JSON.stringify(parsed.extra[1].text));

let text = '';
if (parsed.text) text += parsed.text;
if (Array.isArray(parsed.extra)) {
  for (const item of parsed.extra) {
    text += item.text;
  }
}
console.log('concatenated:', JSON.stringify(text));
console.log('after trim:', JSON.stringify(text.trim()));
