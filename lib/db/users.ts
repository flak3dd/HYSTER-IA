import { randomUUID } from "node:crypto"
import { FieldValue } from "firebase-admin/firestore"
import { adminFirestore } from "@/lib/firebase/admin"
import {
  ClientUser,
  ClientUserCreate,
  ClientUserUpdate,
  Collections,
} from "@/lib/db/schema"

function usersCollection() {
  return adminFirestore().collection(Collections.users)
}

function now(): number {
  return Date.now()
}

export async function listUsers(): Promise<ClientUser[]> {
  const snap = await usersCollection().orderBy("createdAt", "desc").get()
  return snap.docs.map((d) => ClientUser.parse({ id: d.id, ...d.data() }))
}

export async function getUserById(id: string): Promise<ClientUser | null> {
  const doc = await usersCollection().doc(id).get()
  if (!doc.exists) return null
  return ClientUser.parse({ id: doc.id, ...doc.data() })
}

export async function getUserByAuthToken(authToken: string): Promise<ClientUser | null> {
  const snap = await usersCollection().where("authToken", "==", authToken).limit(1).get()
  if (snap.empty) return null
  const doc = snap.docs[0]
  return ClientUser.parse({ id: doc.id, ...doc.data() })
}

export async function createUser(input: ClientUserCreate): Promise<ClientUser> {
  const parsed = ClientUserCreate.parse(input)
  const id = randomUUID()
  const record: ClientUser = ClientUser.parse({
    id,
    displayName: parsed.displayName,
    authToken: parsed.authToken,
    status: parsed.status ?? "active",
    quotaBytes: parsed.quotaBytes ?? null,
    usedBytes: 0,
    expiresAt: parsed.expiresAt ?? null,
    createdAt: now(),
    updatedAt: now(),
    notes: parsed.notes,
  })
  const { id: _omit, ...rest } = record
  void _omit
  await usersCollection().doc(id).set(rest)
  return record
}

export async function updateUser(
  id: string,
  patch: ClientUserUpdate,
): Promise<ClientUser | null> {
  const parsed = ClientUserUpdate.parse(patch)
  const ref = usersCollection().doc(id)
  const existing = await ref.get()
  if (!existing.exists) return null
  await ref.update({ ...parsed, updatedAt: now() })
  const updated = await ref.get()
  return ClientUser.parse({ id: updated.id, ...updated.data() })
}

export async function deleteUser(id: string): Promise<boolean> {
  const ref = usersCollection().doc(id)
  const existing = await ref.get()
  if (!existing.exists) return false
  await ref.delete()
  return true
}

export async function incrementUsage(id: string, tx: number, rx: number): Promise<void> {
  const delta = Math.max(0, tx) + Math.max(0, rx)
  if (delta === 0) return
  await usersCollection().doc(id).update({
    usedBytes: FieldValue.increment(delta),
    updatedAt: now(),
  })
}
