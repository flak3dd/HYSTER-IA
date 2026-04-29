'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  CheckCircle, 
  Circle, 
  Loader2, 
  XCircle, 
  Clock,
  ChevronRight,
} from 'lucide-react'

interface WorkflowStep {
  id: string
  type: string
  order: number
  content?: string
  completed: boolean
  error?: string
  timestamp: string
}

interface WorkflowProgressProps {
  steps: WorkflowStep[]
  currentStepOrder: number
  status: string
}

export function WorkflowProgress({ steps, currentStepOrder, status }: WorkflowProgressProps) {
  const getStepStatus = (step: WorkflowStep, isCurrent: boolean) => {
    if (step.error) return 'error'
    if (step.completed) return 'completed'
    if (isCurrent && (status === 'processing' || status === 'executing')) return 'processing'
    return 'pending'
  }

  const getStepIcon = (stepStatus: string) => {
    switch (stepStatus) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
      case 'pending':
        return <Circle className="h-4 w-4 text-muted-foreground" />
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getStepColor = (stepStatus: string) => {
    switch (stepStatus) {
      case 'completed':
        return 'border-green-500/30 bg-green-500/5'
      case 'error':
        return 'border-red-500/30 bg-red-500/5'
      case 'processing':
        return 'border-blue-500/30 bg-blue-500/5'
      case 'pending':
        return 'border-muted bg-muted/30'
      default:
        return 'border-muted bg-muted/30'
    }
  }

  const getStepTypeLabel = (type: string) => {
    switch (type) {
      case 'ai_question':
        return 'AI Analysis'
      case 'user_response':
        return 'User Input'
      case 'backend_execution':
        return 'Executing'
      case 'result_display':
        return 'Result'
      case 'error_handling':
        return 'Error'
      default:
        return type
    }
  }

  const progressPercentage = steps.length > 0 
    ? Math.round((steps.filter(s => s.completed).length / steps.length) * 100)
    : 0

  if (steps.length === 0) {
    return null
  }

  return (
    <Card className="border-none shadow-none">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Workflow Progress</h3>
            <Badge variant="outline" className="text-xs">
              {progressPercentage}% complete
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {steps.filter(s => s.completed).length} of {steps.length} steps
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-4">
          <div 
            className="h-full bg-primary transition-all duration-500 ease-in-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        {/* Steps Timeline */}
        <div className="space-y-2">
          {steps.map((step, index) => {
            const isCurrent = step.order === currentStepOrder
            const stepStatus = getStepStatus(step, isCurrent)
            
            return (
              <div
                key={step.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                  isCurrent ? 'border-primary/50 bg-primary/5' : getStepColor(stepStatus)
                }`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {getStepIcon(stepStatus)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">
                      Step {step.order + 1}: {getStepTypeLabel(step.type)}
                    </span>
                    {isCurrent && (
                      <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
                        Current
                      </Badge>
                    )}
                  </div>
                  
                  {step.content && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {step.content}
                    </p>
                  )}
                  
                  {step.error && (
                    <p className="text-xs text-red-500 mt-1">
                      {step.error}
                    </p>
                  )}
                  
                  <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>
                      {new Date(step.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                {index < steps.length - 1 && (
                  <div className="flex-shrink-0">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}