import { useState, useMemo, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { ArrowDownToLine, Search, Download } from 'lucide-react';
import { fmtDate, downloadCSV } from '../lib/utils';
import { ARTICULOS, getTallas, requiereTalla as articuloRequiereTalla } from '../lib/constants';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

export default function Entradas() {
  const { isEditor } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [articulo, setArticulo] = useState<string>(ARTICULOS[0]);
  const [talla, setTalla] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [estado, setEstado] = useState('Nuevo');
  const [motivo, setMotivo] = useState('Compra');
  const [origenDevolucion, setOrigenDevolucion] = useState('');
  const [guardiaId, setGuardiaId] = useState('');
  const [registradoPor, setRegistradoPor] = useState('');

  const requiereTalla = articuloRequiereTalla(articulo);
  const tallasDisponibles = getTallas(articulo);

  const { data: guardias = [] } = useQuery({
    queryKey: ['guardias'],
    queryFn: async () => apiFetch<any[]>('/api/guardias')
  });

  const guardiasActivos = useMemo(
    () => (guardias as any[]).filter((g: any) => g.estado === 'Activo' || g.estado === 'En Baja' || g.estado === 'Baja Pendiente'),
    [guardias]
  );

  useEffect(() => {
    if (isModalOpen) {
      setFecha(new Date().toISOString().split('T')[0]);
      setArticulo(ARTICULOS[0]);
      setTalla('');
      setCantidad(1);
      setEstado('Nuevo');
      setMotivo('Compra');
      setOrigenDevolucion('');
      setGuardiaId('');
      setRegistradoPor('');
    }
  }, [isModalOpen]);

  const { data: entradas = [], isLoading } = useQuery({
    queryKey: ['entradas'],
    queryFn: async () => {
      return apiFetch<any[]>('/api/entradas');
    }
  });

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      return apiFetch('/api/entradas', { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entradas'] });
      queryClient.invalidateQueries({ queryKey: ['inventario'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
      queryClient.invalidateQueries({ queryKey: ['expediente'] });
      toast.success('Entrada registrada exitosamente');
      setIsModalOpen(false);
    },
    onError: () => toast.error('Error al registrar la entrada')
  });

  const filteredData = useMemo(() => {
    return entradas.filter((e: any) => {
      const term = searchTerm.toLowerCase();
      return e.articulo.toLowerCase().includes(term) ||
             e.motivo.toLowerCase().includes(term) ||
             (e.origen_devolucion && e.origen_devolucion.toLowerCase().includes(term));
    });
  }, [entradas, searchTerm]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (requiereTalla && !talla) {
      toast.error('Debe seleccionar una talla para este artículo');
      return;
    }
    if (motivo === 'Devolución de Equipo' && !origenDevolucion) {
      toast.error('Debe especificar quién entregó el equipo');
      return;
    }
    if (motivo === 'Recuperado' && !guardiaId) {
      toast.error('Debe seleccionar el guardia del que se recuperó el equipo');
      return;
    }

    mutation.mutate({
      fecha,
      articulo,
      talla: requiereTalla ? talla : null,
      cantidad: Number(cantidad),
      estado,
      motivo,
      origen_devolucion: motivo === 'Devolución de Equipo' ? origenDevolucion : null,
      guardia_id: (motivo === 'Recuperado' && guardiaId) ? Number(guardiaId) : null,
      registrado_por: registradoPor || null
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Entradas de Equipo</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">Registro de ingresos al almacén por compra o devoluciones.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            const rows = (entradas as any[]).map((e: any) => [
              fmtDate(e.fecha), e.articulo, e.talla || '—', e.cantidad, e.estado, e.motivo, e.origen_devolucion || '—'
            ]);
            downloadCSV(`entradas_${new Date().toISOString().split('T')[0]}.csv`,
              ['Fecha', 'Artículo', 'Talla', 'Cantidad', 'Estado', 'Motivo', 'Origen/Devolvió'], rows);
          }}>
            <Download className="w-4 h-4 mr-1.5" /> Exportar
          </Button>
          {isEditor && (
            <Button onClick={() => setIsModalOpen(true)}>
              <ArrowDownToLine className="w-4 h-4 mr-2" /> Nueva Entrada
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 max-w-sm relative">
        <Search className="w-4 h-4 absolute left-3 text-muted-foreground" />
        <Input 
          placeholder="Buscar por artículo, motivo o entregado por..." 
          className="pl-9"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Artículo</TableHead>
              <TableHead>Talla</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Motivo/Origen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : filteredData.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No hay registros de entradas.</TableCell></TableRow>
            ) : (
              filteredData.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{fmtDate(item.fecha)}</TableCell>
                  <TableCell>{item.articulo}</TableCell>
                  <TableCell>{item.talla || '-'}</TableCell>
                  <TableCell className="text-right">{item.cantidad}</TableCell>
                  <TableCell><Badge variant="outline">{item.estado}</Badge></TableCell>
                  <TableCell>
                    {item.motivo}
                    {item.origen_devolucion && <div className="text-xs text-muted-foreground mt-0.5">de: {item.origen_devolucion}</div>}
                    {item.registrado_por && <div className="text-[10px] italic text-muted-foreground/60 mt-0.5">por: {item.registrado_por}</div>}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Registrar Entrada</DialogTitle>
              <DialogDescription>Ingresa los detalles del nuevo stock para el almacén</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Fecha</label>
                  <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Artículo</label>
                  <Select value={articulo} onChange={e => {
                    setArticulo(e.target.value);
                    if (!articuloRequiereTalla(e.target.value)) setTalla('');
                  }} required>
                    {ARTICULOS.map(a => <option key={a} value={a}>{a}</option>)}
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {requiereTalla && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Talla</label>
                    <Select value={talla} onChange={e => setTalla(e.target.value)} required>
                      <option value="" disabled>Seleccionar...</option>
                      {tallasDisponibles.map(t => <option key={t} value={t}>{t}</option>)}
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Cantidad</label>
                  <Input type="number" min="1" value={cantidad} onChange={e => setCantidad(Number(e.target.value))} required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Estado de la Prenda</label>
                  <Select value={estado} onChange={e => setEstado(e.target.value)} required>
                    <option value="Nuevo">Nuevo</option>
                    <option value="Usado">Usado</option>
                    <option value="Inutilizable">Inutilizable</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Motivo</label>
                  <Select value={motivo} onChange={e => {
                    setMotivo(e.target.value)
                    if (e.target.value !== 'Devolución de Equipo') setOrigenDevolucion('')
                    if (e.target.value !== 'Recuperado') setGuardiaId('')
                  }} required>
                    <option value="Compra">Compra</option>
                    <option value="Devolución de Equipo">Devolución de Equipo</option>
                    <option value="Recuperado">Recuperado (de un guardia)</option>
                  </Select>
                </div>
              </div>

              {motivo === 'Devolución de Equipo' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Entregado por (Origen)</label>
                  <Input value={origenDevolucion} onChange={e => setOrigenDevolucion(e.target.value)} placeholder="Nombre del guardia o supervisor" required />
                </div>
              )}

              {motivo === 'Recuperado' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Recuperado del Guardia</label>
                  <Select value={guardiaId} onChange={e => setGuardiaId(e.target.value)} required>
                    <option value="">— Seleccionar guardia —</option>
                    {guardiasActivos.map((g: any) => (
                      <option key={g.id} value={g.id}>{g.nombre} · {g.numero_elemento}</option>
                    ))}
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Registrado por (Opcional)</label>
                <Input value={registradoPor} onChange={e => setRegistradoPor(e.target.value)} placeholder="Tu nombre" />
              </div>

            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={mutation.isPending}>Guardar Entrada</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
