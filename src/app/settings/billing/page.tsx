
'use client';

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { 
  CreditCard, 
  ShieldCheck, 
  Building2, 
  ArrowRight, 
  Loader2, 
  Zap,
  Info,
  Package,
  Lock,
  Plus,
  Minus,
  RefreshCw,
  Check,
  ExternalLink
} from "lucide-react"
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase"
import { collection, query, where } from "firebase/firestore"
import { Company } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"
import { createCheckoutSession, createBillingPortalSession } from "@/app/actions/stripe-actions"

const PRICING = {
  MONTHLY: {
    BASE: 3333,
    PER_LOCATION: 278,
    LABEL: "per month"
  },
  ANNUAL: {
    BASE: 33200, 
    PER_LOCATION: 2760,
    LABEL: "per year"
  }
};

export default function BillingPage() {
  const { user } = useUser()
  const firestore = useFirestore()
  const { toast } = useToast()
  const searchParams = useSearchParams()

  const companiesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "companies"),
      where(`members.${user.uid}`, "in", ["admin", "member", true])
    );
  }, [firestore, user]);
  const { data: companies, isLoading: isCompaniesLoading } = useCollection<Company>(companiesQuery);
  const company = companies?.[0];

  const [billingCycle, setBillingCycle] = React.useState<"monthly" | "annual">("annual")
  const [requestedLocations, setRequestedLocations] = React.useState(5)
  const [isProcessing, setIsProcessing] = React.useState(false)
  
  const isRestricted = searchParams.get('restricted') === 'true';
  const isSuccess = searchParams.get('success') === 'true';

  const isSubscribed = company?.subscription?.status === 'active' || company?.subscription?.status === 'trialing';

  React.useEffect(() => {
    if (company?.subscription) {
      setBillingCycle(company.subscription.interval === 'annual' ? 'annual' : 'monthly');
      setRequestedLocations(company.subscription.locationLimit || 1);
    }
  }, [company]);

  React.useEffect(() => {
    if (isSuccess) {
      toast({
        title: "Payment Received",
        description: "Your license is being provisioned. Features will unlock automatically in a few moments.",
      })
    }
    if (searchParams.get('canceled')) {
      toast({
        variant: "destructive",
        title: "Checkout Canceled",
        description: "Your subscription process was not completed.",
      })
    }
  }, [isSuccess, searchParams, toast])

  const currentPrices = billingCycle === "monthly" ? PRICING.MONTHLY : PRICING.ANNUAL;
  const totalBase = currentPrices.BASE;
  const totalLocationsCost = currentPrices.PER_LOCATION * requestedLocations;
  const totalDue = totalBase + totalLocationsCost;

  const annualBaseSavings = (PRICING.MONTHLY.BASE * 12) - PRICING.ANNUAL.BASE;
  const annualLocationSavings = ((PRICING.MONTHLY.PER_LOCATION * 12) - PRICING.ANNUAL.PER_LOCATION) * requestedLocations;
  const totalAnnualSavings = annualBaseSavings + annualLocationSavings;

  const handleSubscribe = async () => {
    if (!company || isProcessing) return;
    setIsProcessing(true);

    try {
      // UPGRADE LOGIC: If already subscribed, use Billing Portal to handle proration and existing charges
      if (isSubscribed && company.stripeCustomerId) {
        const result = await createBillingPortalSession({
          customerId: company.stripeCustomerId,
        });
        if (result.url) {
          window.location.href = result.url;
        } else {
          throw new Error("No portal URL returned.");
        }
        return;
      }

      // NEW SUBSCRIPTION LOGIC
      const result = await createCheckoutSession({
        companyId: company.id,
        locationCount: requestedLocations,
        interval: billingCycle,
      });

      if (result.url) {
        window.location.href = result.url;
      } else {
        throw new Error("No checkout URL returned.");
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Subscription Error",
        description: error.message || "Could not connect to Stripe services.",
      });
      setIsProcessing(false);
    }
  }

  if (isCompaniesLoading) {
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
          <p className="text-muted-foreground">Manage your portfolio license and entity-based connections.</p>
        </div>
        
        {isSubscribed ? (
          <Badge className="bg-accent/10 text-accent border-accent/20 px-4 py-1 flex items-center gap-2">
            <ShieldCheck className="size-3" />
            Active {company?.subscription?.interval} plan
          </Badge>
        ) : (
          <Badge variant="outline" className="border-destructive/50 text-destructive bg-destructive/5 px-4 py-1 flex items-center gap-2">
            <Lock className="size-3" />
            Subscription Required
          </Badge>
        )}
      </div>

      {isRestricted && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 animate-in slide-in-from-top-2">
          <Lock className="h-4 w-4" />
          <AlertTitle>Access Restricted</AlertTitle>
          <AlertDescription>
            You tried to access a feature that requires an active <strong>Datatrixs Portfolio Core</strong> license. Please complete your subscription setup below.
          </AlertDescription>
        </Alert>
      )}

      {isSuccess && !isSubscribed && (
        <Alert className="bg-accent/10 border-accent/20 text-accent animate-pulse">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <AlertTitle>Fulfillment in Progress</AlertTitle>
          <AlertDescription>
            Stripe has confirmed your payment. Our background engine is now provisioning your license. This page will refresh once active.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-card/50 border-border shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/30 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Portfolio License</CardTitle>
                  <CardDescription>Enterprise-grade financial intelligence for your holdings.</CardDescription>
                </div>
                {!isSubscribed && (
                  <Tabs value={billingCycle} onValueChange={(v) => setBillingCycle(v as any)} className="bg-background/50 p-1 border border-border rounded-lg">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="monthly" className="text-xs h-8">Monthly</TabsTrigger>
                      <TabsTrigger value="annual" className="text-xs h-8">
                        Annual <span className="ml-1 text-[10px] text-accent font-bold">-17%</span>
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-8 space-y-8">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Package className="size-5 text-primary" />
                    <h3 className="font-bold text-lg">Datatrixs Portfolio Core</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">Unlimited reports, AI analyst, and standard normalization.</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold">${(totalBase / (billingCycle === 'annual' ? 12 : 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">{PRICING.MONTHLY.LABEL}</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Building2 className="size-5 text-primary" />
                      <h3 className="font-bold text-sm">Entity Connection License</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">Pre-purchase connection slots for your retail locations.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {!isSubscribed && (
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="size-8"
                        onClick={() => setRequestedLocations(prev => Math.max(1, prev - 1))}
                      >
                        <Minus className="size-3" />
                      </Button>
                    )}
                    <div className="flex items-center gap-2">
                      <Input 
                        type="number" 
                        value={requestedLocations} 
                        onChange={(e) => setRequestedLocations(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-16 h-8 text-center font-bold"
                        readOnly={isSubscribed}
                      />
                      <span className="text-xs font-medium text-muted-foreground">Units</span>
                    </div>
                    {!isSubscribed && (
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="size-8"
                        onClick={() => setRequestedLocations(prev => prev + 1)}
                      >
                        <Plus className="size-3" />
                      </Button>
                    )}
                  </div>
                </div>

                {!isSubscribed && (
                  <Slider 
                    value={[requestedLocations]} 
                    onValueChange={([val]) => setRequestedLocations(val)} 
                    max={100} 
                    min={1} 
                    step={1}
                    className="py-4"
                  />
                )}

                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Info className="size-4 text-primary" />
                    <p className="text-xs font-medium">Selected Capacity: <span className="text-primary font-bold">{requestedLocations} retail units</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">${(totalLocationsCost / (billingCycle === 'annual' ? 12 : 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Added monthly cost</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-border">
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
            </CardContent>
            <CardFooter className="bg-muted/20 border-t border-border p-6 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Info className="size-4" />
                {isSubscribed 
                  ? "Expanding capacity will redirect you to secure subscription management."
                  : "Pricing is dynamically calculated based on your portfolio size."}
              </div>
              <Button 
                onClick={handleSubscribe} 
                disabled={isProcessing}
                className="bg-primary hover:bg-primary/90 min-w-[200px]"
              >
                {isProcessing ? <Loader2 className="size-4 animate-spin mr-2" /> : (isSubscribed ? <ExternalLink className="size-4 mr-2" /> : <Zap className="size-4 mr-2" />)}
                {isSubscribed ? 'Manage Subscription' : 'Subscribe Now'}
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
                {isSubscribed ? "Viewing your active configuration." : (billingCycle === 'annual' ? 'Billed annually with 17% savings.' : 'Billed monthly per connection.')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between text-sm py-2 border-b border-white/10">
                <span>Portfolio Core</span>
                <span className="font-bold">${totalBase.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm py-2 border-b border-white/10">
                <span>Entity Licenses ({requestedLocations})</span>
                <span className="font-bold">${totalLocationsCost.toLocaleString()}</span>
              </div>
              {billingCycle === 'annual' && (
                <div className="flex justify-between text-sm py-2 text-accent-foreground font-bold">
                  <span>Annual Savings</span>
                  <span>-${totalAnnualSavings.toLocaleString()}</span>
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
              <CardTitle className="text-sm">Safe & Secure Checkout</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground leading-tight italic">
                <ShieldCheck className="size-3 shrink-0" />
                Payments processed securely via Stripe. Automated receipts will be sent to your billing email.
              </div>
              <p className="text-[10px] text-muted-foreground">
                You will be redirected to Stripe to {isSubscribed ? 'modify' : 'complete'} your purchase. {isSubscribed ? 'Prorated adjustments will be calculated automatically.' : 'You can apply promotional codes on the checkout page.'}
              </p>
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
