// Genera prospectos adicionales de ALTO VALOR en Ciudad de México:
// 1. Sedes y sucursales adicionales de corporativos y bancos que el tope de 3 había dejado fuera.
// 2. Nichos clave de seguridad: administradores de inmuebles/condominios, bienes raíces,
//    joyerías, despachos jurídicos, notarías, salones de eventos y casas de empeño.
import { writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { leerCSV, clasificarGiro, limpiarTelefono, limpiarCorreo, empresaClave, domicilio } from './lib/denue.mjs';

const CSV_CDMX = 'C:/Users/ferro/Downloads/denue_09_csv (1)/conjunto_de_datos/denue_inegi_09_.csv';
const PADRON = path.join(process.cwd(), 'prospeccion', 'entregados.json');
const SALIDA_CSV = path.join(process.cwd(), 'prospeccion', 'prospectos-lote-04-cdmx.csv');

console.log('[cdmx-extra] Leyendo DENUE CDMX...');
const filas = leerCSV(CSV_CDMX);
console.log(`[cdmx-extra] ${filas.length.toLocaleString('es-MX')} registros leídos.`);

const padron = existsSync(PADRON) ? JSON.parse(readFileSync(PADRON, 'utf8')) : { lotes: [] };
const yaEntregados = new Set(padron.lotes.flatMap((l) => l.ids));

const GIROS_ALTO_VALOR = new Set([
  '5311', '5312', '5313', // Inmobiliarias, administración de inmuebles y condominios
  '2361', '2362', '2371', '2372', '2373', '2379', // Construcción y obras
  '4651', // Joyerías y relojes
  '4841', '4842', '4885', '4931', // Bodegas, fletes y almacenamiento
  '5221', '5222', '5224', '5231', '5239', // Bancos, financieras, casas de cambio
  '4681', // Agencias de autos
  '5411', // Notarías y bufetes jurídicos
  '5241', '5242', // Seguros y fianzas
  '7139', // Salones y centros de convenciones
  '5611', '5612', // Servicios corporativos y administración de instalaciones (Facility Management)
]);

const PUNTOS_TAMANO = {
  '251 y más personas': 40,
  '101 a 250 personas': 34,
  '51 a 100 personas': 28,
  '31 a 50 personas': 22,
  '11 a 30 personas': 14,
  '6 a 10 personas': 6,
  '0 a 5 personas': 4, // Puntaje base para giros de alto valor
};

const prospectos = [];
for (const f of filas) {
  if (yaEntregados.has(f.id)) continue;
  const tel = limpiarTelefono(f.telefono);
  const cor = limpiarCorreo(f.correoelec);
  if (!tel && !cor) continue;

  const rama = (f.codigo_act || '').slice(0, 4);
  const giro = clasificarGiro(f.codigo_act);
  const esGiroEspecial = GIROS_ALTO_VALOR.has(rama);

  if (!giro && !esGiroEspecial) continue;

  const puntosTamano = PUNTOS_TAMANO[f.per_ocu] ?? 0;
  let puntos = (giro?.puntos || 30) + puntosTamano;
  if (tel && cor) puntos += 10;
  else if (tel) puntos += 6;
  else puntos += 4;
  if (f.www) puntos += 2;
  if (f.raz_social) puntos += 3;

  const prioridad = puntos >= 60 ? 'A' : puntos >= 40 ? 'B' : 'C';

  prospectos.push({
    id_denue: f.id,
    prioridad,
    puntaje: puntos,
    establecimiento: f.nom_estab,
    razon_social: f.raz_social || f.nom_estab,
    giro: f.nombre_act,
    codigo_scian: f.codigo_act,
    tamano: f.per_ocu,
    telefono: tel,
    correo: cor,
    sitio_web: f.www,
    domicilio: domicilio(f),
    colonia: f.nomb_asent,
    cp: f.cod_postal,
    alcaldia: f.municipio,
    latitud: f.latitud,
    longitud: f.longitud,
    alta_denue: f.fecha_alta,
  });
}

prospectos.sort((a, b) => b.puntaje - a.puntaje || Number(a.id_denue) - Number(b.id_denue));
console.log(`[cdmx-extra] ${prospectos.length.toLocaleString('es-MX')} nuevos prospectos calificados en CDMX.`);

// Encabezados CSV
const encabezados = [
  'id_denue', 'prioridad', 'puntaje', 'establecimiento', 'razon_social',
  'giro', 'codigo_scian', 'tamano', 'telefono', 'correo', 'sitio_web',
  'domicilio', 'colonia', 'cp', 'alcaldia', 'latitud', 'longitud', 'alta_denue',
];

const escapar = (val) => {
  const s = String(val ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const lineas = [
  encabezados.join(','),
  ...prospectos.map((p) => encabezados.map((k) => escapar(p[k])).join(',')),
];

writeFileSync(SALIDA_CSV, '\ufeff' + lineas.join('\n'), 'utf8');
console.log(`[cdmx-extra] Archivo generado: ${SALIDA_CSV}`);

// Actualizar padrón entregados.json
padron.lotes.push({
  lote: 4,
  fecha: new Date().toISOString().slice(0, 10),
  archivo: 'prospectos-lote-04-cdmx.csv',
  total: prospectos.length,
  puntaje_max: prospectos[0]?.puntaje || 0,
  puntaje_min: prospectos[prospectos.length - 1]?.puntaje || 0,
  ids: prospectos.map((p) => p.id_denue),
});
writeFileSync(PADRON, JSON.stringify(padron, null, 2), 'utf8');
console.log('[cdmx-extra] Padrón actualizado con lote 4.');
