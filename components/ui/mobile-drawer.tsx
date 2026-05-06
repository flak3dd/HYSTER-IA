"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"
import { Button } from "./button"

const mobileDrawerVariants = cva(
  "fixed inset-y-0 z-50 w-full max-w-xs bg-sidebar shadow-elevation-5 transition-transform duration-300 ease-in-out",
  {
    variants: {
      side: {
        left: "left-0",
        right: "right-0",
      },
    },
    defaultVariants: {
      side: "left",
    },
  }
)

interface MobileDrawerProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  side?: VariantProps<typeof mobileDrawerVariants>["side"]
  overlay?: boolean
}

function MobileDrawer({
  open = false,
  onOpenChange,
  side = "left",
  overlay = true,
  className,
  children,
  ...props
}: MobileDrawerProps) {
  const [internalOpen, setInternalOpen] = React.useState(open)

  const isOpen = open !== undefined ? open : internalOpen

  const handleOpenChange = (newOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(newOpen)
    } else {
      setInternalOpen(newOpen)
    }
  }

  React.useEffect(() => {
    if (open !== undefined) {
      setInternalOpen(open)
    }
  }, [open])

  // Prevent body scroll when drawer is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  // Close on escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleOpenChange(false)
      }
    }
    window.addEventListener("keydown", handleEscape)
    return () => window.removeEventListener("keydown", handleEscape)
  }, [isOpen])

  return (
    <>
      {overlay && isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-md transition-opacity duration-300"
          onClick={() => handleOpenChange(false)}
        />
      )}
      <div
        className={cn(
          mobileDrawerVariants({ side }),
          isOpen
            ? "translate-x-0"
            : side === "left"
            ? "-translate-x-full"
            : "translate-x-full",
          className
        )}
        {...props}
      >
        <div className="flex h-14 items-center justify-between px-4 border-b border-sidebar-border">
          <span className="text-heading-sm text-sidebar-accent-foreground">Menu</span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => handleOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </>
  )
}

/* Mobile Drawer Trigger */
interface MobileDrawerTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
}

function MobileDrawerTrigger({
  asChild = false,
  className,
  children,
  ...props
}: MobileDrawerTriggerProps) {
  const Comp = asChild ? React.Fragment : "button"

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      onClick: (e: React.MouseEvent) => {
        (children as any).props.onClick?.(e)
        // Trigger drawer open
        const drawer = document.querySelector('[data-mobile-drawer]') as HTMLElement
        drawer?.dispatchEvent(new CustomEvent('mobile-drawer-open'))
      },
    })
  }

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

/* Mobile Drawer Content - Scrollable content area */
interface MobileDrawerContentProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

function MobileDrawerContent({
  className,
  children,
  ...props
}: MobileDrawerContentProps) {
  return (
    <div
      className={cn("flex-1 overflow-y-auto px-4 py-4", className)}
      {...props}
    >
      {children}
    </div>
  )
}

/* Mobile Drawer Item - Navigation item */
interface MobileDrawerItemProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  active?: boolean
  icon?: React.ReactNode
}

function MobileDrawerItem({
  active = false,
  icon,
  className,
  children,
  ...props
}: MobileDrawerItemProps) {
  return (
    <a
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        className
      )}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </a>
  )
}

/* Mobile Drawer Section - Grouped sections */
interface MobileDrawerSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
}

function MobileDrawerSection({
  title,
  className,
  children,
  ...props
}: MobileDrawerSectionProps) {
  return (
    <div className={cn("mb-6", className)} {...props}>
      {title && (
        <h4 className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
          {title}
        </h4>
      )}
      <div className="space-y-1">{children}</div>
    </div>
  )
}

export {
  MobileDrawer,
  MobileDrawerTrigger,
  MobileDrawerContent,
  MobileDrawerItem,
  MobileDrawerSection,
  mobileDrawerVariants,
}