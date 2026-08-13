import { COMPANY } from './company';

/**
 * Reporte en PDF de una cuenta de finanzas, con el formato institucional de U3.
 * Reproduce las mismas vistas que el módulo —consolidado, las cuatro hojas de
 * captura y la conciliación de egresos— para que el documento se lea igual que
 * el Excel semanal del que salió.
 *
 * Se usa tanto para el PDF real (Puppeteer, con `repeatingHeaderFooter: true`)
 * como para el respaldo en el navegador. `logoSrc` y `fontSrc` son rutas
 * públicas en el navegador y data URI base64 en el servidor, porque Puppeteer
 * recibe el HTML por `setContent` y ahí no hay URL base contra la cual resolver
 * una ruta relativa.
 */

export const CAT_HE = 'H.E. Y DOBLETES';
export const CAT_ANTICIPOS = 'ANTICIPOS';
export const CAT_GASTOS = 'GASTOS DIVERSOS';
export const CAT_INGRESOS = 'INGRESOS';
export const CAT_TRASPASO = 'TRASPASO';

export const SECCIONES = [
  { id: 'resumen', etiqueta: 'Resumen ejecutivo' },
  { id: 'consolidado', etiqueta: 'Consolidado' },
  { id: CAT_HE, etiqueta: 'H.E. y Dobletes' },
  { id: CAT_ANTICIPOS, etiqueta: 'Anticipos' },
  { id: CAT_GASTOS, etiqueta: 'Gastos Diversos' },
  { id: CAT_INGRESOS, etiqueta: 'Ingresos' },
  { id: CAT_TRASPASO, etiqueta: 'Traspasos entre medios' },
  { id: 'conciliacion', etiqueta: 'Conciliación de egresos' },
] as const;

export type SeccionId = typeof SECCIONES[number]['id'];

/** Tipografía del documento: Inter (variable, subconjunto latino) con respaldo del sistema. */
export const FUENTE_PUBLIC_PATH = '/fonts/inter-latin.woff2';
const PILA_FUENTE = `'Inter','Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif`;

const fontFaceCss = (src: string) =>
  `@font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:block;src:url("${src}") format('woff2');}`;

export interface MovimientoReporte {
  fecha: string;
  tipo: string;
  categoria: string;
  monto: number;
  descripcion: string | null;
  medio_pago: string | null;
  nombre: string | null;
  tipo_detalle: string | null;
  turno: string | null;
  alimentos: string | null;
  servicio: string | null;
}

export interface ReporteFinanzasData {
  libroNombre: string;
  responsable: string | null;
  desde: string;
  hasta: string;
  /**
   * Saldos con los que abre el periodo, para que el corrido sea real. Van en
   * `null` cuando el documento se genera en el navegador como respaldo: ahí solo
   * están los movimientos del rango, y estampar un cero fingiría un saldo que no
   * se conoce.
   */
  saldoPrevio: number | null;
  saldoPrevioTarjeta: number | null;
  saldoPrevioEfectivo: number | null;
  movimientos: MovimientoReporte[];
  generadoPor: string;
  fecha: string;
  secciones: SeccionId[];
}

const escapeHtml = (v: string | null | undefined) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// El signo va delante del símbolo: "-$1,348.54", no "$-1,348.54".
const money = (n: number) => {
  const s = Math.abs(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '-' : ''}$${s}`;
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fmtFecha = (iso: string | null) => {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};
const fmtFechaLarga = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
};

/** Celda vacía: el guion largo se pinta apagado para que no compita con el dato. */
const dato = (v: string | null | undefined) => {
  const s = escapeHtml(v);
  return s ? s : '<span class="vacio">—</span>';
};

/** Descripción compuesta, igual que la columna DESTINO del Excel. */
function destinoDe(m: MovimientoReporte): string {
  if (m.categoria === CAT_HE) {
    return [m.tipo_detalle, m.nombre, m.turno, m.alimentos ? `ALIMENTOS: ${m.alimentos}` : null, m.servicio, m.descripcion]
      .filter(Boolean).map((s) => escapeHtml(String(s))).join(' , ');
  }
  if (m.categoria === CAT_INGRESOS || m.categoria === CAT_TRASPASO) {
    return [m.medio_pago, m.descripcion].filter(Boolean).map((s) => escapeHtml(String(s))).join(' , ');
  }
  return [m.nombre, m.descripcion].filter(Boolean).map((s) => escapeHtml(String(s))).join(' , ');
}

const esIngreso = (m: MovimientoReporte) => m.tipo === 'Ingreso';

/** Fila de totales por medio de pago, como el pie de cada hoja del Excel. */
function filaTotales(rows: MovimientoReporte[], colsAntes: number): string {
  const tarjeta = rows.filter((m) => m.medio_pago === 'TARJETA').reduce((a, m) => a + m.monto, 0);
  const efectivo = rows.filter((m) => m.medio_pago === 'EFECTIVO').reduce((a, m) => a + m.monto, 0);
  const sinMedio = rows.filter((m) => !m.medio_pago).reduce((a, m) => a + m.monto, 0);
  const total = tarjeta + efectivo + sinMedio;
  const detalle = [
    `<span class="tot-lbl">Tarjeta</span> ${money(tarjeta)}`,
    `<span class="tot-lbl">Efectivo</span> ${money(efectivo)}`,
    sinMedio ? `<span class="tot-lbl">Sin medio</span> ${money(sinMedio)}` : null,
  ].filter(Boolean).join('<span class="sep"></span>');
  return `<tr class="totales">
    <td colspan="${colsAntes}" style="text-align:right">${detalle}<span class="sep"></span><span class="tot-lbl">Total</span></td>
    <td class="num"><b>${money(total)}</b></td>
  </tr>`;
}

const vacia = (cols: number, msg: string) =>
  `<tr class="sin-datos"><td colspan="${cols}">${msg}</td></tr>`;

export function buildReporteHeaderTemplate(logoSrc: string, libroNombre: string, fontSrc = FUENTE_PUBLIC_PATH): string {
  return `<style>${fontFaceCss(fontSrc)}</style>
  <div style="width:100%;font-family:${PILA_FUENTE};color:#111827;padding:0 14mm 7px 14mm;display:flex;align-items:center;justify-content:space-between;gap:14px;border-bottom:0.8px solid #c9d3e6;box-sizing:border-box;">
    <span style="display:flex;align-items:center;gap:7px;">
      <img src="${logoSrc}" style="width:22px;height:22px;object-fit:contain;flex-shrink:0;" />
      <span style="font-size:6.5px;font-weight:700;color:#8a93a5;letter-spacing:1.1px;text-transform:uppercase;">U3 Seguridad Privada</span>
    </span>
    <div style="flex:1;text-align:right;">
      <div style="font-size:8px;font-weight:700;color:#16357a;letter-spacing:1.2px;text-transform:uppercase;">Reporte de ${escapeHtml(libroNombre)}</div>
      <div style="font-size:6.2px;color:#8a93a5;margin-top:1.5px;letter-spacing:.4px;">Control de ingresos y egresos · Documento interno</div>
    </div>
  </div>`;
}

export function buildReporteFooterTemplate(logoSrc: string, fontSrc = FUENTE_PUBLIC_PATH): string {
  return `<style>${fontFaceCss(fontSrc)}</style>
  <div style="width:100%;font-family:${PILA_FUENTE};font-size:6.5px;color:#8a93a5;padding:6px 14mm 0 14mm;display:flex;align-items:center;justify-content:space-between;gap:6px;border-top:0.8px solid #e3e8f0;box-sizing:border-box;letter-spacing:.3px;">
    <span style="display:flex;align-items:center;gap:4px;"><img src="${logoSrc}" style="width:9px;height:9px;object-fit:contain;" /><span style="font-weight:700;letter-spacing:.8px;text-transform:uppercase;">${COMPANY.razonSocial}</span></span>
    <span style="text-transform:uppercase;letter-spacing:.8px;">Documento confidencial · Uso interno</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>`;
}

export function buildReporteFinanzasHtml(
  data: ReporteFinanzasData,
  logoSrc: string,
  opts?: { repeatingHeaderFooter?: boolean; fontSrc?: string },
): string {
  const repeating = !!opts?.repeatingHeaderFooter;
  const fontSrc = opts?.fontSrc ?? FUENTE_PUBLIC_PATH;
  const incluye = (id: SeccionId) => data.secciones.includes(id);

  const movs = [...data.movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const deCategoria = (cat: string) => movs.filter((m) => m.categoria === cat);

  // Los traspasos mueven dinero entre medios: no son ingreso ni gasto reales.
  const reales = movs.filter((m) => m.categoria !== CAT_TRASPASO);
  const ingresos = reales.filter(esIngreso).reduce((a, m) => a + m.monto, 0);
  const egresos = reales.filter((m) => !esIngreso(m)).reduce((a, m) => a + m.monto, 0);
  const neto = movs.reduce((a, m) => a + (esIngreso(m) ? m.monto : -m.monto), 0);
  // Sin saldo de apertura las cifras solo describen el movimiento del periodo,
  // nunca el saldo de la cuenta: el documento lo dice en vez de insinuarlo.
  const conApertura = data.saldoPrevio !== null;
  const apertura = data.saldoPrevio ?? 0;
  const existencia = apertura + neto;
  const porMedio = (medio: string, previo: number | null) =>
    (previo ?? 0) + movs.filter((m) => m.medio_pago === medio).reduce((a, m) => a + (esIngreso(m) ? m.monto : -m.monto), 0);
  const saldoTarjeta = porMedio('TARJETA', data.saldoPrevioTarjeta);
  const saldoEfectivo = porMedio('EFECTIVO', data.saldoPrevioEfectivo);
  const etiquetaSaldo = conApertura ? 'Existencia al cierre' : 'Neto del periodo';

  let numero = 0;
  const titulo = (t: string) => `<h2 class="section"><span class="num">${String(++numero).padStart(2, '0')}</span><span>${t}</span></h2>`;

  const kpi = (valor: string, etiqueta: string, color: string) => `<div class="kpi">
    <div class="kpi-bar" style="background:${color}"></div>
    <div class="kpi-val" style="color:${color}">${valor}</div>
    <div class="kpi-lbl">${etiqueta}</div>
  </div>`;

  const caja = (titulo: string, filas: string) => `<div class="summary-box">
    <div class="box-head">${titulo}</div>
    ${filas}
  </div>`;
  const fila = (etiqueta: string, valor: string, mod = '') =>
    `<div class="row${mod ? ` ${mod}` : ''}"><span>${etiqueta}</span><b>${valor}</b></div>`;

  // ── Resumen ejecutivo ──
  const seccionResumen = !incluye('resumen') ? '' : `
  ${titulo('Resumen ejecutivo')}
  <div class="kpi-grid">
    ${kpi(money(existencia), etiquetaSaldo, '#16357a')}
    ${kpi(money(ingresos), 'Ingresos del periodo', '#1d6fb8')}
    ${kpi(money(egresos), 'Egresos del periodo', '#c2410c')}
    ${kpi(String(movs.length), 'Movimientos registrados', '#4a3aa7')}
  </div>
  <div class="two-col">
    ${caja('Flujo del periodo', [
      fila('Saldo al iniciar el periodo', conApertura ? money(apertura) : '<span class="vacio">No disponible</span>'),
      fila('Ingresos', `<span style="color:#1d6fb8">+ ${money(ingresos)}</span>`),
      fila('Egresos', `<span style="color:#c2410c">− ${money(egresos)}</span>`),
      fila(etiquetaSaldo, money(existencia), 'destacada'),
    ].join(''))}
    ${caja('Distribución por medio de pago', [
      fila(conApertura ? 'Saldo en tarjeta' : 'Neto en tarjeta', money(saldoTarjeta)),
      fila(conApertura ? 'Saldo en efectivo' : 'Neto en efectivo', money(saldoEfectivo)),
      fila('Suma de medios', money(saldoTarjeta + saldoEfectivo), 'destacada'),
    ].join(''))}
  </div>
  <p class="note">${conApertura
      ? 'El saldo es acumulado: arrastra lo que la cuenta traía antes del periodo. Los ingresos y egresos corresponden únicamente al rango consultado.'
      : 'Atención: este documento se generó en el navegador como respaldo y no incluye el saldo con el que abrió el periodo, por lo que las cifras describen solo el movimiento del rango y no el saldo real de la cuenta.'
    } Los traspasos entre tarjeta y efectivo no se cuentan como ingreso ni como egreso porque no alteran la existencia.</p>`;

  /**
   * El consolidado encabeza con las cifras que se miran en cada corte, y no son
   * las mismas: el reporte semanal se revisa por el arqueo de tarjeta y efectivo
   * (que es como cierra cada semana), y el mensual por el flujo del mes.
   */
  const dias = Math.round((Date.parse(data.hasta) - Date.parse(data.desde)) / 86400000) + 1;
  const esSemanal = dias <= 8;
  const tira = (etiqueta: string, valor: string, color = '#16357a') => `<div class="tira">
    <div class="tira-lbl">${etiqueta}</div>
    <div class="tira-val" style="color:${color}">${valor}</div>
  </div>`;
  const resumenConsolidado = `<div class="tira-grid">
    ${tira(conApertura ? 'Existencia al cierre' : 'Neto del periodo', money(existencia))}
    ${esSemanal
      ? tira('Saldo en tarjeta', money(saldoTarjeta)) + tira('Saldo en efectivo', money(saldoEfectivo))
      : tira('Ingresos del periodo', money(ingresos), '#1d6fb8') + tira('Egresos del periodo', money(egresos), '#c2410c')}
  </div>`;

  // ── Consolidado con saldo corrido ──
  let corrido = apertura;
  const filasConsolidado = movs.length === 0
    ? vacia(6, 'Sin movimientos en el periodo.')
    : movs.map((m) => {
        corrido += esIngreso(m) ? m.monto : -m.monto;
        return `<tr>
          <td class="c nowrap">${fmtFecha(m.fecha)}</td>
          <td>${destinoDe(m)}</td>
          <td class="c"><span class="tag">${escapeHtml(m.categoria)}</span></td>
          <td class="num" style="color:#1d6fb8">${esIngreso(m) ? money(m.monto) : ''}</td>
          <td class="num" style="color:#c2410c">${esIngreso(m) ? '' : money(m.monto)}</td>
          <td class="num saldo">${money(corrido)}</td>
        </tr>`;
      }).join('');

  const seccionConsolidado = !incluye('consolidado') ? '' : `
  ${titulo(esSemanal ? 'Consolidado de la semana' : 'Consolidado del periodo')}
  ${resumenConsolidado}
  <table class="data zebra">
    <colgroup><col style="width:62px"/><col/><col style="width:98px"/><col style="width:76px"/><col style="width:76px"/><col style="width:84px"/></colgroup>
    <thead><tr>
      <th class="c">Fecha</th><th>Destino / Concepto</th><th class="c">Origen</th>
      <th class="r">Ingreso</th><th class="r">Egreso</th><th class="r">${conApertura ? 'Saldo' : 'Acumulado'}</th>
    </tr></thead>
    <tbody>
      <tr class="previo"><td colspan="5">${conApertura ? 'Saldo al iniciar el periodo' : 'Saldo inicial no disponible: la columna acumula solo el periodo'}</td><td class="num"><b>${money(apertura)}</b></td></tr>
      ${filasConsolidado}
    </tbody>
  </table>`;

  // ── H.E. y Dobletes ──
  const he = deCategoria(CAT_HE);
  const seccionHE = !incluye(CAT_HE) ? '' : `
  ${titulo('H.E. y Dobletes')}
  <table class="data zebra">
    <!-- Solo se fijan las columnas cortas: nombre, servicio y motivo se reparten
         el resto según su contenido, o el motivo acaba con una palabra por renglón. -->
    <colgroup><col style="width:54px"/><col style="width:58px"/><col style="width:62px"/><col/><col style="width:58px"/><col style="width:38px"/><col/><col/><col style="width:70px"/></colgroup>
    <thead><tr>
      <th class="c">Medio</th><th class="c">Fecha</th><th class="c">Tipo</th>
      <th>Nombre</th><th class="c">Turno</th><th class="c">Alim.</th>
      <th>Servicio</th><th>Motivo</th><th class="r">Importe</th>
    </tr></thead>
    <tbody>
      ${he.length === 0 ? vacia(9, 'Sin registros de H.E. y dobletes en el periodo.')
        : he.map((m) => `<tr>
          <td class="c">${dato(m.medio_pago)}</td>
          <td class="c nowrap">${fmtFecha(m.fecha)}</td>
          <td class="c nowrap">${dato(m.tipo_detalle)}</td>
          <td>${dato(m.nombre)}</td>
          <td class="c nowrap">${dato(m.turno)}</td>
          <td class="c">${dato(m.alimentos)}</td>
          <td>${dato(m.servicio)}</td>
          <td>${dato(m.descripcion)}</td>
          <td class="num">${money(m.monto)}</td>
        </tr>`).join('') + filaTotales(he, 8)}
    </tbody>
  </table>`;

  // ── Anticipos y Gastos Diversos comparten estructura ──
  const tablaNombreConcepto = (cat: string, etiquetaConcepto: string, mensajeVacio: string) => {
    const rows = deCategoria(cat);
    return `<table class="data zebra ancho-medio">
      <colgroup><col style="width:74px"/><col style="width:66px"/><col style="width:180px"/><col/><col style="width:82px"/></colgroup>
      <thead><tr>
        <th class="c">Medio</th><th class="c">Fecha</th><th>Nombre</th>
        <th>${etiquetaConcepto}</th><th class="r">Importe</th>
      </tr></thead>
      <tbody>
        ${rows.length === 0 ? vacia(5, mensajeVacio)
          : rows.map((m) => `<tr>
            <td class="c">${dato(m.medio_pago)}</td>
            <td class="c nowrap">${fmtFecha(m.fecha)}</td>
            <td>${dato(m.nombre)}</td>
            <td>${dato(m.descripcion)}</td>
            <td class="num">${money(m.monto)}</td>
          </tr>`).join('') + filaTotales(rows, 4)}
      </tbody>
    </table>`;
  };

  const seccionAnticipos = !incluye(CAT_ANTICIPOS) ? '' :
    `${titulo('Anticipos')}${tablaNombreConcepto(CAT_ANTICIPOS, 'Concepto', 'Sin anticipos en el periodo.')}`;
  const seccionGastos = !incluye(CAT_GASTOS) ? '' :
    `${titulo('Gastos Diversos')}${tablaNombreConcepto(CAT_GASTOS, 'Motivo', 'Sin gastos diversos en el periodo.')}`;

  // ── Ingresos ──
  const ing = deCategoria(CAT_INGRESOS);
  const seccionIngresos = !incluye(CAT_INGRESOS) ? '' : `
  ${titulo('Ingresos')}
  <table class="data zebra ancho-medio">
    <colgroup><col style="width:84px"/><col style="width:70px"/><col/><col style="width:96px"/></colgroup>
    <thead><tr>
      <th class="c">Medio</th><th class="c">Fecha</th><th>Concepto</th><th class="r">Importe</th>
    </tr></thead>
    <tbody>
      ${ing.length === 0 ? vacia(4, 'Sin ingresos en el periodo.')
        : ing.map((m) => `<tr>
          <td class="c">${dato(m.medio_pago)}</td>
          <td class="c nowrap">${fmtFecha(m.fecha)}</td>
          <td>${dato(m.descripcion)}</td>
          <td class="num">${money(m.monto)}</td>
        </tr>`).join('') + filaTotales(ing, 3)}
    </tbody>
  </table>`;

  // ── Traspasos ──
  const tras = deCategoria(CAT_TRASPASO);
  const seccionTraspasos = !incluye(CAT_TRASPASO) || tras.length === 0 ? '' : `
  ${titulo('Traspasos entre medios de pago')}
  <table class="data zebra ancho-medio">
    <colgroup><col style="width:70px"/><col style="width:94px"/><col/><col style="width:96px"/></colgroup>
    <thead><tr>
      <th class="c">Fecha</th><th class="c">Sale de</th><th>Concepto</th><th class="r">Importe</th>
    </tr></thead>
    <tbody>
      ${tras.filter((m) => !esIngreso(m)).map((m) => `<tr>
        <td class="c nowrap">${fmtFecha(m.fecha)}</td>
        <td class="c">${dato(m.medio_pago)}</td>
        <td>${dato(m.descripcion)}</td>
        <td class="num">${money(m.monto)}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  <p class="note">Un traspaso mueve dinero de un medio de pago al otro (por ejemplo, un retiro de efectivo desde la tarjeta). Cada uno se registra como una salida y una entrada del mismo importe, de modo que la existencia total no cambia.</p>`;

  // ── Conciliación de egresos: categoría × fecha × medio de pago ──
  const bloqueConciliacion = (cat: string) => {
    const rows = deCategoria(cat);
    const porFecha = new Map<string, { TARJETA: number; EFECTIVO: number }>();
    for (const m of rows) {
      const e = porFecha.get(m.fecha) || { TARJETA: 0, EFECTIVO: 0 };
      if (m.medio_pago === 'EFECTIVO') e.EFECTIVO += m.monto; else e.TARJETA += m.monto;
      porFecha.set(m.fecha, e);
    }
    const fechas = [...porFecha.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const totT = fechas.reduce((a, [, v]) => a + v.TARJETA, 0);
    const totE = fechas.reduce((a, [, v]) => a + v.EFECTIVO, 0);
    return `<div class="conc-box">
      <div class="conc-head">${escapeHtml(cat)}</div>
      <table class="data zebra compact">
        <colgroup><col style="width:92px"/><col/><col/><col/></colgroup>
        <thead><tr><th class="c">Fecha</th><th class="r">Tarjeta</th><th class="r">Efectivo</th><th class="r">Total</th></tr></thead>
        <tbody>
          ${fechas.length === 0 ? vacia(4, 'Sin egresos.')
            : fechas.map(([f, v]) => `<tr>
              <td class="c nowrap">${fmtFecha(f)}</td>
              <td class="num">${v.TARJETA ? money(v.TARJETA) : '<span class="vacio">—</span>'}</td>
              <td class="num">${v.EFECTIVO ? money(v.EFECTIVO) : '<span class="vacio">—</span>'}</td>
              <td class="num">${money(v.TARJETA + v.EFECTIVO)}</td>
            </tr>`).join('')}
          <tr class="totales">
            <td class="nowrap" style="text-align:right"><span class="tot-lbl">Total general</span></td>
            <td class="num"><b>${money(totT)}</b></td>
            <td class="num"><b>${money(totE)}</b></td>
            <td class="num"><b>${money(totT + totE)}</b></td>
          </tr>
        </tbody>
      </table>
    </div>`;
  };

  const totalEgresoTarjeta = reales.filter((m) => !esIngreso(m) && m.medio_pago === 'TARJETA').reduce((a, m) => a + m.monto, 0);
  const totalEgresoEfectivo = reales.filter((m) => !esIngreso(m) && m.medio_pago === 'EFECTIVO').reduce((a, m) => a + m.monto, 0);

  const seccionConciliacion = !incluye('conciliacion') ? '' : `
  ${titulo('Conciliación de egresos')}
  <div class="two-col">
    ${caja('Egresos por medio de pago', [
      fila('Fondo total disponible', money(existencia)),
      fila('Egresos con tarjeta', money(totalEgresoTarjeta)),
      fila('Egresos en efectivo', money(totalEgresoEfectivo)),
      fila('Total de egresos', money(egresos), 'destacada'),
    ].join(''))}
    ${caja('Egresos por concepto', [
      fila('H.E. y dobletes', money(deCategoria(CAT_HE).reduce((a, m) => a + m.monto, 0))),
      fila('Anticipos', money(deCategoria(CAT_ANTICIPOS).reduce((a, m) => a + m.monto, 0))),
      fila('Gastos diversos', money(deCategoria(CAT_GASTOS).reduce((a, m) => a + m.monto, 0))),
    ].join(''))}
  </div>
  <div class="conc-wrap">${[CAT_HE, CAT_ANTICIPOS, CAT_GASTOS].map(bloqueConciliacion).join('')}</div>`;

  return `<!doctype html><html lang="es"><head><meta charset="UTF-8"/>
<style>
  ${fontFaceCss(fontSrc)}

  /* Paleta institucional: azul U3 para jerarquía, grises fríos para el resto. */
  :root{
    --navy:#16357a; --navy-soft:#eef2f9; --linea:#e3e8f0; --linea-fuerte:#c9d3e6;
    --tinta:#1b2333; --tinta-media:#4b5566; --tinta-tenue:#8a93a5;
    --ingreso:#1d6fb8; --egreso:#c2410c; --zebra:#f7f9fc;
  }

  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:${PILA_FUENTE};font-size:10.5px;color:var(--tinta);line-height:1.5;
    -webkit-font-smoothing:antialiased;font-feature-settings:'kern' 1,'liga' 1;
    -webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{padding:${repeating ? '2px 0' : '30px 38px'}}

  /* ── Membrete y pie de la versión de una sola hoja (respaldo del navegador) ── */
  .header-inline{display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:2.5px solid var(--navy);padding-bottom:12px;margin-bottom:4px}
  .header-inline img{width:54px;height:54px;object-fit:contain;flex-shrink:0}
  .header-inline .razon{font-size:12px;font-weight:700;color:var(--navy);letter-spacing:1.4px;text-transform:uppercase}
  .header-inline .datos{font-size:7.6px;color:var(--tinta-media);margin-top:4px;line-height:1.65;letter-spacing:.15px}
  .header-inline .empresa{text-align:right;flex:1}
  .footer-inline{display:flex;align-items:center;justify-content:space-between;gap:6px;border-top:1px solid var(--linea);padding-top:9px;margin-top:26px;font-size:7px;color:var(--tinta-tenue);letter-spacing:.5px;text-transform:uppercase}
  .footer-inline img{width:13px;height:13px;object-fit:contain}
  .footer-inline .brand{display:flex;align-items:center;gap:5px;font-weight:700;letter-spacing:.9px}

  /* ── Portada del reporte ── */
  .doc-title{text-align:center;margin:22px 0 18px 0}
  .doc-title .eyebrow{font-size:7.5px;font-weight:700;color:var(--tinta-tenue);letter-spacing:2.4px;text-transform:uppercase}
  .doc-title h1{font-size:20px;font-weight:700;color:var(--navy);letter-spacing:1.6px;text-transform:uppercase;margin-top:7px;line-height:1.25}
  .doc-title .rule{width:54px;height:2.5px;background:var(--navy);margin:11px auto 0}
  .doc-title .sub{font-size:9px;color:var(--tinta-media);margin-top:9px;letter-spacing:.3px}

  /* Ficha de identificación: micro-etiqueta arriba, dato abajo, en cuatro columnas. */
  .meta-bar{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--linea);border-top:2px solid var(--navy);
    background:#fbfcfe;margin-bottom:6px}
  .meta-bar .item{padding:8px 12px;border-left:1px solid var(--linea)}
  .meta-bar .item:first-child{border-left:none}
  .meta-bar .k{font-size:6.6px;font-weight:700;color:var(--tinta-tenue);letter-spacing:1.1px;text-transform:uppercase}
  .meta-bar .v{font-size:9.5px;font-weight:600;color:var(--navy);margin-top:3px;line-height:1.35}

  /* Cada sección arranca en hoja nueva. Antes encadenaban una tras otra y una
     tabla podía empezar con 175px de hoja libre: dos filas y salto. Se prefiere
     el espacio en blanco al final de la hoja anterior. */
  h2.section{display:flex;align-items:center;gap:9px;font-size:11.5px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:1.5px;
    margin:22px 0 12px 0;padding-bottom:7px;border-bottom:1px solid var(--linea-fuerte);
    page-break-after:avoid;break-after:avoid;page-break-before:always;break-before:page}
  h2.section .num{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;background:var(--navy);color:#fff;
    font-size:7.5px;font-weight:700;letter-spacing:.2px;flex-shrink:0}
  /* …salvo la primera, que no debe empujar una hoja en blanco al inicio. */
  h2.section:first-of-type{page-break-before:auto;break-before:auto}

  /* ── Indicadores ── */
  .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;page-break-inside:avoid;break-inside:avoid}
  .kpi{border:1px solid var(--linea);padding:0 10px 12px;text-align:center;background:#fff}
  .kpi-bar{height:2.5px;margin:0 -10px 11px}
  .kpi-val{font-size:16px;font-weight:700;line-height:1.15;letter-spacing:-.2px;font-variant-numeric:tabular-nums}
  .kpi-lbl{font-size:6.8px;color:var(--tinta-tenue);text-transform:uppercase;letter-spacing:1.1px;margin-top:7px;font-weight:700}

  /* Tira de cifras que encabeza el consolidado */
  .tira-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
  .tira{border:1px solid var(--linea);border-left:2.5px solid var(--navy);padding:8px 11px;background:#fbfcfe}
  .tira-lbl{font-size:6.8px;color:var(--tinta-tenue);text-transform:uppercase;letter-spacing:1.1px;font-weight:700}
  .tira-val{font-size:13.5px;font-weight:700;margin-top:3px;font-variant-numeric:tabular-nums}

  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start;margin-top:14px}
  .summary-box{border:1px solid var(--linea);background:#fff;page-break-inside:avoid;break-inside:avoid}
  .summary-box .box-head{background:var(--navy-soft);border-bottom:1px solid var(--linea);padding:6px 12px;
    font-size:7.2px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:1.2px}
  .summary-box .row{display:flex;justify-content:space-between;gap:10px;padding:6px 12px;border-bottom:1px solid #f0f3f8;font-size:9.5px;color:var(--tinta-media)}
  .summary-box .row:last-child{border-bottom:none}
  .summary-box .row b{color:var(--tinta);white-space:nowrap;font-weight:600;font-variant-numeric:tabular-nums}
  .summary-box .row.destacada{background:#fbfcfe;border-top:1px solid var(--linea-fuerte);color:var(--navy);font-weight:600}
  .summary-box .row.destacada b{color:var(--navy);font-weight:700}

  /* ── Tablas: centradas en la caja de texto y con anchos acotados cuando la
     tabla tiene pocas columnas, para que las cifras no queden a media hoja. ── */
  table.data{width:100%;border-collapse:collapse;margin:0 auto;border-bottom:1.5px solid var(--navy)}
  table.data.ancho-medio{max-width:560px}
  table.data thead tr{background:var(--navy);color:#fff}
  table.data th{padding:6.5px 8px;font-size:7.2px;font-weight:700;text-align:left;text-transform:uppercase;letter-spacing:1px;line-height:1.3}
  table.data td{padding:5px 8px;border-bottom:1px solid var(--linea);font-size:8.4px;vertical-align:top;color:var(--tinta-media)}
  table.data th.c,table.data td.c{text-align:center}
  table.data th.r,table.data td.num{text-align:right}
  table.data td.nowrap,table.data td .nowrap{white-space:nowrap}
  table.data thead{display:table-header-group}
  /* Una fila nunca se parte a la mitad; si no cabe, baja entera a la hoja siguiente */
  table.data tr{page-break-inside:avoid;break-inside:avoid}
  table.data td{break-inside:avoid}
  table.data.zebra tbody tr:nth-child(even):not(.totales):not(.previo){background:var(--zebra)}
  table.data td.num{white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--tinta)}
  table.data td.saldo{font-weight:700;color:var(--navy)}
  table.compact td{padding:4px 8px;font-size:8px}

  /* La fila de totales viaja pegada a las filas que suma */
  tr.totales{page-break-before:avoid;break-before:avoid;background:var(--navy-soft)!important}
  tr.totales td{font-size:8.4px;color:var(--navy);border-top:1.5px solid var(--navy);border-bottom:none;padding-top:6px;padding-bottom:6px;font-variant-numeric:tabular-nums}
  tr.totales .tot-lbl{font-size:6.8px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--tinta-tenue);margin-right:3px}
  tr.totales .sep{display:inline-block;width:1px;height:7px;background:var(--linea-fuerte);margin:0 9px;vertical-align:middle}
  tr.previo td{background:#fbfcfe;color:var(--tinta-tenue);font-size:8px}
  tr.sin-datos td{text-align:center;color:var(--tinta-tenue);padding:16px;font-size:8.4px}
  .vacio{color:#c2c8d4}

  /* La tira de cifras encabeza su tabla: no debe quedarse sola al pie */
  .tira-grid{page-break-after:avoid;break-after:avoid;page-break-inside:avoid;break-inside:avoid}

  .tag{display:inline-block;padding:1px 7px;border:1px solid var(--linea-fuerte);background:#fff;color:var(--navy);
    font-size:6.8px;font-weight:700;letter-spacing:.6px;white-space:nowrap;text-transform:uppercase}

  /* Cuatro columnas de cifras no necesitan el ancho completo de la hoja: a página
     entera el ojo tiene que recorrer demasiado entre la fecha y su importe. */
  .conc-wrap{margin-top:18px}
  .conc-box{margin:0 auto 16px;max-width:440px;page-break-inside:avoid}
  .conc-head{font-size:7.6px;font-weight:700;color:var(--navy);letter-spacing:1.2px;text-transform:uppercase;margin-bottom:5px;padding-left:1px}

  /* ── Firmas ── */
  .firma{margin-top:44px;display:flex;justify-content:center;gap:70px;page-break-inside:avoid}
  .firma .box{width:220px;text-align:center}
  .firma .line{border-top:1px solid var(--tinta);margin-top:44px;padding-top:7px}
  .firma .line b{display:block;font-size:9.5px;font-weight:600;color:var(--tinta)}
  .firma .line span{display:block;color:var(--tinta-tenue);font-size:7px;text-transform:uppercase;letter-spacing:1.1px;margin-top:3px;font-weight:700}

  .note{font-size:7.6px;color:var(--tinta-media);margin-top:14px;text-align:justify;line-height:1.6;
    border-left:2px solid var(--linea-fuerte);background:#fbfcfe;padding:8px 11px;page-break-inside:avoid}
</style></head>
<body>
  <div class="page">
  ${!repeating ? `<div class="header-inline">
    <img src="${logoSrc}" alt="U3" />
    <div class="empresa">
      <div class="razon">${COMPANY.razonSocial}</div>
      <div class="datos">${COMPANY.domicilio}<br/>Tel: ${COMPANY.telefono}.<br/>CDMX Permiso DGSPyCI: ${COMPANY.permisoDGSPyCI}; Expediente: ${COMPANY.expediente}<br/>${COMPANY.web}</div>
    </div>
  </div>` : ''}

  <div class="doc-title">
    <div class="eyebrow">Finanzas · Control interno</div>
    <h1>Reporte de ${escapeHtml(data.libroNombre)}</h1>
    <div class="rule"></div>
    <div class="sub">Control de ingresos y egresos · del ${fmtFecha(data.desde)} al ${fmtFecha(data.hasta)}</div>
  </div>

  <div class="meta-bar">
    <div class="item"><div class="k">Periodo</div><div class="v">${fmtFecha(data.desde)} – ${fmtFecha(data.hasta)}</div></div>
    <div class="item"><div class="k">Responsable</div><div class="v">${dato(data.responsable)}</div></div>
    <div class="item"><div class="k">Generado por</div><div class="v">${dato(data.generadoPor)}</div></div>
    <div class="item"><div class="k">Fecha de emisión</div><div class="v">${fmtFechaLarga(data.fecha)}</div></div>
  </div>

  ${seccionResumen}
  ${seccionConsolidado}
  ${seccionHE}
  ${seccionAnticipos}
  ${seccionGastos}
  ${seccionIngresos}
  ${seccionTraspasos}
  ${seccionConciliacion}

  <div class="firma">
    <div class="box"><div class="line"><b>${escapeHtml(data.responsable) || '&nbsp;'}</b><span>Responsable de la cuenta</span></div></div>
    <div class="box"><div class="line"><b>&nbsp;</b><span>Revisó / Autorizó</span></div></div>
  </div>

  ${!repeating ? `<div class="footer-inline">
    <span class="brand"><img src="${logoSrc}" alt="" /> ${COMPANY.razonSocial}</span>
    <span>Documento confidencial · Uso interno</span>
  </div>` : ''}
  </div>
</body></html>`;
}
