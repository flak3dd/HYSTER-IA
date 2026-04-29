'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SessionHistory } from './session-history'
import { WorkflowTemplates } from './workflow-templates'
import { WorkflowProgress } from './workflow-progress'
import { WorkflowAnalytics } from './workflow-analytics'
import { FunctionDiscovery } from './function-discovery'
import { WorkflowScheduler } from './workflow-scheduler'
import { ProactiveInsights } from './proactive-insights'
import { 
  Send, 
  Loader2, 
  Bot, 
  User, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Plus,
  History,
  Sparkles,
  Zap,
  Server,
  Users,
  Settings,
  RefreshCw,
  Command,
  ChevronDown,
  ChevronUp,
  Download,
  Upload,
  Brain,
} from 'lucide-react'
import { toast } from 'sonner'

interface Message {
  id: string
  role: 'ai' | 'user'
  content: string
  timestamp: Date
  type?: 'text' | 'success' | 'error' | 'info' | 'code'
}

interface WorkflowSession {
  id: string
  status: string
  currentStepOrder: number
  steps: any[]
}

const QUICK_ACTIONS = [
  { icon: Server, label: 'Create Node', prompt: 'Create a new Hysteria2 node' },
  { icon: Users, label: 'Add User', prompt: 'Create a new client user' },
  { icon: Settings, label: 'Check Status', prompt: 'Check system status' },
  { icon: RefreshCw, label: 'Restart Service', prompt: 'Restart the Hysteria2 service' },
  { icon: Zap, label: 'Generate Config', prompt: 'Generate client configuration' },
  { icon: Sparkles, label: 'Complex Task', prompt: 'I need help with a complex operation' },
  { icon: Command, label: 'OSINT Scan', prompt: 'Perform OSINT domain enumeration for example.com' },
  { icon: AlertCircle, label: 'Threat Analysis', prompt: 'Analyze threats for IP 8.8.8.8' },
]

const SUGGESTIONS = [
  "Create a new node in us-east-1",
  "List all active nodes",
  "Add a new user with 10GB quota",
  "Check system health status",
  "Generate config for user",
  "Show recent activity",
  "Enumerate subdomains for example.com",
  "Analyze threats for domain google.com",
  "Perform multi-step reconnaissance then threat analysis",
]

export function WorkflowChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [currentSession, setCurrentSession] = useState<WorkflowSession | null>(null)
  const [sessionStatus, setSessionStatus] = useState<string>('idle')
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [showProgress, setShowProgress] = useState(false)
  const [showProactiveInsights, setShowProactiveInsights] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    // Focus input on mount
    inputRef.current?.focus()
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K to focus input
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      // Escape to clear input
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        setInput('')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const sendMessage = async (promptText?: string) => {
    const textToSend = promptText || input
    if (!textToSend.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setShowSuggestions(false)
    setIsLoading(true)

    try {
      let response

      if (!currentSession) {
        const createResponse = await fetch('/api/workflow/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initialRequest: textToSend }),
        })
        
        if (!createResponse.ok) throw new Error('Failed to create session')
        
        response = await createResponse.json()
        setCurrentSession(response.session)
        setSessionStatus(response.session.status)
      } else {
        const currentStep = currentSession.steps[currentSession.currentStepOrder]
        if (!currentStep) {
          throw new Error('No current step found')
        }

        const respondResponse = await fetch(`/api/workflow/sessions/${currentSession.id}/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stepId: currentStep.id,
            response: textToSend,
          }),
        })

        if (!respondResponse.ok) throw new Error('Failed to send response')
        
        response = await respondResponse.json()
        setCurrentSession(response.session)
        setSessionStatus(response.session.status)
      }

      // Add AI response with appropriate type
      const messageType = response.nextAction === 'completed' ? 'success' : 
                         response.nextAction === 'error' ? 'error' : 'text'
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: response.message,
        timestamp: new Date(),
        type: messageType,
      }

      setMessages(prev => [...prev, aiMessage])

      if (response.currentStep?.content) {
        const stepMessage: Message = {
          id: (Date.now() + 2).toString(),
          role: 'ai',
          content: response.currentStep.content,
          timestamp: new Date(),
          type: 'info',
        }
        setMessages(prev => [...prev, stepMessage])
      }

      if (response.nextAction === 'completed') {
        toast.success('Workflow completed successfully!')
      } else if (response.nextAction === 'error') {
        toast.error('Workflow encountered an error')
      }

      if (response.nextAction === 'processing' && currentSession) {
        await processSession(response.session.id)
      }

    } catch (error) {
      console.error('Error sending message:', error)
      toast.error('Failed to send message')
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
        type: 'error',
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const processSession = async (sessionId: string) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/workflow/sessions/${sessionId}`, {
        method: 'POST',
      })

      if (!response.ok) throw new Error('Failed to process session')

      const result = await response.json()
      setCurrentSession(result.session)
      setSessionStatus(result.session.status)

      const aiMessage: Message = {
        id: Date.now().toString(),
        role: 'ai',
        content: result.message,
        timestamp: new Date(),
        type: result.nextAction === 'completed' ? 'success' : 'text',
      }
      setMessages(prev => [...prev, aiMessage])

      if (result.nextAction === 'processing') {
        await processSession(sessionId)
      }
    } catch (error) {
      console.error('Error processing session:', error)
      toast.error('Failed to process session')
    } finally {
      setIsLoading(false)
    }
  }

  const loadSession = async (sessionId: string) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/workflow/sessions/${sessionId}`)
      if (!response.ok) throw new Error('Failed to load session')
      
      const data = await response.json()
      const session = data.session
      
      setCurrentSession(session)
      setSessionStatus(session.status)
      
      // Convert session steps to messages
      const sessionMessages: Message[] = []
      session.steps.forEach((step: any) => {
        if (step.type === 'ai_question' || step.type === 'result_display' || step.type === 'error_handling') {
          sessionMessages.push({
            id: step.id,
            role: 'ai',
            content: step.content || '',
            timestamp: new Date(step.timestamp),
            type: step.type === 'error_handling' ? 'error' : step.type === 'result_display' ? 'success' : 'info',
          })
        } else if (step.type === 'user_response' && step.userResponse) {
          sessionMessages.push({
            id: step.id,
            role: 'user',
            content: step.userResponse,
            timestamp: new Date(step.timestamp),
          })
        }
      })
      
      setMessages(sessionMessages)
      setShowSuggestions(false)
      toast.success('Session loaded successfully')
    } catch (error) {
      console.error('Error loading session:', error)
      toast.error('Failed to load session')
    } finally {
      setIsLoading(false)
    }
  }

  const startNewSession = () => {
    setMessages([])
    setCurrentSession(null)
    setSessionStatus('idle')
    setInput('')
    setShowSuggestions(true)
    inputRef.current?.focus()
  }

  const handleSelectTemplate = (template: any) => {
    startNewSession()
    // If the template has required parameters, we could show a modal to collect them
    // For now, just use the initial prompt
    sendMessage(template.initialPrompt)
  }

  const exportWorkflow = async () => {
    if (!currentSession) {
      toast.error('No active session to export')
      return
    }

    try {
      const response = await fetch(`/api/workflow/sessions/${currentSession.id}/export`)
      if (!response.ok) throw new Error('Failed to export workflow')
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `workflow-${currentSession.id.slice(0, 8)}.json`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      
      toast.success('Workflow exported successfully')
    } catch (error) {
      console.error('Error exporting workflow:', error)
      toast.error('Failed to export workflow')
    }
  }

  const importWorkflow = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const workflowData = JSON.parse(text)
        
        const response = await fetch('/api/workflow/sessions/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflowData }),
        })
        
        if (!response.ok) throw new Error('Failed to import workflow')
        
        const result = await response.json()
        toast.success('Workflow imported successfully')
        
        // Load the imported session
        loadSession(result.session.id)
      } catch (error) {
        console.error('Error importing workflow:', error)
        toast.error('Failed to import workflow')
      }
    }
    
    input.click()
  }

  const getStatusBadge = () => {
    const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
      completed: { color: 'bg-green-500/10 text-green-500 border-green-500/20', icon: <CheckCircle className="h-4 w-4" />, label: 'Completed' },
      failed: { color: 'bg-red-500/10 text-red-500 border-red-500/20', icon: <XCircle className="h-4 w-4" />, label: 'Failed' },
      processing: { color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: <Loader2 className="h-4 w-4 animate-spin" />, label: 'Processing' },
      executing: { color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: <Loader2 className="h-4 w-4 animate-spin" />, label: 'Executing' },
      awaiting_input: { color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', icon: <AlertCircle className="h-4 w-4" />, label: 'Waiting' },
      idle: { color: 'bg-gray-500/10 text-gray-500 border-gray-500/20', icon: <Bot className="h-4 w-4" />, label: 'Ready' },
    }

    const config = statusConfig[sessionStatus] || statusConfig.idle
    return (
      <Badge variant="outline" className={config.color}>
        {config.icon}
        <span className="ml-1">{config.label}</span>
      </Badge>
    )
  }

  const formatMessage = (content: string) => {
    // Check if content looks like JSON or code
    if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(content)
        return (
          <pre className="bg-black/50 p-3 rounded-lg overflow-x-auto text-xs">
            <code>{JSON.stringify(parsed, null, 2)}</code>
          </pre>
        )
      } catch {
        // If not valid JSON, render as plain text
      }
    }
    return <p className="text-sm whitespace-pre-wrap">{content}</p>
  }

  const getMessageStyle = (message: Message) => {
    const baseStyle = message.role === 'user' 
      ? 'bg-primary text-primary-foreground' 
      : 'bg-muted'
    
    const typeStyles: Record<string, string> = {
      success: 'border-green-500/50 bg-green-500/10',
      error: 'border-red-500/50 bg-red-500/10',
      info: 'border-blue-500/50 bg-blue-500/10',
      code: 'font-mono text-xs',
    }

    return message.type && typeStyles[message.type] 
      ? `${baseStyle} ${typeStyles[message.type]} border` 
      : baseStyle
  }

  return (
    <>
    <Card className="h-[700px] flex flex-col shadow-lg">
      <CardHeader className="flex-shrink-0 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">AI Workflow Assistant</CardTitle>
              <CardDescription className="text-xs">
                Natural language workflow orchestration
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge()}
            {currentSession && currentSession.steps.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowProgress(!showProgress)}
                className="gap-2"
              >
                {showProgress ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Progress
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowProactiveInsights(true)}
              className="gap-2"
              title="Proactive Intelligence"
            >
              <Brain className="h-4 w-4" />
            </Button>
            <WorkflowScheduler />
            <WorkflowAnalytics />
            <FunctionDiscovery />
            <WorkflowTemplates onSelectTemplate={handleSelectTemplate} />
            <SessionHistory 
              currentSessionId={currentSession?.id}
              onSelectSession={(sessionId) => {
                loadSession(sessionId)
              }}
            />
            {currentSession && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportWorkflow}
                  className="gap-2"
                  title="Export workflow"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={importWorkflow}
                  className="gap-2"
                  title="Import workflow"
                >
                  <Upload className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={startNewSession}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              New Chat
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0 p-0">
        {/* Progress View */}
        {showProgress && currentSession && (
          <div className="border-b p-4">
            <WorkflowProgress
              steps={currentSession.steps}
              currentStepOrder={currentSession.currentStepOrder}
              status={sessionStatus}
            />
          </div>
        )}
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="p-4 bg-primary/10 rounded-full mb-4">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Welcome to AI Workflow</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-md">
                Tell me what you want to accomplish in plain English. I'll handle the rest.
              </p>
              
              {/* Quick Actions */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-w-2xl mb-6">
                {QUICK_ACTIONS.map((action) => (
                  <Button
                    key={action.label}
                    variant="outline"
                    size="sm"
                    onClick={() => sendMessage(action.prompt)}
                    className="h-auto flex-col gap-2 py-3"
                    disabled={isLoading}
                  >
                    <action.icon className="h-4 w-4" />
                    <span className="text-xs">{action.label}</span>
                  </Button>
                ))}
              </div>

              {/* Suggestions */}
              {showSuggestions && (
                <div className="w-full max-w-lg">
                  <p className="text-xs text-muted-foreground mb-2">Try asking:</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {SUGGESTIONS.map((suggestion) => (
                      <Button
                        key={suggestion}
                        variant="ghost"
                        size="sm"
                        onClick={() => sendMessage(suggestion)}
                        className="h-7 text-xs"
                        disabled={isLoading}
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Keyboard shortcut hint */}
              <div className="mt-4 text-xs text-muted-foreground flex items-center gap-1">
                <Command className="h-3 w-3" />
                <span>+</span>
                <span>K</span>
                <span className="ml-1">to focus input</span>
              </div>
            </div>
          )}
          
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'ai' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-lg px-4 py-3 ${getMessageStyle(message)}`}>
                {formatMessage(message.content)}
                <p className="text-xs opacity-70 mt-2">
                  {message.timestamp.toLocaleTimeString()}
                </p>
              </div>
              {message.role === 'user' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <User className="h-5 w-5 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}
          
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div className="bg-muted rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Processing...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="flex-shrink-0 border-t p-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Describe what you want to do... (Cmd+K to focus)"
                disabled={isLoading || sessionStatus === 'processing' || sessionStatus === 'executing'}
                className="w-full h-10 px-4 pr-10 rounded-md border border-input bg-background text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              {!input && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                  <Command className="h-4 w-4" />
                </div>
              )}
            </div>
            <Button
              onClick={() => sendMessage()}
              disabled={isLoading || !input.trim() || sessionStatus === 'processing' || sessionStatus === 'executing'}
              size="icon"
              className="h-10 w-10"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
    
    {/* Proactive Insights Modal */}
    <ProactiveInsights 
      isOpen={showProactiveInsights} 
      onClose={() => setShowProactiveInsights(false)} 
    />
    </>
  )
}