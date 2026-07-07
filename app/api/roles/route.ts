import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { roles_personalizados } from '@/src/db/schema';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();
  return Response.json(db.select().from(roles_personalizados).all());
}

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  try {
    const { nombre, descripcion, permisos, color } = await req.json();
    if (!nombre || !permisos) return Response.json({ error: 'Faltan campos requeridos' }, { status: 400 });

    const nuevo = db.insert(roles_personalizados).values({
      nombre,
      descripcion: descripcion || null,
      permisos,
      color: color || 'slate',
    }).returning().get();
    return Response.json(nuevo, { status: 201 });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) return Response.json({ error: 'Ya existe un rol con ese nombre' }, { status: 409 });
    return Response.json({ error: 'Error al crear el rol' }, { status: 500 });
  }
}
