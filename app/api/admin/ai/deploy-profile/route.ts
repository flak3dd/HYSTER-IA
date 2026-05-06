import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { access, readFile } from "node:fs/promises"
import { constants as fsConstants } from "node:fs"
import { join } from "node:path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type DeployProfileId = "docker_compose" | "docker" | "node_runtime" | "static"

type ProfileDetection = {
  id: DeployProfileId
  label: string
  detected: boolean
  evidence: string[]
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

async function readPackageScripts(cwd: string): Promise<Record<string, string>> {
  try {
    const raw = await readFile(join(cwd, "package.json"), "utf8")
    const parsed = JSON.parse(raw) as { scripts?: Record<string, string> }
    return parsed.scripts ?? {}
  } catch {
    return {}
  }
}

function pickPrimaryProfile(detections: ProfileDetection[]): DeployProfileId {
  if (detections.find((d) => d.id === "docker_compose")?.detected) return "docker_compose"
  if (detections.find((d) => d.id === "docker")?.detected) return "docker"
  if (detections.find((d) => d.id === "node_runtime")?.detected) return "node_runtime"
  return "static"
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)

    const cwd = process.cwd()
    const scripts = await readPackageScripts(cwd)

    const hasDockerfile = await fileExists(join(cwd, "Dockerfile"))
    const hasCompose =
      (await fileExists(join(cwd, "docker-compose.yml"))) ||
      (await fileExists(join(cwd, "docker-compose.yaml"))) ||
      (await fileExists(join(cwd, "config", "docker-compose.prod.yml")))

    const hasBuildScript = Boolean(scripts.build)
    const hasStartScript = Boolean(scripts.start)

    const detections: ProfileDetection[] = [
      {
        id: "docker_compose",
        label: "Docker Compose",
        detected: hasCompose,
        evidence: hasCompose
          ? ["config/docker-compose.prod.yml or docker-compose file detected"]
          : [],
      },
      {
        id: "docker",
        label: "Docker",
        detected: hasDockerfile,
        evidence: hasDockerfile ? ["Dockerfile detected at repository root"] : [],
      },
      {
        id: "node_runtime",
        label: "Node Runtime",
        detected: hasBuildScript && hasStartScript,
        evidence:
          hasBuildScript && hasStartScript
            ? ["package.json contains build/start scripts"]
            : [],
      },
      {
        id: "static",
        label: "Static Hosting",
        detected: false,
        evidence: [],
      },
    ]

    const primaryProfile = pickPrimaryProfile(detections)

    return NextResponse.json({
      primaryProfile,
      profiles: detections,
      scripts: {
        install: "npm ci",
        lint: scripts.lint ? "npm run lint" : null,
        test: scripts.test ? "npm run test" : null,
        build: scripts.build ? "npm run build" : null,
        start: scripts.start ? "npm run start" : null,
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

