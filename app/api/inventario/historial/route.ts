import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { sql } from 'drizzle-orm';
import { autorizarInventario } from '@/src/lib/inventarioOperacion';
import { errorInventario } from '@/src/lib/inventarioValidacion';
import { historialDesde } from '@/src/lib/inventario';
export async function GET(req: NextRequest) {
  try {
    autorizarInventario(req, 'inventario', 'ver');
    const antes = Number(req.nextUrl.searchParams.get('antes')) || Number.MAX_SAFE_INTEGER;
    const eventos = db.all(sql`SELECT * FROM inventario_eventos WHERE id<${antes} ORDER BY id DESC LIMIT 100`);
    return Response.json({ desde: historialDesde(), eventos });
  } catch (err) { return errorInventario(err); }
}
