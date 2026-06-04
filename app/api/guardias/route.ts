import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { guardias } from '@/src/db/schema';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();
  return Response.json(db.select().from(guardias).all());
}

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return Response.json({ error: 'Sin permisos' }, { status: 403 });

  try {
    const { numero_elemento, nombre, fecha_alta } = await req.json();
    const newGuardia = db.insert(guardias).values({ numero_elemento, nombre, fecha_alta, estado: 'Activo' }).returning().get();
    return Response.json(newGuardia, { status: 201 });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) return Response.json({ error: 'El número de elemento ya existe' }, { status: 409 });
    return Response.json({ error: 'Error al crear guardia' }, { status: 500 });
  }
}
