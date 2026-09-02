// Carga un lote de prospección del DENUE a la tabla `clientes` del sistema.
//
//   node scripts/importar-prospectos.mjs --archivo prospectos-lote-01.csv
//   node scripts/importar-prospectos.mjs --archivo prospectos-lote-01.csv --limite 500
//   node scripts/importar-prospectos.mjs --archivo prospectos-lote-01.csv --repartir ana,luis
//   node scripts/importar-prospectos.mjs --archivo prospectos-lote-01.csv --simular
//
// Los lotes se generan con scripts/prospectar-denue.mjs. Un establecimiento que
// ya está en la base no se vuelve a insertar: el id del DENUE lleva índice único,
// así que reimportar el mismo archivo no duplica ni pisa el trabajo del asesor.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { readFileSync, existsSync } from 'fs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const Database = require('better-sqlite3');

const args = process.argv.slice(2);
const opcion = (nombre, def) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const nombreArchivo = opcion('archivo', 'prospectos-lote-01.csv');
const limite = Number(opcion('limite', '0'));
const repartirEntre = (opcion('repartir', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const simular = args.includes('--simular');
// La etiqueta del lote es lo que mide la cobertura por lote en el tablero.
const etiquetaLote = opcion('etiqueta', '') ||
  (path.basename(nombreArchivo).match(/lote-(\d+)/i)?.[0].toLowerCase() ?? 'lote-manual');

const ruta = path.isAbsolute(nombreArchivo)
  ? nombreArchivo
  : path.join(projectRoot, 'prospeccion', nombreArchivo);
if (!existsSync(ruta)) {
  console.error(`[importar] No encontré el archivo: ${ruta}`);
  process.exit(1);
}

// --- Lectura del CSV que emite prospectar-denue.mjs (UTF-8 con BOM) ---
function parseCSV(texto) {
  const filas = [];
  let fila = [], celda = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"') { if (texto[i + 1] === '"') { celda += '"'; i++; } else comillas = false; }
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(celda); celda = ''; }
    else if (c === '\n') { fila.push(celda); filas.push(fila); fila = []; celda = ''; }
    else if (c !== '\r') celda += c;
  }
  if (celda.length || fila.length) { fila.push(celda); filas.push(fila); }
  return filas;
}

const texto = readFileSync(ruta, 'utf8').replace(/^﻿/, '');
const filas = parseCSV(texto).filter((f) => f.length > 1);
const encabezado = filas[0];
const registros = filas.slice(1).map((f) => Object.fromEntries(encabezado.map((h, i) => [h, (f[i] ?? '').trim()])));
console.log(`[importar] ${registros.length.toLocaleString('es-MX')} registros en ${path.basename(ruta)} (etiqueta: ${etiquetaLote}).`);

const dbPath = process.env.SQLITE_DB_PATH || path.join(projectRoot, 'db', 'app.db');
if (!existsSync(dbPath)) {
  console.error(`[importar] No existe la base de datos en ${dbPath}. Levanta la aplicación una vez para crearla.`);
  process.exit(1);
}
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

// La aplicación crea columnas e índice al arrancar; el script no debe depender
// de que eso ya haya pasado, porque se puede correr con el servidor apagado.
for (const stmt of [
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
  try { sqlite.exec(stmt); } catch { /* la columna ya existe */ }
}
try {
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_id_denue ON clientes(id_denue) WHERE id_denue IS NOT NULL;`);
} catch { /* el índice ya existe */ }

// --- Asesores del reparto ---
let asesores = [];
if (repartirEntre.length) {
  for (const nombre of repartirEntre) {
    const u = sqlite.prepare('SELECT id, username FROM users WHERE lower(username) = lower(?)').get(nombre);
    if (!u) {
      console.error(`[importar] No existe el usuario "${nombre}". Revisa el nombre en Administración → Usuarios.`);
      process.exit(1);
    }
    asesores.push(u);
  }
  console.log(`[importar] Reparto en ronda entre: ${asesores.map((a) => a.username).join(', ')}.`);
}

const yaExiste = sqlite.prepare('SELECT id FROM clientes WHERE id_denue = ?');
const insertar = sqlite.prepare(`
  INSERT INTO clientes
    (nombre, tipo, empresa, email, telefono, direccion, notas, etapa, asignado_a,
     origen, id_denue, giro, codigo_scian, tamano, prioridad, puntaje, sitio_web,
     colonia, cp, alcaldia, latitud, longitud, lote)
  VALUES
    (@nombre, 'Prospecto', @empresa, @email, @telefono, @direccion, @notas, 'Nuevo', @asignado_a,
     'Padrón CDMX', @id_denue, @giro, @codigo_scian, @tamano, @prioridad, @puntaje, @sitio_web,
     @colonia, @cp, @alcaldia, @latitud, @longitud, @lote)
`);

let insertados = 0, omitidos = 0, sinContacto = 0, sinNombre = 0;
const porAsesor = new Map(asesores.map((a) => [a.username, 0]));
const aInsertar = limite > 0 ? registros.slice(0, limite) : registros;

const cargar = sqlite.transaction(() => {
  for (const r of aInsertar) {
    if (!r.establecimiento) { sinNombre++; continue; }
    if (!r.telefono && !r.correo) { sinContacto++; continue; }
    if (r.id_denue && yaExiste.get(r.id_denue)) { omitidos++; continue; }

    const asesor = asesores.length ? asesores[insertados % asesores.length] : null;
    insertar.run({
      nombre: r.establecimiento,
      empresa: r.razon_social || r.establecimiento,
      email: r.correo || null,
      telefono: r.telefono || null,
      direccion: [r.domicilio, r.cp, r.alcaldia].filter(Boolean).join(', ') || null,
      notas: null,
      asignado_a: asesor ? asesor.id : null,
      id_denue: r.id_denue || null,
      giro: r.giro || null,
      codigo_scian: r.codigo_scian || null,
      tamano: r.tamano || null,
      prioridad: r.prioridad || null,
      puntaje: r.puntaje ? Number(r.puntaje) : null,
      sitio_web: r.sitio_web || null,
      colonia: r.colonia || null,
      cp: r.cp || null,
      alcaldia: r.alcaldia || null,
      latitud: r.latitud || null,
      longitud: r.longitud || null,
      lote: etiquetaLote,
    });
    if (asesor) porAsesor.set(asesor.username, (porAsesor.get(asesor.username) || 0) + 1);
    insertados++;
  }
  if (simular) throw new Error('__SIMULACION__');
});

try {
  cargar();
} catch (e) {
  if (e.message !== '__SIMULACION__') throw e;
  console.log('\n[importar] SIMULACIÓN: se revirtió todo, no se guardó nada.');
}

console.log(`\n[importar] Insertados:      ${insertados.toLocaleString('es-MX')}`);
console.log(`[importar] Ya existían:     ${omitidos.toLocaleString('es-MX')}`);
console.log(`[importar] Sin contacto:    ${sinContacto.toLocaleString('es-MX')}`);
console.log(`[importar] Sin nombre:      ${sinNombre.toLocaleString('es-MX')}`);
if (asesores.length) {
  console.log('\n[importar] Reparto por asesor:');
  for (const [nombre, n] of porAsesor) console.log(`  ${nombre.padEnd(20)} ${String(n).padStart(6)}`);
}

const total = sqlite.prepare("SELECT COUNT(*) AS n FROM clientes WHERE origen = 'DENUE'").get().n;
console.log(`\n[importar] Cartera DENUE en el sistema: ${total.toLocaleString('es-MX')} prospectos.`);
