'use client';
import { useState, useMemo } from 'react';
import { apiFetch } from '@/src/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/table';
import { Button } from '@/src/components/ui/button';
import { Select } from '@/src/components/ui/select';
import { Badge } from '@/src/components/ui/badge';
import { Plus, Download, ShoppingCart } from 'lucide-react';
import { fmtDate } from '@/src/lib/utils';
import { buildCotizacionHtml, type CotizacionItemDraft } from '@/src/lib/cotizacionTemplate';
import { generarPdfConFallback } from '@/src/lib/generatePdfBlob';
import DocumentViewerModal from '@/src/components/DocumentViewerModal';
import CotizacionEditor, { type CotizacionFormState } from '@/src/components/apps/CotizacionEditor';
import { toast } from 'sonner';
import { useAuth } from '@/src/context/AuthContext';

interface Cliente { id: number; nombre: string; empresa: string | null }
interface Cotizacion {
  id: number; folio: string; cliente_id: number; fecha: string;
  items: CotizacionItemDraft[]; subtotal: number; iva: number; total: number;
  estado: string; notas: string | null;
  solicitante: string | null; atencion: string | null; servicio_cotizado: string | null; ubicacion: string | null;
  periodicidad: string | null; vigencia_dias: number | null;
  asesor_nombre: string | null; asesor_puesto: string | null;
}

const ITEM_VACIO: CotizacionItemDraft = { descripcion: '', unidad: 'Puesto', cantidad: 1, precio_unitario: 0 };
const fmtMoney = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const FORM_INICIAL: CotizacionFormState = {
  clienteId: '',
  fecha: new Date().toISOString().split('T')[0],
  solicitante: 'A QUIEN CORRESPONDA',
  atencion: 'A QUIEN CORRESPONDA',
  servicioCotizado: 'SERVICIO DE SEGURIDAD Y VIGILANCIA',
  ubicacion: '',
  periodicidad: 'Quincenal',
  vigenciaDias: '30',
  asesorNombre: '',
  asesorPuesto: 'Asesor Comercial',
  notas: '',
};

const ESTADO_BADGE: Record<string, 'default' | 'secondary' | 'success' | 'destructive'> = {
  Borrador: 'secondary', Enviada: 'default', Aceptada: 'success', Rechazada: 'destructive',
};

interface ViewerState { url: string; downloadName: string; viaFallback: boolean }

export default function CotizacionesApp() {
  const { isEditor, user } = useAuth();
  const queryClient = useQueryClient();
  const [vista, setVista] = useState<'lista' | 'editor'>('lista');
  const [form, setForm] = useState<CotizacionFormState>(FORM_INICIAL);
  const [items, setItems] = useState<CotizacionItemDraft[]>([{ ...ITEM_VACIO }]);
  const [generandoPreview, setGenerandoPreview] = useState(false);
  const [viewer, setViewer] = useState<ViewerState | null>(null);

  const closeViewer = () => {
    if (viewer) URL.revokeObjectURL(viewer.url);
    setViewer(null);
  };

  const { data: cotizaciones = [], isLoading } = useQuery({ queryKey: ['cotizaciones'], queryFn: () => apiFetch<Cotizacion[]>('/api/cotizaciones') });
  const { data: clientes = [] } = useQuery({ queryKey: ['clientes'], queryFn: () => apiFetch<Cliente[]>('/api/clientes') });
  const clienteById = useMemo(() => Object.fromEntries(clientes.map((c) => [c.id, c])), [clientes]);

  const openCreate = () => {
    setForm({ ...FORM_INICIAL, asesorNombre: user?.username ? user.username.toUpperCase() : '' });
    setItems([{ ...ITEM_VACIO }]);
    setVista('editor');
  };

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiFetch('/api/cotizaciones', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] });
      toast.success('Cotización guardada');
      setVista('lista');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const estadoMutation = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: string }) => apiFetch(`/api/cotizaciones/${id}`, { method: 'PUT', body: JSON.stringify({ estado }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['cotizaciones'] }); toast.success('Estado actualizado'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const ventaMutation = useMutation({
    mutationFn: (cot: Cotizacion) => apiFetch('/api/ventas', { method: 'POST', body: JSON.stringify({ cliente_id: cot.cliente_id, cotizacion_id: cot.id, fecha: new Date().toISOString().split('T')[0], monto_total: cot.total }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] });
      queryClient.invalidateQueries({ queryKey: ['ventas'] });
      toast.success('Venta registrada a partir de la cotización');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const draftPayload = () => ({
    cliente_id: form.clienteId ? Number(form.clienteId) : null,
    fecha: form.fecha,
    items: items.filter((it) => it.descripcion),
    notas: form.notas || null,
    solicitante: form.solicitante,
    atencion: form.atencion,
    servicio_cotizado: form.servicioCotizado,
    ubicacion: form.ubicacion || null,
    periodicidad: form.periodicidad,
    vigencia_dias: Number(form.vigenciaDias) || 30,
    asesor_nombre: form.asesorNombre,
    asesor_puesto: form.asesorPuesto,
  });

  const clienteSeleccionado = clienteById[Number(form.clienteId)];

  const fallbackHtmlDesdeForm = useMemo(() => buildCotizacionHtml({
    folio: 'BORRADOR',
    fecha: form.fecha,
    clienteNombre: clienteSeleccionado?.nombre ?? 'Cliente',
    solicitante: form.solicitante,
    atencion: form.atencion,
    servicio_cotizado: form.servicioCotizado,
    ubicacion: form.ubicacion,
    periodicidad: form.periodicidad,
    items: items.length ? items : [ITEM_VACIO],
    vigencia_dias: Number(form.vigenciaDias) || 30,
    asesor_nombre: form.asesorNombre,
    asesor_puesto: form.asesorPuesto,
    notas: form.notas || null,
    estado: 'Borrador',
  }, '/LOGO_PDFS.png'), [form, items, clienteSeleccionado]);

  const handleGuardar = () => {
    if (!form.clienteId) { toast.error('Selecciona un cliente'); return; }
    if (!items.some((it) => it.descripcion)) { toast.error('Agrega al menos una partida'); return; }
    createMutation.mutate(draftPayload());
  };

  const handleGenerarPdfDesdeForm = async () => {
    if (!form.clienteId) { toast.error('Selecciona un cliente para generar el PDF'); return; }
    if (!items.some((it) => it.descripcion)) { toast.error('Agrega al menos una partida'); return; }
    setGenerandoPreview(true);
    try {
      const token = localStorage.getItem('inv_token');
      const { blob, viaFallback } = await generarPdfConFallback(
        () => fetch('/api/cotizaciones/preview-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(draftPayload()),
        }),
        fallbackHtmlDesdeForm
      );
      setViewer({ url: URL.createObjectURL(blob), downloadName: 'cotizacion_borrador.pdf', viaFallback });
      if (viaFallback) toast.warning('El servidor no respondió: se generó el PDF en tu navegador como respaldo');
    } catch {
      toast.error('No se pudo generar el PDF');
    } finally {
      setGenerandoPreview(false);
    }
  };

  const handleDownloadPdf = async (cot: Cotizacion) => {
    try {
      const token = localStorage.getItem('inv_token');
      const fallbackHtml = buildCotizacionHtml({
        folio: cot.folio,
        fecha: cot.fecha,
        clienteNombre: clienteById[cot.cliente_id]?.nombre ?? '—',
        solicitante: cot.solicitante ?? '',
        atencion: cot.atencion ?? '',
        servicio_cotizado: cot.servicio_cotizado ?? '',
        ubicacion: cot.ubicacion ?? '',
        periodicidad: cot.periodicidad ?? 'Quincenal',
        items: cot.items,
        vigencia_dias: cot.vigencia_dias ?? 30,
        asesor_nombre: cot.asesor_nombre ?? '',
        asesor_puesto: cot.asesor_puesto ?? 'Asesor Comercial',
        notas: cot.notas,
        estado: cot.estado,
      }, '/LOGO_PDFS.png');

      const { blob, viaFallback } = await generarPdfConFallback(
        () => fetch(`/api/cotizaciones/${cot.id}/pdf`, { headers: { Authorization: `Bearer ${token}` } }),
        fallbackHtml
      );
      setViewer({ url: URL.createObjectURL(blob), downloadName: `${cot.folio}.pdf`, viaFallback });
      if (viaFallback) toast.warning('El servidor no respondió: se generó el PDF en tu navegador como respaldo');
    } catch {
      toast.error('No se pudo generar el PDF');
    }
  };

  if (vista === 'editor') {
    return (
      <>
        <CotizacionEditor
          clientes={clientes}
          form={form}
          setForm={setForm}
          items={items}
          setItems={setItems}
          onVolver={() => setVista('lista')}
          onGuardar={handleGuardar}
          onGenerarPdf={handleGenerarPdfDesdeForm}
          guardando={createMutation.isPending}
          generando={generandoPreview}
        />
        {viewer && (
          <DocumentViewerModal title="Cotización" url={viewer.url} downloadName={viewer.downloadName} viaFallback={viewer.viaFallback} borrador onClose={closeViewer} />
        )}
      </>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h1 className="text-2xl font-bold tracking-tight">Cotizador</h1><p className="text-sm text-muted-foreground mt-0.5">Genera cotizaciones con folio y PDF automático, con el formato oficial de U3</p></div>
        {isEditor && <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Nueva cotización</Button>}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Folio</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Cargando...</TableCell></TableRow>
              : cotizaciones.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Sin cotizaciones.</TableCell></TableRow>
              : cotizaciones.map((cot) => (
                <TableRow key={cot.id}>
                  <TableCell className="font-bold">{cot.folio}</TableCell>
                  <TableCell>{clienteById[cot.cliente_id]?.nombre ?? '—'}</TableCell>
                  <TableCell>{fmtDate(cot.fecha)}</TableCell>
                  <TableCell className="text-right font-medium">{fmtMoney(cot.total)}</TableCell>
                  <TableCell>
                    {isEditor ? (
                      <Select value={cot.estado} onChange={(e) => estadoMutation.mutate({ id: cot.id, estado: e.target.value })} className="h-8 text-xs w-32">
                        <option value="Borrador">Borrador</option>
                        <option value="Enviada">Enviada</option>
                        <option value="Aceptada">Aceptada</option>
                        <option value="Rechazada">Rechazada</option>
                      </Select>
                    ) : <Badge variant={ESTADO_BADGE[cot.estado] ?? 'secondary'}>{cot.estado}</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end items-center gap-1.5">
                      <Button variant="ghost" size="sm" className="h-8" onClick={() => handleDownloadPdf(cot)} title="Descargar PDF"><Download className="w-3.5 h-3.5" /></Button>
                      {isEditor && cot.estado === 'Aceptada' && (
                        <Button variant="outline" size="sm" className="h-8" onClick={() => ventaMutation.mutate(cot)} disabled={ventaMutation.isPending} title="Convertir en venta">
                          <ShoppingCart className="w-3.5 h-3.5 mr-1" /> Venta
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {viewer && (
        <DocumentViewerModal title="Cotización" url={viewer.url} downloadName={viewer.downloadName} viaFallback={viewer.viaFallback} onClose={closeViewer} />
      )}
    </div>
  );
}
