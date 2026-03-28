import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Building2, Plus, Users, Shield, MapPin } from "lucide-react"

export default function HoldingStructurePage() {
  const entities = [
    { name: "Datatrixs Holding Co.", type: "Parent Entity", status: "Active", children: 4 },
    { name: "Texas Operations LLC", type: "Subsidiary", status: "Active", children: 3 },
    { name: "Retail Assets Group", type: "Subsidiary", status: "Active", children: 12 },
  ]

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Building2 className="size-6 text-primary" />
            <h2 className="text-3xl font-bold tracking-tight text-white font-headline">Holding Structure</h2>
          </div>
          <p className="text-muted-foreground">Manage your corporate hierarchy and entity relationships.</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90">
          <Plus className="mr-2 size-4" /> Create New Entity
        </Button>
      </div>

      <div className="grid gap-6">
        {entities.map((entity, i) => (
          <Card key={i} className="bg-card/40 border-white/5 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-lg text-white">{entity.name}</CardTitle>
                <CardDescription className="text-xs uppercase tracking-wider font-bold text-primary/80">{entity.type}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 text-xs border-white/10">Manage</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mt-2">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
                  <Users className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Admin Users</p>
                    <p className="text-sm font-medium">12</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
                  <MapPin className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Locations</p>
                    <p className="text-sm font-medium">{entity.children}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
                  <Shield className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Security</p>
                    <p className="text-sm font-medium">Standard</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-primary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="text-sm font-bold">Hierarchy Visualization</CardTitle>
          <CardDescription className="text-xs">
            The structure above represents how data roll-ups are calculated for your global dashboard and AI analyst.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
