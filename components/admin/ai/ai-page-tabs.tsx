"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AiChatView } from "./ai-chat-view"
import { ShadowGrokView } from "./shadowgrok-view"
import { ReasoningTraceView } from "./reasoning-trace-view"
import { AiSettingsView } from "./ai-settings-view"
import { Bot, ShieldAlert, Sparkles, Brain, Settings, Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export function AiPageTabs() {
  return (
    <div className="flex flex-col gap-5">
      {/* Hero header with ambient glow */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/[0.06] via-card to-card px-5 py-4">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-primary/5 ring-1 ring-primary/30">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-card glow-success" />
            </div>
            <div>
              <h1 className="text-heading-lg leading-tight">AI Assistant</h1>
              <p className="text-caption text-muted-foreground">
                Multi-tool agent · chat, ShadowGrok C2, reasoning traces, and settings.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1.5 border-success/30 bg-success/10 px-2.5 py-1 text-micro text-success"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              Online
            </Badge>
            <Badge
              variant="outline"
              className="gap-1.5 border-primary/30 bg-primary/10 px-2.5 py-1 text-micro text-primary"
            >
              <Wrench className="h-3 w-3" />
              10 tools
            </Badge>
          </div>
        </div>
      </div>

      {/* Tabs with underline indicator */}
      <Tabs defaultValue="chat" className="w-full">
        <div className="border-b border-border/60">
          <TabsList className="h-auto gap-1 rounded-none bg-transparent p-0">
            {[
              { value: "chat", label: "AI Chat", Icon: Bot },
              { value: "shadowgrok", label: "ShadowGrok", Icon: ShieldAlert },
              { value: "reasoning", label: "Reasoning", Icon: Brain },
              { value: "settings", label: "Settings", Icon: Settings },
            ].map(({ value, label, Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="group relative gap-2 rounded-none border-b-2 border-transparent bg-transparent px-3 py-2.5 text-sm text-muted-foreground transition-all hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                <Icon className="h-4 w-4 opacity-70 transition-opacity group-data-[state=active]:opacity-100" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="chat" className="mt-4">
          <AiChatView hideHeader />
        </TabsContent>
        <TabsContent value="shadowgrok" className="mt-4">
          <ShadowGrokView />
        </TabsContent>
        <TabsContent value="reasoning" className="mt-4">
          <ReasoningTraceView trace={null} />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <AiSettingsView />
        </TabsContent>
      </Tabs>
    </div>
  )
}
