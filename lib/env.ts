import { z } from "zod"

const ServerEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),

  HYSTERIA_BIN: z.string().min(1).optional(),
  HYSTERIA_WORK_DIR: z.string().min(1).optional(),
  HYSTERIA_DOWNLOAD_BASE_URL: z
    .string()
    .url()
    .default("https://github.com/apernet/hysteria/releases/download"),

  HYSTERIA_AUTH_BACKEND_SECRET: z.string().min(16).optional(),
  HYSTERIA_TRAFFIC_API_BASE_URL: z
    .string()
    .url()
    .default("http://127.0.0.1:25000"),
  HYSTERIA_TRAFFIC_API_SECRET: z.string().min(1).optional(),

  NODE_ID: z.string().min(1).default("default"),

  SESSION_COOKIE_NAME: z.string().min(1).default("__session"),
  SESSION_COOKIE_MAX_AGE_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(60 * 60 * 24 * 14)
    .default(60 * 60 * 24 * 5),

  ROTATING_PROXY_URLS: z
    .string()
    .optional()
    .refine((s) => !s || s.split(",").every(url => /^(https?|socks5h?):\/\//.test(url.trim())), 
      "comma-separated http(s)/socks5h:// URLs"),

  HYSTERIA_EGRESS_PROXY_URL: z
    .string()
    .regex(/^(https?|socks5h?):\/\/.+/, "must be http(s):// or socks5(h):// URL")
    .optional(),

  // OpenRouter Configuration (preferred)
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  OPENROUTER_MODEL: z.string().min(1).default("anthropic/claude-3.5-sonnet"),
  
  // Legacy LLM Configuration (fallback)
  LLM_PROVIDER_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  LLM_PROVIDER_API_KEY: z.string().min(1).optional(),
  LLM_MODEL: z.string().min(1).default("gpt-4o-mini"),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),

  // SSH Public Key for Server Access
  SSH_PUBLIC_KEY: z.string().min(1).optional(),

  AGENT_MAX_STEPS: z.coerce.number().int().min(1).max(100).default(20),
  AGENT_MAX_CONCURRENCY_PER_DOMAIN: z.coerce.number().int().min(1).max(32).default(2),
  AGENT_TASK_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(30 * 60 * 1000)
    .default(5 * 60 * 1000),
})

export type ServerEnv = z.infer<typeof ServerEnvSchema>

let cached: ServerEnv | null = null

export function serverEnv(): ServerEnv {
  if (cached) return cached
  const parsed = ServerEnvSchema.safeParse(process.env)
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`
    )
  }
  cached = parsed.data
  return cached
}
