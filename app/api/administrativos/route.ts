import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { personal_administrativo } from '@/src/db/schema';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { desc } from 'drizzle-orm';
import { reconstruirDireccion } from '@/src/lib/fichaTecnicaUtils';

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();
  try {
    const list = db.select().from(personal_administrativo).orderBy(desc(personal_administrativo.created_at)).all();
    return Response.json(list);
  } catch (err: any) {
    return Response.json({ error: 'Error al obtener personal administrativo' }, { status: 500 });
  }
}

const CAMPOS_FICHA = [
  'fechaNacimiento', 'edad', 'estadoCivil', 'estudios', 'rfc', 'curp', 'imss', 'sexo', 'estatura', 'peso',
  'calleNumero', 'colonia', 'entreCalles', 'cp', 'delegacionMunicipio', 'estado', 'tiempoResidencia',
  'tiempoRadicarEstado', 'telefonoEmergencia', 'celular',
] as const;

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return Response.json({ error: 'Sin permisos' }, { status: 403 });

  try {
    const body = await req.json();
    const {
      numero_empleado,
      nombre,
      puesto,
      departamento = 'Administración',
      fecha_alta,
      telefono,
      email,
      direccion,
      sueldo_mensual,
    } = body;

    if (!nombre || !puesto || !fecha_alta) {
      return Response.json({ error: 'Nombre, puesto y fecha de alta son obligatorios' }, { status: 400 });
    }

    const ficha: Record<string, any> = {
      nombre: nombre.trim(),
      puesto: puesto.trim(),
    };
    if (numero_empleado) ficha.numeroElemento = numero_empleado.trim();

    for (const campo of CAMPOS_FICHA) {
      const valor = body[campo];
      if (typeof valor === 'string' && valor.trim()) ficha[campo] = valor.trim();
    }

    const direccionReconstruida = ficha.calleNumero
      ? reconstruirDireccion({
          calleNumero: ficha.calleNumero,
          colonia: ficha.colonia,
          delegacionMunicipio: ficha.delegacionMunicipio,
          estado: ficha.estado,
          cp: ficha.cp,
        })
      : direccion;

    const nuevo = db.insert(personal_administrativo).values({
      numero_empleado: numero_empleado && String(numero_empleado).trim() ? numero_empleado.trim() : null,
      nombre: nombre.trim(),
      puesto: puesto.trim(),
      departamento: departamento ? departamento.trim() : 'Administración',
      estado: 'Activo',
      fecha_alta,
      telefono: telefono || ficha.celular || null,
      email: email ? email.trim() : null,
      direccion: direccionReconstruida || null,
      sueldo_mensual: sueldo_mensual ? Number(sueldo_mensual) : null,
      ficha_tecnica_json: JSON.stringify(ficha),
    }).returning().get();

    return Response.json(nuevo, { status: 201 });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return Response.json({ error: 'El número de empleado ya existe' }, { status: 409 });
    }
    return Response.json({ error: 'Error al crear personal administrativo: ' + err.message }, { status: 500 });
  }
}
