"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/* Lazy Component - Lazy load React components */
interface LazyComponentProps {
  component: React.LazyExoticComponent<React.ComponentType<any>>
  fallback?: React.ReactNode
  props?: any
}

function LazyComponent({ component: Component, fallback = <div>Loading...</div>, props }: LazyComponentProps) {
  return (
    <React.Suspense fallback={fallback}>
      <Component {...props} />
    </React.Suspense>
  )
}

/* Lazy Image - Lazy load images with blur effect */
interface LazyImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src: string
  alt: string
  width?: number
  height?: number
  placeholder?: "blur" | "empty"
  className?: string
}

function LazyImage({
  src,
  alt,
  width,
  height,
  placeholder = "blur",
  className,
  ...props
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = React.useState(false)
  const [isInView, setIsInView] = React.useState(false)
  const imgRef = React.useRef<HTMLImageElement>(null)

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )

    if (imgRef.current) {
      observer.observe(imgRef.current)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={imgRef}
      className={cn("relative overflow-hidden", className)}
      style={{ width, height }}
    >
      {placeholder === "blur" && !isLoaded && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}
      {isInView && (
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          className={cn(
            "transition-opacity duration-300",
            isLoaded ? "opacity-100" : "opacity-0"
          )}
          onLoad={() => setIsLoaded(true)}
          loading="lazy"
          {...props}
        />
      )}
    </div>
  )
}

/* Virtual List - Efficiently render large lists */
interface VirtualListProps<T> {
  items: T[]
  itemHeight: number
  containerHeight: number
  renderItem: (item: T, index: number) => React.ReactNode
  overscan?: number
  className?: string
}

function VirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 5,
  className,
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = React.useState(0)
  const containerRef = React.useRef<HTMLDivElement>(null)

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
  const endIndex = Math.min(
    items.length - 1,
    Math.floor((scrollTop + containerHeight) / itemHeight) + overscan
  )

  const visibleItems = items.slice(startIndex, endIndex + 1)
  const offsetY = startIndex * itemHeight

  return (
    <div
      ref={containerRef}
      className={cn("overflow-auto", className)}
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: items.length * itemHeight, position: "relative" }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, index) => (
            <div key={startIndex + index} style={{ height: itemHeight }}>
              {renderItem(item, startIndex + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* Code Split Helper - Dynamic import with error boundary */
interface CodeSplitProps {
  importFn: () => Promise<{ default: React.ComponentType<any> }>
  fallback?: React.ReactNode
  errorFallback?: React.ReactNode
  props?: any
}

function CodeSplit({
  importFn,
  fallback = <div>Loading...</div>,
  errorFallback = <div>Error loading component</div>,
  props,
}: CodeSplitProps) {
  const [Component, setComponent] = React.useState<React.ComponentType<any> | null>(null)
  const [error, setError] = React.useState<Error | null>(null)

  React.useEffect(() => {
    importFn()
      .then((module) => setComponent(() => module.default))
      .catch((err) => setError(err))
  }, [importFn])

  if (error) return <>{errorFallback}</>
  if (!Component) return <>{fallback}</>
  return <Component {...props} />
}

/* Debounced Component - Debounce rapid updates */
interface DebouncedComponentProps {
  children: React.ReactNode
  delay?: number
  className?: string
}

function DebouncedComponent({ children, delay = 300, className }: DebouncedComponentProps) {
  const [debouncedChildren, setDebouncedChildren] = React.useState(children)
  const timeoutRef = React.useRef<NodeJS.Timeout | undefined>(undefined)

  React.useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = setTimeout(() => {
      setDebouncedChildren(children)
    }, delay)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [children, delay])

  return <div className={className}>{debouncedChildren}</div>
}

/* Memo Component - Memoize expensive renders */
interface MemoComponentProps<T> {
  data: T
  render: (data: T) => React.ReactNode
  className?: string
}

function MemoComponent<T>({ data, render, className }: MemoComponentProps<T>) {
  const memoizedRender = React.useMemo(() => render(data), [data, render])
  return <div className={className}>{memoizedRender}</div>
}

/* Request Idle Callback - Run tasks during browser idle time */
function useRequestIdleCallback(
  callback: () => void,
  deps: React.DependencyList = []
) {
  React.useEffect(() => {
    const idleCallbackId = requestIdleCallback(() => {
      callback()
    })

    return () => {
      if (idleCallbackId) {
        cancelIdleCallback(idleCallbackId)
      }
    }
  }, deps)
}

/* Resource Hinting - Preload and prefetch resources */
interface ResourceHintProps {
  href: string
  as: "script" | "style" | "font" | "image"
  type?: string
  crossOrigin?: string
  rel: "preload" | "prefetch" | "preconnect"
}

function ResourceHint({ href, as, type, crossOrigin, rel }: ResourceHintProps) {
  React.useEffect(() => {
    const link = document.createElement("link")
    link.href = href
    link.rel = rel
    link.as = as

    if (type) link.type = type
    if (crossOrigin) link.crossOrigin = crossOrigin

    document.head.appendChild(link)

    return () => {
      document.head.removeChild(link)
    }
  }, [href, as, type, crossOrigin, rel])

  return null
}

/* Performance Monitor - Monitor component render performance */
interface PerformanceMonitorProps {
  componentName: string
  children: React.ReactNode
  onRender?: (duration: number) => void
}

function PerformanceMonitor({ componentName, children, onRender }: PerformanceMonitorProps) {
  const renderStart = React.useRef<number>(0)

  React.useEffect(() => {
    renderStart.current = performance.now()
  })

  React.useEffect(() => {
    const renderDuration = performance.now() - renderStart.current
    onRender?.(renderDuration)

    if (process.env.NODE_ENV === "development") {
      console.log(`[Performance] ${componentName} rendered in ${renderDuration.toFixed(2)}ms`)
    }
  })

  return <>{children}</>
}

/* Optimized Image - Next.js Image optimization wrapper */
interface OptimizedImageProps {
  src: string
  alt: string
  width?: number
  height?: number
  priority?: boolean
  className?: string
}

function OptimizedImage({ src, alt, width, height, priority = false, className }: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = React.useState(false)

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {!isLoaded && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? "eager" : "lazy"}
        className={cn(
          "transition-opacity duration-300",
          isLoaded ? "opacity-100" : "opacity-0"
        )}
        onLoad={() => setIsLoaded(true)}
      />
    </div>
  )
}

export {
  LazyComponent,
  LazyImage,
  VirtualList,
  CodeSplit,
  DebouncedComponent,
  MemoComponent,
  useRequestIdleCallback,
  ResourceHint,
  PerformanceMonitor,
  OptimizedImage,
}