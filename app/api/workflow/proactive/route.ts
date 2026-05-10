import { NextRequest, NextResponse } from 'next/server'
import { getProactiveIntelligence } from '@/lib/workflow/proactive-intelligence'
import logger from '@/lib/logger'

const log = logger.child({ module: 'api/workflow/proactive' })

export async function GET(request: NextRequest) {
  try {
    const proactiveIntelligence = getProactiveIntelligence()
    const healthCheck = await proactiveIntelligence.getProactiveHealthCheck()

    return NextResponse.json(healthCheck)
  } catch (error) {
    log.error({ err: error }, 'Error in proactive health check')
    return NextResponse.json(
      { error: 'Failed to perform proactive health check' },
      { status: 500 }
    )
  }
}