import { Client as SSHClient } from "ssh2"
import { generateKeyPairSync, randomBytes } from "node:crypto"

export type SshKeyPair = {
  /** OpenSSH-format public key (`ssh-ed25519 BASE64 comment`) — for authorized_keys / cloud APIs */
  publicKey: string
  /** OpenSSH-format private key — required by ssh2 v1.x which cannot parse PKCS8 ed25519 */
  privateKey: string
}

/** Length-prefixed string per RFC 4251 §5 */
function lenPrefix(buf: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(buf.length)
  return Buffer.concat([len, buf])
}

/**
 * Generate an ed25519 keypair in OpenSSH formats.
 *
 * NOTE: We can't simply ask Node's `generateKeyPairSync('ed25519', { ... format: 'pem' })`
 * because ssh2 v1.x rejects PKCS8 PEM ed25519 keys with `"Unsupported key format"`.
 * Both the public and private key strings here use the OpenSSH wire format that ssh2 expects.
 * @see https://datatracker.ietf.org/doc/html/draft-miller-ssh-agent-04#section-3.2.3
 */
export function generateSshKeyPair(): SshKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  })

  // Last 32 bytes of SPKI DER for ed25519 = the raw public key.
  const pubKeyRaw = publicKey.subarray(publicKey.length - 32)
  // Last 32 bytes of PKCS8 DER for ed25519 = the raw seed (private key half).
  const privSeed = privateKey.subarray(privateKey.length - 32)

  const algoName = Buffer.from("ssh-ed25519")
  const comment = Buffer.from("hysteria-deploy")

  // ── OpenSSH public key wire format ──
  const pubBlob = Buffer.concat([lenPrefix(algoName), lenPrefix(pubKeyRaw)])
  const opensshPub = `ssh-ed25519 ${pubBlob.toString("base64")} ${comment.toString()}`

  // ── OpenSSH private key file (unencrypted, single key) ──
  // private[0..32]  = ed25519 seed (already have it as `privSeed`)
  // private[32..64] = the corresponding public key bytes (per OpenSSH layout)
  const fullPriv = Buffer.concat([privSeed, pubKeyRaw])

  const checkInt = randomBytes(4)
  const privSection = Buffer.concat([
    checkInt,
    checkInt, // checkint repeated — verifies a successful decrypt
    pubBlob,
    lenPrefix(fullPriv),
    lenPrefix(comment),
  ])

  // Pad to 8-byte alignment with 1, 2, 3… per spec
  const padLen = (8 - (privSection.length % 8)) % 8
  const padding = Buffer.from(Array.from({ length: padLen }, (_, i) => i + 1))
  const privSectionPadded = Buffer.concat([privSection, padding])

  const cipherName = Buffer.from("none")
  const kdfName = Buffer.from("none")
  const kdfOptions = Buffer.alloc(0)
  const numKeys = Buffer.alloc(4)
  numKeys.writeUInt32BE(1)

  const opensshBlob = Buffer.concat([
    Buffer.from("openssh-key-v1\0", "utf8"),
    lenPrefix(cipherName),
    lenPrefix(kdfName),
    lenPrefix(kdfOptions),
    numKeys,
    lenPrefix(pubBlob),
    lenPrefix(privSectionPadded),
  ])

  // PEM wrap with 70-char base64 lines
  const b64 = opensshBlob.toString("base64")
  const wrapped = b64.match(/.{1,70}/g)!.join("\n")
  const opensshPrivate =
    "-----BEGIN OPENSSH PRIVATE KEY-----\n" + wrapped + "\n-----END OPENSSH PRIVATE KEY-----\n"

  return { publicKey: opensshPub, privateKey: opensshPrivate }
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
  username?: string
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
        username: opts.username,
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
