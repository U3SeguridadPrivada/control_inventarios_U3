// Lista usuarios o restablece una contraseña en la BD que use la app.
// Respeta SQLITE_DB_PATH, así que dentro del contenedor de Railway apunta al volumen.
//
//   node scripts/reset-admin.mjs                        -> lista los usuarios
//   node scripts/reset-admin.mjs <usuario> <password>   -> cambia la contraseña
//
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { existsSync } from 'fs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dbPath = process.env.SQLITE_DB_PATH || path.join(projectRoot, 'db', 'app.db');
if (!existsSync(dbPath)) {
  console.error(`✗ No existe la base en: ${dbPath}`);
  console.error('  Define SQLITE_DB_PATH si la base vive en otra ruta.');
  process.exit(1);
}
console.log(`Base de datos: ${dbPath}\n`);

const sqlite = new Database(dbPath);
const [usuario, password] = process.argv.slice(2);

if (!usuario) {
  const rows = sqlite.prepare(`SELECT id, username, email, role, created_at FROM users ORDER BY id`).all();
  if (!rows.length) {
    console.log('No hay ningún usuario. Crea el admin con: node scripts/create-admin.mjs <usuario> <password> <email>');
  } else {
    console.table(rows);
    console.log('Para cambiar una contraseña: node scripts/reset-admin.mjs <usuario> <password-nueva>');
  }
  sqlite.close();
  process.exit(0);
}

if (!password || password.length < 8) {
  console.error('✗ Indica una contraseña nueva de al menos 8 caracteres.');
  process.exit(1);
}

// Acepta nombre de usuario o correo, igual que el login
const user = sqlite.prepare(`SELECT id, username, email, role FROM users WHERE username = ? OR email = ?`).get(usuario, usuario);
if (!user) {
  console.error(`✗ No se encontró el usuario "${usuario}". Ejecuta el script sin argumentos para ver la lista.`);
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
sqlite.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hash, user.id);
console.log(`✓ Contraseña actualizada para ${user.username} (${user.email}, rol ${user.role}).`);

sqlite.close();
