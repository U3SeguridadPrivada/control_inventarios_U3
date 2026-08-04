// Descarga el historial de conversaciones y mensajes de Kapso y lo guarda en disco.
// El historial de Kapso es la única copia que sobrevivió a la base efímera de producción.
//
//   node scripts/exportar-kapso.mjs                  -> usa KAPSO_PHONE_NUMBER_ID del entorno
//   node scripts/exportar-kapso.mjs <phoneNumberId>  -> exporta otro número
//
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// Lee .env.local sin dependencias externas
function envLocal(clave) {
  if (process.env[clave]) return process.env[clave];
  try {
    const txt = readFileSync(path.join(projectRoot, '.env.local'), 'utf8');
    const m = txt.match(new RegExp(`^\\s*${clave}\\s*=\\s*(.*)$`, 'm'));
    return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : undefined;
  } catch { return undefined; }
}

const API_KEY = envLocal('KAPSO_API_KEY');
const PHONE_ID = process.argv[2] || envLocal('KAPSO_PHONE_NUMBER_ID');
const VERSION = envLocal('KAPSO_VERSION') || 'v24.0';
const BASE = `https://api.kapso.ai/meta/whatsapp/${VERSION}/${PHONE_ID}`;

if (!API_KEY || !PHONE_ID) {
  console.error('✗ Faltan KAPSO_API_KEY o KAPSO_PHONE_NUMBER_ID.');
  process.exit(1);
}

async function traer(ruta, params = {}) {
  const url = new URL(BASE + ruta);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { 'X-API-Key': API_KEY } });
  if (!res.ok) throw new Error(`${ruta} respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// Recorre todas las páginas siguiendo el cursor `after`
async function traerTodo(ruta, params = {}) {
  const items = [];
  let after = null;
  do {
    const j = await traer(ruta, { ...params, limit: 100, after });
    items.push(...(j.data || []));
    after = j.paging?.cursors?.after && j.paging?.next ? j.paging.cursors.after : null;
    process.stdout.write(`\r  ${ruta}: ${items.length} registros...`);
  } while (after);
  process.stdout.write('\n');
  return items;
}

const salida = path.join(projectRoot, 'db', 'recuperacion');
if (!existsSync(salida)) mkdirSync(salida, { recursive: true });

console.log(`Número ${PHONE_ID} — descargando de Kapso...\n`);

const conversaciones = await traerTodo('/conversations');
const mensajes = await traerTodo('/messages');

writeFileSync(path.join(salida, `kapso-${PHONE_ID}-conversaciones.json`), JSON.stringify(conversaciones, null, 2));
writeFileSync(path.join(salida, `kapso-${PHONE_ID}-mensajes.json`), JSON.stringify(mensajes, null, 2));

// Transcripción legible, agrupada por conversación y en orden cronológico
const porConv = new Map();
for (const m of mensajes) {
  const cid = m.kapso?.whatsapp_conversation_id || 'sin-conversacion';
  if (!porConv.has(cid)) porConv.set(cid, []);
  porConv.get(cid).push(m);
}

let texto = '';
for (const c of conversaciones) {
  const msgs = (porConv.get(c.id) || []).sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  texto += `\n${'='.repeat(70)}\n`;
  texto += `Contacto: ${c.kapso?.contact_name || '(sin nombre)'}  |  Tel: ${c.phone_number}\n`;
  texto += `Estado: ${c.status}  |  Última actividad: ${c.last_active_at}  |  ${msgs.length} mensajes\n`;
  texto += `${'='.repeat(70)}\n`;
  for (const m of msgs) {
    const quien = m.kapso?.direction === 'inbound' ? 'CANDIDATO' : 'BOT      ';
    const cuando = new Date(Number(m.timestamp) * 1000 || m.timestamp).toISOString();
    texto += `[${cuando}] ${quien}: ${m.kapso?.content ?? `(${m.type})`}\n`;
  }
}
writeFileSync(path.join(salida, `kapso-${PHONE_ID}-transcripcion.txt`), texto);

console.log(`\n✓ ${conversaciones.length} conversaciones y ${mensajes.length} mensajes guardados en db/recuperacion/`);
for (const c of conversaciones) {
  console.log(`   ${c.phone_number}  ${c.kapso?.contact_name || ''}  (${c.kapso?.messages_count} msgs, hasta ${c.last_active_at})`);
}
