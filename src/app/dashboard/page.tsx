
'use client';

import * as React from "react"
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
import { useCollection, useFirestore, useUser, useMemoFirebase } from "@/firebase"
import { collection, query, where } from "firebase/firestore"
import { FinancialRecord } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AlertCircle, Zap, ShieldAlert, ShieldCheck, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export default function DashboardPage() {
  const { user } = useUser()
  const firestore = useFirestore()

  // Fetch all financial records from top-level collection
  const recordsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "financial_records"),
      where(`companyMembers.${user.uid}`, "in", ["admin", "member", true])
    );
  }, [firestore, user]);

  const { data: records, isLoading } = useCollection<FinancialRecord>(recordsQuery);

  // Fetch locations to check health
  const locationsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "locations"),
      where(`companyMembers.${user.uid}`, "in", ["admin", "member", true])
    );
  }, [firestore, user]);
  const { data: locations, isLoading: isLocsLoading } = useCollection(locationsQuery);

  // --- Data Aggregation Logic ---
  
  const processedData = React.useMemo(() => {
    if (!records) return { 
      kpis: { revenue: 0, profit: 0, margin: 0, turn: 0 },
      byLocation: [],
      trends: []
    };

    const locationMap: Record<string, number> = {};
    const periodMap: Record<string, { revenue: number; profit: number; prevYearRevenue: number }> = {};
    let totalRevenue = 0;
    let totalProfit = 0;
    let totalInventory = 0;

    records.forEach(r => {
      // Aggregations for KPIs
      if (r.metric === 'Revenue') {
        totalRevenue += r.value;
        locationMap[r.locationName] = (locationMap[r.locationName] || 0) + r.value;
      }
      if (r.metric === 'Net Profit') totalProfit += r.value;
      if (r.metric === 'Inventory Value') totalInventory += r.value;

      // Aggregations for Trends (Group by Period)
      if (!periodMap[r.period]) {
        periodMap[r.period] = { revenue: 0, profit: 0, prevYearRevenue: 0 };
      }
      if (r.metric === 'Revenue') periodMap[r.period].revenue += r.value;
      if (r.metric === 'Net Profit') periodMap[r.period].profit += r.value;
    });

    // Simple trend matching for "Previous Year"
    const sortedPeriods = Object.keys(periodMap).sort();
    const trends = sortedPeriods.map(p => ({
      period: p,
      revenue: periodMap[p].revenue / 1000000, // Scale to Millions for chart
      profit: periodMap[p].profit / 1000000,
      prevYearRevenue: (periodMap[p].revenue * 0.9) / 1000000 
    }));

    const byLocation = Object.entries(locationMap).map(([name, revenue]) => ({
      name,
      revenue
    }));

    return {
      kpis: {
        revenue: totalRevenue,
        profit: totalProfit,
        margin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
        turn: totalRevenue > 0 && totalInventory > 0 ? (totalRevenue / totalInventory) : 0
      },
      byLocation,
      trends
    };
  }, [records]);

  const getBarColor = (value: number) => {
    if (value === 0) return "hsl(var(--destructive))";
    if (value > 300000) return "hsl(var(--accent))";
    if (value >= 100000) return "#EAB308";
    return "hsl(var(--muted-foreground))";
  };

  if (isLoading || isLocsLoading) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  const { kpis, byLocation, trends } = processedData;

  // Identify unhealthy locations (no updates in last 72h)
  const unhealthyLocs = locations?.filter(loc => {
    if (!loc.updatedAt) return true;
    const lastUpdate = new Date(loc.updatedAt).getTime();
    const limit = Date.now() - (72 * 60 * 60 * 1000);
    return lastUpdate < limit;
  });

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
          value={(kpis.revenue / 1000000).toFixed(2) + "M"} 
          change={12.5} 
          trend="up" 
          prefix="$" 
          secondaryLabel={`Budget: $1.50M (${((kpis.revenue / 1500000) * 100 - 100).toFixed(1)}%)`}
        />
        <KpiCard 
          label="Net Profit" 
          value={(kpis.profit / 1000).toFixed(1) + "K"} 
          change={8.2} 
          trend="up" 
          prefix="$" 
        />
        <KpiCard 
          label="EBITDA Margin" 
          value={kpis.margin.toFixed(1)} 
          change={2.1} 
          trend="up" 
          suffix="%" 
        />
        <KpiCard 
          label="Inventory Turn" 
          value={kpis.turn.toFixed(1)} 
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
              <AlertCircle className={cn("size-4 shrink-0 mt-0.5", unhealthyLocs?.length ? "text-destructive" : "text-accent")} />
              <p className="text-[11px] leading-relaxed text-foreground font-medium">
                {unhealthyLocs?.length 
                  ? `${unhealthyLocs[0].name} has not reported sales for 72 hours; potential POS sync failure.`
                  : "All systems operational. Portfolio is performing 12% above seasonal baseline."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 bg-card border-border shadow-sm">
          <CardHeader>
            <CardTitle>Performance Trends</CardTitle>
            <CardDescription>Consolidated revenue (M) vs Previous Year Estimate</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends}>
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
            <CardDescription>Consolidated metrics from active data streams</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byLocation}>
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} hide />
                  <Tooltip 
                    cursor={{fill: 'transparent'}}
                    contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' }}
                    formatter={(value: number) => `$${value.toLocaleString()}`}
                  />
                  <Bar dataKey="revenue" radius={[4, 4, 0, 0]} barSize={40}>
                    {byLocation.map((entry, index) => (
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
        {locations?.map((loc) => (
          <Card key={loc.id} className="bg-card/50 border-border overflow-hidden shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{loc.name}</CardTitle>
                  <CardDescription className="text-xs truncate max-w-[200px]">{loc.addressLine1}</CardDescription>
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
                      loc.integrationType === 'Excel' || loc.integrationType === 'Manual'
                        ? "border-yellow-500/50 bg-yellow-500/5 text-yellow-600" 
                        : "border-accent/50 bg-accent/5 text-accent"
                    )}
                  >
                    {loc.integrationType === 'Excel' || loc.integrationType === 'Manual' ? (
                      <ShieldAlert className="size-3 mr-1" />
                    ) : (
                      <ShieldCheck className="size-3 mr-1" />
                    )}
                    {loc.integrationType === 'Excel' || loc.integrationType === 'Manual' ? "Manual Review" : "API Verified"}
                  </Badge>
                </div>

                <div className="pt-2 border-t border-border flex justify-between items-center text-[10px]">
                  <span className="text-muted-foreground italic">Last Sync: {loc.lastSync || 'Never'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {!locations?.length && (
          <Card className="col-span-full py-12 flex flex-col items-center justify-center border-dashed border-2">
            <Zap className="size-12 text-muted-foreground opacity-20 mb-4" />
            <p className="text-muted-foreground">No locations found. Add one in the Locations page to see data here.</p>
          </Card>
        )}
      </div>
    </div>
  )
}
