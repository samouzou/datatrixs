
'use client';

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { RefreshCw, AlertCircle, ArrowRight, Save } from "lucide-react"

export default function SettingsPage() {
  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="space-y-1">
        <h2 className="text-3xl font-bold tracking-tight text-foreground font-headline">Global Settings</h2>
        <p className="text-muted-foreground">Manage your holding company and global financial configurations.</p>
      </div>
      
      <div className="grid gap-6">
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="bg-card/50 border-border shadow-sm">
            <CardHeader>
              <CardTitle>Holding Company Profile</CardTitle>
              <CardDescription>Fundamental details about the parent entity.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Legal Company Name</Label>
                  <Input id="companyName" defaultValue="Datatrixs Holding Co." className="bg-muted border-none" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry Sector</Label>
                  <Input id="industry" defaultValue="Retail & Services" className="bg-muted border-none" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="taxId">Global Tax ID / EIN</Label>
                <Input id="taxId" placeholder="XX-XXXXXXX" className="bg-muted border-none" />
              </div>
              <Button className="bg-primary hover:bg-primary/90 w-full">
                <Save className="size-4 mr-2" /> Save Profile
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border shadow-sm flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="size-5 text-primary" />
                Global Sync Policy
              </CardTitle>
              <CardDescription>Control how often data is refreshed across all active connections.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex-1">
              <div className="flex items-center justify-between p-3 rounded bg-muted/30 border border-border">
                <div className="space-y-0.5">
                  <Label className="text-sm">Real-time Webhooks</Label>
                  <p className="text-[10px] text-muted-foreground">Sync immediately when changes occur in QuickBooks.</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between p-3 rounded bg-muted/30 border border-border">
                <div className="space-y-0.5">
                  <Label className="text-sm">Daily Reconciliation</Label>
                  <p className="text-[10px] text-muted-foreground">Run a full audit every night at 2:00 AM.</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator className="my-2" />
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground tracking-widest">Reporting Currency</Label>
                <div className="p-3 rounded bg-muted text-sm flex items-center justify-between">
                  <span className="font-medium text-foreground">United States Dollar (USD)</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-primary">Change</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-accent/5 border-accent/20 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="size-5 text-accent" />
              Financial Normalization Engine
            </CardTitle>
            <CardDescription>
              Configure how disparate accounts are mapped to your global standardized Chart of Accounts (COA).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Auto-Categorization Sensitivity</Label>
                  <p className="text-xs text-muted-foreground mb-4">Higher sensitivity means more manual review for edge-case transactions.</p>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden flex">
                    <div className="h-full bg-accent w-2/3" />
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase">
                    <span>Balanced</span>
                    <span>Strict Audit</span>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Currently using <span className="text-foreground font-bold">Standardized COA v2.4</span>. 
                  Changes to global mapping rules will trigger an automatic background re-sync of the last 12 months of historical data for all connected locations.
                </p>
                <Button variant="link" className="text-accent p-0 h-auto text-xs font-bold">
                  View Standardized Schema Rules <ArrowRight className="ml-1 size-3" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
