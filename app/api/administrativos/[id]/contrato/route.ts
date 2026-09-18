import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { personal_administrativo, administrativo_documentos, administrativo_bitacora } from '@/src/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { extraerDatosDeAdministrativo } from '@/src/lib/generadorContrato';
import { construirContratoParaGuardia } from '@/src/lib/contratoPlantilla';
import { CONTRATO_TEMPLATE_VERSION } from '@/src/lib/contratoHtml';
import fs from 'fs';
import path from 'path';

function invalidarPdfCacheado(adminId: number) {
  try {
    const cachedFilePath = path.join(process.cwd(), 'uploads', 'administrativos', `${adminId}-contrato-${CONTRATO_TEMPLATE_VERSION}.pdf`);
    if (fs.existsSync(cachedFilePath)) fs.unlinkSync(cachedFilePath);
  } catch (e) {
    console.warn('No se pudo invalidar el contrato PDF cacheado:', e);
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAuth(req)) return unauthorized();

  const { id } = await params;
  const adminId = Number(id);

  const admin = db.select().from(personal_administrativo).where(eq(personal_administrativo.id, adminId)).get();
  if (!admin) return Response.json({ error: 'Personal administrativo no encontrado' }, { status: 404 });

  // Buscar si ya existe el Contrato de Trabajo en su expediente digital (administrativo_documentos)
  const docExistente = db.select().from(administrativo_documentos)
    .where(
      and(
        eq(administrativo_documentos.administrativo_id, adminId),
        eq(administrativo_documentos.nombre_documento, 'Contrato de Trabajo')
      )
    )
    .get();

  let contenido = null;

  if (docExistente?.contenido_json) {
    try {
      contenido = JSON.parse(docExistente.contenido_json);
    } catch (e) {
      console.error('Error parseando contenido_json de contrato administrativo:', e);
    }
  }

  // Si no existe aún o no tenía contenido_json, generarlo automáticamente a partir de sus datos
  if (!contenido) {
    const datosAdmin = extraerDatosDeAdministrativo(admin);
    contenido = construirContratoParaGuardia(datosAdmin);

    if (docExistente) {
      db.update(administrativo_documentos)
        .set({
          contenido_json: JSON.stringify(contenido),
          fecha_subida: sql`(datetime('now'))`,
        })
        .where(eq(administrativo_documentos.id, docExistente.id))
        .run();
    } else {
      const nuevoDoc = db.insert(administrativo_documentos)
        .values({
          administrativo_id: adminId,
          nombre_documento: 'Contrato de Trabajo',
          nombre_archivo: `${adminId}-contrato-laboral.json`,
          tipo_mimetype: 'application/json',
          contenido_json: JSON.stringify(contenido),
        })
        .returning()
        .get();

      // Registro en bitácora
      try {
        db.insert(administrativo_bitacora).values({
          administrativo_id: adminId,
          tipo: 'sistema',
          asunto: 'Contrato generado en expediente',
          mensaje: `Se generó el Contrato Individual de Trabajo oficial dentro del expediente digital.`,
          usuario: 'Sistema U3',
        }).run();
      } catch (errBitacora) {
        console.warn('Error al registrar en bitácora:', errBitacora);
      }
    }
  }

  return Response.json({
    id: docExistente?.id || 1,
    administrativo_id: adminId,
    titulo: `Contrato Laboral - ${admin.nombre}`,
    categoria: 'Recursos Humanos',
    descripcion: `Contrato individual de trabajo resguardado en el expediente digital de ${admin.nombre}.`,
    tipo: 'documento',
    prioridad: 'Alta',
    activo: 1,
    contenido,
    actualizado_en: docExistente?.fecha_subida || new Date().toISOString(),
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  const { id } = await params;
  const adminId = Number(id);

  const admin = db.select().from(personal_administrativo).where(eq(personal_administrativo.id, adminId)).get();
  if (!admin) return Response.json({ error: 'Personal administrativo no encontrado' }, { status: 404 });

  try {
    const body = await req.json();
    const { contenido } = body;

    if (!contenido) {
      return Response.json({ error: 'Falta el contenido del contrato' }, { status: 400 });
    }

    const contenidoStr = JSON.stringify(contenido);

    const docExistente = db.select().from(administrativo_documentos)
      .where(
        and(
          eq(administrativo_documentos.administrativo_id, adminId),
          eq(administrativo_documentos.nombre_documento, 'Contrato de Trabajo')
        )
      )
      .get();

    let docId = docExistente?.id;

    if (docExistente) {
      db.update(administrativo_documentos)
        .set({
          contenido_json: contenidoStr,
          fecha_subida: sql`(datetime('now'))`,
        })
        .where(eq(administrativo_documentos.id, docExistente.id))
        .run();
    } else {
      const nuevo = db.insert(administrativo_documentos)
        .values({
          administrativo_id: adminId,
          nombre_documento: 'Contrato de Trabajo',
          nombre_archivo: `${adminId}-contrato-laboral.json`,
          tipo_mimetype: 'application/json',
          contenido_json: contenidoStr,
        })
        .returning()
        .get();
      docId = nuevo.id;
    }

    invalidarPdfCacheado(adminId);

    // Registrar en bitácora
    try {
      db.insert(administrativo_bitacora).values({
        administrativo_id: adminId,
        tipo: 'sistema',
        asunto: 'Contrato actualizado en expediente',
        mensaje: `El contrato laboral fue editado y guardado en el expediente digital por ${authUser.username || 'usuario'}.`,
        usuario: authUser.username || 'Usuario',
      }).run();
    } catch (errBitacora) {
      console.warn('Error al registrar en bitácora:', errBitacora);
    }

    return Response.json({
      ok: true,
      id: docId,
      administrativo_id: adminId,
      titulo: `Contrato Laboral - ${admin.nombre}`,
      categoria: 'Recursos Humanos',
      contenido,
      actualizado_en: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Error guardando contrato en expediente:', err);
    return Response.json({ error: 'Error al guardar contrato: ' + err.message }, { status: 500 });
  }
}
