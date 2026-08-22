/**
 * Estructura de un protocolo de tipo `documento`: un manual con capitulado que se
 * guarda en la columna `contenido` y se edita desde la propia página del protocolo.
 */

export type BloqueTexto = { tipo: 'parrafo' | 'subtitulo' | 'nota' | 'firma'; texto: string };
export type BloqueLista = { tipo: 'lista'; estilo?: EstiloLista; items: string[] };
export type BloqueTabla = { tipo: 'tabla'; encabezados: string[]; filas: string[][] };
export type BloqueCampos = { tipo: 'campos'; items: string[] };
export type Bloque = BloqueTexto | BloqueLista | BloqueTabla | BloqueCampos;

export type EstiloLista = 'decimal' | 'lower-alpha' | 'upper-roman' | 'glosario' | 'none';
export type TipoBloque = Bloque['tipo'];

export interface SeccionDoc {
  id: string;
  tipo: 'capitulo' | 'protocolo';
  numero: string;
  titulo: string;
  categoria?: string;
  prioridad?: string;
  bloques: Bloque[];
}

export interface ContenidoDoc {
  version: string;
  subtitulo?: string;
  /** Identidad del membrete. Si el documento no la trae, el visor usa valores genéricos. */
  area?: string;
  codigo?: string;
  clasificacion?: string;
  /** A quién se dirige el documento; sustituye a `nivelEducativo` fuera del manual escolar. */
  alcance?: string;
  /** Solo el manual de planteles escolares usa este campo. */
  nivelEducativo?: string;
  secciones: SeccionDoc[];
}

export interface ProtocoloRegistro {
  id: number;
  titulo: string;
  categoria: string;
  descripcion: string | null;
  tipo: 'lista' | 'documento';
  pasos: string[] | null;
  contenido: ContenidoDoc | null;
  prioridad: string;
  activo: number;
  actualizado_en: string | null;
}

export const ETIQUETA_BLOQUE: Record<TipoBloque, string> = {
  parrafo: 'Párrafo',
  subtitulo: 'Subtítulo',
  lista: 'Lista numerada',
  nota: 'Nota destacada',
  tabla: 'Tabla',
  campos: 'Campos para llenar',
  firma: 'Bloque de firma',
};

export function bloqueVacio(tipo: TipoBloque): Bloque {
  switch (tipo) {
    case 'lista': return { tipo: 'lista', estilo: 'decimal', items: [''] };
    case 'tabla': return { tipo: 'tabla', encabezados: ['Columna 1', 'Columna 2'], filas: [['', '']] };
    case 'campos': return { tipo: 'campos', items: [''] };
    default: return { tipo, texto: '' } as BloqueTexto;
  }
}

export function seccionVacia(): SeccionDoc {
  return {
    id: `seccion-${Date.now()}`,
    tipo: 'capitulo',
    numero: '',
    titulo: 'Nueva sección',
    bloques: [{ tipo: 'parrafo', texto: '' }],
  };
}

/**
 * Los bloques se editan como texto plano: una línea por elemento y, en las tablas,
 * celdas separadas por “|”. Es la forma más simple de editar sin un editor enriquecido.
 */
export function bloqueATexto(bloque: Bloque): string {
  if (bloque.tipo === 'lista' || bloque.tipo === 'campos') return bloque.items.join('\n');
  if (bloque.tipo === 'tabla') return [bloque.encabezados, ...bloque.filas].map((f) => f.join(' | ')).join('\n');
  return bloque.texto;
}

export function textoABloque(bloque: Bloque, texto: string): Bloque {
  if (bloque.tipo === 'lista') return { ...bloque, items: texto.split('\n') };
  if (bloque.tipo === 'campos') return { ...bloque, items: texto.split('\n') };
  if (bloque.tipo === 'tabla') {
    const filas = texto.split('\n').map((linea) => linea.split('|').map((c) => c.trim()));
    const [encabezados = [], ...resto] = filas;
    const columnas = encabezados.length || 1;
    // Cuadra todas las filas al número de columnas del encabezado para no romper la tabla.
    const normalizadas = resto.map((f) => Array.from({ length: columnas }, (_, i) => f[i] ?? ''));
    return { tipo: 'tabla', encabezados, filas: normalizadas };
  }
  return { ...(bloque as BloqueTexto), texto };
}

/** Limpia entradas vacías antes de guardar, sin tocar el contenido con texto. */
export function limpiarContenido(contenido: ContenidoDoc): ContenidoDoc {
  return {
    ...contenido,
    secciones: contenido.secciones.map((seccion) => ({
      ...seccion,
      bloques: seccion.bloques
        .map((bloque) => {
          if (bloque.tipo === 'lista' || bloque.tipo === 'campos') {
            return { ...bloque, items: bloque.items.map((i) => i.trim()).filter(Boolean) };
          }
          return bloque;
        })
        .filter((bloque) => {
          if (bloque.tipo === 'lista' || bloque.tipo === 'campos') return bloque.items.length > 0;
          if (bloque.tipo === 'tabla') return bloque.encabezados.length > 0;
          return bloque.texto.trim().length > 0;
        }),
    })),
  };
}

/* ----------------------------------------------------------------- paginación */

/**
 * Reparte las secciones en hojas Carta estimando cuánto mide cada bloque una vez
 * pintado. Se estima en píxeles (no en número de caracteres) para que una hoja se
 * llene de verdad: si tras un capítulo corto todavía cabe el siguiente, ambos van
 * en la misma hoja en vez de dejar media página en blanco.
 */
const ANCHO_COLUMNA = 704;   // ancho útil de la hoja (816px menos los márgenes)
const ALTO_LINEA = 20;       // cuerpo de 12px con interlineado holgado
const CHARS_POR_LINEA = Math.round(ANCHO_COLUMNA / 6); // ~6px por carácter a 12px

/** Alto útil de una hoja, ya descontados membrete, pie y márgenes. */
export const ALTO_UTIL_HOJA = 800;

function lineas(texto: string, charsPorLinea = CHARS_POR_LINEA): number {
  return Math.max(1, Math.ceil(texto.length / charsPorLinea));
}

function altoBloque(bloque: Bloque): number {
  switch (bloque.tipo) {
    case 'subtitulo':
      return 34;
    case 'nota':
      // Recuadro con borde y padding propio, sobre una columna más angosta.
      return lineas(bloque.texto, CHARS_POR_LINEA - 12) * ALTO_LINEA + 28;
    case 'firma':
      return lineas(bloque.texto) * ALTO_LINEA + 60;
    case 'lista':
      return bloque.items.reduce((alto, item) => alto + lineas(item, CHARS_POR_LINEA - 10) * ALTO_LINEA + 6, 8);
    case 'campos':
      return bloque.items.length * 28 + 8;
    case 'tabla': {
      const columnas = Math.max(1, bloque.encabezados.length);
      const charsCelda = Math.max(10, Math.round(CHARS_POR_LINEA / columnas));
      const altoFila = (fila: string[]) =>
        Math.max(1, ...fila.map((celda) => lineas(celda, charsCelda))) * 18 + 10;
      return 32 + bloque.filas.reduce((alto, fila) => alto + altoFila(fila), 0) + 12;
    }
    default:
      return lineas(bloque.texto) * ALTO_LINEA + 8;
  }
}

/** Alto del encabezado de sección (número + título + regla). */
const ALTO_ENCABEZADO = 54;

/**
 * Trozo de una sección que cabe en una hoja. Una sección larga se reparte en
 * varios fragmentos consecutivos para no dejar el resto de la hoja en blanco.
 */
export interface FragmentoSeccion {
  seccion: SeccionDoc;
  desde: number;
  hasta: number;
  continuacion: boolean;
  ultimo: boolean;
}

export function paginarFragmentos(
  secciones: SeccionDoc[],
  altoUtil = ALTO_UTIL_HOJA,
  /** Cada capítulo abre hoja propia; sus continuaciones siguen llenando la siguiente. */
  hojaPorCapitulo = true,
): FragmentoSeccion[][] {
  const hojas: FragmentoSeccion[][] = [];
  let hoja: FragmentoSeccion[] = [];
  let libre = altoUtil;

  const cerrarHoja = () => {
    if (hoja.length > 0) hojas.push(hoja);
    hoja = [];
    libre = altoUtil;
  };

  for (const seccion of secciones) {
    // Una sección recién creada aún no tiene bloques: se muestra solo su encabezado.
    if (seccion.bloques.length === 0) {
      if (libre < ALTO_ENCABEZADO) cerrarHoja();
      hoja.push({ seccion, desde: 0, hasta: 0, continuacion: false, ultimo: true });
      libre -= ALTO_ENCABEZADO;
      continue;
    }

    if (hojaPorCapitulo && seccion.tipo === 'capitulo') cerrarHoja();

    let desde = 0;
    let continuacion = false;

    do {
      let alto = continuacion ? ALTO_ENCABEZADO * 0.6 : ALTO_ENCABEZADO;
      let hasta = desde;

      while (hasta < seccion.bloques.length) {
        const altoB = altoBloque(seccion.bloques[hasta]);
        // En una hoja recién abierta siempre entra al menos un bloque, aunque
        // se pase de largo: partir dentro de un bloque no está a nuestro alcance.
        if (alto + altoB > libre && (hasta > desde || hoja.length > 0)) break;
        alto += altoB;
        hasta++;
      }

      if (hasta === desde) {
        cerrarHoja();
        continue;
      }

      hoja.push({ seccion, desde, hasta, continuacion, ultimo: hasta === seccion.bloques.length });
      libre -= alto;
      continuacion = true;
      desde = hasta;

      if (desde < seccion.bloques.length) cerrarHoja();
    } while (desde < seccion.bloques.length);
  }

  cerrarHoja();
  return hojas;
}

export function mover<T>(lista: T[], indice: number, delta: number): T[] {
  const destino = indice + delta;
  if (destino < 0 || destino >= lista.length) return lista;
  const copia = [...lista];
  [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  return copia;
}
