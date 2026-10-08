import { db } from '@/src/db';
import { catalogo_prendas, guardias } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { fechaMexico, fechaValida } from '@/src/lib/fecha';

export class InventarioError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export function validarPayload(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InventarioError('La captura debe ser un objeto JSON');
  return value as Record<string, any>;
}

export function validarFecha(fecha: unknown): asserts fecha is string {
  if (!fechaValida(fecha) || fecha > fechaMexico()) throw new InventarioError('Selecciona una fecha válida, no posterior a hoy');
}

export function cantidadEntera(valor: unknown, cero = false): number {
  const n = typeof valor === 'number' || typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : NaN;
  if (!Number.isSafeInteger(n) || n < (cero ? 0 : 1) || n > 1000000) throw new InventarioError(`La cantidad debe ser un entero ${cero ? 'de 0 o más' : 'mayor a 0'} (máximo 1,000,000)`);
  return n;
}

export function estadoFisico(valor: unknown, entregable = false): string {
  const estado = valor === 'Para Baja' ? 'Inutilizable' : valor;
  if (typeof estado !== 'string' || !(entregable ? ['Nuevo', 'Usado'] : ['Nuevo', 'Usado', 'Inutilizable']).includes(estado)) throw new InventarioError('Estado físico inválido');
  return estado;
}

export function validarArticulo(articulo: unknown, talla: unknown, soloActivo = false) {
  if (typeof articulo !== 'string' || !articulo.trim()) throw new InventarioError('Selecciona un artículo del catálogo');
  const prenda = db.select().from(catalogo_prendas).where(eq(catalogo_prendas.nombre, articulo)).get();
  if (!prenda) throw new InventarioError('El artículo no existe en el catálogo');
  if (soloActivo && !prenda.activo) throw new InventarioError('La prenda está archivada; reactívala para registrar nuevas existencias');
  const limpia = typeof talla === 'string' ? talla.trim() : '';
  if (prenda.requiere_talla) {
    if (!limpia || !Array.isArray(prenda.tallas) || !prenda.tallas.includes(limpia)) throw new InventarioError(`Selecciona una talla configurada para "${articulo}"`);
  } else if (limpia) throw new InventarioError(`"${articulo}" no utiliza talla`);
  return { articulo: prenda.nombre, talla: prenda.requiere_talla ? limpia : null, prenda };
}

export function validarGuardia(id: unknown, activo = false) {
  const guardiaId = cantidadEntera(id);
  const guardia = db.select().from(guardias).where(eq(guardias.id, guardiaId)).get();
  if (!guardia) throw new InventarioError('Guardia no encontrado', 404);
  if (activo && guardia.estado !== 'Activo') throw new InventarioError('Solo se puede asignar equipo a un guardia activo');
  return guardia;
}

export function validarItems(items: unknown): asserts items is Record<string, any>[] {
  if (!Array.isArray(items) || items.length === 0 || items.length > 1000 || items.some(i => !i || typeof i !== 'object')) throw new InventarioError('Captura entre 1 y 1,000 renglones válidos');
}

export function errorInventario(err: unknown) {
  if (err instanceof InventarioError) return Response.json({ error: err.message }, { status: err.status });
  if (err instanceof SyntaxError) return Response.json({ error: 'Solicitud JSON inválida' }, { status: 400 });
  console.error('[inventario]', err);
  return Response.json({ error: 'No se pudo registrar el movimiento' }, { status: 500 });
}
