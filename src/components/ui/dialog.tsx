'use client'
import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/src/lib/utils"

const DialogContext = React.createContext<{ close: () => void } | null>(null)

/** Indica que el contenido recorta su desborde (overflow-hidden): ahi el encabezado no puede sangrar. */
const ContenidoContext = React.createContext<{ recortado: boolean }>({ recortado: false })

/**
 * En movil se presenta como hoja anclada abajo (pulgar al alcance) y en
 * escritorio como modal centrado. Bloquea el scroll de fondo mientras esta
 * abierto para que el gesto no arrastre la pagina.
 *
 * DialogHeader y DialogFooter sangran hasta el borde del panel (margenes negativos
 * contra el relleno del panel), asi que cualquier dialogo que ya los use hereda el
 * marco nuevo sin cambiar su estructura. No son sticky: un elemento sticky no puede
 * salirse de su bloque contenedor y el margen negativo lo empujaba hacia dentro.
 * Para formularios largos con pie fijo se usa FormDialog.
 */
export function Dialog({ open, onOpenChange, children, className }: { open: boolean, onOpenChange: (open: boolean) => void, children: React.ReactNode, className?: string }) {
  React.useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  const contexto = React.useMemo(() => ({ close: () => onOpenChange(false) }), [onOpenChange]);

  if (!open) return null;
  return (
    <div className="u3-overlay fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/45 print:static print:block print:p-0 print:bg-transparent">
      <div
        className="fixed inset-0 z-[-1] print:hidden"
        onClick={() => onOpenChange(false)}
      />
      <DialogContext.Provider value={contexto}>
        <div
          id="dialog-print-wrapper"
          role="dialog"
          aria-modal="true"
          className={cn(
            "u3-panel dialog-panel relative z-50 w-full max-w-lg max-h-[92svh] border border-border bg-card shadow-2xl",
            "rounded-t-2xl sm:rounded-2xl",
            "print:max-w-none print:max-h-none print:w-full print:rounded-none print:border-none print:shadow-none print:bg-white",
            className
          )}
        >
          {children}
        </div>
      </DialogContext.Provider>
    </div>
  )
}

/** Boton de cierre reutilizable (esquina del encabezado). */
export function DialogClose({ className }: { className?: string }) {
  const ctx = React.useContext(DialogContext);
  if (!ctx) return null;
  return (
    <button
      type="button"
      onClick={ctx.close}
      aria-label="Cerrar"
      className={cn(
        "absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 print:hidden",
        className
      )}
    >
      <X className="h-4 w-4" />
    </button>
  );
}

/**
 * El panel del diálogo ya se desplaza por sí mismo. Un segundo contenedor con scroll propio
 * (`max-h-… overflow-y-auto`, muy repetido en los formularios) rompía el marco: el encabezado y el
 * pie, que sangran hasta el borde del panel, se salían de él y aparecía un scroll horizontal dentro
 * del formulario. Aquí se descartan esas dos clases cuando vienen juntas.
 */
function sinScrollPropio(className?: string) {
  if (!className || !/(^|\s)overflow-(y-)?auto(\s|$)/.test(className)) return className
  return className
    .split(/\s+/)
    .filter((c) => c && !/^overflow-(y-)?auto$/.test(c) && !/^max-h-/.test(c))
    .join(" ")
}

export function DialogContent({ children, className }: { children: React.ReactNode, className?: string }) {
  const limpio = sinScrollPropio(className)
  // Con overflow-hidden el sangrado negativo se recortaria (el titulo quedaria cortado), asi que
  // en esos contenedores el encabezado y el pie se quedan dentro y conservan su propio relleno.
  const recortado = !!limpio && limpio.split(' ').some((c) => c === 'overflow-hidden' || c === 'overflow-clip')
  return (
    <ContenidoContext.Provider value={{ recortado }}>
      {/* Columna única minmax(0,1fr): con la implícita `auto` crece hasta el ancho mínimo del contenido más ancho
          (una fila de pestañas, un select con opciones largas) y todo el formulario se sale del diálogo. */}
      <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-4", recortado && "[--dialog-pad:0px] [--dialog-pad-b:0px]", limpio)}>{children}</div>
    </ContenidoContext.Provider>
  )
}

export function DialogHeader({ children, className }: { children: React.ReactNode, className?: string }) {
  const { recortado } = React.useContext(ContenidoContext)
  return (
    <div
      className={cn(
        "-mx-[var(--dialog-pad)] -mt-[var(--dialog-pad)] flex flex-col space-y-1 border-b border-border bg-card px-4 py-4 pr-14 text-left sm:px-6 sm:pr-14 print:m-0 print:border-0 print:p-0",
        className
      )}
    >
      {children}
      {!recortado && <DialogClose />}
    </div>
  )
}

export function DialogTitle({ children, className }: { children: React.ReactNode, className?: string }) {
  return <h2 className={cn("text-[17px] font-bold leading-snug tracking-tight text-foreground", className)}>{children}</h2>
}

export function DialogDescription({ children, className }: { children: React.ReactNode, className?: string }) {
  return <p className={cn("text-[13px] leading-relaxed text-muted-foreground", className)}>{children}</p>
}

export function DialogFooter({ children, className }: { children: React.ReactNode, className?: string }) {
  // En movil los botones se apilan a ancho completo; en escritorio van a la derecha.
  return (
    <div
      className={cn(
        "-mx-[var(--dialog-pad)] -mb-[var(--dialog-pad-b)] mt-4 flex flex-col-reverse gap-2 border-t border-border bg-muted px-4 sm:px-6 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] sm:flex-row sm:justify-end sm:gap-2 sm:pb-3 [&>button]:w-full sm:[&>button]:w-auto print:hidden",
        className
      )}
    >
      {children}
    </div>
  )
}
