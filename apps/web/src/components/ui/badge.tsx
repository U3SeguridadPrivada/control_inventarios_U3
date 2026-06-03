import * as React from "react"
import { cn } from "../../lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success';
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none",
        {
          "border-transparent bg-primary/10 text-primary": variant === "default",
          "border-transparent bg-secondary text-secondary-foreground": variant === "secondary",
          "border-transparent bg-destructive/10 text-destructive": variant === "destructive",
          "border-transparent bg-emerald-100 text-emerald-700": variant === "success",
          "border-border text-muted-foreground": variant === "outline"
        },
        className
      )}
      {...props}
    />
  )
}

export { Badge }
