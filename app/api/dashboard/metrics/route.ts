import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { entradas, salidas, guardias } from '@/src/db/schema';
import { sql, eq } from 'drizzle-orm';
import { autorizarInventario } from '@/src/lib/inventarioOperacion';
import { errorInventario } from '@/src/lib/inventarioValidacion';
export async function GET(req: NextRequest) {
  try {
    autorizarInventario(req, 'inventario', 'ver');
    const ents = db.select().from(entradas).where(eq(entradas.anulado, 0)).all();
    const sals = db.select().from(salidas).where(eq(salidas.anulado, 0)).all();
    const dateMap = new Map<string, { Entradas: number; Salidas: number }>();
    for (const [rows, campo] of [[ents, 'Entradas'], [sals, 'Salidas']] as const) for (const r of rows) {
      if (!dateMap.has(r.fecha)) dateMap.set(r.fecha, { Entradas: 0, Salidas: 0 });
      dateMap.get(r.fecha)![campo] += r.cantidad;
    }
    const eventos = db.all<{ id: number; tabla: string; fecha: string; motivo: string; despues: string | null; antes: string | null }>(sql`SELECT * FROM inventario_eventos WHERE tabla IN ('entradas','salidas','inventario_ajustes') AND accion<>'Base' ORDER BY id DESC LIMIT 8`);
    const recentMovements = eventos.map(e => {
      const row = JSON.parse(e.despues || e.antes || '{}');
      return { id: 'evento-' + e.id, tipo: e.tabla === 'entradas' ? 'Entrada' : e.tabla === 'salidas' ? 'Salida' : 'Ajuste', fecha: e.fecha, cantidad: row.cantidad, articulo: row.articulo, motivo: e.motivo || row.motivo || row.estado_asignacion };
    });
    return Response.json({
      metrics: { totalEntradas: ents.reduce((a,r)=>a+r.cantidad,0), totalSalidas: sals.reduce((a,r)=>a+r.cantidad,0), itemsEnCampo: sals.filter(s=>s.estado_asignacion==='Uniforme en Campo').reduce((a,r)=>a+r.cantidad,0), guardiasActivos: db.select().from(guardias).where(eq(guardias.estado,'Activo')).all().length },
      chartData: [...dateMap.keys()].sort().slice(-10).map(fecha=>({ fecha, ...dateMap.get(fecha)! })), recentMovements,
    });
  } catch (err) { return errorInventario(err); }
}
