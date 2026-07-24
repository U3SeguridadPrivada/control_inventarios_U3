import { NextRequest } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { db } from '@/src/db';
import { candidatos, vacantes } from '@/src/db/schema';
import { desc, eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { htmlToPdf } from '@/src/lib/pdf';
import {
  buildReporteReclutamientoHtml,
  buildReporteHeaderTemplate,
  buildReporteFooterTemplate,
} from '@/src/lib/reporteReclutamientoTemplate';

async function getLogoDataUri(): Promise<string> {
  const buf = await readFile(path.join(process.cwd(), 'public', 'LOGO_PDFS.png'));
  return `data:image/png;base64,${buf.toString('base64')}`;
}

export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const candidatosRows = db.select({
    nombre: candidatos.nombre,
    telefono: candidatos.telefono,
    ciudad: candidatos.ciudad,
    edad: candidatos.edad,
    vacante_puesto: vacantes.puesto,
    etapa: candidatos.etapa,
    fecha_entrevista: candidatos.fecha_entrevista,
    origen: candidatos.origen,
    created_at: candidatos.created_at,
  })
    .from(candidatos)
    .leftJoin(vacantes, eq(candidatos.vacante_id, vacantes.id))
    .orderBy(desc(candidatos.id))
    .all();

  const vacantesRows = db.select({
    puesto: vacantes.puesto,
    ubicacion: vacantes.ubicacion,
    turno: vacantes.turno,
    sueldo: vacantes.sueldo,
    activa: vacantes.activa,
  }).from(vacantes).orderBy(desc(vacantes.activa), vacantes.puesto).all();

  const logoSrc = await getLogoDataUri();
  const html = buildReporteReclutamientoHtml({
    candidatos: candidatosRows,
    vacantes: vacantesRows,
    generadoPor: authUser.username ?? '—',
    fecha: new Date().toISOString(),
  }, logoSrc, { repeatingHeaderFooter: true });

  const pdfBuffer = await htmlToPdf(html, {
    margin: { top: '20mm', bottom: '16mm', left: '14mm', right: '14mm' },
    headerTemplate: buildReporteHeaderTemplate(logoSrc),
    footerTemplate: buildReporteFooterTemplate(logoSrc),
  });

  const hoy = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=informe_reclutamiento_${hoy}.pdf`,
    },
  });
}
