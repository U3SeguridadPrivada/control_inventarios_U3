// Informe de reclutamiento a partir del historial de Kapso.
//
//   node scripts/informe-reclutamiento.mjs <phoneNumberId>
//
// Genera en db/recuperacion/:
//   informe-reclutamiento.html  -> para revisar e imprimir a PDF
//   informe-reclutamiento.csv   -> para Excel
//
// Sobre la fiabilidad, que es lo que importa aquí:
//   CONTACTARON  dato duro: existe la conversación.
//   AGENDARON    indicio: el bot confirmó hora concreta en el chat. La cita real se
//                registraba con una llamada a herramienta que Kapso no ve, así que
//                esto se deduce del texto y hay que confirmarlo a ojo. Se incluye la
//                frase textual y su fecha para poder verificar cada caso en segundos.
//   ASISTIERON   NO SE PUEDE SABER. La asistencia solo vivía en el campo `etapa`,
//                que se actualizaba a mano en la app y se perdió con la base.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const PHONE_ID = process.argv[2] || process.env.KAPSO_PHONE_NUMBER_ID;
const dir = path.join(projectRoot, 'db', 'recuperacion');

const fc = path.join(dir, `kapso-${PHONE_ID}-conversaciones.json`);
const fm = path.join(dir, `kapso-${PHONE_ID}-mensajes.json`);
if (!existsSync(fc) || !existsSync(fm)) {
  console.error(`✗ Faltan los archivos de Kapso. Corre antes: node scripts/exportar-kapso.mjs ${PHONE_ID}`);
  process.exit(1);
}

const conversaciones = JSON.parse(readFileSync(fc, 'utf8'));
const mensajes = JSON.parse(readFileSync(fm, 'utf8'));

const ES_INTERNO = (n) => /U3\b|ADM|RH\b|Fernando Rosas/i.test(n || '');
const clave = (t) => String(t || '').replace(/\D/g, '').slice(-10);
const cuando = (m) => {
  const ts = Number(m.timestamp);
  return new Date(Number.isFinite(ts) && ts > 0 ? ts * 1000 : m.timestamp).toISOString().replace('T', ' ').slice(0, 16);
};

const gente = new Map();
for (const c of conversaciones) {
  const k = clave(c.phone_number);
  if (!k || ES_INTERNO(c.kapso?.contact_name)) continue;
  if (!gente.has(k)) gente.set(k, { telefono: c.phone_number, nombre: c.kapso?.contact_name || '', msgs: [] });
  else if (!gente.get(k).nombre && c.kapso?.contact_name) gente.get(k).nombre = c.kapso.contact_name;
}
for (const m of mensajes) {
  const e = gente.get(clave(m.kapso?.phone_number));
  if (!e || !m.kapso?.content) continue;
  e.msgs.push({ cuando: cuando(m), entrante: m.kapso.direction === 'inbound', texto: m.kapso.content });
}

// Confirmación de cita: hora concreta junto a una palabra de encuentro, dicha por el bot
const RE_HORA = /(\b\d{1,2}:\d{2}\b)|(\b\d{1,2} de la (mañana|tarde)\b)/i;
const RE_CITA = /(entrevista|cita|te espero|nos vemos|preséntate|presentarte)/i;

const filas = [];
for (const e of gente.values()) {
  e.msgs.sort((a, b) => a.cuando.localeCompare(b.cuando));
  const pruebas = e.msgs.filter((m) => !m.entrante && RE_HORA.test(m.texto) && RE_CITA.test(m.texto));
  const ultima = pruebas[pruebas.length - 1];
  filas.push({
    nombre: e.nombre || '(sin nombre en WhatsApp)',
    telefono: e.telefono,
    mensajes: e.msgs.length,
    primer: e.msgs[0]?.cuando || '',
    ultimo: e.msgs[e.msgs.length - 1]?.cuando || '',
    agendo: pruebas.length > 0,
    evidencia: ultima ? ultima.texto.replace(/\s+/g, ' ').slice(0, 300) : '',
    evidenciaCuando: ultima?.cuando || '',
  });
}
filas.sort((a, b) => (b.agendo - a.agendo) || b.mensajes - a.mensajes);

const conCita = filas.filter((f) => f.agendo);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- CSV ----------
const csv = [
  ['nombre', 'telefono', 'mensajes', 'primer_contacto', 'ultimo_mensaje', 'agendo_probable', 'evidencia_fecha', 'evidencia_texto'],
  ...filas.map((f) => [f.nombre, f.telefono, f.mensajes, f.primer, f.ultimo, f.agendo ? 'si' : 'no', f.evidenciaCuando, f.evidencia]),
]
  .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
  .join('\n');
writeFileSync(path.join(dir, 'informe-reclutamiento.csv'), '﻿' + csv, 'utf8');

// ---------- HTML ----------
const fechas = filas.flatMap((f) => [f.primer, f.ultimo]).filter(Boolean).sort();
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Informe de reclutamiento — U3 Seguridad Privada</title>
<style>
  :root { --tinta:#1e3a5f; --borde:#d8dee9; --tenue:#64748b; }
  * { box-sizing:border-box; }
  body { font-family:"Segoe UI",system-ui,sans-serif; margin:0; padding:32px; color:#0f172a; line-height:1.5; }
  h1 { color:var(--tinta); font-size:22px; margin:0 0 4px; }
  h2 { color:var(--tinta); font-size:16px; margin:32px 0 10px; padding-bottom:6px; border-bottom:2px solid var(--tinta); }
  .sub { color:var(--tenue); font-size:13px; margin-bottom:24px; }
  .cifras { display:flex; gap:14px; flex-wrap:wrap; margin:20px 0; }
  .caja { border:1px solid var(--borde); border-radius:8px; padding:14px 18px; min-width:150px; }
  .caja .n { font-size:28px; font-weight:700; color:var(--tinta); }
  .caja .r { font-size:12px; color:var(--tenue); text-transform:uppercase; letter-spacing:.4px; }
  .aviso { background:#fff7ed; border-left:4px solid #ea580c; padding:12px 16px; margin:16px 0; font-size:13px; border-radius:0 6px 6px 0; }
  table { border-collapse:collapse; width:100%; font-size:12px; }
  th { background:var(--tinta); color:#fff; text-align:left; padding:8px; font-weight:600; }
  td { border-bottom:1px solid var(--borde); padding:7px 8px; vertical-align:top; }
  tr:nth-child(even) td { background:#f8fafc; }
  .cita { color:var(--tenue); font-style:italic; }
  .pie { margin-top:36px; padding-top:12px; border-top:1px solid var(--borde); font-size:11px; color:var(--tenue); }
  @media print { body { padding:0; } h2 { page-break-after:avoid; } tr { page-break-inside:avoid; } }
</style></head><body>
<h1>Informe de reclutamiento por WhatsApp</h1>
<div class="sub">U3 Seguridad Privada · Periodo ${esc(fechas[0]?.slice(0, 10) || '—')} a ${esc(fechas[fechas.length - 1]?.slice(0, 10) || '—')} · Generado el ${new Date().toISOString().slice(0, 10)}</div>

<div class="cifras">
  <div class="caja"><div class="n">${filas.length}</div><div class="r">Nos contactaron</div></div>
  <div class="caja"><div class="n">${conCita.length}</div><div class="r">Agendaron (probable)</div></div>
  <div class="caja"><div class="n">—</div><div class="r">Asistieron</div></div>
  <div class="caja"><div class="n">${filas.reduce((s, f) => s + f.mensajes, 0)}</div><div class="r">Mensajes</div></div>
</div>

<div class="aviso">
  <strong>Sobre la fiabilidad de estas cifras.</strong> Los contactos son dato duro: cada uno tiene su conversación.
  Los <em>agendaron</em> son un indicio, no un registro: la cita se guardaba en la base de datos que se perdió, así que
  aquí se deducen de que el bot confirmara una hora concreta por escrito. Cada caso incluye la frase textual para
  poder verificarlo. <strong>La asistencia no se puede reconstruir</strong>: solo existía en el expediente de la app,
  actualizado a mano, y no dejó rastro en WhatsApp.
</div>

<h2>Agendaron entrevista (${conCita.length}) — requiere confirmación</h2>
<table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Confirmado el</th><th>Frase del bot</th></tr></thead><tbody>
${conCita.map((f) => `<tr><td>${esc(f.nombre)}</td><td>${esc(f.telefono)}</td><td>${esc(f.evidenciaCuando)}</td><td class="cita">${esc(f.evidencia)}</td></tr>`).join('\n')}
</tbody></table>

<h2>Todos los que nos contactaron (${filas.length})</h2>
<table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Msgs</th><th>Primer contacto</th><th>Último mensaje</th><th>Agendó</th></tr></thead><tbody>
${filas.map((f) => `<tr><td>${esc(f.nombre)}</td><td>${esc(f.telefono)}</td><td>${f.mensajes}</td><td>${esc(f.primer)}</td><td>${esc(f.ultimo)}</td><td>${f.agendo ? 'Probable' : '—'}</td></tr>`).join('\n')}
</tbody></table>

<div class="pie">
  Reconstruido desde el historial de la API de Kapso. La base de datos de producción se alojaba en almacenamiento
  efímero y se borraba en cada reinicio del servicio; estas conversaciones son la única copia que sobrevivió.
  Documento con datos personales de candidatos: trátese conforme a la LFPDPPP.
</div>
</body></html>`;

writeFileSync(path.join(dir, 'informe-reclutamiento.html'), html, 'utf8');

console.log(`Contactaron        : ${filas.length}`);
console.log(`Agendaron (indicio): ${conCita.length}`);
console.log(`Asistieron         : no reconstruible`);
console.log(`Mensajes           : ${filas.reduce((s, f) => s + f.mensajes, 0)}`);
console.log(`\n✓ db/recuperacion/informe-reclutamiento.html  (abre e imprime a PDF)`);
console.log(`✓ db/recuperacion/informe-reclutamiento.csv   (para Excel)`);
