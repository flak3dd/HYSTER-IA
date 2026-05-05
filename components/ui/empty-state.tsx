import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import {
  Search,
  Inbox,
  FileText,
  Users,
  Database,
  AlertCircle,
  CheckCircle2,
  Zap,
  ArrowRight,
  RefreshCw,
} from "lucide-react"
import { Button } from "./button"

const emptyStateVariants = cva(
  "flex flex-col items-center justify-center text-center p-8",
  {
    variants: {
      size: {
        sm: "p-6",
        default: "p-8",
        lg: "p-12",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
    variant?: "default" | "outline" | "ghost"
  }
  size?: VariantProps<typeof emptyStateVariants>["size"]
  className?: string
}

function EmptyState({
  icon,
  title,
  description,
  action,
  size = "default",
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div className={cn(emptyStateVariants({ size }), className)} {...props}>
      {icon && (
        <div className="mb-4 text-muted-foreground/50">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mb-6 max-w-md">{description}</p>
      )}
      {action && (
        <Button variant={action.variant || "default"} onClick={action.onClick}>
          {action.label}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

/* Pre-built Empty State Variants */

/* No Results */
function EmptyStateNoResults({
  onClear,
  className,
}: {
  onClear?: () => void
  className?: string
}) {
  return (
    <EmptyState
      icon={<Search className="h-16 w-16" />}
      title="No results found"
      description="We couldn't find any results matching your search criteria. Try adjusting your filters or search terms."
      action={onClear ? { label: "Clear filters", onClick: onClear, variant: "outline" } : undefined}
      className={className}
    />
  )
}

/* No Data */
function EmptyStateNoData({
  onRefresh,
  className,
}: {
  onRefresh?: () => void
  className?: string
}) {
  return (
    <EmptyState
      icon={<Database className="h-16 w-16" />}
      title="No data available"
      description="There's no data to display yet. Data will appear here once available."
      action={onRefresh ? { label: "Refresh", onClick: onRefresh, variant: "outline" } : undefined}
      className={className}
    />
  )
}

/* No Items */
function EmptyStateNoItems({
  onCreate,
  className,
}: {
  onCreate?: () => void
  className?: string
}) {
  return (
    <EmptyState
      icon={<Inbox className="h-16 w-16" />}
      title="No items yet"
      description="Get started by creating your first item. It's quick and easy."
      action={onCreate ? { label: "Create item", onClick: onCreate } : undefined}
      className={className}
    />
  )
}

/* No Documents */
function EmptyStateNoDocuments({
  onUpload,
  className,
}: {
  onUpload?: () => void
  className?: string
}) {
  return (
    <EmptyState
      icon={<FileText className="h-16 w-16" />}
      title="No documents"
      description="Upload your first document to get started. We support various file formats."
      action={onUpload ? { label: "Upload document", onClick: onUpload } : undefined}
      className={className}
    />
  )
}

/* No Users */
function EmptyStateNoUsers({
  onInvite,
  className,
}: {
  onInvite?: () => void
  className?: string
}) {
  return (
    <EmptyState
      icon={<Users className="h-16 w-16" />}
      title="No team members"
      description="Invite team members to collaborate on this project together."
      action={onInvite ? { label: "Invite member", onClick: onInvite } : undefined}
      className={className}
    />
  )
}

/* Error State */
function EmptyStateError({
  onRetry,
  message,
  className,
}: {
  onRetry?: () => void
  message?: string
  className?: string
}) {
  return (
    <EmptyState
      icon={<AlertCircle className="h-16 w-16 text-destructive" />}
      title="Something went wrong"
      description={message || "An error occurred while loading the data. Please try again."}
      action={onRetry ? { label: "Try again", onClick: onRetry, variant: "outline" } : undefined}
      className={className}
    />
  )
}

/* Success State */
function EmptyStateSuccess({
  message,
  onContinue,
  className,
}: {
  message?: string
  onContinue?: () => void
  className?: string
}) {
  return (
    <EmptyState
      icon={<CheckCircle2 className="h-16 w-16 text-success" />}
      title="All done!"
      description={message || "Your changes have been saved successfully."}
      action={onContinue ? { label: "Continue", onClick: onContinue } : undefined}
      className={className}
    />
  )
}

/* Loading State */
function EmptyStateLoading({
  message,
  className,
}: {
  message?: string
  className?: string
}) {
  return (
    <EmptyState
      icon={<RefreshCw className="h-16 w-16 animate-spin text-primary" />}
      title="Loading..."
      description={message || "Please wait while we load your data."}
      className={className}
    />
  )
}

/* Empty State with Custom Illustration */
interface EmptyStateIllustrationProps {
  illustration: React.ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
    variant?: "default" | "outline" | "ghost"
  }
  className?: string
}

function EmptyStateIllustration({
  illustration,
  title,
  description,
  action,
  className,
}: EmptyStateIllustrationProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center p-8", className)}>
      <div className="mb-6">{illustration}</div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mb-6 max-w-md">{description}</p>
      )}
      {action && (
        <Button variant={action.variant || "default"} onClick={action.onClick}>
          {action.label}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

/* Minimal Empty State - For compact spaces */
interface EmptyStateMinimalProps {
  title: string
  description?: string
  icon?: React.ReactNode
  className?: string
}

function EmptyStateMinimal({
  title,
  description,
  icon,
  className,
}: EmptyStateMinimalProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-8", className)}>
      {icon && (
        <div className="mb-3 text-muted-foreground/40">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-foreground mb-1">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  )
}

export {
  EmptyState,
  EmptyStateNoResults,
  EmptyStateNoData,
  EmptyStateNoItems,
  EmptyStateNoDocuments,
  EmptyStateNoUsers,
  EmptyStateError,
  EmptyStateSuccess,
  EmptyStateLoading,
  EmptyStateIllustration,
  EmptyStateMinimal,
  emptyStateVariants,
}