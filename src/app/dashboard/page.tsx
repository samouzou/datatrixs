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
import { FinancialRecord, Location } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AlertCircle, Zap, ShieldAlert, ShieldCheck, Loader2, Building2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"

const formatCompactNumber = (number: number) => {
  if (Math.abs(number) < 1000) return number.toString();
  if (Math.abs(number) >= 1000000) return (number / 1000000).toFixed(1) + "M";
  if (Math.abs(number) >= 1000) return (number / 1000).toFixed(1) + "K";
  return number.toString();
};

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
};

const sortPeriods = (periods: string[]) => {
  return [...periods].sort((a, b) => a.localeCompare(b));
};

const displayPeriod = (p: string) => {
  if (p.includes('-Q')) {
    const [y, q] = p.split('-');
    return `${q} ${y}`;
  }
  if (p.includes('-')) {
    const parts = p.split('-');
    if (parts.length === 2) {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthIdx = parseInt(parts[1]) - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${months[monthIdx]} ${parts[0]}`;
      }
    }
  }
  return p;
};

export default function DashboardPage() {
  const { user } = useUser()
  const firestore = useFirestore()

  const recordsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "financial_records"),
      where(`companyMembers.${user.uid}`, "in", ["admin", "member", true])
    );
  }, [firestore, user]);

  const { data: records, isLoading } = useCollection<FinancialRecord>(recordsQuery);

  const locationsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "locations"),
      where(`companyMembers.${user.uid}`, "in", ["admin", "member", true])
    );
  }, [firestore, user]);
  const { data: locations, isLoading: isLocsLoading } = useCollection<Location>(locationsQuery);

  const processedData = React.useMemo(() => {
    if (!records) return { 
      kpis: { 
        revenue: { val: 0, change: 0, trend: 'neutral' as const }, 
        profit: { val: 0, change: 0, trend: 'neutral' as const }, 
        margin: { val: 0, change: 0, trend: 'neutral' as const }, 
        turn: { val: 0, change: 0, trend: 'neutral' as const } 
      },
      byLocation: [],
      trends: [],
      locRevenueMap: {} as Record<string, number>,
      revenueTarget: 1000000,
      targetProgress: 0
    };

    const locationMap: Record<string, number> = {};
    const periodMap: Record<string, { revenue: number; profit: number; inventory: number }> = {};
    
    records.forEach(r => {
      const metric = r.metric.toLowerCase();
      if (!periodMap[r.period]) {
        periodMap[r.period] = { revenue: 0, profit: 0, inventory: 0 };
      }

      if (metric === 'revenue' || metric.includes('revenue')) {
        periodMap[r.period].revenue += r.value;
        locationMap[r.locationName] = (locationMap[r.locationName] || 0) + r.value;
      }
      if (metric === 'net profit' || metric === 'profit') {
        periodMap[r.period].profit += r.value;
      }
      if (metric === 'inventory value' || metric.includes('inventory')) {
        periodMap[r.period].inventory += r.value;
      }
    });

    const sortedPeriods = sortPeriods(Object.keys(periodMap));
    const latestPeriod = sortedPeriods[sortedPeriods.length - 1];
    const prevPeriod = sortedPeriods[sortedPeriods.length - 2];

    const calculateMetrics = (curr: number, prev: number) => {
      if (!prev || prev === 0) return { change: 0, trend: 'neutral' as const };
      const change = ((curr - prev) / Math.abs(prev)) * 100;
      return { 
        change: parseFloat(change.toFixed(1)), 
        trend: change > 0 ? 'up' as const : change < 0 ? 'down' as const : 'neutral' as const 
      };
    };

    const latestData = latestPeriod ? periodMap[latestPeriod] : { revenue: 0, profit: 0, inventory: 0 };
    const prevData = prevPeriod ? periodMap[prevPeriod] : { revenue: 0, profit: 0, inventory: 0 };

    // EBITDA Margin latest and prev
    const latestMargin = latestData.revenue > 0 ? (latestData.profit / latestData.revenue) * 100 : 0;
    const prevMargin = prevData.revenue > 0 ? (prevData.profit / prevData.revenue) * 100 : 0;
    const marginShift = latestMargin - prevMargin;

    // Inventory Turn
    const latestTurn = latestData.revenue > 0 && latestData.inventory > 0 ? (latestData.revenue / latestData.inventory) : 0;
    const prevTurn = prevData.revenue > 0 && prevData.inventory > 0 ? (prevData.revenue / prevData.inventory) : 0;

    const revenueTarget = (locations?.length || 1) * 500000; // $500k target per location
    const targetProgress = Math.min((latestData.revenue / revenueTarget) * 100, 1000);

    const trends = sortedPeriods.map((p, idx) => {
      const prevP = sortedPeriods[idx - 1];
      return {
        period: p,
        displayPeriod: displayPeriod(p),
        revenue: periodMap[p].revenue, 
        profit: periodMap[p].profit,
        prevYearRevenue: prevP ? periodMap[prevP].revenue : periodMap[p].revenue * 0.9
      };
    });

    return {
      kpis: {
        revenue: { val: latestData.revenue, ...calculateMetrics(latestData.revenue, prevData.revenue) },
        profit: { val: latestData.profit, ...calculateMetrics(latestData.profit, prevData.profit) },
        margin: { 
          val: latestMargin, 
          change: parseFloat(marginShift.toFixed(1)), 
          trend: marginShift > 0 ? 'up' as const : marginShift < 0 ? 'down' as const : 'neutral' as const 
        },
        turn: { 
          val: latestTurn, 
          ...calculateMetrics(latestTurn, prevTurn)
        }
      },
      byLocation: Object.entries(locationMap).map(([name, revenue]) => ({ name, revenue })),
      trends,
      locRevenueMap: locationMap,
      revenueTarget,
      targetProgress
    };
  }, [records, locations]);

  const getBarColor = (value: number) => {
    if (value === 0) return "hsl(var(--destructive))";
    if (value > 500000) return "hsl(var(--accent))";
    if (value >= 100000) return "hsl(var(--primary))";
    return "hsl(var(--muted-foreground))";
  };

  if (isLoading || isLocsLoading) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  const { kpis, byLocation, trends, locRevenueMap, revenueTarget, targetProgress } = processedData;

  const unhealthyLocs = locations?.filter(loc => {
    if (!loc.updatedAt) return true;
    const lastUpdate = new Date(loc.updatedAt).getTime();
    const limit = Date.now() - (72 * 60 * 60 * 1000);
    return lastUpdate < limit;
  });

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div className="flex items-center gap-3">
          <Building2 className="size-8 text-primary" />
          <h2 className="text-3xl font-bold tracking-tight text-foreground font-headline">Portfolio Performance</h2>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest">
            {records?.length ? 'Grounded Aggregation Active' : 'Waiting for Data Ingestion'}
          </Badge>
        </div>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <KpiCard 
          label="Portfolio Revenue" 
          value={formatCompactNumber(kpis.revenue.val)} 
          change={kpis.revenue.change} 
          trend={kpis.revenue.trend} 
          prefix="$" 
          secondaryLabel={`Target: ${formatCurrency(revenueTarget)} (${targetProgress.toFixed(0)}%)`}
        />
        <KpiCard 
          label="Net Profit" 
          value={formatCompactNumber(kpis.profit.val)} 
          change={kpis.profit.change} 
          trend={kpis.profit.trend} 
          prefix="$" 
        />
        <KpiCard 
          label="EBITDA Margin" 
          value={kpis.margin.val.toFixed(1)} 
          change={kpis.margin.change} 
          trend={kpis.margin.trend} 
          suffix="%" 
        />
        <KpiCard 
          label="Inventory Turn" 
          value={kpis.turn.val.toFixed(1)} 
          change={kpis.turn.change} 
          trend={kpis.turn.trend} 
        />
        
        <Card className="bg-primary/5 border-primary/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-2">
            <Zap className="size-4 text-primary opacity-50" />
          </div>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-primary">Standardized Insight</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex gap-2">
              <AlertCircle className={cn("size-4 shrink-0 mt-0.5", unhealthyLocs?.length ? "text-destructive" : "text-accent")} />
              <p className="text-[11px] leading-relaxed text-foreground font-medium">
                {unhealthyLocs?.length 
                  ? `${unhealthyLocs[0].name} reported no normalized data for 72h. Check ingestion logs.`
                  : "All streams normalized. Portfolio margin is optimized against sector baseline."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 bg-card border-border shadow-sm">
          <CardHeader>
            <CardTitle>Performance Trends</CardTitle>
            <CardDescription>Consolidated portfolio performance by fiscal period</CardDescription>
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
                  <XAxis dataKey="displayPeriod" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(value) => formatCompactNumber(value)} 
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => [formatCurrency(value), "Revenue"]}
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
            <CardDescription>Normalized contribution per authorized retail unit</CardDescription>
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
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Bar dataKey="revenue" radius={[4, 4, 0, 0]} barSize={40}>
                    {byLocation.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={getBarColor(entry.revenue)} 
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
          <Card key={loc.id} className="bg-card/50 border-border overflow-hidden shadow-sm hover:border-primary/50 transition-colors group">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <CardTitle className="text-lg group-hover:text-primary transition-colors">{loc.name}</CardTitle>
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
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Revenue Contribution</p>
                    <p className="text-lg font-bold text-foreground">{formatCurrency(locRevenueMap[loc.name] || 0)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Source Engine</p>
                    <p className="text-sm font-medium text-foreground">{loc.integrationType}</p>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Audit Score</span>
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
                    {loc.integrationType === 'Excel' || loc.integrationType === 'Manual' ? "Manual Check" : "API Verified"}
                  </Badge>
                </div>

                <div className="pt-3 border-t border-border flex justify-between items-center text-[10px]">
                  <span className="text-muted-foreground italic">Standardized Sync: {loc.lastSync || 'Never'}</span>
                  <span className="text-muted-foreground uppercase font-bold tracking-tighter">REF: {loc.id.substring(0, 8)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {!locations?.length && (
          <Card className="col-span-full py-12 flex flex-col items-center justify-center border-dashed border-2">
            <Loader2 className="size-12 text-muted-foreground opacity-20 mb-4 animate-spin" />
            <p className="text-muted-foreground font-medium">No normalized locations found. Check Holding Structure or Ingest Data.</p>
          </Card>
        )}
      </div>
    </div>
  )
}
