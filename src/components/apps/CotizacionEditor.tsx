'use client';
import { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Select } from '@/src/components/ui/select';
import { ArrowLeft, Plus, Trash2, FileDown, Save, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { COMPANY, COTIZACION_DEFAULTS } from '@/src/lib/company';
import { calcularTotales, type CotizacionItemDraft } from '@/src/lib/cotizacionTemplate';

interface Cliente { id: number; nombre: string; empresa: string | null }

export interface CotizacionFormState {
  clienteId: string;
  fecha: string;
  solicitante: string;
  atencion: string;
  servicioCotizado: string;
  ubicacion: string;
  periodicidad: string;
  vigenciaDias: string;
  asesorNombre: string;
  asesorPuesto: string;
  notas: string;
}

interface CotizacionEditorProps {
  clientes: Cliente[];
  form: CotizacionFormState;
  setForm: React.Dispatch<React.SetStateAction<CotizacionFormState>>;
  items: CotizacionItemDraft[];
  setItems: React.Dispatch<React.SetStateAction<CotizacionItemDraft[]>>;
  onVolver: () => void;
  onGuardar: () => void;
  onGenerarPdf: () => void;
  guardando: boolean;
  generando: boolean;
}

const SECCIONES = [
  { id: 'sec-general', label: 'Cliente' },
  { id: 'sec-partidas', label: 'Partidas' },
  { id: 'sec-condiciones', label: 'Condiciones' },
  { id: 'sec-legales', label: 'Legales' },
  { id: 'sec-firma', label: 'Firma' },
];

/** Tamaño carta a 96dpi (8.5in × 11in), el estándar en México. */
const CARTA_WIDTH_PX = 816;
const CARTA_HEIGHT_PX = 1056;

function MiniHeader({ folio }: { folio: string }) {
  return (
    <>
      <div className="flex items-center justify-between gap-5 border-b-2 pb-4 mb-2" style={{ borderColor: NAVY }}>
        <img src="/LOGO_PDFS.png" alt="U3" className="w-10 h-10 object-contain flex-shrink-0" />
        <div className="flex-1 text-right max-w-[550px] ml-auto">
          <div className="font-extrabold text-xs" style={{ color: NAVY }}>{COMPANY.razonSocial}</div>
          <div className="text-[8px] text-muted-foreground mt-1.5 leading-normal text-right">
            {COMPANY.domicilio}<br />
            Tel: {COMPANY.telefono}. CDMX Permiso DGSPyCI: {COMPANY.permisoDGSPyCI}; Expediente: {COMPANY.expediente}. {COMPANY.web}
          </div>
        </div>
      </div>
      <div className="text-right text-[9px] text-muted-foreground mb-4">
        Folio: <b className="font-mono text-[10.5px] font-bold tracking-wider" style={{ color: NAVY }}>{folio}</b>
      </div>
    </>
  );
}

function Hoja({ numero, total, children }: { numero: number; total: number; children: React.ReactNode }) {
  return (
    <div id={`hoja-${numero}`} className="flex flex-col items-center mb-8 scroll-mt-20">
      <div
        className="bg-white border border-border shadow-md px-10 py-8 sm:px-24 sm:py-9 text-[11.5px] text-foreground flex flex-col"
        style={{ width: CARTA_WIDTH_PX, minWidth: CARTA_WIDTH_PX, minHeight: CARTA_HEIGHT_PX }}
      >
        {children}
        <div className="mt-auto pt-4 flex items-center justify-end gap-1.5 text-[8.5px] font-bold text-muted-foreground border-t border-border/60">
          <img src="/LOGO_PDFS.png" alt="U3" className="w-3.5 h-3.5 object-contain" />
          <span className="tracking-wider">U3 SEGURIDAD PRIVADA</span>
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground mt-1.5">Hoja tamaño carta — 8.5 × 11 in — Página {numero}</span>
    </div>
  );
}

const ITEM_VACIO: CotizacionItemDraft = { descripcion: '', unidad: 'Puesto', cantidad: 1, precio_unitario: 0 };
const NAVY = '#16357a';
const fmtMoney = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}

const inlineInputClass = 'w-full border-0 border-b border-border/40 focus:border-primary focus:ring-0 bg-transparent text-[11.5px] py-0.5 outline-none placeholder:text-muted-foreground/50 transition-colors';
const checkItemClass = "relative pl-[18px] text-justify text-[11.5px] text-muted-foreground before:content-['✓'] before:absolute before:left-0 before:font-bold before:text-[#16357a] leading-normal";

export default function CotizacionEditor({ clientes, form, setForm, items, setItems, onVolver, onGuardar, onGenerarPdf, guardando, generando }: CotizacionEditorProps) {
  const { subtotal, iva, total } = calcularTotales(items);
  const periodicidadUpper = (form.periodicidad || 'Quincenal').toUpperCase();

  const updateItem = (i: number, field: keyof CotizacionItemDraft, value: string) => {
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, [field]: field === 'descripcion' || field === 'unidad' ? value : Number(value) } : it));
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Barra superior */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border border-border rounded-xl px-4 py-3 sticky top-0 z-10 shadow-sm">
        <button onClick={onVolver} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground w-fit">
          <ArrowLeft className="w-4 h-4" /> Volver a Cotizador
        </button>
        <div className="flex items-center gap-1 flex-wrap">
          {SECCIONES.map((s) => (
            <button key={s.id} onClick={() => scrollToSection(s.id)} className="text-xs font-medium px-2.5 py-1 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              {s.label}
            </button>
          ))}
          <span className="w-px h-4 bg-border mx-1" />
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide mr-1">Ir a:</span>
          <button onClick={() => scrollToSection('hoja-1')} className="text-xs font-medium px-2.5 py-1 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">Página 1</button>
          <button onClick={() => scrollToSection('hoja-2')} className="text-xs font-medium px-2.5 py-1 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">Página 2</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onGenerarPdf} disabled={generando}><FileDown className="w-3.5 h-3.5 mr-1.5" /> {generando ? 'Generando vista previa...' : 'Vista previa'}</Button>
          <Button size="sm" onClick={onGuardar} disabled={guardando}><Save className="w-3.5 h-3.5 mr-1.5" /> Guardar cotización</Button>
        </div>
      </div>

      {/* Aviso de borrador sin guardar — fuera del documento, no se incrusta en el PDF */}
      <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 max-w-3xl mx-auto">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
        <p className="text-sm"><b className="font-semibold">Borrador sin guardar.</b> Esta cotización todavía no existe en el sistema — el folio se asigna hasta que hagas clic en "Guardar cotización". Si sales sin guardar, se pierden los cambios.</p>
      </div>

      {/* Metadatos internos — no forman parte del documento impreso, por eso viven fuera de la hoja */}
      <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 max-w-3xl mx-auto">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap">Cliente (interno, no se imprime)</span>
        <select value={form.clienteId} onChange={(e) => setForm((f) => ({ ...f, clienteId: e.target.value }))} className="flex-1 text-sm border border-border rounded-lg px-2 py-1.5 bg-background outline-none focus:border-primary">
          <option value="">Selecciona un cliente...</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.empresa ? ` (${c.empresa})` : ''}</option>)}
        </select>
      </div>

      {/* Documento editable — dividido en hojas tamaño carta (8.5 × 11 in) */}
      <div className="w-full overflow-x-auto pb-4">
      <div className="mx-auto" style={{ width: CARTA_WIDTH_PX }}>

      <Hoja numero={1} total={2}>
        <MiniHeader folio="BORRADOR" />
        <div className="space-y-5">
        {/* Sección general — replica el formato exacto del documento: texto corrido en negritas */}
        <div id="sec-general" className="scroll-mt-20 space-y-3">
          <p className="font-bold text-[11.5px] text-foreground">
            Ciudad de México, a{' '}
            <input type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} className="inline-block w-auto border-0 border-b border-border/40 focus:border-primary bg-transparent font-bold text-[11.5px] px-1 outline-none" />.
          </p>

          <div className="grid grid-cols-[120px_1fr] gap-y-1.5 items-baseline">
            <span className="font-bold text-[11.5px]">Solicitante:</span>
            <input value={form.solicitante} onChange={(e) => setForm((f) => ({ ...f, solicitante: e.target.value }))} placeholder="A QUIEN CORRESPONDA" className={`${inlineInputClass} font-bold`} />
            <span className="font-bold text-[11.5px]">Atención:</span>
            <input value={form.atencion} onChange={(e) => setForm((f) => ({ ...f, atencion: e.target.value }))} placeholder="A QUIEN CORRESPONDA" className={`${inlineInputClass} font-bold`} />
            <span className="font-bold text-[11.5px]">Servicio cotizado:</span>
            <input value={form.servicioCotizado} onChange={(e) => setForm((f) => ({ ...f, servicioCotizado: e.target.value }))} placeholder="SERVICIO DE SEGURIDAD Y VIGILANCIA" className={`${inlineInputClass} font-bold`} />
          </div>

        </div>

        <p className="text-justify text-[11.5px] text-muted-foreground leading-relaxed">
          En atención a su solicitud, pongo a su consideración nuestra <b className="text-foreground">Propuesta económica de Servicios de Seguridad Privada y Vigilancia</b> para sus diferentes instalaciones ubicadas en las inmediaciones de{' '}
          <input value={form.ubicacion} onChange={(e) => setForm((f) => ({ ...f, ubicacion: e.target.value }))} placeholder="la Alcaldía Álvaro Obregón, Ciudad de México" className="inline-block w-auto min-w-[200px] border-0 border-b border-border/40 focus:border-primary bg-transparent text-[11.5px] text-muted-foreground px-1 outline-none" />.
        </p>

        {/* Partidas */}
        <div id="sec-partidas" className="scroll-mt-20">
          <h3 className="font-extrabold text-[11.5px] uppercase tracking-wide mb-2" style={{ color: NAVY }}>Propuesta económica</h3>
          <div className="rounded-lg overflow-hidden border border-border">
            <table className="w-full">
              <thead style={{ backgroundColor: NAVY }}>
                <tr className="text-white text-[10px] uppercase">
                  <th className="text-left px-2 py-2 font-bold w-10">Cant</th>
                  <th className="text-left px-2 py-2 font-bold">Descripción</th>
                  <th className="text-left px-2 py-2 font-bold w-28">Unidad</th>
                  <th className="text-right px-2 py-2 font-bold w-28">Unitario {periodicidadUpper}</th>
                  <th className="text-right px-2 py-2 font-bold w-28">Total {periodicidadUpper}</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                    <td className="px-2 py-1.5"><input type="number" min={1} value={it.cantidad} onChange={(e) => updateItem(i, 'cantidad', e.target.value)} className={inlineInputClass} /></td>
                    <td className="px-2 py-1.5"><input value={it.descripcion} onChange={(e) => updateItem(i, 'descripcion', e.target.value)} placeholder="Descripción del servicio" className={inlineInputClass} /></td>
                    <td className="px-2 py-1.5"><input value={it.unidad} onChange={(e) => updateItem(i, 'unidad', e.target.value)} placeholder="Unidad" className={inlineInputClass} /></td>
                    <td className="px-2 py-1.5"><input type="number" min={0} step="0.01" value={it.precio_unitario} onChange={(e) => updateItem(i, 'precio_unitario', e.target.value)} className={`${inlineInputClass} text-right`} /></td>
                    <td className="px-2 py-1.5 text-right font-medium text-[11px]">{fmtMoney((Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0))}</td>
                    <td className="px-1 text-center">
                      <button type="button" onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))} disabled={items.length === 1} className="text-muted-foreground hover:text-destructive disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={() => setItems((p) => [...p, { ...ITEM_VACIO }])} className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
            <Plus className="w-3.5 h-3.5" /> Agregar partida
          </button>

          <div className="mt-4 ml-auto w-full sm:w-72 space-y-1 text-[11.5px]">
            <div className="flex justify-between bg-muted/30 px-3 py-1 rounded-md"><span className="font-semibold">Subtotal</span><span>{fmtMoney(subtotal)}</span></div>
            <div className="flex justify-between bg-muted/30 px-3 py-1 rounded-md"><span className="font-semibold">IVA</span><span>{fmtMoney(iva)}</span></div>
            <div className="flex justify-between font-extrabold text-white px-3 py-1.5 rounded-md" style={{ backgroundColor: NAVY }}><span>Total</span><span>{fmtMoney(total)}</span></div>
          </div>
        </div>

        <p className="text-justify text-[11px] text-muted-foreground leading-normal">
          La propuesta incluye los gastos directos e indirectos que se generen por la prestación del servicio, el pago de las prestaciones mínimas de Ley a los elementos de seguridad (IMSS, INFONAVIT, ahorro para el retiro, aguinaldo, vacaciones y prima vacacional correspondiente, etc.), uniformes y equipo de trabajo.
        </p>

        <div>
          <p className="font-bold text-[11.5px] mb-1">Incluye además y en comodato:</p>
          <ul className="space-y-1">
            {COTIZACION_DEFAULTS.comodato.map((c, i) => (
              <li key={i} className={checkItemClass}>{c}</li>
            ))}
          </ul>
          <p className="text-justify text-[11px] text-muted-foreground mt-1.5 leading-normal">
            Todo lo anterior para mantener comunicación directa e inmediata entre los puestos de control, el responsable de la seguridad interna y los mandos de U3.
          </p>
        </div>

        {/* Condiciones de pago y vigencia — periodicidad y vigencia se editan en el propio texto, sin recuadro */}
        <div id="sec-condiciones" className="scroll-mt-20 space-y-3.5 pt-1">
          <div>
            <h3 className="font-extrabold text-[11.5px] uppercase tracking-wide mb-1" style={{ color: NAVY }}>I. Forma de pago</h3>
            <p className="text-justify text-[11px] text-muted-foreground leading-normal">
              Cubrir el 100% de cada factura{' '}
              <select value={form.periodicidad} onChange={(e) => setForm((f) => ({ ...f, periodicidad: e.target.value }))} className="inline-block w-auto border-0 border-b border-border/40 focus:border-primary bg-transparent text-[11px] text-muted-foreground px-1 outline-none">
                <option value="Quincenal">quincenal</option>
                <option value="Mensual">mensual</option>
                <option value="Semanal">semanal</option>
                <option value="Único">único</option>
              </select>, por lo menos CINCO días hábiles anteriores a su vencimiento, previa emisión y autorización de la factura correspondiente.
            </p>
          </div>

          <div>
            <h3 className="font-extrabold text-[11.5px] uppercase tracking-wide mb-1" style={{ color: NAVY }}>II. Vigencia de la cotización</h3>
            <p className="text-justify text-[11px] text-muted-foreground leading-normal">
              Las tarifas estarán vigentes a partir de la fecha de la presente cotización y hasta por{' '}
              <input type="number" min={1} value={form.vigenciaDias} onChange={(e) => setForm((f) => ({ ...f, vigenciaDias: e.target.value }))} className="inline-block w-12 border-0 border-b border-border/40 focus:border-primary bg-transparent text-[11px] text-muted-foreground text-center px-1 outline-none" />{' '}días naturales.
            </p>
          </div>
        </div>

        </div>
      </Hoja>

      <Hoja numero={2} total={2}>
        <MiniHeader folio="BORRADOR" />
        <div className="space-y-5">

        {/* Beneficios completos — se mueven enteros a la página 2 para no partir el encabezado de la lista */}
        <div>
          <h3 className="font-extrabold text-[11.5px] uppercase tracking-wide mb-1.5" style={{ color: NAVY }}>III. Los beneficios de contratar nuestros servicios</h3>
          <ul className="space-y-1 mb-2">
            {COTIZACION_DEFAULTS.beneficios.map((b, i) => (
              <li key={i} className={checkItemClass}>{b}</li>
            ))}
          </ul>
        </div>

        {/* Sección IV. Generales */}
        <div id="sec-legales" className="scroll-mt-20 space-y-3.5">
          <div>
            <h3 className="font-extrabold text-[11.5px] uppercase tracking-wide mb-1.5" style={{ color: NAVY }}>IV. Generales</h3>
            <ul className="space-y-1 mb-2">
              <li className={checkItemClass}><b className="text-foreground">{COMPANY.razonSocial}</b>, es una Sociedad Anónima de Capital Variable constituida en {COMPANY.fechaConstitucion} con RFC: {COMPANY.rfc} con domicilio en {COMPANY.domicilioFiscal}</li>
              <li className={checkItemClass}>Nos encontramos debidamente registrados ante la Secretaría del Trabajo y Previsión Social con el número de registro {COMPANY.registroSTPS} y folio de actividad {COMPANY.folioRepse}, quedando inscritos en el Padrón Público de Contratistas de Servicios Especializados u Obras Especializadas (Repse).</li>
              <li className={checkItemClass}>Contamos con la autorización de la Secretaría de Seguridad Ciudadana de la Ciudad de México, bajo el Permiso: {COMPANY.permisoDGSPyCI}; Expediente: {COMPANY.expediente}.</li>
            </ul>
            <p className="text-justify text-[11px] text-muted-foreground mb-2 leading-normal">
              Nuestro objeto social es la prestación de servicios de vigilancia y seguridad privada en los <b className="text-foreground">BIENES</b> para toda clase de inmuebles, comercios, industrias, residencias, etc., así como para el <b className="text-foreground">TRASLADO DE BIENES Y MERCANCÍAS</b> y la venta e instalación de equipos y sistemas de <b className="text-foreground">SEGURIDAD ELECTRÓNICA</b> tales como Circuitos Cerrados de Televisión, Controles de Acceso, Video porteros o cualquier dispositivo electrónico relacionado con la seguridad.
            </p>
            <p className="text-justify text-[11px] text-muted-foreground mb-2 leading-normal">
              Estamos preparados y capacitados para brindar servicios en los ramos: {COTIZACION_DEFAULTS.ramos}
            </p>
            <p className="text-justify text-[11px] text-muted-foreground leading-normal">
              De vernos favorecidos con su decisión, nuestro compromiso de montaje del servicio sería de <b className="text-foreground">{COTIZACION_DEFAULTS.montajeDias}</b> días naturales posteriores a la firma del(os) contrato(s) correspondiente(s).
            </p>
          </div>
        </div>

        <p className="text-[11.5px] text-muted-foreground">Reciba nuestros saludos.</p>

        {/* Firma */}
        <div id="sec-firma" className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 scroll-mt-20 border-t border-border pt-4">
          <Field label="Asesor que firma">
            <input value={form.asesorNombre} onChange={(e) => setForm((f) => ({ ...f, asesorNombre: e.target.value }))} placeholder="Ej. ING. FERNANDO ROSAS BELLO" className={inlineInputClass} />
          </Field>
          <Field label="Puesto">
            <input value={form.asesorPuesto} onChange={(e) => setForm((f) => ({ ...f, asesorPuesto: e.target.value }))} className={inlineInputClass} />
          </Field>
          <Field label="Notas adicionales (opcional)" className="sm:col-span-2">
            <input value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} className={inlineInputClass} />
          </Field>
        </div>
        </div>
      </Hoja>

      </div>
      </div>
    </div>
  );
}
