import { NextResponse, type NextRequest } from "next/server"
import { getPayloadBuildById } from "@/lib/db/payload-builds"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { readFile } from "fs/promises"
import { join } from "path"
import { existsSync } from "fs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/admin/payloads/[id]/download - Download a compiled payload
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const build = await getPayloadBuildById(id)
    if (!build) {
      return NextResponse.json({ error: "Payload build not found" }, { status: 404 })
    }

    if (build.status !== "ready") {
      return NextResponse.json({ error: "Payload build is not ready" }, { status: 400 })
    }

    if (!build.implantBinaryPath) {
      return NextResponse.json({ error: "No binary file available" }, { status: 404 })
    }

    // For now, we'll return a placeholder response
    // In production, this would serve the actual compiled binary from the file system
    // The binary path would be stored in build.implantBinaryPath after compilation
    
    // Check if the file exists
    const filePath = join(process.cwd(), build.implantBinaryPath)
    if (!existsSync(filePath)) {
      // If the file doesn't exist, return a mock download for demo purposes
      return NextResponse.json({ 
        error: "Binary file not found on server",
        message: "The payload build is marked as ready but the binary file is not available. This is a demo environment.",
        expectedPath: filePath
      }, { status: 404 })
    }

    // Read the file and serve it
    const fileBuffer = await readFile(filePath)
    
    // Determine content type based on file extension
    const contentType = getContentType(build.type)
    
    // Set filename based on payload type
    const filename = `${build.name.replace(/\s+/g, '-')}.${getFileExtension(build.type)}`

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": fileBuffer.length.toString(),
      },
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}

function getContentType(payloadType: string): string {
  switch (payloadType) {
    case "windows_exe":
      return "application/vnd.microsoft.portable-executable"
    case "linux_elf":
      return "application/x-executable"
    case "macos_app":
      return "application/octet-stream"
    case "powershell":
      return "text/plain"
    case "python":
      return "text/x-python"
    default:
      return "application/octet-stream"
  }
}

function getFileExtension(payloadType: string): string {
  switch (payloadType) {
    case "windows_exe":
      return "exe"
    case "linux_elf":
      return "elf"
    case "macos_app":
      return "app"
    case "powershell":
      return "ps1"
    case "python":
      return "py"
    default:
      return "bin"
  }
}