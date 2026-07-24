// Corrige la desincronización histórica entre Reclutamiento (candidatos) y la Agenda
// (eventos_calendario) que ocurría al borrar en un lado sin limpiar el otro.
//
// Hace DOS cosas (no borra candidatos ni eventos legítimos):
//   1) Candidatos cuya entrevista (evento_id) ya no existe en la Agenda  → limpia fecha_entrevista y evento_id.
//   2) Eventos de entrevista (creados por el bot) que ya no tienen candidato → los borra de la Agenda.
//
// Hace un respaldo del archivo .db antes de tocar nada.
//
// Uso (en el servidor donde vive la base de PRODUCCIÓN):
//   node scripts/sincronizar-entrevistas.mjs
// En Docker:
//   docker exec -it <contenedor> node scripts/sincronizar-entrevistas.mjs
//
// Usa la MISMA ruta que la app: variable SQLITE_DB_PATH, o ./db/app.db por defecto.

import Database from 'better-sqlite3';
import { existsSync, copyFileSync } from 'fs';
import path from 'path';

const dbPath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'db', 'app.db');

if (!existsSync(dbPath)) {
  console.error(`No se encontró la base de datos en: ${dbPath}`);
  console.error('Ejecuta este script desde la raíz del proyecto, o define SQLITE_DB_PATH.');
  process.exit(1);
}

console.log(`Base de datos: ${dbPath}`);

// Respaldo
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `${dbPath}.backup_${stamp}`;
copyFileSync(dbPath, backupPath);
console.log(`Respaldo creado: ${backupPath}`);

const db = new Database(dbPath);

const tx = db.transaction(() => {
  // 1) Candidatos apuntando a un evento inexistente → limpiar su cita.
  const candHuerfanos = db.prepare(
    `SELECT id FROM candidatos
     WHERE evento_id IS NOT NULL
       AND evento_id NOT IN (SELECT id FROM eventos_calendario)`
  ).all().map((r) => r.id);

  for (const id of candHuerfanos) {
    db.prepare('UPDATE candidatos SET fecha_entrevista = NULL, evento_id = NULL WHERE id = ?').run(id);
  }

  // 2) Eventos de entrevista (los que crea el bot llevan esta descripción) sin candidato que los referencie → borrar.
  const evHuerfanos = db.prepare(
    `SELECT id FROM eventos_calendario
     WHERE (descripcion LIKE '%asistente de WhatsApp%' OR descripcion LIKE '%Entrevista de reclutamiento%')
       AND id NOT IN (SELECT evento_id FROM candidatos WHERE evento_id IS NOT NULL)`
  ).all().map((r) => r.id);

  for (const id of evHuerfanos) {
    db.prepare('DELETE FROM eventos_calendario WHERE id = ?').run(id);
  }

  return { candHuerfanos, evHuerfanos };
});

const { candHuerfanos, evHuerfanos } = tx();

console.log(`Candidatos con cita limpiada (evento inexistente): ${candHuerfanos.length}`, candHuerfanos);
console.log(`Eventos de entrevista huérfanos borrados: ${evHuerfanos.length}`, evHuerfanos);

// Consolidar el WAL en el archivo principal
try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* no-op si no está en WAL */ }

db.close();
console.log('Listo. Sincronización completada.');
