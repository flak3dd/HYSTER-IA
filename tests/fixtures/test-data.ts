/**
 * Test fixtures and sample data
 * Realistic test scenarios and data for comprehensive testing
 */

// Helper to generate unique test IDs
let testIdCounter = 0
const generateTestId = (prefix: string): string => {
  testIdCounter++
  return `${prefix}-${Date.now()}-${testIdCounter}-${Math.random().toString(36).substr(2, 9)}`
}

export const createTestOperator = (overrides = {}) => ({
  username: `test_operator_${Date.now()}`,
  password: '$2a$10$test_hashed_password', // bcrypt hash
  role: 'OPERATOR',
  isActive: true,
  permissions: JSON.stringify(['read', 'write', 'execute']),
  skills: JSON.stringify(['network', 'social_engineering', 'malware_analysis']),
  ...overrides,
})

export const testOperator = createTestOperator()

export const createTestOperation = (overrides = {}) => ({
  name: 'Test Red Team Operation',
  description: 'A comprehensive red team operation for automated testing',
  type: 'PENETRATION_TEST',
  priority: 'HIGH',
  status: 'PLANNING',
  team: JSON.stringify([generateTestId('operator')]),
  createdBy: generateTestId('operator'),
  ...overrides,
})

export const testOperation = createTestOperation()

export const createTestHysteriaNode = (overrides = {}) => ({
  name: `Test C2 Node ${Date.now()}`,
  hostname: `c2-test-${Date.now()}.example.com`,
  region: 'us-east-1',
  listenAddr: ':443',
  status: 'stopped',
  tags: JSON.stringify(['test', 'development', 'aws']),
  provider: 'aws',
  ...overrides,
})

export const testHysteriaNode = createTestHysteriaNode()

export const createTestImplant = (overrides = {}) => ({
  implantId: `implant-test-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
  name: 'Test Windows Implant',
  type: 'windows',
  architecture: 'x64',
  targetId: generateTestId('target'),
  status: 'active',
  lastSeen: new Date(),
  firstSeen: new Date(),
  config: {
    callbackInterval: 30,
    jitter: 0.2,
    transport: 'hysteria2',
    obfuscation: true,
    killSwitch: `emergency-stop-${Date.now()}`,
  },
  transportConfig: {
    server: `c2-test-${Date.now()}.example.com`,
    port: 443,
    auth: `test-auth-token-${Date.now()}`,
    obfs: 'salamander',
  },
  ...overrides,
})

export const testImplant = createTestImplant()

export const createTestPayload = (overrides = {}) => ({
  name: 'Test Windows Payload',
  type: 'dll',
  loaderType: 'reflective',
  config: {
    architecture: 'x64',
    obfuscation: true,
    encryption: 'aes256',
    antiDebug: true,
    antiVM: true,
  },
  obfuscated: true,
  status: 'ACTIVE',
  ...overrides,
})

export const testPayload = createTestPayload()

export const createTestProfile = (overrides = {}) => ({
  id: generateTestId('profile'),
  name: `Test Profile ${Date.now()}`,
  type: 'load_balancing',
  description: 'Load balancing profile for testing',
  nodeIds: JSON.stringify([generateTestId('node')]),
  config: {
    strategy: 'round_robin',
    healthCheck: true,
  },
  tags: JSON.stringify(['test']),
  ...overrides,
})

export const createTestShadowGrokExecution = (overrides = {}) => ({
  id: generateTestId('execution'),
  conversationId: generateTestId('conversation'),
  userId: generateTestId('operator'),
  userMessage: 'Deploy implant to target network',
  finalResponse: 'Implant deployed successfully to 3 targets',
  model: 'gpt-4',
  toolExecutions: 5,
  successfulExecutions: 4,
  failedExecutions: 1,
  approvalRequired: false,
  status: 'completed',
  executionTimeMs: 15000,
  ...overrides,
})

export const createTestShadowGrokToolCall = (overrides = {}) => ({
  id: generateTestId('tool-call'),
  executionId: generateTestId('execution'),
  toolName: 'deploy_implant',
  arguments: {
    target: 'target-network-001',
    implantType: 'windows',
    architecture: 'x64',
  },
  result: {
    success: true,
    deployedCount: 3,
    targets: ['target-001', 'target-002', 'target-003'],
  },
  success: true,
  requiresApproval: false,
  approvalGranted: true,
  approvedBy: generateTestId('operator'),
  executionTimeMs: 5000,
  ...overrides,
})

export const testShadowGrokExecution = createTestShadowGrokExecution()
export const testShadowGrokToolCall = createTestShadowGrokToolCall()

export const testOSINTData = {
  id: 'test-osint-001',
  type: 'domain',
  target: 'target-company.com',
  data: {
    subdomains: ['www.target-company.com', 'mail.target-company.com'],
    dnsRecords: [
      { type: 'A', value: '192.168.1.1' },
      { type: 'MX', value: 'mail.target-company.com' },
    ],
    whois: {
      registrar: 'Example Registrar',
      created: '2020-01-01',
      expires: '2025-01-01',
    },
  },
  source: 'passive_dns',
  confidence: 85,
}

export const testEmailCampaign = {
  id: 'test-campaign-001',
  name: 'Test Phishing Campaign',
  description: 'Test campaign for automated testing',
  status: 'draft',
  provider: 'smtp',
  tunnelScriptType: 'hysteria2',
  nodeId: 'test-node-001',
  targetDomains: JSON.stringify(['target-company.com', 'partner-company.com']),
  harvestedEmails: JSON.stringify([
    { email: 'user1@target-company.com', source: 'website', confidence: 90 },
    { email: 'user2@target-company.com', source: 'linkedin', confidence: 85 },
  ]),
  selectedEmails: JSON.stringify(['user1@target-company.com', 'user2@target-company.com']),
  totalRecipients: 2,
  sentCount: 0,
  failedCount: 0,
}

export const testThreatIntel = {
  id: 'test-threat-001',
  source: 'virustotal',
  type: 'file_hash',
  indicator: '5d41402abc4b2a76b9719d911017c592',
  data: {
    detections: 5,
    lastAnalysis: '2024-01-01T00:00:00Z',
    engines: ['Kaspersky', 'Symantec', 'McAfee'],
  },
  confidence: 95,
  severity: 'HIGH',
}

export const testNetworkMap = {
  id: 'test-network-001',
  target: '192.168.1.0/24',
  topology: {
    nodes: [
      { ip: '192.168.1.1', type: 'router' },
      { ip: '192.168.1.100', type: 'server' },
      { ip: '192.168.1.200', type: 'workstation' },
    ],
    edges: [
      { from: '192.168.1.1', to: '192.168.1.100' },
      { from: '192.168.1.1', to: '192.168.1.200' },
    ],
  },
  services: {
    '192.168.1.100': [22, 80, 443],
    '192.168.1.200': [3389, 445],
  },
  dataFlows: [
    { from: '192.168.1.200', to: '192.168.1.100', port: 443, protocol: 'HTTPS' },
  ],
}

export const testWorkflowSession = {
  id: 'test-workflow-001',
  userId: 'test-operator-001',
  status: 'initialized',
  currentStepOrder: 0,
  workflowType: 'implant_deployment',
  context: {
    targetNetwork: 'target-network-001',
    implantType: 'windows',
  },
}

export const testAiConversation = {
  id: 'test-ai-conversation-001',
  title: 'Test AI Conversation',
  createdBy: 'test-operator-001',
  messages: [
    {
      id: 'msg-001',
      role: 'user',
      content: 'Help me deploy an implant',
      sortOrder: 0,
    },
    {
      id: 'msg-002',
      role: 'assistant',
      content: 'I can help you deploy an implant. What type of target?',
      sortOrder: 1,
    },
  ],
}

// Email fixtures for testing
export const testEmails = [
  {
    to: 'user1@target-company.com',
    subject: 'Important Update - Action Required',
    body: 'Please review the attached document.',
    type: 'phishing',
  },
  {
    to: 'user2@target-company.com',
    subject: 'Security Alert',
    body: 'Your account has been compromised.',
    type: 'phishing',
  },
]

// Domain fixtures for OSINT testing
export const testDomains = [
  'target-company.com',
  'partner-company.com',
  'supplier-company.com',
]

// IP address fixtures for network testing
export const testIPs = [
  '192.168.1.1',
  '192.168.1.100',
  '192.168.1.200',
  '10.0.0.1',
]

// File hash fixtures for threat intel testing
export const testFileHashes = [
  '5d41402abc4b2a76b9719d911017c592', // MD5 of "hello"
  '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824', // SHA256 of "hello"
]

// Payload configuration fixtures
export const testPayloadConfigs = {
  windows: {
    architecture: 'x64',
    format: 'dll',
    loader: 'reflective',
    obfuscation: true,
    encryption: 'aes256',
  },
  linux: {
    architecture: 'x64',
    format: 'elf',
    loader: 'shellcode',
    obfuscation: true,
    encryption: 'aes256',
  },
  macos: {
    architecture: 'arm64',
    format: 'dylib',
    loader: 'reflective',
    obfuscation: true,
    encryption: 'aes256',
  },
}

// Transport protocol fixtures
export const testTransportProtocols = [
  {
    name: 'hysteria2',
    type: 'udp',
    config: {
      port: 443,
      auth: 'test-auth',
      obfs: 'salamander',
    },
  },
  {
    name: 'shadowsocks',
    type: 'tcp',
    config: {
      port: 8388,
      method: 'aes-256-gcm',
      password: 'test-password',
    },
  },
]

// Kill switch test scenarios
export const testKillSwitchScenarios = {
  emergency: {
    trigger: 'manual',
    action: 'immediate_shutdown',
    affectedImplants: ['implant-001', 'implant-002'],
  },
  timeout: {
    trigger: 'callback_timeout',
    action: 'self_destruct',
    timeout: 3600,
  },
  geofence: {
    trigger: 'geolocation_violation',
    action: 'disable',
    allowedCountries: ['US', 'UK'],
  },
}

// Traffic blending test scenarios
export const testTrafficBlendingScenarios = {
  cdn: {
    method: 'cdn_proxy',
    provider: 'cloudflare',
    domains: ['cdn.example.com'],
  },
  domain_fronting: {
    method: 'domain_fronting',
    frontDomain: 'www.google.com',
    c2Domain: 'c2.example.com',
  },
  dns_tunneling: {
    method: 'dns_tunneling',
    dnsServer: '8.8.8.8',
    domain: 'tunnel.example.com',
  },
}

// Risk assessment test data
export const testRiskAssessments = {
  low: {
    score: 25,
    factors: ['test_environment', 'isolated_network'],
    recommendation: 'proceed',
  },
  medium: {
    score: 50,
    factors: ['production_like', 'limited_scope'],
    recommendation: 'proceed_with_caution',
  },
  high: {
    score: 85,
    factors: ['production', 'critical_systems', 'wide_scope'],
    recommendation: 'require_approval',
  },
}