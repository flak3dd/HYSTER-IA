import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import {
  listProfiles,
  createProfile,
  ProfileCreate,
  getProfilePreset,
  PROFILE_TYPE_LABELS,
  type ProfileType,
} from "@/lib/db/profiles"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const profiles = await listProfiles()
    return NextResponse.json({ profiles })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const body = await req.json().catch(() => null)
    const parsed = ProfileCreate.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "bad_request", issues: parsed.error.issues }, { status: 400 })
    }
    const profile = await createProfile(parsed.data)
    return NextResponse.json({ profile }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/** Utility: return profile type presets and labels */
export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const types = (["basic_tls_proxy", "socks5_relay", "high_throughput", "tun_overlay", "custom"] as ProfileType[]).map(
      (t) => ({
        type: t,
        label: PROFILE_TYPE_LABELS[t],
        defaults: getProfilePreset(t),
      }),
    )
    return NextResponse.json({ types })
  } catch (err) {
    return toErrorResponse(err)
  }
}
