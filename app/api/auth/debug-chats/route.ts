import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { whatsapp_chats, whatsapp_conversaciones } from '@/src/db/schema';

export async function GET(req: NextRequest) {
  try {
    const key = req.headers.get('x-setup-key');
    if (key !== process.env.JWT_SECRET) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }

    const chats = db.select().from(whatsapp_chats).all();
    const mensajes = db.select().from(whatsapp_conversaciones).all();

    return Response.json({
      chatsCount: chats.length,
      mensajesCount: mensajes.length,
      chats,
      mensajes,
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
