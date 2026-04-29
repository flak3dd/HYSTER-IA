import { NextRequest, NextResponse } from 'next/server'
import { readSession } from '@/lib/auth/session'

/**
 * GET /api/workflow/functions - Get all available backend functions
 */
export async function GET(request: NextRequest) {
  try {
    // Verify operator authentication
    const operator = await readSession()
    if (!operator) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { FunctionRegistry } = await import('@/lib/workflow/function-registry')
    const registry = new FunctionRegistry()
    const functions = await registry.getAllFunctions()

    return NextResponse.json({ functions })
  } catch (error) {
    console.error('Error getting workflow functions:', error)
    return NextResponse.json(
      { error: 'Failed to get workflow functions' },
      { status: 500 }
    )
  }
}