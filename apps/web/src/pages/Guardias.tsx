import { useState, useMemo } from 'react';
import { apiFetch } from '../lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Search, UserPlus, LogOut, Printer } from 'lucide-react';
import { fmtDate } from '../lib/utils';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

// ─── Print helper: opens a clean new window for the expediente PDF ─────────────
function imprimirExpediente(guardia: any, salidas: any[], entradas: any[]) {
  const fecha = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

  // Current possession
  const enPosesion = salidas.filter(s => s.estado_asignacion === 'Uniforme en Campo');
  const saldoMap: Record<string, number> = {};
  enPosesion.forEach(s => {
    const key = `${s.articulo}${s.talla ? ` (Talla: ${s.talla})` : ''}`;
    saldoMap[key] = (saldoMap[key] || 0) + s.cantidad;
  });

  // Sección I. Dotación
  const dotacion = salidas.filter(s => s.concepto === 'Uniforme en Campo' || s.concepto === 'Asignación');
  // Sección II. Reposición
  const reposicion = salidas.filter(s => s.concepto === 'Reposición');
  // Sección III. Pérdidas
  const extravios = salidas.filter(s => s.concepto === 'Extravío' || s.concepto === 'Inutilizable');
  // Sección IV. Recuperados
  const recuperados = entradas.filter(e => e.motivo === 'Recuperado');
  // Entradas de reposición para cotejar condición devuelta
  const reposicionEntradas = entradas.filter(e => e.motivo === 'Reposición (Entrada Múltiple)');

  // Métricas
  const totalDotaciones = dotacion.reduce((a: number, s: any) => a + s.cantidad, 0);
  const totalReposiciones = reposicion.reduce((a: number, s: any) => a + s.cantidad, 0);
  const totalPerdidas = extravios.reduce((a: number, s: any) => a + s.cantidad, 0);
  const totalEnPosesion = Object.values(saldoMap).reduce((a, v) => a + v, 0);

  const saldoItemsHtml = Object.entries(saldoMap).length === 0
    ? '<p style="color:#6b7280; font-style:italic; font-size:11px; margin-top:8px">El guardia no tiene artículos en posesión actualmente.</p>'
    : `<ul style="list-style:none; padding:0; display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-top:8px;">
        ${Object.entries(saldoMap).map(([art, qty]) => `
          <li style="font-size:11px;"><strong>${qty}x</strong> ${art}</li>
        `).join('')}
       </ul>`;

  const saldoHtml = `
    <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:8px; margin-bottom:10px;">
      <div style="text-align:center; background:#dbeafe; border-radius:6px; padding:8px;">
        <div style="font-size:20px; font-weight:900; color:#1d4ed8;">${totalDotaciones}</div>
        <div style="font-size:9px; color:#1e40af; text-transform:uppercase; font-weight:700;">Piezas dotadas</div>
      </div>
      <div style="text-align:center; background:#ede9fe; border-radius:6px; padding:8px;">
        <div style="font-size:20px; font-weight:900; color:#7c3aed;">${totalReposiciones}</div>
        <div style="font-size:9px; color:#6d28d9; text-transform:uppercase; font-weight:700;">Piezas repuestas</div>
      </div>
      <div style="text-align:center; background:#fee2e2; border-radius:6px; padding:8px;">
        <div style="font-size:20px; font-weight:900; color:#dc2626;">${totalPerdidas}</div>
        <div style="font-size:9px; color:#b91c1c; text-transform:uppercase; font-weight:700;">Pérdidas / Bajas</div>
      </div>
      <div style="text-align:center; background:#d1fae5; border-radius:6px; padding:8px;">
        <div style="font-size:20px; font-weight:900; color:#059669;">${totalEnPosesion}</div>
        <div style="font-size:9px; color:#047857; text-transform:uppercase; font-weight:700;">En posesión ahora</div>
      </div>
    </div>
    ${saldoItemsHtml}
  `;

  const renderRowDotacion = (item: any, idx: number) => `
    <tr>
      <td style="text-align:center">${idx + 1}</td>
      <td>${fmtDate(item.fecha)}</td>
      <td><strong>${item.articulo}</strong></td>
      <td style="text-align:center">${item.talla || '—'}</td>
      <td style="text-align:center">${item.cantidad}</td>
      <td>${item.estado_fisico || 'Nuevo'}</td>
    </tr>
  `;

  const renderRowReposicion = (item: any, idx: number) => {
    const matched = reposicionEntradas.find((e: any) =>
      e.articulo === item.articulo && (!item.talla || e.talla === item.talla) && e.fecha === item.fecha
    );
    const devuelto = matched?.estado || '—';
    return `
      <tr>
        <td style="text-align:center">${idx + 1}</td>
        <td>${fmtDate(item.fecha)}</td>
        <td><strong>${item.articulo}</strong></td>
        <td style="text-align:center">${item.talla || '—'}</td>
        <td style="text-align:center">${item.cantidad}</td>
        <td>Devolvió: <strong>${devuelto}</strong> → Recibió: <strong>${item.estado_fisico || 'Nuevo'}</strong></td>
      </tr>
    `;
  };

  const renderRowExtravios = (item: any, idx: number) => {
    const obs = item.observaciones ? ` <br/><i style="color:#6b7280">${item.observaciones}</i>` : '';
    return `
      <tr>
        <td style="text-align:center">${idx + 1}</td>
        <td>${fmtDate(item.fecha)}</td>
        <td><strong>${item.articulo}</strong></td>
        <td style="text-align:center">${item.talla || '—'}</td>
        <td style="text-align:center">${item.cantidad}</td>
        <td>${item.concepto || 'Extravío'}${obs}</td>
      </tr>
    `;
  };

  const renderRowRecuperado = (item: any, idx: number) => `
    <tr>
      <td style="text-align:center">${idx + 1}</td>
      <td>${fmtDate(item.fecha)}</td>
      <td><strong>${item.articulo}</strong></td>
      <td style="text-align:center">${item.talla || '—'}</td>
      <td style="text-align:center">${item.cantidad}</td>
      <td>${item.estado || '—'}</td>
    </tr>
  `;

  const thBase = `<th style="width:30px">No.</th><th>Fecha</th><th>Artículo</th><th style="text-align:center">Talla</th><th style="text-align:center">Cant.</th>`;
  const mkHeader = (lastCol: string) => `<thead><tr>${thBase}<th>${lastCol}</th></tr></thead>`;

  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Expediente — ${guardia.nombre}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 28px 36px; }
    .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1d4ed8; padding-bottom: 10px; margin-bottom: 14px; }
    .header-left h1 { font-size: 18px; font-weight: 900; color: #1d4ed8; letter-spacing: 1px; text-transform: uppercase; }
    .header-left p  { font-size: 10px; color: #6b7280; margin-top: 2px; }
    .header-right   { text-align: right; font-size: 10px; color: #374151; }
    .header-right strong { font-size: 12px; display: block; color: #1d4ed8; }
    .doc-title { text-align: center; font-size: 13px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; background: #1d4ed8; color: #fff; padding: 5px 0; margin-bottom: 14px; }
    .ficha { border: 1.5px solid #1d4ed8; border-radius: 4px; padding: 10px 14px; margin-bottom: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; }
    .ficha-field span { color: #6b7280; font-size: 10px; display: block; }
    .ficha-field strong { font-size: 12px; color: #111; }
    .section-title { font-size: 12px; font-weight: 700; color: #1d4ed8; margin: 16px 0 6px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;}
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    thead tr { background: #1d4ed8; color: #fff; }
    th { padding: 6px 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; }
    td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
    tr:nth-child(even) td { background: #f0f4ff; }
    .saldo-box { margin: 20px 0; padding: 12px; border: 2px dashed #1d4ed8; border-radius: 6px; background-color: #eff6ff; }
    .saldo-title { font-size: 13px; font-weight: 800; color: #1e3a8a; margin-bottom: 8px; text-transform: uppercase; }
    .firmas { display: flex; justify-content: space-around; margin-top: 40px; }
    .firma { text-align: center; width: 200px; }
    .firma-line { border-bottom: 1.5px solid #111; margin-bottom: 6px; height: 36px; }
    .firma p { font-size: 10px; font-weight: 700; text-transform: uppercase; }
    .firma small { font-size: 9px; color: #6b7280; }
    .pie { margin-top: 20px; padding-top: 8px; border-top: 1px solid #d1d5db; font-size: 9px; color: #9ca3af; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>U3 Seguridad Privada</h1>
      <p>Control de Uniformes y Dotaciones · Uso Interno</p>
    </div>
    <div class="header-right">
      <strong>EXPEDIENTE DE ELEMENTO</strong>
      Ciudad de México, México.<br/>
      Fecha de expedición:<br/>${fecha}
    </div>
  </div>

  <div class="doc-title">ENTREGA DE UNIFORME Y/O EQUIPO DE TRABAJO</div>

  <div class="ficha">
    <div class="ficha-field"><span>Nombre Completo</span><strong>${guardia.nombre}</strong></div>
    <div class="ficha-field"><span>Número de Elemento</span><strong>${guardia.numero_elemento}</strong></div>
    <div class="ficha-field"><span>Fecha de Alta</span><strong>${fmtDate(guardia.fecha_alta)}</strong></div>
    <div class="ficha-field"><span>Estatus Operativo</span><strong>${guardia.estado}</strong></div>
  </div>

  <div class="section-title">I. Dotación de equipo y/o uniforme inicial</div>
  ${dotacion.length === 0 ? '<p style="color:#6b7280; font-size:11px">Sin registros.</p>' : `
  <table>
    ${mkHeader('Estado')}
    <tbody>${dotacion.map((item: any, idx: number) => renderRowDotacion(item, idx)).join('')}</tbody>
  </table>`}

  <div class="section-title">II. Equipo que se le repuso al guardia</div>
  ${reposicion.length === 0 ? '<p style="color:#6b7280; font-size:11px">Sin registros.</p>' : `
  <table>
    ${mkHeader('Estado devuelto → Entregado')}
    <tbody>${reposicion.map((item: any, idx: number) => renderRowReposicion(item, idx)).join('')}</tbody>
  </table>`}

  <div class="section-title">III. Equipo que el guardia ha perdido</div>
  ${extravios.length === 0 ? '<p style="color:#6b7280; font-size:11px">Sin registros.</p>' : `
  <table>
    ${mkHeader('Tipo / Observaciones')}
    <tbody>${extravios.map((item: any, idx: number) => renderRowExtravios(item, idx)).join('')}</tbody>
  </table>`}

  ${recuperados.length === 0 ? '' : `
  <div class="section-title">IV. Equipo recuperado del guardia</div>
  <table>
    ${mkHeader('Estado al recuperar')}
    <tbody>${recuperados.map((item: any, idx: number) => renderRowRecuperado(item, idx)).join('')}</tbody>
  </table>`}

  <div class="saldo-box">
    <div class="saldo-title">Saldo Actual en Posesión</div>
    ${saldoHtml}
  </div>

  <div class="firmas">
    <div class="firma">
      <div class="firma-line"></div>
      <p>Firma del Elemento</p>
      <small>${guardia.nombre}</small><br/>
      <small>${guardia.numero_elemento}</small>
    </div>
    <div class="firma">
      <div class="firma-line"></div>
      <p>Responsable de Almacén</p>
      <small>U3 Seguridad Privada</small><br/>
      <small>Control de Dotaciones</small>
    </div>
  </div>

  <div class="pie">
    Documento generado automáticamente por el sistema de Control de Uniformes · U3 Seguridad Privada · Solo para uso administrativo interno.
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'width=900,height=720');
  if (!win) { alert('Permite ventanas emergentes para imprimir'); return; }
  win.addEventListener('load', () => {
    win.focus();
    win.print();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
}

export default function Guardias() {
  const { isEditor } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBajaModalOpen, setIsBajaModalOpen] = useState(false);
  const [isExpedienteModalOpen, setIsExpedienteModalOpen] = useState(false);

  // Create state
  const [numeroElemento, setNumeroElemento] = useState('');
  const [nombre, setNombre] = useState('');
  const [fechaAlta, setFechaAlta] = useState(new Date().toISOString().split('T')[0]);

  // Baja state
  const [selectedGuardia, setSelectedGuardia] = useState<any>(null);
  const [fechaBaja, setFechaBaja] = useState(new Date().toISOString().split('T')[0]);

  const { data: guardias = [], isLoading } = useQuery({
    queryKey: ['guardias'],
    queryFn: async () => {
      return apiFetch<any[]>('/api/guardias');
    }
  });

  const { data: expedienteRes, isLoading: isLoadingExpediente } = useQuery({
    queryKey: ['expediente', selectedGuardia?.id],
    queryFn: async () => {
      return apiFetch<{ salidas: any[], entradas: any[] }>(`/api/guardias/${selectedGuardia.id}/expediente`);
    },
    enabled: !!selectedGuardia && isExpedienteModalOpen
  });

  const expedienteSalidas = expedienteRes?.salidas || [];
  const expedienteEntradas = expedienteRes?.entradas || [];

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      return apiFetch('/api/guardias', { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardias'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
      toast.success('Guardia registrado exitosamente');
      setIsModalOpen(false);
      setNumeroElemento('');
      setNombre('');
    },
    onError: () => toast.error('Error al registrar el guardia (¿Número duplicado?)')
  });

  const bajaMutation = useMutation({
    mutationFn: async (payload: { id: number, fecha: string }) => {
      return apiFetch(`/api/guardias/${payload.id}/baja`, { method: 'POST', body: JSON.stringify({ fecha: payload.fecha }) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardias'] });
      queryClient.invalidateQueries({ queryKey: ['bajas'] });
      toast.success('Proceso de Baja iniciado. Dirígete a la sección Bajas para completarlo.');
      setIsBajaModalOpen(false);
      setSelectedGuardia(null);
    },
    onError: () => toast.error('Error al procesar la baja')
  });

  const filteredData = useMemo(() => {
    return guardias.filter((g: any) => {
      const term = searchTerm.toLowerCase();
      return (g.nombre || '').toLowerCase().includes(term) ||
        (g.numero_elemento || '').toLowerCase().includes(term);
    });
  }, [guardias, searchTerm]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ numero_elemento: numeroElemento, nombre, fecha_alta: fechaAlta });
  };

  const handleBaja = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGuardia) return;
    bajaMutation.mutate({ id: selectedGuardia.id, fecha: fechaBaja });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Personal de Guardias</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">Directorio de elementos operativos y gestión de estados.</p>
        </div>
        {isEditor && (
          <Button onClick={() => setIsModalOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2" /> Nuevo Guardia
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 max-w-sm relative">
        <Search className="w-4 h-4 absolute left-3 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre o número de elemento..."
          className="pl-9"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
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
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : filteredData.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No hay guardias registrados.</TableCell></TableRow>
            ) : (
              filteredData.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="font-bold">{item.numero_elemento}</TableCell>
                  <TableCell>{item.nombre}</TableCell>
                  <TableCell>{fmtDate(item.fecha_alta)}</TableCell>
                  <TableCell>
                    <Badge variant={item.estado === 'Activo' ? 'success' : item.estado === 'En Baja' || item.estado === 'Baja Pendiente' ? 'destructive' : 'secondary'}>
                      {item.estado}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="h-8 mr-2" onClick={() => { setSelectedGuardia(item); setIsExpedienteModalOpen(true); }}>
                      Ver Expediente
                    </Button>
                    {isEditor && item.estado === 'Activo' && (
                      <Button variant="outline" size="sm" className="h-8" onClick={() => { setSelectedGuardia(item); setIsBajaModalOpen(true); }}>
                        <LogOut className="w-3.5 h-3.5 mr-1.5" /> Dar de Baja
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal Alta */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Registrar Nuevo Guardia</DialogTitle>
              <DialogDescription>Añade los datos del elemento operativo que se incorpora a la empresa.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Número de Elemento</label>
                <Input value={numeroElemento} onChange={e => setNumeroElemento(e.target.value)} placeholder="Ej. ELEM-001" required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Nombre Completo</label>
                <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del guardia" required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Fecha de Alta</label>
                <Input type="date" value={fechaAlta} onChange={e => setFechaAlta(e.target.value)} required />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending}>Guardar Registro</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Baja */}
      <Dialog open={isBajaModalOpen} onOpenChange={setIsBajaModalOpen}>
        <DialogContent>
          <form onSubmit={handleBaja}>
            <DialogHeader>
              <DialogTitle>Iniciar Proceso de Baja</DialogTitle>
              <DialogDescription>Estás a punto de iniciar el proceso de baja para <b>{selectedGuardia?.nombre}</b>.</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                Se recopilará todo el equipo que tiene "En Campo" y se generará su checklist de devolución en la sección de "Bajas".
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Fecha de Baja Efectiva</label>
                <Input type="date" value={fechaBaja} onChange={e => setFechaBaja(e.target.value)} required />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsBajaModalOpen(false)}>Cancelar</Button>
              <Button type="submit" variant="destructive" disabled={bajaMutation.isPending}>Confirmar Baja</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Expediente */}
      <Dialog open={isExpedienteModalOpen} onOpenChange={setIsExpedienteModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-4 sm:p-6">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Expediente: {selectedGuardia?.nombre}</DialogTitle>
            <DialogDescription>Elemento: {selectedGuardia?.numero_elemento} · Estado: {selectedGuardia?.estado}</DialogDescription>
          </DialogHeader>

          {/* Contenedor escroleable para el contenido */}
          <div className="flex-1 overflow-y-auto pr-2 space-y-4 my-2">
            {/* Guardia info card */}
            <div className="p-4 bg-muted/40 rounded-xl border border-border">
              <div className="grid grid-cols-2 gap-y-3 text-sm">
                <div><span className="text-muted-foreground">Nombre:</span><span className="font-semibold ml-2">{selectedGuardia?.nombre}</span></div>
                <div><span className="text-muted-foreground">Nº Elemento:</span><span className="font-semibold ml-2">{selectedGuardia?.numero_elemento}</span></div>
                <div><span className="text-muted-foreground">Fecha Alta:</span><span className="font-semibold ml-2">{fmtDate(selectedGuardia?.fecha_alta)}</span></div>
                <div><span className="text-muted-foreground">Estado:</span><span className="font-semibold ml-2">{selectedGuardia?.estado}</span></div>
              </div>
            </div>

            {/* Expediente table */}
            <div>
              {isLoadingExpediente ? (
                <p className="text-center text-muted-foreground py-6">Cargando expediente...</p>
              ) : expedienteSalidas.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">Este guardia no tiene salidas registradas.</p>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs w-8">No.</TableHead>
                        <TableHead className="text-xs">Fecha</TableHead>
                        <TableHead className="text-xs">Artículo</TableHead>
                        <TableHead className="text-xs">Talla</TableHead>
                        <TableHead className="text-xs text-right">Cant.</TableHead>
                        <TableHead className="text-xs">Movimiento</TableHead>
                        <TableHead className="text-xs">Estado Actual</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expedienteSalidas.map((item: any, idx: number) => {
                        const est = item.estado_asignacion;
                        const conceptoLabel =
                          item.concepto === 'Uniforme en Campo' || item.concepto === 'Asignación' ? 'Dotación Inicial' :
                          item.concepto === 'Reposición' ? 'Reposición' :
                          item.concepto === 'Extravío' ? 'Extravío / Pérdida' :
                          item.concepto === 'Inutilizable' ? 'Baja / Inutilizable' :
                          (item.concepto || '—');
                        const estadoLabel =
                          est === 'N/A' ? (item.concepto === 'Inutilizable' ? 'Dado de Baja' : 'Evento') :
                          est === 'Extraviado' ? 'Extraviado' :
                          (est || '—');
                        const cfg: Record<string, string> = {
                          'Uniforme en Campo':    'bg-blue-100 text-blue-700 border-blue-200',
                          'Uniforme en Bajas':    'bg-amber-100 text-amber-700 border-amber-200',
                          'Entregado Definitivo': 'bg-emerald-100 text-emerald-700 border-emerald-200',
                          'Devuelto':             'bg-emerald-50 text-emerald-600 border-emerald-200',
                          'Extraviado':           'bg-orange-100 text-orange-700 border-orange-200',
                          'N/A':                  'bg-red-100 text-red-700 border-red-200',
                        };
                        const cls = cfg[est] ?? 'bg-secondary text-secondary-foreground border-border';
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="text-muted-foreground tabular-nums text-xs">{idx + 1}</TableCell>
                            <TableCell className="tabular-nums text-sm">{fmtDate(item.fecha)}</TableCell>
                            <TableCell className="font-medium text-sm">{item.articulo}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{item.talla || '—'}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{item.cantidad}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{conceptoLabel}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
                                {estadoLabel}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Artículos recuperados del guardia */}
            {expedienteEntradas.filter((e: any) => e.motivo === 'Recuperado').length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Equipo recuperado del guardia</p>
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Fecha</TableHead>
                        <TableHead className="text-xs">Artículo</TableHead>
                        <TableHead className="text-xs">Talla</TableHead>
                        <TableHead className="text-xs text-right">Cant.</TableHead>
                        <TableHead className="text-xs">Estado al recuperar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expedienteEntradas.filter((e: any) => e.motivo === 'Recuperado').map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell className="tabular-nums text-sm">{fmtDate(item.fecha)}</TableCell>
                          <TableCell className="font-medium text-sm">{item.articulo}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{item.talla || '—'}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{item.cantidad}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 border-amber-200">
                              {item.estado || '—'}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-shrink-0 pt-2 border-t border-border mt-2">
            <Button variant="outline" onClick={() => setIsExpedienteModalOpen(false)}>Cerrar</Button>
            <Button
              variant="secondary"
              onClick={() => imprimirExpediente(selectedGuardia, expedienteSalidas, expedienteEntradas)}
              disabled={isLoadingExpediente || expedienteSalidas.length === 0}
            >
              <Printer className="w-4 h-4 mr-2" /> Imprimir / PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
