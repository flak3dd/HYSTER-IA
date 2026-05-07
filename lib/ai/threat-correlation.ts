import { z } from 'zod'

/* ------------------------------------------------------------------ */
/*  Types & Schemas                                                   */
/* ------------------------------------------------------------------ */

export const ThreatSeverity = z.enum(['critical', 'high', 'medium', 'low', 'info'])
export type ThreatSeverity = z.infer<typeof ThreatSeverity>

export const ThreatType = z.enum([
  'malware',
  'phishing',
  'command_control',
  'data_exfiltration',
  'ddos',
  'vulnerability',
  'suspicious_activity',
])
export type ThreatType = z.infer<typeof ThreatType>

export interface ThreatIndicator {
  id: string
  type: 'ip' | 'domain' | 'url' | 'hash' | 'email'
  value: string
  source: string
  confidence: number
  severity: ThreatSeverity
  firstSeen: number
  lastSeen: number
  tags: string[]
  metadata: Record<string, unknown>
}

export interface ThreatCorrelation {
  id: string
  indicators: ThreatIndicator[]
  correlationType: 'identical' | 'related' | 'contextual' | 'temporal'
  confidence: number
  severity: ThreatSeverity
  threatType: ThreatType
  description: string
  relatedCampaigns: string[]
  iocCount: number
  timestamp: number
}

export interface ThreatIntelligence {
  indicators: ThreatIndicator[]
  correlations: ThreatCorrelation[]
  campaigns: Campaign[]
  summary: ThreatSummary
  timestamp: number
}

export interface Campaign {
  id: string
  name: string
  description: string
  threatType: ThreatType
  severity: ThreatSeverity
  indicators: string[]
  attribution: string[]
  timeline: CampaignEvent[]
  status: 'active' | 'inactive' | 'emerging'
}

export interface CampaignEvent {
  timestamp: number
  type: 'first_seen' | 'activity_spike' | 'new_indicator' | 'attribution_change'
  description: string
  indicators: string[]
}

export interface ThreatSummary {
  totalIndicators: number
  criticalThreats: number
  highThreats: number
  mediumThreats: number
  activeCampaigns: number
  topThreatTypes: Record<ThreatType, number>
  topSources: Record<string, number>
  trends: TrendData[]
}

export interface TrendData {
  period: string
  indicatorCount: number
  threatCount: number
  avgSeverity: number
}

/* ------------------------------------------------------------------ */
/*  Automated Threat Correlation Engine                                */
/* ------------------------------------------------------------------ */

class ThreatCorrelationEngine {
  private indicatorDatabase: Map<string, ThreatIndicator>
  private correlationDatabase: Map<string, ThreatCorrelation>
  private campaignDatabase: Map<string, Campaign>
  private correlationRules: CorrelationRule[]
  private isAutoCorrelationEnabled: boolean
  private analysisInterval: NodeJS.Timeout | null

  constructor() {
    this.indicatorDatabase = new Map()
    this.correlationDatabase = new Map()
    this.campaignDatabase = new Map()
    this.correlationRules = this.initializeCorrelationRules()
    this.isAutoCorrelationEnabled = true
    this.analysisInterval = null

    this.startAutoCorrelation()
  }

  /* ------------------------------------------------------------------ */
  /*  Initialization                                                    */
  /* ------------------------------------------------------------------ */

  private initializeCorrelationRules(): CorrelationRule[] {
    return [
      {
        name: 'Identical Value Correlation',
        type: 'identical',
        evaluate: (indicators) => this.correlateIdentical(indicators),
        confidence: 1.0,
      },
      {
        name: 'IP-Domain Correlation',
        type: 'related',
        evaluate: (indicators) => this.correlateIpDomain(indicators),
        confidence: 0.8,
      },
      {
        name: 'Domain-URL Correlation',
        type: 'related',
        evaluate: (indicators) => this.correlateDomainUrl(indicators),
        confidence: 0.7,
      },
      {
        name: 'Hash Correlation',
        type: 'related',
        evaluate: (indicators) => this.correlateHashes(indicators),
        confidence: 0.9,
      },
      {
        name: 'Temporal Correlation',
        type: 'temporal',
        evaluate: (indicators) => this.correlateTemporal(indicators),
        confidence: 0.6,
      },
      {
        name: 'Contextual Correlation',
        type: 'contextual',
        evaluate: (indicators) => this.correlateContextual(indicators),
        confidence: 0.5,
      },
    ]
  }

  /* ------------------------------------------------------------------ */
  /*  Indicator Management                                              */
  /* ------------------------------------------------------------------ */

  addIndicator(indicator: ThreatIndicator): void {
    this.indicatorDatabase.set(indicator.id, indicator)
    
    // Trigger auto-correlation
    if (this.isAutoCorrelationEnabled) {
      this.performCorrelationAnalysis([indicator])
    }
  }

  addIndicators(indicators: ThreatIndicator[]): void {
    for (const indicator of indicators) {
      this.addIndicator(indicator)
    }
  }

  getIndicator(id: string): ThreatIndicator | undefined {
    return this.indicatorDatabase.get(id)
  }

  getIndicatorsByType(type: ThreatIndicator['type']): ThreatIndicator[] {
    return Array.from(this.indicatorDatabase.values()).filter(i => i.type === type)
  }

  getIndicatorsBySource(source: string): ThreatIndicator[] {
    return Array.from(this.indicatorDatabase.values()).filter(i => i.source === source)
  }

  getIndicatorsBySeverity(severity: ThreatSeverity): ThreatIndicator[] {
    return Array.from(this.indicatorDatabase.values()).filter(i => i.severity === severity)
  }

  /* ------------------------------------------------------------------ */
  /*  Automated Correlation                                            */
  /* ------------------------------------------------------------------ */

  private startAutoCorrelation(): void {
    this.analysisInterval = setInterval(async () => {
      if (!this.isAutoCorrelationEnabled) return

      try {
        await this.performCorrelationAnalysis()
      } catch (error) {
        console.error('Auto-correlation error:', error)
      }
    }, 300000) // Every 5 minutes
  }

  async performCorrelationAnalysis(newIndicators?: ThreatIndicator[]): Promise<void> {
    const indicatorsToAnalyze = newIndicators || Array.from(this.indicatorDatabase.values())
    
    for (const rule of this.correlationRules) {
      try {
        const correlations = await rule.evaluate(indicatorsToAnalyze)
        
        for (const correlation of correlations) {
          this.addCorrelation(correlation)
        }
      } catch (error) {
        console.error(`Correlation rule ${rule.name} failed:`, error)
      }
    }

    // Update campaigns based on new correlations
    await this.updateCampaigns()
  }

  private addCorrelation(correlation: ThreatCorrelation): void {
    // Check for existing similar correlations
    const existing = Array.from(this.correlationDatabase.values()).find(
      c => c.correlationType === correlation.correlationType &&
           c.iocCount === correlation.iocCount &&
           this.indicatorOverlap(c.indicators, correlation.indicators) > 0.5
    )

    if (existing) {
      // Update existing correlation
      existing.confidence = Math.max(existing.confidence, correlation.confidence)
      existing.timestamp = Date.now()
    } else {
      // Add new correlation
      this.correlationDatabase.set(correlation.id, correlation)
    }
  }

  private indicatorOverlap(indicators1: ThreatIndicator[], indicators2: ThreatIndicator[]): number {
    const set1 = new Set(indicators1.map(i => i.id))
    const set2 = new Set(indicators2.map(i => i.id))
    
    const intersection = new Set([...set1].filter(x => set2.has(x)))
    const union = new Set([...set1, ...set2])
    
    return intersection.size / union.size
  }

  /* ------------------------------------------------------------------ */
  /*  Correlation Rules                                                  */
  /* ------------------------------------------------------------------ */

  private async correlateIdentical(indicators: ThreatIndicator[]): Promise<ThreatCorrelation[]> {
    const correlations: ThreatCorrelation[] = []
    const valueGroups = new Map<string, ThreatIndicator[]>()

    // Group by value
    for (const indicator of indicators) {
      const group = valueGroups.get(indicator.value) || []
      group.push(indicator)
      valueGroups.set(indicator.value, group)
    }

    // Create correlations for groups with multiple sources
    for (const [value, group] of valueGroups) {
      if (group.length > 1) {
        const correlation: ThreatCorrelation = {
          id: `corr_identical_${value}_${Date.now()}`,
          indicators: group,
          correlationType: 'identical',
          confidence: 1.0,
          severity: this.calculateCorrelationSeverity(group),
          threatType: this.inferThreatType(group),
          description: `Identical indicator ${value} reported by ${group.length} sources`,
          relatedCampaigns: [],
          iocCount: group.length,
          timestamp: Date.now(),
        }
        correlations.push(correlation)
      }
    }

    return correlations
  }

  private async correlateIpDomain(indicators: ThreatIndicator[]): Promise<ThreatCorrelation[]> {
    const correlations: ThreatCorrelation[] = []
    const ipIndicators = indicators.filter(i => i.type === 'ip')
    const domainIndicators = indicators.filter(i => i.type === 'domain')

    // Check for DNS resolution relationships
    for (const ipIndicator of ipIndicators) {
      const relatedDomains = domainIndicators.filter(d => 
        this.isIpDomainRelated(ipIndicator.value, d.value)
      )

      if (relatedDomains.length > 0) {
        const correlation: ThreatCorrelation = {
          id: `corr_ipdomain_${ipIndicator.id}_${Date.now()}`,
          indicators: [ipIndicator, ...relatedDomains],
          correlationType: 'related',
          confidence: 0.8,
          severity: this.calculateCorrelationSeverity([ipIndicator, ...relatedDomains]),
          threatType: this.inferThreatType([ipIndicator, ...relatedDomains]),
          description: `IP ${ipIndicator.value} related to ${relatedDomains.length} domains`,
          relatedCampaigns: [],
          iocCount: 1 + relatedDomains.length,
          timestamp: Date.now(),
        }
        correlations.push(correlation)
      }
    }

    return correlations
  }

  private async correlateDomainUrl(indicators: ThreatIndicator[]): Promise<ThreatCorrelation[]> {
    const correlations: ThreatCorrelation[] = []
    const domainIndicators = indicators.filter(i => i.type === 'domain')
    const urlIndicators = indicators.filter(i => i.type === 'url')

    for (const domainIndicator of domainIndicators) {
      const relatedUrls = urlIndicators.filter(u => 
        u.value.includes(domainIndicator.value)
      )

      if (relatedUrls.length > 0) {
        const correlation: ThreatCorrelation = {
          id: `corr_domainurl_${domainIndicator.id}_${Date.now()}`,
          indicators: [domainIndicator, ...relatedUrls],
          correlationType: 'related',
          confidence: 0.7,
          severity: this.calculateCorrelationSeverity([domainIndicator, ...relatedUrls]),
          threatType: this.inferThreatType([domainIndicator, ...relatedUrls]),
          description: `Domain ${domainIndicator.value} related to ${relatedUrls.length} URLs`,
          relatedCampaigns: [],
          iocCount: 1 + relatedUrls.length,
          timestamp: Date.now(),
        }
        correlations.push(correlation)
      }
    }

    return correlations
  }

  private async correlateHashes(indicators: ThreatIndicator[]): Promise<ThreatCorrelation[]> {
    const correlations: ThreatCorrelation[] = []
    const hashIndicators = indicators.filter(i => i.type === 'hash')

    // Group similar hashes (same file with different hash types)
    const hashGroups = new Map<string, ThreatIndicator[]>()

    for (const hashIndicator of hashIndicators) {
      // Simple heuristic: group by first 8 characters (likely same file)
      const prefix = hashIndicator.value.substring(0, 8)
      const group = hashGroups.get(prefix) || []
      group.push(hashIndicator)
      hashGroups.set(prefix, group)
    }

    for (const [prefix, group] of hashGroups) {
      if (group.length > 1) {
        const correlation: ThreatCorrelation = {
          id: `corr_hash_${prefix}_${Date.now()}`,
          indicators: group,
          correlationType: 'related',
          confidence: 0.9,
          severity: this.calculateCorrelationSeverity(group),
          threatType: this.inferThreatType(group),
          description: `Related file hashes (${group.length} variants)`,
          relatedCampaigns: [],
          iocCount: group.length,
          timestamp: Date.now(),
        }
        correlations.push(correlation)
      }
    }

    return correlations
  }

  private async correlateTemporal(indicators: ThreatIndicator[]): Promise<ThreatCorrelation[]> {
    const correlations: ThreatCorrelation[] = []
    const timeWindow = 3600000 // 1 hour
    // Group indicators by time windows
    const timeGroups = new Map<number, ThreatIndicator[]>()

    for (const indicator of indicators) {
      const timeWindowKey = Math.floor(indicator.lastSeen / timeWindow)
      const group = timeGroups.get(timeWindowKey) || []
      group.push(indicator)
      timeGroups.set(timeWindowKey, group)
    }

    // Create correlations for groups with multiple indicators in same time window
    for (const [timeWindowKey, group] of timeGroups) {
      if (group.length > 2) {
        const correlation: ThreatCorrelation = {
          id: `corr_temporal_${timeWindowKey}_${Date.now()}`,
          indicators: group,
          correlationType: 'temporal',
          confidence: 0.6,
          severity: this.calculateCorrelationSeverity(group),
          threatType: this.inferThreatType(group),
          description: `${group.length} indicators appeared in same time window`,
          relatedCampaigns: [],
          iocCount: group.length,
          timestamp: Date.now(),
        }
        correlations.push(correlation)
      }
    }

    return correlations
  }

  private async correlateContextual(indicators: ThreatIndicator[]): Promise<ThreatCorrelation[]> {
    const correlations: ThreatCorrelation[] = []

    // Group by tags and metadata
    const tagGroups = new Map<string, ThreatIndicator[]>()

    for (const indicator of indicators) {
      for (const tag of indicator.tags) {
        const group = tagGroups.get(tag) || []
        group.push(indicator)
        tagGroups.set(tag, group)
      }
    }

    for (const [tag, group] of tagGroups) {
      if (group.length > 1) {
        const correlation: ThreatCorrelation = {
          id: `corr_contextual_${tag}_${Date.now()}`,
          indicators: group,
          correlationType: 'contextual',
          confidence: 0.5,
          severity: this.calculateCorrelationSeverity(group),
          threatType: this.inferThreatType(group),
          description: `${group.length} indicators share tag "${tag}"`,
          relatedCampaigns: [],
          iocCount: group.length,
          timestamp: Date.now(),
        }
        correlations.push(correlation)
      }
    }

    return correlations
  }

  /* ------------------------------------------------------------------ */
  /*  Campaign Management                                               */
  /* ------------------------------------------------------------------ */

  private async updateCampaigns(): Promise<void> {
    const correlations = Array.from(this.correlationDatabase.values())
    
    for (const correlation of correlations) {
      // Check if correlation matches existing campaigns
      const existingCampaign = this.findMatchingCampaign(correlation)
      
      if (existingCampaign) {
        // Update existing campaign
        this.updateCampaign(existingCampaign, correlation)
      } else if (correlation.confidence > 0.7 && correlation.iocCount > 2) {
        // Create new campaign for high-confidence correlations
        this.createCampaignFromCorrelation(correlation)
      }
    }
  }

  private findMatchingCampaign(correlation: ThreatCorrelation): Campaign | undefined {
    for (const campaign of this.campaignDatabase.values()) {
      if (campaign.threatType === correlation.threatType) {
        // Check indicator overlap
        const campaignIndicators = campaign.indicators.map(id => this.indicatorDatabase.get(id))
        const overlap = this.indicatorOverlap(
          campaignIndicators.filter((i): i is ThreatIndicator => i !== undefined),
          correlation.indicators
        )
        
        if (overlap > 0.3) {
          return campaign
        }
      }
    }
    return undefined
  }

  private updateCampaign(campaign: Campaign, correlation: ThreatCorrelation): void {
    // Add new indicators
    for (const indicator of correlation.indicators) {
      if (!campaign.indicators.includes(indicator.id)) {
        campaign.indicators.push(indicator.id)
      }
    }

    // Add timeline event
    campaign.timeline.push({
      timestamp: Date.now(),
      type: 'new_indicator',
      description: `Added ${correlation.indicators.length} new indicators via ${correlation.correlationType} correlation`,
      indicators: correlation.indicators.map(i => i.id),
    })

    // Update status based on recent activity
    const lastActivity = campaign.timeline[campaign.timeline.length - 1].timestamp
    const timeSinceActivity = Date.now() - lastActivity
    
    if (timeSinceActivity < 86400000) { // Within 24 hours
      campaign.status = 'active'
    } else if (timeSinceActivity < 604800000) { // Within 7 days
      campaign.status = 'emerging'
    } else {
      campaign.status = 'inactive'
    }
  }

  private createCampaignFromCorrelation(correlation: ThreatCorrelation): void {
    const campaign: Campaign = {
      id: `campaign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `Auto-generated ${correlation.threatType} campaign`,
      description: correlation.description,
      threatType: correlation.threatType,
      severity: correlation.severity,
      indicators: correlation.indicators.map(i => i.id),
      attribution: [],
      timeline: [{
        timestamp: Date.now(),
        type: 'first_seen',
        description: 'Campaign created via auto-correlation',
        indicators: correlation.indicators.map(i => i.id),
      }],
      status: 'emerging',
    }

    this.campaignDatabase.set(campaign.id, campaign)
  }

  /* ------------------------------------------------------------------ */
  /*  Analysis & Reporting                                             */
  /* ------------------------------------------------------------------ */

  generateThreatIntelligence(): ThreatIntelligence {
    const indicators = Array.from(this.indicatorDatabase.values())
    const correlations = Array.from(this.correlationDatabase.values())
    const campaigns = Array.from(this.campaignDatabase.values())

    return {
      indicators,
      correlations,
      campaigns,
      summary: this.generateThreatSummary(indicators, correlations, campaigns),
      timestamp: Date.now(),
    }
  }

  private generateThreatSummary(
    indicators: ThreatIndicator[],
    correlations: ThreatCorrelation[],
    campaigns: Campaign[]
  ): ThreatSummary {
    const threatTypes: Record<ThreatType, number> = {
      malware: 0,
      phishing: 0,
      command_control: 0,
      data_exfiltration: 0,
      ddos: 0,
      vulnerability: 0,
      suspicious_activity: 0,
    }

    const sources: Record<string, number> = {}

    for (const indicator of indicators) {
      threatTypes[this.inferThreatType([indicator])]++
      sources[indicator.source] = (sources[indicator.source] || 0) + 1
    }

    return {
      totalIndicators: indicators.length,
      criticalThreats: indicators.filter(i => i.severity === 'critical').length,
      highThreats: indicators.filter(i => i.severity === 'high').length,
      mediumThreats: indicators.filter(i => i.severity === 'medium').length,
      activeCampaigns: campaigns.filter(c => c.status === 'active').length,
      topThreatTypes: threatTypes,
      topSources: sources,
      trends: this.generateTrendData(indicators),
    }
  }

  private generateTrendData(indicators: ThreatIndicator[]): TrendData[] {
    const trends: TrendData[] = []
    const now = Date.now()
    const dayMs = 86400000

    for (let i = 6; i >= 0; i--) {
      const periodStart = now - (i + 1) * dayMs
      const periodEnd = now - i * dayMs
      
      const periodIndicators = indicators.filter(
        i => i.firstSeen >= periodStart && i.firstSeen < periodEnd
      )

      const periodCorrelations = Array.from(this.correlationDatabase.values()).filter(
        c => c.timestamp >= periodStart && c.timestamp < periodEnd
      )

      const avgSeverity = periodIndicators.length > 0
        ? periodIndicators.reduce((sum, i) => {
            const severityScore = { critical: 5, high: 4, medium: 3, low: 2, info: 1 }
            return sum + severityScore[i.severity]
          }, 0) / periodIndicators.length
        : 0

      trends.push({
        period: new Date(periodStart).toISOString().split('T')[0],
        indicatorCount: periodIndicators.length,
        threatCount: periodCorrelations.length,
        avgSeverity,
      })
    }

    return trends
  }

  /* ------------------------------------------------------------------ */
  /*  Helper Methods                                                    */
  /* ------------------------------------------------------------------ */

  private isIpDomainRelated(ip: string, domain: string): boolean {
    void ip
    void domain
    // This would typically involve DNS resolution
    // For now, use simple heuristic
    return false
  }

  private calculateCorrelationSeverity(indicators: ThreatIndicator[]): ThreatSeverity {
    if (indicators.length === 0) return 'info'

    const severityScores = indicators.map(i => {
      const scores = { critical: 5, high: 4, medium: 3, low: 2, info: 1 }
      return scores[i.severity]
    })

    const avgScore = severityScores.reduce((a, b) => a + b, 0) / severityScores.length

    if (avgScore >= 4.5) return 'critical'
    if (avgScore >= 3.5) return 'high'
    if (avgScore >= 2.5) return 'medium'
    if (avgScore >= 1.5) return 'low'
    return 'info'
  }

  private inferThreatType(indicators: ThreatIndicator[]): ThreatType {
    const tags = indicators.flatMap(i => i.tags)
    
    if (tags.some(t => t.includes('malware') || t.includes('trojan'))) return 'malware'
    if (tags.some(t => t.includes('phish') || t.includes('credential'))) return 'phishing'
    if (tags.some(t => t.includes('c2') || t.includes('botnet'))) return 'command_control'
    if (tags.some(t => t.includes('exfil') || t.includes('data'))) return 'data_exfiltration'
    if (tags.some(t => t.includes('ddos') || t.includes('flood'))) return 'ddos'
    if (tags.some(t => t.includes('vuln') || t.includes('cve'))) return 'vulnerability'
    
    return 'suspicious_activity'
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  getCorrelation(id: string): ThreatCorrelation | undefined {
    return this.correlationDatabase.get(id)
  }

  getAllCorrelations(): ThreatCorrelation[] {
    return Array.from(this.correlationDatabase.values())
  }

  getCampaign(id: string): Campaign | undefined {
    return this.campaignDatabase.get(id)
  }

  getAllCampaigns(): Campaign[] {
    return Array.from(this.campaignDatabase.values())
  }

  setAutoCorrelationEnabled(enabled: boolean): void {
    this.isAutoCorrelationEnabled = enabled
  }

  async forceCorrelationAnalysis(): Promise<void> {
    await this.performCorrelationAnalysis()
  }

  cleanupOldData(maxAge: number = 30 * 24 * 60 * 60 * 1000): void {
    const now = Date.now()
    
    // Clean up old indicators
    for (const [id, indicator] of this.indicatorDatabase) {
      if (now - indicator.lastSeen > maxAge) {
        this.indicatorDatabase.delete(id)
      }
    }

    // Clean up old correlations
    for (const [id, correlation] of this.correlationDatabase) {
      if (now - correlation.timestamp > maxAge) {
        this.correlationDatabase.delete(id)
      }
    }
  }
}

interface CorrelationRule {
  name: string
  type: ThreatCorrelation['correlationType']
  evaluate: (indicators: ThreatIndicator[]) => Promise<ThreatCorrelation[]>
  confidence: number
}

// Global singleton instance (globalThis-guarded to survive HMR)
const gTC = globalThis as typeof globalThis & { __threatCorrelationEngine?: ThreatCorrelationEngine }
const threatCorrelationEngine = gTC.__threatCorrelationEngine ?? new ThreatCorrelationEngine()
if (!gTC.__threatCorrelationEngine) gTC.__threatCorrelationEngine = threatCorrelationEngine

export { ThreatCorrelationEngine, threatCorrelationEngine }
