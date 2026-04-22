#!/usr/bin/env node

// Database Schema Validation Test
const { z } = require('zod');

// Note: Testing core schemas from schema.ts file
// AgentTask and AiConversation are in separate type files

console.log('🧪 Testing Database Schemas...\n');

// Test ClientUser schema
try {
  const testUser = {
    id: 'test-user-123',
    displayName: 'Test User',
    authToken: 'secure-token-12345678',
    status: 'active',
    quotaBytes: 1073741824, // 1GB
    usedBytes: 0,
    expiresAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    notes: 'Test user for validation'
  };
  
  ClientUser.parse(testUser);
  console.log('✅ ClientUser schema validation: PASSED');
} catch (error) {
  console.log('❌ ClientUser schema validation: FAILED -', error.message);
}

// Test Node schema
try {
  const testNode = {
    id: 'node-123',
    name: 'Test Node',
    hostname: 'test.example.com',
    region: 'US-East',
    listenAddr: ':443',
    status: 'running',
    tags: ['production', 'us-east'],
    provider: 'digitalocean',
    lastHeartbeatAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  Node.parse(testNode);
  console.log('✅ Node schema validation: PASSED');
} catch (error) {
  console.log('❌ Node schema validation: FAILED -', error.message);
}

// Test ServerConfig schema
try {
  const testConfig = {
    listen: ':443',
    tls: {
      mode: 'acme',
      domains: ['proxy.example.com'],
      email: 'admin@example.com'
    },
    obfs: {
      type: 'salamander',
      password: 'secure-obfs-password'
    },
    bandwidth: {
      up: '100 Mbps',
      down: '500 Mbps'
    },
    masquerade: {
      type: 'proxy',
      proxy: {
        url: 'https://example.com',
        rewriteHost: true
      }
    },
    trafficStats: {
      listen: ':25000',
      secret: 'secure-traffic-secret-16chars'
    },
    authBackendUrl: 'https://panel.example.com/api/hysteria/auth',
    authBackendInsecure: false,
    updatedAt: Date.now()
  };
  
  ServerConfig.parse(testConfig);
  console.log('✅ ServerConfig schema validation: PASSED');
} catch (error) {
  console.log('❌ ServerConfig schema validation: FAILED -', error.message);
}

// Test UsageRecord schema
try {
  const testUsage = {
    userId: 'user-123',
    nodeId: 'node-456',
    tx: 1048576, // 1MB
    rx: 2097152, // 2MB
    capturedAt: Date.now()
  };
  
  UsageRecord.parse(testUsage);
  console.log('✅ UsageRecord schema validation: PASSED');
} catch (error) {
  console.log('❌ UsageRecord schema validation: FAILED -', error.message);
}

// Test AgentTask schema
try {
  const testTask = {
    id: 'task-789',
    status: 'queued',
    prompt: 'Test task prompt',
    model: 'gpt-4',
    allowedTools: ['web-search', 'file-read'],
    maxSteps: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: null,
    createdBy: 'admin-user',
    result: null,
    error: null,
    stepCount: 0
  };
  
  AgentTask.parse(testTask);
  console.log('✅ AgentTask schema validation: PASSED');
} catch (error) {
  console.log('❌ AgentTask schema validation: FAILED -', error.message);
}

// Test AiConversation schema
try {
  const testConversation = {
    id: 'conv-456',
    title: 'Test Conversation',
    messages: [
      {
        role: 'user',
        content: 'Hello, AI assistant',
        timestamp: Date.now()
      },
      {
        role: 'assistant',
        content: 'Hello! How can I help you today?',
        timestamp: Date.now()
      }
    ],
    createdBy: 'user-123',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  AiConversation.parse(testConversation);
  console.log('✅ AiConversation schema validation: PASSED');
} catch (error) {
  console.log('❌ AiConversation schema validation: FAILED -', error.message);
}

console.log('\n🎯 Database schema validation tests completed!');