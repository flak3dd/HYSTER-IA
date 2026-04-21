import { type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { getDeployment, subscribe } from "@/lib/deploy/orchestrator"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const deployment = getDeployment(id)
    if (!deployment) {
      return (await import("next/server")).NextResponse.json(
        { error: "not_found" },
        { status: 404 },
      )
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        // send existing steps
        for (const step of deployment.steps) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(step)}\n\n`))
        }

        if (deployment.status === "completed" || deployment.status === "failed" || deployment.status === "destroyed") {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
          controller.close()
          return
        }

        const unsub = subscribe(id, (step) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(step)}\n\n`))
            if (step.status === "completed" || step.status === "failed" || step.status === "destroyed") {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
              unsub()
              controller.close()
            }
          } catch {
            unsub()
          }
        })

        req.signal.addEventListener("abort", () => {
          unsub()
          try { controller.close() } catch { /* already closed */ }
        })
      },
    })

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-store",
        connection: "keep-alive",
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
