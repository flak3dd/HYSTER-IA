'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  History, 
  Trash2, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'

interface SessionHistoryItem {
  id: string
  status: string
  createdAt: string
  updatedAt: string
  stepCount: number
}

interface SessionHistoryProps {
  onSelectSession?: (sessionId: string) => void
  currentSessionId?: string
}

export function SessionHistory({ onSelectSession, currentSessionId }: SessionHistoryProps) {
  const [sessions, setSessions] = useState<SessionHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  const loadSessions = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/workflow/sessions')
      if (!response.ok) throw new Error('Failed to load sessions')
      
      const data = await response.json()
      setSessions(data.sessions || [])
    } catch (error) {
      console.error('Error loading sessions:', error)
      toast.error('Failed to load session history')
    } finally {
      setIsLoading(false)
    }
  }

  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const response = await fetch(`/api/workflow/sessions/${sessionId}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to delete session')
      
      setSessions(prev => prev.filter(s => s.id !== sessionId))
      toast.success('Session deleted')
    } catch (error) {
      console.error('Error deleting session:', error)
      toast.error('Failed to delete session')
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'processing':
      case 'executing':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
      case 'awaiting_input':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />
      default:
        return <Clock className="h-4 w-4 text-gray-500" />
    }
  }

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      completed: 'bg-green-500/10 text-green-500 border-green-500/20',
      failed: 'bg-red-500/10 text-red-500 border-red-500/20',
      processing: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      executing: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      awaiting_input: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      idle: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
    }

    return (
      <Badge variant="outline" className={statusColors[status] || statusColors.idle}>
        {status.replace('_', ' ')}
      </Badge>
    )
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  useEffect(() => {
    if (isOpen) {
      loadSessions()
    }
  }, [isOpen])

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-2"
      >
        <History className="h-4 w-4" />
        History
      </Button>
    )
  }

  return (
    <Card className="border shadow-lg">
      <CardContent className="p-0">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5" />
            <h3 className="font-semibold">Session History</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
            Close
          </Button>
        </div>

        {isLoading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No session history yet</p>
            <p className="text-sm mt-1">Start a conversation to see it here</p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`p-4 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer transition-colors ${
                  currentSessionId === session.id ? 'bg-muted' : ''
                }`}
                onClick={() => {
                  onSelectSession?.(session.id)
                  setIsOpen(false)
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getStatusIcon(session.status)}
                      <span className="text-sm font-medium truncate">
                        {session.stepCount} {session.stepCount === 1 ? 'step' : 'steps'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{formatDate(session.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(session.status)}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => deleteSession(session.id, e)}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}