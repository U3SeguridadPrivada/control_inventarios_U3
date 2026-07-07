import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { whatsapp_chats, whatsapp_conversaciones, guardias, clientes, candidatos } from '@/src/db/schema';
import { desc, eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { phoneMatches } from '@/src/lib/whatsapp';

// Identifica quién es el contacto detrás de un teléfono
function identificarContacto(telefono: string, listas: {
  guardias: { nombre: string; telefono: string | null }[];
  clientes: { nombre: string; telefono: string | null }[];
  candidatos: { nombre: string | null; telefono: string; etapa: string }[];
}): { nombre: string | null; tipo: string } {
  const g = listas.guardias.find((x) => phoneMatches(x.telefono, telefono));
  if (g) return { nombre: g.nombre, tipo: 'Guardia' };
  const c = listas.clientes.find((x) => phoneMatches(x.telefono, telefono));
  if (c) return { nombre: c.nombre, tipo: 'Cliente' };
  const ca = listas.candidatos.find((x) => phoneMatches(x.telefono, telefono));
  if (ca) return { nombre: ca.nombre, tipo: `Candidato · ${ca.etapa}` };
  return { nombre: null, tipo: 'Desconocido' };
}

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();

  const chats = db.select().from(whatsapp_chats).orderBy(desc(whatsapp_chats.ultima_actividad)).all();
  const listas = {
    guardias: db.select({ nombre: guardias.nombre, telefono: guardias.telefono }).from(guardias).all(),
    clientes: db.select({ nombre: clientes.nombre, telefono: clientes.telefono }).from(clientes).all(),
    candidatos: db.select({ nombre: candidatos.nombre, telefono: candidatos.telefono, etapa: candidatos.etapa }).from(candidatos).all(),
  };

  const resultado = chats.map((chat) => {
    const ultimo = db.select().from(whatsapp_conversaciones)
      .where(eq(whatsapp_conversaciones.telefono, chat.telefono))
      .orderBy(desc(whatsapp_conversaciones.id))
      .limit(1)
      .get();
    const contacto = identificarContacto(chat.telefono, listas);
    return {
      telefono: chat.telefono,
      bot_activo: chat.bot_activo,
      no_leidos: chat.no_leidos,
      ultima_actividad: chat.ultima_actividad,
      ultimo_mensaje: ultimo?.mensaje ?? '',
      ultimo_autor: ultimo?.autor ?? null,
      contacto_nombre: contacto.nombre,
      contacto_tipo: contacto.tipo,
    };
  });

  return Response.json(resultado);
}
