// Replica a mano lo que hacía la herramienta `agendarEntrevista` del bot para las
// entrevistas que se perdieron con la base efímera: pasa el candidato a etapa
// "Entrevista", le pone fecha y le crea el evento de calendario.
//
//   node scripts/agendar-entrevistas-recuperadas.mjs            -> simulacro
//   node scripts/agendar-entrevistas-recuperadas.mjs --aplicar  -> escribe
//
// La lista NO se deduce con expresiones regulares: sale de leer las 27 conversaciones
// donde el bot propuso hora concreta y comprobar, una por una, que el candidato
// aceptara y que el bot confirmara fecha explícita. Se excluyen las que no cuajaron.
// Fechas en hora local de Ciudad de México, tal como se pactaron en el chat.
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const Database = require('better-sqlite3');

const APLICAR = process.argv.includes('--aplicar');

// telefono, fecha_hora pactada, y la prueba textual que la respalda
const CITAS = [
  ['525653364183', '2026-07-25T10:00:00', 'Bot: "sábado 25 de julio a las 10:00" — "Claro q si muchas gracias"'],
  ['525651252194', '2026-07-27T09:00:00', 'Bot: "Lunes, 27 de julio de 2026, 9:00 a.m." — "Claro"'],
  ['525548976232', '2026-07-27T09:00:00', 'Bot: "Lunes 27 de julio a las 09:00 a.m." — "El lunes"'],
  ['525658980776', '2026-07-27T10:00:00', 'Bot: "Lunes 27 de julio a las 10:00 a.m." — confirmado'],
  ['525581684807', '2026-07-27T10:00:00', 'Bot: "el lunes a las 10:00" — "Pues estaría bien el lunes"'],
  ['525637582458', '2026-07-27T12:00:00', 'Bot: "lunes 27 de julio a las 12:00" — "lo veo el lunes a las 12:00"'],
  ['525646030197', '2026-07-27T12:00:00', 'Bot: "lunes 27 de julio a las 12:00 horas" — "si el lunes nos vemos"'],
  ['525654484693', '2026-07-27T14:00:00', 'Bot: "Lunes 27 de julio de 2026, 14:00 horas" — confirmado'],
  ['525543892320', '2026-07-28T10:00:00', 'Bot: "mañana martes a las 10:00" — "Mañana no tengo problema"'],
  ['525520397805', '2026-07-28T10:00:00', 'Bot: "Mañana martes a las 10:00 te esperamos" — "Mañana está bien"'],
  ['525511119667', '2026-07-28T10:00:00', 'Bot: "mañana martes a las 10:00" — "Mañana está bien"'],
  ['527208546510', '2026-07-28T10:00:00', 'Bot: "martes 28 de julio" 10:00 — "estoy en la oficina para mi entrevista"'],
  ['525534206106', '2026-07-28T10:00:00', 'Bot: "martes 28 de julio de 2026, 10:00 am" — "Mañana alas 10 am"'],
  ['525540994972', '2026-07-28T10:00:00', 'Bot: "Nos vemos mañana a las 10:00" — "sin falta estaré x aya"'],
  ['525581586483', '2026-07-28T11:00:00', 'Bot: "Martes 28 de julio de 2026, 11:00 a.m." — "Mañana alas 11 por favor"'],
  ['525576445806', '2026-07-28T12:00:00', 'Bot: "martes 28 de julio a las 12:00 mediodía" — "nos vemos el martes"'],
  ['527341123135', '2026-07-28T12:00:00', 'Bot: "Martes 28 de julio a las 12:00" — "mejor,el martes . 12oo esbien"'],
  ['525531993834', '2026-07-29T11:00:00', 'Bot: "miércoles 29 de julio a las 11:00 horas" — "Miércoles Por Favor A Las 11"'],
  ['525524173854', '2026-07-29T12:00:00', 'Bot: "miércoles 29 a las 12:00" — "El miércoles ya que necesito ir..."'],
  ['525657145705', '2026-07-30T12:00:00', 'Bot: "jueves 30 de julio a las 12:00 mediodía" — "Voy el dia jueves"'],
  ['527206490899', '2026-08-03T09:00:00', 'Bot: "Lunes 3 de agosto a las 09:00" — "Ok gracias"'],
];

// Casos que NO se agendan, y por qué. Se anotan en la ficha para que quede constancia.
const REVISAR = [
  ['525517040079', 'El bot dijo "Lunes 28 de julio a las 12:00", pero el 28 era martes. El candidato solo eligió "12". Falta decidir si fue lunes 27 o martes 28.'],
  ['525540258006', 'El bot preguntó "¿Confirmas el miércoles a las 12:00?" y no hay respuesta del candidato.'],
  ['525547604074', 'Se propusieron lunes 27 a las 10:00 o martes 28 a las 11:00; solo pidió la ubicación, nunca eligió.'],
  ['525537938365', 'Pidió la dirección exacta del colegio antes de acudir; se escaló a reclutador humano sin fecha.'],
  ['525537651319', 'Descartó por sueldo bajo: "deje lo checo y yo le estaría informando".'],
  ['525610273428', 'No quiso desplazarse: "mejor voy directamente al colegio de la colmena".'],
];

const clave = (t) => String(t || '').replace(/\D/g, '').slice(-10);
const dbPath = process.env.SQLITE_DB_PATH || path.join(projectRoot, 'db', 'app.db');
const sqlite = new Database(dbPath);

console.log(`Base de datos : ${dbPath}`);
console.log(`Modo          : ${APLICAR ? 'ESCRITURA' : 'simulacro (usa --aplicar para escribir)'}\n`);

// Todos los candidatos indexados por los últimos 10 dígitos, como hace el bot
const fichas = new Map();
for (const c of sqlite.prepare(`SELECT id, nombre, telefono, etapa, notas FROM candidatos`).all()) {
  fichas.set(clave(c.telefono), c);
}

const admin = sqlite.prepare(`SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`).get();
if (!admin) {
  console.error('✗ No hay ningún usuario admin: los eventos de calendario necesitan un autor.');
  process.exit(1);
}

const insEvento = sqlite.prepare(
  `INSERT INTO eventos_calendario (titulo, descripcion, fecha_inicio, todo_el_dia, creado_por, guardia_id, notificar_minutos_antes, notificado)
   VALUES (?, ?, ?, 0, ?, NULL, 60, 1)`
);
const updCand = sqlite.prepare(
  `UPDATE candidatos SET etapa = 'Entrevista', etapa_actualizada_en = ?, fecha_entrevista = ?, evento_id = ?, notas = ? WHERE id = ?`
);
const updNota = sqlite.prepare(`UPDATE candidatos SET notas = ? WHERE id = ?`);

let agendados = 0, ausentes = 0, anotados = 0;
const hoy = new Date().toISOString().slice(0, 10);

const trabajo = sqlite.transaction(() => {
  for (const [tel, cuando, prueba] of CITAS) {
    const f = fichas.get(clave(tel));
    if (!f) { console.log(`  · ${tel} no está en candidatos (¿falta importar?)`); ausentes++; continue; }

    const titulo = `Entrevista: ${f.nombre || `candidato ${tel}`}`;
    const desc =
      `Entrevista de reclutamiento agendada por el asistente de WhatsApp.\n` +
      `Teléfono: ${tel}\n` +
      `Reconstruida el ${hoy} desde el historial de Kapso tras la pérdida de la base.\n` +
      `Evidencia — ${prueba}`;
    const ev = insEvento.run(titulo, desc, cuando, admin.id);
    const notas = `${f.notas ? `${f.notas}\n\n` : ''}[${hoy}] Entrevista reconstruida para ${cuando.replace('T', ' ').slice(0, 16)}. ${prueba}`;
    // notificado = 1: la cita ya pasó, nadie quiere un recordatorio retroactivo
    updCand.run(new Date().toISOString(), cuando, Number(ev.lastInsertRowid), notas, f.id);
    agendados++;
  }

  for (const [tel, motivo] of REVISAR) {
    const f = fichas.get(clave(tel));
    if (!f) continue;
    updNota.run(`${f.notas ? `${f.notas}\n\n` : ''}[${hoy}] REVISAR: ${motivo}`, f.id);
    anotados++;
  }
});

if (APLICAR) {
  trabajo();
  console.log(`\n✓ ${agendados} candidatos pasados a etapa "Entrevista", con su evento de calendario.`);
  console.log(`✓ ${anotados} marcados para revisión manual en sus notas.`);
  if (ausentes) console.log(`! ${ausentes} no se encontraron: corre antes importar-candidatos-kapso.mjs`);
} else {
  console.log(`Se agendarían ${CITAS.length} entrevistas:\n`);
  for (const [tel, cuando, prueba] of CITAS) {
    const f = fichas.get(clave(tel));
    console.log(`  ${cuando.replace('T', ' ').slice(0, 16)}  ${(f?.nombre || '(no importado)').slice(0, 26).padEnd(28)} ${tel}`);
  }
  console.log(`\nY ${REVISAR.length} quedan fuera, anotados para revisión:`);
  for (const [tel, motivo] of REVISAR) {
    const f = fichas.get(clave(tel));
    console.log(`  ${(f?.nombre || tel).slice(0, 26).padEnd(28)} ${motivo.slice(0, 80)}`);
  }
}

sqlite.close();
