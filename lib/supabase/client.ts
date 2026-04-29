import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let client: SupabaseClient | null = null

/**
 * Browser-side Supabase singleton.
 * Used **only** for Realtime subscriptions — all data queries go through Prisma.
 * Returns `null` when env vars are missing (dashboard falls back to polling).
 */
export function supabaseClient(): SupabaseClient | null {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) return null

  client = createClient(url, anonKey, {
    realtime: { params: { eventsPerSecond: 2 } },
  })
  return client
}
