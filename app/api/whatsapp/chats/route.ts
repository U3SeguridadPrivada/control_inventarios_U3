import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { sql } from 'drizzle-orm';
import { 
  whatsapp_chats, 
  whatsapp_conversaciones, 
  guardias, 
  clientes, 
  candidatos,
  guardia_documentos,
  entradas,
  salidas,
  uniformes_campo,
  bajas,
  eventos_calendario,
  servicios,
  servicio_guardias,
  incidencias,
  cotizaciones,
  ventas,
  cuentas_bancarias,
  movimientos_financieros,
  password_resets,
  vacantes,
  movimiento_evidencias
} from '@/src/db/schema';
import { desc, eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
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

// El borrado de chats no modifica el inventario ni otros registros del ERP.
export async function DELETE(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();
  const cuerpo = await req.json().catch(() => ({}));
  if (cuerpo?.confirmar !== 'BORRAR CHATS') return Response.json({ error: 'Confirma con BORRAR CHATS. Solo se eliminarán las conversaciones y chats.' }, { status: 400 });
  try {
    db.transaction(tx => { tx.delete(whatsapp_conversaciones).run(); tx.delete(whatsapp_chats).run(); });
    return Response.json({ success: true, message: 'Chats y conversaciones eliminados.' });
  } catch { return Response.json({ error: 'No se pudieron eliminar los chats' }, { status: 500 }); }
}
