'use client';

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from "@/firebase"
import { collection, query, where, doc } from "firebase/firestore"
import { Company, UserProfile } from "@/lib/types"
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

  const companiesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "companies"),
      where(`members.${user.uid}`, "in", ["admin", "member", true])
    );
  }, [firestore, user]);

  const { data: companies, isLoading: isCompaniesLoading } = useCollection<Company>(companiesQuery);

  const userProfileRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, "users", user.uid);
  }, [firestore, user]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  const activeCompany = companies?.[0];
  const isSubscriptionActive = activeCompany?.subscription?.status === 'active' || activeCompany?.subscription?.status === 'trialing';
  
  const isBillingPage = pathname === '/settings/billing';
  const isHoldingPage = pathname === '/settings/holding';
  const isSettingsPage = pathname === '/settings';
  const isLoginPage = pathname === '/login' || pathname === '/register';
  const isVerifyPage = pathname === '/verify-email';
  
  // Routes that are always accessible during setup/billing phases
  const isAllowedRoute = isBillingPage || isHoldingPage || isSettingsPage || isLoginPage || isVerifyPage;

  const displayName = profile 
    ? `${profile.firstName} ${profile.lastName}`.trim() 
    : user?.displayName || user?.email?.split('@')[0];

  const userInitials = React.useMemo(() => {
    if (profile && (profile.firstName || profile.lastName)) {
      return `${profile.firstName?.[0] || ''}${profile.lastName?.[0] || ''}`.toUpperCase();
    }
    if (!user) return "U";
    if (user.displayName) {
      const parts = user.displayName.split(' ');
      if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      return parts[0].substring(0, 2).toUpperCase();
    }
    return user.email?.substring(0, 2).toUpperCase() || "U";
  }, [user, profile]);

  React.useEffect(() => {
    // 1. Auth Guard
    if (!isUserLoading && !user && !isLoginPage) {
      router.push("/login")
      return
    }

    // 2. Email Verification Guard
    if (user && !user.emailVerified && !isVerifyPage && !isLoginPage) {
      router.push("/verify-email")
      return
    }

    // Don't interrupt if already on a setup or billing page
    if (isAllowedRoute || isUserLoading || isCompaniesLoading) return;

    // 3. Organization Guard (Require at least one holding entity)
    if (user && companies !== null && companies.length === 0) {
      router.push("/settings/holding")
      return;
    }

    // 4. License Guard (Require active subscription for protected routes)
    if (activeCompany && !isSubscriptionActive) {
      toast({
        variant: "destructive",
        title: "Subscription Required",
        description: "Please activate your Portfolio Core license to access this feature."
      });
      router.push("/settings/billing?restricted=true")
    }
  }, [
    user, 
    isUserLoading, 
    activeCompany, 
    isSubscriptionActive, 
    isAllowedRoute, 
    isCompaniesLoading, 
    companies, 
    router, 
    toast,
    pathname,
    isVerifyPage
  ])

  if (isUserLoading || (isCompaniesLoading && !companies && !isVerifyPage)) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user && !isLoginPage) return null

  // If we are on the verification page or login page, don't show the sidebar layout
  if (isLoginPage || isVerifyPage) {
    return <>{children}</>;
  }

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
                  {userInitials}
                </div>
                <div className="flex flex-col hidden sm:flex">
                  <span className="text-xs font-bold text-foreground leading-none">
                    {displayName}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    {activeCompany && user ? (activeCompany.members[user.uid] === 'admin' ? 'Admin' : 'Member') : 'User'}
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
