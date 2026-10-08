import { db } from '@/src/db';
import { clientes, barridos, users, whatsapp_chats, whatsapp_conversaciones } from '@/src/db/schema';
import { eq, and, isNull, isNotNull, desc, ne, inArray, type SQL } from 'drizzle-orm';
import { registrarActividad } from '@/src/lib/actividades';
import { enviarCorreo, puedeEnviarCorreo } from '@/src/lib/mailer';
import { enviarMensajeWhatsApp, tocarChat, whatsappConfigurado } from '@/src/lib/whatsapp';
import {
  PLANTILLAS_CORREO, PLANTILLAS_WHATSAPP, telefonoWhatsApp, textoAHtml,
} from '@/src/lib/pipeline';

/** Tope duro por barrido. Cien es la tanda que pidió ventas; más es spam. */
export const MAX_POR_BARRIDO = 100;

/** Pausa entre envíos: el SMTP y la API de WhatsApp truenan si se les satura. */
const PAUSA_MS = 1500;

/**
 * Fallos consecutivos tras los cuales se corta el barrido: casi siempre es una
 * credencial vencida o una regla del proveedor, y seguir solo gasta la tanda.
 */
const MAX_FALLOS_SEGUIDOS = 8;

/**
 * Barridos que ESTE proceso está enviando. Vive en globalThis para que la
 * recarga en caliente de Next en desarrollo no lo vacíe a media tanda.
 */
const global_ = globalThis as typeof globalThis & { __barridosEnCurso?: Set<number> };
const enCurso = (global_.__barridosEnCurso ??= new Set<number>());

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

/**
 * Devuelve a la fila a los prospectos que un barrido tomó pero no alcanzó a
 * contactar. Se identifican porque siguen en 'Contactado' sin sello de contacto:
 * los que sí recibieron el mensaje ya tienen `ultimo_contacto`.
 */
function liberarSinContactar(ids: number[]): number {
  if (!ids.length) return 0;
  return db.update(clientes).set({ etapa: 'Nuevo' })
    .where(and(inArray(clientes.id, ids), eq(clientes.etapa, 'Contactado'), isNull(clientes.ultimo_contacto)))
    .run().changes;
}

/**
 * Si el servidor se reinició mientras un barrido enviaba, su fila se quedó en
 * 'en_proceso' para siempre y le impedía al asesor lanzar otro. Aquí se cierran
 * y sus prospectos sin contactar vuelven a la fila.
 */
export function cerrarBarridosHuerfanos() {
  const abiertos = db.select().from(barridos).where(eq(barridos.estado, 'en_proceso')).all();
  for (const b of abiertos) {
    if (enCurso.has(b.id)) continue;

    let ids: number[] = [];
    try { ids = b.ids_json ? JSON.parse(b.ids_json) : []; } catch { /* fila vieja sin ids */ }
    const liberados = liberarSinContactar(ids);

    db.update(barridos).set({
      estado: 'interrumpido',
      terminado_at: new Date().toISOString(),
      detalle: `El servidor se reinició a media tanda: ${b.enviados} enviados`
        + (ids.length ? `; ${liberados} prospectos sin contactar volvieron a "Nuevo".` : '.'),
    }).where(eq(barridos.id, b.id)).run();
  }
}

/** Avisa antes de tomar prospectos si el canal no tiene por dónde enviar. */
function validarCanal(o: OpcionesBarrido) {
  if (o.canal === 'correo' && !puedeEnviarCorreo(o.usuarioId)) {
    throw new Error('No hay un servidor de correo (SMTP) configurado: configure su buzón en Correo o el SMTP del sitio en Ajustes antes de lanzar el barrido.');
  }
  if (o.canal === 'whatsapp' && !whatsappConfigurado()) {
    throw new Error('WhatsApp no está configurado en el servidor: faltan las credenciales del proveedor.');
  }
}

export function barridoActivoDe(usuarioId: number) {
  cerrarBarridosHuerfanos();
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
  validarCanal(o);
  const cantidad = Math.min(MAX_POR_BARRIDO, Math.max(1, o.cantidad));
  const seleccion = candidatosBarrido({ ...o, cantidad });
  if (!seleccion.length) throw new Error('No hay prospectos sin contactar con esos filtros');

  const ids = seleccion.map((c) => c.id);
  const fila = db.insert(barridos).values({
    usuario_id: o.usuarioId,
    canal: o.canal,
    plantilla: o.plantillaId,
    lote: o.lote ?? null,
    objetivo: seleccion.length,
    ids_json: JSON.stringify(ids),
  }).returning().get();

  // Se marcan de una vez como 'Contactado' para que dos barridos simultáneos
  // no puedan tomar al mismo prospecto; el resultado real de cada envío queda
  // en la bitácora, incluidos los que fallen.
  db.update(clientes).set({ etapa: 'Contactado' }).where(inArray(clientes.id, ids)).run();

  enCurso.add(fila.id);
  void ejecutar(fila.id, seleccion, o)
    .catch((e) => {
      // Una falla inesperada (no de un envío concreto) no debe dejar la fila abierta.
      liberarSinContactar(ids);
      db.update(barridos).set({
        estado: 'error',
        terminado_at: new Date().toISOString(),
        detalle: `El barrido se detuvo: ${e instanceof Error ? e.message : 'error desconocido'}`,
      }).where(eq(barridos.id, fila.id)).run();
    })
    .finally(() => enCurso.delete(fila.id));

  const { ids_json: _ids, ...visible } = fila;
  return visible;
}

async function ejecutar(barridoId: number, seleccion: typeof clientes.$inferSelect[], o: OpcionesBarrido) {
  const asesor = db.select().from(users).where(eq(users.id, o.usuarioId)).get();
  const plantillaCorreo = PLANTILLAS_CORREO.find((p) => p.id === o.plantillaId) ?? PLANTILLAS_CORREO[0];
  const plantillaWhats = PLANTILLAS_WHATSAPP.find((p) => p.id === o.plantillaId) ?? PLANTILLAS_WHATSAPP[0];

  let enviados = 0, fallidos = 0, seguidos = 0;
  let primerError: string | null = null;
  let cortado = false;

  for (const [i, c] of seleccion.entries()) {
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
      seguidos = 0;
    } catch (e) {
      fallidos++;
      seguidos++;
      const detalle = e instanceof Error ? e.message : 'Error desconocido';
      primerError ??= detalle.slice(0, 200);
      registrarActividad({
        clienteId: c.id, usuarioId: o.usuarioId, tipo: o.canal,
        mensaje: '(barrido)', estado: 'error', detalleError: detalle,
      });
      // Si no se le pudo escribir, regresa a la fila para intentarlo después.
      db.update(clientes).set({ etapa: 'Nuevo' }).where(eq(clientes.id, c.id)).run();
    }

    db.update(barridos).set({ enviados, fallidos }).where(eq(barridos.id, barridoId)).run();

    if (seguidos >= MAX_FALLOS_SEGUIDOS) {
      cortado = true;
      liberarSinContactar(seleccion.slice(i + 1).map((p) => p.id));
      break;
    }
    await new Promise((r) => setTimeout(r, PAUSA_MS));
  }

  const causa = primerError ? ` Primer error: ${primerError}` : '';
  db.update(barridos).set({
    estado: cortado ? 'error' : 'terminado',
    enviados,
    fallidos,
    terminado_at: new Date().toISOString(),
    detalle: cortado
      ? `Se cortó tras ${MAX_FALLOS_SEGUIDOS} fallos seguidos; el resto de la tanda volvió a "Nuevo".${causa}`
      : fallidos ? `${fallidos} envíos fallaron; esos prospectos volvieron a "Nuevo".${causa}` : null,
  }).where(eq(barridos.id, barridoId)).run();
}
