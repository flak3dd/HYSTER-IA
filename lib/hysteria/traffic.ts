import { serverEnv } from "@/lib/env"
import type {
  HysteriaOnlineMap,
  HysteriaStreamDump,
  HysteriaTrafficMap,
} from "@/lib/hysteria/types"

function authHeaders(): HeadersInit {
  const secret = serverEnv().HYSTERIA_TRAFFIC_API_SECRET
  return secret ? { Authorization: secret } : {}
}

function baseUrl(): string {
  return serverEnv().HYSTERIA_TRAFFIC_API_BASE_URL.replace(/\/$/, "")
}

export async function fetchTraffic(clear = false): Promise<HysteriaTrafficMap> {
  const url = `${baseUrl()}/traffic${clear ? "?clear=1" : ""}`
  const res = await fetch(url, { headers: authHeaders(), cache: "no-store" })
  if (!res.ok) throw new Error(`hysteria /traffic failed: ${res.status}`)
  return (await res.json()) as HysteriaTrafficMap
}

export async function fetchOnline(): Promise<HysteriaOnlineMap> {
  const res = await fetch(`${baseUrl()}/online`, { headers: authHeaders(), cache: "no-store" })
  if (!res.ok) throw new Error(`hysteria /online failed: ${res.status}`)
  return (await res.json()) as HysteriaOnlineMap
}

export async function kickUsers(ids: string[]): Promise<void> {
  const res = await fetch(`${baseUrl()}/kick`, {
    method: "POST",
    headers: { ...authHeaders(), "content-type": "application/json" },
    body: JSON.stringify(ids),
  })
  if (!res.ok) throw new Error(`hysteria /kick failed: ${res.status}`)
}

export async function dumpStreams(): Promise<HysteriaStreamDump> {
  const res = await fetch(`${baseUrl()}/dump/streams`, {
    headers: authHeaders(),
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`hysteria /dump/streams failed: ${res.status}`)
  return (await res.json()) as HysteriaStreamDump
}
