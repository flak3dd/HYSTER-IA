import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Check, X, AlertTriangle, Clock, Loader2 } from "lucide-react"

const statusIndicatorVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-200",
  {
    variants: {
      variant: {
        stable: "bg-stable/10 text-stable border border-stable/20 hover:bg-stable/20",
        critical: "bg-critical/10 text-critical border border-critical/20 hover:bg-critical/20",
        maintenance: "bg-maintenance/10 text-maintenance border border-maintenance/20 hover:bg-maintenance/20",
        pending: "bg-pending/10 text-pending border border-pending/20 hover:bg-pending/20",
        success: "bg-success/10 text-success border border-success/20 hover:bg-success/20",
        warning: "bg-warning/10 text-warning border border-warning/20 hover:bg-warning/20",
        info: "bg-info/10 text-info border border-info/20 hover:bg-info/20",
      },
      size: {
        sm: "px-2 py-0.5 text-[10px]",
        default: "px-2.5 py-1 text-xs",
        lg: "px-3 py-1.5 text-sm",
      },
    },
    defaultVariants: {
      variant: "stable",
      size: "default",
    },
  }
)

interface StatusIndicatorProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof statusIndicatorVariants> {
  label: string
  showIcon?: boolean
  pulse?: boolean
}

function StatusIndicator({
  label,
  variant = "stable",
  size = "default",
  showIcon = true,
  pulse = false,
  className,
  ...props
}: StatusIndicatorProps) {
  const icons = {
    stable: <Check className="h-3 w-3" />,
    critical: <X className="h-3 w-3" />,
    maintenance: <AlertTriangle className="h-3 w-3" />,
    pending: <Clock className="h-3 w-3" />,
    success: <Check className="h-3 w-3" />,
    warning: <AlertTriangle className="h-3 w-3" />,
    info: <Loader2 className="h-3 w-3" />,
  }

  return (
    <div
      className={cn(
        statusIndicatorVariants({ variant, size }),
        pulse && "animate-pulse-subtle",
        className
      )}
      {...props}
    >
      {showIcon && icons[variant ?? "stable"]}
      <span>{label}</span>
    </div>
  )
}

/* Status Dot - Simple dot indicator */
interface StatusDotProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: VariantProps<typeof statusIndicatorVariants>["variant"]
  size?: "sm" | "default" | "lg"
  pulse?: boolean
}

function StatusDot({
  variant = "stable",
  size = "default",
  pulse = false,
  className,
  ...props
}: StatusDotProps) {
  const sizeClasses = {
    sm: "h-2 w-2",
    default: "h-2.5 w-2.5",
    lg: "h-3 w-3",
  }

  const colorClasses = {
    stable: "bg-stable glow-success",
    critical: "bg-critical glow-danger",
    maintenance: "bg-maintenance",
    pending: "bg-pending",
    success: "bg-success glow-success",
    warning: "bg-warning",
    info: "bg-info",
  }

  return (
    <div
      className={cn(
        "rounded-full transition-all duration-200",
        sizeClasses[size ?? "default"],
        colorClasses[variant ?? "stable"],
        pulse && "animate-pulse-subtle",
        className
      )}
      {...props}
    />
  )
}

/* Status Pill - Pill-shaped indicator with optional label */
interface StatusPillProps extends StatusIndicatorProps {
  showDot?: boolean
}

function StatusPill({
  label,
  variant = "stable",
  size = "default",
  showIcon = false,
  showDot = true,
  pulse = false,
  className,
  ...props
}: StatusPillProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-200",
        "bg-muted/50 border border-border hover:bg-muted",
        className
      )}
      {...props}
    >
      {showDot && <StatusDot variant={variant} size="sm" pulse={pulse} />}
      <span className="text-foreground">{label}</span>
    </div>
  )
}

export {
  StatusIndicator,
  StatusDot,
  StatusPill,
  statusIndicatorVariants,
}