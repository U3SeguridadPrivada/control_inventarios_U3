import * as React from "react"
import { cn } from "@/src/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          // touch-target eleva la altura minima solo en pantallas tactiles.
          "touch-target inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/80": variant === 'default',
            "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 active:bg-destructive/80": variant === 'destructive',
            "bg-secondary text-secondary-foreground hover:bg-secondary/70 active:bg-secondary/60": variant === 'secondary',
            "border border-border bg-card text-foreground hover:bg-muted active:bg-muted": variant === 'outline',
            "hover:bg-muted active:bg-muted text-foreground": variant === 'ghost',
            "h-9 px-4 py-2": size === 'default',
            "h-8 rounded-md px-3 text-xs": size === 'sm',
            "h-10 rounded-md px-8": size === 'lg',
            "h-9 w-9": size === 'icon',
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
