import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import path from 'path';
import * as schema from './schema';
import { programarRespaldos } from '@/src/lib/respaldos';

type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

let _db: DrizzleDB | null = null;

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS catalogo_prendas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  categoria TEXT NOT NULL DEFAULT 'Uniformes',
  requiere_talla INTEGER NOT NULL DEFAULT 0,
  tallas TEXT,
  stock_minimo INTEGER DEFAULT 5,
  costo_estimado REAL,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
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
CREATE TABLE IF NOT EXISTS barridos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER REFERENCES users(id),
  canal TEXT NOT NULL,
  plantilla TEXT NOT NULL,
  lote TEXT,
  objetivo INTEGER NOT NULL,
  enviados INTEGER NOT NULL DEFAULT 0,
  fallidos INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'en_proceso',
  detalle TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  terminado_at TEXT
);
CREATE TABLE IF NOT EXISTS prospecto_actividades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  usuario_id INTEGER REFERENCES users(id),
  tipo TEXT NOT NULL,
  asunto TEXT,
  mensaje TEXT,
  estado TEXT NOT NULL DEFAULT 'ok',
  detalle_error TEXT,
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
CREATE TABLE IF NOT EXISTS protocolos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'Operativo',
  descripcion TEXT,
  tipo TEXT NOT NULL DEFAULT 'lista',
  pasos TEXT NOT NULL,
  contenido TEXT,
  prioridad TEXT NOT NULL DEFAULT 'Media',
  activo INTEGER NOT NULL DEFAULT 1,
  creado_por INTEGER REFERENCES users(id),
  actualizado_en TEXT,
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
CREATE TABLE IF NOT EXISTS checador_salidas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER REFERENCES users(id),
  nombre_empleado TEXT NOT NULL,
  departamento TEXT DEFAULT 'Oficinas',
  tipo_salida TEXT NOT NULL DEFAULT '10_min',
  limite_minutos INTEGER NOT NULL DEFAULT 10,
  hora_salida TEXT NOT NULL,
  hora_entrada TEXT,
  duracion_segundos INTEGER,
  estado TEXT NOT NULL DEFAULT 'en_curso',
  motivo TEXT,
  justificacion TEXT,
  registrado_por TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`;

/**
 * En producción la base DEBE vivir en un volumen montado. Sin esta comprobación la
 * app arrancaba feliz contra el disco efímero del contenedor y cada reinicio borraba
 * todo en silencio — así se perdieron los candidatos de julio de 2026.
 * Escotilla de escape: ALLOW_EPHEMERAL_DB=1 (solo para pruebas desechables).
 */
function verificarRutaPersistente(dbPath: string) {
  if (process.env.NODE_ENV !== 'production') return;
  // Durante `next build` NODE_ENV ya es production y el volumen todavía no existe;
  // si el guardia saltara aquí, tumbaría la compilación en vez de proteger nada.
  // Doble comprobación: la fase de Next y el propio comando, por si la variable
  // no se propaga a los procesos que recopilan datos de página.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (process.argv.some((a) => a === 'build' || a.endsWith('next-build'))) return;
  if (process.env.ALLOW_EPHEMERAL_DB === '1') {
    console.warn('[db] ALLOW_EPHEMERAL_DB=1 — la base NO persiste entre reinicios.');
    return;
  }

  const problemas: string[] = [];
  if (!process.env.SQLITE_DB_PATH) {
    problemas.push('SQLITE_DB_PATH no está definida.');
  }
  // El directorio de la app se reconstruye en cada deploy: nada que viva ahí sobrevive
  const normal = path.resolve(dbPath).replace(/\\/g, '/');
  if (normal.startsWith(path.resolve(process.cwd()).replace(/\\/g, '/'))) {
    problemas.push(`La ruta ${dbPath} está dentro del directorio de la aplicación (disco efímero).`);
  }

  if (problemas.length) {
    console.error(
      '\n[db] ARRANQUE ABORTADO — la base de datos no persistiría:\n' +
        problemas.map((p) => `  · ${p}`).join('\n') +
        '\n  Apunta SQLITE_DB_PATH al volumen montado (por ejemplo /data/app.db).\n'
    );
    throw new Error('SQLITE_DB_PATH apunta a almacenamiento efímero; revisa la configuración del volumen.');
  }
}

function initDb(): DrizzleDB {
  if (_db) return _db;
  const dbPath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'db', 'app.db');
  verificarRutaPersistente(dbPath);
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
    `ALTER TABLE protocolos ADD COLUMN tipo TEXT NOT NULL DEFAULT 'lista';`,
    `ALTER TABLE protocolos ADD COLUMN contenido TEXT;`,
    // Embudo de ventas sobre la cartera de clientes y prospectos
    `ALTER TABLE clientes ADD COLUMN etapa TEXT NOT NULL DEFAULT 'Nuevo';`,
    `ALTER TABLE clientes ADD COLUMN asignado_a INTEGER REFERENCES users(id);`,
    `ALTER TABLE clientes ADD COLUMN ultimo_contacto TEXT;`,
    `ALTER TABLE clientes ADD COLUMN proximo_seguimiento TEXT;`,
    `ALTER TABLE clientes ADD COLUMN motivo_perdida TEXT;`,
    `ALTER TABLE clientes ADD COLUMN origen TEXT DEFAULT 'Manual';`,
    `ALTER TABLE clientes ADD COLUMN id_denue TEXT;`,
    `ALTER TABLE clientes ADD COLUMN giro TEXT;`,
    `ALTER TABLE clientes ADD COLUMN codigo_scian TEXT;`,
    `ALTER TABLE clientes ADD COLUMN tamano TEXT;`,
    `ALTER TABLE clientes ADD COLUMN prioridad TEXT;`,
    `ALTER TABLE clientes ADD COLUMN puntaje INTEGER;`,
    `ALTER TABLE clientes ADD COLUMN sitio_web TEXT;`,
    `ALTER TABLE clientes ADD COLUMN colonia TEXT;`,
    `ALTER TABLE clientes ADD COLUMN cp TEXT;`,
    `ALTER TABLE clientes ADD COLUMN alcaldia TEXT;`,
    `ALTER TABLE clientes ADD COLUMN latitud TEXT;`,
    `ALTER TABLE clientes ADD COLUMN longitud TEXT;`,
    `ALTER TABLE clientes ADD COLUMN lote TEXT;`,
  ]) {
    try { sqlite.exec(stmt); } catch (e) { /* Column might already exist */ }
  }

  // Un establecimiento del DENUE no puede entrar dos veces: es lo que permite
  // importar lotes nuevos sin duplicar lo que ya trabaja un asesor.
  try {
    sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_id_denue ON clientes(id_denue) WHERE id_denue IS NOT NULL;`);
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_clientes_asignado ON clientes(asignado_a);`);
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_actividades_cliente ON prospecto_actividades(cliente_id);`);
  } catch (e) { /* Los índices ya existen */ }

  try {
    const rowB = sqlite.prepare("SELECT COUNT(*) as count FROM movimientos_financieros WHERE libro = 'B'").get() as { count: number };
    if (rowB && rowB.count === 0) {
      const rutaCuentaB = path.join(process.cwd(), 'src', 'data', 'movimientos-cuenta-b.json');
      if (existsSync(rutaCuentaB)) {
        const dataB = JSON.parse(readFileSync(rutaCuentaB, 'utf8'));
        if (Array.isArray(dataB) && dataB.length > 0) {
          const insertStmt = sqlite.prepare(`
            INSERT INTO movimientos_financieros
              (fecha, tipo, categoria, monto, descripcion, libro, medio_pago, nombre, tipo_detalle, turno, alimentos, servicio)
            VALUES
              (@fecha, @tipo, @categoria, @monto, @descripcion, @libro, @medio_pago, @nombre, @tipo_detalle, @turno, @alimentos, @servicio)
          `);
          const seedTx = sqlite.transaction((items: any[]) => {
            for (const item of items) {
              insertStmt.run({
                fecha: item.fecha,
                tipo: item.tipo,
                categoria: item.categoria,
                monto: item.monto,
                descripcion: item.descripcion ?? null,
                libro: item.libro || 'B',
                medio_pago: item.medio_pago ?? null,
                nombre: item.nombre ?? null,
                tipo_detalle: item.tipo_detalle ?? null,
                turno: item.turno ?? null,
                alimentos: item.alimentos ?? null,
                servicio: item.servicio ?? null,
              });
            }
          });
          seedTx(dataB);
          console.log(`[auto-seed] ${dataB.length} movimientos de Cuenta B sembrados en la base de datos.`);
        }
      }
    }
  } catch (err) {
    console.error('[auto-seed] Error sembrando datos iniciales de Cuenta B:', err);
  }

  /**
   * Reparación de la Cuenta B para bases que ya traen el histórico.
   *
   * La siembra de arriba solo corre con el libro vacío, así que una base que ya
   * tiene datos —el volumen de producción— nunca se enteraría de los arreglos
   * posteriores. Este bloque los aplica sobre lo que ya existe.
   *
   * Es un parche puntual, no un volcado: en el servidor puede haber movimientos
   * capturados a mano desde la app y reemplazar el libro entero se los llevaría.
   *
   * Es idempotente por construcción — el alta se salta si el movimiento marca ya
   * está, y las correcciones filtran por el importe viejo — así que puede correr
   * en cada arranque sin duplicar nada.
   */
  try {
    const rutaReparacion = path.join(process.cwd(), 'src', 'data', 'reparacion-cuenta-b.json');
    if (existsSync(rutaReparacion)) {
      const rep = JSON.parse(readFileSync(rutaReparacion, 'utf8'));
      const libro = rep.libro || 'B';

      const yaAplicada = (rep.marca ?? []).every((m: { fecha: string; descripcion: string }) =>
        (sqlite.prepare(
          `SELECT COUNT(*) as count FROM movimientos_financieros WHERE libro = ? AND fecha = ? AND descripcion = ?`
        ).get(libro, m.fecha, m.descripcion) as { count: number }).count > 0
      );

      if (!yaAplicada && Array.isArray(rep.movimientos) && rep.movimientos.length > 0) {
        const insertRep = sqlite.prepare(`
          INSERT INTO movimientos_financieros
            (fecha, tipo, categoria, monto, descripcion, libro, medio_pago, nombre, tipo_detalle, turno, alimentos, servicio)
          VALUES
            (@fecha, @tipo, @categoria, @monto, @descripcion, @libro, @medio_pago, @nombre, @tipo_detalle, @turno, @alimentos, @servicio)
        `);
        const repTx = sqlite.transaction((items: any[]) => {
          for (const item of items) {
            insertRep.run({
              fecha: item.fecha,
              tipo: item.tipo,
              categoria: item.categoria,
              monto: item.monto,
              descripcion: item.descripcion ?? null,
              libro: item.libro || libro,
              medio_pago: item.medio_pago ?? null,
              nombre: item.nombre ?? null,
              tipo_detalle: item.tipo_detalle ?? null,
              turno: item.turno ?? null,
              alimentos: item.alimentos ?? null,
              servicio: item.servicio ?? null,
            });
          }
        });
        repTx(rep.movimientos);
        console.log(`[reparacion] ${rep.movimientos.length} movimientos de la Cuenta B repuestos (quincena no capturada).`);
      }

      // Filtran por el importe/nombre viejo, así que la segunda vez no hacen nada.
      for (const c of rep.correcciones ?? []) {
        const r = sqlite.prepare(
          `UPDATE movimientos_financieros SET monto = ?
             WHERE libro = ? AND fecha = ? AND categoria = ? AND nombre = ? AND monto = ?`
        ).run(c.monto_correcto, libro, c.fecha, c.categoria, c.nombre, c.monto_excel);
        if (r.changes) console.log(`[reparacion] ${c.nombre} (${c.fecha}): ${c.monto_excel} → ${c.monto_correcto}.`);
      }

      for (const n of rep.normalizaciones ?? []) {
        const r = sqlite.prepare(
          `UPDATE movimientos_financieros SET nombre = ? WHERE libro = ? AND nombre = ?`
        ).run(n.a, libro, n.de);
        if (r.changes) console.log(`[reparacion] "${n.de}" → "${n.a}" en ${r.changes} movimiento(s).`);
      }
    }
  } catch (err) {
    console.error('[reparacion] Error aplicando la reparación de Cuenta B:', err);
  }

  try {
    const rowPrendas = sqlite.prepare("SELECT COUNT(*) as count FROM catalogo_prendas").get() as { count: number };
    if (rowPrendas && rowPrendas.count === 0) {
      const prendasIniciales = [
        { nombre: 'Camisolas', categoria: 'Uniformes', requiere_talla: 1, tallas: JSON.stringify(["28", "29", "30", "31", "32", "33", "34", "36", "38", "40", "42", "44"]), stock_minimo: 5 },
        { nombre: 'Pantalones', categoria: 'Uniformes', requiere_talla: 1, tallas: JSON.stringify(["XS", "S", "M", "G", "XG", "XXG"]), stock_minimo: 5 },
        { nombre: 'Chamarras', categoria: 'Abrigo', requiere_talla: 1, tallas: JSON.stringify(["XCH", "CH", "M", "G", "XG", "XXG"]), stock_minimo: 5 },
        { nombre: 'Chamarras Color Café', categoria: 'Abrigo', requiere_talla: 1, tallas: JSON.stringify(["XCH", "CH", "M", "G", "XG", "XXG"]), stock_minimo: 5 },
        { nombre: 'Botas', categoria: 'Calzado', requiere_talla: 1, tallas: JSON.stringify(["24", "25", "26", "27", "28", "29", "30", "31"]), stock_minimo: 5 },
        { nombre: 'Fornituras', categoria: 'Equipo Táctico', requiere_talla: 0, tallas: JSON.stringify([]), stock_minimo: 5 },
        { nombre: 'Silbatos', categoria: 'Accesorios', requiere_talla: 0, tallas: JSON.stringify([]), stock_minimo: 5 },
        { nombre: 'Gorras', categoria: 'Accesorios', requiere_talla: 0, tallas: JSON.stringify([]), stock_minimo: 5 },
        { nombre: 'Porta Gas', categoria: 'Equipo Táctico', requiere_talla: 0, tallas: JSON.stringify([]), stock_minimo: 5 },
        { nombre: 'Gas Pimienta', categoria: 'Equipo Táctico', requiere_talla: 0, tallas: JSON.stringify([]), stock_minimo: 5 },
        { nombre: 'Broches', categoria: 'Accesorios', requiere_talla: 0, tallas: JSON.stringify([]), stock_minimo: 5 },
      ];
      const insertPrenda = sqlite.prepare(`
        INSERT INTO catalogo_prendas (nombre, categoria, requiere_talla, tallas, stock_minimo, activo)
        VALUES (@nombre, @categoria, @requiere_talla, @tallas, @stock_minimo, 1)
      `);
      const seedPrendasTx = sqlite.transaction((items: any[]) => {
        for (const item of items) {
          insertPrenda.run(item);
        }
      });
      seedPrendasTx(prendasIniciales);
      console.log(`[auto-seed] ${prendasIniciales.length} prendas base inicializadas en el catálogo.`);
    }
  } catch (err) {
    console.error('[auto-seed] Error sembrando catálogo de prendas:', err);
  }

  // Con la base ya lista y verificada como persistente, queda encender los
  // respaldos: el volumen sobrevive a los redeploys, pero no a un borrado.
  try {
    programarRespaldos();
  } catch (err) {
    console.error('[respaldos] No se pudo programar el respaldo automático:', err);
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
