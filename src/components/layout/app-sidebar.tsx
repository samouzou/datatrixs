"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { 
  LayoutDashboard, 
  MapPin, 
  FilePieChart, 
  MessageSquare, 
  Settings, 
  LogOut,
  Building2,
  Database,
  Library,
  CreditCard
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { useAuth, useUser, useFirestore, useDoc, useMemoFirebase } from "@/firebase"
import { doc } from "firebase/firestore"
import { UserProfile } from "@/lib/types"

const mainNavItems = [
  {
    title: "Global Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Locations",
    href: "/locations",
    icon: MapPin,
  },
  {
    title: "Reports & Exports",
    href: "/reports",
    icon: FilePieChart,
  },
  {
    title: "AI Financial Analyst",
    href: "/analyst",
    icon: MessageSquare,
  },
  {
    title: "Saved Library",
    href: "/library",
    icon: Library,
  },
]

const adminNavItems = [
  {
    title: "Holding Structure",
    href: "/settings/holding",
    icon: Building2,
  },
  {
    title: "Billing",
    href: "/settings/billing",
    icon: CreditCard,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
]

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const auth = useAuth()
  const { user } = useUser()
  const firestore = useFirestore()

  const userProfileRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, "users", user.uid);
  }, [firestore, user]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  const displayName = profile 
    ? `${profile.firstName} ${profile.lastName}`.trim() 
    : user?.displayName || user?.email?.split('@')[0];

  const handleSignOut = async () => {
    await auth.signOut()
    router.push("/login")
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 flex items-center justify-center overflow-hidden bg-sidebar">
        <Link href="/dashboard" className="flex items-center justify-center w-full px-2">
          <div className="group-data-[collapsible=icon]:hidden flex items-center justify-center w-full">
            <Image 
              src="/dx-logo.svg" 
              alt="Datatrixs Logo" 
              width={100} 
              height={30} 
              priority 
              className="object-contain"
            />
          </div>
          <div className="hidden group-data-[collapsible=icon]:flex items-center justify-center">
            <Image 
              src="/dx-icon.svg" 
              alt="Datatrixs Icon" 
              width={32} 
              height={32} 
              priority 
              className="object-contain"
            />
          </div>
        </Link>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarMenu className="px-2 py-4">
          {mainNavItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton 
                asChild 
                isActive={pathname === item.href}
                tooltip={item.title}
                className="transition-all"
              >
                <Link href={item.href}>
                  <item.icon className="size-5" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        
        <div className="mt-auto px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider group-data-[collapsible=icon]:hidden">
          Administration
        </div>
        
        <SidebarMenu className="px-2 py-2">
          {adminNavItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton 
                asChild 
                isActive={pathname === item.href}
                tooltip={item.title}
                className="transition-all"
              >
                <Link href={item.href}>
                  <item.icon className="size-5" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/50">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="p-2 group-data-[collapsible=icon]:hidden">
              <div className="flex items-center gap-3 px-2 py-3 rounded-lg bg-muted/50 border border-border">
                <div className="size-8 rounded-full overflow-hidden flex items-center justify-center bg-primary/10">
                  <div className="size-6 relative">
                    <Image 
                      src="/dx-icon.svg" 
                      alt="User" 
                      fill
                      className="object-contain"
                    />
                  </div>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold truncate text-foreground">{displayName}</span>
                  <span className="text-[10px] text-muted-foreground truncate">{user?.email}</span>
                </div>
              </div>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton 
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleSignOut}
              tooltip="Sign Out"
            >
              <LogOut className="size-5" />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
