import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { candidatos, whatsapp_conversaciones } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAuth(req)) return unauthorized();
  const { id } = await params;
  const candidato = db.select().from(candidatos).where(eq(candidatos.id, Number(id))).get();
  if (!candidato) return Response.json({ error: 'Candidato no encontrado' }, { status: 404 });

  // Conversación de WhatsApp asociada al teléfono del candidato
  const conversacion = db.select().from(whatsapp_conversaciones)
    .where(eq(whatsapp_conversaciones.telefono, candidato.telefono))
    .orderBy(desc(whatsapp_conversaciones.id))
    .limit(100)
    .all()
    .reverse();

  return Response.json({ ...candidato, conversacion });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  const { id } = await params;
  try {
    const body = await req.json();
    const actual = db.select().from(candidatos).where(eq(candidatos.id, Number(id))).get();
    if (!actual) return Response.json({ error: 'Candidato no encontrado' }, { status: 404 });

    const cambios: Record<string, unknown> = {};
    for (const campo of ['nombre', 'ciudad', 'experiencia', 'notas', 'fecha_entrevista'] as const) {
      if (campo in body) cambios[campo] = body[campo];
    }
    if ('telefono' in body) cambios.telefono = String(body.telefono).replace(/\D/g, '');
    if ('edad' in body) cambios.edad = body.edad ? Number(body.edad) : null;
    if ('vacante_id' in body) cambios.vacante_id = body.vacante_id ? Number(body.vacante_id) : null;
    if ('etapa' in body && body.etapa !== actual.etapa) {
      cambios.etapa = body.etapa;
      cambios.etapa_actualizada_en = new Date().toISOString();
    }

    const updated = db.update(candidatos).set(cambios).where(eq(candidatos.id, Number(id))).returning().get();
    return Response.json(updated);
  } catch {
    return Response.json({ error: 'Error al actualizar el candidato' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  const { id } = await params;
  db.delete(candidatos).where(eq(candidatos.id, Number(id))).run();
  return Response.json({ ok: true });
}
