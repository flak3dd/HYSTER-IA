"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface MasonryLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  columns?: {
    xs?: number
    sm?: number
    md?: number
    lg?: number
    xl?: number
  }
  gap?: "sm" | "default" | "lg" | "xl"
  minColumnWidth?: number
}

interface MasonryItemProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
}

/* Masonry Layout - Pinterest-style layout for varying height items */
function MasonryLayout({
  children,
  columns = { xs: 1, sm: 2, md: 2, lg: 3, xl: 4 },
  gap = "default",
  minColumnWidth = 250,
  className,
  ...props
}: MasonryLayoutProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [columnCount, setColumnCount] = React.useState(1)

  const gapClasses = {
    sm: "gap-3",
    default: "gap-4",
    lg: "gap-6",
    xl: "gap-8",
  }

  // Calculate column count based on container width
  React.useEffect(() => {
    const calculateColumns = () => {
      if (!containerRef.current) return

      const containerWidth = containerRef.current.offsetWidth
      const cols = Math.floor(containerWidth / minColumnWidth)
      setColumnCount(Math.max(1, cols))
    }

    calculateColumns()
    window.addEventListener("resize", calculateColumns)
    return () => window.removeEventListener("resize", calculateColumns)
  }, [minColumnWidth])

  // Distribute items across columns
  const items = React.Children.toArray(children).filter(
    (child): child is React.ReactElement => React.isValidElement(child)
  )

  const columnItems: React.ReactElement[][] = Array.from({ length: columnCount }, () => [])

  items.forEach((item, index) => {
    const columnIndex = index % columnCount
    columnItems[columnIndex].push(item)
  })

  return (
    <div
      ref={containerRef}
      className={cn(
        "grid w-full",
        `grid-cols-${columnCount}`,
        gapClasses[gap],
        className
      )}
      {...props}
    >
      {columnItems.map((column, columnIndex) => (
        <div key={columnIndex} className="flex flex-col gap-4">
          {column.map((item, itemIndex) => (
            <div key={itemIndex} className="break-inside-avoid">
              {item}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/* Masonry Item - Individual item in masonry layout */
function MasonryItem({ children, className, ...props }: MasonryItemProps) {
  return (
    <div className={cn("w-full", className)} {...props}>
      {children}
    </div>
  )
}

/* Masonry Card - Pre-styled card for masonry layout */
interface MasonryCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
  variant?: "default" | "elevated" | "glass"
}

function MasonryCard({
  children,
  variant = "default",
  className,
  ...props
}: MasonryCardProps) {
  const variantClasses = {
    default: "bg-card border border-border",
    elevated: "bg-card border border-border shadow-elevation-2 hover:shadow-elevation-3 transition-shadow duration-300",
    glass: "glass-dark",
  }

  return (
    <div
      className={cn(
        "rounded-xl overflow-hidden",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/* Masonry Image - Image component for masonry */
interface MasonryImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  alt: string
  className?: string
}

function MasonryImage({ alt, className, ...props }: MasonryImageProps) {
  const [isLoading, setIsLoading] = React.useState(true)

  return (
    <div className="relative w-full">
      {isLoading && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}
      <img
        alt={alt}
        className={cn(
          "w-full h-auto object-cover",
          isLoading && "opacity-0",
          className
        )}
        onLoad={() => setIsLoading(false)}
        {...props}
      />
    </div>
  )
}

/* Responsive Masonry - CSS columns-based masonry for better performance */
function ResponsiveMasonry({
  children,
  columns = { xs: 1, sm: 2, md: 2, lg: 3, xl: 4 },
  gap = "default",
  className,
  ...props
}: Omit<MasonryLayoutProps, "minColumnWidth">) {
  const gapClasses = {
    sm: "gap-3",
    default: "gap-4",
    lg: "gap-6",
    xl: "gap-8",
  }

  // Build responsive column classes
  const columnClasses = Object.entries(columns)
    .map(([breakpoint, col]) => {
      const prefix = breakpoint === "xs" ? "" : `${breakpoint}:`
      return `${prefix}columns-${col}`
    })
    .join(" ")

  return (
    <div
      className={cn(
        "w-full",
        columnClasses,
        gapClasses[gap],
        "break-inside-avoid",
        className
      )}
      style={{
        columnGap: gap === "sm" ? "0.75rem" : gap === "lg" ? "1.5rem" : gap === "xl" ? "2rem" : "1rem",
      }}
      {...props}
    >
      {React.Children.map(children, (child) => (
        <div className="break-inside-avoid mb-4 last:mb-0">
          {child}
        </div>
      ))}
    </div>
  )
}

export {
  MasonryLayout,
  MasonryItem,
  MasonryCard,
  MasonryImage,
  ResponsiveMasonry,
}