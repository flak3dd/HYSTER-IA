 "use client"

// import { useTheme } from "next-themes"

import { Toaster as Sonner } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = "system" as const

  return (
    <Sonner
      theme={theme}
      className={cn("toaster group")}
      icons={{
        success: <CircleCheckIcon className="h-4 w-4" />,
        info: <InfoIcon className="h-4 w-4" />,
        warning: <TriangleAlertIcon className="h-4 w-4" />,
        error: <OctagonXIcon className="h-4 w-4" />,
        loading: <Loader2Icon className="h-4 w-4 animate-spin" />,
      }}
      style={{
        "--brand": "hsl(var(--primary))",
        "--moderate-low": "hsl(var(--muted))",
        "--height": "60px"
      } as React.CSSProperties}
      {...props}
    />
  )
}

export { Toaster } 
