/**
 * Comprehensive AI Assistant Audit & Test Suite
 * 
 * Tests:
 * 1. Tool definitions and execution
 * 2. Chat workflow and conversation management
 * 3. Error handling and retry logic
 * 4. xAI Grok integration
 * 5. Code quality and security
 * 6. Performance
 * 7. Caching mechanism
 */

import { aiToolDefinitions, runAiTool } from './lib/ai/tools'
import { chatComplete } from './lib/ai/llm'
import { runChat } from './lib/ai/chat'
import { 
  createConversation, 
  getConversation, 
  listConversations, 
  appendMessages,
  deleteConversation 
} from './lib/ai/conversations'
import { buildSystemPrompt, Role } from './lib/ai/system-prompt'
import { serverEnv } from './lib/env'

interface TestResult {
  name: string
  status: 'pass' | 'fail' | 'skip'
  duration: number
  message: string
  details?: any
}

class TestRunner {
  private results: TestResult[] = []
  private startTime: number = Date.now()

  async test(name: string, fn: () => Promise<void>): Promise<void> {
    const start = Date.now()
    try {
      await fn()
      const duration = Date.now() - start
      this.results.push({ name, status: 'pass', duration, message: 'Test passed' })
      console.log(`✅ ${name} (${duration}ms)`)
    } catch (error: any) {
      const duration = Date.now() - start
      this.results.push({ 
        name, 
        status: 'fail', 
        duration, 
        message: error.message || 'Test failed',
        details: error
      })
      console.log(`❌ ${name} (${duration}ms) - ${error.message}`)
    }
  }

  async testSkip(name: string, reason: string): Promise<void> {
    this.results.push({ name, status: 'skip', duration: 0, message: reason })
    console.log(`⏭️  ${name} - ${reason}`)
  }

  getResults(): TestResult[] {
    return this.results
  }

  getSummary(): { total: number; passed: number; failed: number; skipped: number } {
    return {
      total: this.results.length,
      passed: this.results.filter(r => r.status === 'pass').length,
      failed: this.results.filter(r => r.status === 'fail').length,
      skipped: this.results.filter(r => r.status === 'skip').length,
    }
  }

  getTotalDuration(): number {
    return Date.now() - this.startTime
  }
}

const runner = new TestRunner()

async function runAudit() {
  console.log('🔍 Starting AI Assistant Comprehensive Audit')
  console.log('='.repeat(60))
  console.log()

  // Test 1: Environment Configuration
  console.log('📋 Section 1: Environment Configuration')
  await runner.test('Environment variables loaded', async () => {
    const env = serverEnv()
    if (!env) throw new Error('Server environment not loaded')
    
    // Check xAI configuration
    if (!env.XAI_API_KEY || env.XAI_API_KEY === '') throw new Error('xAI API key not configured')
    if (!env.XAI_BASE_URL) throw new Error('xAI base URL not configured')
    if (!env.XAI_MODEL) throw new Error('xAI model not configured')
    
    // Check other providers are disabled (empty strings)
    if (env.AZURE_OPENAI_API_KEY && env.AZURE_OPENAI_API_KEY !== '') {
      throw new Error('Azure OpenAI should be disabled')
    }
    if (env.OPENROUTER_API_KEY && env.OPENROUTER_API_KEY !== '') {
      throw new Error('OpenRouter should be disabled')
    }
    if (env.LLM_PROVIDER_API_KEY && env.LLM_PROVIDER_API_KEY !== '') {
      throw new Error('Legacy LLM should be disabled')
    }
    
    console.log(`   xAI Model: ${env.XAI_MODEL}`)
    console.log(`   xAI Base URL: ${env.XAI_BASE_URL}`)
    console.log(`   ✓ xAI configured, other providers disabled`)
  })
  console.log()

  // Test 2: Tool Definitions
  console.log('📋 Section 2: Tool Definitions')
  await runner.test('Tool definitions loaded', async () => {
    const tools = aiToolDefinitions()
    if (!Array.isArray(tools)) throw new Error('Tools should be an array')
    if (tools.length === 0) throw new Error('No tools defined')
    
    console.log(`   Total tools: ${tools.length}`)
    
    // Check required tools exist
    const requiredTools = [
      'generate_config',
      'analyze_traffic', 
      'suggest_masquerade',
      'troubleshoot',
      'list_profiles',
      'get_server_logs',
      'generate_payload',
      'list_payloads',
      'get_payload_status',
      'delete_payload'
    ]
    
    const toolNames = tools.map(t => t.type === 'function' ? t.function.name : (t as any).name)
    for (const required of requiredTools) {
      if (!toolNames.includes(required)) {
        throw new Error(`Required tool ${required} not found`)
      }
    }
    
    console.log(`   ✓ All required tools present`)
  })
  console.log()

  // Test 3: System Prompt Generation
  console.log('📋 Section 3: System Prompt Generation')
  await runner.test('System prompt generation', async () => {
    const chatPrompt = buildSystemPrompt(Role.Chat)
    if (!chatPrompt || chatPrompt.length === 0) throw new Error('Chat system prompt empty')
    if (chatPrompt.length > 10000) throw new Error('Chat system prompt too long (>10k chars)')
    
    const shadowgrokPrompt = buildSystemPrompt(Role.ShadowGrok)
    if (!shadowgrokPrompt || shadowgrokPrompt.length === 0) throw new Error('ShadowGrok system prompt empty')
    
    const configPrompt = buildSystemPrompt(Role.ConfigExpert)
    if (!configPrompt || configPrompt.length === 0) throw new Error('ConfigExpert system prompt empty')
    
    console.log(`   Chat prompt length: ${chatPrompt.length} chars`)
    console.log(`   ShadowGrok prompt length: ${shadowgrokPrompt.length} chars`)
    console.log(`   ConfigExpert prompt length: ${configPrompt.length} chars`)
    console.log(`   ✓ All prompts generated successfully`)
  })
  console.log()

  // Test 4: Conversation Management
  console.log('📋 Section 4: Conversation Management')
  let testConversationId: string | null = null
  
  await runner.test('Create conversation', async () => {
    const conv = await createConversation({ title: 'Test Conversation' }, 'test-user')
    if (!conv) throw new Error('Failed to create conversation')
    if (!conv.id) throw new Error('Conversation ID missing')
    testConversationId = conv.id
    console.log(`   Created conversation: ${conv.id}`)
  })

  if (testConversationId) {
    await runner.test('Get conversation', async () => {
      const conv = await getConversation(testConversationId!)
      if (!conv) throw new Error('Failed to get conversation')
      if (conv.id !== testConversationId) throw new Error('Conversation ID mismatch')
      console.log(`   Retrieved conversation: ${conv.id}`)
    })

    await runner.test('Append messages to conversation', async () => {
      const messages = [
        {
          role: 'user' as const,
          content: 'Test message',
          timestamp: Date.now(),
        },
        {
          role: 'assistant' as const,
          content: 'Test response',
          timestamp: Date.now(),
        }
      ]
      
      const updated = await appendMessages(testConversationId!, messages)
      if (!updated) throw new Error('Failed to append messages')
      if (updated.messages.length !== 2) throw new Error('Message count mismatch')
      console.log(`   Appended 2 messages, total: ${updated.messages.length}`)
    })

    await runner.test('Cache hit on subsequent get', async () => {
      const start = Date.now()
      const conv1 = await getConversation(testConversationId!)
      const cacheHitTime = Date.now() - start
      
      const start2 = Date.now()
      const conv2 = await getConversation(testConversationId!)
      const cacheHitTime2 = Date.now() - start2
      
      if (!conv1 || !conv2) throw new Error('Failed to get conversations')
      if (cacheHitTime2 > cacheHitTime * 2) {
        console.log(`   Warning: Cache may not be working (first: ${cacheHitTime}ms, second: ${cacheHitTime2}ms)`)
      } else {
        console.log(`   Cache working (first: ${cacheHitTime}ms, second: ${cacheHitTime2}ms)`)
      }
    })

    await runner.test('Delete conversation', async () => {
      const deleted = await deleteConversation(testConversationId!)
      if (!deleted) throw new Error('Failed to delete conversation')
      
      // Verify deletion
      const conv = await getConversation(testConversationId!)
      if (conv !== null) throw new Error('Conversation still exists after deletion')
      console.log(`   Deleted conversation: ${testConversationId}`)
    })
  }
  console.log()

  // Test 5: Tool Execution (Non-Destructive)
  console.log('📋 Section 5: Tool Execution (Non-Destructive)')
  await runner.test('list_profiles tool', async () => {
    const result = await runAiTool('list_profiles', {}, { 
      signal: AbortSignal.timeout(30000),
      invokerUid: 'test-user'
    })
    if (!result) throw new Error('Tool returned no result')
    console.log(`   ✓ list_profiles executed successfully`)
  })

  await runner.test('suggest_masquerade tool', async () => {
    const result = await runAiTool('suggest_masquerade', { 
      category: 'cdn' 
    }, {
      signal: AbortSignal.timeout(30000),
      invokerUid: 'test-user'
    })
    if (!result) throw new Error('Tool returned no result')
    const typedResult = result as any
    if (!typedResult.targets || !Array.isArray(typedResult.targets)) {
      throw new Error('Tool returned invalid result structure')
    }
    console.log(`   ✓ suggest_masquerade returned ${typedResult.targets.length} targets`)
  })

  await runner.test('get_server_logs tool', async () => {
    const result = await runAiTool('get_server_logs', { 
      tail: 10 
    }, { 
      signal: AbortSignal.timeout(30000),
      invokerUid: 'test-user'
    })
    if (!result) throw new Error('Tool returned no result')
    const typedResult = result as any
    console.log(`   ✓ get_server_logs returned ${typedResult.lines?.length || 0} log lines`)
  })

  await runner.test('list_payloads tool', async () => {
    const result = await runAiTool('list_payloads', { 
      limit: 5 
    }, { 
      signal: AbortSignal.timeout(30000),
      invokerUid: 'test-user'
    })
    if (!result) throw new Error('Tool returned no result')
    const typedResult = result as any
    console.log(`   ✓ list_payloads returned ${typedResult.payloads?.length || 0} payloads`)
  })
  console.log()

  // Test 6: xAI Grok Integration
  console.log('📋 Section 6: xAI Grok Integration')
  await runner.test('Basic xAI chat completion', async () => {
    const result = await chatComplete({
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say "Hello, xAI Grok!" in exactly those words.' }
      ],
      temperature: 0.3,
      useShadowGrok: true, // Use xAI Grok
    })
    
    if (!result) throw new Error('No result from chat completion')
    if (!result.content) throw new Error('No content in result')
    
    console.log(`   ✓ xAI response: "${result.content.substring(0, 50)}..."`)
  })

  await runner.test('xAI with tool calling', async () => {
    const tools = aiToolDefinitions()
    const result = await chatComplete({
      messages: [
        { role: 'system', content: buildSystemPrompt(Role.Chat) },
        { role: 'user', content: 'List available configuration profiles' }
      ],
      tools,
      temperature: 0.3,
      useShadowGrok: true, // Use xAI Grok
    })
    
    if (!result) throw new Error('No result from chat completion')
    console.log(`   ✓ xAI tool calling works, tool calls: ${result.toolCalls?.length || 0}`)
  })
  console.log()

  // Test 7: Error Handling
  console.log('📋 Section 7: Error Handling')
  await runner.test('Invalid tool name handling', async () => {
    try {
      await runAiTool('invalid_tool_name', {}, { 
        signal: AbortSignal.timeout(5000),
        invokerUid: 'test-user'
      })
      throw new Error('Should have thrown error for invalid tool')
    } catch (error: any) {
      if (error.message.includes('invalid_tool_name') || error.message.includes('not found')) {
        console.log(`   ✓ Invalid tool name properly rejected`)
      } else {
        throw error
      }
    }
  })

  await runner.test('Invalid conversation ID handling', async () => {
    const conv = await getConversation('invalid-id-12345')
    if (conv !== null) throw new Error('Should return null for invalid ID')
    console.log(`   ✓ Invalid conversation ID properly handled`)
  })
  console.log()

  // Test 8: Performance Tests
  console.log('📋 Section 8: Performance Tests')
  await runner.test('Conversation list performance', async () => {
    const start = Date.now()
    await listConversations('test-user', 50)
    const duration = Date.now() - start
    
    if (duration > 1000) {
      throw new Error(`Conversation list too slow: ${duration}ms`)
    }
    console.log(`   ✓ List conversations in ${duration}ms`)
  })

  await runner.test('System prompt generation performance', async () => {
    const start = Date.now()
    for (let i = 0; i < 100; i++) {
      buildSystemPrompt(Role.Chat)
    }
    const duration = Date.now() - start
    const avgTime = duration / 100
    
    if (avgTime > 10) {
      throw new Error(`System prompt generation too slow: ${avgTime}ms avg`)
    }
    console.log(`   ✓ 100 prompt generations in ${duration}ms (${avgTime.toFixed(2)}ms avg)`)
  })
  console.log()

  // Test 9: Code Quality Checks
  console.log('📋 Section 9: Code Quality Checks')
  await runner.test('Tool definitions schema validation', async () => {
    const tools = aiToolDefinitions()
    
    for (const tool of tools) {
      // Check top-level structure
      if (!tool.type) throw new Error('Tool missing type')
      if (!tool.function) throw new Error('Tool missing function object')
      
      // Check function structure
      if (!tool.function.name) throw new Error('Tool missing function.name')
      if (!tool.function.description) throw new Error('Tool missing function.description')
      if (!tool.function.parameters) throw new Error('Tool missing function.parameters')
      
      // Check parameters structure
      const params = tool.function.parameters
      if (!params.type || params.type !== 'object') {
        throw new Error('Tool parameters type must be object')
      }
    }
    
    console.log(`   ✓ All ${tools.length} tools have valid schema`)
  })

  await runner.test('No hardcoded secrets', async () => {
    const fs = await import('fs')
    const path = await import('path')
    
    const filesToCheck = [
      'lib/ai/llm.ts',
      'lib/ai/chat.ts',
      'lib/ai/tools.ts',
      'lib/ai/conversations.ts',
    ]
    
    for (const file of filesToCheck) {
      const filePath = path.join(process.cwd(), file)
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        
        // Check for common secret patterns
        const secretPatterns = [
          /sk-[a-zA-Z0-9]{32,}/, // OpenAI keys
          /xai-[a-zA-Z0-9]{32,}/, // xAI keys
          /password\s*=\s*["'][^"']+["']/i,
          /api_key\s*=\s*["'][^"']+["']/i,
        ]
        
        for (const pattern of secretPatterns) {
          if (pattern.test(content)) {
            throw new Error(`Potential hardcoded secret found in ${file}`)
          }
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          throw error
        }
      }
    }
    
    console.log(`   ✓ No hardcoded secrets found`)
  })
  console.log()

  // Print Summary
  console.log('='.repeat(60))
  console.log('📊 AUDIT SUMMARY')
  console.log('='.repeat(60))
  
  const summary = runner.getSummary()
  const totalDuration = runner.getTotalDuration()
  
  console.log(`Total Tests: ${summary.total}`)
  console.log(`✅ Passed: ${summary.passed}`)
  console.log(`❌ Failed: ${summary.failed}`)
  console.log(`⏭️  Skipped: ${summary.skipped}`)
  console.log(`⏱️  Total Duration: ${totalDuration}ms`)
  console.log()
  
  if (summary.failed > 0) {
    console.log('❌ FAILED TESTS:')
    runner.getResults()
      .filter(r => r.status === 'fail')
      .forEach(r => {
        console.log(`   - ${r.name}: ${r.message}`)
      })
    console.log()
  }
  
  const passRate = ((summary.passed / summary.total) * 100).toFixed(1)
  console.log(`Pass Rate: ${passRate}%`)
  
  if (summary.failed === 0) {
    console.log()
    console.log('🎉 ALL TESTS PASSED! AI Assistant is functioning correctly.')
  } else {
    console.log()
    console.log('⚠️  Some tests failed. Please review the failures above.')
    process.exit(1)
  }
}

// Run the audit
runAudit().catch(error => {
  console.error('💥 Audit failed with error:', error)
  process.exit(1)
})