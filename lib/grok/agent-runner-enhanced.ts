/**
 * ShadowGrok Enhanced Agent Runner
 * Integrates natural language workflow orchestration with the full C2 tool registry,
 * ShadowGrokExecution tracking, approval workflow, and Prisma audit trail.
 */

import { prisma } from "@/lib/db";
import { executeTool, ToolContext, ToolResult } from "./tool-executor";
import { SHADOWGROK_TOOLS, ALL_TOOL_NAMES } from "./grok-tools";
import { chatComplete, type ChatMessage } from "@/lib/ai/llm";
import { serverEnv } from "@/lib/env";
import { buildSystemPrompt, buildDynamicContext, Role, Persona } from "@/lib/ai/system-prompt";

export interface RunAgentOptions {
  prompt: string;
  userId: string;
  conversationId?: string;
  allowedTools?: string[];
  maxSteps?: number;
  model?: string;
  dryRun?: boolean;
  /** Operational persona — shapes TTP priorities for this execution */
  persona?: Persona;
  /** High-level goal injected into the runtime context block */
  operationGoal?: string;
}

export async function runShadowGrokAgent(options: RunAgentOptions) {
  const env = serverEnv()
  // Resolve default model from the active provider configuration
  const defaultModel =
    (env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_API_KEY)
      ? env.AZURE_OPENAI_DEPLOYMENT
      : env.XAI_API_KEY
      ? env.XAI_MODEL
      : env.OPENROUTER_API_KEY
      ? env.OPENROUTER_MODEL
      : env.LLM_MODEL

  const {
    prompt,
    userId,
    conversationId,
    allowedTools = ALL_TOOL_NAMES,
    maxSteps = env.SHADOWGROK_MAX_TOOL_ROUNDS,
    model = defaultModel,
    dryRun = false,
    persona,
    operationGoal,
  } = options;

  // Build dynamic context block with live DB state + operation goal
  const dynamicCtx = await buildDynamicContext({
    operationGoal,
    toolListSummary: allowedTools.join(", "),
  });

  const systemPrompt = buildSystemPrompt(Role.ShadowGrok, {
    persona,
    extraContext: dynamicCtx,
  });

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
    { role: "system", content: systemPrompt },
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
        useShadowGrok: true,
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