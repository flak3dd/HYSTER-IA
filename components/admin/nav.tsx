"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/nodes", label: "Nodes" },
  { href: "/admin/profiles", label: "Profiles" },
  { href: "/admin/configs", label: "Configs" },
  { href: "/admin/agents", label: "Agents" },
  { href: "/admin/ai", label: "AI" },
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
