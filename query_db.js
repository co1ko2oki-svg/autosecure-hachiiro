const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('db/database.db');

db.serialize(() => {
    db.all("PRAGMA table_info(accounts)", (err, rows) => {
        if (err) console.error(err);
        else console.log(JSON.stringify(rows.map(r => r.name)));
    });
    db.all("SELECT * FROM accounts WHERE email LIKE '%hachiiromckmmbpv2s@outlook.com%' OR secemail LIKE '%hachiiromckmmbpv2s@outlook.com%'", (err, rows) => {
        if (err) console.error(err);
        else console.log(JSON.stringify(rows, null, 2));
    });
});
db.close();
