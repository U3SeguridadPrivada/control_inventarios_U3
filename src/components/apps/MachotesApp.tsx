'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { FileStack, ClipboardList, Printer, PackageCheck, IdCard, FileCheck, Sparkles, type LucideIcon } from 'lucide-react';
import MachoteControlAcceso from '@/src/components/machotes/MachoteControlAcceso';
import MachotePaqueteria from '@/src/components/machotes/MachotePaqueteria';
import MachoteFichaTecnica from '@/src/components/machotes/MachoteFichaTecnica';
import ModalGenerarContrato from '@/src/components/contratos/ModalGenerarContrato';

interface Machote {
  id: string;
  nombre: string;
  descripcion: string;
  icono: LucideIcon;
  formato: string;
  esContrato?: boolean;
  render?: (onVolver: () => void) => React.ReactNode;
}

/**
 * Catalogo de formatos en blanco listos para imprimir. Para agregar uno nuevo
 * basta con crear su componente en src/components/machotes y sumarlo aqui.
 */
const MACHOTES: Machote[] = [
  {
    id: 'contrato-laboral',
    nombre: 'Contrato Individual de Trabajo (Periodo de Prueba)',
    descripcion:
      'Contrato laboral oficial por tiempo indeterminado con periodo de capacitación inicial conforme a la Ley Federal del Trabajo (Art. 39-A). Auto-llenado para guardias, editable en hojas tamaño Carta con firmas y cláusulas.',
    icono: FileCheck,
    formato: 'Carta vertical · Hojas editables e imprimibles',
    esContrato: true,
  },
  {
    id: 'ficha-tecnica-guardia',
    nombre: 'Ficha técnica de guardia',
    descripcion:
      'Formato institucional oficial del elemento operativo: fotografía, datos personales, CURP/RFC/IMSS, domicilio, antecedentes laborales, sello y logotipos de U3 Seguridad Privada. Permite cargar guardias existentes o llenar a mano.',
    icono: IdCard,
    formato: 'Carta vertical (21.6 x 27.9 cm) · 1 cara',
    render: (onVolver) => <MachoteFichaTecnica onVolver={onVolver} />,
  },
  {
    id: 'paqueteria-mensajeria',
    nombre: 'Recepción / Entrega de paquetería y mensajería',
    descripcion:
      'Bitácora oficial de paquetería para torre/servicio. Folios correlativos configurables, columnas de recepción y entrega, horas con separador, logos oficiales U3 e impresión en tamaño oficio a doble cara.',
    icono: PackageCheck,
    formato: 'Oficio horizontal (21.6 x 34.0 cm) · doble cara',
    render: (onVolver) => <MachotePaqueteria onVolver={onVolver} />,
  },
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
  const router = useRouter();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [modalContrato, setModalContrato] = useState(false);

  const machote = MACHOTES.find((m) => m.id === abierto);
  if (machote && machote.render) return <>{machote.render(() => setAbierto(null))}</>;

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
              onClick={() => {
                if (m.esContrato) {
                  setModalContrato(true);
                } else {
                  setAbierto(m.id);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (m.esContrato) setModalContrato(true);
                  else setAbierto(m.id);
                }
              }}
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
                      <Printer className="w-3.5 h-3.5" /> Imprimible y editable
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Modal de Generación Automática de Contrato */}
      <ModalGenerarContrato
        open={modalContrato}
        onOpenChange={setModalContrato}
      />
    </div>
  );
}
