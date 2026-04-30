"use client"

import { Suspense, useState, useTransition } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Shield, Terminal, Lock, Eye, EyeOff } from "lucide-react"

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  )
}

function LoginSkeleton() {
  return (
    <Card className="w-full max-w-[400px] border-border/50 bg-card/80 backdrop-blur-sm">
      <CardHeader className="text-center">
        <Skeleton className="mx-auto h-12 w-12 rounded-xl" />
        <Skeleton className="mx-auto mt-4 h-6 w-32" />
        <Skeleton className="mx-auto mt-2 h-4 w-48" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  )
}

function LoginForm() {
  const params = useSearchParams()
  const next = params.get("next") ?? "/admin"

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username, password, next }),
        })

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          const msg = data.error ?? `Authentication failed (${res.status})`
          setError(msg)
          toast.error(msg)
          return
        }

        const data = await res.json()

        if (data.success) {
          toast.success("Access granted. Redirecting...")
          setTimeout(() => {
            window.location.href = data.redirect || "/admin"
          }, 500)
        } else {
          setError("Authentication failed")
          toast.error("Authentication failed")
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Authentication failed"
        setError(msg)
        toast.error(msg)
      }
    })
  }

  return (
    <Card className="w-full max-w-[400px] border-border/50 bg-card/80 backdrop-blur-sm">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
          <Shield className="h-7 w-7 text-primary" />
        </div>
        <CardTitle className="text-heading-lg">D-Panel Ops</CardTitle>
        <CardDescription className="text-body-sm">
          Red Team Operations Platform
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="username" className="text-caption font-medium">
              Username
            </Label>
            <div className="relative">
              <Terminal className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="username"
                type="text"
                placeholder="operator"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={pending}
                className="pl-10"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password" className="text-caption font-medium">
              Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={pending}
                className="pl-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-body-sm text-destructive">
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
              {error}
            </div>
          )}

          <Button type="submit" disabled={pending} size="lg" className="mt-1 w-full">
            {pending ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Authenticating...
              </span>
            ) : (
              "Sign in"
            )}
          </Button>

          <p className="text-center text-micro text-muted-foreground">
            Authorized personnel only. All access is logged.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
