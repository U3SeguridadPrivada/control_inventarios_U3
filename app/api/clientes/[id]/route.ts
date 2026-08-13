import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { clientes } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { accesoDeUsuario } from '@/src/lib/accesoUsuario';
import { puedeVerModulo } from '@/src/lib/permisosModulos';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (!puedeVerModulo('clientes', accesoDeUsuario(authUser.id))) return forbidden();

  const { id } = await params;
  const cliente = db.select().from(clientes).where(eq(clientes.id, Number(id))).get();
  if (!cliente) return Response.json({ error: 'Cliente no encontrado' }, { status: 404 });
  return Response.json(cliente);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (!puedeVerModulo('clientes', accesoDeUsuario(authUser.id))) return forbidden();
  if (authUser.role === 'viewer') return forbidden();

  const { id } = await params;
  try {
    const { nombre, tipo, empresa, email, telefono, direccion, notas } = await req.json();
    const updated = db.update(clientes)
      .set({ nombre, tipo, empresa, email, telefono, direccion, notas })
      .where(eq(clientes.id, Number(id)))
      .returning()
      .get();
    if (!updated) return Response.json({ error: 'Cliente no encontrado' }, { status: 404 });
    return Response.json(updated);
  } catch {
    return Response.json({ error: 'Error al actualizar el cliente' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  const { id } = await params;
  db.delete(clientes).where(eq(clientes.id, Number(id))).run();
  return Response.json({ ok: true });
}
