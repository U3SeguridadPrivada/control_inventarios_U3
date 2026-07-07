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
        const { articulo, talla, cantidad, fecha, observaciones } = item;
        const qty = Number(cantidad);

        const conds: any[] = [eq(salidas.guardia_id, guardiaId), eq(salidas.articulo, articulo), eq(salidas.estado_asignacion, 'Uniforme en Campo')];
        if (talla) conds.push(eq(salidas.talla, talla));

        const oldRows = tx.select({ id: salidas.id }).from(salidas).where(and(...conds)).orderBy(desc(salidas.fecha), desc(salidas.id)).limit(qty).all();
        // Re-etiqueta las filas de asignación original en vez de insertar una fila sintética
        // adicional para el mismo evento: antes esta ruta hacía ambas cosas (UPDATE + INSERT
        // duplicado), lo que dejaba dos representaciones distintas de un mismo extravío y fue la
        // causa raíz de un bug de conteo de stock (ver bajas/[id]/process/route.ts). `fecha` de la
        // fila original conserva la fecha de la asignación; `estado_actualizado_en` registra cuándo
        // se reportó el extravío, sin perder ninguna de las dos fechas.
        for (const row of oldRows) {
          tx.update(salidas).set({ estado_asignacion: 'Extraviado', estado_actualizado_en: fecha, observaciones: observaciones || null }).where(eq(salidas.id, row.id)).run();
        }
      }
    });

    return Response.json({ ok: true }, { status: 201 });
  } catch {
    return Response.json({ error: 'Error al procesar el extravío' }, { status: 500 });
  }
}
