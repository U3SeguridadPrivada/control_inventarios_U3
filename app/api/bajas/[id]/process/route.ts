import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { bajas, salidas, guardias, entradas } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return Response.json({ error: 'Sin permisos' }, { status: 403 });

  try {
    const { id } = await params;
    const bajaId = Number(id);
    const { salida_id, accion, cantidadItem, estadoFisicoDevolucion } = await req.json();

    const bajaRecord = db.select().from(bajas).where(eq(bajas.id, bajaId)).get();
    if (!bajaRecord) return Response.json({ error: 'Baja no encontrada' }, { status: 404 });

    let checklist: any[] = Array.isArray(bajaRecord.checklist) ? bajaRecord.checklist : JSON.parse(bajaRecord.checklist as any);
    const itemIndex = checklist.findIndex(c => c.salida_id === salida_id);
    if (itemIndex === -1) return Response.json({ error: 'Item no encontrado en checklist' }, { status: 404 });

    const item = { ...checklist[itemIndex] };

    const hoy = new Date().toISOString().split('T')[0];

    if (accion === 'Devuelto') {
      item.cantidad_devuelta = cantidadItem;
      item.estado = 'Devuelto';
      db.update(salidas).set({ estado_asignacion: 'Devuelto', estado_actualizado_en: hoy }).where(eq(salidas.id, salida_id)).run();
      db.insert(entradas).values({ fecha: hoy, articulo: item.articulo, talla: item.talla, cantidad: cantidadItem, estado: estadoFisicoDevolucion || 'Usado', motivo: 'Devolución de Equipo', origen_devolucion: bajaRecord.nombre_guardia, registrado_por: 'Sistema (Baja)' }).run();
    } else if (accion === 'Extraviado') {
      item.cantidad_extraviada = cantidadItem;
      item.estado = 'Extraviado';
      // Mismo estado terminal que usa `salidas/extravio/route.ts` (Uniformes en Campo), para que
      // ambos orígenes de extravío resten del almacén exactamente una vez vía el bucket 'extraviados'
      // de `calcularStockDisponible` (ver src/lib/stock.ts). Antes esta ruta usaba concepto='Extravío'
      // + estado_asignacion='N/A', combinación que ese cálculo no contemplaba y dejaba el artículo
      // contando como disponible en almacén aunque en realidad se hubiera perdido en una baja.
      db.update(salidas).set({ estado_asignacion: 'Extraviado', estado_actualizado_en: hoy }).where(eq(salidas.id, salida_id)).run();
    }

    checklist[itemIndex] = item;
    const allCompleted = checklist.every(c => c.estado !== 'Pendiente');
    const newState = allCompleted ? 'Completada' : 'En Proceso';

    db.update(bajas).set({ checklist, estado_general: newState }).where(eq(bajas.id, bajaId)).run();
    if (allCompleted) db.update(guardias).set({ estado: 'Baja Definitiva' }).where(eq(guardias.id, bajaRecord.guardia_id)).run();

    return Response.json({ success: true, allCompleted });
  } catch {
    return Response.json({ error: 'Error al procesar item' }, { status: 500 });
  }
}
