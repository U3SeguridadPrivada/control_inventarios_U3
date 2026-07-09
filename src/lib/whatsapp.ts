import { db } from '@/src/db';
import { whatsapp_chats } from '@/src/db/schema';
import { eq, sql } from 'drizzle-orm';

// Limpia números de teléfono a solo dígitos (remueve @c.us y símbolos)
export function cleanPhoneNumber(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.split('@')[0];
  cleaned = cleaned.replace(/\D/g, '');
  return cleaned;
}

// Match por los últimos dígitos para tolerar prefijos de país (+52, +52 1)
export function phoneMatches(dbPhone: string | null, incoming: string): boolean {
  if (!dbPhone) return false;
  const cleanDb = cleanPhoneNumber(dbPhone);
  const minLen = Math.min(cleanDb.length, incoming.length);
  if (minLen < 7) return false;
  return cleanDb.slice(-minLen) === incoming.slice(-minLen);
}

// Asegura que exista la fila del chat y actualiza su última actividad
export function tocarChat(telefono: string, opts?: { incrementarNoLeidos?: boolean }) {
  const ahora = new Date().toISOString();
  const existente = db.select().from(whatsapp_chats).where(eq(whatsapp_chats.telefono, telefono)).get();
  if (existente) {
    db.update(whatsapp_chats).set({
      ultima_actividad: ahora,
      ...(opts?.incrementarNoLeidos ? { no_leidos: sql`${whatsapp_chats.no_leidos} + 1` } : {}),
    }).where(eq(whatsapp_chats.telefono, telefono)).run();
    return existente;
  }
  return db.insert(whatsapp_chats).values({
    telefono,
    ultima_actividad: ahora,
    no_leidos: opts?.incrementarNoLeidos ? 1 : 0,
  }).returning().get();
}

// Envía un mensaje de texto vía WASender API
export async function enviarMensajeWASender(to: string, messageText: string): Promise<{ ok: boolean; error?: string }> {
  let url = process.env.WASENDER_API_URL || 'https://www.wasenderapi.com/api/send-message';

  // Autocorrección del endpoint si viene con el formato anterior/obsoleto
  if (url === 'https://api.wasender.com/v1/messages/send') {
    url = 'https://www.wasenderapi.com/api/send-message';
  }

  const apiKey = process.env.WASENDER_API_KEY;

  if (!apiKey) {
    console.warn('Advertencia: WASENDER_API_KEY no está configurado. No se envió el mensaje.');
    return { ok: false, error: 'WASENDER_API_KEY no está configurado en el servidor' };
  }

  try {
    const payload = {
      to: to,
      recipient: to,
      number: to,
      message: messageText,
      text: messageText,
      type: 'text',
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Error de API de WASender (Status ${res.status}):`, errText);
      return { ok: false, error: `WASender respondió ${res.status}` };
    }
    return { ok: true };
  } catch (err: any) {
    console.error('Error al realizar fetch a WASender:', err);
    return { ok: false, error: err.message };
  }
}

// Envía un mensaje de texto vía WhatsApp Cloud API (oficial de Meta)
export async function enviarMensajeMeta(to: string, messageText: string): Promise<{ ok: boolean; error?: string }> {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const token = process.env.META_ACCESS_TOKEN;
  const version = process.env.META_GRAPH_VERSION || 'v21.0';

  if (!phoneNumberId || !token) {
    console.warn('Advertencia: faltan META_PHONE_NUMBER_ID o META_ACCESS_TOKEN. No se envió el mensaje.');
    return { ok: false, error: 'Faltan credenciales de Meta (META_PHONE_NUMBER_ID / META_ACCESS_TOKEN)' };
  }

  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: messageText },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Error de Meta Cloud API (Status ${res.status}):`, errText);
      return { ok: false, error: `Meta respondió ${res.status}` };
    }
    return { ok: true };
  } catch (err: any) {
    console.error('Error al realizar fetch a Meta Cloud API:', err);
    return { ok: false, error: err.message };
  }
}

// Envía un mensaje de texto vía Kapso API (proxy oficial de Meta)
export async function enviarMensajeKapso(to: string, messageText: string): Promise<{ ok: boolean; error?: string }> {
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;
  const apiKey = process.env.KAPSO_API_KEY;
  const version = process.env.KAPSO_VERSION || 'v24.0';

  if (!phoneNumberId || !apiKey) {
    console.warn('Advertencia: faltan KAPSO_PHONE_NUMBER_ID o KAPSO_API_KEY. No se envió el mensaje.');
    return { ok: false, error: 'Faltan credenciales de Kapso (KAPSO_PHONE_NUMBER_ID / KAPSO_API_KEY)' };
  }

  const url = `https://api.kapso.ai/meta/whatsapp/${version}/${phoneNumberId}/messages`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: messageText },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Error de Kapso API (Status ${res.status}):`, errText);
      return { ok: false, error: `Kapso respondió ${res.status}` };
    }
    return { ok: true };
  } catch (err: any) {
    console.error('Error al realizar fetch a Kapso API:', err);
    return { ok: false, error: err.message };
  }
}

// Envía por el proveedor activo (WHATSAPP_PROVIDER=meta, wasender o kapso)
export async function enviarMensajeWhatsApp(to: string, messageText: string): Promise<{ ok: boolean; error?: string }> {
  const provider = (process.env.WHATSAPP_PROVIDER || 'wasender').toLowerCase();
  if (provider === 'meta') {
    return enviarMensajeMeta(to, messageText);
  } else if (provider === 'kapso') {
    return enviarMensajeKapso(to, messageText);
  } else {
    return enviarMensajeWASender(to, messageText);
  }
}

// Envía estado "escribiendo" (typing indicator) a Kapso (Meta Cloud API)
export async function mostrarEscribiendoKapso(to: string, messageId: string): Promise<void> {
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;
  const apiKey = process.env.KAPSO_API_KEY;
  const version = process.env.KAPSO_VERSION || 'v24.0';

  if (!phoneNumberId || !apiKey || !messageId) return;

  const url = `https://api.kapso.ai/meta/whatsapp/${version}/${phoneNumberId}/messages`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
        typing_indicator: {
          type: 'text'
        }
      }),
    });
  } catch (err) {
    console.error('Error al mostrar escribiendo en Kapso:', err);
  }
}


