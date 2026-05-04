import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { listConversations } from "@/lib/ai/conversations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const admin = await verifyAdmin(req)
    const conversations = await listConversations(admin.id)
    
    // Calculate statistics
    const totalConversations = conversations.length
    const now = Date.now()
    const oneHourAgo = now - 60 * 60 * 1000
    
    // Count active conversations (updated in the last hour)
    const activeConversations = conversations.filter(c => c.updatedAt > oneHourAgo).length
    
    // Calculate total messages and tool executions
    let totalMessages = 0
    let totalToolExecutions = 0
    let successfulToolExecutions = 0
    
    for (const conv of conversations) {
      totalMessages += conv.messages.length
      
      for (const msg of conv.messages) {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          totalToolExecutions += msg.toolCalls.length
          
          // Count successful executions (tool messages with results)
          if (msg.role === 'tool' && msg.toolResult) {
            successfulToolExecutions++
          }
        }
      }
    }
    
    // Calculate success rate
    const successRate = totalToolExecutions > 0 
      ? Math.round((successfulToolExecutions / totalToolExecutions) * 100) 
      : 100
    
    // Get recent activity (last 5 conversations with messages)
    const recentActivity = conversations
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 5)
      .map(conv => {
        const lastMessage = conv.messages[conv.messages.length - 1]
        const timeAgo = formatTimeAgo(conv.updatedAt)
        const hasToolCalls = conv.messages.some(m => m.toolCalls && m.toolCalls.length > 0)
        
        return {
          type: hasToolCalls ? 'shadowgrok' : 'chat',
          message: lastMessage?.content?.substring(0, 50) || conv.title,
          time: timeAgo,
          status: 'success',
        }
      })
    
    return NextResponse.json({
      stats: {
        totalConversations,
        activeAgents: activeConversations,
        totalExecutions: totalToolExecutions,
        successRate,
      },
      recentActivity,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}