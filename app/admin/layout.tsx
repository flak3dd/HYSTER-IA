import { redirect } from "next/navigation"
import { readSession } from "@/lib/auth/session"
import { SignOutButton } from "@/components/admin/sign-out-button"
import { AdminSidebar } from "@/components/admin/sidebar"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession()
  if (!session) redirect("/login?next=/admin")
  if (!session.isActive) redirect("/login?next=/admin")

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-end gap-3 border-b border-border px-6 py-2.5">
          <span className="text-xs text-muted-foreground">
            {session.username} ({session.role})
          </span>
          <SignOutButton />
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
