import { adminFirestore } from "@/lib/firebase/admin"
import { Collections, UsageRecord } from "@/lib/db/schema"

function usageCollection() {
  return adminFirestore().collection(Collections.usageRecords)
}

export async function recordUsage(records: UsageRecord[]): Promise<number> {
  if (records.length === 0) return 0
  const db = adminFirestore()
  const batch = db.batch()
  for (const raw of records) {
    const parsed = UsageRecord.parse(raw)
    const ref = usageCollection().doc()
    batch.set(ref, parsed)
  }
  await batch.commit()
  return records.length
}

export async function listUsageForUser(userId: string, limit = 100): Promise<UsageRecord[]> {
  const snap = await usageCollection()
    .where("userId", "==", userId)
    .orderBy("capturedAt", "desc")
    .limit(limit)
    .get()
  return snap.docs.map((d) => UsageRecord.parse(d.data()))
}
