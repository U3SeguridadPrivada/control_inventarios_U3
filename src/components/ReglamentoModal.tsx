'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/src/components/ui/dialog';
import { Button } from '@/src/components/ui/button';
import { ShieldCheck, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import DocumentoReglamentoApp, { type AmbitoReglamento } from './apps/DocumentoReglamentoApp';

interface ReglamentoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Reglamento que se abre primero; dentro del visor se puede cambiar al otro. */
  ambito?: AmbitoReglamento;
}

export default function ReglamentoModal({ open, onOpenChange, ambito = 'oficinas' }: ReglamentoModalProps) {
  const href = ambito === 'guardias' ? '/reglamento/guardias' : '/reglamento';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-background">
        <DialogHeader className="px-4 py-3 border-b border-border bg-card flex flex-row items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-sm sm:text-base font-bold">
                Reglamentos Interiores · U3 Seguridad Privada
              </DialogTitle>
              <p className="text-[11px] text-muted-foreground">
                Dos documentos: personal de oficina del Corporativo Insurgentes y personal operativo de seguridad
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href={href} target="_blank">
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                <ExternalLink className="w-3.5 h-3.5" /> Abrir en pantalla completa
              </Button>
            </Link>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 bg-muted/20">
          <DocumentoReglamentoApp ambitoInicial={ambito} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
