/**
 * Test AI Assistant with Specific Commands
 * 
 * Tests the AI assistant with the specific commands provided by the user:
 * 1. "List all active implants and their current status with traffic stats."
 * 2. "Generate a stealth implant config for Windows 11 with Spotify traffic blending and anti-VM evasion."
 * 3. "Compile and deploy the implant to Node-03 with auto-start enabled."
 * 4. "Show me real-time Hysteria2 traffic statistics for all nodes."
 * 5. "Create a new subscription for user 'testuser' with tags 'stealth' and 'eu'."
 */

import { createConversation } from './lib/ai/conversations'
import { runChat } from './lib/ai/chat'

interface CommandTest {
  command: string
  description: string
  expectedTools?: string[]
}

const commands: CommandTest[] = [
  {
    command: "List all active implants and their current status with traffic stats.",
    description: "List active implants with traffic stats",
    expectedTools: ['list_implants', 'analyze_traffic']
  },
  {
    command: "Generate a stealth implant config for Windows 11 with Spotify traffic blending and anti-VM evasion.",
    description: "Generate stealth implant config",
    expectedTools: ['generate_config']
  },
  {
    command: "Compile and deploy the implant to Node-03 with auto-start enabled.",
    description: "Compile and deploy implant",
    expectedTools: ['generate_payload', 'deploy_to_node']
  },
  {
    command: "Show me real-time Hysteria2 traffic statistics for all nodes.",
    description: "Show real-time traffic statistics",
    expectedTools: ['analyze_traffic']
  },
  {
    command: "Create a new subscription for user 'testuser' with tags 'stealth' and 'eu'.",
    description: "Create new subscription",
    expectedTools: ['create_subscription']
  }
]

async function testAICommands() {
  console.log('🤖 Testing AI Assistant with Specific Commands')
  console.log('='.repeat(70))
  console.log()

  // Create a test conversation
  console.log('📝 Creating test conversation...')
  const conversation = await createConversation(
    { title: 'AI Command Test Session' },
    'test-user'
  )
  
  if (!conversation) {
    console.error('❌ Failed to create conversation')
    return
  }
  
  console.log(`✅ Conversation created: ${conversation.id}`)
  console.log()

  const results: {
    command: string
    success: boolean
    toolCalls: string[]
    response: string
    error?: string
    duration: number
  }[] = []

  // Test each command
  for (let i = 0; i < commands.length; i++) {
    const { command, description, expectedTools } = commands[i]
    console.log(`🔍 Test ${i + 1}/${commands.length}: ${description}`)
    console.log(`   Command: "${command}"`)
    
    const startTime = Date.now()
    
    try {
      const result = await runChat(
        conversation.id,
        command,
        'test-user'
      )
      
      const duration = Date.now() - startTime
      
      if (result.error) {
        console.log(`   ❌ Failed: ${result.error}`)
        results.push({
          command,
          success: false,
          toolCalls: [],
          response: '',
          error: result.error,
          duration
        })
      } else {
        // Extract tool calls from messages
        const toolCalls: string[] = []
        for (const msg of result.messages) {
          if (msg.toolCalls) {
            for (const tc of msg.toolCalls) {
              toolCalls.push(tc.name)
            }
          }
        }
        
        // Get the assistant's response
        const lastAssistantMsg = [...result.messages].reverse().find(
          msg => msg.role === 'assistant' && msg.content
        )
        const response = lastAssistantMsg?.content || 'No text response'
        
        console.log(`   ✅ Success (${duration}ms)`)
        console.log(`   🛠️  Tools called: ${toolCalls.length > 0 ? toolCalls.join(', ') : 'none'}`)
        console.log(`   📄 Response: ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`)
        
        // Check if expected tools were called
        if (expectedTools && expectedTools.length > 0) {
          const matchedTools = expectedTools.filter(t => toolCalls.includes(t))
          if (matchedTools.length === 0) {
            console.log(`   ⚠️  Warning: Expected tools [${expectedTools.join(', ')}] were not called`)
          } else {
            console.log(`   ✅ Expected tool(s) matched: ${matchedTools.join(', ')}`)
          }
        }
        
        results.push({
          command,
          success: true,
          toolCalls,
          response,
          duration
        })
      }
    } catch (error: any) {
      const duration = Date.now() - startTime
      console.log(`   ❌ Error: ${error.message}`)
      results.push({
        command,
        success: false,
        toolCalls: [],
        response: '',
        error: error.message,
        duration
      })
    }
    
    console.log()
  }
  
  // Print summary
  console.log('='.repeat(70))
  console.log('📊 TEST SUMMARY')
  console.log('='.repeat(70))
  
  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0)
  const avgDuration = totalDuration / results.length
  
  console.log(`Total Commands: ${results.length}`)
  console.log(`✅ Successful: ${successCount}`)
  console.log(`❌ Failed: ${failCount}`)
  console.log(`⏱️  Total Duration: ${totalDuration}ms`)
  console.log(`⏱️  Average Duration: ${avgDuration.toFixed(0)}ms`)
  console.log()
  
  if (failCount > 0) {
    console.log('❌ FAILED COMMANDS:')
    results
      .filter(r => !r.success)
      .forEach(r => {
        console.log(`   - ${r.command}`)
        console.log(`     Error: ${r.error}`)
      })
    console.log()
  }
  
  console.log('📋 DETAILED RESULTS:')
  results.forEach((r, i) => {
    console.log(`${i + 1}. ${r.command}`)
    console.log(`   Status: ${r.success ? '✅ Success' : '❌ Failed'}`)
    console.log(`   Duration: ${r.duration}ms`)
    console.log(`   Tools: ${r.toolCalls.length > 0 ? r.toolCalls.join(', ') : 'none'}`)
    if (!r.success) {
      console.log(`   Error: ${r.error}`)
    }
    console.log()
  })
  
  // Cleanup
  console.log('🧹 Cleaning up test conversation...')
  // Note: We're not deleting the conversation to allow manual inspection if needed
  console.log(`   Conversation ID: ${conversation.id} (preserved for inspection)`)
}

// Run the tests
testAICommands().catch(error => {
  console.error('💥 Test execution failed:', error)
  process.exit(1)
})