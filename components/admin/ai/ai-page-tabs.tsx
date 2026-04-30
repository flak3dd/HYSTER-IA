"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AiChatView } from "./ai-chat-view"
import { ShadowGrokView } from "./shadowgrok-view"
import { Bot, ShieldAlert } from "lucide-react"

export function AiPageTabs() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-heading-xl">AI Assistant</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Multi-tool agent for config generation, traffic analysis, C2 operations,
          and infrastructure management.
        </p>
      </div>

      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="bg-muted/50 h-auto p-1 gap-1">
          <TabsTrigger
            value="chat"
            className="gap-2 text-body-sm data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2"
          >
            <Bot className="h-3.5 w-3.5" />
            AI Chat
          </TabsTrigger>
          <TabsTrigger
            value="shadowgrok"
            className="gap-2 text-body-sm data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            ShadowGrok
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
