import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { personal_administrativo, administrativo_documentos } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { htmlToPdf } from '@/src/lib/pdf';
import { generateContratoHtml, CONTRATO_TEMPLATE_VERSION } from '@/src/lib/contratoHtml';
import { extraerDatosDeAdministrativo } from '@/src/lib/generadorContrato';
import { construirContratoParaGuardia } from '@/src/lib/contratoPlantilla';
import { ContenidoDoc } from '@/src/lib/documentoProtocolo';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAuth(req)) return unauthorized();
  const { id } = await params;
  const adminId = Number(id);

  const admin = db.select().from(personal_administrativo).where(eq(personal_administrativo.id, adminId)).get();
  if (!admin) return Response.json({ error: 'Personal administrativo no encontrado' }, { status: 404 });

  const isInline = req.nextUrl.searchParams.get('inline') === 'true';
  const forceFresh = req.nextUrl.searchParams.get('fresh') === 'true';
  const cachedFilePath = path.join(process.cwd(), 'uploads', 'administrativos', `${adminId}-contrato-${CONTRATO_TEMPLATE_VERSION}.pdf`);

  const docContrato = db.select().from(administrativo_documentos)
    .where(
      and(
        eq(administrativo_documentos.administrativo_id, adminId),
        eq(administrativo_documentos.nombre_documento, 'Contrato de Trabajo')
      )
    )
    .get();

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
            'Content-Disposition': `${isInline ? 'inline' : 'attachment'}; filename="contrato_${admin.numero_empleado || adminId}.pdf"`,
            'Cache-Control': 'no-store',
          },
        });
      }
    } catch (e) {
      console.warn('Error leyendo caché de contrato:', e);
    }
  }

  let contenido: ContenidoDoc | null = null;
  if (docContrato?.contenido_json) {
    try {
      contenido = JSON.parse(docContrato.contenido_json);
    } catch (e) {
      console.warn('Error parseando contenido_json de contrato:', e);
    }
  }

  if (!contenido) {
    const datosAdmin = extraerDatosDeAdministrativo(admin);
    contenido = construirContratoParaGuardia(datosAdmin);
  }

  try {
    const html = generateContratoHtml(contenido);
    const pdfBuffer = await htmlToPdf(html, {
      margin: { top: '0', bottom: '0', left: '0', right: '0' }
    });

    try {
      const uploadsDir = path.join(process.cwd(), 'uploads', 'administrativos');
      fs.mkdirSync(uploadsDir, { recursive: true });
      fs.writeFileSync(cachedFilePath, Buffer.from(pdfBuffer));
    } catch (e) {
      console.warn('No se pudo guardar PDF del contrato en caché:', e);
    }

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${isInline ? 'inline' : 'attachment'}; filename="contrato_${admin.numero_empleado || adminId}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    console.error('Error generando contrato PDF:', err);
    return Response.json({ error: 'Error al generar PDF del contrato: ' + err.message }, { status: 500 });
  }
}
