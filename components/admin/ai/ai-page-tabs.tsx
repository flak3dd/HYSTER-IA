"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AiChatView } from "./ai-chat-view"
import { ShadowGrokView } from "./shadowgrok-view"
import { ReasoningTraceView } from "./reasoning-trace-view"
import { AiSettingsView } from "./ai-settings-view"
import { Bot, ShieldAlert, Sparkles, Activity, Brain, Settings } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export function AiPageTabs() {
  return (
    <div className="flex flex-col gap-4">
      {/* Simplified Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-heading-lg text-foreground">AI Assistant</h1>
            <p className="text-body-sm text-muted-foreground">
              Multi-tool agent for operations
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 border-success/30 bg-success/10 text-success text-xs px-2.5 py-1">
            <Activity className="h-3 w-3" />
            Online
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="bg-muted/50 h-auto p-1 gap-1 border border-border/50">
          <TabsTrigger
            value="chat"
            className="gap-2 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:border-primary/30 px-4 py-2 transition-all"
          >
            <Bot className="h-4 w-4" />
            AI Chat
          </TabsTrigger>
          <TabsTrigger
            value="shadowgrok"
            className="gap-2 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:border-primary/30 px-4 py-2 transition-all"
          >
            <ShieldAlert className="h-4 w-4" />
            ShadowGrok
          </TabsTrigger>
          <TabsTrigger
            value="reasoning"
            className="gap-2 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:border-primary/30 px-4 py-2 transition-all"
          >
            <Brain className="h-4 w-4" />
            Reasoning
          </TabsTrigger>
          <TabsTrigger
            value="settings"
            className="gap-2 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:border-primary/30 px-4 py-2 transition-all"
          >
            <Settings className="h-4 w-4" />
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
