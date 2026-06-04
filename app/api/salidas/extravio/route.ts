import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { salidas, guardias } from '@/src/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return Response.json({ error: 'Sin permisos' }, { status: 403 });

  try {
    const { items } = await req.json();
    if (!Array.isArray(items) || items.length === 0) return Response.json({ error: 'Se requiere un array de artículos' }, { status: 400 });

    const guardiaId = Number(items[0]?.guardia_id);
    if (!guardiaId) return Response.json({ error: 'Se requiere guardia_id' }, { status: 400 });

    const guardia = db.select().from(guardias).where(eq(guardias.id, guardiaId)).get();
    if (!guardia) return Response.json({ error: 'Guardia no encontrado' }, { status: 404 });

    db.transaction((tx) => {
      for (const item of items) {
        const { articulo, talla, cantidad, fecha, nombre_guardia, observaciones } = item;
        const qty = Number(cantidad);

        const conds: any[] = [eq(salidas.guardia_id, guardiaId), eq(salidas.articulo, articulo), eq(salidas.estado_asignacion, 'Uniforme en Campo')];
        if (talla) conds.push(eq(salidas.talla, talla));

        const oldRows = tx.select({ id: salidas.id }).from(salidas).where(and(...conds)).orderBy(desc(salidas.fecha), desc(salidas.id)).limit(qty).all();
        for (const row of oldRows) {
          tx.update(salidas).set({ estado_asignacion: 'Extraviado' }).where(eq(salidas.id, row.id)).run();
        }

        tx.insert(salidas).values({ fecha, concepto: 'Extravío', articulo, talla: talla || null, cantidad: qty, nombre_guardia: nombre_guardia || null, guardia_id: guardiaId, estado_asignacion: 'N/A', observaciones: observaciones || null, registrado_por: authUser.username }).run();
      }
    });

    return Response.json({ ok: true }, { status: 201 });
  } catch {
    return Response.json({ error: 'Error al procesar el extravío' }, { status: 500 });
  }
}
