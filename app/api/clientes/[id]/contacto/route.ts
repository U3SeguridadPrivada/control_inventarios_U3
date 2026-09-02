import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { clientes, whatsapp_chats, whatsapp_conversaciones } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { accesoDeUsuario } from '@/src/lib/accesoUsuario';
import { puedeVerModulo } from '@/src/lib/permisosModulos';
import { registrarActividad } from '@/src/lib/actividades';
import { enviarCorreo } from '@/src/lib/mailer';
import { enviarMensajeWhatsApp, tocarChat } from '@/src/lib/whatsapp';
import { telefonoWhatsApp, textoAHtml } from '@/src/lib/pipeline';

/**
 * Envía el primer contacto (o el seguimiento) por correo o WhatsApp y lo deja
 * asentado en la bitácora. El correo sale con el buzón y la firma del asesor
 * cuando los tiene configurados; si no, con el SMTP del sitio.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (!puedeVerModulo('clientes', accesoDeUsuario(authUser.id))) return forbidden();
  if (authUser.role === 'viewer') return forbidden();

  const { id } = await params;
  const clienteId = Number(id);
  const cliente = db.select().from(clientes).where(eq(clientes.id, clienteId)).get();
  if (!cliente) return Response.json({ error: 'Prospecto no encontrado' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: 'Solicitud mal formada' }, { status: 400 });
  const canal: string = body.canal;
  const asunto: string = body.asunto || '';
  const mensaje: string = body.mensaje || '';
  if (!mensaje.trim()) return Response.json({ error: 'El mensaje viene vacío' }, { status: 400 });

  if (canal === 'correo') {
    if (!cliente.email) return Response.json({ error: 'El prospecto no tiene correo registrado' }, { status: 400 });
    if (!asunto.trim()) return Response.json({ error: 'Falta el asunto' }, { status: 400 });

    try {
      await enviarCorreo({
        remitenteId: authUser.id,
        para: cliente.email,
        asunto: asunto.trim(),
        // El asesor escribe texto plano; se escapa y se maqueta aquí.
        cuerpoHtml: textoAHtml(mensaje),
      });
    } catch (e) {
      const detalle = e instanceof Error ? e.message : 'Error desconocido';
      registrarActividad({
        clienteId, usuarioId: authUser.id, tipo: 'correo',
        asunto: asunto.trim(), mensaje, estado: 'error', detalleError: detalle,
      });
      return Response.json({ error: `No se pudo enviar el correo: ${detalle}` }, { status: 502 });
    }

    registrarActividad({ clienteId, usuarioId: authUser.id, tipo: 'correo', asunto: asunto.trim(), mensaje });
    avanzarSiEsNuevo(cliente.id, cliente.etapa);
    return Response.json({ ok: true, canal: 'correo', para: cliente.email });
  }

  if (canal === 'whatsapp') {
    const destino = telefonoWhatsApp(cliente.telefono);
    if (!destino) {
      return Response.json({ error: 'El teléfono del prospecto no es un número móvil de 10 dígitos' }, { status: 400 });
    }

    const envio = await enviarMensajeWhatsApp(destino, mensaje);
    if (!envio.ok) {
      registrarActividad({
        clienteId, usuarioId: authUser.id, tipo: 'whatsapp',
        mensaje, estado: 'error', detalleError: envio.error,
      });
      return Response.json({ error: `No se pudo enviar el WhatsApp: ${envio.error}` }, { status: 502 });
    }

    // El chat queda en la bandeja como conversación humana. El bot de RRHH se
    // apaga para este número: quien conteste una oferta comercial debe caer con
    // el asesor, no con el asistente de reclutamiento.
    tocarChat(destino);
    db.update(whatsapp_chats).set({ bot_activo: 0 }).where(eq(whatsapp_chats.telefono, destino)).run();
    db.insert(whatsapp_conversaciones).values({
      telefono: destino, rol: 'model', autor: 'humano', mensaje,
    }).run();

    registrarActividad({ clienteId, usuarioId: authUser.id, tipo: 'whatsapp', mensaje });
    avanzarSiEsNuevo(cliente.id, cliente.etapa);
    return Response.json({ ok: true, canal: 'whatsapp', para: destino });
  }

  return Response.json({ error: 'Canal no válido' }, { status: 400 });
}

/** Un prospecto contactado ya no es "Nuevo": el embudo avanza solo. */
function avanzarSiEsNuevo(clienteId: number, etapaActual: string) {
  if (etapaActual !== 'Nuevo') return;
  db.update(clientes).set({ etapa: 'Contactado' }).where(eq(clientes.id, clienteId)).run();
}
