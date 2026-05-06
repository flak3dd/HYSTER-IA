"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { GripVertical, MoreHorizontal } from "lucide-react"
import { Button } from "./button"

interface DashboardGridProps extends React.HTMLAttributes<HTMLDivElement> {
  columns?: {
    xs?: number
    sm?: number
    md?: number
    lg?: number
    xl?: number
  }
  gap?: "sm" | "default" | "lg"
  editable?: boolean
  onReorder?: (newOrder: string[]) => void
}

interface DashboardWidgetProps extends React.HTMLAttributes<HTMLDivElement> {
  id: string
  title?: string
  editable?: boolean
  onRemove?: (id: string) => void
  dragHandle?: boolean
}

/* Dashboard Grid - Main container */
function DashboardGrid({
  children,
  columns = { xs: 1, sm: 2, md: 2, lg: 3, xl: 4 },
  gap = "default",
  editable = false,
  onReorder,
  className,
  ...props
}: DashboardGridProps) {
  const [draggedId, setDraggedId] = React.useState<string | null>(null)
  const [dragOverId, setDragOverId] = React.useState<string | null>(null)
  const gridRef = React.useRef<HTMLDivElement>(null)

  const gapClasses = {
    sm: "gap-3",
    default: "gap-4",
    lg: "gap-6",
  }

  const gridClasses = Object.entries(columns)
    .map(([breakpoint, col]) => {
      const prefix = breakpoint === "xs" ? "" : `${breakpoint}:`
      return `${prefix}grid-cols-${col}`
    })
    .join(" ")

  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (!editable) return
    setDraggedId(id)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", id)
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    if (!editable) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverId(id)
  }

  const handleDragLeave = () => {
    setDragOverId(null)
  }

  const handleDrop = (e: React.DragEvent, dropId: string) => {
    if (!editable || !draggedId || draggedId === dropId) return
    e.preventDefault()

    const widgets = Array.from(gridRef.current?.children || [])
    const currentIndex = widgets.findIndex((w) => w.getAttribute("data-widget-id") === draggedId)
    const dropIndex = widgets.findIndex((w) => w.getAttribute("data-widget-id") === dropId)

    if (currentIndex === -1 || dropIndex === -1) return

    const newOrder = widgets.map((w) => w.getAttribute("data-widget-id") || "")
    const [removed] = newOrder.splice(currentIndex, 1)
    newOrder.splice(dropIndex, 0, removed)

    onReorder?.(newOrder)
    setDraggedId(null)
    setDragOverId(null)
  }

  const handleDragEnd = () => {
    setDraggedId(null)
    setDragOverId(null)
  }

  return (
    <div
      ref={gridRef}
      className={cn(
        "grid transition-all duration-300",
        gridClasses,
        gapClasses[gap],
        className
      )}
      {...props}
    >
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child
        const typedChild = child as React.ReactElement<any>
        return React.cloneElement(typedChild, {
          editable,
          isDragging: draggedId === typedChild.props.id,
          isDragOver: dragOverId === typedChild.props.id,
          onDragStart: handleDragStart,
          onDragOver: handleDragOver,
          onDragLeave: handleDragLeave,
          onDrop: handleDrop,
          onDragEnd: handleDragEnd,
        })
      })}
    </div>
  )
}

/* Dashboard Widget - Individual widget */
function DashboardWidget({
  id,
  title,
  editable = false,
  isDragging = false,
  isDragOver = false,
  onRemove,
  dragHandle = true,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  className,
  children,
  ...props
}: DashboardWidgetProps & {
  isDragging?: boolean
  isDragOver?: boolean
  onDragStart?: (e: React.DragEvent, id: string) => void
  onDragOver?: (e: React.DragEvent, id: string) => void
  onDragLeave?: () => void
  onDrop?: (e: React.DragEvent, id: string) => void
  onDragEnd?: () => void
}) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false)

  return (
    <div
      data-widget-id={id}
      draggable={editable}
      onDragStart={(e) => onDragStart?.(e, id)}
      onDragOver={(e) => onDragOver?.(e, id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop?.(e, id)}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative rounded-xl border transition-all duration-300",
        "bg-card text-card-foreground",
        isDragging && "opacity-50 scale-95 shadow-lg",
        isDragOver && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        editable && "cursor-move",
        !editable && "cursor-default",
        className
      )}
      {...props}
    >
      {/* Header */}
      {(title || editable) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            {editable && dragHandle && (
              <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
                <GripVertical className="h-4 w-4" />
              </div>
            )}
            {title && (
              <h3 className="text-sm font-semibold">{title}</h3>
            )}
          </div>
          {editable && (
            <div className="relative">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>
              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-1 z-10 min-w-[120px] rounded-lg border border-border bg-card shadow-elevation-3 p-1">
                  <button
                    onClick={() => {
                      onRemove?.(id)
                      setIsMenuOpen(false)
                    }}
                    className="w-full text-left px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* Content */}
      <div className="p-4">
        {children}
      </div>
    </div>
  )
}

export { DashboardGrid, DashboardWidget }