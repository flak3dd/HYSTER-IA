import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth/admin'
import { 
  checkMalwareBazaarHash, 
  checkUrlhausUrl, 
  checkThreatFoxIoc 
} from '@/lib/threatintel/abusech'
import { getAbuseChClient } from '@/lib/threatintel/abusech'
import logger from '@/lib/logger'

const log = logger.child({ module: 'api/admin/threatintel/abusech' })

// GET /api/admin/threatintel/abusech - Query Abuse.ch feeds
export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const admin = await verifyAdmin(request)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const feed = searchParams.get('feed') // 'malwarebazaar', 'urlhaus', 'threatfox'
    const type = searchParams.get('type') // 'hash', 'url', 'ioc', 'tag', 'malware'
    const query = searchParams.get('query')
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    if (!feed) {
      return NextResponse.json(
        { error: 'Feed parameter is required' },
        { status: 400 }
      )
    }

    const client = getAbuseChClient()
    let result

    switch (feed) {
      case 'malwarebazaar':
        if (!type || !query) {
          return NextResponse.json(
            { error: 'Type and query parameters are required for malwarebazaar' },
            { status: 400 }
          )
        }

        if (type === 'hash') {
          result = await checkMalwareBazaarHash(query)
        } else if (type === 'tag') {
          const samples = await client.queryMalwareBazaarByTag(query, limit)
          result = { samples, count: samples.length }
        } else {
          return NextResponse.json(
            { error: 'Invalid type for malwarebazaar. Must be: hash or tag' },
            { status: 400 }
          )
        }
        break

      case 'urlhaus':
        if (!type || !query) {
          return NextResponse.json(
            { error: 'Type and query parameters are required for urlhaus' },
            { status: 400 }
          )
        }

        if (type === 'url') {
          result = await checkUrlhausUrl(query)
        } else if (type === 'host') {
          const urls = await client.queryUrlhausByHost(query)
          result = { urls, count: urls.length }
        } else {
          return NextResponse.json(
            { error: 'Invalid type for urlhaus. Must be: url or host' },
            { status: 400 }
          )
        }
        break

      case 'threatfox':
        if (!type || !query) {
          return NextResponse.json(
            { error: 'Type and query parameters are required for threatfox' },
            { status: 400 }
          )
        }

        if (type === 'ioc') {
          result = await checkThreatFoxIoc(query)
        } else if (type === 'malware') {
          const indicators = await client.queryThreatFoxByMalware(query, limit)
          result = { indicators, count: indicators.length }
        } else {
          return NextResponse.json(
            { error: 'Invalid type for threatfox. Must be: ioc or malware' },
            { status: 400 }
          )
        }
        break

      default:
        return NextResponse.json(
          { error: 'Invalid feed. Must be: malwarebazaar, urlhaus, or threatfox' },
          { status: 400 }
        )
    }

    return NextResponse.json({
      success: true,
      feed,
      ...result,
    })
  } catch (error) {
    log.error({ err: error }, 'Abuse.ch query error')
    return NextResponse.json(
      {
        error: 'Abuse.ch query failed',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
