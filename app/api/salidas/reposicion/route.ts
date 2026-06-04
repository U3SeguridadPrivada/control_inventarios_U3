import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { salidas, entradas, guardias } from '@/src/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { calcularStockDisponible } from '@/src/lib/stock';

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return Response.json({ error: 'Sin permisos' }, { status: 403 });

  try {
    const { items, estadoDevolucion, estadoEntregado } = await req.json();
    if (!Array.isArray(items) || items.length === 0) return Response.json({ error: 'Se requiere un array de artículos' }, { status: 400 });

    const guardiaId = Number(items[0]?.guardia_id);
    if (!guardiaId) return Response.json({ error: 'Se requiere guardia_id' }, { status: 400 });

    const guardia = db.select().from(guardias).where(eq(guardias.id, guardiaId)).get();

    const solicitadoPorEstado: Record<string, number> = {};
    for (const item of items) {
      const estadoE = item.estado_fisico || estadoEntregado || 'Nuevo';
      const key = `${item.articulo}|||${item.talla || ''}|||${estadoE}`;
      solicitadoPorEstado[key] = (solicitadoPorEstado[key] ?? 0) + Number(item.cantidad);
    }
    for (const [key, qty] of Object.entries(solicitadoPorEstado)) {
      const [art, tallaRaw, estadoE] = key.split('|||');
      const almacen = calcularStockDisponible(art, tallaRaw || undefined, estadoE);
      if (qty > almacen) return Response.json({ error: `Stock insuficiente para "${art}" [${estadoE}]. Disponible: ${almacen}` }, { status: 400 });
    }

    db.transaction((tx) => {
      for (const item of items) {
        const { articulo, talla, cantidad, fecha, nombre_guardia } = item;
        const qty = Number(cantidad);
        const estadoEntregadoReq = item.estado_fisico || estadoEntregado || 'Nuevo';
        const itemEstadoDevuelto = item.estado_devuelto || estadoDevolucion || 'Usado';

        const conds: any[] = [eq(salidas.guardia_id, guardiaId), eq(salidas.articulo, articulo), eq(salidas.estado_asignacion, 'Uniforme en Campo')];
        if (talla) conds.push(eq(salidas.talla, talla));

        const oldRows = tx.select({ id: salidas.id }).from(salidas).where(and(...conds)).orderBy(desc(salidas.fecha), desc(salidas.id)).limit(qty).all();
        for (const row of oldRows) {
          tx.update(salidas).set({ estado_asignacion: 'Devuelto', estado_devuelto: itemEstadoDevuelto }).where(eq(salidas.id, row.id)).run();
        }

        const estadoEntranteFisico = (itemEstadoDevuelto === 'Para Baja' || itemEstadoDevuelto === 'Inutilizable') ? 'Inutilizable' : itemEstadoDevuelto;
        tx.insert(entradas).values({ fecha, articulo, talla: talla || null, cantidad: qty, estado: estadoEntranteFisico, motivo: 'Reposición (Entrada Múltiple)', origen_devolucion: guardia?.nombre || nombre_guardia, guardia_id: guardiaId, registrado_por: authUser.username }).run();
        tx.insert(salidas).values({ fecha, concepto: 'Reposición', articulo, talla: talla || null, cantidad: qty, nombre_guardia: nombre_guardia || null, guardia_id: guardiaId, estado_asignacion: 'Uniforme en Campo', estado_fisico: estadoEntregadoReq, registrado_por: authUser.username }).run();
      }
    });

    return Response.json({ ok: true }, { status: 201 });
  } catch {
    return Response.json({ error: 'Error al procesar la reposición' }, { status: 500 });
  }
}
