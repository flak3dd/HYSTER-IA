/**
 * Test script for my.smtp.com integration
 * Run with: npx tsx test-mysmtp-integration.ts
 */

import { sendMySmtpEmail, validateMySmtpApiKey } from '@/lib/mailer/mysmtp'

async function testMySmtpIntegration() {
  console.log('Testing my.smtp.com integration...\n')

  // Test 1: Validate API key
  console.log('Test 1: Validating API key...')
  const validation = await validateMySmtpApiKey()
  console.log('Validation result:', validation)
  
  if (!validation.valid) {
    console.error('API key validation failed. Please check your MYSMTP_API_KEY environment variable.')
    return
  }

  // Test 2: Send a test email
  console.log('\nTest 2: Sending test email...')
  const emailResult = await sendMySmtpEmail({
    to: 'test@example.com', // Replace with your test email
    subject: 'my.smtp.com Integration Test',
    html: `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2 style="color: #333;">my.smtp.com Integration Test</h2>
        <p>This is a test email sent through the my.smtp.com API integration.</p>
        <p>If you receive this, the integration is working correctly!</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
        <p style="color: #999; font-size: 12px;">
          Sent at ${new Date().toISOString()} by D-Panel my.smtp.com Integration
        </p>
      </div>
    `,
    text: 'This is a test email sent through the my.smtp.com API integration.',
    tags: [
      { name: 'email_type', value: 'test' },
      { name: 'integration', value: 'mysmtp' }
    ]
  })

  console.log('Email send result:', emailResult)

  if (emailResult.success) {
    console.log('\n✅ Integration test passed!')
    console.log('Message ID:', emailResult.messageId)
  } else {
    console.error('\n❌ Integration test failed!')
    console.error('Error:', emailResult.error)
  }
}

// Run the test
testMySmtpIntegration().catch(console.error)