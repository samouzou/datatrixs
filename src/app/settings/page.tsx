import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

export default function SettingsPage() {
  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="space-y-1">
        <h2 className="text-3xl font-bold tracking-tight text-foreground font-headline">Global Settings</h2>
        <p className="text-muted-foreground">Manage your holding company and global financial configurations.</p>
      </div>
      
      <div className="grid gap-6">
        <Card className="bg-card/50 border-border shadow-sm">
          <CardHeader>
            <CardTitle>Holding Company Profile</CardTitle>
            <CardDescription>Fundamental details about the parent entity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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
            <Button className="bg-primary hover:bg-primary/90">Save Changes</Button>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border shadow-sm">
          <CardHeader>
            <CardTitle>Financial Normalization</CardTitle>
            <CardDescription>Configure how disparate accounts are mapped to your global chart of accounts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Reporting Currency</Label>
              <div className="p-3 rounded bg-muted text-sm flex items-center justify-between">
                <span>United States Dollar (USD)</span>
                <Button variant="ghost" size="sm" className="h-7 text-xs">Change</Button>
              </div>
            </div>
            <Separator className="bg-border" />
            <div className="space-y-2">
              <Label>Auto-Categorization Sensitivity</Label>
              <p className="text-xs text-muted-foreground mb-4">Higher sensitivity means more manual review for edge-case transactions.</p>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden flex">
                <div className="h-full bg-accent w-2/3" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
