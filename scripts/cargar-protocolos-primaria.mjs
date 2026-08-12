// Carga (o actualiza) el documento "Protocolos de Seguridad para Planteles de
// Educación Primaria" en el módulo Protocolos, a partir de
// src/data/protocolos-primaria.json.
//
// El documento queda como UN protocolo de tipo `documento`, editable y guardable
// desde la propia aplicación. Volver a correr el script sobrescribe su contenido
// con el del archivo, así que conviene usarlo solo para la carga inicial o para
// restaurar la versión base.
//
// Uso: node scripts/cargar-protocolos-primaria.mjs
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const Database = require('better-sqlite3');

const dbPath = process.env.SQLITE_DB_PATH || path.join(projectRoot, 'db', 'app.db');
const dir = path.dirname(dbPath);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

const doc = JSON.parse(
  readFileSync(path.join(projectRoot, 'src', 'data', 'protocolos-primaria.json'), 'utf8')
);

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

sqlite.exec(`
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
`);
for (const stmt of [
  `ALTER TABLE protocolos ADD COLUMN tipo TEXT NOT NULL DEFAULT 'lista';`,
  `ALTER TABLE protocolos ADD COLUMN contenido TEXT;`,
]) {
  try { sqlite.exec(stmt); } catch { /* la columna ya existe */ }
}

const ahora = new Date().toISOString();
const fila = {
  titulo: doc.titulo,
  categoria: doc.categoria,
  descripcion: doc.resumen,
  contenido: JSON.stringify(doc.contenido),
  prioridad: doc.prioridad,
  actualizado_en: ahora,
};

const existente = sqlite.prepare('SELECT id FROM protocolos WHERE titulo = ?').get(doc.titulo);
if (existente) {
  sqlite.prepare(`
    UPDATE protocolos
    SET categoria = @categoria, descripcion = @descripcion, contenido = @contenido,
        prioridad = @prioridad, tipo = 'documento', pasos = '[]', actualizado_en = @actualizado_en
    WHERE id = @id
  `).run({ ...fila, id: existente.id });
  console.log(`[protocolos] documento actualizado (id ${existente.id}).`);
} else {
  const nuevo = sqlite.prepare(`
    INSERT INTO protocolos (titulo, categoria, descripcion, tipo, pasos, contenido, prioridad, activo, actualizado_en)
    VALUES (@titulo, @categoria, @descripcion, 'documento', '[]', @contenido, @prioridad, 1, @actualizado_en)
  `).run(fila);
  console.log(`[protocolos] documento creado (id ${nuevo.lastInsertRowid}).`);
}

// Limpieza: la primera versión de este script cargaba cada contingencia como un
// protocolo suelto de tipo `lista`. Ahora viven dentro del documento.
const titulosDeSecciones = doc.contenido.secciones.filter((s) => s.tipo === 'protocolo').map((s) => s.titulo);
if (titulosDeSecciones.length) {
  const marcas = titulosDeSecciones.map(() => '?').join(',');
  const borrados = sqlite
    .prepare(`DELETE FROM protocolos WHERE tipo = 'lista' AND titulo IN (${marcas})`)
    .run(...titulosDeSecciones);
  if (borrados.changes) console.log(`[protocolos] ${borrados.changes} registros sueltos retirados (ahora son secciones del documento).`);
}

console.log(`[protocolos] base de datos: ${dbPath}`);
console.log(`[protocolos] ${doc.contenido.secciones.length} secciones, versión ${doc.contenido.version}.`);
sqlite.close();
