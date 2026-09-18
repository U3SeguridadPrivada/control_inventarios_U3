import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { personal_administrativo, administrativo_bitacora } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAuth(req)) return unauthorized();
  const { id } = await params;
  const adminId = Number(id);

  const persona = db.select().from(personal_administrativo).where(eq(personal_administrativo.id, adminId)).get();
  if (!persona) return Response.json({ error: 'Personal no encontrado' }, { status: 404 });

  const bitacora = db.select().from(administrativo_bitacora)
    .where(eq(administrativo_bitacora.administrativo_id, adminId))
    .orderBy(desc(administrativo_bitacora.created_at))
    .all();

  return Response.json(bitacora);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return Response.json({ error: 'Sin permisos' }, { status: 403 });

  const { id } = await params;
  const adminId = Number(id);

  const persona = db.select().from(personal_administrativo).where(eq(personal_administrativo.id, adminId)).get();
  if (!persona) return Response.json({ error: 'Personal no encontrado' }, { status: 404 });

  try {
    const { tipo = 'nota', asunto = '', mensaje } = await req.json();
    if (!mensaje || !mensaje.trim()) {
      return Response.json({ error: 'El mensaje no puede estar vacío' }, { status: 400 });
    }

    const nuevaEntrada = db.insert(administrativo_bitacora).values({
      administrativo_id: adminId,
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
