import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth/admin'
import { enumerateDomain, getAllSubdomains } from '@/lib/osint/domain-enum'

// GET /api/admin/osint/domain - Perform domain enumeration
export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const admin = await verifyAdmin(request)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const domain = searchParams.get('domain')

    if (!domain) {
      return NextResponse.json(
        { error: 'Domain parameter is required' },
        { status: 400 }
      )
    }

    // Parse options
    const includeCrtSh = searchParams.get('includeCrtSh') !== 'false'
    const includeDnsEnum = searchParams.get('includeDnsEnum') !== 'false'
    const includeWildcardCheck = searchParams.get('includeWildcardCheck') !== 'false'
    const includeWhois = searchParams.get('includeWhois') !== 'false'
    const includeBruteForce = searchParams.get('includeBruteForce') === 'true'

    // Perform domain enumeration
    const result = await enumerateDomain(domain, {
      includeCrtSh,
      includeDnsEnum,
      includeWildcardCheck,
      includeWhois,
      includeBruteForce,
    })

    // Get all unique subdomains
    const allSubdomains = getAllSubdomains(result)

    return NextResponse.json({
      success: true,
      domain: result.domain,
      subdomains: allSubdomains,
      sources: result.subdomains,
      dnsRecords: result.dnsRecords,
      whois: result.whois,
      timestamp: result.timestamp,
    })
  } catch (error) {
    console.error('Domain enumeration error:', error)
    return NextResponse.json(
      {
        error: 'Domain enumeration failed',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
