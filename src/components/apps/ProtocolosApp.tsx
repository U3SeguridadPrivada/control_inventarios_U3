'use client';
import { useState, useMemo } from 'react';
import { apiFetch } from '@/src/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import { Select } from '@/src/components/ui/select';
import { Badge } from '@/src/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/src/components/ui/dialog';
import Link from 'next/link';
import {
  Search, Plus, Edit, Trash2, ChevronDown, ChevronRight, ClipboardList,
  GripVertical, X, ArrowUp, ArrowDown, EyeOff, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/src/context/AuthContext';
import { cn } from '@/src/lib/utils';

interface Protocolo {
  id: number;
  titulo: string;
  categoria: string;
  descripcion: string | null;
  /** `lista`: procedimiento con pasos. `documento`: manual con capitulado, se abre en su propia página. */
  tipo: 'lista' | 'documento';
  pasos: string[];
  contenido: { secciones?: unknown[] } | null;
  prioridad: string;
  activo: number;
  actualizado_en: string | null;
}

const CATEGORIAS = ['Emergencia', 'Operativo', 'Seguridad', 'Recursos Humanos', 'Administrativo'];
const PRIORIDADES = ['Alta', 'Media', 'Baja'];

const FORM_INICIAL = {
  titulo: '',
  categoria: 'Operativo',
  descripcion: '',
  prioridad: 'Media',
  activo: true,
  pasos: [''] as string[],
};

function badgePrioridad(prioridad: string) {
  if (prioridad === 'Alta') return 'destructive' as const;
  if (prioridad === 'Baja') return 'secondary' as const;
  return 'default' as const;
}

export default function ProtocolosApp() {
  const { isEditor, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('Todas');
  const [expandido, setExpandido] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Protocolo | null>(null);
  const [form, setForm] = useState(FORM_INICIAL);

  const { data: protocolos = [], isLoading } = useQuery({
    queryKey: ['protocolos'],
    queryFn: () => apiFetch<Protocolo[]>('/api/protocolos'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['protocolos'] });

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiFetch('/api/protocolos', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { invalidate(); toast.success('Protocolo creado'); setModalOpen(false); setForm(FORM_INICIAL); },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: any) => apiFetch(`/api/protocolos/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => { invalidate(); toast.success('Protocolo actualizado'); setModalOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/protocolos/${id}`, { method: 'DELETE' }),
    onSuccess: () => { invalidate(); toast.success('Protocolo eliminado'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setEditing(null); setForm(FORM_INICIAL); setModalOpen(true); };
  const openEdit = (p: Protocolo) => {
    setEditing(p);
    setForm({
      titulo: p.titulo,
      categoria: p.categoria,
      descripcion: p.descripcion ?? '',
      prioridad: p.prioridad,
      activo: p.activo === 1,
      pasos: p.pasos?.length ? [...p.pasos] : [''],
    });
    setModalOpen(true);
  };

  // Edición de la lista de pasos: el orden es parte del contenido del protocolo,
  // por eso se puede mover cada paso arriba/abajo en vez de solo agregar y quitar.
  const setPaso = (index: number, valor: string) =>
    setForm((f) => ({ ...f, pasos: f.pasos.map((p, i) => (i === index ? valor : p)) }));
  const agregarPaso = () => setForm((f) => ({ ...f, pasos: [...f.pasos, ''] }));
  const quitarPaso = (index: number) =>
    setForm((f) => ({ ...f, pasos: f.pasos.length === 1 ? [''] : f.pasos.filter((_, i) => i !== index) }));
  const moverPaso = (index: number, delta: number) =>
    setForm((f) => {
      const destino = index + delta;
      if (destino < 0 || destino >= f.pasos.length) return f;
      const pasos = [...f.pasos];
      [pasos[index], pasos[destino]] = [pasos[destino], pasos[index]];
      return { ...f, pasos };
    });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pasos = form.pasos.map((p) => p.trim()).filter(Boolean);
    if (pasos.length === 0) { toast.error('Agregue al menos un paso'); return; }
    const payload = { ...form, pasos };
    if (editing) updateMutation.mutate({ id: editing.id, ...payload });
    else createMutation.mutate(payload);
  };

  const filtered = useMemo(() => protocolos.filter((p) => {
    const term = searchTerm.toLowerCase();
    const matchesTerm = !term
      || p.titulo.toLowerCase().includes(term)
      || (p.descripcion ?? '').toLowerCase().includes(term)
      || (p.pasos ?? []).some((paso) => paso.toLowerCase().includes(term));
    const matchesCategoria = filterCategoria === 'Todas' || p.categoria === filterCategoria;
    // Los protocolos dados de baja solo los ve quien puede reactivarlos.
    const visible = p.activo === 1 || isEditor;
    return matchesTerm && matchesCategoria && visible;
  }), [protocolos, searchTerm, filterCategoria, isEditor]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Protocolos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Procedimientos oficiales de operación y respuesta</p>
        </div>
        {isEditor && <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Nuevo protocolo</Button>}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex items-center gap-2 max-w-sm relative flex-1">
          <Search className="w-4 h-4 absolute left-3 text-muted-foreground" />
          <Input placeholder="Buscar por título, descripción o paso..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <Select value={filterCategoria} onChange={(e) => setFilterCategoria(e.target.value)} className="sm:w-56">
          <option value="Todas">Todas las categorías</option>
          {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <ClipboardList className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium">
            {protocolos.length === 0 ? 'Todavía no hay protocolos registrados' : 'Ningún protocolo coincide con la búsqueda'}
          </p>
          {protocolos.length === 0 && isEditor && (
            <p className="text-xs text-muted-foreground mt-1">Cree el primero para que el personal lo consulte desde cualquier dispositivo.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const abierto = expandido === p.id;

            // Los documentos no se despliegan en la lista: se abren completos en su página.
            if (p.tipo === 'documento') {
              return (
                <Link
                  key={p.id}
                  href={`/protocolos/${p.id}`}
                  className={cn(
                    'flex items-start gap-3 p-4 rounded-xl border border-border bg-card shadow-sm hover:bg-muted/50 transition-colors',
                    p.activo === 0 && 'opacity-60'
                  )}
                >
                  <FileText className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{p.titulo}</span>
                      <Badge variant="outline">{p.categoria}</Badge>
                      <Badge variant={badgePrioridad(p.prioridad)}>{p.prioridad}</Badge>
                      <Badge variant="secondary">Documento</Badge>
                      {p.activo === 0 && <Badge variant="secondary"><EyeOff className="w-3 h-3 mr-1" /> Inactivo</Badge>}
                    </div>
                    {p.descripcion && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.descripcion}</p>}
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {p.contenido?.secciones?.length ?? 0} secciones · abrir, editar e imprimir
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                </Link>
              );
            }

            return (
              <div key={p.id} className={cn('rounded-xl border border-border bg-card shadow-sm overflow-hidden', p.activo === 0 && 'opacity-60')}>
                <button
                  onClick={() => setExpandido((cur) => (cur === p.id ? null : p.id))}
                  aria-expanded={abierto}
                  className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/50 transition-colors"
                >
                  <ClipboardList className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{p.titulo}</span>
                      <Badge variant="outline">{p.categoria}</Badge>
                      <Badge variant={badgePrioridad(p.prioridad)}>{p.prioridad}</Badge>
                      {p.activo === 0 && <Badge variant="secondary"><EyeOff className="w-3 h-3 mr-1" /> Inactivo</Badge>}
                    </div>
                    {p.descripcion && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.descripcion}</p>}
                    <p className="text-[11px] text-muted-foreground mt-1">{p.pasos?.length ?? 0} paso(s)</p>
                  </div>
                  <ChevronDown className={cn('w-4 h-4 text-muted-foreground flex-shrink-0 mt-1 transition-transform', abierto && 'rotate-180')} />
                </button>

                {abierto && (
                  <div className="px-4 pb-4 pt-0 border-t border-border/70">
                    <ol className="mt-3 space-y-2">
                      {(p.pasos ?? []).map((paso, i) => (
                        <li key={i} className="flex gap-3 text-sm">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">{i + 1}</span>
                          <span className="pt-0.5 text-foreground">{paso}</span>
                        </li>
                      ))}
                    </ol>
                    {(isEditor || isAdmin) && (
                      <div className="flex justify-end gap-1.5 mt-4">
                        {isEditor && <Button variant="outline" size="sm" onClick={() => openEdit(p)}><Edit className="w-3.5 h-3.5 mr-1.5" /> Editar</Button>}
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => { if (confirm(`¿Eliminar el protocolo "${p.titulo}"?`)) deleteMutation.mutate(p.id); }}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Eliminar
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar protocolo' : 'Nuevo protocolo'}</DialogTitle>
              <DialogDescription>Procedimiento paso a paso que el personal debe seguir.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Título</label>
                <Input value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} placeholder="Ej. Respuesta ante intento de robo" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Categoría</label>
                  <Select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}>
                    {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Prioridad</label>
                  <Select value={form.prioridad} onChange={(e) => setForm((f) => ({ ...f, prioridad: e.target.value }))}>
                    {PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Descripción / cuándo aplica</label>
                <Textarea value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} rows={2} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Pasos</label>
                <div className="space-y-2">
                  {form.pasos.map((paso, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-6 h-9 flex items-center justify-center text-xs font-semibold text-muted-foreground">
                        <GripVertical className="w-3.5 h-3.5" />
                      </span>
                      <Textarea
                        value={paso}
                        onChange={(e) => setPaso(i, e.target.value)}
                        rows={2}
                        placeholder={`Paso ${i + 1}`}
                        className="flex-1"
                      />
                      <div className="flex flex-col gap-0.5">
                        <button type="button" onClick={() => moverPaso(i, -1)} disabled={i === 0} title="Subir" className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30">
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => moverPaso(i, 1)} disabled={i === form.pasos.length - 1} title="Bajar" className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30">
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => quitarPaso(i)} title="Quitar" className="w-6 h-6 rounded flex items-center justify-center text-destructive hover:bg-destructive/10">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={agregarPaso}><Plus className="w-3.5 h-3.5 mr-1.5" /> Agregar paso</Button>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.activo} onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))} className="rounded border-border" />
                Protocolo vigente (visible para todo el personal)
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{editing ? 'Guardar' : 'Crear'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
