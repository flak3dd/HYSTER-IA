/**
 * Tool Call Validation and Correction Layer
 * 
 * This module provides validation and correction capabilities for AI tool calls,
 * ensuring that tool names, arguments, and formats are correct before execution.
 */

import { SHADOWGROK_TOOLS, getToolByName } from '@/lib/grok/grok-tools';

export interface ValidatedToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
  _metadata?: {
    originalToolName?: string;
    mappingSource?: string;
    validationWarnings?: string[];
    corrections?: string[];
  };
  isValid: boolean;
  validationErrors: string[];
}

export interface ToolValidationResult {
  isValid: boolean;
  correctedCall: ValidatedToolCall;
  warnings: string[];
  errors: string[];
}

/**
 * Validate a single tool call against the known tool definitions
 */
export function validateToolCall(
  toolCall: any,
  knownTools: any[] = SHADOWGROK_TOOLS
): ToolValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const corrections: string[] = [];
  const validationWarnings: string[] = [];

  let toolName = toolCall.function?.name || toolCall.toolName;
  let originalToolName = toolName;
  const originalArgs = toolCall.function?.arguments || toolCall.arguments || '{}';

  // Check if tool name exists in known tools
  const knownToolNames = knownTools
    .map(t => t.type === 'function' ? t.function?.name : t.name)
    .filter(Boolean);

  if (!knownToolNames.includes(toolName)) {
    errors.push(`Tool "${toolName}" not found in known tools`);
    
    // Try fuzzy matching
    const similarTool = knownToolNames.find(name => 
      name.toLowerCase().includes(toolName.toLowerCase()) ||
      toolName.toLowerCase().includes(name.toLowerCase()) ||
      levenshteinDistance(name.toLowerCase(), toolName.toLowerCase()) < 3
    );

    if (similarTool) {
      toolName = similarTool;
      corrections.push(`Corrected tool name from "${originalToolName}" to "${toolName}"`);
      warnings.push(`Used similar tool name "${similarTool}" instead of unknown "${originalToolName}"`);
    }
  }

  // Validate tool arguments if tool definition is available
  const toolDef = getToolByName(toolName);
  if (toolDef) {
    try {
      const args = JSON.parse(originalArgs);
      const requiredParams = toolDef.function.parameters.required || [];
      
      // Check for missing required parameters
      for (const param of requiredParams) {
        if (!(param in args)) {
          validationWarnings.push(`Missing required parameter "${param}" for tool "${toolName}"`);
        }
      }

      // Check for unexpected parameters
      const validParams = Object.keys(toolDef.function.parameters.properties || {});
      const providedParams = Object.keys(args);
      const unexpectedParams = providedParams.filter(p => !validParams.includes(p));
      
      if (unexpectedParams.length > 0) {
        validationWarnings.push(`Unexpected parameters for tool "${toolName}": ${unexpectedParams.join(', ')}`);
      }
    } catch (e) {
      errors.push(`Invalid JSON in tool arguments: ${e}`);
    }
  }

  const correctedCall: ValidatedToolCall = {
    id: toolCall.id || toolCall.toolCallId || `call_${Date.now()}`,
    type: 'function',
    function: {
      name: toolName,
      arguments: originalArgs,
    },
    _metadata: {
      originalToolName,
      mappingSource: toolCall._metadata?.mappingSource || 'validation_layer',
      validationWarnings,
      corrections,
    },
    isValid: errors.length === 0,
    validationErrors: errors,
  };

  return {
    isValid: errors.length === 0,
    correctedCall,
    warnings,
    errors,
  };
}

/**
 * Validate and correct multiple tool calls
 */
export function validateToolCalls(
  toolCalls: any[],
  knownTools: any[] = SHADOWGROK_TOOLS
): { validatedCalls: ValidatedToolCall[]; allValid: boolean; totalWarnings: number; totalErrors: number } {
  const validatedCalls = toolCalls.map(tc => validateToolCall(tc, knownTools));
  const allValid = validatedCalls.every(result => result.isValid);
  const totalWarnings = validatedCalls.reduce((sum, r) => sum + r.warnings.length, 0);
  const totalErrors = validatedCalls.reduce((sum, r) => sum + r.errors.length, 0);

  return {
    validatedCalls: validatedCalls.map(r => r.correctedCall),
    allValid,
    totalWarnings,
    totalErrors,
  };
}

/**
 * Simple Levenshtein distance calculation for fuzzy matching
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Get tool suggestions for a given partial or incorrect tool name
 */
export function getToolSuggestions(
  partialName: string,
  knownTools: any[] = SHADOWGROK_TOOLS,
  maxSuggestions: number = 3
): string[] {
  const knownToolNames = knownTools
    .map(t => t.type === 'function' ? t.function?.name : t.name)
    .filter(Boolean);

  const suggestions = knownToolNames
    .map(name => ({
      name,
      distance: levenshteinDistance(name.toLowerCase(), partialName.toLowerCase()),
    }))
    .filter(({ distance }) => distance <= 3)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxSuggestions)
    .map(({ name }) => name);

  return suggestions;
}