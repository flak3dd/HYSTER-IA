import { NextRequest, NextResponse } from 'next/server'
import { getProactiveIntelligence } from '@/lib/workflow/proactive-intelligence'

export async function GET(request: NextRequest) {
  try {
    const proactiveIntelligence = getProactiveIntelligence()
    const healthCheck = await proactiveIntelligence.getProactiveHealthCheck()

    return NextResponse.json(healthCheck)
  } catch (error) {
    console.error('Error in proactive health check:', error)
    return NextResponse.json(
      { error: 'Failed to perform proactive health check' },
      { status: 500 }
    )
  }
}