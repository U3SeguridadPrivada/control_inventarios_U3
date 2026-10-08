import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { guardias } from '@/src/db/schema';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { reconstruirDireccion, extraerFichaBasica } from '@/src/lib/fichaTecnicaUtils';

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();
  return Response.json(db.select().from(guardias).all());
}

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return Response.json({ error: 'Sin permisos' }, { status: 403 });

  try {
    const body = await req.json();
    const { numero_elemento, nombre, fecha_alta, telefono, direccion } = body;
    if (typeof nombre !== 'string' || !nombre.trim()) {
      return Response.json({ error: 'El nombre es obligatorio' }, { status: 400 });
    }

    // Los datos personales y de domicilio capturados en el alta rápida se
    // guardan de una vez en ficha_tecnica_json, con las mismas llaves que usa
    // la Ficha Técnica oficial — así, al abrirla después, ya vienen precargados.
    const ficha = extraerFichaBasica(body);

    const direccionReconstruida = ficha.calleNumero
      ? reconstruirDireccion({
          calleNumero: ficha.calleNumero,
          colonia: ficha.colonia,
          delegacionMunicipio: ficha.delegacionMunicipio,
          estado: ficha.estado,
          cp: ficha.cp,
        })
      : direccion;

    const newGuardia = db.insert(guardias).values({
      numero_elemento: numero_elemento && String(numero_elemento).trim() ? numero_elemento.trim() : null,
      nombre: nombre.trim(),
      fecha_alta,
      telefono: telefono || ficha.celular || null,
      direccion: direccionReconstruida || null,
      ficha_tecnica_json: Object.keys(ficha).length ? JSON.stringify(ficha) : null,
      estado: 'Activo',
    }).returning().get();
    return Response.json(newGuardia, { status: 201 });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) return Response.json({ error: 'El número de elemento ya existe' }, { status: 409 });
    return Response.json({ error: 'Error al crear guardia' }, { status: 500 });
  }
}
