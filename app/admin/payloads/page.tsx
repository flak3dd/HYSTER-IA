import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export const dynamic = "force-dynamic"

export default function PayloadsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-heading-xl">Dynamic Payload Generation</h1>
        <p className="text-sm text-muted-foreground">
          Generate and manage custom payloads for various platforms and scenarios.
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Payload Templates</CardTitle>
                <CardDescription>Pre-configured payload templates for rapid deployment</CardDescription>
              </div>
              <Button>Generate New Payload</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: "Windows Executable", type: "EXE", status: "Ready", size: "2.4 MB" },
                { name: "Linux ELF", type: "ELF", status: "Ready", size: "1.8 MB" },
                { name: "macOS Bundle", type: "APP", status: "Building", size: "3.1 MB" },
                { name: "PowerShell Script", type: "PS1", status: "Ready", size: "12 KB" },
                { name: "Python Payload", type: "PY", status: "Ready", size: "8 KB" }
              ].map((payload, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">{payload.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Type: {payload.type} • Size: {payload.size}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={payload.status === "Ready" ? "default" : "secondary"}>
                      {payload.status}
                    </Badge>
                    <Button size="sm" variant="outline">Download</Button>
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