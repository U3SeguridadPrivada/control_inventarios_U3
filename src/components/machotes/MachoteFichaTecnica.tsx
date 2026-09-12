'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/src/components/ui/button';
import {
  ArrowLeft,
  Printer,
  Download,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  ImageUp,
  Trash2,
  Users,
  Save,
  Loader2,
  CheckCircle2,
  X,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/src/lib/api';
import { desglosarDireccion, reconstruirDireccion } from '@/src/lib/fichaTecnicaUtils';

const LLAVE_STORAGE = 'u3-machote-ficha-tecnica-draft';

interface FichaCellInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  uppercase?: boolean;
  minHeight?: number;
}

/**
 * Campo de texto multilínea autoajustable que garantiza que NINGÚN dato
 * se recorte o desaparezca en la vista del editor ni en la impresión.
 */
function FichaCellInput({
  value,
  onChange,
  placeholder = '',
  className = '',
  style,
  uppercase = true,
  minHeight = 18,
}: FichaCellInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
  }, [minHeight]);

  useEffect(() => {
    resize();
  }, [value, resize]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value || ''}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(uppercase ? raw.toUpperCase() : raw);
      }}
      onInput={resize}
      className={`mch-ft-textarea ${className}`}
      style={{
        ...style,
        minHeight: `${minHeight}px`,
      }}
    />
  );
}

export interface Empleo {
  empresa: string;
  periodo: string;
  puesto: string;
}

export interface FichaState {
  numeroElemento: string;
  nombre: string;
  fotoUrl: string | null;
  puesto: string;
  // Datos Personales
  fechaNacimiento: string;
  edad: string;
  lugarNacimiento: string;
  nacionalidad: string;
  estadoCivil: string;
  estudios: string;
  rfc: string;
  curp: string;
  imss: string;
  sexo: string;
  estatura: string;
  peso: string;
  // Domicilio
  calleNumero: string;
  colonia: string;
  entreCalles: string;
  cp: string;
  delegacionMunicipio: string;
  estado: string;
  tiempoResidencia: string;
  tiempoRadicarEstado: string;
  telefonoEmergencia: string;
  celular: string;
  // Antecedentes
  empleos: Empleo[];
  // Fecha al calce
  fechaDocumento: string;
}

function calcularFechaHoy(): string {
  const d = new Date();
  const meses = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
  ];
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = meses[d.getMonth()];
  const anio = d.getFullYear();
  return `CIUDAD DE MÉXICO, A ${dia} DE ${mes} DEL ${anio}.`;
}

// Por defecto todo completamente VACÍO como solicitó el usuario
export const ESTADO_VACIO: FichaState = {
  numeroElemento: '',
  nombre: '',
  fotoUrl: null,
  puesto: 'GUARDIA DE SEGURIDAD',
  fechaNacimiento: '',
  edad: '',
  lugarNacimiento: 'MÉXICO',
  nacionalidad: 'MEXICANA',
  estadoCivil: '',
  estudios: '',
  rfc: '',
  curp: '',
  imss: '',
  sexo: '',
  estatura: '',
  peso: '',
  calleNumero: '',
  colonia: '',
  entreCalles: '',
  cp: '',
  delegacionMunicipio: '',
  estado: '',
  tiempoResidencia: '',
  tiempoRadicarEstado: '',
  telefonoEmergencia: '',
  celular: '',
  empleos: [
    { empresa: '', periodo: '', puesto: '' },
    { empresa: '', periodo: '', puesto: '' },
  ],
  fechaDocumento: calcularFechaHoy(),
};

interface Props {
  onVolver?: () => void;
  initialGuardiaId?: number | string;
  embedded?: boolean;
  fullScreen?: boolean;
  pageMode?: boolean;
  volverUrl?: string;
  onGuardadoExitoso?: () => void;
  onClose?: () => void;
}

export default function MachoteFichaTecnica({
  onVolver,
  initialGuardiaId,
  embedded = false,
  fullScreen = false,
  pageMode = false,
  volverUrl,
  onGuardadoExitoso,
  onClose,
}: Props) {
  const queryClient = useQueryClient();
  const [ficha, setFicha] = useState<FichaState>(ESTADO_VACIO);
  const [selectedGuardiaId, setSelectedGuardiaId] = useState<string>(
    initialGuardiaId ? String(initialGuardiaId) : ''
  );
  const [zoomVista, setZoomVista] = useState<number>(100);
  const [descargandoPdf, setDescargandoPdf] = useState(false);
  const [imprimiendoPdf, setImprimiendoPdf] = useState(false);
  const [guardandoDb, setGuardandoDb] = useState(false);
  const [arrastrandoFoto, setArrastrandoFoto] = useState(false);
  const inputFotoRef = useRef<HTMLInputElement>(null);

  // Consulta de guardias registrados en la base de datos
  const { data: guardias = [] } = useQuery({
    queryKey: ['guardias'],
    queryFn: () => apiFetch<any[]>('/api/guardias'),
  });

  // Si se pasa initialGuardiaId o cambia selectedGuardiaId, cargar datos
  useEffect(() => {
    if (initialGuardiaId) {
      cargarDatosGuardia(String(initialGuardiaId));
    }
  }, [initialGuardiaId]);

  // Tecla Escape para salir del editor a pantalla completa y regresar al perfil
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onClose) onClose();
        else if (onVolver) onVolver();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onVolver]);

  const actualizarFicha = (actualizador: (prev: FichaState) => FichaState) => {
    setFicha((prev) => {
      const nuevo = actualizador(prev);
      try {
        if (!embedded) {
          window.localStorage.setItem(LLAVE_STORAGE, JSON.stringify(nuevo));
        }
      } catch {
        /* sin persistencia */
      }
      return nuevo;
    });
  };

  const actualizarCampo = (campo: keyof FichaState, valor: any) => {
    actualizarFicha((f) => ({ ...f, [campo]: valor }));
  };

  const actualizarEmpleo = (idx: number, campo: keyof Empleo, valor: string) => {
    actualizarFicha((f) => {
      const nuevos = [...f.empleos];
      nuevos[idx] = { ...nuevos[idx], [campo]: valor };
      return { ...f, empleos: nuevos };
    });
  };

  const procesarArchivoFoto = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor selecciona una imagen válida (JPG o PNG)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      actualizarCampo('fotoUrl', url);
      toast.success('Fotografía cargada');
    };
    reader.readAsDataURL(file);
  };

  const cargarDatosGuardia = async (guardiaId: string) => {
    if (!guardiaId) return;
    setSelectedGuardiaId(guardiaId);
    const toastId = toast.loading('Cargando expediente del guardia...');

    try {
      const res = await apiFetch<{ guardia: any; ficha: FichaState | null }>(
        `/api/guardias/${guardiaId}/ficha`
      );

      if (res.ficha) {
        let f = res.ficha;
        // Si no tiene colonia ni delegación pero calleNumero viene con desglose o semicolons, desglosar
        if (!f.colonia && !f.delegacionMunicipio && f.calleNumero && (f.calleNumero.includes(';') || /,\s*col/i.test(f.calleNumero))) {
          const d = desglosarDireccion(f.calleNumero);
          f = {
            ...f,
            calleNumero: d.calleNumero,
            colonia: d.colonia || f.colonia,
            delegacionMunicipio: d.delegacionMunicipio || f.delegacionMunicipio,
            estado: d.estado || f.estado,
            cp: d.cp || f.cp,
          };
        }
        setFicha(f);
        toast.success(`Ficha técnica cargada: ${res.guardia.nombre}`, { id: toastId });
      } else {
        // Inicializar con los datos básicos que ya tenga el guardia en la BD
        const g = res.guardia;
        const d = desglosarDireccion(g.direccion);
        setFicha({
          ...ESTADO_VACIO,
          nombre: (g.nombre || '').toUpperCase(),
          numeroElemento: (g.numero_elemento || '').toUpperCase(),
          celular: g.telefono || '',
          calleNumero: d.calleNumero,
          colonia: d.colonia,
          delegacionMunicipio: d.delegacionMunicipio,
          estado: d.estado,
          cp: d.cp,
          fechaDocumento: calcularFechaHoy(),
        });
        toast.success(`Guardia seleccionado: ${g.nombre} (plantilla en blanco lista para llenar)`, {
          id: toastId,
        });
      }
    } catch {
      // Fallback local si la llamada falla
      const g = guardias.find((item) => String(item.id) === String(guardiaId));
      if (g) {
        const d = desglosarDireccion(g.direccion);
        setFicha({
          ...ESTADO_VACIO,
          nombre: (g.nombre || '').toUpperCase(),
          numeroElemento: (g.numero_elemento || '').toUpperCase(),
          celular: g.telefono || '',
          calleNumero: d.calleNumero,
          colonia: d.colonia,
          delegacionMunicipio: d.delegacionMunicipio,
          estado: d.estado,
          cp: d.cp,
          fechaDocumento: calcularFechaHoy(),
        });
        toast.success(`Guardia seleccionado: ${g.nombre}`, { id: toastId });
      } else {
        toast.error('No se pudo cargar la información del guardia', { id: toastId });
      }
    }
  };

  // Guardar en la base de datos (expediente del guardia)
  const guardarEnExpediente = async () => {
    if (!selectedGuardiaId) {
      toast.error('Por favor selecciona primero un guardia para guardar su ficha en su expediente');
      return;
    }

    setGuardandoDb(true);
    const toastId = toast.loading('Guardando ficha técnica en el expediente...');
    try {
      const res = await apiFetch<{ ok: boolean; guardia: any }>(
        `/api/guardias/${selectedGuardiaId}/ficha`,
        {
          method: 'PUT',
          body: JSON.stringify({ ficha }),
        }
      );

      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['guardias'] });
        queryClient.invalidateQueries({ queryKey: ['guardia-ficha', selectedGuardiaId] });
        queryClient.invalidateQueries({ queryKey: ['guardia-documentos'] });
        toast.success(`Ficha técnica guardada exitosamente en el expediente de ${res.guardia?.nombre}`, {
          id: toastId,
        });
        if (onGuardadoExitoso) {
          onGuardadoExitoso();
        }
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Error al guardar en el expediente', { id: toastId });
    } finally {
      setGuardandoDb(false);
    }
  };

  const descargarPdfServidor = async () => {
    setDescargandoPdf(true);
    const toastId = toast.loading('Generando documento PDF oficial...');
    try {
      const token = localStorage.getItem('inv_token');
      const res = await fetch('/api/guardias/ficha-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(ficha),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al generar el PDF en el servidor');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeName = ficha.numeroElemento || (ficha.nombre ? ficha.nombre.replace(/[^a-zA-Z0-9]/g, '_') : 'guardia');
      link.href = url;
      link.download = `ficha_tecnica_${safeName}.pdf`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 1000);

      toast.success('Ficha técnica PDF descargada con éxito', { id: toastId });
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Error al generar el PDF', { id: toastId });
    } finally {
      setDescargandoPdf(false);
    }
  };

  // Imprimir usa el mismo PDF oficial generado por el servidor (una sola
  // hoja Carta, ya calibrado) en vez de imprimir el formulario en pantalla:
  // eso evitaba que los placeholders ("EJ. 5 AÑOS", etc.) salieran impresos
  // en gris y que el documento se repartiera en 2 hojas.
  // Imprimir directo en la misma pantalla sin abrir otra pestaña del navegador:
  // Se genera el PDF oficial en segundo plano y se invoca el diálogo de impresión
  // nativo a través de un iframe invisible.
  const handleImprimir = async () => {
    setImprimiendoPdf(true);
    const toastId = toast.loading('Preparando impresión oficial...');
    try {
      const token = localStorage.getItem('inv_token');
      const res = await fetch('/api/guardias/ficha-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(ficha),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al generar el PDF en el servidor');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      // Creamos un iframe oculto en el documento para imprimir directamente
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      iframe.src = url;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          toast.success('Diálogo de impresión listo', { id: toastId });
        } catch (printErr) {
          console.warn('Fallback a ventana directa de impresión:', printErr);
          window.print();
        }
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
          window.URL.revokeObjectURL(url);
        }, 60000);
      };
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Error al preparar la impresión', { id: toastId });
    } finally {
      setImprimiendoPdf(false);
    }
  };

  const selectedGuardiaNombre = guardias.find((g: any) => String(g.id) === String(selectedGuardiaId))?.nombre;

  return (
    <div className={pageMode ? "space-y-4 animate-in fade-in duration-300 pb-16 font-sans" : fullScreen ? "fixed inset-0 z-[250] bg-slate-900 flex flex-col overflow-hidden text-foreground animate-in fade-in duration-200" : "space-y-4"}>
      {/* Estilos para impresión exacta en 1 hoja Carta vertical */}
      <style>{`
        @page {
          size: letter portrait;
          margin: 4mm 6mm;
        }
        @media print {
          html, body {
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: #ffffff !important;
          }
          /* Quitar el overflow o position fixed de contenedores padre para no cortar páginas */
          div, main, section {
            overflow: visible !important;
            position: static !important;
          }
          body * {
            visibility: hidden;
          }
          /* El formulario en vivo (con textareas que se autoajustan por JS y
             pueden recortarse o repartirse en más de una hoja al imprimir
             directo) ya NO se imprime aquí. El botón "Imprimir" genera el PDF
             oficial ya validado en una sola hoja Carta y lo abre en una
             pestaña nueva; si alguien imprime esta pantalla con Ctrl+P sin
             pasar por ese botón, mostramos un aviso en vez del formulario. */
          #ficha-print-area, #ficha-print-area * {
            visibility: hidden !important;
          }
          #ficha-print-fallback-msg, #ficha-print-fallback-msg * {
            visibility: visible !important;
          }
          #ficha-print-fallback-msg {
            display: flex !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 30mm 20mm !important;
            margin: 0 !important;
            background: #fff !important;
            box-shadow: none !important;
            border: none !important;
            transform: none !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            flex-direction: column;
            align-items: center;
            text-align: center;
            gap: 4mm;
            font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
            color: #0f172a;
          }
          .mch-ft-sheet {
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: auto !important;
            height: auto !important;
            margin: 0 !important;
            padding: 1mm 3mm !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          table, tr, td, th {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .mch-ft-input, .mch-ft-textarea {
            border: none !important;
            outline: none !important;
            background: transparent !important;
            box-shadow: none !important;
            padding: 0 !important;
            color: #0f172a !important;
            resize: none !important;
            overflow: visible !important;
            height: auto !important;
          }
          /* Los placeholders (textos de ejemplo como "EJ. 5 AÑOS") son solo
             una guía visual del formulario: nunca deben salir impresos. */
          .mch-ft-input::placeholder,
          .mch-ft-textarea::placeholder {
            color: transparent !important;
            opacity: 0 !important;
          }
          .mch-ft-input-name {
            color: #C00000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .mch-watermark {
            opacity: 0.12 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-hidden-btn, header, nav, footer, .mch-top-bar {
            display: none !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }

        .mch-ft-sheet {
          position: relative;
          width: 190mm;
          min-height: 255mm;
          margin: 0 auto;
          background: #ffffff;
          padding: 6mm 10mm;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          color: #0f172a;
          font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
        }

        .mch-ft-critico {
          background-color: #fef3c7 !important;
          color: #78350f !important;
          border-bottom: 2px solid #f59e0b !important;
          border-radius: 2px !important;
          font-weight: 600 !important;
        }
        @media print {
          .mch-ft-critico {
            background-color: transparent !important;
            background: none !important;
            color: inherit !important;
            border: none !important;
            border-bottom: none !important;
            font-weight: inherit !important;
            box-shadow: none !important;
          }
        }

        .mch-ft-textarea {
          width: 100%;
          min-height: 18px;
          border: 1px solid transparent;
          border-radius: 2px;
          background: transparent;
          padding: 1px 3px;
          font-size: 7.5pt;
          line-height: 1.25;
          font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
          color: inherit;
          text-transform: uppercase;
          outline: none;
          resize: none;
          overflow: hidden;
          display: block;
          box-sizing: border-box;
          white-space: pre-wrap;
          word-break: break-word;
          overflow-wrap: anywhere;
          transition: border-color 0.15s, background-color 0.15s;
        }
        .mch-ft-textarea:hover {
          border-color: #94a3b8;
          background-color: rgba(241, 245, 249, 0.7);
        }
        .mch-ft-textarea:focus {
          border-color: #1d4ed8;
          background-color: #ffffff;
        }
        .mch-ft-textarea::placeholder {
          color: #94a3b8;
          font-size: 7pt;
          text-transform: none;
        }

        .mch-ft-input {
          width: 100%;
          border: 1px solid transparent;
          border-radius: 2px;
          background: transparent;
          padding: 1px 3px;
          font-size: 8pt;
          font-family: inherit;
          color: inherit;
          text-transform: uppercase;
          outline: none;
          transition: border-color 0.15s, background-color 0.15s;
        }
        .mch-ft-input:hover {
          border-color: #94a3b8;
          background-color: rgba(241, 245, 249, 0.6);
        }
        .mch-ft-input:focus {
          border-color: #1d4ed8;
          background-color: #fff;
        }

        .mch-ft-input-name {
          color: #C00000 !important;
          font-weight: 900 !important;
        }
        .mch-ft-input-name::placeholder {
          color: rgba(192, 0, 0, 0.45) !important;
          font-weight: 800 !important;
        }

        .mch-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          margin-bottom: 1.8mm;
          border: 1.5px solid #0f172a;
        }
        .mch-table td {
          border: 1px solid #0f172a;
          padding: 2px 3.5px;
          font-size: 7.5pt;
          line-height: 1.22;
          vertical-align: middle;
          word-break: break-word;
          overflow-wrap: anywhere;
        }
        .mch-table td.lbl {
          background-color: #DEEAF6 !important;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: 0.2px;
        }
        .mch-table td.val {
          background-color: transparent !important;
        }
      `}</style>

      {/* Barra de herramientas superior (oculta en impresión) */}
      {pageMode ? (
        <div className="bg-card border border-border rounded-xl p-3 sm:p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-3">
            <Link href={volverUrl || (selectedGuardiaId ? `/guardias/${selectedGuardiaId}` : "/guardias")}>
              <Button variant="ghost" size="sm" className="h-9 px-2 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-4 h-4 mr-1" /> Volver al Expediente
              </Button>
            </Link>
            <div className="h-5 w-px bg-border hidden sm:block" />
            <div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" /> Ficha Técnica Oficial — {selectedGuardiaNombre || ficha.nombre || 'Guardia'}
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Expediente Digital del Elemento · Formato Oficial U3 Seguridad Privada
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <span className="text-xs font-mono font-bold uppercase px-2.5 py-1 rounded bg-primary/10 text-primary border border-primary/20">
              EXP-FT-{selectedGuardiaId || 'NUEVO'}
            </span>
            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-muted text-muted-foreground border border-border">
              Recursos Humanos
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-end">
            {/* Controles de Zoom */}
            <div className="hidden sm:flex items-center bg-muted/60 rounded-lg p-0.5 border border-border">
              <button
                type="button"
                onClick={() => setZoomVista((z) => Math.max(60, z - 10))}
                title="Alejar"
                className="p-1.5 hover:bg-background rounded text-muted-foreground hover:text-foreground"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono px-2 text-muted-foreground">
                {zoomVista}%
              </span>
              <button
                type="button"
                onClick={() => setZoomVista((z) => Math.min(130, z + 10))}
                title="Acercar"
                className="p-1.5 hover:bg-background rounded text-muted-foreground hover:text-foreground"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoomVista(100)}
                title="Restablecer"
                className="p-1.5 hover:bg-background rounded text-muted-foreground hover:text-foreground border-l border-border"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>

            {/* Selector de Fotografía */}
            <input
              type="file"
              ref={inputFotoRef}
              accept="image/*"
              className="hidden"
              onChange={(e) => procesarArchivoFoto(e.target.files?.[0])}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold"
              onClick={() => inputFotoRef.current?.click()}
            >
              <ImageUp className="w-3.5 h-3.5 mr-1.5" />
              {ficha.fotoUrl ? 'Cambiar Foto' : 'Subir Foto'}
            </Button>
            {ficha.fotoUrl && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-destructive hover:bg-destructive/10"
                onClick={() => {
                  actualizarCampo('fotoUrl', null);
                  toast.info('Fotografía removida');
                }}
                title="Eliminar fotografía"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}

            {/* Botón Imprimir / PDF */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold"
              disabled={imprimiendoPdf}
              onClick={handleImprimir}
              title="Genera la ficha técnica y la abre en el visor de impresión"
            >
              {imprimiendoPdf ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Printer className="w-3.5 h-3.5 mr-1.5" />}
              Imprimir / PDF
            </Button>

            {/* Descargar PDF servidor */}
            <Button
              variant="secondary"
              size="sm"
              className="h-8 text-xs font-semibold"
              disabled={descargandoPdf}
              onClick={descargarPdfServidor}
              title="Descarga el PDF oficial listo para archivar"
            >
              {descargandoPdf ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
              Descargar PDF
            </Button>

            {/* Guardar cambios */}
            <Button
              size="sm"
              className="h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow"
              disabled={guardandoDb || !selectedGuardiaId}
              onClick={guardarEnExpediente}
            >
              {guardandoDb ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Guardando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-white" /> Guardar Cambios
                </>
              )}
            </Button>
          </div>
        </div>
      ) : fullScreen ? (
        <header className="h-14 bg-slate-950/95 border-b border-slate-800 text-white px-4 sm:px-6 flex items-center justify-between flex-shrink-0 z-20 shadow-md print:hidden">
          <div className="flex items-center gap-3 min-w-0">
            {(onClose || onVolver) && (
              <Button
                variant="outline"
                size="sm"
                onClick={onClose || onVolver}
                className="bg-slate-900 border-slate-700 text-slate-100 hover:text-white hover:bg-slate-800 text-xs font-bold gap-2 px-3 py-1.5 shadow-sm transition-all"
                title="Regresar al perfil del guardia"
              >
                <ArrowLeft className="w-4 h-4 text-primary" />
                {selectedGuardiaNombre || ficha.nombre
                  ? `Volver al Perfil`
                  : 'Volver al Perfil del Guardia'}
              </Button>
            )}
            <div className="h-4 w-px bg-slate-800 hidden sm:block" />
            <span className="text-xs sm:text-sm font-bold text-white truncate flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Ficha Técnica — {selectedGuardiaNombre || ficha.nombre || 'Guardia'}
            </span>
            <span className="hidden md:inline-flex items-center text-[10px] font-semibold bg-primary/20 text-primary-foreground border border-primary/30 px-2 py-0.5 rounded-full">
              Modo Pantalla Completa
            </span>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Control de Zoom */}
            <div className="hidden sm:flex items-center gap-1 border border-slate-700 rounded-lg p-0.5 bg-slate-900">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-300 hover:text-white hover:bg-slate-800"
                onClick={() => setZoomVista((z) => Math.max(60, z - 10))}
                title="Reducir zoom"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs font-mono px-1.5 text-slate-300 min-w-[38px] text-center">
                {zoomVista}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-300 hover:text-white hover:bg-slate-800"
                onClick={() => setZoomVista((z) => Math.min(130, z + 10))}
                title="Aumentar zoom"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Input Foto */}
            <input
              type="file"
              ref={inputFotoRef}
              accept="image/*"
              className="hidden"
              onChange={(e) => procesarArchivoFoto(e.target.files?.[0])}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white"
              onClick={() => inputFotoRef.current?.click()}
            >
              <ImageUp className="w-3.5 h-3.5 mr-1.5" />
              {ficha.fotoUrl ? 'Cambiar Foto' : 'Subir Foto'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white"
              disabled={imprimiendoPdf}
              onClick={handleImprimir}
            >
              {imprimiendoPdf ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Printer className="w-3.5 h-3.5 mr-1.5" />}
              Imprimir
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white"
              disabled={descargandoPdf}
              onClick={descargarPdfServidor}
            >
              {descargandoPdf ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
              PDF
            </Button>

            <Button
              size="sm"
              className="h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md gap-1.5"
              disabled={guardandoDb || !selectedGuardiaId}
              onClick={guardarEnExpediente}
            >
              {guardandoDb ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Guardar en Expediente
            </Button>

            {(onClose || onVolver) && (
              <button
                onClick={onClose || onVolver}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
                title="Cerrar editor y volver al perfil"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {(onClose || onVolver) && (
                <>
                  <Button variant="ghost" size="sm" onClick={onClose || onVolver} className="font-semibold text-xs gap-1.5">
                    <ArrowLeft className="w-4 h-4 mr-1 text-primary" />
                    {selectedGuardiaNombre || ficha.nombre
                      ? `Volver al Perfil`
                      : 'Volver'}
                  </Button>
                  <div className="h-5 w-px bg-border mx-1" />
                </>
              )}
              <span className="text-sm font-semibold tracking-tight flex items-center gap-1.5">
                Ficha Técnica Oficial de Guardia
              </span>
              {selectedGuardiaNombre && (
                <span className="text-xs bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full">
                  {selectedGuardiaNombre}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Control de Zoom */}
              <div className="flex items-center gap-1 border border-border rounded-lg p-0.5 bg-muted/30">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setZoomVista((z) => Math.max(70, z - 10))}
                  title="Reducir zoom"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </Button>
                <span className="text-xs font-mono px-1.5 text-muted-foreground min-w-[42px] text-center">
                  {zoomVista}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setZoomVista((z) => Math.min(130, z + 10))}
                  title="Aumentar zoom"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Guardar en el Expediente */}
              <Button
                size="sm"
                variant="default"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow"
                disabled={guardandoDb || !selectedGuardiaId}
                onClick={guardarEnExpediente}
                title={selectedGuardiaId ? 'Guarda los datos permanentemente en el expediente del guardia' : 'Selecciona un guardia para guardar'}
              >
                {guardandoDb ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-1.5" />
                )}
                Guardar en Expediente
              </Button>

              {/* Imprimir / Guardar como PDF */}
              <Button
                variant="outline"
                size="sm"
                disabled={imprimiendoPdf}
                onClick={handleImprimir}
                title="Genera el PDF oficial y lo abre en una pestaña para imprimir o guardar"
              >
                {imprimiendoPdf ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Printer className="w-4 h-4 mr-1.5" />}
                Imprimir / PDF
              </Button>

              {/* Descargar PDF generado por el servidor */}
              <Button
                size="sm"
                variant="secondary"
                disabled={descargandoPdf}
                onClick={descargarPdfServidor}
                title="Genera y descarga el archivo PDF oficial listo para archivar"
              >
                {descargandoPdf ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-1.5" />
                )}
                Descargar PDF
              </Button>
            </div>
          </div>

          {/* Fila secundaria: selectores rápidos */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border text-xs">
            {/* Cargar guardia existente */}
            <div className="flex items-center gap-1.5 min-w-[240px]">
              <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={selectedGuardiaId}
                onChange={(e) => cargarDatosGuardia(e.target.value)}
              >
                <option value="">
                  {selectedGuardiaId ? '-- Cambiar de guardia --' : 'Seleccionar guardia para su expediente...'}
                </option>
                {guardias.map((g: any) => (
                  <option key={g.id} value={g.id}>
                    {g.nombre} · {g.numero_elemento}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => {
                  setSelectedGuardiaId('');
                  setFicha(ESTADO_VACIO);
                  toast.info('Formato restablecido en blanco');
                }}
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Limpiar todo
              </Button>
            </div>

            {/* Selector de Fotografía */}
            <div className="ml-auto flex items-center gap-2">
              <input
                type="file"
                ref={inputFotoRef}
                accept="image/*"
                className="hidden"
                onChange={(e) => procesarArchivoFoto(e.target.files?.[0])}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => inputFotoRef.current?.click()}
              >
                <ImageUp className="w-3.5 h-3.5 mr-1.5" />
                {ficha.fotoUrl ? 'Cambiar Fotografía' : 'Subir Fotografía'}
              </Button>
              {ficha.fotoUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    actualizarCampo('fotoUrl', null);
                    toast.info('Fotografía removida');
                  }}
                  title="Eliminar fotografía"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Banner de revisión visual para datos críticos (solo en pantalla, no se imprime) */}
      {pageMode && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300/80 dark:border-amber-800/60 rounded-xl p-3 sm:px-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs text-amber-900 dark:text-amber-200 print:hidden">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <span>
              <strong>Modo Verificación de Expediente:</strong> Los datos personales y laborales críticos se muestran resaltados en color ámbar para comprobar si están correctos. Este color ámbar <u>no se imprime</u> y sirve de guía visual.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-block w-4 h-3 rounded border border-amber-400 bg-amber-200 dark:bg-amber-800/70" />
            <span className="text-[11px] font-mono text-muted-foreground">Datos Clave</span>
          </div>
        </div>
      )}

      {/* Contenedor del lienzo con zoom */}
      <div className={
        pageMode
          ? "overflow-auto py-8 px-4 bg-muted/20 dark:bg-muted/5 rounded-2xl flex justify-center border border-border/60 min-h-[85vh]"
          : fullScreen
          ? "flex-1 overflow-auto bg-slate-200/90 dark:bg-slate-950 p-6 sm:p-10 flex justify-center items-start"
          : "overflow-auto py-4 bg-muted/20 rounded-xl flex justify-center border border-border/50"
      }>
        <div
          id="ficha-print-area"
          style={{
            transform: zoomVista !== 100 ? `scale(${zoomVista / 100})` : undefined,
            transformOrigin: 'top center',
            transition: 'transform 0.15s ease',
          }}
        >
          <div className="mch-ft-sheet">
            {/* Marca de agua institucional centrada detrás del documento */}
            <div
              className="mch-watermark"
              style={{
                position: 'absolute',
                top: '52%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '145mm',
                opacity: 0.12,
                pointerEvents: 'none',
                zIndex: 0,
              }}
            >
              <img
                src="/logos/u3-watermark.png"
                alt="Marca de agua U3"
                className="w-full h-auto block select-none"
              />
            </div>

            <div className="mch-ft-content" style={{ position: 'relative', zIndex: 1 }}>
              <div className="mch-blk-top">
              {/* Encabezado Institucional Formal */}
              <div
                className="flex items-center justify-between pb-2 mb-2"
                style={{ borderBottom: '2px solid #0f172a' }}
              >
                <div style={{ width: '22mm', flexShrink: 0 }}>
                  <img
                    src="/logos/u3-logo-ficha.png"
                    alt="Logo U3"
                    className="w-full h-auto block"
                  />
                </div>
                <div className="text-center flex-1 px-3">
                  <div
                    style={{
                      fontSize: '11pt',
                      fontWeight: 900,
                      letterSpacing: '0.8px',
                      color: '#0f172a',
                    }}
                  >
                    U3 SEGURIDAD PRIVADA S.A. DE C.V.
                  </div>
                  <h1
                    style={{
                      fontSize: '17pt',
                      fontWeight: 800,
                      letterSpacing: '1.5px',
                      color: '#0f172a',
                      margin: '1px 0',
                      textDecoration: 'underline',
                    }}
                  >
                    FICHA TÉCNICA
                  </h1>
                  <div
                    style={{
                      fontSize: '7.5pt',
                      fontWeight: 600,
                      color: '#475569',
                      letterSpacing: '0.5px',
                    }}
                  >
                    CÉDULA OFICIAL DE IDENTIFICACIÓN Y REGISTRO DEL PERSONAL OPERATIVO
                  </div>
                </div>
                {/* Espacio para balancear el logotipo de la izquierda */}
                <div style={{ width: '22mm', flexShrink: 0 }} />
              </div>

              {/* Fotografía centrada */}
              <div className="flex justify-center my-1.5">
                <div
                  className={`relative group cursor-pointer transition-all ${
                    arrastrandoFoto ? 'ring-2 ring-primary ring-offset-2' : ''
                  }`}
                  style={{
                    width: '32mm',
                    height: '40mm',
                    border: '1.5px solid #0f172a',
                    boxShadow: '2px 3px 6px rgba(0, 0, 0, 0.15)',
                    background: '#f8fafc',
                    overflow: 'hidden',
                  }}
                  title="Clic para subir o arrastra una imagen aquí"
                  onClick={() => inputFotoRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setArrastrandoFoto(true);
                  }}
                  onDragLeave={() => setArrastrandoFoto(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setArrastrandoFoto(false);
                    procesarArchivoFoto(e.dataTransfer.files?.[0]);
                  }}
                >
                  {ficha.fotoUrl ? (
                    <>
                      <img
                        src={ficha.fotoUrl}
                        alt="Fotografía del Guardia"
                        className="w-full h-full object-cover block"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-medium print-hidden-btn">
                        Cambiar foto
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 p-2 text-center select-none">
                      <ImageUp className="w-5 h-5 mb-1 text-gray-400" />
                      <span className="text-[8.5px] font-bold uppercase tracking-wider text-gray-500">
                        Fotografía Oficial
                      </span>
                      <span className="text-[7.5px] text-gray-400 mt-0.5 print:hidden">
                        Clic o arrastra
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Nombre del elemento en rojo corporativo que se visualiza completo */}
              <div className="flex justify-center mb-2 px-1">
                <div
                  className="inline-block text-center"
                  style={{
                    borderBottom: '2.5px solid #C00000',
                    maxWidth: '168mm',
                    minWidth: '400px',
                    width: '100%',
                  }}
                >
                  <FichaCellInput
                    className="mch-ft-input-name text-center font-black mch-ft-critico"
                    style={{
                      fontSize: '12pt',
                      fontWeight: 900,
                      letterSpacing: '0.8px',
                      color: '#C00000',
                      width: '100%',
                      padding: '2px 0',
                    }}
                    value={ficha.nombre}
                    onChange={(val) => actualizarCampo('nombre', val)}
                    placeholder="NOMBRE COMPLETO DEL GUARDIA"
                    minHeight={26}
                  />
                </div>
              </div>

              {/* Recuadro Puesto */}
              <table
                className="mch-table"
                style={{
                  width: '60mm',
                  margin: '0 auto 2.5mm auto',
                }}
              >
                <tbody>
                  <tr>
                    <td
                      className="lbl text-center"
                      style={{
                        fontSize: '7.5pt',
                        padding: '1.5px 0',
                        letterSpacing: '0.5px',
                        fontWeight: 800,
                      }}
                    >
                      PUESTO / CATEGORÍA
                    </td>
                  </tr>
                  <tr>
                    <td
                      className="val text-center"
                      style={{
                        padding: '1.5px 4px',
                      }}
                    >
                      <FichaCellInput
                        className="text-center font-extrabold mch-ft-critico"
                        style={{ fontSize: '8.5pt', fontWeight: 800 }}
                        value={ficha.puesto}
                        onChange={(val) => actualizarCampo('puesto', val)}
                        placeholder="GUARDIA DE SEGURIDAD"
                        minHeight={18}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
              </div>

              {/* I. DATOS PERSONALES */}
              <div className="mch-blk-seccion">
              <div
                className="font-bold text-[8.5pt] uppercase tracking-wide my-1 flex items-center gap-2"
                style={{ color: '#0f172a' }}
              >
                <span>I. Datos Personales y Filiación</span>
                <span className="flex-1 h-px bg-slate-300" />
              </div>
              <table className="mch-table">
                <colgroup>
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '28%' }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="lbl">FECHA DE NACIMIENTO:</td>
                    <td className="val">
                      <FichaCellInput
                        className="mch-ft-critico"
                        value={ficha.fechaNacimiento}
                        onChange={(val) => actualizarCampo('fechaNacimiento', val)}
                        placeholder="DD/MM/AAAA"
                      />
                    </td>
                    <td className="lbl">EDAD:</td>
                    <td className="val">
                      <FichaCellInput
                        className="mch-ft-critico"
                        value={ficha.edad}
                        onChange={(val) => actualizarCampo('edad', val)}
                        placeholder="EJ. 35 AÑOS"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="lbl">LUGAR DE NACIMIENTO:</td>
                    <td className="val">
                      <FichaCellInput
                        value={ficha.lugarNacimiento}
                        onChange={(val) => actualizarCampo('lugarNacimiento', val)}
                        placeholder="CIUDAD / ESTADO"
                      />
                    </td>
                    <td className="lbl">NACIONALIDAD:</td>
                    <td className="val">
                      <FichaCellInput
                        value={ficha.nacionalidad}
                        onChange={(val) => actualizarCampo('nacionalidad', val)}
                        placeholder="MEXICANA"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="lbl">ESTADO CIVIL:</td>
                    <td className="val">
                      <FichaCellInput
                        value={ficha.estadoCivil}
                        onChange={(val) => actualizarCampo('estadoCivil', val)}
                        placeholder="SOLTERO / CASADO"
                      />
                    </td>
                    <td className="lbl">ESTUDIOS:</td>
                    <td className="val">
                      <FichaCellInput
                        value={ficha.estudios}
                        onChange={(val) => actualizarCampo('estudios', val)}
                        placeholder="NIVEL ACADÉMICO"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="lbl">RFC:</td>
                    <td className="val">
                      <FichaCellInput
                        className="mch-ft-critico"
                        value={ficha.rfc}
                        onChange={(val) => actualizarCampo('rfc', val)}
                        placeholder="13 POSICIONES"
                      />
                    </td>
                    <td className="lbl">CURP:</td>
                    <td className="val">
                      <FichaCellInput
                        className="mch-ft-critico"
                        value={ficha.curp}
                        onChange={(val) => actualizarCampo('curp', val)}
                        placeholder="18 POSICIONES"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="lbl">AFILIACIÓN IMSS:</td>
                    <td className="val">
                      <FichaCellInput
                        className="mch-ft-critico"
                        value={ficha.imss}
                        onChange={(val) => actualizarCampo('imss', val)}
                        placeholder="NSS 11 DÍGITOS"
                      />
                    </td>
                    <td className="lbl">SEXO:</td>
                    <td className="val">
                      <FichaCellInput
                        value={ficha.sexo}
                        onChange={(val) => actualizarCampo('sexo', val)}
                        placeholder="MASCULINO / FEMENINO"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="lbl">ESTATURA:</td>
                    <td className="val">
                      <FichaCellInput
                        value={ficha.estatura}
                        onChange={(val) => actualizarCampo('estatura', val)}
                        placeholder="EJ. 1.75 M"
                      />
                    </td>
                    <td className="lbl">PESO APROXIMADO:</td>
                    <td className="val">
                      <FichaCellInput
                        value={ficha.peso}
                        onChange={(val) => actualizarCampo('peso', val)}
                        placeholder="EJ. 78 KG"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
              </div>

              {/* II. DOMICILIO */}
              <div className="mch-blk-seccion">
              <div
                className="font-bold text-[8.5pt] uppercase tracking-wide my-1 flex items-center justify-between gap-2"
                style={{ color: '#0f172a' }}
              >
                <div className="flex items-center gap-2 flex-1">
                  <span>II. Domicilio Actual y Contacto</span>
                  <span className="flex-1 h-px bg-slate-300" />
                </div>
                {ficha.calleNumero && (ficha.calleNumero.includes(';') || /,\s*col/i.test(ficha.calleNumero)) && !ficha.colonia && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-2 text-[7pt] text-primary hover:bg-primary/10 gap-1 print:hidden"
                    onClick={() => {
                      const d = desglosarDireccion(ficha.calleNumero);
                      actualizarFicha((f) => ({
                        ...f,
                        calleNumero: d.calleNumero,
                        colonia: d.colonia || f.colonia,
                        delegacionMunicipio: d.delegacionMunicipio || f.delegacionMunicipio,
                        estado: d.estado || f.estado,
                        cp: d.cp || f.cp,
                      }));
                      toast.success('Dirección desglosada en casilleros');
                    }}
                    title="Separar automáticamente la calle, colonia, municipio y estado en sus casilleros"
                  >
                    <Sparkles className="w-3 h-3" /> Separar en casilleros
                  </Button>
                )}
              </div>
              <table className="mch-table">
                <colgroup>
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '31%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '28%' }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="lbl">CALLE Y NÚMERO</td>
                    <td className="val">
                      <FichaCellInput
                        className="mch-ft-critico"
                        value={ficha.calleNumero}
                        onChange={(val) => actualizarCampo('calleNumero', val)}
                        placeholder="CALLE, NO. EXT. E INT."
                      />
                    </td>
                    <td className="lbl">COLONIA</td>
                    <td className="val">
                      <FichaCellInput
                        className="mch-ft-critico"
                        value={ficha.colonia}
                        onChange={(val) => actualizarCampo('colonia', val)}
                        placeholder="COLONIA / FRACC."
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="lbl">ENTRE LAS CALLES</td>
                    <td className="val">
                      <FichaCellInput
                        value={ficha.entreCalles}
                        onChange={(val) => actualizarCampo('entreCalles', val)}
                        placeholder="CALLES ALEDAÑAS"
                      />
                    </td>
                    <td className="lbl">C.P.</td>
                    <td className="val">
                      <FichaCellInput
                        value={ficha.cp}
                        onChange={(val) => actualizarCampo('cp', val)}
                        placeholder="CÓDIGO POSTAL"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="lbl">DELEGACIÓN / MUNICIPIO</td>
                    <td className="val">
                      <FichaCellInput
                        className="mch-ft-critico"
                        value={ficha.delegacionMunicipio}
                        onChange={(val) => actualizarCampo('delegacionMunicipio', val)}
                        placeholder="ALCALDÍA O MUNICIPIO"
                      />
                    </td>
                    <td className="lbl">ESTADO</td>
                    <td className="val">
                      <FichaCellInput
                        value={ficha.estado}
                        onChange={(val) => actualizarCampo('estado', val)}
                        placeholder="ESTADO DE MÉXICO / CDMX"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="lbl">TIEMPO DE RESIDENCIA</td>
                    <td className="val">
                      <FichaCellInput
                        value={ficha.tiempoResidencia}
                        onChange={(val) => actualizarCampo('tiempoResidencia', val)}
                        placeholder="EJ. 5 AÑOS"
                      />
                    </td>
                    <td className="lbl">TIEMPO DE RADICAR EN EL EDO. DE MÉXICO</td>
                    <td className="val">
                      <FichaCellInput
                        value={ficha.tiempoRadicarEstado}
                        onChange={(val) => actualizarCampo('tiempoRadicarEstado', val)}
                        placeholder="EJ. 10 AÑOS"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="lbl">TELÉFONO DE EMERGENCIA</td>
                    <td className="val">
                      <FichaCellInput
                        value={ficha.telefonoEmergencia}
                        onChange={(val) => actualizarCampo('telefonoEmergencia', val)}
                        placeholder="TEL. DE CONTACTO FAMILIAR"
                      />
                    </td>
                    <td className="lbl">CELULAR</td>
                    <td className="val">
                      <FichaCellInput
                        className="mch-ft-critico"
                        value={ficha.celular}
                        onChange={(val) => actualizarCampo('celular', val)}
                        placeholder="10 DÍGITOS"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
              </div>

              {/* III. ANTECEDENTES LABORALES */}
              <div className="mch-blk-seccion">
              <div
                className="font-bold text-[8.5pt] uppercase tracking-wide my-1 flex items-center gap-2"
                style={{ color: '#0f172a' }}
              >
                <span>III. Historial y Antecedentes Laborales</span>
                <span className="flex-1 h-px bg-slate-300" />
              </div>
              <table className="mch-table">
                <colgroup>
                  <col style={{ width: '42%' }} />
                  <col style={{ width: '58%' }} />
                </colgroup>
                <tbody>
                  {ficha.empleos.map((emp, i) => (
                    <tr key={`emp-${i}-grupo`}>
                      <td colSpan={2} style={{ padding: 0, border: 'none' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <tbody>
                            <tr>
                              <td className="lbl" style={{ width: '42%', border: '1px solid #0f172a' }}>
                                EMPRESA / RAZÓN SOCIAL:
                              </td>
                              <td className="val" style={{ width: '58%', border: '1px solid #0f172a' }}>
                                <FichaCellInput
                                  className="font-medium"
                                  value={emp.empresa}
                                  onChange={(val) => actualizarEmpleo(i, 'empresa', val)}
                                  placeholder="EMPRESA ANTERIOR"
                                />
                              </td>
                            </tr>
                            <tr>
                              <td className="lbl" style={{ border: '1px solid #0f172a' }}>
                                PERÍODO:
                              </td>
                              <td className="val" style={{ border: '1px solid #0f172a' }}>
                                <FichaCellInput
                                  value={emp.periodo}
                                  onChange={(val) => actualizarEmpleo(i, 'periodo', val)}
                                  placeholder="EJ. 2021 - 2023"
                                />
                              </td>
                            </tr>
                            <tr>
                              <td className="lbl" style={{ border: '1px solid #0f172a' }}>
                                PUESTO DESEMPEÑADO:
                              </td>
                              <td className="val" style={{ border: '1px solid #0f172a' }}>
                                <FichaCellInput
                                  className="font-medium"
                                  value={emp.puesto}
                                  onChange={(val) => actualizarEmpleo(i, 'puesto', val)}
                                  placeholder="EJ. GUARDIA DE SEGURIDAD"
                                />
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>

              <div className="mch-blk-bottom">
              {/* Fecha al calce */}
              <div className="text-right mt-2 mb-1 flex justify-end">
                <div style={{ maxWidth: '380px', width: '100%' }}>
                  <FichaCellInput
                    className="text-right font-bold"
                    style={{ fontSize: '7.5pt', color: '#334155' }}
                    value={ficha.fechaDocumento}
                    onChange={(val) => actualizarCampo('fechaDocumento', val)}
                  />
                </div>
              </div>

              {/* Pie de página con web y logo institucional */}
              <div
                className="flex items-end justify-between pt-1.5 mt-2 pb-1"
                style={{ borderTop: '1px solid #94a3b8' }}
              >
                <div
                  style={{
                    fontSize: '7.5pt',
                    color: '#475569',
                    letterSpacing: '0.3px',
                    fontWeight: 600,
                  }}
                >
                  www.u3seguridadprivada.com · Uso Oficial y Confidencial
                </div>
                <div style={{ width: '19mm' }}>
                  <img
                    src="/logos/u3-footer-logo.png"
                    alt="U3 Seguridad Privada"
                    className="w-full h-auto block pb-0.5"
                  />
                </div>
              </div>
              </div>
            </div>
          </div>
        </div>

        {/* Aviso que solo aparece al imprimir esta pantalla directamente
            (p. ej. con Ctrl+P) sin pasar por el botón "Imprimir": el
            formulario en vivo no se imprime porque no se puede garantizar
            que quepa en una sola hoja. Oculto en pantalla. */}
        <div id="ficha-print-fallback-msg" style={{ display: 'none' }}>
          <Printer className="w-10 h-10 text-slate-400" />
          <p style={{ fontSize: '13pt', fontWeight: 800 }}>
            Usa el botón &quot;Imprimir&quot; de la ficha técnica
          </p>
          <p style={{ fontSize: '10pt', color: '#475569', maxWidth: '140mm' }}>
            Esta pantalla es el formulario de edición y no se imprime directamente.
            Cierra este cuadro de impresión y usa el botón &quot;Imprimir&quot; o
            &quot;Imprimir / PDF&quot; de la barra superior: genera el documento
            oficial completo en una sola hoja Carta y lo abre en una pestaña
            nueva lista para imprimir.
          </p>
        </div>
      </div>
    </div>
  );
}
