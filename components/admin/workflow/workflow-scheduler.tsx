'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { 
  Calendar,
  Clock,
  Trash2,
  Play,
  Pause,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'

interface ScheduledWorkflow {
  id: string
  name: string
  description?: string
  initialRequest: string
  scheduledFor: string
  interval?: string
  status: string
  lastRunAt?: string
  nextRunAt?: string
  runCount: number
  createdAt: string
}

export function WorkflowScheduler() {
  const [isOpen, setIsOpen] = useState(false)
  const [scheduledWorkflows, setScheduledWorkflows] = useState<ScheduledWorkflow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    initialRequest: '',
    scheduledFor: '',
    interval: '',
  })

  const loadScheduledWorkflows = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/workflow/scheduled')
      if (!response.ok) throw new Error('Failed to load scheduled workflows')
      
      const data = await response.json()
      setScheduledWorkflows(data.scheduledWorkflows)
    } catch (error) {
      console.error('Error loading scheduled workflows:', error)
      toast.error('Failed to load scheduled workflows')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadScheduledWorkflows()
    }
  }, [isOpen])

  const createScheduledWorkflow = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name || !formData.initialRequest || !formData.scheduledFor) {
      toast.error('Please fill in all required fields')
      return
    }

    try {
      const response = await fetch('/api/workflow/scheduled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      
      if (!response.ok) throw new Error('Failed to schedule workflow')
      
      toast.success('Workflow scheduled successfully')
      setFormData({ name: '', description: '', initialRequest: '', scheduledFor: '', interval: '' })
      setShowCreateForm(false)
      loadScheduledWorkflows()
    } catch (error) {
      console.error('Error scheduling workflow:', error)
      toast.error('Failed to schedule workflow')
    }
  }

  const deleteScheduledWorkflow = async (id: string) => {
    try {
      const response = await fetch(`/api/workflow/scheduled/${id}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) throw new Error('Failed to delete scheduled workflow')
      
      toast.success('Scheduled workflow deleted')
      loadScheduledWorkflows()
    } catch (error) {
      console.error('Error deleting scheduled workflow:', error)
      toast.error('Failed to delete scheduled workflow')
    }
  }

  const toggleWorkflowStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'pending' ? 'cancelled' : 'pending'
    
    try {
      const response = await fetch(`/api/workflow/scheduled/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      
      if (!response.ok) throw new Error('Failed to update workflow status')
      
      toast.success(`Workflow ${newStatus === 'pending' ? 'enabled' : 'disabled'}`)
      loadScheduledWorkflows()
    } catch (error) {
      console.error('Error updating workflow status:', error)
      toast.error('Failed to update workflow status')
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString()
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; label: string }> = {
      pending: { color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', label: 'Pending' },
      running: { color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', label: 'Running' },
      completed: { color: 'bg-green-500/10 text-green-500 border-green-500/20', label: 'Completed' },
      failed: { color: 'bg-red-500/10 text-red-500 border-red-500/20', label: 'Failed' },
      cancelled: { color: 'bg-gray-500/10 text-gray-500 border-gray-500/20', label: 'Cancelled' },
    }

    const config = statusConfig[status] || statusConfig.pending
    return (
      <Badge variant="outline" className={config.color}>
        {config.label}
      </Badge>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Calendar className="h-4 w-4" />
          Schedule
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Scheduled Workflows</DialogTitle>
          <DialogDescription>
            Schedule workflows to run at specific times or intervals
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 overflow-hidden">
          {/* Create Button */}
          {!showCreateForm && (
            <Button
              onClick={() => setShowCreateForm(true)}
              className="w-full gap-2"
            >
              <Plus className="h-4 w-4" />
              Schedule New Workflow
            </Button>
          )}

          {/* Create Form */}
          {showCreateForm && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Schedule New Workflow</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={createScheduledWorkflow} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Name *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Daily system check"
                      />
                    </div>
                    <div>
                      <Label htmlFor="scheduledFor">Scheduled For *</Label>
                      <Input
                        id="scheduledFor"
                        type="datetime-local"
                        value={formData.scheduledFor}
                        onChange={(e) => setFormData({ ...formData, scheduledFor: e.target.value })}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Optional description"
                    />
                  </div>

                  <div>
                    <Label htmlFor="initialRequest">Initial Request *</Label>
                    <Textarea
                      id="initialRequest"
                      value={formData.initialRequest}
                      onChange={(e) => setFormData({ ...formData, initialRequest: e.target.value })}
                      placeholder="Check system status and generate report"
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label htmlFor="interval">Interval (Optional)</Label>
                    <Input
                      id="interval"
                      value={formData.interval}
                      onChange={(e) => setFormData({ ...formData, interval: e.target.value })}
                      placeholder="e.g., 0 9 * * * (daily at 9am) or 1h (hourly)"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Use cron expression (e.g., "0 9 * * *") or interval (e.g., "1h", "30m", "1d")
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button type="submit" className="flex-1">
                      Schedule Workflow
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowCreateForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Scheduled Workflows List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : scheduledWorkflows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No scheduled workflows</p>
                <p className="text-sm mt-1">Schedule a workflow to see it here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {scheduledWorkflows.map((workflow) => (
                  <Card key={workflow.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold">{workflow.name}</h3>
                            {getStatusBadge(workflow.status)}
                          </div>
                          {workflow.description && (
                            <p className="text-sm text-muted-foreground mb-2">
                              {workflow.description}
                            </p>
                          )}
                          <div className="space-y-1 text-xs text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <Clock className="h-3 w-3" />
                              <span>Scheduled: {formatDate(workflow.scheduledFor)}</span>
                            </div>
                            {workflow.nextRunAt && (
                              <div className="flex items-center gap-2">
                                <RefreshCw className="h-3 w-3" />
                                <span>Next run: {formatDate(workflow.nextRunAt)}</span>
                              </div>
                            )}
                            {workflow.interval && (
                              <div className="flex items-center gap-2">
                                <Calendar className="h-3 w-3" />
                                <span>Interval: {workflow.interval}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <Play className="h-3 w-3" />
                              <span>Runs: {workflow.runCount}</span>
                            </div>
                          </div>
                          <div className="mt-2 p-2 bg-muted rounded text-xs font-mono">
                            {workflow.initialRequest}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleWorkflowStatus(workflow.id, workflow.status)}
                            title={workflow.status === 'pending' ? 'Pause' : 'Resume'}
                          >
                            {workflow.status === 'pending' ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteScheduledWorkflow(workflow.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}