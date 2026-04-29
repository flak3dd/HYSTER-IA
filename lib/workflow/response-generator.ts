import type { IntentAnalysis, WorkflowSession } from './types'

export class ResponseGenerator {
  /**
   * Generate a rich, context-aware response based on analysis and system state
   */
  generateResponse(
    analysis: IntentAnalysis,
    systemState: Record<string, unknown>,
    executionResult?: unknown
  ): string {
    let response = ''

    // Add intent acknowledgment
    response += this.acknowledgeIntent(analysis)

    // Add context-aware information
    response += this.addContextInfo(analysis, systemState)

    // Add execution results if available
    if (executionResult) {
      response += this.formatExecutionResult(executionResult)
    }

    // Add proactive suggestions
    response += this.addProactiveSuggestions(analysis, systemState)

    return response
  }

  /**
   * Acknowledge user intent in a natural way
   */
  private acknowledgeIntent(analysis: IntentAnalysis): string {
    const acknowledgments = [
      `I understand you want to ${analysis.intent.toLowerCase()}.`,
      `Got it! You're looking to ${analysis.intent.toLowerCase()}.`,
      `I'll help you ${analysis.intent.toLowerCase()}.`,
    ]

    const randomAck = acknowledgments[Math.floor(Math.random() * acknowledgments.length)]
    
    if (analysis.confidence > 0.8) {
      return `${randomAck} I'm confident about this approach.\n\n`
    } else if (analysis.confidence > 0.5) {
      return `${randomAck} Let me proceed with this.\n\n`
    } else {
      return `${randomAck} I'll do my best, but let me know if this isn't quite right.\n\n`
    }
  }

  /**
   * Add context-aware information to the response
   */
  private addContextInfo(analysis: IntentAnalysis, systemState: Record<string, unknown>): string {
    let info = ''

    // Add parameter information
    if (Object.keys(analysis.extractedParameters).length > 0) {
      info += '**Parameters I extracted:**\n'
      for (const [key, value] of Object.entries(analysis.extractedParameters)) {
        info += `- ${key}: ${JSON.stringify(value)}\n`
      }
      info += '\n'
    }

    // Add function information
    if (analysis.suggestedFunction) {
      info += `**Function I'll use:** \`${analysis.suggestedFunction}\`\n\n`
    }

    // Add system state context
    if (systemState.currentStepOrder) {
      info += `**Current Progress:** Step ${systemState.currentStepOrder} of the workflow\n\n`
    }

    return info
  }

  /**
   * Format execution results in a readable way
   */
  private formatExecutionResult(result: unknown): string {
    let formatted = '**Execution Result:**\n\n'

    if (typeof result === 'object' && result !== null) {
      const resultObj = result as Record<string, unknown>
      
      if (resultObj.success) {
        formatted += '✅ **Success!**\n\n'
      } else if (resultObj.error) {
        formatted += '❌ **Error:** ' + String(resultObj.error) + '\n\n'
      }

      // Format key-value pairs
      for (const [key, value] of Object.entries(resultObj)) {
        if (key !== 'success' && key !== 'error') {
          if (typeof value === 'object' && value !== null) {
            formatted += `**${key}:**\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n\n`
          } else {
            formatted += `**${key}:** ${JSON.stringify(value)}\n\n`
          }
        }
      }
    } else {
      formatted += String(result) + '\n\n'
    }

    return formatted
  }

  /**
   * Add proactive suggestions based on context
   */
  private addProactiveSuggestions(analysis: IntentAnalysis, systemState: Record<string, unknown>): string {
    let suggestions = ''

    // Suggest next steps based on the function
    if (analysis.suggestedFunction === 'create_node') {
      suggestions += '**💡 Next steps you might want:**\n'
      suggestions += '- Configure the node with specific settings\n'
      suggestions += '- Add the node to a profile\n'
      suggestions += '- Generate client configs for this node\n\n'
    } else if (analysis.suggestedFunction === 'create_user') {
      suggestions += '**💡 Next steps you might want:**\n'
      suggestions += '- Generate configuration for this user\n'
      suggestions += '- Set up usage monitoring\n'
      suggestions += '- Add user to a specific profile\n\n'
    } else if (analysis.suggestedFunction === 'check_status') {
      suggestions += '**💡 Based on the status, you might want to:**\n'
      suggestions += '- Check specific node health\n'
      suggestions += '- Review recent activity logs\n'
      suggestions += '- Analyze traffic patterns\n\n'
    }

    // Add workflow completion suggestions
    if (systemState.status === 'completed') {
      suggestions += '**🎉 Workflow completed!** You can:\n'
      suggestions += '- Start a new workflow\n'
      suggestions += '- Review the session history\n'
      suggestions += '- Generate a summary report\n\n'
    }

    return suggestions
  }

  /**
   * Generate error recovery suggestions
   */
  generateErrorRecovery(error: Error, context: Record<string, unknown>): string {
    let recovery = '**⚠️ Something went wrong**\n\n'
    
    recovery += `**Error:** ${error.message}\n\n`
    
    recovery += '**Let me try a different approach:**\n'
    
    // Analyze error type and suggest alternatives
    if (error.message.includes('timeout')) {
      recovery += '- The operation timed out. Let me try with a longer timeout.\n'
      recovery += '- Alternatively, we can break this into smaller steps.\n'
    } else if (error.message.includes('not found')) {
      recovery += '- The resource wasn\'t found. Let me check if it exists under a different name.\n'
      recovery += '- We can create it instead if that\'s what you intended.\n'
    } else if (error.message.includes('permission') || error.message.includes('unauthorized')) {
      recovery += '- There seems to be a permission issue. Let me try with different credentials.\n'
      recovery += '- Alternatively, we can check what resources you have access to.\n'
    } else {
      recovery += '- Let me try an alternative approach.\n'
      recovery += '- We can break this down into simpler steps.\n'
    }

    recovery += '\n**Would you like me to:**\n'
    recovery += '- Try the alternative approach?\n'
    recovery += '- Provide more details so I can help better?\n'
    recovery += '- Try a completely different approach?\n'

    return recovery
  }

  /**
   * Generate a summary of the current workflow session
   */
  generateSessionSummary(session: WorkflowSession): string {
    let summary = '**📋 Workflow Session Summary**\n\n'
    
    summary += `**Session ID:** \`${session.id.slice(0, 8)}\`\n`
    summary += `**Status:** ${session.status}\n`
    summary += `**Total Steps:** ${session.steps.length}\n`
    summary += `**Current Step:** ${session.currentStepOrder}\n`
    summary += `**Started:** ${new Date(session.createdAt).toLocaleString()}\n`
    
    if (session.completedAt) {
      summary += `**Completed:** ${new Date(session.completedAt).toLocaleString()}\n`
    }

    summary += '\n**Steps Overview:**\n'
    session.steps.forEach((step, index) => {
      const emoji = step.completed ? '✅' : '⏳'
      summary += `${index + 1}. ${emoji} ${step.type}: ${step.content?.slice(0, 50) || 'No content'}...\n`
    })

    return summary
  }

  /**
   * Generate learning insights from past sessions
   */
  generateLearningInsights(pastSessions: WorkflowSession[]): string {
    if (pastSessions.length === 0) {
      return ''
    }

    let insights = '**🧠 Learning from Past Sessions**\n\n'

    // Analyze common patterns
    const functionUsage: Record<string, number> = {}
    const statusCounts: Record<string, number> = {}

    pastSessions.forEach(session => {
      session.steps.forEach(step => {
        if (step.functionToExecute) {
          functionUsage[step.functionToExecute] = (functionUsage[step.functionToExecute] || 0) + 1
        }
      })
      statusCounts[session.status] = (statusCounts[session.status] || 0) + 1
    })

    insights += '**Most Used Functions:**\n'
    const sortedFunctions = Object.entries(functionUsage).sort((a, b) => b[1] - a[1]).slice(0, 5)
    sortedFunctions.forEach(([func, count]) => {
      insights += `- \`${func}\`: ${count} times\n`
    })

    insights += '\n**Success Rate:**\n'
    const totalSessions = pastSessions.length
    const completedSessions = statusCounts['completed'] || 0
    const successRate = ((completedSessions / totalSessions) * 100).toFixed(1)
    insights += `${successRate}% of sessions completed successfully\n`

    insights += '\n**Suggestions:**\n'
    if (parseFloat(successRate) > 80) {
      insights += '- Your workflows are running smoothly! Keep up the good work.\n'
    } else {
      insights += '- Consider breaking complex workflows into smaller steps for better reliability.\n'
    }

    return insights
  }
}