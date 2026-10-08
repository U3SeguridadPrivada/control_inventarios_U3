import { NextRequest } from 'next/server';
import { autorizarInventario } from '@/src/lib/inventarioOperacion';
import { errorInventario } from '@/src/lib/inventarioValidacion';
import { datosReporte } from '@/src/lib/inventarioReporte';
export async function GET(req: NextRequest) {
  try { autorizarInventario(req, 'inventario', 'ver'); return Response.json(datosReporte(req.nextUrl.searchParams).resumen); }
  catch (err) { return errorInventario(err); }
}
