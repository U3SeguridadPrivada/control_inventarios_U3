// Lectura y calificación del DENUE (INEGI) para prospección de servicios de guardias.
// El CSV del INEGI viene en latin1 y con comillas: se parsea a mano para no meter dependencias.
import { readFileSync } from 'fs';

export const COLUMNAS = [
  'id', 'clee', 'nom_estab', 'raz_social', 'codigo_act', 'nombre_act', 'per_ocu',
  'tipo_vial', 'nom_vial', 'tipo_v_e_1', 'nom_v_e_1', 'tipo_v_e_2', 'nom_v_e_2',
  'tipo_v_e_3', 'nom_v_e_3', 'numero_ext', 'letra_ext', 'edificio', 'edificio_e',
  'numero_int', 'letra_int', 'tipo_asent', 'nomb_asent', 'tipoCenCom', 'nom_CenCom',
  'num_local', 'cod_postal', 'cve_ent', 'entidad', 'cve_mun', 'municipio', 'cve_loc',
  'localidad', 'ageb', 'manzana', 'telefono', 'correoelec', 'www', 'tipoUniEco',
  'latitud', 'longitud', 'fecha_alta',
];

export function leerCSV(ruta) {
  const texto = readFileSync(ruta, 'latin1');
  const filas = [];
  let fila = [], celda = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"') { if (texto[i + 1] === '"') { celda += '"'; i++; } else comillas = false; }
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(celda); celda = ''; }
    else if (c === '\n') { fila.push(celda); filas.push(fila); fila = []; celda = ''; }
    else if (c !== '\r') celda += c;
  }
  if (celda.length || fila.length) { fila.push(celda); filas.push(fila); }

  const encabezado = filas[0].map((h) => h.trim());
  const idx = Object.fromEntries(encabezado.map((h, i) => [h, i]));
  return filas.slice(1)
    .filter((f) => f.length >= encabezado.length - 2 && (f[idx.id] || '').trim())
    .map((f) => Object.fromEntries(COLUMNAS.map((c) => [c, (f[idx[c]] ?? '').trim()])));
}

// --- Puntaje por tamaño: sin gente ni activos que cuidar no hay guardia que vender ---
const PUNTOS_TAMANO = {
  '251 y más personas': 40,
  '101 a 250 personas': 34,
  '51 a 100 personas': 28,
  '31 a 50 personas': 22,
  '11 a 30 personas': 14,
  '6 a 10 personas': 6,
  '0 a 5 personas': 0,
};

// --- Giros que compran vigilancia intramuros por naturaleza del negocio ---
const GIRO_ALTO = new Set([
  '4621', '4622',                                                          // autoservicio y tiendas departamentales
  '5221', '5222', '5223', '5224', '5231', '5232', '5239', '5241', '5242',  // banca, finanzas, seguros
  '7211', '7212',                                                          // hoteles
  '6215', '6216',                                                          // laboratorios y servicios de diagnóstico
  '6221', '6222', '6223',                                                  // hospitales
  '6231', '6232', '6233', '6239', '6244',                                  // asilos, residencias, guarderías
  '6111', '6112', '6113', '6114', '6115', '6116', '6117',                  // educación
  '4684',                                                                  // gasolineras
  '4841', '4842', '4881', '4882', '4883', '4884', '4885', '4931',          // transporte, aduanas, almacenamiento
  '5311', '5312', '5313',                                                  // inmobiliarias y administración de inmuebles
  '5511',                                                                  // corporativos
  '5182',                                                                  // centros de datos
  '4681',                                                                  // agencias de autos
  '4651',                                                                  // joyerías
  '5121', '7121', '7131', '7132', '7139',                                  // cines, museos, parques, casinos, gimnasios
  '2361', '2362', '2371', '2372', '2373', '2379',                          // obra en construcción
]);

const GIRO_MEDIO = new Set([
  '4311', '4312', '4321', '4322', '4331', '4341', '4342', '4343', '4344',
  '4351', '4352', '4353', '4354', '4359', '4361', '4362', '4363', '4364',
  '4369', '4371', '4372', '4373',                                          // comercio al por mayor
  '4611', '4641', '4652', '4653', '4662', '4671', '4682',                  // menudeo con inventario de valor
  '6211', '6212', '6213', '6214',                                          // consultorios y clínicas pequeñas
  '5411', '5412', '5413', '5414', '5415', '5416', '5417', '5418', '5419',  // servicios profesionales
  '5611', '5612', '5613', '5614', '5615', '5617', '5619',                  // servicios de apoyo a negocios
  '8131', '8132',                                                          // cámaras y asociaciones
  '7225',                                                                  // restaurantes
]);

// Competencia directa y corporaciones de seguridad pública: fuera del lote comercial.
const EXCLUIR_RAMA = new Set(['5616', '9314']);

export function clasificarGiro(codigoAct) {
  const rama = (codigoAct || '').slice(0, 4);
  const sector = (codigoAct || '').slice(0, 2);
  if (EXCLUIR_RAMA.has(rama)) return null;
  if (sector === '93') return null;                                        // administración pública
  if (GIRO_ALTO.has(rama)) return { nivel: 'alto', puntos: 50 };
  if (GIRO_MEDIO.has(rama)) return { nivel: 'medio', puntos: 30 };
  if (['31', '32', '33'].includes(sector)) return { nivel: 'medio', puntos: 30 };  // manufactura
  return { nivel: 'bajo', puntos: 12 };
}

export function limpiarTelefono(valor) {
  const digitos = (valor || '').replace(/\D/g, '');
  if (digitos.length === 10) return digitos;
  if (digitos.length === 12 && digitos.startsWith('52')) return digitos.slice(2);
  if (digitos.length === 11 && digitos.startsWith('1')) return digitos.slice(1);
  return '';
}

export function limpiarCorreo(valor) {
  const correo = (valor || '').trim().toLowerCase().split(/[;,\s]+/)[0] || '';
  return /^[^@\s]+@[^@\s.]+\.[a-z]{2,}$/i.test(correo) ? correo : '';
}

export function calificar(fila) {
  const giro = clasificarGiro(fila.codigo_act);
  if (!giro) return null;
  if (/del sector p[uú]blico/i.test(fila.nombre_act)) return null;

  const telefono = limpiarTelefono(fila.telefono);
  const correo = limpiarCorreo(fila.correoelec);
  if (!telefono && !correo) return null;

  const puntosTamano = PUNTOS_TAMANO[fila.per_ocu] ?? 0;
  if (puntosTamano === 0) return null;                                     // 0 a 5 personas: no contrata guardia

  let puntos = giro.puntos + puntosTamano;
  if (telefono && correo) puntos += 10;
  else if (telefono) puntos += 6;
  else puntos += 4;
  if (fila.www) puntos += 2;
  if (fila.raz_social) puntos += 3;                                        // persona moral: compra con factura

  return { puntos, nivelGiro: giro.nivel, telefono, correo };
}

// Una cadena con 700 sucursales es una sola cuenta: se agrupa por razón social
// para no gastar el lote en tiendas del mismo dueño.
export function empresaClave(f) {
  const normalizar = (s) => (s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalizar(f.raz_social) || normalizar(f.nom_estab) || `ID${f.id}`;
}

export function domicilio(f) {
  const calle = [f.tipo_vial, f.nom_vial].filter(Boolean).join(' ');
  const numero = [f.numero_ext, f.letra_ext].filter(Boolean).join(' ');
  const interior = f.numero_int ? `Int. ${[f.numero_int, f.letra_int].filter(Boolean).join(' ')}` : '';
  const local = f.num_local ? `Local ${f.num_local}` : '';
  const centro = f.nom_CenCom ? `${f.tipoCenCom} ${f.nom_CenCom}`.trim() : '';
  const asentamiento = [f.tipo_asent, f.nomb_asent].filter(Boolean).join(' ');
  return [calle, numero, interior, local, centro, asentamiento].filter(Boolean).join(', ');
}
