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
  fecha_baja TEXT,
  telefono TEXT,
  direccion TEXT
);
CREATE TABLE IF NOT EXISTS guardia_documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guardia_id INTEGER NOT NULL REFERENCES guardias(id),
  nombre_documento TEXT NOT NULL,
  nombre_archivo TEXT NOT NULL,
  tipo_mimetype TEXT NOT NULL,
  fecha_subida TEXT DEFAULT (datetime('now'))
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
CREATE TABLE IF NOT EXISTS mensajes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  remitente_id INTEGER NOT NULL REFERENCES users(id),
  destinatario_id INTEGER NOT NULL REFERENCES users(id),
  asunto TEXT NOT NULL,
  cuerpo TEXT NOT NULL,
  leido INTEGER NOT NULL DEFAULT 0,
  destacado INTEGER NOT NULL DEFAULT 0,
  eliminado_remitente INTEGER NOT NULL DEFAULT 0,
  eliminado_destinatario INTEGER NOT NULL DEFAULT 0,
  responde_a_id INTEGER,
  fecha_envio TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS eventos_calendario (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  fecha_inicio TEXT NOT NULL,
  fecha_fin TEXT,
  todo_el_dia INTEGER NOT NULL DEFAULT 0,
  creado_por INTEGER NOT NULL REFERENCES users(id),
  guardia_id INTEGER REFERENCES guardias(id),
  notificar_minutos_antes INTEGER,
  notificado INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS servicios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  direccion TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  creado_por INTEGER NOT NULL REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS servicio_guardias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  servicio_id INTEGER NOT NULL REFERENCES servicios(id),
  guardia_id INTEGER NOT NULL REFERENCES guardias(id),
  turno TEXT
);
CREATE TABLE IF NOT EXISTS incidencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guardia_id INTEGER NOT NULL REFERENCES guardias(id),
  tipo TEXT NOT NULL,
  gravedad TEXT DEFAULT 'Leve',
  fecha TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  estado TEXT DEFAULT 'Abierta',
  creado_por INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS roles_personalizados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  permisos TEXT NOT NULL,
  color TEXT DEFAULT 'slate',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'Prospecto',
  empresa TEXT,
  email TEXT,
  telefono TEXT,
  direccion TEXT,
  notas TEXT,
  creado_por INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS cotizaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folio TEXT NOT NULL UNIQUE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  fecha TEXT NOT NULL,
  solicitante TEXT,
  atencion TEXT,
  servicio_cotizado TEXT,
  ubicacion TEXT,
  periodicidad TEXT DEFAULT 'Quincenal',
  vigencia_dias INTEGER DEFAULT 30,
  asesor_nombre TEXT,
  asesor_puesto TEXT DEFAULT 'Asesor Comercial',
  items TEXT NOT NULL,
  subtotal REAL NOT NULL,
  iva REAL NOT NULL,
  total REAL NOT NULL,
  estado TEXT DEFAULT 'Borrador',
  notas TEXT,
  creado_por INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folio TEXT NOT NULL UNIQUE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  cotizacion_id INTEGER REFERENCES cotizaciones(id),
  fecha TEXT NOT NULL,
  monto_total REAL NOT NULL,
  estado TEXT DEFAULT 'Pendiente',
  metodo_pago TEXT,
  notas TEXT,
  creado_por INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS cuentas_bancarias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  banco TEXT NOT NULL,
  alias TEXT NOT NULL,
  numero_cuenta TEXT,
  tipo TEXT DEFAULT 'Cheques',
  moneda TEXT DEFAULT 'MXN',
  saldo_actual REAL NOT NULL DEFAULT 0,
  activa INTEGER NOT NULL DEFAULT 1,
  creado_por INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS movimientos_financieros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  tipo TEXT NOT NULL,
  categoria TEXT NOT NULL,
  monto REAL NOT NULL,
  cuenta_bancaria_id INTEGER REFERENCES cuentas_bancarias(id),
  descripcion TEXT,
  libro TEXT NOT NULL DEFAULT 'B',
  medio_pago TEXT,
  nombre TEXT,
  tipo_detalle TEXT,
  turno TEXT,
  alimentos TEXT,
  servicio TEXT,
  guardia_id INTEGER REFERENCES guardias(id),
  creado_por INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS site_config (
  clave TEXT PRIMARY KEY,
  valor TEXT
);
CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token TEXT NOT NULL UNIQUE,
  expira TEXT NOT NULL,
  usado INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS libros_financieros (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  usuario_id INTEGER REFERENCES users(id),
  imap_correo TEXT,
  imap_host TEXT,
  imap_puerto INTEGER DEFAULT 993,
  imap_ssl INTEGER NOT NULL DEFAULT 1,
  imap_password TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO libros_financieros (id, nombre) VALUES ('A', 'Cuenta A'), ('B', 'Cuenta B');
CREATE TABLE IF NOT EXISTS vacantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  puesto TEXT NOT NULL,
  ubicacion TEXT,
  turno TEXT,
  sueldo TEXT,
  requisitos TEXT,
  descripcion TEXT,
  activa INTEGER NOT NULL DEFAULT 1,
  creado_por INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS candidatos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT,
  telefono TEXT NOT NULL,
  ciudad TEXT,
  edad INTEGER,
  experiencia TEXT,
  vacante_id INTEGER REFERENCES vacantes(id),
  etapa TEXT NOT NULL DEFAULT 'Nuevo',
  etapa_actualizada_en TEXT,
  fecha_entrevista TEXT,
  evento_id INTEGER REFERENCES eventos_calendario(id),
  guardia_id INTEGER REFERENCES guardias(id),
  origen TEXT DEFAULT 'WhatsApp',
  notas TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS whatsapp_conversaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefono TEXT NOT NULL,
  rol TEXT NOT NULL,
  autor TEXT DEFAULT 'bot',
  mensaje TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS whatsapp_chats (
  telefono TEXT PRIMARY KEY,
  bot_activo INTEGER NOT NULL DEFAULT 1,
  no_leidos INTEGER NOT NULL DEFAULT 0,
  ultima_actividad TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS movimiento_evidencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movimiento_id INTEGER NOT NULL REFERENCES movimientos_financieros(id),
  nombre_documento TEXT NOT NULL,
  nombre_archivo TEXT NOT NULL,
  tipo_mimetype TEXT NOT NULL,
  subido_por INTEGER REFERENCES users(id),
  fecha_subida TEXT DEFAULT (datetime('now'))
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

  // Safe migrations for existing guardias table
  try {
    sqlite.exec(`ALTER TABLE guardias ADD COLUMN telefono TEXT;`);
  } catch (e) {
    // Column might already exist
  }
  try {
    sqlite.exec(`ALTER TABLE guardias ADD COLUMN direccion TEXT;`);
  } catch (e) {
    // Column might already exist
  }
  try {
    sqlite.exec(`ALTER TABLE users ADD COLUMN role_personalizado_id INTEGER REFERENCES roles_personalizados(id);`);
  } catch (e) {
    // Column might already exist
  }
  try {
    sqlite.exec(`ALTER TABLE mensajes ADD COLUMN es_html INTEGER NOT NULL DEFAULT 0;`);
  } catch (e) {
    // Column might already exist
  }
  for (const stmt of [
    `ALTER TABLE cotizaciones ADD COLUMN solicitante TEXT;`,
    `ALTER TABLE cotizaciones ADD COLUMN atencion TEXT;`,
    `ALTER TABLE cotizaciones ADD COLUMN servicio_cotizado TEXT;`,
    `ALTER TABLE cotizaciones ADD COLUMN ubicacion TEXT;`,
    `ALTER TABLE cotizaciones ADD COLUMN periodicidad TEXT DEFAULT 'Quincenal';`,
    `ALTER TABLE cotizaciones ADD COLUMN vigencia_dias INTEGER DEFAULT 30;`,
    `ALTER TABLE cotizaciones ADD COLUMN asesor_nombre TEXT;`,
    `ALTER TABLE cotizaciones ADD COLUMN asesor_puesto TEXT DEFAULT 'Asesor Comercial';`,
    `ALTER TABLE salidas ADD COLUMN estado_actualizado_en TEXT;`,
    `ALTER TABLE movimientos_financieros ADD COLUMN libro TEXT NOT NULL DEFAULT 'B';`,
    `ALTER TABLE movimientos_financieros ADD COLUMN medio_pago TEXT;`,
    `ALTER TABLE movimientos_financieros ADD COLUMN nombre TEXT;`,
    `ALTER TABLE movimientos_financieros ADD COLUMN tipo_detalle TEXT;`,
    `ALTER TABLE movimientos_financieros ADD COLUMN turno TEXT;`,
    `ALTER TABLE movimientos_financieros ADD COLUMN alimentos TEXT;`,
    `ALTER TABLE movimientos_financieros ADD COLUMN servicio TEXT;`,
    `ALTER TABLE movimientos_financieros ADD COLUMN guardia_id INTEGER REFERENCES guardias(id);`,
    `ALTER TABLE libros_financieros ADD COLUMN imap_correo TEXT;`,
    `ALTER TABLE libros_financieros ADD COLUMN imap_host TEXT;`,
    `ALTER TABLE libros_financieros ADD COLUMN imap_puerto INTEGER DEFAULT 993;`,
    `ALTER TABLE libros_financieros ADD COLUMN imap_ssl INTEGER NOT NULL DEFAULT 1;`,
    `ALTER TABLE libros_financieros ADD COLUMN imap_password TEXT;`,
    `ALTER TABLE users ADD COLUMN firma_json TEXT;`,
    `ALTER TABLE users ADD COLUMN correo_imap_host TEXT;`,
    `ALTER TABLE users ADD COLUMN correo_imap_puerto INTEGER DEFAULT 993;`,
    `ALTER TABLE users ADD COLUMN correo_smtp_host TEXT;`,
    `ALTER TABLE users ADD COLUMN correo_smtp_puerto INTEGER DEFAULT 465;`,
    `ALTER TABLE users ADD COLUMN correo_ssl INTEGER NOT NULL DEFAULT 1;`,
    `ALTER TABLE users ADD COLUMN correo_usuario TEXT;`,
    `ALTER TABLE users ADD COLUMN correo_password TEXT;`,
    `ALTER TABLE whatsapp_conversaciones ADD COLUMN autor TEXT DEFAULT 'bot';`,
  ]) {
    try { sqlite.exec(stmt); } catch (e) { /* Column might already exist */ }
  }

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
