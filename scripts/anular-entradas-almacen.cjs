/* Anula TODAS las entradas vigentes del almacén (el historial se conserva, con bitácora).
 * Sin argumentos solo informa. --aplicar respalda y anula. --incluir-salidas anula también las salidas vigentes
 * (obligatorio si hay entregas contra esas entradas; sin él el script se detiene en lugar de dejar stock negativo).
 * Usa SQLITE_DB_PATH (volumen de Railway) o db/app.db.
 */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const Database = require('better-sqlite3');
const { crearEntorno, root } = require('./lib/inventario-harness.cjs');
const databasePath = process.env.SQLITE_DB_PATH || path.join(root, 'db', 'app.db');
const aplicar = process.argv.includes('--aplicar');
const conSalidas = process.argv.includes('--incluir-salidas');
const conGuardias = process.argv.includes('--incluir-guardias');

async function main() {
  const sqlite = new Database(databasePath, { readonly: !aplicar });
  try {
    const entradas = sqlite.prepare('SELECT COUNT(*) n, COALESCE(SUM(cantidad),0) piezas FROM entradas WHERE anulado=0').get();
    const salidas = sqlite.prepare('SELECT COUNT(*) n, COALESCE(SUM(cantidad),0) piezas, COUNT(guardia_id) conGuardia FROM salidas WHERE anulado=0').get();
    console.log('Base:', databasePath);
    console.log('Entradas vigentes:', entradas.n, '(' + entradas.piezas + ' piezas)');
    console.log('Salidas vigentes:', salidas.n, '(' + salidas.piezas + ' piezas, ' + salidas.conGuardia + ' ligadas a un guardia)');
    if (salidas.n && !conSalidas) { console.log('Hay salidas vigentes: anular solo las entradas dejaría stock negativo. Agrega --incluir-salidas si también quieres anularlas.'); if (aplicar) process.exitCode = 1; return; }
    if (conSalidas && salidas.conGuardia && !conGuardias) { console.log('Hay salidas ligadas a guardias (equipo entregado real). Anularlas borra su asignación. Si de verdad quieres reiniciar todo, agrega --incluir-guardias.'); if (aplicar) process.exitCode = 1; return; }
    if (!aplicar) { console.log('Solo lectura. Para ejecutar agrega --aplicar.'); return; }
    if (!entradas.n && !salidas.n) { console.log('Nada que anular.'); return; }

    const carpeta = path.join(path.dirname(databasePath), 'backups'); fs.mkdirSync(carpeta, { recursive: true });
    const backup = path.join(carpeta, 'antes-anular-entradas-' + new Date().toISOString().replace(/[:.]/g, '-') + '.db');
    await sqlite.backup(backup);
    const copia = new Database(backup, { readonly: true });
    try { if (copia.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('El respaldo no pasó la verificación; no se modifica nada.'); } finally { copia.close(); }

    const { load } = crearEntorno(sqlite, false);
    const fecha = load('src/lib/fecha.ts').fechaMexico(); const operacion = randomUUID();
    const motivo = 'Anulación masiva de entradas del almacén solicitada por el usuario. Historial conservado.';
    sqlite.transaction(() => {
      sqlite.prepare('UPDATE inventario_contexto SET usuario=?,fecha=?,operacion_id=?,motivo=? WHERE id=1').run('anulacion-autorizada', fecha, operacion, motivo);
      if (conSalidas) sqlite.prepare('UPDATE salidas SET anulado=1 WHERE anulado=0').run();
      sqlite.prepare('UPDATE entradas SET anulado=1 WHERE anulado=0').run();
      sqlite.exec('UPDATE inventario_contexto SET usuario=NULL,fecha=NULL,operacion_id=NULL,motivo=NULL WHERE id=1');
    }).immediate();
    if (sqlite.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Falló integrity_check tras la anulación; restaura el respaldo ' + backup);
    console.log(JSON.stringify({ fecha, operacion, backup, entradasAnuladas: entradas.n, salidasAnuladas: conSalidas ? salidas.n : 0 }, null, 2));
  } finally { sqlite.close(); }
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });
