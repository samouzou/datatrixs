import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, MoreVertical, RefreshCw, Upload, FileText } from "lucide-react"
import { mockLocations } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

export default function LocationsPage() {
  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-white font-headline">Manage Locations</h2>
          <p className="text-muted-foreground">Portfolio of retail tire shops under Datatrixs Holding Co.</p>
        </div>
        <Button className="bg-accent text-background hover:bg-accent/90">
          <Plus className="mr-2 size-4" /> Add New Location
        </Button>
      </div>

      <div className="grid gap-6">
        {mockLocations.map((loc) => (
          <Card key={loc.id} className="bg-card/50 border-white/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-xl">{loc.name}</CardTitle>
                <CardDescription>{loc.address}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="text-muted-foreground"><MoreVertical className="size-4" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Integration</p>
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "size-2 rounded-full",
                      loc.integrationStatus === 'connected' ? "bg-accent" : "bg-destructive"
                    )} />
                    <span className="text-sm font-medium">{loc.integrationType}</span>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Last Data Sync</p>
                  <p className="text-sm">{loc.lastSync}</p>
                </div>
                
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Financial Health</p>
                  <div className="flex items-center gap-1">
                    <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-accent w-3/4" />
                    </div>
                    <span className="text-xs text-accent">Good</span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" className="h-8 text-xs border-white/10 hover:bg-white/5">
                    <RefreshCw className="mr-2 size-3" /> Sync
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 text-xs border-white/10 hover:bg-white/5">
                    <Upload className="mr-2 size-3" /> Upload Excel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-secondary/20 border-secondary/30">
          <CardHeader>
            <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center mb-2">
              <RefreshCw className="size-5 text-primary" />
            </div>
            <CardTitle>Automatic Ingestion</CardTitle>
            <CardDescription>
              Connect your locations' QuickBooks or NetSuite accounts for real-time financial normalization and categorization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="link" className="text-primary p-0">Learn about our standardized schema →</Button>
          </CardContent>
        </Card>
        
        <Card className="bg-accent/5 border-accent/20">
          <CardHeader>
            <div className="size-10 rounded-full bg-accent/20 flex items-center justify-center mb-2">
              <FileText className="size-5 text-accent" />
            </div>
            <CardTitle>Legacy Data Upload</CardTitle>
            <CardDescription>
              Locations using Excel or manual accounting can upload CSV files. Our AI will automatically map headers to your global metrics.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="link" className="text-accent p-0">Download upload template →</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}