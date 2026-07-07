import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { movimientos_financieros, movimiento_evidencias } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { puedeVerLibro, puedeEditarLibro } from '@/src/lib/librosAcceso';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const { id } = await params;
  const movId = Number(id);
  const mov = db.select().from(movimientos_financieros).where(eq(movimientos_financieros.id, movId)).get();
  if (!mov) return Response.json({ error: 'Movimiento no encontrado' }, { status: 404 });
  if (!puedeVerLibro(authUser, mov.libro)) return forbidden();

  const docs = db.select().from(movimiento_evidencias)
    .where(eq(movimiento_evidencias.movimiento_id, movId))
    .orderBy(desc(movimiento_evidencias.fecha_subida))
    .all();

  return Response.json(docs);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const { id } = await params;
  const movId = Number(id);
  const mov = db.select().from(movimientos_financieros).where(eq(movimientos_financieros.id, movId)).get();
  if (!mov) return Response.json({ error: 'Movimiento no encontrado' }, { status: 404 });
  if (!puedeEditarLibro(authUser, mov.libro)) return forbidden();

  try {
    const formData = await req.formData();
    const files = formData.getAll('file') as File[];
    if (!files.length) return Response.json({ error: 'Archivo requerido' }, { status: 400 });

    const uploadsDir = path.join(process.cwd(), 'uploads', 'finanzas');
    await fs.mkdir(uploadsDir, { recursive: true });

    const nuevos = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const safeFileName = `${movId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      await fs.writeFile(path.join(uploadsDir, safeFileName), buffer);

      nuevos.push(db.insert(movimiento_evidencias).values({
        movimiento_id: movId,
        nombre_documento: file.name,
        nombre_archivo: safeFileName,
        tipo_mimetype: file.type || 'application/octet-stream',
        subido_por: authUser.id,
      }).returning().get());
    }

    return Response.json(nuevos, { status: 201 });
  } catch (err: any) {
    console.error(err);
    return Response.json({ error: 'Error al subir la evidencia: ' + err.message }, { status: 500 });
  }
}
