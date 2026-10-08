import * as React from "react"
import { ArrowUpRight, type LucideIcon } from "lucide-react"
import { cn } from "@/src/lib/utils"

const TONES = {
  primary: "bg-primary/10 text-primary",
  neutral: "bg-muted text-slate-600",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-600",
} as const

/**
 * Tarjeta de indicador: etiqueta, cifra grande y una linea de contexto. Todas las
 * tarjetas comparten forma y color neutro; el tono solo se usa cuando el dato lo
 * pide (por ejemplo, un pendiente que requiere atencion).
 */
export function KpiCard({
  label, value, hint, icon: Icon, tone = "primary", badge, onClick, className,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: LucideIcon
  tone?: keyof typeof TONES
  badge?: React.ReactNode
  onClick?: () => void
  className?: string
}) {
  const contenido = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", TONES[tone])}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="text-[30px] font-bold leading-none tracking-tight text-foreground tabular-nums">{value}</p>
        {badge}
      </div>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
      {onClick && (
        <ArrowUpRight aria-hidden className="absolute bottom-4 right-4 h-4 w-4 text-muted-foreground/0 transition-colors group-hover:text-primary" />
      )}
    </>
  )
  const base = "group relative block w-full rounded-xl border border-border bg-card p-5 text-left shadow-xs"
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={cn(base, "transition-[border-color,box-shadow] duration-150 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15", className)}
    >
      {contenido}
    </button>
  ) : (
    <div className={cn(base, className)}>{contenido}</div>
  )
}
