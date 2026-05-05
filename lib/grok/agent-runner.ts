// ShadowGrok Agent Runner
// Enhanced agent runner with ShadowGrok tool calling and autonomous C2 operations

import { chatComplete, type ChatMessage } from '@/lib/ai/llm';
import { SHADOWGROK_TOOLS } from './grok-tools';
import { executeTool, type ToolContext } from './tool-executor';
import { prisma } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { buildSystemPrompt, buildDynamicContext, Role, Persona } from '@/lib/ai/system-prompt';

export interface ShadowGrokRunOptions {
  conversationId?: string;
  nodeContext?: Record<string, unknown>;
  requireApproval?: boolean;
  maxToolRounds?: number;
  /** Operational persona — shapes TTP priorities for this execution */
  persona?: Persona;
  /** High-level goal injected into the runtime context block */
  operationGoal?: string;
  /** Enable early termination when task appears complete */
  enableEarlyTermination?: boolean;
  /** Enable context window optimization */
  optimizeContextWindow?: boolean;
  /** Enable caching for tool execution */
  enableToolCache?: boolean;
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
  const env = serverEnv()
  const {
    conversationId,
    nodeContext,
    requireApproval = env.SHADOWGROK_REQUIRE_APPROVAL,
    maxToolRounds = env.SHADOWGROK_MAX_TOOL_ROUNDS,
    persona,
    operationGoal,
    enableEarlyTermination = true,
    optimizeContextWindow = true,
    enableToolCache = true,
  } = options;

  console.log(`[ShadowGrok] Starting autonomous execution for user: ${invokerUid}`);
  console.log(`[ShadowGrok] Performance options: earlyTermination=${enableEarlyTermination}, contextOpt=${optimizeContextWindow}, toolCache=${enableToolCache}`);

  // Build dynamic context: live DB state + optional nodeContext + operation goal
  const nodeCtxStr = nodeContext
    ? `Node Context:\n${JSON.stringify(nodeContext, null, 2)}`
    : undefined;
  const dynamicCtx = await buildDynamicContext({ operationGoal });
  const extraContext = [dynamicCtx, nodeCtxStr].filter(Boolean).join("\n\n");

  const systemPrompt = buildSystemPrompt(Role.ShadowGrok, { persona, extraContext });

  // Build message history (let: trimmed in-place when optimizing context window)
  let messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  const toolExecutions: ShadowGrokResult['toolExecutions'] = [];
  let continueLoop = true;
  let finalResponse = '';
  let round = 0;

  const signal = AbortSignal.timeout(env.SHADOWGROK_EXECUTION_TIMEOUT_MS);

  const executionContext: ToolContext = {
    userId: invokerUid,
    conversationId,
    enableCache: enableToolCache,
  };

  try {
    while (continueLoop && round < maxToolRounds) {
      round++;
      console.log(`[ShadowGrok] Tool round ${round}/${maxToolRounds}`);

      // Context window optimization: trim message history if too long
      if (optimizeContextWindow && messages.length > 10) {
        // Keep system prompt, last 5 user/assistant exchanges
        const systemMsg = messages[0];
        const recentMessages = messages.slice(-10);
        messages = [systemMsg, ...recentMessages];
        console.log(`[ShadowGrok] Context window optimized: trimmed from ${messages.length + 10} to ${messages.length} messages`);
      }

      // Adjust temperature based on aggressiveness
      const temperature = env.SHADOWGROK_TOOL_CALLING_AGGRESSIVENESS === 'aggressive' ? 0.8 :
                         env.SHADOWGROK_TOOL_CALLING_AGGRESSIVENESS === 'conservative' ? 0.3 : 0.6;

      // Call LLM with tools
      const response = await chatComplete({
        messages,
        tools: SHADOWGROK_TOOLS as any,
        temperature,
        signal,
        useShadowGrok: true,
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

        // Execute tools with parallel execution support
        let toolResults;
        if (env.SHADOWGROK_ENABLE_PARALLEL_EXECUTION && response.toolCalls.length > 1) {
          // Execute tools in parallel batches
          const batchSize = env.SHADOWGROK_PARALLEL_BATCH_SIZE;
          const batches: typeof response.toolCalls[] = [];
          for (let i = 0; i < response.toolCalls.length; i += batchSize) {
            batches.push(response.toolCalls.slice(i, i + batchSize));
          }

          toolResults = [];
          for (const batch of batches) {
            const batchResults = await Promise.all(
              batch.map(async (toolCall) => {
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
            toolResults.push(...batchResults);
          }
        } else {
          // Sequential execution
          toolResults = await Promise.all(
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
        }

        // Add tool results to conversation
        for (const toolResult of toolResults) {
          messages.push({
            role: 'tool',
            tool_call_id: toolResult.tool_call_id,
            content: toolResult.content,
          });
        }

        // Check if any tools require approval (with auto-approve threshold)
        const approvalRequired = toolExecutions.some(te => te.requiresApproval);
        if (approvalRequired && requireApproval) {
          // Check if risk score is below auto-approve threshold
          const lowRiskTools = toolExecutions.filter(te =>
            !te.requiresApproval ||
            (te.result && typeof te.result === 'object' && 'risk_score' in te.result &&
             (te.result as any).risk_score < env.SHADOWGROK_AUTO_APPROVE_THRESHOLD)
          );

          if (lowRiskTools.length === toolExecutions.length && env.SHADOWGROK_AUTO_APPROVE_LOW_RISK) {
            console.log(`[ShadowGrok] Auto-approving low-risk tools`);
            // Continue execution without pausing
          } else {
            finalResponse = 'Execution paused: One or more tools require admin approval. Please review the pending actions in the approval panel.';
            continueLoop = false;
            break;
          }
        }

        // Early termination: check if task appears complete
        if (enableEarlyTermination) {
          const completionIndicators = [
            'done', 'complete', 'completed', 'finished', 'success',
            'deployed', 'created', 'generated', 'executed', 'accomplished'
          ];
          
          const lastAssistantContent = assistantMessage.content?.toLowerCase() || '';
          const taskComplete = completionIndicators.some(indicator => 
            lastAssistantContent.includes(indicator)
          );
          
          // Also check if all tools succeeded
          const allToolsSucceeded = toolExecutions.every(te => te.success);
          
          if (taskComplete && allToolsSucceeded && toolExecutions.length > 0) {
            console.log(`[ShadowGrok] Early termination: task appears complete based on response analysis`);
            finalResponse = assistantMessage.content || '';
            continueLoop = false;
            break;
          }
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
    type: 'tool_call' | 'tool_result' | 'content' | 'error' | 'batch_start' | 'batch_complete';
    data: unknown;
  }) => void,
  options: ShadowGrokRunOptions = {}
): Promise<ShadowGrokResult> {
  const env = serverEnv()
  const {
    conversationId,
    nodeContext,
    requireApproval = env.SHADOWGROK_REQUIRE_APPROVAL,
    persona,
    operationGoal,
  } = options;

  // Build dynamic context: live DB state + optional nodeContext + operation goal
  const nodeCtxStr = nodeContext
    ? `Node Context:\n${JSON.stringify(nodeContext, null, 2)}`
    : undefined;
  const dynamicCtx = await buildDynamicContext({ operationGoal });
  const extraContext = [dynamicCtx, nodeCtxStr].filter(Boolean).join("\n\n");

  const systemPrompt = buildSystemPrompt(Role.ShadowGrok, { persona, extraContext });

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  const toolExecutions: ShadowGrokResult['toolExecutions'] = [];
  let finalResponse = '';
  let round = 0;

  const signal = AbortSignal.timeout(env.SHADOWGROK_EXECUTION_TIMEOUT_MS);

  const executionContext: ToolContext = {
    userId: invokerUid,
    conversationId,
  };

  try {
    while (round < env.SHADOWGROK_MAX_TOOL_ROUNDS) {
      round++;

      // Adjust temperature based on aggressiveness
      const temperature = env.SHADOWGROK_TOOL_CALLING_AGGRESSIVENESS === 'aggressive' ? 0.8 :
                         env.SHADOWGROK_TOOL_CALLING_AGGRESSIVENESS === 'conservative' ? 0.3 : 0.6;

      const response = await chatComplete({
        messages,
        tools: SHADOWGROK_TOOLS as any,
        temperature,
        signal,
        useShadowGrok: true,
      });

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.content ?? '',
        tool_calls: response.toolCalls,
      };
      messages.push(assistantMessage);

      if (response.toolCalls && response.toolCalls.length > 0) {
        // Execute tools with parallel execution support
        if (env.SHADOWGROK_ENABLE_PARALLEL_EXECUTION && response.toolCalls.length > 1) {
          const batchSize = env.SHADOWGROK_PARALLEL_BATCH_SIZE;
          const batches: typeof response.toolCalls[] = [];
          for (let i = 0; i < response.toolCalls.length; i += batchSize) {
            batches.push(response.toolCalls.slice(i, i + batchSize));
          }

          for (const batch of batches) {
            onProgress({
              type: 'batch_start',
              data: { toolCount: batch.length, batchSize },
            });

            const batchResults = await Promise.all(
              batch.map(async (toolCall) => {
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

                return result;
              })
            );

            onProgress({
              type: 'batch_complete',
              data: { completed: batchResults.length },
            });

            // Check for approval requirement after each batch
            const approvalRequired = batchResults.some(r => r.requiresApproval);
            if (approvalRequired && requireApproval) {
              const lowRiskTools = batchResults.filter(r =>
                !r.requiresApproval ||
                (r.data && typeof r.data === 'object' && 'risk_score' in r.data &&
                 (r.data as any).risk_score < env.SHADOWGROK_AUTO_APPROVE_THRESHOLD)
              );

              if (lowRiskTools.length === batchResults.length && env.SHADOWGROK_AUTO_APPROVE_LOW_RISK) {
                console.log(`[ShadowGrok Stream] Auto-approving low-risk tools in batch`);
              } else {
                finalResponse = 'Execution paused: Approval required for one or more actions.';
                return {
                  finalResponse,
                  toolExecutions,
                };
              }
            }
          }
        } else {
          // Sequential execution
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

            if (result.requiresApproval && requireApproval) {
              finalResponse = 'Execution paused: Approval required for one or more actions.';
              return {
                finalResponse,
                toolExecutions,
              };
            }
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
  const env = serverEnv()

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
    if (assessment.risk_assessment.risk_score > env.SHADOWGROK_RISK_THRESHOLD) {
      return {
        allowed: false,
        reason: `Risk score exceeds threshold (${env.SHADOWGROK_RISK_THRESHOLD}). Requires senior operator approval.`,
        riskLevel: assessment.risk_assessment.risk_level,
      };
    }
  }

  return { allowed: true };
}