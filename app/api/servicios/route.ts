import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { servicios, servicio_guardias, guardias } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();

  const listaServicios = db.select().from(servicios).all();

  const asignacionesConGuardia = db
    .select({
      id: servicio_guardias.id,
      servicio_id: servicio_guardias.servicio_id,
      guardia_id: servicio_guardias.guardia_id,
      turno: servicio_guardias.turno,
      nombre: guardias.nombre,
      numero_elemento: guardias.numero_elemento,
    })
    .from(servicio_guardias)
    .innerJoin(guardias, eq(servicio_guardias.guardia_id, guardias.id))
    .all();

  const porServicio: Record<number, any[]> = {};
  for (const a of asignacionesConGuardia) {
    if (!porServicio[a.servicio_id]) porServicio[a.servicio_id] = [];
    porServicio[a.servicio_id].push({ id: a.id, guardia_id: a.guardia_id, turno: a.turno, nombre: a.nombre, numero_elemento: a.numero_elemento });
  }

  return Response.json(listaServicios.map((s) => ({ ...s, guardias: porServicio[s.id] || [] })));
}

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  try {
    const { nombre, direccion, lat, lng } = await req.json();
    if (!nombre || lat === undefined || lng === undefined) {
      return Response.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }
    const nuevo = db.insert(servicios).values({
      nombre, direccion: direccion || null, lat: Number(lat), lng: Number(lng), creado_por: authUser.id,
    }).returning().get();
    return Response.json({ ...nuevo, guardias: [] }, { status: 201 });
  } catch {
    return Response.json({ error: 'Error al crear el servicio' }, { status: 500 });
  }
}
