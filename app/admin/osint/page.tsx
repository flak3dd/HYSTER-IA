"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"

export const dynamic = "force-dynamic"

interface DomainEnumResult {
  domain: string
  subdomains: string[]
  sources: Array<{
    domain: string
    subdomains: string[]
    source: string
    timestamp: number
  }>
  dnsRecords: Array<{
    type: string
    name: string
    value: string
    ttl?: number
  }>
  whois?: {
    domain: string
    registrar?: string
    createdDate?: string
    expiryDate?: string
    status?: string[]
    nameServers?: string[]
    registrant?: {
      name?: string
      organization?: string
      email?: string
    }
    raw?: string
  }
  timestamp: number
}

export default function OSINTPage() {
  const [domain, setDomain] = useState("")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<DomainEnumResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const [options, setOptions] = useState({
    includeCrtSh: true,
    includeDnsEnum: true,
    includeWildcardCheck: true,
    includeWhois: true,
    includeBruteForce: false,
  })

  const handleDomainEnum = async () => {
    if (!domain.trim()) {
      setError("Please enter a domain")
      return
    }

    setLoading(true)
    setError(null)
    setResults(null)

    try {
      const params = new URLSearchParams({
        domain: domain.trim(),
        includeCrtSh: options.includeCrtSh.toString(),
        includeDnsEnum: options.includeDnsEnum.toString(),
        includeWildcardCheck: options.includeWildcardCheck.toString(),
        includeWhois: options.includeWhois.toString(),
        includeBruteForce: options.includeBruteForce.toString(),
      })

      const response = await fetch(`/api/admin/osint/domain?${params}`)
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || "Domain enumeration failed")
      }

      const data = await response.json()
      setResults(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-heading-xl">OSINT Integration</h1>
        <p className="text-sm text-muted-foreground">
          Automated Open Source Intelligence gathering and analysis tools.
        </p>
      </div>

      <div className="grid gap-6">
        {/* Domain Enumeration Card */}
        <Card>
          <CardHeader>
            <CardTitle>Domain Enumeration</CardTitle>
            <CardDescription>
              Discover subdomains, DNS records, and WHOIS information for a target domain
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="example.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleDomainEnum()}
                disabled={loading}
              />
              <Button onClick={handleDomainEnum} disabled={loading}>
                {loading ? "Enumerating..." : "Enumerate"}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="crtsh"
                  checked={options.includeCrtSh}
                  onCheckedChange={(checked: boolean) =>
                    setOptions({ ...options, includeCrtSh: checked })
                  }
                />
                <Label htmlFor="crtsh">Certificate Transparency (crt.sh)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="dns"
                  checked={options.includeDnsEnum}
                  onCheckedChange={(checked: boolean) =>
                    setOptions({ ...options, includeDnsEnum: checked })
                  }
                />
                <Label htmlFor="dns">DNS Records</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="wildcard"
                  checked={options.includeWildcardCheck}
                  onCheckedChange={(checked: boolean) =>
                    setOptions({ ...options, includeWildcardCheck: checked })
                  }
                />
                <Label htmlFor="wildcard">Wildcard Check</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="whois"
                  checked={options.includeWhois}
                  onCheckedChange={(checked: boolean) =>
                    setOptions({ ...options, includeWhois: checked })
                  }
                />
                <Label htmlFor="whois">WHOIS Lookup</Label>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {results && (
              <div className="space-y-4 mt-4">
                {/* Subdomains */}
                <div>
                  <h3 className="font-medium mb-2">Subdomains ({results.subdomains.length})</h3>
                  <div className="p-3 bg-muted rounded-md max-h-60 overflow-y-auto">
                    <div className="grid grid-cols-3 gap-2">
                      {results.subdomains.map((subdomain, index) => (
                        <div key={index} className="text-sm font-mono">
                          {subdomain}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* DNS Records */}
                {results.dnsRecords.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-2">DNS Records ({results.dnsRecords.length})</h3>
                    <div className="p-3 bg-muted rounded-md max-h-60 overflow-y-auto">
                      <div className="space-y-2">
                        {results.dnsRecords.map((record, index) => (
                          <div key={index} className="text-sm font-mono flex gap-2">
                            <span className="font-bold text-blue-600 w-16">{record.type}</span>
                            <span className="flex-1">{record.name}</span>
                            <span className="text-muted-foreground">{record.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* WHOIS */}
                {results.whois && (
                  <div>
                    <h3 className="font-medium mb-2">WHOIS Information</h3>
                    <div className="p-3 bg-muted rounded-md space-y-2">
                      {results.whois.registrar && (
                        <div className="text-sm">
                          <span className="font-medium">Registrar:</span> {results.whois.registrar}
                        </div>
                      )}
                      {results.whois.createdDate && (
                        <div className="text-sm">
                          <span className="font-medium">Created:</span> {results.whois.createdDate}
                        </div>
                      )}
                      {results.whois.expiryDate && (
                        <div className="text-sm">
                          <span className="font-medium">Expires:</span> {results.whois.expiryDate}
                        </div>
                      )}
                      {results.whois.nameServers && results.whois.nameServers.length > 0 && (
                        <div className="text-sm">
                          <span className="font-medium">Name Servers:</span>{" "}
                          {results.whois.nameServers.join(", ")}
                        </div>
                      )}
                      {results.whois.registrant && (
                        <div className="text-sm">
                          <span className="font-medium">Registrant:</span>{" "}
                          {[
                            results.whois.registrant.name,
                            results.whois.registrant.organization,
                            results.whois.registrant.email,
                          ]
                            .filter(Boolean)
                            .join(" - ")}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active OSINT Modules Card */}
        <Card>
          <CardHeader>
            <CardTitle>OSINT Module Status</CardTitle>
            <CardDescription>Available intelligence gathering modules</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: "Domain Enumeration", status: "Ready", description: "Subdomain discovery, DNS enumeration, WHOIS" },
                { name: "Social Media Analysis", status: "Coming Soon", description: "Twitter/X, LinkedIn integration" },
                { name: "Email Harvesting", status: "Coming Soon", description: "Hunter.io, pattern-based discovery" },
                { name: "Dark Web Monitoring", status: "Coming Soon", description: "Tor integration, breach alerts" },
              ].map((module, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">{module.name}</h3>
                    <p className="text-sm text-muted-foreground">{module.description}</p>
                  </div>
                  <Badge variant={module.status === "Ready" ? "default" : "secondary"}>
                    {module.status}
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
