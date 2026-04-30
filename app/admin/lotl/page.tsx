import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export const dynamic = "force-dynamic"

export default function LotlPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-heading-xl">Living-off-the-Land Arsenal</h1>
        <p className="text-sm text-muted-foreground">
          Curated collection of legitimate tools and binaries for stealth operations.
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>LotL Tools Registry</CardTitle>
                <CardDescription>Manage legitimate tools for covert operations</CardDescription>
              </div>
              <Button>Add Tool</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: "PowerShell", category: "Scripting", status: "Available", risk: "Medium", usage: "High" },
                { name: "WMIC", category: "System Info", status: "Available", risk: "Low", usage: "Medium" },
                { name: "Certutil", category: "File Operations", status: "Available", risk: "Medium", usage: "High" },
                { name: "Bitsadmin", category: "File Transfer", status: "Available", risk: "High", usage: "Medium" },
                { name: "Schtasks", category: "Scheduling", status: "Available", risk: "High", usage: "High" }
              ].map((tool, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">{tool.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Category: {tool.category} • Risk Level: {tool.risk} • Usage: {tool.usage}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={tool.status === "Available" ? "default" : "secondary"}>
                      {tool.status}
                    </Badge>
                    <Button size="sm" variant="outline">Configure</Button>
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