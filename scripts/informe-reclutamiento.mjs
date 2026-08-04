// Informe de reclutamiento. Lee la base de datos, no el archivo de Kapso: así refleja
// el estado real de los expedientes y sirve igual en local que en producción.
//
//   node scripts/informe-reclutamiento.mjs
//
// Genera en db/recuperacion/:
//   informe-reclutamiento.html  -> para revisar e imprimir a PDF
//   informe-reclutamiento.csv   -> para Excel
//
// Fiabilidad de cada cifra, que es lo que importa en este informe:
//   CONTACTARON  dato duro: existe la conversación.
//   AGENDARON    verificado a mano: se leyó cada conversación donde el bot propuso hora
//                concreta y se comprobó que el candidato aceptara. La cita original se
//                guardaba con una llamada interna que no dejó rastro fuera de la base.
//   ASISTIERON   NO SE PUEDE SABER. Solo vivía en el campo `etapa`, actualizado a mano,
//                y se perdió con la base. No se rellena con suposiciones.
import { createRequire } from 'module';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const Database = require('better-sqlite3');

const dbPath = process.env.SQLITE_DB_PATH || path.join(projectRoot, 'db', 'app.db');
if (!existsSync(dbPath)) {
  console.error(`✗ No existe la base en ${dbPath}`);
  process.exit(1);
}
const sqlite = new Database(dbPath, { readonly: true });

const clave = (t) => String(t || '').replace(/\D/g, '').slice(-10);

const candidatos = sqlite
  .prepare(`SELECT id, nombre, telefono, etapa, fecha_entrevista, notas, created_at FROM candidatos ORDER BY id`)
  .all();

if (!candidatos.length) {
  console.error('✗ No hay candidatos en la base. Corre antes importar-candidatos-kapso.mjs');
  process.exit(1);
}

// Mensajes por teléfono, para el volumen de cada conversación
const porTel = new Map();
for (const m of sqlite.prepare(`SELECT telefono, created_at FROM whatsapp_conversaciones`).all()) {
  const k = clave(m.telefono);
  if (!porTel.has(k)) porTel.set(k, { n: 0, primero: null, ultimo: null });
  const e = porTel.get(k);
  e.n++;
  if (!e.primero || m.created_at < e.primero) e.primero = m.created_at;
  if (!e.ultimo || m.created_at > e.ultimo) e.ultimo = m.created_at;
}

const filas = candidatos.map((c) => {
  const t = porTel.get(clave(c.telefono)) || { n: 0, primero: null, ultimo: null };
  // La evidencia se anotó al reconstruir la cita; la revisión pendiente también
  const eviM = /\[\d{4}-\d{2}-\d{2}\] Entrevista reconstruida para [^.]+\. (.+)$/m.exec(c.notas || '');
  const revM = /\[\d{4}-\d{2}-\d{2}\] REVISAR: (.+)$/m.exec(c.notas || '');
  return {
    nombre: c.nombre || '(sin nombre en WhatsApp)',
    telefono: c.telefono,
    etapa: c.etapa,
    cita: c.fecha_entrevista ? c.fecha_entrevista.replace('T', ' ').slice(0, 16) : '',
    mensajes: t.n,
    primero: (t.primero || c.created_at || '').slice(0, 16),
    ultimo: (t.ultimo || '').slice(0, 16),
    evidencia: eviM ? eviM[1].trim() : '',
    revisar: revM ? revM[1].trim() : '',
  };
});

const agendaron = filas.filter((f) => f.cita).sort((a, b) => a.cita.localeCompare(b.cita));
const revisar = filas.filter((f) => f.revisar);
const resto = filas.filter((f) => !f.cita).sort((a, b) => b.mensajes - a.mensajes);

const dir = path.join(projectRoot, 'db', 'recuperacion');
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- CSV ----------
const csv = [
  ['nombre', 'telefono', 'etapa', 'fecha_entrevista', 'mensajes', 'primer_contacto', 'ultimo_mensaje', 'evidencia', 'a_revisar'],
  ...filas.map((f) => [f.nombre, f.telefono, f.etapa, f.cita, f.mensajes, f.primero, f.ultimo, f.evidencia, f.revisar]),
]
  .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
  .join('\n');
writeFileSync(path.join(dir, 'informe-reclutamiento.csv'), '﻿' + csv, 'utf8');

// ---------- HTML ----------
const fechas = filas.flatMap((f) => [f.primero, f.ultimo]).filter(Boolean).sort();
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
  .fecha { white-space:nowrap; font-weight:600; }
  .pie { margin-top:36px; padding-top:12px; border-top:1px solid var(--borde); font-size:11px; color:var(--tenue); }
  @media print { body { padding:0; } h2 { page-break-after:avoid; } tr { page-break-inside:avoid; } }
</style></head><body>
<h1>Informe de reclutamiento por WhatsApp</h1>
<div class="sub">U3 Seguridad Privada · Periodo ${esc(fechas[0]?.slice(0, 10) || '—')} a ${esc(fechas[fechas.length - 1]?.slice(0, 10) || '—')} · Generado el ${new Date().toISOString().slice(0, 10)}</div>

<div class="cifras">
  <div class="caja"><div class="n">${filas.length}</div><div class="r">Nos contactaron</div></div>
  <div class="caja"><div class="n">${agendaron.length}</div><div class="r">Agendaron entrevista</div></div>
  <div class="caja"><div class="n">—</div><div class="r">Asistieron</div></div>
  <div class="caja"><div class="n">${filas.reduce((s, f) => s + f.mensajes, 0)}</div><div class="r">Mensajes</div></div>
</div>

<div class="aviso">
  <strong>Sobre estas cifras.</strong> Los contactos son dato duro: cada uno tiene su conversación completa.
  Las <strong>${agendaron.length} entrevistas</strong> se verificaron leyendo una por una las conversaciones en las que el
  asistente propuso hora concreta, comprobando que el candidato aceptara y que se confirmara fecha explícita; cada fila
  incluye la frase textual que la respalda. <strong>La asistencia no se puede reconstruir</strong>: solo existía en el
  expediente de la aplicación, se actualizaba a mano y no dejó rastro en WhatsApp.
</div>

<h2>Agendaron entrevista (${agendaron.length})</h2>
<table><thead><tr><th>Fecha y hora</th><th>Nombre</th><th>Teléfono</th><th>Evidencia en la conversación</th></tr></thead><tbody>
${agendaron.map((f) => `<tr><td class="fecha">${esc(f.cita)}</td><td>${esc(f.nombre)}</td><td>${esc(f.telefono)}</td><td class="cita">${esc(f.evidencia)}</td></tr>`).join('\n')}
</tbody></table>
${revisar.length ? `
<h2>Requieren decisión manual (${revisar.length})</h2>
<table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Motivo</th></tr></thead><tbody>
${revisar.map((f) => `<tr><td>${esc(f.nombre)}</td><td>${esc(f.telefono)}</td><td class="cita">${esc(f.revisar)}</td></tr>`).join('\n')}
</tbody></table>` : ''}

<h2>Contactaron sin llegar a agendar (${resto.length})</h2>
<table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Msgs</th><th>Primer contacto</th><th>Último mensaje</th></tr></thead><tbody>
${resto.map((f) => `<tr><td>${esc(f.nombre)}</td><td>${esc(f.telefono)}</td><td>${f.mensajes}</td><td>${esc(f.primero)}</td><td>${esc(f.ultimo)}</td></tr>`).join('\n')}
</tbody></table>

<div class="pie">
  Reconstruido desde el historial de la API de Kapso. La base de datos de producción se alojaba en almacenamiento
  efímero y se borraba en cada reinicio del servicio; esas conversaciones son la única copia que sobrevivió.
  Documento con datos personales de candidatos: trátese conforme a la LFPDPPP.
</div>
</body></html>`;

writeFileSync(path.join(dir, 'informe-reclutamiento.html'), html, 'utf8');

console.log(`Contactaron        : ${filas.length}`);
console.log(`Agendaron          : ${agendaron.length}  (verificadas a mano)`);
console.log(`Requieren decisión : ${revisar.length}`);
console.log(`Asistieron         : no reconstruible`);
console.log(`Mensajes           : ${filas.reduce((s, f) => s + f.mensajes, 0)}`);
console.log(`\n✓ db/recuperacion/informe-reclutamiento.html`);
console.log(`✓ db/recuperacion/informe-reclutamiento.csv`);

sqlite.close();
