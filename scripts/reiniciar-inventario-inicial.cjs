/* Conciliación única autorizada: almacén de cero para cargar inventario inicial.
 * Sin argumentos verifica; --aplicar-reinicio-inicial respalda y anula SOLO el
 * conjunto histórico diagnosticado. Rechaza cualquier captura nueva.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const Database = require('better-sqlite3');
const { crearEntorno, root } = require('./lib/inventario-harness.cjs');
const databasePath = path.join(root, 'db', 'app.db');
const marker = 'reinicio_inicial_autorizado_2026_10_07';
function comprobar(db) {
  assert.deepEqual(db.prepare('SELECT id,fecha,articulo,talla,cantidad,motivo FROM entradas ORDER BY id').all(), [{id:1,fecha:'2026-07-02',articulo:'Camisolas',talla:'28',cantidad:3,motivo:'Compra'}], 'Entradas distintas del diagnóstico; no se reiniciará');
  assert.deepEqual(db.prepare('SELECT id,fecha,articulo,talla,cantidad,guardia_id,estado_asignacion FROM salidas ORDER BY id').all(), [1,2].map(id => ({id,fecha:'2026-07-02',articulo:'Camisolas',talla:'28',cantidad:1,guardia_id:null,estado_asignacion:'Uniforme en Campo'})), 'Salidas distintas del diagnóstico; no se reiniciará');
  const existe = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='inventario_ajustes'").get();
  if (existe) assert.equal(db.prepare('SELECT COUNT(*) n FROM inventario_ajustes').get().n, 0, 'Hay ajustes nuevos');
  assert.deepEqual(db.prepare('SELECT id,guardia_id,estado_general,checklist FROM bajas ORDER BY id').all(), [{id:2,guardia_id:2,estado_general:'Pendiente',checklist:'[]'},{id:3,guardia_id:1,estado_general:'Pendiente',checklist:'[]'}], 'Los procesos de baja cambiaron');
}
async function main() {
  const aplicar = process.argv.includes('--aplicar-reinicio-inicial');
  const sqlite = new Database(databasePath, { readonly: !aplicar });
  try {
    const tieneMeta = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='inventario_meta'").get();
    if (tieneMeta && sqlite.prepare('SELECT valor FROM inventario_meta WHERE clave=?').get(marker)) { console.log('El reinicio ya fue aplicado. No se modifica ninguna captura posterior.'); return; }
    comprobar(sqlite);
    if (!aplicar) { console.log('Verificado: 1 entrada, 2 salidas sin guardia y 2 bajas vacías. Listo para respaldo y reinicio autorizado.'); return; }
    const carpeta = path.join(root, 'db', 'backups'); fs.mkdirSync(carpeta, { recursive: true });
    const backup = path.join(carpeta, 'inventario-antes-carga-inicial-' + new Date().toISOString().replace(/[:.]/g, '-') + '.db');
    await sqlite.backup(backup);
    const copia = new Database(backup, { readonly: true });
    try { comprobar(copia); assert.equal(copia.pragma('integrity_check', { simple: true }), 'ok'); } finally { copia.close(); }
    const { load } = crearEntorno(sqlite, false);
    const fecha = load('src/lib/fecha.ts').fechaMexico(); const operacion = randomUUID();
    const motivo = 'Reinicio autorizado por usuario: almacén de cero; se cargará inventario inicial. Los movimientos históricos se conservan anulados.';
    sqlite.transaction(() => {
      comprobar(sqlite);
      sqlite.prepare('UPDATE inventario_contexto SET usuario=?,fecha=?,operacion_id=?,motivo=? WHERE id=1').run('conciliacion-autorizada',fecha,operacion,motivo);
      sqlite.prepare('UPDATE entradas SET anulado=1 WHERE id=1').run();
      sqlite.prepare('UPDATE salidas SET anulado=1 WHERE id IN (1,2)').run();
      for (const baja of sqlite.prepare('SELECT id,guardia_id FROM bajas WHERE id IN (2,3)').all()) {
        assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM salidas WHERE guardia_id=? AND anulado=0 AND estado_asignacion IN ('Uniforme en Campo','Uniforme en Bajas')").get(baja.guardia_id).n,0);
        sqlite.prepare("UPDATE bajas SET estado_general='Completada' WHERE id=?").run(baja.id);
        sqlite.prepare("UPDATE guardias SET estado='Baja Definitiva' WHERE id=? AND estado='Baja Pendiente'").run(baja.guardia_id);
        sqlite.prepare('INSERT INTO guardia_bitacora(guardia_id,tipo,asunto,mensaje,usuario) VALUES(?,?,?,?,?)').run(baja.guardia_id,'nota','Cierre de baja sin equipo pendiente','Proceso '+baja.id+' completado durante la conciliación inicial. Checklist vacío y sin equipo asignado pendiente. Respaldo conservado.','conciliacion-autorizada');
      }
      sqlite.prepare('INSERT INTO inventario_meta(clave,valor) VALUES(?,?)').run(marker,JSON.stringify({fecha,operacion,backup,motivo}));
      sqlite.exec('UPDATE inventario_contexto SET usuario=NULL,fecha=NULL,operacion_id=NULL,motivo=NULL WHERE id=1');
      const inventario = load('src/lib/inventario.ts').calcularInventarioResumen();
      assert.ok(inventario.every(r=>r.almacen===0&&r.enCampo===0&&r.enBajas===0&&r.perdidas===0&&r.totalEntradas===0));
    }).immediate();
    assert.equal(sqlite.pragma('integrity_check', { simple:true }), 'ok');
    const resultado = { fecha, backup, operacion, entradasAnuladas:1, salidasAnuladas:2, bajasVaciasCompletadas:2, saldoAlmacen:0, equipoEnCampo:0, integridad:'ok', historialDesde:fecha };
    fs.writeFileSync(path.join(root,'docs/reinicio-inventario-2026-10-07.json'),JSON.stringify(resultado,null,2));
    console.log(JSON.stringify(resultado,null,2));
  } finally { sqlite.close(); }
}
main().catch(err=>{console.error(err.message);process.exitCode=1;});
