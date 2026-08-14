import ExcelJS from 'exceljs';
import {
  CAT_HE, CAT_ANTICIPOS, CAT_GASTOS, CAT_INGRESOS, CAT_TRASPASO,
  type SeccionId, type MovimientoReporte,
} from '@/src/lib/reporteFinanzasTemplate';

/**
 * Armado del Excel del reporte de una cuenta.
 *
 * Reproduce la plantilla semanal de la que salió el módulo: una hoja por
 * categoría con las mismas columnas y en el mismo orden que el archivo
 * original, más el Consolidado y la Conciliación que antes hacían una macro y
 * unas tablas dinámicas. La idea es que quien recibía aquel Excel reconozca
 * este sin explicaciones.
 *
 * Comparte secciones con el reporte en PDF, así que pedir las mismas de un lado
 * y del otro da el mismo contenido en distinto formato.
 *
 * No toca la base de datos a propósito —igual que el template del PDF— para que
 * se pueda armar y verificar un libro con datos de prueba.
 */

const MONEDA = '#,##0.00';
const AZUL = 'FF1E3A5F';
const AZUL_CLARO = 'FFDCE6F1';

/** Columnas de cada hoja, calcadas del formato que se venía usando en Excel. */
type Col = { titulo: string; ancho: number; valor: (m: MovimientoReporte) => string | number | null; dinero?: boolean };

const COL_MEDIO: Col = { titulo: 'MEDIO DE PAGO', ancho: 16, valor: (m) => m.medio_pago };
const COL_FECHA: Col = { titulo: 'FECHA', ancho: 12, valor: (m) => m.fecha };
const COL_IMPORTE: Col = { titulo: 'IMPORTE', ancho: 14, valor: (m) => m.monto, dinero: true };

const COLUMNAS: Record<string, Col[]> = {
  [CAT_HE]: [
    COL_MEDIO, COL_FECHA,
    { titulo: 'TIPO', ancho: 16, valor: (m) => m.tipo_detalle },
    { titulo: 'NOMBRE', ancho: 32, valor: (m) => m.nombre },
    { titulo: 'TURNO', ancho: 14, valor: (m) => m.turno },
    { titulo: 'ALIMENTOS', ancho: 12, valor: (m) => m.alimentos },
    { titulo: 'SERVICIO', ancho: 24, valor: (m) => m.servicio },
    { titulo: 'MOTIVO', ancho: 46, valor: (m) => m.descripcion },
    COL_IMPORTE,
  ],
  [CAT_ANTICIPOS]: [
    COL_MEDIO, COL_FECHA,
    { titulo: 'NOMBRE', ancho: 32, valor: (m) => m.nombre },
    { titulo: 'MOTIVO', ancho: 52, valor: (m) => m.descripcion },
    COL_IMPORTE,
  ],
  [CAT_GASTOS]: [
    COL_MEDIO, COL_FECHA,
    { titulo: 'NOMBRE', ancho: 32, valor: (m) => m.nombre },
    { titulo: 'MOTIVO', ancho: 52, valor: (m) => m.descripcion },
    COL_IMPORTE,
  ],
  [CAT_INGRESOS]: [
    COL_MEDIO, COL_FECHA,
    { titulo: 'CONCEPTO', ancho: 60, valor: (m) => m.descripcion },
    COL_IMPORTE,
  ],
  [CAT_TRASPASO]: [
    COL_MEDIO, COL_FECHA,
    { titulo: 'SENTIDO', ancho: 12, valor: (m) => (m.tipo === 'Ingreso' ? 'ENTRA' : 'SALE') },
    { titulo: 'CONCEPTO', ancho: 60, valor: (m) => m.descripcion },
    COL_IMPORTE,
  ],
};

/** Nombre de hoja válido: Excel corta en 31 y prohíbe : \ / ? * [ ] */
const nombreHoja = (s: string) => s.replace(/[:\\/?*[\]]/g, '-').slice(0, 31);

function encabezado(hoja: ExcelJS.Worksheet, titulos: string[], anchos: number[]) {
  hoja.columns = anchos.map((ancho) => ({ width: ancho }));
  const fila = hoja.addRow(titulos);
  fila.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  fila.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  fila.height = 22;
  // La cabecera se queda a la vista y se puede filtrar sin configurar nada.
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  hoja.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: titulos.length },
  };
}

function filaTotal(hoja: ExcelJS.Worksheet, columnas: number, colDinero: number, total: number) {
  const celdas = new Array(columnas).fill(null);
  celdas[Math.max(0, colDinero - 2)] = 'TOTAL';
  celdas[colDinero - 1] = total;
  const fila = hoja.addRow(celdas);
  fila.font = { bold: true };
  fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_CLARO } };
  fila.getCell(colDinero).numFmt = MONEDA;
}

function hojaDeCategoria(wb: ExcelJS.Workbook, categoria: string, movs: MovimientoReporte[]) {
  const cols = COLUMNAS[categoria];
  if (!cols) return;
  const hoja = wb.addWorksheet(nombreHoja(categoria));
  encabezado(hoja, cols.map((c) => c.titulo), cols.map((c) => c.ancho));

  const propios = movs.filter((m) => m.categoria === categoria);
  for (const m of propios) {
    const fila = hoja.addRow(cols.map((c) => c.valor(m)));
    cols.forEach((c, i) => { if (c.dinero) fila.getCell(i + 1).numFmt = MONEDA; });
  }

  const iDinero = cols.findIndex((c) => c.dinero) + 1;
  if (iDinero > 0) filaTotal(hoja, cols.length, iDinero, propios.reduce((s, m) => s + m.monto, 0));
}

/** Une todas las categorías en orden con el saldo corrido, como hacía la macro. */
function hojaConsolidado(wb: ExcelJS.Workbook, movs: MovimientoReporte[], saldoPrevio: number) {
  const hoja = wb.addWorksheet('Consolidado');
  encabezado(hoja,
    ['FECHA', 'DESTINO', 'MEDIO DE PAGO', 'INGRESO', 'EGRESO', 'ORIGEN', 'SALDO'],
    [12, 60, 16, 14, 14, 20, 16]);

  const inicio = hoja.addRow(['', 'SALDO CON EL QUE ABRE EL PERIODO', '', null, null, '', saldoPrevio]);
  inicio.font = { italic: true, bold: true };
  inicio.getCell(7).numFmt = MONEDA;

  let saldo = saldoPrevio;
  for (const m of movs) {
    const entra = m.tipo === 'Ingreso';
    saldo += entra ? m.monto : -m.monto;
    const destino = [m.tipo_detalle, m.nombre, m.turno, m.servicio, m.descripcion].filter(Boolean).join(' , ');
    const fila = hoja.addRow([
      m.fecha, destino || '—', m.medio_pago,
      entra ? m.monto : null, entra ? null : m.monto,
      m.categoria, saldo,
    ]);
    for (const c of [4, 5, 7]) fila.getCell(c).numFmt = MONEDA;
  }

  const ing = movs.filter((m) => m.tipo === 'Ingreso').reduce((s, m) => s + m.monto, 0);
  const egr = movs.filter((m) => m.tipo !== 'Ingreso').reduce((s, m) => s + m.monto, 0);
  const fila = hoja.addRow(['', 'TOTALES DEL PERIODO', '', ing, egr, '', saldo]);
  fila.font = { bold: true };
  fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_CLARO } };
  for (const c of [4, 5, 7]) fila.getCell(c).numFmt = MONEDA;
}

/** Egresos por categoría y medio de pago: lo que antes eran tablas dinámicas. */
function hojaConciliacion(wb: ExcelJS.Workbook, movs: MovimientoReporte[]) {
  const hoja = wb.addWorksheet('CONCILIACION DE EGRESOS');
  encabezado(hoja, ['CATEGORÍA', 'TARJETA', 'EFECTIVO', 'SIN MEDIO', 'TOTAL'], [28, 16, 16, 16, 16]);

  // Los traspasos no son egreso: solo mueven dinero de un medio al otro.
  const egresos = movs.filter((m) => m.tipo !== 'Ingreso' && m.categoria !== CAT_TRASPASO);
  const categorias = [CAT_HE, CAT_ANTICIPOS, CAT_GASTOS]
    .concat([...new Set(egresos.map((m) => m.categoria))].filter((c) => ![CAT_HE, CAT_ANTICIPOS, CAT_GASTOS].includes(c)));

  const suma = (cat: string, medio: string | null) => egresos
    .filter((m) => m.categoria === cat && (medio ? m.medio_pago === medio : !m.medio_pago))
    .reduce((s, m) => s + m.monto, 0);

  const totales = [0, 0, 0];
  for (const cat of categorias) {
    const t = suma(cat, 'TARJETA'), e = suma(cat, 'EFECTIVO'), n = suma(cat, null);
    if (!t && !e && !n) continue;
    totales[0] += t; totales[1] += e; totales[2] += n;
    const fila = hoja.addRow([cat, t, e, n, t + e + n]);
    for (let c = 2; c <= 5; c++) fila.getCell(c).numFmt = MONEDA;
  }

  const fila = hoja.addRow(['TOTAL', totales[0], totales[1], totales[2], totales[0] + totales[1] + totales[2]]);
  fila.font = { bold: true };
  fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_CLARO } };
  for (let c = 2; c <= 5; c++) fila.getCell(c).numFmt = MONEDA;
}

function hojaResumen(wb: ExcelJS.Workbook, datos: {
  libroNombre: string; responsable: string | null; desde: string; hasta: string;
  generadoPor: string; movs: MovimientoReporte[];
  saldoPrevio: number; saldoPrevioTarjeta: number; saldoPrevioEfectivo: number;
}) {
  const hoja = wb.addWorksheet('Resumen');
  hoja.columns = [{ width: 34 }, { width: 22 }];

  const titulo = hoja.addRow([datos.libroNombre.toUpperCase(), '']);
  titulo.font = { bold: true, size: 14, color: { argb: AZUL } };
  hoja.addRow(['Periodo', `${datos.desde} a ${datos.hasta}`]);
  hoja.addRow(['Responsable', datos.responsable ?? '—']);
  hoja.addRow(['Generado por', datos.generadoPor]);
  hoja.addRow(['Generado el', new Date().toISOString().slice(0, 16).replace('T', ' ')]);
  hoja.addRow([]);

  // Los traspasos inflarían por igual ingresos y egresos sin que entre ni salga nada.
  const reales = datos.movs.filter((m) => m.categoria !== CAT_TRASPASO);
  const ing = reales.filter((m) => m.tipo === 'Ingreso').reduce((s, m) => s + m.monto, 0);
  const egr = reales.filter((m) => m.tipo !== 'Ingreso').reduce((s, m) => s + m.monto, 0);
  const porMedio = (medio: string) => datos.movs
    .filter((m) => m.medio_pago === medio)
    .reduce((s, m) => s + (m.tipo === 'Ingreso' ? m.monto : -m.monto), 0);

  for (const [etiqueta, valor] of [
    ['Saldo al iniciar el periodo', datos.saldoPrevio],
    ['Ingresos del periodo', ing],
    ['Egresos del periodo', egr],
    ['Saldo al cerrar el periodo', datos.saldoPrevio + ing - egr],
    ['', null],
    ['Saldo en tarjeta', datos.saldoPrevioTarjeta + porMedio('TARJETA')],
    ['Saldo en efectivo', datos.saldoPrevioEfectivo + porMedio('EFECTIVO')],
    ['', null],
    ['Movimientos en el periodo', datos.movs.length],
  ] as [string, number | null][]) {
    if (!etiqueta) { hoja.addRow([]); continue; }
    const fila = hoja.addRow([etiqueta, valor]);
    fila.getCell(1).font = { bold: true };
    if (etiqueta.startsWith('Saldo') || etiqueta.includes('resos')) fila.getCell(2).numFmt = MONEDA;
  }
}

export interface DatosExcelFinanzas {
  libroNombre: string;
  responsable: string | null;
  desde: string;
  hasta: string;
  generadoPor: string;
  movimientos: MovimientoReporte[];
  saldoPrevio: number;
  saldoPrevioTarjeta: number;
  saldoPrevioEfectivo: number;
  secciones: SeccionId[];
}

/** Arma el libro y lo devuelve serializado, listo para descargar. */
export async function buildReporteFinanzasExcel(datos: DatosExcelFinanzas) {
  const { movimientos: movs, secciones, saldoPrevio } = datos;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Suite U3';
  wb.created = new Date();

  // El orden de las hojas lo fija este recorrido y no el de los parámetros, así
  // que el archivo sale siempre igual sin importar cómo se pidan las secciones.
  if (secciones.includes('resumen')) {
    hojaResumen(wb, {
      libroNombre: datos.libroNombre,
      responsable: datos.responsable,
      desde: datos.desde,
      hasta: datos.hasta,
      generadoPor: datos.generadoPor,
      movs,
      saldoPrevio,
      saldoPrevioTarjeta: datos.saldoPrevioTarjeta,
      saldoPrevioEfectivo: datos.saldoPrevioEfectivo,
    });
  }
  if (secciones.includes('consolidado')) hojaConsolidado(wb, movs, saldoPrevio);
  for (const cat of [CAT_HE, CAT_ANTICIPOS, CAT_GASTOS, CAT_INGRESOS, CAT_TRASPASO]) {
    if (secciones.includes(cat as SeccionId)) hojaDeCategoria(wb, cat, movs);
  }
  if (secciones.includes('conciliacion')) hojaConciliacion(wb, movs);

  // Un libro sin hojas es un archivo que Excel se niega a abrir.
  if (wb.worksheets.length === 0) hojaConsolidado(wb, movs, saldoPrevio);

  const buffer = await wb.xlsx.writeBuffer();
  const limpio = datos.libroNombre.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return {
    buffer: Buffer.from(buffer),
    nombreArchivo: `${limpio}_${datos.desde}_a_${datos.hasta}.xlsx`,
    hojas: wb.worksheets.map((h) => h.name),
    movimientos: movs.length,
  };
}
