'use client';

import * as React from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  CreditCard, 
  Check, 
  ShieldCheck, 
  Building2, 
  ArrowRight, 
  Loader2, 
  Zap,
  Info,
  Package
} from "lucide-react"
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase"
import { collection, query, where, doc } from "firebase/firestore"
import { updateDocumentNonBlocking } from "@/firebase/non-blocking-updates"
import { Company, Location } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

const PRICING = {
  MONTHLY: {
    BASE: 3000,
    PER_LOCATION: 250,
    LABEL: "per month"
  },
  ANNUAL: {
    // 17% off 3000 * 12 = 29,880
    BASE: 29880, 
    // 17% off 250 * 12 = 2,490
    PER_LOCATION: 2490,
    LABEL: "per year",
    MONTHLY_EQUIV: 2490 // (29880 / 12)
  }
};

export default function BillingPage() {
  const { user } = useUser()
  const firestore = useFirestore()
  const { toast } = useToast()

  const [billingCycle, setBillingCycle] = React.useState<"monthly" | "annual">("annual")
  const [isProcessing, setIsProcessing] = React.useState(false)

  // Fetch Companies
  const companiesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "companies"),
      where(`members.${user.uid}`, "in", ["admin", "member", true])
    );
  }, [firestore, user]);
  const { data: companies, isLoading: isCompaniesLoading } = useCollection<Company>(companiesQuery);
  const company = companies?.[0];

  // Fetch Locations to count them
  const locationsQuery = useMemoFirebase(() => {
    if (!firestore || !company) return null;
    return query(
      collection(firestore, "locations"),
      where("companyId", "==", company.id)
    );
  }, [firestore, company]);
  const { data: locations, isLoading: isLocsLoading } = useCollection<Location>(locationsQuery);

  const locationCount = locations?.length || 0;

  const currentPrices = billingCycle === "monthly" ? PRICING.MONTHLY : PRICING.ANNUAL;
  const totalBase = currentPrices.BASE;
  const totalLocationsCost = currentPrices.PER_LOCATION * locationCount;
  const totalDue = totalBase + totalLocationsCost;

  const handleSubscribe = () => {
    if (!company || !firestore) return;
    setIsProcessing(true);

    // Simulate Stripe Checkout Delay
    setTimeout(() => {
      const companyRef = doc(firestore, "companies", company.id);
      updateDocumentNonBlocking(companyRef, {
        subscription: {
          plan: 'pro',
          interval: billingCycle,
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + (billingCycle === 'monthly' ? 30 : 365) * 24 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date().toISOString()
        }
      });

      setIsProcessing(false);
      toast({
        title: "Subscription Active",
        description: `Successfully subscribed to the ${billingCycle} plan.`
      });
    }, 1500);
  }

  if (isCompaniesLoading || isLocsLoading) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CreditCard className="size-6 text-primary" />
            <h2 className="text-3xl font-bold tracking-tight text-foreground font-headline">Billing & Subscription</h2>
          </div>
          <p className="text-muted-foreground">Manage your portfolio license and location-based add-ons.</p>
        </div>
        
        {company?.subscription?.status === 'active' && (
          <Badge className="bg-accent/10 text-accent border-accent/20 px-4 py-1 flex items-center gap-2">
            <ShieldCheck className="size-3" />
            Active {company.subscription.interval} plan
          </Badge>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-card/50 border-border shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/30 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Portfolio License</CardTitle>
                  <CardDescription>Enterprise-grade financial intelligence for your holdings.</CardDescription>
                </div>
                <Tabs value={billingCycle} onValueChange={(v) => setBillingCycle(v as any)} className="bg-background/50 p-1 border border-border rounded-lg">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="monthly" className="text-xs h-8">Monthly</TabsTrigger>
                    <TabsTrigger value="annual" className="text-xs h-8">
                      Annual <span className="ml-1 text-[10px] text-accent font-bold">-17%</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent className="pt-8">
              <div className="space-y-8">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Package className="size-5 text-primary" />
                      <h3 className="font-bold text-lg">Base Platform Fee</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">Unlimited reports, AI analyst, and standard normalization.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold">${(totalBase / (billingCycle === 'annual' ? 12 : 1)).toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">{PRICING.MONTHLY.LABEL}</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-background rounded-lg border border-primary/20">
                      <Building2 className="size-6 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">Location Add-ons</h4>
                      <p className="text-xs text-muted-foreground">Currently monitoring <span className="text-primary font-bold">{locationCount}</span> authorized locations.</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold">${(totalLocationsCost / (billingCycle === 'annual' ? 12 : 1)).toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Added monthly cost</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Included Features</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      "Unlimited API Integrations",
                      "Advanced Normalization Engine",
                      "Grounded AI Financial Analyst",
                      "Custom Metric Creation",
                      "Excel & CSV Data Ingestion",
                      "Holding Structure Management"
                    ].map((feature, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-foreground/80 font-medium">
                        <Check className="size-4 text-accent shrink-0" />
                        {feature}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="bg-muted/20 border-t border-border p-6 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Info className="size-4" />
                Pricing is dynamically calculated based on your portfolio size.
              </div>
              <Button 
                onClick={handleSubscribe} 
                disabled={isProcessing || company?.subscription?.interval === billingCycle}
                className="bg-primary hover:bg-primary/90 min-w-[200px]"
              >
                {isProcessing ? <Loader2 className="size-4 animate-spin mr-2" /> : <Zap className="size-4 mr-2" />}
                {company?.subscription?.status === 'active' ? 'Update Subscription' : 'Subscribe Now'}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-primary text-primary-foreground border-none shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 -m-8 size-32 bg-white/10 rounded-full blur-3xl" />
            <CardHeader>
              <CardTitle className="text-white">Order Summary</CardTitle>
              <CardDescription className="text-primary-foreground/70">
                {billingCycle === 'annual' ? 'Billed annually with 17% savings.' : 'Billed monthly per location.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between text-sm py-2 border-b border-white/10">
                <span>Base Platform</span>
                <span className="font-bold">${totalBase.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm py-2 border-b border-white/10">
                <span>Locations ({locationCount})</span>
                <span className="font-bold">${totalLocationsCost.toLocaleString()}</span>
              </div>
              {billingCycle === 'annual' && (
                <div className="flex justify-between text-sm py-2 text-accent-foreground font-bold">
                  <span>Annual Savings</span>
                  <span>-$6,000+</span>
                </div>
              )}
              <div className="pt-4 flex justify-between items-end">
                <div>
                  <p className="text-xs uppercase font-bold text-white/70">Total Due Today</p>
                  <p className="text-4xl font-black">${totalDue.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-tighter">Billed in</p>
                  <p className="text-sm font-bold uppercase">{company?.reportingCurrency || 'USD'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Payment Method</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                <CreditCard className="size-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-xs font-bold">•••• •••• •••• 4242</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Expires 12/28</p>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-[10px] uppercase font-bold">Edit</Button>
              </div>
              
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground leading-tight italic">
                <ShieldCheck className="size-3 shrink-0" />
                Payments processed securely via Stripe. Automated receipts will be sent to your billing email.
              </div>
            </CardContent>
          </Card>

          <Button variant="outline" className="w-full text-xs font-bold h-11" asChild>
            <Link href="/settings">
              Manage Billing Email <ArrowRight className="ml-2 size-3" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
