import { NextResponse, type NextRequest } from "next/server"
import { verifyAdminCookie } from "@/lib/auth/admin"
import { getTaskRow, listStepRows } from "@/lib/agents/db"
import { subscribe } from "@/lib/agents/runner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response | NextResponse> {
  try {
    await verifyAdminCookie()
  } catch (err) {
    const status = (err as { status?: number }).status ?? 401
    return NextResponse.json({ error: "unauthorized" }, { status })
  }
  const { id } = await ctx.params
  const task = await getTaskRow(id)
  if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        try {
          controller.enqueue(encoder.encode(payload))
        } catch {
          // stream closed
        }
      }

      send("status", { taskId: id, status: task.status })
      const backlog = await listStepRows(id)
      for (const step of backlog) {
        send("step", { taskId: id, step })
      }

      const unsubscribe = subscribe(id, (ev) => {
        send(ev.type, ev)
        if (ev.type === "status" && (ev.status === "succeeded" || ev.status === "failed" || ev.status === "cancelled")) {
          unsubscribe()
          try {
            controller.close()
          } catch {
            // already closed
          }
        }
      })

      const onAbort = () => {
        unsubscribe()
        try {
          controller.close()
        } catch {
          // already closed
        }
      }
      req.signal.addEventListener("abort", onAbort, { once: true })
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  })
}
