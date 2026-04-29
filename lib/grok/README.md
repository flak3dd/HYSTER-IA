# ShadowGrok C2 Tool Registry & Agent Runner

Fully implemented rich C2 tool registry for natural language workflow orchestration in the blackboxai-hysteria2-sonner repository.

## Files

- `grok-tools.ts` — Complete definition of 12 production C2 tools (OpenAI/xAI tool calling format)
- `tool-executor.ts` — Full implementation of every tool with real Prisma + Hysteria + implant integration
- `agent-runner-enhanced.ts` — Multi-step agent loop with ShadowGrokExecution tracking, approval workflow, and audit logging

## Quick Start (Drop-in Replacement)

1. Copy the three files into your repo at `lib/grok/`
2. Ensure you have the required Prisma models (already present in current schema):
   - `ShadowGrokExecution`
   - `ShadowGrokToolCall`
   - `AgentTask`
   - `AgentStep`
   - `Implant`
   - `Node`
   - `C2Task`
   - `KillSwitchEvent`
   - `Subscription`

3. Set environment variables:
   ```env
   LLM_PROVIDER_BASE_URL=https://api.x.ai/v1
   LLM_PROVIDER_API_KEY=your_xai_key
   LLM_MODEL=grok-4.20-reasoning
   HYSTERIA_TRAFFIC_API_BASE_URL=http://127.0.0.1:25000
   ```

4. Use the enhanced runner:

```typescript
import { runShadowGrokAgent } from "@/lib/grok/agent-runner-enhanced";

const result = await runShadowGrokAgent({
  prompt: "Deploy maximum stealth implant to Node-07 with Spotify blending and arm 72h dead-man kill switch",
  userId: "admin_123",
  maxSteps: 8,
});

console.log(result.finalResponse);
```

## Tool List (12 Tools)

1. `generate_stealth_implant_config` — Create advanced Go implant configs
2. `compile_and_deploy_implant` — Build + deploy to node
3. `send_c2_task_to_implant` — Exec, screenshot, keylog, exfil, lateral, self-destruct, etc.
4. `query_implant_status` — Health + traffic stats
5. `trigger_kill_switch` — Multi-scope with confirmation
6. `analyze_traffic_and_suggest_evasion` — AI-driven blending recommendations
7. `orchestrate_full_operation` — High-level campaign planner
8. `run_panel_command` — Shell execution (approval required)
9. `update_node_config` — Live Hysteria config changes + hot reload
10. `query_hysteria_traffic_stats` — Real-time metrics
11. `create_or_update_subscription` — Client subscription management
12. `assess_opsec_risk` — Pre-action risk scoring

## Approval Workflow

High-risk tools automatically create `ShadowGrokToolCall` records with `requiresApproval: true`.  
The UI should poll for pending approvals and present them to admins for one-click execution.

## Integration with Existing AI Chat

Replace the old LLM call in `app/(admin)/ai/route.ts` (or equivalent) with:

```typescript
const result = await runShadowGrokAgent({
  prompt: userMessage,
  userId: session.user.id,
  conversationId: conv.id,
});
```

## Production Notes

- All outbound calls from tools go through Hysteria proxy (already handled by undici in the original repo).
- Every tool call is logged to `ShadowGrokToolCall` and `AgentStep`.
- `run_panel_command` and global kill switches are deliberately gated behind approval.
- The system is designed to work with both Grok reasoning models and faster models for simple tasks.

This implementation turns the AI Workflow Assistant into a true autonomous C2 orchestration engine while maintaining the strict safety and audit requirements of red team operations.