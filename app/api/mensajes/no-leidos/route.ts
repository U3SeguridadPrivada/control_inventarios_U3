import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { mensajes } from '@/src/db/schema';
import { and, eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const noLeidos = db.select().from(mensajes)
    .where(and(eq(mensajes.destinatario_id, authUser.id), eq(mensajes.eliminado_destinatario, 0), eq(mensajes.leido, 0)))
    .all();

  return Response.json({ count: noLeidos.length });
}
