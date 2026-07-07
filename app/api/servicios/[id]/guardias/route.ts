import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { servicio_guardias, guardias } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  try {
    const { id } = await params;
    const servicioId = Number(id);
    const { guardia_id, turno } = await req.json();
    if (!guardia_id) return Response.json({ error: 'Falta guardia_id' }, { status: 400 });

    const nuevo = db.insert(servicio_guardias).values({
      servicio_id: servicioId, guardia_id: Number(guardia_id), turno: turno || null,
    }).returning().get();

    const guardia = db.select().from(guardias).where(eq(guardias.id, nuevo.guardia_id)).get();
    return Response.json({ ...nuevo, nombre: guardia?.nombre, numero_elemento: guardia?.numero_elemento }, { status: 201 });
  } catch {
    return Response.json({ error: 'Error al asignar el guardia' }, { status: 500 });
  }
}
