import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { guardias, guardia_documentos } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { htmlToPdf } from '@/src/lib/pdf';
import { generateContratoHtml, CONTRATO_TEMPLATE_VERSION } from '@/src/lib/contratoHtml';
import { extraerDatosDeGuardia, DATOS_CONTRATO_DEFAULT } from '@/src/lib/generadorContrato';
import { construirContratoParaGuardia } from '@/src/lib/contratoPlantilla';
import { ContenidoDoc } from '@/src/lib/documentoProtocolo';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAuth(req)) return unauthorized();
  const { id } = await params;
  const guardiaId = Number(id);

  const guardia = db.select().from(guardias).where(eq(guardias.id, guardiaId)).get();
  if (!guardia) return Response.json({ error: 'Guardia no encontrado' }, { status: 404 });

  const isInline = req.nextUrl.searchParams.get('inline') === 'true';
  const forceFresh = req.nextUrl.searchParams.get('fresh') === 'true';
  // El nombre incluye la versión de la plantilla: si se edita el diseño del
  // contrato (contratoHtml.ts) y se sube CONTRATO_TEMPLATE_VERSION, esta ruta
  // cambia sola y la caché vieja queda huérfana en vez de servirse.
  const cachedFilePath = path.join(process.cwd(), 'uploads', 'guardias', `${guardiaId}-contrato-${CONTRATO_TEMPLATE_VERSION}.pdf`);

  // Usar el contenido ya guardado (con las ediciones manuales del usuario en
  // el editor de hojas); si el guardia todavía no tiene uno, generarlo desde
  // sus datos tal como lo haría el botón "Generar contrato".
  const docContrato = db.select().from(guardia_documentos)
    .where(
      and(
        eq(guardia_documentos.guardia_id, guardiaId),
        eq(guardia_documentos.nombre_documento, 'Contrato de Trabajo')
      )
    )
    .get();

  // La caché en disco es válida solo si es MÁS NUEVA que el contenido
  // guardado. Antes se dependía de que cada ruta que escribe contenido_json
  // se acordara de borrar el PDF cacheado, y una sola ruta que lo olvidara
  // (como el GET de /contrato la primera vez que autogeneraba y guardaba)
  // dejaba servido para siempre un PDF con datos viejos — como el contrato
  // de un guardia que mostraba el nombre de otro. Comparando fechas, la
  // caché se auto-invalida sin depender de acordarse en cada sitio.
  if (!forceFresh && fs.existsSync(cachedFilePath)) {
    try {
      const stats = fs.statSync(cachedFilePath);
      const fechaContenido = docContrato?.fecha_subida
        ? new Date(docContrato.fecha_subida.replace(' ', 'T') + 'Z').getTime()
        : 0;
      const cacheEsValida = stats.size > 1000 && stats.mtimeMs >= fechaContenido;
      if (cacheEsValida) {
        const cachedBuf = fs.readFileSync(cachedFilePath);
        return new Response(new Uint8Array(cachedBuf), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `${isInline ? 'inline' : 'attachment'}; filename="contrato_${guardia.numero_elemento || guardiaId}.pdf"`,
            'Cache-Control': 'no-store',
          },
        });
      }
    } catch (e) {
      console.warn('No se pudo leer el contrato PDF cacheado, regenerando...', e);
    }
  }

  let contenido: ContenidoDoc | null = null;
  if (docContrato?.contenido_json) {
    try {
      contenido = JSON.parse(docContrato.contenido_json);
    } catch {
      contenido = null;
    }
  }
  if (!contenido) {
    const datos = { ...DATOS_CONTRATO_DEFAULT, ...extraerDatosDeGuardia(guardia) };
    contenido = construirContratoParaGuardia(datos);
  }

  const html = generateContratoHtml(contenido);
  // Sin margen de Puppeteer: la plantilla ya trae su propio relleno por hoja
  // (.hoja { padding: ... }) calcado del tamaño en pantalla. Pasar un margen
  // aquí lo aplicaría dos veces y aplastaría el contenido en una columna más
  // angosta de lo que corresponde.
  const pdfBuffer = await htmlToPdf(html, {
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });

  try {
    const uploadsDir = path.join(process.cwd(), 'uploads', 'guardias');
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(cachedFilePath, Buffer.from(pdfBuffer));
  } catch (e) {
    console.warn('No se pudo guardar el contrato PDF en caché:', e);
  }

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${isInline ? 'inline' : 'attachment'}; filename="contrato_${guardia.numero_elemento || guardiaId}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
