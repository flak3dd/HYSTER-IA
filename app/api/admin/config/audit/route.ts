import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth/admin'
import {
  checkPasswordStrength,
  validateTLSConfig,
  scoreObfuscationEffectiveness,
  runSecurityChecklist,
} from '@/lib/config/audit'
import logger from '@/lib/logger'

const log = logger.child({ module: 'api/admin/config/audit' })

export async function POST(request: NextRequest) {
  try {
    await verifyAdmin(request)
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { type, config } = body

    let result

    switch (type) {
      case 'password':
        result = checkPasswordStrength(config.password)
        break

      case 'tls':
        result = validateTLSConfig(config)
        break

      case 'obfuscation':
        result = scoreObfuscationEffectiveness(config)
        break

      case 'security-checklist':
        result = runSecurityChecklist(config)
        break

      default:
        return NextResponse.json({ error: 'Invalid audit type' }, { status: 400 })
    }

    return NextResponse.json({ success: true, result })
  } catch (error) {
    log.error({ err: error }, 'Config audit error')
    return NextResponse.json(
      { error: 'Audit failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}