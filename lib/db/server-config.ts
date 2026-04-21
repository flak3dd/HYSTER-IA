import { adminFirestore } from "@/lib/firebase/admin"
import { Collections, ServerConfig } from "@/lib/db/schema"

const CONFIG_DOC_ID = "current"

function configDoc() {
  return adminFirestore().collection(Collections.serverConfig).doc(CONFIG_DOC_ID)
}

export async function getServerConfig(): Promise<ServerConfig | null> {
  const doc = await configDoc().get()
  if (!doc.exists) return null
  return ServerConfig.parse(doc.data())
}

export async function setServerConfig(next: ServerConfig): Promise<ServerConfig> {
  const parsed = ServerConfig.parse({ ...next, updatedAt: Date.now() })
  await configDoc().set(parsed)
  return parsed
}

export async function patchServerConfig(
  patch: Partial<ServerConfig>,
): Promise<ServerConfig | null> {
  const existing = await getServerConfig()
  if (!existing) return null
  const merged: ServerConfig = ServerConfig.parse({
    ...existing,
    ...patch,
    updatedAt: Date.now(),
  })
  await configDoc().set(merged)
  return merged
}
