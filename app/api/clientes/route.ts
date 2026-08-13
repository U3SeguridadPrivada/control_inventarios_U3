import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { clientes } from '@/src/db/schema';
import { desc } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { accesoDeUsuario } from '@/src/lib/accesoUsuario';
import { puedeVerModulo } from '@/src/lib/permisosModulos';

export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (!puedeVerModulo('clientes', accesoDeUsuario(authUser.id))) return forbidden();

  return Response.json(db.select().from(clientes).orderBy(desc(clientes.id)).all());
}

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (!puedeVerModulo('clientes', accesoDeUsuario(authUser.id))) return forbidden();
  if (authUser.role === 'viewer') return forbidden();

  try {
    const { nombre, tipo, empresa, email, telefono, direccion, notas } = await req.json();
    if (!nombre) return Response.json({ error: 'Falta el nombre' }, { status: 400 });

    const nuevo = db.insert(clientes).values({
      nombre, tipo: tipo || 'Prospecto', empresa, email, telefono, direccion, notas,
      creado_por: authUser.id,
    }).returning().get();
    return Response.json(nuevo, { status: 201 });
  } catch {
    return Response.json({ error: 'Error al crear el cliente' }, { status: 500 });
  }
}
