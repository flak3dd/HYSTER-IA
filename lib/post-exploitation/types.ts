// Core types for Post-Exploitation Module

export type CredentialType = 'NTLM' | 'Kerberos' | 'Plaintext' | 'Hash' | 'Ticket';
export type PrivilegeLevel = 'user' | 'admin' | 'system' | 'domain_admin';
export type MovementTechnique = 'smb' | 'winrm' | 'wmi' | 'pth' | 'kerberoast' | 'rdp' | 'psexec';
export type SessionStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface Credential {
  id: string;
  type: CredentialType;
  username: string;
  password?: string; // encrypted
  hash?: string;
  domain?: string;
  sourceHostId?: string;
  createdAt: Date;
}

export interface CompromisedHost {
  id: string;
  hostname: string;
  ipAddress: string;
  os?: string;
  domain?: string;
  privileges: PrivilegeLevel;
  implantId?: string;
  firstCompromised: Date;
  lastSeen: Date;
  credentials: Credential[];
}

export interface PivotPath {
  id: string;
  fromHostId: string;
  toHostId: string;
  technique: MovementTechnique;
  success: boolean;
  timestamp: Date;
}

export interface LateralMovementSession {
  id: string;
  workflowSessionId?: string;
  targetDomain?: string;
  status: SessionStatus;
  discoveredHosts: number;
  compromisedHosts: number;
  credentialsFound: number;
  startTime: Date;
  endTime?: Date;
  summary?: Record<string, any>;
}

export interface MovementTechniqueConfig {
  technique: MovementTechnique;
  dangerous: boolean;
  opsecScore: number; // 0-100, higher = better OPSEC
  requiresAuth: boolean;
  fileless: boolean;
  description: string;
  mitreAttack?: string;
}

export interface AttackPathNode {
  hostId: string;
  hostname: string;
  ipAddress: string;
  privileges: PrivilegeLevel;
  credentials: Credential[];
}

export interface AttackPathEdge {
  fromHostId: string;
  toHostId: string;
  technique: MovementTechnique;
  confidence: number; // 0-1
  estimatedTime: number; // seconds
}

export interface AttackPath {
  nodes: AttackPathNode[];
  edges: AttackPathEdge[];
  totalRisk: number;
  estimatedTime: number;
  pathToPrivilege: string[]; // host IDs in order
}

export interface LateralMovementRequest {
  sourceHostId: string;
  targetHostId: string;
  technique: MovementTechnique;
  credentialId?: string;
  proxyConfig?: {
    socksProxyUrl?: string;
    httpProxyUrl?: string;
  };
  options?: Record<string, any>;
}

export interface LateralMovementResult {
  success: boolean;
  technique: MovementTechnique;
  sourceHostId: string;
  targetHostId: string;
  error?: string;
  executionTime: number;
  pivotPathId?: string;
}

export interface CredentialHarvestRequest {
  hostId: string;
  methods: string[]; // lsass, registry, cached, etc.
  implantId?: string;
}

export interface CredentialHarvestResult {
  success: boolean;
  hostId: string;
  credentials: Credential[];
  method: string;
  error?: string;
}

export interface PathfinderConfig {
  maxDepth: number;
  maxPaths: number;
  minConfidence: number;
  preferFileless: boolean;
  avoidDangerous: boolean;
}

export interface SwarmAgentConfig {
  agentId: string;
  name: string;
  type: string;
  capabilities: string[];
  maxConcurrentTasks: number;
  securityLevel: string;
}