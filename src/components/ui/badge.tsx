import * as React from "react"
import { cn } from "@/src/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info';
  /** Punto de color a la izquierda: refuerza el estado sin depender solo del tono. */
  dot?: boolean;
}

/**
 * Etiquetas suaves: fondo tenue, texto del mismo tono y un aro fino. Evitan los
 * rellenos saturados que compiten con los datos de las tablas y las fichas.
 */
function Badge({ className, variant = "default", dot, children, ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-5 ring-1 ring-inset whitespace-nowrap transition-colors",
        {
          "bg-primary/[0.07] text-primary ring-primary/15": variant === "default",
          "bg-slate-100 text-slate-600 ring-slate-500/10": variant === "secondary",
          "bg-red-50 text-red-700 ring-red-600/15": variant === "destructive",
          "bg-emerald-50 text-emerald-700 ring-emerald-600/15": variant === "success",
          "bg-amber-50 text-amber-800 ring-amber-600/20": variant === "warning",
          "bg-sky-50 text-sky-700 ring-sky-600/15": variant === "info",
          "bg-transparent text-muted-foreground ring-border": variant === "outline",
        },
        className
      )}
      {...props}
    >
      {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </div>
  )
}

export { Badge }
