import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { clientes, users } from '@/src/db/schema';
import { eq, inArray, and, isNull, desc, type SQL } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { accesoDeUsuario } from '@/src/lib/accesoUsuario';
import { puedeVerModulo } from '@/src/lib/permisosModulos';
import { registrarActividad } from '@/src/lib/actividades';

const MAX_REPARTO = 2000;

/**
 * Reparte cartera entre asesores. Dos modos:
 *   { ids: [1,2,3], asignado_a: 7 }                  asigna registros concretos
 *   { reparto: [7, 9], cantidad: 300, filtros: {} }  reparte sin dueño, en ronda
 */
export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (!puedeVerModulo('clientes', accesoDeUsuario(authUser.id))) return forbidden();
  if (authUser.role === 'viewer') return forbidden();

  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: 'Solicitud mal formada' }, { status: 400 });

  // --- Asignación directa de una selección ---
  if (Array.isArray(body.ids) && body.ids.length) {
    const destino: number | null = body.asignado_a ?? null;
    if (destino !== null && !db.select({ id: users.id }).from(users).where(eq(users.id, destino)).get()) {
      return Response.json({ error: 'El asesor indicado no existe' }, { status: 400 });
    }
    const ids: number[] = body.ids.map(Number).filter(Boolean).slice(0, MAX_REPARTO);
    db.update(clientes).set({ asignado_a: destino }).where(inArray(clientes.id, ids)).run();

    const nombre = destino
      ? db.select({ username: users.username }).from(users).where(eq(users.id, destino)).get()?.username
      : null;
    for (const id of ids) {
      registrarActividad({
        clienteId: id, usuarioId: authUser.id, tipo: 'asignacion',
        mensaje: nombre ? `Asignado a ${nombre}` : 'Asignación retirada',
      });
    }
    return Response.json({ ok: true, asignados: ids.length, asesor: nombre });
  }

  // --- Reparto automático en ronda entre varios asesores ---
  if (Array.isArray(body.reparto) && body.reparto.length) {
    const asesores: number[] = body.reparto.map(Number).filter(Boolean);
    const cantidad = Math.min(MAX_REPARTO, Math.max(1, Number(body.cantidad || 100)));
    const f = body.filtros || {};

    const filtros: SQL[] = [isNull(clientes.asignado_a)];
    if (f.prioridad && f.prioridad !== 'Todas') filtros.push(eq(clientes.prioridad, f.prioridad));
    if (f.alcaldia && f.alcaldia !== 'Todas') filtros.push(eq(clientes.alcaldia, f.alcaldia));
    if (f.origen && f.origen !== 'Todos') filtros.push(eq(clientes.origen, f.origen));

    // Se reparte lo mejor calificado primero, para que nadie herede solo el fondo del barril.
    const candidatos = db.select({ id: clientes.id })
      .from(clientes)
      .where(and(...filtros))
      .orderBy(desc(clientes.puntaje), desc(clientes.id))
      .limit(cantidad)
      .all();

    if (!candidatos.length) return Response.json({ ok: true, asignados: 0, detalle: [] });

    const nombres = new Map<number, string>();
    for (const a of asesores) {
      const u = db.select({ username: users.username }).from(users).where(eq(users.id, a)).get();
      if (u) nombres.set(a, u.username);
    }
    if (!nombres.size) return Response.json({ error: 'Ningún asesor válido en el reparto' }, { status: 400 });

    const validos = asesores.filter((a) => nombres.has(a));
    const conteo = new Map<number, number>(validos.map((a) => [a, 0]));

    db.transaction((tx) => {
      candidatos.forEach((c, i) => {
        const asesor = validos[i % validos.length];
        tx.update(clientes).set({ asignado_a: asesor }).where(eq(clientes.id, c.id)).run();
        conteo.set(asesor, (conteo.get(asesor) || 0) + 1);
      });
    });

    // La bitácora se escribe fuera de la transacción del reparto: si algo
    // falla ahí, el reparto ya quedó firme y no se deshace por una nota.
    candidatos.forEach((c, i) => {
      const asesor = validos[i % validos.length];
      registrarActividad({
        clienteId: c.id, usuarioId: authUser.id, tipo: 'asignacion',
        mensaje: `Asignado a ${nombres.get(asesor)}`,
      });
    });

    return Response.json({
      ok: true,
      asignados: candidatos.length,
      detalle: validos.map((a) => ({ asesor: nombres.get(a), total: conteo.get(a) || 0 })),
    });
  }

  return Response.json({ error: 'Indica ids o un reparto entre asesores' }, { status: 400 });
}
