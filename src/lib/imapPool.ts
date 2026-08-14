import { ImapFlow } from 'imapflow';

// Abrir una conexión IMAP cuesta un handshake TLS + LOGIN (fácilmente 1-2 s con
// el hosting). La pantalla de correo hace varias peticiones seguidas (carpetas,
// listado, no leídos, detalle del mensaje), así que reconectar en cada una era
// buena parte de lo que hacía lento abrir un correo.
//
// Aquí se guarda una conexión viva por usuario y se reutiliza mientras siga
// usable. Queda ociosa unos minutos y se cierra sola; los servidores IMAP la
// cortan a los 30 min de inactividad, así que se renueva mucho antes.

export interface ConfigImap {
  correo_imap_host: string | null;
  correo_imap_puerto: number | null;
  correo_ssl: number;
  correo_usuario: string | null;
  correo_password: string | null;
}

const OCIOSA_MS = 4 * 60 * 1000;

interface Entrada {
  clave: string;
  cliente: Promise<ImapFlow>;
  prestamos: number;
  cierre: NodeJS.Timeout | null;
}

// En dev, Next recarga los módulos de las rutas: el pool vive en globalThis para
// que una recarga no deje conexiones huérfanas sin nadie que las cierre.
const global_ = globalThis as unknown as { __u3ImapPool?: Map<number, Entrada> };
const pool: Map<number, Entrada> = (global_.__u3ImapPool ??= new Map());

export function imapConfigurado(u: ConfigImap): boolean {
  return !!(u.correo_imap_host && u.correo_usuario && u.correo_password);
}

function claveDe(u: ConfigImap) {
  return `${u.correo_imap_host}|${u.correo_imap_puerto ?? 993}|${u.correo_usuario}|${u.correo_ssl}|${u.correo_password}`;
}

function crearCliente(u: ConfigImap) {
  return new ImapFlow({
    host: u.correo_imap_host!,
    port: u.correo_imap_puerto ?? 993,
    secure: u.correo_ssl === 1,
    auth: { user: u.correo_usuario!, pass: u.correo_password! },
    logger: false,
    // Fallar rápido si el servidor no responde, en vez de dejar la petición
    // (y el spinner de "Cargando carpetas") colgada indefinidamente.
    connectionTimeout: 10000,
    greetingTimeout: 8000,
    socketTimeout: 20000,
  });
}

// Saca la conexión del pool. Si hay una petición usándola todavía, sólo se
// expulsa: quien la tiene prestada la cerrará al terminar.
function desechar(userId: number, entrada: Entrada) {
  if (pool.get(userId) === entrada) pool.delete(userId);
  if (entrada.cierre) { clearTimeout(entrada.cierre); entrada.cierre = null; }
  if (entrada.prestamos > 0) return;
  entrada.cliente
    .then((c) => c.logout().catch(() => c.close()))
    .catch(() => { /* nunca llegó a conectar */ });
}

function programarCierre(userId: number, entrada: Entrada) {
  if (entrada.cierre) clearTimeout(entrada.cierre);
  entrada.cierre = setTimeout(() => desechar(userId, entrada), OCIOSA_MS);
  entrada.cierre.unref?.();
}

// Ejecuta `fn` con una conexión IMAP lista del usuario. La conexión se reutiliza
// entre peticiones; si algo falla se descarta para que la siguiente reconecte
// limpia en vez de heredar un socket en mal estado.
export async function conImap<T>(userId: number, u: ConfigImap, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const clave = claveDe(u);
  let entrada = pool.get(userId);

  // Credenciales cambiadas: se tira la conexión anterior y se abre otra.
  if (entrada && entrada.clave !== clave) {
    desechar(userId, entrada);
    entrada = undefined;
  }

  if (!entrada) {
    const nueva: Entrada = { clave, prestamos: 0, cierre: null, cliente: null as never };
    nueva.cliente = (async () => {
      const client = crearCliente(u);
      // Sin listener de 'error', un socket caído tumbaría el proceso.
      client.on('error', () => desechar(userId, nueva));
      client.on('close', () => desechar(userId, nueva));
      await client.connect();
      return client;
    })();
    nueva.cliente.catch(() => desechar(userId, nueva));
    pool.set(userId, nueva);
    entrada = nueva;
  }

  const actual = entrada;
  if (actual.cierre) { clearTimeout(actual.cierre); actual.cierre = null; }
  actual.prestamos++;

  const soltar = () => {
    actual.prestamos--;
    if (actual.prestamos > 0) return;
    // Si ya fue expulsada del pool, ciérrala ahora; si sigue viva, déjala ociosa.
    if (pool.get(userId) === actual) programarCierre(userId, actual);
    else desechar(userId, actual);
  };

  let client: ImapFlow;
  try {
    client = await actual.cliente;
    if (!client.usable) throw new Error('conexión IMAP caída');
  } catch (e) {
    desechar(userId, actual);
    soltar();
    throw e;
  }

  try {
    return await fn(client);
  } catch (e) {
    desechar(userId, actual);
    throw e;
  } finally {
    soltar();
  }
}
