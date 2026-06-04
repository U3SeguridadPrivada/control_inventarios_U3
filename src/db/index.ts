import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import path from 'path';
import * as schema from './schema';

type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

let _db: DrizzleDB | null = null;

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS guardias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_elemento TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  estado TEXT DEFAULT 'Activo',
  fecha_alta TEXT NOT NULL,
  fecha_baja TEXT
);
CREATE TABLE IF NOT EXISTS entradas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  articulo TEXT NOT NULL,
  talla TEXT,
  cantidad INTEGER NOT NULL,
  estado TEXT NOT NULL,
  motivo TEXT NOT NULL,
  origen_devolucion TEXT,
  guardia_id INTEGER REFERENCES guardias(id),
  registrado_por TEXT
);
CREATE TABLE IF NOT EXISTS salidas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  concepto TEXT NOT NULL,
  articulo TEXT NOT NULL,
  talla TEXT,
  cantidad INTEGER NOT NULL,
  nombre_guardia TEXT,
  estado_asignacion TEXT DEFAULT 'N/A',
  estado_devuelto TEXT,
  supervisor TEXT,
  prenda_cambiada_detalle TEXT,
  estado_fisico TEXT DEFAULT 'Nuevo',
  observaciones TEXT,
  guardia_id INTEGER REFERENCES guardias(id),
  registrado_por TEXT,
  notas TEXT
);
CREATE TABLE IF NOT EXISTS uniformes_campo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  guardia_id INTEGER NOT NULL REFERENCES guardias(id),
  nombre_guardia TEXT NOT NULL,
  articulos TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bajas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  guardia_id INTEGER NOT NULL REFERENCES guardias(id),
  nombre_guardia TEXT NOT NULL,
  numero_elemento TEXT NOT NULL,
  estado_general TEXT DEFAULT 'Pendiente',
  checklist TEXT NOT NULL
);
`;

function initDb(): DrizzleDB {
  if (_db) return _db;
  const dbPath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'db', 'app.db');
  const dir = path.dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec(INIT_SQL);
  _db = drizzle(sqlite, { schema });
  return _db;
}

export const db = new Proxy({} as DrizzleDB, {
  get(_, prop: string) {
    const database = initDb();
    const value = (database as any)[prop];
    return typeof value === 'function' ? value.bind(database) : value;
  },
});
