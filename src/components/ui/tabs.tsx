'use client'
import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/src/lib/utils"

export interface TabItem<T extends string> {
  value: T
  label: React.ReactNode
  icon?: LucideIcon
  /** Contador opcional a la derecha de la etiqueta. */
  count?: number
}

/**
 * Pestanas segmentadas: una pastilla blanca sobre una base gris suave. Sirven lo
 * mismo para cambiar de seccion que para filtrar listas por estado.
 */
export function SegmentedTabs<T extends string>({
  value, onChange, items, ariaLabel, fullWidth, className,
}: {
  value: T
  onChange: (value: T) => void
  items: TabItem<T>[]
  ariaLabel?: string
  fullWidth?: boolean
  className?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "no-scrollbar inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border/70 bg-muted p-1",
        fullWidth && "flex w-full",
        className
      )}
    >
      {items.map((item) => {
        const active = item.value === value
        const Icon = item.icon
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
              fullWidth && "flex-1",
              active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
            <span>{item.label}</span>
            {typeof item.count === "number" && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] font-bold leading-4",
                  active ? "bg-primary/10 text-primary" : "bg-slate-200/70 text-slate-500"
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
