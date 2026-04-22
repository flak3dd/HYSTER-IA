import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export const dynamic = "force-dynamic"

export default function ThreatPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Threat Intelligence Feeds</h1>
        <p className="text-sm text-muted-foreground">
          Integrated threat intelligence feeds and IOC management system.
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Intelligence Feeds</CardTitle>
                <CardDescription>Manage threat intelligence sources and indicators</CardDescription>
              </div>
              <Button>Add Feed</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: "Malware Bazaar", status: "Active", lastUpdate: "5 min ago", indicators: "1,247" },
                { name: "VirusTotal", status: "Active", lastUpdate: "2 min ago", indicators: "3,456" },
                { name: "Abuse.ch", status: "Active", lastUpdate: "10 min ago", indicators: "892" },
                { name: "PhishTank", status: "Inactive", lastUpdate: "1 hour ago", indicators: "567" },
                { name: "Custom Feed", status: "Active", lastUpdate: "15 min ago", indicators: "234" }
              ].map((feed, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">{feed.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Last update: {feed.lastUpdate} • Indicators: {feed.indicators}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={feed.status === "Active" ? "default" : "secondary"}>
                      {feed.status}
                    </Badge>
                    <Button size="sm" variant="outline">View Feed</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}