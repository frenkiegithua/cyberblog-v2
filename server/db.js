// server/db.js
// Uses sql.js — pure JavaScript SQLite. Works on ALL Node versions, ALL platforms.
// No native compilation, no node-gyp required.

const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'blog.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let db;

function initDB() {
  const initSqlJs = require('sql.js');
  return initSqlJs().then(SQL => {
    let dbData = null;
    if (fs.existsSync(DB_FILE)) {
      dbData = fs.readFileSync(DB_FILE);
    }
    db = dbData ? new SQL.Database(dbData) : new SQL.Database();
    db.run('PRAGMA foreign_keys = ON;');
    return db;
  });
}

function saveDB() {
  if (!db) return;
  try {
    const data = db.export();
    fs.writeFileSync(DB_FILE, Buffer.from(data));
  } catch(e) {
    console.error('DB save error:', e.message);
  }
}

setInterval(saveDB, 30000);
process.on('exit', saveDB);
process.on('SIGINT', () => { saveDB(); process.exit(0); });
process.on('SIGTERM', () => { saveDB(); process.exit(0); });

// Normalise params: accepts (a, b, c) or ([a, b, c]) or no params
function norm(args) {
  if (!args || args.length === 0) return undefined;
  // If first arg is array, unwrap it
  if (Array.isArray(args[0])) return args[0].length ? args[0] : undefined;
  return args;
}

function prepare(sql) {
  return {
    get(...args) {
      const p = norm(args);
      try {
        const results = db.exec(sql, p);
        if (!results.length || !results[0].values.length) return undefined;
        const { columns, values } = results[0];
        const row = {};
        columns.forEach((col, i) => row[col] = values[0][i]);
        return row;
      } catch(e) {
        throw new Error(`DB.get error: ${e.message} | SQL: ${sql.slice(0,80)}`);
      }
    },
    all(...args) {
      const p = norm(args);
      try {
        const results = db.exec(sql, p);
        if (!results.length) return [];
        const { columns, values } = results[0];
        return values.map(row => {
          const obj = {};
          columns.forEach((col, i) => obj[col] = row[i]);
          return obj;
        });
      } catch(e) {
        throw new Error(`DB.all error: ${e.message} | SQL: ${sql.slice(0,80)}`);
      }
    },
    run(...args) {
      const p = norm(args);
      try {
        db.run(sql, p);
        const r = db.exec('SELECT last_insert_rowid() as id');
        const lastInsertRowid = r[0]?.values[0]?.[0] ?? 0;
        saveDB();
        return { lastInsertRowid, changes: db.getRowsModified() };
      } catch(e) {
        throw new Error(`DB.run error: ${e.message} | SQL: ${sql.slice(0,80)}`);
      }
    }
  };
}

function exec(sql) {
  db.run(sql);
  saveDB();
}

function transaction(fn) {
  return (...args) => {
    db.run('BEGIN TRANSACTION');
    try {
      const result = fn(...args);
      db.run('COMMIT');
      saveDB();
      return result;
    } catch(e) {
      db.run('ROLLBACK');
      throw e;
    }
  };
}

module.exports = { initDB, saveDB, prepare, exec, transaction };
