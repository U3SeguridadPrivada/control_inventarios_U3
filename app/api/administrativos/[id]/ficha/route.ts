import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { personal_administrativo, administrativo_documentos } from '@/src/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { htmlToPdf } from '@/src/lib/pdf';
import { generateFichaAdministrativaHtml } from '@/src/lib/fichaAdministrativaHtml';
import { desglosarDireccion, reconstruirDireccion } from '@/src/lib/fichaTecnicaUtils';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAuth(req)) return unauthorized();
  const { id } = await params;
  const adminId = Number(id);

  const empleado = db.select().from(personal_administrativo).where(eq(personal_administrativo.id, adminId)).get();
  if (!empleado) return Response.json({ error: 'Personal no encontrado' }, { status: 404 });

  let ficha = null;
  if (empleado.ficha_tecnica_json) {
    try {
      ficha = JSON.parse(empleado.ficha_tecnica_json);
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

  const direccionDesglosada = desglosarDireccion(empleado.direccion);

  return Response.json({
    administrativo: empleado,
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
  const adminId = Number(id);

  try {
    const body = await req.json();
    const ficha = body.ficha || body;

    const updateFields: Record<string, any> = {
      ficha_tecnica_json: JSON.stringify(ficha),
    };

    if (ficha.nombre && typeof ficha.nombre === 'string' && ficha.nombre.trim()) {
      updateFields.nombre = ficha.nombre.trim();
    }
    if (ficha.puesto && typeof ficha.puesto === 'string' && ficha.puesto.trim()) {
      updateFields.puesto = ficha.puesto.trim();
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
      .update(personal_administrativo)
      .set(updateFields)
      .where(eq(personal_administrativo.id, adminId))
      .returning()
      .get();

    if (!updated) {
      return Response.json({ error: 'Personal no encontrado' }, { status: 404 });
    }

    // Generar PDF y almacenarlo en expediente digital
    try {
      const html = generateFichaAdministrativaHtml(ficha);
      const pdfBuffer = await htmlToPdf(html, {
        margin: { top: '6mm', bottom: '6mm', left: '10mm', right: '10mm' }
      });

      const uploadsDir = path.join(process.cwd(), 'uploads', 'administrativos');
      await fs.mkdir(uploadsDir, { recursive: true });
      const safeFileName = `${adminId}-ficha-tecnica.pdf`;
      await fs.writeFile(path.join(uploadsDir, safeFileName), Buffer.from(pdfBuffer));

      const existingDoc = db.select().from(administrativo_documentos)
        .where(
          and(
            eq(administrativo_documentos.administrativo_id, adminId),
            eq(administrativo_documentos.nombre_documento, 'Ficha Técnica Oficial')
          )
        )
        .get();

      if (existingDoc) {
        db.update(administrativo_documentos)
          .set({
            nombre_archivo: safeFileName,
            tipo_mimetype: 'application/pdf',
            fecha_subida: sql`(datetime('now'))`,
          })
          .where(eq(administrativo_documentos.id, existingDoc.id))
          .run();
      } else {
        db.insert(administrativo_documentos)
          .values({
            administrativo_id: adminId,
            nombre_documento: 'Ficha Técnica Oficial',
            nombre_archivo: safeFileName,
            tipo_mimetype: 'application/pdf',
          })
          .run();
      }
    } catch (pdfErr) {
      console.warn('Advertencia al generar PDF automático de la ficha administrativa:', pdfErr);
    }

    return Response.json({ ok: true, administrativo: updated, ficha });
  } catch (err: any) {
    return Response.json({ error: 'Error al actualizar ficha: ' + err.message }, { status: 500 });
  }
}
