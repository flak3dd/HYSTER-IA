'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  MoreHorizontal,
  Search,
  Activity,
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
  {
    icon: Server,
    label: 'Create Node',
    prompt: 'Create a new Hysteria2 node',
    desc: 'Provision new infrastructure',
  },
  {
    icon: Users,
    label: 'Add User',
    prompt: 'Create a new client user',
    desc: 'Add client with quota & access',
  },
  {
    icon: Settings,
    label: 'Check Status',
    prompt: 'Check system status',
    desc: 'Health & service summary',
  },
  {
    icon: RefreshCw,
    label: 'Restart',
    prompt: 'Restart the Hysteria2 service',
    desc: 'Service lifecycle controls',
  },
  {
    icon: Zap,
    label: 'Generate Config',
    prompt: 'Generate client configuration',
    desc: 'Build a Hysteria2 client config',
  },
  {
    icon: Search,
    label: 'OSINT Scan',
    prompt: 'Perform OSINT domain enumeration for example.com',
    desc: 'Recon & subdomain enum',
  },
  {
    icon: AlertCircle,
    label: 'Threat Analysis',
    prompt: 'Analyze threats for IP 8.8.8.8',
    desc: 'Reputation, IoC & enrichment',
  },
  {
    icon: Sparkles,
    label: 'Complex Task',
    prompt: 'I need help with a complex operation',
    desc: 'Open-ended multi-step request',
  },
]

const SUGGESTIONS = [
  'Create a new node in us-east-1',
  'List all active nodes',
  'Add a new user with 10GB quota',
  'Check system health status',
  'Generate config for user',
  'Show recent activity',
  'Enumerate subdomains for example.com',
  'Analyze threats for domain google.com',
  'Perform multi-step reconnaissance then threat analysis',
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

    setMessages((prev) => [...prev, userMessage])
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

        const respondResponse = await fetch(
          `/api/workflow/sessions/${currentSession.id}/respond`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              stepId: currentStep.id,
              response: textToSend,
            }),
          },
        )

        if (!respondResponse.ok) throw new Error('Failed to send response')

        response = await respondResponse.json()
        setCurrentSession(response.session)
        setSessionStatus(response.session.status)
      }

      const messageType =
        response.nextAction === 'completed'
          ? 'success'
          : response.nextAction === 'error'
            ? 'error'
            : 'text'

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: response.message,
        timestamp: new Date(),
        type: messageType,
      }

      setMessages((prev) => [...prev, aiMessage])

      if (response.currentStep?.content) {
        const stepMessage: Message = {
          id: (Date.now() + 2).toString(),
          role: 'ai',
          content: response.currentStep.content,
          timestamp: new Date(),
          type: 'info',
        }
        setMessages((prev) => [...prev, stepMessage])
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
      setMessages((prev) => [...prev, errorMessage])
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
      setMessages((prev) => [...prev, aiMessage])

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
        if (
          step.type === 'ai_question' ||
          step.type === 'result_display' ||
          step.type === 'error_handling'
        ) {
          sessionMessages.push({
            id: step.id,
            role: 'ai',
            content: step.content || '',
            timestamp: new Date(step.timestamp),
            type:
              step.type === 'error_handling'
                ? 'error'
                : step.type === 'result_display'
                  ? 'success'
                  : 'info',
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
    const configs: Record<
      string,
      { color: string; icon: React.ReactNode; label: string }
    > = {
      completed: {
        color: 'border-success/30 bg-success/10 text-success',
        icon: <CheckCircle className="h-3 w-3" />,
        label: 'Completed',
      },
      failed: {
        color: 'border-destructive/30 bg-destructive/10 text-destructive',
        icon: <XCircle className="h-3 w-3" />,
        label: 'Failed',
      },
      processing: {
        color: 'border-info/30 bg-info/10 text-info',
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
        label: 'Processing',
      },
      executing: {
        color: 'border-info/30 bg-info/10 text-info',
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
        label: 'Executing',
      },
      awaiting_input: {
        color: 'border-warning/30 bg-warning/10 text-warning',
        icon: <AlertCircle className="h-3 w-3" />,
        label: 'Waiting',
      },
      idle: {
        color: 'border-border bg-muted text-muted-foreground',
        icon: <Activity className="h-3 w-3" />,
        label: 'Ready',
      },
    }
    return configs[sessionStatus] || configs.idle
  }

  const formatMessage = (content: string) => {
    if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(content)
        return (
          <pre className="mt-1 overflow-x-auto rounded-lg border border-border/50 bg-muted/60 p-3 font-mono text-micro text-foreground/80">
            <code>{JSON.stringify(parsed, null, 2)}</code>
          </pre>
        )
      } catch {
        // Not valid JSON
      }
    }
    return <p className="whitespace-pre-wrap text-body-sm leading-relaxed">{content}</p>
  }

  const getRoleIcon = (type?: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-3 w-3 text-success" />
      case 'error':
        return <XCircle className="h-3 w-3 text-destructive" />
      case 'info':
        return <AlertCircle className="h-3 w-3 text-info" />
      default:
        return null
    }
  }

  const getMessageBorder = (type?: string) => {
    switch (type) {
      case 'success':
        return 'border-success/30'
      case 'error':
        return 'border-destructive/30'
      case 'info':
        return 'border-info/30'
      default:
        return 'border-border/40'
    }
  }

  const statusConfig = getStatusConfig()

  return (
    <>
      <Card
        className="flex flex-col overflow-hidden border-border/60 shadow-sm"
        style={{ height: 'calc(100vh - 240px)', minHeight: '520px' }}
      >
        {/* Header */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-gradient-to-b from-muted/40 to-transparent px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-body-sm font-semibold">AI Workflow Assistant</span>
                <Badge
                  variant="outline"
                  className={cn(
                    'gap-1.5 px-2 py-0.5 text-[10px] tracking-wide',
                    statusConfig.color,
                  )}
                >
                  {statusConfig.icon}
                  {statusConfig.label}
                </Badge>
              </div>
              <p className="text-micro text-muted-foreground">
                Natural language orchestration · multi-step planning · function tools
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1">
            {/* Inline action toolbar for desktop */}
            <div className="hidden items-center gap-0.5 sm:flex">
              <WorkflowTemplates onSelectTemplate={handleSelectTemplate} />
              <SessionHistory
                currentSessionId={currentSession?.id}
                onSelectSession={(sessionId) => loadSession(sessionId)}
              />
              <FunctionDiscovery />
              <WorkflowScheduler />
              <WorkflowAnalytics />
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setShowProactiveInsights(true)}
                    />
                  }
                >
                  <Brain className="h-3.5 w-3.5" />
                </TooltipTrigger>
                <TooltipContent side="bottom">Proactive intelligence</TooltipContent>
              </Tooltip>
              {currentSession && currentSession.steps.length > 0 && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'h-8 w-8',
                          showProgress && 'bg-primary/10 text-primary',
                        )}
                        onClick={() => setShowProgress(!showProgress)}
                      />
                    }
                  >
                    {showProgress ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {showProgress ? 'Hide progress' : 'Show progress'}
                  </TooltipContent>
                </Tooltip>
              )}

              {currentSession && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="ghost" size="icon" className="h-8 w-8" />
                    }
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={exportWorkflow} className="gap-2">
                      <Download className="h-4 w-4" />
                      Export workflow
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={importWorkflow} className="gap-2">
                      <Upload className="h-4 w-4" />
                      Import workflow
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Compact toolbar for mobile: keep dialogs visible, drop labels */}
            <div className="flex items-center gap-0.5 sm:hidden">
              <WorkflowTemplates onSelectTemplate={handleSelectTemplate} />
              <SessionHistory
                currentSessionId={currentSession?.id}
                onSelectSession={(sessionId) => loadSession(sessionId)}
              />
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setShowProactiveInsights(true)}
                    />
                  }
                >
                  <Brain className="h-3.5 w-3.5" />
                </TooltipTrigger>
                <TooltipContent side="bottom">Insights</TooltipContent>
              </Tooltip>
            </div>

            <div className="mx-1 h-5 w-px bg-border/60" />

            <Button
              variant="default"
              size="sm"
              onClick={startNewSession}
              className="gap-1.5 text-micro shadow-sm shadow-primary/10"
            >
              <Plus className="h-3 w-3" />
              New
            </Button>
          </div>
        </div>

        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          {/* Progress timeline */}
          {showProgress && currentSession && (
            <div className="border-b border-border/60 bg-muted/20 p-4">
              <WorkflowProgress
                steps={currentSession.steps}
                currentStepOrder={currentSession.currentStepOrder}
                status={sessionStatus}
              />
            </div>
          )}

          {/* Messages area */}
          <ScrollArea className="flex-1">
            <div className="space-y-4 p-4 sm:p-5">
              {messages.length === 0 && (
                <WelcomeHero
                  isLoading={isLoading}
                  onSend={sendMessage}
                  showSuggestions={showSuggestions}
                />
              )}

              {messages.map((message) => {
                const roleIcon = getRoleIcon(message.type)
                if (message.role === 'user') {
                  return (
                    <div key={message.id} className="flex items-start justify-end gap-3">
                      <div className="max-w-[78%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground shadow-sm">
                        {formatMessage(message.content)}
                        <p className="mt-1 text-[10px] opacity-50">
                          {message.timestamp.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="bg-primary text-primary-foreground text-micro">
                          <User className="h-3.5 w-3.5" />
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  )
                }

                return (
                  <div key={message.id} className="flex items-start gap-3">
                    <Avatar className="h-7 w-7 shrink-0 ring-1 ring-primary/20">
                      <AvatarFallback className="bg-primary/10 text-primary text-micro">
                        <Bot className="h-3.5 w-3.5" />
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={cn(
                        'group max-w-[80%] rounded-2xl rounded-bl-md border bg-muted/40 px-4 py-2.5',
                        getMessageBorder(message.type),
                      )}
                    >
                      {roleIcon && (
                        <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide">
                          {roleIcon}
                          <span
                            className={cn(
                              'font-medium',
                              message.type === 'success' && 'text-success',
                              message.type === 'error' && 'text-destructive',
                              message.type === 'info' && 'text-info',
                            )}
                          >
                            {message.type === 'success'
                              ? 'Result'
                              : message.type === 'error'
                                ? 'Error'
                                : message.type === 'info'
                                  ? 'Step'
                                  : ''}
                          </span>
                        </div>
                      )}
                      {formatMessage(message.content)}
                      <p className="mt-1 text-[10px] text-muted-foreground/60">
                        {message.timestamp.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                )
              })}

              {isLoading && (
                <div className="flex items-start gap-3">
                  <Avatar className="h-7 w-7 shrink-0 ring-2 ring-primary/20">
                    <AvatarFallback className="bg-primary/10 text-primary text-micro">
                      <Bot className="h-3.5 w-3.5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="rounded-2xl rounded-bl-md border border-primary/20 bg-gradient-to-br from-primary/[0.08] to-primary/[0.02] px-4 py-2.5">
                    <div className="flex items-center gap-2 text-body-sm text-primary">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Thinking…</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="shrink-0 border-t border-border/60 bg-card/80 p-3 sm:p-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Describe what you want to accomplish in plain English…"
                  disabled={
                    isLoading || sessionStatus === 'processing' || sessionStatus === 'executing'
                  }
                  className="h-11 w-full rounded-xl border border-border/60 bg-background/60 px-4 pr-10 text-body-sm shadow-inner transition-all placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                />
                {!input && !isLoading && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 cursor-help text-muted-foreground/40">
                          <Command className="h-3.5 w-3.5" />
                        </div>
                      }
                    />
                    <TooltipContent side="left">⌘K to focus</TooltipContent>
                  </Tooltip>
                )}
              </div>
              <Button
                onClick={() => sendMessage()}
                disabled={
                  isLoading ||
                  !input.trim() ||
                  sessionStatus === 'processing' ||
                  sessionStatus === 'executing'
                }
                size="icon"
                className="h-11 w-11 shrink-0 rounded-xl bg-primary shadow-md shadow-primary/20 hover:bg-primary/90"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-micro text-muted-foreground/70">
              <span>
                <kbd className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">
                  Enter
                </kbd>{' '}
                send ·{' '}
                <kbd className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">
                  Esc
                </kbd>{' '}
                clear
              </span>
              {currentSession && (
                <span className="hidden items-center gap-1 sm:inline-flex">
                  <Activity className="h-3 w-3" />
                  Session{' '}
                  <code className="rounded bg-muted px-1 font-mono">
                    {currentSession.id.slice(0, 8)}
                  </code>
                </span>
              )}
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

/* ------------------------------------------------------------------ */
/*  Welcome hero (no messages yet)                                    */
/* ------------------------------------------------------------------ */

function WelcomeHero({
  isLoading,
  onSend,
  showSuggestions,
}: {
  isLoading: boolean
  onSend: (prompt: string) => void
  showSuggestions: boolean
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 py-8 text-center">
      <div className="relative">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 rounded-full bg-primary/20 blur-3xl"
        />
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 to-primary/5 ring-1 ring-primary/30">
          <Bot className="h-8 w-8 text-primary glow-primary" />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-heading-lg">What should we run today?</h3>
        <p className="max-w-xl text-body-sm text-muted-foreground">
          Tell me what you want to accomplish in plain English. I&apos;ll plan the steps, ask
          clarifying questions, and execute against your infrastructure.
        </p>
      </div>

      {/* Quick action grid */}
      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            onClick={() => onSend(action.prompt)}
            disabled={isLoading}
            className="group flex flex-col items-start gap-1.5 rounded-xl border border-border/40 bg-card/50 px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/20 transition-colors group-hover:bg-primary/20">
              <action.icon className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-body-sm font-medium text-foreground/90 group-hover:text-primary">
              {action.label}
            </span>
            <span className="line-clamp-1 text-[10px] text-muted-foreground/70">
              {action.desc}
            </span>
          </button>
        ))}
      </div>

      {/* Suggestion chips */}
      {showSuggestions && (
        <div className="w-full">
          <div className="mb-2 flex items-center justify-center gap-2 text-micro text-muted-foreground/60">
            <span className="h-px w-8 bg-border/60" />
            <span>Or try a suggestion</span>
            <span className="h-px w-8 bg-border/60" />
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => onSend(suggestion)}
                disabled={isLoading}
                className="rounded-full border border-border/50 bg-card px-3 py-1.5 text-micro text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-foreground disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5 text-micro text-muted-foreground/40">
        <kbd className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">
          ⌘K
        </kbd>
        <span>to focus input</span>
      </div>
    </div>
  )
}
