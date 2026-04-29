import { type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { spawn } from "child_process"
import path from "path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAILER_DIR = path.join(process.cwd(), "mailer")
const BINARY = path.join(MAILER_DIR, "mailer")

export async function POST(req: NextRequest) {
  try {
    await verifyAdmin(req)

    const body = await req.json().catch(() => ({}))
    const { folders = "INBOX" } = body as { folders?: string }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        const proc = spawn(BINARY, ["-folders", folders], {
          cwd: MAILER_DIR,
          env: { ...process.env },
          stdio: ["ignore", "pipe", "pipe"],
        })

        const push = (prefix: string, chunk: Buffer) => {
          const lines = chunk.toString().split("\n")
          for (const line of lines) {
            if (line.trim()) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: prefix, text: line })}\n\n`),
              )
            }
          }
        }

        proc.stdout?.on("data", (chunk: Buffer) => push("stdout", chunk))
        proc.stderr?.on("data", (chunk: Buffer) => push("log", chunk))

        proc.on("close", (code) => {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "exit", code })}\n\n`,
            ),
          )
          controller.close()
        })

        proc.on("error", (err) => {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", text: err.message })}\n\n`,
            ),
          )
          controller.close()
        })
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
