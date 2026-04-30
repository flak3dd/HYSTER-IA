"use client"

import React from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { Moon, Sun, Monitor, LogOut, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useTheme } from "@/components/theme-provider"
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

/* ------------------------------------------------------------------ */
/*  Breadcrumb logic                                                   */
/* ------------------------------------------------------------------ */

const LABEL_MAP: Record<string, string> = {
  admin: "Command Center",
  nodes: "Nodes",
  configs: "Configs",
  ai: "AI Assistant",
  agents: "Agents",
  analytics: "Analytics",
  coordination: "Team Ops",
  forensics: "Anti-Forensics",
  infrastructure: "Deployment",
  lotl: "LotL Arsenal",
  mail: "Mail Ops",
  migrator: "Migrator",
  network: "Network Map",
  osint: "OSINT",
  payloads: "Payloads",
  profiles: "Profiles",
  reports: "Reports",
  settings: "Settings",
  threat: "Threat Intel",
  transport: "Protocols",
  workflow: "Workflow",
  "config-audit": "Config Audit",
}

function useBreadcrumbs() {
  const pathname = usePathname()
  if (!pathname) return []

  const segments = pathname.split("/").filter(Boolean)
  const crumbs: { label: string; href: string; isLast: boolean }[] = []

  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i]
    const href = "/" + segments.slice(0, i + 1).join("/")
    const label = LABEL_MAP[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1)
    crumbs.push({ label, href, isLast: i === segments.length - 1 })
  }

  return crumbs
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

type AdminHeaderProps = {
  username: string
  role: string
}

export function AdminHeader({ username, role }: AdminHeaderProps) {
  const { theme, setTheme } = useTheme()
  const crumbs = useBreadcrumbs()
  const router = useRouter()
  const [signingOut, startTransition] = useTransition()

  const initials = username
    .split(/[\s._-]/)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2)

  function handleSignOut() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/logout", { method: "POST" })
        if (!res.ok) {
          toast.error("Sign-out failed")
          return
        }
        router.replace("/login")
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Sign-out failed")
      }
    })
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6">
      {/* Left: Breadcrumbs */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              render={<Link href="/admin" />}
              className="text-caption text-muted-foreground hover:text-foreground"
            >
              Command Center
            </BreadcrumbLink>
          </BreadcrumbItem>
          {crumbs.map((crumb) => (
            <React.Fragment key={crumb.href}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {crumb.isLast ? (
                  <BreadcrumbPage className="text-caption font-medium">
                    {crumb.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    render={<Link href={crumb.href} />}
                    className="text-caption text-muted-foreground hover:text-foreground"
                  >
                    {crumb.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      {/* Right: Theme + User */}
      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-xs" className="text-muted-foreground">
                {theme === "dark" ? (
                  <Moon className="h-3.5 w-3.5" />
                ) : theme === "light" ? (
                  <Sun className="h-3.5 w-3.5" />
                ) : (
                  <Monitor className="h-3.5 w-3.5" />
                )}
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme("light")}>
              <Sun className="h-3.5 w-3.5" />
              Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              <Moon className="h-3.5 w-3.5" />
              Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              <Monitor className="h-3.5 w-3.5" />
              System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground pl-2 pr-2.5">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-micro bg-primary/10 text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="text-caption hidden sm:inline">{username}</span>
                <span className="text-micro rounded-md bg-muted px-1.5 py-0.5 hidden sm:inline">
                  {role}
                </span>
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>
              <div className="text-body-sm font-medium">{username}</div>
              <div className="text-caption text-muted-foreground">{role}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={<Link href="/admin/settings" />}
            >
              <Settings className="h-3.5 w-3.5" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              disabled={signingOut}
              variant="destructive"
            >
              <LogOut className="h-3.5 w-3.5" />
              {signingOut ? "Signing out..." : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
