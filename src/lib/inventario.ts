import { db } from '@/src/db';
import { entradas, salidas, catalogo_prendas, inventario_ajustes } from '@/src/db/schema';
import { sql } from 'drizzle-orm';
import { InventarioError, validarFecha } from '@/src/lib/inventarioValidacion';

export interface InventarioResumenRow {
  id?: number; articulo: string; categoria?: string; requiereTalla?: boolean; tallas?: string[]; stockMinimo?: number;
  costoEstimado?: number | null; archivada?: boolean; inconsistente?: boolean; totalEntradas: number; almacen: number;
  almacenNuevo: number; almacenUsado: number; almacenInutilizable: number; enCampo: number; enBajas: number;
  perdidas: number; definitivos: number; totalExistente: number; stockBajo: boolean; ajusteNeto?: number;
}
export interface InventarioDetalleRow {
  articulo: string; talla: string | null; almacen: number; almacenNuevo: number; almacenUsado: number; almacenInutilizable: number;
}
type Datos = { entradas: typeof entradas.$inferSelect[]; salidas: typeof salidas.$inferSelect[]; catalogo: typeof catalogo_prendas.$inferSelect[]; ajustes: typeof inventario_ajustes.$inferSelect[] };

export function historialDesde(): string {
  return db.get<{ valor: string }>(sql`SELECT valor FROM inventario_meta WHERE clave='historial_desde'`)!.valor;
}
export function leerInventario(corte?: string): Datos {
  if (!corte) return { entradas: db.select().from(entradas).all(), salidas: db.select().from(salidas).all(), catalogo: db.select().from(catalogo_prendas).all(), ajustes: db.select().from(inventario_ajustes).all() };
  validarFecha(corte);
  const desde = historialDesde();
  if (corte < desde) throw new InventarioError('El historial verificable comienza el ' + desde + '; no se pueden reconstruir cortes anteriores');
  const eventos = db.all<{ tabla: string; registro_id: number; despues: string | null }>(sql`SELECT tabla,registro_id,despues FROM inventario_eventos WHERE fecha<=${corte} ORDER BY fecha,id`);
  const tablas: Record<string, Map<number, any>> = { entradas: new Map(), salidas: new Map(), catalogo_prendas: new Map(), inventario_ajustes: new Map() };
  for (const e of eventos) {
    if (!tablas[e.tabla]) continue;
    if (e.despues) {
      const fila = JSON.parse(e.despues);
      if (e.tabla === 'catalogo_prendas' && typeof fila.tallas === 'string') fila.tallas = JSON.parse(fila.tallas);
      tablas[e.tabla].set(e.registro_id, fila);
    } else tablas[e.tabla].delete(e.registro_id);
  }
  return { entradas: [...tablas.entradas.values()], salidas: [...tablas.salidas.values()], catalogo: [...tablas.catalogo_prendas.values()], ajustes: [...tablas.inventario_ajustes.values()] };
}
export function calcularInventario(corte?: string) {
  const datos = leerInventario(corte);
  const resumen = new Map<string, InventarioResumenRow>();
  const detalle = new Map<string, InventarioDetalleRow>();
  const prendas = new Map(datos.catalogo.map(p => [p.nombre, p]));
  function articulo(nombre: string) {
    let row = resumen.get(nombre);
    if (!row) {
      const p = prendas.get(nombre);
      row = { id: p?.id, articulo: nombre, categoria: p?.categoria ?? 'Sin catálogo', requiereTalla: Boolean(p?.requiere_talla),
        tallas: p?.tallas ?? [], stockMinimo: p?.stock_minimo ?? 5, costoEstimado: p?.costo_estimado, archivada: p?.activo === 0,
        totalEntradas: 0, almacen: 0, almacenNuevo: 0, almacenUsado: 0, almacenInutilizable: 0, enCampo: 0, enBajas: 0, perdidas: 0, definitivos: 0, totalExistente: 0, stockBajo: false };
      resumen.set(nombre, row);
    }
    return row;
  }
  function existencia(nombre: string, talla: string | null, estado: string | null, cantidad: number) {
    const key = JSON.stringify([nombre, talla || null]);
    if (!detalle.has(key)) detalle.set(key, { articulo: nombre, talla: talla || null, almacen: 0, almacenNuevo: 0, almacenUsado: 0, almacenInutilizable: 0 });
    const r = articulo(nombre); const d = detalle.get(key)!;
    const campo = estado === 'Nuevo' ? 'almacenNuevo' : estado === 'Usado' ? 'almacenUsado' : ['Inutilizable', 'Para Baja'].includes(estado || '') ? 'almacenInutilizable' : null;
    if (campo) { r[campo] += cantidad; d[campo] += cantidad; }
    else r.inconsistente = true;
  }
  for (const p of datos.catalogo) if (p.activo) articulo(p.nombre);
  for (const e of datos.entradas) {
    if (e.anulado) continue;
    articulo(e.articulo).totalEntradas += e.cantidad;
    existencia(e.articulo, e.talla, e.estado, e.cantidad);
  }
  for (const s of datos.salidas) {
    if (s.anulado) continue;
    const r = articulo(s.articulo); const estado = s.estado_asignacion;
    if (estado === 'Uniforme en Campo') r.enCampo += s.cantidad;
    if (estado === 'Uniforme en Bajas') r.enBajas += s.cantidad;
    if (estado === 'Entregado Definitivo') r.definitivos += s.cantidad;
    const baja = s.concepto === 'Inutilizable' && estado === 'N/A';
    if (estado === 'Extraviado' || baja) r.perdidas += s.cantidad;
    if (['Uniforme en Campo', 'Uniforme en Bajas', 'Entregado Definitivo', 'Devuelto', 'Extraviado'].includes(estado || '') || baja) existencia(s.articulo, s.talla, s.estado_fisico, -s.cantidad);
    else r.inconsistente = true;
    if (['Uniforme en Campo', 'Uniforme en Bajas'].includes(estado || '') && !s.guardia_id) r.inconsistente = true;
  }
  for (const a of datos.ajustes) {
    existencia(a.articulo, a.talla, a.estado, a.cantidad);
    const r = articulo(a.articulo); r.ajusteNeto = (r.ajusteNeto || 0) + a.cantidad;
  }
  for (const d of detalle.values()) {
    d.almacen = d.almacenNuevo + d.almacenUsado;
    if ([d.almacenNuevo, d.almacenUsado, d.almacenInutilizable].some(n => n < 0)) articulo(d.articulo).inconsistente = true;
  }
  for (const r of resumen.values()) {
    r.almacen = r.almacenNuevo + r.almacenUsado + r.almacenInutilizable;
    r.totalExistente = r.almacen + r.enCampo + r.enBajas;
    r.stockBajo = !r.archivada && r.almacenNuevo + r.almacenUsado <= (r.stockMinimo ?? 5);
  }
  return { resumen: [...resumen.values()].sort((a,b) => a.articulo.localeCompare(b.articulo)), detalle: [...detalle.values()], desde: historialDesde() };
}
export function calcularInventarioResumen(corte?: string) { return calcularInventario(corte).resumen; }
export function calcularInventarioDetalle(corte?: string) { return calcularInventario(corte).detalle; }

