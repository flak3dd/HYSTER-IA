import { createHash } from "node:crypto"
import { createWriteStream } from "node:fs"
import { chmod, mkdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { pipeline } from "node:stream/promises"
import { Readable } from "node:stream"
import { serverEnv } from "@/lib/env"
import type { HysteriaReleasePlatform } from "@/lib/hysteria/types"

const DEFAULT_WORK_DIR = "/var/lib/hysteria2-c2"
const BIN_SUBDIR = "bin"

export function workDir(): string {
  return serverEnv().HYSTERIA_WORK_DIR ?? DEFAULT_WORK_DIR
}

export function detectPlatform(): HysteriaReleasePlatform {
  const platform = process.platform
  const arch = process.arch

  const osMap: Record<string, HysteriaReleasePlatform["os"] | undefined> = {
    linux: "linux",
    darwin: "darwin",
    win32: "windows",
    freebsd: "freebsd",
  }
  const archMap: Record<string, HysteriaReleasePlatform["arch"] | undefined> = {
    x64: "amd64",
    arm64: "arm64",
    ia32: "386",
    arm: "armv7",
  }

  const os = osMap[platform]
  const a = archMap[arch]
  if (!os || !a) {
    throw new Error(`Unsupported platform for hysteria binary: ${platform}/${arch}`)
  }
  return { os, arch: a }
}

export function assetNameFor(p: HysteriaReleasePlatform): string {
  const suffix = p.os === "windows" ? ".exe" : ""
  const avxTag = p.os === "linux" && p.arch === "amd64" && p.avx ? "-avx" : ""
  return `hysteria-${p.os}-${p.arch}${avxTag}${suffix}`
}

export function binaryPath(p: HysteriaReleasePlatform = detectPlatform()): string {
  const env = serverEnv().HYSTERIA_BIN
  if (env) return env
  return join(workDir(), BIN_SUBDIR, assetNameFor(p))
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export async function ensureBinary(
  version: string,
  p: HysteriaReleasePlatform = detectPlatform(),
): Promise<string> {
  const targetPath = binaryPath(p)
  if (await exists(targetPath)) return targetPath

  const baseUrl = serverEnv().HYSTERIA_DOWNLOAD_BASE_URL
  const asset = assetNameFor(p)
  const url = `${baseUrl}/app/${version}/${asset}`

  const dir = join(workDir(), BIN_SUBDIR)
  await mkdir(dir, { recursive: true })

  const res = await fetch(url)
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download hysteria binary ${asset} from ${url}: ${res.status}`)
  }

  const hasher = createHash("sha256")
  const body = Readable.fromWeb(res.body as import("stream/web").ReadableStream<Uint8Array>)
  const sink = createWriteStream(targetPath, { mode: 0o755 })
  body.on("data", (chunk: Buffer) => hasher.update(chunk))
  await pipeline(body, sink)
  await chmod(targetPath, 0o755)
  return targetPath
}
