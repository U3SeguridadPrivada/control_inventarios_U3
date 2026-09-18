import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { personal_administrativo, administrativo_documentos } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAuth(req)) return unauthorized();

  const { id } = await params;
  const adminId = Number(id);

  const persona = db.select().from(personal_administrativo).where(eq(personal_administrativo.id, adminId)).get();
  if (!persona) return Response.json({ error: 'Personal no encontrado' }, { status: 404 });

  const docs = db.select().from(administrativo_documentos)
    .where(eq(administrativo_documentos.administrativo_id, adminId))
    .orderBy(desc(administrativo_documentos.fecha_subida))
    .all();

  return Response.json(docs);
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
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const nombre_documento = formData.get('nombre_documento') as string;

    if (!file || !nombre_documento) {
      return Response.json({ error: 'Archivo y nombre de documento requeridos' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadsDir = path.join(process.cwd(), 'uploads', 'administrativos');
    await fs.mkdir(uploadsDir, { recursive: true });

    const timestamp = Date.now();
    const safeFileName = `${adminId}-${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = path.join(uploadsDir, safeFileName);
    await fs.writeFile(filePath, buffer);

    const doc = db.insert(administrativo_documentos).values({
      administrativo_id: adminId,
      nombre_documento,
      nombre_archivo: safeFileName,
      tipo_mimetype: file.type || 'application/octet-stream',
    }).returning().get();

    return Response.json(doc, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: 'Error al subir documento: ' + err.message }, { status: 500 });
  }
}
