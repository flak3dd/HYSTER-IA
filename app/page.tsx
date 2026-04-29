import { redirect } from "next/navigation"
import { readSession } from "@/lib/auth/session"

export default async function Home() {
  const session = await readSession()

  if (session?.isActive) {
    redirect("/admin")
  } else {
    redirect("/login")
  }
}
