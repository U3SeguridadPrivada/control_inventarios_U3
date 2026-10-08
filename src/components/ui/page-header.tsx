import * as React from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/src/lib/utils"

export interface Crumb {
  label: string
  href?: string
}

/**
 * Encabezado de pagina: ruta opcional, titulo, descripcion y acciones a la derecha.
 * Un solo patron para todos los modulos, en lugar de una tarjeta distinta en cada uno.
 */
export function PageHeader({
  title, description, breadcrumbs, actions, className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  breadcrumbs?: Crumb[]
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Ruta de navegacion" className="mb-1.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={`${crumb.label}-${i}`}>
                {i > 0 && <ChevronRight aria-hidden className="h-3 w-3 text-muted-foreground/60" />}
                {crumb.href ? (
                  <Link href={crumb.href} className="rounded transition-colors hover:text-foreground">{crumb.label}</Link>
                ) : (
                  <span className="font-medium text-foreground/80">{crumb.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-foreground sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
