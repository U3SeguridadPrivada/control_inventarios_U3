// Limpia SOLO los datos de prueba del bot de WhatsApp para empezar una prueba desde cero,
// conservando usuarios/logins, guardias, clientes reales, vacantes y configuración.
//
// Borra: whatsapp_conversaciones, whatsapp_chats, candidatos y los eventos de calendario
// generados por el bot (entrevistas). Hace un respaldo del archivo .db antes de tocar nada.
//
// Uso (en el servidor donde vive la base de PRODUCCIÓN):
//   node scripts/limpiar-bot.mjs
// En Docker:
//   docker exec -it <contenedor> node scripts/limpiar-bot.mjs
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

// 1) Respaldo
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `${dbPath}.backup_${stamp}`;
copyFileSync(dbPath, backupPath);
console.log(`Respaldo creado: ${backupPath}`);

const db = new Database(dbPath);

const contar = (t) => {
  try { return db.prepare(`SELECT count(*) c FROM ${t}`).get().c; }
  catch { return '(tabla no existe)'; }
};

const before = {
  whatsapp_conversaciones: contar('whatsapp_conversaciones'),
  whatsapp_chats: contar('whatsapp_chats'),
  candidatos: contar('candidatos'),
  eventos_bot: (() => {
    try {
      return db.prepare(
        "SELECT count(*) c FROM eventos_calendario WHERE descripcion LIKE '%asistente de WhatsApp%' OR id IN (SELECT evento_id FROM candidatos WHERE evento_id IS NOT NULL)"
      ).get().c;
    } catch { return 0; }
  })(),
};
console.log('ANTES:', before);

const tx = db.transaction(() => {
  // Eventos de entrevista creados por el bot (antes de borrar candidatos que los referencian)
  const evIds = db.prepare(
    "SELECT DISTINCT id FROM eventos_calendario WHERE descripcion LIKE '%asistente de WhatsApp%' OR id IN (SELECT evento_id FROM candidatos WHERE evento_id IS NOT NULL)"
  ).all().map((r) => r.id);

  db.prepare('DELETE FROM candidatos').run();
  for (const id of evIds) db.prepare('DELETE FROM eventos_calendario WHERE id = ?').run(id);
  db.prepare('DELETE FROM whatsapp_conversaciones').run();
  db.prepare('DELETE FROM whatsapp_chats').run();

  // Reiniciar contadores de ID (tablas 100% del bot) para que la prueba arranque desde 1
  try {
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('whatsapp_conversaciones','candidatos')").run();
  } catch { /* sqlite_sequence puede no existir si nunca hubo autoincrement */ }

  return evIds;
});

const evIds = tx();
console.log('Eventos de entrevista borrados (ids):', evIds);

// Consolidar el WAL en el archivo principal
try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* no-op si no está en WAL */ }

const after = {
  whatsapp_conversaciones: contar('whatsapp_conversaciones'),
  whatsapp_chats: contar('whatsapp_chats'),
  candidatos: contar('candidatos'),
};
console.log('DESPUES:', after);
console.log('CONSERVADOS -> users:', contar('users'), '| guardias:', contar('guardias'), '| clientes:', contar('clientes'), '| vacantes:', contar('vacantes'));

db.close();
console.log('Listo. Limpieza del bot completada.');
