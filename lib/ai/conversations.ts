import { prisma } from "@/lib/db"
import type { AiConversation as PrismaConv, AiMessage as PrismaMsg } from "@prisma/client"
import {
  AiConversation,
  AiMessage,
  type AiConversationCreate,
  type AiConversationUpdate,
} from "@/lib/ai/types"

// Simple in-memory cache for conversations (5-minute TTL)
const conversationCache = new Map<string, { data: AiConversation; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getCached(id: string): AiConversation | null {
  const cached = conversationCache.get(id)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }
  if (cached) {
    conversationCache.delete(id)
  }
  return null
}

function setCached(id: string, data: AiConversation): void {
  conversationCache.set(id, { data, timestamp: Date.now() })
}

function clearCached(id: string): void {
  conversationCache.delete(id)
}

type ConvWithMessages = PrismaConv & { messages: PrismaMsg[] }

function toMsgZod(row: PrismaMsg): AiMessage {
  return {
    role: row.role as AiMessage["role"],
    content: row.content ?? null,
    toolCalls: row.toolCalls ? (row.toolCalls as AiMessage["toolCalls"]) : undefined,
    toolResult: row.toolResult ? (row.toolResult as AiMessage["toolResult"]) : undefined,
    timestamp: row.timestamp.getTime(),
  }
}

function toConvZod(row: ConvWithMessages): AiConversation {
  return {
    id: row.id,
    title: row.title,
    messages: row.messages.map(toMsgZod),
    createdBy: row.createdBy,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    tags: row.tags as string[] || [],
  }
}

export async function listConversations(
  createdBy: string,
  limit = 50,
): Promise<AiConversation[]> {
  const rows = await prisma.aiConversation.findMany({
    where: { createdBy },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: { messages: { orderBy: { sortOrder: "asc" } } },
  })
  return rows.map(toConvZod)
}

export async function getConversation(
  id: string,
): Promise<AiConversation | null> {
  // Check cache first
  const cached = getCached(id)
  if (cached) return cached

  const row = await prisma.aiConversation.findUnique({
    where: { id },
    include: { messages: { orderBy: { sortOrder: "asc" } } },
  })
  
  const result = row ? toConvZod(row) : null
  if (result) setCached(id, result)
  return result
}

export async function createConversation(
  input: AiConversationCreate,
  createdBy: string,
): Promise<AiConversation> {
  const row = await prisma.aiConversation.create({
    data: {
      title: input.title ?? "New conversation",
      createdBy,
    },
    include: { messages: true },
  })
  return toConvZod(row)
}

export async function appendMessages(
  id: string,
  messages: AiMessage[],
): Promise<AiConversation | null> {
  const existing = await prisma.aiConversation.findUnique({
    where: { id },
    include: { messages: { orderBy: { sortOrder: "desc" }, take: 1 } },
  })
  if (!existing) return null

  const startOrder = existing.messages.length > 0 ? existing.messages[0].sortOrder + 1 : 0

  await prisma.$transaction([
    ...messages.map((msg, i) =>
      prisma.aiMessage.create({
        data: {
          conversationId: id,
          role: msg.role,
          content: msg.content,
          toolCalls: msg.toolCalls ? (msg.toolCalls as object[]) : undefined,
          toolResult: msg.toolResult ? (msg.toolResult as object) : undefined,
          sortOrder: startOrder + i,
          timestamp: new Date(msg.timestamp),
        },
      }),
    ),
    prisma.aiConversation.update({ where: { id }, data: { updatedAt: new Date() } }),
  ])

  // Invalidate cache
  clearCached(id)
  
  return getConversation(id)
}

export async function updateConversationTitle(
  id: string,
  title: string,
): Promise<boolean> {
  const existing = await prisma.aiConversation.findUnique({ where: { id } })
  if (!existing) return false
  await prisma.aiConversation.update({ where: { id }, data: { title } })
  return true
}

export async function deleteConversation(id: string): Promise<boolean> {
  try {
    await prisma.aiConversation.delete({ where: { id } })
    clearCached(id)
    return true
  } catch {
    return false
  }
}

export async function updateConversation(
  id: string,
  input: AiConversationUpdate,
  createdBy: string,
): Promise<AiConversation | null> {
  const existing = await prisma.aiConversation.findUnique({ where: { id } })
  if (!existing || existing.createdBy !== createdBy) return null
  
  const updated = await prisma.aiConversation.update({
    where: { id },
    data: {
      ...(input.title && { title: input.title }),
      ...(input.tags !== undefined && { tags: input.tags }),
    },
    include: { messages: { orderBy: { sortOrder: "asc" } } },
  })
  
  clearCached(id)
  return toConvZod(updated)
}
