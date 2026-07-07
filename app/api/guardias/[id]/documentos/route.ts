import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { guardias, guardia_documentos } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAuth(req)) return unauthorized();

  const { id } = await params;
  const guardiaId = Number(id);

  // Check if guard exists
  const guardia = db.select().from(guardias).where(eq(guardias.id, guardiaId)).get();
  if (!guardia) return Response.json({ error: 'Guardia no encontrado' }, { status: 404 });

  const docs = db.select().from(guardia_documentos)
    .where(eq(guardia_documentos.guardia_id, guardiaId))
    .orderBy(desc(guardia_documentos.fecha_subida))
    .all();

  return Response.json(docs);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return Response.json({ error: 'Sin permisos' }, { status: 403 });

  const { id } = await params;
  const guardiaId = Number(id);

  // Check if guard exists
  const guardia = db.select().from(guardias).where(eq(guardias.id, guardiaId)).get();
  if (!guardia) return Response.json({ error: 'Guardia no encontrado' }, { status: 404 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const nombre_documento = formData.get('nombre_documento') as string;

    if (!file || !nombre_documento) {
      return Response.json({ error: 'Archivo y nombre de documento requeridos' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Save to uploads/guardias/
    const uploadsDir = path.join(process.cwd(), 'uploads', 'guardias');
    await fs.mkdir(uploadsDir, { recursive: true });

    // Create a safe, unique file name
    const timestamp = Date.now();
    const safeFileName = `${guardiaId}-${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = path.join(uploadsDir, safeFileName);
    await fs.writeFile(filePath, buffer);

    // Insert record
    const newDoc = db.insert(guardia_documentos).values({
      guardia_id: guardiaId,
      nombre_documento,
      nombre_archivo: safeFileName,
      tipo_mimetype: file.type || 'application/octet-stream',
    }).returning().get();

    return Response.json(newDoc, { status: 201 });
  } catch (err: any) {
    console.error(err);
    return Response.json({ error: 'Error al subir el documento: ' + err.message }, { status: 500 });
  }
}
