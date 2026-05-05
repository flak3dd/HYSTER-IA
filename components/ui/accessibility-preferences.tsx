"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/* Hook to detect reduced motion preference */
function useReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false)

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    setPrefersReducedMotion(mediaQuery.matches)

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
    mediaQuery.addEventListener("change", handler)

    return () => mediaQuery.removeEventListener("change", handler)
  }, [])

  return prefersReducedMotion
}

/* Hook to detect high contrast preference */
function useHighContrast() {
  const [prefersHighContrast, setPrefersHighContrast] = React.useState(false)

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-contrast: high)")
    setPrefersHighContrast(mediaQuery.matches)

    const handler = (e: MediaQueryListEvent) => setPrefersHighContrast(e.matches)
    mediaQuery.addEventListener("change", handler)

    return () => mediaQuery.removeEventListener("change", handler)
  }, [])

  return prefersHighContrast
}

/* Hook to detect forced colors mode */
function useForcedColors() {
  const [forcedColors, setForcedColors] = React.useState(false)

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(forced-colors: active)")
    setForcedColors(mediaQuery.matches)

    const handler = (e: MediaQueryListEvent) => setForcedColors(e.matches)
    mediaQuery.addEventListener("change", handler)

    return () => mediaQuery.removeEventListener("change", handler)
  }, [])

  return forcedColors
}

/* Accessibility Preferences Context */
interface AccessibilityPreferences {
  reducedMotion: boolean
  highContrast: boolean
  forcedColors: boolean
  setReducedMotion: (value: boolean) => void
  setHighContrast: (value: boolean) => void
}

const AccessibilityPreferencesContext = React.createContext<AccessibilityPreferences | null>(null)

interface AccessibilityPreferencesProviderProps {
  children: React.ReactNode
  defaultReducedMotion?: boolean
  defaultHighContrast?: boolean
}

function AccessibilityPreferencesProvider({
  children,
  defaultReducedMotion = false,
  defaultHighContrast = false,
}: AccessibilityPreferencesProviderProps) {
  const systemReducedMotion = useReducedMotion()
  const systemHighContrast = useHighContrast()
  const systemForcedColors = useForcedColors()

  const [reducedMotion, setReducedMotion] = React.useState(
    defaultReducedMotion || systemReducedMotion
  )
  const [highContrast, setHighContrast] = React.useState(
    defaultHighContrast || systemHighContrast
  )

  const value: AccessibilityPreferences = {
    reducedMotion,
    highContrast,
    forcedColors: systemForcedColors,
    setReducedMotion,
    setHighContrast,
  }

  return (
    <AccessibilityPreferencesContext.Provider value={value}>
      {children}
    </AccessibilityPreferencesContext.Provider>
  )
}

function useAccessibilityPreferences() {
  const context = React.useContext(AccessibilityPreferencesContext)
  if (!context) {
    throw new Error(
      "useAccessibilityPreferences must be used within AccessibilityPreferencesProvider"
    )
  }
  return context
}

/* Conditional Animation Wrapper */
interface ConditionalAnimationProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  className?: string
}

function ConditionalAnimation({
  children,
  fallback = <>{children}</>,
  className,
}: ConditionalAnimationProps) {
  const { reducedMotion } = useAccessibilityPreferences()

  if (reducedMotion) {
    return <div className={className}>{fallback}</div>
  }

  return <div className={className}>{children}</div>
}

/* Skip to Content Link with Accessibility */
interface SkipToContentProps {
  href: string
  children: React.ReactNode
  className?: string
}

function SkipToContent({ href, children, className }: SkipToContentProps) {
  return (
    <a
      href={href}
      className={cn(
        "sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50",
        "focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground",
        "focus:rounded-lg focus:font-medium focus:outline-none focus:ring-2 focus:ring-ring",
        "transition-colors duration-200",
        className
      )}
    >
      {children}
    </a>
  )
}

/* Font Size Provider - For text scaling */
interface FontSizeProviderProps {
  children: React.ReactNode
  defaultSize?: "sm" | "default" | "lg" | "xl"
}

const FontSizeContext = React.createContext<{
  fontSize: "sm" | "default" | "lg" | "xl"
  setFontSize: (size: "sm" | "default" | "lg" | "xl") => void
} | null>(null)

function FontSizeProvider({
  children,
  defaultSize = "default",
}: FontSizeProviderProps) {
  const [fontSize, setFontSize] = React.useState<"sm" | "default" | "lg" | "xl">(defaultSize)

  const fontSizeClasses = {
    sm: "text-sm",
    default: "text-base",
    lg: "text-lg",
    xl: "text-xl",
  }

  return (
    <FontSizeContext.Provider value={{ fontSize, setFontSize }}>
      <div className={fontSizeClasses[fontSize]}>
        {children}
      </div>
    </FontSizeContext.Provider>
  )
}

function useFontSize() {
  const context = React.useContext(FontSizeContext)
  if (!context) {
    throw new Error("useFontSize must be used within FontSizeProvider")
  }
  return context
}

/* Accessibility Settings Panel */
interface AccessibilitySettingsProps {
  className?: string
}

function AccessibilitySettings({ className }: AccessibilitySettingsProps) {
  const {
    reducedMotion,
    highContrast,
    setReducedMotion,
    setHighContrast,
  } = useAccessibilityPreferences()
  const { fontSize, setFontSize } = useFontSize()

  return (
    <div className={cn("space-y-4 p-4", className)}>
      <h3 className="text-heading-md">Accessibility Settings</h3>

      <div className="space-y-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(e) => setReducedMotion(e.target.checked)}
            className="rounded"
          />
          <span className="text-body-sm">Reduce motion</span>
        </label>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={highContrast}
            onChange={(e) => setHighContrast(e.target.checked)}
            className="rounded"
          />
          <span className="text-body-sm">High contrast</span>
        </label>
      </div>

      <div className="space-y-2">
        <label className="text-body-sm">Font size</label>
        <div className="flex gap-2">
          {(["sm", "default", "lg", "xl"] as const).map((size) => (
            <button
              key={size}
              onClick={() => setFontSize(size)}
              className={cn(
                "px-3 py-1 rounded text-sm",
                fontSize === size
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              )}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export {
  useReducedMotion,
  useHighContrast,
  useForcedColors,
  AccessibilityPreferencesProvider,
  useAccessibilityPreferences,
  ConditionalAnimation,
  SkipToContent,
  FontSizeProvider,
  useFontSize,
  AccessibilitySettings,
}