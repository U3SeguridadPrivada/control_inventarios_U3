// Selecciona prospectos de servicios de guardias a partir del DENUE del INEGI.
//
//   node scripts/prospectar-denue.mjs --reporte          Solo diagnóstico, no escribe nada.
//   node scripts/prospectar-denue.mjs --lote             Emite el siguiente lote de 10,000.
//   node scripts/prospectar-denue.mjs --lote --tamano 5000
//   node scripts/prospectar-denue.mjs --lote --csv "ruta/al/denue.csv"
//   node scripts/prospectar-denue.mjs --lote --sucursales 5
//
// Cada lote excluye todo lo ya entregado: los ids salen del padrón prospeccion/entregados.json.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { leerCSV, calificar, domicilio, empresaClave } from './lib/denue.mjs';

const CSV_POR_DEFECTO = 'C:/Users/ferro/Downloads/denue_09_csv (1)/conjunto_de_datos/denue_inegi_09_.csv';
const CARPETA_SALIDA = path.join(process.cwd(), 'prospeccion');
const PADRON = path.join(CARPETA_SALIDA, 'entregados.json');

const args = process.argv.slice(2);
const opcion = (nombre, def) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const rutaCSV = opcion('csv', CSV_POR_DEFECTO);
const tamanoLote = Number(opcion('tamano', '10000'));
const maxSucursales = Number(opcion('sucursales', '3'));
const soloReporte = args.includes('--reporte') || !args.includes('--lote');

const ETIQUETA_PRIORIDAD = { alto: 'A', medio: 'B', bajo: 'C' };
const ORDEN_TAMANO = [
  '251 y más personas', '101 a 250 personas', '51 a 100 personas',
  '31 a 50 personas', '11 a 30 personas', '6 a 10 personas',
];

console.log(`[denue] Leyendo ${rutaCSV}`);
const filas = leerCSV(rutaCSV);
console.log(`[denue] ${filas.length.toLocaleString('es-MX')} establecimientos en el archivo.`);

const prospectos = [];
for (const f of filas) {
  const nota = calificar(f);
  if (nota) prospectos.push({ ...f, ...nota });
}
prospectos.sort((a, b) => b.puntos - a.puntos || Number(a.id) - Number(b.id));
console.log(`[denue] ${prospectos.length.toLocaleString('es-MX')} califican como prospectos con contacto utilizable.`);

// --- Padrón de lo ya entregado ---
const padron = existsSync(PADRON)
  ? JSON.parse(readFileSync(PADRON, 'utf8'))
  : { lotes: [] };
const yaEntregados = new Set(padron.lotes.flatMap((l) => l.ids));
const disponibles = prospectos.filter((p) => !yaEntregados.has(p.id));

// Sucursales de la misma empresa ya entregadas en lotes anteriores: cuentan para el tope.
const sucursalesPorEmpresa = new Map();
for (const p of prospectos) {
  if (!yaEntregados.has(p.id)) continue;
  const clave = empresaClave(p);
  sucursalesPorEmpresa.set(clave, (sucursalesPorEmpresa.get(clave) || 0) + 1);
}

if (padron.lotes.length) {
  console.log(`[denue] Ya entregados: ${yaEntregados.size.toLocaleString('es-MX')} en ${padron.lotes.length} lote(s).`);
}
console.log(`[denue] Disponibles sin repetir: ${disponibles.length.toLocaleString('es-MX')}.`);

const seleccion = [];
const pospuestos = [];
for (const p of disponibles) {
  if (seleccion.length >= tamanoLote) break;
  const clave = empresaClave(p);
  const usadas = sucursalesPorEmpresa.get(clave) || 0;
  if (usadas >= maxSucursales) { pospuestos.push(p); continue; }
  sucursalesPorEmpresa.set(clave, usadas + 1);
  seleccion.push(p);
}
const empresasDistintas = new Set(seleccion.map(empresaClave)).size;

// Cuánto queda realmente para lotes futuros: lo no entregado, menos lo que el tope ya descartó.
const contadorRestante = new Map(sucursalesPorEmpresa);
let restanteElegible = 0;
for (const p of disponibles.slice(seleccion.length + pospuestos.length)) {
  const clave = empresaClave(p);
  const usadas = contadorRestante.get(clave) || 0;
  if (usadas >= maxSucursales) continue;
  contadorRestante.set(clave, usadas + 1);
  restanteElegible++;
}

// --- Diagnóstico ---
const resumen = (lista, campo) => {
  const cuenta = {};
  for (const p of lista) cuenta[p[campo]] = (cuenta[p[campo]] || 0) + 1;
  return Object.entries(cuenta).sort((a, b) => b[1] - a[1]);
};

console.log(`\n=== Composición del lote (${seleccion.length.toLocaleString('es-MX')} registros) ===`);
console.log(`Empresas distintas: ${empresasDistintas.toLocaleString('es-MX')} (tope de ${maxSucursales} sucursales por razón social).`);
console.log(`Sucursales excedentes descartadas por el tope: ${pospuestos.length.toLocaleString('es-MX')}.`);
console.log('\nPor tamaño del establecimiento:');
for (const t of ORDEN_TAMANO) {
  const n = seleccion.filter((p) => p.per_ocu === t).length;
  if (n) console.log(`  ${t.padEnd(20)} ${String(n).padStart(6)}`);
}
console.log('\nPor prioridad de giro:');
for (const [nivel, n] of resumen(seleccion, 'nivelGiro')) {
  console.log(`  ${ETIQUETA_PRIORIDAD[nivel]} (${nivel})`.padEnd(22) + String(n).padStart(6));
}
console.log('\nPor tipo de contacto:');
const conAmbos = seleccion.filter((p) => p.telefono && p.correo).length;
const soloTel = seleccion.filter((p) => p.telefono && !p.correo).length;
const soloMail = seleccion.filter((p) => !p.telefono && p.correo).length;
console.log(`  Teléfono y correo    ${String(conAmbos).padStart(6)}`);
console.log(`  Solo teléfono        ${String(soloTel).padStart(6)}`);
console.log(`  Solo correo          ${String(soloMail).padStart(6)}`);
console.log('\nTop 15 giros del lote:');
for (const [nombre, n] of resumen(seleccion, 'nombre_act').slice(0, 15)) {
  console.log(`  ${String(n).padStart(5)}  ${nombre.slice(0, 72)}`);
}
console.log('\nTop 10 alcaldías:');
for (const [nombre, n] of resumen(seleccion, 'municipio').slice(0, 10)) {
  console.log(`  ${String(n).padStart(5)}  ${nombre}`);
}

if (soloReporte) {
  console.log('\n[denue] Modo reporte: no se escribió ningún archivo. Usa --lote para emitirlo.');
  process.exit(0);
}

if (!seleccion.length) {
  console.log('\n[denue] No quedan prospectos disponibles sin repetir.');
  process.exit(0);
}

// --- Salida ---
const ENCABEZADOS = [
  'id_denue', 'prioridad', 'puntaje', 'establecimiento', 'razon_social', 'giro',
  'codigo_scian', 'tamano', 'telefono', 'correo', 'sitio_web', 'domicilio',
  'colonia', 'cp', 'alcaldia', 'latitud', 'longitud', 'alta_denue',
];

const escapar = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const lineas = [ENCABEZADOS.join(',')];
for (const p of seleccion) {
  lineas.push([
    p.id, ETIQUETA_PRIORIDAD[p.nivelGiro], p.puntos, p.nom_estab, p.raz_social,
    p.nombre_act, p.codigo_act, p.per_ocu, p.telefono, p.correo, p.www,
    domicilio(p), p.nomb_asent, p.cod_postal, p.municipio, p.latitud, p.longitud,
    p.fecha_alta,
  ].map(escapar).join(','));
}

mkdirSync(CARPETA_SALIDA, { recursive: true });
const numeroLote = padron.lotes.length + 1;
const archivo = path.join(CARPETA_SALIDA, `prospectos-lote-${String(numeroLote).padStart(2, '0')}.csv`);
writeFileSync(archivo, '\ufeff' + lineas.join('\r\n') + '\r\n', 'utf8');

padron.lotes.push({
  lote: numeroLote,
  fecha: new Date().toISOString().slice(0, 10),
  archivo: path.basename(archivo),
  total: seleccion.length,
  puntaje_max: seleccion[0].puntos,
  puntaje_min: seleccion[seleccion.length - 1].puntos,
  empresas_distintas: empresasDistintas,
  ids: seleccion.map((p) => p.id),
});
writeFileSync(PADRON, JSON.stringify(padron, null, 2), 'utf8');

console.log(`\n[denue] Lote ${numeroLote}: ${seleccion.length.toLocaleString('es-MX')} prospectos -> ${archivo}`);
console.log(`[denue] Puntaje de ${seleccion[0].puntos} a ${seleccion[seleccion.length - 1].puntos}.`);
console.log(`[denue] Padrón actualizado: ${PADRON}`);
console.log(`[denue] Quedan ${restanteElegible.toLocaleString('es-MX')} prospectos elegibles para lotes siguientes.`);
