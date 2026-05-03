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
    arguments: Record<string, any>;
  };
  originalFormat: any;
  normalizationSteps: string[];
}

export interface NormalizationResult {
  success: boolean;
  normalizedCalls: NormalizedToolCall[];
  errors: string[];
  warnings: string[];
}

/**
 * Normalize a single tool call to standard format
 */
export function normalizeToolCall(
  rawToolCall: any,
  availableTools: any[] = SHADOWGROK_TOOLS
): NormalizedToolCall {
  const normalizationSteps: string[] = [];
  let toolName = rawToolCall.function?.name || rawToolCall.toolName;
  let toolId = rawToolCall.id || rawToolCall.toolCallId || `call_${Date.now()}`;
  
  // Step 1: Extract arguments from various formats
  let argumentsObj: Record<string, any> = {};
  if (rawToolCall.function?.arguments) {
    try {
      if (typeof rawToolCall.function.arguments === 'string') {
        argumentsObj = JSON.parse(rawToolCall.function.arguments);
        normalizationSteps.push('Parsed JSON arguments from string');
      } else {
        argumentsObj = rawToolCall.function.arguments;
        normalizationSteps.push('Used arguments object directly');
      }
    } catch (e) {
      normalizationSteps.push(`Failed to parse arguments: ${e}`);
      argumentsObj = {};
    }
  } else if (rawToolCall.arguments) {
    try {
      if (typeof rawToolCall.arguments === 'string') {
        argumentsObj = JSON.parse(rawToolCall.arguments);
        normalizationSteps.push('Parsed arguments from raw arguments string');
      } else {
        argumentsObj = rawToolCall.arguments;
        normalizationSteps.push('Used raw arguments object');
      }
    } catch (e) {
      normalizationSteps.push(`Failed to parse raw arguments: ${e}`);
      argumentsObj = {};
    }
  } else if (rawToolCall.input) {
    argumentsObj = rawToolCall.input;
    normalizationSteps.push('Used input field as arguments');
  }

  // Step 2: Normalize argument types and values
  argumentsObj = normalizeArgumentTypes(argumentsObj);
  normalizationSteps.push('Normalized argument types');

  // Step 3: Validate tool name exists
  const knownToolNames = availableTools
    .map(t => t.type === 'function' ? t.function?.name : t.name)
    .filter(Boolean);

  if (!knownToolNames.includes(toolName)) {
    normalizationSteps.push(`Tool name "${toolName}" not found in known tools`);
    // Try to find a similar tool name
    const similarTool = knownToolNames.find(name => 
      name.toLowerCase().includes(toolName.toLowerCase()) ||
      toolName.toLowerCase().includes(name.toLowerCase())
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
    (t.type === 'function' && t.function?.name === toolName) || t.name === toolName
  );
  
  if (toolDef && toolDef.function?.parameters?.required) {
    const requiredParams = toolDef.function.parameters.required;
    const missingParams = requiredParams.filter((param: string) => !(param in argumentsObj));
    
    if (missingParams.length > 0) {
      normalizationSteps.push(`Missing required parameters: ${missingParams.join(', ')}`);
      // Add default values for missing required parameters if available
      const properties = toolDef.function.parameters.properties || {};
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
  if (toolDef && toolDef.function?.parameters?.properties) {
    const validParams = Object.keys(toolDef.function.parameters.properties);
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
  rawToolCalls: any[],
  availableTools: any[] = SHADOWGROK_TOOLS
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
    } catch (error: any) {
      errors.push(`Failed to normalize tool call: ${error.message}`);
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
 * Normalize argument types to match expected schema
 */
function normalizeArgumentTypes(args: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};

  for (const [key, value] of Object.entries(args)) {
    // Handle string representations of numbers
    if (typeof value === 'string') {
      if (/^\d+$/.test(value)) {
        normalized[key] = parseInt(value, 10);
      } else if (/^\d+\.\d+$/.test(value)) {
        normalized[key] = parseFloat(value);
      } else if (value.toLowerCase() === 'true') {
        normalized[key] = true;
      } else if (value.toLowerCase() === 'false') {
        normalized[key] = false;
      } else if (value.toLowerCase() === 'null') {
        normalized[key] = null;
      } else {
        normalized[key] = value;
      }
    } else if (Array.isArray(value)) {
      normalized[key] = value.map(item => normalizeArgumentTypes({ _: item })._);
    } else if (typeof value === 'object' && value !== null) {
      normalized[key] = normalizeArgumentTypes(value);
    } else {
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
): any {
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