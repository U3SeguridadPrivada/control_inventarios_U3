import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { candidatos, guardias } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

// Convierte un candidato contratado en guardia activo, sin recapturar datos
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  const { id } = await params;
  try {
    const { numero_elemento } = await req.json();
    if (!numero_elemento) return Response.json({ error: 'Falta el número de elemento' }, { status: 400 });

    const candidato = db.select().from(candidatos).where(eq(candidatos.id, Number(id))).get();
    if (!candidato) return Response.json({ error: 'Candidato no encontrado' }, { status: 404 });
    if (candidato.guardia_id) return Response.json({ error: 'Este candidato ya fue convertido a guardia' }, { status: 409 });
    if (!candidato.nombre) return Response.json({ error: 'El candidato no tiene nombre registrado' }, { status: 400 });

    const nuevoGuardia = db.insert(guardias).values({
      numero_elemento: String(numero_elemento).trim(),
      nombre: candidato.nombre,
      fecha_alta: new Date().toISOString().split('T')[0],
      telefono: candidato.telefono,
      direccion: candidato.ciudad,
      estado: 'Activo',
    }).returning().get();

    const actualizado = db.update(candidatos).set({
      etapa: 'Contratado',
      etapa_actualizada_en: new Date().toISOString(),
      guardia_id: nuevoGuardia.id,
    }).where(eq(candidatos.id, Number(id))).returning().get();

    return Response.json({ candidato: actualizado, guardia: nuevoGuardia }, { status: 201 });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) return Response.json({ error: 'El número de elemento ya existe' }, { status: 409 });
    return Response.json({ error: 'Error al convertir el candidato' }, { status: 500 });
  }
}
