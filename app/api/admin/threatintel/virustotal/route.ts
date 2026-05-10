import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth/admin'
import { 
  analyzeIpAddress, 
  analyzeDomain, 
  analyzeUrl, 
  analyzeFileHash 
} from '@/lib/threatintel/virustotal'
import logger from '@/lib/logger'

const log = logger.child({ module: 'api/admin/threatintel/virustotal' })

// GET /api/admin/threatintel/virustotal - Analyze indicators with VirusTotal
export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const admin = await verifyAdmin(request)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type') // 'ip', 'domain', 'url', 'hash'
    const indicator = searchParams.get('indicator')

    if (!type || !indicator) {
      return NextResponse.json(
        { error: 'Type and indicator parameters are required' },
        { status: 400 }
      )
    }

    let result

    switch (type) {
      case 'ip':
        result = await analyzeIpAddress(indicator)
        break
      case 'domain':
        result = await analyzeDomain(indicator)
        break
      case 'url':
        result = await analyzeUrl(indicator)
        break
      case 'hash':
        result = await analyzeFileHash(indicator)
        break
      default:
        return NextResponse.json(
          { error: 'Invalid type. Must be: ip, domain, url, or hash' },
          { status: 400 }
        )
    }

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    log.error({ err: error }, 'VirusTotal analysis error')
    return NextResponse.json(
      {
        error: 'VirusTotal analysis failed',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
