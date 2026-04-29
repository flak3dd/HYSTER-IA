'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { 
  Search,
  Server,
  Users,
  FileCode,
  Activity,
  RefreshCw,
  Edit,
  Trash,
  Zap,
  Heart,
  List,
  X,
} from 'lucide-react'
import { WORKFLOW_TEMPLATES, searchTemplates, getTemplatesByCategory, type WorkflowTemplate } from '@/lib/workflow/templates'

interface WorkflowTemplatesProps {
  onSelectTemplate: (template: WorkflowTemplate) => void
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  node_management: <Server className="h-4 w-4" />,
  user_management: <Users className="h-4 w-4" />,
  configuration: <FileCode className="h-4 w-4" />,
  system: <Activity className="h-4 w-4" />,
  advanced: <Zap className="h-4 w-4" />,
}

const CATEGORY_COLORS: Record<string, string> = {
  node_management: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  user_management: 'bg-green-500/10 text-green-500 border-green-500/20',
  configuration: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  system: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  advanced: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
}

export function WorkflowTemplates({ onSelectTemplate }: WorkflowTemplatesProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const filteredTemplates = selectedCategory 
    ? getTemplatesByCategory(selectedCategory as any)
    : searchTemplates(searchQuery)

  const categories = Array.from(new Set(WORKFLOW_TEMPLATES.map(t => t.category)))

  const handleSelectTemplate = (template: WorkflowTemplate) => {
    onSelectTemplate(template)
    setIsOpen(false)
    setSearchQuery('')
    setSelectedCategory(null)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <List className="h-4 w-4" />
          Templates
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Workflow Templates</DialogTitle>
          <DialogDescription>
            Choose a pre-built template to quickly start common operations
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 overflow-hidden">
          {/* Search and Filters */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Category Filters */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={selectedCategory === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(null)}
            >
              All
            </Button>
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                className="gap-1"
              >
                {CATEGORY_ICONS[category]}
                <span className="capitalize">{category.replace('_', ' ')}</span>
              </Button>
            ))}
          </div>

          {/* Templates Grid */}
          <div className="flex-1 overflow-y-auto">
            {filteredTemplates.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No templates found matching your search</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredTemplates.map((template) => (
                  <Card
                    key={template.id}
                    className="cursor-pointer hover:border-primary transition-colors"
                    onClick={() => handleSelectTemplate(template)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <CardTitle className="text-base flex items-center gap-2">
                            {template.icon && CATEGORY_ICONS[template.icon] || CATEGORY_ICONS[template.category]}
                            {template.name}
                          </CardTitle>
                          <CardDescription className="text-xs mt-1">
                            {template.description}
                          </CardDescription>
                        </div>
                        <Badge variant="outline" className={CATEGORY_COLORS[template.category]}>
                          <span className="capitalize text-xs">
                            {template.category.replace('_', ' ')}
                          </span>
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>~{template.estimatedSteps} steps</span>
                        {template.requiredParams && template.requiredParams.length > 0 && (
                          <>
                            <span>•</span>
                            <span>{template.requiredParams.length} parameters</span>
                          </>
                        )}
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