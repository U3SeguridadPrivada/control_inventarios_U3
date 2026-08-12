import { COMPANY } from './company';

/**
 * Reporte en PDF de una cuenta de finanzas, con el formato institucional de U3.
 * Reproduce las mismas vistas que el módulo —consolidado, las cuatro hojas de
 * captura y la conciliación de egresos— para que el documento se lea igual que
 * el Excel semanal del que salió.
 *
 * Se usa tanto para el PDF real (Puppeteer, con `repeatingHeaderFooter: true`)
 * como para el respaldo en el navegador. `logoSrc` es una ruta pública en el
 * navegador y un data URI base64 en el servidor.
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
    `Tarjeta: <b>${money(tarjeta)}</b>`,
    `Efectivo: <b>${money(efectivo)}</b>`,
    sinMedio ? `Sin medio: <b>${money(sinMedio)}</b>` : null,
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');
  return `<tr class="totales">
    <td colspan="${colsAntes}" style="text-align:right">${detalle} &nbsp;·&nbsp; Total</td>
    <td style="text-align:right"><b>${money(total)}</b></td>
  </tr>`;
}

const vacia = (cols: number, msg: string) =>
  `<tr><td colspan="${cols}" style="text-align:center;color:#9ca3af;padding:14px">${msg}</td></tr>`;

export function buildReporteHeaderTemplate(logoSrc: string, libroNombre: string): string {
  return `<div style="width:100%;font-family:Arial,Helvetica,sans-serif;color:#111;padding:0 14mm 8px 14mm;display:flex;align-items:center;justify-content:space-between;gap:14px;border-bottom:1.5px solid #16357a;box-sizing:border-box;">
    <img src="${logoSrc}" style="width:26px;height:26px;object-fit:contain;flex-shrink:0;" />
    <div style="flex:1;text-align:right;">
      <div style="font-size:9px;font-weight:800;color:#16357a;letter-spacing:.3px;">REPORTE DE ${escapeHtml(libroNombre).toUpperCase()}</div>
      <div style="font-size:6.5px;color:#6b7280;margin-top:2px;">${COMPANY.razonSocial}</div>
    </div>
  </div>`;
}

export function buildReporteFooterTemplate(logoSrc: string): string {
  return `<div style="width:100%;font-family:Arial,Helvetica,sans-serif;font-size:7px;color:#6b7280;padding:0 14mm;display:flex;align-items:center;justify-content:space-between;gap:6px;border-top:1px solid #e5e7eb;box-sizing:border-box;">
    <span style="display:flex;align-items:center;gap:4px;"><img src="${logoSrc}" style="width:10px;height:10px;object-fit:contain;" /><span style="font-weight:700;letter-spacing:.3px;">U3 SEGURIDAD PRIVADA</span></span>
    <span>Documento confidencial · Uso interno</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>`;
}

export function buildReporteFinanzasHtml(
  data: ReporteFinanzasData,
  logoSrc: string,
  opts?: { repeatingHeaderFooter?: boolean },
): string {
  const repeating = !!opts?.repeatingHeaderFooter;
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
  const titulo = (t: string) => `<h2 class="section">${++numero}. ${t}</h2>`;

  const kpi = (valor: string, etiqueta: string, color: string) => `<div class="kpi">
    <div class="kpi-val" style="color:${color}">${valor}</div>
    <div class="kpi-lbl">${etiqueta}</div>
  </div>`;

  // ── Resumen ejecutivo ──
  const seccionResumen = !incluye('resumen') ? '' : `
  ${titulo('Resumen ejecutivo')}
  <div class="kpi-grid">
    ${kpi(money(existencia), etiquetaSaldo, '#16357a')}
    ${kpi(money(ingresos), 'Ingresos del periodo', '#2a78d6')}
    ${kpi(money(egresos), 'Egresos del periodo', '#eb6834')}
    ${kpi(String(movs.length), 'Movimientos', '#4a3aa7')}
  </div>
  <div class="two-col" style="margin-top:14px">
    <div class="summary-box">
      <div class="row"><span>Saldo al iniciar el periodo</span><b>${conApertura ? money(apertura) : 'No disponible'}</b></div>
      <div class="row"><span>Ingresos</span><b style="color:#2a78d6">+ ${money(ingresos)}</b></div>
      <div class="row"><span>Egresos</span><b style="color:#eb6834">− ${money(egresos)}</b></div>
      <div class="row"><span><b>${etiquetaSaldo}</b></span><b>${money(existencia)}</b></div>
    </div>
    <div class="summary-box">
      <div class="row"><span>${conApertura ? 'Saldo en tarjeta' : 'Neto en tarjeta'}</span><b>${money(saldoTarjeta)}</b></div>
      <div class="row"><span>${conApertura ? 'Saldo en efectivo' : 'Neto en efectivo'}</span><b>${money(saldoEfectivo)}</b></div>
      <div class="row"><span>Suma de medios</span><b>${money(saldoTarjeta + saldoEfectivo)}</b></div>
    </div>
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
      : tira('Ingresos del periodo', money(ingresos), '#2a78d6') + tira('Egresos del periodo', money(egresos), '#eb6834')}
  </div>`;

  // ── Consolidado con saldo corrido ──
  let corrido = apertura;
  const filasConsolidado = movs.length === 0
    ? vacia(6, 'Sin movimientos en el periodo.')
    : movs.map((m, i) => {
        corrido += esIngreso(m) ? m.monto : -m.monto;
        return `<tr${i % 2 === 0 ? '' : ' style="background:#f5f7fb"'}>
          <td style="white-space:nowrap">${fmtFecha(m.fecha)}</td>
          <td>${destinoDe(m)}</td>
          <td style="white-space:nowrap"><span class="tag">${escapeHtml(m.categoria)}</span></td>
          <td class="num" style="color:#1d6fb8">${esIngreso(m) ? money(m.monto) : ''}</td>
          <td class="num" style="color:#c2410c">${esIngreso(m) ? '' : money(m.monto)}</td>
          <td class="num"><b>${money(corrido)}</b></td>
        </tr>`;
      }).join('');

  const seccionConsolidado = !incluye('consolidado') ? '' : `
  ${titulo(esSemanal ? 'Consolidado de la semana' : 'Consolidado del periodo')}
  ${resumenConsolidado}
  <table class="data">
    <thead><tr>
      <th style="width:62px">Fecha</th><th>Destino / Concepto</th><th style="width:96px">Origen</th>
      <th style="width:74px;text-align:right">Ingreso</th><th style="width:74px;text-align:right">Egreso</th><th style="width:82px;text-align:right">${conApertura ? 'Saldo' : 'Acumulado'}</th>
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
  <table class="data">
    <thead><tr>
      <th style="width:56px">Medio</th><th style="width:58px">Fecha</th><th style="width:74px">Tipo</th>
      <th style="width:150px">Nombre</th><th style="width:62px">Turno</th><th style="width:42px">Alim.</th>
      <th style="width:92px">Servicio</th><th>Motivo</th><th style="width:70px;text-align:right">Importe</th>
    </tr></thead>
    <tbody>
      ${he.length === 0 ? vacia(9, 'Sin registros de H.E. y dobletes en el periodo.')
        : he.map((m, i) => `<tr${i % 2 === 0 ? '' : ' style="background:#f5f7fb"'}>
          <td>${escapeHtml(m.medio_pago) || '—'}</td>
          <td style="white-space:nowrap">${fmtFecha(m.fecha)}</td>
          <td style="white-space:nowrap">${escapeHtml(m.tipo_detalle) || '—'}</td>
          <td>${escapeHtml(m.nombre) || '—'}</td>
          <td style="white-space:nowrap">${escapeHtml(m.turno) || '—'}</td>
          <td>${escapeHtml(m.alimentos) || '—'}</td>
          <td>${escapeHtml(m.servicio) || '—'}</td>
          <td>${escapeHtml(m.descripcion) || '—'}</td>
          <td class="num">${money(m.monto)}</td>
        </tr>`).join('') + filaTotales(he, 8)}
    </tbody>
  </table>`;

  // ── Anticipos y Gastos Diversos comparten estructura ──
  const tablaNombreConcepto = (cat: string, etiquetaConcepto: string, mensajeVacio: string) => {
    const rows = deCategoria(cat);
    return `<table class="data">
      <thead><tr>
        <th style="width:70px">Medio</th><th style="width:66px">Fecha</th><th style="width:190px">Nombre</th>
        <th>${etiquetaConcepto}</th><th style="width:78px;text-align:right">Importe</th>
      </tr></thead>
      <tbody>
        ${rows.length === 0 ? vacia(5, mensajeVacio)
          : rows.map((m, i) => `<tr${i % 2 === 0 ? '' : ' style="background:#f5f7fb"'}>
            <td>${escapeHtml(m.medio_pago) || '—'}</td>
            <td style="white-space:nowrap">${fmtFecha(m.fecha)}</td>
            <td>${escapeHtml(m.nombre) || '—'}</td>
            <td>${escapeHtml(m.descripcion) || '—'}</td>
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
  <table class="data">
    <thead><tr>
      <th style="width:80px">Medio</th><th style="width:70px">Fecha</th><th>Concepto</th><th style="width:90px;text-align:right">Importe</th>
    </tr></thead>
    <tbody>
      ${ing.length === 0 ? vacia(4, 'Sin ingresos en el periodo.')
        : ing.map((m, i) => `<tr${i % 2 === 0 ? '' : ' style="background:#f5f7fb"'}>
          <td>${escapeHtml(m.medio_pago) || '—'}</td>
          <td style="white-space:nowrap">${fmtFecha(m.fecha)}</td>
          <td>${escapeHtml(m.descripcion) || '—'}</td>
          <td class="num">${money(m.monto)}</td>
        </tr>`).join('') + filaTotales(ing, 3)}
    </tbody>
  </table>`;

  // ── Traspasos ──
  const tras = deCategoria(CAT_TRASPASO);
  const seccionTraspasos = !incluye(CAT_TRASPASO) || tras.length === 0 ? '' : `
  ${titulo('Traspasos entre medios de pago')}
  <table class="data">
    <thead><tr>
      <th style="width:70px">Fecha</th><th style="width:90px">Sale de</th><th>Concepto</th><th style="width:90px;text-align:right">Importe</th>
    </tr></thead>
    <tbody>
      ${tras.filter((m) => !esIngreso(m)).map((m, i) => `<tr${i % 2 === 0 ? '' : ' style="background:#f5f7fb"'}>
        <td style="white-space:nowrap">${fmtFecha(m.fecha)}</td>
        <td>${escapeHtml(m.medio_pago) || '—'}</td>
        <td>${escapeHtml(m.descripcion) || '—'}</td>
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
      <table class="data compact">
        <thead><tr><th style="width:70px">Fecha</th><th style="text-align:right">Tarjeta</th><th style="text-align:right">Efectivo</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>
          ${fechas.length === 0 ? vacia(4, 'Sin egresos.')
            : fechas.map(([f, v], i) => `<tr${i % 2 === 0 ? '' : ' style="background:#f5f7fb"'}>
              <td style="white-space:nowrap">${fmtFecha(f)}</td>
              <td class="num">${v.TARJETA ? money(v.TARJETA) : '—'}</td>
              <td class="num">${v.EFECTIVO ? money(v.EFECTIVO) : '—'}</td>
              <td class="num">${money(v.TARJETA + v.EFECTIVO)}</td>
            </tr>`).join('')}
          <tr class="totales">
            <td style="text-align:right">Total general</td>
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
  <div class="two-col" style="margin-bottom:12px">
    <div class="summary-box">
      <div class="row"><span>Fondo total disponible</span><b>${money(existencia)}</b></div>
      <div class="row"><span>Egresos con tarjeta</span><b>${money(totalEgresoTarjeta)}</b></div>
      <div class="row"><span>Egresos en efectivo</span><b>${money(totalEgresoEfectivo)}</b></div>
      <div class="row"><span><b>Total de egresos</b></span><b>${money(egresos)}</b></div>
    </div>
    <div class="summary-box">
      <div class="row"><span>H.E. y dobletes</span><b>${money(deCategoria(CAT_HE).reduce((a, m) => a + m.monto, 0))}</b></div>
      <div class="row"><span>Anticipos</span><b>${money(deCategoria(CAT_ANTICIPOS).reduce((a, m) => a + m.monto, 0))}</b></div>
      <div class="row"><span>Gastos diversos</span><b>${money(deCategoria(CAT_GASTOS).reduce((a, m) => a + m.monto, 0))}</b></div>
    </div>
  </div>
  ${[CAT_HE, CAT_ANTICIPOS, CAT_GASTOS].map(bloqueConciliacion).join('')}`;

  return `<!doctype html><html lang="es"><head><meta charset="UTF-8"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{padding:${repeating ? '4px 4px' : '32px 40px'}}
  .header-inline{display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:2px solid #16357a;padding-bottom:14px;margin-bottom:16px}
  .header-inline img{width:58px;height:58px;object-fit:contain;flex-shrink:0}
  .header-inline .razon{font-size:12.5px;font-weight:800;color:#16357a}
  .header-inline .datos{font-size:8.5px;color:#374151;margin-top:3px;line-height:1.5}
  .header-inline .empresa{text-align:right;flex:1}
  .footer-inline{display:flex;align-items:center;justify-content:space-between;gap:6px;border-top:1px solid #e5e7eb;padding-top:8px;margin-top:24px;font-size:8px;color:#6b7280}
  .footer-inline img{width:14px;height:14px;object-fit:contain}
  .footer-inline .brand{display:flex;align-items:center;gap:5px;font-weight:700;letter-spacing:.3px}

  .doc-title{text-align:center;margin:4px 0 16px 0}
  .doc-title h1{font-size:18px;font-weight:800;color:#16357a;letter-spacing:.5px;text-transform:uppercase}
  .doc-title .sub{font-size:9.5px;color:#6b7280;margin-top:4px}

  .meta-bar{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;background:#eef2f9;border:1px solid #dbe2ef;border-radius:6px;padding:8px 12px;font-size:9.5px;color:#374151;margin-bottom:18px}
  .meta-bar b{color:#16357a}

  /* Cada sección arranca en hoja nueva. Antes encadenaban una tras otra y una
     tabla podía empezar con 175px de hoja libre: dos filas y salto. Se prefiere
     el espacio en blanco al final de la hoja anterior. */
  h2.section{font-size:12px;font-weight:800;color:#16357a;text-transform:uppercase;letter-spacing:.4px;margin:20px 0 10px 0;padding-bottom:5px;border-bottom:1.5px solid #16357a;
    page-break-after:avoid;break-after:avoid;page-break-before:always;break-before:page}
  /* …salvo la primera, que no debe empujar una hoja en blanco al inicio. */
  h2.section:first-of-type{page-break-before:auto;break-before:auto}

  .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
  .kpi{border:1px solid #dbe2ef;border-radius:8px;padding:12px 10px;text-align:center;background:#fff}
  .kpi-val{font-size:17px;font-weight:800;line-height:1.15}
  .kpi-lbl{font-size:8px;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-top:6px;font-weight:600}

  /* Tira de cifras que encabeza el consolidado */
  .tira-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px}
  .tira{border:1px solid #dbe2ef;border-radius:6px;padding:8px 10px;background:#fafbfd}
  .tira-lbl{font-size:7.5px;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;font-weight:600}
  .tira-val{font-size:13px;font-weight:800;margin-top:2px}

  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}
  .summary-box{border:1px solid #dbe2ef;border-radius:8px;padding:12px;background:#fafbfd}
  .summary-box .row{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px dashed #e5e7eb;font-size:10px}
  .summary-box .row:last-child{border-bottom:none}
  .summary-box .row b{color:#16357a;white-space:nowrap}

  table.data{width:100%;border-collapse:collapse;margin-top:4px}
  table.data thead tr{background:#16357a;color:#fff}
  table.data th{padding:6px 7px;font-size:8px;font-weight:700;text-align:left;text-transform:uppercase;letter-spacing:.3px}
  table.data td{padding:4.5px 7px;border-bottom:1px solid #e5e7eb;font-size:8.5px;vertical-align:top}
  table.data thead{display:table-header-group}
  /* Una fila nunca se parte a la mitad; si no cabe, baja entera a la hoja siguiente */
  table.data tr{page-break-inside:avoid;break-inside:avoid}
  table.data td{break-inside:avoid}
  /* La fila de totales viaja pegada a las filas que suma */
  tr.totales{page-break-before:avoid;break-before:avoid}
  /* La tira de cifras encabeza su tabla: no debe quedarse sola al pie */
  .tira-grid{page-break-after:avoid;break-after:avoid;page-break-inside:avoid;break-inside:avoid}
  table.data td.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  table.compact td{padding:3.5px 6px;font-size:8px}
  tr.totales{background:#eef2f9!important}
  tr.totales td{font-size:8.5px;border-top:1.5px solid #16357a;border-bottom:none}
  tr.previo td{background:#f5f7fb;color:#6b7280;font-style:italic}
  .tag{display:inline-block;padding:1px 6px;border-radius:9px;border:1px solid #dbe2ef;background:#eef2f9;color:#16357a;font-size:7.5px;font-weight:700;white-space:nowrap}

  /* Cuatro columnas de cifras no necesitan el ancho completo de la hoja: a página
     entera el ojo tiene que recorrer demasiado entre la fecha y su importe. */
  .conc-box{margin-bottom:14px;page-break-inside:avoid;max-width:440px}
  .conc-head{font-size:9.5px;font-weight:800;color:#16357a;margin-bottom:2px}

  .firma{margin-top:40px;display:flex;justify-content:space-between;gap:40px;page-break-inside:avoid}
  .firma .box{flex:1;text-align:center}
  .firma .line{border-top:1px solid #111;margin-top:40px;padding-top:5px;font-size:9.5px}
  .firma .line b{display:block;font-size:10px}
  .firma .line span{color:#6b7280;font-size:8.5px}

  .note{font-size:8px;color:#9ca3af;margin-top:10px;text-align:justify;font-style:italic}
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
    <h1>Reporte de ${escapeHtml(data.libroNombre)}</h1>
    <div class="sub">Control de ingresos y egresos · del ${fmtFecha(data.desde)} al ${fmtFecha(data.hasta)}</div>
  </div>

  <div class="meta-bar">
    <span><b>Periodo:</b> ${fmtFecha(data.desde)} – ${fmtFecha(data.hasta)}</span>
    <span><b>Responsable:</b> ${escapeHtml(data.responsable) || '—'}</span>
    <span><b>Generado por:</b> ${escapeHtml(data.generadoPor) || '—'}</span>
    <span><b>Emisión:</b> ${fmtFechaLarga(data.fecha)}</span>
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
    <div class="box"><div class="line"><b>${escapeHtml(data.responsable) || '________________________'}</b><span>Responsable de la cuenta</span></div></div>
    <div class="box"><div class="line"><b>________________________</b><span>Revisó / Autorizó</span></div></div>
  </div>

  ${!repeating ? `<div class="footer-inline">
    <span class="brand"><img src="${logoSrc}" alt="" /> U3 SEGURIDAD PRIVADA</span>
    <span>Documento confidencial · Uso interno</span>
  </div>` : ''}
  </div>
</body></html>`;
}
