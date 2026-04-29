import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getOperatorFromAccessToken } from '@/lib/auth/jwt'

export async function POST() {
  try {
    const store = await cookies()
    const accessToken = store.get('access_token')?.value
    
    if (!accessToken) {
      return NextResponse.json({ 
        success: false, 
        message: 'Not authenticated' 
      }, { status: 401 })
    }
    
    const operator = await getOperatorFromAccessToken(accessToken)
    
    if (!operator || !operator.isActive) {
      return NextResponse.json({ 
        success: false, 
        message: 'Invalid session' 
      }, { status: 401 })
    }
    
    // Return success with redirect info
    return NextResponse.json({ 
      success: true, 
      message: 'Authenticated',
      redirect: '/admin'
    })
    
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}