const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/database.db');

const addColumn = (table, column, type, defaultVal) => {
  return new Promise((resolve) => {
    const q = `ALTER TABLE ${table} ADD COLUMN ${column} ${type} DEFAULT ${defaultVal}`;
    db.run(q, (err) => {
      if (err) {
        if (err.message.includes('duplicate column name')) {
          console.log(`${column} already exists.`);
        } else {
          console.error(`Error adding ${column}:`, err.message);
        }
      } else {
        console.log(`Successfully added ${column}.`);
      }
      resolve();
    });
  });
};

async function run() {
  await addColumn('autosecure', 'changeskin', 'INTEGER', 0);
  await addColumn('autosecure', 'skinurl', 'TEXT', 'NULL');
  await addColumn('autosecure', 'checkban_hypixel', 'INTEGER', 0);
  await addColumn('autosecure', 'checkban_donut', 'INTEGER', 0);
  await addColumn('autosecure', 'removecards', 'INTEGER', 0);
  await addColumn('autosecure', 'removesubs', 'INTEGER', 0);
  await addColumn('autosecure', 'removelinkednumbers', 'INTEGER', 1);
  await addColumn('autosecure', 'leavefamily', 'INTEGER', 1);
  
  db.close();
}

run();
