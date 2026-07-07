'use client';
import { useState } from 'react';
import { apiFetch } from '@/src/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/src/components/ui/dialog';
import { KeyRound, Plus, Edit, Trash2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/src/context/AuthContext';

interface Permiso { ver: boolean; crear: boolean; editar: boolean; eliminar: boolean }
interface RolPersonalizado { id: number; nombre: string; descripcion: string | null; permisos: Record<string, Permiso>; color: string }

const MODULOS = [
  { id: 'inventario', label: 'Inventario' },
  { id: 'entradas', label: 'Entradas' },
  { id: 'salidas', label: 'Salidas' },
  { id: 'guardias', label: 'Guardias' },
  { id: 'reclutamiento', label: 'Reclutamiento' },
  { id: 'bajas', label: 'Bajas' },
  { id: 'agenda', label: 'Agenda / Incidencias' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'cotizaciones', label: 'Cotizaciones' },
  { id: 'ventas', label: 'Ventas' },
  { id: 'finanzas', label: 'Finanzas' },
  { id: 'usuarios', label: 'Usuarios' },
  { id: 'correo', label: 'Correo' },
  { id: 'whatsapp', label: 'WhatsApp' },
];

const PERMISO_VACIO: Permiso = { ver: false, crear: false, editar: false, eliminar: false };

function permisosVacios(): Record<string, Permiso> {
  return Object.fromEntries(MODULOS.map((m) => [m.id, { ...PERMISO_VACIO }]));
}

const FORM_INICIAL = { nombre: '', descripcion: '', color: 'slate', permisos: permisosVacios() };

export default function RolesApp() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RolPersonalizado | null>(null);
  const [form, setForm] = useState(FORM_INICIAL);

  const { data: roles = [], isLoading } = useQuery({ queryKey: ['roles'], queryFn: () => apiFetch<RolPersonalizado[]>('/api/roles'), enabled: isAdmin });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['roles'] });

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiFetch('/api/roles', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { invalidate(); toast.success('Rol creado'); setModalOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: any) => apiFetch(`/api/roles/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => { invalidate(); toast.success('Rol actualizado'); setModalOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/roles/${id}`, { method: 'DELETE' }),
    onSuccess: () => { invalidate(); toast.success('Rol eliminado'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setEditing(null); setForm(FORM_INICIAL); setModalOpen(true); };
  const openEdit = (r: RolPersonalizado) => {
    setEditing(r);
    setForm({ nombre: r.nombre, descripcion: r.descripcion ?? '', color: r.color, permisos: { ...permisosVacios(), ...r.permisos } });
    setModalOpen(true);
  };

  const toggle = (moduloId: string, campo: keyof Permiso) => {
    setForm((f) => ({ ...f, permisos: { ...f.permisos, [moduloId]: { ...f.permisos[moduloId], [campo]: !f.permisos[moduloId][campo] } } }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) updateMutation.mutate({ id: editing.id, ...form });
    else createMutation.mutate(form);
  };

  if (!isAdmin) return (<div className="flex flex-col items-center justify-center h-[50vh] gap-3"><p className="text-lg font-semibold">Sin permisos</p><p className="text-sm text-muted-foreground">Solo los administradores pueden gestionar roles.</p></div>);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h1 className="text-2xl font-bold tracking-tight">Roles y Permisos</h1><p className="text-sm text-muted-foreground mt-0.5">Define roles personalizados y asígnalos desde Usuarios</p></div>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Nuevo rol</Button>
      </div>

      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl">
        <Info className="w-5 h-5 mt-0.5 flex-shrink-0 text-blue-500" />
        <p className="text-sm">Estos roles y su matriz de permisos se guardan y son asignables a cada usuario, pero el control de acceso de cada página todavía depende del rol base (Administrador / Editor / Visualizador). Ampliar la validación para que respete esta matriz en cada módulo queda como siguiente paso.</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando roles...</p>
      ) : roles.length === 0 ? (
        <div className="text-center border border-border border-dashed rounded-xl py-12 text-muted-foreground">
          <KeyRound className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
          <p className="text-sm font-medium">Aún no hay roles personalizados.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map((r) => {
            const modulosConAcceso = MODULOS.filter((m) => r.permisos?.[m.id]?.ver).length;
            return (
              <div key={r.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><KeyRound className="w-4 h-4" /></div>
                    <div>
                      <p className="font-semibold text-sm">{r.nombre}</p>
                      <p className="text-xs text-muted-foreground">{modulosConAcceso} módulo{modulosConAcceso !== 1 ? 's' : ''} con acceso</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(r)}><Edit className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={() => { if (confirm(`¿Eliminar el rol "${r.nombre}"?`)) deleteMutation.mutate(r.id); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
                {r.descripcion && <p className="text-xs text-muted-foreground">{r.descripcion}</p>}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen} className="max-w-2xl">
        <DialogContent className="max-h-[90vh] flex flex-col">
          <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
            <DialogHeader><DialogTitle>{editing ? 'Editar rol' : 'Nuevo rol personalizado'}</DialogTitle><DialogDescription>Define el nombre y la matriz de permisos por módulo.</DialogDescription></DialogHeader>
            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              <div className="space-y-2"><label className="text-sm font-medium">Nombre del rol</label><Input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Supervisor de Ventas" required /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Descripción</label><Textarea value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} rows={2} /></div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Permisos por módulo</label>
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-muted/40"><th className="text-left px-3 py-2 font-semibold">Módulo</th><th className="px-2 py-2 font-semibold">Ver</th><th className="px-2 py-2 font-semibold">Crear</th><th className="px-2 py-2 font-semibold">Editar</th><th className="px-2 py-2 font-semibold">Eliminar</th></tr></thead>
                    <tbody>
                      {MODULOS.map((m) => (
                        <tr key={m.id} className="border-t border-border">
                          <td className="px-3 py-1.5">{m.label}</td>
                          {(['ver', 'crear', 'editar', 'eliminar'] as const).map((campo) => (
                            <td key={campo} className="text-center px-2 py-1.5">
                              <input type="checkbox" checked={form.permisos[m.id]?.[campo] ?? false} onChange={() => toggle(m.id, campo)} className="w-4 h-4 accent-primary cursor-pointer" />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <DialogFooter className="flex-shrink-0 pt-2 border-t border-border"><Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button><Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{editing ? 'Guardar' : 'Crear rol'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
