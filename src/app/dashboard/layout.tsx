'use client';

import * as React from "react"
import { useRouter } from "next/navigation"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { useUser } from "@/firebase"
import { Loader2 } from "lucide-react"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, isUserLoading } = useUser()
  const router = useRouter()

  React.useEffect(() => {
    if (!isUserLoading && !user) {
      router.push("/login")
    }
  }, [user, isUserLoading, router])

  if (isUserLoading) {
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
                    Admin
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
