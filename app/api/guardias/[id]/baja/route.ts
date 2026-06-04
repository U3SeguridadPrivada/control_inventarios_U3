import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { guardias, salidas, bajas } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return Response.json({ error: 'Sin permisos' }, { status: 403 });

  try {
    const { id } = await params;
    const guardiaId = Number(id);
    const { fecha } = await req.json();

    const guardia = db.select().from(guardias).where(eq(guardias.id, guardiaId)).get();
    if (!guardia) return Response.json({ error: 'Guardia no encontrado' }, { status: 404 });
    if (guardia.estado !== 'Activo') return Response.json({ error: `No se puede dar de baja a un guardia con estado "${guardia.estado}"` }, { status: 400 });

    const assigned = db.select().from(salidas).where(and(eq(salidas.guardia_id, guardiaId), eq(salidas.estado_asignacion, 'Uniforme en Campo'))).all();
    const checklist = assigned.map(s => ({ salida_id: s.id, articulo: s.articulo, talla: s.talla, cantidad_adeudada: s.cantidad, cantidad_devuelta: 0, cantidad_extraviada: 0, estado: 'Pendiente' }));

    for (const s of assigned) {
      db.update(salidas).set({ estado_asignacion: 'Uniforme en Bajas' }).where(eq(salidas.id, s.id)).run();
    }

    const newBaja = db.insert(bajas).values({ fecha, guardia_id: guardiaId, nombre_guardia: guardia.nombre, numero_elemento: guardia.numero_elemento, estado_general: 'Pendiente', checklist }).returning().get();
    db.update(guardias).set({ estado: 'Baja Pendiente', fecha_baja: fecha }).where(eq(guardias.id, guardiaId)).run();

    return Response.json({ ...newBaja, checklist });
  } catch {
    return Response.json({ error: 'Error al iniciar baja' }, { status: 500 });
  }
}
