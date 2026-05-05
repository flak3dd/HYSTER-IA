import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder()
  
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (type: string, data: any) => {
        const event = `data: ${JSON.stringify({ type, payload: data })}\n\n`
        controller.enqueue(encoder.encode(event))
      }
      
      // Send initial connection event
      sendEvent('connected', { timestamp: Date.now() })
      
      // Simulate real-time updates (replace with actual data sources)
      const interval = setInterval(() => {
        // AI system updates
        sendEvent('ai-systems-update', {
          initialized: true,
          systems: { scheduler: true, optimization: true }
        })
        
        // Traffic updates
        sendEvent('traffic-update', {
          bandwidth: { current: Math.random() * 1000, peak: 1500 }
        })
        
        // Workflow updates
        sendEvent('workflow-update', {
          activeSessions: Math.floor(Math.random() * 10)
        })
      }, 5000)
      
      // Cleanup on connection close
      req.signal.addEventListener('abort', () => {
        clearInterval(interval)
        controller.close()
      })
    },
  })
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}