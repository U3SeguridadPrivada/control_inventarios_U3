import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { guardias } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return Response.json({ error: 'Sin permisos' }, { status: 403 });

  const { id } = await params;
  const guardiaId = Number(id);

  try {
    const { nombre, numero_elemento, fecha_alta, telefono, direccion, estado } = await req.json();

    const updated = db.update(guardias)
      .set({ nombre, numero_elemento, fecha_alta, telefono, direccion, estado })
      .where(eq(guardias.id, guardiaId))
      .returning()
      .get();

    if (!updated) {
      return Response.json({ error: 'Guardia no encontrado' }, { status: 404 });
    }

    return Response.json(updated);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return Response.json({ error: 'El número de elemento ya existe' }, { status: 409 });
    }
    return Response.json({ error: 'Error al actualizar guardia: ' + err.message }, { status: 500 });
  }
}
