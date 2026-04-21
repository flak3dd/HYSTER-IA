import { Client as SSHClient } from "ssh2"
import { generateKeyPairSync } from "node:crypto"

export type SshKeyPair = {
  publicKey: string
  privateKey: string
}

export function generateSshKeyPair(): SshKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  })

  const pubKeyDer = Buffer.from(
    publicKey
      .replace("-----BEGIN PUBLIC KEY-----", "")
      .replace("-----END PUBLIC KEY-----", "")
      .replace(/\s/g, ""),
    "base64",
  )
  const keyData = pubKeyDer.subarray(pubKeyDer.length - 32)
  const nameLen = Buffer.alloc(4)
  nameLen.writeUInt32BE(11)
  const keyLen = Buffer.alloc(4)
  keyLen.writeUInt32BE(32)
  const sshPub = Buffer.concat([nameLen, Buffer.from("ssh-ed25519"), keyLen, keyData])
  const opensshPub = `ssh-ed25519 ${sshPub.toString("base64")} hysteria-deploy`

  return { publicKey: opensshPub, privateKey }
}

export type SshExecResult = {
  code: number
  stdout: string
  stderr: string
}

export async function sshExec(opts: {
  host: string
  port?: number
  username?: string
  privateKey: string
  command: string
  timeoutMs?: number
}): Promise<SshExecResult> {
  return new Promise((resolve, reject) => {
    const conn = new SSHClient()
    const timeout = opts.timeoutMs ?? 120_000

    const timer = setTimeout(() => {
      conn.end()
      reject(new Error(`SSH command timed out after ${timeout}ms`))
    }, timeout)

    conn.on("error", (err: Error) => {
      clearTimeout(timer)
      reject(err)
    })

    conn.on("ready", () => {
      conn.exec(opts.command, (err: Error | undefined, stream) => {
        if (err) {
          clearTimeout(timer)
          conn.end()
          reject(err)
          return
        }

        let stdout = ""
        let stderr = ""

        stream.on("data", (data: Buffer) => {
          stdout += data.toString()
        })
        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString()
        })
        stream.on("close", (code: number) => {
          clearTimeout(timer)
          conn.end()
          resolve({ code: code ?? 0, stdout, stderr })
        })
      })
    })

    conn.connect({
      host: opts.host,
      port: opts.port ?? 22,
      username: opts.username ?? "root",
      privateKey: opts.privateKey,
      readyTimeout: 30_000,
      algorithms: {
        serverHostKey: ["ssh-ed25519", "ecdsa-sha2-nistp256", "rsa-sha2-512", "rsa-sha2-256", "ssh-rsa"],
      },
    })
  })
}

export async function waitForSsh(opts: {
  host: string
  privateKey: string
  timeoutMs?: number
  intervalMs?: number
}): Promise<void> {
  const deadline = Date.now() + (opts.timeoutMs ?? 180_000)
  const interval = opts.intervalMs ?? 10_000

  while (Date.now() < deadline) {
    try {
      const result = await sshExec({
        host: opts.host,
        privateKey: opts.privateKey,
        command: "echo ok",
        timeoutMs: 15_000,
      })
      if (result.code === 0) return
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, interval))
  }
  throw new Error(`SSH not reachable on ${opts.host} after ${opts.timeoutMs ?? 180_000}ms`)
}
