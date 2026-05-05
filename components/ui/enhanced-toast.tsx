import { toast } from 'sonner'
import { CheckCircle2, XCircle, AlertTriangle, Info, Loader2 } from 'lucide-react'

export function showSuccessToast(message: string, description?: string) {
  toast.success(message, {
    description,
    icon: <CheckCircle2 className="h-4 w-4 text-success" />,
    duration: 3000,
  })
}

export function showErrorToast(message: string, description?: string) {
  toast.error(message, {
    description,
    icon: <XCircle className="h-4 w-4 text-destructive" />,
    duration: 5000,
  })
}

export function showWarningToast(message: string, description?: string) {
  toast.warning(message, {
    description,
    icon: <AlertTriangle className="h-4 w-4 text-warning" />,
    duration: 4000,
  })
}

export function showInfoToast(message: string, description?: string) {
  toast.info(message, {
    description,
    icon: <Info className="h-4 w-4 text-info" />,
    duration: 3000,
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