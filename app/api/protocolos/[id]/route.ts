import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { protocolos } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

function normalizarPasos(pasos: unknown): string[] {
  if (!Array.isArray(pasos)) return [];
  return pasos.map((p) => String(p ?? '').trim()).filter(Boolean);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAuth(req)) return unauthorized();
  const { id } = await params;
  const protocolo = db.select().from(protocolos).where(eq(protocolos.id, Number(id))).get();
  if (!protocolo) return Response.json({ error: 'Protocolo no encontrado' }, { status: 404 });
  return Response.json(protocolo);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  const { id } = await params;
  try {
    const { titulo, categoria, descripcion, pasos, prioridad, activo, tipo, contenido } = await req.json();
    if (!titulo?.trim()) return Response.json({ error: 'Falta el título del protocolo' }, { status: 400 });

    const actualizado = db.update(protocolos)
      .set({
        titulo: titulo.trim(),
        categoria: categoria || 'Operativo',
        descripcion: descripcion || null,
        tipo: tipo === 'documento' ? 'documento' : 'lista',
        pasos: normalizarPasos(pasos),
        contenido: contenido ?? null,
        prioridad: prioridad || 'Media',
        activo: activo === false || activo === 0 ? 0 : 1,
        actualizado_en: new Date().toISOString(),
      })
      .where(eq(protocolos.id, Number(id)))
      .returning()
      .get();
    if (!actualizado) return Response.json({ error: 'Protocolo no encontrado' }, { status: 404 });
    return Response.json(actualizado);
  } catch {
    return Response.json({ error: 'Error al actualizar el protocolo' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  const { id } = await params;
  db.delete(protocolos).where(eq(protocolos.id, Number(id))).run();
  return Response.json({ ok: true });
}
