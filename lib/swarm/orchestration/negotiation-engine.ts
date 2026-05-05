/**
 * Negotiation Engine
 * Handles agent-to-agent negotiation for resource allocation, approach selection, and conflict resolution
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { 
  NegotiationProposal, 
  NegotiationResponse,
  VotingRecord,
  ConflictResolution,
  VotingMechanism,
  ConflictResolutionStrategy 
} from '../types';
import { AgentRegistry } from '../agent-registry';
import { MessageBus } from '../communication/message-bus';
import { MessageFactory } from '../communication/message-builder';
import logger from '../../logger';
import { cotEngine } from '../../ai/reasoning/chain-of-thought';
import { metaCognitionEngine } from '../../ai/reasoning/meta-cognition';

export class NegotiationEngine extends EventEmitter {
  private registry: AgentRegistry;
  private messageBus: MessageBus;
  private activeNegotiations: Map<string, NegotiationProposal>;
  private activeVotings: Map<string, VotingRecord>;
  private conflictResolutions: Map<string, ConflictResolution>;
  private negotiationTimeout: number;
  private enableReasoning: boolean;

  constructor(registry: AgentRegistry, messageBus: MessageBus, negotiationTimeout: number = 60000, enableReasoning: boolean = true) {
    super();
    this.registry = registry;
    this.messageBus = messageBus;
    this.activeNegotiations = new Map();
    this.activeVotings = new Map();
    this.conflictResolutions = new Map();
    this.negotiationTimeout = negotiationTimeout;
    this.enableReasoning = enableReasoning;
  }

  /**
   * Initialize the negotiation engine
   */
  async initialize(): Promise<void> {
    // Register message handler
    this.messageBus.registerHandler('negotiation', this.handleMessage.bind(this));
    
    logger.info('Negotiation engine initialized');
  }

  /**
   * Initiate a negotiation
   */
  async initiateNegotiation(
    operationId: string,
    proposingAgent: string,
    proposalType: 'resource_allocation' | 'approach_selection' | 'timeline_adjustment',
    proposal: any,
    targetAgents: string[]
  ): Promise<string> {
    const negotiationId = uuidv4();
    
    // Use reasoning to estimate confidence if enabled
    let confidence = 0.8;
    if (this.enableReasoning) {
      confidence = await this.estimateProposalConfidence(proposal, proposalType, targetAgents);
    }
    
    const negotiation: NegotiationProposal = {
      id: negotiationId,
      operationId,
      proposingAgent,
      proposalType,
      proposal,
      estimatedCost: this.estimateCost(proposal),
      estimatedBenefit: this.estimateBenefit(proposal),
      confidence,
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + this.negotiationTimeout),
      status: 'pending',
      responses: [],
    };

    this.activeNegotiations.set(negotiationId, negotiation);

    // Send negotiation to target agents
    for (const agentId of targetAgents) {
      const message = MessageFactory.negotiation(
        'negotiation',
        agentId,
        'negotiation_request',
        negotiation,
        negotiationId
      );
      await this.messageBus.sendMessage(message);
    }

    logger.info(`Negotiation ${negotiationId} initiated by ${proposingAgent} with confidence ${confidence}`);
    
    // Set timeout for negotiation
    setTimeout(() => {
      this.handleNegotiationTimeout(negotiationId);
    }, this.negotiationTimeout);

    return negotiationId;
  }

  /**
   * Handle negotiation response
   */
  async handleNegotiationResponse(negotiationId: string, response: NegotiationResponse): Promise<void> {
    const negotiation = this.activeNegotiations.get(negotiationId);
    if (!negotiation) {
      logger.warn(`Negotiation ${negotiationId} not found`);
      return;
    }

    negotiation.responses.push(response);

    // Check if all agents have responded
    const targetAgents = this.determineTargetAgents(negotiation);
    if (negotiation.responses.length >= targetAgents.length) {
      await this.concludeNegotiation(negotiationId);
    }
  }

  /**
   * Conclude negotiation
   */
  private async concludeNegotiation(negotiationId: string): Promise<void> {
    const negotiation = this.activeNegotiations.get(negotiationId);
    if (!negotiation) {
      return;
    }

    // Use reasoning for decision making if enabled
    if (this.enableReasoning) {
      await this.reasoningBasedConclusion(negotiation);
    } else {
      // Standard conclusion logic
      const acceptCount = negotiation.responses.filter(r => r.response === 'accept').length;
      const totalCount = negotiation.responses.length;

      if (acceptCount === totalCount) {
        negotiation.status = 'accepted';
        logger.info(`Negotiation ${negotiationId} accepted unanimously`);
      } else if (acceptCount > totalCount / 2) {
        negotiation.status = 'accepted';
        logger.info(`Negotiation ${negotiationId} accepted by majority`);
      } else {
        negotiation.status = 'rejected';
        logger.info(`Negotiation ${negotiationId} rejected`);
      }
    }

    this.emit('negotiation_completed', { negotiation });
    
    // Remove from active negotiations
    this.activeNegotiations.delete(negotiationId);
  }

  /**
   * Handle negotiation timeout
   */
  private handleNegotiationTimeout(negotiationId: string): void {
    const negotiation = this.activeNegotiations.get(negotiationId);
    if (negotiation && negotiation.status === 'pending') {
      negotiation.status = 'rejected';
      logger.warn(`Negotiation ${negotiationId} timed out`);
      this.emit('negotiation_completed', { negotiation });
      this.activeNegotiations.delete(negotiationId);
    }
  }

  /**
   * Initiate a voting process
   */
  async initiateVoting(
    subject: string,
    initiatedBy: string,
    options: { id: string; description: string }[],
    participants: string[],
    mechanism: VotingMechanism = 'majority',
    quorumRequired: number = 0.5
  ): Promise<string> {
    const votingId = uuidv4();

    const voting: VotingRecord = {
      id: votingId,
      subject,
      votingMechanism: mechanism,
      initiatedBy,
      initiatedAt: new Date(),
      expiresAt: new Date(Date.now() + this.negotiationTimeout),
      options: options.map(opt => ({ ...opt, votes: 0, weightedVotes: 0 })),
      participants: [],
      status: 'ongoing',
      quorumRequired: Math.ceil(participants.length * quorumRequired),
      quorumReached: false,
    };

    this.activeVotings.set(votingId, voting);

    // Send voting request to participants
    for (const participantId of participants) {
      const message = MessageFactory.request(
        'negotiation',
        participantId,
        'voting_request',
        {
          votingId,
          subject,
          options,
          mechanism,
        },
        'high'
      );
      await this.messageBus.sendMessage(message);
    }

    logger.info(`Voting ${votingId} initiated for ${subject}`);

    // Set timeout
    setTimeout(() => {
      this.handleVotingTimeout(votingId);
    }, this.negotiationTimeout);

    return votingId;
  }

  /**
   * Handle voting response
   */
  async handleVotingResponse(votingId: string, participantId: string, vote: string, weight: number = 1): Promise<void> {
    const voting = this.activeVotings.get(votingId);
    if (!voting) {
      logger.warn(`Voting ${votingId} not found`);
      return;
    }

    // Record vote
    voting.participants.push({
      agentId: participantId,
      vote,
      weight,
    });

    // Update option vote counts
    const option = voting.options.find(opt => opt.id === vote);
    if (option) {
      option.votes++;
      option.weightedVotes += weight;
    }

    // Check quorum
    if (voting.participants.length >= voting.quorumRequired) {
      voting.quorumReached = true;
    }

    // Check if all participants have voted
    const totalParticipants = this.determineVotingParticipants(votingId);
    if (voting.participants.length >= totalParticipants.length) {
      await this.concludeVoting(votingId);
    }
  }

  /**
   * Conclude voting
   */
  private async concludeVoting(votingId: string): Promise<void> {
    const voting = this.activeVotings.get(votingId);
    if (!voting) {
      return;
    }

    // Determine result based on mechanism
    switch (voting.votingMechanism) {
      case 'unanimous':
        const unanimousOption = voting.options.find(opt => opt.votes === voting.participants.length);
        voting.result = unanimousOption?.id;
        break;

      case 'majority':
        const majorityOption = [...voting.options].sort((a, b) => b.votes - a.votes)[0];
        voting.result = majorityOption?.id;
        break;

      case 'weighted':
        const weightedOption = [...voting.options].sort((a, b) => b.weightedVotes - a.weightedVotes)[0];
        voting.result = weightedOption?.id;
        break;

      case 'delegated':
        // Would handle delegated voting
        voting.result = voting.options[0]?.id;
        break;
    }

    voting.status = voting.quorumReached ? 'completed' : 'failed';
    
    logger.info(`Voting ${votingId} concluded with result: ${voting.result}`);
    this.emit('voting_completed', { voting });

    this.activeVotings.delete(votingId);
  }

  /**
   * Handle voting timeout
   */
  private handleVotingTimeout(votingId: string): void {
    const voting = this.activeVotings.get(votingId);
    if (voting && voting.status === 'ongoing') {
      voting.status = voting.quorumReached ? 'completed' : 'failed';
      logger.warn(`Voting ${votingId} timed out`);
      this.emit('voting_completed', { voting });
      this.activeVotings.delete(votingId);
    }
  }

  /**
   * Resolve conflict
   */
  async resolveConflict(
    conflictType: string,
    conflictingAgents: string[],
    strategy: ConflictResolutionStrategy,
    initiatedBy: string
  ): Promise<string> {
    const resolutionId = uuidv4();

    const resolution: ConflictResolution = {
      id: resolutionId,
      conflictType,
      conflictingAgents,
      strategy,
      initiatedBy,
      timestamp: new Date(),
      resolution: null,
      outcome: 'pending',
      reasoning: undefined,
    };

    this.conflictResolutions.set(resolutionId, resolution);

    // Apply resolution strategy
    switch (strategy) {
      case 'priority':
        resolution.resolution = await this.resolveByPriority(conflictingAgents);
        break;

      case 'auction':
        resolution.resolution = await this.resolveByAuction(conflictingAgents, conflictType);
        break;

      case 'temporal':
        resolution.resolution = await this.resolveByTemporal(conflictingAgents);
        break;

      case 'escalation':
        resolution.resolution = await this.resolveByEscalation(conflictingAgents, conflictType);
        break;
    }

    resolution.outcome = 'resolved';
    resolution.reasoning = `Resolved using ${strategy} strategy`;

    logger.info(`Conflict ${resolutionId} resolved using ${strategy} strategy`);
    this.emit('conflict_resolved', { resolution });

    this.conflictResolutions.delete(resolutionId);

    return resolutionId;
  }

  /**
   * Resolve by priority
   */
  private async resolveByPriority(agents: string[]): Promise<any> {
    const agentStates = agents.map(id => this.registry.getAgent(id)).filter(Boolean);
    
    // Sort by priority (higher is better)
    agentStates.sort((a, b) => b!.config.priority - a!.config.priority);

    return {
      winningAgent: agentStates[0]?.config.id,
      reasoning: 'Highest priority agent selected',
    };
  }

  /**
   * Resolve by auction
   */
  private async resolveByAuction(agents: string[], conflictType: string): Promise<any> {
    // Agents bid with resource cost they're willing to pay
    const bids = await this.collectBids(agents, conflictType);
    
    // Select lowest bid (most efficient)
    const winningBid = [...bids].sort((a, b) => a.cost - b.cost)[0];

    return {
      winningAgent: winningBid.agentId,
      cost: winningBid.cost,
      reasoning: 'Lowest cost bid selected',
    };
  }

  /**
   * Resolve by temporal separation
   */
  private async resolveByTemporal(agents: string[]): Promise<any> {
    // Assign time slots to each agent
    const timeSlots = agents.map((agentId, index) => ({
      agentId,
      startTime: Date.now() + (index * 60000), // 1 minute intervals
      endTime: Date.now() + ((index + 1) * 60000),
    }));

    return {
      schedule: timeSlots,
      reasoning: 'Temporal separation applied',
    };
  }

  /**
   * Resolve by escalation
   */
  private async resolveByEscalation(agents: string[], conflictType: string): Promise<any> {
    // Escalate to human operator
    this.emit('escalation_required', {
      conflictType,
      conflictingAgents: agents,
      timestamp: new Date(),
    });

    return {
      outcome: 'escalated',
      reasoning: 'Escalated to human operator',
    };
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(message: any): Promise<void> {
    const { payload } = message;

    switch (payload.type) {
      case 'negotiation_response':
        await this.handleNegotiationResponse(payload.data.negotiationId, payload.data);
        break;

      case 'voting_response':
        await this.handleVotingResponse(
          payload.data.votingId,
          message.fromAgent,
          payload.data.vote,
          payload.data.weight
        );
        break;

      default:
        logger.warn(`Unknown message type: ${payload.type}`);
    }
  }

  // Helper methods

  /**
   * Estimate proposal confidence using meta-cognition
   */
  private async estimateProposalConfidence(
    proposal: any,
    proposalType: string,
    targetAgents: string[]
  ): Promise<number> {
    try {
      const assessment = await metaCognitionEngine.assessUncertainty(
        JSON.stringify({
          proposal,
          proposalType,
          targetAgents,
          targetAgentCount: targetAgents.length,
        }),
        { context: 'proposal_evaluation' }
      );

      return assessment.confidence;
    } catch (error) {
      logger.error({ err: error }, 'Error estimating proposal confidence, using default');
      return 0.8;
    }
  }

  /**
   * Reasoning-based negotiation conclusion
   */
  private async reasoningBasedConclusion(negotiation: NegotiationProposal): Promise<void> {
    try {
      // Use chain-of-thought to analyze responses and make decision
      const cotResult = await cotEngine.reason(
        JSON.stringify({
          proposal: negotiation.proposal,
          proposalType: negotiation.proposalType,
          responses: negotiation.responses,
          estimatedCost: negotiation.estimatedCost,
          estimatedBenefit: negotiation.estimatedBenefit,
          initialConfidence: negotiation.confidence,
        }),
        { context: 'negotiation_conclusion', negotiationId: negotiation.id },
        this.getNegotiationTools()
      );

      // Extract decision from reasoning
      const decision = this.extractDecisionFromReasoning(cotResult);
      negotiation.status = decision;

      logger.info(`Negotiation ${negotiation.id} concluded with reasoning-based decision: ${decision}`);
    } catch (error) {
      logger.error({ err: error }, 'Reasoning-based conclusion failed, falling back to standard logic');
      
      // Fallback to standard logic
      const acceptCount = negotiation.responses.filter(r => r.response === 'accept').length;
      const totalCount = negotiation.responses.length;

      if (acceptCount === totalCount) {
        negotiation.status = 'accepted';
      } else if (acceptCount > totalCount / 2) {
        negotiation.status = 'accepted';
      } else {
        negotiation.status = 'rejected';
      }
    }
  }

  /**
   * Extract decision from chain-of-thought reasoning
   */
  private extractDecisionFromReasoning(cotResult: any): 'accepted' | 'rejected' {
    const reasoningText = cotResult.finalAnswer.toLowerCase();
    
    if (reasoningText.includes('accept') || reasoningText.includes('approve') || reasoningText.includes('agree')) {
      return 'accepted';
    } else if (reasoningText.includes('reject') || reasoningText.includes('deny') || reasoningText.includes('disagree')) {
      return 'rejected';
    }
    
    // Default to accept if unclear
    return 'accepted';
  }

  /**
   * Get negotiation tools for chain-of-thought reasoning
   */
  private getNegotiationTools(): any[] {
    return [
      {
        name: 'analyze_responses',
        description: 'Analyze negotiation responses from agents',
        input_schema: { type: 'object' },
      },
      {
        name: 'evaluate_cost_benefit',
        description: 'Evaluate cost vs benefit of proposal',
        input_schema: { type: 'object' },
      },
      {
        name: 'assess_agent_reputation',
        description: 'Assess reputation of responding agents',
        input_schema: { type: 'object' },
      },
    ];
  }

  private determineTargetAgents(negotiation: NegotiationProposal): string[] {
    // Would determine target agents based on operation and proposal type
    return [];
  }

  private determineVotingParticipants(votingId: string): string[] {
    // Would determine voting participants
    return [];
  }

  private async collectBids(agents: string[], conflictType: string): Promise<any[]> {
    // Would collect bids from agents
    return agents.map(agentId => ({ agentId, cost: Math.random() * 100 }));
  }

  private estimateCost(proposal: any): number {
    // Would estimate cost of proposal
    return 50;
  }

  private estimateBenefit(proposal: any): number {
    // Would estimate benefit of proposal
    return 80;
  }

  /**
   * Get active negotiations
   */
  getActiveNegotiations(): NegotiationProposal[] {
    return Array.from(this.activeNegotiations.values());
  }

  /**
   * Get active votings
   */
  getActiveVotings(): VotingRecord[] {
    return Array.from(this.activeVotings.values());
  }

  /**
   * Shutdown
   */
  async shutdown(): Promise<void> {
    this.activeNegotiations.clear();
    this.activeVotings.clear();
    this.conflictResolutions.clear();
    this.messageBus.unregisterHandler('negotiation');
    
    logger.info('Negotiation engine shut down');
  }
}