import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { guardias, guardia_documentos, guardia_bitacora } from '@/src/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { extraerDatosDeGuardia } from '@/src/lib/generadorContrato';
import { construirContratoParaGuardia } from '@/src/lib/contratoPlantilla';
import { CONTRATO_TEMPLATE_VERSION } from '@/src/lib/contratoHtml';
import fs from 'fs';
import path from 'path';

/** El PDF del contrato queda cacheado en disco; si el contenido cambia hay
 *  que tirar esa caché para que el próximo "ver"/"descargar" regenere el
 *  PDF con los datos nuevos en vez de servir la versión vieja. */
function invalidarPdfCacheado(guardiaId: number) {
  try {
    const cachedFilePath = path.join(process.cwd(), 'uploads', 'guardias', `${guardiaId}-contrato-${CONTRATO_TEMPLATE_VERSION}.pdf`);
    if (fs.existsSync(cachedFilePath)) fs.unlinkSync(cachedFilePath);
  } catch (e) {
    console.warn('No se pudo invalidar el contrato PDF cacheado:', e);
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAuth(req)) return unauthorized();

  const { id } = await params;
  const guardiaId = Number(id);

  const guardia = db.select().from(guardias).where(eq(guardias.id, guardiaId)).get();
  if (!guardia) return Response.json({ error: 'Guardia no encontrado' }, { status: 404 });

  // Buscar si ya existe el Contrato de Trabajo en su expediente digital (guardia_documentos)
  const docExistente = db.select().from(guardia_documentos)
    .where(
      and(
        eq(guardia_documentos.guardia_id, guardiaId),
        eq(guardia_documentos.nombre_documento, 'Contrato de Trabajo')
      )
    )
    .get();

  let contenido = null;

  if (docExistente?.contenido_json) {
    try {
      contenido = JSON.parse(docExistente.contenido_json);
    } catch (e) {
      console.error('Error parseando contenido_json de contrato existente:', e);
    }
  }

  // Si no existe aún o no tenía contenido_json, generarlo automáticamente a partir de sus datos
  if (!contenido) {
    const datosGuardia = extraerDatosDeGuardia(guardia);
    contenido = construirContratoParaGuardia(datosGuardia);

    if (docExistente) {
      db.update(guardia_documentos)
        .set({
          contenido_json: JSON.stringify(contenido),
          fecha_subida: sql`(datetime('now'))`,
        })
        .where(eq(guardia_documentos.id, docExistente.id))
        .run();
    } else {
      const nuevoDoc = db.insert(guardia_documentos)
        .values({
          guardia_id: guardiaId,
          nombre_documento: 'Contrato de Trabajo',
          nombre_archivo: `${guardiaId}-contrato-laboral.json`,
          tipo_mimetype: 'application/json',
          contenido_json: JSON.stringify(contenido),
        })
        .returning()
        .get();

      // Registro en bitácora del expediente
      try {
        db.insert(guardia_bitacora).values({
          guardia_id: guardiaId,
          tipo: 'sistema',
          asunto: 'Contrato generado en expediente',
          mensaje: `Se generó el Contrato Individual de Trabajo oficial dentro del expediente digital del guardia.`,
          usuario: 'Sistema U3',
        }).run();
      } catch (errBitacora) {
        console.warn('Error al registrar en bitácora:', errBitacora);
      }
    }
  }

  return Response.json({
    id: docExistente?.id || 1,
    guardia_id: guardiaId,
    titulo: `Contrato Laboral - ${guardia.nombre}`,
    categoria: 'Recursos Humanos',
    descripcion: `Contrato individual de trabajo (periodo de prueba) resguardado en el expediente digital de ${guardia.nombre}.`,
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
  const guardiaId = Number(id);

  const guardia = db.select().from(guardias).where(eq(guardias.id, guardiaId)).get();
  if (!guardia) return Response.json({ error: 'Guardia no encontrado' }, { status: 404 });

  try {
    const body = await req.json();
    const { contenido } = body;

    if (!contenido) {
      return Response.json({ error: 'Falta el contenido del contrato' }, { status: 400 });
    }

    const contenidoStr = JSON.stringify(contenido);

    const docExistente = db.select().from(guardia_documentos)
      .where(
        and(
          eq(guardia_documentos.guardia_id, guardiaId),
          eq(guardia_documentos.nombre_documento, 'Contrato de Trabajo')
        )
      )
      .get();

    let docId = docExistente?.id;

    if (docExistente) {
      db.update(guardia_documentos)
        .set({
          contenido_json: contenidoStr,
          fecha_subida: sql`(datetime('now'))`,
        })
        .where(eq(guardia_documentos.id, docExistente.id))
        .run();
    } else {
      const nuevo = db.insert(guardia_documentos)
        .values({
          guardia_id: guardiaId,
          nombre_documento: 'Contrato de Trabajo',
          nombre_archivo: `${guardiaId}-contrato-laboral.json`,
          tipo_mimetype: 'application/json',
          contenido_json: contenidoStr,
        })
        .returning()
        .get();
      docId = nuevo.id;
    }

    invalidarPdfCacheado(guardiaId);

    // Registrar en bitácora del guardia
    try {
      db.insert(guardia_bitacora).values({
        guardia_id: guardiaId,
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
      guardia_id: guardiaId,
      titulo: `Contrato Laboral - ${guardia.nombre}`,
      categoria: 'Recursos Humanos',
      contenido,
      actualizado_en: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Error guardando contrato en expediente:', err);
    return Response.json({ error: 'Error al guardar contrato: ' + err.message }, { status: 500 });
  }
}
