import { z } from 'zod'
import { threatCorrelationEngine } from './threat-correlation'
import { anomalyDetectionEngine } from './anomaly-detection'
import { orchestrationEngine } from './orchestration-engine'
import { predictiveCaching } from './predictive-caching'

/* ------------------------------------------------------------------ */
/*  Types & Schemas                                                   */
/* ------------------------------------------------------------------ */

export const ReportType = z.enum([
  'executive_summary',
  'technical_analysis',
  'threat_assessment',
  'performance_report',
  'anomaly_report',
  'correlation_report',
  'comprehensive',
])
export type ReportType = z.infer<typeof ReportType>

export const ReportFormat = z.enum(['json', 'markdown', 'html', 'pdf'])
export type ReportFormat = z.infer<typeof ReportFormat>

export interface Report {
  id: string
  type: ReportType
  format: ReportFormat
  title: string
  generatedAt: number
  period: {
    start: number
    end: number
  }
  content: string
  metadata: ReportMetadata
}

export interface ReportMetadata {
  author: string
  version: string
  classification: string
  dataSources: string[]
  indicators: number
  anomalies: number
  tasks: number
  confidence: number
}

export interface ReportSection {
  title: string
  content: string
  priority: number
  data?: unknown
}

/* ------------------------------------------------------------------ */
/*  Automated Reporting Engine                                          */
/* ------------------------------------------------------------------ */

class AutomatedReportingEngine {
  private reportHistory: Map<string, Report>
  private reportTemplates: Map<ReportType, ReportTemplate>
  private isAutoReportingEnabled: boolean
  private reportingInterval: NodeJS.Timeout | null

  constructor() {
    this.reportHistory = new Map()
    this.reportTemplates = new Map()
    this.isAutoReportingEnabled = true
    this.reportingInterval = null

    this.initializeTemplates()
    this.startAutoReporting()
  }

  /* ------------------------------------------------------------------ */
  /*  Initialization                                                    */
  /* ------------------------------------------------------------------ */

  private initializeTemplates(): void {
    this.reportTemplates.set('executive_summary', {
      name: 'Executive Summary',
      description: 'High-level overview for stakeholders',
      sections: ['overview', 'key_findings', 'risk_assessment', 'recommendations'],
      priority: ['critical', 'high'],
    })

    this.reportTemplates.set('technical_analysis', {
      name: 'Technical Analysis',
      description: 'Detailed technical findings and metrics',
      sections: ['methodology', 'findings', 'technical_details', 'data_analysis'],
      priority: ['medium', 'low'],
    })

    this.reportTemplates.set('threat_assessment', {
      name: 'Threat Assessment',
      description: 'Comprehensive threat intelligence analysis',
      sections: ['threat_landscape', 'indicators', 'campaigns', 'attribution'],
      priority: ['critical', 'high', 'medium'],
    })

    this.reportTemplates.set('performance_report', {
      name: 'Performance Report',
      description: 'System performance and optimization metrics',
      sections: ['overview', 'metrics', 'optimizations', 'trends'],
      priority: ['medium'],
    })

    this.reportTemplates.set('anomaly_report', {
      name: 'Anomaly Report',
      description: 'Detected anomalies and security events',
      sections: ['summary', 'anomalies', 'patterns', 'remediation'],
      priority: ['critical', 'high'],
    })

    this.reportTemplates.set('correlation_report', {
      name: 'Correlation Report',
      description: 'Threat correlation and relationship analysis',
      sections: ['overview', 'correlations', 'campaigns', 'insights'],
      priority: ['high', 'medium'],
    })

    this.reportTemplates.set('comprehensive', {
      name: 'Comprehensive Report',
      description: 'Complete analysis including all aspects',
      sections: ['executive_summary', 'threat_assessment', 'technical_analysis', 'performance_report', 'anomaly_report', 'correlation_report'],
      priority: ['critical', 'high', 'medium', 'low'],
    })
  }

  /* ------------------------------------------------------------------ */
  /*  Report Generation                                                 */
  /* ------------------------------------------------------------------ */

  async generateReport(
    type: ReportType,
    format: ReportFormat = 'markdown',
    period?: { start: number; end: number }
  ): Promise<Report> {
    const template = this.reportTemplates.get(type)
    if (!template) {
      throw new Error(`Unknown report type: ${type}`)
    }

    const defaultPeriod = {
      start: Date.now() - 86400000, // 24 hours ago
      end: Date.now(),
    }

    const reportPeriod = period || defaultPeriod

    // Gather data from all AI systems
    const systemData = await this.gatherSystemData(reportPeriod)

    // Generate report sections
    const sections = await this.generateSections(type, template.sections, systemData)

    // Format report content
    const content = this.formatReportContent(sections, format)

    // Create report metadata
    const metadata: ReportMetadata = {
      author: 'AI Autonomous System',
      version: '1.0',
      classification: 'Internal',
      dataSources: ['Threat Intelligence', 'Anomaly Detection', 'System Metrics', 'Task History'],
      indicators: systemData.threatIntelligence.indicators.length,
      anomalies: systemData.anomalies.length,
      tasks: systemData.tasks.length,
      confidence: this.calculateReportConfidence(systemData),
    }

    const report: Report = {
      id: `report_${type}_${Date.now()}`,
      type,
      format,
      title: `${template.name} - ${new Date(reportPeriod.end).toISOString().split('T')[0]}`,
      generatedAt: Date.now(),
      period: reportPeriod,
      content,
      metadata,
    }

    this.reportHistory.set(report.id, report)
    return report
  }

  private async gatherSystemData(period: { start: number; end: number }): Promise<SystemData> {
    const threatIntelligence = threatCorrelationEngine.generateThreatIntelligence()
    const anomalies = anomalyDetectionEngine.getAnomalies({
      since: period.start,
      resolved: false,
    })
    const tasks = orchestrationEngine.getAllTasks()
    const cacheStats = predictiveCaching.getCacheStats()
    const metrics = orchestrationEngine.getMetrics()

    return {
      threatIntelligence,
      anomalies,
      tasks,
      cacheStats,
      metrics,
      period,
    }
  }

  private async generateSections(
    type: ReportType,
    sectionNames: string[],
    data: SystemData
  ): Promise<ReportSection[]> {
    const sections: ReportSection[] = []

    for (const sectionName of sectionNames) {
      const section = await this.generateSection(sectionName, data)
      if (section) {
        sections.push(section)
      }
    }

    return sections.sort((a, b) => a.priority - b.priority)
  }

  private async generateSection(name: string, data: SystemData): Promise<ReportSection | null> {
    switch (name) {
      case 'overview':
        return this.generateOverviewSection(data)
      case 'key_findings':
        return this.generateKeyFindingsSection(data)
      case 'risk_assessment':
        return this.generateRiskAssessmentSection(data)
      case 'recommendations':
        return this.generateRecommendationsSection(data)
      case 'threat_landscape':
        return this.generateThreatLandscapeSection(data)
      case 'indicators':
        return this.generateIndicatorsSection(data)
      case 'campaigns':
        return this.generateCampaignsSection(data)
      case 'anomalies':
        return this.generateAnomaliesSection(data)
      case 'performance':
        return this.generatePerformanceSection(data)
      case 'trends':
        return this.generateTrendsSection(data)
      default:
        return null
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Section Generators                                                */
  /* ------------------------------------------------------------------ */

  private async generateOverviewSection(data: SystemData): Promise<ReportSection> {
    const content = `
# System Overview

**Report Period**: ${new Date(data.period.start).toISOString()} to ${new Date(data.period.end).toISOString()}

## Summary
- **Total Indicators**: ${data.threatIntelligence.indicators.length}
- **Active Campaigns**: ${data.threatIntelligence.summary.activeCampaigns}
- **Critical Threats**: ${data.threatIntelligence.summary.criticalThreats}
- **High Threats**: ${data.threatIntelligence.summary.highThreats}
- **Active Anomalies**: ${data.anomalies.length}
- **Completed Tasks**: ${data.tasks.filter(t => t.status === 'completed').length}

## System Status
- **CPU Usage**: ${data.metrics.cpuUsage.toFixed(1)}%
- **Memory Usage**: ${data.metrics.memoryUsage.toFixed(1)}%
- **Active Tasks**: ${data.metrics.activeTasks}
- **Cache Hit Rate**: ${(data.cacheStats.avgConfidence * 100).toFixed(1)}%
`

    return {
      title: 'Overview',
      content: content.trim(),
      priority: 1,
      data: {
        indicators: data.threatIntelligence.indicators.length,
        anomalies: data.anomalies.length,
        cpuUsage: data.metrics.cpuUsage,
        memoryUsage: data.metrics.memoryUsage,
      },
    }
  }

  private async generateKeyFindingsSection(data: SystemData): Promise<ReportSection> {
    const findings: string[] = []

    // Threat findings
    if (data.threatIntelligence.summary.criticalThreats > 0) {
      findings.push(`🚨 ${data.threatIntelligence.summary.criticalThreats} critical threats detected requiring immediate attention`)
    }

    // Anomaly findings
    const criticalAnomalies = data.anomalies.filter(a => a.severity === 'critical')
    if (criticalAnomalies.length > 0) {
      findings.push(`⚠️ ${criticalAnomalies.length} critical anomalies detected in system behavior`)
    }

    // Performance findings
    if (data.metrics.cpuUsage > 80) {
      findings.push(`📊 High CPU usage (${data.metrics.cpuUsage.toFixed(1)}%) may indicate performance issues`)
    }

    if (data.metrics.errorRate > 5) {
      findings.push(`❌ Elevated error rate (${data.metrics.errorRate.toFixed(1)}%) detected in operations`)
    }

    // Task findings
    const failedTasks = data.tasks.filter(t => t.status === 'failed')
    if (failedTasks.length > 0) {
      findings.push(`⚙️ ${failedTasks.length} tasks failed during the reporting period`)
    }

    const content = findings.length > 0
      ? findings.map(f => `- ${f}`).join('\n')
      : 'No significant findings during this reporting period.'

    return {
      title: 'Key Findings',
      content,
      priority: 2,
      data: { findings },
    }
  }

  private async generateRiskAssessmentSection(data: SystemData): Promise<ReportSection> {
    const riskScore = this.calculateRiskScore(data)
    let riskLevel = 'Low'
    if (riskScore > 80) riskLevel = 'Critical'
    else if (riskScore > 60) riskLevel = 'High'
    else if (riskScore > 40) riskLevel = 'Medium'

    const content = `
# Risk Assessment

**Overall Risk Level**: ${riskLevel} (${riskScore.toFixed(1)}/100)

## Risk Factors
- **Threat Density**: ${data.threatIntelligence.indicators.length} indicators
- **Critical Threats**: ${data.threatIntelligence.summary.criticalThreats}
- **System Anomalies**: ${data.anomalies.length}
- **Resource Pressure**: CPU ${data.metrics.cpuUsage.toFixed(1)}%, Memory ${data.metrics.memoryUsage.toFixed(1)}%
- **Operational Issues**: ${data.metrics.errorRate.toFixed(1)}% error rate

## Risk Breakdown
${this.generateRiskBreakdown(data)}
`

    return {
      title: 'Risk Assessment',
      content: content.trim(),
      priority: 3,
      data: { riskScore, riskLevel },
    }
  }

  private async generateRecommendationsSection(data: SystemData): Promise<ReportSection> {
    const recommendations: string[] = []

    // Security recommendations
    if (data.threatIntelligence.summary.criticalThreats > 0) {
      recommendations.push('🔒 Immediately investigate and mitigate critical threats')
    }

    // Performance recommendations
    if (data.metrics.cpuUsage > 80) {
      recommendations.push('⚡ Consider scaling resources or optimizing workloads')
    }

    // Anomaly recommendations
    const criticalAnomalies = data.anomalies.filter(a => a.severity === 'critical')
    if (criticalAnomalies.length > 0) {
      recommendations.push('🔍 Review critical anomalies and implement remediation plans')
    }

    // Task recommendations
    const failedTasks = data.tasks.filter(t => t.status === 'failed')
    if (failedTasks.length > 3) {
      recommendations.push('🛠️ Investigate recurring task failures and implement fixes')
    }

    // General recommendations
    recommendations.push('📈 Continue monitoring system metrics and threat intelligence')
    recommendations.push('🔄 Review and update security baselines based on current threat landscape')

    const content = recommendations.map(r => `- ${r}`).join('\n')

    return {
      title: 'Recommendations',
      content,
      priority: 4,
      data: { recommendations },
    }
  }

  private async generateThreatLandscapeSection(data: SystemData): Promise<ReportSection> {
    const summary = data.threatIntelligence.summary
    const content = `
# Threat Landscape

## Overview
- **Total Indicators**: ${summary.totalIndicators}
- **Active Campaigns**: ${summary.activeCampaigns}
- **Critical Threats**: ${summary.criticalThreats}
- **High Threats**: ${summary.highThreats}

## Threat Types
${Object.entries(summary.topThreatTypes)
  .filter(([, count]) => count > 0)
  .map(([type, count]) => `- **${type}**: ${count}`)
  .join('\n')}

## Top Sources
${Object.entries(summary.topSources)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 5)
  .map(([source, count]) => `- **${source}**: ${count}`)
  .join('\n')}
`

    return {
      title: 'Threat Landscape',
      content: content.trim(),
      priority: 2,
      data: summary,
    }
  }

  private async generateIndicatorsSection(data: SystemData): Promise<ReportSection> {
    const indicators = data.threatIntelligence.indicators.slice(0, 20) // Limit to 20
    const content = `
# Indicators of Compromise

## Recent Indicators (${indicators.length} displayed)
${indicators.map(i => `
- **${i.type.toUpperCase()}**: ${i.value}
  - Source: ${i.source}
  - Severity: ${i.severity}
  - Confidence: ${(i.confidence * 100).toFixed(1)}%
  - Tags: ${i.tags.join(', ') || 'None'}
`).join('')}
`

    return {
      title: 'Indicators',
      content: content.trim(),
      priority: 3,
      data: { indicators },
    }
  }

  private async generateCampaignsSection(data: SystemData): Promise<ReportSection> {
    const campaigns = data.threatIntelligence.campaigns
    const content = `
# Active Campaigns

## Campaign Summary
${campaigns.length === 0 ? 'No active campaigns detected.' : campaigns.map(c => `
### ${c.name}
- **Type**: ${c.threatType}
- **Severity**: ${c.severity}
- **Status**: ${c.status}
- **Indicators**: ${c.indicators.length}
- **Description**: ${c.description}
`).join('')}
`

    return {
      title: 'Campaigns',
      content: content.trim(),
      priority: 3,
      data: { campaigns },
    }
  }

  private async generateAnomaliesSection(data: SystemData): Promise<ReportSection> {
    const anomalies = data.anomalies.slice(0, 10) // Limit to 10
    const content = `
# Anomalies Detected

## Summary
- **Total Anomalies**: ${data.anomalies.length}
- **Critical**: ${data.anomalies.filter(a => a.severity === 'critical').length}
- **High**: ${data.anomalies.filter(a => a.severity === 'high').length}
- **Medium**: ${data.anomalies.filter(a => a.severity === 'medium').length}
- **Low**: ${data.anomalies.filter(a => a.severity === 'low').length}

## Recent Anomalies
${anomalies.map(a => `
### ${a.type} - ${a.severity}
- **Metric**: ${a.metric}
- **Value**: ${a.value.toFixed(2)}
- **Expected**: ${a.expectedValue.toFixed(2)}
- **Deviation**: ${a.deviation.toFixed(1)}%
- **Description**: ${a.description}
- **Suggestions**: ${a.suggestions.join(', ') || 'None'}
`).join('')}
`

    return {
      title: 'Anomalies',
      content: content.trim(),
      priority: 2,
      data: { anomalies },
    }
  }

  private async generatePerformanceSection(data: SystemData): Promise<ReportSection> {
    const content = `
# Performance Metrics

## System Resources
- **CPU Usage**: ${data.metrics.cpuUsage.toFixed(1)}%
- **Memory Usage**: ${data.metrics.memoryUsage.toFixed(1)}%
- **Active Tasks**: ${data.metrics.activeTasks}
- **Queued Tasks**: ${data.metrics.queuedTasks}

## Cache Performance
- **Access Patterns**: ${data.cacheStats.accessPatterns}
- **Predictions**: ${data.cacheStats.predictions}
- **Average Confidence**: ${(data.cacheStats.avgConfidence * 100).toFixed(1)}%

## Operational Metrics
- **Average Response Time**: ${data.metrics.averageResponseTime.toFixed(0)}ms
- **Error Rate**: ${data.metrics.errorRate.toFixed(1)}%
- **Cache Hit Rate**: ${(data.metrics.cacheHitRate * 100).toFixed(1)}%
`

    return {
      title: 'Performance',
      content: content.trim(),
      priority: 3,
      data: data.metrics,
    }
  }

  private async generateTrendsSection(data: SystemData): Promise<ReportSection> {
    const trends = data.threatIntelligence.summary.trends
    const content = `
# Trend Analysis

## 7-Day Trend
${trends.map(t => `
### ${t.period}
- **Indicators**: ${t.indicatorCount}
- **Threats**: ${t.threatCount}
- **Avg Severity**: ${t.avgSeverity.toFixed(2)}
`).join('')}
`

    return {
      title: 'Trends',
      content: content.trim(),
      priority: 4,
      data: { trends },
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Formatting & Utilities                                            */
  /* ------------------------------------------------------------------ */

  private formatReportContent(sections: ReportSection[], format: ReportFormat): string {
    switch (format) {
      case 'markdown':
        return sections.map(s => s.content).join('\n\n---\n\n')
      case 'json':
        return JSON.stringify(sections, null, 2)
      case 'html':
        return this.convertToHtml(sections)
      case 'pdf':
        return this.convertToPdf(sections) // Placeholder for PDF generation
      default:
        return sections.map(s => s.content).join('\n\n')
    }
  }

  private convertToHtml(sections: ReportSection[]): string {
    let html = '<html><head><title>AI Generated Report</title></head><body>'
    
    for (const section of sections) {
      html += `<section><h2>${section.title}</h2>`
      html += `<div>${section.content.replace(/\n/g, '<br>')}</div></section>`
    }
    
    html += '</body></html>'
    return html
  }

  private convertToPdf(sections: ReportSection[]): string {
    // Placeholder for PDF generation
    // Would typically use a library like pdfkit or puppeteer
    return sections.map(s => s.content).join('\n\n')
  }

  private calculateReportConfidence(data: SystemData): number {
    let confidence = 0.5 // Base confidence

    // Higher confidence with more data
    confidence += Math.min(data.threatIntelligence.indicators.length / 100, 0.2)
    confidence += Math.min(data.tasks.length / 50, 0.1)
    confidence += Math.min(data.cacheStats.accessPatterns / 50, 0.1)

    // Lower confidence with high error rates
    confidence -= Math.min(data.metrics.errorRate / 10, 0.1)

    return Math.max(0, Math.min(1, confidence))
  }

  private calculateRiskScore(data: SystemData): number {
    let score = 0

    // Threat contribution
    score += data.threatIntelligence.summary.criticalThreats * 15
    score += data.threatIntelligence.summary.highThreats * 10
    score += data.threatIntelligence.summary.mediumThreats * 5

    // Anomaly contribution
    score += data.anomalies.filter(a => a.severity === 'critical').length * 10
    score += data.anomalies.filter(a => a.severity === 'high').length * 5

    // System stress contribution
    score += Math.max(0, data.metrics.cpuUsage - 70) * 0.3
    score += Math.max(0, data.metrics.memoryUsage - 80) * 0.2
    score += data.metrics.errorRate * 2

    return Math.min(100, score)
  }

  private generateRiskBreakdown(data: SystemData): string {
    const breakdowns: string[] = []

    const threatScore = data.threatIntelligence.summary.criticalThreats * 15 +
                       data.threatIntelligence.summary.highThreats * 10 +
                       data.threatIntelligence.summary.mediumThreats * 5
    breakdowns.push(`Threat Level: ${threatScore.toFixed(1)}/100`)

    const anomalyScore = data.anomalies.filter(a => a.severity === 'critical').length * 10 +
                         data.anomalies.filter(a => a.severity === 'high').length * 5
    breakdowns.push(`Anomaly Score: ${anomalyScore.toFixed(1)}/100`)

    const systemScore = Math.max(0, data.metrics.cpuUsage - 70) * 0.3 +
                       Math.max(0, data.metrics.memoryUsage - 80) * 0.2 +
                       data.metrics.errorRate * 2
    breakdowns.push(`System Stress: ${systemScore.toFixed(1)}/100`)

    return breakdowns.map(b => `- ${b}`).join('\n')
  }

  /* ------------------------------------------------------------------ */
  /*  Automated Reporting                                               */
  /* ------------------------------------------------------------------ */

  private startAutoReporting(): void {
      this.reportingInterval = setInterval(async () => {
      if (!this.isAutoReportingEnabled) return

      try {
        await this.runScheduledReports()
      } catch (error) {
        console.error('Auto-reporting error:', error)
      }
    }, 86400000) // Daily
  }

  private async runScheduledReports(): Promise<void> {
    // Generate daily comprehensive report
    await this.generateReport('comprehensive', 'markdown')
    
    // Generate daily threat assessment
    await this.generateReport('threat_assessment', 'markdown')
    
    console.log('📄 Scheduled reports generated successfully')
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  getReport(id: string): Report | undefined {
    return this.reportHistory.get(id)
  }

  getAllReports(): Report[] {
    return Array.from(this.reportHistory.values()).sort((a, b) => b.generatedAt - a.generatedAt)
  }

  getReportsByType(type: ReportType): Report[] {
    return this.getAllReports().filter(r => r.type === type)
  }

  setAutoReportingEnabled(enabled: boolean): void {
    this.isAutoReportingEnabled = enabled
  }

  async generateScheduledReports(): Promise<void> {
    await this.runScheduledReports()
  }

  cleanupOldReports(maxAge: number = 30 * 24 * 60 * 60 * 1000): void {
    const now = Date.now()
    
    for (const [id, report] of this.reportHistory) {
      if (now - report.generatedAt > maxAge) {
        this.reportHistory.delete(id)
      }
    }
  }
}

interface ReportTemplate {
  name: string
  description: string
  sections: string[]
  priority: string[]
}

interface SystemData {
  threatIntelligence: ReturnType<typeof threatCorrelationEngine.generateThreatIntelligence>
  anomalies: ReturnType<typeof anomalyDetectionEngine.getAnomalies>
  tasks: ReturnType<typeof orchestrationEngine.getAllTasks>
  cacheStats: ReturnType<typeof predictiveCaching.getCacheStats>
  metrics: ReturnType<typeof orchestrationEngine.getMetrics>
  period: { start: number; end: number }
}

// Global singleton instance
const automatedReporting = new AutomatedReportingEngine()

export { AutomatedReportingEngine, automatedReporting }
