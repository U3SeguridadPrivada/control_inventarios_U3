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

export function mover<T>(lista: T[], indice: number, delta: number): T[] {
  const destino = indice + delta;
  if (destino < 0 || destino >= lista.length) return lista;
  const copia = [...lista];
  [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  return copia;
}
