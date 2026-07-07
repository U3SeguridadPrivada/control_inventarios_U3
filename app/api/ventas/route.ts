import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { ventas, cotizaciones } from '@/src/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();
  return Response.json(db.select().from(ventas).orderBy(desc(ventas.id)).all());
}

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  try {
    const { cliente_id, cotizacion_id, fecha, monto_total, metodo_pago, notas } = await req.json();
    if (!cliente_id || !fecha || !monto_total) return Response.json({ error: 'Faltan campos requeridos' }, { status: 400 });

    const countRow = db.select({ c: sql<number>`COUNT(*)` }).from(ventas).get();
    const folio = `VTA-${String((countRow?.c ?? 0) + 1).padStart(4, '0')}`;

    const nueva = db.insert(ventas).values({
      folio,
      cliente_id: Number(cliente_id),
      cotizacion_id: cotizacion_id ? Number(cotizacion_id) : null,
      fecha,
      monto_total: Number(monto_total),
      metodo_pago: metodo_pago || null,
      notas: notas || null,
      creado_por: authUser.id,
    }).returning().get();

    if (cotizacion_id) {
      db.update(cotizaciones).set({ estado: 'Aceptada' }).where(eq(cotizaciones.id, Number(cotizacion_id))).run();
    }

    return Response.json(nueva, { status: 201 });
  } catch {
    return Response.json({ error: 'Error al crear la venta' }, { status: 500 });
  }
}
