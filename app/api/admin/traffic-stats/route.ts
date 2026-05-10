import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth/admin'
import { getTrafficStatsCollector } from '@/lib/infrastructure/traffic-stats'
import { listUsers } from '@/lib/db/users'
import logger from '@/lib/logger'

const log = logger.child({ module: 'api/admin/traffic-stats' })

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    await verifyAdmin(request)
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const period = (searchParams.get('period') || '5m') as '1m' | '5m' | '15m' | '1h' | '24h'
    const includePerUser = searchParams.get('perUser') === 'true'
    const clearCache = searchParams.get('clearCache') === 'true'

    const collector = getTrafficStatsCollector()

    // Fetch basic stats
    const [globalStats, bandwidthHistory] = await Promise.all([
      collector.fetchGlobalStats(clearCache),
      collector.fetchBandwidthHistory(period),
    ])

    let perUserStats = null
    if (includePerUser) {
      const users = await listUsers()
      const userMap = new Map(users.map(u => [u.authToken, { id: u.id, displayName: u.displayName }]))
      perUserStats = await collector.getPerUserStats(userMap)
    }

    return NextResponse.json({
      success: true,
      data: {
        global: globalStats,
        bandwidthHistory,
        perUser: perUserStats,
        cacheStats: collector.getCacheStats(),
      },
    })
  } catch (error) {
    log.error({ err: error }, 'Failed to fetch traffic stats')
    return NextResponse.json(
      { error: 'Failed to fetch traffic stats', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await verifyAdmin(request)
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const collector = getTrafficStatsCollector()
    collector.clearCache()

    return NextResponse.json({ success: true, message: 'Cache cleared' })
  } catch (error) {
    log.error({ err: error }, 'Failed to clear cache')
    return NextResponse.json(
      { error: 'Failed to clear cache', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}