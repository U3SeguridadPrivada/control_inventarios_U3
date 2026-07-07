import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { movimientos_financieros, cuentas_bancarias, movimiento_evidencias } from '@/src/db/schema';
import { and, desc, eq, gte, inArray, lte, sql, SQL } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { librosVisibles, puedeEditarLibro } from '@/src/lib/librosAcceso';

export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const visibles = librosVisibles(authUser).map((l) => l.id);
  const p = req.nextUrl.searchParams;
  const libroParam = p.get('libro');
  if (libroParam && !visibles.includes(libroParam)) return forbidden();
  if (!libroParam && !visibles.length) return Response.json([]);

  const filtros: SQL[] = [];
  if (p.get('desde')) filtros.push(gte(movimientos_financieros.fecha, p.get('desde')!));
  if (p.get('hasta')) filtros.push(lte(movimientos_financieros.fecha, p.get('hasta')!));
  filtros.push(libroParam ? eq(movimientos_financieros.libro, libroParam) : inArray(movimientos_financieros.libro, visibles));
  if (p.get('categoria')) filtros.push(eq(movimientos_financieros.categoria, p.get('categoria')!));
  if (p.get('medio_pago')) filtros.push(eq(movimientos_financieros.medio_pago, p.get('medio_pago')!));

  const rows = db.select({
    id: movimientos_financieros.id,
    fecha: movimientos_financieros.fecha,
    tipo: movimientos_financieros.tipo,
    categoria: movimientos_financieros.categoria,
    monto: movimientos_financieros.monto,
    cuenta_bancaria_id: movimientos_financieros.cuenta_bancaria_id,
    descripcion: movimientos_financieros.descripcion,
    libro: movimientos_financieros.libro,
    medio_pago: movimientos_financieros.medio_pago,
    nombre: movimientos_financieros.nombre,
    tipo_detalle: movimientos_financieros.tipo_detalle,
    turno: movimientos_financieros.turno,
    alimentos: movimientos_financieros.alimentos,
    servicio: movimientos_financieros.servicio,
    guardia_id: movimientos_financieros.guardia_id,
    creado_por: movimientos_financieros.creado_por,
    created_at: movimientos_financieros.created_at,
    evidencias: sql<number>`(SELECT COUNT(*) FROM ${movimiento_evidencias} WHERE ${movimiento_evidencias.movimiento_id} = ${movimientos_financieros.id})`,
  }).from(movimientos_financieros)
    .where(filtros.length ? and(...filtros) : undefined)
    .orderBy(desc(movimientos_financieros.fecha), desc(movimientos_financieros.id))
    .all();

  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  try {
    const {
      fecha, tipo, categoria, monto, cuenta_bancaria_id, descripcion,
      libro, medio_pago, nombre, tipo_detalle, turno, alimentos, servicio, guardia_id,
    } = await req.json();
    if (!fecha || !tipo || !categoria || !monto) return Response.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    if (!puedeEditarLibro(authUser, libro || 'B')) return Response.json({ error: 'No eres el responsable asignado de esta cuenta' }, { status: 403 });

    const nuevo = db.insert(movimientos_financieros).values({
      fecha, tipo, categoria, monto: Number(monto),
      cuenta_bancaria_id: cuenta_bancaria_id ? Number(cuenta_bancaria_id) : null,
      descripcion: descripcion || null,
      libro: libro || 'B',
      medio_pago: medio_pago || null,
      nombre: nombre || null,
      tipo_detalle: tipo_detalle || null,
      turno: turno || null,
      alimentos: alimentos || null,
      servicio: servicio || null,
      guardia_id: guardia_id ? Number(guardia_id) : null,
      creado_por: authUser.id,
    }).returning().get();

    if (cuenta_bancaria_id) {
      const delta = tipo === 'Ingreso' ? Number(monto) : -Number(monto);
      db.update(cuentas_bancarias)
        .set({ saldo_actual: sql`${cuentas_bancarias.saldo_actual} + ${delta}` })
        .where(eq(cuentas_bancarias.id, Number(cuenta_bancaria_id)))
        .run();
    }

    return Response.json(nuevo, { status: 201 });
  } catch {
    return Response.json({ error: 'Error al registrar el movimiento' }, { status: 500 });
  }
}
