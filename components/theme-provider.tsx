"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"

type Theme = "light" | "dark" | "system"

type ThemeProviderContextValue = {
  theme: Theme
  resolvedTheme: "light" | "dark"
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeProviderContextValue>({
  theme: "dark",
  resolvedTheme: "dark",
  setTheme: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark")
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark")

  const applyTheme = useCallback((t: Theme) => {
    const root = document.documentElement
    let resolved: "light" | "dark"

    if (t === "system") {
      resolved = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    } else {
      resolved = t
    }

    root.classList.toggle("dark", resolved === "dark")
    setResolvedTheme(resolved)
  }, [])

  const setTheme = useCallback(
    (t: Theme) => {
      setThemeState(t)
      localStorage.setItem("dpanel-theme", t)
      applyTheme(t)
    },
    [applyTheme],
  )

  useEffect(() => {
    const stored = localStorage.getItem("dpanel-theme") as Theme | null
    const initial = stored ?? "dark"
    setThemeState(initial)
    applyTheme(initial)

    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => {
      if (theme === "system") applyTheme("system")
    }
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [applyTheme, theme])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
