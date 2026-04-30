import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export const dynamic = "force-dynamic"

export default function NetworkPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-heading-xl">Passive Network Mapping</h1>
        <p className="text-sm text-muted-foreground">
          Passive network reconnaissance and topology mapping capabilities.
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Network Scans</CardTitle>
                <CardDescription>Manage passive network discovery operations</CardDescription>
              </div>
              <Button>Start New Scan</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: "Internal Network Scan", status: "Completed", duration: "45 min", hosts: "1,247", ports: "8,934" },
                { name: "Subnet Enumeration", status: "Running", duration: "12 min", hosts: "567", ports: "2,145" },
                { name: "Cloud Network Discovery", status: "Scheduled", duration: "—", hosts: "—", ports: "—" },
                { name: "Wireless Network Mapping", status: "Completed", duration: "30 min", hosts: "89", ports: "567" },
                { name: "VPN Detection", status: "Active", duration: "Continuous", hosts: "234", ports: "1,024" }
              ].map((scan, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">{scan.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Duration: {scan.duration} • Hosts: {scan.hosts} • Ports: {scan.ports}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={scan.status === "Completed" ? "default" : scan.status === "Running" ? "default" : "secondary"}>
                      {scan.status}
                    </Badge>
                    <Button size="sm" variant="outline">View Details</Button>
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