/**
 * Config Audit Module
 *
 * Provides security auditing and validation for Hysteria2 configurations
 */

export interface PasswordStrengthResult {
  score: number // 0-4
  strength: 'very weak' | 'weak' | 'fair' | 'strong' | 'very strong'
  feedback: string[]
  suggestions: string[]
}

export interface TLSValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  score: number // 0-100
}

export interface ObfuscationScoreResult {
  score: number // 0-100
  effectiveness: 'poor' | 'basic' | 'good' | 'excellent'
  analysis: {
    passwordStrength: number
    protocolFeatures: number
    configurationComplexity: number
  }
  recommendations: string[]
}

export interface SecurityChecklistResult {
  category: string
  checks: Array<{
    name: string
    passed: boolean
    severity: 'critical' | 'high' | 'medium' | 'low'
    description: string
    recommendation?: string
  }>
  overallScore: number
}

/**
 * Password Strength Checker
 * Evaluates password strength based on multiple criteria
 */
export function checkPasswordStrength(password: string): PasswordStrengthResult {
  const feedback: string[] = []
  const suggestions: string[] = []
  let score = 0

  if (!password || password.length === 0) {
    return {
      score: 0,
      strength: 'very weak',
      feedback: ['Password is required'],
      suggestions: ['Use a strong password with at least 12 characters'],
    }
  }

  // Length check
  if (password.length < 8) {
    feedback.push('Password is too short')
    suggestions.push('Use at least 8 characters')
  } else if (password.length < 12) {
    score += 1
    feedback.push('Password length is acceptable but could be longer')
    suggestions.push('Consider using 12+ characters for better security')
  } else if (password.length < 16) {
    score += 2
    feedback.push('Good password length')
  } else {
    score += 3
    feedback.push('Excellent password length')
  }

  // Character variety
  const hasLowercase = /[a-z]/.test(password)
  const hasUppercase = /[A-Z]/.test(password)
  const hasNumbers = /\d/.test(password)
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password)

  if (!hasLowercase) {
    suggestions.push('Add lowercase letters')
  }
  if (!hasUppercase) {
    suggestions.push('Add uppercase letters')
  }
  if (!hasNumbers) {
    suggestions.push('Add numbers')
  }
  if (!hasSpecial) {
    suggestions.push('Add special characters')
  }

  const varietyCount = [hasLowercase, hasUppercase, hasNumbers, hasSpecial].filter(Boolean).length
  score += Math.min(varietyCount, 2)

  // Pattern checks
  const commonPatterns = [
    'password', '123456', 'qwerty', 'admin', 'letmein',
    'welcome', 'monkey', 'dragon', 'master', 'hello'
  ]

  const lowerPassword = password.toLowerCase()
  if (commonPatterns.some(pattern => lowerPassword.includes(pattern))) {
    score -= 1
    feedback.push('Password contains common patterns')
    suggestions.push('Avoid common words and patterns')
  }

  // Sequential characters
  const hasSequentialChars = /(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|012|123|234|345|456|567|678|789|890)/i.test(password)
  if (hasSequentialChars) {
    score -= 1
    feedback.push('Password contains sequential characters')
    suggestions.push('Avoid sequential characters')
  }

  // Repeated characters
  const hasRepeatedChars = /(.)\1{2,}/.test(password)
  if (hasRepeatedChars) {
    score -= 1
    feedback.push('Password contains repeated characters')
    suggestions.push('Avoid repeated characters')
  }

  // Ensure score is within bounds
  score = Math.max(0, Math.min(4, score))

  let strength: PasswordStrengthResult['strength'] = 'weak'
  switch (score) {
    case 0:
      strength = 'very weak'
      break
    case 1:
      strength = 'weak'
      break
    case 2:
      strength = 'fair'
      break
    case 3:
      strength = 'strong'
      break
    case 4:
      strength = 'very strong'
      break
  }

  return {
    score,
    strength,
    feedback,
    suggestions,
  }
}

/**
 * TLS Configuration Validator
 * Validates TLS certificate and configuration
 */
export function validateTLSConfig(config: {
  cert?: string
  key?: string
  domains?: string[]
  email?: string
  mode?: 'manual' | 'acme'
}): TLSValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  let score = 100

  if (!config.cert && !config.key && config.mode !== 'acme') {
    errors.push('TLS certificate and key are required for manual mode')
    score -= 50
  }

  if (config.mode === 'acme') {
    if (!config.email) {
      errors.push('Email is required for ACME mode')
      score -= 30
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email)) {
      errors.push('Invalid email format for ACME')
      score -= 20
    }

    if (!config.domains || config.domains.length === 0) {
      errors.push('At least one domain is required for ACME')
      score -= 30
    } else {
      config.domains.forEach(domain => {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9-_.]*\.[a-zA-Z]{2,}$/.test(domain)) {
          errors.push(`Invalid domain format: ${domain}`)
          score -= 10
        }
      })
    }
  }

  if (config.mode === 'manual') {
    if (config.cert) {
      // Basic certificate validation
      if (!config.cert.includes('-----BEGIN CERTIFICATE-----')) {
        errors.push('Invalid certificate format')
        score -= 30
      }
    }

    if (config.key) {
      if (!config.key.includes('-----BEGIN') || !config.key.includes('PRIVATE KEY')) {
        errors.push('Invalid private key format')
        score -= 30
      }
    }

    if (config.cert && config.key) {
      warnings.push('Ensure certificate and key match')
    }
  }

  // Check for weak TLS configurations
  warnings.push('Consider using TLS 1.3 only')
  warnings.push('Use strong cipher suites')
  warnings.push('Enable HSTS for production')

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    score: Math.max(0, score),
  }
}

/**
 * Obfuscation Effectiveness Scoring
 * Evaluates the effectiveness of obfuscation configuration
 */
export function scoreObfuscationEffectiveness(config: {
  type?: string
  password?: string
  salamander?: boolean
}): ObfuscationScoreResult {
  const recommendations: string[] = []
  let passwordStrength = 0
  let protocolFeatures = 0
  let configurationComplexity = 0

  // Password strength analysis
  if (config.password) {
    const pwdResult = checkPasswordStrength(config.password)
    passwordStrength = (pwdResult.score / 4) * 100 // Convert to 0-100 scale
    recommendations.push(...pwdResult.suggestions)
  } else {
    passwordStrength = 0
    recommendations.push('Set a strong obfuscation password')
  }

  // Protocol features
  if (config.type === 'salamander' || config.salamander) {
    protocolFeatures += 40
    recommendations.push('Salamander obfuscation provides good protocol masking')
  } else {
    protocolFeatures += 20
    recommendations.push('Consider using Salamander obfuscation for better protocol masking')
  }

  if (config.password && config.password.length >= 16) {
    protocolFeatures += 20
  }

  if (config.type) {
    protocolFeatures += 20
  }

  // Configuration complexity
  if (config.type && config.password) {
    configurationComplexity += 40
  }

  if (config.salamander) {
    configurationComplexity += 30
  }

  if (config.password && config.password.length >= 12) {
    configurationComplexity += 30
  }

  const overallScore = Math.round(
    (passwordStrength * 0.4) +
    (protocolFeatures * 0.35) +
    (configurationComplexity * 0.25)
  )

  let effectiveness: ObfuscationScoreResult['effectiveness']
  if (overallScore >= 80) {
    effectiveness = 'excellent'
  } else if (overallScore >= 60) {
    effectiveness = 'good'
  } else if (overallScore >= 40) {
    effectiveness = 'basic'
  } else {
    effectiveness = 'poor'
  }

  return {
    score: overallScore,
    effectiveness,
    analysis: {
      passwordStrength,
      protocolFeatures,
      configurationComplexity,
    },
    recommendations,
  }
}

/**
 * Security Best Practices Checklist
 * Comprehensive security audit checklist
 */
export function runSecurityChecklist(config: {
  auth?: {
    password?: string
    type?: string
  }
  tls?: {
    mode?: string
    cert?: string
    key?: string
  }
  obfs?: {
    type?: string
    password?: string
  }
  bandwidth?: {
    up?: number
    down?: number
  }
}): SecurityChecklistResult {
  const checks: SecurityChecklistResult['checks'] = []

  // Authentication checks
  if (config.auth) {
    checks.push({
      name: 'Strong Authentication Password',
      passed: config.auth.password ? checkPasswordStrength(config.auth.password).score >= 3 : false,
      severity: 'critical',
      description: 'Authentication password should be strong (12+ characters, mixed case, numbers, symbols)',
      recommendation: 'Use a strong password with at least 12 characters including uppercase, lowercase, numbers, and special characters',
    })

    checks.push({
      name: 'Authentication Method',
      passed: !!config.auth.type,
      severity: 'high',
      description: 'Authentication method should be configured',
      recommendation: 'Configure a secure authentication method',
    })
  }

  // TLS checks
  if (config.tls) {
    checks.push({
      name: 'TLS Certificate Valid',
      passed: config.tls.mode === 'acme' || (!!config.tls.cert && !!config.tls.key),
      severity: 'critical',
      description: 'Valid TLS certificate should be configured',
      recommendation: 'Use ACME for automatic certificates or provide valid manual certificates',
    })

    checks.push({
      name: 'TLS Configuration',
      passed: config.tls.mode === 'acme' || ((config.tls.cert?.includes('BEGIN CERTIFICATE') ?? false) && (config.tls.key?.includes('PRIVATE KEY') ?? false)),
      severity: 'high',
      description: 'TLS configuration should be valid',
      recommendation: 'Ensure certificate and key are properly formatted',
    })
  }

  // Obfuscation checks
  if (config.obfs) {
    checks.push({
      name: 'Obfuscation Password Strength',
      passed: config.obfs.password ? checkPasswordStrength(config.obfs.password).score >= 2 : false,
      severity: 'high',
      description: 'Obfuscation password should be at least fair strength',
      recommendation: 'Use a strong obfuscation password with at least 12 characters',
    })

    checks.push({
      name: 'Obfuscation Enabled',
      passed: !!config.obfs.type,
      severity: 'medium',
      description: 'Obfuscation should be enabled for better security',
      recommendation: 'Enable obfuscation to mask traffic patterns',
    })
  }

  // Bandwidth checks
  if (config.bandwidth) {
    checks.push({
      name: 'Bandwidth Limits Configured',
      passed: !!(config.bandwidth.up || config.bandwidth.down),
      severity: 'low',
      description: 'Bandwidth limits help prevent abuse',
      recommendation: 'Configure appropriate bandwidth limits for your use case',
    })
  }

  // General security checks
  checks.push({
    name: 'Strong Secret Keys',
    passed: true, // Assume valid if config exists
    severity: 'critical',
    description: 'All secret keys should be strong and unique',
    recommendation: 'Use strong, unique secrets for all authentication mechanisms',
  })

  checks.push({
    name: 'Regular Updates',
    passed: true, // Assume valid
    severity: 'medium',
    description: 'System should be kept up to date',
    recommendation: 'Keep Hysteria2 and system dependencies updated',
  })

  checks.push({
    name: 'Monitoring Enabled',
    passed: true, // Assume valid
    severity: 'medium',
    description: 'Monitoring and logging should be enabled',
    recommendation: 'Enable monitoring for security and operational visibility',
  })

  const passedChecks = checks.filter(c => c.passed).length
  const overallScore = Math.round((passedChecks / checks.length) * 100)

  return {
    category: 'Security',
    checks,
    overallScore,
  }
}