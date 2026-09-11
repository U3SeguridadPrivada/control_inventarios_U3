import fs from 'fs';
import path from 'path';
import { desglosarDireccion } from './fichaTecnicaUtils';

export interface EmpleoAnterior {
  empresa: string;
  periodo: string;
  puesto: string;
}

export interface FichaTecnicaData {
  numeroElemento?: string;
  nombre: string;
  fotoUrl?: string | null;
  puesto?: string;
  // Datos Personales
  fechaNacimiento?: string;
  edad?: string;
  lugarNacimiento?: string;
  nacionalidad?: string;
  estadoCivil?: string;
  estudios?: string;
  rfc?: string;
  curp?: string;
  imss?: string;
  sexo?: string;
  estatura?: string;
  peso?: string;
  // Domicilio
  calleNumero?: string;
  colonia?: string;
  entreCalles?: string;
  cp?: string;
  delegacionMunicipio?: string;
  estado?: string;
  tiempoResidencia?: string;
  tiempoRadicarEstado?: string;
  telefonoEmergencia?: string;
  celular?: string;
  // Antecedentes Laborales
  empleos?: EmpleoAnterior[];
  // Pie
  fechaDocumento?: string;
}

function getBase64Image(relativePath: string): string {
  try {
    const fullPath = path.join(process.cwd(), 'public', relativePath);
    if (fs.existsSync(fullPath)) {
      const buf = fs.readFileSync(fullPath);
      return `data:image/png;base64,${buf.toString('base64')}`;
    }
  } catch (e) {
    console.error('Error loading image for ficha técnica:', relativePath, e);
  }
  return '';
}

export function generateFichaTecnicaHtml(data: FichaTecnicaData): string {
  const logoTop = getBase64Image('logos/u3-logo-ficha.png');
  const watermark = getBase64Image('logos/u3-watermark.png');
  const logoFooter = getBase64Image('logos/u3-footer-logo.png');

  const nombre = (data.nombre || '').toUpperCase().trim();
  const numElem = (data.numeroElemento || '').toUpperCase().trim();
  const puesto = (data.puesto || 'GUARDIA DE SEGURIDAD').toUpperCase().trim();
  const empleos = data.empleos && data.empleos.length > 0 ? data.empleos : [
    { empresa: '', periodo: '', puesto: '' },
    { empresa: '', periodo: '', puesto: '' },
  ];

  // Desglose inteligente de dirección si venía en un solo campo
  let calleNumero = (data.calleNumero || '').toUpperCase().trim();
  let colonia = (data.colonia || '').toUpperCase().trim();
  let delegacionMunicipio = (data.delegacionMunicipio || '').toUpperCase().trim();
  let estado = (data.estado || 'ESTADO DE MÉXICO').toUpperCase().trim();
  let cp = (data.cp || '').toUpperCase().trim();

  if (!colonia && !delegacionMunicipio && calleNumero && (calleNumero.includes(';') || /,\s*col/i.test(calleNumero))) {
    const desglose = desglosarDireccion(calleNumero);
    calleNumero = desglose.calleNumero;
    colonia = desglose.colonia;
    delegacionMunicipio = desglose.delegacionMunicipio;
    estado = desglose.estado || estado;
    cp = desglose.cp || cp;
  }

  // Fecha por defecto si no viene
  let fechaDoc = data.fechaDocumento;
  if (!fechaDoc) {
    const d = new Date();
    const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = meses[d.getMonth()];
    const anio = d.getFullYear();
    fechaDoc = `CIUDAD DE MÉXICO, A ${dia} DE ${mes} DEL ${anio}.`;
  }

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Ficha Técnica — ${nombre || numElem || 'Elemento'}</title>
  <style>
    @page {
      size: letter portrait;
      margin: 8mm 12mm 8mm 12mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
      font-size: 8.5pt;
      color: #0f172a;
      background: #fff;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .sheet {
      position: relative;
      width: 100%;
      max-width: 192mm;
      margin: 0 auto;
      background: #fff;
    }
    /* Marca de agua institucional de fondo */
    .watermark {
      position: absolute;
      top: 52%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 145mm;
      opacity: 0.12;
      pointer-events: none;
      z-index: 0;
    }
    .watermark img {
      width: 100%;
      height: auto;
      display: block;
    }
    .content {
      position: relative;
      z-index: 1;
    }

    /* Encabezado formal e institucional */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 2mm;
      margin-bottom: 2.5mm;
    }
    .header-logo {
      width: 22mm;
      flex-shrink: 0;
    }
    .header-logo img {
      width: 100%;
      height: auto;
      display: block;
    }
    .header-center {
      text-align: center;
      flex: 1;
      padding: 0 10px;
    }
    .header-empresa {
      font-size: 11pt;
      font-weight: 900;
      letter-spacing: 0.8px;
      color: #0f172a;
      text-transform: uppercase;
    }
    .header-title {
      font-size: 17pt;
      font-weight: 800;
      letter-spacing: 1.5px;
      color: #0f172a;
      margin: 0.5mm 0;
      text-decoration: underline;
    }
    .header-subtitle {
      font-size: 7.5pt;
      font-weight: 600;
      color: #475569;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    /* Foto */
    .photo-row {
      display: flex;
      justify-content: center;
      margin: 1.5mm 0 2.5mm 0;
    }
    .photo-frame {
      width: 32mm;
      height: 40mm;
      border: 1.5px solid #0f172a;
      box-shadow: 2px 3px 6px rgba(0, 0, 0, 0.15);
      background: #f8fafc;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .photo-frame img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .photo-placeholder {
      font-size: 7.5pt;
      color: #94a3b8;
      text-align: center;
      padding: 4px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    /* Nombre del Elemento con subrayado corporativo en rojo */
    .guard-name-box {
      text-align: center;
      margin-bottom: 2mm;
    }
    .guard-name {
      display: inline-block;
      font-size: 13pt;
      font-weight: 900;
      letter-spacing: 0.8px;
      color: #C00000;
      border-bottom: 2.5px solid #C00000;
      padding-bottom: 2px;
      min-width: 100mm;
      max-width: 168mm;
    }

    /* Recuadro Puesto */
    .puesto-table {
      margin: 0 auto 2.5mm auto;
      border-collapse: collapse;
      width: 60mm;
      table-layout: fixed;
    }
    .puesto-table td {
      border: 1.5px solid #0f172a;
      text-align: center;
      font-weight: bold;
    }
    .puesto-header {
      background-color: #DEEAF6 !important;
      font-size: 7.5pt;
      padding: 1.5px 0;
      letter-spacing: 0.5px;
      font-weight: 800;
      color: #1e293b;
    }
    .puesto-value {
      background-color: transparent !important;
      font-size: 8.5pt;
      padding: 2px 0;
      letter-spacing: 0.4px;
      font-weight: 800;
      color: #0f172a;
    }

    /* Título de sección formal */
    .section-title {
      font-size: 8.5pt;
      font-weight: 800;
      letter-spacing: 0.5px;
      margin: 2mm 0 1.2mm 0;
      text-transform: uppercase;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .section-title::after {
      content: "";
      flex: 1;
      height: 1px;
      background: #cbd5e1;
    }

    /* Tablas institucionales con celdas #DEEAF6 */
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-bottom: 2mm;
      border: 1.5px solid #0f172a;
    }
    table.data-table td {
      border: 1px solid #0f172a;
      padding: 2px 4.5px;
      font-size: 7.5pt;
      line-height: 1.18;
      vertical-align: middle;
      word-wrap: break-word;
      word-break: break-word;
      overflow-wrap: anywhere;
      white-space: normal;
    }
    table.data-table td.lbl {
      background-color: #DEEAF6 !important;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: 0.2px;
    }
    table.data-table td.val {
      background-color: transparent !important;
      color: #000;
      font-weight: 500;
    }

    /* Anchos específicos - Datos Personales */
    .col-dp-lbl1 { width: 25%; }
    .col-dp-val1 { width: 25%; }
    .col-dp-lbl2 { width: 22%; }
    .col-dp-val2 { width: 28%; }

    /* Anchos específicos - Domicilio */
    .col-dom-lbl1 { width: 25%; }
    .col-dom-val1 { width: 33%; }
    .col-dom-lbl2 { width: 14%; }
    .col-dom-val2 { width: 28%; }

    /* Anchos específicos - Antecedentes */
    .col-ant-lbl { width: 42%; }
    .col-ant-val { width: 58%; }

    /* Fecha al calce */
    .date-row {
      text-align: right;
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.3px;
      margin-top: 3.5mm;
      margin-bottom: 2.5mm;
      color: #334155;
    }

    /* Pie de página */
    .footer {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      border-top: 1px solid #94a3b8;
      margin-top: 1.5mm;
      padding-top: 1.5mm;
    }
    .footer-web {
      font-size: 7.5pt;
      color: #475569;
      letter-spacing: 0.3px;
      font-weight: 600;
    }
    .footer-logo {
      width: 24mm;
    }
    .footer-logo img {
      width: 100%;
      height: auto;
      display: block;
    }
  </style>
</head>
<body>
  <div class="sheet">
    ${watermark ? `
    <div class="watermark">
      <img src="${watermark}" alt="Marca de agua U3" />
    </div>` : ''}

    <div class="content">
      <!-- Encabezado Institucional -->
      <div class="header">
        <div class="header-logo">
          ${logoTop ? `<img src="${logoTop}" alt="Logo U3" />` : ''}
        </div>
        <div class="header-center">
          <div class="header-empresa">U3 SEGURIDAD PRIVADA S.A. DE C.V.</div>
          <div class="header-title">FICHA TÉCNICA</div>
          <div class="header-subtitle">Cédula Oficial de Identificación y Registro del Personal Operativo</div>
        </div>
        <div style="width: 22mm; flex-shrink: 0;"></div>
      </div>

      <!-- Fotografía centrada -->
      <div class="photo-row">
        <div class="photo-frame">
          ${data.fotoUrl ? `<img src="${data.fotoUrl}" alt="Fotografía del Guardia" />` : '<div class="photo-placeholder">FOTOGRAFÍA OFICIAL</div>'}
        </div>
      </div>

      <!-- Nombre del elemento con subrayado rojo corporativo -->
      <div class="guard-name-box">
        <div class="guard-name">${nombre || '&nbsp;'}</div>
      </div>

      <!-- Puesto oficial -->
      <table class="puesto-table">
        <tr>
          <td class="puesto-header">PUESTO / CATEGORÍA</td>
        </tr>
        <tr>
          <td class="puesto-value">${puesto || 'GUARDIA DE SEGURIDAD'}</td>
        </tr>
      </table>

      <!-- I. DATOS PERSONALES -->
      <div class="section-title">I. Datos Personales y Filiación</div>
      <table class="data-table">
        <colgroup>
          <col class="col-dp-lbl1" />
          <col class="col-dp-val1" />
          <col class="col-dp-lbl2" />
          <col class="col-dp-val2" />
        </colgroup>
        <tbody>
          <tr>
            <td class="lbl">FECHA DE NACIMIENTO:</td>
            <td class="val">${(data.fechaNacimiento || '').toUpperCase()}</td>
            <td class="lbl">EDAD:</td>
            <td class="val">${(data.edad || '').toUpperCase()}</td>
          </tr>
          <tr>
            <td class="lbl">LUGAR DE NACIMIENTO:</td>
            <td class="val">${(data.lugarNacimiento || '').toUpperCase()}</td>
            <td class="lbl">NACIONALIDAD:</td>
            <td class="val">${(data.nacionalidad || '').toUpperCase()}</td>
          </tr>
          <tr>
            <td class="lbl">ESTADO CIVIL:</td>
            <td class="val">${(data.estadoCivil || '').toUpperCase()}</td>
            <td class="lbl">ESTUDIOS:</td>
            <td class="val">${(data.estudios || '').toUpperCase()}</td>
          </tr>
          <tr>
            <td class="lbl">RFC:</td>
            <td class="val">${(data.rfc || '').toUpperCase()}</td>
            <td class="lbl">CURP:</td>
            <td class="val">${(data.curp || '').toUpperCase()}</td>
          </tr>
          <tr>
            <td class="lbl">AFILIACIÓN IMSS:</td>
            <td class="val">${(data.imss || '').toUpperCase()}</td>
            <td class="lbl">SEXO:</td>
            <td class="val">${(data.sexo || '').toUpperCase()}</td>
          </tr>
          <tr>
            <td class="lbl">ESTATURA:</td>
            <td class="val">${(data.estatura || '').toUpperCase()}</td>
            <td class="lbl">PESO APROXIMADO:</td>
            <td class="val">${(data.peso || '').toUpperCase()}</td>
          </tr>
        </tbody>
      </table>

      <!-- II. DOMICILIO -->
      <div class="section-title">II. Domicilio Actual y Contacto</div>
      <table class="data-table">
        <colgroup>
          <col style="width: 25%;" />
          <col style="width: 31%;" />
          <col style="width: 16%;" />
          <col style="width: 28%;" />
        </colgroup>
        <tbody>
          <tr>
            <td class="lbl">CALLE Y NÚMERO</td>
            <td class="val">${calleNumero}</td>
            <td class="lbl">COLONIA</td>
            <td class="val">${colonia}</td>
          </tr>
          <tr>
            <td class="lbl">ENTRE LAS CALLES</td>
            <td class="val">${(data.entreCalles || '').toUpperCase()}</td>
            <td class="lbl">C.P.</td>
            <td class="val">${cp}</td>
          </tr>
          <tr>
            <td class="lbl">DELEGACIÓN / MUNICIPIO</td>
            <td class="val">${delegacionMunicipio}</td>
            <td class="lbl">ESTADO</td>
            <td class="val">${estado}</td>
          </tr>
          <tr>
            <td class="lbl">TIEMPO DE RESIDENCIA</td>
            <td class="val">${(data.tiempoResidencia || '').toUpperCase()}</td>
            <td class="lbl">TIEMPO DE RADICAR EN EL EDO. DE MÉXICO</td>
            <td class="val">${(data.tiempoRadicarEstado || '').toUpperCase()}</td>
          </tr>
          <tr>
            <td class="lbl">TELÉFONO DE EMERGENCIA</td>
            <td class="val">${(data.telefonoEmergencia || '').toUpperCase()}</td>
            <td class="lbl">CELULAR</td>
            <td class="val">${(data.celular || '').toUpperCase()}</td>
          </tr>
        </tbody>
      </table>

      <!-- III. ANTECEDENTES LABORALES -->
      <div class="section-title">III. Historial y Antecedentes Laborales</div>
      <table class="data-table">
        <colgroup>
          <col class="col-ant-lbl" />
          <col class="col-ant-val" />
        </colgroup>
        <tbody>
          ${empleos.map((emp) => `
            <tr>
              <td class="lbl">EMPRESA:</td>
              <td class="val">${(emp.empresa || '').toUpperCase()}</td>
            </tr>
            <tr>
              <td class="lbl">PERÍODO:</td>
              <td class="val">${(emp.periodo || '').toUpperCase()}</td>
            </tr>
            <tr>
              <td class="lbl">PUESTO DESEMPEÑADO:</td>
              <td class="val">${(emp.puesto || '').toUpperCase()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <!-- Fecha al calce -->
      <div class="date-row">
        ${fechaDoc}
      </div>

      <!-- Pie con enlace web y Logo institucional -->
      <div class="footer">
        <div class="footer-web">www.u3seguridadprivada.com · Uso Oficial y Confidencial</div>
        <div class="footer-logo">
          ${logoFooter ? `<img src="${logoFooter}" alt="U3 Seguridad Privada" />` : ''}
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
