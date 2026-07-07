import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { guardias, entradas, salidas } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { htmlToPdf } from '@/src/lib/pdf';
import { fmtDate } from '@/src/lib/utils';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAuth(req)) return unauthorized();
  const { id } = await params;
  const guardiaId = Number(id);

  const guardia = db.select().from(guardias).where(eq(guardias.id, guardiaId)).get();
  if (!guardia) return Response.json({ error: 'Guardia no encontrado' }, { status: 404 });

  const totalEntradas = db.select().from(entradas).where(eq(entradas.guardia_id, guardiaId)).all().length;
  const totalSalidas = db.select().from(salidas).where(eq(salidas.guardia_id, guardiaId)).all().length;

  const fecha = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });

  const html = `<!doctype html><html lang="es"><head><meta charset="UTF-8"/>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:28px 36px}
  .header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #0f172a;padding-bottom:10px;margin-bottom:14px}
  .header-left h1{font-size:18px;font-weight:900;color:#0f172a;letter-spacing:1px;text-transform:uppercase}.header-left p{font-size:10px;color:#6b7280;margin-top:2px}
  .header-right{text-align:right;font-size:10px;color:#374151}
  .doc-title{text-align:center;font-size:13px;font-weight:800;letter-spacing:2px;text-transform:uppercase;background:#0f172a;color:#fff;padding:5px 0;margin-bottom:18px}
  .ficha{display:flex;gap:24px;border:1px solid #d1d5db;border-radius:8px;padding:20px}
  .foto{width:110px;height:140px;border:2px dashed #94a3b8;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:9px;text-align:center;flex-shrink:0}
  .datos{flex:1}
  .datos h2{font-size:16px;color:#0f172a;margin-bottom:2px}
  .badge{display:inline-block;padding:2px 10px;border-radius:99px;font-size:9px;font-weight:700;background:#dcfce7;color:#166534;margin-bottom:10px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;font-size:10.5px}
  .grid div span{display:block;color:#6b7280;font-size:8.5px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:1px}
  .resumen{margin-top:16px;display:flex;gap:14px}
  .resumen .box{flex:1;border:1px solid #e5e7eb;border-radius:6px;padding:10px;text-align:center}
  .resumen .box strong{display:block;font-size:18px;color:#0f172a}
  .resumen .box span{font-size:9px;color:#6b7280;text-transform:uppercase}
  .pie{margin-top:30px;padding-top:8px;border-top:1px solid #d1d5db;font-size:9px;color:#9ca3af;text-align:center}</style>
  </head><body>
  <div class="header"><div class="header-left"><h1>U3 Seguridad Privada</h1><p>Ficha de Identificación de Personal</p></div>
  <div class="header-right">Generado:<br/>${fecha}</div></div>
  <div class="doc-title">FICHA DE GUARDIA</div>
  <div class="ficha">
    <div class="foto">FOTOGRAFÍA</div>
    <div class="datos">
      <h2>${guardia.nombre}</h2>
      <span class="badge">${guardia.estado}</span>
      <div class="grid">
        <div><span>Número de elemento</span>${guardia.numero_elemento}</div>
        <div><span>Fecha de alta</span>${fmtDate(guardia.fecha_alta)}</div>
        <div><span>Teléfono</span>${guardia.telefono || '—'}</div>
        <div><span>Dirección</span>${guardia.direccion || '—'}</div>
        ${guardia.fecha_baja ? `<div><span>Fecha de baja</span>${fmtDate(guardia.fecha_baja)}</div>` : ''}
      </div>
      <div class="resumen">
        <div class="box"><strong>${totalEntradas}</strong><span>Entradas registradas</span></div>
        <div class="box"><strong>${totalSalidas}</strong><span>Salidas registradas</span></div>
      </div>
    </div>
  </div>
  <div class="pie">U3 Seguridad Privada — Documento de uso administrativo interno.</div>
  </body></html>`;

  const pdfBuffer = await htmlToPdf(html);
  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=ficha_${guardia.numero_elemento}.pdf`,
    },
  });
}
