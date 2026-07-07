import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { incidencias } from '@/src/db/schema';
import { desc, eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const guardiaId = req.nextUrl.searchParams.get('guardia_id');
  if (guardiaId) {
    return Response.json(
      db.select().from(incidencias).where(eq(incidencias.guardia_id, Number(guardiaId))).orderBy(desc(incidencias.fecha), desc(incidencias.id)).all()
    );
  }
  return Response.json(db.select().from(incidencias).orderBy(desc(incidencias.fecha), desc(incidencias.id)).all());
}

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  try {
    const { guardia_id, tipo, gravedad, fecha, descripcion } = await req.json();
    if (!guardia_id || !tipo || !fecha || !descripcion) return Response.json({ error: 'Faltan campos requeridos' }, { status: 400 });

    const nueva = db.insert(incidencias).values({
      guardia_id: Number(guardia_id),
      tipo,
      gravedad: gravedad || 'Leve',
      fecha,
      descripcion,
      creado_por: authUser.id,
    }).returning().get();
    return Response.json(nueva, { status: 201 });
  } catch {
    return Response.json({ error: 'Error al crear la incidencia' }, { status: 500 });
  }
}
