"use client"

import * as React from "react"
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart"

interface ChartViewProps {
  type: 'bar' | 'line' | 'pie' | 'table'
  title: string
  data: any[]
  xAxisLabel?: string
  yAxisLabel?: string
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--accent))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))'
]

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

export function ChartView({ type, title, data, xAxisLabel, yAxisLabel }: ChartViewProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground italic">
        No structured data available for visualization.
      </div>
    )
  }

  const chartConfig = {
    value: {
      label: data[0]?.metric || "Value",
      color: "hsl(var(--primary))",
    },
  } satisfies ChartConfig

  return (
    <div className="w-full space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-bold text-foreground">{title}</h3>
        {(xAxisLabel || yAxisLabel) && (
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            {xAxisLabel} {xAxisLabel && yAxisLabel ? "vs" : ""} {yAxisLabel}
          </p>
        )}
      </div>

      <ChartContainer config={chartConfig} className="min-h-[350px] w-full">
        {type === 'bar' ? (
          <BarChart data={data}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted/20" />
            <XAxis 
              dataKey="label" 
              tickLine={false} 
              axisLine={false} 
              tickMargin={8} 
              fontSize={10}
              className="fill-muted-foreground"
            />
            <YAxis 
              tickLine={false} 
              axisLine={false} 
              tickMargin={8} 
              fontSize={10}
              className="fill-muted-foreground"
              tickFormatter={(value) => `$${formatCompactNumber(value)}`}
            />
            <ChartTooltip 
              content={<ChartTooltipContent />} 
              formatter={(value: number) => [formatCurrency(value), "Value"]}
            />
            <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} barSize={40} />
          </BarChart>
        ) : type === 'line' ? (
          <LineChart data={data}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted/20" />
            <XAxis 
              dataKey="label" 
              tickLine={false} 
              axisLine={false} 
              tickMargin={8} 
              fontSize={10}
              className="fill-muted-foreground"
            />
            <YAxis 
              tickLine={false} 
              axisLine={false} 
              tickMargin={8} 
              fontSize={10}
              className="fill-muted-foreground"
              tickFormatter={(value) => `$${formatCompactNumber(value)}`}
            />
            <ChartTooltip 
              content={<ChartTooltipContent />} 
              formatter={(value: number) => [formatCurrency(value), "Value"]}
            />
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke="var(--color-value)" 
              strokeWidth={3} 
              dot={{ r: 4, fill: "var(--color-value)" }} 
              activeDot={{ r: 6 }}
            />
          </LineChart>
        ) : (
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={5}
              strokeWidth={2}
              stroke="hsl(var(--background))"
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <ChartTooltip 
              content={<ChartTooltipContent hideLabel />} 
              formatter={(value: number) => formatCurrency(value)}
            />
            <ChartLegend content={<ChartLegendContent nameKey="label" />} className="-translate-y-2 flex-wrap" />
          </PieChart>
        )}
      </ChartContainer>
    </div>
  )
}
