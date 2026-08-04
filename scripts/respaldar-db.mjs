// Respaldo consistente de la base, pensado para correr como cron en Railway.
//
//   node scripts/respaldar-db.mjs            -> respalda y rota
//   node scripts/respaldar-db.mjs --listar   -> muestra los respaldos existentes
//
// Usa VACUUM INTO en vez de copiar el archivo: copiar un SQLite en caliente puede
// capturarlo a medio escribir, con el WAL sin aplicar. VACUUM INTO produce siempre
// un archivo integro y compactado.
//
// Variables: SQLITE_DB_PATH (obligatoria en produccion)
//            BACKUP_DIR     (por defecto <dir de la base>/backups)
//            BACKUP_KEEP    (cuantos conservar, por defecto 14)
import { createRequire } from 'module';
import { readdirSync, mkdirSync, existsSync, statSync, unlinkSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const Database = require('better-sqlite3');

const dbPath = process.env.SQLITE_DB_PATH || path.join(projectRoot, 'db', 'app.db');
const backupDir = process.env.BACKUP_DIR || path.join(path.dirname(dbPath), 'backups');
const conservar = Number(process.env.BACKUP_KEEP || 14);

const listarRespaldos = () =>
  existsSync(backupDir)
    ? readdirSync(backupDir)
        .filter((f) => f.startsWith('app-') && f.endsWith('.db'))
        .map((f) => ({ f, ruta: path.join(backupDir, f), st: statSync(path.join(backupDir, f)) }))
        .sort((a, b) => b.st.mtimeMs - a.st.mtimeMs)
    : [];

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

if (process.argv.includes('--listar')) {
  const r = listarRespaldos();
  console.log(`Respaldos en ${backupDir}: ${r.length}\n`);
  for (const x of r) console.log(`  ${x.f}  ${kb(x.st.size).padStart(9)}  ${x.st.mtime.toISOString()}`);
  process.exit(0);
}

if (!existsSync(dbPath)) {
  console.error(`✗ No existe la base en ${dbPath}`);
  process.exit(1);
}

if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
let destino = path.join(backupDir, `app-${sello}.db`);
// VACUUM INTO falla si el destino existe; dos corridas en el mismo segundo chocan
for (let n = 2; existsSync(destino); n++) {
  destino = path.join(backupDir, `app-${sello}-${n}.db`);
}

const sqlite = new Database(dbPath, { readonly: true });
try {
  // Comillas simples escapadas: la ruta va como literal SQL
  sqlite.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
} finally {
  sqlite.close();
}

// Comprueba que el respaldo abre y tiene contenido antes de rotar nada
const check = new Database(destino, { readonly: true });
const tablas = check
  .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
  .all();
let filas = 0;
for (const t of tablas) filas += check.prepare(`SELECT COUNT(*) c FROM "${t.name}"`).get().c;
check.close();

if (!tablas.length) {
  unlinkSync(destino);
  console.error('✗ El respaldo salió vacío; se descartó y no se rotó nada.');
  process.exit(1);
}

console.log(`✓ ${path.basename(destino)} — ${tablas.length} tablas, ${filas} filas, ${kb(statSync(destino).size)}`);

// Rotación: conserva los N más recientes
const todos = listarRespaldos();
const sobran = todos.slice(conservar);
for (const x of sobran) unlinkSync(x.ruta);
if (sobran.length) console.log(`  Rotados: se borraron ${sobran.length} respaldos antiguos (se conservan ${conservar}).`);
console.log(`  Total en disco: ${Math.min(todos.length, conservar)} respaldos en ${backupDir}`);
