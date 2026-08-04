// Reconstruye candidatos e historial de WhatsApp a partir del archivo de Kapso.
// Solo escribe datos verificables: teléfono, nombre de contacto y la transcripción
// literal. No infiere ciudad, edad, vacante ni fecha de entrevista — eso lo revisa
// una persona, porque son registros de gente real.
//
//   node scripts/importar-candidatos-kapso.mjs <phoneNumberId>            -> simulacro
//   node scripts/importar-candidatos-kapso.mjs <phoneNumberId> --aplicar  -> escribe
//   ... --incluir-internos    también importa los números propios de U3
//
// Lee db/recuperacion/*.json si existe; si no, descarga de la API de Kapso.
// Dentro del contenedor de Railway usa SQLITE_DB_PATH, o sea el volumen.
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const Database = require('better-sqlite3');

const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const INTERNOS = args.includes('--incluir-internos');
const PHONE_ID = args.find((a) => !a.startsWith('--')) || process.env.KAPSO_PHONE_NUMBER_ID;

function envLocal(clave) {
  if (process.env[clave]) return process.env[clave];
  try {
    const txt = readFileSync(path.join(projectRoot, '.env.local'), 'utf8');
    const m = txt.match(new RegExp(`^\\s*${clave}\\s*=\\s*(.*)$`, 'm'));
    return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : undefined;
  } catch { return undefined; }
}

// Números propios de la empresa: no son candidatos
const ES_INTERNO = (nombre) => /U3\b|ADM|RH\b|Fernando Rosas/i.test(nombre || '');
// Mismo criterio que usa el bot para emparejar teléfonos
const clave = (tel) => String(tel || '').replace(/\D/g, '').slice(-10);

async function cargar() {
  const dir = path.join(projectRoot, 'db', 'recuperacion');
  const fc = path.join(dir, `kapso-${PHONE_ID}-conversaciones.json`);
  const fm = path.join(dir, `kapso-${PHONE_ID}-mensajes.json`);
  if (existsSync(fc) && existsSync(fm)) {
    console.log('Origen: archivos locales en db/recuperacion/\n');
    return [JSON.parse(readFileSync(fc, 'utf8')), JSON.parse(readFileSync(fm, 'utf8'))];
  }
  console.log('Origen: API de Kapso\n');
  const apiKey = envLocal('KAPSO_API_KEY');
  const version = envLocal('KAPSO_VERSION') || 'v24.0';
  if (!apiKey) throw new Error('Falta KAPSO_API_KEY');
  const base = `https://api.kapso.ai/meta/whatsapp/${version}/${PHONE_ID}`;
  const todo = async (ruta) => {
    const items = [];
    let after = null;
    do {
      const url = new URL(base + ruta);
      url.searchParams.set('limit', '100');
      if (after) url.searchParams.set('after', after);
      const res = await fetch(url, { headers: { 'X-API-Key': apiKey } });
      if (!res.ok) throw new Error(`${ruta} respondió ${res.status}`);
      const j = await res.json();
      items.push(...(j.data || []));
      after = j.paging?.next ? j.paging?.cursors?.after : null;
    } while (after);
    return items;
  };
  return [await todo('/conversations'), await todo('/messages')];
}

if (!PHONE_ID) {
  console.error('✗ Indica el phone_number_id de Kapso.');
  process.exit(1);
}

const [conversaciones, mensajes] = await cargar();

// Agrupa por teléfono: un contacto puede tener varias conversaciones
const porTelefono = new Map();
for (const c of conversaciones) {
  const k = clave(c.phone_number);
  if (!k) continue;
  if (!porTelefono.has(k)) {
    porTelefono.set(k, { telefono: c.phone_number, nombre: null, ultima: null, msgs: [] });
  }
  const e = porTelefono.get(k);
  const n = c.kapso?.contact_name;
  if (n && !e.nombre) e.nombre = n;
  if (!e.ultima || String(c.last_active_at) > String(e.ultima)) e.ultima = c.last_active_at;
}
for (const m of mensajes) {
  const k = clave(m.kapso?.phone_number);
  const e = porTelefono.get(k);
  if (!e) continue;
  const contenido = m.kapso?.content;
  if (!contenido) continue; // adjuntos sin texto: no hay nada literal que guardar
  const ts = Number(m.timestamp);
  e.msgs.push({
    cuando: new Date(Number.isFinite(ts) && ts > 0 ? ts * 1000 : m.timestamp).toISOString().replace('T', ' ').slice(0, 19),
    entrante: m.kapso?.direction === 'inbound',
    texto: contenido,
  });
}
for (const e of porTelefono.values()) e.msgs.sort((a, b) => a.cuando.localeCompare(b.cuando));

const todos = [...porTelefono.values()];
const internos = todos.filter((e) => ES_INTERNO(e.nombre));
const candidatos = INTERNOS ? todos : todos.filter((e) => !ES_INTERNO(e.nombre));

const dbPath = process.env.SQLITE_DB_PATH || path.join(projectRoot, 'db', 'app.db');
console.log(`Base de datos : ${dbPath}`);
console.log(`Contactos     : ${todos.length}  (${internos.length} internos ${INTERNOS ? 'incluidos' : 'omitidos'})`);
console.log(`A importar    : ${candidatos.length}`);
console.log(`Modo          : ${APLICAR ? 'ESCRITURA' : 'simulacro (usa --aplicar para escribir)'}\n`);

const sqlite = new Database(dbPath);

const yaExiste = sqlite.prepare(`SELECT id, telefono FROM candidatos`).all();
const existentes = new Set(yaExiste.map((r) => clave(r.telefono)));

const insCand = sqlite.prepare(
  `INSERT INTO candidatos (nombre, telefono, etapa, origen, notas, created_at) VALUES (?, ?, 'Nuevo', 'WhatsApp', ?, ?)`
);
const insMsg = sqlite.prepare(
  `INSERT INTO whatsapp_conversaciones (telefono, rol, autor, mensaje, created_at) VALUES (?, ?, ?, ?, ?)`
);
const insChat = sqlite.prepare(
  `INSERT OR REPLACE INTO whatsapp_chats (telefono, bot_activo, no_leidos, ultima_actividad) VALUES (?, 0, 0, ?)`
);
const chatExiste = sqlite.prepare(`SELECT telefono FROM whatsapp_chats WHERE telefono = ?`);

let nuevos = 0, saltados = 0, msgsInsertados = 0;

const trabajo = sqlite.transaction(() => {
  for (const e of candidatos) {
    if (existentes.has(clave(e.telefono))) { saltados++; continue; }

    const transcripcion = e.msgs
      .map((m) => `[${m.cuando}] ${m.entrante ? 'Candidato' : 'Uli'}: ${m.texto}`)
      .join('\n');
    const notas =
      `Recuperado del historial de Kapso el ${new Date().toISOString().slice(0, 10)}.\n` +
      `La base de producción se perdía en cada reinicio; esta es la conversación literal.\n` +
      `${e.msgs.length} mensajes, última actividad ${e.ultima}.\n\n${transcripcion}`;

    const creado = (e.msgs[0]?.cuando) || new Date().toISOString().slice(0, 19).replace('T', ' ');
    insCand.run(e.nombre || null, e.telefono, notas, creado);
    nuevos++;

    // Historial de chat, para que el módulo de WhatsApp lo muestre igual que antes
    if (!chatExiste.get(e.telefono)) {
      for (const m of e.msgs) {
        insMsg.run(e.telefono, m.entrante ? 'user' : 'model', m.entrante ? 'contacto' : 'bot', m.texto, m.cuando);
        msgsInsertados++;
      }
      // bot_activo = 0: nadie quiere que Uli reanude solo conversaciones de hace semanas
      insChat.run(e.telefono, e.ultima);
    }
  }
});

if (APLICAR) {
  trabajo();
  console.log(`✓ ${nuevos} candidatos creados, ${saltados} ya existían.`);
  console.log(`✓ ${msgsInsertados} mensajes restaurados en el historial de WhatsApp.`);
  console.log('\nTodos quedan en etapa "Nuevo" con el bot apagado. Revisa y reclasifica desde Reclutamiento.');
} else {
  console.log(`Se crearían ${candidatos.length - saltados} candidatos (${saltados} ya existen).`);
  console.log('\nMuestra de los primeros 5:');
  for (const e of candidatos.filter((x) => !existentes.has(clave(x.telefono))).slice(0, 5)) {
    console.log(`  ${e.telefono}  ${(e.nombre || '(sin nombre)').slice(0, 32).padEnd(32)} ${e.msgs.length} msgs`);
  }
  if (!INTERNOS && internos.length) {
    console.log(`\nOmitidos por internos: ${internos.map((e) => e.nombre).join(', ')}`);
  }
}

sqlite.close();
