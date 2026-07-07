import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { guardia_documentos } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  if (!verifyAuth(req)) return unauthorized();

  const { id, docId } = await params;
  const guardiaId = Number(id);
  const documentId = Number(docId);

  const doc = db.select().from(guardia_documentos)
    .where(
      and(
        eq(guardia_documentos.id, documentId),
        eq(guardia_documentos.guardia_id, guardiaId)
      )
    )
    .get();

  if (!doc) {
    return Response.json({ error: 'Documento no encontrado' }, { status: 404 });
  }

  const filePath = path.join(process.cwd(), 'uploads', 'guardias', doc.nombre_archivo);

  try {
    const fileBuffer = await fs.readFile(filePath);
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': doc.tipo_mimetype || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${encodeURIComponent(doc.nombre_documento)}"`
      }
    });
  } catch (err) {
    return Response.json({ error: 'Archivo físico no encontrado en el servidor' }, { status: 404 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return Response.json({ error: 'Sin permisos' }, { status: 403 });

  const { id, docId } = await params;
  const guardiaId = Number(id);
  const documentId = Number(docId);

  const doc = db.select().from(guardia_documentos)
    .where(
      and(
        eq(guardia_documentos.id, documentId),
        eq(guardia_documentos.guardia_id, guardiaId)
      )
    )
    .get();

  if (!doc) {
    return Response.json({ error: 'Documento no encontrado' }, { status: 404 });
  }

  const filePath = path.join(process.cwd(), 'uploads', 'guardias', doc.nombre_archivo);

  // Delete from filesystem
  try {
    await fs.unlink(filePath);
  } catch (err) {
    console.error('File already deleted or missing from filesystem:', err);
  }

  // Delete from database
  db.delete(guardia_documentos)
    .where(eq(guardia_documentos.id, documentId))
    .run();

  return Response.json({ success: true });
}
