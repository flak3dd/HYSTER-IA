/**
 * @jest-environment node
 */

/**
 * LIVE Azure deploy via the AI assistant (natural language).
 *
 * Drives the assistant with a single NL prompt and lets the reasoning
 * orchestrator + deploy_node tool actually provision a real Azure VM in
 * the specified resource group. Skips itself unless DEPLOY_AZURE_LIVE=1
 * is set so it never runs accidentally in regular `jest` runs.
 *
 * Usage:
 *   DEPLOY_AZURE_LIVE=1 \
 *   AZURE_RESOURCE_GROUP=hysteria-rg-australiaeast \
 *   AZURE_DEPLOY_REGION=australiaeast \
 *   npx jest tests/ai/azure-deploy-live.test.ts --runInBand --testTimeout=600000
 */

import { runChat } from "@/lib/ai/chat"
import { createConversation, deleteConversation } from "@/lib/ai/conversations"
import { prisma } from "@/lib/db"
import { getDeployment, subscribe, destroyDeployment } from "@/lib/deploy/orchestrator"

// Bypass the jest.setup.js console.log filter so live deployment progress is
// always visible (the filter only keeps lines containing certain keywords).
const out = (line: string) => process.stdout.write(line + "\n")

type ProgressEvent = {
  type: "step" | "tool_start" | "tool_complete" | "tool_error"
  step?: string
  toolName?: string
  toolArgs?: string
  toolResult?: string
}

const ENABLED = process.env.DEPLOY_AZURE_LIVE === "1"
const RG = process.env.AZURE_RESOURCE_GROUP || "hysteria-rg-australiaeast"
const REGION = process.env.AZURE_DEPLOY_REGION || "australiaeast"
const SIZE = process.env.AZURE_DEPLOY_SIZE || "Standard_B2pts_v2"
const TEST_USER_ID = "azure-live-deploy"
const PROMPT_TIMEOUT_MS = 480_000

// Check if LLM is actually available (keys present AND network accessible)
const hasLLM =
  Boolean(process.env.ANTHROPIC_API_KEY) ||
  Boolean(process.env.OPENAI_API_KEY) ||
  Boolean(process.env.AZURE_OPENAI_API_KEY) ||
  Boolean(process.env.XAI_API_KEY)

describe("AI Assistant — LIVE Azure deploy via natural language", () => {
  jest.setTimeout(600_000)

  beforeAll(() => {
    if (!hasLLM) {
      // eslint-disable-next-line no-console
      console.warn("[AZURE LIVE] No LLM API key configured — test will be skipped")
    }
    if (!ENABLED) {
      // eslint-disable-next-line no-console
      console.warn("[AZURE LIVE] DEPLOY_AZURE_LIVE is not set to 1 — test will be skipped")
    }
  })

  afterAll(async () => {
    try {
      await prisma.aiConversation.deleteMany({ where: { createdBy: TEST_USER_ID } })
    } catch {
      /* ignore */
    }
    await prisma.$disconnect().catch(() => {})
  })

  ;(ENABLED && hasLLM ? it : it.skip)(
    `deploys a Hysteria2 node to Azure ${REGION} via NL`,
    async () => {
      const conv = await createConversation(
        { title: `Live Azure deploy ${Date.now()}` },
        TEST_USER_ID,
      )

      const prompt =
        `Deploy a new Hysteria2 node to Azure region ${REGION} ` +
        `in the existing resource group ${RG}. ` +
        `Use VM size ${SIZE} and tag it as "ai-nl-test".`

      const progress: ProgressEvent[] = []

      try {

        out(`\n[AZURE LIVE] Sending prompt:\n  ${prompt}\n`)

        const result = await runChat(
          conv.id,
          prompt,
          TEST_USER_ID,
          (p) => {
            progress.push(p)

            out(
              `[AZURE LIVE progress] ${p.type}${p.toolName ? ` ${p.toolName}` : ""}${p.step ? ` — ${p.step}` : ""}${p.toolArgs ? ` args=${p.toolArgs.slice(0, 200)}` : ""}`,
            )
          },
          { timeoutMs: PROMPT_TIMEOUT_MS, requestId: `azure-live-${Date.now()}` },
        )


        out(`\n[AZURE LIVE] runChat error: ${result.error ?? "none"} code=${result.errorCode ?? "-"}`)

        // Check for LLM/network failures and skip rather than fail
        if (result.error === "chat request failed" ||
            result.error?.includes("All AI providers failed")) {
          // eslint-disable-next-line no-console
          console.warn(`[AZURE LIVE] Skipping — LLM/network unavailable: ${result.error}`)
          return
        }

        // Pull deploy_node tool result, if any, so we can surface the deploymentId
        const deployToolMsg = result.messages.find(
          (m) => m.role === "tool" && m.toolResult?.name === "deploy_node",
        )
        const deployContent = deployToolMsg?.toolResult?.content ?? null

        out(`\n[AZURE LIVE] deploy_node tool result:\n${deployContent}\n`)

        const lastAssistant = [...result.messages].reverse().find((m) => m.role === "assistant")

        out(`\n[AZURE LIVE] Assistant final reply:\n${lastAssistant?.content ?? "(none)"}\n`)

        // Sanity assertions:
        expect(result).toBeDefined()
        expect(result.messages.length).toBeGreaterThan(0)
        expect(deployToolMsg).toBeDefined()
        expect(deployContent).toBeTruthy()

        // Parse and assert the result has a deploymentId
        let parsed: any = null
        try {
          parsed = JSON.parse(deployContent ?? "")
        } catch {
          /* deploy_node returned non-JSON */
        }
        expect(parsed).toBeTruthy()
        expect(typeof parsed.deploymentId).toBe("string")
        expect(parsed.deploymentId.length).toBeGreaterThan(0)
        
        out(
          `\n[AZURE LIVE] ✓ deploymentId: ${parsed.deploymentId}  status (initial): ${parsed.status}\n`,
        )

        // Wait for the deployment to reach a terminal state. The orchestrator
        // runs runDeployment fire-and-forget, so we have to poll/subscribe
        // here to observe the actual Azure SDK calls.
        const TERMINAL = new Set(["completed", "failed", "destroyed"])
        const deploymentId: string = parsed.deploymentId
        const finalStatus = await new Promise<{
          status: string
          steps: Array<{ status: string; message: string; error?: string | null }>
        }>((resolve) => {
          const dep0 = getDeployment(deploymentId)
          if (dep0 && TERMINAL.has(dep0.status)) {
            return resolve({ status: dep0.status, steps: dep0.steps as any })
          }
          const unsubscribe = subscribe(deploymentId, (step) => {
            
            out(
              `[AZURE LIVE step] ${step.status} — ${step.message}${step.error ? `\n      error: ${step.error}` : ""}`,
            )
            if (TERMINAL.has(step.status)) {
              const dep = getDeployment(deploymentId)
              unsubscribe()
              resolve({
                status: step.status,
                steps: (dep?.steps ?? []) as any,
              })
            }
          })
          // Belt-and-braces timeout matching the test timeout
          setTimeout(() => {
            const dep = getDeployment(deploymentId)
            unsubscribe()
            resolve({
              status: dep?.status ?? "unknown",
              steps: (dep?.steps ?? []) as any,
            })
          }, 540_000).unref?.()
        })

        
        out(
          `\n[AZURE LIVE] === Final deployment state: ${finalStatus.status} ===\n` +
            finalStatus.steps
              .map(
                (s) =>
                  `  • ${s.status}: ${s.message}${s.error ? `\n        ERROR: ${s.error}` : ""}`,
              )
              .join("\n"),
        )

        // ⚠️ DO NOT auto-call destroyDeployment() for Azure here.
        // The Azure provider's destroyServer() deletes the ENTIRE
        // resource group (lib/deploy/providers/azure.ts), not just the
        // VM and its supporting resources. Auto-cleaning would wipe
        // any sibling resources the user has in that RG.
        //
        // Manual cleanup of just this VM (preserves the RG):
        //   VM=ai-nl-test
        //   az vm delete -g ${RG} -n $VM --yes
        //   az network nic delete -g ${RG} -n $VM-nic
        //   az network public-ip delete -g ${RG} -n $VM-pip
        //   az network nsg delete -g ${RG} -n $VM-nsg
        //   az network vnet delete -g ${RG} -n $VM-vnet
        //   az disk list -g ${RG} --query "[?contains(name,'$VM')].id" -o tsv | xargs -r az disk delete --yes --ids
        const dep = getDeployment(deploymentId)
        if (dep?.vpsId) {
          out(
            `\n[AZURE LIVE] ⚠️ Skipping auto-cleanup (would delete the whole RG).\n` +
              `Manual cleanup of just this VM is required if it succeeded.\n` +
              `RG: ${RG}  VM name: ai-nl-test  vpsId: ${dep.vpsId}\n`,
          )
        }
      } finally {
        try {
          await deleteConversation(conv.id)
        } catch {
          /* ignore */
        }
      }
    },
  )
})
