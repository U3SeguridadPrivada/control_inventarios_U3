import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { entradas } from '@/src/db/schema';
import { desc } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();
  return Response.json(db.select().from(entradas).orderBy(desc(entradas.fecha), desc(entradas.id)).all());
}

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return Response.json({ error: 'Sin permisos' }, { status: 403 });

  try {
    const { fecha, articulo, talla, cantidad, estado, motivo, origen_devolucion, guardia_id, registrado_por } = await req.json();
    if (!fecha || !articulo || !cantidad || !estado || !motivo) return Response.json({ error: 'Faltan campos requeridos' }, { status: 400 });

    const result = db.insert(entradas).values({ fecha, articulo, talla, cantidad: Number(cantidad), estado, motivo, origen_devolucion, guardia_id: guardia_id ? Number(guardia_id) : null, registrado_por }).returning().get();
    return Response.json(result, { status: 201 });
  } catch {
    return Response.json({ error: 'Error al crear entrada' }, { status: 500 });
  }
}
