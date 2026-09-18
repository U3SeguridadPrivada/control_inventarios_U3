/**
 * Cálculo automático (mejor esfuerzo) de CURP y de la clave de RFC a partir de
 * datos ya capturados en el alta rápida: nombre completo, fecha de nacimiento,
 * sexo y estado. Ambos campos quedan editables en el formulario porque:
 *  - El dígito diferenciador de la CURP (posición 17) solo lo asigna RENAPO
 *    cuando detecta una coincidencia con otra persona; aquí se usa el valor
 *    por defecto ('0' o 'A' según el año de nacimiento).
 *  - La homoclave del RFC (últimos 3 caracteres) depende de una tabla de
 *    conversión propia del SAT que no es reconstruible de forma confiable
 *    sin su servicio oficial, así que solo se generan los primeros 10
 *    caracteres (letras + fecha) y el resto se deja para capturarlo desde
 *    la identificación oficial del elemento.
 */
import { MESES } from '@/src/components/ui/rango-fechas';

const CONECTORES = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'MC', 'VON', 'VAN', 'SAN', 'SANTA']);

// Se procesa carácter por carácter (en vez de normalize('NFD') sobre toda la
// cadena) para poder blindar la Ñ: NFD la separaría en "n" + virgulilla
// combinante y esa "ñ-dad" sí importa para la CURP, que le reserva su propio
// carácter en el alfabeto.
function sinAcentos(s: string): string {
  return s
    .split('')
    .map((ch) => (ch === 'ñ' || ch === 'Ñ' ? ch : ch.normalize('NFD')[0]))
    .join('')
    .toUpperCase();
}

export interface NombreDividido {
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
}

/** Heurística: los apellidos son las últimas 1-2 "palabras" (con sus conectores como "de la"); el resto son nombres. */
export function dividirNombreCompleto(nombreCompleto: string): NombreDividido {
  const palabras = nombreCompleto.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return { nombres: '', apellidoPaterno: '', apellidoMaterno: '' };
  if (palabras.length === 1) return { nombres: palabras[0], apellidoPaterno: '', apellidoMaterno: '' };
  if (palabras.length === 2) return { nombres: palabras[0], apellidoPaterno: palabras[1], apellidoMaterno: '' };

  let i = palabras.length - 1;
  const materno: string[] = [palabras[i]];
  i--;
  while (i >= 0 && CONECTORES.has(palabras[i].toUpperCase())) {
    materno.unshift(palabras[i]);
    i--;
  }
  const paterno: string[] = [];
  if (i >= 0) {
    paterno.unshift(palabras[i]);
    i--;
    while (i >= 0 && CONECTORES.has(palabras[i].toUpperCase())) {
      paterno.unshift(palabras[i]);
      i--;
    }
  }
  const nombres = palabras.slice(0, i + 1).join(' ');
  return {
    nombres: nombres || paterno.join(' ') || materno.join(' '),
    apellidoPaterno: paterno.join(' '),
    apellidoMaterno: materno.join(' '),
  };
}

export function calcularEdad(dia: string, mes: string, anio: string): number | null {
  const d = parseInt(dia, 10);
  const mIdx = MESES.indexOf((mes || '').toLowerCase());
  const y = parseInt(anio, 10);
  if (!d || mIdx < 0 || !y) return null;
  const nacimiento = new Date(y, mIdx, d);
  if (isNaN(nacimiento.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const diffMes = hoy.getMonth() - nacimiento.getMonth();
  if (diffMes < 0 || (diffMes === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
  return edad >= 0 && edad < 130 ? edad : null;
}

export function letraSexoCurp(sexo: string): 'H' | 'M' | null {
  const s = (sexo || '').trim().toLowerCase();
  if (s.startsWith('masc')) return 'H';
  if (s.startsWith('fem')) return 'M';
  return null;
}

const ENTIDADES_CURP: Record<string, string> = {
  AGUASCALIENTES: 'AS',
  'BAJA CALIFORNIA': 'BC',
  'BAJA CALIFORNIA SUR': 'BS',
  CAMPECHE: 'CC',
  COAHUILA: 'CL',
  COLIMA: 'CM',
  CHIAPAS: 'CS',
  CHIHUAHUA: 'CH',
  'CIUDAD DE MEXICO': 'DF',
  'DISTRITO FEDERAL': 'DF',
  CDMX: 'DF',
  DF: 'DF',
  DURANGO: 'DG',
  GUANAJUATO: 'GT',
  GUERRERO: 'GR',
  HIDALGO: 'HG',
  JALISCO: 'JC',
  MEXICO: 'MC',
  'ESTADO DE MEXICO': 'MC',
  EDOMEX: 'MC',
  'EDO MEX': 'MC',
  MICHOACAN: 'MN',
  MORELOS: 'MS',
  NAYARIT: 'NT',
  'NUEVO LEON': 'NL',
  OAXACA: 'OC',
  PUEBLA: 'PL',
  QUERETARO: 'QO',
  'QUINTANA ROO': 'QR',
  'SAN LUIS POTOSI': 'SP',
  SINALOA: 'SL',
  SONORA: 'SR',
  TABASCO: 'TC',
  TAMAULIPAS: 'TS',
  TLAXCALA: 'TL',
  VERACRUZ: 'VZ',
  YUCATAN: 'YN',
  ZACATECAS: 'ZS',
};

export function codigoEntidadCurp(estado: string): string | null {
  const norm = sinAcentos((estado || '').trim());
  return ENTIDADES_CURP[norm] || null;
}

const ALFABETO_CURP = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';
function valorCaracter(c: string): number {
  const idx = ALFABETO_CURP.indexOf(c);
  return idx >= 0 ? idx : 0;
}

function primeraVocalInterna(palabra: string): string {
  for (let i = 1; i < palabra.length; i++) if ('AEIOU'.includes(palabra[i])) return palabra[i];
  return 'X';
}
function primeraConsonanteInterna(palabra: string): string {
  for (let i = 1; i < palabra.length; i++) {
    const c = palabra[i];
    if (/[A-ZÑ]/.test(c) && !'AEIOU'.includes(c)) return c;
  }
  return 'X';
}

/** "MARIA"/"JOSE" como primer nombre se ignoran a favor del segundo, igual que en la CURP oficial. */
function primerNombreSignificativo(nombres: string): string {
  const partes = sinAcentos(nombres).split(' ').filter(Boolean);
  if (!partes.length) return '';
  if (partes.length > 1 && ['MARIA', 'JOSE'].includes(partes[0])) return partes[1];
  return partes[0];
}

/**
 * Preposiciones y conjunciones que el algoritmo oficial ignora al sacar las
 * letras de un apellido compuesto (p.ej. "DE LA CRUZ" cuenta como "CRUZ").
 * dividirNombreCompleto() sí las conserva, porque ahí interesa mostrar el
 * apellido completo; aquí se descartan justo antes de tomar letras/vocales.
 */
const PALABRAS_A_OMITIR_EN_CLAVE = new Set([
  'DA', 'DAS', 'DE', 'DEL', 'DER', 'DI', 'DIE', 'DD', 'EL', 'LA', 'LOS', 'LAS', 'LE', 'LES', 'VAN', 'VON', 'Y', 'MC', 'MAC',
]);

function apellidoParaClave(palabra: string): string {
  const partes = sinAcentos(palabra).split(' ').filter(Boolean);
  const filtradas = partes.filter((p) => !PALABRAS_A_OMITIR_EN_CLAVE.has(p));
  return (filtradas.length ? filtradas : partes).join('');
}

export interface DatosPersona {
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  dia: string;
  mes: string; // nombre del mes en español, minúsculas (como en MESES)
  anio: string;
  sexo?: string; // 'Masculino' | 'Femenino'
  estado?: string; // entidad (para CURP se usa como aproximación del lugar de nacimiento)
}

export function calcularCURP(d: DatosPersona): string | null {
  const paterno = apellidoParaClave(d.apellidoPaterno || '');
  const materno = apellidoParaClave(d.apellidoMaterno || '');
  const nombreUsado = primerNombreSignificativo(d.nombres || '');
  if (!nombreUsado || (!paterno && !materno)) return null;

  const dia = parseInt(d.dia, 10);
  const mIdx = MESES.indexOf((d.mes || '').toLowerCase());
  const anio = parseInt(d.anio, 10);
  if (!dia || mIdx < 0 || !anio) return null;

  const letraSexo = letraSexoCurp(d.sexo || '');
  if (!letraSexo) return null;

  const entidad = codigoEntidadCurp(d.estado || '');
  if (!entidad) return null;

  const c1 = paterno[0] || materno[0] || nombreUsado[0];
  const c2 = paterno ? primeraVocalInterna(paterno) : 'X';
  const c3 = materno ? materno[0] : 'X';
  const c4 = nombreUsado[0];

  const yy = String(anio).slice(-2).padStart(2, '0');
  const mm = String(mIdx + 1).padStart(2, '0');
  const dd = String(dia).padStart(2, '0');

  const c14 = paterno ? primeraConsonanteInterna(paterno) : 'X';
  const c15 = materno ? primeraConsonanteInterna(materno) : 'X';
  const c16 = primeraConsonanteInterna(nombreUsado);

  const diferenciador = anio >= 2000 ? 'A' : '0';

  const base17 = `${c1}${c2}${c3}${c4}${yy}${mm}${dd}${letraSexo}${entidad}${c14}${c15}${c16}${diferenciador}`;

  let suma = 0;
  for (let i = 0; i < 17; i++) suma += valorCaracter(base17[i]) * (18 - i);
  const digitoVerificador = (10 - (suma % 10)) % 10;

  return base17 + String(digitoVerificador);
}

const PALABRAS_INCONVENIENTES = new Set([
  'BUEI', 'BUEY', 'CACA', 'CACO', 'CAGA', 'CAGO', 'CAKA', 'CAKO', 'COGE', 'COJA', 'COJE', 'COJI', 'COJO',
  'CULO', 'FETO', 'GUEY', 'JOTO', 'KACA', 'KACO', 'KAGA', 'KAGO', 'KOGE', 'KOJO', 'KAKA', 'KULO', 'MAME',
  'MAMO', 'MEAR', 'MEAS', 'MEON', 'MION', 'MOCO', 'MULA', 'PEDA', 'PEDO', 'PENE', 'PUTA', 'PUTO', 'QULO',
  'RATA', 'RUIN',
]);

/** Solo la primera mitad (100% determinista) de la RFC: letras + AAMMDD. La homoclave se deja en blanco. */
export function calcularClaveRFC(d: DatosPersona): string | null {
  const paterno = apellidoParaClave(d.apellidoPaterno || '');
  const materno = apellidoParaClave(d.apellidoMaterno || '');
  const nombreUsado = primerNombreSignificativo(d.nombres || '');
  if (!nombreUsado || (!paterno && !materno)) return null;

  const dia = parseInt(d.dia, 10);
  const mIdx = MESES.indexOf((d.mes || '').toLowerCase());
  const anio = parseInt(d.anio, 10);
  if (!dia || mIdx < 0 || !anio) return null;

  let letras: string;
  if (paterno && materno) {
    letras = `${paterno[0]}${primeraVocalInterna(paterno)}${materno[0]}${nombreUsado[0]}`;
  } else {
    const solo = paterno || materno;
    letras = `${solo[0]}${solo[1] || 'X'}${solo[2] || 'X'}${nombreUsado[0]}`;
  }
  if (PALABRAS_INCONVENIENTES.has(letras)) letras = letras[0] + 'X' + letras.slice(2);

  const yy = String(anio).slice(-2).padStart(2, '0');
  const mm = String(mIdx + 1).padStart(2, '0');
  const dd = String(dia).padStart(2, '0');

  return `${letras}${yy}${mm}${dd}`;
}
