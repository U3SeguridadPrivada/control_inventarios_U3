import { calcularInventario } from '@/src/lib/inventario';
export function datosReporte(params: URLSearchParams) {
  const corte = params.get('corte') || undefined;
  const datos = calcularInventario(corte);
  const buscar = (params.get('buscar') || '').trim().toLocaleLowerCase('es');
  const categoria = params.get('categoria') || '';
  const resumen = datos.resumen.filter(r => (!buscar || r.articulo.toLocaleLowerCase('es').includes(buscar)) && (!categoria || categoria === 'TODAS' || r.categoria === categoria));
  const nombres = new Set(resumen.map(r => r.articulo));
  return { ...datos, resumen, detalle: datos.detalle.filter(r => nombres.has(r.articulo)), corte };
}
