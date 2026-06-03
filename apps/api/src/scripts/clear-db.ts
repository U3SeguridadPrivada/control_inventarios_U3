import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Asegurar que carga el .env correcto de la carpeta api
dotenv.config({ path: resolve(__dirname, '../../.env') });

import { db } from '../db';
import { entradas, salidas, guardias, uniformes_campo, bajas } from '../db/schema';

async function main() {
  console.log('Iniciando limpieza de base de datos (Solo datos operativos)...');

  try {
    // Es importante el orden por las llaves foráneas.
    // Primero borramos las tablas dependientes de 'guardias'.
    console.log('Borrando bajas...');
    await db.delete(bajas);

    console.log('Borrando uniformes_campo...');
    await db.delete(uniformes_campo);

    console.log('Borrando salidas...');
    await db.delete(salidas);

    console.log('Borrando entradas...');
    await db.delete(entradas);

    // Finalmente borramos guardias
    console.log('Borrando guardias...');
    await db.delete(guardias);

    console.log('✅ Base de datos limpiada correctamente. Los usuarios permanecen intactos.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error durante la limpieza:', error);
    process.exit(1);
  }
}

main();
