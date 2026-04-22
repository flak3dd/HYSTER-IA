"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/*  Workflow stages with their modules                                 */
/* ------------------------------------------------------------------ */

const WORKFLOW_STAGES = [
  {
    id: "recon",
    label: "Recon",
    color: "text-blue-500",
    bgActive: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    modules: [
      { href: "/admin/osint", label: "OSINT", shortDesc: "Intelligence gathering" },
      { href: "/admin/network", label: "Network Mapping", shortDesc: "Passive recon" },
      { href: "/admin/threat", label: "Threat Intel", shortDesc: "IOC feeds" },
    ],
  },
  {
    id: "infra",
    label: "Infrastructure",
    color: "text-emerald-500",
    bgActive: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    modules: [
      { href: "/admin/nodes", label: "Nodes", shortDesc: "Server fleet" },
      { href: "/admin/transport", label: "Protocols", shortDesc: "Transport config" },
      { href: "/admin/configs", label: "Configs", shortDesc: "Client configs" },
      { href: "/admin/infrastructure", label: "Deployment", shortDesc: "Infra management" },
    ],
  },
  {
    id: "weaponize",
    label: "Weaponize",
    color: "text-amber-500",
    bgActive: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    modules: [
      { href: "/admin/payloads", label: "Payloads", shortDesc: "Payload generation" },
      { href: "/admin/lotl", label: "LotL Arsenal", shortDesc: "Living off the land" },
      { href: "/admin/profiles", label: "Profiles", shortDesc: "C2 profiles" },
    ],
  },
  {
    id: "deliver",
    label: "Deliver",
    color: "text-orange-500",
    bgActive: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
    modules: [
      { href: "/admin/mail", label: "Mail Ops", shortDesc: "Phishing & mail" },
      { href: "/admin/agents", label: "Agents", shortDesc: "LLM-driven tasks" },
    ],
  },
  {
    id: "operate",
    label: "Operate",
    color: "text-red-500",
    bgActive: "bg-red-500/10",
    borderColor: "border-red-500/30",
    modules: [
      { href: "/admin/coordination", label: "Team Ops", shortDesc: "Multi-operator" },
      { href: "/admin/forensics", label: "Anti-Forensics", shortDesc: "Evidence control" },
      { href: "/admin/ai", label: "AI Assistant", shortDesc: "Config assistant" },
    ],
  },
  {
    id: "report",
    label: "Report",
    color: "text-violet-500",
    bgActive: "bg-violet-500/10",
    borderColor: "border-violet-500/30",
    modules: [
      { href: "/admin/analytics", label: "Analytics", shortDesc: "Behavioral analysis" },
      { href: "/admin/reports", label: "Reports", shortDesc: "Auto-generated" },
    ],
  },
] as const

export { WORKFLOW_STAGES }

/* ------------------------------------------------------------------ */
/*  Sidebar component                                                  */
/* ------------------------------------------------------------------ */

export function AdminSidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggle = (id: string) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card">
      {/* Brand */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Link href="/admin" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
            D
          </span>
          <span className="text-sm font-semibold">D-Panel Ops</span>
        </Link>
      </div>

      {/* Command Center link */}
      <div className="px-2 pt-3 pb-1">
        <Link
          href="/admin"
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            pathname === "/admin"
              ? "bg-primary/10 text-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
          Command Center
        </Link>
      </div>

      {/* Workflow stages */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {WORKFLOW_STAGES.map((stage) => {
          const isOpen = !collapsed[stage.id]
          const hasActive = stage.modules.some((m) => pathname?.startsWith(m.href))
          return (
            <div key={stage.id} className="mb-1">
              <button
                onClick={() => toggle(stage.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors",
                  hasActive
                    ? cn(stage.bgActive, stage.color)
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      hasActive ? "bg-current" : "bg-muted-foreground/40",
                    )}
                  />
                  {stage.label}
                </div>
                <svg
                  className={cn(
                    "h-3 w-3 transition-transform",
                    isOpen ? "rotate-0" : "-rotate-90",
                  )}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {isOpen && (
                <div className="mt-0.5 ml-3 space-y-0.5 border-l border-border pl-3">
                  {stage.modules.map((mod) => {
                    const active = pathname?.startsWith(mod.href)
                    return (
                      <Link
                        key={mod.href}
                        href={mod.href}
                        className={cn(
                          "flex flex-col rounded-md px-2 py-1.5 transition-colors",
                          active
                            ? cn(stage.bgActive, "text-foreground")
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <span className="text-sm leading-tight">{mod.label}</span>
                        <span className="text-[10px] leading-tight opacity-60">
                          {mod.shortDesc}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-4 py-2">
        <p className="text-[10px] text-muted-foreground">
          Workflow: Recon &rarr; Report
        </p>
      </div>
    </aside>
  )
}
