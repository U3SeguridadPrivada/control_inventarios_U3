import { NextRequest } from 'next/server';
import { autorizarConsultaInventario, autorizarInventario } from '@/src/lib/inventarioOperacion';
import { errorInventario } from '@/src/lib/inventarioValidacion';
import { datosReporte } from '@/src/lib/inventarioReporte';
export async function GET(req: NextRequest) {
  try { autorizarConsultaInventario(req, [['inventario','ver'], ['entradas','crear'], ['salidas','crear'], ['uniformes-campo','editar'], ['uniformes-campo','crear']]); return Response.json(datosReporte(req.nextUrl.searchParams).detalle); }
  catch (err) { return errorInventario(err); }
}
