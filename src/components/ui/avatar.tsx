import * as React from "react"
import { cn } from "@/src/lib/utils"

const SIZES = {
  xs: "h-7 w-7 text-[10px]",
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-20 w-20 text-xl",
  "2xl": "h-28 w-28 text-3xl",
} as const

export function iniciales(nombre?: string | null): string {
  if (!nombre) return "?"
  return nombre
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase()
}

const STATUS_TONE = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  neutral: "bg-slate-400",
} as const

/** Foto o monograma. El monograma usa un tinte de marca plano: nada de degradados. */
export function Avatar({
  name, src, size = "md", shape = "circle", status, className,
}: {
  name?: string | null
  src?: string | null
  size?: keyof typeof SIZES
  shape?: "circle" | "rounded"
  status?: keyof typeof STATUS_TONE
  className?: string
}) {
  const radius = shape === "circle" ? "rounded-full" : size === "2xl" || size === "xl" ? "rounded-2xl" : "rounded-xl"
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name ?? "Foto"} className={cn("object-cover ring-1 ring-black/5", SIZES[size], radius)} />
      ) : (
        <span
          aria-label={name ?? undefined}
          className={cn("inline-flex select-none items-center justify-center bg-primary/10 font-bold tracking-wide text-primary", SIZES[size], radius)}
        >
          {iniciales(name)}
        </span>
      )}
      {status && (
        <span
          aria-hidden
          className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card", STATUS_TONE[status])}
        />
      )}
    </span>
  )
}
