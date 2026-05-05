/**
 * Core Types for Multi-Agent AI Swarm Architecture
 */

export type AgentType = 
  | 'recon'
  | 'evasion'
  | 'exfiltration'
  | 'persistence'
  | 'orchestrator'
  | 'lateral_movement'
  | 'social_engineering'
  | 'forensics'
  | 'reporting'
  | 'defense_evasion';

export type AgentStatus = 
  | 'initializing'
  | 'idle'
  | 'busy'
  | 'offline'
  | 'degraded'
  | 'error';

export type MessageType = 
  | 'request'
  | 'response'
  | 'notification'
  | 'negotiation'
  | 'command'
  | 'heartbeat'
  | 'error';

export type MessagePriority = 
  | 'critical'
  | 'high'
  | 'normal'
  | 'low';

export type EncryptionType = 
  | 'none'
  | 'aes256'
  | 'chacha20';

export type VotingMechanism = 
  | 'unanimous'
  | 'majority'
  | 'weighted'
  | 'delegated';

export type ConflictResolutionStrategy = 
  | 'priority'
  | 'auction'
  | 'temporal'
  | 'escalation';

/**
 * Agent Capability Definition
 */
export interface AgentCapability {
  name: string;
  description: string;
  category: string;
  requiresAuth: boolean;
  dangerous: boolean;
  resourceCost: number; // 1-100 scale
  successRate: number; // 0-1
  avgExecutionTime: number; // milliseconds
}

/**
 * Agent Identity and Configuration
 */
export interface AgentConfig {
  id: string;
  name: string;
  type: AgentType;
  version: string;
  llmModel: string;
  capabilities: AgentCapability[];
  maxConcurrentTasks: number;
  resourceLimits: {
    maxMemoryMB: number;
    maxCpuPercent: number;
    maxNetworkBandwidth: number;
  };
  securityLevel: 'low' | 'medium' | 'high' | 'critical';
  priority: number; // 1-10, higher = more important
  reasoningConfig?: AgentReasoningConfig;
}

/**
 * Agent Runtime State
 */
export interface AgentState {
  config: AgentConfig;
  status: AgentStatus;
  currentTasks: string[];
  completedTasks: number;
  failedTasks: number;
  averageResponseTime: number;
  lastHeartbeat: Date;
  uptime: number;
  reputation: number; // 0-1, based on performance
  load: number; // 0-1, current resource utilization
}

/**
 * Agent Message Structure
 */
export interface AgentMessage {
  id: string;
  fromAgent: string;
  toAgent: string | string[]; // Single agent, broadcast, or multicast
  messageType: MessageType;
  priority: MessagePriority;
  timestamp: Date;
  ttl?: number; // Time-to-live in milliseconds
  conversationId?: string; // For multi-turn conversations
  payload: {
    type: string;
    data: any;
    metadata?: Record<string, any>;
  };
  signature?: string; // For authentication
  encryption: EncryptionType;
  requiresAck: boolean; // Require acknowledgment
}

/**
 * Message Acknowledgment
 */
export interface MessageAck {
  messageId: string;
  fromAgent: string;
  toAgent: string;
  receivedAt: Date;
  processedAt?: Date;
  status: 'received' | 'processed' | 'failed';
  error?: string;
}

/**
 * Task Definition
 */
export interface SwarmTask {
  id: string;
  operationId: string;
  title: string;
  description: string;
  type: string;
  priority: MessagePriority;
  requiredCapabilities: string[];
  assignedAgent?: string;
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed';
  dependencies: string[];
  estimatedDuration: number;
  actualDuration?: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Operation Definition
 */
export interface SwarmOperation {
  id: string;
  name: string;
  description: string;
  objectives: string[];
  status: 'planning' | 'negotiating' | 'executing' | 'monitoring' | 'completed' | 'failed';
  priority: MessagePriority;
  tasks: SwarmTask[];
  assignedAgents: string[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdBy: string;
  constraints: {
    maxDuration?: number;
    maxResourceUsage?: number;
    allowedAgentTypes?: AgentType[];
    riskTolerance: 'low' | 'medium' | 'high';
  };
  metadata?: Record<string, any>;
}

/**
 * Negotiation Proposal
 */
export interface NegotiationProposal {
  id: string;
  operationId: string;
  proposingAgent: string;
  proposalType: 'resource_allocation' | 'approach_selection' | 'timeline_adjustment';
  proposal: any;
  estimatedCost: number;
  estimatedBenefit: number;
  confidence: number; // 0-1
  timestamp: Date;
  expiresAt: Date;
  status: 'pending' | 'accepted' | 'rejected' | 'countered';
  responses: NegotiationResponse[];
}

/**
 * Negotiation Response
 */
export interface NegotiationResponse {
  id: string;
  proposalId: string;
  respondingAgent: string;
  response: 'accept' | 'reject' | 'counter_propose';
  counterProposal?: any;
  reasoning?: string;
  timestamp: Date;
}

/**
 * Voting Record
 */
export interface VotingRecord {
  id: string;
  subject: string;
  votingMechanism: VotingMechanism;
  initiatedBy: string;
  initiatedAt: Date;
  expiresAt: Date;
  options: {
    id: string;
    description: string;
    votes: number;
    weightedVotes: number;
  }[];
  participants: {
    agentId: string;
    vote: string;
    weight: number;
  }[];
  status: 'ongoing' | 'completed' | 'failed';
  result?: string;
  quorumRequired: number;
  quorumReached: boolean;
}

/**
 * Conflict Resolution Record
 */
export interface ConflictResolution {
  id: string;
  conflictType: string;
  conflictingAgents: string[];
  strategy: ConflictResolutionStrategy;
  initiatedBy: string;
  timestamp: Date;
  resolution: any;
  outcome: 'pending' | 'resolved' | 'escalated' | 'deferred';
  reasoning?: string;
}

/**
 * Swarm Health Metrics
 */
export interface SwarmHealth {
  totalAgents: number;
  activeAgents: number;
  degradedAgents: number;
  offlineAgents: number;
  averageLoad: number;
  messageQueueDepth: number;
  pendingTasks: number;
  inProgressTasks: number;
  failedTasksLastHour: number;
  averageResponseTime: number;
  uptime: number;
}

/**
 * Agent Performance Metrics
 */
export interface AgentPerformance {
  agentId: string;
  tasksCompleted: number;
  tasksFailed: number;
  averageTaskDuration: number;
  successRate: number;
  averageResponseTime: number;
  resourceEfficiency: number;
  collaborationScore: number;
  reputationScore: number;
  lastUpdated: Date;
}

/**
 * Swarm Intelligence Configuration
 */
export interface SwarmIntelligenceConfig {
  learningEnabled: boolean;
  experienceSharingEnabled: boolean;
  patternRecognitionEnabled: boolean;
  knowledgeBaseEnabled: boolean;
  optimizationAlgorithm: 'genetic' | 'ant_colony' | 'particle_swarm' | 'reinforcement';
  learningRate: number; // 0-1
  explorationRate: number; // 0-1
  knowledgeRetentionDays: number;
  reasoningIntegrationEnabled: boolean;
}

/**
 * Security Configuration
 */
export interface SwarmSecurityConfig {
  authenticationRequired: boolean;
  encryptionRequired: boolean;
  mutualTLS: boolean;
  agentIdentityVerification: boolean;
  auditLogging: boolean;
  blockchainAudit: boolean;
  maxMessageAge: number; // milliseconds
  signatureAlgorithm: 'rsa' | 'ecdsa' | 'ed25519';
  keyRotationInterval: number; // milliseconds
}

/**
 * Communication Bus Configuration
 */
export interface CommunicationBusConfig {
  type: 'redis' | 'rabbitmq' | 'memory';
  redis?: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  rabbitmq?: {
    url: string;
    queue: string;
  };
  maxMessageSize: number;
  messageRetention: number; // milliseconds
  heartbeatInterval: number; // milliseconds
  maxRetries: number;
  retryDelay: number; // milliseconds
}

/**
 * Swarm Configuration
 */
export interface SwarmConfig {
  name: string;
  version: string;
  maxAgents: number;
  agentTypes: AgentType[];
  intelligence: SwarmIntelligenceConfig;
  security: SwarmSecurityConfig;
  communication: CommunicationBusConfig;
  resourceLimits: {
    maxTotalMemoryMB: number;
    maxTotalCpuPercent: number;
    maxTotalNetworkBandwidth: number;
  };
  operationDefaults: {
    defaultPriority: MessagePriority;
    defaultTimeout: number;
    maxConcurrentOperations: number;
  };
}

/**
 * Knowledge Base Entry
 */
export interface KnowledgeBaseEntry {
  id: string;
  type: 'technique' | 'pattern' | 'lesson' | 'configuration';
  title: string;
  content: any;
  tags: string[];
  sourceAgent?: string;
  operationId?: string;
  successRate: number;
  usageCount: number;
  lastUsed: Date;
  createdAt: Date;
  confidence: number; // 0-1
}

/**
 * Experience Record
 */
export interface ExperienceRecord {
  id: string;
  agentId: string;
  operationId: string;
  taskType: string;
  approach: string;
  outcome: 'success' | 'failure' | 'partial';
  duration: number;
  resourceUsage: number;
  lessons: string[];
  timestamp: Date;
  confidence: number; // 0-1
  reasoningTraceId?: string;
}

/**
 * Agent Reasoning Configuration
 */
export interface AgentReasoningConfig {
  enableChainOfThought: boolean;
  enableMetaCognition: boolean;
  enableReasoningTraces: boolean;
  enableCollaborativeReasoning: boolean;
  enableReasoningSharing: boolean;
  chainOfThoughtConfig: {
    maxDepth: number;
    maxBranching: number;
    confidenceThreshold: number;
    enableVerification: boolean;
  };
  metaCognitionConfig: {
    enableUncertaintyQuantification: boolean;
    enableKnowledgeGapDetection: boolean;
    enableSelfQuestioning: boolean;
    confidenceThreshold: number;
  };
  reasoningTraceConfig: {
    enableDetailedLogging: boolean;
    enableTraceSharing: boolean;
    retentionHours: number;
  };
}

/**
 * Shared Reasoning Trace
 */
export interface SharedReasoningTrace {
  id: string;
  sourceAgent: string;
  operationId: string;
  taskId: string;
  reasoningType: 'chain_of_thought' | 'meta_cognition' | 'combined';
  content: any;
  confidence: number;
  outcome: 'success' | 'failure' | 'partial';
  timestamp: Date;
  sharedWith: string[];
  usageCount: number;
  effectiveness: number; // 0-1
}

/**
 * Collaborative Reasoning Session
 */
export interface CollaborativeReasoningSession {
  id: string;
  operationId: string;
  initiatingAgent: string;
  participatingAgents: string[];
  objective: string;
  status: 'active' | 'completed' | 'failed';
  reasoningSteps: CollaborativeReasoningStep[];
  consensus: any;
  timestamp: Date;
  completedAt?: Date;
}

/**
 * Collaborative Reasoning Step
 */
export interface CollaborativeReasoningStep {
  id: string;
  sessionId: string;
  agentId: string;
  stepType: 'proposal' | 'evaluation' | 'refinement' | 'consensus';
  content: any;
  confidence: number;
  timestamp: Date;
  responses: CollaborativeReasoningResponse[];
}

/**
 * Collaborative Reasoning Response
 */
export interface CollaborativeReasoningResponse {
  id: string;
  stepId: string;
  fromAgent: string;
  response: 'agree' | 'disagree' | 'propose_alternative';
  reasoning: string;
  confidence: number;
  timestamp: Date;
}

/**
 * Event Types for Swarm
 */
export type SwarmEventType = 
  | 'agent_registered'
  | 'agent_unregistered'
  | 'agent_status_changed'
  | 'message_sent'
  | 'message_received'
  | 'task_created'
  | 'task_assigned'
  | 'task_completed'
  | 'task_failed'
  | 'operation_created'
  | 'operation_started'
  | 'operation_completed'
  | 'operation_failed'
  | 'negotiation_initiated'
  | 'negotiation_completed'
  | 'conflict_detected'
  | 'conflict_resolved'
  | 'voting_initiated'
  | 'voting_completed'
  | 'knowledge_added'
  | 'experience_recorded'
  | 'reasoning_trace_shared'
  | 'collaborative_reasoning_started'
  | 'collaborative_reasoning_completed'
  | 'reasoning_pattern_discovered';

/**
 * Swarm Event
 */
export interface SwarmEvent {
  id: string;
  type: SwarmEventType;
  timestamp: Date;
  source: string;
  data: any;
  metadata?: Record<string, any>;
}