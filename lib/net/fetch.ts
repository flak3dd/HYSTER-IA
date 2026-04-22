import { fetch as undiciFetch, type Dispatcher, type RequestInit } from "undici"
import { egressStrategy } from "@/lib/net/dispatcher"
import type { ProxyPurpose } from "@/lib/net/strategy"

export type ProxyFetchOptions = RequestInit & {
  purpose?: ProxyPurpose
  /**
   * Skip the egress proxy entirely. Defaults to false. Only used for internal
   * panel-to-panel calls.
   */
  direct?: boolean
}

export async function proxyFetch(
  input: string | URL,
  init?: ProxyFetchOptions,
): Promise<Response> {
  const url = input instanceof URL ? input : new URL(input)
  let dispatcher: Dispatcher | null = null
  if (!init?.direct) {
    const strategy = egressStrategy()
    dispatcher = await strategy.resolve({
      target: url,
      purpose: init?.purpose ?? "web",
    })
  }
  const res = await undiciFetch(url, {
    ...init,
    dispatcher: dispatcher ?? undefined,
  })
  return res as unknown as Response
}
