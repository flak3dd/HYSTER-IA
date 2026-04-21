import { randomUUID } from "node:crypto"
import { adminFirestore } from "@/lib/firebase/admin"
import { Collections, Node, NodeCreate, NodeUpdate } from "@/lib/db/schema"

function nodesCollection() {
  return adminFirestore().collection(Collections.nodes)
}

function now(): number {
  return Date.now()
}

export async function listNodes(): Promise<Node[]> {
  const snap = await nodesCollection().orderBy("createdAt", "desc").get()
  return snap.docs.map((d) => Node.parse({ id: d.id, ...d.data() }))
}

export async function getNodeById(id: string): Promise<Node | null> {
  const doc = await nodesCollection().doc(id).get()
  if (!doc.exists) return null
  return Node.parse({ id: doc.id, ...doc.data() })
}

export async function createNode(input: NodeCreate): Promise<Node> {
  const parsed = NodeCreate.parse(input)
  const id = randomUUID()
  const record: Node = Node.parse({
    id,
    name: parsed.name,
    hostname: parsed.hostname,
    region: parsed.region,
    listenAddr: parsed.listenAddr ?? ":443",
    status: "stopped",
    tags: parsed.tags ?? [],
    provider: parsed.provider,
    lastHeartbeatAt: null,
    createdAt: now(),
    updatedAt: now(),
  })
  const { id: _omit, ...rest } = record
  void _omit
  await nodesCollection().doc(id).set(rest)
  return record
}

export async function updateNode(id: string, patch: NodeUpdate): Promise<Node | null> {
  const parsed = NodeUpdate.parse(patch)
  const ref = nodesCollection().doc(id)
  const existing = await ref.get()
  if (!existing.exists) return null
  await ref.update({ ...parsed, updatedAt: now() })
  const updated = await ref.get()
  return Node.parse({ id: updated.id, ...updated.data() })
}

export async function deleteNode(id: string): Promise<boolean> {
  const ref = nodesCollection().doc(id)
  const existing = await ref.get()
  if (!existing.exists) return false
  await ref.delete()
  return true
}
