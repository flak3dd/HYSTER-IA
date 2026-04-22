import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export const dynamic = "force-dynamic"

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Automated Reporting System</h1>
        <p className="text-sm text-muted-foreground">
          Generate comprehensive reports and documentation for red team operations.
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Generated Reports</CardTitle>
                <CardDescription>Manage and view automated operation reports</CardDescription>
              </div>
              <Button>Generate Report</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: "Executive Summary", type: "PDF", status: "Ready", generated: "2 hours ago", size: "2.4 MB" },
                { name: "Technical Findings", type: "DOCX", status: "Ready", generated: "1 hour ago", size: "5.1 MB" },
                { name: "Vulnerability Assessment", type: "XLSX", status: "Generating", generated: "—", size: "—" },
                { name: "Compliance Report", type: "PDF", status: "Ready", generated: "1 day ago", size: "1.8 MB" },
                { name: "Timeline Analysis", type: "PDF", status: "Scheduled", generated: "—", size: "—" }
              ].map((report, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">{report.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Type: {report.type} • Generated: {report.generated} • Size: {report.size}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={report.status === "Ready" ? "default" : report.status === "Generating" ? "default" : "secondary"}>
                      {report.status}
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