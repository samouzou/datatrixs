'use client';

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { 
  Database, 
  Cloud, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Settings2,
  Plus,
  ArrowRight
} from "lucide-react"

export default function IntegrationsPage() {
  const integrations = [
    {
      id: "qb",
      name: "QuickBooks Online",
      description: "Sync accounts, transactions, and aging reports automatically.",
      status: "connected",
      type: "cloud",
      lastSync: "2 hours ago"
    },
    {
      id: "ns",
      name: "Oracle NetSuite",
      description: "Enterprise-grade ERP integration for multi-subsidiary holdings.",
      status: "disconnected",
      type: "cloud",
      lastSync: "N/A"
    },
    {
      id: "intacct",
      name: "Sage Intacct",
      description: "Multi-dimensional GL with native class, department, and project tracking — ideal for biotech and life sciences.",
      status: "disconnected",
      type: "cloud",
      lastSync: "N/A"
    },
    {
      id: "excel",
      name: "Excel / CSV Loader",
      description: "Manual upload for locations using legacy or custom accounting.",
      status: "connected",
      type: "manual",
      lastSync: "1 day ago"
    }
  ]

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Database className="size-6 text-primary" />
            <h2 className="text-3xl font-bold tracking-tight text-white font-headline">Data Integrations</h2>
          </div>
          <p className="text-muted-foreground">Connect and manage your locations' financial data sources.</p>
        </div>
        <Button className="bg-accent text-background hover:bg-accent/90">
          <Plus className="mr-2 size-4" /> Add Connection
        </Button>
      </div>

      <div className="grid gap-6">
        {integrations.map((int) => (
          <Card key={int.id} className="bg-card/40 border-white/5 backdrop-blur-sm overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-4">
                <div className="size-12 rounded-xl bg-muted/50 flex items-center justify-center border border-white/5">
                  <Cloud className="size-6 text-muted-foreground" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg text-white">{int.name}</CardTitle>
                    {int.status === 'connected' ? (
                      <Badge variant="outline" className="text-[10px] bg-accent/10 text-accent border-accent/20">
                        <CheckCircle2 className="size-3 mr-1" /> Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] bg-muted/20 text-muted-foreground border-white/5">
                        Not Connected
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-sm mt-1">{int.description}</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-9 border-white/10 bg-white/5">
                  <Settings2 className="size-4 mr-2" /> Configure
                </Button>
                {int.status === 'connected' ? (
                  <Button size="sm" className="h-9 bg-primary">
                    <RefreshCw className="size-4 mr-2" /> Sync Now
                  </Button>
                ) : (
                  <Button size="sm" className="h-9 bg-accent text-background hover:bg-accent/90">
                    Connect
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-4 border-t border-white/5 bg-white/5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-6">
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground uppercase tracking-wider font-bold text-[10px]">Connection Type</span>
                    <span className="text-white font-medium capitalize">{int.type}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground uppercase tracking-wider font-bold text-[10px]">Last Sync</span>
                    <span className="text-white font-medium">{int.lastSync}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center space-x-2">
                    <Switch id={`${int.id}-auto`} defaultChecked={int.status === 'connected'} />
                    <Label htmlFor={`${int.id}-auto`} className="text-[10px] text-muted-foreground">Auto-Sync</Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <RefreshCw className="size-5 text-primary" />
              Global Sync Settings
            </CardTitle>
            <CardDescription>
              Control how often data is refreshed across all active connections.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded bg-background/50 border border-white/5">
              <div className="space-y-0.5">
                <Label className="text-sm">Real-time Webhooks</Label>
                <p className="text-xs text-muted-foreground">Sync immediately when changes occur in QuickBooks.</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between p-3 rounded bg-background/50 border border-white/5">
              <div className="space-y-0.5">
                <Label className="text-sm">Daily Reconciliation</Label>
                <p className="text-xs text-muted-foreground">Run a full audit every night at 2:00 AM.</p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-accent/5 border-accent/20">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="size-5 text-accent" />
              Normalization Engine
            </CardTitle>
            <CardDescription>
              Our AI automatically maps location-specific GL codes to your global schema.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Currently using <span className="text-white font-bold">Standardized Chart of Accounts (COA) v2.4</span>. 
              Changes to mapping rules will trigger a re-sync of the last 12 months of data.
            </p>
            <Button variant="link" className="text-accent p-0 h-auto text-xs font-bold">
              View Mapping Rules <ArrowRight className="ml-1 size-3" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
