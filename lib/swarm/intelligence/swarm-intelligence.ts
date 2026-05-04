/**
 * Swarm Intelligence Module
 * Implements collective learning, pattern recognition, and optimization algorithms
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { 
  SwarmIntelligenceConfig, 
  KnowledgeBaseEntry, 
  ExperienceRecord,
  AgentPerformance 
} from '../types';
import { logger } from '../../logger';

export class SwarmIntelligence extends EventEmitter {
  private config: SwarmIntelligenceConfig;
  private knowledgeBase: Map<string, KnowledgeBaseEntry>;
  private experienceRecords: Map<string, ExperienceRecord[]>;
  private performanceHistory: Map<string, AgentPerformance[]>;
  private patterns: Map<string, any>;
  private isRunning: boolean;

  constructor(config: SwarmIntelligenceConfig) {
    super();
    this.config = config;
    this.knowledgeBase = new Map();
    this.experienceRecords = new Map();
    this.performanceHistory = new Map();
    this.patterns = new Map();
    this.isRunning = false;
  }

  /**
   * Initialize swarm intelligence
   */
  async initialize(): Promise<void> {
    logger.info('Swarm intelligence initializing');

    if (this.config.knowledgeBaseEnabled) {
      await this.loadKnowledgeBase();
    }

    if (this.config.patternRecognitionEnabled) {
      await this.initializePatternRecognition();
    }

    this.isRunning = true;
    
    // Start periodic learning
    if (this.config.learningEnabled) {
      this.startLearningLoop();
    }

    logger.info('Swarm intelligence initialized');
  }

  /**
   * Add knowledge to the knowledge base
   */
  async addKnowledge(entry: Omit<KnowledgeBaseEntry, 'id' | 'createdAt'>): Promise<string> {
    const knowledgeEntry: KnowledgeBaseEntry = {
      ...entry,
      id: uuidv4(),
      createdAt: new Date(),
    };

    this.knowledgeBase.set(knowledgeEntry.id, knowledgeEntry);

    if (this.config.learningEnabled) {
      this.emit('knowledge_added', { entry: knowledgeEntry });
    }

    logger.info(`Knowledge added: ${knowledgeEntry.title}`);
    return knowledgeEntry.id;
  }

  /**
   * Query knowledge base
   */
  async queryKnowledge(query: string, type?: string, tags?: string[]): Promise<KnowledgeBaseEntry[]> {
    const results: KnowledgeBaseEntry[] = [];

    for (const entry of this.knowledgeBase.values()) {
      // Filter by type if specified
      if (type && entry.type !== type) {
        continue;
      }

      // Filter by tags if specified
      if (tags && tags.length > 0) {
        const hasAllTags = tags.every(tag => entry.tags.includes(tag));
        if (!hasAllTags) {
          continue;
        }
      }

      // Simple text matching (would use more sophisticated search in production)
      const titleMatch = entry.title.toLowerCase().includes(query.toLowerCase());
      const contentMatch = JSON.stringify(entry.content).toLowerCase().includes(query.toLowerCase());

      if (titleMatch || contentMatch) {
        results.push(entry);
      }
    }

    // Sort by confidence and usage
    results.sort((a, b) => {
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }
      return b.usageCount - a.usageCount;
    });

    // Update usage count for returned entries
    for (const entry of results) {
      entry.usageCount++;
      entry.lastUsed = new Date();
    }

    return results.slice(0, 10); // Return top 10 results
  }

  /**
   * Record experience
   */
  async recordExperience(record: Omit<ExperienceRecord, 'id' | 'timestamp'>): Promise<string> {
    const experienceRecord: ExperienceRecord = {
      ...record,
      id: uuidv4(),
      timestamp: new Date(),
    };

    // Add to agent's experience records
    if (!this.experienceRecords.has(record.agentId)) {
      this.experienceRecords.set(record.agentId, []);
    }
    this.experienceRecords.get(record.agentId)!.push(experienceRecord);

    // Update knowledge if experience is successful
    if (record.outcome === 'success' && this.config.experienceSharingEnabled) {
      await this.deriveKnowledgeFromExperience(experienceRecord);
    }

    if (this.config.learningEnabled) {
      this.emit('experience_recorded', { record: experienceRecord });
    }

    logger.info(`Experience recorded for agent ${record.agentId}`);
    return experienceRecord.id;
  }

  /**
   * Get agent experiences
   */
  async getAgentExperiences(agentId: string): Promise<ExperienceRecord[]> {
    return this.experienceRecords.get(agentId) || [];
  }

  /**
   * Record agent performance
   */
  async recordPerformance(performance: AgentPerformance): Promise<void> {
    if (!this.performanceHistory.has(performance.agentId)) {
      this.performanceHistory.set(performance.agentId, []);
    }
    
    this.performanceHistory.get(performance.agentId)!.push(performance);

    // Keep only last 100 records per agent
    const records = this.performanceHistory.get(performance.agentId)!;
    if (records.length > 100) {
      records.shift();
    }
  }

  /**
   * Get agent performance
   */
  async getAgentPerformance(agentId: string): Promise<AgentPerformance | null> {
    const records = this.performanceHistory.get(agentId);
    if (!records || records.length === 0) {
      return null;
    }

    // Return most recent record
    return records[records.length - 1];
  }

  /**
   * Optimize using genetic algorithm
   */
  async optimizeGenetic(
    objective: (config: any) => number,
    initialPopulation: any[],
    generations: number = 50,
    mutationRate: number = 0.1,
    crossoverRate: number = 0.7
  ): Promise<any> {
    logger.info('Starting genetic algorithm optimization');

    let population = initialPopulation;
    let bestConfig = population[0];
    let bestFitness = objective(bestConfig);

    for (let gen = 0; gen < generations; gen++) {
      // Evaluate fitness
      const fitnessScores = population.map(config => ({
        config,
        fitness: objective(config),
      }));

      // Sort by fitness (higher is better)
      fitnessScores.sort((a, b) => b.fitness - a.fitness);

      // Update best
      if (fitnessScores[0].fitness > bestFitness) {
        bestFitness = fitnessScores[0].fitness;
        bestConfig = fitnessScores[0].config;
      }

      // Selection (elitism - keep top 20%)
      const eliteCount = Math.ceil(population.length * 0.2);
      const elite = fitnessScores.slice(0, eliteCount).map(f => f.config);

      // Crossover
      const offspring: any[] = [];
      while (offspring.length < population.length - eliteCount) {
        const parent1 = this.selectParent(fitnessScores);
        const parent2 = this.selectParent(fitnessScores);
        
        if (Math.random() < crossoverRate) {
          offspring.push(this.crossover(parent1, parent2));
        } else {
          offspring.push({ ...parent1 });
        }
      }

      // Mutation
      for (const individual of offspring) {
        if (Math.random() < mutationRate) {
          this.mutate(individual);
        }
      }

      // New population
      population = [...elite, ...offspring];

      if (gen % 10 === 0) {
        logger.info(`Generation ${gen}: Best fitness = ${bestFitness}`);
      }
    }

    logger.info(`Genetic optimization complete. Best fitness: ${bestFitness}`);
    return bestConfig;
  }

  /**
   * Optimize using ant colony optimization
   */
  async optimizeAntColony(
    graph: any[],
    objective: (path: any[]) => number,
    iterations: number = 100,
    antCount: number = 20,
    evaporationRate: number = 0.5
  ): Promise<any[]> {
    logger.info('Starting ant colony optimization');

    const pheromones = new Map<string, number>();
    let bestPath: any[] = [];
    let bestScore = -Infinity;

    // Initialize pheromones
    for (const edge of graph) {
      pheromones.set(edge.id, 1.0);
    }

    for (let iter = 0; iter < iterations; iter++) {
      const antPaths: any[][] = [];

      // Each ant constructs a path
      for (let ant = 0; ant < antCount; ant++) {
        const path = this.constructAntPath(graph, pheromones);
        antPaths.push(path);
      }

      // Evaluate paths
      for (const path of antPaths) {
        const score = objective(path);
        
        if (score > bestScore) {
          bestScore = score;
          bestPath = path;
        }

        // Update pheromones
        const deposit = score;
        for (let i = 0; i < path.length - 1; i++) {
          const edgeId = this.getEdgeId(path[i], path[i + 1]);
          const currentPheromone = pheromones.get(edgeId) || 0;
          pheromones.set(edgeId, currentPheromone + deposit);
        }
      }

      // Evaporate pheromones
      for (const [edgeId, value] of pheromones.entries()) {
        pheromones.set(edgeId, value * (1 - evaporationRate));
      }

      if (iter % 10 === 0) {
        logger.info(`Iteration ${iter}: Best score = ${bestScore}`);
      }
    }

    logger.info(`Ant colony optimization complete. Best score: ${bestScore}`);
    return bestPath;
  }

  /**
   * Detect patterns in data
   */
  async detectPatterns(data: any[]): Promise<any[]> {
    if (!this.config.patternRecognitionEnabled) {
      return [];
    }

    logger.info('Detecting patterns in data');

    const patterns: any[] = [];

    // Simple pattern detection (would use ML in production)
    const frequencyMap = new Map<string, number>();
    for (const item of data) {
      const key = JSON.stringify(item);
      frequencyMap.set(key, (frequencyMap.get(key) || 0) + 1);
    }

    // Find frequent patterns
    for (const [key, count] of frequencyMap.entries()) {
      if (count > data.length * 0.1) { // Appears in more than 10% of data
        patterns.push({
          pattern: JSON.parse(key),
          frequency: count / data.length,
          confidence: 0.8,
        });
      }
    }

    logger.info(`Detected ${patterns.length} patterns`);
    return patterns;
  }

  /**
   * Predict optimal configuration
   */
  async predictOptimalConfig(
    context: any,
    historicalData: any[]
  ): Promise<any> {
    if (!this.config.patternRecognitionEnabled) {
      return null;
    }

    // Simple prediction based on similar historical contexts
    const similarContexts = historicalData.filter(data => 
      this.calculateSimilarity(context, data.context) > 0.8
    );

    if (similarContexts.length === 0) {
      return null;
    }

    // Return configuration from most successful similar context
    similarContexts.sort((a, b) => (b.successRate || 0) - (a.successRate || 0));
    return similarContexts[0].configuration;
  }

  /**
   * Shutdown
   */
  async shutdown(): Promise<void> {
    this.isRunning = false;

    if (this.config.knowledgeBaseEnabled) {
      await this.saveKnowledgeBase();
    }

    this.knowledgeBase.clear();
    this.experienceRecords.clear();
    this.performanceHistory.clear();
    this.patterns.clear();

    logger.info('Swarm intelligence shut down');
  }

  // Helper methods

  private async loadKnowledgeBase(): Promise<void> {
    // Would load from database
    logger.info('Knowledge base loaded');
  }

  private async saveKnowledgeBase(): Promise<void> {
    // Would save to database
    logger.info('Knowledge base saved');
  }

  private async initializePatternRecognition(): Promise<void> {
    // Would initialize ML models
    logger.info('Pattern recognition initialized');
  }

  private async deriveKnowledgeFromExperience(experience: ExperienceRecord): Promise<void> {
    // Would use LLM to extract knowledge from experience
    if (experience.outcome === 'success') {
      const knowledge: Omit<KnowledgeBaseEntry, 'id' | 'createdAt'> = {
        type: 'technique',
        title: `Successful ${experience.taskType}`,
        content: {
          approach: experience.approach,
          duration: experience.duration,
          resourceUsage: experience.resourceUsage,
        },
        tags: ['successful', experience.taskType],
        sourceAgent: experience.agentId,
        operationId: experience.operationId,
        successRate: 1.0,
        usageCount: 0,
        lastUsed: new Date(),
        confidence: experience.confidence,
      };

      await this.addKnowledge(knowledge);
    }
  }

  private startLearningLoop(): void {
    // Would start periodic learning process
    logger.info('Learning loop started');
  }

  private selectParent(fitnessScores: { config: any; fitness: number }[]): any {
    // Tournament selection
    const tournamentSize = 3;
    let best = fitnessScores[Math.floor(Math.random() * fitnessScores.length)];
    
    for (let i = 1; i < tournamentSize; i++) {
      const competitor = fitnessScores[Math.floor(Math.random() * fitnessScores.length)];
      if (competitor.fitness > best.fitness) {
        best = competitor;
      }
    }

    return best.config;
  }

  private crossover(parent1: any, parent2: any): any {
    // Simple crossover - combine properties
    const child = { ...parent1 };
    const keys = Object.keys(parent2);
    const crossoverPoint = Math.floor(Math.random() * keys.length);
    
    for (let i = crossoverPoint; i < keys.length; i++) {
      child[keys[i]] = parent2[keys[i]];
    }

    return child;
  }

  private mutate(individual: any): void {
    // Simple mutation - randomize one property
    const keys = Object.keys(individual);
    if (keys.length > 0) {
      const key = keys[Math.floor(Math.random() * keys.length)];
      if (typeof individual[key] === 'number') {
        individual[key] *= (0.9 + Math.random() * 0.2); // ±10%
      }
    }
  }

  private constructAntPath(graph: any[], pheromones: Map<string, number>): any[] {
    // Simplified ant path construction
    return [graph[0], graph[graph.length - 1]];
  }

  private getEdgeId(node1: any, node2: any): string {
    return `${node1.id}-${node2.id}`;
  }

  private calculateSimilarity(context1: any, context2: any): number {
    // Simple similarity calculation
    const keys1 = Object.keys(context1);
    const keys2 = Object.keys(context2);
    const commonKeys = keys1.filter(key => keys2.includes(key));
    
    if (commonKeys.length === 0) {
      return 0;
    }

    let matches = 0;
    for (const key of commonKeys) {
      if (context1[key] === context2[key]) {
        matches++;
      }
    }

    return matches / commonKeys.length;
  }
}