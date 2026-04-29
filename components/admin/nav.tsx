"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/nodes", label: "Infrastructure" },
  { href: "/admin/transport", label: "Protocols" },
  { href: "/admin/payloads", label: "Payloads" },
  { href: "/admin/osint", label: "OSINT" },
  { href: "/admin/network", label: "Network" },
  { href: "/admin/lotl", label: "LotL Arsenal" },
  { href: "/admin/forensics", label: "Anti-Forensics" },
  { href: "/admin/threat", label: "Threat Intel" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/coordination", label: "Team Ops" },
  { href: "/admin/mail", label: "Mail Test" },
  { href: "/admin/mail/migrator", label: "Migrator" },
  { href: "/admin/reports", label: "Reports" },
]

export function AdminNav() {
  const pathname = usePathname()
  return (
    <nav className="flex items-center gap-4 text-sm">
      {LINKS.map((l) => {
        const active =
          l.href === "/admin" ? pathname === "/admin" : pathname?.startsWith(l.href)
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {l.label}
          </Link>
        )
      })}
    </nav>
  )
}
