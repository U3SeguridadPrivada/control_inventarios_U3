import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { protocolos } from '@/src/db/schema';
import { desc } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

/** Descarta pasos vacíos y recorta espacios: la lista llega del formulario dinámico. */
function normalizarPasos(pasos: unknown): string[] {
  if (!Array.isArray(pasos)) return [];
  return pasos.map((p) => String(p ?? '').trim()).filter(Boolean);
}

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();
  return Response.json(db.select().from(protocolos).orderBy(desc(protocolos.id)).all());
}

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  try {
    const { titulo, categoria, descripcion, pasos, prioridad, activo, tipo, contenido } = await req.json();
    if (!titulo?.trim()) return Response.json({ error: 'Falta el título del protocolo' }, { status: 400 });

    const nuevo = db.insert(protocolos).values({
      titulo: titulo.trim(),
      categoria: categoria || 'Operativo',
      descripcion: descripcion || null,
      tipo: tipo === 'documento' ? 'documento' : 'lista',
      pasos: normalizarPasos(pasos),
      contenido: contenido ?? null,
      prioridad: prioridad || 'Media',
      activo: activo === false || activo === 0 ? 0 : 1,
      creado_por: authUser.id,
      actualizado_en: new Date().toISOString(),
    }).returning().get();
    return Response.json(nuevo, { status: 201 });
  } catch {
    return Response.json({ error: 'Error al crear el protocolo' }, { status: 500 });
  }
}
