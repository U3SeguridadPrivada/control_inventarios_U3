import * as React from "react"
import { cn } from "@/src/lib/utils"

const TONES = {
  primary: "stroke-primary",
  success: "stroke-emerald-500",
  warning: "stroke-amber-500",
  danger: "stroke-red-500",
  ink: "stroke-ink",
  light: "stroke-white",
} as const

/**
 * Anillo de avance. Se usa para mostrar completitud (expediente, datos
 * capturados) con el valor en el centro o un icono.
 */
export function ProgressRing({
  value, size = 40, stroke = 4, tone = "primary", trackClassName = "stroke-slate-200", className, children,
}: {
  value: number
  size?: number
  stroke?: number
  tone?: keyof typeof TONES
  trackClassName?: string
  className?: string
  children?: React.ReactNode
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${Math.round(pct)} por ciento`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={trackClassName} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          className={cn("transition-[stroke-dashoffset] duration-500", TONES[tone])}
        />
      </svg>
      {children && <span className="absolute inset-0 flex items-center justify-center">{children}</span>}
    </span>
  )
}
