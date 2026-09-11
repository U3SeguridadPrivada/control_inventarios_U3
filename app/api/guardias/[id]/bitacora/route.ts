import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { guardias, guardia_bitacora } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAuth(req)) return unauthorized();
  const { id } = await params;
  const guardiaId = Number(id);

  const guardia = db.select().from(guardias).where(eq(guardias.id, guardiaId)).get();
  if (!guardia) return Response.json({ error: 'Guardia no encontrado' }, { status: 404 });

  const bitacora = db.select().from(guardia_bitacora)
    .where(eq(guardia_bitacora.guardia_id, guardiaId))
    .orderBy(desc(guardia_bitacora.created_at))
    .all();

  return Response.json(bitacora);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return Response.json({ error: 'Sin permisos' }, { status: 403 });

  const { id } = await params;
  const guardiaId = Number(id);

  const guardia = db.select().from(guardias).where(eq(guardias.id, guardiaId)).get();
  if (!guardia) return Response.json({ error: 'Guardia no encontrado' }, { status: 404 });

  try {
    const { tipo = 'nota', asunto = '', mensaje } = await req.json();
    if (!mensaje || !mensaje.trim()) {
      return Response.json({ error: 'El mensaje no puede estar vacío' }, { status: 400 });
    }

    const nuevaEntrada = db.insert(guardia_bitacora).values({
      guardia_id: guardiaId,
      tipo,
      asunto: asunto.trim() || null,
      mensaje: mensaje.trim(),
      usuario: authUser.username,
    }).returning().get();

    return Response.json(nuevaEntrada, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: 'Error al registrar entrada en bitácora: ' + err.message }, { status: 500 });
  }
}
