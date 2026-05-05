"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Bot,
  ShieldAlert,
  Brain,
  Zap,
  Globe,
  Network,
  Mail,
  BarChart3,
  Settings,
  Cpu,
  Workflow,
  Activity,
  ChevronRight,
  AlertTriangle,
  Lock,
  Unlock,
} from "lucide-react"

type AIFeature = {
  id: string
  name: string
  description: string
  icon: any
  category: string
  enabled: boolean
  impact: "high" | "medium" | "low"
}

const AI_FEATURES: AIFeature[] = [
  {
    id: "ai-chat",
    name: "AI Chat Assistant",
    description: "General-purpose AI chat for config generation, traffic analysis, and C2 operations",
    icon: Bot,
    category: "General",
    enabled: true,
    impact: "high",
  },
  {
    id: "shadowgrok",
    name: "ShadowGrok C2",
    description: "Specialized AI agent for command and control operations and offensive security tools",
    icon: ShieldAlert,
    category: "C2 Operations",
    enabled: true,
    impact: "high",
  },
  {
    id: "reasoning",
    name: "Reasoning Traces",
    description: "AI reasoning and decision-making trace visualization for transparency",
    icon: Brain,
    category: "Analytics",
    enabled: true,
    impact: "medium",
  },
  {
    id: "workflow-orchestration",
    name: "Workflow Orchestration",
    description: "AI-powered automation and orchestration of multi-step operational workflows",
    icon: Workflow,
    category: "Automation",
    enabled: true,
    impact: "high",
  },
  {
    id: "threat-intel",
    name: "Threat Intelligence",
    description: "AI analysis of threat feeds, IOCs, and security intelligence",
    icon: ShieldAlert,
    category: "Security",
    enabled: true,
    impact: "high",
  },
  {
    id: "network-analysis",
    name: "Network Analysis",
    description: "AI-powered network traffic analysis and anomaly detection",
    icon: Network,
    category: "Network",
    enabled: true,
    impact: "medium",
  },
  {
    id: "osint-processing",
    name: "OSINT Processing",
    description: "AI-assisted open-source intelligence gathering and analysis",
    icon: Globe,
    category: "Intelligence",
    enabled: true,
    impact: "medium",
  },
  {
    id: "mail-operations",
    name: "Mail Operations",
    description: "AI optimization for phishing campaigns and email operations",
    icon: Mail,
    category: "Delivery",
    enabled: false,
    impact: "high",
  },
  {
    id: "payload-generation",
    name: "Payload Generation",
    description: "AI-assisted payload creation and optimization",
    icon: Zap,
    category: "Weaponization",
    enabled: false,
    impact: "high",
  },
  {
    id: "behavioral-analytics",
    name: "Behavioral Analytics",
    description: "AI analysis of operational patterns and behaviors",
    icon: BarChart3,
    category: "Analytics",
    enabled: true,
    impact: "low",
  },
  {
    id: "infrastructure-optimization",
    name: "Infrastructure Optimization",
    description: "AI recommendations for infrastructure scaling and optimization",
    icon: Cpu,
    category: "Infrastructure",
    enabled: true,
    impact: "medium",
  },
  {
    id: "proactive-insights",
    name: "Proactive Insights",
    description: "AI-generated proactive operational insights and recommendations",
    icon: Activity,
    category: "Analytics",
    enabled: true,
    impact: "medium",
  },
]

const CATEGORIES = ["General", "C2 Operations", "Security", "Network", "Intelligence", "Delivery", "Weaponization", "Analytics", "Automation", "Infrastructure"]

export function AiSettingsView() {
  const [features, setFeatures] = useState<AIFeature[]>(AI_FEATURES)
  const [selectedCategory, setSelectedCategory] = useState<string>("All")
  const [shadowGrokMode, setShadowGrokMode] = useState(false)

  // Apply red theme when ShadowGrok mode is enabled
  useEffect(() => {
    if (shadowGrokMode) {
      document.documentElement.classList.add('shadowgrok-mode')
    } else {
      document.documentElement.classList.remove('shadowgrok-mode')
    }
  }, [shadowGrokMode])

  const toggleFeature = (id: string) => {
    setFeatures((prev) =>
      prev.map((feature) =>
        feature.id === id ? { ...feature, enabled: !feature.enabled } : feature
      )
    )
  }

  const filteredFeatures =
    selectedCategory === "All"
      ? features
      : features.filter((feature) => feature.category === selectedCategory)

  const enabledCount = features.filter((f) => f.enabled).length

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-heading-lg text-foreground">AI Configuration</h2>
          <p className="mt-0.5 text-body-sm text-muted-foreground">
            Manage AI features and their usage across different app functions
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 border-primary/30 bg-primary/10 text-primary">
          <Activity className="h-3 w-3" />
          {enabledCount} / {features.length} Enabled
        </Badge>
      </div>

      {/* ShadowGrok Mode Toggle */}
      <Card className={cn(
        "border-2 transition-all",
        shadowGrokMode
          ? "border-red-500/50 bg-red-950/20 shadow-lg shadow-red-500/20"
          : "border-border/50 bg-muted/30"
      )}>
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 flex-1">
              <div className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 transition-all",
                shadowGrokMode
                  ? "bg-red-500/20 ring-red-500/30"
                  : "bg-muted/50 ring-border/50"
              )}>
                {shadowGrokMode ? (
                  <Unlock className="h-4 w-4 text-red-500" />
                ) : (
                  <Lock className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className={cn(
                    "text-body-base font-semibold transition-colors",
                    shadowGrokMode ? "text-red-500" : "text-foreground"
                  )}>
                    ShadowGrok Mode
                  </h3>
                  {shadowGrokMode && (
                    <Badge className="gap-1 border-red-500/30 bg-red-500/10 text-red-500 text-micro">
                      <AlertTriangle className="h-3 w-3" />
                      UNRESTRICTED
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-body-sm text-muted-foreground">
                  {shadowGrokMode
                    ? "All restrictions removed across all regions and levels. Full operational access enabled."
                    : "Standard safety restrictions active. Enable for unrestricted access across all regions and levels."
                  }
                </p>
                {shadowGrokMode && (
                  <p className="mt-1 text-body-xs text-red-400/80 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Warning: This mode removes all safety restrictions and limits
                  </p>
                )}
              </div>
            </div>
            <Switch
              checked={shadowGrokMode}
              onCheckedChange={setShadowGrokMode}
              size="default"
              className={shadowGrokMode ? "data-checked:bg-red-500" : ""}
            />
          </div>
        </CardContent>
      </Card>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setSelectedCategory("All")}
          className={cn(
            "px-2.5 py-1 rounded-md text-body-sm transition-all",
            selectedCategory === "All"
              ? "bg-primary text-primary-foreground font-medium"
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
          )}
        >
          All ({features.length})
        </button>
        {CATEGORIES.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={cn(
              "px-2.5 py-1 rounded-md text-body-sm transition-all",
              selectedCategory === category
                ? "bg-primary text-primary-foreground font-medium"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            )}
          >
            {category} ({features.filter((f) => f.category === category).length})
          </button>
        ))}
      </div>

      {/* Features Grid */}
      <div className="grid gap-3">
        {filteredFeatures.map((feature) => {
          const Icon = feature.icon
          return (
            <Card key={feature.id} className="border-border/50 hover:border-border transition-colors">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 flex-1">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-body-sm font-medium text-foreground">
                          {feature.name}
                        </h3>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-micro h-5 px-1",
                            feature.impact === "high"
                              ? "border-destructive/30 bg-destructive/10 text-destructive"
                              : feature.impact === "medium"
                              ? "border-warning/30 bg-warning/10 text-warning"
                              : "border-success/30 bg-success/10 text-success"
                          )}
                        >
                          {feature.impact} impact
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-body-sm text-muted-foreground">
                        {feature.description}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Badge variant="secondary" className="text-micro h-5 px-1">
                          {feature.category}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={feature.enabled}
                    onCheckedChange={() => toggleFeature(feature.id)}
                    size="default"
                  />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Footer Info */}
      <Card className="bg-muted/30 border-border/50">
        <CardContent className="p-3">
          <div className="flex items-start gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-info/10 ring-1 ring-info/20">
              <Settings className="h-3.5 w-3.5 text-info" />
            </div>
            <div>
              <h4 className="text-body-sm font-medium text-foreground">Configuration Tips</h4>
              <p className="mt-0.5 text-body-sm text-muted-foreground">
                Disabling AI features will reduce computational costs and may improve performance.
                High-impact features provide significant operational value. Changes take effect immediately.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}