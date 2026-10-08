import { NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { autorizarInventario } from '@/src/lib/inventarioOperacion';
import { errorInventario } from '@/src/lib/inventarioValidacion';
import { datosReporte } from '@/src/lib/inventarioReporte';
export async function GET(req: NextRequest) {
  try {
    autorizarInventario(req, 'inventario', 'ver');
    const datos = datosReporte(req.nextUrl.searchParams);
    const wb = new ExcelJS.Workbook(); wb.creator = 'U3'; wb.created = new Date();
    const resumen = wb.addWorksheet('Existencias');
    resumen.columns = [
      ['Artículo','articulo',28],['Categoría','categoria',22],['Entradas','totalEntradas',14],['Nuevo','almacenNuevo',14],['Usado','almacenUsado',14],['Inutilizable','almacenInutilizable',14],
      ['Almacén total','almacen',16],['En campo','enCampo',14],['En bajas','enBajas',14],['Definitivos','definitivos',14],['Pérdidas','perdidas',14],['Ajuste neto','ajusteNeto',14],['Total existente','totalExistente',18],['Mínimo','stockMinimo',12],['Situación','situacion',28],
    ].map(([header,key,width])=>({ header:String(header),key:String(key),width:Number(width) }));
    for (const r of datos.resumen) resumen.addRow({ ...r, ajusteNeto:r.ajusteNeto || 0, situacion:r.inconsistente ? 'Revisar diferencia' : r.archivada ? 'Archivada' : r.stockBajo ? 'Stock bajo' : 'Disponible' });
    const total = resumen.addRow(['TOTALES']);
    for (let c=3;c<=13;c++) { const col=resumen.getColumn(c).letter; total.getCell(c).value=datos.resumen.length ? { formula:'SUM('+col+'2:'+col+(total.number-1)+')', result:datos.resumen.reduce((a,r)=>a+Number((r as any)[resumen.getColumn(c).key!] || 0),0) } : 0; }
    const detalle=wb.addWorksheet('Tallas');
    detalle.columns=[{header:'Artículo',key:'articulo',width:28},{header:'Talla',key:'talla',width:14},{header:'Nuevo',key:'almacenNuevo',width:14},{header:'Usado',key:'almacenUsado',width:14},{header:'Inutilizable',key:'almacenInutilizable',width:14},{header:'Total útil',key:'almacen',width:14}];
    detalle.addRows(datos.detalle);
    const info=wb.addWorksheet('Corte y criterios');
    info.addRows([['Corte',datos.corte || 'Actual'],['Historial verificable desde',datos.desde],['Búsqueda',req.nextUrl.searchParams.get('buscar') || 'Todas'],['Categoría',req.nextUrl.searchParams.get('categoria') || 'Todas'],['Total existente','Almacén + equipo en campo + equipo en bajas'],['Ajuste neto','Diferencia de conteos físicos; puede ser positiva o negativa']]);
    info.getColumn(1).width=32; info.getColumn(2).width=76;
    for (const sheet of [resumen,detalle]) {
      sheet.views=[{state:'frozen',ySplit:1}]; sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,sheet.rowCount-(sheet===resumen?1:0)),column:sheet.columnCount}};
      sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}}; sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1E293B'}};
      sheet.eachRow((row,n)=>{ if(n>1) row.eachCell(cell=>{if(typeof cell.value==='number')cell.numFmt='#,##0;[Red]-#,##0';}); });
    }
    const bytes=await wb.xlsx.writeBuffer();
    return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename=inventario.xlsx'}});
  } catch(err){return errorInventario(err);}
}
