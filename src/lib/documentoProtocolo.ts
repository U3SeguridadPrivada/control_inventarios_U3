/**
 * Estructura de un protocolo de tipo `documento`: un manual con capitulado que se
 * guarda en la columna `contenido` y se edita desde la propia página del protocolo.
 */

export type BloqueTexto = { tipo: 'parrafo' | 'subtitulo' | 'nota' | 'firma'; texto: string };
export type BloqueLista = { tipo: 'lista'; estilo?: EstiloLista; items: string[] };
export type BloqueTabla = { tipo: 'tabla'; encabezados: string[]; filas: string[][] };
export type BloqueCampos = { tipo: 'campos'; items: string[] };
/** Corta la hoja en ese punto: es como se agregan y se quitan hojas del documento. */
export type BloqueSalto = { tipo: 'salto' };
export type Bloque = BloqueTexto | BloqueLista | BloqueTabla | BloqueCampos | BloqueSalto;

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
  salto: 'Salto de página (hoja nueva)',
};

export function bloqueVacio(tipo: TipoBloque): Bloque {
  switch (tipo) {
    case 'lista': return { tipo: 'lista', estilo: 'decimal', items: [''] };
    case 'tabla': return { tipo: 'tabla', encabezados: ['Columna 1', 'Columna 2'], filas: [['', '']] };
    case 'campos': return { tipo: 'campos', items: [''] };
    case 'salto': return { tipo: 'salto' };
    default: return { tipo, texto: '' } as BloqueTexto;
  }
}

export function seccionVacia(): SeccionDoc {
  return {
    // El sufijo aleatorio evita ids repetidos si se agregan dos capítulos en el
    // mismo milisegundo: el editor identifica cada sección por su id.
    id: `seccion-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
  if (bloque.tipo === 'salto') return '';
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
  if (bloque.tipo === 'salto') return bloque;
  return { ...(bloque as BloqueTexto), texto };
}

/**
 * Normaliza el contenido antes de guardar. No borra nada: lo que se ve en el
 * editor es exactamente lo que se guarda. Antes descartaba todo bloque sin
 * texto, así que un bloque recién agregado desaparecía al guardar —parecía que
 * se borraba solo— y con él cualquier párrafo que se hubiera quedado vacío por
 * accidente. Los bloques se eliminan únicamente desde el botón de la papelera.
 */
export function limpiarContenido(contenido: ContenidoDoc): ContenidoDoc {
  return {
    ...contenido,
    secciones: contenido.secciones.map((seccion) => ({
      ...seccion,
      bloques: seccion.bloques.map((bloque) => {
        if (bloque.tipo === 'lista' || bloque.tipo === 'campos') {
          return { ...bloque, items: bloque.items.map((i) => i.trim()) };
        }
        return bloque;
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
/* Geometría de la hoja Carta a 96 ppp. Las mismas cifras se usan en pantalla y
   al imprimir: si difieren, el texto corta el renglón en otro punto y la vista
   previa deja de parecerse al papel. */
export const ANCHO_HOJA = 816;   // 8.5 pulgadas
/**
 * 11 pulgadas son 1056 px, pero un pliego que mide exactamente la página se
 * desborda a una hoja extra por el redondeo del navegador: se dejan 6 px.
 */
export const ALTO_HOJA = 1050;
export const MARGEN_HOJA = 56;
export const ANCHO_CONTENIDO = ANCHO_HOJA - MARGEN_HOJA * 2; // 704

const ANCHO_COLUMNA = ANCHO_CONTENIDO; // ancho útil de la hoja
const ALTO_LINEA = 20;       // cuerpo de 12px con interlineado holgado
const CHARS_POR_LINEA = Math.round(ANCHO_COLUMNA / 6); // ~6px por carácter a 12px

/** Alto útil de una hoja, ya descontados membrete, pie y márgenes. Es solo el
 *  valor de respaldo: el visor mide el hueco real y lo pasa a la paginación. */
export const ALTO_UTIL_HOJA = 800;

function lineas(texto: string, charsPorLinea = CHARS_POR_LINEA): number {
  const sinHtml = (texto || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  return Math.max(1, Math.ceil((sinHtml.length || 1) / charsPorLinea));
}

function altoBloque(bloque: Bloque): number {
  switch (bloque.tipo) {
    case 'salto':
      // No ocupa nada en el papel: solo obliga a cerrar la hoja.
      return 0;
    case 'subtitulo':
      return 34;
    case 'nota':
      // Recuadro con borde y padding propio, sobre una columna más angosta.
      return lineas(bloque.texto, CHARS_POR_LINEA - 12) * ALTO_LINEA + 28;
    case 'firma':
      return lineas(bloque.texto) * ALTO_LINEA + 120;
    case 'lista':
      return bloque.items.reduce((alto, item) => alto + lineas(item, CHARS_POR_LINEA - 10) * ALTO_LINEA + 6, 8);
    case 'campos':
      return bloque.items.length * 52 + 50;
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

/**
 * Alturas reales tomadas del documento ya pintado. Estimar el alto a partir del
 * texto nunca cuadra del todo con lo que dibuja el navegador, y una hoja que se
 * pasa de largo se parte sola al imprimir y saca una página de más. Cuando el
 * visor entrega estas medidas, la paginación usa píxeles medidos y la vista
 * previa coincide con el papel; si falta alguna, se recurre a la estimación.
 */
export interface MedidasDoc {
  /** Alto ocupado por cada bloque, con su separación. Clave `${seccionId}:${indice}`. */
  bloques: Record<string, number>;
  /** Alto del encabezado de capítulo. Clave `${seccionId}` y `${seccionId}:cont`. */
  encabezados: Record<string, number>;
  /** Separación entre dos capítulos que comparten hoja. */
  separacion: number;
  /** Lo que ocupa la portadilla en la primera hoja de contenido. */
  primeraHoja: number;
}

export function paginarFragmentos(
  secciones: SeccionDoc[],
  altoUtil = ALTO_UTIL_HOJA,
  /** Cada capítulo abre hoja propia; sus continuaciones siguen llenando la siguiente. */
  hojaPorCapitulo = true,
  medidas?: Partial<MedidasDoc>,
): FragmentoSeccion[][] {
  const hojas: FragmentoSeccion[][] = [];
  let hoja: FragmentoSeccion[] = [];
  let libre = altoUtil;

  const separacion = medidas?.separacion ?? 24;
  const reservaPrimera = medidas?.primeraHoja ?? 0;

  /** La primera hoja de contenido lleva además el título y el subtítulo. */
  const abrirHoja = () => {
    libre = altoUtil - (hojas.length === 0 ? reservaPrimera : 0);
  };

  const cerrarHoja = () => {
    if (hoja.length > 0) hojas.push(hoja);
    hoja = [];
    abrirHoja();
  };

  const altoDeBloque = (seccion: SeccionDoc, i: number) =>
    medidas?.bloques?.[`${seccion.id}:${i}`] ?? altoBloque(seccion.bloques[i]);

  const altoDeEncabezado = (seccion: SeccionDoc, continuacion: boolean) => {
    const medido = medidas?.encabezados?.[continuacion ? `${seccion.id}:cont` : seccion.id];
    if (typeof medido === 'number') return medido;
    return continuacion ? ALTO_ENCABEZADO * 0.6 : ALTO_ENCABEZADO;
  };

  abrirHoja();

  for (const seccion of secciones) {
    // Una sección recién creada aún no tiene bloques: se muestra solo su encabezado.
    if (seccion.bloques.length === 0) {
      const alto = altoDeEncabezado(seccion, false) + (hoja.length > 0 ? separacion : 0);
      if (alto > libre && hoja.length > 0) cerrarHoja();
      hoja.push({ seccion, desde: 0, hasta: 0, continuacion: false, ultimo: true });
      libre -= alto;
      continue;
    }

    if (hojaPorCapitulo && seccion.tipo === 'capitulo') cerrarHoja();

    let desde = 0;
    let continuacion = false;

    do {
      let alto = altoDeEncabezado(seccion, continuacion) + (hoja.length > 0 ? separacion : 0);
      let hasta = desde;
      /** Un salto de página cierra la hoja aunque quede sitio de sobra. */
      let cortePedido = false;

      while (hasta < seccion.bloques.length) {
        if (seccion.bloques[hasta].tipo === 'salto') {
          hasta++;
          cortePedido = true;
          break;
        }
        const altoB = altoDeBloque(seccion, hasta);
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

      if (cortePedido || desde < seccion.bloques.length) cerrarHoja();
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
