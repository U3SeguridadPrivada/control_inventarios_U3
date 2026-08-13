import { NextRequest } from 'next/server';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

const PAGINA_DEFECTO = 50;
const PAGINA_MAXIMA = 100;

function clienteImapDe(u: { correo_imap_host: string | null; correo_imap_puerto: number | null; correo_ssl: number; correo_usuario: string | null; correo_password: string | null }) {
  if (!u.correo_imap_host || !u.correo_usuario || !u.correo_password) return null;
  return new ImapFlow({
    host: u.correo_imap_host,
    port: u.correo_imap_puerto ?? 993,
    secure: u.correo_ssl === 1,
    auth: { user: u.correo_usuario, pass: u.correo_password },
    logger: false,
    // Fallar rápido si el servidor no responde, en vez de dejar la petición
    // (y el spinner de "Cargando carpetas") colgada indefinidamente.
    connectionTimeout: 10000,
    greetingTimeout: 8000,
    socketTimeout: 20000,
  });
}

// GET /api/correo/externo                    → página más reciente de la carpeta
// GET /api/correo/externo?offset=50&limit=50 → páginas anteriores, hasta agotar la carpeta
// GET /api/correo/externo?uid=123            → cuerpo completo (HTML/texto) de un mensaje
// GET /api/correo/externo?action=folders     → lista de todas las carpetas del buzón
// GET /api/correo/externo?action=unread      → número de mensajes sin leer de una carpeta
export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const u = db.select().from(users).where(eq(users.id, authUser.id)).get();
  if (!u) return unauthorized();

  const client = clienteImapDe(u);
  if (!client) return Response.json({ error: 'Configura tu buzón personal (IMAP) en "Mi correo y firma"' }, { status: 428 });

  const uid = req.nextUrl.searchParams.get('uid');
  const action = req.nextUrl.searchParams.get('action');
  const folder = req.nextUrl.searchParams.get('folder') || 'INBOX';
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset')) || 0);
  const limit = Math.min(PAGINA_MAXIMA, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || PAGINA_DEFECTO));

  try {
    await client.connect();

    if (action === 'folders') {
      const folders = await client.list();
      const mapped = folders.map((f) => ({
        path: f.path,
        name: f.name,
        delimiter: f.delimiter,
        specialUse: f.specialUse ? String(f.specialUse) : null,
        flags: Array.from(f.flags || []),
      }));
      return Response.json(mapped);
    }

    // STATUS no necesita abrir la carpeta: es barato y sirve para el globo del header.
    if (action === 'unread') {
      const estado = await client.status(folder, { unseen: true });
      return Response.json({ count: estado?.unseen ?? 0 });
    }

    const lock = await client.getMailboxLock(folder);
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

      // Paginamos sobre la lista completa de UID (orden ascendente = del más
      // viejo al más nuevo) en vez de sobre números de secuencia: los UID no se
      // recorren cuando llega correo nuevo entre una página y la siguiente, así
      // que el usuario nunca ve un mensaje repetido ni se le salta uno.
      const todos = ((await client.search({ all: true }, { uid: true })) || []) as number[];
      const total = todos.length;

      const hasta = total - offset;
      if (hasta <= 0) return Response.json({ mensajes: [], total, offset, nextOffset: offset, hasMore: false });

      const desde = Math.max(0, hasta - limit);
      const pagina = todos.slice(desde, hasta);

      const lista: any[] = [];
      for await (const msg of client.fetch(pagina.join(','), { envelope: true, uid: true, flags: true }, { uid: true })) {
        lista.push({
          uid: msg.uid,
          asunto: msg.envelope?.subject || '(sin asunto)',
          de: msg.envelope?.from?.[0]?.name || msg.envelope?.from?.[0]?.address || '—',
          deCorreo: msg.envelope?.from?.[0]?.address || '',
          fecha: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null,
          leido: msg.flags?.has('\\Seen') ?? false,
        });
      }
      // El servidor puede devolverlos en cualquier orden; el UID más alto es el más reciente.
      lista.sort((a, b) => b.uid - a.uid);

      // nextOffset se calcula sobre los UID pedidos, no sobre los que el
      // servidor alcanzó a devolver, para que una página incompleta no
      // desalinee la siguiente.
      return Response.json({ mensajes: lista, total, offset, nextOffset: total - desde, hasMore: desde > 0 });
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
