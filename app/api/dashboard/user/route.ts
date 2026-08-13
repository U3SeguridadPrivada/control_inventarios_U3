import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { users, eventos_calendario, protocolos, incidencias, guardias } from '@/src/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { ImapFlow } from 'imapflow';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const user = db.select({
    id: users.id,
    username: users.username,
    email: users.email,
    role: users.role,
    correo_imap_host: users.correo_imap_host,
    correo_imap_puerto: users.correo_imap_puerto,
    correo_ssl: users.correo_ssl,
    correo_usuario: users.correo_usuario,
    correo_password: users.correo_password,
  }).from(users).where(eq(users.id, authUser.id)).get();

  if (!user) return unauthorized();

  const hasImapConfigured = Boolean(
    user.correo_imap_host && user.correo_usuario && user.correo_password
  );

  // 1. Obtener eventos/tareas (de hoy y próximos)
  const todayStr = new Date().toISOString().split('T')[0];
  const allEvents = db
    .select({
      id: eventos_calendario.id,
      titulo: eventos_calendario.titulo,
      descripcion: eventos_calendario.descripcion,
      fecha_inicio: eventos_calendario.fecha_inicio,
      fecha_fin: eventos_calendario.fecha_fin,
      todo_el_dia: eventos_calendario.todo_el_dia,
      creado_por: eventos_calendario.creado_por,
      guardia_id: eventos_calendario.guardia_id,
      notificar_minutos_antes: eventos_calendario.notificar_minutos_antes,
    })
    .from(eventos_calendario)
    .orderBy(desc(eventos_calendario.fecha_inicio))
    .limit(30)
    .all();

  // Filtrar tareas de hoy y próximas
  const todayEvents = allEvents.filter(e => e.fecha_inicio && e.fecha_inicio.startsWith(todayStr));
  const upcomingEvents = allEvents.filter(e => e.fecha_inicio && e.fecha_inicio >= todayStr).slice(0, 8);

  // 2. Protocolos activos (priorizar Emergencia y Alta)
  const activeProtocols = db
    .select({
      id: protocolos.id,
      titulo: protocolos.titulo,
      categoria: protocolos.categoria,
      descripcion: protocolos.descripcion,
      tipo: protocolos.tipo,
      pasos: protocolos.pasos,
      prioridad: protocolos.prioridad,
      activo: protocolos.activo,
      actualizado_en: protocolos.actualizado_en,
    })
    .from(protocolos)
    .where(eq(protocolos.activo, 1))
    .all();

  // 3. Incidencias recientes / abiertas
  const recentIncidencias = db
    .select({
      id: incidencias.id,
      guardia_id: incidencias.guardia_id,
      tipo: incidencias.tipo,
      gravedad: incidencias.gravedad,
      fecha: incidencias.fecha,
      descripcion: incidencias.descripcion,
      estado: incidencias.estado,
    })
    .from(incidencias)
    .orderBy(desc(incidencias.id))
    .limit(5)
    .all();

  // 4. Guardias activos y estadísticas rápidas
  const guardiasCount = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(guardias)
    .where(eq(guardias.estado, 'Activo'))
    .get();

  // 5. Consulta rápida de correo si IMAP está configurado (con timeout seguro)
  let unreadEmailsCount = 0;
  let recentEmails: Array<{ uid: number; subject: string; from: string; date: string; seen: boolean }> = [];

  if (hasImapConfigured) {
    try {
      const client = new ImapFlow({
        host: user.correo_imap_host!,
        port: user.correo_imap_puerto ?? 993,
        secure: user.correo_ssl === 1,
        auth: { user: user.correo_usuario!, pass: user.correo_password! },
        logger: false,
        connectionTimeout: 4000,
        greetingTimeout: 3000,
        socketTimeout: 5000,
      });

      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        const status = await client.status('INBOX', { unseen: true });
        unreadEmailsCount = status.unseen ?? 0;

        // Obtener los últimos 4 correos para vista previa
        const mailbox = client.mailbox;
        if (mailbox && mailbox.exists > 0) {
          const fetchRange = `${Math.max(1, mailbox.exists - 3)}:*`;
          const messages: any[] = [];
          for await (const msg of client.fetch(fetchRange, { envelope: true, flags: true, uid: true })) {
            messages.push({
              uid: msg.uid,
              subject: msg.envelope?.subject || '(Sin asunto)',
              from: msg.envelope?.from?.[0]?.name || msg.envelope?.from?.[0]?.address || 'Desconocido',
              date: msg.envelope?.date ? msg.envelope.date.toISOString() : new Date().toISOString(),
              seen: msg.flags?.has('\\Seen') ?? false,
            });
          }
          recentEmails = messages.reverse();
        }
      } finally {
        lock.release();
        await client.logout().catch(() => {});
      }
    } catch {
      // Si falla IMAP por timeout o credenciales, devolver 0 silenciosamente sin bloquear el dashboard
      unreadEmailsCount = 0;
    }
  }

  return Response.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      hasImapConfigured,
    },
    metrics: {
      unreadEmailsCount,
      todayTasksCount: todayEvents.length,
      activeProtocolsCount: activeProtocols.length,
      openIncidenciasCount: recentIncidencias.filter(i => i.estado === 'Abierta' || !i.estado).length,
      guardiasActivosCount: guardiasCount?.count ?? 0,
    },
    todayEvents,
    upcomingEvents,
    protocols: activeProtocols,
    recentIncidencias,
    recentEmails,
  });
}
