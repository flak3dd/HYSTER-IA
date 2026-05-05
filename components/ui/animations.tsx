'use client'

import { cn } from '@/lib/utils'

export function AnimatedCard({ 
  children, 
  className,
  delay = 0 
}: { 
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  return (
    <div
      className={cn(
        'animate-slide-up',
        className
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

export function AnimatedBadge({ 
  children, 
  variant = 'default' 
}: { 
  children: React.ReactNode
  variant?: 'success' | 'warning' | 'error' | 'default'
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        'animate-scale-in',
        variant === 'success' && 'bg-success/10 text-success border border-success/20',
        variant === 'warning' && 'bg-warning/10 text-warning border border-warning/20',
        variant === 'error' && 'bg-destructive/10 text-destructive border border-destructive/20',
        variant === 'default' && 'bg-primary/10 text-primary border border-primary/20'
      )}
    >
      {children}
    </span>
  )
}

export function LoadingDots() {
  return (
    <div className="flex gap-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-2 w-2 rounded-full bg-current animate-pulse-subtle"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  )
}