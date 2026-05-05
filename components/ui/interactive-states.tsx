import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const interactiveVariants = cva(
  "transition-all duration-200 ease-out",
  {
    variants: {
      hover: {
        none: "",
        lift: "hover:-translate-y-0.5 hover:shadow-elevation-3",
        scale: "hover:scale-105",
        glow: "hover:shadow-primary-glow",
        background: "hover:bg-muted/50",
        border: "hover:border-primary",
        brightness: "hover:brightness-110",
        opacity: "hover:opacity-90",
      },
      focus: {
        none: "",
        ring: "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        outline: "focus-visible:outline-2 focus-visible:outline-ring",
        glow: "focus-visible:shadow-primary-glow",
      },
      active: {
        none: "",
        scale: "active:scale-95",
        press: "active:translate-y-0.5",
      },
    },
    defaultVariants: {
      hover: "none",
      focus: "none",
      active: "none",
    },
  }
)

interface InteractiveProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  hover?: VariantProps<typeof interactiveVariants>["hover"]
  focus?: VariantProps<typeof interactiveVariants>["focus"]
  active?: VariantProps<typeof interactiveVariants>["active"]
  className?: string
}

/* Interactive Wrapper - Apply hover/focus/active states to any element */
function Interactive({
  children,
  hover = "none",
  focus = "none",
  active = "none",
  className,
  ...props
}: InteractiveProps) {
  return (
    <div className={cn(interactiveVariants({ hover, focus, active }), className)} {...props}>
      {children}
    </div>
  )
}

/* Hover Card - Card with hover lift effect */
interface HoverCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  lift?: boolean
  glow?: boolean
  className?: string
}

function HoverCard({ children, lift = true, glow = false, className, ...props }: HoverCardProps) {
  return (
    <div
      className={cn(
        "transition-all duration-200 ease-out",
        lift && "hover:-translate-y-0.5 hover:shadow-elevation-3",
        glow && "hover:shadow-primary-glow",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/* Focus Ring - Element with focus ring */
interface FocusRingProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  ringColor?: "primary" | "success" | "warning" | "critical"
  className?: string
}

function FocusRing({ children, ringColor = "primary", className, ...props }: FocusRingProps) {
  const ringColors = {
    primary: "focus-visible:ring-primary",
    success: "focus-visible:ring-success",
    warning: "focus-visible:ring-warning",
    critical: "focus-visible:ring-critical",
  }

  return (
    <div
      className={cn(
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        ringColors[ringColor],
        className
      )}
      tabIndex={0}
      {...props}
    >
      {children}
    </div>
  )
}

/* Pressable - Element with press/scale effect */
interface PressableProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  scale?: boolean
  translate?: boolean
  className?: string
}

function Pressable({ children, scale = true, translate = false, className, ...props }: PressableProps) {
  return (
    <div
      className={cn(
        "transition-all duration-100 ease-out active:duration-75",
        scale && "active:scale-95",
        translate && "active:translate-y-0.5",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/* Ripple Effect - Material Design ripple on click */
interface RippleEffectProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  color?: "primary" | "success" | "warning" | "critical"
  className?: string
}

function RippleEffect({ children, color = "primary", className, ...props }: RippleEffectProps) {
  const [ripples, setRipples] = React.useState<Array<{ id: number; x: number; y: number }>>([])

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const newRipple = {
      id: Date.now(),
      x,
      y,
    }

    setRipples((prev) => [...prev, newRipple])

    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== newRipple.id))
    }, 600)
  }

  const rippleColors = {
    primary: "bg-primary/30",
    success: "bg-success/30",
    warning: "bg-warning/30",
    critical: "bg-critical/30",
  }

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      onClick={handleClick}
      {...props}
    >
      {children}
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className={cn(
            "absolute rounded-full animate-ping",
            rippleColors[color],
            "pointer-events-none"
          )}
          style={{
            left: ripple.x,
            top: ripple.y,
            width: 0,
            height: 0,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </div>
  )
}

/* Shimmer Effect - Shimmer animation on hover */
interface ShimmerEffectProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
}

function ShimmerEffect({ children, className, ...props }: ShimmerEffectProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden",
        "group",
        className
      )}
      {...props}
    >
      <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>
      {children}
    </div>
  )
}

/* Magnetic Button - Button that follows cursor slightly */
interface MagneticButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  strength?: number
  className?: string
}

function MagneticButton({ children, strength = 20, className, ...props }: MagneticButtonProps) {
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const [transform, setTransform] = React.useState({ x: 0, y: 0 })

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!buttonRef.current) return

    const rect = buttonRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left - rect.width / 2
    const y = e.clientY - rect.top - rect.height / 2

    setTransform({
      x: (x / rect.width) * strength,
      y: (y / rect.height) * strength,
    })
  }

  const handleMouseLeave = () => {
    setTransform({ x: 0, y: 0 })
  }

  return (
    <button
      ref={buttonRef}
      className={cn(
        "transition-transform duration-200 ease-out",
        className
      )}
      style={{
        transform: `translate(${transform.x}px, ${transform.y}px)`,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      {children}
    </button>
  )
}

/* Hover Glow - Element with glow on hover */
interface HoverGlowProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  color?: "primary" | "success" | "warning" | "critical"
  intensity?: "subtle" | "medium" | "strong"
  className?: string
}

function HoverGlow({ children, color = "primary", intensity = "medium", className, ...props }: HoverGlowProps) {
  const glowColors = {
    primary: {
      subtle: "hover:shadow-primary",
      medium: "hover:shadow-primary-glow",
      strong: "hover:shadow-[0_0_30px_rgba(13,148,136,0.5)]",
    },
    success: {
      subtle: "hover:shadow-success",
      medium: "hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]",
      strong: "hover:shadow-[0_0_30px_rgba(16,185,129,0.6)]",
    },
    warning: {
      subtle: "hover:shadow-warning",
      medium: "hover:shadow-[0_0_20px_rgba(245,158,11,0.4)]",
      strong: "hover:shadow-[0_0_30px_rgba(245,158,11,0.6)]",
    },
    critical: {
      subtle: "hover:shadow-critical",
      medium: "hover:shadow-[0_0_20px_rgba(220,38,38,0.4)]",
      strong: "hover:shadow-[0_0_30px_rgba(220,38,38,0.6)]",
    },
  }

  return (
    <div
      className={cn(
        "transition-shadow duration-300",
        glowColors[color][intensity],
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export {
  Interactive,
  HoverCard,
  FocusRing,
  Pressable,
  RippleEffect,
  ShimmerEffect,
  MagneticButton,
  HoverGlow,
  interactiveVariants,
}