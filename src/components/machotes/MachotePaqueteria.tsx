'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import {
  ArrowLeft,
  Printer,
  RotateCcw,
  Trash2,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
  HelpCircle,
  Scissors,
} from 'lucide-react';
import { toast } from 'sonner';

// Claves para persistencia en localStorage
const LLAVE_LOGO_IZQ = 'u3-machote-paq-logo-izq';
const LLAVE_LOGO_DER = 'u3-machote-paq-logo-der';
const LLAVE_EMPRESA = 'u3-machote-paq-empresa';
const LLAVE_SUBTITULO = 'u3-machote-paq-subtitulo';
const LLAVE_TITULO = 'u3-machote-paq-titulo';
const LLAVE_PREFIJO = 'u3-machote-paq-prefijo';
const LLAVE_FOLIO_INI = 'u3-machote-paq-folio-ini';
const LLAVE_FOLIO_FIN = 'u3-machote-paq-folio-fin';
const LLAVE_MODO_REVERSO = 'u3-machote-paq-modo-reverso';
const LLAVE_GIRAR_REVERSO = 'u3-machote-paq-girar-reverso';
const LLAVE_MARGEN_ENG = 'u3-machote-paq-margen-eng';
const LLAVE_CABECERAS = 'u3-machote-paq-cabeceras';

const EMPRESA_DEFAULT = 'U3 SEGURIDAD PRIVADA, S.A. DE C.V.';
const SUBTITULO_DEFAULT = 'RECEPCIÓN / ENTREGA DE PAQUETERÍA Y MENSAJERÍA';
const TITULO_DEFAULT = 'TORRE OLIMPO';
const PREFIJO_DEFAULT = 'TO-';
const FOLIO_INI_DEFAULT = 1;
// Estándar fijo e inmutable: exactamente 22 renglones por cara
const FILAS_FIJAS = 22;
// Tope de paginas. Un rango de folios enorme (por un valor viejo guardado en
// localStorage o un tecleo accidental) generaria decenas de miles de paginas y
// congelaria el navegador al renderizarlas todas.
const MAX_PAGINAS = 200;
// El machote siempre arranca en el folio 1. A doble cara la hoja cubre 44 folios:
// del 1 al 22 en el frente y del 23 al 44 en el reverso.
const FOLIO_FIN_DEFAULT = FILAS_FIJAS * 2; // 44
const MARGEN_ENGARGOLADO_DEFAULT = 20; // 20 mm de margen superior para engargolar

interface CabecerasColumnas {
  superRecepcion: string;
  superEntrega: string;
  fecha: string;
  compania: string;
  guia: string;
  destinatario: string;
  torre: string;
  depto: string;
  horaRec: string;
  fechaEnt: string;
  quienRecibio: string;
  horaEnt: string;
  firma: string;
}

const CABECERAS_DEFAULT: CabecerasColumnas = {
  superRecepcion: 'R E C E P C I O N',
  superEntrega: 'E N T R E G A',
  fecha: 'FECHA',
  compania: 'COMPAÑÍA',
  guia: 'Nº DE GUÍA',
  destinatario: 'DESTINATARIO',
  torre: 'TORRE',
  depto: 'DEPTO.',
  horaRec: 'HORA',
  fechaEnt: 'FECHA',
  quienRecibio: 'QUIEN RECIBIO',
  horaEnt: 'HORA',
  firma: 'FIRMA',
};

function leer(llave: string): string | null {
  try {
    return window.localStorage.getItem(llave);
  } catch {
    return null;
  }
}
function guardar(llave: string, valor: string) {
  try {
    window.localStorage.setItem(llave, valor);
  } catch {
    /* sin persistencia */
  }
}
function borrar(llave: string) {
  try {
    window.localStorage.removeItem(llave);
  } catch {
    /* sin persistencia */
  }
}

// Componente para mostrar o subir los logos U3 / Cliente
function LogoU3({
  customLogo,
  onUpload,
  onRemove,
  lado,
}: {
  customLogo: string | null;
  onUpload: () => void;
  onRemove?: () => void;
  lado: 'izq' | 'der';
}) {
  return (
    <div
      className="mch-logo-box group relative cursor-pointer select-none"
      onClick={onUpload}
      title="Clic para cambiar logotipo"
    >
      {customLogo ? (
        <div className="flex flex-col items-center justify-center h-full">
          <img
            src={customLogo}
            alt="Logotipo"
            className="max-h-[17mm] max-w-[26mm] object-contain"
          />
          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity print:hidden shadow"
              title="Restaurar logo original"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center">
          <img
            src="/BANDERAS_Y_u3.png"
            alt="U3 Seguridad Privada"
            className="h-[17mm] max-w-[26mm] object-contain"
          />
        </div>
      )}
    </div>
  );
}

interface HojaProps {
  numPagina: number;
  totalPaginas: number;
  etiquetaCara: string;
  empresa: string;
  subtitulo: string;
  titulo: string;
  cabeceras: CabecerasColumnas;
  logoIzq: string | null;
  logoDer: string | null;
  folios: string[];
  margenEngargolado: number;
  celdasValores: Record<string, string>;
  rotada180?: boolean;
  onCambiarEmpresa: (v: string) => void;
  onCambiarSubtitulo: (v: string) => void;
  onCambiarTitulo: (v: string) => void;
  onCambiarCabecera: (campo: keyof CabecerasColumnas, v: string) => void;
  onCambiarFolioFila: (index: number, val: string) => void;
  onCambiarCelda: (index: number, col: string, val: string) => void;
  onPedirLogoIzq: () => void;
  onPedirLogoDer: () => void;
  onQuitarLogoIzq: () => void;
  onQuitarLogoDer: () => void;
}

function Hoja({
  numPagina,
  totalPaginas,
  etiquetaCara,
  empresa,
  subtitulo,
  titulo,
  cabeceras,
  logoIzq,
  logoDer,
  folios,
  margenEngargolado,
  celdasValores,
  rotada180,
  onCambiarEmpresa,
  onCambiarSubtitulo,
  onCambiarTitulo,
  onCambiarCabecera,
  onCambiarFolioFila,
  onCambiarCelda,
  onPedirLogoIzq,
  onPedirLogoDer,
  onQuitarLogoIzq,
  onQuitarLogoDer,
}: HojaProps) {
  // Aseguramos exactamente 22 filas siempre
  const filasVisuales = Array.from({ length: FILAS_FIJAS }, (_, i) => folios[i] || '');

  return (
    <div
      className={`mch-hoja-oficio ${rotada180 ? 'mch-hoja-girada' : ''}`}
      style={
        {
          '--mch-padding-top': `${margenEngargolado}mm`,
        } as React.CSSProperties
      }
    >
      {/* Guía visual de margen superior para perforación de engargolado (solo en pantalla, oculta al imprimir) */}
      <div
        className="mch-guia-engargolado print:hidden"
        style={{ height: `${margenEngargolado}mm` }}
        title="Espacio en blanco de seguridad reservado para los orificios del engargolado"
      >
        <div className="mch-guia-engargolado-content">
          <Scissors className="w-3.5 h-3.5 mr-1.5 opacity-70" />
          <span>Área libre para engargolado y perforación ({margenEngargolado} mm de margen superior seguro)</span>
        </div>
      </div>

      {/* Encabezado: Logotipo Izquierdo, Títulos Centrales Editables, Logotipo Derecho */}
      <header className="mch-header">
        <div className="mch-header-lado">
          <LogoU3
            customLogo={logoIzq}
            onUpload={onPedirLogoIzq}
            onRemove={logoIzq ? onQuitarLogoIzq : undefined}
            lado="izq"
          />
        </div>

        <div className="mch-header-centro">
          <input
            className="mch-input-empresa"
            value={empresa}
            onChange={(e) => onCambiarEmpresa(e.target.value)}
            title="Clic para editar el nombre de la empresa"
            aria-label="Razón Social"
          />
          <input
            className="mch-input-subtitulo"
            value={subtitulo}
            onChange={(e) => onCambiarSubtitulo(e.target.value)}
            title="Clic para editar el subtítulo"
            aria-label="Subtítulo del documento"
          />
          <input
            className="mch-input-titulo"
            value={titulo}
            onChange={(e) => onCambiarTitulo(e.target.value)}
            title="Clic para editar la torre o servicio"
            aria-label="Nombre del puesto o torre"
          />
        </div>

        <div className="mch-header-lado flex justify-end">
          <LogoU3
            customLogo={logoDer}
            onUpload={onPedirLogoDer}
            onRemove={logoDer ? onQuitarLogoDer : undefined}
            lado="der"
          />
        </div>
      </header>

      {/* Tabla Oficial de Registro - Exactamente 22 Renglones */}
      <div className="mch-tabla-container">
        <table className="mch-tabla">
          <colgroup>
            <col style={{ width: '6.6%' }} /> {/* FOLIO */}
            <col style={{ width: '5.2%' }} /> {/* FECHA */}
            <col style={{ width: '13.2%' }} /> {/* COMPAÑÍA */}
            <col style={{ width: '6.6%' }} /> {/* Nº DE GUÍA */}
            <col style={{ width: '14.5%' }} /> {/* DESTINATARIO */}
            <col style={{ width: '5.5%' }} /> {/* TORRE */}
            <col style={{ width: '5.5%' }} /> {/* DEPTO. */}
            <col style={{ width: '3.9%' }} /> {/* HORA */}
            <col style={{ width: '5.2%' }} /> {/* FECHA ENTREGA */}
            <col style={{ width: '15.5%' }} /> {/* QUIEN RECIBIO */}
            <col style={{ width: '3.9%' }} /> {/* HORA ENTREGA */}
            <col style={{ width: '14.4%' }} /> {/* FIRMA */}
          </colgroup>
          <thead>
            {/* Fila 1 de cabecera: FOLIO, RECEPCIÓN, ENTREGA (Editables en hoja) */}
            <tr className="mch-th-grupo">
              <th rowSpan={2} className="mch-col-folio-head">
                FOLIO
              </th>
              <th colSpan={7} className="mch-super-recepcion">
                <input
                  className="mch-input-superth"
                  value={cabeceras.superRecepcion}
                  onChange={(e) => onCambiarCabecera('superRecepcion', e.target.value)}
                  title="Clic para editar encabezado"
                />
              </th>
              <th colSpan={4} className="mch-super-entrega">
                <input
                  className="mch-input-superth"
                  value={cabeceras.superEntrega}
                  onChange={(e) => onCambiarCabecera('superEntrega', e.target.value)}
                  title="Clic para editar encabezado"
                />
              </th>
            </tr>
            {/* Fila 2 de cabecera: Subcolumnas individuales (Todas editables con clic) */}
            <tr className="mch-th-sub">
              <th>
                <input
                  className="mch-input-th"
                  value={cabeceras.fecha}
                  onChange={(e) => onCambiarCabecera('fecha', e.target.value)}
                  title="Clic para editar título de columna"
                />
              </th>
              <th>
                <input
                  className="mch-input-th"
                  value={cabeceras.compania}
                  onChange={(e) => onCambiarCabecera('compania', e.target.value)}
                  title="Clic para editar título de columna"
                />
              </th>
              <th>
                <input
                  className="mch-input-th"
                  value={cabeceras.guia}
                  onChange={(e) => onCambiarCabecera('guia', e.target.value)}
                  title="Clic para editar título de columna"
                />
              </th>
              <th>
                <input
                  className="mch-input-th"
                  value={cabeceras.destinatario}
                  onChange={(e) => onCambiarCabecera('destinatario', e.target.value)}
                  title="Clic para editar título de columna"
                />
              </th>
              <th>
                <input
                  className="mch-input-th"
                  value={cabeceras.torre}
                  onChange={(e) => onCambiarCabecera('torre', e.target.value)}
                  title="Clic para editar título de columna (ej. CASA, LOTE, TORRE)"
                />
              </th>
              <th>
                <input
                  className="mch-input-th"
                  value={cabeceras.depto}
                  onChange={(e) => onCambiarCabecera('depto', e.target.value)}
                  title="Clic para editar título de columna"
                />
              </th>
              <th>
                <input
                  className="mch-input-th"
                  value={cabeceras.horaRec}
                  onChange={(e) => onCambiarCabecera('horaRec', e.target.value)}
                  title="Clic para editar título de columna"
                />
              </th>
              <th>
                <input
                  className="mch-input-th"
                  value={cabeceras.fechaEnt}
                  onChange={(e) => onCambiarCabecera('fechaEnt', e.target.value)}
                  title="Clic para editar título de columna"
                />
              </th>
              <th>
                <input
                  className="mch-input-th"
                  value={cabeceras.quienRecibio}
                  onChange={(e) => onCambiarCabecera('quienRecibio', e.target.value)}
                  title="Clic para editar título de columna"
                />
              </th>
              <th>
                <input
                  className="mch-input-th"
                  value={cabeceras.horaEnt}
                  onChange={(e) => onCambiarCabecera('horaEnt', e.target.value)}
                  title="Clic para editar título de columna"
                />
              </th>
              <th>
                <input
                  className="mch-input-th"
                  value={cabeceras.firma}
                  onChange={(e) => onCambiarCabecera('firma', e.target.value)}
                  title="Clic para editar título de columna"
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {filasVisuales.map((folio, idx) => (
              <tr key={idx}>
                {/* Folio correlativo auto-generado o editable */}
                <td className="mch-td-folio">
                  <input
                    type="text"
                    className="mch-input-celda-folio"
                    value={folio}
                    onChange={(e) => onCambiarFolioFila(idx, e.target.value)}
                    title="Clic para editar folio manualmente"
                  />
                </td>
                {/* Columnas de Recepción en blanco para llenado físico o prellenado editable */}
                <td className="mch-td-blanco">
                  <input
                    type="text"
                    className="mch-input-celda"
                    value={celdasValores[`${numPagina}-${idx}-col0`] || ''}
                    onChange={(e) => onCambiarCelda(idx, 'col0', e.target.value)}
                  />
                </td>
                <td className="mch-td-blanco">
                  <input
                    type="text"
                    className="mch-input-celda text-left px-1"
                    value={celdasValores[`${numPagina}-${idx}-col1`] || ''}
                    onChange={(e) => onCambiarCelda(idx, 'col1', e.target.value)}
                  />
                </td>
                <td className="mch-td-blanco">
                  <input
                    type="text"
                    className="mch-input-celda"
                    value={celdasValores[`${numPagina}-${idx}-col2`] || ''}
                    onChange={(e) => onCambiarCelda(idx, 'col2', e.target.value)}
                  />
                </td>
                <td className="mch-td-blanco">
                  <input
                    type="text"
                    className="mch-input-celda text-left px-1"
                    value={celdasValores[`${numPagina}-${idx}-col3`] || ''}
                    onChange={(e) => onCambiarCelda(idx, 'col3', e.target.value)}
                  />
                </td>
                <td className="mch-td-blanco">
                  <input
                    type="text"
                    className="mch-input-celda"
                    value={celdasValores[`${numPagina}-${idx}-col4`] || ''}
                    onChange={(e) => onCambiarCelda(idx, 'col4', e.target.value)}
                  />
                </td>
                <td className="mch-td-blanco">
                  <input
                    type="text"
                    className="mch-input-celda"
                    value={celdasValores[`${numPagina}-${idx}-col5`] || ''}
                    onChange={(e) => onCambiarCelda(idx, 'col5', e.target.value)}
                  />
                </td>
                {/* HORA con separador ":" tal como en el original */}
                <td className="mch-td-hora">
                  <input
                    type="text"
                    className="mch-input-celda text-center font-bold"
                    placeholder=":"
                    value={celdasValores[`${numPagina}-${idx}-col6`] || ''}
                    onChange={(e) => onCambiarCelda(idx, 'col6', e.target.value)}
                  />
                </td>
                {/* Columnas de Entrega */}
                <td className="mch-td-blanco">
                  <input
                    type="text"
                    className="mch-input-celda"
                    value={celdasValores[`${numPagina}-${idx}-col7`] || ''}
                    onChange={(e) => onCambiarCelda(idx, 'col7', e.target.value)}
                  />
                </td>
                <td className="mch-td-blanco">
                  <input
                    type="text"
                    className="mch-input-celda text-left px-1"
                    value={celdasValores[`${numPagina}-${idx}-col8`] || ''}
                    onChange={(e) => onCambiarCelda(idx, 'col8', e.target.value)}
                  />
                </td>
                {/* HORA entrega con separador ":" */}
                <td className="mch-td-hora">
                  <input
                    type="text"
                    className="mch-input-celda text-center font-bold"
                    placeholder=":"
                    value={celdasValores[`${numPagina}-${idx}-col9`] || ''}
                    onChange={(e) => onCambiarCelda(idx, 'col9', e.target.value)}
                  />
                </td>
                <td className="mch-td-blanco">
                  <input
                    type="text"
                    className="mch-input-celda"
                    value={celdasValores[`${numPagina}-${idx}-col10`] || ''}
                    onChange={(e) => onCambiarCelda(idx, 'col10', e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MachotePaqueteria({ onVolver }: { onVolver: () => void }) {
  // Estados configurables
  const [empresa, setEmpresa] = useState(EMPRESA_DEFAULT);
  const [subtitulo, setSubtitulo] = useState(SUBTITULO_DEFAULT);
  const [titulo, setTitulo] = useState(TITULO_DEFAULT);
  const [cabeceras, setCabeceras] = useState<CabecerasColumnas>(CABECERAS_DEFAULT);

  const [prefijo, setPrefijo] = useState(PREFIJO_DEFAULT);
  const [folioInicial, setFolioInicial] = useState(FOLIO_INI_DEFAULT);
  const [folioFinal, setFolioFinal] = useState(FOLIO_FIN_DEFAULT);
  const [folioIniTexto, setFolioIniTexto] = useState(String(FOLIO_INI_DEFAULT));
  const [folioFinTexto, setFolioFinTexto] = useState(String(FOLIO_FIN_DEFAULT));
  const [dobleCara, setDobleCara] = useState(true);
  const [modoReverso, setModoReverso] = useState<'consecutivo' | 'igual' | 'vacio'>('consecutivo');
  const [girarReverso180, setGirarReverso180] = useState(false);
  const [margenEngargolado, setMargenEngargolado] = useState(MARGEN_ENGARGOLADO_DEFAULT);
  const [zoomVista, setZoomVista] = useState(85); // 85% para visualización cómoda en pantalla

  // Folios calculados organizados por página (cada página tiene exactamente 22 filas)
  const [paginasFolios, setPaginasFolios] = useState<string[][]>([]);
  // Sobrescrituras manuales de folios por celda [pág-fila]
  const [foliosManuales, setFoliosManuales] = useState<Record<string, string>>({});
  // Celdas de texto opcionales dentro de la hoja
  const [celdasValores, setCeldasValores] = useState<Record<string, string>>({});

  // Logotipos
  const [logoIzq, setLogoIzq] = useState<string | null>(null);
  const [logoDer, setLogoDer] = useState<string | null>(null);
  const inputLogoIzq = useRef<HTMLInputElement>(null);
  const inputLogoDer = useRef<HTMLInputElement>(null);

  // Cargar preferencias guardadas
  useEffect(() => {
    setEmpresa(leer(LLAVE_EMPRESA) ?? EMPRESA_DEFAULT);
    setSubtitulo(leer(LLAVE_SUBTITULO) ?? SUBTITULO_DEFAULT);
    setTitulo(leer(LLAVE_TITULO) ?? TITULO_DEFAULT);
    setPrefijo(leer(LLAVE_PREFIJO) ?? PREFIJO_DEFAULT);

    // El rango de folios no se restaura de localStorage: cada vez que se abre el
    // machote arranca en el folio 1 y termina en el 22. Se puede cambiar durante
    // la sesion, pero al volver a entrar siempre vuelve al rango estandar.
    setFolioInicial(FOLIO_INI_DEFAULT);
    setFolioIniTexto(String(FOLIO_INI_DEFAULT));
    setFolioFinal(FOLIO_FIN_DEFAULT);
    setFolioFinTexto(String(FOLIO_FIN_DEFAULT));
    borrar(LLAVE_FOLIO_INI);
    borrar(LLAVE_FOLIO_FIN);

    const modoGuardado = leer(LLAVE_MODO_REVERSO);
    if (modoGuardado === 'consecutivo' || modoGuardado === 'igual' || modoGuardado === 'vacio') {
      setModoReverso(modoGuardado);
    }

    const girarGuardado = leer(LLAVE_GIRAR_REVERSO);
    if (girarGuardado === 'true') {
      setGirarReverso180(true);
    }

    const margenGuardado = leer(LLAVE_MARGEN_ENG);
    if (margenGuardado && !isNaN(Number(margenGuardado))) {
      setMargenEngargolado(Number(margenGuardado));
    }

    const cabecerasGuardadas = leer(LLAVE_CABECERAS);
    if (cabecerasGuardadas) {
      try {
        setCabeceras({ ...CABECERAS_DEFAULT, ...JSON.parse(cabecerasGuardadas) });
      } catch {
        /* fallback default */
      }
    }

    setLogoIzq(leer(LLAVE_LOGO_IZQ));
    setLogoDer(leer(LLAVE_LOGO_DER));
  }, []);

  // Recalcular páginas y folios según Folio Inicial, Folio Final, Doble Cara y Modo Reverso
  useEffect(() => {
    const fIni = Math.max(1, folioInicial);
    const fFinMaximo = fIni + (MAX_PAGINAS * FILAS_FIJAS) - 1;
    const fFin = Math.min(Math.max(fIni, folioFinal), fFinMaximo);
    const totalFoliosRequeridos = fFin - fIni + 1;

    // Dígitos para mantener formato uniforme (ej. 10969 -> 5 dígitos mínimo)
    const digitos = Math.max(5, String(fFin).length);

    // Cantidad de páginas calculadas (cada página tiene exactamente 22 filas)
    let numPaginas = Math.max(1, Math.ceil(totalFoliosRequeridos / FILAS_FIJAS));

    // Si está en doble cara y el número de páginas es impar, agregamos la cara trasera para completar la hoja
    if (dobleCara && numPaginas % 2 !== 0) {
      numPaginas += 1;
    }

    const paginas: string[][] = [];
    let folioCorrelativo = fIni;

    for (let p = 0; p < numPaginas; p++) {
      const foliosEstaPagina: string[] = [];
      const esReverso = dobleCara && p % 2 === 1;

      if (esReverso && modoReverso === 'vacio') {
        // Modo Reverso en blanco: 22 filas sin folio
        for (let r = 0; r < FILAS_FIJAS; r++) {
          const keyManual = `${p}-${r}`;
          foliosEstaPagina.push(foliosManuales[keyManual] ?? '');
        }
      } else if (esReverso && modoReverso === 'igual') {
        // Modo Reverso repite los mismos folios de la cara frente correspondiente
        const frenteIdx = p - 1;
        const foliosFrente = paginas[frenteIdx] || [];
        for (let r = 0; r < FILAS_FIJAS; r++) {
          const keyManual = `${p}-${r}`;
          foliosEstaPagina.push(foliosManuales[keyManual] ?? foliosFrente[r] ?? '');
        }
      } else {
        // Modo consecutivo normal (tanto para frentes como para reversos consecutivos)
        for (let r = 0; r < FILAS_FIJAS; r++) {
          const keyManual = `${p}-${r}`;
          if (foliosManuales[keyManual] !== undefined) {
            foliosEstaPagina.push(foliosManuales[keyManual]);
            folioCorrelativo++;
          } else if (folioCorrelativo <= fFin) {
            const numStr = String(folioCorrelativo).padStart(digitos, '0');
            foliosEstaPagina.push(`${prefijo}${numStr}`);
            folioCorrelativo++;
          } else {
            // Fuera del rango de folio final: celda vacía para completar los 22 renglones estándar
            foliosEstaPagina.push('');
          }
        }
      }

      paginas.push(foliosEstaPagina);
    }

    setPaginasFolios(paginas);
  }, [prefijo, folioInicial, folioFinal, dobleCara, modoReverso, foliosManuales]);

  // Manejadores de cambios
  const cambiarEmpresa = (val: string) => {
    setEmpresa(val);
    guardar(LLAVE_EMPRESA, val);
  };
  const cambiarSubtitulo = (val: string) => {
    setSubtitulo(val);
    guardar(LLAVE_SUBTITULO, val);
  };
  const cambiarTitulo = (val: string) => {
    setTitulo(val);
    guardar(LLAVE_TITULO, val);
  };
  const cambiarCabecera = (campo: keyof CabecerasColumnas, val: string) => {
    const nuevas = { ...cabeceras, [campo]: val };
    setCabeceras(nuevas);
    guardar(LLAVE_CABECERAS, JSON.stringify(nuevas));
  };
  const cambiarPrefijo = (val: string) => {
    setPrefijo(val);
    guardar(LLAVE_PREFIJO, val);
  };

  const handleCambiarFolioInicialTexto = (val: string) => {
    setFolioIniTexto(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 0) {
      const diferencia = Math.max(FILAS_FIJAS - 1, folioFinal - folioInicial);
      const nuevoFin = num + diferencia;
      setFolioInicial(num);
      setFolioFinal(nuevoFin);
      setFolioFinTexto(String(nuevoFin));
      guardar(LLAVE_FOLIO_INI, String(num));
      guardar(LLAVE_FOLIO_FIN, String(nuevoFin));
    }
  };

  const handleBlurFolioInicial = () => {
    const num = parseInt(folioIniTexto, 10);
    if (!folioIniTexto || isNaN(num) || num < 1) {
      setFolioIniTexto(String(folioInicial));
    }
  };

  const handleCambiarFolioFinalTexto = (val: string) => {
    setFolioFinTexto(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num >= folioInicial) {
      const tope = folioInicial + (MAX_PAGINAS * FILAS_FIJAS) - 1;
      const acotado = Math.min(num, tope);
      if (acotado !== num) {
        toast.warning(`Maximo ${MAX_PAGINAS} paginas: el folio final se ajusto a ${acotado}`);
        setFolioFinTexto(String(acotado));
      }
      setFolioFinal(acotado);
      guardar(LLAVE_FOLIO_FIN, String(acotado));
    }
  };

  const handleBlurFolioFinal = () => {
    const num = parseInt(folioFinTexto, 10);
    if (!folioFinTexto || isNaN(num) || num < folioInicial) {
      const fallback = Math.max(folioInicial + FILAS_FIJAS - 1, folioInicial);
      setFolioFinal(fallback);
      setFolioFinTexto(String(fallback));
      guardar(LLAVE_FOLIO_FIN, String(fallback));
    }
  };

  const aplicarPreajustePaginas = (cantPaginas: number) => {
    const totalFolios = cantPaginas * FILAS_FIJAS;
    const nuevoFin = folioInicial + totalFolios - 1;
    setFolioFinal(nuevoFin);
    setFolioFinTexto(String(nuevoFin));
    guardar(LLAVE_FOLIO_FIN, String(nuevoFin));
    toast.success(`Configurado para ${cantPaginas} ${cantPaginas === 1 ? 'página' : 'páginas'} (${totalFolios} folios)`);
  };

  const cambiarMargenEngargolado = (mm: number) => {
    setMargenEngargolado(mm);
    guardar(LLAVE_MARGEN_ENG, String(mm));
    toast.success(`Margen de engargolado ajustado a ${mm} mm`);
  };

  const cambiarModoDobleCara = (esDoble: boolean) => {
    setDobleCara(esDoble);
    if (esDoble) {
      const foliosTotales = folioFinal - folioInicial + 1;
      if (foliosTotales <= FILAS_FIJAS && modoReverso === 'consecutivo') {
        const nuevoFin = folioInicial + FILAS_FIJAS * 2 - 1;
        setFolioFinal(nuevoFin);
        setFolioFinTexto(String(nuevoFin));
        guardar(LLAVE_FOLIO_FIN, String(nuevoFin));
        toast.info('Se expandió el Folio Final a 44 registros para cubrir Frente y Reverso.');
      }
    }
  };

  const cambiarGirarReverso180 = (activo: boolean) => {
    setGirarReverso180(activo);
    guardar(LLAVE_GIRAR_REVERSO, String(activo));
    if (activo) {
      toast.success('Página de reverso invertida 180° para volteo por borde largo (tipo block)');
    } else {
      toast.success('Orientación de reverso estándar normal');
    }
  };

  const cambiarModoReverso = (modo: 'consecutivo' | 'igual' | 'vacio') => {
    setModoReverso(modo);
    guardar(LLAVE_MODO_REVERSO, modo);
    if (modo === 'consecutivo' && dobleCara) {
      const foliosTotales = folioFinal - folioInicial + 1;
      if (foliosTotales <= FILAS_FIJAS) {
        const nuevoFin = folioInicial + FILAS_FIJAS * 2 - 1;
        setFolioFinal(nuevoFin);
        setFolioFinTexto(String(nuevoFin));
        guardar(LLAVE_FOLIO_FIN, String(nuevoFin));
      }
    }
  };

  const handleCargarLogo = (archivo: File | undefined, lado: 'izq' | 'der') => {
    if (!archivo) return;
    if (!archivo.type.startsWith('image/')) {
      toast.error('El archivo debe ser una imagen');
      return;
    }
    if (archivo.size > 2 * 1024 * 1024) {
      toast.error('La imagen no debe pesar más de 2 MB');
      return;
    }
    const lector = new FileReader();
    lector.onload = () => {
      const datos = String(lector.result);
      if (lado === 'izq') {
        setLogoIzq(datos);
        guardar(LLAVE_LOGO_IZQ, datos);
      } else {
        setLogoDer(datos);
        guardar(LLAVE_LOGO_DER, datos);
      }
      toast.success(`Logo ${lado === 'izq' ? 'izquierdo' : 'derecho'} actualizado`);
    };
    lector.readAsDataURL(archivo);
  };

  const quitarLogo = (lado: 'izq' | 'der') => {
    if (lado === 'izq') {
      setLogoIzq(null);
      borrar(LLAVE_LOGO_IZQ);
    } else {
      setLogoDer(null);
      borrar(LLAVE_LOGO_DER);
    }
    toast.success(`Logo ${lado === 'izq' ? 'izquierdo' : 'derecho'} restaurado al original`);
  };

  const restaurarTodoPorDefecto = () => {
    setEmpresa(EMPRESA_DEFAULT);
    setSubtitulo(SUBTITULO_DEFAULT);
    setTitulo(TITULO_DEFAULT);
    setCabeceras(CABECERAS_DEFAULT);
    setPrefijo(PREFIJO_DEFAULT);
    setFolioInicial(FOLIO_INI_DEFAULT);
    setFolioFinal(FOLIO_FIN_DEFAULT);
    setFolioIniTexto(String(FOLIO_INI_DEFAULT));
    setFolioFinTexto(String(FOLIO_FIN_DEFAULT));
    setMargenEngargolado(MARGEN_ENGARGOLADO_DEFAULT);
    setModoReverso('consecutivo');
    setGirarReverso180(false);
    setDobleCara(true);
    setFoliosManuales({});
    setCeldasValores({});
    setLogoIzq(null);
    setLogoDer(null);

    borrar(LLAVE_EMPRESA);
    borrar(LLAVE_SUBTITULO);
    borrar(LLAVE_TITULO);
    borrar(LLAVE_CABECERAS);
    borrar(LLAVE_PREFIJO);
    borrar(LLAVE_FOLIO_INI);
    borrar(LLAVE_FOLIO_FIN);
    borrar(LLAVE_MARGEN_ENG);
    borrar(LLAVE_MODO_REVERSO);
    borrar(LLAVE_GIRAR_REVERSO);
    borrar(LLAVE_LOGO_IZQ);
    borrar(LLAVE_LOGO_DER);

    toast.success('Formato original y valores predeterminados restaurados');
  };

  const editarFolioFila = (paginaIdx: number, filaIdx: number, val: string) => {
    const key = `${paginaIdx}-${filaIdx}`;
    setFoliosManuales((prev) => ({ ...prev, [key]: val }));
  };

  const editarCelda = (paginaIdx: number, filaIdx: number, col: string, val: string) => {
    const key = `${paginaIdx}-${filaIdx}-${col}`;
    setCeldasValores((prev) => ({ ...prev, [key]: val }));
  };

  const totalFolios = Math.max(1, folioFinal - folioInicial + 1);
  const totalPaginas = paginasFolios.length;

  return (
    <div className="space-y-4 pb-12">
      {/* Estilos CSS dedicados para visualización y salida de impresión exacta en Tamaño Oficio */}
      <style>{`
        /* Lienzo en pantalla */
        .mch-paq-lienzo {
          overflow-x: auto;
          padding-bottom: 24px;
        }
        .mch-paq-pila {
          display: flex;
          flex-direction: column;
          gap: 32px;
          width: max-content;
          margin: 0 auto;
          transition: transform 0.15s ease-out;
          transform-origin: top center;
        }

/* Hoja Oficio Mexico horizontal: 340.4mm x 215.9mm.
           Son los valores exactos del formulario ns0000:MexicoOficio del driver
           Epson (215900 x 340400 micras). Ojo: la etiqueta que muestra Epson dice
           "216 x 341 mm", pero eso es redondeo suyo; el motor de impresion usa
           las micras de arriba. */
        .mch-hoja-oficio {
          width: 340.4mm;
          height: 215.9mm;
          max-height: 215.9mm;
          flex: none;
          background: #ffffff;
          color: #0f172a;
          box-sizing: border-box;
          overflow: hidden;
          /* Margen superior dinámico para engargolado */
          padding-top: var(--mch-padding-top, 20mm);
          padding-bottom: 6mm;
          padding-left: 10mm;
          padding-right: 10mm;
          display: flex;
          flex-direction: column;
          box-shadow: 0 10px 30px -5px rgba(15, 23, 42, 0.22);
          font-family: Arial, Helvetica, sans-serif;
          position: relative;
        }
        .mch-hoja-oficio * {
          box-sizing: border-box;
        }

        /* Guía visual del área de engargolado en pantalla */
        .mch-guia-engargolado {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          border-bottom: 1.5px dashed #94a3b8;
          background: repeating-linear-gradient(
            45deg,
            rgba(241, 245, 249, 0.6),
            rgba(241, 245, 249, 0.6) 8px,
            rgba(248, 250, 252, 0.6) 8px,
            rgba(248, 250, 252, 0.6) 16px
          );
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          user-select: none;
          z-index: 10;
        }
        .mch-guia-engargolado-content {
          display: flex;
          align-items: center;
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid #cbd5e1;
          padding: 2px 10px;
          border-radius: 9999px;
          font-size: 8.5pt;
          font-weight: 600;
          color: #475569;
          letter-spacing: 0.02em;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }

        /* Encabezado */
        .mch-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 2mm;
          height: 18mm;
          max-height: 18mm;
          flex-shrink: 0;
        }
        .mch-header-lado {
          width: 38mm;
          flex-shrink: 0;
          display: flex;
          align-items: center;
        }
        .mch-header-centro {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 0 4mm;
        }

        /* Textos editables del encabezado */
        .mch-input-empresa {
          width: 100%;
          border: 0;
          background: transparent;
          font-family: inherit;
          font-size: 11pt;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-align: center;
          color: #1e293b;
          outline: none;
          line-height: 1.15;
          padding: 0.5mm 0;
          cursor: text;
        }
        .mch-input-empresa:focus {
          background: #eff6ff;
          border-radius: 3px;
        }

        .mch-input-subtitulo {
          width: 100%;
          border: 0;
          background: transparent;
          font-family: inherit;
          font-size: 8.2pt;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-align: center;
          color: #334155;
          outline: none;
          line-height: 1.15;
          padding: 0.5mm 0;
          cursor: text;
        }
        .mch-input-subtitulo:focus {
          background: #eff6ff;
          border-radius: 3px;
        }

        .mch-input-titulo {
          width: 100%;
          border: 0;
          background: transparent;
          font-family: inherit;
          font-size: 18pt;
          font-weight: 800;
          letter-spacing: 0.07em;
          text-align: center;
          color: #475569;
          outline: none;
          line-height: 1.1;
          margin-top: 0.5mm;
          padding: 0.5mm 0;
          cursor: text;
        }
        .mch-input-titulo:focus {
          background: #eff6ff;
          border-radius: 3px;
        }

        /* Tabla Principal */
        .mch-tabla-container {
          flex: 1;
          display: flex;
          min-height: 0;
        }
        .mch-tabla {
          width: 100%;
          height: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }

        /* Bordes y colores nítidos */
        .mch-tabla,
        .mch-tabla th,
        .mch-tabla td {
          border: 0.7px solid #475569;
        }

        /* Encabezados de tabla */
        .mch-tabla thead tr.mch-th-grupo th {
          background: #e2e5ea;
          color: #1e293b;
          font-size: 8.5pt;
          font-weight: 700;
          padding: 0;
          text-align: center;
          height: 5.2mm;
          line-height: 1;
        }
        .mch-tabla thead tr.mch-th-sub th {
          background: #e2e5ea;
          color: #1e293b;
          font-size: 7pt;
          font-weight: 700;
          letter-spacing: 0.02em;
          padding: 0;
          text-align: center;
          height: 5.2mm;
          line-height: 1;
        }

        .mch-col-folio-head {
          font-size: 7.8pt !important;
          letter-spacing: 0.04em;
          vertical-align: middle;
        }

        /* Inputs integrados en cabeceras de tabla */
        .mch-input-superth {
          width: 100%;
          height: 100%;
          border: 0;
          background: transparent;
          text-align: center;
          font-family: inherit;
          font-size: 8.5pt;
          font-weight: 700;
          color: #1e293b;
          outline: none;
          letter-spacing: 0.3em;
          padding: 0;
          cursor: text;
        }
        .mch-input-superth:focus {
          background: #cbd5e1;
        }

        .mch-input-th {
          width: 100%;
          height: 100%;
          border: 0;
          background: transparent;
          text-align: center;
          font-family: inherit;
          font-size: 7pt;
          font-weight: 700;
          color: #1e293b;
          outline: none;
          letter-spacing: 0.02em;
          padding: 0 1px;
          cursor: text;
        }
        .mch-input-th:focus {
          background: #cbd5e1;
        }

        /* 22 Filas fijas: altura uniforme de 7.2mm */
        .mch-tabla tbody td {
          height: 7.2mm;
          padding: 0;
          vertical-align: middle;
        }

        .mch-td-folio {
          text-align: center;
          padding: 0 0.5mm !important;
          background: #ffffff;
        }
        .mch-input-celda-folio {
          width: 100%;
          height: 100%;
          border: 0;
          background: transparent;
          font-family: inherit;
          font-size: 7.4pt;
          font-weight: 700;
          color: #1e293b;
          text-align: center;
          outline: none;
          letter-spacing: 0.02em;
          cursor: text;
        }
        .mch-input-celda-folio:focus {
          background: #eff6ff;
        }

        .mch-td-blanco {
          background: #ffffff;
        }
        .mch-input-celda {
          width: 100%;
          height: 100%;
          border: 0;
          background: transparent;
          font-family: inherit;
          font-size: 7.2pt;
          color: #0f172a;
          outline: none;
          padding: 0 2px;
          cursor: text;
        }
        .mch-input-celda:focus {
          background: #f8fafc;
        }

        .mch-td-hora {
          text-align: center;
          background: #ffffff;
        }

        /* Reglas de Impresión - TAMAÑO OFICIO EXACTO 21.6 x 34.0 cm */
        @media print {
          @page {
            size: 340.4mm 215.9mm; /* Tamaño Oficio México horizontal exacto */
            margin: 0;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 340.4mm !important;
            height: 215.9mm !important;
            background: #ffffff !important;
          }
          body * {
            visibility: hidden;
          }
          #machote-paq-print,
          #machote-paq-print * {
            visibility: visible !important;
          }
          #machote-paq-print {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 340.4mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
          }
          .mch-paq-lienzo,
          .mch-paq-pila {
            display: block !important;
            overflow: visible !important;
            width: 340.4mm !important;
            margin: 0 !important;
            padding: 0 !important;
            gap: 0 !important;
            transform: none !important;
          }
          .mch-guia-engargolado {
            display: none !important;
          }
          .mch-pagina-wrapper {
            display: block !important;
            width: 340.4mm !important;
            height: 215.9mm !important;
            max-height: 215.9mm !important;
            overflow: hidden !important;
            margin: 0 !important;
            padding: 0 !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            break-after: page !important;
            page-break-after: always !important;
          }
          .mch-paq-pila > .mch-pagina-wrapper:last-child {
            break-after: auto !important;
            page-break-after: auto !important;
          }
          .mch-hoja-oficio {
            width: 340.4mm !important;
            height: 215.9mm !important;
            max-height: 215.9mm !important;
            overflow: hidden !important;
            box-shadow: none !important;
            margin: 0 !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            break-after: auto !important;
            page-break-after: auto !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .mch-hoja-girada {
            transform: rotate(180deg) !important;
            transform-origin: 50% 50% !important;
          }
          .mch-input-empresa:focus,
          .mch-input-subtitulo:focus,
          .mch-input-titulo:focus,
          .mch-input-superth:focus,
          .mch-input-th:focus,
          .mch-input-celda-folio:focus,
          .mch-input-celda:focus {
            background: transparent !important;
          }
        }
      `}</style>

      {/* Barra de Herramientas y Controles */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3 print:hidden">
        {/* Fila 1: Botones principales y acciones */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onVolver}>
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Machotes
            </Button>
            <div className="h-5 w-px bg-border mx-1" />
            <span className="font-semibold text-sm">
              Control de Paquetería y Mensajería ({titulo || 'Torre'})
            </span>
            <span className="text-xs font-mono font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border/60">
              Oficio 21.6 x 34.0 cm
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Controles de Zoom en pantalla */}
            <div className="flex items-center gap-1 bg-muted/60 border border-border/80 rounded-lg p-0.5 text-xs">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setZoomVista((z) => Math.max(50, z - 10))}
                title="Reducir zoom"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </Button>
              <span className="px-1.5 font-mono text-[11px] font-semibold w-11 text-center">
                {zoomVista}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setZoomVista((z) => Math.min(120, z + 10))}
                title="Aumentar zoom"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={restaurarTodoPorDefecto}
              title="Restablecer todos los textos y folios como en el formato original"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Restaurar formato
            </Button>

            <Button
              size="sm"
              className="bg-primary text-primary-foreground font-semibold px-4 shadow hover:brightness-105"
              onClick={() => window.print()}
            >
              <Printer className="w-4 h-4 mr-1.5" /> Imprimir / PDF
            </Button>
          </div>
        </div>

        {/* Fila 2: Configuración interactiva de Folios y Estándar de 22 Renglones */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          {/* Prefijo */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground block">
              Prefijo del Folio
            </label>
            <Input
              value={prefijo}
              onChange={(e) => cambiarPrefijo(e.target.value.toUpperCase())}
              placeholder="Ej. TO-"
              className="h-8 text-xs font-mono font-bold uppercase"
            />
          </div>

          {/* Folio Inicial */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground block">
              Folio Inicial
            </label>
            <Input
              type="text"
              inputMode="numeric"
              value={folioIniTexto}
              onChange={(e) => handleCambiarFolioInicialTexto(e.target.value)}
              onBlur={handleBlurFolioInicial}
              className="h-8 text-xs font-mono font-bold"
            />
          </div>

          {/* Folio Final (Nueva casilla solicitada) */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground block">
              Folio Final
            </label>
            <Input
              type="text"
              inputMode="numeric"
              value={folioFinTexto}
              onChange={(e) => handleCambiarFolioFinalTexto(e.target.value)}
              onBlur={handleBlurFolioFinal}
              className="h-8 text-xs font-mono font-bold"
            />
          </div>

          {/* Renglones: Estándar fijo de 22 filas */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground block">
              Renglones por Cara
            </label>
            <div className="h-8 rounded-md border border-border bg-muted/60 px-2.5 flex items-center justify-between text-xs font-semibold text-foreground">
              <span>22 renglones</span>
              <span className="text-[10px] text-muted-foreground uppercase font-mono bg-background px-1.5 py-0.5 rounded border border-border/70">
                Estándar
              </span>
            </div>
          </div>

          {/* Modo de Impresión */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground block">
              Impresión
            </label>
            <select
              value={dobleCara ? 'doble' : 'simple'}
              onChange={(e) => cambiarModoDobleCara(e.target.value === 'doble')}
              className="w-full h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground font-medium"
            >
              <option value="doble">Doble Cara (Frente y Reverso)</option>
              <option value="simple">Una Cara (Simple)</option>
            </select>
          </div>

          {/* Margen Superior para Engargolado */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground block flex items-center gap-1">
              <Scissors className="w-3 h-3 text-muted-foreground" /> Espacio Engargolado
            </label>
            <select
              value={margenEngargolado}
              onChange={(e) => cambiarMargenEngargolado(Number(e.target.value))}
              className="w-full h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground font-medium"
            >
              <option value={18}>18 mm (Estrecho)</option>
              <option value={20}>20 mm (Recomendado)</option>
              <option value={22}>22 mm (Amplio)</option>
              <option value={25}>25 mm (Máximo)</option>
            </select>
          </div>
        </div>

        {/* Fila 3: Opciones rápidas de páginas, modo reverso y resumen */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/50 text-xs">
          {/* Botones de Preajustes Rápidos */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-muted-foreground font-medium mr-1">
              Páginas rápidas:
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => aplicarPreajustePaginas(1)}
            >
              1 Pág (22 folios)
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => aplicarPreajustePaginas(2)}
            >
              2 Págs (44 folios)
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => aplicarPreajustePaginas(4)}
            >
              4 Págs (88 folios)
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => aplicarPreajustePaginas(10)}
            >
              10 Págs (220 folios)
            </Button>
          </div>

          {/* Opciones de Reverso (si doble cara está activo) */}
          {dobleCara && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground font-medium">
                  Folios reverso:
                </span>
                <select
                  value={modoReverso}
                  onChange={(e) =>
                    cambiarModoReverso(e.target.value as 'consecutivo' | 'igual' | 'vacio')
                  }
                  className="h-7 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                >
                  <option value="consecutivo">Consecutivos (+22)</option>
                  <option value="igual">Repetir mismos folios</option>
                  <option value="vacio">En blanco (sin folios)</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground font-medium">
                  Orientación reverso:
                </span>
                <select
                  value={girarReverso180 ? 'girada' : 'normal'}
                  onChange={(e) => cambiarGirarReverso180(e.target.value === 'girada')}
                  className="h-7 rounded-md border border-border bg-card px-2 text-xs text-foreground font-medium"
                  title="Si al imprimir a doble cara la página trasera te sale de cabeza, selecciona Girar 180°"
                >
                  <option value="normal">Normal (Borde corto / Libro)</option>
                  <option value="girada">Girar 180° (Borde largo / Block)</option>
                </select>
              </div>
            </div>
          )}

          {/* Resumen del Rango a Imprimir */}
          <div className="bg-primary/10 border border-primary/20 rounded-md px-3 py-1 flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Rango:</span>
            <span className="font-mono font-bold text-primary text-xs">
              {prefijo}
              {String(folioInicial).padStart(5, '0')} al {prefijo}
              {String(folioFinal).padStart(5, '0')}
            </span>
            <span className="text-muted-foreground/60">•</span>
            <span className="font-semibold text-foreground text-xs">
              {totalFolios} folios ({totalPaginas} {totalPaginas === 1 ? 'página' : 'páginas'})
            </span>
          </div>
        </div>

        {/* Tip informativo sobre edición directa en la hoja e impresión doble cara */}
        <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-lg p-2.5 text-[11.5px] text-blue-900 dark:text-blue-300 flex items-start gap-2">
          <Printer className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
          <div className="space-y-1">
            <div>
              <strong>Configuración para impresión a Doble Cara perfecta:</strong> En el cuadro de impresión de tu navegador (Ctrl+P) selecciona tamaño de papel <strong>Oficio / Legal (21.6 x 34.0 cm)</strong>, orientación <strong>Horizontal</strong> y márgenes <strong>Ninguno</strong>.
            </div>
            <div>
              • <strong>Ambas caras:</strong> selecciona <em>Voltear por el borde corto</em> para que ambas caras queden al derecho con el engargolado arriba. O si tu impresora por defecto voltea por el <em>borde largo</em>, activa la opción <strong>Orientación reverso: Girar 180°</strong> arriba.
            </div>
            <div className="text-blue-800 dark:text-blue-200">
              ✎ <strong>Todo es editable dentro de la hoja:</strong> haz clic directamente sobre cualquier texto, encabezado de columna (ej. cambiar TORRE por CASA) o celda para escribir sobre él.
            </div>
          </div>
        </div>

        {/* Inputs ocultos para subida de logos */}
        <input
          ref={inputLogoIzq}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            handleCargarLogo(e.target.files?.[0], 'izq');
            e.target.value = '';
          }}
        />
        <input
          ref={inputLogoDer}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            handleCargarLogo(e.target.files?.[0], 'der');
            e.target.value = '';
          }}
        />
      </div>

      {/* Vista previa y contenedor de impresión */}
      <div id="machote-paq-print">
        <div className="mch-paq-lienzo">
          <div
            className="mch-paq-pila"
            style={{
              transform: `scale(${zoomVista / 100})`,
              marginBottom: `${((zoomVista - 100) / 100) * 216 * 3.7795}px`,
            }}
          >
            {paginasFolios.map((foliosPagina, pIdx) => {
              const numPag = pIdx + 1;
              const esReverso = dobleCara && pIdx % 2 === 1;
              const etiqueta = esReverso
                ? `Página ${numPag} (Reverso)`
                : `Página ${numPag} (Frente)`;

              const primerFolio = foliosPagina.find((f) => f.trim() !== '') || '—';
              const ultimoFolio =
                [...foliosPagina].reverse().find((f) => f.trim() !== '') || '—';

              return (
                <div key={pIdx} className="mch-pagina-wrapper relative">
                  <div className="text-[11px] font-semibold text-muted-foreground mb-1 ml-1 flex items-center justify-between print:hidden">
                    <div className="flex items-center gap-2">
                      <span className="bg-muted px-2 py-0.5 rounded font-mono text-[10px] font-bold">
                        {etiqueta}
                      </span>
                      <span className="text-[11px] text-muted-foreground font-normal">
                        — Folios {primerFolio} al {ultimoFolio} (22 renglones)
                      </span>
                      {esReverso && girarReverso180 && (
                        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-800">
                          Girada 180° (Volteo borde largo)
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      Oficio horizontal (21.6 x 34.0 cm)
                    </span>
                  </div>

                  <Hoja
                    numPagina={numPag}
                    totalPaginas={totalPaginas}
                    etiquetaCara={etiqueta}
                    empresa={empresa}
                    subtitulo={subtitulo}
                    titulo={titulo}
                    cabeceras={cabeceras}
                    logoIzq={logoIzq}
                    logoDer={logoDer}
                    folios={foliosPagina}
                    margenEngargolado={margenEngargolado}
                    celdasValores={celdasValores}
                    rotada180={esReverso && girarReverso180}
                    onCambiarEmpresa={cambiarEmpresa}
                    onCambiarSubtitulo={cambiarSubtitulo}
                    onCambiarTitulo={cambiarTitulo}
                    onCambiarCabecera={cambiarCabecera}
                    onCambiarFolioFila={(rIdx, val) => editarFolioFila(pIdx, rIdx, val)}
                    onCambiarCelda={(rIdx, col, val) => editarCelda(pIdx, rIdx, col, val)}
                    onPedirLogoIzq={() => inputLogoIzq.current?.click()}
                    onPedirLogoDer={() => inputLogoDer.current?.click()}
                    onQuitarLogoIzq={() => quitarLogo('izq')}
                    onQuitarLogoDer={() => quitarLogo('der')}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
