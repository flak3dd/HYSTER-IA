"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/* Skip Link - Allows keyboard users to skip navigation */
interface SkipLinkProps {
  href: string
  children: React.ReactNode
  className?: string
}

function SkipLink({ href, children, className }: SkipLinkProps) {
  return (
    <a
      href={href}
      className={cn(
        "sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50",
        "focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground",
        "focus:rounded-lg focus:font-medium focus:outline-none focus:ring-2 focus:ring-ring",
        className
      )}
    >
      {children}
    </a>
  )
}

/* Visually Hidden - Hide content visually but keep it accessible for screen readers */
interface VisuallyHiddenProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode
}

function VisuallyHidden({ children, className, ...props }: VisuallyHiddenProps) {
  return (
    <span
      className={cn(
        "sr-only",
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}

/* Focus Trap - Trap focus within a component (modals, dropdowns) */
interface FocusTrapProps {
  children: React.ReactNode
  enabled?: boolean
  className?: string
}

function FocusTrap({ children, enabled = true, className }: FocusTrapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!enabled || !containerRef.current) return

    const container = containerRef.current
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const firstElement = focusableElements[0] as HTMLElement
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }

    container.addEventListener("keydown", handleTab)
    firstElement?.focus()

    return () => {
      container.removeEventListener("keydown", handleTab)
    }
  }, [enabled])

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  )
}

/* Live Region - Announce dynamic content to screen readers */
interface LiveRegionProps {
  children: React.ReactNode
  politeness?: "polite" | "assertive" | "off"
  className?: string
}

function LiveRegion({ children, politeness = "polite", className }: LiveRegionProps) {
  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className={cn("sr-only", className)}
    >
      {children}
    </div>
  )
}

/* Announcer - Programmatically announce messages to screen readers */
interface AnnouncerProps {
  message?: string
  politeness?: "polite" | "assertive"
}

function Announcer({ message, politeness = "polite" }: AnnouncerProps) {
  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  )
}

/* Focus Visible - Custom focus visible indicator */
interface FocusVisibleProps {
  children: React.ReactNode
  className?: string
}

function FocusVisible({ children, className }: FocusVisibleProps) {
  const [isFocusVisible, setIsFocusVisible] = React.useState(false)
  const hadKeyboardEvent = React.useRef(false)

  const handleKeyDown = () => {
    hadKeyboardEvent.current = true
  }

  const handleMouseDown = () => {
    hadKeyboardEvent.current = false
  }

  const handleFocus = () => {
    setIsFocusVisible(hadKeyboardEvent.current)
  }

  const handleBlur = () => {
    setIsFocusVisible(false)
  }

  return (
    <div
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={cn(
        isFocusVisible && "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
    >
      {children}
    </div>
  )
}

/* Accessible Button - Button with proper ARIA attributes */
interface AccessibleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  pressed?: boolean
  expanded?: boolean
  hasPopup?: boolean | "menu" | "listbox" | "tree" | "grid" | "dialog"
  label?: string
  description?: string
}

function AccessibleButton({
  children,
  pressed,
  expanded,
  hasPopup,
  label,
  description,
  className,
  ...props
}: AccessibleButtonProps) {
  return (
    <button
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-haspopup={hasPopup}
      aria-label={label}
      aria-describedby={description}
      className={className}
      {...props}
    >
      {children}
      {label && <VisuallyHidden>{label}</VisuallyHidden>}
    </button>
  )
}

/* Accessible Heading - Heading with proper level */
interface AccessibleHeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level: 1 | 2 | 3 | 4 | 5 | 6
  children: React.ReactNode
}

function AccessibleHeading({ level, children, className, ...props }: AccessibleHeadingProps) {
  const Tag = `h${level}` as keyof JSX.IntrinsicElements
  return (
    <Tag className={className} {...props}>
      {children}
    </Tag>
  )
}

/* Landmark - Semantic landmark regions */
interface LandmarkProps extends React.HTMLAttributes<HTMLElement> {
  landmark: "banner" | "main" | "navigation" | "complementary" | "contentinfo" | "search" | "form"
  label?: string
  children: React.ReactNode
}

function Landmark({ landmark, label, children, className, ...props }: LandmarkProps) {
  return (
    <section
      role={landmark}
      aria-label={label}
      className={className}
      {...props}
    >
      {children}
    </section>
  )
}

/* Screen Reader Only - Helper for screen reader specific content */
function ScreenReaderOnly({ children }: { children: React.ReactNode }) {
  return <span className="sr-only">{children}</span>
}

/* Focus Management Hook */
function useFocusManagement() {
  const previousElementRef = React.useRef<HTMLElement | null>(null)

  const saveFocus = () => {
    previousElementRef.current = document.activeElement as HTMLElement
  }

  const restoreFocus = () => {
    previousElementRef.current?.focus()
  }

  const trapFocus = (containerRef: React.RefObject<HTMLElement>) => {
    if (!containerRef.current) return

    const container = containerRef.current
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const firstElement = focusableElements[0] as HTMLElement
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

    firstElement?.focus()
  }

  return { saveFocus, restoreFocus, trapFocus }
}

export {
  SkipLink,
  VisuallyHidden,
  FocusTrap,
  LiveRegion,
  Announcer,
  FocusVisible,
  AccessibleButton,
  AccessibleHeading,
  Landmark,
  ScreenReaderOnly,
  useFocusManagement,
}