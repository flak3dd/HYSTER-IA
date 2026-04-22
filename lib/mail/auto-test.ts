import { loadMailAccounts } from "@/lib/mail/accounts"
import { testConnection } from "@/lib/mail/client"
import type { MailTestResult, AutoTestState } from "@/lib/mail/types"

/* ------------------------------------------------------------------ */
/*  In-memory auto-test state (survives across requests in dev/prod)  */
/* ------------------------------------------------------------------ */

let state: AutoTestState = {
  enabled: false,
  intervalMinutes: 30,
  lastRun: null,
  nextRun: null,
  results: [],
}

let timer: ReturnType<typeof setInterval> | null = null

/* ------------------------------------------------------------------ */
/*  Test runner — tests all configured mail accounts                  */
/* ------------------------------------------------------------------ */

export async function runAllAccountTests(): Promise<MailTestResult[]> {
  const accounts = await loadMailAccounts()
  const results: MailTestResult[] = []

  for (const account of accounts) {
    const start = Date.now()
    try {
      const r = await testConnection(account)
      results.push({
        accountId: account.id,
        label: account.label ?? null,
        protocol: account.protocol,
        status: "pass",
        latencyMs: Date.now() - start,
        messageCount: r.count,
        testedAt: new Date().toISOString(),
      })
    } catch (err) {
      results.push({
        accountId: account.id,
        label: account.label ?? null,
        protocol: account.protocol,
        status: "fail",
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
        testedAt: new Date().toISOString(),
      })
    }
  }

  state.results = results
  state.lastRun = new Date().toISOString()
  if (state.enabled) {
    state.nextRun = new Date(
      Date.now() + state.intervalMinutes * 60_000,
    ).toISOString()
  }

  return results
}

/* ------------------------------------------------------------------ */
/*  Auto-test scheduler                                               */
/* ------------------------------------------------------------------ */

function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function startTimer() {
  stopTimer()
  timer = setInterval(() => {
    runAllAccountTests().catch(() => {})
  }, state.intervalMinutes * 60_000)
}

export function enableAutoTest(intervalMinutes?: number): AutoTestState {
  if (intervalMinutes !== undefined && intervalMinutes >= 1) {
    state.intervalMinutes = intervalMinutes
  }
  state.enabled = true
  state.nextRun = new Date(
    Date.now() + state.intervalMinutes * 60_000,
  ).toISOString()
  startTimer()
  return { ...state }
}

export function disableAutoTest(): AutoTestState {
  state.enabled = false
  state.nextRun = null
  stopTimer()
  return { ...state }
}

export function getAutoTestState(): AutoTestState {
  return { ...state, results: [...state.results] }
}
