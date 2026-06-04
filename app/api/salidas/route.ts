import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { salidas, guardias } from '@/src/db/schema';
import { desc, eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { calcularStockDisponible } from '@/src/lib/stock';

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();
  return Response.json(db.select().from(salidas).orderBy(desc(salidas.fecha), desc(salidas.id)).all());
}

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return Response.json({ error: 'Sin permisos' }, { status: 403 });

  try {
    const payload = await req.json();
    if (payload.guardia_id) {
      const guardia = db.select().from(guardias).where(eq(guardias.id, Number(payload.guardia_id))).get();
      if (guardia && guardia.estado !== 'Activo') return Response.json({ error: `No se puede asignar equipo a un guardia con estado "${guardia.estado}"` }, { status: 400 });
    }

    const almacenDisponible = calcularStockDisponible(payload.articulo, payload.talla, payload.estado_fisico || 'Nuevo');
    if (Number(payload.cantidad) > almacenDisponible) return Response.json({ error: `Stock insuficiente. Disponible: ${almacenDisponible}, solicitado: ${payload.cantidad}` }, { status: 400 });

    const result = db.insert(salidas).values(payload).returning().get();
    return Response.json(result, { status: 201 });
  } catch {
    return Response.json({ error: 'Error al crear salida' }, { status: 500 });
  }
}
