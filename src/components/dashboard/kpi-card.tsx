import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

interface KpiCardProps {
  label: string;
  value: string | number;
  change: number;
  trend: 'up' | 'down' | 'neutral';
  prefix?: string;
  suffix?: string;
}

export function KpiCard({ label, value, change, trend, prefix = "", suffix = "" }: KpiCardProps) {
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? "text-accent" : trend === 'down' ? "text-destructive" : "text-muted-foreground";

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-white/5 hover:border-primary/50 transition-all">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <div className={cn("p-1 rounded-full", trendColor + "/10")}>
          <Icon className={cn("size-4", trendColor)} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">
          {prefix}{value}{suffix}
        </div>
        <p className={cn("text-xs mt-1 font-semibold", trendColor)}>
          {trend === 'up' ? "+" : ""}{change}% 
          <span className="text-muted-foreground font-normal ml-1">from last period</span>
        </p>
      </CardContent>
    </Card>
  )
}