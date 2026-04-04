'use client';

import { KpiCard } from "@/components/dashboard/kpi-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { 
  Bar, 
  BarChart, 
  ResponsiveContainer, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid,
  Area,
  AreaChart,
  Cell,
  Line
} from "recharts"
import { mockLocations } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import { AlertCircle, Zap, ShieldAlert, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export default function DashboardPage() {
  // Aggregated data for charts
  const aggregatedRevenue = [
    { name: "Houston", revenue: 495000 },
    { name: "Dallas", revenue: 410000 },
    { name: "Austin", revenue: 310000 },
    { name: "San Antonio", revenue: 0 },
  ]

  const trendData = [
    { period: "Jan", revenue: 2.4, profit: 0.4, prevYearRevenue: 2.1 },
    { period: "Feb", revenue: 2.1, profit: 0.3, prevYearRevenue: 2.2 },
    { period: "Mar", revenue: 3.2, profit: 0.8, prevYearRevenue: 2.8 },
    { period: "Apr", revenue: 2.8, profit: 0.6, prevYearRevenue: 2.5 },
    { period: "May", revenue: 4.5, profit: 1.2, prevYearRevenue: 3.9 },
    { period: "Jun", revenue: 4.1, profit: 1.1, prevYearRevenue: 3.7 },
  ]

  const getBarColor = (value: number) => {
    if (value === 0) return "hsl(var(--destructive))";
    if (value > 300000) return "hsl(var(--accent))";
    if (value >= 100000) return "#EAB308"; // Amber/Yellow 500
    return "hsl(var(--muted-foreground))";
  };

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight text-foreground font-headline">Portfolio Performance</h2>
        <div className="flex items-center space-x-2">
          <span className="text-sm font-bold text-primary px-3 py-1 bg-primary/10 rounded-full border border-primary/20">
            Datatrixs Strategic Holdings
          </span>
        </div>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <KpiCard 
          label="Total Revenue" 
          value="1.22M" 
          change={12.5} 
          trend="up" 
          prefix="$" 
          secondaryLabel="Budget: $1.50M (-18.6%)"
        />
        <KpiCard 
          label="Net Profit" 
          value="211.5K" 
          change={8.2} 
          trend="up" 
          prefix="$" 
        />
        <KpiCard 
          label="EBITDA Margin" 
          value="17.3" 
          change={2.1} 
          trend="up" 
          suffix="%" 
        />
        <KpiCard 
          label="Inventory Turn" 
          value="4.2" 
          change={0.5} 
          trend="down" 
        />
        
        {/* AI Insight Panel */}
        <Card className="bg-primary/5 border-primary/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-2">
            <Zap className="size-4 text-primary opacity-50" />
          </div>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-primary">AI Portfolio Insights</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex gap-2">
              <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed text-foreground font-medium">
                San Antonio location has not reported sales for 72 hours; potential POS sync failure.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 bg-card border-border shadow-sm">
          <CardHeader>
            <CardTitle>Performance Trends</CardTitle>
            <CardDescription>Consolidated revenue (M) vs Previous Year</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" opacity={0.2} />
                  <XAxis dataKey="period" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(value) => `$${value}M`} 
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorRevenue)" strokeWidth={2} />
                  <Line type="monotone" dataKey="prevYearRevenue" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-3 bg-card border-border shadow-sm">
          <CardHeader>
            <CardTitle>Revenue by Location</CardTitle>
            <CardDescription>Current quarter performance threshold alerts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={aggregatedRevenue}>
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} hide />
                  <Tooltip 
                    cursor={{fill: 'transparent'}}
                    contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' }}
                  />
                  <Bar dataKey="revenue" radius={[4, 4, 0, 0]} barSize={40}>
                    {aggregatedRevenue.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={getBarColor(entry.revenue)} 
                        className={entry.revenue === 0 ? "animate-pulse" : ""}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mockLocations.map((loc) => (
          <Card key={loc.id} className="bg-card/50 border-border overflow-hidden shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{loc.name}</CardTitle>
                  <CardDescription className="text-xs">{loc.address}</CardDescription>
                </div>
                <div className={cn(
                  "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight",
                  loc.integrationStatus === 'connected' ? "bg-accent/20 text-accent-foreground" :
                  loc.integrationStatus === 'pending' ? "bg-yellow-500/20 text-yellow-600" :
                  "bg-destructive/20 text-destructive"
                )}>
                  {loc.integrationStatus}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Source</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground">{loc.integrationType}</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Data Reliability</span>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-[10px] px-2 py-0",
                      loc.integrationType === 'Excel' 
                        ? "border-yellow-500/50 bg-yellow-500/5 text-yellow-600" 
                        : "border-accent/50 bg-accent/5 text-accent"
                    )}
                  >
                    {loc.integrationType === 'Excel' ? (
                      <ShieldAlert className="size-3 mr-1" />
                    ) : (
                      <ShieldCheck className="size-3 mr-1" />
                    )}
                    {loc.integrationType === 'Excel' ? "Manual Review Needed" : "Verified API"}
                  </Badge>
                </div>

                <div className="pt-2 border-t border-border flex justify-between items-center text-[10px]">
                  <span className="text-muted-foreground italic">Last Sync: {loc.lastSync}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
