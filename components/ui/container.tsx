import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const containerVariants = cva(
  "w-full mx-auto",
  {
    variants: {
      size: {
        xs: "max-w-xs",
        sm: "max-w-sm",
        md: "max-w-md",
        lg: "max-w-lg",
        xl: "max-w-xl",
        "2xl": "max-w-2xl",
        "3xl": "max-w-3xl",
        "4xl": "max-w-4xl",
        "5xl": "max-w-5xl",
        "6xl": "max-w-6xl",
        "7xl": "max-w-7xl",
        full: "max-w-full",
        screen: "max-w-screen-xl",
      },
      padding: {
        none: "px-0",
        sm: "px-4 sm:px-6",
        default: "px-4 sm:px-6 lg:px-8",
        lg: "px-6 sm:px-8 lg:px-12",
        xl: "px-8 sm:px-12 lg:px-16",
      },
    },
    defaultVariants: {
      size: "7xl",
      padding: "default",
    },
  }
)

interface ContainerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof containerVariants> {
  asChild?: boolean
}

function Container({
  className,
  size,
  padding,
  asChild = false,
  ...props
}: ContainerProps) {
  const Comp = asChild ? React.Fragment : "div"

  if (asChild) {
    return <>{props.children}</>
  }

  return (
    <div
      className={cn(containerVariants({ size, padding }), className)}
      {...props}
    />
  )
}

/* Responsive Section - For section-level containers */
interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  size?: VariantProps<typeof containerVariants>["size"]
  padding?: VariantProps<typeof containerVariants>["padding"]
  background?: "default" | "muted" | "accent" | "transparent"
}

function Section({
  className,
  size = "7xl",
  padding = "default",
  background = "default",
  ...props
}: SectionProps) {
  const backgroundClasses = {
    default: "bg-background",
    muted: "bg-muted/30",
    accent: "bg-accent/30",
    transparent: "bg-transparent",
  }

  return (
    <section
      className={cn(
        "w-full",
        backgroundClasses[background],
        className
      )}
    >
      <Container size={size} padding={padding}>
        {props.children}
      </Container>
    </section>
  )
}

/* Responsive Grid - For grid layouts with breakpoints */
interface ResponsiveGridProps extends React.HTMLAttributes<HTMLDivElement> {
  cols?: {
    xs?: number
    sm?: number
    md?: number
    lg?: number
    xl?: number
    "2xl"?: number
  }
  gap?: "sm" | "default" | "lg" | "xl"
}

function ResponsiveGrid({
  cols = { xs: 1, sm: 2, md: 2, lg: 3, xl: 4 },
  gap = "default",
  className,
  ...props
}: ResponsiveGridProps) {
  const gapClasses = {
    sm: "gap-3",
    default: "gap-4",
    lg: "gap-6",
    xl: "gap-8",
  }

  const gridClasses = Object.entries(cols)
    .map(([breakpoint, col]) => {
      const prefix = breakpoint === "xs" ? "" : `${breakpoint}:`
      return `${prefix}grid-cols-${col}`
    })
    .join(" ")

  return (
    <div
      className={cn(
        "grid",
        gridClasses,
        gapClasses[gap],
        className
      )}
      {...props}
    />
  )
}

/* Responsive Flex - For flex layouts with breakpoints */
interface ResponsiveFlexProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: {
    xs?: "row" | "col"
    sm?: "row" | "col"
    md?: "row" | "col"
    lg?: "row" | "col"
  }
  align?: "start" | "center" | "end" | "stretch"
  justify?: "start" | "center" | "end" | "between" | "around"
  gap?: "sm" | "default" | "lg" | "xl"
  wrap?: boolean
}

function ResponsiveFlex({
  direction = { xs: "col", sm: "row" },
  align = "start",
  justify = "start",
  gap = "default",
  wrap = false,
  className,
  ...props
}: ResponsiveFlexProps) {
  const gapClasses = {
    sm: "gap-3",
    default: "gap-4",
    lg: "gap-6",
    xl: "gap-8",
  }

  const directionClasses = Object.entries(direction)
    .map(([breakpoint, dir]) => {
      const prefix = breakpoint === "xs" ? "" : `${breakpoint}:`
      return `${prefix}flex-${dir}`
    })
    .join(" ")

  return (
    <div
      className={cn(
        "flex",
        directionClasses,
        `items-${align}`,
        `justify-${justify}`,
        wrap && "flex-wrap",
        gapClasses[gap],
        className
      )}
      {...props}
    />
  )
}

export {
  Container,
  Section,
  ResponsiveGrid,
  ResponsiveFlex,
  containerVariants,
}