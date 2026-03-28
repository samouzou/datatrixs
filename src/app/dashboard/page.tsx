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
  AreaChart
} from "recharts"
import { mockFinancialRecords, mockLocations } from "@/lib/mock-data"

export default function DashboardPage() {
  // Aggregated data for charts
  const aggregatedRevenue = [
    { name: "Houston", revenue: 495000 },
    { name: "Dallas", revenue: 410000 },
    { name: "Austin", revenue: 310000 },
    { name: "San Antonio", revenue: 0 },
  ]

  const trendData = [
    { period: "Jan", revenue: 2400, profit: 400 },
    { period: "Feb", revenue: 2100, profit: 300 },
    { period: "Mar", revenue: 3200, profit: 800 },
    { period: "Apr", revenue: 2800, profit: 600 },
    { period: "May", revenue: 4500, profit: 1200 },
    { period: "Jun", revenue: 4100, profit: 1100 },
  ]

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight text-white font-headline">Global Dashboard</h2>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-muted-foreground">Datatrixs Holding Co.</span>
        </div>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Revenue" value="1.22M" change={12.5} trend="up" prefix="$" />
        <KpiCard label="Net Profit" value="211.5K" change={8.2} trend="up" prefix="$" />
        <KpiCard label="Avg. Margin" value="17.3" change={2.1} trend="up" suffix="%" />
        <KpiCard label="Inventory Turn" value="4.2" change={0.5} trend="down" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 bg-card/50 border-white/5">
          <CardHeader>
            <CardTitle>Performance Trends</CardTitle>
            <CardDescription>Aggregate revenue and profit across all locations</CardDescription>
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
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" opacity={0.2} />
                  <XAxis dataKey="period" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorRevenue)" strokeWidth={2} />
                  <Area type="monotone" dataKey="profit" stroke="hsl(var(--accent))" fillOpacity={1} fill="url(#colorProfit)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-3 bg-card/50 border-white/5">
          <CardHeader>
            <CardTitle>Revenue by Location</CardTitle>
            <CardDescription>Current quarter breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={aggregatedRevenue}>
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} hide />
                  <Tooltip 
                    cursor={{fill: 'transparent'}}
                    contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mockLocations.map((loc) => (
          <Card key={loc.id} className="bg-card/30 border-white/5 overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{loc.name}</CardTitle>
                  <CardDescription className="text-xs">{loc.address}</CardDescription>
                </div>
                <div className={cn(
                  "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight",
                  loc.integrationStatus === 'connected' ? "bg-accent/20 text-accent" :
                  loc.integrationStatus === 'pending' ? "bg-yellow-500/20 text-yellow-500" :
                  "bg-destructive/20 text-destructive"
                )}>
                  {loc.integrationStatus}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Source</span>
                  <span className="font-medium text-white">{loc.integrationType}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Last Sync</span>
                  <span className="text-xs">{loc.lastSync}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}