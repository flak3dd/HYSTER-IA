import { redirect } from "next/navigation"
import { readSession } from "@/lib/auth/session"
import { AdminSidebar } from "@/components/admin/sidebar"
import { AdminHeader } from "@/components/admin/admin-header"
import { PageTransition } from "@/components/ui/page-transition"
import { ErrorBoundary } from "@/components/ui/error-boundary"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession()
  if (!session) redirect("/login?next=/admin")
  if (!session.isActive) redirect("/login?next=/admin")

  return (
    <ErrorBoundary>
      <div className="flex h-screen overflow-hidden bg-background">
        <AdminSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <AdminHeader username={session.username} role={session.role} />
          <main className="flex-1 overflow-y-auto p-6">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </div>
    </ErrorBoundary>
  )
}
