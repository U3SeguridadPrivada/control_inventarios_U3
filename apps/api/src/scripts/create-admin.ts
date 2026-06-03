/**
 * Ejecutar una sola vez para crear el primer usuario administrador:
 *   npx tsx src/scripts/create-admin.ts
 */
import * as dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcryptjs';
import { db } from '../db';
import { users } from '../db/schema';

const USERNAME = 'admin';
const EMAIL = 'admin@u3.com';
const PASSWORD = 'Admin1234'; // Cámbialo después de entrar

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 12);
  const [user] = await db
    .insert(users)
    .values({ username: USERNAME, email: EMAIL, password_hash: hash, role: 'admin' })
    .returning({ id: users.id, username: users.username, role: users.role });

  console.log('✓ Admin creado:', user);
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
