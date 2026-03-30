"use client"

import * as React from "react"
import Link from "next/link"
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
  User as UserIcon
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
import { useAuth, useUser } from "@/firebase"

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
]

const adminNavItems = [
  {
    title: "Holding Structure",
    href: "/settings/holding",
    icon: Building2,
  },
  {
    title: "Integrations",
    href: "/settings/integrations",
    icon: Database,
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

  const handleSignOut = async () => {
    await auth.signOut()
    router.push("/login")
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 flex items-center px-4">
        <div className="flex items-center gap-2 font-bold text-xl text-accent">
          <div className="size-8 bg-primary rounded flex items-center justify-center text-white text-xs">DX</div>
          <span className="group-data-[collapsible=icon]:hidden font-headline">Datatrixs</span>
        </div>
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
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="p-2 group-data-[collapsible=icon]:hidden">
              <div className="flex items-center gap-3 px-2 py-3 rounded-lg bg-muted/50 border border-white/5">
                <div className="size-8 rounded-full bg-primary flex items-center justify-center text-white text-[10px] font-bold">
                  {user?.email?.substring(0, 2).toUpperCase() || "U"}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold truncate text-foreground">{user?.displayName || user?.email?.split('@')[0]}</span>
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
