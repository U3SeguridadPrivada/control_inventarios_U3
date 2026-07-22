import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { plantillaCorreo, firmaHtml, firmaDatosDe, logoCorreoUrl } from '@/src/lib/mailer';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Devuelve el HTML COMPLETO del correo tal como se enviará (logo U3 en el
// encabezado, cuerpo, firma personalizada del usuario y footer), para mostrarlo
// como vista previa en el compositor. Usa la MISMA plantilla y el MISMO logo
// (logoCorreoUrl) que el envío real de mailer.ts, para que lo que se ve sea
// exactamente lo que llega.
export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const u = db.select().from(users).where(eq(users.id, authUser.id)).get();
  if (!u) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const es_html = !!body.es_html;
  const cuerpo = String(body.cuerpo || '');
  const conFirma = body.conFirma !== false;

  const cuerpoHtml = es_html ? cuerpo : `<p>${escapeHtml(cuerpo).replace(/\n/g, '<br>')}</p>`;
  const firma = conFirma ? firmaHtml(firmaDatosDe(u)) : undefined;
  const html = plantillaCorreo(cuerpoHtml, firma, logoCorreoUrl());

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
