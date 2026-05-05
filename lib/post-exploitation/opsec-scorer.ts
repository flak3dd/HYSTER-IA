import logger from '../logger';

export interface OPSECScore {
  overallScore: number; // 0-100, higher = better OPSEC
  detectionRisk: number; // 0-100, higher = more likely to be detected
  noiseLevel: number; // 0-100, higher = more noise/logs generated
  persistence: number; // 0-100, higher = more persistent artifacts left behind
  attributionRisk: number; // 0-100, higher = easier to attribute
  factors: OPSECFactor[];
  recommendations: string[];
}

export interface OPSECFactor {
  name: string;
  impact: number; // -100 to 100, negative = bad for OPSEC
  description: string;
  weight: number; // 0-1, how much this factor contributes to overall score
}

export interface TechniqueOPSECProfile {
  technique: string;
  category: string;
  baseScore: number;
  factors: OPSECFactor[];
  mitreAttack: string[];
  detectionMethods: string[];
  mitigationStrategies: string[];
}

export interface OPSECAssessmentRequest {
  technique: string;
  context?: {
    targetEnvironment?: string;
    monitoringLevel?: 'low' | 'medium' | 'high';
    defensiveCapabilities?: string[];
    timeConstraints?: number; // seconds
    stealthPriority?: number; // 0-1
  };
  options?: Record<string, any>;
}

export interface OPSECAssessmentResult {
  technique: string;
  score: OPSECScore;
  suitable: boolean;
  alternativeTechniques?: string[];
  reasoning: string;
}

export class OPSECScorer {
  private techniqueProfiles: Map<string, TechniqueOPSECProfile>;

  constructor() {
    this.techniqueProfiles = new Map();
    this.initializeTechniqueProfiles();
  }

  /**
   * Initialize technique OPSEC profiles
   */
  private initializeTechniqueProfiles(): void {
    // Kerberoasting
    this.techniqueProfiles.set('kerberoasting', {
      technique: 'kerberoasting',
      category: 'Credential Access',
      baseScore: 65,
      factors: [
        {
          name: 'Network Traffic',
          impact: -20,
          description: 'Generates Kerberos TGS requests that may be monitored',
          weight: 0.3
        },
        {
          name: 'Log Generation',
          impact: -15,
          description: 'Creates event logs on KDC',
          weight: 0.2
        },
        {
          name: 'Detection Difficulty',
          impact: 30,
          description: 'Legitimate Kerberos traffic, hard to distinguish',
          weight: 0.3
        },
        {
          name: 'Artifacts',
          impact: -10,
          description: 'Leaves minimal artifacts on target',
          weight: 0.2
        }
      ],
      mitreAttack: ['T1208', 'T1558.001'],
      detectionMethods: ['Kerberos monitoring', 'Event log analysis', 'Network traffic analysis'],
      mitigationStrategies: ['Strong passwords', 'Kerberos pre-authentication', 'Monitoring']
    });

    // Pass-the-Hash
    this.techniqueProfiles.set('pass_the_hash', {
      technique: 'pass_the_hash',
      category: 'Credential Access',
      baseScore: 55,
      factors: [
        {
          name: 'Network Traffic',
          impact: -10,
          description: 'Uses NTLM authentication, may be monitored',
          weight: 0.2
        },
        {
          name: 'Log Generation',
          impact: -25,
          description: 'Creates authentication logs',
          weight: 0.3
        },
        {
          name: 'Detection Difficulty',
          impact: 20,
          description: 'Legitimate authentication protocol',
          weight: 0.2
        },
        {
          name: 'Artifacts',
          impact: -15,
          description: 'May leave memory artifacts',
          weight: 0.3
        }
      ],
      mitreAttack: ['T1075', 'T1550.002'],
      detectionMethods: ['Logon monitoring', 'NTLM monitoring', 'Behavioral analysis'],
      mitigationStrategies: ['Credential Guard', 'Multi-factor authentication', 'Monitoring']
    });

    // SMB Lateral Movement
    this.techniqueProfiles.set('smb_lateral_movement', {
      technique: 'smb_lateral_movement',
      category: 'Lateral Movement',
      baseScore: 45,
      factors: [
        {
          name: 'Network Traffic',
          impact: -30,
          description: 'SMB traffic is commonly monitored',
          weight: 0.3
        },
        {
          name: 'Log Generation',
          impact: -25,
          description: 'Creates significant log entries',
          weight: 0.3
        },
        {
          name: 'Detection Difficulty',
          impact: 10,
          description: 'SMB is common protocol, but lateral movement patterns detectable',
          weight: 0.2
        },
        {
          name: 'Artifacts',
          impact: -15,
          description: 'Leaves session artifacts',
          weight: 0.2
        }
      ],
      mitreAttack: ['T1021.002'],
      detectionMethods: ['SMB monitoring', 'Network segmentation', 'Behavioral analysis'],
      mitigationStrategies: ['Network segmentation', 'SMB signing', 'Monitoring']
    });

    // WinRM Lateral Movement
    this.techniqueProfiles.set('winrm_lateral_movement', {
      technique: 'winrm_lateral_movement',
      category: 'Lateral Movement',
      baseScore: 50,
      factors: [
        {
          name: 'Network Traffic',
          impact: -25,
          description: 'WinRM traffic can be monitored',
          weight: 0.3
        },
        {
          name: 'Log Generation',
          impact: -20,
          description: 'Creates PowerShell/WinRM logs',
          weight: 0.3
        },
        {
          name: 'Detection Difficulty',
          impact: 15,
          description: 'Less common than SMB, may fly under radar',
          weight: 0.2
        },
        {
          name: 'Artifacts',
          impact: -20,
          description: 'PowerShell execution artifacts',
          weight: 0.2
        }
      ],
      mitreAttack: ['T1021.006'],
      detectionMethods: ['WinRM monitoring', 'PowerShell logging', 'Network monitoring'],
      mitigationStrategies: ['Disable WinRM', 'Just Enough Administration', 'Monitoring']
    });

    // WMI Lateral Movement
    this.techniqueProfiles.set('wmi_lateral_movement', {
      technique: 'wmi_lateral_movement',
      category: 'Lateral Movement',
      baseScore: 60,
      factors: [
        {
          name: 'Network Traffic',
          impact: -15,
          description: 'WMI traffic less commonly monitored',
          weight: 0.3
        },
        {
          name: 'Log Generation',
          impact: -20,
          description: 'WMI event logs',
          weight: 0.3
        },
        {
          name: 'Detection Difficulty',
          impact: 25,
          description: 'Legitimate administration protocol',
          weight: 0.2
        },
        {
          name: 'Artifacts',
          impact: -10,
          description: 'Minimal artifacts',
          weight: 0.2
        }
      ],
      mitreAttack: ['T1047'],
      detectionMethods: ['WMI monitoring', 'Event logging', 'Behavioral analysis'],
      mitigationStrategies: ['WMI filtering', 'Least privilege', 'Monitoring']
    });

    // DCOM Lateral Movement
    this.techniqueProfiles.set('dcom_lateral_movement', {
      technique: 'dcom_lateral_movement',
      category: 'Lateral Movement',
      baseScore: 55,
      factors: [
        {
          name: 'Network Traffic',
          impact: -20,
          description: 'DCOM traffic can be monitored',
          weight: 0.3
        },
        {
          name: 'Log Generation',
          impact: -25,
          description: 'COM/DCOM event logs',
          weight: 0.3
        },
        {
          name: 'Detection Difficulty',
          impact: 20,
          description: 'Complex protocol, harder to analyze',
          weight: 0.2
        },
        {
          name: 'Artifacts',
          impact: -15,
          description: 'Registry and service artifacts',
          weight: 0.2
        }
      ],
      mitreAttack: ['T1021.003'],
      detectionMethods: ['DCOM monitoring', 'Network monitoring', 'Registry monitoring'],
      mitigationStrategies: ['Disable DCOM', 'Network segmentation', 'Application whitelisting']
    });

    // AS-REP Roasting
    this.techniqueProfiles.set('as_rep_roasting', {
      technique: 'as_rep_roasting',
      category: 'Credential Access',
      baseScore: 70,
      factors: [
        {
          name: 'Network Traffic',
          impact: -15,
          description: 'Kerberos AS-REQ traffic',
          weight: 0.3
        },
        {
          name: 'Log Generation',
      impact: -10,
          description: 'Minimal log generation',
          weight: 0.2
        },
        {
          name: 'Detection Difficulty',
          impact: 35,
          description: 'Silent technique, hard to detect',
          weight: 0.3
        },
        {
          name: 'Artifacts',
          impact: -10,
          description: 'No artifacts on target',
          weight: 0.2
        }
      ],
      mitreAttack: ['T1208', 'T1558.004'],
      detectionMethods: ['Kerberos monitoring', 'Account monitoring', 'Honeytokens'],
      mitigationStrategies: ['Require pre-auth', 'Account monitoring', 'Strong passwords']
    });
  }

  /**
   * Assess OPSEC for a technique
   */
  async assessOPSEC(request: OPSECAssessmentRequest): Promise<OPSECAssessmentResult> {
    logger.info(`Assessing OPSEC for technique: ${request.technique}`);

    const profile = this.techniqueProfiles.get(request.technique);
    
    if (!profile) {
      throw new Error(`Unknown technique: ${request.technique}`);
    }

    // Calculate base score from factors
    let factorScore = 0;
    const factors: OPSECFactor[] = [];

    for (const factor of profile.factors) {
      const adjustedImpact = this.adjustFactorForContext(factor, request.context);
      factorScore += adjustedImpact * factor.weight;
      factors.push({
        ...factor,
        impact: adjustedImpact
      });
    }

    // Calculate overall score (base + factor adjustments)
    let overallScore = profile.baseScore + factorScore;
    overallScore = Math.max(0, Math.min(100, overallScore));

    // Calculate risk components
    const detectionRisk = 100 - overallScore;
    const noiseLevel = Math.max(0, 100 - overallScore + 10);
    const persistence = this.calculatePersistence(profile);
    const attributionRisk = this.calculateAttributionRisk(profile);

    // Generate recommendations
    const recommendations = this.generateRecommendations(profile, request.context);

    // Determine suitability
    const suitable = this.isSuitable(overallScore, request.context);

    // Find alternatives if not suitable
    let alternativeTechniques: string[] | undefined;
    if (!suitable) {
      alternativeTechniques = this.findAlternatives(request.technique, request.context);
    }

    const score: OPSECScore = {
      overallScore,
      detectionRisk,
      noiseLevel,
      persistence,
      attributionRisk,
      factors,
      recommendations
    };

    const reasoning = this.generateReasoning(profile, score, suitable, request.context);

    return {
      technique: request.technique,
      score,
      suitable,
      alternativeTechniques,
      reasoning
    };
  }

  /**
   * Adjust factor impact based on context
   */
  private adjustFactorForContext(factor: OPSECFactor, context: any = {}): number {
    let adjustedImpact = factor.impact;

    // Adjust for monitoring level
    if (context.monitoringLevel === 'high') {
      if (factor.name === 'Network Traffic' || factor.name === 'Log Generation') {
        adjustedImpact -= 20; // More negative impact in high monitoring
      }
    } else if (context.monitoringLevel === 'low') {
      if (factor.name === 'Network Traffic' || factor.name === 'Log Generation') {
        adjustedImpact += 15; // Less negative impact in low monitoring
      }
    }

    // Adjust for defensive capabilities
    if (context.defensiveCapabilities) {
      if (context.defensiveCapabilities.includes('SIEM')) {
        if (factor.name === 'Log Generation') {
          adjustedImpact -= 15;
        }
      }
      if (context.defensiveCapabilities.includes('EDR')) {
        if (factor.name === 'Artifacts') {
          adjustedImpact -= 20;
        }
      }
    }

    // Adjust for stealth priority
    if (context.stealthPriority && context.stealthPriority > 0.7) {
      if (factor.impact < 0) {
        adjustedImpact -= 10; // Amplify negative impacts for high stealth priority
      }
    }

    return adjustedImpact;
  }

  /**
   * Calculate persistence score
   */
  private calculatePersistence(profile: TechniqueOPSECProfile): number {
    // Base persistence on technique category
    const categoryPersistence: Record<string, number> = {
      'Credential Access': 30,
      'Lateral Movement': 50,
      'Persistence': 80,
      'Defense Evasion': 60,
      'Execution': 40
    };

    return categoryPersistence[profile.category] || 50;
  }

  /**
   * Calculate attribution risk
   */
  private calculateAttributionRisk(profile: TechniqueOPSECProfile): number {
    // Certain techniques are more unique to specific actors
    const highAttributionTechniques = ['as_rep_roasting', 'kerberoasting'];
    
    if (highAttributionTechniques.includes(profile.technique)) {
      return 60;
    }

    return 40;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(profile: TechniqueOPSECProfile, context: any = {}): string[] {
    const recommendations: string[] = [];

    // Add mitigation strategies as recommendations for the operator
    if (profile.mitigationStrategies.length > 0) {
      recommendations.push(`Be aware of defenses: ${profile.mitigationStrategies.join(', ')}`);
    }

    // Context-specific recommendations
    if (context.monitoringLevel === 'high') {
      recommendations.push('Consider using alternative techniques with lower detection risk');
      recommendations.push('Implement timing delays to avoid pattern detection');
    }

    if (context.timeConstraints && context.timeConstraints < 60) {
      recommendations.push('Time-constrained operation: prioritize speed over stealth');
    }

    if (context.stealthPriority && context.stealthPriority > 0.8) {
      recommendations.push('High stealth priority: consider fileless techniques');
      recommendations.push('Use living-off-the-land binaries');
    }

    return recommendations;
  }

  /**
   * Check if technique is suitable
   */
  private isSuitable(overallScore: number, context: any = {}): boolean {
    // Base threshold
    let threshold = 50;

    // Adjust threshold based on stealth priority
    if (context.stealthPriority) {
      threshold = 30 + (context.stealthPriority * 50); // 30-80 range
    }

    // Adjust for monitoring level
    if (context.monitoringLevel === 'high') {
      threshold += 15;
    } else if (context.monitoringLevel === 'low') {
      threshold -= 15;
    }

    return overallScore >= threshold;
  }

  /**
   * Find alternative techniques
   */
  private findAlternatives(currentTechnique: string, context: any = {}): string[] {
    const alternatives: string[] = [];
    const currentProfile = this.techniqueProfiles.get(currentTechnique);

    if (!currentProfile) {
      return alternatives;
    }

    // Find techniques in the same category with better scores
    for (const [technique, profile] of this.techniqueProfiles.entries()) {
      if (technique !== currentTechnique && profile.category === currentProfile.category) {
        if (profile.baseScore > currentProfile.baseScore) {
          alternatives.push(technique);
        }
      }
    }

    return alternatives.slice(0, 3); // Return top 3 alternatives
  }

  /**
   * Generate reasoning string
   */
  private generateReasoning(profile: TechniqueOPSECProfile, score: OPSECScore, suitable: boolean, context: any = {}): string {
    let reasoning = `Technique ${profile.technique} has an OPSEC score of ${score.overallScore}/100. `;

    if (score.overallScore >= 70) {
      reasoning += 'This is a relatively stealthy technique. ';
    } else if (score.overallScore >= 50) {
      reasoning += 'This technique has moderate OPSEC characteristics. ';
    } else {
      reasoning += 'This technique has significant detection risks. ';
    }

    reasoning += `Detection risk: ${score.detectionRisk}%, Noise level: ${score.noiseLevel}%. `;

    if (context.monitoringLevel === 'high') {
      reasoning += 'High monitoring environment increases detection risk. ';
    }

    if (suitable) {
      reasoning += 'This technique is suitable for the given context.';
    } else {
      reasoning += 'Consider using alternative techniques with better OPSEC profiles.';
    }

    return reasoning;
  }

  /**
   * Get all available techniques
   */
  getAvailableTechniques(): string[] {
    return Array.from(this.techniqueProfiles.keys());
  }

  /**
   * Get technique profile
   */
  getTechniqueProfile(technique: string): TechniqueOPSECProfile | undefined {
    return this.techniqueProfiles.get(technique);
  }

  /**
   * Add custom technique profile
   */
  addTechniqueProfile(profile: TechniqueOPSECProfile): void {
    this.techniqueProfiles.set(profile.technique, profile);
    logger.info(`Added custom OPSEC profile for technique: ${profile.technique}`);
  }
}

// Singleton instance
export const opsecScorer = new OPSECScorer();