import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { salidas, entradas } from '@/src/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { autorizarInventario } from '@/src/lib/inventarioOperacion';
import { cantidadEntera, errorInventario } from '@/src/lib/inventarioValidacion';
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    autorizarInventario(req, 'uniformes-campo', 'ver');
    const { id } = await params; const guardiaId = cantidadEntera(id);
    const s = db.select().from(salidas).where(eq(salidas.guardia_id, guardiaId)).orderBy(desc(salidas.fecha)).all();
    const e = db.select().from(entradas).where(eq(entradas.guardia_id, guardiaId)).orderBy(desc(entradas.fecha)).all();
    const eventos = db.all(sql`SELECT * FROM inventario_eventos WHERE tabla IN ('salidas','entradas') AND (json_extract(despues,'$.guardia_id')=${guardiaId} OR json_extract(antes,'$.guardia_id')=${guardiaId}) ORDER BY id DESC`);
    return Response.json({ salidas: s, entradas: e, eventos });
  } catch (err) { return errorInventario(err); }
}
