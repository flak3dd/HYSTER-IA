export class SSEClient {
  private eventSource: EventSource | null = null
  private listeners: Map<string, Set<(data: any) => void>> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 5000
  private url: string = ''
  
  connect(url: string) {
    if (this.eventSource) {
      this.disconnect()
    }
    
    this.url = url
    this.eventSource = new EventSource(url)
    
    this.eventSource.onopen = () => {
      console.log('SSE connected')
      this.reconnectAttempts = 0
    }
    
    this.eventSource.onerror = (error) => {
      console.error('SSE error:', error)
      this.eventSource?.close()
      
      // Auto-reconnect logic
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++
        setTimeout(() => this.connect(this.url), this.reconnectDelay)
      }
    }
    
    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const { type, payload } = data
        
        const listeners = this.listeners.get(type)
        if (listeners) {
          listeners.forEach(listener => listener(payload))
        }
      } catch (error) {
        console.error('Failed to parse SSE message:', error)
      }
    }
  }
  
  subscribe(eventType: string, callback: (data: any) => void) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType)!.add(callback)
    
    // Return unsubscribe function
    return () => {
      this.listeners.get(eventType)?.delete(callback)
    }
  }
  
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
    this.listeners.clear()
    this.reconnectAttempts = 0
  }
  
  isConnected(): boolean {
    return this.eventSource !== null && this.eventSource.readyState === EventSource.OPEN
  }
}

// Singleton instance
export const sseClient = new SSEClient()