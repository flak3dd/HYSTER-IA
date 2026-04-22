import { randomUUID } from "node:crypto"
import { adminFirestore } from "@/lib/firebase/admin"
import {
  AiConversation,
  AiMessage,
  type AiConversationCreate,
} from "@/lib/ai/types"

const COLLECTION = "ai_conversations"

function col() {
  return adminFirestore().collection(COLLECTION)
}

function now(): number {
  return Date.now()
}

export async function listConversations(
  createdBy: string,
  limit = 50,
): Promise<AiConversation[]> {
  const snap = await col()
    .where("createdBy", "==", createdBy)
    .orderBy("updatedAt", "desc")
    .limit(limit)
    .get()
  return snap.docs.map((d) =>
    AiConversation.parse({ id: d.id, ...d.data() }),
  )
}

export async function getConversation(
  id: string,
): Promise<AiConversation | null> {
  const doc = await col().doc(id).get()
  if (!doc.exists) return null
  return AiConversation.parse({ id: doc.id, ...doc.data() })
}

export async function createConversation(
  input: AiConversationCreate,
  createdBy: string,
): Promise<AiConversation> {
  const id = randomUUID()
  const record = AiConversation.parse({
    id,
    title: input.title ?? "New conversation",
    messages: [],
    createdBy,
    createdAt: now(),
    updatedAt: now(),
  })
  const { id: _omit, ...rest } = record
  void _omit
  await col().doc(id).set(rest)
  return record
}

export async function appendMessages(
  id: string,
  messages: AiMessage[],
): Promise<AiConversation | null> {
  const ref = col().doc(id)
  const doc = await ref.get()
  if (!doc.exists) return null

  const existing = AiConversation.parse({ id: doc.id, ...doc.data() })
  const updated = [...existing.messages, ...messages]

  await ref.update({ messages: updated, updatedAt: now() })

  return AiConversation.parse({
    ...existing,
    messages: updated,
    updatedAt: now(),
  })
}

export async function updateConversationTitle(
  id: string,
  title: string,
): Promise<boolean> {
  const ref = col().doc(id)
  const doc = await ref.get()
  if (!doc.exists) return false
  await ref.update({ title, updatedAt: now() })
  return true
}

export async function deleteConversation(id: string): Promise<boolean> {
  const ref = col().doc(id)
  const doc = await ref.get()
  if (!doc.exists) return false
  await ref.delete()
  return true
}
