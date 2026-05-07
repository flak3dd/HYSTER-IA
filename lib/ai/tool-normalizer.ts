/**
 * Tool Call Normalization and Standardization Layer
 * 
 * This module ensures all tool calls follow a consistent format regardless of
 * which AI provider is used, providing a unified interface for tool execution.
 */

import { SHADOWGROK_TOOLS } from '@/lib/grok/grok-tools';

export interface NormalizedToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
  originalFormat: unknown;
  normalizationSteps: string[];
}

export interface NormalizationResult {
  success: boolean;
  normalizedCalls: NormalizedToolCall[];
  errors: string[];
  warnings: string[];
}

type ToolParameters = {
  type?: string;
  required?: string[];
  properties?: Record<string, { default?: unknown }>;
  [key: string]: unknown;
}

type ToolLike = {
  type?: string;
  name?: string;
  function?: {
    name?: string;
    parameters?: ToolParameters;
  };
  jsonSchema?: ToolParameters;
  inputSchema?: ToolParameters;
  parameters?: ToolParameters;
}

type RawToolCall = {
  id?: string;
  toolCallId?: string;
  toolName?: string;
  function?: {
    name?: string;
    arguments?: unknown;
  };
  arguments?: unknown;
  input?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getAvailableToolName(tool: ToolLike): string | undefined {
  const name = tool?.type === 'function' ? tool.function?.name : tool?.name;
  return typeof name === 'string' && name.length > 0 ? name : undefined;
}

function getAvailableToolParameters(tool: ToolLike): ToolParameters | undefined {
  if (tool?.type === 'function') {
    return tool.function?.parameters;
  }
  return tool?.jsonSchema ?? tool?.inputSchema ?? tool?.parameters;
}

/**
 * Normalize a single tool call to standard format
 */
export function normalizeToolCall(
  rawToolCall: RawToolCall,
  availableTools: ToolLike[] = SHADOWGROK_TOOLS
): NormalizedToolCall {
  const normalizationSteps: string[] = [];
  let toolName = rawToolCall.function?.name || rawToolCall.toolName;
  const toolId = rawToolCall.id || rawToolCall.toolCallId || `call_${Date.now()}`;
  
  // Step 1: Extract arguments from various formats
  let argumentsObj: Record<string, unknown> = {};
  if (rawToolCall.function?.arguments) {
    try {
      if (typeof rawToolCall.function.arguments === 'string') {
        argumentsObj = JSON.parse(rawToolCall.function.arguments);
        normalizationSteps.push('Parsed JSON arguments from string');
      } else if (isRecord(rawToolCall.function.arguments)) {
        argumentsObj = rawToolCall.function.arguments;
        normalizationSteps.push('Used arguments object directly');
      }
    } catch (e) {
      normalizationSteps.push(`Failed to parse arguments: ${getErrorMessage(e)}`);
      argumentsObj = {};
    }
  } else if (rawToolCall.arguments) {
    try {
      if (typeof rawToolCall.arguments === 'string') {
        argumentsObj = JSON.parse(rawToolCall.arguments);
        normalizationSteps.push('Parsed arguments from raw arguments string');
      } else if (isRecord(rawToolCall.arguments)) {
        argumentsObj = rawToolCall.arguments;
        normalizationSteps.push('Used raw arguments object');
      }
    } catch (e) {
      normalizationSteps.push(`Failed to parse raw arguments: ${getErrorMessage(e)}`);
      argumentsObj = {};
    }
  } else if (isRecord(rawToolCall.input)) {
    argumentsObj = rawToolCall.input;
    normalizationSteps.push('Used input field as arguments');
  }

  // Step 2: Normalize argument types and values
  argumentsObj = normalizeArgumentTypes(argumentsObj);
  normalizationSteps.push('Normalized argument types');

  // Step 3: Validate tool name exists
  const knownToolNames = availableTools
    .map(getAvailableToolName)
    .filter((name): name is string => Boolean(name));

  if (typeof toolName !== 'string' || toolName.length === 0) {
    toolName = '';
    normalizationSteps.push('Tool name missing');
  } else if (!knownToolNames.includes(toolName)) {
    const unknownToolName = toolName;
    normalizationSteps.push(`Tool name "${unknownToolName}" not found in known tools`);
    // Try to find a similar tool name
    const similarTool = knownToolNames.find(name => 
      name.toLowerCase().includes(unknownToolName.toLowerCase()) ||
      unknownToolName.toLowerCase().includes(name.toLowerCase())
    );
    if (similarTool) {
      toolName = similarTool;
      normalizationSteps.push(`Corrected tool name to "${similarTool}"`);
    }
  } else {
    normalizationSteps.push('Tool name validated');
  }

  // Step 4: Ensure required parameters are present
  const toolDef = availableTools.find(t => 
    getAvailableToolName(t) === toolName
  );
  
  const toolParameters = toolDef ? getAvailableToolParameters(toolDef) : undefined;
  if (toolParameters?.required) {
    const requiredParams = toolParameters.required;
    const missingParams = requiredParams.filter((param: string) => !(param in argumentsObj));
    
    if (missingParams.length > 0) {
      normalizationSteps.push(`Missing required parameters: ${missingParams.join(', ')}`);
      // Add default values for missing required parameters if available
      const properties = toolParameters.properties || {};
      missingParams.forEach((param: string) => {
        if (properties[param]?.default !== undefined) {
          argumentsObj[param] = properties[param].default;
          normalizationSteps.push(`Added default value for missing parameter "${param}"`);
        }
      });
    } else {
      normalizationSteps.push('All required parameters present');
    }
  }

  // Step 5: Remove unknown parameters (optional, based on strictness)
  if (toolParameters?.properties) {
    const validParams = Object.keys(toolParameters.properties);
    const providedParams = Object.keys(argumentsObj);
    const unknownParams = providedParams.filter(p => !validParams.includes(p));
    
    if (unknownParams.length > 0) {
      normalizationSteps.push(`Removed unknown parameters: ${unknownParams.join(', ')}`);
      unknownParams.forEach(param => delete argumentsObj[param]);
    }
  }

  return {
    id: toolId,
    type: 'function',
    function: {
      name: toolName,
      arguments: argumentsObj,
    },
    originalFormat: rawToolCall,
    normalizationSteps,
  };
}

/**
 * Normalize multiple tool calls
 */
export function normalizeToolCalls(
  rawToolCalls: RawToolCall[],
  availableTools: ToolLike[] = SHADOWGROK_TOOLS
): NormalizationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const normalizedCalls: NormalizedToolCall[] = [];

  for (const rawCall of rawToolCalls) {
    try {
      const normalized = normalizeToolCall(rawCall, availableTools);
      normalizedCalls.push(normalized);

      // Check for any issues in normalization steps
      const hasErrors = normalized.normalizationSteps.some(step => step.includes('Failed'));
      const hasWarnings = normalized.normalizationSteps.some(step => 
        step.includes('not found') || step.includes('Missing') || step.includes('Removed')
      );

      if (hasErrors) {
        errors.push(`Tool call ${normalized.id} had errors during normalization`);
      }
      if (hasWarnings) {
        warnings.push(`Tool call ${normalized.id} had warnings during normalization`);
      }
    } catch (error) {
      errors.push(`Failed to normalize tool call: ${getErrorMessage(error)}`);
    }
  }

  return {
    success: errors.length === 0,
    normalizedCalls,
    errors,
    warnings,
  };
}

/**
 * Normalize argument types using Zod schema coercion
 *
 * NOTE: All type coercion is now handled by Zod schemas at validation time.
 * This function only handles structural normalization (arrays, nested objects)
 * without using any regex patterns.
 *
 * The LLM is expected to produce correctly-typed values via structured output.
 * If types are incorrect, Zod validation will catch them with clear error messages.
 */
function normalizeArgumentTypes(args: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    // Structural normalization only - no regex-based type coercion
    if (Array.isArray(value)) {
      // Recursively normalize array items
      normalized[key] = value.map(item => {
        if (isRecord(item)) {
          return normalizeArgumentTypes(item);
        }
        return item;
      });
    } else if (isRecord(value)) {
      // Recursively normalize nested objects
      normalized[key] = normalizeArgumentTypes(value);
    } else {
      // Pass through as-is - Zod will handle type coercion during validation
      normalized[key] = value;
    }
  }

  return normalized;
}

/**
 * Convert normalized tool call back to various provider formats
 */
export function convertToProviderFormat(
  normalizedCall: NormalizedToolCall,
  targetProvider: 'openai' | 'xai' | 'anthropic' | 'generic'
): unknown {
  switch (targetProvider) {
    case 'openai':
      return {
        id: normalizedCall.id,
        type: 'function',
        function: {
          name: normalizedCall.function.name,
          arguments: JSON.stringify(normalizedCall.function.arguments),
        },
      };
    
    case 'xai':
      return {
        tool_call_id: normalizedCall.id,
        type: 'function',
        function: {
          name: normalizedCall.function.name,
          arguments: JSON.stringify(normalizedCall.function.arguments),
        },
      };
    
    case 'anthropic':
      return {
        id: normalizedCall.id,
        name: normalizedCall.function.name,
        input: normalizedCall.function.arguments,
      };
    
    case 'generic':
    default:
      return {
        id: normalizedCall.id,
        type: 'function',
        function: {
          name: normalizedCall.function.name,
          arguments: normalizedCall.function.arguments,
        },
      };
  }
}

/**
 * Get normalization statistics
 */
export function getNormalizationStatistics(normalizedCalls: NormalizedToolCall[]): {
  totalCalls: number;
  averageSteps: number;
  commonSteps: Record<string, number>;
  callsWithWarnings: number;
  callsWithErrors: number;
} {
  if (normalizedCalls.length === 0) {
    return {
      totalCalls: 0,
      averageSteps: 0,
      commonSteps: {},
      callsWithWarnings: 0,
      callsWithErrors: 0,
    };
  }

  const totalSteps = normalizedCalls.reduce((sum, call) => sum + call.normalizationSteps.length, 0);
  const stepCounts: Record<string, number> = {};

  normalizedCalls.forEach(call => {
    call.normalizationSteps.forEach(step => {
      stepCounts[step] = (stepCounts[step] || 0) + 1;
    });
  });

  const callsWithWarnings = normalizedCalls.filter(call =>
    call.normalizationSteps.some(step => step.includes('not found') || step.includes('Missing'))
  ).length;

  const callsWithErrors = normalizedCalls.filter(call =>
    call.normalizationSteps.some(step => step.includes('Failed'))
  ).length;

  return {
    totalCalls: normalizedCalls.length,
    averageSteps: totalSteps / normalizedCalls.length,
    commonSteps: stepCounts,
    callsWithWarnings,
    callsWithErrors,
  };
}