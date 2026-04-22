import { spawn, type ChildProcess } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { serverEnv } from "@/lib/env"
import type { NodeStatus } from "@/lib/db/schema"
import { getServerConfig } from "@/lib/db/server-config"
import { renderHysteriaYaml } from "@/lib/hysteria/config"
import { binaryPath, workDir } from "@/lib/hysteria/binary"

export type ManagerStatus = {
  state: NodeStatus
  pid: number | null
  startedAt: number | null
  lastExitCode: number | null
  lastExitSignal: NodeJS.Signals | null
  lastError: string | null
}

type ManagerState = ManagerStatus & {
  child: ChildProcess | null
  logs: string[]
}

const MAX_LOG_LINES = 1000

const g = globalThis as typeof globalThis & { __hysteriaManager?: ManagerState }

function state(): ManagerState {
  if (!g.__hysteriaManager) {
    g.__hysteriaManager = {
      state: "stopped",
      pid: null,
      startedAt: null,
      lastExitCode: null,
      lastExitSignal: null,
      lastError: null,
      child: null,
      logs: [],
    }
  }
  return g.__hysteriaManager
}

function pushLog(line: string): void {
  const s = state()
  s.logs.push(line)
  if (s.logs.length > MAX_LOG_LINES) {
    s.logs.splice(0, s.logs.length - MAX_LOG_LINES)
  }
}

export function getStatus(): ManagerStatus {
  const s = state()
  return {
    state: s.state,
    pid: s.pid,
    startedAt: s.startedAt,
    lastExitCode: s.lastExitCode,
    lastExitSignal: s.lastExitSignal,
    lastError: s.lastError,
  }
}

export function getLogs(tail = 200): string[] {
  const s = state()
  return s.logs.slice(Math.max(0, s.logs.length - tail))
}

async function configPath(): Promise<string> {
  const dir = join(workDir(), "nodes", serverEnv().NODE_ID)
  await mkdir(dir, { recursive: true })
  return join(dir, "config.yaml")
}

export async function writeConfigFile(): Promise<string> {
  const cfg = await getServerConfig()
  if (!cfg) throw new Error("serverConfig document is missing; set it before starting hysteria")
  const path = await configPath()
  await writeFile(path, renderHysteriaYaml(cfg), { mode: 0o600 })
  return path
}

export async function start(): Promise<ManagerStatus> {
  const s = state()
  if (s.state === "running" || s.state === "starting") return getStatus()

  s.state = "starting"
  s.lastError = null
  try {
    const cfgPath = await writeConfigFile()
    const bin = binaryPath()

    const child = spawn(bin, ["server", "-c", cfgPath], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    })
    s.child = child
    s.pid = child.pid ?? null
    s.startedAt = Date.now()

    child.stdout?.on("data", (buf: Buffer) => pushLog(`[out] ${buf.toString("utf8").trimEnd()}`))
    child.stderr?.on("data", (buf: Buffer) => pushLog(`[err] ${buf.toString("utf8").trimEnd()}`))

    child.on("spawn", () => {
      s.state = "running"
    })
    child.on("error", (err) => {
      s.lastError = err.message
      s.state = "errored"
    })
    child.on("exit", (code, signal) => {
      s.lastExitCode = code
      s.lastExitSignal = signal
      s.child = null
      s.pid = null
      s.state = code === 0 ? "stopped" : "errored"
    })
    return getStatus()
  } catch (err) {
    s.state = "errored"
    s.lastError = err instanceof Error ? err.message : String(err)
    return getStatus()
  }
}

export async function stop(signal: NodeJS.Signals = "SIGTERM"): Promise<ManagerStatus> {
  const s = state()
  if (!s.child || s.state === "stopped") {
    s.state = "stopped"
    return getStatus()
  }
  s.state = "stopping"
  s.child.kill(signal)
  return getStatus()
}

export async function restart(): Promise<ManagerStatus> {
  await stop()
  await new Promise((r) => setTimeout(r, 500))
  return start()
}
