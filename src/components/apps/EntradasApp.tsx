'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/src/lib/api';
import { fechaMexico } from '@/src/lib/fecha';
import { useAuth } from '@/src/context/AuthContext';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Select } from '@/src/components/ui/select';
import { Field, FieldGrid, FormSection, Callout } from '@/src/components/ui/field';
import { FormDialog } from '@/src/components/ui/form-dialog';
import { PageHeader } from '@/src/components/ui/page-header';
import { ArrowDownToLine, Boxes, Package } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/table';
import { downloadCSV, fmtDate } from '@/src/lib/utils';
import CargaInicialAlmacen from '@/src/components/apps/CargaInicialAlmacen';
import AnularMovimiento from '@/src/components/apps/AnularMovimiento';
import CorregirMovimiento, { puedeCorregir } from '@/src/components/apps/CorregirMovimiento';
import { toast } from 'sonner';

export default function EntradasApp() {
  const { puede } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [carga, setCarga] = useState(false);
  const [form, setForm] = useState({ fecha: fechaMexico(), articulo: '', talla: '', cantidad: 1, estado: 'Nuevo', motivo: 'Compra', origen_devolucion: '', guardia_id: '', salida_id: '' });
  const actualizar = (datos: Partial<typeof form>) => setForm(f => ({ ...f, ...datos }));
  const prendasQuery = useQuery({ queryKey: ['catalogoPrendas'], queryFn: () => apiFetch<any[]>('/api/prendas') });
  const guardiasQuery = useQuery({ queryKey: ['guardias'], queryFn: () => apiFetch<any[]>('/api/guardias') });
  const salidasQuery = useQuery({ queryKey: ['salidas'], queryFn: () => apiFetch<any[]>('/api/salidas'), enabled: open && ['Devolución de Equipo', 'Recuperado'].includes(form.motivo) });
  const entradasQuery = useQuery({ queryKey: ['entradas'], queryFn: () => apiFetch<any[]>('/api/entradas') });
  const prendas = prendasQuery.data ?? [];
  const prenda = prendas.find(p => p.nombre === form.articulo);
  const devuelve = ['Devolución de Equipo', 'Recuperado'].includes(form.motivo);
  const asignaciones = (salidasQuery.data ?? []).filter(s => !s.anulado && String(s.guardia_id) === form.guardia_id && (s.estado_asignacion === 'Uniforme en Campo' || form.motivo === 'Recuperado' && s.estado_asignacion === 'Extraviado'));
  const asignacion = asignaciones.find(s => String(s.id) === form.salida_id);
  const filteredData = (entradasQuery.data ?? []).filter(e => [e.articulo, e.motivo, e.origen_devolucion, e.registrado_por].some(t => (t || '').toLowerCase().includes(searchTerm.toLowerCase())));
  const mutation = useMutation({
    mutationFn: () => apiFetch('/api/entradas', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => {
      ['entradas','salidas','inventario','inventarioDetalle','uniformesCampo','expediente','dashboardMetrics','inventarioHistorial'].forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      toast.success('Entrada registrada'); setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const nueva = () => { setForm({ fecha: fechaMexico(), articulo: '', talla: '', cantidad: 1, estado: 'Nuevo', motivo: 'Compra', origen_devolucion: '', guardia_id: '', salida_id: '' }); setOpen(true); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number.isSafeInteger(form.cantidad) || form.cantidad <= 0) return toast.error('La cantidad debe ser un entero mayor a cero');
    if (devuelve && (!asignacion || form.cantidad > asignacion.cantidad)) return toast.error('Selecciona una asignación y una cantidad pendiente válida');
    mutation.mutate();
  };
  return <div className="space-y-5">
    <PageHeader
      title="Entradas de equipo"
      description="Ingresos al almacén y devolución del equipo asignado."
      actions={<>
        <Button variant="outline" onClick={() => downloadCSV('entradas_' + fechaMexico() + '.csv', ['Fecha','Artículo','Talla','Cantidad','Estado físico','Motivo','Origen','Registró','Registro'], filteredData.map(e => [fmtDate(e.fecha),e.articulo,e.talla || '',e.cantidad,e.estado,e.motivo,e.origen_devolucion || '',e.registrado_por || '',e.anulado ? 'Anulado' : 'Vigente']))}>Exportar CSV filtrado</Button>
        {puede('entradas','crear') && <><Button variant="outline" onClick={() => setCarga(true)}>Carga inicial</Button><Button onClick={nueva}>Nueva entrada</Button></>}
      </>}
    />
    <Input placeholder="Buscar artículo, motivo, origen o autor" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
    {entradasQuery.error ? <p role="alert" className="text-red-600">{entradasQuery.error.message} <Button onClick={() => entradasQuery.refetch()}>Reintentar</Button></p> :
    <div className="border rounded-xl overflow-x-auto"><Table>
      <TableHeader><TableRow>{['Fecha','Artículo / talla','Cantidad','Estado físico','Motivo / origen','Registró','Estado','Acción'].map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{entradasQuery.isLoading ? <TableRow><TableCell colSpan={8}>Cargando...</TableCell></TableRow> : !filteredData.length ? <TableRow><TableCell colSpan={8}>No hay entradas que coincidan.</TableCell></TableRow> : filteredData.map(e => <TableRow key={e.id} className={e.anulado ? 'opacity-50' : ''}>
        <TableCell>{fmtDate(e.fecha)}</TableCell><TableCell>{e.articulo} {e.talla && '— ' + e.talla}</TableCell><TableCell>{e.cantidad}</TableCell><TableCell>{e.estado}</TableCell><TableCell>{e.motivo}<div className="text-xs">{e.origen_devolucion}</div></TableCell><TableCell>{e.registrado_por}</TableCell><TableCell>{e.anulado ? 'Anulado' : 'Vigente'}</TableCell>
        <TableCell><div className="flex gap-1">{puede('entradas','editar') && puedeCorregir('entradas', e) && <CorregirMovimiento tabla="entradas" fila={e} />}{!e.anulado && puede('entradas','eliminar') && <AnularMovimiento tabla="entradas" id={e.id} />}</div></TableCell>
      </TableRow>)}</TableBody>
    </Table></div>}
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      size="md"
      icon={ArrowDownToLine}
      title="Registrar entrada"
      description="Las devoluciones resuelven la asignación seleccionada. El autor se registra automáticamente."
      submitLabel="Guardar entrada"
      submitting={mutation.isPending}
      footerNote={<span><span className="text-destructive">*</span> Campo obligatorio</span>}
      onSubmit={submit}
    >
      <div className="space-y-6">
        <FormSection title="Movimiento" icon={ArrowDownToLine}>
          <FieldGrid cols={2}>
            <Field label="Fecha" required>
              <Input type="date" value={form.fecha} max={fechaMexico()} required onChange={e => actualizar({ fecha: e.target.value })} />
            </Field>
            <Field label="Motivo" required>
              <Select value={form.motivo} onChange={e => actualizar({ motivo: e.target.value, salida_id: '', guardia_id: '', cantidad: 1 })}>
                {['Compra','Existencia Inicial','Devolución de Equipo','Recuperado','Ingreso externo'].map(m => <option key={m}>{m}</option>)}
              </Select>
            </Field>
          </FieldGrid>
        </FormSection>

        {devuelve ? (
          <FormSection title="Equipo que regresa" icon={Package}>
            <FieldGrid cols={1}>
              <Field label="Guardia" required>
                <Select value={form.guardia_id} required onChange={e => actualizar({ guardia_id: e.target.value, salida_id: '', cantidad: 1 })}>
                  <option value="">Seleccionar</option>
                  {(guardiasQuery.data ?? []).filter(g => g.estado !== 'Baja Pendiente').map(g => <option key={g.id} value={g.id}>{g.nombre} · {g.numero_elemento}</option>)}
                </Select>
              </Field>
              <Field label="Asignación que regresa" required>
                <Select value={form.salida_id} required onChange={e => actualizar({ salida_id: e.target.value, cantidad: 1 })}>
                  <option value="">Seleccionar equipo</option>
                  {asignaciones.map(s => <option key={s.id} value={s.id}>{s.articulo} {s.talla || ''} · {s.cantidad} pieza(s) · {s.estado_asignacion} · {fmtDate(s.fecha)} · #{s.id}</option>)}
                </Select>
              </Field>
            </FieldGrid>
            <Callout tone="info">Los guardias con baja pendiente devuelven su equipo desde Procesos de Baja. También se puede recuperar una prenda archivada.</Callout>
          </FormSection>
        ) : (
          <FormSection title="Artículo" icon={Package}>
            <FieldGrid cols={2}>
              <Field label="Artículo" required span={prenda?.requiere_talla ? 1 : 2}>
                <Select value={form.articulo} required onChange={e => actualizar({ articulo: e.target.value, talla: '' })}>
                  <option value="">Seleccionar</option>
                  {prendas.filter(p => p.activo).map(p => <option key={p.id}>{p.nombre}</option>)}
                </Select>
              </Field>
              {!!prenda?.requiere_talla && (
                <Field label="Talla" required>
                  <Select value={form.talla} required onChange={e => actualizar({ talla: e.target.value })}>
                    <option value="">Seleccionar talla</option>
                    {(prenda.tallas || []).map((t: string) => <option key={t}>{t}</option>)}
                  </Select>
                </Field>
              )}
            </FieldGrid>
          </FormSection>
        )}

        <FormSection title="Cantidad y estado" icon={Boxes}>
          <FieldGrid cols={2}>
            <Field label="Cantidad" required>
              <Input type="number" min={1} step={1} max={devuelve ? asignacion?.cantidad : 1000000} required value={form.cantidad} onChange={e => actualizar({ cantidad: Number(e.target.value) })} />
            </Field>
            <Field label="Estado físico">
              <Select value={form.estado} onChange={e => actualizar({ estado: e.target.value })}>{['Nuevo','Usado','Inutilizable'].map(s => <option key={s}>{s}</option>)}</Select>
            </Field>
            {form.motivo === 'Ingreso externo' && (
              <Field label="Procedencia" required span={2} hint="Equipo sin asignación previa.">
                <Input required value={form.origen_devolucion} onChange={e => actualizar({ origen_devolucion: e.target.value })} />
              </Field>
            )}
          </FieldGrid>
        </FormSection>

        {(prendasQuery.error || guardiasQuery.error || salidasQuery.error) && (
          <Callout tone="danger">No se pudieron cargar las opciones. Cierra y vuelve a abrir el formulario.</Callout>
        )}
      </div>
    </FormDialog>
    <CargaInicialAlmacen open={carga} onOpenChange={setCarga} />
  </div>;
}
