import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { movimientos_financieros, movimiento_evidencias } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { puedeVerLibro, puedeEditarLibro } from '@/src/lib/librosAcceso';
import { promises as fs } from 'fs';
import path from 'path';

function getEvidencia(movId: number, evId: number) {
  const mov = db.select().from(movimientos_financieros).where(eq(movimientos_financieros.id, movId)).get();
  if (!mov) return null;
  const doc = db.select().from(movimiento_evidencias)
    .where(and(eq(movimiento_evidencias.id, evId), eq(movimiento_evidencias.movimiento_id, movId)))
    .get();
  return doc ? { mov, doc } : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; evId: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const { id, evId } = await params;
  const res = getEvidencia(Number(id), Number(evId));
  if (!res) return Response.json({ error: 'Evidencia no encontrada' }, { status: 404 });
  if (!puedeVerLibro(authUser, res.mov.libro)) return forbidden();

  const filePath = path.join(process.cwd(), 'uploads', 'finanzas', res.doc.nombre_archivo);
  try {
    const fileBuffer = await fs.readFile(filePath);
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': res.doc.tipo_mimetype || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${encodeURIComponent(res.doc.nombre_documento)}"`,
      },
    });
  } catch {
    return Response.json({ error: 'Archivo físico no encontrado en el servidor' }, { status: 404 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; evId: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const { id, evId } = await params;
  const res = getEvidencia(Number(id), Number(evId));
  if (!res) return Response.json({ error: 'Evidencia no encontrada' }, { status: 404 });
  if (!puedeEditarLibro(authUser, res.mov.libro)) return forbidden();

  try {
    await fs.unlink(path.join(process.cwd(), 'uploads', 'finanzas', res.doc.nombre_archivo));
  } catch {
    // El archivo físico ya no existe
  }
  db.delete(movimiento_evidencias).where(eq(movimiento_evidencias.id, res.doc.id)).run();
  return Response.json({ ok: true });
}
