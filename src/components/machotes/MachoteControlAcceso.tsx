'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { ArrowLeft, ImageUp, Printer, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { COMPANY } from '@/src/lib/company';

const LLAVE_LOGO = 'u3-machote-acceso-logo';
const LLAVE_ANEXO = 'u3-machote-acceso-anexo';
const LLAVE_NOMBRE = 'u3-machote-acceso-nombre';

const ANEXO_POR_DEFECTO = 'ANEXO 1';
const NOMBRE_POR_DEFECTO = 'CONTROL DE REGISTRO DE PROVEEDORES';

/**
 * Maximo seguro de renglones. En la caja util de la hoja (195.9mm menos ~31mm
 * de encabezado y ~12mm del thead) quedan ~153mm; con el alto minimo de 6.5mm
 * por renglon, 22 ocupan 143mm y no desbordan. La tabla es height:100%, asi que
 * los renglones se estiran para llenar la hoja sea cual sea el numero.
 */
const OPCIONES_FILAS = [14, 16, 18, 20, 22];

const COLUMNAS = [
  { etiqueta: 'Fecha', clase: 'c-fecha' },
  { etiqueta: 'Nombre', clase: 'c-nombre' },
  { etiqueta: 'Compañía', clase: 'c-compania' },
  { etiqueta: 'Carga', clase: 'c-carga' },
  { etiqueta: 'Descarga', clase: 'c-descarga' },
  { etiqueta: 'Hora de entrada', clase: 'c-entrada' },
  { etiqueta: 'Hora de salida', clase: 'c-salida' },
  { etiqueta: 'Firma', clase: 'c-firma' },
];

/** localStorage no esta disponible en modo privado de algunos navegadores. */
function leer(llave: string): string | null {
  try { return window.localStorage.getItem(llave); } catch { return null; }
}
function guardar(llave: string, valor: string) {
  try { window.localStorage.setItem(llave, valor); } catch { /* sin persistencia */ }
}
function borrar(llave: string) {
  try { window.localStorage.removeItem(llave); } catch { /* sin persistencia */ }
}

interface HojaProps {
  logo: string | null;
  anexo: string;
  nombre: string;
  filas: number;
  arrastrando: boolean;
  onAnexo: (v: string) => void;
  onNombre: (v: string) => void;
  onPedirLogo: () => void;
  onArrastrar: (v: boolean) => void;
  onSoltar: (archivo?: File | null) => void;
}

/**
 * Una cara de la hoja. Frente y reverso son identicas y con margenes iguales en
 * los cuatro lados, para que al imprimir en doble cara la retícula del reverso
 * caiga encima de la del frente.
 */
function Hoja({
  logo, anexo, nombre, filas, arrastrando, onAnexo, onNombre, onPedirLogo, onArrastrar, onSoltar,
}: HojaProps) {
  return (
    <div className="mch-hoja">
      {/* Banda superior dividida por reglas verticales, como el formato oficial. */}
      <header className="mch-encabezado">
        <div className="mch-celda mch-celda-logo">
          <img className="mch-logo-u3" src={COMPANY.logoPublicPath} alt="U3 Seguridad Privada" />
        </div>

        <div className="mch-celda">
          <div className="mch-razon">{COMPANY.razonSocial}</div>
        </div>

        <div className="mch-celda mch-celda-anexo">
          <span className="mch-etiqueta">Título:</span>
          <input
            className="mch-anexo"
            value={anexo}
            onChange={(e) => onAnexo(e.target.value)}
            aria-label="Número de anexo"
          />
        </div>

        <div
          className={`mch-celda mch-celda-cliente${logo ? ' cargado' : ''}${arrastrando ? ' arrastrando' : ''}`}
          title={logo ? undefined : 'Clic para subir el logo de la empresa en resguardo'}
          onClick={() => { if (!logo) onPedirLogo(); }}
          onDragOver={(e) => { e.preventDefault(); onArrastrar(true); }}
          onDragLeave={() => onArrastrar(false)}
          onDrop={(e) => { e.preventDefault(); onArrastrar(false); onSoltar(e.dataTransfer.files?.[0]); }}
        >
          {logo
            ? <img src={logo} alt="Logo de la empresa en resguardo" />
            : <span className="mch-marcador">LOGO DE LA<br />EMPRESA EN<br />RESGUARDO</span>}
        </div>
      </header>

      <div className="mch-nombre-doc">
        <input
          value={nombre}
          onChange={(e) => onNombre(e.target.value)}
          aria-label="Nombre del documento"
        />
      </div>

      <div className="mch-tabla-envoltura">
        <table>
          <colgroup>
            {COLUMNAS.map((c) => <col key={c.clase} className={c.clase} />)}
          </colgroup>
          <thead>
            <tr>
              {COLUMNAS.map((c) => <th key={c.clase}>{c.etiqueta}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: filas }, (_, i) => (
              <tr key={i}>
                {COLUMNAS.map((c) => <td key={c.clase} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Machote de bitacora de acceso para el apostamiento: hoja Carta horizontal
 * lista para imprimir y llenar a mano. Se imprime a dos caras identicas. El
 * logo del cliente queda guardado en el navegador para no recargarlo cada vez.
 */
export default function MachoteControlAcceso({ onVolver }: { onVolver: () => void }) {
  const [logo, setLogo] = useState<string | null>(null);
  const [anexo, setAnexo] = useState(ANEXO_POR_DEFECTO);
  const [nombre, setNombre] = useState(NOMBRE_POR_DEFECTO);
  const [filas, setFilas] = useState(20);
  const [arrastrando, setArrastrando] = useState(false);
  const entradaArchivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLogo(leer(LLAVE_LOGO));
    setAnexo(leer(LLAVE_ANEXO) ?? ANEXO_POR_DEFECTO);
    setNombre(leer(LLAVE_NOMBRE) ?? NOMBRE_POR_DEFECTO);
  }, []);

  const cargarArchivo = (archivo?: File | null) => {
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
      setLogo(datos);
      guardar(LLAVE_LOGO, datos);
      toast.success('Logo cargado');
    };
    lector.onerror = () => toast.error('No se pudo leer la imagen');
    lector.readAsDataURL(archivo);
  };

  const quitarLogo = () => {
    setLogo(null);
    borrar(LLAVE_LOGO);
  };

  const cambiarAnexo = (valor: string) => {
    setAnexo(valor);
    guardar(LLAVE_ANEXO, valor);
  };

  const cambiarNombre = (valor: string) => {
    setNombre(valor);
    guardar(LLAVE_NOMBRE, valor);
  };

  const propsHoja: HojaProps = {
    logo,
    anexo,
    nombre,
    filas,
    arrastrando,
    onAnexo: cambiarAnexo,
    onNombre: cambiarNombre,
    onPedirLogo: () => entradaArchivo.current?.click(),
    onArrastrar: setArrastrando,
    onSoltar: cargarArchivo,
  };

  return (
    <div className="space-y-4">
      <style>{`
        .mch-lienzo { overflow-x: auto; padding-bottom: 8px; }
        .mch-pila { display: flex; flex-direction: column; gap: 18px; width: max-content; margin: 0 auto; }
        .mch-hoja {
          width: 279.4mm;   /* 11 in  */
          height: 215.9mm;  /* 8.5 in */
          flex: none;
          background: #fff;
          color: #0f172a;
          /* Margenes iguales en los cuatro lados: el reverso registra con el frente. */
          padding: 10mm;
          display: flex;
          flex-direction: column;
          box-shadow: 0 8px 26px rgba(15, 23, 42, .22);
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
        }
        .mch-hoja * { box-sizing: border-box; }

        .mch-encabezado {
          display: grid;
          grid-template-columns: 34mm 1fr 46mm 34mm;
          align-items: stretch;
          min-height: 19mm;
        }
        .mch-celda { display: flex; align-items: center; justify-content: center; padding: 0 4mm; }
        /* Reglas verticales entre celdas, como en el formato impreso. */
        .mch-celda + .mch-celda { border-left: 1px solid #0f172a; }
        .mch-celda-logo { justify-content: flex-start; padding-left: 0; }
        .mch-logo-u3 { height: 19mm; max-width: 100%; object-fit: contain; object-position: left center; }

        .mch-razon {
          font-size: 12.5pt;
          font-weight: 800;
          letter-spacing: .05em;
          color: #1b4a8c;
          line-height: 1.15;
          text-align: center;
        }

        .mch-celda-anexo { flex-direction: column; gap: .6mm; }
        .mch-etiqueta {
          font-size: 6.5pt;
          font-weight: 700;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: #64748b;
        }
        .mch-anexo {
          width: 100%;
          border: 0;
          background: transparent;
          font-family: inherit;
          font-size: 12pt;
          font-weight: 800;
          letter-spacing: .06em;
          text-transform: uppercase;
          text-align: center;
          color: #0f172a;
          outline: none;
        }
        .mch-anexo:focus { background: #eff6ff; }

        .mch-celda-cliente { padding-right: 0; cursor: pointer; }
        .mch-celda-cliente.cargado { cursor: default; }
        .mch-celda-cliente.arrastrando { background: #eff6ff; }
        .mch-celda-cliente img { max-height: 19mm; max-width: 100%; object-fit: contain; }
        .mch-marcador {
          font-size: 6.2pt;
          line-height: 1.3;
          text-align: center;
          color: #94a3b8;
          border: 1px dashed #cbd5e1;
          border-radius: 3px;
          padding: 1.5mm 2mm;
        }

        .mch-nombre-doc { margin: 3mm 0; }
        .mch-nombre-doc input {
          width: 100%;
          border: 0;
          background: transparent;
          font-family: inherit;
          font-size: 13.5pt;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
          text-align: center;
          color: #0f172a;
          outline: none;
        }
        .mch-nombre-doc input:focus { background: #eff6ff; }

        .mch-tabla-envoltura { flex: 1; display: flex; min-height: 0; }
        .mch-hoja table { width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed; }
        .mch-hoja thead th {
          background: #1b4a8c;
          color: #fff;
          font-size: 7.8pt;
          font-weight: 700;
          letter-spacing: .04em;
          text-transform: uppercase;
          padding: 2mm .8mm;
          border: .6px solid #1b4a8c;
          line-height: 1.15;
          height: 9mm;
        }
        /* Alto minimo bajo a proposito: nunca es el que manda (la tabla estira
           los renglones para llenar la hoja) y asi ningun conteo desborda. */
        .mch-hoja tbody td { border: .6px solid #94a3b8; height: 6.5mm; }
        .mch-hoja tbody tr:nth-child(even) td { background: #f8fafc; }
        .mch-hoja col.c-fecha { width: 8%; }
        .mch-hoja col.c-nombre { width: 18%; }
        .mch-hoja col.c-compania { width: 16%; }
        .mch-hoja col.c-carga { width: 9%; }
        .mch-hoja col.c-descarga { width: 9%; }
        .mch-hoja col.c-entrada { width: 9%; }
        .mch-hoja col.c-salida { width: 9%; }
        .mch-hoja col.c-firma { width: 22%; }

        @media print {
          /* Gana sobre el @page vertical de globals.css por venir despues en el documento. */
          @page { size: letter landscape; margin: 0; }
          body * { visibility: hidden; }
          #machote-print, #machote-print * { visibility: visible !important; }
          #machote-print {
            position: absolute !important;
            left: 0 !important; top: 0 !important;
            width: 279.4mm !important;
            margin: 0 !important; padding: 0 !important;
            background: #fff !important;
            overflow: visible !important;
          }
          .mch-lienzo, .mch-pila {
            display: block !important;
            overflow: visible !important;
            width: 279.4mm !important;
            margin: 0 !important;
            padding: 0 !important;
            gap: 0 !important;
          }
          .mch-hoja {
            width: 279.4mm !important;
            height: 215.9mm !important;
            box-shadow: none !important;
            margin: 0 !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            /* Cada cara es una pagina: la segunda cae al reverso en doble cara. */
            break-after: page !important;
            page-break-after: always !important;
          }
          .mch-hoja:last-child {
            break-after: auto !important;
            page-break-after: auto !important;
          }
          .mch-marcador { border-color: transparent !important; color: transparent !important; }
          .mch-anexo:focus, .mch-nombre-doc input:focus { background: transparent !important; }
          #machote-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* Barra de herramientas: no se imprime */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-sm print:hidden">
        <Button variant="ghost" size="sm" onClick={onVolver}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Machotes
        </Button>
        <div className="h-5 w-px bg-border mx-1" />
        <Button variant="outline" size="sm" onClick={() => entradaArchivo.current?.click()}>
          <ImageUp className="w-4 h-4 mr-1.5" /> Subir logo de la empresa
        </Button>
        {logo && (
          <Button variant="ghost" size="sm" onClick={quitarLogo}>
            <Trash2 className="w-4 h-4 mr-1.5" /> Quitar logo
          </Button>
        )}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground ml-1">
          Renglones por cara
          <select
            value={filas}
            onChange={(e) => setFilas(Number(e.target.value))}
            className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
          >
            {OPCIONES_FILAS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span className="text-[11.5px] text-muted-foreground hidden xl:inline">
          Carta horizontal · márgenes «Ninguno» · doble cara
        </span>
        <div className="flex-1" />
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-1.5" /> Imprimir / Guardar PDF
        </Button>
        <input
          ref={entradaArchivo}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { cargarArchivo(e.target.files?.[0]); e.target.value = ''; }}
        />
      </div>

      <div className="text-xs text-muted-foreground print:hidden">
        El anexo y el nombre del documento se editan dando clic encima. Cara 1 (frente) y cara 2
        (reverso) son idénticas y comparten márgenes, así la retícula del reverso cae justo
        encima de la del frente.
      </div>

      <div id="machote-print">
        <div className="mch-lienzo">
          <div className="mch-pila">
            <Hoja {...propsHoja} />
            <Hoja {...propsHoja} />
          </div>
        </div>
      </div>
    </div>
  );
}
