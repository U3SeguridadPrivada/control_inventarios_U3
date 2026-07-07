import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { vacantes } from '@/src/db/schema';
import { desc } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();
  return Response.json(db.select().from(vacantes).orderBy(desc(vacantes.id)).all());
}

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  try {
    const { puesto, ubicacion, turno, sueldo, requisitos, descripcion, activa } = await req.json();
    if (!puesto) return Response.json({ error: 'Falta el puesto' }, { status: 400 });

    const nueva = db.insert(vacantes).values({
      puesto, ubicacion, turno, sueldo, requisitos, descripcion,
      activa: activa === false || activa === 0 ? 0 : 1,
      creado_por: authUser.id,
    }).returning().get();
    return Response.json(nueva, { status: 201 });
  } catch {
    return Response.json({ error: 'Error al crear la vacante' }, { status: 500 });
  }
}
