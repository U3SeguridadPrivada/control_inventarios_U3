// Muestra las últimas conversaciones del bot de WhatsApp para depurar en vivo.
// Uso (en el servidor/contenedor de producción):
//   node scripts/ver-chat.mjs            -> últimos 30 mensajes (todos los teléfonos)
//   node scripts/ver-chat.mjs 5219991112233   -> solo ese contacto (por últimos 10 dígitos)
//
// Usa la MISMA ruta que la app: SQLITE_DB_PATH o ./db/app.db.

import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import path from 'path';

const dbPath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'db', 'app.db');
if (!existsSync(dbPath)) {
  console.error(`No se encontró la base de datos en: ${dbPath}`);
  process.exit(1);
}

const filtro = (process.argv[2] || '').replace(/\D/g, '');
const db = new Database(dbPath, { readonly: true });

let rows;
if (filtro.length >= 10) {
  rows = db.prepare(
    "SELECT id, telefono, rol, autor, mensaje, created_at FROM whatsapp_conversaciones WHERE telefono LIKE ? ORDER BY id DESC LIMIT 40"
  ).all(`%${filtro.slice(-10)}`).reverse();
} else {
  rows = db.prepare(
    "SELECT id, telefono, rol, autor, mensaje, created_at FROM whatsapp_conversaciones ORDER BY id DESC LIMIT 30"
  ).all().reverse();
}

console.log(`\n=== ${rows.length} mensajes (${dbPath}) ===`);
for (const r of rows) {
  const quien = r.rol === 'user' ? 'CONTACTO' : (r.autor === 'humano' ? 'HUMANO  ' : 'BOT     ');
  const txt = (r.mensaje || '').replace(/\s+/g, ' ').slice(0, 90);
  console.log(`#${r.id} [${quien}] ${r.telefono} :: ${txt}`);
}

// Clave para verificar el fix de memoria: el mismo contacto NO debe aparecer partido
// en varios formatos de teléfono.
console.log('\n=== teléfonos distintos (deberían agrupar a cada persona en UNA fila) ===');
console.log(db.prepare('SELECT telefono, count(*) c FROM whatsapp_conversaciones GROUP BY telefono ORDER BY c DESC').all());

db.close();
