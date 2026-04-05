'use client';

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { 
  RefreshCw, 
  AlertCircle, 
  ArrowRight, 
  Save, 
  Loader2, 
  CheckCircle2,
  Info
} from "lucide-react"
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase"
import { query, collection, where, doc } from "firebase/firestore"
import { updateDocumentNonBlocking } from "@/firebase/non-blocking-updates"
import { Company } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function SettingsPage() {
  const { user } = useUser()
  const firestore = useFirestore()
  const { toast } = useToast()

  // Fetch Companies the user is a member of
  const companiesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "companies"),
      where(`members.${user.uid}`, "in", ["admin", "member", true])
    );
  }, [firestore, user]);
  const { data: companies, isLoading } = useCollection<Company>(companiesQuery);

  const company = companies?.[0]; // Assume first company for global settings

  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [currency, setCurrency] = React.useState("USD")
  const [isSaving, setIsSaving] = React.useState(false)

  React.useEffect(() => {
    if (company) {
      setName(company.name || "")
      setDescription(company.description || "")
    }
  }, [company])

  const handleSaveProfile = () => {
    if (!firestore || !company) return;
    setIsSaving(true);
    
    const companyRef = doc(firestore, "companies", company.id);
    updateDocumentNonBlocking(companyRef, {
      name,
      description,
      updatedAt: new Date().toISOString()
    });

    // Simulate feedback delay for better UX
    setTimeout(() => {
      setIsSaving(false);
      toast({
        title: "Profile Updated",
        description: "Your holding company settings have been saved."
      });
    }, 500);
  }

  if (isLoading) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

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
                  <Input 
                    id="companyName" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)}
                    className="bg-muted border-none focus-visible:ring-primary" 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Business Focus / Description</Label>
                  <Input 
                    id="description" 
                    value={description} 
                    onChange={(e) => setDescription(e.target.value)}
                    className="bg-muted border-none focus-visible:ring-primary" 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="taxId">Global Tax ID / EIN</Label>
                <Input id="taxId" placeholder="XX-XXXXXXX" className="bg-muted border-none" />
              </div>
              <Button 
                className="bg-primary hover:bg-primary/90 w-full" 
                onClick={handleSaveProfile}
                disabled={isSaving || !company}
              >
                {isSaving ? <Loader2 className="size-4 animate-spin mr-2" /> : <Save className="size-4 mr-2" />}
                Save Profile
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
                <div className="flex items-center gap-2">
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="w-full bg-muted border-none h-11">
                      <SelectValue placeholder="Select Currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">United States Dollar (USD)</SelectItem>
                      <SelectItem value="EUR">Euro (EUR)</SelectItem>
                      <SelectItem value="GBP">British Pound (GBP)</SelectItem>
                      <SelectItem value="CAD">Canadian Dollar (CAD)</SelectItem>
                      <SelectItem value="AUD">Australian Dollar (AUD)</SelectItem>
                    </SelectContent>
                  </Select>
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
                
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="link" className="text-accent p-0 h-auto text-xs font-bold">
                      View Standardized Schema Rules <ArrowRight className="ml-1 size-3" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl">
                    <DialogHeader>
                      <DialogTitle>Standardized COA Normalization Rules</DialogTitle>
                      <DialogDescription>
                        Datatrixs maps disparate ledger accounts into these five core dimensions to enable portfolio-wide aggregation.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      {[
                        { 
                          title: "Revenue", 
                          rule: "Includes all gross sales income before any deductions. Excludes sales tax collected.", 
                          tags: ["Sales", "Income", "Top-line"] 
                        },
                        { 
                          title: "Net Profit", 
                          rule: "Residual income after COGS, Operating Expenses, Interest, and Taxes. The 'Bottom Line'.", 
                          tags: ["Earnings", "Net Income"] 
                        },
                        { 
                          title: "COGS", 
                          rule: "Direct costs attributable to the production of goods sold. Includes raw materials and direct labor.", 
                          tags: ["Direct Costs", "Cost of Sales"] 
                        },
                        { 
                          title: "Operating Expenses", 
                          rule: "Ongoing costs for running the business that are not directly related to production.", 
                          tags: ["OPEX", "Rent", "Utilities", "Payroll"] 
                        },
                        { 
                          title: "Inventory Value", 
                          rule: "Current balance sheet value of held stock. Used for turn and liquidity calculations.", 
                          tags: ["Current Assets", "Stock"] 
                        }
                      ].map((rule, i) => (
                        <div key={i} className="p-4 rounded-lg bg-muted/50 border border-border">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                              <CheckCircle2 className="size-4 text-accent" />
                              {rule.title}
                            </h4>
                            <div className="flex gap-1">
                              {rule.tags.map(t => <span key={t} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold uppercase">{t}</span>)}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {rule.rule}
                          </p>
                        </div>
                      ))}
                    </div>
                    <DialogFooter>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-primary/5 p-3 rounded-lg w-full">
                        <Info className="size-4 text-primary shrink-0" />
                        <p>Our AI uses these definitions to intelligently suggest mappings during the data connection process.</p>
                      </div>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
