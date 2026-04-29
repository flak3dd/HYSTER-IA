import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth/admin'
import { 
  analyzeOtxIpv4, 
  analyzeOtxDomain, 
  analyzeOtxUrl, 
  analyzeOtxFileHash 
} from '@/lib/threatintel/alienvault'
import { getOtxClient } from '@/lib/threatintel/alienvault'

// GET /api/admin/threatintel/alienvault - Analyze indicators with AlienVault OTX
export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const admin = await verifyAdmin(request)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type') // 'ip', 'domain', 'url', 'hash', 'pulses'
    const indicator = searchParams.get('indicator')
    const query = searchParams.get('query')
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    const client = getOtxClient()
    let result

    switch (type) {
      case 'ip':
        if (!indicator) {
          return NextResponse.json(
            { error: 'Indicator parameter is required for ip type' },
            { status: 400 }
          )
        }
        result = await analyzeOtxIpv4(indicator)
        break

      case 'domain':
        if (!indicator) {
          return NextResponse.json(
            { error: 'Indicator parameter is required for domain type' },
            { status: 400 }
          )
        }
        result = await analyzeOtxDomain(indicator)
        break

      case 'url':
        if (!indicator) {
          return NextResponse.json(
            { error: 'Indicator parameter is required for url type' },
            { status: 400 }
          )
        }
        result = await analyzeOtxUrl(indicator)
        break

      case 'hash':
        if (!indicator) {
          return NextResponse.json(
            { error: 'Indicator parameter is required for hash type' },
            { status: 400 }
          )
        }
        result = await analyzeOtxFileHash(indicator)
        break

      case 'pulses':
        if (query) {
          result = await client.searchPulses(query, limit)
        } else {
          result = await client.getPulses(limit)
        }
        break

      default:
        return NextResponse.json(
          { error: 'Invalid type. Must be: ip, domain, url, hash, or pulses' },
          { status: 400 }
        )
    }

    return NextResponse.json({
      success: true,
      type,
      ...result,
    })
  } catch (error) {
    console.error('AlienVault OTX analysis error:', error)
    return NextResponse.json(
      {
        error: 'AlienVault OTX analysis failed',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
