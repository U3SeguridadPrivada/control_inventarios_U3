import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { bajas } from '@/src/db/schema';
import { desc } from 'drizzle-orm';
import { autorizarInventario } from '@/src/lib/inventarioOperacion';
import { errorInventario } from '@/src/lib/inventarioValidacion';
export async function GET(req: NextRequest) {
  try { autorizarInventario(req, 'bajas', 'ver'); return Response.json(db.select().from(bajas).orderBy(desc(bajas.fecha)).all()); }
  catch (err) { return errorInventario(err); }
}
