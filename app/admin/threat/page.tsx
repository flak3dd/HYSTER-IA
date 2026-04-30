"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export const dynamic = "force-dynamic"

interface ThreatIntelResult {
  success: boolean
  malicious: boolean
  detectionPercentage?: number
  reputation?: number
  severity?: string
  pulseCount?: number
  [key: string]: unknown
}

export default function ThreatPage() {
  const [source, setSource] = useState("virustotal")
  const [indicatorType, setIndicatorType] = useState("domain")
  const [indicator, setIndicator] = useState("")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ThreatIntelResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleAnalysis = async () => {
    if (!indicator.trim()) {
      setError("Please enter an indicator")
      return
    }

    setLoading(true)
    setError(null)
    setResults(null)

    try {
      let url = ""
      const params = new URLSearchParams()

      if (source === "virustotal") {
        url = `/api/admin/threatintel/virustotal`
        params.append("type", indicatorType)
        params.append("indicator", indicator.trim())
      } else if (source === "abusech") {
        url = `/api/admin/threatintel/abusech`
        params.append("feed", "malwarebazaar")
        params.append("type", indicatorType === "hash" ? "hash" : "ioc")
        params.append("query", indicator.trim())
      } else if (source === "alienvault") {
        url = `/api/admin/threatintel/alienvault`
        params.append("type", indicatorType)
        params.append("indicator", indicator.trim())
      }

      const response = await fetch(`${url}?${params}`)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || "Threat intelligence analysis failed")
      }

      const data = await response.json()
      setResults(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const getIndicatorTypeOptions = () => {
    switch (source) {
      case "virustotal":
        return [
          { value: "ip", label: "IP Address" },
          { value: "domain", label: "Domain" },
          { value: "url", label: "URL" },
          { value: "hash", label: "File Hash" },
        ]
      case "abusech":
        return [
          { value: "hash", label: "File Hash" },
          { value: "url", label: "URL" },
          { value: "ioc", label: "IOC" },
        ]
      case "alienvault":
        return [
          { value: "ip", label: "IP Address" },
          { value: "domain", label: "Domain" },
          { value: "url", label: "URL" },
          { value: "hash", label: "File Hash" },
        ]
      default:
        return []
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-heading-xl">Threat Intelligence Feeds</h1>
        <p className="text-sm text-muted-foreground">
          Integrated threat intelligence feeds and IOC management system.
        </p>
      </div>

      <div className="grid gap-6">
        {/* Analysis Card */}
        <Card>
          <CardHeader>
            <CardTitle>Indicator Analysis</CardTitle>
            <CardDescription>
              Analyze IPs, domains, URLs, and file hashes across multiple threat intelligence sources
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="source">Threat Intel Source</Label>
                <select
                  id="source"
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value)
                    setResults(null)
                  }}
                  className="w-full mt-1 p-2 border rounded-md bg-background"
                  disabled={loading}
                >
                  <option value="virustotal">VirusTotal</option>
                  <option value="abusech">Abuse.ch</option>
                  <option value="alienvault">AlienVault OTX</option>
                </select>
              </div>
              <div>
                <Label htmlFor="type">Indicator Type</Label>
                <select
                  id="type"
                  value={indicatorType}
                  onChange={(e) => {
                    setIndicatorType(e.target.value)
                    setResults(null)
                  }}
                  className="w-full mt-1 p-2 border rounded-md bg-background"
                  disabled={loading}
                >
                  {getIndicatorTypeOptions().map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label htmlFor="indicator">Indicator</Label>
              <Input
                id="indicator"
                placeholder={indicatorType === "domain" ? "example.com" : indicatorType === "ip" ? "8.8.8.8" : indicatorType === "hash" ? "44d88612fea8a8f36de82e1278abb02f" : "https://example.com"}
                value={indicator}
                onChange={(e) => setIndicator(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAnalysis()}
                disabled={loading}
                className="mt-1"
              />
            </div>

            <Button onClick={handleAnalysis} disabled={loading}>
              {loading ? "Analyzing..." : "Analyze"}
            </Button>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {results && (
              <div className="space-y-4 mt-4">
                <div className="flex items-center gap-4">
                  <Badge variant={results.malicious ? "destructive" : "default"}>
                    {results.malicious ? "Malicious" : "Clean"}
                  </Badge>
                  {results.detectionPercentage !== undefined && (
                    <span className="text-sm">
                      Detection: {results.detectionPercentage}%
                    </span>
                  )}
                  {results.reputation !== undefined && (
                    <span className="text-sm">
                      Reputation: {results.reputation}
                    </span>
                  )}
                  {results.severity && (
                    <span className="text-sm">
                      Severity: {results.severity}
                    </span>
                  )}
                </div>

                <div className="p-3 bg-muted rounded-md">
                  <pre className="text-xs overflow-x-auto">
                    {JSON.stringify(results, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Feed Status Card */}
        <Card>
          <CardHeader>
            <CardTitle>Intelligence Feed Status</CardTitle>
            <CardDescription>Available threat intelligence sources</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: "VirusTotal", status: "Ready", description: "File, URL, domain, and IP analysis" },
                { name: "Abuse.ch MalwareBazaar", status: "Ready", description: "Malware sample analysis" },
                { name: "Abuse.ch URLhaus", status: "Ready", description: "Malicious URL database" },
                { name: "Abuse.ch ThreatFox", status: "Ready", description: "IOC indicator database" },
                { name: "AlienVault OTX", status: "Ready", description: "Community threat intelligence" },
              ].map((feed, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">{feed.name}</h3>
                    <p className="text-sm text-muted-foreground">{feed.description}</p>
                  </div>
                  <Badge variant={feed.status === "Ready" ? "default" : "secondary"}>
                    {feed.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}