"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

export const dynamic = "force-dynamic"

export default function CoordinationPage() {
  const handleNewOperation = () => {
    toast.info("New Operation", {
      description: "Operation creation workflow coming soon. Use the AI Workflow Assistant for complex operations.",
    })
  }

  const handleViewDetails = (operationName: string) => {
    toast.info("Operation Details", {
      description: `Viewing details for "${operationName}" - detailed operation view coming soon.`,
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-heading-xl">Multi-Operator Coordination</h1>
        <p className="text-sm text-muted-foreground">
          Coordinate team operations and manage collaborative red team activities.
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Active Operations</CardTitle>
                <CardDescription>Manage ongoing team operations and assignments</CardDescription>
              </div>
              <Button onClick={handleNewOperation}>New Operation</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: "Phishing Assessment", status: "Active", team: "3 operators", progress: "67%" },
                { name: "Network Penetration", status: "Planning", team: "2 operators", progress: "15%" },
                { name: "Social Engineering", status: "Completed", team: "1 operator", progress: "100%" },
                { name: "Physical Security", status: "Scheduled", team: "2 operators", progress: "0%" },
                { name: "Red Team Exercise", status: "Active", team: "4 operators", progress: "45%" }
              ].map((operation, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">{operation.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Team: {operation.team} • Progress: {operation.progress}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={operation.status === "Active" ? "default" : operation.status === "Completed" ? "default" : "secondary"}>
                      {operation.status}
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => handleViewDetails(operation.name)}>View Details</Button>
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