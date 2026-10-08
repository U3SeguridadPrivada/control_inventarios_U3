import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { salidas, guardias } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { autorizarInventario } from '@/src/lib/inventarioOperacion';
import { errorInventario } from '@/src/lib/inventarioValidacion';
export async function GET(req: NextRequest) {
  try {
    autorizarInventario(req, 'uniformes-campo', 'ver');
    const records = db.select({ salida: salidas, guardia: guardias }).from(salidas).leftJoin(guardias, eq(salidas.guardia_id, guardias.id))
      .where(and(eq(salidas.estado_asignacion, 'Uniforme en Campo'), eq(salidas.anulado, 0))).all();
    const grupos = new Map<string, { guardiaId: number | null; nombreGuardia: string; sinResponsable: boolean; articulos: any[] }>();
    for (const { salida: s, guardia: g } of records) {
      const key = g ? String(g.id) : 'sin-responsable';
      if (!grupos.has(key)) grupos.set(key, { guardiaId: g?.id ?? null, nombreGuardia: g?.nombre ?? 'Equipo pendiente de conciliación', sinResponsable: !g, articulos: [] });
      grupos.get(key)!.articulos.push({ salidaId: s.id, fecha: s.fecha, articulo: s.articulo, talla: s.talla, cantidad: s.cantidad, estadoFisico: s.estado_fisico });
    }
    return Response.json([...grupos.values()]);
  } catch (err) { return errorInventario(err); }
}
