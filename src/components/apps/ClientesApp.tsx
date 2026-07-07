'use client';
import { useState, useMemo } from 'react';
import { apiFetch } from '@/src/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/table';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import { Select } from '@/src/components/ui/select';
import { Badge } from '@/src/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/src/components/ui/dialog';
import { Search, UserPlus, Edit, Trash2, Mail, Phone, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/src/context/AuthContext';

interface Cliente {
  id: number;
  nombre: string;
  tipo: string;
  empresa: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  notas: string | null;
}

const FORM_INICIAL = { nombre: '', tipo: 'Prospecto', empresa: '', email: '', telefono: '', direccion: '', notas: '' };

export default function ClientesApp() {
  const { isEditor, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTipo, setFilterTipo] = useState('Todos');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [form, setForm] = useState(FORM_INICIAL);

  const { data: clientes = [], isLoading } = useQuery({ queryKey: ['clientes'], queryFn: () => apiFetch<Cliente[]>('/api/clientes') });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['clientes'] });

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiFetch('/api/clientes', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { invalidate(); toast.success('Cliente registrado'); setModalOpen(false); setForm(FORM_INICIAL); },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: any) => apiFetch(`/api/clientes/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => { invalidate(); toast.success('Cliente actualizado'); setModalOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/clientes/${id}`, { method: 'DELETE' }),
    onSuccess: () => { invalidate(); toast.success('Cliente eliminado'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setEditing(null); setForm(FORM_INICIAL); setModalOpen(true); };
  const openEdit = (c: Cliente) => {
    setEditing(c);
    setForm({ nombre: c.nombre, tipo: c.tipo, empresa: c.empresa ?? '', email: c.email ?? '', telefono: c.telefono ?? '', direccion: c.direccion ?? '', notas: c.notas ?? '' });
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) updateMutation.mutate({ id: editing.id, ...form });
    else createMutation.mutate(form);
  };

  const filtered = useMemo(() => clientes.filter((c) => {
    const term = searchTerm.toLowerCase();
    const matchesTerm = c.nombre.toLowerCase().includes(term) || (c.empresa ?? '').toLowerCase().includes(term) || (c.email ?? '').toLowerCase().includes(term);
    const matchesTipo = filterTipo === 'Todos' || c.tipo === filterTipo;
    return matchesTerm && matchesTipo;
  }), [clientes, searchTerm, filterTipo]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h1 className="text-2xl font-bold tracking-tight">Clientes y Prospectos</h1><p className="text-sm text-muted-foreground mt-0.5">Base de datos comercial de la empresa</p></div>
        {isEditor && <Button onClick={openCreate}><UserPlus className="w-4 h-4 mr-2" /> Nuevo registro</Button>}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex items-center gap-2 max-w-sm relative flex-1">
          <Search className="w-4 h-4 absolute left-3 text-muted-foreground" />
          <Input placeholder="Buscar por nombre, empresa o correo..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <Select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)} className="sm:w-48">
          <option value="Todos">Todos</option>
          <option value="Cliente">Clientes</option>
          <option value="Prospecto">Prospectos</option>
        </Select>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre / Empresa</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Cargando...</TableCell></TableRow>
              : filtered.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Sin registros.</TableCell></TableRow>
              : filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{c.nombre}</div>
                    {c.empresa && <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Building2 className="w-3.5 h-3.5" /> {c.empresa}</div>}
                  </TableCell>
                  <TableCell>
                    {c.email && <div className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {c.email}</div>}
                    {c.telefono && <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Phone className="w-3.5 h-3.5" /> {c.telefono}</div>}
                  </TableCell>
                  <TableCell><Badge variant={c.tipo === 'Cliente' ? 'success' : 'secondary'}>{c.tipo}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end items-center gap-1.5">
                      {isEditor && <Button variant="ghost" size="sm" className="h-8" onClick={() => openEdit(c)}><Edit className="w-3.5 h-3.5" /></Button>}
                      {isAdmin && <Button variant="ghost" size="sm" className="h-8 text-destructive hover:bg-destructive/10" onClick={() => { if (confirm(`¿Eliminar a ${c.nombre}?`)) deleteMutation.mutate(c.id); }}><Trash2 className="w-3.5 h-3.5" /></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader><DialogTitle>{editing ? 'Editar registro' : 'Nuevo cliente / prospecto'}</DialogTitle><DialogDescription>Información de contacto comercial.</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2"><label className="text-sm font-medium">Nombre</label><Input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} required /></div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Tipo</label>
                <Select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}>
                  <option value="Prospecto">Prospecto</option>
                  <option value="Cliente">Cliente</option>
                </Select>
              </div>
              <div className="space-y-2"><label className="text-sm font-medium">Empresa</label><Input value={form.empresa} onChange={(e) => setForm((f) => ({ ...f, empresa: e.target.value }))} /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Correo</label><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Teléfono</label><Input value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Dirección</label><Input value={form.direccion} onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))} /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Notas</label><Textarea value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} rows={3} /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button><Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{editing ? 'Guardar' : 'Crear'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
