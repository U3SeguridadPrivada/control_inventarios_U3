import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { clientes, users, prospecto_actividades } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { accesoDeUsuario } from '@/src/lib/accesoUsuario';
import { puedeVerModulo } from '@/src/lib/permisosModulos';
import { registrarActividad } from '@/src/lib/actividades';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (!puedeVerModulo('clientes', accesoDeUsuario(authUser.id))) return forbidden();

  const { id } = await params;
  const cliente = db.select().from(clientes).where(eq(clientes.id, Number(id))).get();
  if (!cliente) return Response.json({ error: 'Cliente no encontrado' }, { status: 404 });
  return Response.json(cliente);
}

/** Campos que el asesor puede editar desde el panel del prospecto. */
const CAMPOS_EDITABLES = [
  'nombre', 'tipo', 'empresa', 'email', 'telefono', 'direccion', 'notas',
  'etapa', 'asignado_a', 'proximo_seguimiento', 'motivo_perdida',
  'giro', 'sitio_web', 'colonia', 'cp', 'alcaldia',
] as const;

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (!puedeVerModulo('clientes', accesoDeUsuario(authUser.id))) return forbidden();
  if (authUser.role === 'viewer') return forbidden();

  const { id } = await params;
  const clienteId = Number(id);

  try {
    const body = await req.json();
    const anterior = db.select().from(clientes).where(eq(clientes.id, clienteId)).get();
    if (!anterior) return Response.json({ error: 'Cliente no encontrado' }, { status: 404 });

    const cambios: Record<string, unknown> = {};
    for (const campo of CAMPOS_EDITABLES) {
      if (campo in body) cambios[campo] = body[campo];
    }
    if (!Object.keys(cambios).length) return Response.json(anterior);

    const actualizado = db.update(clientes).set(cambios).where(eq(clientes.id, clienteId)).returning().get();

    // La bitácora explica por qué un prospecto cambió de columna o de dueño.
    if (cambios.etapa && cambios.etapa !== anterior.etapa) {
      const motivo = actualizado.motivo_perdida ? ` (${actualizado.motivo_perdida})` : '';
      registrarActividad({
        clienteId, usuarioId: authUser.id, tipo: 'etapa',
        mensaje: `${anterior.etapa} → ${cambios.etapa}${motivo}`,
      });
    }
    if ('asignado_a' in cambios && cambios.asignado_a !== anterior.asignado_a) {
      const destino = cambios.asignado_a
        ? db.select({ username: users.username }).from(users).where(eq(users.id, Number(cambios.asignado_a))).get()?.username
        : null;
      registrarActividad({
        clienteId, usuarioId: authUser.id, tipo: 'asignacion',
        mensaje: destino ? `Asignado a ${destino}` : 'Asignación retirada',
      });
    }

    return Response.json(actualizado);
  } catch {
    return Response.json({ error: 'Error al actualizar el cliente' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  const { id } = await params;
  const clienteId = Number(id);
  // La bitácora referencia al cliente: se borra primero o la FK deja huérfanos.
  db.delete(prospecto_actividades).where(eq(prospecto_actividades.cliente_id, clienteId)).run();
  db.delete(clientes).where(eq(clientes.id, clienteId)).run();
  return Response.json({ ok: true });
}
