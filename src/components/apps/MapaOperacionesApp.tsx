'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/src/lib/api';
import { useAuth } from '@/src/context/AuthContext';

import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Select } from '@/src/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/src/components/ui/dialog';
import { MapPin, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Servicio } from '@/src/components/OperationsMap';

const OperationsMap = dynamic(() => import('@/src/components/OperationsMap'), { ssr: false, loading: () => <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Cargando mapa...</div> });

interface Guardia { id: number; nombre: string; numero_elemento: string; estado: string; }

export default function MapaOperacionesApp() {
  const { isEditor } = useAuth();
  const queryClient = useQueryClient();
  const [addingMode, setAddingMode] = useState(false);
  const [newServicioPos, setNewServicioPos] = useState<{ lat: number; lng: number } | null>(null);
  const [newServicioForm, setNewServicioForm] = useState({ nombre: '', direccion: '' });
  const [manageServicio, setManageServicio] = useState<Servicio | null>(null);
  const [asignarForm, setAsignarForm] = useState({ guardia_id: '', turno: '' });

  const { data: servicios = [], isLoading } = useQuery({
    queryKey: ['servicios'],
    queryFn: () => apiFetch<Servicio[]>('/api/servicios'),
  });
  const { data: guardias = [] } = useQuery({
    queryKey: ['guardias'],
    queryFn: () => apiFetch<Guardia[]>('/api/guardias'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['servicios'] });

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiFetch('/api/servicios', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { invalidate(); toast.success('Servicio agregado'); setNewServicioPos(null); setNewServicioForm({ nombre: '', direccion: '' }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const moveMutation = useMutation({
    mutationFn: ({ id, lat, lng }: { id: number; lat: number; lng: number }) => apiFetch(`/api/servicios/${id}`, { method: 'PUT', body: JSON.stringify({ lat, lng }) }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/servicios/${id}`, { method: 'DELETE' }),
    onSuccess: () => { invalidate(); toast.success('Servicio eliminado'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const asignarMutation = useMutation({
    mutationFn: ({ servicioId, guardia_id, turno }: any) => apiFetch(`/api/servicios/${servicioId}/guardias`, { method: 'POST', body: JSON.stringify({ guardia_id, turno }) }),
    onSuccess: () => { invalidate(); toast.success('Guardia asignado'); setManageServicio(null); setAsignarForm({ guardia_id: '', turno: '' }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const quitarMutation = useMutation({
    mutationFn: ({ servicioId, guardiaId }: any) => apiFetch(`/api/servicios/${servicioId}/guardias/${guardiaId}`, { method: 'DELETE' }),
    onSuccess: () => { invalidate(); toast.success('Guardia removido'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleMapClick = (lat: number, lng: number) => {
    setAddingMode(false);
    setNewServicioPos({ lat, lng });
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServicioPos) return;
    createMutation.mutate({ ...newServicioForm, lat: newServicioPos.lat, lng: newServicioPos.lng });
  };

  const handleAsignarSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manageServicio || !asignarForm.guardia_id) { toast.error('Selecciona un guardia'); return; }
    asignarMutation.mutate({ servicioId: manageServicio.id, guardia_id: Number(asignarForm.guardia_id), turno: asignarForm.turno || null });
  };

  return (
    <div className="flex flex-col h-full -m-4 sm:-m-6 lg:-m-8">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border flex-shrink-0">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Mapa de Operaciones — CDMX</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{servicios.length} servicio{servicios.length !== 1 ? 's' : ''} registrados</p>
        </div>
        {isEditor && (
          <Button size="sm" variant={addingMode ? 'default' : 'outline'} onClick={() => setAddingMode((v) => !v)}>
            {addingMode ? 'Click en el mapa para colocar...' : 'Agregar servicio'}
          </Button>
        )}
      </div>
      <div className="flex-1 relative">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Cargando servicios...</div>
        ) : (
          <OperationsMap
            servicios={servicios}
            addingMode={addingMode}
            canEdit={isEditor}
            onMapClick={handleMapClick}
            onMarkerDragEnd={(id, lat, lng) => moveMutation.mutate({ id, lat, lng })}
            onManage={(s) => setManageServicio(s)}
            onDelete={(s) => { if (confirm(`¿Eliminar el servicio "${s.nombre}"?`)) deleteMutation.mutate(s.id); }}
            onRemoveGuardia={(s, guardiaId) => quitarMutation.mutate({ servicioId: s.id, guardiaId })}
          />
        )}
      </div>

      <Dialog open={!!newServicioPos} onOpenChange={(open) => !open && setNewServicioPos(null)}>
        <DialogContent>
          <form onSubmit={handleCreateSubmit}>
            <DialogHeader><DialogTitle>Nuevo servicio</DialogTitle><DialogDescription>Se registrará en la posición seleccionada del mapa</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2"><label className="text-sm font-medium">Nombre del servicio/cliente</label><Input value={newServicioForm.nombre} onChange={(e) => setNewServicioForm((f) => ({ ...f, nombre: e.target.value }))} required /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Dirección</label><Input value={newServicioForm.direccion} onChange={(e) => setNewServicioForm((f) => ({ ...f, direccion: e.target.value }))} placeholder="Calle, colonia, alcaldía" /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewServicioPos(null)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending}>Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!manageServicio} onOpenChange={(open) => !open && setManageServicio(null)}>
        <DialogContent>
          <form onSubmit={handleAsignarSubmit}>
            <DialogHeader><DialogTitle>Asignar guardia</DialogTitle><DialogDescription>{manageServicio?.nombre}</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Guardia</label>
                <Select value={asignarForm.guardia_id} onChange={(e) => setAsignarForm((f) => ({ ...f, guardia_id: e.target.value }))} required>
                  <option value="" disabled>Seleccionar...</option>
                  {guardias.filter((g) => g.estado === 'Activo').map((g) => <option key={g.id} value={g.id}>{g.nombre} · {g.numero_elemento}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Turno (opcional)</label>
                <Select value={asignarForm.turno} onChange={(e) => setAsignarForm((f) => ({ ...f, turno: e.target.value }))}>
                  <option value="">Sin especificar</option>
                  <option value="Diurno">Diurno</option>
                  <option value="Nocturno">Nocturno</option>
                  <option value="Mixto">Mixto</option>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setManageServicio(null)}>Cancelar</Button>
              <Button type="submit" disabled={asignarMutation.isPending}>Asignar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
