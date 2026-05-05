"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AiChatView } from "./ai-chat-view"
import { ShadowGrokView } from "./shadowgrok-view"
import { ReasoningTraceView } from "./reasoning-trace-view"
import { AiSettingsView } from "./ai-settings-view"
import { Bot, ShieldAlert, Sparkles, Zap, Activity, Brain, Settings } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export function AiPageTabs() {
  return (
    <div className="flex flex-col gap-4">
      {/* Enhanced Header - Compact */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-4">
        <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-primary/20 blur-2xl" />
        <div className="absolute bottom-0 left-0 -mb-4 -ml-4 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20 ring-1 ring-primary/30">
                  <Sparkles className="h-4.5 w-4.5 text-primary glow-primary" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-success ring-2 ring-background">
                  <Activity className="h-2 w-2 text-success-foreground" />
                </div>
              </div>
              <div>
                <h1 className="text-heading-lg text-foreground">AI Assistant</h1>
                <p className="mt-0.5 text-body-sm text-muted-foreground">
                  Multi-tool agent for config generation, traffic analysis, C2 operations
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/10 text-primary text-micro px-2 py-0.5">
                <Zap className="h-2.5 w-2.5" />
                2 Active
              </Badge>
              <Badge variant="outline" className="gap-1 border-success/30 bg-success/10 text-success text-micro px-2 py-0.5">
                <Activity className="h-2.5 w-2.5" />
                Online
              </Badge>
            </div>
          </div>

          {/* Quick Stats - Compact */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-md bg-background/50 border border-border/50 p-2">
              <div className="flex items-center gap-1.5 text-micro text-muted-foreground">
                <Bot className="h-2.5 w-2.5" />
                <span>AI Chat</span>
              </div>
              <div className="mt-0.5 text-body-sm font-medium text-foreground">10 Tools</div>
            </div>
            <div className="rounded-md bg-background/50 border border-border/50 p-2">
              <div className="flex items-center gap-1.5 text-micro text-muted-foreground">
                <ShieldAlert className="h-2.5 w-2.5" />
                <span>ShadowGrok</span>
              </div>
              <div className="mt-0.5 text-body-sm font-medium text-foreground">12 C2 Tools</div>
            </div>
            <div className="rounded-md bg-background/50 border border-border/50 p-2">
              <div className="flex items-center gap-1.5 text-micro text-muted-foreground">
                <Sparkles className="h-2.5 w-2.5" />
                <span>Templates</span>
              </div>
              <div className="mt-0.5 text-body-sm font-medium text-foreground">Ready</div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Tabs - Compact */}
      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="bg-muted/50 h-auto p-1 gap-1.5 border border-border/50">
          <TabsTrigger
            value="chat"
            className="gap-1.5 text-body-sm data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:shadow-primary/5 data-[state=active]:border-primary/30 px-3 py-1.5 transition-all"
          >
            <Bot className="h-3 w-3" />
            AI Chat
            <Badge variant="outline" className="ml-0.5 h-4 px-1 text-micro border-primary/30 bg-primary/10 text-primary">
              10
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="shadowgrok"
            className="gap-1.5 text-body-sm data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:shadow-primary/5 data-[state=active]:border-primary/30 px-3 py-1.5 transition-all"
          >
            <ShieldAlert className="h-3 w-3" />
            ShadowGrok
            <Badge variant="outline" className="ml-0.5 h-4 px-1 text-micro border-destructive/30 bg-destructive/10 text-destructive">
              12
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="reasoning"
            className="gap-1.5 text-body-sm data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:shadow-primary/5 data-[state=active]:border-primary/30 px-3 py-1.5 transition-all"
          >
            <Brain className="h-3 w-3" />
            Reasoning
            <Badge variant="outline" className="ml-0.5 h-4 px-1 text-micro border-info/30 bg-info/10 text-info">
              Active
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="settings"
            className="gap-1.5 text-body-sm data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:shadow-primary/5 data-[state=active]:border-primary/30 px-3 py-1.5 transition-all"
          >
            <Settings className="h-3 w-3" />
            Settings
          </TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="mt-3">
          <AiChatView hideHeader />
        </TabsContent>
        <TabsContent value="shadowgrok" className="mt-3">
          <ShadowGrokView />
        </TabsContent>
        <TabsContent value="reasoning" className="mt-3">
          <ReasoningTraceView trace={null} />
        </TabsContent>
        <TabsContent value="settings" className="mt-3">
          <AiSettingsView />
        </TabsContent>
      </Tabs>
    </div>
  )
}
