import { cantidadEntera, InventarioError } from '@/src/lib/inventarioValidacion';
export function datosPrenda(p: any) {
  const nombre = typeof p.nombre === 'string' ? p.nombre.trim() : '';
  if (!nombre || nombre.length > 100 || nombre.includes('|||')) throw new InventarioError('Nombre de prenda inválido (máximo 100 caracteres)');
  if (p.requiere_talla !== undefined && ![true,false,1,0].includes(p.requiere_talla)) throw new InventarioError('Indica si el artículo requiere talla');
  if (p.activo !== undefined && ![true,false,1,0].includes(p.activo)) throw new InventarioError('Estado de catálogo inválido');
  const requiere = p.requiere_talla === true || p.requiere_talla === 1;
  const tallas: string[] = requiere && Array.isArray(p.tallas) ? [...new Set<string>(p.tallas.map((t: unknown) => typeof t === 'string' ? t.trim().toUpperCase() : ''))] : [];
  if (requiere && (!tallas.length || tallas.some(t => !t || t.length > 20 || t.includes('|||')))) throw new InventarioError('Agrega tallas válidas, sin duplicados');
  if (p.costo_estimado != null && typeof p.costo_estimado !== 'string' && typeof p.costo_estimado !== 'number') throw new InventarioError('Costo inválido');
  const costo = p.costo_estimado == null || p.costo_estimado === '' ? null : Number(p.costo_estimado);
  if (costo !== null && (!Number.isFinite(costo) || costo < 0)) throw new InventarioError('El costo debe ser un número no negativo');
  return { nombre, categoria: typeof p.categoria === 'string' && p.categoria.trim() ? p.categoria.trim() : 'Uniformes',
    requiere_talla: requiere ? 1 : 0, tallas, stock_minimo: cantidadEntera(p.stock_minimo ?? 5, true), costo_estimado: costo };
}
