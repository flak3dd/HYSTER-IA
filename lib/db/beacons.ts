import { prisma } from "@/lib/db"
import type { CompromisedHost } from "@prisma/client"
import { Beacon, BeaconCreate, BeaconUpdate } from "@/lib/db/schema"

function toBeaconZod(row: CompromisedHost): Beacon {
  return {
    id: row.id,
    implantId: row.implantId ?? "",
    hostname: row.hostname,
    ipAddress: row.ipAddress,
    os: row.os,
    osVersion: row.osVersion ?? undefined,
    domain: row.domain ?? undefined,
    user: row.user,
    privileges: row.privileges as Beacon["privileges"],
    lastCheckin: row.lastSeen.getTime(),
    status: determineBeaconStatus(row.lastSeen),
    implantType: row.implantType ?? "Unknown",
    egressNode: row.egressNode ?? undefined,
    runningTasks: row.runningTasks ?? 0,
    firstSeen: row.firstCompromised.getTime(),
    nodeId: row.nodeId ?? undefined,
    createdAt: row.firstCompromised.getTime(),
    updatedAt: row.lastSeen.getTime(),
  }
}

function determineBeaconStatus(lastSeen: Date): Beacon["status"] {
  const now = Date.now()
  const minutesSinceLastSeen = (now - lastSeen.getTime()) / (1000 * 60)
  
  if (minutesSinceLastSeen < 5) return "online"
  if (minutesSinceLastSeen < 30) return "idle"
  if (minutesSinceLastSeen < 120) return "stale"
  return "offline"
}

export async function listBeacons(opts?: {
  skip?: number
  take?: number
  status?: Beacon["status"]
  privilegeLevel?: Beacon["privileges"]
  osFamily?: string
  domain?: string
  search?: string
}): Promise<Beacon[]> {
  const where: any = {}
  
  if (opts?.status) {
    const now = new Date()
    if (opts.status === "online") {
      where.lastSeen = { gte: new Date(now.getTime() - 5 * 60 * 1000) }
    } else if (opts.status === "idle") {
      where.lastSeen = {
        gte: new Date(now.getTime() - 30 * 60 * 1000),
        lt: new Date(now.getTime() - 5 * 60 * 1000),
      }
    } else if (opts.status === "stale") {
      where.lastSeen = {
        gte: new Date(now.getTime() - 120 * 60 * 1000),
        lt: new Date(now.getTime() - 30 * 60 * 1000),
      }
    } else if (opts.status === "offline") {
      where.lastSeen = { lt: new Date(now.getTime() - 120 * 60 * 1000) }
    }
  }
  
  if (opts?.privilegeLevel) {
    where.privileges = opts.privilegeLevel
  }
  
  if (opts?.osFamily) {
    where.os = { contains: opts.osFamily, mode: "insensitive" }
  }
  
  if (opts?.domain) {
    where.domain = opts.domain
  }
  
  if (opts?.search) {
    where.OR = [
      { hostname: { contains: opts.search, mode: "insensitive" } },
      { ipAddress: { contains: opts.search, mode: "insensitive" } },
      { user: { contains: opts.search, mode: "insensitive" } },
      { domain: { contains: opts.search, mode: "insensitive" } },
    ]
  }
  
  const rows = await prisma.compromisedHost.findMany({
    where,
    orderBy: { lastSeen: "desc" },
    skip: opts?.skip,
    take: opts?.take,
  })
  return rows.map(toBeaconZod)
}

export async function countBeacons(opts?: {
  status?: Beacon["status"]
  privilegeLevel?: Beacon["privileges"]
  osFamily?: string
  domain?: string
  search?: string
}): Promise<number> {
  const where: any = {}
  
  if (opts?.status) {
    const now = new Date()
    if (opts.status === "online") {
      where.lastSeen = { gte: new Date(now.getTime() - 5 * 60 * 1000) }
    } else if (opts.status === "idle") {
      where.lastSeen = {
        gte: new Date(now.getTime() - 30 * 60 * 1000),
        lt: new Date(now.getTime() - 5 * 60 * 1000),
      }
    } else if (opts.status === "stale") {
      where.lastSeen = {
        gte: new Date(now.getTime() - 120 * 60 * 1000),
        lt: new Date(now.getTime() - 30 * 60 * 1000),
      }
    } else if (opts.status === "offline") {
      where.lastSeen = { lt: new Date(now.getTime() - 120 * 60 * 1000) }
    }
  }
  
  if (opts?.privilegeLevel) {
    where.privileges = opts.privilegeLevel
  }
  
  if (opts?.osFamily) {
    where.os = { contains: opts.osFamily, mode: "insensitive" }
  }
  
  if (opts?.domain) {
    where.domain = opts.domain
  }
  
  if (opts?.search) {
    where.OR = [
      { hostname: { contains: opts.search, mode: "insensitive" } },
      { ipAddress: { contains: opts.search, mode: "insensitive" } },
      { user: { contains: opts.search, mode: "insensitive" } },
      { domain: { contains: opts.search, mode: "insensitive" } },
    ]
  }
  
  return prisma.compromisedHost.count({ where })
}

export async function getBeaconById(id: string): Promise<Beacon | null> {
  const row = await prisma.compromisedHost.findUnique({ where: { id } })
  return row ? toBeaconZod(row) : null
}

export async function getBeaconByImplantId(implantId: string): Promise<Beacon | null> {
  const row = await prisma.compromisedHost.findUnique({ where: { implantId } })
  return row ? toBeaconZod(row) : null
}

export async function createBeacon(input: BeaconCreate): Promise<Beacon> {
  const parsed = BeaconCreate.parse(input)
  const now = new Date()
  const row = await prisma.compromisedHost.create({
    data: {
      implantId: parsed.implantId,
      hostname: parsed.hostname,
      ipAddress: parsed.ipAddress,
      os: parsed.os,
      osVersion: parsed.osVersion,
      domain: parsed.domain,
      user: parsed.user,
      privileges: parsed.privileges,
      implantType: parsed.implantType,
      egressNode: parsed.egressNode,
      nodeId: parsed.nodeId,
      firstCompromised: now,
      lastSeen: now,
      runningTasks: 0,
    },
  })
  return toBeaconZod(row)
}

export async function updateBeacon(id: string, input: BeaconUpdate): Promise<Beacon | null> {
  const parsed = BeaconUpdate.parse(input)
  const row = await prisma.compromisedHost.update({
    where: { id },
    data: {
      ...parsed,
      lastSeen: new Date(),
    },
  }).catch(() => null)
  return row ? toBeaconZod(row) : null
}

export async function updateBeaconCheckin(implantId: string): Promise<Beacon | null> {
  const row = await prisma.compromisedHost.update({
    where: { implantId },
    data: { lastSeen: new Date() },
  }).catch(() => null)
  return row ? toBeaconZod(row) : null
}

export async function deleteBeacon(id: string): Promise<boolean> {
  try {
    await prisma.compromisedHost.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}

export async function getBeaconStats(): Promise<{
  total: number
  online: number
  idle: number
  stale: number
  offline: number
  highPrivilege: number
  domains: number
}> {
  const [total, allBeacons] = await Promise.all([
    prisma.compromisedHost.count(),
    prisma.compromisedHost.findMany(),
  ])
  
  const now = Date.now()
  let online = 0
  let idle = 0
  let stale = 0
  let offline = 0
  let highPrivilege = 0
  const domains = new Set<string>()
  
  for (const beacon of allBeacons) {
    const minutesSinceLastSeen = (now - beacon.lastSeen.getTime()) / (1000 * 60)
    
    if (minutesSinceLastSeen < 5) online++
    else if (minutesSinceLastSeen < 30) idle++
    else if (minutesSinceLastSeen < 120) stale++
    else offline++
    
    if (beacon.privileges === "admin" || beacon.privileges === "system" || beacon.privileges === "root") {
      highPrivilege++
    }
    
    if (beacon.domain) {
      domains.add(beacon.domain)
    }
  }
  
  return {
    total,
    online,
    idle,
    stale,
    offline,
    highPrivilege,
    domains: domains.size,
  }
}