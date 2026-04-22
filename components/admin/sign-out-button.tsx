"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

export function SignOutButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/logout", { method: "POST" })
        if (!res.ok) {
          toast.error("sign-out failed")
          return
        }
        router.replace("/login")
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "sign-out failed")
      }
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={pending}>
      {pending ? "Signing out..." : "Sign out"}
    </Button>
  )
}
