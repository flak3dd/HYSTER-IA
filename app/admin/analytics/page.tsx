import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export const dynamic = "force-dynamic"

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-heading-xl">Behavioral Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Advanced behavioral analysis and anomaly detection for security monitoring.
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Analytics Modules</CardTitle>
                <CardDescription>Monitor and analyze behavioral patterns</CardDescription>
              </div>
              <Button>Generate Report</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: "User Behavior Analytics", status: "Active", alerts: "3", accuracy: "94%" },
                { name: "Network Traffic Analysis", status: "Active", alerts: "7", accuracy: "89%" },
                { name: "Endpoint Monitoring", status: "Running", alerts: "1", accuracy: "96%" },
                { name: "Anomaly Detection", status: "Active", alerts: "0", accuracy: "92%" },
                { name: "Threat Hunting", status: "Inactive", alerts: "—", accuracy: "—" }
              ].map((module, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">{module.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Active alerts: {module.alerts} • Accuracy: {module.accuracy}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={module.status === "Active" ? "default" : module.status === "Running" ? "default" : "secondary"}>
                      {module.status}
                    </Badge>
                    <Button size="sm" variant="outline">View Dashboard</Button>
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