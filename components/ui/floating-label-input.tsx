"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface FloatingLabelInputProps
  extends Omit<React.ComponentProps<"input">, "id" | "value"> {
  label: string
  id: string
  value?: string
  error?: string
  helperText?: string
}

function FloatingLabelInput({
  label,
  id,
  value = "",
  error,
  helperText,
  className,
  type = "text",
  ...props
}: FloatingLabelInputProps) {
  const [isFocused, setIsFocused] = React.useState(false)
  const hasValue = value.length > 0

  return (
    <div className="relative">
      <input
        type={type}
        id={id}
        value={value}
        className={cn(
          "peer h-10 w-full rounded-lg border border-input bg-background px-3 pt-4 pb-1 text-sm transition-all duration-200 outline-none",
          "placeholder:text-transparent",
          "focus:border-ring focus:ring-3 focus:ring-ring/50",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50",
          error && "border-destructive focus:border-destructive focus:ring-destructive/20",
          "dark:bg-input/30 dark:disabled:bg-input/80",
          className
        )}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : helperText ? `${id}-helper` : undefined}
        {...props}
      />
      <label
        htmlFor={id}
        className={cn(
          "absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground transition-all duration-200 pointer-events-none",
          "peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm",
          "peer-focus:top-2 peer-focus:-translate-y-0 peer-focus:text-xs",
          "peer-focus:text-foreground",
          hasValue && "top-2 -translate-y-0 text-xs",
          hasValue && "text-foreground",
          error && "peer-focus:text-destructive",
          error && hasValue && "text-destructive"
        )}
      >
        {label}
      </label>
      {(error || helperText) && (
        <p
          id={error ? `${id}-error` : `${id}-helper`}
          className={cn(
            "mt-1.5 text-xs",
            error ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {error || helperText}
        </p>
      )}
    </div>
  )
}

export { FloatingLabelInput }