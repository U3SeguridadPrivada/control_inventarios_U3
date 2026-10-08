import * as React from "react"
import { cn } from "@/src/lib/utils"

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[88px] w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm leading-relaxed text-foreground shadow-xs transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/70 hover:border-slate-400/80 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none aria-[invalid=true]:border-destructive",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
