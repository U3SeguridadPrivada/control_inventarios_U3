'use client'
import * as React from "react"
import { AlertCircle, AlertTriangle, CheckCircle2, Info, ShieldAlert, type LucideIcon } from "lucide-react"
import { cn } from "@/src/lib/utils"

/* ---------------------------------------------------------------------------
 * Piezas de formulario del sistema. Sustituyen el patron repetido de
 * <label> + <Input> escrito a mano en cada modal: una sola tipografia para las
 * etiquetas, ayuda y errores con el mismo lugar, y secciones con titulo.
 * ------------------------------------------------------------------------- */

type Cols = 1 | 2 | 3 | 4

const GRID_COLS: Record<Cols, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
}

const SPAN: Record<number, string> = {
  1: "",
  2: "sm:col-span-2",
  3: "sm:col-span-2 lg:col-span-3",
  4: "col-span-2 lg:col-span-4",
}

export function FieldGrid({ cols = 2, className, children }: { cols?: Cols; className?: string; children: React.ReactNode }) {
  return <div className={cn("grid gap-x-4 gap-y-4", GRID_COLS[cols], className)}>{children}</div>
}

export interface FieldProps {
  label?: React.ReactNode
  /** Marca el campo como obligatorio con un asterisco (el atributo required va en el control). */
  required?: boolean
  /** Rotula el campo como opcional; util en altas donde casi todo se puede completar despues. */
  optional?: boolean
  hint?: React.ReactNode
  error?: React.ReactNode
  /** Id del control cuando el campo contiene algo mas que un unico elemento. */
  htmlFor?: string
  /** Para agrupar varios controles (por ejemplo dia/mes/ano): la etiqueta rotula el grupo. */
  group?: boolean
  /** Columnas que ocupa dentro de un FieldGrid. */
  span?: 1 | 2 | 3 | 4
  className?: string
  children: React.ReactNode
}

/**
 * Etiqueta + control + ayuda/error. Si el hijo es un unico elemento (Input,
 * Select, Textarea, InputGroup) recibe el id, aria-invalid y aria-describedby
 * automaticamente, de modo que la etiqueta queda asociada sin escribir ids.
 */
export function Field({ label, required, optional, hint, error, htmlFor, group, span = 1, className, children }: FieldProps) {
  const autoId = React.useId()
  let control: React.ReactNode = children
  let controlId = htmlFor

  if (!group && !htmlFor && React.isValidElement(children)) {
    const el = children as React.ReactElement<any>
    controlId = el.props.id ?? autoId
    control = React.cloneElement(el, {
      id: controlId,
      "aria-invalid": error ? true : el.props["aria-invalid"],
      "aria-describedby": hint || error ? `${controlId}-desc` : el.props["aria-describedby"],
    })
  }

  const labelId = `${autoId}-label`
  const descId = `${controlId ?? autoId}-desc`

  return (
    <div
      className={cn("min-w-0 space-y-1.5", SPAN[span], className)}
      role={group ? "group" : undefined}
      aria-labelledby={group && label ? labelId : undefined}
    >
      {label && (
        <div className="flex items-baseline justify-between gap-2">
          {group ? (
            <span id={labelId} className="field-label">
              {label}
              {required && <span aria-hidden className="ml-0.5 text-destructive">*</span>}
            </span>
          ) : (
            <label htmlFor={controlId} className="field-label">
              {label}
              {required && <span aria-hidden className="ml-0.5 text-destructive">*</span>}
            </label>
          )}
          {optional && <span className="text-[11px] font-medium text-muted-foreground/80">Opcional</span>}
        </div>
      )}
      {control}
      {error ? (
        <p id={descId} role="alert" className="flex items-start gap-1 text-xs font-medium text-destructive">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={descId} className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

/** Control con icono a la izquierda y/o unidad a la derecha (kg, m, $...). */
export function InputGroup({
  icon: Icon, suffix, className, children, ...rest
}: { icon?: LucideIcon; suffix?: React.ReactNode; className?: string; children: React.ReactElement<any> } & Record<string, unknown>) {
  const hijo = children
  return (
    <div className={cn("relative", className)}>
      {Icon && <Icon aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />}
      {React.cloneElement(hijo, {
        ...rest,
        className: cn(hijo.props.className, Icon && "pl-9", suffix && "pr-12"),
      })}
      {suffix && (
        <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  )
}

export function FormSection({
  id, title, description, icon: Icon, className, children,
}: { id?: string; title?: React.ReactNode; description?: React.ReactNode; icon?: LucideIcon; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={cn("scroll-mt-4 space-y-4 border-t border-border/80 pt-5 first:border-t-0 first:pt-0", className)}>
      {(title || description) && (
        <header className="flex items-start gap-2.5">
          {Icon && (
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-bold leading-tight text-foreground">{title}</h3>
            {description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
          </div>
        </header>
      )}
      {children}
    </section>
  )
}

const CALLOUT: Record<string, { box: string; icon: LucideIcon; iconClass: string }> = {
  info: { box: "border-sky-200 bg-sky-50 text-sky-950", icon: Info, iconClass: "text-sky-600" },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-950", icon: AlertTriangle, iconClass: "text-amber-600" },
  danger: { box: "border-red-200 bg-red-50 text-red-950", icon: ShieldAlert, iconClass: "text-red-600" },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-950", icon: CheckCircle2, iconClass: "text-emerald-600" },
}

/** Aviso en linea dentro de un formulario o panel: explica una consecuencia antes de actuar. */
export function Callout({
  tone = "info", title, className, children,
}: { tone?: "info" | "warning" | "danger" | "success"; title?: React.ReactNode; className?: string; children: React.ReactNode }) {
  const c = CALLOUT[tone]
  const Icon = c.icon
  return (
    <div className={cn("flex gap-3 rounded-lg border px-3.5 py-3 text-[13px] leading-relaxed", c.box, className)} role={tone === "danger" ? "alert" : undefined}>
      <Icon aria-hidden className={cn("mt-0.5 h-4 w-4 shrink-0", c.iconClass)} />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        <div className="[&_p+p]:mt-1.5">{children}</div>
      </div>
    </div>
  )
}
