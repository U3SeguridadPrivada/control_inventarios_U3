import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { whatsapp_chats, whatsapp_conversaciones } from '@/src/db/schema';
import { desc, eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { cleanPhoneNumber, tocarChat, enviarMensajeWhatsApp } from '@/src/lib/whatsapp';

// Mensajes de un chat; al abrirlo se marcan como leídos
export async function GET(req: NextRequest, { params }: { params: Promise<{ telefono: string }> }) {
  if (!verifyAuth(req)) return unauthorized();
  const { telefono } = await params;
  const tel = cleanPhoneNumber(telefono);

  const mensajes = db.select().from(whatsapp_conversaciones)
    .where(eq(whatsapp_conversaciones.telefono, tel))
    .orderBy(desc(whatsapp_conversaciones.id))
    .limit(200)
    .all()
    .reverse();

  const chat = db.select().from(whatsapp_chats).where(eq(whatsapp_chats.telefono, tel)).get();
  if (chat && chat.no_leidos > 0) {
    db.update(whatsapp_chats).set({ no_leidos: 0 }).where(eq(whatsapp_chats.telefono, tel)).run();
  }

  return Response.json({ telefono: tel, bot_activo: chat?.bot_activo ?? 1, mensajes });
}

// Envío manual de un mensaje por WASender (toma de control humana)
export async function POST(req: NextRequest, { params }: { params: Promise<{ telefono: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  const { telefono } = await params;
  const tel = cleanPhoneNumber(telefono);

  try {
    const { mensaje, pausar_bot } = await req.json();
    if (!mensaje?.trim()) return Response.json({ error: 'El mensaje está vacío' }, { status: 400 });

    const envio = await enviarMensajeWhatsApp(tel, mensaje.trim());
    if (!envio.ok) return Response.json({ error: envio.error || 'No se pudo enviar el mensaje' }, { status: 502 });

    // rol 'model' para que el bot lo vea como mensaje propio en su memoria
    db.insert(whatsapp_conversaciones).values({ telefono: tel, rol: 'model', autor: 'humano', mensaje: mensaje.trim() }).run();
    tocarChat(tel);

    // Al intervenir un humano, por defecto se pausa el bot para evitar respuestas dobles
    if (pausar_bot !== false) {
      db.update(whatsapp_chats).set({ bot_activo: 0 }).where(eq(whatsapp_chats.telefono, tel)).run();
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Error al enviar el mensaje' }, { status: 500 });
  }
}

// Pausar o reactivar el bot en este chat
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ telefono: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  const { telefono } = await params;
  const tel = cleanPhoneNumber(telefono);

  try {
    const { bot_activo } = await req.json();
    tocarChat(tel);
    const actualizado = db.update(whatsapp_chats)
      .set({ bot_activo: bot_activo ? 1 : 0 })
      .where(eq(whatsapp_chats.telefono, tel))
      .returning()
      .get();
    return Response.json(actualizado);
  } catch {
    return Response.json({ error: 'Error al actualizar el chat' }, { status: 500 });
  }
}
