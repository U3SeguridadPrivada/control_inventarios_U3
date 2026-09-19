import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { catalogo_prendas, entradas, salidas } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  const { id } = await params;
  try {
    const { nombre, categoria, requiere_talla, tallas, stock_minimo, costo_estimado, activo } = await req.json();
    const nombreLimpio = typeof nombre === 'string' ? nombre.trim() : '';
    if (!nombreLimpio) return Response.json({ error: 'El nombre de la prenda es requerido' }, { status: 400 });

    const updated = db.update(catalogo_prendas)
      .set({
        nombre: nombreLimpio,
        categoria: categoria || 'Uniformes',
        requiere_talla: requiere_talla ? 1 : 0,
        tallas: requiere_talla && Array.isArray(tallas) ? tallas : null,
        stock_minimo: stock_minimo != null ? Number(stock_minimo) : 5,
        costo_estimado: costo_estimado != null && costo_estimado !== '' ? Number(costo_estimado) : null,
        ...(activo !== undefined ? { activo: activo ? 1 : 0 } : {}),
      })
      .where(eq(catalogo_prendas.id, Number(id)))
      .returning()
      .get();
    if (!updated) return Response.json({ error: 'Prenda no encontrada' }, { status: 404 });
    return Response.json(updated);
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      return Response.json({ error: 'Ya existe una prenda con ese nombre en el catálogo' }, { status: 409 });
    }
    return Response.json({ error: 'Error al actualizar la prenda' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  const { id } = await params;
  const prenda = db.select().from(catalogo_prendas).where(eq(catalogo_prendas.id, Number(id))).get();
  if (!prenda) return Response.json({ error: 'Prenda no encontrada' }, { status: 404 });

  const tieneEntradas = db.select({ id: entradas.id }).from(entradas).where(eq(entradas.articulo, prenda.nombre)).get();
  const tieneSalidas = db.select({ id: salidas.id }).from(salidas).where(eq(salidas.articulo, prenda.nombre)).get();

  if (tieneEntradas || tieneSalidas) {
    db.update(catalogo_prendas).set({ activo: 0 }).where(eq(catalogo_prendas.id, Number(id))).run();
    return Response.json({ ok: true, archivado: true, mensaje: `"${prenda.nombre}" tiene movimientos registrados: se archivó en lugar de eliminarse` });
  }

  db.delete(catalogo_prendas).where(eq(catalogo_prendas.id, Number(id))).run();
  return Response.json({ ok: true, archivado: false, mensaje: `"${prenda.nombre}" se eliminó del catálogo` });
}
