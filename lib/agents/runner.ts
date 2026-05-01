import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { serverEnv } from "@/lib/env"
import { chatComplete, type ChatMessage } from "@/lib/agents/llm"
import { DEFAULT_ALLOWED_TOOLS, runTool, toolDefinitions } from "@/lib/agents/tools"
import {
  appendStepRow,
  createTaskRow,
  markTerminal,
  updateTaskRow,
} from "@/lib/agents/db"
import type { AgentStep, AgentTask, AgentTaskCreateInput } from "@/lib/agents/types"
import { buildSystemPrompt, Role } from "@/lib/ai/system-prompt"

export type AgentEvent =
  | { type: "step"; taskId: string; step: AgentStep }
  | { type: "status"; taskId: string; status: AgentTask["status"]; finishedAt?: string | null }

type RunState = {
  task: AgentTask
  abort: AbortController
  finished: Promise<void>
  stepIndex: number
}

const g = globalThis as typeof globalThis & {
  __agentsRunner?: {
    bus: EventEmitter
    runs: Map<string, RunState>
  }
}

function runner(): NonNullable<typeof g.__agentsRunner> {
  if (!g.__agentsRunner) {
    const bus = new EventEmitter()
    bus.setMaxListeners(100)
    g.__agentsRunner = { bus, runs: new Map() }
  }
  return g.__agentsRunner
}

export function subscribe(
  taskId: string,
  listener: (ev: AgentEvent) => void,
): () => void {
  const { bus } = runner()
  const wrapped = (ev: AgentEvent) => {
    if (ev.taskId === taskId) listener(ev)
  }
  bus.on("event", wrapped)
  return () => bus.off("event", wrapped)
}

function emit(ev: AgentEvent): void {
  runner().bus.emit("event", ev)
}

const SYSTEM_PROMPT = buildSystemPrompt(Role.AgentRunner)

export function createAndStartTask(
  input: AgentTaskCreateInput,
  createdBy: string,
): AgentTask {
  const env = serverEnv()
  const now = new Date().toISOString()
  const task: AgentTask = {
    id: randomUUID(),
    status: "queued",
    prompt: input.prompt,
    model: input.model ?? env.LLM_MODEL,
    maxSteps: input.maxSteps ?? env.AGENT_MAX_STEPS,
    allowedTools: input.allowedTools ?? DEFAULT_ALLOWED_TOOLS,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    createdBy,
    result: null,
    error: null,
    stepCount: 0,
  }

  const abort = new AbortController()
  const finished = (async () => {
    await createTaskRow(task)
    try {
      await runAgent(task, abort.signal)
    } catch (err) {
      if (abort.signal.aborted) {
        await markTerminal(task.id, "cancelled")
        emit({ type: "status", taskId: task.id, status: "cancelled", finishedAt: new Date().toISOString() })
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      await markTerminal(task.id, "failed", { error: message })
      emit({ type: "status", taskId: task.id, status: "failed", finishedAt: new Date().toISOString() })
    } finally {
      runner().runs.delete(task.id)
    }
  })()

  runner().runs.set(task.id, { task, abort, finished, stepIndex: 0 })
  return task
}

export function cancelTask(taskId: string): boolean {
  const r = runner().runs.get(taskId)
  if (!r) return false
  r.abort.abort()
  return true
}

export function isRunning(taskId: string): boolean {
  return runner().runs.has(taskId)
}

async function appendStep(
  taskId: string,
  partial: Omit<AgentStep, "index" | "at">,
): Promise<AgentStep> {
  const r = runner().runs.get(taskId)
  const index = r ? r.stepIndex++ : 0
  const step: AgentStep = {
    index,
    at: new Date().toISOString(),
    ...partial,
  }
  await appendStepRow(taskId, step)
  await updateTaskRow(taskId, { stepCount: index + 1 })
  emit({ type: "step", taskId, step })
  return step
}

async function runAgent(task: AgentTask, signal: AbortSignal): Promise<void> {
  const env = serverEnv()

  await updateTaskRow(task.id, { status: "running" })
  emit({ type: "status", taskId: task.id, status: "running" })
  await appendStep(task.id, {
    kind: "status",
    content: "task started",
    tool: null,
  })

  const tools = toolDefinitions(task.allowedTools)
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: task.prompt },
  ]

  const timeout = setTimeout(() => {
    if (!signal.aborted) {
      (signal as unknown as { throwIfAborted?: () => void }).throwIfAborted?.()
    }
  }, env.AGENT_TASK_TIMEOUT_MS).unref?.()
  const timeoutCtrl = new AbortController()
  const timeoutHandle = setTimeout(() => timeoutCtrl.abort(new Error("task timeout")), env.AGENT_TASK_TIMEOUT_MS)
  const merged = mergeSignals(signal, timeoutCtrl.signal)
  void timeout

  try {
    for (let i = 0; i < task.maxSteps; i++) {
      merged.throwIfAborted()

      const out = await chatComplete({
        messages,
        tools,
        model: task.model,
        signal: merged,
      })

      if (out.content) {
        messages.push({ role: "assistant", content: out.content, tool_calls: out.toolCalls })
        await appendStep(task.id, {
          kind: "assistant_message",
          content: out.content,
          tool: null,
        })
      } else if (out.toolCalls.length > 0) {
        messages.push({ role: "assistant", content: "", tool_calls: out.toolCalls })
      }

      if (out.toolCalls.length === 0) {
        await markTerminal(task.id, "succeeded", { result: out.content ?? "" })
        emit({
          type: "status",
          taskId: task.id,
          status: "succeeded",
          finishedAt: new Date().toISOString(),
        })
        return
      }

      for (const call of out.toolCalls) {
        merged.throwIfAborted()

        let parsedArgs: unknown = {}
        try {
          parsedArgs = call.function.arguments ? JSON.parse(call.function.arguments) : {}
        } catch {
          parsedArgs = {}
        }

        await appendStep(task.id, {
          kind: "tool_call",
          content: `${call.function.name}(${call.function.arguments || ""})`,
          tool: call.function.name,
          arguments: parsedArgs,
        })

        if (!task.allowedTools.includes(call.function.name)) {
          const err = `tool '${call.function.name}' is not allowed for this task`
          await appendStep(task.id, {
            kind: "tool_result",
            content: err,
            tool: call.function.name,
            result: { error: err },
          })
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ error: err }),
          })
          continue
        }

        try {
          const result = await runTool(call.function.name, parsedArgs, {
            signal: merged,
            invokerUid: task.createdBy,
          })
          const resultStr = JSON.stringify(result)
          await appendStep(task.id, {
            kind: "tool_result",
            content: resultStr.length > 2000 ? resultStr.slice(0, 2000) + "…" : resultStr,
            tool: call.function.name,
            result,
          })
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: resultStr,
          })
        } catch (toolErr) {
          const message = toolErr instanceof Error ? toolErr.message : String(toolErr)
          await appendStep(task.id, {
            kind: "tool_result",
            content: `error: ${message}`,
            tool: call.function.name,
            result: { error: message },
          })
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ error: message }),
          })
        }
      }
    }

    await appendStep(task.id, {
      kind: "error",
      content: `reached max steps (${task.maxSteps}) without finishing`,
      tool: null,
    })
    await markTerminal(task.id, "failed", { error: "max steps reached" })
    emit({
      type: "status",
      taskId: task.id,
      status: "failed",
      finishedAt: new Date().toISOString(),
    })
  } finally {
    clearTimeout(timeoutHandle)
  }
}

function mergeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (a.aborted) return a
  if (b.aborted) return b
  const ctrl = new AbortController()
  const forward = (s: AbortSignal) => () => ctrl.abort(s.reason)
  a.addEventListener("abort", forward(a), { once: true })
  b.addEventListener("abort", forward(b), { once: true })
  return ctrl.signal
}
