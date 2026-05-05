"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/* Keyboard Shortcut Hook */
interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean
  callback: () => void
  description?: string
}

function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const { key, ctrl, shift, alt, meta, callback } = shortcut

        if (
          e.key.toLowerCase() === key.toLowerCase() &&
          (ctrl === undefined || e.ctrlKey === ctrl) &&
          (shift === undefined || e.shiftKey === shift) &&
          (alt === undefined || e.altKey === alt) &&
          (meta === undefined || e.metaKey === meta)
        ) {
          e.preventDefault()
          callback()
          break
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [shortcuts])
}

/* Keyboard Shortcut Badge - Display keyboard shortcuts */
interface KeyboardShortcutBadgeProps {
  shortcut: string[]
  className?: string
}

function KeyboardShortcutBadge({ shortcut, className }: KeyboardShortcutBadgeProps) {
  const formatShortcut = (key: string) => {
    if (key === " ") return "Space"
    if (key === "Escape") return "Esc"
    return key.length === 1 ? key.toUpperCase() : key
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {shortcut.map((key, index) => (
        <React.Fragment key={key}>
          {index > 0 && <span className="text-muted-foreground/50">+</span>}
          <kbd className="px-1.5 py-0.5 text-xs font-medium rounded bg-muted border border-border text-muted-foreground">
            {formatShortcut(key)}
          </kbd>
        </React.Fragment>
      ))}
    </div>
  )
}

/* Keyboard Navigation List - Navigate list with arrow keys */
interface KeyboardNavListProps {
  children: React.ReactNode
  orientation?: "horizontal" | "vertical"
  loop?: boolean
  className?: string
  onNavigate?: (index: number) => void
}

function KeyboardNavList({
  children,
  orientation = "vertical",
  loop = true,
  className,
  onNavigate,
}: KeyboardNavListProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [focusedIndex, setFocusedIndex] = React.useState(0)

  const items = React.Children.toArray(children).filter(
    (child): child is React.ReactElement => React.isValidElement(child)
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const isVertical = orientation === "vertical"
    const nextKey = isVertical ? "ArrowDown" : "ArrowRight"
    const prevKey = isVertical ? "ArrowUp" : "ArrowLeft"

    if (e.key === nextKey) {
      e.preventDefault()
      const nextIndex = focusedIndex + 1
      const newIndex = loop && nextIndex >= items.length ? 0 : nextIndex
      if (newIndex < items.length) {
        setFocusedIndex(newIndex)
        onNavigate?.(newIndex)
      }
    } else if (e.key === prevKey) {
      e.preventDefault()
      const prevIndex = focusedIndex - 1
      const newIndex = loop && prevIndex < 0 ? items.length - 1 : prevIndex
      if (newIndex >= 0) {
        setFocusedIndex(newIndex)
        onNavigate?.(newIndex)
      }
    } else if (e.key === "Home") {
      e.preventDefault()
      setFocusedIndex(0)
      onNavigate?.(0)
    } else if (e.key === "End") {
      e.preventDefault()
      setFocusedIndex(items.length - 1)
      onNavigate?.(items.length - 1)
    }
  }

  React.useEffect(() => {
    const focusableElements = containerRef.current?.querySelectorAll(
      '[tabindex]:not([tabindex="-1"])'
    ) as NodeListOf<HTMLElement>
    focusableElements?.[focusedIndex]?.focus()
  }, [focusedIndex])

  return (
    <div
      ref={containerRef}
      role={orientation === "vertical" ? "listbox" : "menu"}
      onKeyDown={handleKeyDown}
      className={className}
    >
      {React.Children.map(items, (child, index) => {
        if (!React.isValidElement(child)) return child
        return React.cloneElement(child, {
          tabIndex: index === focusedIndex ? 0 : -1,
          "data-index": index,
        } as any)
      })}
    </div>
  )
}

/* Keyboard Dialog - Dialog with keyboard navigation */
interface KeyboardDialogProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
}

function KeyboardDialog({ open, onClose, children, className }: KeyboardDialogProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open || !dialogRef.current) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }

    window.addEventListener("keydown", handleEscape)
    return () => window.removeEventListener("keydown", handleEscape)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      className={className}
    >
      {children}
    </div>
  )
}

/* Keyboard Menu - Menu with keyboard navigation */
interface KeyboardMenuProps {
  children: React.ReactNode
  className?: string
  onItemSelect?: (index: number) => void
}

function KeyboardMenu({ children, className, onItemSelect }: KeyboardMenuProps) {
  const [selectedIndex, setSelectedIndex] = React.useState(0)

  const items = React.Children.toArray(children).filter(
    (child): child is React.ReactElement => React.isValidElement(child)
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((prev) => {
        const next = prev + 1
        return next >= items.length ? 0 : next
      })
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((prev) => {
        const prevIndex = prev - 1
        return prevIndex < 0 ? items.length - 1 : prevIndex
      })
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onItemSelect?.(selectedIndex)
    }
  }

  return (
    <div
      role="menu"
      onKeyDown={handleKeyDown}
      className={className}
    >
      {React.Children.map(items, (child, index) => {
        if (!React.isValidElement(child)) return child
        return React.cloneElement(child, {
          role: "menuitem",
          tabIndex: index === selectedIndex ? 0 : -1,
          "data-selected": index === selectedIndex,
        } as any)
      })}
    </div>
  )
}

/* Keyboard Tooltip - Tooltip that shows keyboard shortcuts */
interface KeyboardTooltipProps {
  children: React.ReactNode
  shortcut: string[]
  content: string
  className?: string
}

function KeyboardTooltip({ children, shortcut, content, className }: KeyboardTooltipProps) {
  const [show, setShow] = React.useState(false)

  return (
    <div className={cn("relative inline-block", className)}>
      <div
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
      >
        {children}
      </div>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-popover border border-border rounded-lg shadow-elevation-3 text-sm whitespace-nowrap z-50">
          <div className="flex items-center gap-2">
            <span>{content}</span>
            <KeyboardShortcutBadge shortcut={shortcut} />
          </div>
        </div>
      )}
    </div>
  )
}

/* Global Keyboard Shortcuts Provider */
interface KeyboardShortcutsProviderProps {
  children: React.ReactNode
  shortcuts: KeyboardShortcut[]
}

function KeyboardShortcutsProvider({ children, shortcuts }: KeyboardShortcutsProviderProps) {
  useKeyboardShortcuts(shortcuts)
  return <>{children}</>
}

export {
  useKeyboardShortcuts,
  KeyboardShortcutBadge,
  KeyboardNavList,
  KeyboardDialog,
  KeyboardMenu,
  KeyboardTooltip,
  KeyboardShortcutsProvider,
}