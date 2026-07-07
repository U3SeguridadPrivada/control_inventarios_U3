import { NextRequest } from 'next/server';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

function clienteImapDe(u: { correo_imap_host: string | null; correo_imap_puerto: number | null; correo_ssl: number; correo_usuario: string | null; correo_password: string | null }) {
  if (!u.correo_imap_host || !u.correo_usuario || !u.correo_password) return null;
  return new ImapFlow({
    host: u.correo_imap_host,
    port: u.correo_imap_puerto ?? 993,
    secure: u.correo_ssl === 1,
    auth: { user: u.correo_usuario, pass: u.correo_password },
    logger: false,
  });
}

// GET /api/correo/externo         → últimos mensajes de la bandeja IMAP personal
// GET /api/correo/externo?uid=123 → cuerpo completo (HTML/texto) de un mensaje
export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const u = db.select().from(users).where(eq(users.id, authUser.id)).get();
  if (!u) return unauthorized();

  const client = clienteImapDe(u);
  if (!client) return Response.json({ error: 'Configura tu buzón personal (IMAP) en "Mi correo y firma"' }, { status: 428 });

  const uid = req.nextUrl.searchParams.get('uid');

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      if (uid) {
        const bajado = await client.download(uid, undefined, { uid: true });
        if (!bajado?.content) return Response.json({ error: 'Mensaje no encontrado' }, { status: 404 });
        const parsed = await simpleParser(bajado.content);
        return Response.json({
          uid: Number(uid),
          asunto: parsed.subject || '(sin asunto)',
          de: parsed.from?.text || '',
          fecha: parsed.date?.toISOString() || null,
          html: parsed.html || null,
          texto: parsed.text || '',
          adjuntos: (parsed.attachments || []).map((a) => ({ nombre: a.filename || 'adjunto', tipo: a.contentType })),
        });
      }

      const mailbox = client.mailbox;
      const total = typeof mailbox === 'object' && mailbox ? mailbox.exists : 0;
      if (!total) return Response.json([]);

      const desde = Math.max(1, total - 24);
      const lista: any[] = [];
      for await (const msg of client.fetch(`${desde}:*`, { envelope: true, uid: true, flags: true })) {
        lista.push({
          uid: msg.uid,
          asunto: msg.envelope?.subject || '(sin asunto)',
          de: msg.envelope?.from?.[0]?.name || msg.envelope?.from?.[0]?.address || '—',
          deCorreo: msg.envelope?.from?.[0]?.address || '',
          fecha: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null,
          leido: msg.flags?.has('\\Seen') ?? false,
        });
      }
      lista.reverse();
      return Response.json(lista);
    } finally {
      lock.release();
    }
  } catch (e: any) {
    console.error('IMAP:', e?.message);
    return Response.json({ error: 'No se pudo conectar al buzón: ' + (e?.responseText || e?.message || 'error desconocido') }, { status: 502 });
  } finally {
    try { await client.logout(); } catch { /* conexión ya cerrada */ }
  }
}
