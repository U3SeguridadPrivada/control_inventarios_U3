'use client';
import { useState, useMemo } from 'react';
import { apiFetch } from '@/src/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/table';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/src/components/ui/dialog';
import { Search, UserPlus, LogOut, Printer, Edit, Trash2, Download, Eye, Phone, MapPin, FileText, Upload } from 'lucide-react';
import { fmtDate } from '@/src/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/src/context/AuthContext';

function imprimirExpediente(guardia: any, salidas: any[], entradas: any[]) {
  const fecha = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  const enPosesion = salidas.filter(s => s.estado_asignacion === 'Uniforme en Campo');
  const saldoMap: Record<string, number> = {};
  enPosesion.forEach(s => { const key = `${s.articulo}${s.talla ? ` (Talla: ${s.talla})` : ''}`; saldoMap[key] = (saldoMap[key] || 0) + s.cantidad; });
  const dotacion = salidas.filter(s => s.concepto === 'Uniforme en Campo' || s.concepto === 'Asignación');
  const reposicion = salidas.filter(s => s.concepto === 'Reposición');
  const extravios = salidas.filter(s => s.concepto === 'Extravío' || s.concepto === 'Inutilizable');
  const recuperados = entradas.filter(e => e.motivo === 'Recuperado');
  const reposicionEntradas = entradas.filter(e => e.motivo === 'Reposición (Entrada Múltiple)');
  const totalDotaciones = dotacion.reduce((a: number, s: any) => a + s.cantidad, 0);
  const totalReposiciones = reposicion.reduce((a: number, s: any) => a + s.cantidad, 0);
  const totalPerdidas = extravios.reduce((a: number, s: any) => a + s.cantidad, 0);
  const totalEnPosesion = Object.values(saldoMap).reduce((a, v) => a + v, 0);
  const saldoItemsHtml = Object.entries(saldoMap).length === 0 ? '<p style="color:#6b7280;font-style:italic;font-size:11px;margin-top:8px">Sin artículos en posesión.</p>' : `<ul style="list-style:none;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:8px;">${Object.entries(saldoMap).map(([art, qty]) => `<li style="font-size:11px;"><strong>${qty}x</strong> ${art}</li>`).join('')}</ul>`;
  const thBase = `<th style="width:30px">No.</th><th>Fecha</th><th>Artículo</th><th style="text-align:center">Talla</th><th style="text-align:center">Cant.</th>`;
  const mkHeader = (lastCol: string) => `<thead><tr>${thBase}<th>${lastCol}</th></tr></thead>`;
  const html = `<!doctype html><html lang="es"><head><meta charset="UTF-8"/><title>Expediente — ${guardia.nombre}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:28px 36px}
  .header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #1d4ed8;padding-bottom:10px;margin-bottom:14px}
  .header-left h1{font-size:18px;font-weight:900;color:#1d4ed8;letter-spacing:1px;text-transform:uppercase}.header-left p{font-size:10px;color:#6b7280;margin-top:2px}
  .header-right{text-align:right;font-size:10px;color:#374151}.header-right strong{font-size:12px;display:block;color:#1d4ed8}
  .doc-title{text-align:center;font-size:13px;font-weight:800;letter-spacing:2px;text-transform:uppercase;background:#1d4ed8;color:#fff;padding:5px 0;margin-bottom:14px}
  .ficha{border:1.5px solid #1d4ed8;border-radius:4px;padding:10px 14px;margin-bottom:16px;display:grid;grid-template-columns:1fr 1fr;gap:6px 20px}
  .ficha-field span{color:#6b7280;font-size:10px;display:block}.ficha-field strong{font-size:12px;color:#111}
  .section-title{font-size:12px;font-weight:700;color:#1d4ed8;margin:16px 0 6px 0;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
  table{width:100%;border-collapse:collapse;margin-bottom:10px}thead tr{background:#1d4ed8;color:#fff}
  th{padding:6px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;text-align:left}
  td{padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:11px}tr:nth-child(even) td{background:#f0f4ff}
  .saldo-box{margin:20px 0;padding:12px;border:2px dashed #1d4ed8;border-radius:6px;background-color:#eff6ff}
  .saldo-title{font-size:13px;font-weight:800;color:#1e3a8a;margin-bottom:8px;text-transform:uppercase}
  .firmas{display:flex;justify-content:space-around;margin-top:40px}.firma{text-align:center;width:200px}
  .firma-line{border-bottom:1.5px solid #111;margin-bottom:6px;height:36px}.firma p{font-size:10px;font-weight:700;text-transform:uppercase}.firma small{font-size:9px;color:#6b7280}
  .pie{margin-top:20px;padding-top:8px;border-top:1px solid #d1d5db;font-size:9px;color:#9ca3af;text-align:center}</style>
  </head><body>
  <div class="header"><div class="header-left"><h1>U3 Seguridad Privada</h1><p>Control de Uniformes y Dotaciones · Uso Interno</p></div>
  <div class="header-right"><strong>EXPEDIENTE DE ELEMENTO</strong>Ciudad de México, México.<br/>Fecha:<br/>${fecha}</div></div>
  <div class="doc-title">ENTREGA DE UNIFORME Y/O EQUIPO DE TRABAJO</div>
  <div class="ficha">
    <div class="ficha-field"><span>Nombre Completo</span><strong>${guardia.nombre}</strong></div>
    <div class="ficha-field"><span>Número de Elemento</span><strong>${guardia.numero_elemento}</strong></div>
    <div class="ficha-field"><span>Fecha de Alta</span><strong>${fmtDate(guardia.fecha_alta)}</strong></div>
    <div class="ficha-field"><span>Estatus</span><strong>${guardia.estado}</strong></div>
  </div>
  <div class="section-title">I. Dotación inicial</div>
  ${dotacion.length === 0 ? '<p style="color:#6b7280;font-size:11px">Sin registros.</p>' : `<table>${mkHeader('Estado')}<tbody>${dotacion.map((item: any, idx: number) => `<tr><td style="text-align:center">${idx+1}</td><td>${fmtDate(item.fecha)}</td><td><strong>${item.articulo}</strong></td><td style="text-align:center">${item.talla||'—'}</td><td style="text-align:center">${item.cantidad}</td><td>${item.estado_fisico||'Nuevo'}</td></tr>`).join('')}</tbody></table>`}
  <div class="section-title">II. Equipo repuesto</div>
  ${reposicion.length === 0 ? '<p style="color:#6b7280;font-size:11px">Sin registros.</p>' : `<table>${mkHeader('Estado devuelto → Entregado')}<tbody>${reposicion.map((item: any, idx: number) => { const matched = reposicionEntradas.find((e: any) => e.articulo === item.articulo && e.fecha === item.fecha); const devuelto = matched?.estado || '—'; return `<tr><td style="text-align:center">${idx+1}</td><td>${fmtDate(item.fecha)}</td><td><strong>${item.articulo}</strong></td><td style="text-align:center">${item.talla||'—'}</td><td style="text-align:center">${item.cantidad}</td><td>Devolvió: <strong>${devuelto}</strong> → Recibió: <strong>${item.estado_fisico||'Nuevo'}</strong></td></tr>`; }).join('')}</tbody></table>`}
  <div class="section-title">III. Pérdidas y extravíos</div>
  ${extravios.length === 0 ? '<p style="color:#6b7280;font-size:11px">Sin registros.</p>' : `<table>${mkHeader('Tipo')}<tbody>${extravios.map((item: any, idx: number) => `<tr><td style="text-align:center">${idx+1}</td><td>${fmtDate(item.fecha)}</td><td><strong>${item.articulo}</strong></td><td style="text-align:center">${item.talla||'—'}</td><td style="text-align:center">${item.cantidad}</td><td>${item.concepto||'Extravío'}</td></tr>`).join('')}</tbody></table>`}
  ${recuperados.length === 0 ? '' : `<div class="section-title">IV. Equipo recuperado</div><table>${mkHeader('Estado al recuperar')}<tbody>${recuperados.map((item: any, idx: number) => `<tr><td style="text-align:center">${idx+1}</td><td>${fmtDate(item.fecha)}</td><td><strong>${item.articulo}</strong></td><td style="text-align:center">${item.talla||'—'}</td><td style="text-align:center">${item.cantidad}</td><td>${item.estado||'—'}</td></tr>`).join('')}</tbody></table>`}
  <div class="saldo-box">
    <div class="saldo-title">Saldo Actual en Posesión</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:10px;">
      <div style="text-align:center;background:#dbeafe;border-radius:6px;padding:8px;"><div style="font-size:20px;font-weight:900;color:#1d4ed8;">${totalDotaciones}</div><div style="font-size:9px;color:#1e40af;text-transform:uppercase;font-weight:700;">Piezas dotadas</div></div>
      <div style="text-align:center;background:#ede9fe;border-radius:6px;padding:8px;"><div style="font-size:20px;font-weight:900;color:#7c3aed;">${totalReposiciones}</div><div style="font-size:9px;color:#6d28d9;text-transform:uppercase;font-weight:700;">Piezas repuestas</div></div>
      <div style="text-align:center;background:#fee2e2;border-radius:6px;padding:8px;"><div style="font-size:20px;font-weight:900;color:#dc2626;">${totalPerdidas}</div><div style="font-size:9px;color:#b91c1c;text-transform:uppercase;font-weight:700;">Pérdidas</div></div>
      <div style="text-align:center;background:#d1fae5;border-radius:6px;padding:8px;"><div style="font-size:20px;font-weight:900;color:#059669;">${totalEnPosesion}</div><div style="font-size:9px;color:#047857;text-transform:uppercase;font-weight:700;">En posesión</div></div>
    </div>${saldoItemsHtml}
  </div>
  <div class="firmas"><div class="firma"><div class="firma-line"></div><p>Firma del Elemento</p><small>${guardia.nombre}</small><br/><small>${guardia.numero_elemento}</small></div>
  <div class="firma"><div class="firma-line"></div><p>Responsable de Almacén</p><small>U3 Seguridad Privada</small></div></div>
  <div class="pie">Documento generado automáticamente · U3 Seguridad Privada · Uso administrativo interno.</div>
  </body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'width=900,height=720');
  if (!win) { alert('Permite ventanas emergentes para imprimir'); return; }
  win.addEventListener('load', () => { win.focus(); win.print(); setTimeout(() => URL.revokeObjectURL(url), 2000); });
}

async function descargarFichaPdf(guardiaId: number, numeroElemento: string) {
  try {
    const token = localStorage.getItem('inv_token');
    const res = await fetch(`/api/guardias/${guardiaId}/ficha-pdf`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Error al generar la ficha');
    const blob = new Blob([await res.arrayBuffer()], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `ficha_${numeroElemento}.pdf`; link.style.display = 'none';
    document.body.appendChild(link); link.click();
    setTimeout(() => { document.body.removeChild(link); window.URL.revokeObjectURL(url); }, 1000);
  } catch {
    alert('No se pudo generar la ficha PDF.');
  }
}

export default function GuardiasApp() {
  const { isEditor } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBajaModalOpen, setIsBajaModalOpen] = useState(false);
  const [isExpedienteModalOpen, setIsExpedienteModalOpen] = useState(false);
  
  // Registration States
  const [numeroElemento, setNumeroElemento] = useState('');
  const [nombre, setNombre] = useState('');
  const [fechaAlta, setFechaAlta] = useState(new Date().toISOString().split('T')[0]);
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');

  // Selected Guardia & Baja States
  const [selectedGuardia, setSelectedGuardia] = useState<any>(null);
  const [fechaBaja, setFechaBaja] = useState(new Date().toISOString().split('T')[0]);

  // Editing States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editNumeroElemento, setEditNumeroElemento] = useState('');
  const [editNombre, setEditNombre] = useState('');
  const [editFechaAlta, setEditFechaAlta] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editDireccion, setEditDireccion] = useState('');
  const [editEstado, setEditEstado] = useState('Activo');

  // Expediente Tabs and Documents States
  const [activeTab, setActiveTab] = useState<'movimientos' | 'documentos'>('movimientos');
  const [documentoNombre, setDocumentoNombre] = useState('');
  const [documentoArchivo, setDocumentoArchivo] = useState<File | null>(null);

  // Queries
  const { data: guardias = [], isLoading } = useQuery({ queryKey: ['guardias'], queryFn: () => apiFetch<any[]>('/api/guardias') });
  const { data: expedienteRes, isLoading: isLoadingExpediente } = useQuery({
    queryKey: ['expediente', selectedGuardia?.id],
    queryFn: () => apiFetch<{ salidas: any[], entradas: any[] }>(`/api/guardias/${selectedGuardia.id}/expediente`),
    enabled: !!selectedGuardia && isExpedienteModalOpen,
  });
  const expedienteSalidas = expedienteRes?.salidas || [];
  const expedienteEntradas = expedienteRes?.entradas || [];

  const { data: documentos = [], isLoading: isLoadingDocumentos } = useQuery({
    queryKey: ['guardia-documentos', selectedGuardia?.id],
    queryFn: () => apiFetch<any[]>(`/api/guardias/${selectedGuardia.id}/documentos`),
    enabled: !!selectedGuardia && isExpedienteModalOpen && activeTab === 'documentos',
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload: any) => apiFetch('/api/guardias', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['guardias'] }); 
      queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] }); 
      toast.success('Guardia registrado'); 
      setIsModalOpen(false); 
      setNumeroElemento(''); 
      setNombre(''); 
      setTelefono('');
      setDireccion('');
    },
    onError: () => toast.error('Error al registrar (¿Número duplicado?)'),
  });

  const editMutation = useMutation({
    mutationFn: (payload: any) => apiFetch(`/api/guardias/${payload.id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['guardias'] }); 
      queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] }); 
      toast.success('Guardia actualizado'); 
      setIsEditModalOpen(false); 
    },
    onError: (err: any) => toast.error(err.message || 'Error al actualizar guardia'),
  });

  const bajaMutation = useMutation({
    mutationFn: (payload: { id: number, fecha: string }) => apiFetch(`/api/guardias/${payload.id}/baja`, { method: 'POST', body: JSON.stringify({ fecha: payload.fecha }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['guardias'] }); queryClient.invalidateQueries({ queryKey: ['bajas'] }); toast.success('Proceso de Baja iniciado'); setIsBajaModalOpen(false); setSelectedGuardia(null); },
    onError: () => toast.error('Error al procesar la baja'),
  });

  const uploadDocMutation = useMutation({
    mutationFn: (payload: { formData: FormData }) => apiFetch(`/api/guardias/${selectedGuardia.id}/documentos`, {
      method: 'POST',
      body: payload.formData
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardia-documentos', selectedGuardia?.id] });
      toast.success('Documento guardado en expediente');
      setDocumentoNombre('');
      setDocumentoArchivo(null);
      const fileInput = document.getElementById('doc-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    },
    onError: (err: any) => {
      toast.error(err.message || 'Error al subir documento');
    }
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: number) => apiFetch(`/api/guardias/${selectedGuardia.id}/documentos/${docId}`, {
      method: 'DELETE'
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardia-documentos', selectedGuardia?.id] });
      toast.success('Documento eliminado');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Error al eliminar documento');
    }
  });

  // Helpers
  const startEdit = (guardia: any) => {
    setEditNombre(guardia.nombre);
    setEditNumeroElemento(guardia.numero_elemento);
    setEditFechaAlta(guardia.fecha_alta.split('T')[0]);
    setEditTelefono(guardia.telefono || '');
    setEditDireccion(guardia.direccion || '');
    setEditEstado(guardia.estado || 'Activo');
    setSelectedGuardia(guardia);
    setIsEditModalOpen(true);
  };

  const filteredData = useMemo(() => guardias.filter((g: any) => { const term = searchTerm.toLowerCase(); return (g.nombre || '').toLowerCase().includes(term) || (g.numero_elemento || '').toLowerCase().includes(term); }), [guardias, searchTerm]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h1 className="text-2xl font-bold tracking-tight">Personal de Guardias</h1><p className="text-muted-foreground mt-0.5 text-sm">Directorio de elementos operativos y gestión de estados.</p></div>
        {isEditor && <Button onClick={() => setIsModalOpen(true)}><UserPlus className="w-4 h-4 mr-2" /> Nuevo Guardia</Button>}
      </div>
      <div className="flex items-center gap-2 max-w-sm relative">
        <Search className="w-4 h-4 absolute left-3 text-muted-foreground" />
        <Input placeholder="Buscar por nombre o número..." className="pl-9" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número de Elemento</TableHead>
              <TableHead>Nombre del Guardia</TableHead>
              <TableHead>Fecha Alta</TableHead>
              <TableHead>Estado Actual</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Cargando...</TableCell></TableRow>
              : filteredData.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No hay guardias registrados.</TableCell></TableRow>
              : filteredData.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="font-bold">{item.numero_elemento}</TableCell>
                  <TableCell>
                    <div className="font-medium text-foreground">{item.nombre}</div>
                    {item.telefono && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5" title="Teléfono de contacto">
                        <Phone className="w-3.5 h-3.5 text-primary/70 inline-block mr-1" /> {item.telefono}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{fmtDate(item.fecha_alta)}</TableCell>
                  <TableCell><Badge variant={item.estado === 'Activo' ? 'success' : item.estado === 'En Baja' || item.estado === 'Baja Pendiente' ? 'destructive' : 'secondary'}>{item.estado}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end items-center gap-1.5">
                      <Button variant="ghost" size="sm" className="h-8" onClick={() => { setSelectedGuardia(item); setActiveTab('movimientos'); setIsExpedienteModalOpen(true); }}><Eye className="w-3.5 h-3.5 mr-1" /> Expediente</Button>
                      <Button variant="ghost" size="sm" className="h-8" title="Ficha PDF" onClick={() => descargarFichaPdf(item.id, item.numero_elemento)}><Download className="w-3.5 h-3.5" /></Button>
                      {isEditor && (
                        <>
                          <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-foreground" onClick={() => startEdit(item)} title="Editar Datos"><Edit className="w-3.5 h-3.5" /></Button>
                          {item.estado === 'Activo' && (
                            <Button variant="outline" size="sm" className="h-8 text-destructive hover:bg-destructive/10" onClick={() => { setSelectedGuardia(item); setIsBajaModalOpen(true); }} title="Dar de Baja"><LogOut className="w-3.5 h-3.5" /></Button>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
      
      {/* Create Guard Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <form onSubmit={e => { e.preventDefault(); createMutation.mutate({ numero_elemento: numeroElemento, nombre, fecha_alta: fechaAlta, telefono, direccion }); }}>
            <DialogHeader><DialogTitle>Registrar Nuevo Guardia</DialogTitle><DialogDescription>Añade los datos generales e información de contacto del elemento operativo.</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2"><label className="text-sm font-medium">Número de Elemento</label><Input value={numeroElemento} onChange={e => setNumeroElemento(e.target.value)} placeholder="Ej. ELEM-001" required /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Nombre Completo</label><Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del guardia" required /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Fecha de Alta</label><Input type="date" value={fechaAlta} onChange={e => setFechaAlta(e.target.value)} required /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Teléfono de Contacto</label><Input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="Ej. 5512345678" /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Dirección de Domicilio</label><Input value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Calle, Número, Colonia, Alcaldía" /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button><Button type="submit" disabled={createMutation.isPending}>Guardar Registro</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Guard Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent>
          <form onSubmit={e => { e.preventDefault(); if (selectedGuardia) editMutation.mutate({ id: selectedGuardia.id, numero_elemento: editNumeroElemento, nombre: editNombre, fecha_alta: editFechaAlta, telefono: editTelefono, direccion: editDireccion, estado: editEstado }); }}>
            <DialogHeader><DialogTitle>Editar Datos del Guardia</DialogTitle><DialogDescription>Modifica los datos del elemento operativo y su contacto.</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2"><label className="text-sm font-medium">Número de Elemento</label><Input value={editNumeroElemento} onChange={e => setEditNumeroElemento(e.target.value)} required /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Nombre Completo</label><Input value={editNombre} onChange={e => setEditNombre(e.target.value)} required /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Fecha de Alta</label><Input type="date" value={editFechaAlta} onChange={e => setEditFechaAlta(e.target.value)} required /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Teléfono de Contacto</label><Input value={editTelefono} onChange={e => setEditTelefono(e.target.value)} placeholder="Ej. 5512345678" /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Dirección de Domicilio</label><Input value={editDireccion} onChange={e => setEditDireccion(e.target.value)} placeholder="Calle, Número, Colonia, Alcaldía" /></div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Estado</label>
                <select value={editEstado} onChange={e => setEditEstado(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  <option value="Activo">Activo</option>
                  <option value="Baja Pendiente">Baja Pendiente</option>
                  <option value="En Baja">En Baja</option>
                </select>
              </div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancelar</Button><Button type="submit" disabled={editMutation.isPending}>Guardar Cambios</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Process Baja Modal */}
      <Dialog open={isBajaModalOpen} onOpenChange={setIsBajaModalOpen}>
        <DialogContent>
          <form onSubmit={e => { e.preventDefault(); if (selectedGuardia) bajaMutation.mutate({ id: selectedGuardia.id, fecha: fechaBaja }); }}>
            <DialogHeader><DialogTitle>Iniciar Proceso de Baja</DialogTitle><DialogDescription>Para <b>{selectedGuardia?.nombre}</b>.</DialogDescription></DialogHeader>
            <div className="py-4 space-y-4">
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">Se recopilará el equipo en campo y se generará el checklist de devolución.</div>
              <div className="space-y-2"><label className="text-sm font-medium">Fecha de Baja Efectiva</label><Input type="date" value={fechaBaja} onChange={e => setFechaBaja(e.target.value)} required /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setIsBajaModalOpen(false)}>Cancelar</Button><Button type="submit" variant="destructive" disabled={bajaMutation.isPending}>Confirmar Baja</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Expediente Modal */}
      <Dialog open={isExpedienteModalOpen} onOpenChange={setIsExpedienteModalOpen} className="max-w-4xl">
        <DialogContent className="max-h-[90vh] flex flex-col p-4 sm:p-6">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Expediente: {selectedGuardia?.nombre}</DialogTitle>
            <DialogDescription>Elemento: {selectedGuardia?.numero_elemento} · Estado: {selectedGuardia?.estado}</DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-4 my-2">
            {/* Guard Profile Summary */}
            <div className="p-4 bg-muted/40 rounded-xl border border-border">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div><span className="text-muted-foreground">Nombre:</span><span className="font-semibold ml-2">{selectedGuardia?.nombre}</span></div>
                <div><span className="text-muted-foreground">Nº Elemento:</span><span className="font-semibold ml-2">{selectedGuardia?.numero_elemento}</span></div>
                <div><span className="text-muted-foreground">Fecha Alta:</span><span className="font-semibold ml-2">{fmtDate(selectedGuardia?.fecha_alta)}</span></div>
                <div><span className="text-muted-foreground">Estado:</span><span className="font-semibold ml-2">{selectedGuardia?.estado}</span></div>
                {selectedGuardia?.telefono && (
                  <div><span className="text-muted-foreground">Teléfono:</span><span className="font-semibold ml-2 inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-primary/70 mr-1" />{selectedGuardia?.telefono}</span></div>
                )}
                {selectedGuardia?.direccion && (
                  <div className="col-span-1 md:col-span-2"><span className="text-muted-foreground">Dirección:</span><span className="font-semibold ml-2 inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-primary/70 mr-1" />{selectedGuardia?.direccion}</span></div>
                )}
              </div>
            </div>

            {/* Tabs Selector */}
            <div className="flex border-b border-border mb-4 overflow-x-auto scroll-touch no-scrollbar [&>button]:flex-shrink-0 [&>button]:whitespace-nowrap">
              <button
                type="button"
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'movimientos'
                    ? 'border-primary text-primary font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setActiveTab('movimientos')}
              >
                Inventario y Movimientos
              </button>
              <button
                type="button"
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'documentos'
                    ? 'border-primary text-primary font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setActiveTab('documentos')}
              >
                Expediente Digital ({documentos.length || 0})
              </button>
            </div>

            {/* Tab 1: Movimientos */}
            {activeTab === 'movimientos' && (
              <div className="space-y-4">
                {isLoadingExpediente ? <p className="text-center text-muted-foreground py-6">Cargando expediente...</p>
                  : expedienteSalidas.length === 0 ? <p className="text-center text-muted-foreground py-6">No hay salidas registradas.</p>
                  : (
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                      <Table>
                        <TableHeader><TableRow><TableHead className="text-xs w-8">No.</TableHead><TableHead className="text-xs">Fecha</TableHead><TableHead className="text-xs">Artículo</TableHead><TableHead className="text-xs">Talla</TableHead><TableHead className="text-xs text-right">Cant.</TableHead><TableHead className="text-xs">Movimiento</TableHead><TableHead className="text-xs">Estado</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {expedienteSalidas.map((item: any, idx: number) => {
                            const est = item.estado_asignacion;
                            const conceptoLabel = item.concepto === 'Uniforme en Campo' || item.concepto === 'Asignación' ? 'Dotación Inicial' : item.concepto === 'Reposición' ? 'Reposición' : item.concepto === 'Extravío' ? 'Extravío / Pérdida' : item.concepto === 'Inutilizable' ? 'Baja / Inutilizable' : (item.concepto || '—');
                            const estadoLabel = est === 'N/A' ? (item.concepto === 'Inutilizable' ? 'Dado de Baja' : 'Evento') : est === 'Extraviado' ? 'Extraviado' : (est || '—');
                            const cfg: Record<string, string> = { 'Uniforme en Campo': 'bg-blue-100 text-blue-700 border-blue-200', 'Uniforme en Bajas': 'bg-amber-100 text-amber-700 border-amber-200', 'Entregado Definitivo': 'bg-emerald-100 text-emerald-700 border-emerald-200', 'Devuelto': 'bg-emerald-50 text-emerald-600 border-emerald-200', 'Extraviado': 'bg-orange-100 text-orange-700 border-orange-200', 'N/A': 'bg-red-100 text-red-700 border-red-200' };
                            const cls = cfg[est] ?? 'bg-secondary text-secondary-foreground border-border';
                            return (
                              <TableRow key={item.id}>
                                <TableCell className="text-muted-foreground tabular-nums text-xs">{idx + 1}</TableCell>
                                <TableCell className="tabular-nums text-sm">{fmtDate(item.fecha)}</TableCell>
                                <TableCell className="font-medium text-sm">{item.articulo}</TableCell>
                                <TableCell className="text-muted-foreground text-sm">{item.talla || '—'}</TableCell>
                                <TableCell className="text-right tabular-nums text-sm">{item.cantidad}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{conceptoLabel}</TableCell>
                                <TableCell><span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{estadoLabel}</span></TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                {expedienteEntradas.filter((e: any) => e.motivo === 'Recuperado').length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Equipo recuperado del guardia</p>
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                      <Table>
                        <TableHeader><TableRow><TableHead className="text-xs">Fecha</TableHead><TableHead className="text-xs">Artículo</TableHead><TableHead className="text-xs">Talla</TableHead><TableHead className="text-xs text-right">Cant.</TableHead><TableHead className="text-xs">Estado al recuperar</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {expedienteEntradas.filter((e: any) => e.motivo === 'Recuperado').map((item: any) => (
                            <TableRow key={item.id}>
                              <TableCell className="tabular-nums text-sm">{fmtDate(item.fecha)}</TableCell>
                              <TableCell className="font-medium text-sm">{item.articulo}</TableCell>
                              <TableCell className="text-muted-foreground text-sm">{item.talla || '—'}</TableCell>
                              <TableCell className="text-right tabular-nums text-sm">{item.cantidad}</TableCell>
                              <TableCell><span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 border-amber-200">{item.estado || '—'}</span></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Documentos */}
            {activeTab === 'documentos' && (
              <div className="space-y-6">
                {/* Upload Form */}
                {isEditor && (
                  <div className="p-4 bg-muted/20 border border-border border-dashed rounded-xl space-y-4">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5"><Upload className="w-4 h-4 text-primary" /> Digitalizar Nuevo Documento</h3>
                    <form
                      onSubmit={e => {
                        e.preventDefault();
                        if (!documentoArchivo || !documentoNombre) return;
                        const formData = new FormData();
                        formData.append('file', documentoArchivo);
                        formData.append('nombre_documento', documentoNombre);
                        uploadDocMutation.mutate({ formData });
                      }}
                      className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
                    >
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Tipo de Documento</label>
                        <select
                          value={documentoNombre}
                          onChange={e => setDocumentoNombre(e.target.value)}
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          required
                        >
                          <option value="">Selecciona tipo...</option>
                          <option value="Identificación Oficial (INE/Pasaporte)">Identificación Oficial (INE/Pasaporte)</option>
                          <option value="Comprobante de Domicilio">Comprobante de Domicilio</option>
                          <option value="Acta de Nacimiento">Acta de Nacimiento</option>
                          <option value="Clave Única de Registro de Población (CURP)">Clave Única de Registro de Población (CURP)</option>
                          <option value="Contrato de Trabajo">Contrato de Trabajo</option>
                          <option value="Certificado de Antecedentes No Penales">Certificado de Antecedentes No Penales</option>
                          <option value="Examen Médico">Examen Médico</option>
                          <option value="Cartilla Militar">Cartilla Militar</option>
                          <option value="Otro Documento">Otro Documento</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Archivo Escaneado (PDF/Imagen)</label>
                        <input
                          id="doc-file-input"
                          type="file"
                          accept=".pdf,image/*"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) setDocumentoArchivo(file);
                          }}
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm file:border-0 file:bg-transparent file:text-xs file:font-semibold placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                          required
                        />
                      </div>
                      <Button type="submit" disabled={uploadDocMutation.isPending || !documentoNombre || !documentoArchivo}>
                        {uploadDocMutation.isPending ? 'Subiendo...' : 'Subir Archivo'}
                      </Button>
                    </form>
                  </div>
                )}

                {/* Documents List */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Documentos Registrados en Expediente</h3>
                  {isLoadingDocumentos ? (
                    <p className="text-center text-muted-foreground text-sm py-4 animate-pulse">Cargando documentos escaneados...</p>
                  ) : documentos.length === 0 ? (
                    <div className="text-center border border-border border-dashed rounded-xl py-8 text-muted-foreground">
                      <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
                      <p className="text-sm font-medium">No hay documentos digitalizados.</p>
                      <p className="text-xs mt-0.5">Sube identificaciones, comprobantes o contratos de este guardia.</p>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {documentos.map((doc: any) => (
                        <div key={doc.id} className="flex items-center justify-between p-3 border border-border rounded-xl bg-card hover:bg-muted/10 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 text-primary rounded-lg">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold">{doc.nombre_documento}</p>
                              <p className="text-xs text-muted-foreground">Subido el {fmtDate(doc.fecha_subida)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <a
                              href={`/api/guardias/${selectedGuardia.id}/documentos/${doc.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-3"
                            >
                              <Download className="w-4 h-4 mr-1.5" /> Ver / Descargar
                            </a>
                            {isEditor && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-destructive hover:bg-destructive/10"
                                onClick={() => {
                                  if (confirm(`¿Estás seguro de eliminar el documento "${doc.nombre_documento}"?`)) {
                                    deleteDocMutation.mutate(doc.id);
                                  }
                                }}
                                disabled={deleteDocMutation.isPending}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-shrink-0 pt-2 border-t border-border mt-2">
            <Button variant="outline" onClick={() => setIsExpedienteModalOpen(false)}>Cerrar</Button>
            {activeTab === 'movimientos' && (
              <Button variant="secondary" onClick={() => imprimirExpediente(selectedGuardia, expedienteSalidas, expedienteEntradas)} disabled={isLoadingExpediente || expedienteSalidas.length === 0}><Printer className="w-4 h-4 mr-2" /> Imprimir / PDF</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
