import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export const dynamic = "force-dynamic"

export default function OSINTPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">OSINT Integration</h1>
        <p className="text-sm text-muted-foreground">
          Automated Open Source Intelligence gathering and analysis tools.
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Active OSINT Modules</CardTitle>
                <CardDescription>Configure and manage intelligence gathering sources</CardDescription>
              </div>
              <Button>New OSINT Task</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: "Domain Enumeration", status: "Active", lastRun: "2 hours ago", results: "245 domains" },
                { name: "Social Media Analysis", status: "Active", lastRun: "1 hour ago", results: "89 profiles" },
                { name: "Network Reconnaissance", status: "Running", lastRun: "15 min ago", results: "1,247 hosts" },
                { name: "Email Harvesting", status: "Inactive", lastRun: "1 day ago", results: "567 emails" },
                { name: "Dark Web Monitoring", status: "Active", lastRun: "30 min ago", results: "12 mentions" }
              ].map((module, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">{module.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Last run: {module.lastRun} • Results: {module.results}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={module.status === "Active" ? "default" : module.status === "Running" ? "default" : "secondary"}>
                      {module.status}
                    </Badge>
                    <Button size="sm" variant="outline">View Results</Button>
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