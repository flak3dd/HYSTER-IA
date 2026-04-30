import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export const dynamic = "force-dynamic"

export default function TransportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-heading-xl">Multi-Transport Protocols</h1>
        <p className="text-sm text-muted-foreground">
          Configure and manage transport protocols for secure communication channels.
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Protocol Configuration</CardTitle>
            <CardDescription>Manage transport protocol settings and encryption</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: "Hysteria2", status: "Active", description: "UDP-based protocol with obfuscation" },
                { name: "Shadowsocks", status: "Active", description: "Lightweight proxy protocol" },
                { name: "VMess", status: "Inactive", description: "V2Ray protocol with encryption" },
                { name: "Trojan", status: "Active", description: "HTTPS camouflaging protocol" }
              ].map((protocol, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">{protocol.name}</h3>
                    <p className="text-sm text-muted-foreground">{protocol.description}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={protocol.status === "Active" ? "default" : "secondary"}>
                      {protocol.status}
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