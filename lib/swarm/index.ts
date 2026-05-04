/**
 * Multi-Agent AI Swarm Architecture
 * Main export file for all swarm components
 */

// Core types
export * from './types';

// Communication
export { MessageBus } from './communication/message-bus';
export { MessageBuilder, MessageFactory } from './communication/message-builder';

// Agent Registry
export { AgentRegistry } from './agent-registry';

// Agents
export { BaseAgent } from './agents/base-agent';
export { ReconAgent } from './agents/recon-agent';
export { EvasionAgent } from './agents/evasion-agent';
export { ExfiltrationAgent } from './agents/exfiltration-agent';
export { PersistenceAgent } from './agents/persistence-agent';

// Orchestration
export { SwarmCoordinator } from './orchestration/swarm-coordinator';
export { NegotiationEngine } from './orchestration/negotiation-engine';

// Intelligence
export { SwarmIntelligence } from './intelligence/swarm-intelligence';

// Main Manager
export { SwarmManager } from './swarm-manager';