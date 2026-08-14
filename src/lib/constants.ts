export const ARTICULOS_CON_TALLA = [
  "Camisolas",
  "Pantalones",
  "Botas",
  "Chamarras",
  "Chamarras Color Café",
] as const;

export const ARTICULOS_SIN_TALLA = [
  "Fornituras",
  "Silbatos",
  "Gorras",
  "Porta Gas",
  "Gas Pimienta",
  "Broches",
] as const;

export const ARTICULOS = [...ARTICULOS_CON_TALLA, ...ARTICULOS_SIN_TALLA] as const;

export const TALLAS_POR_ARTICULO: Record<string, string[]> = {
  "Camisolas":           ["28", "29", "30", "31", "32", "33", "34", "36", "38", "40", "42", "44"],
  "Chamarras":           ["XCH", "CH", "M", "G", "XG", "XXG"],
  "Chamarras Color Café":["XCH", "CH", "M", "G", "XG", "XXG"],
  "Pantalones":          ["XS", "S", "M", "G", "XG", "XXG"],
  "Botas":               ["24", "25", "26", "27", "28", "29", "30", "31"],
};

export function getTallas(articulo: string): string[] {
  return TALLAS_POR_ARTICULO[articulo] ?? [];
}

export function requiereTalla(articulo: string): boolean {
  return articulo in TALLAS_POR_ARTICULO;
}

/** Mensaje de error si falta una talla requerida, o `null` si el artículo/talla es válido. */
export function validarTalla(
  articulo: string,
  talla: string | null | undefined,
  articuloLabel?: string,
  requiereTallaCustom?: boolean
): string | null {
  const req = requiereTallaCustom !== undefined ? requiereTallaCustom : requiereTalla(articulo);
  if (req && !talla) return `Selecciona la talla${articuloLabel ? ` para: ${articuloLabel}` : ''}`;
  return null;
}

export const CONCEPTOS_SALIDA = [
  {
    value: "Uniforme en Campo",
    label: "Asignación en Campo",
    description: "El guardia lleva el equipo y debe devolverlo al darse de baja",
    estadoAsignacion: "Uniforme en Campo",
  },
  {
    value: "Extravío",
    label: "Extravío",
    description: "El guardia perdió el artículo — sale definitivamente del inventario",
    estadoAsignacion: "N/A",
  },
  {
    value: "Inutilizable",
    label: "Baja por Daño",
    description: "Prenda dañada que sale definitivamente del inventario",
    estadoAsignacion: "N/A",
  },
] as const;

export function getEstadoAsignacion(concepto: string): string {
  return CONCEPTOS_SALIDA.find(c => c.value === concepto)?.estadoAsignacion ?? "Entregado Definitivo";
}

export const ARTICULOS_CATALOGO = [...ARTICULOS] as string[];
