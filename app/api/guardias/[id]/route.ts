import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import {
  guardias, guardia_documentos, guardia_bitacora, uniformes_campo, bajas,
  servicio_guardias, incidencias, entradas, salidas, eventos_calendario,
  movimientos_financieros, candidatos,
} from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  const { id } = await params;
  const guardiaId = Number(id);

  const guardia = db.select().from(guardias).where(eq(guardias.id, guardiaId)).get();
  if (!guardia) return Response.json({ error: 'Guardia no encontrado' }, { status: 404 });

  // Registros que solo existen por este guardia (FK NOT NULL): se eliminan con él.
  db.delete(guardia_documentos).where(eq(guardia_documentos.guardia_id, guardiaId)).run();
  db.delete(guardia_bitacora).where(eq(guardia_bitacora.guardia_id, guardiaId)).run();
  db.delete(uniformes_campo).where(eq(uniformes_campo.guardia_id, guardiaId)).run();
  db.delete(bajas).where(eq(bajas.guardia_id, guardiaId)).run();
  db.delete(servicio_guardias).where(eq(servicio_guardias.guardia_id, guardiaId)).run();
  db.delete(incidencias).where(eq(incidencias.guardia_id, guardiaId)).run();

  // Registros con historial propio (inventario, finanzas, calendario, reclutamiento):
  // se conservan y solo se desvincula la referencia al guardia (FK nullable).
  db.update(entradas).set({ guardia_id: null }).where(eq(entradas.guardia_id, guardiaId)).run();
  db.update(salidas).set({ guardia_id: null }).where(eq(salidas.guardia_id, guardiaId)).run();
  db.update(eventos_calendario).set({ guardia_id: null }).where(eq(eventos_calendario.guardia_id, guardiaId)).run();
  db.update(movimientos_financieros).set({ guardia_id: null }).where(eq(movimientos_financieros.guardia_id, guardiaId)).run();
  db.update(candidatos).set({ guardia_id: null }).where(eq(candidatos.guardia_id, guardiaId)).run();

  db.delete(guardias).where(eq(guardias.id, guardiaId)).run();

  return Response.json({ success: true });
}
