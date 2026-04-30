'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { SessionHistory } from './session-history'
import { WorkflowTemplates } from './workflow-templates'
import { WorkflowProgress } from './workflow-progress'
import { WorkflowAnalytics } from './workflow-analytics'
import { FunctionDiscovery } from './function-discovery'
import { WorkflowScheduler } from './workflow-scheduler'
import { ProactiveInsights } from './proactive-insights'
import { cn } from '@/lib/utils'
import {
  Send,
  Loader2,
  Bot,
  User,
  CheckCircle,
  XCircle,
  AlertCircle,
  Plus,
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
  { icon: Server, label: 'Create Node', prompt: 'Create a new Hysteria2 node', color: 'text-emerald-400' },
  { icon: Users, label: 'Add User', prompt: 'Create a new client user', color: 'text-blue-400' },
  { icon: Settings, label: 'Check Status', prompt: 'Check system status', color: 'text-violet-400' },
  { icon: RefreshCw, label: 'Restart Service', prompt: 'Restart the Hysteria2 service', color: 'text-amber-400' },
  { icon: Zap, label: 'Generate Config', prompt: 'Generate client configuration', color: 'text-cyan-400' },
  { icon: Sparkles, label: 'Complex Task', prompt: 'I need help with a complex operation', color: 'text-pink-400' },
  { icon: Command, label: 'OSINT Scan', prompt: 'Perform OSINT domain enumeration for example.com', color: 'text-orange-400' },
  { icon: AlertCircle, label: 'Threat Analysis', prompt: 'Analyze threats for IP 8.8.8.8', color: 'text-red-400' },
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
    inputRef.current?.focus()
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
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
        if (!currentStep) throw new Error('No current step found')

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
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = 'application/json'

    fileInput.onchange = async (e) => {
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
        loadSession(result.session.id)
      } catch (error) {
        console.error('Error importing workflow:', error)
        toast.error('Failed to import workflow')
      }
    }

    fileInput.click()
  }

  const getStatusConfig = () => {
    const configs: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
      completed: { color: 'border-success/30 bg-success/10 text-success', icon: <CheckCircle className="h-3 w-3" />, label: 'Completed' },
      failed: { color: 'border-destructive/30 bg-destructive/10 text-destructive', icon: <XCircle className="h-3 w-3" />, label: 'Failed' },
      processing: { color: 'border-info/30 bg-info/10 text-info', icon: <Loader2 className="h-3 w-3 animate-spin" />, label: 'Processing' },
      executing: { color: 'border-info/30 bg-info/10 text-info', icon: <Loader2 className="h-3 w-3 animate-spin" />, label: 'Executing' },
      awaiting_input: { color: 'border-warning/30 bg-warning/10 text-warning', icon: <AlertCircle className="h-3 w-3" />, label: 'Waiting' },
      idle: { color: 'border-border bg-muted text-muted-foreground', icon: <Bot className="h-3 w-3" />, label: 'Ready' },
    }
    return configs[sessionStatus] || configs.idle
  }

  const formatMessage = (content: string) => {
    if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(content)
        return (
          <pre className="bg-muted/60 border border-border/50 p-3 rounded-lg overflow-x-auto font-mono text-micro text-foreground/80">
            <code>{JSON.stringify(parsed, null, 2)}</code>
          </pre>
        )
      } catch {
        // Not valid JSON
      }
    }
    return <p className="text-body-sm whitespace-pre-wrap">{content}</p>
  }

  const getMessageBorderStyle = (type?: string) => {
    switch (type) {
      case 'success': return 'border-l-2 border-l-success'
      case 'error': return 'border-l-2 border-l-destructive'
      case 'info': return 'border-l-2 border-l-info'
      default: return ''
    }
  }

  const statusConfig = getStatusConfig()

  return (
    <>
      <Card className="flex flex-col shadow-sm" style={{ height: 'calc(100vh - 220px)', minHeight: '500px' }}>
        <CardHeader className="flex-shrink-0 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-heading-sm">AI Workflow Assistant</CardTitle>
                <CardDescription className="text-caption">
                  Natural language workflow orchestration
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className={cn("gap-1.5 text-micro", statusConfig.color)}>
                {statusConfig.icon}
                {statusConfig.label}
              </Badge>

              {currentSession && currentSession.steps.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setShowProgress(!showProgress)}
                  title="Progress"
                >
                  {showProgress ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setShowProactiveInsights(true)}
                title="Proactive Intelligence"
              >
                <Brain className="h-3.5 w-3.5" />
              </Button>
              <WorkflowScheduler />
              <WorkflowAnalytics />
              <FunctionDiscovery />
              <WorkflowTemplates onSelectTemplate={handleSelectTemplate} />
              <SessionHistory
                currentSessionId={currentSession?.id}
                onSelectSession={(sessionId) => loadSession(sessionId)}
              />
              {currentSession && (
                <>
                  <Button variant="ghost" size="icon-xs" onClick={exportWorkflow} title="Export workflow">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-xs" onClick={importWorkflow} title="Import workflow">
                    <Upload className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              <Separator orientation="vertical" className="mx-1 h-5" />
              <Button variant="outline" size="sm" onClick={startNewSession} className="gap-1.5 text-micro">
                <Plus className="h-3 w-3" />
                New Chat
              </Button>
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="flex-1 flex flex-col min-h-0 p-0">
          {/* Progress View */}
          {showProgress && currentSession && (
            <div className="border-b border-border p-4">
              <WorkflowProgress
                steps={currentSession.steps}
                currentStepOrder={currentSession.currentStepOrder}
                status={sessionStatus}
              />
            </div>
          )}

          {/* Messages */}
          <ScrollArea className="flex-1">
            <div className="p-5 space-y-4">
              {messages.length === 0 && (
                <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20 mb-4">
                    <Bot className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-heading-lg mb-1">Welcome to AI Workflow</h3>
                  <p className="text-body-sm text-muted-foreground mb-8 max-w-md">
                    Tell me what you want to accomplish in plain English. I'll handle the rest.
                  </p>

                  {/* Quick Actions */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-w-2xl mb-8">
                    {QUICK_ACTIONS.map((action) => (
                      <button
                        key={action.label}
                        onClick={() => sendMessage(action.prompt)}
                        disabled={isLoading}
                        className="flex flex-col items-center gap-2 rounded-xl border border-border/50 bg-card px-4 py-3.5 transition-all hover:border-border hover:bg-muted/50 disabled:opacity-50"
                      >
                        <action.icon className={cn("h-4 w-4", action.color)} />
                        <span className="text-micro font-medium">{action.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Suggestions */}
                  {showSuggestions && (
                    <div className="w-full max-w-lg">
                      <p className="text-micro text-muted-foreground/60 mb-2">Try asking:</p>
                      <div className="flex flex-wrap gap-1.5 justify-center">
                        {SUGGESTIONS.map((suggestion) => (
                          <button
                            key={suggestion}
                            onClick={() => sendMessage(suggestion)}
                            disabled={isLoading}
                            className="rounded-full border border-border/50 bg-card px-3 py-1 text-micro text-muted-foreground hover:text-foreground hover:border-border transition-all disabled:opacity-50"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Shortcut hint */}
                  <div className="mt-6 flex items-center gap-1 text-micro text-muted-foreground/40">
                    <kbd className="rounded border border-border px-1.5 py-0.5 text-micro font-mono">⌘K</kbd>
                    <span>to focus input</span>
                  </div>
                </div>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-3",
                    message.role === 'user' ? 'justify-end' : 'justify-start',
                  )}
                >
                  {message.role === 'ai' && (
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-micro">
                        <Bot className="h-3.5 w-3.5" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={cn(
                      "max-w-[75%] rounded-xl px-4 py-3",
                      message.role === 'user'
                        ? 'rounded-br-sm bg-primary text-primary-foreground'
                        : cn('rounded-bl-sm bg-muted/60 border border-border/50', getMessageBorderStyle(message.type)),
                    )}
                  >
                    {formatMessage(message.content)}
                    <p className="text-micro opacity-50 mt-1.5">
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                  {message.role === 'user' && (
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback className="bg-primary text-primary-foreground text-micro">
                        <User className="h-3.5 w-3.5" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary text-micro">
                      <Bot className="h-3.5 w-3.5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="rounded-xl rounded-bl-sm bg-muted/60 border border-border/50 px-4 py-3">
                    <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Processing…</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="flex-shrink-0 border-t border-border bg-card/50 p-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Describe what you want to do…"
                  disabled={isLoading || sessionStatus === 'processing' || sessionStatus === 'executing'}
                  className="w-full h-10 px-4 pr-10 rounded-xl border border-border bg-background text-body-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 transition-all"
                />
                {!input && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/30 pointer-events-none">
                    <Command className="h-3.5 w-3.5" />
                  </div>
                )}
              </div>
              <Button
                onClick={() => sendMessage()}
                disabled={isLoading || !input.trim() || sessionStatus === 'processing' || sessionStatus === 'executing'}
                size="icon"
                className="h-10 w-10 shrink-0 rounded-xl"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
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
