import { db } from './apps/api/src/db';
import { entradas, salidas } from './apps/api/src/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const allEntradas = await db.select().from(entradas).where(eq(entradas.articulo, 'Camisolas'));
  const allSalidas = await db.select().from(salidas).where(eq(salidas.articulo, 'Camisolas'));
  
  console.log('ENTRADAS CAMISOLAS:');
  console.table(allEntradas);
  
  console.log('\nSALIDAS CAMISOLAS:');
  console.table(allSalidas);
  process.exit(0);
}
main();
