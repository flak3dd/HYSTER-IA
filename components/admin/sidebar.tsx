"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Search,
  Globe,
  Network,
  ShieldAlert,
  Server,
  Radio,
  FileCode,
  Rocket,
  Crosshair,
  Sword,
  UserCircle,
  Mail,
  ArrowRightLeft,
  Users,
  Fingerprint,
  Cpu,
  Workflow,
  BarChart3,
  FileText,
  Settings,
  ChevronDown,
  ChevronRight,
  Zap,
  Activity,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
} from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { LucideIcon } from "lucide-react"

/* ------------------------------------------------------------------ */
/*  Workflow stages with their modules                                 */
/* ------------------------------------------------------------------ */

type Module = {
  href: string
  label: string
  shortDesc: string
  icon: LucideIcon
}

type WorkflowStage = {
  id: string
  label: string
  icon: LucideIcon
  accentClass: string
  dotClass: string
  modules: Module[]
}

const WORKFLOW_STAGES: WorkflowStage[] = [
  {
    id: "recon",
    label: "Recon",
    icon: Search,
    accentClass: "text-blue-400",
    dotClass: "bg-blue-400",
    modules: [
      { href: "/admin/osint", label: "OSINT", shortDesc: "Intelligence gathering", icon: Globe },
      { href: "/admin/network", label: "Network Map", shortDesc: "Passive recon", icon: Network },
      { href: "/admin/threat", label: "Threat Intel", shortDesc: "IOC feeds", icon: ShieldAlert },
    ],
  },
  {
    id: "infra",
    label: "Infrastructure",
    icon: Server,
    accentClass: "text-emerald-400",
    dotClass: "bg-emerald-400",
    modules: [
      { href: "/admin/nodes", label: "Nodes", shortDesc: "Server fleet", icon: Server },
      { href: "/admin/transport", label: "Protocols", shortDesc: "Transport config", icon: Radio },
      { href: "/admin/configs", label: "Configs", shortDesc: "Client configs", icon: FileCode },
      { href: "/admin/infrastructure", label: "Deployment", shortDesc: "Infra management", icon: Rocket },
      { href: "/admin/infrastructure/traffic", label: "Traffic", shortDesc: "Routing & failover", icon: ArrowRightLeft },
      { href: "/admin/config-audit", label: "Config Audit", shortDesc: "Strength testing", icon: ShieldAlert },
    ],
  },
  {
    id: "weaponize",
    label: "Weaponize",
    icon: Crosshair,
    accentClass: "text-amber-400",
    dotClass: "bg-amber-400",
    modules: [
      { href: "/admin/payloads", label: "Payloads", shortDesc: "Payload generation", icon: Sword },
      { href: "/admin/implants", label: "Implants", shortDesc: "Implant management", icon: Crosshair },
      { href: "/admin/lotl", label: "LotL Arsenal", shortDesc: "Living off the land", icon: Zap },
      { href: "/admin/profiles", label: "Profiles", shortDesc: "C2 profiles", icon: UserCircle },
    ],
  },
  {
    id: "deliver",
    label: "Deliver",
    icon: ArrowRightLeft,
    accentClass: "text-orange-400",
    dotClass: "bg-orange-400",
    modules: [
      { href: "/admin/mail", label: "Mail Ops", shortDesc: "Phishing & mail", icon: Mail },
      { href: "/admin/mail/migrator", label: "Migrator", shortDesc: "IMAP XOAUTH2", icon: ArrowRightLeft },
    ],
  },
  {
    id: "operate",
    label: "Operate",
    icon: Cpu,
    accentClass: "text-red-400",
    dotClass: "bg-red-400",
    modules: [
      { href: "/admin/coordination", label: "Team Ops", shortDesc: "Multi-operator", icon: Users },
      { href: "/admin/forensics", label: "Anti-Forensics", shortDesc: "Evidence control", icon: Fingerprint },
      { href: "/admin/ai", label: "AI Assistant", shortDesc: "Chat + ShadowGrok C2", icon: Cpu },
      { href: "/admin/workflow", label: "Workflow", shortDesc: "AI orchestration", icon: Workflow },
    ],
  },
  {
    id: "report",
    label: "Report",
    icon: BarChart3,
    accentClass: "text-violet-400",
    dotClass: "bg-violet-400",
    modules: [
      { href: "/admin/analytics", label: "Analytics", shortDesc: "Behavioral analysis", icon: BarChart3 },
      { href: "/admin/workflow/analytics", label: "Workflow Analytics", shortDesc: "Workflow metrics", icon: Activity },
      { href: "/admin/reports", label: "Reports", shortDesc: "Auto-generated", icon: FileText },
    ],
  },
]

export { WORKFLOW_STAGES }

/* ------------------------------------------------------------------ */
/*  Sidebar component                                                  */
/* ------------------------------------------------------------------ */

export function AdminSidebar() {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [openStages, setOpenStages] = useState<Record<string, boolean>>(() => {
    // Auto-expand the stage containing the active route
    const initial: Record<string, boolean> = {}
    for (const stage of WORKFLOW_STAGES) {
      initial[stage.id] = stage.modules.some((m) => pathname?.startsWith(m.href))
    }
    return initial
  })

  // Persist collapsed state to localStorage
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed")
    if (saved !== null) {
      setIsCollapsed(saved === "true")
    }
  }, [])

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(isCollapsed))
  }, [isCollapsed])

  const toggleStage = (id: string) =>
    setOpenStages((prev) => ({ ...prev, [id]: !prev[id] }))

  const toggleCollapse = () => setIsCollapsed((prev) => !prev)

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-in-out",
        isCollapsed ? "w-16" : "w-60"
      )}
    >
      {/* Brand */}
      <div className={cn("flex h-14 items-center", isCollapsed ? "justify-center px-0" : "gap-2.5 px-5")}>
        <Link href="/admin" className={cn("flex items-center", isCollapsed ? "justify-center" : "gap-2.5")}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/25">
            <ShieldAlert className="h-4 w-4 text-primary" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="text-heading-sm text-sidebar-accent-foreground">D-Panel</span>
              <span className="text-micro text-sidebar-foreground/60">Operations Center</span>
            </div>
          )}
        </Link>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Collapse toggle */}
      <div className={cn("flex items-center", isCollapsed ? "justify-center px-2 py-2" : "justify-end px-3 py-2")}>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleCollapse}
          className="h-7 w-7"
        >
          {isCollapsed ? (
            <ChevronRightIcon className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Command Center link */}
      <div className={cn(isCollapsed ? "px-2 py-2" : "px-3 pt-3 pb-1")}>
        {isCollapsed ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  href="/admin"
                  className={cn(
                    "flex items-center justify-center rounded-lg transition-colors px-2 py-2",
                    pathname === "/admin"
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <LayoutDashboard className="h-4 w-4 shrink-0" />
                </Link>
              }
            />
            <TooltipContent side="right">Command Center</TooltipContent>
          </Tooltip>
        ) : (
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors",
              pathname === "/admin"
                ? "bg-primary/10 text-primary font-medium"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            <span className="text-body-sm">Command Center</span>
          </Link>
        )}
      </div>

      {/* Workflow stages */}
      <ScrollArea className={cn("flex-1", isCollapsed ? "px-2 py-2" : "px-3 py-2")}>
        <nav className="space-y-0.5">
          {WORKFLOW_STAGES.map((stage) => {
            const isOpen = openStages[stage.id] ?? false
            const hasActive = stage.modules.some((m) => pathname?.startsWith(m.href))
            const StageIcon = stage.icon

            return (
              <Collapsible
                key={stage.id}
                open={isCollapsed ? false : isOpen}
                onOpenChange={() => toggleStage(stage.id)}
              >
                <CollapsibleTrigger
                  render={<button type="button" />}
                  className={cn(
                    "flex w-full items-center rounded-lg transition-colors",
                    isCollapsed
                      ? "justify-center px-2 py-2"
                      : "justify-between px-3 py-1.5",
                    hasActive
                      ? cn(stage.accentClass, "bg-white/[0.03]")
                      : "text-sidebar-foreground/50 hover:text-sidebar-foreground/80",
                  )}
                >
                  <div className={cn("flex items-center", isCollapsed ? "" : "gap-2")}>
                    {!isCollapsed && (
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full transition-colors",
                          hasActive ? stage.dotClass : "bg-sidebar-foreground/20",
                        )}
                      />
                    )}
                    {isCollapsed ? (
                      <StageIcon className={cn("h-4 w-4", hasActive ? stage.accentClass : "")} />
                    ) : (
                      <span className="text-label">{stage.label}</span>
                    )}
                  </div>
                  {!isCollapsed && (isOpen ? (
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  ) : (
                    <ChevronRight className="h-3 w-3 opacity-50" />
                  ))}
                </CollapsibleTrigger>
                {!isCollapsed && (
                  <CollapsibleContent>
                    <div className="mt-0.5 ml-[11px] space-y-0.5 border-l border-sidebar-border pl-3">
                      {stage.modules.map((mod) => {
                        const active = pathname?.startsWith(mod.href)
                        const Icon = mod.icon
                        return (
                          <Tooltip key={mod.href}>
                            <TooltipTrigger
                              render={<Link href={mod.href} />}
                              className={cn(
                                "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors",
                                active
                                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                              )}
                            >
                              <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                              <span className="text-body-sm leading-tight truncate">
                                {mod.label}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="text-caption">
                              {mod.shortDesc}
                            </TooltipContent>
                          </Tooltip>
                        )
                      })}
                    </div>
                  </CollapsibleContent>
                )}
              </Collapsible>
            )
          })}
        </nav>
      </ScrollArea>

      <Separator className="bg-sidebar-border" />

      {/* Footer */}
      <div className={cn(isCollapsed ? "px-2 py-3" : "px-3 py-3")}>
        <Tooltip>
          <TooltipTrigger
            render={
              <Link
                href="/admin/settings"
                className={cn(
                  "flex items-center rounded-lg transition-colors",
                  isCollapsed ? "justify-center px-2 py-2" : "gap-2.5 px-3 py-2",
                  pathname === "/admin/settings"
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Settings className="h-4 w-4 shrink-0" />
                {!isCollapsed && <span className="text-body-sm">Settings</span>}
              </Link>
            }
          />
          {isCollapsed && <TooltipContent side="right">Settings</TooltipContent>}
        </Tooltip>
      </div>
    </aside>
  )
}
