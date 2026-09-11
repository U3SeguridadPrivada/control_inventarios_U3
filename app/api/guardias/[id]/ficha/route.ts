import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { guardias, guardia_documentos } from '@/src/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { htmlToPdf } from '@/src/lib/pdf';
import { generateFichaTecnicaHtml } from '@/src/lib/fichaTecnicaHtml';
import { desglosarDireccion, reconstruirDireccion } from '@/src/lib/fichaTecnicaUtils';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAuth(req)) return unauthorized();
  const { id } = await params;
  const guardiaId = Number(id);

  const guardia = db.select().from(guardias).where(eq(guardias.id, guardiaId)).get();
  if (!guardia) return Response.json({ error: 'Guardia no encontrado' }, { status: 404 });

  let ficha = null;
  if (guardia.ficha_tecnica_json) {
    try {
      ficha = JSON.parse(guardia.ficha_tecnica_json);
      if (!ficha.colonia && !ficha.delegacionMunicipio && ficha.calleNumero && (ficha.calleNumero.includes(';') || /,\s*col/i.test(ficha.calleNumero))) {
        const desglose = desglosarDireccion(ficha.calleNumero);
        ficha.calleNumero = desglose.calleNumero;
        ficha.colonia = desglose.colonia;
        ficha.delegacionMunicipio = desglose.delegacionMunicipio;
        ficha.estado = desglose.estado;
        ficha.cp = desglose.cp;
      }
    } catch {
      ficha = null;
    }
  }

  const direccionDesglosada = desglosarDireccion(guardia.direccion);

  return Response.json({
    guardia,
    ficha,
    direccionDesglosada,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return Response.json({ error: 'Sin permisos' }, { status: 403 });

  const { id } = await params;
  const guardiaId = Number(id);

  try {
    const body = await req.json();
    const ficha = body.ficha || body;

    const updateFields: Record<string, any> = {
      ficha_tecnica_json: JSON.stringify(ficha),
    };

    // Si el nombre, teléfono o dirección se modificaron en la ficha, mantener sincronizada la tabla guardias
    if (ficha.nombre && typeof ficha.nombre === 'string' && ficha.nombre.trim()) {
      updateFields.nombre = ficha.nombre.trim();
    }
    if (ficha.celular && typeof ficha.celular === 'string' && ficha.celular.trim()) {
      updateFields.telefono = ficha.celular.trim();
    }
    if (ficha.calleNumero && typeof ficha.calleNumero === 'string' && ficha.calleNumero.trim()) {
      updateFields.direccion = reconstruirDireccion({
        calleNumero: ficha.calleNumero,
        colonia: ficha.colonia,
        delegacionMunicipio: ficha.delegacionMunicipio,
        estado: ficha.estado,
        cp: ficha.cp,
      });
    }

    const updated = db
      .update(guardias)
      .set(updateFields)
      .where(eq(guardias.id, guardiaId))
      .returning()
      .get();

    if (!updated) {
      return Response.json({ error: 'Guardia no encontrado' }, { status: 404 });
    }

    // Generar archivo PDF oficial y sincronizarlo en el expediente digital (guardia_documentos)
    try {
      const html = generateFichaTecnicaHtml(ficha);
      const pdfBuffer = await htmlToPdf(html, {
        margin: { top: '6mm', bottom: '6mm', left: '10mm', right: '10mm' }
      });

      const uploadsDir = path.join(process.cwd(), 'uploads', 'guardias');
      await fs.mkdir(uploadsDir, { recursive: true });
      const safeFileName = `${guardiaId}-ficha-tecnica.pdf`;
      await fs.writeFile(path.join(uploadsDir, safeFileName), Buffer.from(pdfBuffer));

      const existingDoc = db.select().from(guardia_documentos)
        .where(
          and(
            eq(guardia_documentos.guardia_id, guardiaId),
            eq(guardia_documentos.nombre_documento, 'Ficha Técnica Oficial')
          )
        )
        .get();

      if (existingDoc) {
        db.update(guardia_documentos)
          .set({
            nombre_archivo: safeFileName,
            tipo_mimetype: 'application/pdf',
            fecha_subida: sql`(datetime('now'))`,
          })
          .where(eq(guardia_documentos.id, existingDoc.id))
          .run();
      } else {
        db.insert(guardia_documentos)
          .values({
            guardia_id: guardiaId,
            nombre_documento: 'Ficha Técnica Oficial',
            nombre_archivo: safeFileName,
            tipo_mimetype: 'application/pdf',
          })
          .run();
      }
    } catch (pdfErr) {
      console.warn('Advertencia al generar PDF automático de la ficha:', pdfErr);
    }

    return Response.json({ ok: true, guardia: updated, ficha });
  } catch (err: any) {
    return Response.json({ error: 'Error al guardar la ficha técnica: ' + err.message }, { status: 500 });
  }
}
