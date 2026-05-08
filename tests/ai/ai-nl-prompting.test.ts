/**
 * @jest-environment node
 */

/**
 * Natural-Language Prompting End-to-End Tests
 *
 * Drives the AI assistant via natural language only (no direct tool calls),
 * exactly the way a real user would type into the chat. Runs through the
 * full reasoning + tool-calling pipeline (runChat), monitors progress events,
 * and captures errors for triage.
 *
 * Each test:
 *   1. Creates a fresh conversation
 *   2. Sends a natural-language message
 *   3. Asserts that runChat returns without an error and produces an
 *      assistant response (and tool call(s) when relevant)
 *   4. Logs progress events + errors so failing prompts can be diagnosed
 */

import { runChat } from "@/lib/ai/chat"
import { createConversation, deleteConversation } from "@/lib/ai/conversations"
import { prisma } from "@/lib/db"

type ProgressEvent = {
  type: "step" | "tool_start" | "tool_complete" | "tool_error"
  step?: string
  toolName?: string
  toolArgs?: string
  toolResult?: string
}

const TEST_USER_ID = "nl-test-admin"
const PROMPT_TIMEOUT_MS = 90_000

async function runPrompt(prompt: string) {
  const conv = await createConversation({ title: `NL test: ${prompt.slice(0, 40)}` }, TEST_USER_ID)
  const progress: ProgressEvent[] = []
  try {
    const result = await runChat(
      conv.id,
      prompt,
      TEST_USER_ID,
      (p) => {
        progress.push(p)
      },
      { timeoutMs: PROMPT_TIMEOUT_MS, requestId: `nl-${Date.now()}` },
    )
    return { conv, result, progress }
  } finally {
    // best-effort cleanup
    try {
      await deleteConversation(conv.id)
    } catch {
      /* ignore */
    }
  }
}

function assistantText(result: Awaited<ReturnType<typeof runChat>>): string {
  const last = [...result.messages].reverse().find((m) => m.role === "assistant")
  return last?.content ?? ""
}

function toolCallsUsed(result: Awaited<ReturnType<typeof runChat>>): string[] {
  const names: string[] = []
  for (const m of result.messages) {
    if (m.role === "assistant" && m.toolCalls?.length) {
      for (const tc of m.toolCalls) names.push(tc.name)
    }
  }
  return names
}

/**
 * Inspect every tool message in the conversation and return tools that
 * actually failed validation / execution. Used to surface real upstream
 * tool errors that would otherwise be hidden inside the assistant's prose.
 */
function failedToolExecutions(result: Awaited<ReturnType<typeof runChat>>): Array<{
  tool: string
  error: string
}> {
  const failures: Array<{ tool: string; error: string }> = []
  for (const m of result.messages) {
    if (m.role !== "tool" || !m.toolResult) continue
    const content = m.toolResult.content ?? ""
    if (
      content.includes("invalid args for") ||
      content.includes("ZodError") ||
      content.startsWith("Error:") ||
      content.includes('"error"')
    ) {
      // Try to parse JSON tool results that wrap an error field
      try {
        const parsed = JSON.parse(content)
        if (parsed && typeof parsed === "object" && "error" in parsed && parsed.error) {
          failures.push({ tool: m.toolResult.name, error: String(parsed.error).slice(0, 200) })
          continue
        }
      } catch {
        /* non-JSON */
      }
      if (content.includes("invalid args for") || content.includes("ZodError")) {
        failures.push({ tool: m.toolResult.name, error: content.slice(0, 200) })
      }
    }
  }
  return failures
}

function summarize(label: string, prompt: string, r: Awaited<ReturnType<typeof runPrompt>>) {
  const failures = failedToolExecutions(r.result)
  // eslint-disable-next-line no-console
  console.log(
    `\n[NL TEST] ${label}\n  prompt: ${prompt}\n  error: ${r.result.error ?? "none"}\n  errorCode: ${r.result.errorCode ?? "-"}\n  tools: [${toolCallsUsed(r.result).join(", ")}]\n  toolFailures: ${failures.length === 0 ? "none" : failures.map((f) => `${f.tool}(${f.error.slice(0, 80)})`).join("; ")}\n  reply: ${assistantText(r.result).slice(0, 400).replace(/\n/g, " ")}\n  progressSteps: ${r.progress.length}`,
  )
}

describe("AI Assistant - Natural-language prompting", () => {
  jest.setTimeout(120_000)

  const hasLLM =
    Boolean(process.env.ANTHROPIC_API_KEY) ||
    Boolean(process.env.OPENAI_API_KEY) ||
    Boolean(process.env.AZURE_OPENAI_API_KEY) ||
    Boolean(process.env.XAI_API_KEY)

  beforeAll(() => {
    if (!hasLLM) {
      // eslint-disable-next-line no-console
      console.warn("No LLM API key configured — NL tests will be skipped")
    }
  })

  afterAll(async () => {
    // Belt-and-braces cleanup: drop any conversations created by this user
    try {
      await prisma.aiConversation.deleteMany({ where: { createdBy: TEST_USER_ID } })
    } catch {
      /* ignore */
    }
    await prisma.$disconnect().catch(() => {})
  })

  const cases: Array<{
    label: string
    prompt: string
    expectTool?: RegExp
    allowEmptyTools?: boolean
  }> = [
    {
      label: "list nodes",
      prompt: "List all my Hysteria2 nodes.",
      expectTool: /list_nodes/,
    },
    {
      label: "system status",
      prompt: "What's the current system status? Are there any errors?",
      expectTool: /system_status|troubleshoot|list_nodes/,
    },
    {
      label: "list deployments",
      prompt: "Show me my recent Azure deployments.",
      expectTool: /list_deployments|search_system/,
    },
    {
      label: "list payloads",
      prompt: "List all payload builds I have so far.",
      expectTool: /list_payloads/,
    },
    {
      label: "generate config (NL)",
      prompt:
        "Generate a Hysteria2 server config with salamander obfuscation enabled, masquerading as cloudflare.com.",
      expectTool: /generate_config/,
    },
    {
      label: "generate plan",
      prompt:
        "Plan the steps to deploy a new Hysteria2 node to Azure eastus and apply an obfuscated config to it.",
      expectTool: /generate_plan|check_prerequisites/,
    },
    {
      label: "check prerequisites",
      prompt: "Am I ready to deploy a node to Azure in eastus?",
      expectTool: /check_prerequisites/,
    },
    {
      label: "troubleshoot",
      prompt: "My node 'edge-01' looks unhealthy. Help me troubleshoot it.",
      expectTool: /troubleshoot|system_status|list_nodes|search_system/,
    },
    {
      label: "analyze traffic",
      prompt: "Analyze the recent traffic across all my nodes and flag anomalies.",
      expectTool: /analyze_traffic/,
    },
    {
      label: "generate Windows payload",
      prompt: "Build me a Windows x64 EXE payload with medium obfuscation.",
      expectTool: /generate_payload/,
    },
    {
      label: "smalltalk (no tools required)",
      prompt: "What can you help me with in this dashboard?",
      allowEmptyTools: true,
    },
    {
      label: "ambiguous follow-up",
      prompt: "Show me details for the first one you mentioned.",
      // Should NOT crash even if context is missing — assistant should ask or pick a tool
      allowEmptyTools: true,
    },
  ]

  it.each(cases)("$label → $prompt", async ({ label, prompt, expectTool, allowEmptyTools }) => {
    if (!hasLLM) return

    const r = await runPrompt(prompt)
    summarize(label, prompt, r)

    // Must not throw / must produce messages
    expect(r.result).toBeDefined()
    expect(Array.isArray(r.result.messages)).toBe(true)
    expect(r.result.messages.length).toBeGreaterThan(0)

    // No fatal error code (a tool may legitimately fail and that's surfaced
    // inside assistant text, but the run itself should complete).
    if (r.result.error) {
      // Surface error so we can fix it; don't silently pass.
      // Allowed: timeouts on heavy multi-step prompts (warn but don't crash CI)
      if (r.result.errorCode === "timeout") {
        // eslint-disable-next-line no-console
        console.warn(`[NL TEST] ${label} timed out — investigate orchestrator`)
      } else {
        throw new Error(
          `[NL TEST] ${label} returned error=${r.result.error} code=${r.result.errorCode}`,
        )
      }
    }

    // Assistant must produce a final reply
    const reply = assistantText(r.result)
    expect(reply.length).toBeGreaterThan(0)

    // Tool expectations
    const tools = toolCallsUsed(r.result)
    if (expectTool) {
      const matched = tools.some((t) => expectTool.test(t))
      if (!matched) {
        // eslint-disable-next-line no-console
        console.warn(
          `[NL TEST] ${label} expected tool matching ${expectTool} but got: [${tools.join(", ")}]`,
        )
      }
      expect(matched).toBe(true)
    } else if (!allowEmptyTools) {
      expect(tools.length).toBeGreaterThan(0)
    }

    // No tool execution should fail with arg-validation errors. These are
    // bugs in the planner / extractor, not legitimate runtime failures.
    const failures = failedToolExecutions(r.result)
    const argFailures = failures.filter((f) => /invalid args for|ZodError/.test(f.error))
    if (argFailures.length > 0) {
      throw new Error(
        `[NL TEST] ${label} had ${argFailures.length} arg-validation failure(s): ${argFailures
          .map((f) => `${f.tool}: ${f.error.slice(0, 120)}`)
          .join(" | ")}`,
      )
    }
  })
})
