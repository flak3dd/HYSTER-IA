/**
 * ShadowGrok Enhanced Agent Runner
 * Integrates natural language workflow orchestration with the full C2 tool registry,
 * ShadowGrokExecution tracking, approval workflow, and Prisma audit trail.
 */

import { prisma } from "@/lib/db";
import { executeTool, ToolContext, ToolResult } from "./tool-executor";
import { SHADOWGROK_TOOLS, ALL_TOOL_NAMES } from "./grok-tools";
import { chatComplete, type ChatMessage } from "@/lib/agents/llm";

const SHADOWGROK_SYSTEM_PROMPT = `You are ShadowGrok, an elite AI red team operative and stealth C2 specialist.

You have access to a powerful set of C2 tools for natural language workflow orchestration.
Use them proactively to complete complex operations end-to-end while maintaining strict OPSEC.

CORE RULES:
- Always assess risk with assess_opsec_risk before high-impact actions.
- High-risk tools (trigger_kill_switch global/immediate, run_panel_command) require human approval.
- Prefer stealthy, low-and-slow approaches.
- Return structured, actionable results.
- When a multi-phase operation is requested, use orchestrate_full_operation first to create a plan, then execute phase by phase.

Available tools: ${ALL_TOOL_NAMES.join(", ")}`;

export interface RunAgentOptions {
  prompt: string;
  userId: string;
  conversationId?: string;
  allowedTools?: string[];
  maxSteps?: number;
  model?: string;
  dryRun?: boolean;
}

export async function runShadowGrokAgent(options: RunAgentOptions) {
  const {
    prompt,
    userId,
    conversationId,
    allowedTools = ALL_TOOL_NAMES,
    maxSteps = 12,
    model = process.env.LLM_MODEL || "grok-4.20-reasoning",
    dryRun = false,
  } = options;

  // 1. Create ShadowGrokExecution record
  const execution = await prisma.shadowGrokExecution.create({
    data: {
      userId,
      userMessage: prompt,
      finalResponse: "",
      model,
      status: "running",
      approvalRequired: false,
    },
  });

  // 2. Create AgentTask for compatibility with existing system
  const agentTask = await prisma.agentTask.create({
    data: {
      prompt,
      model,
      allowedTools: JSON.stringify(allowedTools),
      maxSteps,
      createdBy: userId,
      status: "running",
    },
  });

  const messages: ChatMessage[] = [
    { role: "system", content: SHADOWGROK_SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ];

  let stepCount = 0;
  let finalResponse = "";
  const toolResults: any[] = [];

  try {
    while (stepCount < maxSteps) {
      stepCount++;

      const response = await chatComplete({
        messages,
        tools: SHADOWGROK_TOOLS.filter(t => allowedTools.includes(t.function.name)),
        model,
        temperature: 0.6,
      });

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: response.content ?? "",
        tool_calls: response.toolCalls,
      };
      messages.push(assistantMsg);

      // Record step
      await prisma.agentStep.create({
        data: {
          taskId: agentTask.id,
          index: stepCount,
          kind: assistantMsg.tool_calls ? "tool_call" : "reasoning",
          content: assistantMsg.content || "",
          tool: assistantMsg.tool_calls?.[0]?.function?.name,
          arguments: assistantMsg.tool_calls?.[0]?.function?.arguments
            ? JSON.parse(assistantMsg.tool_calls[0].function.arguments)
            : null,
        },
      });

      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        finalResponse = assistantMsg.content || "";
        break;
      }

      // Execute tools
      for (const toolCall of assistantMsg.tool_calls) {
        const toolName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments || "{}");

        const context: ToolContext = {
          userId,
          conversationId,
          executionId: execution.id,
          dryRun,
        };

        const result: ToolResult = await executeTool(toolName, args, context);
        toolResults.push({ tool: toolName, result });

        // Record tool result in step
        await prisma.agentStep.updateMany({
          where: { taskId: agentTask.id, index: stepCount },
          data: {
            result: result as any,
          },
        });

        // Append tool result to conversation
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });

        // Check if approval required
        if (result.requiresApproval) {
          await prisma.shadowGrokExecution.update({
            where: { id: execution.id },
            data: { approvalRequired: true, status: "pending_approval" },
          });
          finalResponse = `Operation paused for approval. Tool: ${toolName}. Approval ID: ${result.approvalId}`;
          break;
        }
      }

      if (finalResponse.includes("paused for approval")) break;
    }

    // Finalize execution
    await prisma.shadowGrokExecution.update({
      where: { id: execution.id },
      data: {
        finalResponse,
        status: finalResponse.includes("paused") ? "pending_approval" : "completed",
        toolExecutions: toolResults.length,
        successfulExecutions: toolResults.filter(r => r.result.success).length,
        failedExecutions: toolResults.filter(r => !r.result.success).length,
      },
    });

    await prisma.agentTask.update({
      where: { id: agentTask.id },
      data: {
        status: "completed",
        result: finalResponse,
        stepCount,
        finishedAt: new Date(),
      },
    });

    return {
      executionId: execution.id,
      agentTaskId: agentTask.id,
      finalResponse,
      toolResults,
      steps: stepCount,
    };

  } catch (error: any) {
    await prisma.shadowGrokExecution.update({
      where: { id: execution.id },
      data: { status: "failed", error: error.message },
    });
    await prisma.agentTask.update({
      where: { id: agentTask.id },
      data: { status: "failed", error: error.message },
    });
    throw error;
  }
}