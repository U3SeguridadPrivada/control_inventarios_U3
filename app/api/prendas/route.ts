import { validarPayload } from '@/src/lib/inventarioValidacion';
import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { catalogo_prendas } from '@/src/db/schema';
import { eq, asc } from 'drizzle-orm';
import { autorizarConsultaInventario, autorizarInventario, operarInventario } from '@/src/lib/inventarioOperacion';
import { errorInventario, InventarioError } from '@/src/lib/inventarioValidacion';
import { datosPrenda } from '@/src/lib/prendasValidacion';
import { fechaMexico } from '@/src/lib/fecha';
export async function GET(req: NextRequest) {
  try {
    autorizarConsultaInventario(req, [['inventario','ver'], ['entradas','crear'], ['salidas','crear'], ['uniformes-campo','editar'], ['uniformes-campo','crear']]);
    return Response.json(db.select().from(catalogo_prendas).where(req.nextUrl.searchParams.get('solo_activas') === '1' ? eq(catalogo_prendas.activo, 1) : undefined).orderBy(asc(catalogo_prendas.nombre)).all());
  } catch (err) { return errorInventario(err); }
}
export async function POST(req: NextRequest) {
  try {
    const user = autorizarInventario(req, 'inventario'); const p = validarPayload(await req.json());
    return Response.json(operarInventario(req, user, p, fechaMexico(), 'Crear prenda', tx => tx.insert(catalogo_prendas).values(datosPrenda(p)).returning().get()), { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) return errorInventario(new InventarioError('Ya existe una prenda con ese nombre', 409));
    return errorInventario(err);
  }
}
