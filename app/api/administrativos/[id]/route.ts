import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { personal_administrativo, administrativo_documentos, administrativo_bitacora } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { CAMPOS_FICHA_BASICA, reconstruirDireccion } from '@/src/lib/fichaTecnicaUtils';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAuth(req)) return unauthorized();
  const { id } = await params;
  const adminId = Number(id);

  const item = db.select().from(personal_administrativo).where(eq(personal_administrativo.id, adminId)).get();
  if (!item) return Response.json({ error: 'Personal no encontrado' }, { status: 404 });

  return Response.json(item);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return Response.json({ error: 'Sin permisos' }, { status: 403 });

  const { id } = await params;
  const adminId = Number(id);

  try {
    const {
      nombre,
      numero_empleado,
      puesto,
      departamento,
      fecha_alta,
      fecha_baja,
      telefono,
      email,
      direccion,
      sueldo_mensual,
      estado,
      fichaExtra,
    } = await req.json();

    const existente = db.select().from(personal_administrativo).where(eq(personal_administrativo.id, adminId)).get();
    if (!existente) {
      return Response.json({ error: 'Personal no encontrado' }, { status: 404 });
    }

    let direccionFinal = direccion || null;
    let fichaTecnicaJson = existente.ficha_tecnica_json;

    if (fichaExtra && typeof fichaExtra === 'object') {
      let ficha: Record<string, any> = {};
      try { ficha = existente.ficha_tecnica_json ? JSON.parse(existente.ficha_tecnica_json) : {}; } catch { ficha = {}; }

      for (const campo of CAMPOS_FICHA_BASICA) {
        const valor = fichaExtra[campo];
        if (typeof valor === 'string' && valor.trim()) ficha[campo] = valor.trim();
        else delete ficha[campo];
      }
      ficha.nombre = (nombre || existente.nombre || '').trim();
      ficha.puesto = (puesto || existente.puesto || '').trim();
      if (numero_empleado) ficha.numeroElemento = String(numero_empleado).trim();

      fichaTecnicaJson = JSON.stringify(ficha);

      if (ficha.calleNumero) {
        direccionFinal = reconstruirDireccion({
          calleNumero: ficha.calleNumero,
          colonia: ficha.colonia,
          delegacionMunicipio: ficha.delegacionMunicipio,
          estado: ficha.estado,
          cp: ficha.cp,
        });
      }
    }

    const updated = db.update(personal_administrativo)
      .set({
        nombre,
        numero_empleado: numero_empleado && String(numero_empleado).trim() ? numero_empleado.trim() : null,
        puesto,
        departamento,
        fecha_alta,
        fecha_baja: fecha_baja || null,
        telefono: telefono || null,
        email: email || null,
        direccion: direccionFinal,
        sueldo_mensual: sueldo_mensual ? Number(sueldo_mensual) : null,
        estado,
        ficha_tecnica_json: fichaTecnicaJson,
      })
      .where(eq(personal_administrativo.id, adminId))
      .returning()
      .get();

    if (!updated) {
      return Response.json({ error: 'Personal no encontrado' }, { status: 404 });
    }

    return Response.json(updated);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return Response.json({ error: 'El número de empleado ya existe' }, { status: 409 });
    }
    return Response.json({ error: 'Error al actualizar personal: ' + err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  const { id } = await params;
  const adminId = Number(id);

  const item = db.select().from(personal_administrativo).where(eq(personal_administrativo.id, adminId)).get();
  if (!item) return Response.json({ error: 'Personal no encontrado' }, { status: 404 });

  db.delete(administrativo_documentos).where(eq(administrativo_documentos.administrativo_id, adminId)).run();
  db.delete(administrativo_bitacora).where(eq(administrativo_bitacora.administrativo_id, adminId)).run();
  db.delete(personal_administrativo).where(eq(personal_administrativo.id, adminId)).run();

  return Response.json({ ok: true });
}
