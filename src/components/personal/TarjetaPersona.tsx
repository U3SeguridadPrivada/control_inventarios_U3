'use client';
import * as React from 'react';
import { AlertCircle, Calendar, CheckCircle2, Download, Edit, IdCard, Mail, MapPin, Phone, User } from 'lucide-react';
import { cn, fmtDate } from '@/src/lib/utils';
import { Avatar } from '@/src/components/ui/avatar';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';

/** Foto y estado de la ficha tecnica a partir del JSON guardado en el registro. */
export function datosFicha(item: { ficha_tecnica_json?: string | null }): { hasFicha: boolean; fotoUrl: string | null } {
  if (!item.ficha_tecnica_json) return { hasFicha: false, fotoUrl: null };
  try {
    const parsed = JSON.parse(item.ficha_tecnica_json);
    return { hasFicha: true, fotoUrl: parsed.fotoUrl || null };
  } catch {
    return { hasFicha: false, fotoUrl: null };
  }
}

export const variantEstado = (estado: string): 'success' | 'warning' | 'secondary' =>
  estado === 'Activo' ? 'success' : estado === 'Baja Pendiente' ? 'warning' : 'secondary';

export const puntoEstado = (estado: string): 'success' | 'warning' | 'neutral' =>
  estado === 'Activo' ? 'success' : estado === 'Baja Pendiente' ? 'warning' : 'neutral';

/** Linea de dato con icono: telefono, domicilio, fecha de alta. */
export function LineaDato({ icon: Icon, children, vacio }: { icon: React.ElementType; children: React.ReactNode; vacio?: boolean }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', vacio && 'text-muted-foreground/70')}>
      <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}

export interface TarjetaPersonaProps {
  nombre: string;
  /** Numero de elemento o de empleado. */
  codigo?: string | null;
  codigoEtiqueta: string;
  /** Linea secundaria bajo el codigo (puesto y departamento en oficinas). */
  subtitulo?: React.ReactNode;
  estado: string;
  telefono?: string | null;
  direccion?: string | null;
  email?: string | null;
  fechaAlta?: string | null;
  fichaTecnicaJson?: string | null;
  isEditor: boolean;
  onPerfil: () => void;
  onFicha: () => void;
  onEditarFicha: () => void;
  onDescargar: () => void;
  onEditar: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

/** Tarjeta de directorio de personal: identidad, contacto, estado de la ficha y acciones. */
export function TarjetaPersona(p: TarjetaPersonaProps) {
  const { hasFicha, fotoUrl } = datosFicha({ ficha_tecnica_json: p.fichaTecnicaJson });
  return (
    <article
      onContextMenu={p.onContextMenu}
      className="group flex flex-col rounded-xl border border-border bg-card shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-primary/30 hover:shadow-md"
    >
      <div className="flex items-start gap-3.5 p-4 pb-3">
        <Avatar name={p.nombre} src={fotoUrl} size="lg" shape="rounded" status={puntoEstado(p.estado)} />
        <div className="min-w-0 flex-1">
          <h2 className="min-w-0">
            <button
              type="button"
              onClick={p.onPerfil}
              title={p.nombre}
              className="block max-w-full truncate text-left text-[15px] font-bold leading-snug tracking-tight text-foreground transition-colors hover:text-primary"
            >
              {p.nombre}
            </button>
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {p.codigo ? (
              <>{p.codigoEtiqueta} <span className="font-semibold text-foreground/80">{p.codigo}</span></>
            ) : (
              `Sin número de ${p.codigoEtiqueta.toLowerCase()}`
            )}
          </p>
          {p.subtitulo && <p className="mt-0.5 truncate text-xs font-medium text-foreground/80">{p.subtitulo}</p>}
          <Badge variant={variantEstado(p.estado)} dot className="mt-2">{p.estado}</Badge>
        </div>
      </div>

      <div className="mx-4 space-y-2 border-t border-border/70 py-3 text-xs text-foreground/80">
        <LineaDato icon={Phone} vacio={!p.telefono}>
          {p.telefono ? (
            <a href={`tel:${p.telefono}`} className="transition-colors hover:text-primary" title="Llamar">{p.telefono}</a>
          ) : 'Sin teléfono registrado'}
        </LineaDato>
        {p.email !== undefined && (
          <LineaDato icon={Mail} vacio={!p.email}>
            {p.email ? <span title={p.email}>{p.email}</span> : 'Sin correo registrado'}
          </LineaDato>
        )}
        <LineaDato icon={MapPin} vacio={!p.direccion}>
          {p.direccion ? <span title={p.direccion}>{p.direccion}</span> : 'Sin domicilio registrado'}
        </LineaDato>
        <LineaDato icon={Calendar}>Alta: {fmtDate(p.fechaAlta)}</LineaDato>
        <button
          type="button"
          onClick={hasFicha ? p.onFicha : p.onEditarFicha}
          className={cn(
            'flex w-full min-w-0 items-center gap-2.5 text-left font-medium transition-colors',
            hasFicha ? 'text-emerald-700 hover:text-emerald-800' : 'text-amber-700 hover:text-amber-800'
          )}
        >
          {hasFicha ? <CheckCircle2 aria-hidden className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle aria-hidden className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">{hasFicha ? 'Ficha técnica lista' : 'Ficha técnica pendiente'}</span>
        </button>
      </div>

      <div className="mt-auto flex items-center gap-1.5 border-t border-border/70 p-3">
        <Button size="sm" className="h-9 flex-1" onClick={p.onPerfil}>
          <User className="h-3.5 w-3.5" /> Ver perfil
        </Button>
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={p.onFicha} title="Ver ficha técnica en PDF" aria-label="Ver ficha técnica en PDF">
          <IdCard className="h-4 w-4 text-primary" />
        </Button>
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={p.onDescargar} title="Descargar ficha técnica" aria-label="Descargar ficha técnica">
          <Download className="h-4 w-4" />
        </Button>
        {p.isEditor && (
          <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" onClick={p.onEditar} title="Editar datos" aria-label="Editar datos">
            <Edit className="h-4 w-4" />
          </Button>
        )}
      </div>
    </article>
  );
}
