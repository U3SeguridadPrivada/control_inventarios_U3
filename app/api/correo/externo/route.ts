import { NextRequest } from 'next/server';
import { simpleParser } from 'mailparser';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { conImap, imapConfigurado } from '@/src/lib/imapPool';

const PAGINA_DEFECTO = 50;
const PAGINA_MAXIMA = 100;
// Tope del cuerpo de texto/HTML de un mensaje y de un adjunto que se sirve al navegador.
const MAX_CUERPO = 8 * 1024 * 1024;
const MAX_ADJUNTO = 40 * 1024 * 1024;

// ── BODYSTRUCTURE ────────────────────────────────────────────────────────────
// Con la estructura del mensaje se sabe qué parte es el cuerpo y cuáles son los
// adjuntos SIN descargar el mensaje completo. Antes se bajaba el .eml entero
// (adjuntos incluidos) sólo para mostrar el texto: un correo con un PDF de 15 MB
// tardaba lo que tardara en transferirse ese PDF.

interface NodoMime {
  part?: string;
  type?: string;
  encoding?: string;
  size?: number;
  disposition?: string;
  parameters?: Record<string, string>;
  dispositionParameters?: Record<string, string>;
  childNodes?: NodoMime[];
}

interface AdjuntoInfo { parte: string; nombre: string; tipo: string; tamano: number }

function recorrer(nodo: NodoMime, visita: (n: NodoMime) => void) {
  visita(nodo);
  for (const hijo of nodo.childNodes || []) recorrer(hijo, visita);
}

function nombreDe(n: NodoMime): string {
  const crudo = n.dispositionParameters?.filename || n.parameters?.name || '';
  // Los nombres vienen ya decodificados por imapflow; sólo se limpia lo que
  // rompería la cabecera Content-Disposition o una ruta del sistema.
  return crudo.replace(/[\r\n"/\\]/g, '_').trim();
}

// BODYSTRUCTURE reporta bytes codificados; base64 infla ~33% sobre el original.
function tamanoReal(n: NodoMime): number {
  const s = n.size || 0;
  return n.encoding === 'base64' ? Math.round(s * 0.75) : s;
}

function analizarEstructura(raiz: NodoMime) {
  let parteHtml: string | null = null;
  let parteTexto: string | null = null;
  const adjuntos: AdjuntoInfo[] = [];
  let sinNombre = 0;

  recorrer(raiz, (n) => {
    const tipo = (n.type || '').toLowerCase();
    if (tipo.startsWith('multipart/')) return;
    // En un mensaje de una sola parte la raíz no trae número: su cuerpo es BODY[1].
    const parte = n.part || '1';

    if (n.disposition !== 'attachment') {
      if (tipo === 'text/html' && !parteHtml) { parteHtml = parte; return; }
      if (tipo === 'text/plain' && !parteTexto) { parteTexto = parte; return; }
    }

    const subtipo = tipo.split('/')[1] || 'bin';
    adjuntos.push({
      parte,
      nombre: nombreDe(n) || `adjunto-${++sinNombre}.${subtipo.replace(/[^a-z0-9]/g, '') || 'bin'}`,
      tipo: tipo || 'application/octet-stream',
      tamano: tamanoReal(n),
    });
  });

  return { parteHtml: parteHtml as string | null, parteTexto: parteTexto as string | null, adjuntos };
}

async function aBuffer(stream: NodeJS.ReadableStream, maxBytes: number): Promise<Buffer> {
  const trozos: Buffer[] = [];
  let total = 0;
  for await (const t of stream as AsyncIterable<Buffer | string>) {
    const b = Buffer.isBuffer(t) ? t : Buffer.from(t);
    total += b.length;
    if (total > maxBytes) throw new Error('El archivo supera el tamaño máximo permitido');
    trozos.push(b);
  }
  return Buffer.concat(trozos);
}

function remitenteDe(envelope: any): string {
  const f = envelope?.from?.[0];
  if (!f) return '';
  return f.name ? `${f.name} <${f.address}>` : (f.address || '');
}

// GET /api/correo/externo                          → página más reciente de la carpeta
// GET /api/correo/externo?offset=50&limit=50       → páginas anteriores, hasta agotar la carpeta
// GET /api/correo/externo?uid=123                  → cuerpo (HTML/texto) y lista de adjuntos
// GET /api/correo/externo?uid=123&parte=2          → descarga de un adjunto concreto
// GET /api/correo/externo?action=folders           → lista de todas las carpetas del buzón
// GET /api/correo/externo?action=unread            → número de mensajes sin leer de una carpeta
export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const u = db.select().from(users).where(eq(users.id, authUser.id)).get();
  if (!u) return unauthorized();

  if (!imapConfigurado(u)) return Response.json({ error: 'Configura tu buzón personal (IMAP) en "Mi correo y firma"' }, { status: 428 });

  const uid = req.nextUrl.searchParams.get('uid');
  const parteAdjunto = req.nextUrl.searchParams.get('parte');
  const action = req.nextUrl.searchParams.get('action');
  const folder = req.nextUrl.searchParams.get('folder') || 'INBOX';
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset')) || 0);
  const limit = Math.min(PAGINA_MAXIMA, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || PAGINA_DEFECTO));

  try {
    return await conImap(authUser.id, u, async (client) => {
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
        // ── Descarga de un adjunto ──
        if (uid && parteAdjunto) {
          const msg = await client.fetchOne(uid, { bodyStructure: true }, { uid: true });
          const info = msg && msg.bodyStructure
            ? analizarEstructura(msg.bodyStructure as NodoMime).adjuntos.find((a) => a.parte === parteAdjunto)
            : undefined;

          let datos: Buffer;
          let nombre: string;
          let tipo: string;

          if (info) {
            // imapflow pide la parte a trozos: con los 64 KB por defecto un PDF de
            // 10 MB serían ~160 idas y vueltas al servidor. Con 512 KB son ~20.
            const bajado = await client.download(uid, parteAdjunto, { uid: true, maxBytes: MAX_ADJUNTO, chunkSize: 512 * 1024 });
            if (!bajado?.content) return Response.json({ error: 'Adjunto no encontrado' }, { status: 404 });
            datos = await aBuffer(bajado.content, MAX_ADJUNTO);
            nombre = bajado.meta?.filename || info.nombre;
            tipo = bajado.meta?.contentType || info.tipo;
          } else {
            // Sin BODYSTRUCTURE utilizable: se baja el mensaje completo y se busca
            // el adjunto por su número de parte, para que igual se pueda abrir.
            const completo = await client.download(uid, undefined, { uid: true, chunkSize: 512 * 1024 });
            if (!completo?.content) return Response.json({ error: 'Mensaje no encontrado' }, { status: 404 });
            const parsed = await simpleParser(completo.content);
            const adj = (parsed.attachments || []).find((a, i) => ((a as { partId?: string }).partId || String(i + 1)) === parteAdjunto);
            if (!adj) return Response.json({ error: 'Adjunto no encontrado' }, { status: 404 });
            datos = adj.content as Buffer;
            nombre = adj.filename || 'adjunto';
            tipo = adj.contentType || 'application/octet-stream';
          }

          const ascii = nombre.replace(/[^\x20-\x7e]/g, '_');
          // `inline` deja que el navegador muestre PDF e imágenes; el resto se descarga.
          const modo = req.nextUrl.searchParams.get('ver') === '1' ? 'inline' : 'attachment';
          return new Response(datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength) as ArrayBuffer, {
            headers: {
              'Content-Type': tipo,
              'Content-Length': String(datos.length),
              'Content-Disposition': `${modo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
              'Cache-Control': 'private, max-age=600',
            },
          });
        }

        // ── Cuerpo del mensaje ──
        if (uid) {
          const msg = await client.fetchOne(uid, { bodyStructure: true, envelope: true }, { uid: true });
          if (!msg) return Response.json({ error: 'Mensaje no encontrado' }, { status: 404 });

          const estructura = msg.bodyStructure ? analizarEstructura(msg.bodyStructure as NodoMime) : null;
          const parteCuerpo = estructura?.parteHtml || estructura?.parteTexto || null;

          if (estructura && parteCuerpo) {
            const bajado = await client.download(uid, parteCuerpo, { uid: true, maxBytes: MAX_CUERPO, chunkSize: 256 * 1024 });
            const cuerpo = bajado?.content ? (await aBuffer(bajado.content, MAX_CUERPO)).toString('utf8') : '';
            const esHtml = parteCuerpo === estructura.parteHtml;
            return Response.json({
              uid: Number(uid),
              asunto: msg.envelope?.subject || '(sin asunto)',
              de: remitenteDe(msg.envelope),
              fecha: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null,
              html: esHtml ? cuerpo : null,
              texto: esHtml ? '' : cuerpo,
              adjuntos: estructura.adjuntos,
            });
          }

          // Sin estructura utilizable (servidor raro o mensaje sin partes de texto):
          // se cae al camino lento de bajar el mensaje completo y parsearlo.
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
            adjuntos: (parsed.attachments || []).map((a, i) => ({
              parte: (a as { partId?: string }).partId || String(i + 1),
              nombre: a.filename || `adjunto-${i + 1}`,
              tipo: a.contentType || 'application/octet-stream',
              tamano: a.size || 0,
            })),
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
    });
  } catch (e: any) {
    console.error('IMAP:', e?.message);
    return Response.json({ error: 'No se pudo conectar al buzón: ' + (e?.responseText || e?.message || 'error desconocido') }, { status: 502 });
  }
}
