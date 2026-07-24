import { COMPANY } from './company';

export interface ReporteCandidato {
  nombre: string | null;
  telefono: string;
  ciudad: string | null;
  edad: number | null;
  vacante_puesto: string | null;
  etapa: string;
  fecha_entrevista: string | null;
  origen: string | null;
  created_at: string | null;
}

export interface ReporteVacante {
  puesto: string;
  ubicacion: string | null;
  turno: string | null;
  sueldo: string | null;
  activa: number;
}

export interface ReporteReclutamientoData {
  candidatos: ReporteCandidato[];
  vacantes: ReporteVacante[];
  generadoPor: string;
  fecha: string; // ISO
}

export const ETAPAS_REPORTE = ['Nuevo', 'Contactado', 'Documentos', 'Entrevista', 'Contratado', 'Rechazado'] as const;

const ETAPA_HEX: Record<string, string> = {
  Nuevo: '#0284c7',
  Contactado: '#d97706',
  Documentos: '#7c3aed',
  Entrevista: '#2563eb',
  Contratado: '#059669',
  Rechazado: '#e11d48',
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fmtFechaLarga(fechaISO: string): string {
  if (!fechaISO) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(fechaISO) ? new Date(`${fechaISO}T00:00:00`) : new Date(fechaISO);
  if (isNaN(d.getTime())) return fechaISO;
  const mes = MESES[d.getMonth()];
  return `${d.getDate()} de ${mes.charAt(0).toUpperCase()}${mes.slice(1)} del ${d.getFullYear()}`;
}

function fmtFechaCorta(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtFechaHora(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(s: string | undefined | null): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function calcularEstadisticas(candidatos: ReporteCandidato[]) {
  const total = candidatos.length;
  const porEtapa: Record<string, number> = {};
  for (const et of ETAPAS_REPORTE) porEtapa[et] = 0;
  for (const c of candidatos) porEtapa[c.etapa] = (porEtapa[c.etapa] ?? 0) + 1;

  const contratados = porEtapa['Contratado'] ?? 0;
  const rechazados = porEtapa['Rechazado'] ?? 0;
  const enProceso = total - contratados - rechazados;
  const evaluados = contratados + rechazados;
  const tasaConversion = total > 0 ? (contratados / total) * 100 : 0;
  const tasaEfectividad = evaluados > 0 ? (contratados / evaluados) * 100 : 0;

  return { total, porEtapa, contratados, rechazados, enProceso, evaluados, tasaConversion, tasaEfectividad };
}

/** Encabezado repetido en cada página (mecanismo nativo de Puppeteer, estilos inline). */
export function buildReporteHeaderTemplate(logoSrc: string): string {
  return `<div style="width:100%;font-family:Arial,Helvetica,sans-serif;color:#111;padding:0 18mm 10px 18mm;display:flex;align-items:center;justify-content:space-between;gap:14px;border-bottom:1.5px solid #16357a;box-sizing:border-box;">
    <img src="${logoSrc}" style="width:30px;height:30px;object-fit:contain;flex-shrink:0;" />
    <div style="flex:1;text-align:right;">
      <div style="font-size:9.5px;font-weight:800;color:#16357a;letter-spacing:.3px;">INFORME DE RECLUTAMIENTO</div>
      <div style="font-size:7px;color:#6b7280;margin-top:2px;">${COMPANY.razonSocial}</div>
    </div>
  </div>`;
}

/** Pie de página repetido en cada página, con numeración. */
export function buildReporteFooterTemplate(logoSrc: string): string {
  return `<div style="width:100%;font-family:Arial,Helvetica,sans-serif;font-size:7px;color:#6b7280;padding:0 18mm;display:flex;align-items:center;justify-content:space-between;gap:6px;border-top:1px solid #e5e7eb;box-sizing:border-box;">
    <span style="display:flex;align-items:center;gap:4px;"><img src="${logoSrc}" style="width:10px;height:10px;object-fit:contain;" /><span style="font-weight:700;letter-spacing:.3px;">U3 SEGURIDAD PRIVADA</span></span>
    <span>Documento confidencial · Uso interno</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>`;
}

/**
 * Genera el HTML del informe de reclutamiento con el formato institucional de U3.
 * Se usa tanto para el PDF real (Puppeteer, con `repeatingHeaderFooter: true`) como
 * para el respaldo en el navegador (html2canvas, encabezado/pie incrustados una vez).
 * `logoSrc` es una ruta pública en el navegador y un data URI base64 en el servidor.
 */
export function buildReporteReclutamientoHtml(
  data: ReporteReclutamientoData,
  logoSrc: string,
  opts?: { repeatingHeaderFooter?: boolean },
): string {
  const repeating = !!opts?.repeatingHeaderFooter;
  const stats = calcularEstadisticas(data.candidatos);
  const vacantesActivas = data.vacantes.filter((v) => v.activa === 1);
  const vacantesCerradas = data.vacantes.length - vacantesActivas.length;

  const maxEtapa = Math.max(1, ...ETAPAS_REPORTE.map((et) => stats.porEtapa[et] ?? 0));

  const funnelRows = ETAPAS_REPORTE.map((et) => {
    const n = stats.porEtapa[et] ?? 0;
    const pct = stats.total > 0 ? (n / stats.total) * 100 : 0;
    const barW = (n / maxEtapa) * 100;
    const color = ETAPA_HEX[et];
    return `<div class="funnel-row">
      <div class="funnel-label"><span class="dot" style="background:${color}"></span>${et}</div>
      <div class="funnel-track"><div class="funnel-bar" style="width:${barW.toFixed(1)}%;background:${color}"></div></div>
      <div class="funnel-val">${n} <span class="funnel-pct">(${pct.toFixed(0)}%)</span></div>
    </div>`;
  }).join('');

  // Candidatos ordenados: más recientes primero
  const candidatosOrdenados = [...data.candidatos].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  const candidatosRows = candidatosOrdenados.length === 0
    ? `<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:14px">Sin candidatos registrados en el periodo.</td></tr>`
    : candidatosOrdenados.map((c, i) => {
        const color = ETAPA_HEX[c.etapa] ?? '#6b7280';
        return `<tr${i % 2 === 0 ? '' : ' style="background:#f5f7fb"'}>
          <td>${escapeHtml(c.nombre) || '<span style="color:#9ca3af">Sin nombre</span>'}</td>
          <td style="white-space:nowrap">${escapeHtml(c.telefono)}</td>
          <td>${escapeHtml(c.ciudad) || '—'}</td>
          <td>${escapeHtml(c.vacante_puesto) || '—'}</td>
          <td><span class="pill" style="color:${color};border-color:${color}33;background:${color}14">${escapeHtml(c.etapa)}</span></td>
          <td style="white-space:nowrap">${fmtFechaHora(c.fecha_entrevista)}</td>
          <td style="white-space:nowrap">${fmtFechaCorta(c.created_at)}</td>
        </tr>`;
      }).join('');

  const vacantesRows = vacantesActivas.length === 0
    ? `<tr><td colspan="4" style="text-align:center;color:#9ca3af;padding:14px">No hay vacantes activas.</td></tr>`
    : vacantesActivas.map((v, i) => `<tr${i % 2 === 0 ? '' : ' style="background:#f5f7fb"'}>
        <td><b>${escapeHtml(v.puesto)}</b></td>
        <td>${escapeHtml(v.ubicacion) || '—'}</td>
        <td>${escapeHtml(v.turno) || '—'}</td>
        <td>${escapeHtml(v.sueldo) || '—'}</td>
      </tr>`).join('');

  const kpi = (valor: string | number, etiqueta: string, color: string) => `<div class="kpi">
    <div class="kpi-val" style="color:${color}">${valor}</div>
    <div class="kpi-lbl">${etiqueta}</div>
  </div>`;

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

  h2.section{font-size:12px;font-weight:800;color:#16357a;text-transform:uppercase;letter-spacing:.4px;margin:20px 0 10px 0;padding-bottom:5px;border-bottom:1.5px solid #16357a}

  .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:6px}
  .kpi{border:1px solid #dbe2ef;border-radius:8px;padding:12px 10px;text-align:center;background:#fff}
  .kpi-val{font-size:22px;font-weight:800;line-height:1}
  .kpi-lbl{font-size:8px;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-top:6px;font-weight:600}

  .two-col{display:grid;grid-template-columns:1.15fr .85fr;gap:20px;align-items:start}

  .funnel-row{display:flex;align-items:center;gap:8px;margin-bottom:7px}
  .funnel-label{width:82px;flex-shrink:0;font-size:9.5px;font-weight:600;display:flex;align-items:center;gap:5px}
  .funnel-label .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
  .funnel-track{flex:1;background:#eef2f9;border-radius:4px;height:15px;overflow:hidden}
  .funnel-bar{height:100%;border-radius:4px;min-width:2px}
  .funnel-val{width:56px;flex-shrink:0;text-align:right;font-size:9.5px;font-weight:700}
  .funnel-val .funnel-pct{font-weight:400;color:#9ca3af;font-size:8.5px}

  .summary-box{border:1px solid #dbe2ef;border-radius:8px;padding:14px;background:#fafbfd}
  .summary-box .row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dashed #e5e7eb;font-size:10px}
  .summary-box .row:last-child{border-bottom:none}
  .summary-box .row b{color:#16357a}

  table.data{width:100%;border-collapse:collapse;margin-top:4px}
  table.data thead tr{background:#16357a;color:#fff}
  table.data th{padding:7px 8px;font-size:8.5px;font-weight:700;text-align:left;text-transform:uppercase;letter-spacing:.3px}
  table.data td{padding:5.5px 8px;border-bottom:1px solid #e5e7eb;font-size:9.5px;vertical-align:top}
  .pill{display:inline-block;padding:1.5px 8px;border-radius:10px;border:1px solid;font-size:8.5px;font-weight:700;white-space:nowrap}

  .firma{margin-top:44px;display:flex;justify-content:space-between;gap:40px}
  .firma .box{flex:1;text-align:center}
  .firma .line{border-top:1px solid #111;margin-top:44px;padding-top:5px;font-size:9.5px}
  .firma .line b{display:block;font-size:10px}
  .firma .line span{color:#6b7280;font-size:8.5px}

  .note{font-size:8px;color:#9ca3af;margin-top:16px;text-align:justify;font-style:italic}
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
    <h1>Informe de Reclutamiento y Selección</h1>
    <div class="sub">Reporte del pipeline de candidatos y vacantes activas</div>
  </div>

  <div class="meta-bar">
    <span><b>Fecha de emisión:</b> ${fmtFechaLarga(data.fecha)}</span>
    <span><b>Generado por:</b> ${escapeHtml(data.generadoPor) || '—'}</span>
    <span><b>Total de candidatos:</b> ${stats.total}</span>
  </div>

  <h2 class="section">1. Resumen ejecutivo</h2>
  <div class="kpi-grid">
    ${kpi(stats.total, 'Candidatos totales', '#16357a')}
    ${kpi(stats.enProceso, 'En proceso', '#2563eb')}
    ${kpi(stats.contratados, 'Contratados', '#059669')}
    ${kpi(stats.rechazados, 'Rechazados', '#e11d48')}
  </div>
  <div class="kpi-grid" style="margin-top:10px">
    ${kpi(vacantesActivas.length, 'Vacantes activas', '#16357a')}
    ${kpi(vacantesCerradas, 'Vacantes cerradas', '#6b7280')}
    ${kpi(`${stats.tasaConversion.toFixed(0)}%`, 'Tasa de conversión', '#059669')}
    ${kpi(`${stats.tasaEfectividad.toFixed(0)}%`, 'Efectividad de selección', '#7c3aed')}
  </div>

  <h2 class="section">2. Distribución del pipeline</h2>
  <div class="two-col">
    <div>
      ${funnelRows}
    </div>
    <div class="summary-box">
      ${ETAPAS_REPORTE.map((et) => `<div class="row"><span>${et}</span><b>${stats.porEtapa[et] ?? 0}</b></div>`).join('')}
      <div class="row" style="margin-top:4px;border-top:1.5px solid #16357a;padding-top:7px"><span style="font-weight:700">Total</span><b>${stats.total}</b></div>
    </div>
  </div>

  <h2 class="section" style="page-break-before:always">3. Detalle de candidatos</h2>
  <table class="data">
    <thead><tr>
      <th>Candidato</th><th>Teléfono</th><th>Ciudad</th><th>Vacante</th><th>Etapa</th><th>Entrevista</th><th>Registro</th>
    </tr></thead>
    <tbody>${candidatosRows}</tbody>
  </table>

  <h2 class="section">4. Vacantes activas</h2>
  <table class="data">
    <thead><tr>
      <th>Puesto</th><th>Zona / Ubicación</th><th>Turno</th><th>Sueldo</th>
    </tr></thead>
    <tbody>${vacantesRows}</tbody>
  </table>

  <div class="firma">
    <div class="box"><div class="line"><b>${escapeHtml(data.generadoPor) || '________________'}</b><span>Elaboró — Reclutamiento</span></div></div>
    <div class="box"><div class="line"><b>________________</b><span>Revisó — Recursos Humanos</span></div></div>
  </div>

  <p class="note">Documento generado automáticamente por el sistema de gestión de U3 Seguridad Privada. La información contenida es de carácter confidencial y para uso interno exclusivo. Los datos personales de los candidatos se tratan conforme a la normatividad aplicable en materia de protección de datos.</p>

  ${!repeating ? `<div class="footer-inline"><span class="brand"><img src="${logoSrc}" alt="U3" />U3 SEGURIDAD PRIVADA</span><span>Documento confidencial · Uso interno</span></div>` : ''}
  </div>
</body></html>`;
}
