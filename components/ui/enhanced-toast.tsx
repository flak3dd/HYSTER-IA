import React from 'react'
import { toast } from 'sonner'
import { CheckCircle2, XCircle, AlertTriangle, Info, Loader2, Clock } from 'lucide-react'

export function showSuccessToast(message: string, description?: string, duration = 3000) {
  toast.success(message, {
    description,
    icon: <CheckCircle2 className="h-4 w-4 text-success" />,
    duration,
  })
}

export function showErrorToast(message: string, description?: string, duration = 5000) {
  toast.error(message, {
    description,
    icon: <XCircle className="h-4 w-4 text-destructive" />,
    duration,
  })
}

export function showWarningToast(message: string, description?: string, duration = 4000) {
  toast.warning(message, {
    description,
    icon: <AlertTriangle className="h-4 w-4 text-warning" />,
    duration,
  })
}

export function showInfoToast(message: string, description?: string, duration = 3000) {
  toast.info(message, {
    description,
    icon: <Info className="h-4 w-4 text-info" />,
    duration,
  })
}

export function showLoadingToast(message: string, promise: Promise<any>) {
  return toast.promise(promise, {
    loading: (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        {message}
      </div>
    ),
    success: (data) => 'Operation completed successfully',
    error: (error) => error.message || 'Operation failed',
  })
}

/* Toast with Progress Indicator */
export function showProgressToast(
  message: string,
  progress: number,
  description?: string
) {
  return toast.custom(
    (t) => (
      <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-card shadow-elevation-3">
        <Loader2 className="h-4 w-4 animate-spin text-primary mt-0.5" />
        <div className="flex-1 space-y-2">
          <div className="text-sm font-medium">{message}</div>
          {description && <div className="text-xs text-muted-foreground">{description}</div>}
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-xs text-muted-foreground text-right">{progress}%</div>
        </div>
      </div>
    ),
    { duration: Infinity }
  )
}

/* Toast with Action */
export function showActionToast(
  message: string,
  actionLabel: string,
  onAction: () => void,
  description?: string
) {
  toast(message, {
    description,
    action: {
      label: actionLabel,
      onClick: onAction,
    },
  })
}

/* Toast with Countdown */
export function showCountdownToast(
  message: string,
  seconds: number,
  onTimeout?: () => void,
  description?: string
) {
  return toast.custom(
    (t) => {
      const [remaining, setRemaining] = React.useState(seconds)

      React.useEffect(() => {
        if (remaining <= 0) {
          onTimeout?.()
          toast.dismiss(t)
          return
        }

        const timer = setTimeout(() => setRemaining(remaining - 1), 1000)
        return () => clearTimeout(timer)
      }, [remaining])

      return (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-card shadow-elevation-3">
          <Clock className="h-4 w-4 text-warning mt-0.5" />
          <div className="flex-1 space-y-2">
            <div className="text-sm font-medium">{message}</div>
            {description && <div className="text-xs text-muted-foreground">{description}</div>}
            <div className="text-xs text-muted-foreground">
              Auto-dismiss in {remaining}s
            </div>
          </div>
        </div>
      )
    },
    { duration: seconds * 1000 }
  )
}

/* Toast with Rich Content */
export function showRichToast(
  title: string,
  content: React.ReactNode,
  type: 'success' | 'error' | 'warning' | 'info' = 'info'
) {
  const icons = {
    success: <CheckCircle2 className="h-4 w-4 text-success" />,
    error: <XCircle className="h-4 w-4 text-destructive" />,
    warning: <AlertTriangle className="h-4 w-4 text-warning" />,
    info: <Info className="h-4 w-4 text-info" />,
  }

  return toast.custom(
    () => (
      <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-card shadow-elevation-3 max-w-md">
        {icons[type]}
        <div className="flex-1">
          <div className="text-sm font-medium mb-1">{title}</div>
          <div className="text-sm text-muted-foreground">{content}</div>
        </div>
      </div>
    ),
    { duration: 5000 }
  )
}