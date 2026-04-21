export type HysteriaAuthRequest = {
  addr: string
  auth: string
  tx: number
}

export type HysteriaAuthResponse = {
  ok: boolean
  id: string
}

export type HysteriaTrafficMap = Record<string, { tx: number; rx: number }>

export type HysteriaOnlineMap = Record<string, number>

export type HysteriaStreamDump = {
  streams: Array<{
    state: string
    auth: string
    connection: number
    stream: number
    req_addr: string
    hooked_req_addr: string
    tx: number
    rx: number
    initial_at: string
    last_active_at: string
  }>
}

export type HysteriaReleasePlatform = {
  os: "linux" | "darwin" | "windows" | "freebsd"
  arch: "amd64" | "arm64" | "386" | "armv7"
  avx?: boolean
}
