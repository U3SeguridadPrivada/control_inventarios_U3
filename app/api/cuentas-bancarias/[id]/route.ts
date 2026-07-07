import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { cuentas_bancarias } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  const { id } = await params;
  try {
    const { banco, alias, numero_cuenta, tipo, moneda, saldo_actual, activa } = await req.json();
    const updated = db.update(cuentas_bancarias)
      .set({ banco, alias, numero_cuenta, tipo, moneda, saldo_actual: saldo_actual !== undefined ? Number(saldo_actual) : undefined, activa: activa !== undefined ? (activa ? 1 : 0) : undefined })
      .where(eq(cuentas_bancarias.id, Number(id)))
      .returning()
      .get();
    if (!updated) return Response.json({ error: 'Cuenta no encontrada' }, { status: 404 });
    return Response.json(updated);
  } catch {
    return Response.json({ error: 'Error al actualizar la cuenta' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  const { id } = await params;
  db.delete(cuentas_bancarias).where(eq(cuentas_bancarias.id, Number(id))).run();
  return Response.json({ ok: true });
}
