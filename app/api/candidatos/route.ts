import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { candidatos, vacantes } from '@/src/db/schema';
import { desc, eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();
  const rows = db.select({
    id: candidatos.id,
    nombre: candidatos.nombre,
    telefono: candidatos.telefono,
    ciudad: candidatos.ciudad,
    edad: candidatos.edad,
    experiencia: candidatos.experiencia,
    vacante_id: candidatos.vacante_id,
    vacante_puesto: vacantes.puesto,
    etapa: candidatos.etapa,
    etapa_actualizada_en: candidatos.etapa_actualizada_en,
    fecha_entrevista: candidatos.fecha_entrevista,
    guardia_id: candidatos.guardia_id,
    origen: candidatos.origen,
    notas: candidatos.notas,
    created_at: candidatos.created_at,
  })
    .from(candidatos)
    .leftJoin(vacantes, eq(candidatos.vacante_id, vacantes.id))
    .orderBy(desc(candidatos.id))
    .all();
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  try {
    const { nombre, telefono, ciudad, edad, experiencia, vacante_id, notas } = await req.json();
    if (!telefono) return Response.json({ error: 'Falta el teléfono' }, { status: 400 });

    const nuevo = db.insert(candidatos).values({
      nombre,
      telefono: String(telefono).replace(/\D/g, ''),
      ciudad,
      edad: edad ? Number(edad) : null,
      experiencia,
      vacante_id: vacante_id ? Number(vacante_id) : null,
      notas,
      origen: 'Manual',
      etapa_actualizada_en: new Date().toISOString(),
    }).returning().get();
    return Response.json(nuevo, { status: 201 });
  } catch {
    return Response.json({ error: 'Error al registrar el candidato' }, { status: 500 });
  }
}
