"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { CheckCircle2, Sparkles, Trophy, Star } from "lucide-react"
import { Button } from "@/components/ui/button"

/* Success Checkmark Animation */
interface SuccessCheckmarkProps {
  size?: "sm" | "default" | "lg" | "xl"
  className?: string
}

function SuccessCheckmark({ size = "default", className }: SuccessCheckmarkProps) {
  const sizeClasses = {
    sm: "h-8 w-8",
    default: "h-12 w-12",
    lg: "h-16 w-16",
    xl: "h-24 w-24",
  }

  return (
    <div className={cn("relative", sizeClasses[size], className)}>
      <div className="absolute inset-0 rounded-full bg-success/20 animate-ping" />
      <div className="relative flex items-center justify-center h-full w-full rounded-full bg-success text-success-foreground">
        <CheckCircle2 className={cn("animate-scale-in", size === "xl" ? "h-12 w-12" : "h-6 w-6")} />
      </div>
    </div>
  )
}

/* Confetti Animation */
interface ConfettiProps {
  count?: number
  duration?: number
  className?: string
}

function Confetti({ count = 50, duration = 3000, className }: ConfettiProps) {
  const [particles, setParticles] = React.useState<Array<{
    id: number
    x: number
    y: number
    rotation: number
    color: string
    delay: number
  }>>([])

  React.useEffect(() => {
    const colors = [
      "bg-primary",
      "bg-success",
      "bg-warning",
      "bg-info",
      "bg-pending",
    ]

    const newParticles = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: -20 - Math.random() * 50,
      rotation: Math.random() * 360,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 500,
    }))

    setParticles(newParticles)

    const timer = setTimeout(() => setParticles([]), duration + 500)
    return () => clearTimeout(timer)
  }, [count, duration])

  return (
    <div className={cn("fixed inset-0 pointer-events-none overflow-hidden z-50", className)}>
      {particles.map((particle) => (
        <div
          key={particle.id}
          className={cn(
            "absolute w-2 h-2 rounded-full",
            particle.color,
            "animate-fall"
          )}
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            transform: `rotate(${particle.rotation}deg)`,
            animationDelay: `${particle.delay}ms`,
            animationDuration: `${duration}ms`,
          }}
        />
      ))}
    </div>
  )
}

/* Sparkle Effect */
interface SparkleEffectProps {
  children: React.ReactNode
  trigger?: boolean
  className?: string
}

function SparkleEffect({ children, trigger = false, className }: SparkleEffectProps) {
  const [showSparkles, setShowSparkles] = React.useState(false)

  React.useEffect(() => {
    if (trigger) {
      setShowSparkles(true)
      const timer = setTimeout(() => setShowSparkles(false), 1000)
      return () => clearTimeout(timer)
    }
  }, [trigger])

  return (
    <div className={cn("relative inline-block", className)}>
      {children}
      {showSparkles && (
        <>
          <Sparkles className="absolute -top-2 -left-2 h-4 w-4 text-yellow-400 animate-ping" />
          <Sparkles className="absolute -top-2 -right-2 h-4 w-4 text-yellow-400 animate-ping" style={{ animationDelay: "100ms" }} />
          <Sparkles className="absolute -bottom-2 -left-2 h-4 w-4 text-yellow-400 animate-ping" style={{ animationDelay: "200ms" }} />
          <Sparkles className="absolute -bottom-2 -right-2 h-4 w-4 text-yellow-400 animate-ping" style={{ animationDelay: "300ms" }} />
        </>
      )}
    </div>
  )
}

/* Trophy Animation */
interface TrophyAnimationProps {
  size?: "sm" | "default" | "lg"
  className?: string
}

function TrophyAnimation({ size = "default", className }: TrophyAnimationProps) {
  const sizeClasses = {
    sm: "h-8 w-8",
    default: "h-12 w-12",
    lg: "h-20 w-20",
  }

  return (
    <div className={cn("relative", sizeClasses[size], className)}>
      <div className="absolute inset-0 rounded-full bg-yellow-400/20 animate-ping" />
      <div className="relative flex items-center justify-center h-full w-full rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 text-white">
        <Trophy className={cn("animate-bounce", size === "lg" ? "h-10 w-10" : "h-6 w-6")} />
      </div>
    </div>
  )
}

/* Star Rating Animation */
interface StarRatingProps {
  rating: number
  max?: number
  size?: "sm" | "default" | "lg"
  animate?: boolean
  className?: string
}

function StarRating({ rating, max = 5, size = "default", animate = true, className }: StarRatingProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    default: "h-5 w-5",
    lg: "h-6 w-6",
  }

  return (
    <div className={cn("flex gap-1", className)}>
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            sizeClasses[size],
            i < rating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground",
            animate && i < rating && "animate-scale-in"
          )}
          style={{
            animationDelay: animate ? `${i * 100}ms` : undefined,
            animationFillMode: animate ? "both" : undefined,
          }}
        />
      ))}
    </div>
  )
}

/* Success Banner */
interface SuccessBannerProps {
  message: string
  description?: string
  onClose?: () => void
  className?: string
}

function SuccessBanner({ message, description, onClose, className }: SuccessBannerProps) {
  return (
    <div className={cn(
      "flex items-start gap-3 p-4 rounded-lg bg-success/10 border border-success/20 animate-slide-down",
      className
    )}>
      <CheckCircle2 className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium text-success-foreground">{message}</p>
        {description && (
          <p className="text-xs text-success-foreground/80 mt-1">{description}</p>
        )}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-success-foreground/60 hover:text-success-foreground transition-colors"
        >
          ×
        </button>
      )}
    </div>
  )
}

/* Pulse Success - Pulsing success indicator */
interface PulseSuccessProps {
  children: React.ReactNode
  className?: string
}

function PulseSuccess({ children, className }: PulseSuccessProps) {
  return (
    <div className={cn("relative", className)}>
      <div className="absolute inset-0 rounded-full bg-success/30 animate-ping" />
      <div className="relative">{children}</div>
    </div>
  )
}

/* Celebration Modal - Full-screen celebration */
interface CelebrationModalProps {
  show: boolean
  onClose: () => void
  title?: string
  message?: string
  action?: {
    label: string
    onClick: () => void
  }
}

function CelebrationModal({
  show,
  onClose,
  title = "Success!",
  message = "Your action was completed successfully.",
  action,
}: CelebrationModalProps) {
  if (!show) return null

  return (
    <>
      <Confetti />
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
        <div className="bg-card rounded-xl p-8 max-w-md w-full mx-4 shadow-elevation-5 animate-scale-in text-center">
          <div className="flex justify-center mb-6">
            <SuccessCheckmark size="xl" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">{title}</h2>
          <p className="text-muted-foreground mb-6">{message}</p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {action && (
              <Button onClick={action.onClick}>
                {action.label}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export {
  SuccessCheckmark,
  Confetti,
  SparkleEffect,
  TrophyAnimation,
  StarRating,
  SuccessBanner,
  PulseSuccess,
  CelebrationModal,
}