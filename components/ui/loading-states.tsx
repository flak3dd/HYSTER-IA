'use client'

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoadingOverlayProps {
  isLoading: boolean
  message?: string
  size?: 'sm' | 'md' | 'lg'
}

export function LoadingOverlay({ 
  isLoading, 
  message = 'Loading...', 
  size = 'md' 
}: LoadingOverlayProps) {
  if (!isLoading) return null
  
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  }
  
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className={cn('animate-spin text-primary', sizeClasses[size])} />
        <p className="text-body-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}

export function InlineLoading({ 
  isLoading, 
  message 
}: { 
  isLoading: boolean
  message?: string 
}) {
  if (!isLoading) return null
  
  return (
    <div className="flex items-center gap-2 text-muted-foreground animate-fade-in">
      <Loader2 className="h-4 w-4 animate-spin" />
      {message && <span className="text-sm">{message}</span>}
    </div>
  )
}

export function ButtonLoading({ 
  isLoading, 
  children, 
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { 
  isLoading?: boolean 
}) {
  return (
    <button
      {...props}
      disabled={isLoading || props.disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 transition-all-smooth',
        props.className
      )}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}