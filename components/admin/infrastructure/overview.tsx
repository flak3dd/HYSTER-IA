"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

interface NodeStatus {
  id: string
  name: string
  status: "running" | "stopped" | "errored"
  region: string
  provider: string
  lastHeartbeat: string
  uptime: string
}

export function InfrastructureOverview() {
  const [nodes, setNodes] = useState<NodeStatus[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simulate loading infrastructure data
    const loadInfrastructure = async () => {
      setLoading(true)
      // Mock data - in production this would fetch from API
      const mockNodes: NodeStatus[] = [
        {
          id: "node-001",
          name: "US-East-Primary",
          status: "running",
          region: "us-east",
          provider: "AWS",
          lastHeartbeat: "2 min ago",
          uptime: "5d 14h 32m"
        },
        {
          id: "node-002", 
          name: "EU-West-Backup",
          status: "stopped",
          region: "eu-west",
          provider: "GCP",
          lastHeartbeat: "15 min ago",
          uptime: "0d 0h 0m"
        },
        {
          id: "node-003",
          name: "Asia-Pacific-Edge",
          status: "running", 
          region: "ap-south",
          provider: "Azure",
          lastHeartbeat: "1 min ago",
          uptime: "12d 8h 45m"
        }
      ]
      
      setTimeout(() => {
        setNodes(mockNodes)
        setLoading(false)
      }, 1000)
    }

    loadInfrastructure()
  }, [])

  const handleNodeAction = (nodeId: string, action: string) => {
    toast.success(`Node ${nodeId}: ${action} action initiated`)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running": return "bg-green-500"
      case "stopped": return "bg-gray-500" 
      case "errored": return "bg-red-500"
      default: return "bg-gray-500"
    }
  }

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "running": return "default"
      case "stopped": return "secondary"
      case "errored": return "destructive"
      default: return "secondary"
    }
  }

  if (loading) {
    return (
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Infrastructure Nodes</CardTitle>
            <CardDescription>Loading infrastructure status...</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="animate-pulse space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-gray-200 rounded"></div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Nodes</CardDescription>
            <CardTitle className="text-3xl font-bold">{nodes.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Across all regions
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Running</CardDescription>
            <CardTitle className="text-3xl font-bold text-green-600">
              {nodes.filter(n => n.status === 'running').length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Active nodes
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Stopped</CardDescription>
            <CardTitle className="text-3xl font-bold text-gray-600">
              {nodes.filter(n => n.status === 'stopped').length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Inactive nodes
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Regions</CardDescription>
            <CardTitle className="text-3xl font-bold">
              {new Set(nodes.map(n => n.region)).size}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Geographic distribution
          </CardContent>
        </Card>
      </div>

      {/* Nodes List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Infrastructure Nodes</CardTitle>
              <CardDescription>Manage your deployed infrastructure nodes</CardDescription>
            </div>
            <Button>Add Node</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {nodes.map((node) => (
              <div key={node.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(node.status)}`}></div>
                  <div>
                    <h3 className="font-medium">{node.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {node.region} • {node.provider} • Last seen: {node.lastHeartbeat}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant={getStatusVariant(node.status)}>
                    {node.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {node.uptime}
                  </span>
                  <div className="flex space-x-1">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleNodeAction(node.id, "restart")}
                    >
                      Restart
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleNodeAction(node.id, "configure")}
                    >
                      Configure
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}