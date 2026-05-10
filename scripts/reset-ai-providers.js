/**
 * Reset AI provider circuit breakers and health state
 * Run this after fixing API keys to clear failed state
 */

const { resetAllProviderState } = require('../lib/ai/provider-fallback.ts')

console.log('Resetting all AI provider state...')
resetAllProviderState()
console.log('✅ All provider state reset successfully')
console.log('Circuit breakers and health monitors have been cleared')
console.log('Retry your chat request now')
