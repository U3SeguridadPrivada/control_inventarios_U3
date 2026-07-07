import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { getConfig, setConfig } from '@/src/lib/mailer';

export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  return Response.json({
    smtp_host: getConfig('smtp_host') || '',
    smtp_puerto: getConfig('smtp_puerto') || '465',
    smtp_ssl: (getConfig('smtp_ssl') ?? '1') === '1',
    smtp_usuario: getConfig('smtp_usuario') || '',
    smtp_from_nombre: getConfig('smtp_from_nombre') || 'U3 Seguridad Privada',
    app_url: getConfig('app_url') || '',
    tiene_password: !!getConfig('smtp_password'),
  });
}

export async function PUT(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  try {
    const body = await req.json();
    if ('smtp_host' in body) setConfig('smtp_host', body.smtp_host?.trim() || null);
    if ('smtp_puerto' in body) setConfig('smtp_puerto', String(Number(body.smtp_puerto) || 465));
    if ('smtp_ssl' in body) setConfig('smtp_ssl', body.smtp_ssl ? '1' : '0');
    if ('smtp_usuario' in body) setConfig('smtp_usuario', body.smtp_usuario?.trim() || null);
    if ('smtp_from_nombre' in body) setConfig('smtp_from_nombre', body.smtp_from_nombre?.trim() || null);
    if ('app_url' in body) setConfig('app_url', body.app_url?.trim().replace(/\/$/, '') || null);
    // La contraseña solo se actualiza si se envía un valor
    if ('smtp_password' in body && body.smtp_password) setConfig('smtp_password', body.smtp_password);

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Error al guardar la configuración' }, { status: 500 });
  }
}
