import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { prospecto_actividades, users } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { accesoDeUsuario } from '@/src/lib/accesoUsuario';
import { puedeVerModulo } from '@/src/lib/permisosModulos';
import { registrarActividad } from '@/src/lib/actividades';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (!puedeVerModulo('clientes', accesoDeUsuario(authUser.id))) return forbidden();

  const { id } = await params;
  const filas = db.select({
    id: prospecto_actividades.id,
    tipo: prospecto_actividades.tipo,
    asunto: prospecto_actividades.asunto,
    mensaje: prospecto_actividades.mensaje,
    estado: prospecto_actividades.estado,
    detalle_error: prospecto_actividades.detalle_error,
    created_at: prospecto_actividades.created_at,
    usuario: users.username,
  })
    .from(prospecto_actividades)
    .leftJoin(users, eq(prospecto_actividades.usuario_id, users.id))
    .where(eq(prospecto_actividades.cliente_id, Number(id)))
    .orderBy(desc(prospecto_actividades.id))
    .limit(100)
    .all();

  return Response.json(filas);
}

/** Registro manual: una llamada hecha o una nota del asesor. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (!puedeVerModulo('clientes', accesoDeUsuario(authUser.id))) return forbidden();
  if (authUser.role === 'viewer') return forbidden();

  const { id } = await params;
  try {
    const { tipo, mensaje } = await req.json();
    if (!['llamada', 'nota'].includes(tipo)) {
      return Response.json({ error: 'Tipo de actividad no válido' }, { status: 400 });
    }
    if (!mensaje?.trim()) return Response.json({ error: 'Falta el texto' }, { status: 400 });

    const fila = registrarActividad({
      clienteId: Number(id), usuarioId: authUser.id, tipo, mensaje: mensaje.trim(),
    });
    return Response.json(fila, { status: 201 });
  } catch {
    return Response.json({ error: 'Error al registrar la actividad' }, { status: 500 });
  }
}
