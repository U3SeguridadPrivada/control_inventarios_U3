// Run with: node scripts/create-admin.mjs
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

// Respeta SQLITE_DB_PATH (volumen persistente en Railway); si no, usa la ruta local
const dbPath = process.env.SQLITE_DB_PATH || path.join(projectRoot, 'db', 'app.db');
const dir = path.dirname(dbPath);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

sqlite.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TEXT DEFAULT (datetime('now'))
);
`);

const username = process.argv[2] || 'admin';
const password = process.argv[3] || 'Admin1234';
const email    = process.argv[4] || 'admin@u3.local';

const hash = bcrypt.hashSync(password, 12);

try {
  const stmt = sqlite.prepare(`INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'admin')`);
  stmt.run(username, email, hash);
  console.log(`✓ Usuario admin creado: ${username} / ${password}`);
} catch (err) {
  if (err.message.includes('UNIQUE')) {
    console.log(`! El usuario "${username}" ya existe.`);
  } else {
    throw err;
  }
}

sqlite.close();
