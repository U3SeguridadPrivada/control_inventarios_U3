import * as React from "react"
import { cn } from "../../lib/utils"
// Simplified Dialog implementation to avoid external dependencies for speed.
// Using standard HTML dialog or a fixed overlay.

export function Dialog({ open, onOpenChange, children }: { open: boolean, onOpenChange: (open: boolean) => void, children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-sm print:static print:block print:p-0 print:bg-transparent print:backdrop-blur-none">
      <div
        className="fixed inset-0 z-[-1] print:hidden"
        onClick={() => onOpenChange(false)}
      />
      <div id="dialog-print-wrapper" className="z-50 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl overflow-hidden print:max-w-none print:w-full print:rounded-none print:border-none print:shadow-none print:p-0 print:overflow-visible print:bg-white">
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
  return <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}>{children}</div>
}
