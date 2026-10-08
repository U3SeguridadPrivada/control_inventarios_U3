import * as React from "react"
import { cn } from "@/src/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * soft y dark son las dos voces extra del sistema: la primera para acciones
   * secundarias con color de marca, la segunda para el boton de mayor peso en
   * las fichas de personal (tinta oscura, como las pildoras de los perfiles).
   */
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'soft' | 'dark';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          // touch-target eleva la altura minima solo en pantallas tactiles. El gap separa icono y
          // texto; los margenes mr-*/ml-* que ya traian los iconos se anulan para no sumarse a el.
          "touch-target inline-flex items-center justify-center gap-1.5 [&>svg]:mr-0 [&>svg]:ml-0 whitespace-nowrap rounded-lg text-[13px] font-semibold transition-[background-color,border-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 active:bg-primary/80": variant === 'default',
            "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 active:bg-destructive/80 focus-visible:ring-destructive/20": variant === 'destructive',
            "bg-secondary text-secondary-foreground hover:bg-secondary/70 active:bg-secondary/60": variant === 'secondary',
            "border border-border bg-card text-foreground shadow-xs hover:bg-muted active:bg-muted": variant === 'outline',
            "text-foreground hover:bg-muted active:bg-muted": variant === 'ghost',
            "bg-primary/10 text-primary hover:bg-primary/15 active:bg-primary/20": variant === 'soft',
            "bg-ink text-white shadow-xs hover:bg-ink/90 active:bg-ink/80": variant === 'dark',
            "h-9 px-4 py-2": size === 'default',
            "h-8 rounded-md px-3 text-xs": size === 'sm',
            "h-10 px-6 text-sm": size === 'lg',
            "h-9 w-9 px-0": size === 'icon',
          },
          className
        )}
        data-size={size}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
