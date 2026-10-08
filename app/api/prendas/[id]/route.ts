import { validarPayload } from '@/src/lib/inventarioValidacion';
import { NextRequest } from 'next/server';
import { catalogo_prendas, entradas, salidas, bajas, inventario_ajustes } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { autorizarInventario, operarInventario } from '@/src/lib/inventarioOperacion';
import { cantidadEntera, errorInventario, InventarioError } from '@/src/lib/inventarioValidacion';
import { datosPrenda } from '@/src/lib/prendasValidacion';
import { fechaMexico } from '@/src/lib/fecha';
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = autorizarInventario(req, 'inventario', 'editar'); const { id } = await params; const p = validarPayload(await req.json());
    const result = operarInventario(req, user, p, fechaMexico(), 'Editar prenda', tx => {
      const actual = tx.select().from(catalogo_prendas).where(eq(catalogo_prendas.id, cantidadEntera(id))).get();
      if (!actual) throw new InventarioError('Prenda no encontrada', 404);
      const datos = datosPrenda(p);
      const e = tx.select().from(entradas).where(and(eq(entradas.articulo, actual.nombre), eq(entradas.anulado, 0))).all();
      const s = tx.select().from(salidas).where(and(eq(salidas.articulo, actual.nombre), eq(salidas.anulado, 0))).all();
      const ajustes = tx.select().from(inventario_ajustes).where(eq(inventario_ajustes.articulo, actual.nombre)).all();
      if ((e.length || s.length || ajustes.length) && actual.requiere_talla !== datos.requiere_talla) throw new InventarioError('La regla de talla tiene movimientos vigentes. Crea otra prenda para cambiar su clasificación');
      if (datos.requiere_talla && [...e, ...s, ...ajustes].some(r => r.talla && !datos.tallas.includes(r.talla))) throw new InventarioError('No puedes quitar tallas con movimientos; conserva esas tallas en el catálogo');
      if (actual.nombre !== datos.nombre) {
        tx.update(entradas).set({ articulo: datos.nombre }).where(eq(entradas.articulo, actual.nombre)).run();
        tx.update(salidas).set({ articulo: datos.nombre }).where(eq(salidas.articulo, actual.nombre)).run();
        tx.update(inventario_ajustes).set({ articulo: datos.nombre }).where(eq(inventario_ajustes.articulo, actual.nombre)).run();
        for (const baja of tx.select().from(bajas).all()) {
          if (baja.checklist.some(c => c.articulo === actual.nombre)) tx.update(bajas).set({ checklist: baja.checklist.map(c => c.articulo === actual.nombre ? { ...c, articulo: datos.nombre } : c) }).where(eq(bajas.id, baja.id)).run();
        }
      }
      return tx.update(catalogo_prendas).set({ ...datos, ...(p.activo !== undefined ? { activo: p.activo ? 1 : 0 } : {}) }).where(eq(catalogo_prendas.id, actual.id)).returning().get();
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) return errorInventario(new InventarioError('Ya existe una prenda con ese nombre', 409));
    return errorInventario(err);
  }
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = autorizarInventario(req, 'inventario', 'eliminar'); const { id } = await params;
    const result = operarInventario(req, user, { id }, fechaMexico(), 'Archivar prenda', tx => {
      const prenda = tx.select().from(catalogo_prendas).where(eq(catalogo_prendas.id, cantidadEntera(id))).get();
      if (!prenda) throw new InventarioError('Prenda no encontrada', 404);
      // Conservar también metadatos para cortes históricos y devoluciones.
      tx.update(catalogo_prendas).set({ activo: 0 }).where(eq(catalogo_prendas.id, prenda.id)).run();
      return { ok: true, archivado: true, mensaje: prenda.nombre + ' archivada; su historial y tallas se conservan' };
    });
    return Response.json(result);
  } catch (err) { return errorInventario(err); }
}
