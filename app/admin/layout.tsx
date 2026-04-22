import Link from "next/link"
import { redirect } from "next/navigation"
import { readSession } from "@/lib/auth/session"
import { SignOutButton } from "@/components/admin/sign-out-button"
import { AdminNav } from "@/components/admin/nav"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession()
  if (!session) redirect("/login?next=/admin")
  if (!session.isActive) redirect("/login?next=/admin")

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="text-sm font-semibold">
            D-Panel Operations
          </Link>
          <AdminNav />
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{session.username} ({session.role})</span>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
