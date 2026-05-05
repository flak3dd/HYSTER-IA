"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const pageTransitionVariants = cva(
  "transition-all duration-300 ease-in-out",
  {
    variants: {
      variant: {
        fade: "animate-fade-in",
        slideUp: "animate-slide-up",
        slideDown: "animate-slide-down",
        slideLeft: "animate-slide-left",
        slideRight: "animate-slide-right",
        scale: "animate-scale-in",
        none: "",
      },
      delay: {
        none: "delay-0",
        short: "delay-75",
        medium: "delay-150",
        long: "delay-300",
      },
    },
    defaultVariants: {
      variant: "fade",
      delay: "none",
    },
  }
)

interface PageTransitionProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  variant?: VariantProps<typeof pageTransitionVariants>["variant"]
  delay?: VariantProps<typeof pageTransitionVariants>["delay"]
  className?: string
}

function PageTransition({
  children,
  variant = "fade",
  delay = "none",
  className,
  ...props
}: PageTransitionProps) {
  return (
    <div
      className={cn(pageTransitionVariants({ variant, delay }), className)}
      {...props}
    >
      {children}
    </div>
  )
}

/* Stagger Children - Animate children with staggered delays */
interface StaggerChildrenProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  staggerDelay?: number // in milliseconds
  className?: string
}

function StaggerChildren({
  children,
  staggerDelay = 100,
  className,
  ...props
}: StaggerChildrenProps) {
  const childArray = React.Children.toArray(children)

  return (
    <div className={cn("animate-stagger-children", className)} {...props}>
      {childArray.map((child, index) => (
        <div
          key={index}
          style={{
            animationDelay: `${index * staggerDelay}ms`,
          }}
        >
          {child}
        </div>
      ))}
    </div>
  )
}

/* View Transition - For route transitions */
interface ViewTransitionProps {
  children: React.ReactNode
  className?: string
}

function ViewTransition({ children, className }: ViewTransitionProps) {
  const [isTransitioning, setIsTransitioning] = React.useState(false)

  React.useEffect(() => {
    setIsTransitioning(true)
    const timer = setTimeout(() => setIsTransitioning(false), 300)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      className={cn(
        "transition-all duration-300",
        isTransitioning ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0",
        className
      )}
    >
      {children}
    </div>
  )
}

/* Animated List - List items with staggered animation */
interface AnimatedListProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  staggerDelay?: number
  className?: string
}

function AnimatedList({
  children,
  staggerDelay = 50,
  className,
  ...props
}: AnimatedListProps) {
  return (
    <div className={cn("space-y-2", className)} {...props}>
      {React.Children.map(children, (child, index) => (
        <div
          key={index}
          className="animate-slide-up"
          style={{
            animationDelay: `${index * staggerDelay}ms`,
            animationFillMode: "both",
          }}
        >
          {child}
        </div>
      ))}
    </div>
  )
}

/* Animated Grid - Grid items with staggered animation */
interface AnimatedGridProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  staggerDelay?: number
  className?: string
}

function AnimatedGrid({
  children,
  staggerDelay = 75,
  className,
  ...props
}: AnimatedGridProps) {
  return (
    <div className={cn("grid", className)} {...props}>
      {React.Children.map(children, (child, index) => (
        <div
          key={index}
          className="animate-scale-in"
          style={{
            animationDelay: `${index * staggerDelay}ms`,
            animationFillMode: "both",
          }}
        >
          {child}
        </div>
      ))}
    </div>
  )
}

/* Fade In Up - Common animation for content */
interface FadeInUpProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  delay?: number
  duration?: number
  className?: string
}

function FadeInUp({
  children,
  delay = 0,
  duration = 300,
  className,
  ...props
}: FadeInUpProps) {
  return (
    <div
      className={cn("transition-all ease-out", className)}
      style={{
        animation: `slideUp ${duration}ms ease-out ${delay}ms both`,
      }}
      {...props}
    >
      {children}
    </div>
  )
}

/* Pulse On Mount - Pulse animation when component mounts */
interface PulseOnMountProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
}

function PulseOnMount({ children, className, ...props }: PulseOnMountProps) {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div
      className={cn(
        "transition-all duration-300",
        mounted ? "scale-100 opacity-100" : "scale-95 opacity-0",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export {
  PageTransition,
  StaggerChildren,
  ViewTransition,
  AnimatedList,
  AnimatedGrid,
  FadeInUp,
  PulseOnMount,
  pageTransitionVariants,
}