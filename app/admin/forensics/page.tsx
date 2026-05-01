"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

export const dynamic = "force-dynamic"

export default function ForensicsPage() {
  const handleDeployModule = () => {
    toast.info("Deploy Module", {
      description: "Module deployment interface coming soon. Use ShadowGrok Agent for anti-forensic operations.",
    })
  }

  const handleExecuteModule = (moduleName: string) => {
    toast.info("Execute Module", {
      description: `Executing "${moduleName}" - module execution interface coming soon. Use ShadowGrok Agent for now.`,
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-heading-xl">Anti-Forensics Toolkit</h1>
        <p className="text-sm text-muted-foreground">
          Tools and techniques for evidence obfuscation and anti-forensic operations.
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Anti-Forensics Modules</CardTitle>
                <CardDescription>Manage anti-forensic tools and techniques</CardDescription>
              </div>
              <Button onClick={handleDeployModule}>Deploy Module</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: "Log Wiping", status: "Ready", effectiveness: "High", lastUsed: "2 hours ago" },
                { name: "File Shredding", status: "Active", effectiveness: "Very High", lastUsed: "1 hour ago" },
                { name: "Timestamp Manipulation", status: "Ready", effectiveness: "Medium", lastUsed: "1 day ago" },
                { name: "Memory Wiping", status: "Ready", effectiveness: "High", lastUsed: "3 hours ago" },
                { name: "Registry Cleaning", status: "Active", effectiveness: "Medium", lastUsed: "30 min ago" }
              ].map((module, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">{module.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Effectiveness: {module.effectiveness} • Last used: {module.lastUsed}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={module.status === "Active" ? "default" : "secondary"}>
                      {module.status}
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => handleExecuteModule(module.name)}>Execute</Button>
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