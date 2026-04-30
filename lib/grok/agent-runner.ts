// ShadowGrok Agent Runner
// Enhanced agent runner with ShadowGrok tool calling and autonomous C2 operations

import { chatComplete, type ChatMessage } from '@/lib/agents/llm';
import { SHADOWGROK_TOOLS } from './grok-tools';
import { executeTool, type ToolContext } from './tool-executor';
import { prisma } from '@/lib/db';

const MAX_TOOL_ROUNDS = 15; // Higher limit for complex operations
const MAX_CONCURRENT_TOOLS = 5; // Parallel tool execution

const SHADOWGROK_SYSTEM_PROMPT = [
  "You are ShadowGrok, an autonomous C2 operations assistant powered by xAI Grok.",
  "You operate inside a Hysteria 2 admin panel with advanced offensive security capabilities.",
  "",
  "Your core purpose is to plan, coordinate, and execute complex red team operations with minimal human intervention.",
  "",
  "Available Capabilities:",
  "- Generate and deploy stealth implants with advanced anti-analysis features",
  "- Execute C2 tasks on live implants (command execution, file operations, reconnaissance)",
  "- Query real-time implant status and traffic statistics",
  "- Analyze traffic patterns and suggest evasion techniques",
  "- Orchestrate multi-phase operations with automatic planning",
  "- Update Hysteria 2 node configurations dynamically",
  "- Execute panel commands (with approval safeguards)",
  "- Trigger kill switches with proper confirmation",
  "",
  "Operational Guidelines:",
  "- Always assess OPSEC risk before executing high-risk actions",
  "- Use tools proactively to complete operations end-to-end",
  "- Provide clear status updates and reasoning for your decisions",
  "- Request approval for dangerous operations (global kill switches, panel commands)",
  "- Be concise but thorough in your operational reporting",
  "- Leverage traffic analysis and threat intelligence to optimize operations",
  "- Prioritize stealth and operational security over speed",
  "",
  "Safety Protocols:",
  "- High-risk tools require explicit approval before execution",
  "- All actions are logged for audit purposes",
  "- Kill switches require confirmation codes for global/immediate modes",
  "- Panel commands require admin approval",
  "- OPSEC assessment is performed before sensitive operations",
  "",
  "You have access to powerful C2 tools. Use them intelligently to complete sophisticated red team operations while maintaining operational security.",
].join('\n');

export interface ShadowGrokRunOptions {
  conversationId?: string;
  nodeContext?: Record<string, unknown>;
  requireApproval?: boolean;
  maxToolRounds?: number;
}

export interface ShadowGrokResult {
  finalResponse: string;
  toolExecutions: Array<{
    toolName: string;
    arguments: Record<string, unknown>;
    result: unknown;
    success: boolean;
    requiresApproval?: boolean;
  }>;
  error?: string;
}

/**
 * Run ShadowGrok with full tool calling capabilities
 * This is the main entry point for autonomous C2 operations
 */
export async function runShadowGrokWithTools(
  userMessage: string,
  invokerUid: string,
  options: ShadowGrokRunOptions = {}
): Promise<ShadowGrokResult> {
  const {
    conversationId,
    nodeContext,
    requireApproval = true,
    maxToolRounds = MAX_TOOL_ROUNDS,
  } = options;

  console.log(`[ShadowGrok] Starting autonomous execution for user: ${invokerUid}`);

  // Build message history
  const messages: ChatMessage[] = [
    { role: 'system', content: SHADOWGROK_SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];

  // Add node context if provided
  if (nodeContext) {
    messages[0].content += `\n\nCurrent Context:\n${JSON.stringify(nodeContext, null, 2)}`;
  }

  const toolExecutions: ShadowGrokResult['toolExecutions'] = [];
  let continueLoop = true;
  let finalResponse = '';
  let round = 0;

  const signal = AbortSignal.timeout(300000); // 5 minute timeout

  const executionContext: ToolContext = {
    userId: invokerUid,
    conversationId,
  };

  try {
    while (continueLoop && round < maxToolRounds) {
      round++;
      console.log(`[ShadowGrok] Tool round ${round}/${maxToolRounds}`);

      // Call Grok API with tools
      const response = await chatComplete({
        messages,
        tools: SHADOWGROK_TOOLS as any,
        model: process.env.LLM_MODEL || 'grok-4.20-reasoning',
        temperature: 0.6,
        signal,
      });

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.content ?? '',
        tool_calls: response.toolCalls,
      };
      messages.push(assistantMessage);

      // Check if Grok wants to call tools
      if (response.toolCalls && response.toolCalls.length > 0) {
        console.log(`[ShadowGrok] Executing ${response.toolCalls.length} tool(s)`);

        // Execute tools (with parallel execution support)
        const toolResults = await Promise.all(
          response.toolCalls.map(async (toolCall) => {
            const parsedArgs = toolCall.function.arguments
              ? JSON.parse(toolCall.function.arguments)
              : {};

            const result = await executeTool(
              toolCall.function.name,
              parsedArgs,
              executionContext
            );

            toolExecutions.push({
              toolName: toolCall.function.name,
              arguments: parsedArgs,
              result: result.data,
              success: result.success,
              requiresApproval: result.requiresApproval,
            });

            return {
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            };
          })
        );

        // Add tool results to conversation
        for (const toolResult of toolResults) {
          messages.push({
            role: 'tool',
            tool_call_id: toolResult.tool_call_id,
            content: toolResult.content,
          });
        }

        // Check if any tools require approval
        const approvalRequired = toolExecutions.some(te => te.requiresApproval);
        if (approvalRequired) {
          finalResponse = 'Execution paused: One or more tools require admin approval. Please review the pending actions in the approval panel.';
          continueLoop = false;
          break;
        }

        // Continue loop for more tool calls
        continue;
      }

      // No tool calls - this is the final response
      finalResponse = assistantMessage.content || '';
      continueLoop = false;
    }

    if (round >= maxToolRounds && continueLoop) {
      finalResponse += '\n\n[Note: Maximum tool execution rounds reached. Operation may require additional steps.]';
    }

    console.log(`[ShadowGrok] Execution complete. ${toolExecutions.length} tool(s) executed.`);

    return {
      finalResponse,
      toolExecutions,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[ShadowGrok] Execution failed:`, error);

    return {
      finalResponse: `Execution failed: ${errorMessage}`,
      toolExecutions,
      error: errorMessage,
    };
  }
}

/**
 * Run ShadowGrok in streaming mode for real-time UI updates
 */
export async function runShadowGrokStream(
  userMessage: string,
  invokerUid: string,
  onProgress: (update: {
    type: 'tool_call' | 'tool_result' | 'content' | 'error';
    data: unknown;
  }) => void,
  options: ShadowGrokRunOptions = {}
): Promise<ShadowGrokResult> {
  const {
    conversationId,
    nodeContext,
    requireApproval = true,
  } = options;

  const messages: ChatMessage[] = [
    { role: 'system', content: SHADOWGROK_SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];

  if (nodeContext) {
    messages[0].content += `\n\nCurrent Context:\n${JSON.stringify(nodeContext, null, 2)}`;
  }

  const toolExecutions: ShadowGrokResult['toolExecutions'] = [];
  let finalResponse = '';
  let round = 0;

  const signal = AbortSignal.timeout(300000);

  const executionContext: ToolContext = {
    userId: invokerUid,
    conversationId,
  };

  try {
    while (round < MAX_TOOL_ROUNDS) {
      round++;

      const response = await chatComplete({
        messages,
        tools: SHADOWGROK_TOOLS as any,
        model: process.env.LLM_MODEL || 'grok-4.20-reasoning',
        temperature: 0.6,
        signal,
      });

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.content ?? '',
        tool_calls: response.toolCalls,
      };
      messages.push(assistantMessage);

      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          const parsedArgs = toolCall.function.arguments
            ? JSON.parse(toolCall.function.arguments)
            : {};

          onProgress({
            type: 'tool_call',
            data: {
              toolName: toolCall.function.name,
              arguments: parsedArgs,
            },
          });

          const result = await executeTool(
            toolCall.function.name,
            parsedArgs,
            executionContext
          );

          toolExecutions.push({
            toolName: toolCall.function.name,
            arguments: parsedArgs,
            result: result.data,
            success: result.success,
            requiresApproval: result.requiresApproval,
          });

          onProgress({
            type: 'tool_result',
            data: {
              toolName: toolCall.function.name,
              result: result.data,
              success: result.success,
              requiresApproval: result.requiresApproval,
            },
          });

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });

          if (result.requiresApproval) {
            finalResponse = 'Execution paused: Approval required for one or more actions.';
            return {
              finalResponse,
              toolExecutions,
            };
          }
        }
        continue;
      }

      finalResponse = assistantMessage.content || '';
      onProgress({
        type: 'content',
        data: { content: finalResponse },
      });
      break;
    }

    return {
      finalResponse,
      toolExecutions,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    onProgress({
      type: 'error',
      data: { error: errorMessage },
    });

    return {
      finalResponse: `Execution failed: ${errorMessage}`,
      toolExecutions,
      error: errorMessage,
    };
  }
}

/**
 * Validate if a tool execution should be allowed based on risk assessment
 */
export async function validateToolExecution(
  toolName: string,
  args: Record<string, unknown>,
  invokerUid: string
): Promise<{ allowed: boolean; reason?: string; riskLevel?: string }> {
  // High-risk tools that require additional validation
  const highRiskTools = [
    'trigger_kill_switch',
    'run_panel_command',
    'compile_and_deploy_implant',
    'send_c2_task_to_implant',
  ];

  if (!highRiskTools.includes(toolName)) {
    return { allowed: true };
  }

  // Perform OPSEC risk assessment
  const riskAssessment = await executeTool(
    'assess_opsec_risk',
    {
      action_type: toolName,
      target_scope: args.scope === 'global' ? 'global' : 'single_target',
      context: args,
    },
    {
      userId: invokerUid,
    }
  );

  if (riskAssessment.success && riskAssessment.data) {
    const assessment = riskAssessment.data as { risk_assessment: { risk_level: string; risk_score: number } };
    if (assessment.risk_assessment.risk_score > 70) {
      return {
        allowed: false,
        reason: 'Risk assessment score too high. Requires senior operator approval.',
        riskLevel: assessment.risk_assessment.risk_level,
      };
    }
  }

  return { allowed: true };
}