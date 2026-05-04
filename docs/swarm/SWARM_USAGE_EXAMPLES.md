# Multi-Agent AI Swarm - Usage Examples

This guide provides comprehensive examples for using the Multi-Agent AI Swarm Architecture.

## Table of Contents

1. [Basic Setup](#basic-setup)
2. [Creating Custom Agents](#creating-custom-agents)
3. [Executing Operations](#executing-operations)
4. [Agent Communication](#agent-communication)
5. [Negotiation and Voting](#negotiation-and-voting)
6. [Swarm Intelligence](#swarm-intelligence)
7. [Monitoring and Analytics](#monitoring-and-analytics)
8. [Advanced Scenarios](#advanced-scenarios)

## Basic Setup

### Initialize the Swarm

```typescript
import { SwarmManager } from './lib/swarm/swarm-manager';
import { SwarmConfig } from './lib/swarm/types';

const config: SwarmConfig = {
  name: 'Production Swarm',
  version: '1.0.0',
  maxAgents: 50,
  agentTypes: ['recon', 'evasion', 'exfiltration', 'persistence', 'orchestrator'],
  intelligence: {
    learningEnabled: true,
    experienceSharingEnabled: true,
    patternRecognitionEnabled: true,
    knowledgeBaseEnabled: true,
    optimizationAlgorithm: 'genetic',
    learningRate: 0.1,
    explorationRate: 0.2,
    knowledgeRetentionDays: 30,
  },
  security: {
    authenticationRequired: true,
    encryptionRequired: true,
    mutualTLS: true,
    agentIdentityVerification: true,
    auditLogging: true,
    blockchainAudit: false,
    maxMessageAge: 60000,
    signatureAlgorithm: 'ed25519',
    keyRotationInterval: 86400000, // 24 hours
  },
  communication: {
    type: 'redis',
    redis: {
      host: 'localhost',
      port: 6379,
      password: process.env.REDIS_PASSWORD,
      db: 0,
    },
    maxMessageSize: 10485760, // 10MB
    messageRetention: 3600000, // 1 hour
    heartbeatInterval: 10000, // 10 seconds
    maxRetries: 3,
    retryDelay: 1000,
  },
  resourceLimits: {
    maxTotalMemoryMB: 8192,
    maxTotalCpuPercent: 80,
    maxTotalNetworkBandwidth: 10000000, // 10 MB/s
  },
  operationDefaults: {
    defaultPriority: 'normal',
    defaultTimeout: 3600000, // 1 hour
    maxConcurrentOperations: 10,
  },
};

const swarm = new SwarmManager(config);
await swarm.initialize();
```

### Shutdown the Swarm

```typescript
await swarm.shutdown();
```

## Creating Custom Agents

### Extending the Base Agent

```typescript
import { BaseAgent } from './lib/swarm/agents/base-agent';
import { AgentConfig, AgentCapability } from './lib/swarm/types';
import { MessageBus } from './lib/swarm/communication/message-bus';

class CustomAgent extends BaseAgent {
  constructor(config: AgentConfig, messageBus: MessageBus) {
    super(config, messageBus);
  }

  protected async executeTask(task: any): Promise<any> {
    // Implement your custom task logic here
    console.log(`Executing task: ${task.type}`);
    
    // Your implementation
    const result = {
      success: true,
      data: 'Task completed',
    };

    return result;
  }

  protected async evaluateNegotiation(negotiation: any): Promise<any> {
    // Evaluate negotiation proposals
    return {
      accepted: true,
      confidence: 0.9,
      reasoning: 'Proposal aligns with agent capabilities',
    };
  }

  protected async onStartup(): Promise<void> {
    // Initialize agent-specific resources
    console.log('Custom agent starting up');
  }

  protected async onShutdown(): Promise<void> {
    // Cleanup agent-specific resources
    console.log('Custom agent shutting down');
  }
}

// Create agent configuration
const customAgentConfig: AgentConfig = {
  id: 'custom-agent-1',
  name: 'Custom Agent',
  type: 'custom' as any,
  version: '1.0.0',
  llmModel: 'anthropic/claude-3.5-sonnet',
  capabilities: [
    {
      name: 'custom_capability',
      description: 'A custom capability',
      category: 'custom',
      requiresAuth: false,
      dangerous: false,
      resourceCost: 30,
      successRate: 0.9,
      avgExecutionTime: 30000,
    },
  ],
  maxConcurrentTasks: 5,
  resourceLimits: {
    maxMemoryMB: 512,
    maxCpuPercent: 50,
    maxNetworkBandwidth: 1000000,
  },
  securityLevel: 'medium',
  priority: 5,
};

// Register and start the agent
const customAgent = new CustomAgent(customAgentConfig, messageBus);
await customAgent.initialize();
await customAgent.start();
```

## Executing Operations

### Simple Operation

```typescript
// Execute a simple reconnaissance operation
const operationId = await swarm.executeOperation(
  'Target Reconnaissance',
  'Gather intelligence on target.example.com',
  [
    'Perform OSINT on target.example.com',
    'Scan for open ports and services',
    'Identify potential vulnerabilities',
  ],
  'high',
  'operator-1'
);

console.log(`Operation started: ${operationId}`);
```

### Operation with Constraints

```typescript
const operationId = await swarm.executeOperation(
  'Stealthy Exfiltration',
  'Exfiltrate sensitive data covertly',
  [
    'Stage target data',
    'Establish covert DNS channel',
    'Exfiltrate data in chunks',
  ],
  'critical',
  'operator-1',
  {
    maxDuration: 1800000, // 30 minutes
    maxResourceUsage: 60,
    allowedAgentTypes: ['exfiltration', 'evasion'],
    riskTolerance: 'low',
  }
);
```

### Monitor Operation Progress

```typescript
// Check operation status
const operation = swarm.getOperationStatus(operationId);
console.log(`Operation status: ${operation.status}`);
console.log(`Tasks completed: ${operation.tasks.filter(t => t.status === 'completed').length}/${operation.tasks.length}`);

// Get all operations
const allOperations = swarm.getAllOperations();
console.log(`Total operations: ${allOperations.length}`);
```

### Cancel an Operation

```typescript
await swarm.cancelOperation(operationId);
console.log('Operation cancelled');
```

## Agent Communication

### Direct Message

```typescript
import { MessageFactory } from './lib/swarm/communication/message-builder';

// Send a direct message to an agent
const message = MessageFactory.request(
  'sender-agent-id',
  'recon-agent-1',
  'custom_request',
  {
    type: 'osint',
    target: 'example.com',
    options: { depth: 'deep' },
  },
  'high'
);

await messageBus.sendMessage(message);
```

### Broadcast Message

```typescript
// Broadcast to all agents
const broadcast = MessageFactory.broadcast(
  'coordinator',
  'emergency_shutdown',
  { reason: 'Security incident detected' },
  'critical'
);

await messageBus.sendMessage(broadcast);
```

### Message Builder

```typescript
import { MessageBuilder } from './lib/swarm/communication/message-builder';

const message = new MessageBuilder()
  .from('agent-1')
  .to('agent-2')
  .type('request')
  .priority('high')
  .payload('custom_type', { data: 'value' })
  .conversation('conv-123')
  .ttl(60000)
  .requireAck(true)
  .encryption('aes256')
  .build();

await messageBus.sendMessage(message);
```

## Negotiation and Voting

### Initiate Negotiation

```typescript
const negotiationId = await swarm.negotiationEngine.initiateNegotiation(
  'operation-123',
  'recon-agent-1',
  'resource_allocation',
  {
    additionalLoad: 0.3,
    duration: 300000,
  },
  ['evasion-agent-1', 'exfil-agent-1']
);

console.log(`Negotiation initiated: ${negotiationId}`);
```

### Initiate Voting

```typescript
const votingId = await swarm.negotiationEngine.initiateVoting(
  'Select approach for operation',
  'coordinator',
  [
    { id: 'stealth', description: 'Maximum stealth approach' },
    { id: 'speed', description: 'Fast execution approach' },
    { id: 'balanced', description: 'Balanced approach' },
  ],
  ['recon-agent-1', 'evasion-agent-1', 'exfil-agent-1'],
  'majority',
  0.67 // 67% quorum required
);

console.log(`Voting initiated: ${votingId}`);
```

### Resolve Conflict

```typescript
const resolutionId = await swarm.negotiationEngine.resolveConflict(
  'resource_contention',
  ['agent-1', 'agent-2'],
  'priority',
  'coordinator'
);

console.log(`Conflict resolution initiated: ${resolutionId}`);
```

## Swarm Intelligence

### Add Knowledge

```typescript
const knowledgeId = await swarm.addKnowledge({
  type: 'technique',
  title: 'Successful DNS Exfiltration',
  content: {
    technique: 'dns_tunneling',
    configuration: {
      subdomain: 'exfil.example.com',
      encoding: 'base32',
      packetSize: 255,
    },
    successMetrics: {
      detectionRate: 0.05,
      bandwidthEfficiency: 0.8,
    },
  },
  tags: ['exfiltration', 'dns', 'stealth'],
  sourceAgent: 'exfil-agent-1',
  operationId: 'operation-123',
  successRate: 0.95,
  usageCount: 0,
  lastUsed: new Date(),
  confidence: 0.9,
});

console.log(`Knowledge added: ${knowledgeId}`);
```

### Query Knowledge Base

```typescript
const results = await swarm.queryKnowledge(
  'DNS exfiltration',
  'technique',
  ['exfiltration', 'stealth']
);

console.log(`Found ${results.length} knowledge entries`);
results.forEach(entry => {
  console.log(`- ${entry.title} (confidence: ${entry.confidence})`);
});
```

### Record Experience

```typescript
const experienceId = await swarm.intelligence.recordExperience({
  agentId: 'recon-agent-1',
  operationId: 'operation-123',
  taskType: 'osint',
  approach: 'aggressive_scanning',
  outcome: 'success',
  duration: 45000,
  resourceUsage: 0.6,
  lessons: [
    'Aggressive scanning increases detection risk',
    'Rate limiting is essential for stealth',
  ],
  confidence: 0.85,
});

console.log(`Experience recorded: ${experienceId}`);
```

### Genetic Optimization

```typescript
const bestConfig = await swarm.intelligence.optimizeGenetic(
  (config) => {
    // Fitness function - higher is better
    const stealth = config.stealthLevel || 0.5;
    const speed = config.speedLevel || 0.5;
    return stealth * 0.7 + speed * 0.3;
  },
  [
    { stealthLevel: 0.5, speedLevel: 0.5 },
    { stealthLevel: 0.7, speedLevel: 0.3 },
    { stealthLevel: 0.3, speedLevel: 0.7 },
  ],
  50, // generations
  0.1, // mutation rate
  0.7 // crossover rate
);

console.log(`Optimal configuration:`, bestConfig);
```

## Monitoring and Analytics

### Get Swarm Health

```typescript
const health = swarm.getSwarmHealth();
console.log(`Total agents: ${health.totalAgents}`);
console.log(`Active agents: ${health.activeAgents}`);
console.log(`Average load: ${health.averageLoad}`);
console.log(`Pending tasks: ${health.pendingTasks}`);
```

### Monitor Agent Performance

```typescript
const agents = swarm.registry.getAllAgents();
agents.forEach(agent => {
  console.log(`Agent: ${agent.config.name}`);
  console.log(`  Status: ${agent.status}`);
  console.log(`  Load: ${agent.load}`);
  console.log(`  Reputation: ${agent.reputation}`);
  console.log(`  Completed tasks: ${agent.completedTasks}`);
  console.log(`  Failed tasks: ${agent.failedTasks}`);
});
```

### Subscribe to Events

```typescript
swarm.coordinator.on('swarm_event', (event) => {
  console.log(`Event: ${event.type}`, event.data);
  
  switch (event.type) {
    case 'operation_created':
      console.log(`New operation: ${event.data.operation.id}`);
      break;
    case 'task_completed':
      console.log(`Task completed: ${event.data.taskId}`);
      break;
    case 'agent_registered':
      console.log(`Agent registered: ${event.data.agentId}`);
      break;
  }
});
```

## Advanced Scenarios

### Multi-Phase Operation

```typescript
// Phase 1: Reconnaissance
const reconOpId = await swarm.executeOperation(
  'Phase 1: Reconnaissance',
  'Gather initial intelligence',
  ['OSINT', 'Network scanning', 'Vulnerability assessment'],
  'high',
  'operator-1'
);

// Wait for completion
let reconOp = swarm.getOperationStatus(reconOpId);
while (reconOp.status === 'executing') {
  await new Promise(resolve => setTimeout(resolve, 5000));
  reconOp = swarm.getOperationStatus(reconOpId);
}

// Phase 2: Evasion
const evasionOpId = await swarm.executeOperation(
  'Phase 2: Evasion',
  'Deploy evasion techniques',
  ['Technique selection', 'Traffic mimicry', 'Anti-EDR'],
  'high',
  'operator-1'
);

// Phase 3: Exfiltration
const exfilOpId = await swarm.executeOperation(
  'Phase 3: Exfiltration',
  'Exfiltrate data',
  ['Data staging', 'Covert channel', 'Data encryption'],
  'critical',
  'operator-1'
);
```

### Adaptive Operation

```typescript
const operationId = await swarm.executeOperation(
  'Adaptive Operation',
  'Operation with adaptive strategy',
  ['Initial objective'],
  'normal',
  'operator-1'
);

// Monitor and adapt
setInterval(async () => {
  const operation = swarm.getOperationStatus(operationId);
  const health = swarm.getSwarmHealth();
  
  // If load is high, add more agents
  if (health.averageLoad > 0.8) {
    console.log('High load detected, scaling agents');
    // Add more agents as needed
  }
  
  // If tasks are failing, adjust strategy
  const failedTasks = operation.tasks.filter(t => t.status === 'failed');
  if (failedTasks.length > 0) {
    console.log('Tasks failing, adjusting strategy');
    // Adjust operation strategy
  }
}, 30000);
```

### Swarm Learning Loop

```typescript
// Enable continuous learning
setInterval(async () => {
  // Get recent experiences
  const recentExperiences = await swarm.intelligence.getAgentExperiences('recon-agent-1');
  
  // Analyze patterns
  const patterns = await swarm.intelligence.detectPatterns(recentExperiences);
  
  // Update knowledge base
  for (const pattern of patterns) {
    if (pattern.confidence > 0.8) {
      await swarm.addKnowledge({
        type: 'pattern',
        title: `Detected pattern: ${pattern.pattern.type}`,
        content: pattern.pattern,
        tags: ['learned', 'pattern'],
        confidence: pattern.confidence,
        successRate: pattern.frequency,
        usageCount: 0,
      });
    }
  }
}, 3600000); // Every hour
```

## Error Handling

```typescript
try {
  const operationId = await swarm.executeOperation(
    'Test Operation',
    'Test description',
    ['Test objective'],
    'normal',
    'operator-1'
  );
} catch (error) {
  console.error('Operation failed:', error);
  
  // Handle specific errors
  if (error.message.includes('Swarm not initialized')) {
    console.error('Please initialize the swarm first');
  } else if (error.message.includes('No agent available')) {
    console.error('No agents available for this operation');
  }
}
```

## Best Practices

1. **Always initialize the swarm before use**
2. **Monitor swarm health regularly**
3. **Use appropriate priority levels for operations**
4. **Set realistic constraints on operations**
5. **Handle errors gracefully**
6. **Shutdown the swarm properly when done**
7. **Keep agent capabilities focused and specific**
8. **Use negotiation for resource allocation**
9. **Leverage swarm intelligence for optimization**
10. **Monitor and learn from operation outcomes**

## Troubleshooting

### Swarm won't initialize

- Check Redis connection
- Verify configuration
- Check logs for specific errors

### Agents not responding

- Check agent status in registry
- Verify message bus is working
- Check agent health and heartbeat

### Operations failing

- Check if required agents are available
- Verify operation constraints
- Review task dependencies
- Check agent capabilities

### Performance issues

- Monitor resource usage
- Check agent load balancing
- Review message queue depth
- Consider scaling agents

## API Reference

See the individual module documentation for detailed API references:
- [SwarmManager](./lib/swarm/swarm-manager.ts)
- [AgentRegistry](./lib/swarm/agent-registry.ts)
- [SwarmCoordinator](./lib/swarm/orchestration/swarm-coordinator.ts)
- [NegotiationEngine](./lib/swarm/orchestration/negotiation-engine.ts)
- [SwarmIntelligence](./lib/swarm/intelligence/swarm-intelligence.ts)
- [MessageBus](./lib/swarm/communication/message-bus.ts)
- [BaseAgent](./lib/swarm/agents/base-agent.ts)