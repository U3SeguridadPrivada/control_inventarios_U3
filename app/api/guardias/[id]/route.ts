import { randomUUID } from 'crypto';
import { fechaMexico } from '@/src/lib/fecha';
import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import {
  guardias, guardia_documentos, guardia_bitacora, uniformes_campo, bajas,
  servicio_guardias, incidencias, entradas, salidas, eventos_calendario,
  movimientos_financieros, candidatos,
} from '@/src/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { CAMPOS_FICHA_BASICA, extraerFichaBasica } from '@/src/lib/fichaTecnicaUtils';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return Response.json({ error: 'Sin permisos' }, { status: 403 });

  const { id } = await params;
  const guardiaId = Number(id);

  try {
    const { nombre, numero_elemento, fecha_alta, telefono, direccion, estado, fichaExtra } = await req.json();

    const actual = db.select().from(guardias).where(eq(guardias.id, guardiaId)).get();
    if (!actual) {
      return Response.json({ error: 'Guardia no encontrado' }, { status: 404 });
    }

    // El cambio de estado por edición manual no puede saltarse el proceso de baja: sin esta
    // guarda se podía marcar "En Baja" a un guardia con equipo en campo (que seguía contando como
    // "en campo" para siempre, sin checklist que lo recuperara) o reactivar a uno con la baja abierta.
    if (estado && estado !== actual.estado) {
      if (actual.estado === 'Activo' && ['Baja Pendiente', 'En Baja', 'Baja Definitiva'].includes(estado)) {
        const enCampo = db.select({ total: sql<number>`COALESCE(SUM(${salidas.cantidad}), 0)` }).from(salidas)
          .where(and(eq(salidas.anulado, 0), eq(salidas.guardia_id, guardiaId), eq(salidas.estado_asignacion, 'Uniforme en Campo'))).get();
        if (Number(enCampo?.total) > 0) {
          return Response.json({ error: `Este guardia tiene ${Number(enCampo!.total)} pieza(s) de equipo en campo. Inicia su baja desde "Dar de baja" para recuperarlo con el checklist.` }, { status: 400 });
        }
      }
      if (estado === 'Activo') {
        const bajaAbierta = db.select({ id: bajas.id, estado_general: bajas.estado_general }).from(bajas).where(eq(bajas.guardia_id, guardiaId)).all()
          .some(b => b.estado_general !== 'Completada');
        if (bajaAbierta) {
          return Response.json({ error: 'Este guardia tiene un proceso de baja abierto. Termina el checklist en Procesos de Baja antes de reactivarlo.' }, { status: 400 });
        }
      }
    }

    // La identidad (nombre por partes, nacimiento, CURP, RFC...) se guarda en la ficha técnica, igual que
    // en el alta; el resto del JSON (foto, empleos, domicilio detallado...) se conserva tal cual.
    let fichaTecnicaJson = actual.ficha_tecnica_json;
    if (fichaExtra && typeof fichaExtra === 'object') {
      let ficha: Record<string, any> = {};
      try { ficha = actual.ficha_tecnica_json ? JSON.parse(actual.ficha_tecnica_json) : {}; } catch { ficha = {}; }
      const capturada = extraerFichaBasica(fichaExtra);
      for (const campo of CAMPOS_FICHA_BASICA) {
        if (!(campo in fichaExtra)) continue; // lo que el formulario no envía no se toca
        if (capturada[campo]) ficha[campo] = capturada[campo];
        else delete ficha[campo];
      }
      // Editar solo el teléfono de un expediente sin ficha no debe crearle una ficha "lista" con apenas el nombre.
      if (actual.ficha_tecnica_json && typeof nombre === 'string' && nombre.trim()) ficha.nombre = nombre.trim();
      fichaTecnicaJson = Object.keys(ficha).length ? JSON.stringify(ficha) : null;
    }

    const updated = db.transaction((tx) => {
      tx.run(sql`UPDATE inventario_contexto SET usuario=${authUser.username},fecha=${fechaMexico()},operacion_id=${randomUUID()},motivo='Actualizar expediente del guardia' WHERE id=1`);
      // `salidas.nombre_guardia` guarda el nombre tal como era al asignar; si se corrige el
      // nombre hay que propagarlo o el equipo en campo aparece bajo el nombre viejo.
      if (nombre && nombre !== actual.nombre) {
        tx.update(salidas).set({ nombre_guardia: nombre }).where(eq(salidas.guardia_id, guardiaId)).run();
      }
      const resultado = tx.update(guardias)
        .set({ nombre, numero_elemento, fecha_alta, telefono, direccion, estado, ficha_tecnica_json: fichaTecnicaJson })
        .where(eq(guardias.id, guardiaId))
        .returning()
        .get();
      tx.run(sql`UPDATE inventario_contexto SET usuario=NULL,fecha=NULL,operacion_id=NULL,motivo=NULL WHERE id=1`);
      return resultado;
    });

    return Response.json(updated);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return Response.json({ error: 'El número de elemento ya existe' }, { status: 409 });
    }
    return Response.json({ error: 'Error al actualizar guardia: ' + err.message }, { status: 500 });
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
  const guardiaId = Number(id);

  const guardia = db.select().from(guardias).where(eq(guardias.id, guardiaId)).get();
  if (!guardia) return Response.json({ error: 'Guardia no encontrado' }, { status: 404 });

  // No se elimina a un guardia con equipo sin devolver: el desvínculo dejaba esas piezas como
  // "en campo" sin dueño, contando para siempre en el inventario y sin forma de recuperarlas.
  const equipoPendiente = db.select({ total: sql<number>`COALESCE(SUM(${salidas.cantidad}), 0)` }).from(salidas)
    .where(and(eq(salidas.anulado, 0), eq(salidas.guardia_id, guardiaId), inArray(salidas.estado_asignacion, ['Uniforme en Campo', 'Uniforme en Bajas']))).get();
  if (Number(equipoPendiente?.total) > 0) {
    return Response.json({ error: `No se puede eliminar: el guardia tiene ${Number(equipoPendiente!.total)} pieza(s) de equipo sin devolver. Procésalo primero en Bajas o registra el extravío.` }, { status: 409 });
  }

  const historial = db.select({ id: salidas.id }).from(salidas).where(eq(salidas.guardia_id, guardiaId)).get() || db.select({ id: entradas.id }).from(entradas).where(eq(entradas.guardia_id, guardiaId)).get();
  if (historial) return Response.json({ error: 'El guardia tiene historial de inventario. Conserva su expediente y usa el proceso de baja.' }, { status: 409 });
  // Registros que solo existen por este guardia (FK NOT NULL): se eliminan con él.
  db.delete(guardia_documentos).where(eq(guardia_documentos.guardia_id, guardiaId)).run();
  db.delete(guardia_bitacora).where(eq(guardia_bitacora.guardia_id, guardiaId)).run();
  db.delete(uniformes_campo).where(eq(uniformes_campo.guardia_id, guardiaId)).run();
  db.delete(bajas).where(eq(bajas.guardia_id, guardiaId)).run();
  db.delete(servicio_guardias).where(eq(servicio_guardias.guardia_id, guardiaId)).run();
  db.delete(incidencias).where(eq(incidencias.guardia_id, guardiaId)).run();

  // Registros con historial propio (inventario, finanzas, calendario, reclutamiento):
  // se conservan y solo se desvincula la referencia al guardia (FK nullable).
  db.update(entradas).set({ guardia_id: null }).where(eq(entradas.guardia_id, guardiaId)).run();
  db.update(salidas).set({ guardia_id: null }).where(eq(salidas.guardia_id, guardiaId)).run();
  db.update(eventos_calendario).set({ guardia_id: null }).where(eq(eventos_calendario.guardia_id, guardiaId)).run();
  db.update(movimientos_financieros).set({ guardia_id: null }).where(eq(movimientos_financieros.guardia_id, guardiaId)).run();
  db.update(candidatos).set({ guardia_id: null }).where(eq(candidatos.guardia_id, guardiaId)).run();

  db.delete(guardias).where(eq(guardias.id, guardiaId)).run();

  return Response.json({ success: true });
}
