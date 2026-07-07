import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { movimientos_financieros, movimiento_evidencias } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { puedeEditarLibro } from '@/src/lib/librosAcceso';
import { promises as fs } from 'fs';
import path from 'path';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const { id } = await params;
  const movId = Number(id);
  const existente = db.select().from(movimientos_financieros).where(eq(movimientos_financieros.id, movId)).get();
  if (!existente) return Response.json({ error: 'Movimiento no encontrado' }, { status: 404 });
  if (!puedeEditarLibro(authUser, existente.libro)) return forbidden();

  try {
    const body = await req.json();
    const campos = ['fecha', 'tipo', 'categoria', 'descripcion', 'medio_pago', 'nombre', 'tipo_detalle', 'turno', 'alimentos', 'servicio'] as const;
    const cambios: Record<string, unknown> = {};
    for (const c of campos) if (c in body) cambios[c] = body[c] || null;
    if ('fecha' in body && !body.fecha) return Response.json({ error: 'La fecha es requerida' }, { status: 400 });
    if ('monto' in body) {
      if (!body.monto || Number(body.monto) <= 0) return Response.json({ error: 'Monto inválido' }, { status: 400 });
      cambios.monto = Number(body.monto);
    }
    if ('guardia_id' in body) cambios.guardia_id = body.guardia_id ? Number(body.guardia_id) : null;

    const actualizado = db.update(movimientos_financieros).set(cambios).where(eq(movimientos_financieros.id, movId)).returning().get();
    return Response.json(actualizado);
  } catch {
    return Response.json({ error: 'Error al actualizar el movimiento' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const { id } = await params;
  const movId = Number(id);
  const existente = db.select().from(movimientos_financieros).where(eq(movimientos_financieros.id, movId)).get();
  if (!existente) return Response.json({ error: 'Movimiento no encontrado' }, { status: 404 });
  if (!puedeEditarLibro(authUser, existente.libro)) return forbidden();

  const evidencias = db.select().from(movimiento_evidencias).where(eq(movimiento_evidencias.movimiento_id, movId)).all();
  for (const ev of evidencias) {
    try {
      await fs.unlink(path.join(process.cwd(), 'uploads', 'finanzas', ev.nombre_archivo));
    } catch {
      // El archivo físico ya no existe
    }
  }
  db.delete(movimiento_evidencias).where(eq(movimiento_evidencias.movimiento_id, movId)).run();
  db.delete(movimientos_financieros).where(eq(movimientos_financieros.id, movId)).run();
  return Response.json({ ok: true });
}
