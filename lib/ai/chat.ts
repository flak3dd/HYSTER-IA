import { chatComplete, type ChatMessage } from "@/lib/agents/llm"
import { aiToolDefinitions, runAiTool } from "@/lib/ai/tools"
import { appendMessages, getConversation } from "@/lib/ai/conversations"
import type { AiMessage } from "@/lib/ai/types"

const MAX_TOOL_ROUNDS = 10

// Format tool results for human-readable summary
function formatToolResultSummary(toolName: string, result: unknown): string {
  if (toolName === "generate_payload") {
    const r = result as { buildId: string; preview: { name: string; type: string; status: string }; explanation: string }
    return `**Payload Build Started**

**Build ID**: \`${r.buildId}\`
**Name**: ${r.preview.name}
**Type**: ${r.preview.type.replace("_", " ").toUpperCase()}
**Status**: ${r.preview.status}

${r.explanation}

The build is now in progress. Use "Check status of ${r.buildId}" to see when it's ready for download.`
  }
  
  if (toolName === "list_payloads") {
    const r = result as { payloads: Array<{ id: string; name: string; type: string; status: string; sizeBytes?: number }>; total: number }
    if (r.payloads.length === 0) {
      return "No payload builds found. Generate one with: \"Build a Windows EXE payload\""
    }
    const list = r.payloads.map(p => 
      `- **${p.name}** (\`${p.id.slice(0, 8)}\`) — ${p.type.replace("_", " ").toUpperCase()} — ${p.status}${p.sizeBytes ? ` — ${(p.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ""}`
    ).join("\n")
    return `**Your Payload Builds** (${r.total} total)\n\n${list}`
  }
  
  return `Tool \`${toolName}\` executed successfully.`
}

// Simple rule-based payload intent detection (used when LLM unavailable)
function detectPayloadIntent(message: string): { toolName: string; args: Record<string, unknown> } | null {
  const lower = message.toLowerCase()
  
  // List payloads intent
  if (lower.includes("list") && (lower.includes("payload") || lower.includes("build"))) {
    return { toolName: "list_payloads", args: { limit: 20 } }
  }
  
  // Generate payload intent
  if (lower.includes("generate") || lower.includes("build") || lower.includes("create")) {
    if (lower.includes("payload") || lower.includes("exe") || lower.includes("elf") || 
        lower.includes("powershell") || lower.includes("python") || lower.includes("script")) {
      return { toolName: "generate_payload", args: { description: message } }
    }
  }
  
  // Get payload status intent
  if ((lower.includes("status") || lower.includes("ready") || lower.includes("done")) && 
      (lower.includes("payload") || lower.includes("build"))) {
    return { toolName: "list_payloads", args: { limit: 10 } }
  }
  
  return null
}

const SYSTEM_PROMPT = [
  "You are a multi-tool operations assistant inside a Hysteria 2 admin panel.",
  "You help administrators manage their Hysteria2 proxy infrastructure and create payloads for security testing.",
  "",
  "Available capabilities:",
  "- Generate Hysteria2 server configurations from natural language descriptions",
  "- Analyze traffic stats to find anomalies (high bandwidth users, expired/disabled users still online)",
  "- Suggest masquerade proxy targets (CDN, video, cloud, general)",
  "- Troubleshoot server issues (TLS, throughput, connectivity, auth)",
  "- List configuration profiles",
  "- View server logs",
  "- **Generate payloads** (Windows EXE, Linux ELF, macOS APP, PowerShell, Python) with obfuscation",
  "- **List and monitor payload builds** with download links when ready",
  "- **Delete payloads** when no longer needed",
  "",
  "Payload Guidelines:",
  "- Always ask for platform preference if not specified (Windows/Linux/macOS)",
  "- Recommend obfuscation level based on use case (light=testing, heavy=stealth)",
  "- Explain the build process and estimated completion time",
  "- Provide download links when builds complete",
  "- Remind users that payloads include embedded Hysteria2 client configs",
  "",
  "General Guidelines:",
  "- Use tools to gather real data before answering questions about the system state.",
  "- When generating configs or payloads, always remind the admin to review before applying.",
  "- Be concise and actionable. Prefer tool calls over speculation.",
  "- If you cannot accomplish something with the available tools, say so clearly.",
  "- Format configs, code, and technical output in code blocks.",
  "- Do not attempt to evade rate limits or bypass access controls on external sites.",
].join("\n")

/**
 * Run a multi-turn chat with tool calling. Appends the user message and all
 * assistant/tool messages to the conversation in Firestore, then returns the
 * full list of new messages produced in this turn.
 */
export async function runChat(
  conversationId: string,
  userMessage: string,
  invokerUid: string,
): Promise<{ messages: AiMessage[]; error?: string }> {
  const conversation = await getConversation(conversationId)
  if (!conversation) {
    return { messages: [], error: "conversation not found" }
  }

  const now = Date.now()
  const userMsg: AiMessage = {
    role: "user",
    content: userMessage,
    timestamp: now,
  }

  // Build LLM message history from conversation
  const llmMessages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ]

  // Include existing conversation messages (limited to last 40 for context window)
  const recentMessages = conversation.messages.slice(-40)
  for (const msg of recentMessages) {
    if (msg.role === "user" || msg.role === "assistant") {
      const chatMsg: ChatMessage = {
        role: msg.role,
        content: msg.content ?? "",
      }
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        chatMsg.tool_calls = msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        }))
      }
      llmMessages.push(chatMsg)
    } else if (msg.role === "tool" && msg.toolResult) {
      llmMessages.push({
        role: "tool",
        content: msg.toolResult.content,
        tool_call_id: msg.toolResult.toolCallId,
      })
    }
  }

  // Add the new user message
  llmMessages.push({ role: "user", content: userMessage })

  const tools = aiToolDefinitions()
  const newMessages: AiMessage[] = [userMsg]

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let result: { content: string | null; toolCalls: { id: string; type: "function"; function: { name: string; arguments: string } }[]; finishReason: string | null }
      
      try {
        result = await chatComplete({
          messages: llmMessages,
          tools,
          temperature: 0.3,
        })
      } catch (llmErr) {
        // LLM unavailable - try rule-based fallback for payload intents
        const payloadIntent = detectPayloadIntent(userMessage)
        if (payloadIntent) {
          // Execute the tool directly
          const toolResult = await runAiTool(
            payloadIntent.toolName,
            payloadIntent.args,
            { signal: AbortSignal.timeout(60_000), invokerUid }
          )
          
          // Create synthetic responses
          const assistantMsg: AiMessage = {
            role: "assistant",
            content: `I'll help you with that. Executing ${payloadIntent.toolName}...`,
            toolCalls: [{
              id: `fallback-${Date.now()}`,
              name: payloadIntent.toolName,
              arguments: JSON.stringify(payloadIntent.args),
            }],
            timestamp: Date.now(),
          }
          newMessages.push(assistantMsg)
          
          const toolMsg: AiMessage = {
            role: "tool",
            content: null,
            toolResult: {
              toolCallId: `fallback-${Date.now()}`,
              name: payloadIntent.toolName,
              content: JSON.stringify(toolResult),
            },
            timestamp: Date.now(),
          }
          newMessages.push(toolMsg)
          
          // Add final summary message
          const summaryMsg: AiMessage = {
            role: "assistant",
            content: formatToolResultSummary(payloadIntent.toolName, toolResult),
            timestamp: Date.now(),
          }
          newMessages.push(summaryMsg)
          
          await appendMessages(conversationId, newMessages)
          return { messages: newMessages }
        }
        
        // No payload intent detected, re-throw the LLM error
        throw llmErr
      }

      if (result.toolCalls.length > 0) {
        // Assistant message with tool calls
        const assistantMsg: AiMessage = {
          role: "assistant",
          content: result.content,
          toolCalls: result.toolCalls.map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
          })),
          timestamp: Date.now(),
        }
        newMessages.push(assistantMsg)
        llmMessages.push({
          role: "assistant",
          content: result.content ?? "",
          tool_calls: result.toolCalls,
        })

        // Execute each tool call
        for (const call of result.toolCalls) {
          let parsedArgs: unknown = {}
          try {
            parsedArgs = call.function.arguments
              ? JSON.parse(call.function.arguments)
              : {}
          } catch {
            parsedArgs = {}
          }

          let resultContent: string
          try {
            const toolResult = await runAiTool(
              call.function.name,
              parsedArgs,
              { signal: AbortSignal.timeout(60_000), invokerUid },
            )
            resultContent = JSON.stringify(toolResult)
          } catch (err) {
            resultContent = JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
            })
          }

          const toolMsg: AiMessage = {
            role: "tool",
            content: null,
            toolResult: {
              toolCallId: call.id,
              name: call.function.name,
              content: resultContent,
            },
            timestamp: Date.now(),
          }
          newMessages.push(toolMsg)
          llmMessages.push({
            role: "tool",
            content: resultContent,
            tool_call_id: call.id,
          })
        }

        // Continue loop — LLM may want to call more tools or produce final answer
        continue
      }

      // No tool calls — this is the final assistant response
      const finalMsg: AiMessage = {
        role: "assistant",
        content: result.content,
        timestamp: Date.now(),
      }
      newMessages.push(finalMsg)
      break
    }

    // Persist all new messages
    await appendMessages(conversationId, newMessages)

    return { messages: newMessages }
  } catch (err) {
    // Still persist what we have so far
    if (newMessages.length > 0) {
      await appendMessages(conversationId, newMessages).catch(() => {})
    }
    return {
      messages: newMessages,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
