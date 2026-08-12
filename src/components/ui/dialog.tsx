'use client'
import * as React from "react"
import { cn } from "@/src/lib/utils"

/**
 * En movil se presenta como hoja anclada abajo (pulgar al alcance) y en
 * escritorio como modal centrado. Bloquea el scroll de fondo mientras esta
 * abierto para que el gesto no arrastre la pagina.
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

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/45 backdrop-blur-sm print:static print:block print:p-0 print:bg-transparent print:backdrop-blur-none">
      <div
        className="fixed inset-0 z-[-1] print:hidden"
        onClick={() => onOpenChange(false)}
      />
      <div
        id="dialog-print-wrapper"
        role="dialog"
        aria-modal="true"
        className={cn(
          "dialog-panel z-50 w-full max-w-lg max-h-[92svh] border border-border bg-card shadow-2xl",
          "rounded-t-2xl sm:rounded-2xl",
          "print:max-w-none print:max-h-none print:w-full print:rounded-none print:border-none print:shadow-none print:bg-white",
          className
        )}
      >
        {children}
      </div>
    </div>
  )
}

export function DialogContent({ children, className }: { children: React.ReactNode, className?: string }) {
  return <div className={cn("grid gap-4", className)}>{children}</div>
}

export function DialogHeader({ children, className }: { children: React.ReactNode, className?: string }) {
  return <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}>{children}</div>
}

export function DialogTitle({ children, className }: { children: React.ReactNode, className?: string }) {
  return <h2 className={cn("text-lg font-semibold leading-none tracking-tight", className)}>{children}</h2>
}

export function DialogDescription({ children, className }: { children: React.ReactNode, className?: string }) {
  return <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>
}

export function DialogFooter({ children, className }: { children: React.ReactNode, className?: string }) {
  // En movil los botones se apilan a ancho completo; en escritorio van a la derecha.
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2 [&>button]:w-full sm:[&>button]:w-auto",
        className
      )}
    >
      {children}
    </div>
  )
}
