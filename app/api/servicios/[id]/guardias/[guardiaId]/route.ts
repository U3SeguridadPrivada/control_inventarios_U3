import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { servicio_guardias } from '@/src/db/schema';
import { and, eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; guardiaId: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  const { id, guardiaId } = await params;
  db.delete(servicio_guardias)
    .where(and(eq(servicio_guardias.servicio_id, Number(id)), eq(servicio_guardias.guardia_id, Number(guardiaId))))
    .run();

  return Response.json({ success: true });
}
