"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AiChatView } from "./ai-chat-view"
import { ShadowGrokView } from "./shadowgrok-view"
import { Bot, ShieldAlert, Sparkles, Zap, Activity } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export function AiPageTabs() {
  return (
    <div className="flex flex-col gap-6">
      {/* Enhanced Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-6">
        <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-primary/20 blur-2xl" />
        <div className="absolute bottom-0 left-0 -mb-4 -ml-4 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
        
        <div className="relative">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20 ring-1 ring-primary/30">
                  <Sparkles className="h-6 w-6 text-primary glow-primary" />
                </div>
                <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-success ring-2 ring-background">
                  <Activity className="h-2.5 w-2.5 text-success-foreground" />
                </div>
              </div>
              <div>
                <h1 className="text-heading-xl text-foreground">AI Assistant</h1>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  Multi-tool agent for config generation, traffic analysis, C2 operations,
                  and infrastructure management.
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1.5 border-primary/30 bg-primary/10 text-primary text-micro">
                <Zap className="h-3 w-3" />
                2 Active Agents
              </Badge>
              <Badge variant="outline" className="gap-1.5 border-success/30 bg-success/10 text-success text-micro">
                <Activity className="h-3 w-3" />
                Online
              </Badge>
            </div>
          </div>
          
          {/* Quick Stats */}
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-background/50 border border-border/50 p-3">
              <div className="flex items-center gap-2 text-micro text-muted-foreground">
                <Bot className="h-3 w-3" />
                <span>AI Chat</span>
              </div>
              <div className="mt-1 text-heading-sm text-foreground">10 Tools</div>
            </div>
            <div className="rounded-lg bg-background/50 border border-border/50 p-3">
              <div className="flex items-center gap-2 text-micro text-muted-foreground">
                <ShieldAlert className="h-3 w-3" />
                <span>ShadowGrok</span>
              </div>
              <div className="mt-1 text-heading-sm text-foreground">12 C2 Tools</div>
            </div>
            <div className="rounded-lg bg-background/50 border border-border/50 p-3">
              <div className="flex items-center gap-2 text-micro text-muted-foreground">
                <Sparkles className="h-3 w-3" />
                <span>Templates</span>
              </div>
              <div className="mt-1 text-heading-sm text-foreground">Ready</div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Tabs */}
      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="bg-muted/50 h-auto p-1.5 gap-2 border border-border/50">
          <TabsTrigger
            value="chat"
            className="gap-2 text-body-sm data-[state=active]:bg-background data-[state=active]:shadow-lg data-[state=active]:shadow-primary/5 data-[state=active]:border-primary/30 px-5 py-2.5 transition-all"
          >
            <Bot className="h-3.5 w-3.5" />
            AI Chat
            <Badge variant="outline" className="ml-1 h-5 px-1.5 text-micro border-primary/30 bg-primary/10 text-primary">
              10
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="shadowgrok"
            className="gap-2 text-body-sm data-[state=active]:bg-background data-[state=active]:shadow-lg data-[state=active]:shadow-primary/5 data-[state=active]:border-primary/30 px-5 py-2.5 transition-all"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            ShadowGrok
            <Badge variant="outline" className="ml-1 h-5 px-1.5 text-micro border-destructive/30 bg-destructive/10 text-destructive">
              12
            </Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="mt-4">
          <AiChatView hideHeader />
        </TabsContent>
        <TabsContent value="shadowgrok" className="mt-4">
          <ShadowGrokView />
        </TabsContent>
      </Tabs>
    </div>
  )
}
