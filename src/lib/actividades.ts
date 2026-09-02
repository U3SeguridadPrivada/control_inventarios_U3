import { db } from '@/src/db';
import { prospecto_actividades, clientes } from '@/src/db/schema';
import { eq } from 'drizzle-orm';

export interface NuevaActividad {
  clienteId: number;
  usuarioId?: number | null;
  tipo: 'correo' | 'whatsapp' | 'llamada' | 'nota' | 'etapa' | 'asignacion';
  asunto?: string | null;
  mensaje?: string | null;
  estado?: 'ok' | 'error';
  detalleError?: string | null;
}

/**
 * Registra un movimiento en la bitácora del prospecto. Los envíos efectivos
 * (correo, WhatsApp, llamada) además sellan `ultimo_contacto`, que es lo que
 * ordena la cartera: primero lo que lleva más tiempo sin tocarse.
 */
export function registrarActividad(a: NuevaActividad) {
  const fila = db.insert(prospecto_actividades).values({
    cliente_id: a.clienteId,
    usuario_id: a.usuarioId ?? null,
    tipo: a.tipo,
    asunto: a.asunto ?? null,
    mensaje: a.mensaje ?? null,
    estado: a.estado || 'ok',
    detalle_error: a.detalleError ?? null,
  }).returning().get();

  const esContacto = ['correo', 'whatsapp', 'llamada'].includes(a.tipo);
  if (esContacto && (a.estado || 'ok') === 'ok') {
    db.update(clientes)
      .set({ ultimo_contacto: new Date().toISOString() })
      .where(eq(clientes.id, a.clienteId))
      .run();
  }
  return fila;
}
