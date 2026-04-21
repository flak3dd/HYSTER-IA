"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { signOut } from "firebase/auth"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { clientAuth } from "@/lib/firebase/client"

export function SignOutButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      try {
        await signOut(clientAuth()).catch(() => undefined)
        const res = await fetch("/api/auth/session", { method: "DELETE" })
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
