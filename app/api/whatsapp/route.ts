import { NextRequest } from 'next/server';
import { appendFileSync } from 'fs';
import { createHmac } from 'crypto';
import path from 'path';
import { db } from '@/src/db';
import {
  guardias, clientes, incidencias, servicio_guardias, servicios, salidas, users,
  candidatos, vacantes, whatsapp_conversaciones, eventos_calendario, whatsapp_chats,
} from '@/src/db/schema';
import { eq, desc, like } from 'drizzle-orm';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getConfig } from '@/src/lib/mailer';
import { cleanPhoneNumber, phoneMatches, tocarChat, enviarMensajeWhatsApp, mostrarEscribiendoKapso } from '@/src/lib/whatsapp';

// Inicializar el SDK de Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

const MAX_RONDAS_HERRAMIENTAS = 4;
// Historial que se reenvía en CADA petición al modelo. 20 mensajes dan buena memoria de la
// conversación; el consumo de tokens es manejable con el modelo 8b-instant.
const MENSAJES_MEMORIA = 20;
const DEBOUNCE_MS = 4500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Determina si debemos usar Groq. Evita los valores de plantilla del .env de ejemplo
// (p. ej. "tu_api_key..."), que de otro modo el código tomaría como clave válida y
// terminaría llamando a Groq con un token inválido (401) sin responder nunca.
function usarGroq(): boolean {
  const k = (process.env.GROQ_API_KEY || '').trim();
  return k.startsWith('gsk_');
}

// Gemini disponible como respaldo cuando Groq agota su límite diario de tokens (429).
function usarGemini(): boolean {
  return !!(process.env.GEMINI_API_KEY || '').trim();
}

function esRateLimit(e: any): boolean {
  return e?.rateLimited === true || e?.status === 429 || /429|rate_limit/i.test(e?.message || '');
}

function fechaHoraLocal(): string {
  return new Date().toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Convierte herramientas en formato Gemini a formato OpenAI/Groq (lowercase types)
function mapGeminiToolsToGroq(geminiTools: any[]) {
  if (!geminiTools) return undefined;
  return geminiTools.map((t) => {
    const cleanParams = JSON.parse(
      JSON.stringify(t.parameters || {})
        .replace(/"type":"OBJECT"/g, '"type":"object"')
        .replace(/"type":"STRING"/g, '"type":"string"')
        .replace(/"type":"NUMBER"/g, '"type":"number"')
        .replace(/"type":"BOOLEAN"/g, '"type":"boolean"')
        .replace(/"type":"ARRAY"/g, '"type":"array"')
    );
    return {
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: cleanParams,
      },
    };
  });
}

// Algunos modelos (gpt-oss/llama en Groq) a veces "escriben" la llamada a la herramienta como
// texto en el contenido — p. ej. `actualizarDatosCandidato>{"nombre":"..."}` — en lugar de usar
// el canal nativo de tool_calls. Esto las detecta para (1) ejecutarlas de verdad y (2) que NUNCA
// lleguen al usuario. Se restringe a los nombres reales de herramientas para evitar falsos positivos.
function extraerLlamadasEnTexto(texto: string, nombres: string[]): { name: string; args: any }[] {
  const out: { name: string; args: any }[] = [];
  if (!texto || !nombres?.length) return out;
  const alt = nombres.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`(?:<function=)?\\b(${alt})\\b\\s*[>:(=]*\\s*(\\{[\\s\\S]*?\\})`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    try {
      out.push({ name: m[1], args: JSON.parse(m[2]) });
    } catch {
      /* JSON incompleto: se ignora; de todos modos se limpiará del texto */
    }
  }
  return out;
}

// Quita del texto cualquier rastro de llamadas a herramientas para que el usuario nunca las vea.
function limpiarTextoHerramientas(texto: string, nombres: string[] = []): string {
  let limpia = texto || '';
  limpia = limpia.replace(/<function=\w+>(\{[\s\S]*?\})?/gi, '');
  limpia = limpia.replace(/<function=\w+>/gi, '');
  limpia = limpia.replace(/<\/?function>/gi, '');
  limpia = limpia.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '');
  limpia = limpia.replace(/<\/?\|?tool_call\|?>/gi, '');
  if (nombres.length) {
    const alt = nombres.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    // NAME>{...} / NAME({...}) / NAME:{...} / NAME={...}
    limpia = limpia.replace(new RegExp(`\\b(?:${alt})\\b\\s*[>:(=]+\\s*\\{[\\s\\S]*?\\}\\)?`, 'gi'), '');
  }
  return limpia.trim();
}

// Bucle de conversación con Groq (soporta llamadas a herramientas)
async function conversarConGroq(
  systemInstruction: string,
  historial: { role: 'user' | 'model'; parts: { text: string }[] }[],
  incomingText: string,
  geminiTools: any[],
  ejecutarHerramienta: (name: string, args: any) => any,
  modelOverride?: string,
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  // Modelo configurable por GROQ_MODEL. `modelOverride` permite reintentar con un modelo
  // de respaldo (p. ej. llama-3.1-8b-instant, con TPD mucho más alto) si el principal se agota.
  const model = modelOverride || process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

  if (!apiKey) {
    throw new Error('GROQ_API_KEY no está configurada.');
  }

  const messages: any[] = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }

  for (const h of historial) {
    messages.push({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.parts?.[0]?.text || '',
    });
  }

  messages.push({ role: 'user', content: incomingText });

  const tools = mapGeminiToolsToGroq(geminiTools);
  const nombresTools = (geminiTools || []).map((t) => t.name);
  const limpiar = (texto: string) => limpiarTextoHerramientas(texto, nombresTools);

  for (let ronda = 0; ronda < MAX_RONDAS_HERRAMIENTAS; ronda++) {
    const payload: any = {
      model,
      messages,
      // Los modelos de razonamiento (gpt-oss) gastan tokens "pensando" ANTES de responder, y
      // ese consumo cuenta dentro de max_tokens; con 500 la respuesta salía vacía o cortada.
      // 1024 deja margen para razonamiento + el texto final (que es corto, de WhatsApp).
      max_tokens: 1024,
      temperature: 0.4,
    };
    // gpt-oss admite reasoning_effort; en un bot de WhatsApp no hace falta razonar profundo,
    // 'low' lo mantiene rápido y deja espacio a la respuesta. Otros modelos no lo soportan,
    // así que solo lo enviamos cuando aplica.
    if (/gpt-oss/i.test(model)) {
      payload.reasoning_effort = 'low';
    }
    if (tools && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      const err: any = new Error(`Groq API respondió ${res.status}: ${errText}`);
      err.status = res.status;
      err.rateLimited = res.status === 429;
      throw err;
    }

    const data = await res.json();
    const assistantMessage = data.choices?.[0]?.message;
    if (!assistantMessage) {
      throw new Error('Respuesta vacía de Groq API');
    }

    messages.push(assistantMessage);

    const toolCalls = assistantMessage.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      // ¿El modelo escribió la llamada como texto en vez de usar tool_calls? La ejecutamos de
      // verdad (para que los datos SÍ se guarden) y le pedimos que ahora responda en lenguaje
      // natural. Nunca dejamos ese JSON crudo ni en el historial ni de cara al usuario.
      const enTexto = extraerLlamadasEnTexto(assistantMessage.content || '', nombresTools);
      if (enTexto.length > 0 && ronda < MAX_RONDAS_HERRAMIENTAS - 1) {
        assistantMessage.content = limpiar(assistantMessage.content || '');
        const resultados = enTexto.map((c) => ({
          herramienta: c.name,
          resultado: ejecutarHerramienta(c.name, c.args),
        }));
        messages.push({
          role: 'system',
          content: `Herramientas ejecutadas: ${JSON.stringify(resultados)}. Ahora escribe SOLO tu mensaje para el candidato en lenguaje natural de WhatsApp. Está PROHIBIDO incluir nombres de funciones, JSON o llamadas a herramientas en el texto.`,
        });
        continue;
      }
      return limpiar(assistantMessage.content || '') || 'Perfecto, ¿te apoyo en algo más?';
    }

    for (const call of toolCalls) {
      const args = typeof call.function.arguments === 'string'
        ? JSON.parse(call.function.arguments)
        : call.function.arguments;
      const result = ejecutarHerramienta(call.function.name, args);

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(result),
      });
    }
  }

  const ultimoMsg = messages[messages.length - 1];
  return limpiar(ultimoMsg?.content || '') || 'Perfecto, ¿te apoyo en algo más?';
}

// Conversación con Gemini (respaldo / proveedor por defecto)
async function conversarConGemini(
  systemInstruction: string,
  historial: { role: 'user' | 'model'; parts: { text: string }[] }[],
  incomingText: string,
  geminiTools: any[],
  ejecutarHerramienta: (name: string, args: any) => any,
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const chat = model.startChat({
    history: historial,
    generationConfig: { maxOutputTokens: 600 },
    systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] },
    tools: [{ functionDeclarations: geminiTools }] as any,
  });
  return await conversarConHerramientas(chat, incomingText, ejecutarHerramienta);
}

// Genera la respuesta con el proveedor disponible. Si Groq agota su límite diario de tokens (429),
// reintenta automáticamente con Gemini para que el bot no deje al contacto sin respuesta.
async function generarRespuesta(
  systemInstruction: string,
  historial: { role: 'user' | 'model'; parts: { text: string }[] }[],
  incomingText: string,
  geminiTools: any[],
  ejecutarHerramienta: (name: string, args: any) => any,
): Promise<string> {
  if (usarGroq()) {
    const primario = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
    const RESPALDO_GROQ = 'llama-3.1-8b-instant'; // TPD mucho más alto (500K) para no quedar mudos
    try {
      return await conversarConGroq(systemInstruction, historial, incomingText, geminiTools, ejecutarHerramienta);
    } catch (e) {
      // Si el modelo principal agotó su límite diario, reintenta con el 8b antes de rendirse.
      if (esRateLimit(e) && primario !== RESPALDO_GROQ) {
        console.warn(`Groq (${primario}) alcanzó su límite; reintentando con ${RESPALDO_GROQ}.`);
        try {
          return await conversarConGroq(systemInstruction, historial, incomingText, geminiTools, ejecutarHerramienta, RESPALDO_GROQ);
        } catch (e2) {
          if (esRateLimit(e2) && usarGemini()) {
            console.warn('Groq agotado por completo; usando Gemini como último respaldo.');
            return await conversarConGemini(systemInstruction, historial, incomingText, geminiTools, ejecutarHerramienta);
          }
          throw e2;
        }
      }
      if (esRateLimit(e) && usarGemini()) {
        console.warn('Groq alcanzó su límite de tokens; usando Gemini como respaldo.');
        return await conversarConGemini(systemInstruction, historial, incomingText, geminiTools, ejecutarHerramienta);
      }
      throw e;
    }
  }
  return await conversarConGemini(systemInstruction, historial, incomingText, geminiTools, ejecutarHerramienta);
}


// Devuelve el historial reciente (en el formato que espera Gemini) SEPARANDO la ráfaga de
// mensajes del usuario aún sin responder al final: esos se agrupan en un solo turno `textoAgrupado`
// para que el bot los conteste juntos, y el `historial` termina en el último turno del modelo.
// Así el mensaje entrante no se duplica (antes iba en el historial y además se reenviaba aparte).
// El mismo contacto puede llegar con el número en distintos formatos (p. ej. WhatsApp/Kapso
// entregan los móviles de México como "521XXXXXXXXXX" o "52XXXXXXXXXX"). Para que el bot NO
// pierda el hilo, el historial se busca por los últimos 10 dígitos (el número nacional), igual
// que la identificación del remitente (phoneMatches), en vez de por coincidencia exacta.
function condicionMismoTelefono(telefono: string) {
  const digitos = (telefono || '').replace(/\D/g, '');
  // Sólo agrupamos por sufijo cuando hay suficientes dígitos para evitar falsos positivos.
  if (digitos.length < 10) return eq(whatsapp_conversaciones.telefono, telefono);
  return like(whatsapp_conversaciones.telefono, `%${digitos.slice(-10)}`);
}

function cargarHistorialYPendiente(telefono: string): {
  historial: { role: 'user' | 'model'; parts: { text: string }[] }[];
  textoAgrupado: string;
} {
  const rows = db.select().from(whatsapp_conversaciones)
    .where(condicionMismoTelefono(telefono))
    .orderBy(desc(whatsapp_conversaciones.id))
    .limit(MENSAJES_MEMORIA)
    .all()
    .reverse();

  // Separar los mensajes 'user' consecutivos al final = la ráfaga recién recibida sin responder
  const pendientes: typeof rows = [];
  while (rows.length && rows[rows.length - 1].rol === 'user') {
    pendientes.unshift(rows.pop()!);
  }
  const textoAgrupado = pendientes.map((r) => r.mensaje).join('\n');

  // Gemini exige que el historial inicie con un mensaje del usuario
  while (rows.length && rows[0].rol !== 'user') rows.shift();

  // Agrupar mensajes consecutivos del mismo rol para evitar errores de validación de API
  const historial: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
  for (const r of rows) {
    const rol = r.rol as 'user' | 'model';
    const texto = r.mensaje;
    if (historial.length && historial[historial.length - 1].role === rol) {
      historial[historial.length - 1].parts[0].text += '\n' + texto;
    } else {
      historial.push({ role: rol, parts: [{ text: texto }] });
    }
  }

  return { historial, textoAgrupado };
}

function guardarMensaje(telefono: string, rol: 'user' | 'model', mensaje: string, autor: 'contacto' | 'bot' | 'humano') {
  try {
    return db.insert(whatsapp_conversaciones).values({ telefono, rol, mensaje, autor }).returning().get();
  } catch (e) {
    console.error('No se pudo guardar el mensaje de WhatsApp:', e);
    return null;
  }
}

function getAdminUserId(): number {
  const admin = db.select().from(users).where(eq(users.role, 'admin')).get();
  if (admin) return admin.id;
  const firstUser = db.select().from(users).get();
  return firstUser ? firstUser.id : 1;
}

export async function POST(req: NextRequest) {
  const now = new Date().toISOString();
  const logPath = process.env.SQLITE_DB_PATH
    ? path.join(path.dirname(process.env.SQLITE_DB_PATH), 'webhook_logs.txt')
    : path.join(process.cwd(), 'db', 'webhook_logs.txt');

  let rawBodyText = '';
  try {
    const cloned = req.clone();
    rawBodyText = await cloned.text();
    const logLine = `[${now}] URL: ${req.url} | Header-Sig: ${req.headers.get('x-webhook-signature')} | Body: ${rawBodyText}\n`;
    appendFileSync(logPath, logLine);
  } catch (e: any) {
    try {
      appendFileSync(logPath, `[${now}] ERROR AL LOGUEAR: ${e.message}\n`);
    } catch (fsErr) {
      console.error('No se pudo escribir en logPath:', fsErr);
    }
  }

  try {
    const body = JSON.parse(rawBodyText || '{}');

    // === Meta WhatsApp Cloud API (oficial): tiene su propio formato y seguridad ===
    if (body.object === 'whatsapp_business_account') {
      return await procesarWebhookMeta(body, req, rawBodyText);
    }

    // === Kapso Webhook Nativo ===
    if (body.type?.startsWith('whatsapp.') || body.type === 'message.received' || body.batch === true) {
      return await procesarWebhookKapso(body, req, rawBodyText);
    }

    // === WASender (no oficial) ===
    // 1. Validar Token de Seguridad (Soporta Header o Query Parameter)
    const webhookToken = process.env.WASENDER_WEBHOOK_TOKEN;
    if (webhookToken) {
      const headerSig = req.headers.get('x-webhook-signature') || req.headers.get('X-Webhook-Signature');
      const paramSig = req.nextUrl.searchParams.get('token');
      const sigToCompare = headerSig || paramSig;
      if (sigToCompare !== webhookToken) {
        console.warn('Firma de webhook inválida. Recibida:', sigToCompare);
        return Response.json({ error: 'No autorizado' }, { status: 401 });
      }
    }

    // 2. Solo procesar el evento principal 'messages.upsert' y el evento de test.
    // Esto previene que procesemos eventos duplicados de WaSender (messages.received, messages-personal.received, etc.)
    const event = body.event || '';
    if (event !== 'messages.upsert' && event !== 'webhook.test' && body.event !== 'webhook.test') {
      return Response.json({ status: 'ignored_event', event });
    }

    console.log('Webhook recibido:', JSON.stringify(body));

    // Si es un evento de prueba del simulador de WaSender, responder exitoso inmediatamente
    if (event === 'webhook.test' || body.event === 'webhook.test' || body.test === true || body.data?.test === true) {
      return Response.json({ status: 'success', message: 'Webhook test verified successfully' });
    }

    let rawPhone = body.phone || body.sender || body.from || body.message?.from;
    let incomingText = body.message || body.text || body.message?.text || body.content;
    let fromMe = body.fromMe === true || body.data?.fromMe === true || body.data?.key?.fromMe === true || body.key?.fromMe === true || event === 'message.sent' || event === 'messages.sent';

    // Soporte para estructura anidada de WaSender (body.data.*)
    if (body.data) {
      const d = body.data;
      
      // Soporte para formato d.messages observado en logs
      const messagesObj = d.messages;
      if (messagesObj) {
        const m = Array.isArray(messagesObj) ? messagesObj[0] : messagesObj;
        if (m.key?.senderPn) {
          rawPhone = m.key.senderPn;
        } else if (m.key?.remoteJid) {
          rawPhone = m.key.remoteJid;
        } else if (m.remoteJid) {
          rawPhone = m.remoteJid;
        }

        if (m.messageBody) {
          incomingText = m.messageBody;
        } else if (m.message) {
          incomingText = m.message.conversation || m.message.extendedTextMessage?.text || m.message.text || '';
        }

        if (m.key?.fromMe === true) {
          fromMe = true;
        }
      } else {
        if (d.key?.remoteJid) {
          rawPhone = d.key.remoteJid;
        } else if (d.sender) {
          rawPhone = d.sender;
        } else if (d.from) {
          rawPhone = d.from;
        }

        if (d.message) {
          if (typeof d.message === 'string') {
            incomingText = d.message;
          } else {
            incomingText = d.message.conversation || d.message.extendedTextMessage?.text || d.message.text || '';
          }
        } else if (d.text) {
          incomingText = d.text;
        } else if (d.body) {
          incomingText = d.body;
        }

        if (d.key?.fromMe === true || d.fromMe === true) {
          fromMe = true;
        }
      }
    }

    if (!rawPhone || !incomingText || typeof incomingText !== 'string') {
      console.warn('Payload incompleto. Teléfono:', rawPhone, 'Mensaje:', incomingText);
      return Response.json({ error: 'Payload incompleto o inválido' }, { status: 400 });
    }

    const cleanIncoming = cleanPhoneNumber(rawPhone);

    // 2.1 Si el mensaje es de nosotros mismos (fromMe), lo sincronizamos pero NO disparamos respuesta del bot
    if (fromMe) {
      const existeMensaje = db.select().from(whatsapp_conversaciones)
        .where(condicionMismoTelefono(cleanIncoming))
        .orderBy(desc(whatsapp_conversaciones.id))
        .limit(5)
        .all();
      
      const esDuplicado = existeMensaje.some(m => m.mensaje === incomingText);
      if (!esDuplicado) {
        tocarChat(cleanIncoming, { incrementarNoLeidos: false });
        guardarMensaje(cleanIncoming, 'model', incomingText, 'humano');
        db.update(whatsapp_chats).set({ bot_activo: 0 }).where(eq(whatsapp_chats.telefono, cleanIncoming)).run();
        console.log('Mensaje saliente sincronizado (se pausó el bot para esta conversación):', incomingText);
      }
      return Response.json({ status: 'from_me_synced' });
    }

    // 2.2 Activar indicador de "escribiendo" si hay un ID de mensaje disponible en el webhook
    const messagesObj = body.data?.messages;
    const msgId = messagesObj?.key?.id || messagesObj?.id || body.data?.key?.id || body.key?.id || body.message?.id;
    if (msgId) {
      const fromJid = messagesObj?.key?.remoteJid || body.data?.key?.remoteJid || body.key?.remoteJid || body.from || body.phone;
      if (fromJid) {
        mostrarEscribiendoKapso(fromJid, msgId).catch(() => {});
      }
    }

    // 3. Procesar el mensaje (identifica remitente, responde con el bot y envía por el proveedor activo)
    const responseText = await procesarMensajeEntrante(cleanIncoming, incomingText);
    if (responseText === null) return Response.json({ status: 'bot_paused' });
    return Response.json({ status: 'success', response: responseText });
  } catch (error: any) {
    console.error('Error procesando webhook de WhatsApp:', error);
    return Response.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}

// Verificación del webhook de Meta (handshake GET inicial que hace Meta al configurar la URL)
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');
  if (mode === 'subscribe' && token && token === process.env.META_VERIFY_TOKEN) {
    return new Response(challenge || '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

// Procesa el webhook con el formato de Meta Cloud API
async function procesarWebhookMeta(body: any, req: NextRequest, rawBodyText: string): Promise<Response> {
  // Validación opcional de firma (X-Hub-Signature-256) si se configura META_APP_SECRET
  const appSecret = process.env.META_APP_SECRET;
  if (appSecret) {
    const sig = req.headers.get('x-hub-signature-256') || '';
    const esperado = 'sha256=' + createHmac('sha256', appSecret).update(rawBodyText).digest('hex');
    if (sig !== esperado) {
      console.warn('Firma de Meta inválida.');
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }
  }

  try {
    const value = body.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    // Meta también envía estados de entrega (statuses) y otros eventos que ignoramos
    if (!msg) return Response.json({ status: 'ignored_no_message' });
    if (msg.type !== 'text') return Response.json({ status: 'ignored_non_text', type: msg.type });

    const cleanIncoming = cleanPhoneNumber(msg.from);
    const incomingText = msg.text?.body || '';
    if (!cleanIncoming || !incomingText) return Response.json({ status: 'ignored_empty' });

    if (msg.id) {
      mostrarEscribiendoKapso(msg.from, msg.id).catch(() => {});
    }

    const responseText = await procesarMensajeEntrante(cleanIncoming, incomingText);
    if (responseText === null) return Response.json({ status: 'bot_paused' });
    return Response.json({ status: 'success', response: responseText });
  } catch (error: any) {
    console.error('Error procesando webhook Meta:', error);
    return Response.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}

// Procesa el webhook nativo de Kapso
async function procesarWebhookKapso(body: any, req: NextRequest, rawBodyText: string): Promise<Response> {
  const logPath = process.env.SQLITE_DB_PATH
    ? path.join(path.dirname(process.env.SQLITE_DB_PATH), 'webhook_logs.txt')
    : path.join(process.cwd(), 'db', 'webhook_logs.txt');

  const appSecret = process.env.META_APP_SECRET;
  if (appSecret) {
    const sig = req.headers.get('x-webhook-signature') || req.headers.get('X-Webhook-Signature') || '';
    const esperado = createHmac('sha256', appSecret).update(rawBodyText).digest('hex');
    if (sig !== esperado) {
      const errSigLine = `[${new Date().toISOString()}] [ERROR FIRMA KAPSO] Recibida: ${sig} | Esperada: ${esperado}\n`;
      try { appendFileSync(logPath, errSigLine); } catch (fsErr) {}
      console.warn('Firma de Kapso inválida. Esperada:', esperado, 'Recibida:', sig);
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }
  }

  try {
    if (body.type !== 'whatsapp.message.received' && body.type !== 'message.received') {
      return Response.json({ status: 'ignored_event', type: body.type });
    }

    const messages = body.data || [];
    if (!messages.length) {
      return Response.json({ status: 'no_messages_in_batch' });
    }

    const resultados = [];
    for (const item of messages) {
      const msg = item.message;
      if (!msg) continue;

      if (msg.kapso?.direction === 'outbound') continue;

      const cleanIncoming = cleanPhoneNumber(msg.from);
      const incomingText = msg.text?.body || msg.kapso?.content || '';

      if (!cleanIncoming || !incomingText) continue;

      if (msg.id) {
        mostrarEscribiendoKapso(msg.from, msg.id).catch(() => {});
      }

      const responseText = await procesarMensajeEntrante(cleanIncoming, incomingText);
      resultados.push({ telefono: cleanIncoming, respuesta: responseText });
    }

    return Response.json({ status: 'success', processed: resultados });
  } catch (error: any) {
    const errExcLine = `[${new Date().toISOString()}] [EXCEPTION KAPSO] ${error.message}\nStack: ${error.stack}\n`;
    try { appendFileSync(logPath, errExcLine); } catch (fsErr) {}
    console.error('Error procesando webhook nativo de Kapso:', error);
    return Response.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}

// Núcleo compartido por ambos proveedores: identifica al remitente, genera la respuesta
// del bot y la envía. Devuelve el texto enviado, o null si el bot está pausado en ese chat.
async function procesarMensajeEntrante(cleanIncoming: string, incomingText: string): Promise<string | null> {
  const estadoChat = tocarChat(cleanIncoming, { incrementarNoLeidos: true });

  // 1. Guardar el mensaje entrante inmediatamente
  const msgGuardado = guardarMensaje(cleanIncoming, 'user', incomingText, 'contacto');

  // Si un humano tomó el control del chat, solo se guarda el mensaje entrante y salimos
  if (estadoChat.bot_activo === 0) return null;

  // 2. Procesamos con debounce en SEGUNDO PLANO y devolvemos el control al webhook de inmediato.
  //    Bloquear la respuesta HTTP durante el debounce rompe a los proveedores (p. ej. WASender)
  //    que entregan los mensajes en serie o con timeout corto: por eso el bot "no contestaba"
  //    cuando el usuario mandaba varios mensajes seguidos.
  void responderConDebounce(cleanIncoming, msgGuardado?.id ?? null)
    .catch((e) => console.error('Error en el procesamiento diferido del bot de WhatsApp:', e));

  return 'processing';
}

// Espera la ventana de debounce; si este es el mensaje más reciente de la ráfaga, genera y envía
// UNA sola respuesta que considera todos los mensajes recién recibidos (agrupados en un turno).
async function responderConDebounce(cleanIncoming: string, msgId: number | null): Promise<void> {
  // Mecanismo de debounce: si llega un mensaje más nuevo mientras esperamos, ese hilo responderá.
  await sleep(DEBOUNCE_MS);

  if (msgId !== null) {
    const ultimoMensaje = db.select().from(whatsapp_conversaciones)
      .where(condicionMismoTelefono(cleanIncoming))
      .orderBy(desc(whatsapp_conversaciones.id))
      .limit(1)
      .get();

    // Si el último mensaje en la BD no es el nuestro, llegó uno más nuevo: dejamos que ese responda.
    if (ultimoMensaje && ultimoMensaje.id !== msgId) {
      console.log(`[DEBOUNCE] Se omite el hilo del mensaje ${msgId}; llegó uno más nuevo (${ultimoMensaje.id}).`);
      return;
    }
  }

  // El chat pudo pausarse durante la espera (un humano tomó el control)
  const chat = db.select().from(whatsapp_chats).where(eq(whatsapp_chats.telefono, cleanIncoming)).get();
  if (chat && chat.bot_activo === 0) return;

  // Historial previo + la ráfaga de mensajes sin responder agrupada en un solo turno de usuario
  const { historial, textoAgrupado } = cargarHistorialYPendiente(cleanIncoming);
  if (!textoAgrupado) return;

  // Identificar al remitente
  const allGuardias = db.select().from(guardias).all();
  const matchedGuardia = allGuardias.find((g) => phoneMatches(g.telefono, cleanIncoming));

  let matchedCliente = null;
  if (!matchedGuardia) {
    const allClientes = db.select().from(clientes).all();
    matchedCliente = allClientes.find((c) => phoneMatches(c.telefono, cleanIncoming)) || null;
  }

  let matchedCandidato = null;
  if (!matchedGuardia && !matchedCliente) {
    const allCandidatos = db.select().from(candidatos).all();
    matchedCandidato = allCandidatos.find((c) => phoneMatches(c.telefono, cleanIncoming)) || null;
  }

  let responseText = '';
  if (matchedGuardia || matchedCliente) {
    responseText = await chatUsuarioInterno(
      textoAgrupado, historial,
      matchedGuardia ? 'Guardia' : 'Cliente',
      matchedGuardia ? matchedGuardia.nombre : matchedCliente!.nombre,
      matchedGuardia ? matchedGuardia.id : matchedCliente!.id,
      cleanIncoming,
    );
  } else {
    responseText = await chatReclutamiento(textoAgrupado, historial, matchedCandidato, cleanIncoming);
  }

  guardarMensaje(cleanIncoming, 'model', responseText, 'bot');
  await enviarMensajeWhatsApp(cleanIncoming, responseText);
}

// ============================================================
// Flujo 1: guardias y clientes registrados (asistente interno)
// ============================================================
async function chatUsuarioInterno(
  incomingText: string,
  historial: { role: 'user' | 'model'; parts: { text: string }[] }[],
  tipoUsuario: 'Guardia' | 'Cliente',
  usuarioNombre: string,
  usuarioId: number,
  usuarioTelefono: string,
): Promise<string> {
  const systemInstruction = `Eres el Asistente Virtual Inteligente de U3 Seguridad Privada.
Estás chateando por WhatsApp con un usuario del sistema.
Fecha y hora actual: ${fechaHoraLocal()}.

INFORMACIÓN DEL REMITENTE:
- Nombre: ${usuarioNombre}
- Rol en el sistema: ${tipoUsuario}
- ID interno: ${usuarioId}
- Teléfono: ${usuarioTelefono}

INSTRUCCIONES CLAVE:
1. Responde de forma muy concisa, profesional y directa, ya que las respuestas se leerán en WhatsApp.
2. Si el usuario te saluda, salúdalo por su nombre y pregúntale en qué puedes ayudarle.
3. Si el usuario te hace una pregunta que requiera ver su turno, servicio asignado, inventario o registrar una novedad/incidencia, ejecuta de inmediato la herramienta adecuada.
4. Solo tienes acceso a las herramientas descritas a continuación. Si el usuario pide algo fuera del alcance, indícale amablemente que no tienes esa función habilitada.
5. NUNCA escribas en tus mensajes nombres de funciones, JSON ni llamadas a herramientas; úsalas de forma silenciosa y responde SOLO en lenguaje natural.`;

  const geminiTools = [
    {
      name: 'registrarIncidencia',
      description: 'Registra un reporte de novedad o incidencia de seguridad (ej. daños, robos, retrasos, fallas de equipo) en el sistema.',
      parameters: {
        type: 'OBJECT',
        properties: {
          tipo: {
            type: 'STRING',
            description: 'El tipo de incidencia. Ejemplos: "Falta", "Retardo", "Falla de Equipo", "Accidente", "Incidente de Seguridad", "Novedad en Turno"',
          },
          gravedad: {
            type: 'STRING',
            description: 'Gravedad del reporte: "Leve", "Media", "Grave"',
          },
          descripcion: {
            type: 'STRING',
            description: 'Detalles minuciosos del reporte (ej. "Se reporta daño en la reja trasera del almacén")',
          },
        },
        required: ['tipo', 'descripcion'],
      },
    },
    {
      name: 'consultarServicioAsignado',
      description: 'Obtiene las asignaciones de servicios activos, turnos y ubicación del guardia.',
      parameters: { type: 'OBJECT', properties: {} },
    },
    {
      name: 'consultarInventarioAsignado',
      description: 'Obtiene los uniformes, tallas y prendas que el guardia tiene actualmente registrados a su cargo.',
      parameters: { type: 'OBJECT', properties: {} },
    },
  ];

  const ejecutarHerramienta = (name: string, args: any): any => {
    if (name === 'registrarIncidencia') {
      const { tipo, gravedad, descripcion } = args as { tipo: string; gravedad?: string; descripcion: string };
      try {
        const nuevaIncidencia = db.insert(incidencias).values({
          guardia_id: usuarioId,
          tipo: tipo || 'Novedad en Turno',
          gravedad: gravedad || 'Leve',
          fecha: new Date().toISOString().split('T')[0],
          descripcion: descripcion || '',
          estado: 'Abierta',
          creado_por: getAdminUserId(),
        }).returning().get();
        return { success: true, message: 'Incidencia registrada exitosamente en el ERP', incidenciaId: nuevaIncidencia.id };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
    if (name === 'consultarServicioAsignado') {
      if (tipoUsuario !== 'Guardia') return { success: false, error: 'Esta consulta solo está permitida para Guardias de seguridad.' };
      try {
        const asignaciones = db.select({
          turno: servicio_guardias.turno,
          nombreServicio: servicios.nombre,
          direccion: servicios.direccion,
        })
          .from(servicio_guardias)
          .innerJoin(servicios, eq(servicio_guardias.servicio_id, servicios.id))
          .where(eq(servicio_guardias.guardia_id, usuarioId))
          .all();
        return { success: true, asignaciones };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
    if (name === 'consultarInventarioAsignado') {
      if (tipoUsuario !== 'Guardia') return { success: false, error: 'Esta consulta solo está permitida para Guardias de seguridad.' };
      try {
        const uniformes = db.select({
          articulo: salidas.articulo,
          talla: salidas.talla,
          cantidad: salidas.cantidad,
          fecha: salidas.fecha,
          concepto: salidas.concepto,
          estadoAsignacion: salidas.estado_asignacion,
        })
          .from(salidas)
          .where(eq(salidas.guardia_id, usuarioId))
          .all();
        return { success: true, inventario: uniformes };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
    return { success: false, error: `Herramienta desconocida: ${name}` };
  };

  return await generarRespuesta(systemInstruction, historial, incomingText, geminiTools, ejecutarHerramienta);
}

// ============================================================
// Flujo 2: números desconocidos y candidatos (reclutador RRHH)
// ============================================================
async function chatReclutamiento(
  incomingText: string,
  historial: { role: 'user' | 'model'; parts: { text: string }[] }[],
  candidato: typeof candidatos.$inferSelect | null,
  telefono: string,
): Promise<string> {
  const vacantesActivas = db.select().from(vacantes).where(eq(vacantes.activa, 1)).all();
  const listaVacantes = vacantesActivas.length
    ? vacantesActivas.map((v) =>
        `- [ID ${v.id}] ${v.puesto}${v.ubicacion ? ` | Zona: ${v.ubicacion}` : ''}${v.turno ? ` | Turno: ${v.turno}` : ''}${v.sueldo ? ` | Sueldo: ${v.sueldo}` : ''}${v.requisitos ? ` | Requisitos: ${v.requisitos}` : ''}${v.descripcion ? ` | ${v.descripcion}` : ''}`
      ).join('\n')
    : '(Por el momento no hay vacantes abiertas. Ofrece registrar los datos del candidato para contactarlo cuando se abra una vacante.)';

  const empresaInfo = getConfig('bot_empresa_info') || 'U3 Seguridad Privada es una empresa mexicana de servicios de seguridad privada (guardias intramuros y servicios relacionados).';
  const reglasExtra = getConfig('bot_reglas') || '';
  const horarioEntrevistas = getConfig('bot_horario_entrevistas') || 'Lunes a viernes de 9:00 a 14:00';
  const direccionEntrevistas = getConfig('bot_direccion_entrevistas') || 'nuestras oficinas (se confirma la dirección al agendar)';

  const vacanteInteres = candidato?.vacante_id
    ? db.select().from(vacantes).where(eq(vacantes.id, candidato.vacante_id)).get()
    : null;
  const puestoInteres = vacanteInteres
    ? `${vacanteInteres.puesto}${vacanteInteres.ubicacion ? ` (${vacanteInteres.ubicacion})` : ''}`
    : (candidato?.vacante_id ? `vacante ${candidato.vacante_id}` : 'aún sin definir');

  const fichaCandidato = candidato
    ? `\nFICHA DEL CANDIDATO (ya registrado, NO vuelvas a pedir datos que ya tienes):
- ID: ${candidato.id}
- Nombre: ${candidato.nombre || 'aún sin registrar'}
- Puesto de interés: ${puestoInteres}
- Ciudad: ${candidato.ciudad || 'aún sin registrar'}
- Edad: ${candidato.edad || 'aún sin registrar'}
- Experiencia: ${candidato.experiencia || 'aún sin registrar'}
- Etapa del proceso: ${candidato.etapa}
- Entrevista agendada: ${candidato.fecha_entrevista || 'ninguna'}${candidato.notas ? `\n- Notas del reclutador: ${candidato.notas}` : ''}`
    : '\nEste número NO está registrado todavía. Es un contacto nuevo.';

  // El detalle de rutas de transporte solo se incluye cuando el candidato pregunta cómo llegar,
  // para no gastar ~350 tokens en cada mensaje de la conversación.
  const preguntaComoLlegar = /llegar|c[oó]mo llego|transporte|metrobus|metrob[uú]s|\bmetro\b|direcci[oó]n|ubicad|ubicaci[oó]n|d[oó]nde\s+(est|qued|son)/i.test(incomingText);
  const bloqueTransporte = preguntaComoLlegar
    ? `
8. Rutas de Transporte Público en CDMX: Las oficinas están sobre Av. Insurgentes Sur, a unas cuadras de la estación del METROBÚS OLIVO (Línea 1). Indícale de forma amable y precisa cómo llegar en transporte público:
   - En Metrobús: Tomar la Línea 1 (roja) y bajarse en la estación "Olivo", las oficinas quedan a un par de cuadras caminando.
   - Desde el Norte (ej. Indios Verdes): Tomar el Metrobús Línea 1 directo dirección sur hasta la estación "Olivo".
   - Desde el Oriente (ej. Pantitlán): Tomar Metro Línea 9 hasta Chilpancingo, y transbordar al Metrobús Línea 1 rumbo al sur hasta la estación "Olivo".
   - Desde el Poniente (ej. Observatorio / Tacubaya): Tomar Metro Línea 1 o 9 hasta Chilpancingo, y transbordar al Metrobús Línea 1 rumbo al sur hasta la estación "Olivo".
   - Desde el Sur (ej. El Caminero): Tomar el Metrobús Línea 1 directo rumbo al norte hasta la estación "Olivo".
   - Desde Metro Línea 7 (ej. Barranca del Muerto): Tomar transporte colectivo/bús sobre Av. Altavista o Barranca del Muerto hacia Insurgentes Sur, y bajarse en la estación "Olivo".
   - Desde Metro Línea 3 (ej. Viveros / Coyoacán): Tomar autobús o colectivo que vaya hacia Insurgentes Sur y bajarse en la estación "Olivo".`
    : '';

  const systemInstruction = `Eres "Uli", el reclutador virtual experto en Recursos Humanos de U3 Seguridad Privada. Chateas por WhatsApp.
Fecha y hora actual: ${fechaHoraLocal()} (hora del centro de México).

SOBRE LA EMPRESA:
${empresaInfo}

VACANTES ACTIVAS HOY:
${listaVacantes}

HORARIO DISPONIBLE PARA ENTREVISTAS: ${horarioEntrevistas}
LUGAR DE LAS ENTREVISTAS: ${direccionEntrevistas}
${fichaCandidato}

CONTEXTO GEOGRÁFICO (operamos en la CDMX y su zona conurbada del Estado de México):
Interpreta SIEMPRE las ubicaciones que mencione el candidato como lugares de la CDMX o el Edomex; NUNCA inventes el significado de una abreviatura. Alcaldías de la CDMX y sus abreviaturas comunes: GAM = Gustavo A. Madero, BJ = Benito Juárez, MH = Miguel Hidalgo, AO = Álvaro Obregón, VC = Venustiano Carranza, además de Cuauhtémoc, Iztapalapa, Iztacalco, Coyoacán, Tlalpan, Azcapotzalco, Xochimilco, Tláhuac, Cuajimalpa, La Magdalena Contreras y Milpa Alta. Municipios conurbados: Ecatepec, Neza (Nezahualcóyotl), Naucalpan, Tlalnepantla, Atizapán, Coacalco, Tultitlán, Chalco, Texcoco. Puntos conocidos: La Raza, La Villa/Basílica, el Zócalo/Centro, Indios Verdes, Pantitlán, Observatorio. IMPORTANTE: "la GAM" significa Gustavo A. Madero (NO "Gran Área Metropolitana"). Si una abreviatura, colonia o referencia no te queda clara, PREGUNTA en lugar de suponer.

TU PERSONALIDAD (suenas como una persona real de RRHH, NO como un bot):
- Cálido/a, cercano/a y empático/a. En cuanto sepas su nombre, salúdalo por su nombre y úsalo de vez en cuando.
- Conversa de forma natural: reacciona a lo que te cuenta ("¡Qué bien!", "Entiendo", "Gracias por contarme"), muestra interés genuino por su situación.
- Lenguaje sencillo de WhatsApp, frases cortas. Evita los emojis: úsalos muy rara vez (a lo mucho uno de vez en cuando) y nunca varios en un mensaje. Nada de tono corporativo frío ni listas robóticas.
- Haz UNA sola pregunta por mensaje para que la charla fluya como una conversación real, no como un formulario.

TU OBJETIVO PRINCIPAL: acompañar al candidato en una charla agradable de preselección y conseguir que CONSOLIDE UNA CITA DE ENTREVISTA con fecha y hora concretas. Tómate el tiempo de conocerlo bien antes de cerrar.

CÓMO TRABAJAS (técnica de reclutador experto de RRHH):
1. Rompe el hielo: preséntate breve y cálido, agradece su interés y detecta la intención: ¿busca empleo o quiere contratar servicios de seguridad?
2. Si quiere CONTRATAR servicios: recolecta nombre, empresa, correo y qué necesita; usa registrarProspectoVenta y dile que un asesor comercial lo contactará pronto. No des precios.
3. Si busca EMPLEO, condúcelo como una entrevista de preselección amena, UN dato por mensaje, guardando todo con actualizarDatosCandidato en cuanto lo obtengas. Reconoce cada respuesta antes de pasar a la siguiente:
   a) Su nombre completo.
   b) QUÉ PUESTO le interesa: muéstrale las vacantes activas que apliquen a su ciudad y pregúntale explícitamente cuál le llama la atención; guarda el vacante_id con actualizarDatosCandidato.
   c) Ciudad o zona donde vive (para ver si le queda cerca del servicio).
   d) Edad.
   e) Experiencia: ¿ha trabajado como guardia o en seguridad?, ¿cuánto tiempo?, ¿en qué tipo de lugares?
   f) Motivación y disponibilidad: por qué busca trabajo ahora, si puede cubrir el turno de la vacante y desde cuándo podría empezar.
   g) Cartilla militar: si el candidato es hombre, pregúntale de forma natural si cuenta con su cartilla militar liberada (es un requisito importante para el puesto). Guarda la respuesta como nota con actualizarDatosCandidato. Con las mujeres no apliques esta pregunta.
4. Resuelve dudas como experto: si pregunta por sueldo, prestaciones, funciones o requisitos, responde con lo que SÍ tienes de la vacante; lo que no sepas, dile con confianza que se confirma en la entrevista. Maneja objeciones (sueldo, distancia, turno) resaltando lo que la vacante sí ofrece, sin inventar nada.
5. Cierre de cita: cuando cumpla el perfil, propón TÚ la entrevista con dos opciones concretas de día y hora dentro del horario disponible (ej. "¿Te acomoda mañana a las 10:00 o el jueves a las 12:00?"). No esperes a que él lo pida.
6. Al confirmar día y hora, usa agendarEntrevista y confírmale TODO por escrito, de forma cálida:
   - El PUESTO para el que es la entrevista.
   - Fecha, hora y lugar.
   - Que lleve sus DOCUMENTOS ORIGINALES (no copias): identificación oficial (INE), CURP, comprobante de domicilio, cartilla militar liberada (en el caso de los hombres) y, si tiene, constancias o cursos de seguridad. Pregúntale amablemente si cuenta con esos documentos originales; si le falta alguno, tranquilízalo diciéndole que lo comente en la entrevista y que no es impedimento para asistir.
   - Despídete deseándole que le vaya muy bien y dile que ahí lo esperan.
7. Seguimiento: si no confirma, haz UN recordatorio amable ofreciendo otra opción de horario. Nunca presiones de más.${bloqueTransporte}

REGLAS ESTRICTAS:
- Responde SIEMPRE en español, en mensajes breves y naturales de WhatsApp (1-4 líneas), cálidos y humanos. UNA sola pregunta por mensaje.
- Mantén viva la conversación: cierra casi todos tus mensajes con una pregunta o un siguiente paso, para que el candidato siempre sepa cómo continuar.
- SOLO usa la información de este mensaje. Si no sabes algo (sueldos exactos, prestaciones no listadas, precios de servicios), di que se confirma en la entrevista o con un asesor. NUNCA inventes.
- No prometas contratación; la entrevista es el siguiente paso, no una oferta.
- NUNCA escribas en tus mensajes nombres de funciones, JSON ni llamadas a herramientas (p. ej. "actualizarDatosCandidato{...}"). Usa las herramientas de forma silenciosa; al candidato háblale SOLO en lenguaje natural.
- Agenda entrevistas únicamente dentro del horario disponible indicado.
- Si la persona pide hablar con un humano, dile que un reclutador le escribirá pronto y registra la nota con actualizarDatosCandidato.
${reglasExtra ? `\nREGLAS ADICIONALES DE LA EMPRESA:\n${reglasExtra}` : ''}`;

  const geminiTools = [
    {
      name: 'actualizarDatosCandidato',
      description: 'Guarda o actualiza los datos del candidato en el sistema de reclutamiento. Úsala en cuanto obtengas un dato nuevo (nombre, ciudad, edad, experiencia, vacante de interés o una nota).',
      parameters: {
        type: 'OBJECT',
        properties: {
          nombre: { type: 'STRING', description: 'Nombre completo del candidato' },
          ciudad: { type: 'STRING', description: 'Ciudad o zona donde vive' },
          edad: { type: 'NUMBER', description: 'Edad en años' },
          experiencia: { type: 'STRING', description: 'Resumen de su experiencia en seguridad u otros trabajos' },
          vacante_id: { type: 'NUMBER', description: 'ID de la vacante que le interesa (de la lista de vacantes activas)' },
          nota: { type: 'STRING', description: 'Observación relevante del reclutador (ej. "pide hablar con humano", "disponible solo turno nocturno")' },
        },
      },
    },
    {
      name: 'agendarEntrevista',
      description: 'Agenda la cita de entrevista presencial del candidato una vez que confirmó día y hora. Crea el evento en el calendario de la empresa.',
      parameters: {
        type: 'OBJECT',
        properties: {
          fecha: { type: 'STRING', description: 'Fecha de la entrevista en formato YYYY-MM-DD' },
          hora: { type: 'STRING', description: 'Hora de la entrevista en formato HH:MM (24 horas)' },
        },
        required: ['fecha', 'hora'],
      },
    },
    {
      name: 'registrarProspectoVenta',
      description: 'Registra a una persona o empresa interesada en CONTRATAR servicios de seguridad, para que el equipo comercial le dé seguimiento.',
      parameters: {
        type: 'OBJECT',
        properties: {
          nombre: { type: 'STRING', description: 'Nombre de la persona de contacto' },
          empresa: { type: 'STRING', description: 'Nombre de la empresa (si aplica)' },
          email: { type: 'STRING', description: 'Correo electrónico de contacto' },
          interes: { type: 'STRING', description: 'Qué servicio necesita y cualquier detalle relevante' },
        },
        required: ['nombre'],
      },
    },
  ];

  // Asegura que exista la ficha del candidato y devuelve su registro actual
  const obtenerOCrearCandidato = () => {
    const existente = candidato
      ? db.select().from(candidatos).where(eq(candidatos.id, candidato.id)).get()
      : db.select().from(candidatos).all().find((c) => phoneMatches(c.telefono, telefono));
    if (existente) return existente;
    return db.insert(candidatos).values({
      telefono,
      etapa: 'Nuevo',
      etapa_actualizada_en: new Date().toISOString(),
      origen: 'WhatsApp',
    }).returning().get();
  };

  const ejecutarHerramienta = (name: string, args: any): any => {
    try {
      if (name === 'actualizarDatosCandidato') {
        const ficha = obtenerOCrearCandidato();
        const cambios: Record<string, unknown> = {};
        if (args.nombre) cambios.nombre = args.nombre;
        if (args.ciudad) cambios.ciudad = args.ciudad;
        if (args.edad) cambios.edad = Number(args.edad);
        if (args.experiencia) cambios.experiencia = args.experiencia;
        if (args.vacante_id) cambios.vacante_id = Number(args.vacante_id);
        if (args.nota) {
          const stamp = new Date().toISOString().split('T')[0];
          cambios.notas = `${ficha.notas ? `${ficha.notas}\n` : ''}[${stamp}] ${args.nota}`;
        }
        // Con datos capturados el candidato pasa de "Nuevo" a "Contactado"
        if (ficha.etapa === 'Nuevo' && (args.nombre || ficha.nombre)) {
          cambios.etapa = 'Contactado';
          cambios.etapa_actualizada_en = new Date().toISOString();
        }
        const actualizado = db.update(candidatos).set(cambios).where(eq(candidatos.id, ficha.id)).returning().get();
        return { success: true, candidato: { id: actualizado.id, nombre: actualizado.nombre, etapa: actualizado.etapa } };
      }

      if (name === 'agendarEntrevista') {
        const { fecha, hora } = args as { fecha: string; hora: string };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{1,2}:\d{2}$/.test(hora)) {
          return { success: false, error: 'Formato de fecha u hora inválido. Usa YYYY-MM-DD y HH:MM.' };
        }
        const ficha = obtenerOCrearCandidato();
        const vacante = ficha.vacante_id
          ? db.select().from(vacantes).where(eq(vacantes.id, ficha.vacante_id)).get()
          : null;
        const puesto = vacante ? vacante.puesto : null;
        const inicio = `${fecha}T${hora.padStart(5, '0')}:00`;
        const evento = db.insert(eventos_calendario).values({
          titulo: `Entrevista${puesto ? ` (${puesto})` : ''}: ${ficha.nombre || `candidato ${telefono}`}`,
          descripcion: `Entrevista de reclutamiento agendada por el asistente de WhatsApp.\nTeléfono: ${telefono}${puesto ? `\nPuesto: ${puesto}` : ''}${ficha.ciudad ? `\nCiudad: ${ficha.ciudad}` : ''}${ficha.experiencia ? `\nExperiencia: ${ficha.experiencia}` : ''}\nDocumentos originales por confirmar: INE, CURP, comprobante de domicilio, cartilla militar liberada (hombres) y constancias de cursos (si tiene).`,
          fecha_inicio: inicio,
          todo_el_dia: 0,
          creado_por: getAdminUserId(),
          notificar_minutos_antes: 60,
        }).returning().get();
        db.update(candidatos).set({
          etapa: 'Entrevista',
          etapa_actualizada_en: new Date().toISOString(),
          fecha_entrevista: inicio,
          evento_id: evento.id,
        }).where(eq(candidatos.id, ficha.id)).run();
        return {
          success: true,
          message: `Entrevista agendada el ${fecha} a las ${hora}${puesto ? ` para el puesto de ${puesto}` : ''}. Recuérdale traer sus documentos ORIGINALES (INE, CURP, comprobante de domicilio, cartilla militar liberada si es hombre, y constancias de cursos si tiene) y pregúntale si cuenta con ellos.`,
          eventoId: evento.id,
        };
      }

      if (name === 'registrarProspectoVenta') {
        const { nombre, empresa, email, interes } = args as { nombre: string; empresa?: string; email?: string; interes?: string };
        const nuevo = db.insert(clientes).values({
          nombre,
          tipo: 'Prospecto',
          empresa: empresa || null,
          email: email || null,
          telefono,
          notas: `Captado por el asistente de WhatsApp.${interes ? ` Interés: ${interes}` : ''}`,
        }).returning().get();
        return { success: true, message: 'Prospecto registrado; el equipo comercial le dará seguimiento', prospectoId: nuevo.id };
      }

      return { success: false, error: `Herramienta desconocida: ${name}` };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };

  return await generarRespuesta(systemInstruction, historial, incomingText, geminiTools, ejecutarHerramienta);
}

// Envía el mensaje al modelo y resuelve llamadas a herramientas hasta obtener texto final
async function conversarConHerramientas(
  chat: ReturnType<ReturnType<typeof genAI.getGenerativeModel>['startChat']>,
  incomingText: string,
  ejecutarHerramienta: (name: string, args: any) => any,
): Promise<string> {
  let result = await chat.sendMessage(incomingText);

  for (let ronda = 0; ronda < MAX_RONDAS_HERRAMIENTAS; ronda++) {
    const functionCalls = result.response.functionCalls?.();
    if (!functionCalls || functionCalls.length === 0) break;

    const respuestas = functionCalls.map((call) => ({
      functionResponse: {
        name: call.name,
        response: ejecutarHerramienta(call.name, call.args),
      },
    }));
    result = await chat.sendMessage(respuestas);
  }

  return result.response.text();
}

