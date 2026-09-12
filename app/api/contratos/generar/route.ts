import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/db';
import { guardias, guardia_documentos, guardia_bitacora } from '@/src/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { extraerDatosDeGuardia, generarContenidoContrato, DatosContrato, DATOS_CONTRATO_DEFAULT } from '@/src/lib/generadorContrato';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { guardia_id, datosPersonalizados = {} } = body;

    let datosBase: Partial<DatosContrato> = {};

    let g = null;
    if (guardia_id) {
      g = db.select().from(guardias).where(eq(guardias.id, Number(guardia_id))).get();
      if (g) {
        datosBase = extraerDatosDeGuardia(g);
      }
    }

    const datosFinales: DatosContrato = {
      ...DATOS_CONTRATO_DEFAULT,
      ...datosBase,
      ...datosPersonalizados,
    };

    // Aseguramos mayúsculas institucionales
    datosFinales.nombreTrabajador = datosFinales.nombreTrabajador.toUpperCase().trim();
    datosFinales.puesto = datosFinales.puesto.toUpperCase().trim();
    if (datosFinales.beneficiarioNombre) {
      datosFinales.beneficiarioNombre = datosFinales.beneficiarioNombre.toUpperCase().trim();
    }

    const contenido = generarContenidoContrato(datosFinales);
    const contenidoStr = JSON.stringify(contenido);

    let redirectUrl = '/guardias';

    if (guardia_id) {
      const gId = Number(guardia_id);
      const existingDoc = db.select().from(guardia_documentos)
        .where(
          and(
            eq(guardia_documentos.guardia_id, gId),
            eq(guardia_documentos.nombre_documento, 'Contrato de Trabajo')
          )
        )
        .get();

      if (existingDoc) {
        db.update(guardia_documentos)
          .set({
            contenido_json: contenidoStr,
            fecha_subida: sql`(datetime('now'))`,
          })
          .where(eq(guardia_documentos.id, existingDoc.id))
          .run();
      } else {
        db.insert(guardia_documentos)
          .values({
            guardia_id: gId,
            nombre_documento: 'Contrato de Trabajo',
            nombre_archivo: `${gId}-contrato-laboral.json`,
            tipo_mimetype: 'application/json',
            contenido_json: contenidoStr,
          })
          .run();
      }

      try {
        db.insert(guardia_bitacora).values({
          guardia_id: gId,
          tipo: 'sistema',
          asunto: 'Contrato generado en expediente',
          mensaje: `Se generó automáticamente el Contrato Individual de Trabajo oficial dentro del expediente digital.`,
          usuario: 'Sistema U3',
        }).run();
      } catch (bitErr) {
        console.warn('No se pudo registrar en bitácora:', bitErr);
      }

      redirectUrl = `/guardias/${gId}/contrato`;
    }

    return NextResponse.json({
      ok: true,
      titulo: `Contrato Laboral - ${datosFinales.nombreTrabajador}`,
      url: redirectUrl,
    });
  } catch (error: any) {
    console.error('Error generando contrato:', error);
    return NextResponse.json({ error: error.message || 'Error al generar contrato' }, { status: 500 });
  }
}

