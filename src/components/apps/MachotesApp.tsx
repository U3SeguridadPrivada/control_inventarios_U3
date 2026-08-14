'use client';
import { useState } from 'react';
import { Card } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { FileStack, ClipboardList, Printer, type LucideIcon } from 'lucide-react';
import MachoteControlAcceso from '@/src/components/machotes/MachoteControlAcceso';

interface Machote {
  id: string;
  nombre: string;
  descripcion: string;
  icono: LucideIcon;
  formato: string;
  render: (onVolver: () => void) => React.ReactNode;
}

/**
 * Catalogo de formatos en blanco listos para imprimir. Para agregar uno nuevo
 * basta con crear su componente en src/components/machotes y sumarlo aqui.
 */
const MACHOTES: Machote[] = [
  {
    id: 'control-acceso',
    nombre: 'Control de registro de proveedores',
    descripcion:
      'Bitácora del apostamiento: fecha, nombre, compañía, carga, descarga, horas de entrada y salida, y firma. Anexo y nombre editables, con el logo de la empresa en resguardo.',
    icono: ClipboardList,
    formato: 'Carta horizontal · doble cara',
    render: (onVolver) => <MachoteControlAcceso onVolver={onVolver} />,
  },
];

export default function MachotesApp() {
  const [abierto, setAbierto] = useState<string | null>(null);

  const machote = MACHOTES.find((m) => m.id === abierto);
  if (machote) return <>{machote.render(() => setAbierto(null))}</>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
          <FileStack className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Machotes</h1>
          <p className="text-xs text-muted-foreground">
            Formatos oficiales en blanco para imprimir y llenar a mano en el servicio.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {MACHOTES.map((m) => {
          const Icono = m.icono;
          return (
            <Card
              key={m.id}
              role="button"
              tabIndex={0}
              onClick={() => setAbierto(m.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAbierto(m.id); } }}
              className="p-5 cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                  <Icono className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold leading-snug">{m.nombre}</h2>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{m.descripcion}</p>
                  <div className="flex items-center gap-2 mt-3">
                    <Badge variant="secondary" className="text-[10.5px]">{m.formato}</Badge>
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Printer className="w-3.5 h-3.5" /> Imprimible
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
