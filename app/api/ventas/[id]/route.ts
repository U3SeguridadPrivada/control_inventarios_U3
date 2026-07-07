import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { ventas } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  const { id } = await params;
  try {
    const { estado, metodo_pago, notas } = await req.json();
    const updated = db.update(ventas)
      .set({ estado, metodo_pago, notas })
      .where(eq(ventas.id, Number(id)))
      .returning()
      .get();
    if (!updated) return Response.json({ error: 'Venta no encontrada' }, { status: 404 });
    return Response.json(updated);
  } catch {
    return Response.json({ error: 'Error al actualizar la venta' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  const { id } = await params;
  db.delete(ventas).where(eq(ventas.id, Number(id))).run();
  return Response.json({ ok: true });
}
