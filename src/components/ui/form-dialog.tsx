'use client'
import * as React from "react"
import { Loader2, Trash2, type LucideIcon } from "lucide-react"
import { cn } from "@/src/lib/utils"
import { Button } from "./button"
import { Dialog, DialogClose } from "./dialog"

const SIZES = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  "2xl": "max-w-5xl",
} as const

export interface FormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  icon?: LucideIcon
  /** danger tine el icono y deja claro que la accion es destructiva. */
  tone?: "default" | "danger"
  size?: keyof typeof SIZES
  /** Si se omite, el dialogo es informativo y solo muestra el boton de cerrar. Recibe el evento ya cancelado (preventDefault). */
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void
  submitLabel?: string
  submittingLabel?: string
  submitting?: boolean
  submitDisabled?: boolean
  cancelLabel?: string
  /** Texto de apoyo en la esquina izquierda del pie (por ejemplo, campos obligatorios). */
  footerNote?: React.ReactNode
  /** Acciones propias del pie; reemplazan los botones Cancelar y Guardar. */
  footer?: React.ReactNode
  /** Panel lateral (solo en pantallas anchas): resumen vivo, indice de secciones, etc. */
  aside?: React.ReactNode
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}

/**
 * Marco unico para los formularios emergentes: encabezado con icono y subtitulo,
 * cuerpo con desplazamiento propio y pie fijo con acciones. Reemplaza la mezcla de
 * Dialog + DialogHeader + DialogFooter armada a mano en cada modulo.
 */
export function FormDialog({
  open, onOpenChange, title, description, icon: Icon, tone = "default", size = "md",
  onSubmit, submitLabel = "Guardar", submittingLabel = "Guardando...", submitting, submitDisabled,
  cancelLabel = "Cancelar", footerNote, footer, aside, className, bodyClassName, children,
}: FormDialogProps) {
  const danger = tone === "danger"
  const Shell: any = onSubmit ? "form" : "div"

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className={cn("flex flex-col overflow-hidden p-0", SIZES[size], className)}>
      <Shell
        {...(onSubmit ? { onSubmit: (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); onSubmit(e) } } : {})}
        className="flex min-h-0 flex-1 flex-col"
      >
        <header className="relative flex items-start gap-3.5 border-b border-border px-5 py-4 pr-14 sm:px-6">
          {Icon && (
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                danger ? "bg-red-50 text-red-600 ring-1 ring-inset ring-red-600/10" : "bg-primary/10 text-primary"
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0 pt-0.5">
            <h2 className="text-[17px] font-bold leading-snug tracking-tight text-foreground">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
          </div>
          <DialogClose className="right-4 top-4" />
        </header>

        <div className={cn("flex min-h-0 flex-1", aside && "md:grid md:grid-cols-[17rem_minmax(0,1fr)]")}>
          {aside && (
            <aside className="hidden overflow-y-auto border-r border-border bg-muted/60 p-5 md:block">{aside}</aside>
          )}
          <div className={cn("min-w-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6", bodyClassName)}>
            {children}
          </div>
        </div>

        <footer className="flex flex-col gap-2 border-t border-border bg-muted px-5 py-3 pb-[calc(0.75rem+var(--safe-bottom))] sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6 sm:pb-3">
          <div className="text-xs text-muted-foreground empty:hidden sm:empty:block">{footerNote}</div>
          <div className="flex gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
            {footer ?? (
              <>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                  {onSubmit ? cancelLabel : "Cerrar"}
                </Button>
                {onSubmit && (
                  <Button type="submit" variant={danger ? "destructive" : "default"} disabled={submitting || submitDisabled}>
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                    {submitting ? submittingLabel : submitLabel}
                  </Button>
                )}
              </>
            )}
          </div>
        </footer>
      </Shell>
    </Dialog>
  )
}

/** Confirmacion de accion delicada (eliminar, dar de baja) con el mismo marco de los formularios. */
export function ConfirmDialog({
  open, onOpenChange, title, description, icon = Trash2, confirmLabel = "Eliminar", confirmingLabel = "Eliminando...",
  confirming, onConfirm, tone = "danger", size = "sm", children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  icon?: LucideIcon
  confirmLabel?: string
  confirmingLabel?: string
  confirming?: boolean
  onConfirm: () => void
  tone?: "default" | "danger"
  size?: keyof typeof SIZES
  children?: React.ReactNode
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      icon={icon}
      tone={tone}
      size={size}
      onSubmit={onConfirm}
      submitLabel={confirmLabel}
      submittingLabel={confirmingLabel}
      submitting={confirming}
    >
      {children}
    </FormDialog>
  )
}
