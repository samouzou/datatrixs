'use client';

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase"
import { collection, query, where } from "firebase/firestore"
import { Company } from "@/lib/types"
import { Loader2, ShieldAlert } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, isUserLoading } = useUser()
  const firestore = useFirestore()
  const router = useRouter()
  const pathname = usePathname()
  const { toast } = useToast()

  // Fetch the user's company to check subscription status
  const companiesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "companies"),
      where(`members.${user.uid}`, "in", ["admin", "member", true])
    );
  }, [firestore, user]);

  const { data: companies, isLoading: isCompaniesLoading } = useCollection<Company>(companiesQuery);

  const activeCompany = companies?.[0];
  const isSubscriptionActive = activeCompany?.subscription?.status === 'active' || activeCompany?.subscription?.status === 'trialing';
  
  // Define routes that are always accessible even without a subscription
  const isBillingPage = pathname === '/settings/billing';
  const isHoldingPage = pathname === '/settings/holding';
  const isSettingsPage = pathname === '/settings';
  const isAuthRoute = isBillingPage || isHoldingPage || isSettingsPage;

  React.useEffect(() => {
    if (!isUserLoading && !user) {
      router.push("/login")
      return
    }

    // Enforcement Logic:
    // 1. If we have a company but NO active subscription and NOT on an allowed page
    if (!isCompaniesLoading && activeCompany && !isSubscriptionActive && !isAuthRoute) {
      toast({
        variant: "destructive",
        title: "Subscription Required",
        description: "Please activate your Portfolio Core license to access this feature."
      });
      router.push("/settings/billing?restricted=true")
    }
    
    // 2. If we have NO company yet and NOT on the holding setup page
    if (!isCompaniesLoading && user && (!companies || companies.length === 0) && !isHoldingPage && !isSettingsPage) {
      router.push("/settings/holding")
    }
  }, [user, isUserLoading, activeCompany, isSubscriptionActive, isAuthRoute, isCompaniesLoading, companies, isHoldingPage, isSettingsPage, router, toast])

  if (isUserLoading || isCompaniesLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) return null

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-col flex-1 overflow-auto">
          <header className="sticky top-0 z-30 flex h-16 items-center border-b border-border bg-background/50 backdrop-blur-sm px-6">
            <SidebarTrigger className="-ml-1" />
            
            {!isSubscriptionActive && activeCompany && (
              <div className="ml-4 flex items-center gap-2 px-3 py-1 rounded-full bg-destructive/10 text-destructive text-[10px] font-bold uppercase tracking-widest border border-destructive/20 animate-pulse">
                <ShieldAlert className="size-3" />
                License Inactive
              </div>
            )}

            <div className="ml-auto flex items-center gap-4">
              <ThemeToggle />
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-secondary-foreground uppercase">
                  {user.email?.substring(0, 2) || "U"}
                </div>
                <div className="flex flex-col hidden sm:flex">
                  <span className="text-xs font-bold text-foreground leading-none">
                    {user.displayName || user.email?.split('@')[0]}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    {activeCompany?.members[user.uid] === 'admin' ? 'Admin' : 'Member'}
                  </span>
                </div>
              </div>
            </div>
          </header>
          <main className="flex-1">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
