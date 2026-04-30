'use client'

import { useState, useEffect } from 'react'
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
  Code,
  Server,
  Users,
  FileCode,
  Activity,
  Zap,
  Shield,
  AlertTriangle,
  Copy,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'

interface FunctionParameter {
  name: string
  type: string
  description: string
  required: boolean
  defaultValue?: unknown
}

interface BackendFunction {
  id: string
  name: string
  description: string
  category: string
  parameters: FunctionParameter[]
  implementation: string
  requiresAuth: boolean
  dangerous: boolean
  enabled: boolean
}

export function FunctionDiscovery() {
  const [isOpen, setIsOpen] = useState(false)
  const [functions, setFunctions] = useState<BackendFunction[]>([])
  const [filteredFunctions, setFilteredFunctions] = useState<BackendFunction[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [copiedFunction, setCopiedFunction] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const loadFunctions = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/workflow/functions')
      if (!response.ok) throw new Error('Failed to load functions')
      
      const data = await response.json()
      setFunctions(data.functions)
      setFilteredFunctions(data.functions)
    } catch (error) {
      console.error('Error loading functions:', error)
      toast.error('Failed to load functions')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadFunctions()
    }
  }, [isOpen])

  useEffect(() => {
    let filtered = functions

    // Filter by category
    if (selectedCategory) {
      filtered = filtered.filter(f => f.category === selectedCategory)
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(f => 
        f.name.toLowerCase().includes(query) ||
        f.description.toLowerCase().includes(query) ||
        f.category.toLowerCase().includes(query)
      )
    }

    setFilteredFunctions(filtered)
  }, [searchQuery, selectedCategory, functions])

  const categories = Array.from(new Set(functions.map(f => f.category)))

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'node_management':
        return <Server className="h-4 w-4" />
      case 'user_management':
        return <Users className="h-4 w-4" />
      case 'configuration':
        return <FileCode className="h-4 w-4" />
      case 'system':
        return <Activity className="h-4 w-4" />
      case 'advanced':
        return <Zap className="h-4 w-4" />
      default:
        return <Code className="h-4 w-4" />
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'node_management':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20'
      case 'user_management':
        return 'bg-green-500/10 text-green-500 border-green-500/20'
      case 'configuration':
        return 'bg-purple-500/10 text-purple-500 border-purple-500/20'
      case 'system':
        return 'bg-orange-500/10 text-orange-500 border-orange-500/20'
      case 'advanced':
        return 'bg-pink-500/10 text-pink-500 border-pink-500/20'
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20'
    }
  }

  const copyFunctionName = (name: string) => {
    navigator.clipboard.writeText(name)
    setCopiedFunction(name)
    toast.success(`Copied "${name}" to clipboard`)
    setTimeout(() => setCopiedFunction(null), 2000)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        render={<Button variant="outline" size="sm" className="gap-2" />}
      >
        <Code className="h-4 w-4" />
        Functions
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Available Functions</DialogTitle>
          <DialogDescription>
            Browse and explore all available backend functions for workflows
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 overflow-hidden">
          {/* Search and Filters */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search functions..."
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
              All ({functions.length})
            </Button>
            {categories.map((category) => {
              const count = functions.filter(f => f.category === category).length
              return (
                <Button
                  key={category}
                  variant={selectedCategory === category ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(category)}
                  className="gap-1"
                >
                  {getCategoryIcon(category)}
                  <span className="capitalize">{category.replace('_', ' ')}</span>
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {count}
                  </Badge>
                </Button>
              )
            })}
          </div>

          {/* Functions List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-muted-foreground">Loading functions...</div>
              </div>
            ) : filteredFunctions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No functions found matching your search</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {filteredFunctions.map((func) => (
                  <Card key={func.id} className="overflow-hidden">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <CardTitle className="text-base font-mono">
                              {func.name}
                            </CardTitle>
                            <Badge variant="outline" className={getCategoryColor(func.category)}>
                              <span className="capitalize text-xs">
                                {func.category.replace('_', ' ')}
                              </span>
                            </Badge>
                            {func.dangerous && (
                              <Badge variant="destructive" className="gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Dangerous
                              </Badge>
                            )}
                          </div>
                          <CardDescription className="text-xs">
                            {func.description}
                          </CardDescription>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyFunctionName(func.name)}
                          className="flex-shrink-0"
                        >
                          {copiedFunction === func.name ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    {func.parameters.length > 0 && (
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground">Parameters:</p>
                          {func.parameters.map((param) => (
                            <div key={param.name} className="flex items-center gap-2 text-xs">
                              <Badge variant="outline" className="font-mono">
                                {param.type}
                              </Badge>
                              <span className="font-mono">{param.name}</span>
                              {param.required && (
                                <Badge variant="secondary" className="text-xs">
                                  required
                                </Badge>
                              )}
                              <span className="text-muted-foreground flex-1">
                                {param.description}
                              </span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    )}
                    <div className="px-6 py-2 bg-muted/30 border-t text-xs text-muted-foreground flex items-center gap-4">
                      <span>Implementation: {func.implementation}</span>
                      {func.requiresAuth && (
                        <span className="flex items-center gap-1">
                          <Shield className="h-3 w-3" />
                          Requires auth
                        </span>
                      )}
                    </div>
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