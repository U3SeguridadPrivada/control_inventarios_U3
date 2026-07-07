import { COMPANY, COTIZACION_DEFAULTS } from './company';

export interface CotizacionItemDraft {
  descripcion: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
}

export interface CotizacionDraft {
  folio: string;
  fecha: string;
  clienteNombre: string;
  solicitante: string;
  atencion: string;
  servicio_cotizado: string;
  ubicacion?: string;
  periodicidad: string;
  items: CotizacionItemDraft[];
  vigencia_dias: number;
  asesor_nombre: string;
  asesor_puesto: string;
  notas?: string | null;
  estado?: string;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fmtMoney(n: number): string {
  return `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtFechaLarga(fechaISO: string): string {
  if (!fechaISO) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(fechaISO) ? new Date(`${fechaISO}T00:00:00`) : new Date(fechaISO);
  if (isNaN(d.getTime())) return fechaISO;
  const mes = MESES[d.getMonth()];
  return `${d.getDate()} de ${mes.charAt(0).toUpperCase()}${mes.slice(1)} del ${d.getFullYear()}`;
}

export function calcularTotales(items: CotizacionItemDraft[]) {
  const subtotal = items.reduce((acc, it) => acc + (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0), 0);
  const iva = Math.round(subtotal * 0.16 * 100) / 100;
  const total = Math.round((subtotal + iva) * 100) / 100;
  return { subtotal: Math.round(subtotal * 100) / 100, iva, total };
}

function escapeHtml(s: string | undefined | null): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * HTML del encabezado (logo + datos de la empresa + folio) para usarse como
 * `headerTemplate` nativo de Puppeteer, repetido en cada página del PDF. Puppeteer
 * renderiza esto en un frame aparte sin la hoja de estilos del documento, por lo que
 * todo va con estilos inline y tamaños de fuente explícitos.
 */
export function buildCotizacionHeaderTemplate(logoSrc: string): string {
  return `<div style="width:100%;font-family:Arial,Helvetica,sans-serif;font-size:8.5px;color:#111;padding:0 25mm 14px 25mm;display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1.5px solid #16357a;box-sizing:border-box;">
    <img src="${logoSrc}" style="width:34px;height:34px;object-fit:contain;flex-shrink:0;" />
    <div style="flex:1;text-align:right;max-width:550px;margin-left:auto;">
      <div style="font-size:10px;font-weight:800;color:#16357a;">${COMPANY.razonSocial}</div>
      <div style="font-size:7.5px;color:#374151;margin-top:3.5px;line-height:1.3;text-align:right;">
        ${COMPANY.domicilio}<br/>
        Tel: ${COMPANY.telefono}. CDMX Permiso DGSPyCI: ${COMPANY.permisoDGSPyCI}; Expediente: ${COMPANY.expediente}. ${COMPANY.web}
      </div>
    </div>
  </div>`;
}

/** Pie de página nativo de Puppeteer, repetido en cada página. */
export function buildCotizacionFooterTemplate(logoSrc: string): string {
  return `<div style="width:100%;font-family:Arial,Helvetica,sans-serif;font-size:7.5px;color:#6b7280;padding:0 25mm;display:flex;align-items:center;justify-content:flex-end;gap:5px;border-top:1px solid #e5e7eb;box-sizing:border-box;">
    <img src="${logoSrc}" style="width:11px;height:11px;object-fit:contain;" />
    <span style="font-weight:700;letter-spacing:.3px;">U3 SEGURIDAD PRIVADA</span>
  </div>`;
}

/**
 * Genera el HTML del cuerpo de la cotización en el formato oficial de U3. Se usa tanto
 * para la vista previa (fallback en navegador) como para el PDF final (Puppeteer), para
 * garantizar que ambos sean visualmente idénticos. `logoSrc` se pasa por separado porque
 * en el navegador es una ruta pública y en el servidor es un data URI base64.
 *
 * Cuando `repeatingHeaderFooter` es true (PDF real vía Puppeteer), el encabezado/pie
 * NO se incluyen en el cuerpo — Puppeteer los dibuja por separado en cada página con
 * `headerTemplate`/`footerTemplate` (ver funciones arriba). Cuando es false (vista previa
 * en el navegador, o el respaldo con html2canvas que no soporta encabezados nativos por
 * página), se incluyen una sola vez al inicio/fin del documento.
 */
export function buildCotizacionHtml(draft: CotizacionDraft, logoSrc: string, opts?: { repeatingHeaderFooter?: boolean }): string {
  const { subtotal, iva, total } = calcularTotales(draft.items);
  const periodicidadUpper = (draft.periodicidad || COTIZACION_DEFAULTS.periodicidad).toUpperCase();
  const vigenciaDias = draft.vigencia_dias || COTIZACION_DEFAULTS.vigenciaDias;
  const formaPagoTexto = COTIZACION_DEFAULTS.formaPago.replace('{PERIODICIDAD}', (draft.periodicidad || COTIZACION_DEFAULTS.periodicidad).toLowerCase());
  const introUbicacion = ` para sus diferentes instalaciones ubicadas en las inmediaciones de ${escapeHtml(draft.ubicacion)}.`;

  const itemsRows = draft.items.map((it, i) => {
    const totalItem = (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0);
    return `<tr${i % 2 === 0 ? '' : ' style="background:#eef2f9"'}>
      <td style="text-align:center;width:40px">${it.cantidad}</td>
      <td>${escapeHtml(it.descripcion)}</td>
      <td style="text-align:center;width:90px">${escapeHtml(it.unidad)}</td>
      <td style="text-align:right;width:110px">${fmtMoney(Number(it.precio_unitario))}</td>
      <td style="text-align:right;width:110px">${fmtMoney(totalItem)}</td>
    </tr>`;
  }).join('');

  const repeating = !!opts?.repeatingHeaderFooter;

  return `<!doctype html><html lang="es"><head><meta charset="UTF-8"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:#111;line-height:1.45}
  .header-inline{display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:2px solid #16357a;padding-bottom:16px;margin-bottom:18px}
  .header-inline img{width:64px;height:64px;object-fit:contain;flex-shrink:0}
  .header-inline .razon{font-size:13px;font-weight:800;color:#16357a}
  .header-inline .datos{font-size:9.5px;color:#374151;margin-top:3px;line-height:1.5}
  .header-inline .empresa{text-align:right;flex:1}
  .folio-line{text-align:right;font-size:9px;color:#6b7280;margin:6px 0 14px 0}
  .folio-line b{font-family:monospace;font-size:10.5px;font-weight:700;color:#16357a;letter-spacing:.5px}
  .footer-inline{display:flex;align-items:center;justify-content:flex-end;gap:6px;border-top:1px solid #e5e7eb;padding-top:8px;margin-top:20px}
  .footer-inline img{width:16px;height:16px;object-fit:contain}
  .footer-inline span{font-size:8.5px;color:#6b7280;font-weight:700;letter-spacing:.3px}
  .page{padding:${repeating ? '4px 4px' : '40px 55px'}}
  .fecha{margin-bottom:14px;font-weight:700}
  .meta{margin-bottom:14px;font-weight:700}
  .meta div{margin-bottom:2px}
  .meta b{display:inline-block;width:120px;font-weight:700}
  p.intro{margin-bottom:14px;text-align:justify}
  h2.title{font-size:12.5px;font-weight:800;color:#16357a;margin-bottom:8px;text-transform:uppercase}
  table.items{width:100%;border-collapse:collapse;margin-bottom:4px}
  table.items thead tr{background:#16357a;color:#fff}
  table.items th{padding:7px 8px;font-size:10px;font-weight:700;text-align:left;text-transform:uppercase}
  table.items td{padding:6px 8px;border-bottom:1px solid #dbe2ef;font-size:11px}
  table.items td:nth-child(2){text-align:justify}
  table.totales{width:100%;border-collapse:collapse;margin-bottom:16px}
  table.totales td{padding:6px 8px;border:1px solid #dbe2ef;font-size:11px}
  table.totales td:first-child{background:#eef2f9;font-weight:700;width:80%}
  table.totales td:last-child{text-align:right;font-weight:700}
  table.totales tr.total td{background:#16357a;color:#fff;font-size:12.5px}
  p.justify{text-align:justify;margin-bottom:14px}
  ul.checklist{list-style:none;margin-bottom:14px}
  ul.checklist li{position:relative;padding-left:18px;margin-bottom:5px;text-align:justify}
  ul.checklist li:before{content:"\\2713";position:absolute;left:0;color:#16357a;font-weight:800}
  h3.section{font-size:11.5px;font-weight:800;color:#16357a;margin:16px 0 6px 0;text-transform:uppercase}
  .firma{margin-top:40px}
  .firma .nombre{font-weight:800;margin-top:30px}
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
  <div class="folio-line">Folio: <b>${escapeHtml(draft.folio)}</b></div>

  <p class="fecha">Ciudad de México, a ${fmtFechaLarga(draft.fecha)}.</p>

  <div class="meta">
    <div><b>Solicitante:</b> ${escapeHtml(draft.solicitante || draft.clienteNombre)}</div>
    <div><b>Atención:</b> ${escapeHtml(draft.atencion || draft.clienteNombre)}</div>
    <div><b>Servicio cotizado:</b> ${escapeHtml(draft.servicio_cotizado)}</div>
  </div>

  <p class="intro">En atención a su solicitud, pongo a su consideración nuestra <b>Propuesta económica de Servicios de Seguridad Privada y Vigilancia</b>${introUbicacion}</p>

  <h2 class="title">Propuesta económica</h2>
  <table class="items">
    <thead><tr><th>Cant</th><th>Descripción del servicio</th><th>Unidad</th><th>Unitario ${periodicidadUpper}</th><th>Total ${periodicidadUpper}</th></tr></thead>
    <tbody>${itemsRows}</tbody>
  </table>
  <table class="totales">
    <tr><td>Subtotal</td><td>${fmtMoney(subtotal)}</td></tr>
    <tr><td>IVA</td><td>${fmtMoney(iva)}</td></tr>
    <tr class="total"><td>Total</td><td>${fmtMoney(total)}</td></tr>
  </table>

  <p class="justify">La propuesta incluye los gastos directos e indirectos que se generen por la prestación del servicio, el pago de las prestaciones mínimas de Ley a los elementos de seguridad (IMSS, INFONAVIT, ahorro para el retiro, aguinaldo, vacaciones y prima vacacional correspondiente, etc.), uniformes y equipo de trabajo.</p>

  <p style="margin-bottom:6px"><b>Incluye además y en comodato:</b></p>
  <ul class="checklist">
    ${COTIZACION_DEFAULTS.comodato.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}
  </ul>
  <p class="justify">Todo lo anterior para mantener comunicación directa e inmediata entre los puestos de control, el responsable de la seguridad interna y los mandos de U3.</p>

  <h3 class="section">I. Forma de pago</h3>
  <p class="justify">${escapeHtml(formaPagoTexto)}</p>

  <h3 class="section">II. Vigencia de la cotización</h3>
  <p class="justify">Las tarifas estarán vigentes a partir de la fecha de la presente cotización y hasta por ${vigenciaDias} días naturales.</p>

  <h3 class="section" style="page-break-before:always;margin-top:0">III. Los beneficios de contratar nuestros servicios</h3>
  <ul class="checklist">
    ${COTIZACION_DEFAULTS.beneficios.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}
  </ul>

  <h3 class="section">IV. Generales</h3>
  <ul class="checklist">
    <li><b>${COMPANY.razonSocial}</b>, es una Sociedad Anónima de Capital Variable constituida en ${COMPANY.fechaConstitucion} con RFC: ${COMPANY.rfc} con domicilio en ${COMPANY.domicilioFiscal}</li>
    <li>Nos encontramos debidamente registrados ante la Secretaría del Trabajo y Previsión Social con el número de registro ${COMPANY.registroSTPS} y folio de actividad ${COMPANY.folioRepse}, quedando inscritos en el Padrón Público de Contratistas de Servicios Especializados u Obras Especializadas (Repse).</li>
    <li>Contamos con la autorización de la Secretaría de Seguridad Ciudadana de la Ciudad de México, bajo el Permiso: ${COMPANY.permisoDGSPyCI}; Expediente: ${COMPANY.expediente}.</li>
  </ul>
  <p class="justify">Nuestro objeto social es la prestación de servicios de vigilancia y seguridad privada en los <b>BIENES</b> para toda clase de inmuebles, comercios, industrias, residencias, etc., así como para el <b>TRASLADO DE BIENES Y MERCANCÍAS</b> y la venta e instalación de equipos y sistemas de <b>SEGURIDAD ELECTRÓNICA</b> tales como Circuitos Cerrados de Televisión, Controles de Acceso, Video porteros o cualquier dispositivo electrónico relacionado con la seguridad.</p>
  <p class="justify">Estamos preparados y capacitados para brindar servicios en los ramos: ${COTIZACION_DEFAULTS.ramos}</p>
  <p class="justify">De vernos favorecidos con su decisión, nuestro compromiso de montaje del servicio sería de <b>${COTIZACION_DEFAULTS.montajeDias}</b> días naturales posteriores a la firma del(os) contrato(s) correspondiente(s).</p>

  ${draft.notas ? `<p class="justify"><b>Notas:</b> ${escapeHtml(draft.notas)}</p>` : ''}

  <p style="margin-top:20px">Reciba nuestros saludos.</p>
  <div class="firma">
    <p style="font-weight:800">ATENTAMENTE</p>
    <p class="nombre">${escapeHtml(draft.asesor_nombre || '').toUpperCase()}</p>
    <p>${escapeHtml(draft.asesor_puesto || COTIZACION_DEFAULTS.asesorPuesto)}</p>
  </div>
  ${!repeating ? `<div class="footer-inline"><img src="${logoSrc}" alt="U3" /><span>U3 SEGURIDAD PRIVADA</span></div>` : ''}
  </div>
</body></html>`;
}
