import * as React from "react"
import { cn } from "@/src/lib/utils"

/** Cuadricula de datos de solo lectura: etiqueta pequena arriba, valor firme abajo. */
export function InfoGrid({ cols = 2, className, children }: { cols?: 1 | 2 | 3 | 4; className?: string; children: React.ReactNode }) {
  const map = {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-2 sm:grid-cols-3",
    4: "grid-cols-2 sm:grid-cols-4",
  } as const
  return <dl className={cn("grid gap-x-6 gap-y-4", map[cols], className)}>{children}</dl>
}

export function InfoItem({
  label, children, mono, className, span,
}: { label: React.ReactNode; children?: React.ReactNode; mono?: boolean; className?: string; span?: boolean }) {
  const vacio = children === undefined || children === null || children === "" || children === false
  return (
    <div className={cn("min-w-0", span && "col-span-2", className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 break-words text-sm font-semibold text-foreground", mono && !vacio && "font-mono text-[13px] tracking-tight", vacio && "font-medium text-muted-foreground/70")}>
        {vacio ? "Sin dato" : children}
      </dd>
    </div>
  )
}
