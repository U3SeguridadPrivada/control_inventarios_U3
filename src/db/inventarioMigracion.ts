import type Database from 'better-sqlite3';
import { fechaMexico } from '@/src/lib/fecha';

/** Bitácora y punto de partida explícito: no inventa estados anteriores a su instalación. */
export function migrarInventario(sqlite: Database.Database) {
  sqlite.transaction(() => {
    for (const table of ['entradas', 'salidas']) {
      const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      for (const [name, type] of [['anulado', 'INTEGER NOT NULL DEFAULT 0'], ['operacion_id', 'TEXT'], ['salida_origen_id', 'INTEGER']]) {
        if (!cols.some(c => c.name === name)) sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
      }
    }
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS inventario_contexto (id INTEGER PRIMARY KEY CHECK(id=1), usuario TEXT, fecha TEXT, operacion_id TEXT, motivo TEXT);
      INSERT OR IGNORE INTO inventario_contexto(id) VALUES(1);
      CREATE TABLE IF NOT EXISTS inventario_meta (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS inventario_eventos (
        id INTEGER PRIMARY KEY AUTOINCREMENT, tabla TEXT NOT NULL, registro_id INTEGER NOT NULL,
        accion TEXT NOT NULL, fecha TEXT NOT NULL, registrado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        usuario TEXT NOT NULL, operacion_id TEXT, motivo TEXT, antes TEXT, despues TEXT, deshecho_por TEXT
      );
      CREATE INDEX IF NOT EXISTS inventario_eventos_fecha ON inventario_eventos(fecha,id);
      CREATE INDEX IF NOT EXISTS inventario_eventos_registro ON inventario_eventos(tabla,registro_id,id);
      CREATE TABLE IF NOT EXISTS inventario_solicitudes (clave TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL, hash TEXT NOT NULL, respuesta TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS inventario_ajustes (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL, articulo TEXT NOT NULL, talla TEXT, estado TEXT NOT NULL, cantidad INTEGER NOT NULL, motivo TEXT NOT NULL, registrado_por TEXT NOT NULL, operacion_id TEXT);
    `);
    // Bitácoras creadas antes de poder deshacer operaciones: `deshecho_por` guarda la operación que
    // revirtió cada evento (ver src/lib/inventarioDeshacer.ts). Es nullable, así que no toca lo existente.
    const colsEventos = sqlite.prepare('PRAGMA table_info(inventario_eventos)').all() as { name: string }[];
    if (!colsEventos.some(c => c.name === 'deshecho_por')) sqlite.exec('ALTER TABLE inventario_eventos ADD COLUMN deshecho_por TEXT');
    sqlite.exec('CREATE INDEX IF NOT EXISTS inventario_eventos_operacion ON inventario_eventos(operacion_id)');
    const base = sqlite.prepare("SELECT valor FROM inventario_meta WHERE clave='historial_desde'").get();
    const hoy = fechaMexico();
    if (!base) {
      sqlite.prepare('INSERT INTO inventario_meta(clave,valor) VALUES(?,?)').run('historial_desde', hoy);
      const insert = sqlite.prepare('INSERT INTO inventario_eventos(tabla,registro_id,accion,fecha,usuario,motivo,despues) VALUES(?,?,?,?,?,?,?)');
      for (const table of ['entradas', 'salidas', 'catalogo_prendas', 'inventario_ajustes']) {
        for (const row of sqlite.prepare(`SELECT * FROM ${table}`).all() as { id: number }[]) insert.run(table, row.id, 'Base', hoy, 'sistema', 'Saldo al activar la bitácora; historial anterior no reconstruible', JSON.stringify(row));
      }
    }
    for (const table of ['entradas', 'salidas', 'catalogo_prendas', 'inventario_ajustes']) {
      const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      const json = (alias: string) => `json_object(${cols.flatMap(c => [`'${c.name}'`, `${alias}."${c.name}"`]).join(',')})`;
      for (const action of ['INSERT', 'UPDATE', 'DELETE']) {
        const old = action === 'INSERT' ? 'NULL' : json('OLD');
        const next = action === 'DELETE' ? 'NULL' : json('NEW');
        sqlite.exec(`CREATE TRIGGER IF NOT EXISTS inv_${table}_${action} AFTER ${action} ON ${table} BEGIN
          INSERT INTO inventario_eventos(tabla,registro_id,accion,fecha,usuario,operacion_id,motivo,antes,despues)
          SELECT '${table}',${action === 'DELETE' ? 'OLD' : 'NEW'}.id,'${action}',
            MAX(COALESCE(fecha,date('now','-6 hours')),(SELECT valor FROM inventario_meta WHERE clave='historial_desde')),
            COALESCE(usuario,'sistema'),operacion_id,motivo,${old},${next} FROM inventario_contexto WHERE id=1;
        END`);
      }
    }
  }).immediate();
}
