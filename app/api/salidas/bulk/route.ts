import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { salidas, guardias } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { validarStockLote } from '@/src/lib/stock';

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return Response.json({ error: 'Sin permisos' }, { status: 403 });

  try {
    const { items } = await req.json();
    if (!Array.isArray(items) || items.length === 0) return Response.json({ error: 'Se requiere un array "items"' }, { status: 400 });

    const guardiaId = items[0]?.guardia_id;
    if (!guardiaId) return Response.json({ error: 'Se requiere guardia_id' }, { status: 400 });

    const guardia = db.select().from(guardias).where(eq(guardias.id, Number(guardiaId))).get();
    if (!guardia) return Response.json({ error: 'Guardia no encontrado' }, { status: 404 });
    if (guardia.estado !== 'Activo') return Response.json({ error: `Estado de guardia inválido: "${guardia.estado}"` }, { status: 400 });

    const errorStock = validarStockLote(items);
    if (errorStock) return Response.json({ error: errorStock }, { status: 400 });

    const created = db.insert(salidas).values(items).returning().all();
    return Response.json({ created: created.length, items: created }, { status: 201 });
  } catch {
    return Response.json({ error: 'Error al crear salidas en bulk' }, { status: 500 });
  }
}
