import { db } from '@/src/db';
import { clientes, barridos, users, whatsapp_chats, whatsapp_conversaciones } from '@/src/db/schema';
import { eq, and, isNull, isNotNull, desc, ne, inArray, type SQL } from 'drizzle-orm';
import { registrarActividad } from '@/src/lib/actividades';
import { enviarCorreo } from '@/src/lib/mailer';
import { enviarMensajeWhatsApp, tocarChat } from '@/src/lib/whatsapp';
import {
  PLANTILLAS_CORREO, PLANTILLAS_WHATSAPP, telefonoWhatsApp, textoAHtml,
} from '@/src/lib/pipeline';

/** Tope duro por barrido. Cien es la tanda que pidió ventas; más es spam. */
export const MAX_POR_BARRIDO = 100;

/** Pausa entre envíos: el SMTP y la API de WhatsApp truenan si se les satura. */
const PAUSA_MS = 1500;

export interface OpcionesBarrido {
  usuarioId: number;
  canal: 'correo' | 'whatsapp';
  plantillaId: string;
  cantidad: number;
  lote?: string | null;
  soloMios?: boolean;
  prioridad?: string | null;
}

/**
 * Elige a quién le toca en este barrido: prospectos sin contactar todavía,
 * con el dato del canal, empezando por los mejor calificados.
 */
export function candidatosBarrido(o: OpcionesBarrido) {
  const filtros: SQL[] = [
    eq(clientes.etapa, 'Nuevo'),
    isNull(clientes.ultimo_contacto),
  ];
  if (o.canal === 'correo') filtros.push(isNotNull(clientes.email), ne(clientes.email, ''));
  else filtros.push(isNotNull(clientes.telefono), ne(clientes.telefono, ''));
  if (o.soloMios) filtros.push(eq(clientes.asignado_a, o.usuarioId));
  if (o.lote) filtros.push(eq(clientes.lote, o.lote));
  if (o.prioridad) filtros.push(eq(clientes.prioridad, o.prioridad));

  // Se piden de más porque en WhatsApp hay teléfonos que no son móviles válidos
  // y se descartan hasta aquí, ya con el dato en la mano.
  const crudos = db.select().from(clientes)
    .where(and(...filtros))
    .orderBy(desc(clientes.puntaje), desc(clientes.id))
    .limit(o.cantidad * 3)
    .all();

  const utiles = o.canal === 'whatsapp'
    ? crudos.filter((c) => telefonoWhatsApp(c.telefono))
    : crudos;

  return utiles.slice(0, o.cantidad);
}

/** Cuenta cuántos prospectos alcanzaría un barrido con estas opciones. */
export function disponiblesParaBarrido(o: OpcionesBarrido): number {
  return candidatosBarrido({ ...o, cantidad: MAX_POR_BARRIDO }).length;
}

export function barridoActivoDe(usuarioId: number) {
  return db.select().from(barridos)
    .where(and(eq(barridos.usuario_id, usuarioId), eq(barridos.estado, 'en_proceso')))
    .get();
}

/**
 * Arranca el barrido y devuelve su id de inmediato. El envío sigue en segundo
 * plano y va actualizando contadores: la interfaz lo consulta para la barra de
 * progreso. No se usa await sobre el trabajo completo porque cien correos
 * tardan minutos y la petición HTTP no debe quedarse colgada.
 */
export function iniciarBarrido(o: OpcionesBarrido) {
  if (barridoActivoDe(o.usuarioId)) {
    throw new Error('Ya tiene un barrido en proceso. Espere a que termine.');
  }
  const cantidad = Math.min(MAX_POR_BARRIDO, Math.max(1, o.cantidad));
  const seleccion = candidatosBarrido({ ...o, cantidad });
  if (!seleccion.length) throw new Error('No hay prospectos sin contactar con esos filtros');

  const fila = db.insert(barridos).values({
    usuario_id: o.usuarioId,
    canal: o.canal,
    plantilla: o.plantillaId,
    lote: o.lote ?? null,
    objetivo: seleccion.length,
  }).returning().get();

  // Se marcan de una vez como 'Contactado' para que dos barridos simultáneos
  // no puedan tomar al mismo prospecto; el resultado real de cada envío queda
  // en la bitácora, incluidos los que fallen.
  const ids = seleccion.map((c) => c.id);
  db.update(clientes).set({ etapa: 'Contactado' }).where(inArray(clientes.id, ids)).run();

  void ejecutar(fila.id, seleccion, o);
  return fila;
}

async function ejecutar(barridoId: number, seleccion: typeof clientes.$inferSelect[], o: OpcionesBarrido) {
  const asesor = db.select().from(users).where(eq(users.id, o.usuarioId)).get();
  const plantillaCorreo = PLANTILLAS_CORREO.find((p) => p.id === o.plantillaId) ?? PLANTILLAS_CORREO[0];
  const plantillaWhats = PLANTILLAS_WHATSAPP.find((p) => p.id === o.plantillaId) ?? PLANTILLAS_WHATSAPP[0];

  let enviados = 0, fallidos = 0;

  for (const c of seleccion) {
    const datos = {
      empresa: c.empresa || c.nombre,
      giro: c.giro,
      alcaldia: c.alcaldia,
      asesor: asesor?.username ?? '',
    };

    try {
      if (o.canal === 'correo') {
        const asunto = plantillaCorreo.asunto(datos);
        const cuerpo = plantillaCorreo.cuerpo(datos);
        await enviarCorreo({
          remitenteId: o.usuarioId,
          para: c.email!,
          asunto,
          cuerpoHtml: textoAHtml(cuerpo),
        });
        registrarActividad({ clienteId: c.id, usuarioId: o.usuarioId, tipo: 'correo', asunto, mensaje: cuerpo });
      } else {
        const destino = telefonoWhatsApp(c.telefono)!;
        const cuerpo = plantillaWhats.cuerpo(datos);
        const envio = await enviarMensajeWhatsApp(destino, cuerpo);
        if (!envio.ok) throw new Error(envio.error || 'WhatsApp rechazó el mensaje');

        tocarChat(destino);
        db.update(whatsapp_chats).set({ bot_activo: 0 }).where(eq(whatsapp_chats.telefono, destino)).run();
        db.insert(whatsapp_conversaciones).values({
          telefono: destino, rol: 'model', autor: 'humano', mensaje: cuerpo,
        }).run();
        registrarActividad({ clienteId: c.id, usuarioId: o.usuarioId, tipo: 'whatsapp', mensaje: cuerpo });
      }
      enviados++;
    } catch (e) {
      fallidos++;
      const detalle = e instanceof Error ? e.message : 'Error desconocido';
      registrarActividad({
        clienteId: c.id, usuarioId: o.usuarioId, tipo: o.canal,
        mensaje: '(barrido)', estado: 'error', detalleError: detalle,
      });
      // Si no se le pudo escribir, regresa a la fila para intentarlo después.
      db.update(clientes).set({ etapa: 'Nuevo' }).where(eq(clientes.id, c.id)).run();
    }

    db.update(barridos).set({ enviados, fallidos }).where(eq(barridos.id, barridoId)).run();
    await new Promise((r) => setTimeout(r, PAUSA_MS));
  }

  db.update(barridos).set({
    estado: 'terminado',
    enviados,
    fallidos,
    terminado_at: new Date().toISOString(),
    detalle: fallidos ? `${fallidos} envíos fallaron; los prospectos volvieron a "Nuevo".` : null,
  }).where(eq(barridos.id, barridoId)).run();
}
