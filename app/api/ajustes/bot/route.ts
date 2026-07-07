import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { getConfig, setConfig } from '@/src/lib/mailer';

// Conocimiento y reglas del asistente de WhatsApp (se inyectan al prompt en cada mensaje)
const CLAVES = ['bot_empresa_info', 'bot_reglas', 'bot_horario_entrevistas', 'bot_direccion_entrevistas'] as const;

export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  const config: Record<string, string> = {};
  for (const clave of CLAVES) config[clave] = getConfig(clave) || '';
  return Response.json(config);
}

export async function PUT(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  try {
    const body = await req.json();
    for (const clave of CLAVES) {
      if (clave in body) setConfig(clave, body[clave]?.trim() || null);
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Error al guardar la configuración' }, { status: 500 });
  }
}
