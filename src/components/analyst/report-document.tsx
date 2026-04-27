'use client'

import * as React from "react"
import {
  TrendingUp, TrendingDown, Lightbulb, AlertTriangle,
  CheckCircle2, ChevronRight,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import type { ReportDocumentData, ReportSection, ChartSection, MetricCard } from "@/lib/report-types"
import { TEMPLATE_META } from "@/lib/report-types"
import type { FinancialRecord } from "@/lib/types"
import { cn } from "@/lib/utils"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(val: number): string {
  const abs = Math.abs(val)
  const sign = val < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`
  return `${sign}$${abs.toFixed(0)}`
}

function fmtShortPeriod(period: string): string {
  if (period.includes('-Q')) {
    const [y, q] = period.split('-')
    return `${q} ${y}`
  }
  if (period.includes('-')) {
    const parts = period.split('-')
    if (parts.length === 2) {
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
      return `${months[+parts[1] - 1] ?? parts[1]} ${parts[0]}`
    }
  }
  return period
}

function toComparablePeriod(p: string): string {
  const m = p.match(/^(\d{4})-Q(\d)$/)
  return m ? `${m[1]}-${String(parseInt(m[2]) * 3).padStart(2, '0')}` : p
}

function sumMetric(records: FinancialRecord[], metric: string, period: string): number {
  return records
    .filter(r => r.metric.toLowerCase() === metric.toLowerCase() && r.period === period)
    .reduce((s, r) => s + r.value, 0)
}

function latestPeriod(records: FinancialRecord[]): string {
  const periods = [...new Set(records.map(r => r.period))]
  return periods.sort((a, b) => toComparablePeriod(a).localeCompare(toComparablePeriod(b))).at(-1) ?? ''
}

// ─── Live chart data derivation ───────────────────────────────────────────────

function deriveChartData(section: ChartSection, records: FinancialRecord[]) {
  const metrics = section.metrics ?? []
  let filtered = records.filter(r => metrics.some(m => m.toLowerCase() === r.metric.toLowerCase()))

  if (section.fromPeriod) {
    filtered = filtered.filter(r => toComparablePeriod(r.period) >= toComparablePeriod(section.fromPeriod!))
  }
  if (section.toPeriod) {
    filtered = filtered.filter(r => toComparablePeriod(r.period) <= toComparablePeriod(section.toPeriod!))
  }

  if (section.groupBy === 'location') {
    const byLocation = new Map<string, Record<string, number>>()
    for (const r of filtered) {
      if (!byLocation.has(r.locationName)) byLocation.set(r.locationName, {})
      const entry = byLocation.get(r.locationName)!
      entry[r.metric] = (entry[r.metric] ?? 0) + r.value
    }
    return Array.from(byLocation.entries()).map(([location, vals]) => ({ name: location, ...vals }))
  }

  // group by period
  const byPeriod = new Map<string, Record<string, number>>()
  for (const r of filtered) {
    if (!byPeriod.has(r.period)) byPeriod.set(r.period, {})
    const entry = byPeriod.get(r.period)!
    entry[r.metric] = (entry[r.metric] ?? 0) + r.value
  }
  return Array.from(byPeriod.entries())
    .sort(([a], [b]) => toComparablePeriod(a).localeCompare(toComparablePeriod(b)))
    .map(([period, vals]) => ({ name: fmtShortPeriod(period), ...vals }))
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function DocTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs space-y-1.5 min-w-[160px]">
      <p className="font-bold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.stroke ?? p.fill }}>{p.dataKey}</span>
          <span className="font-bold text-foreground">{fmtCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Colour palette for chart lines/bars ─────────────────────────────────────

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(142 71% 45%)',
  'hsl(38 92% 50%)',
  'hsl(var(--destructive))',
  'hsl(262 83% 58%)',
]

// ─── Section renderers ────────────────────────────────────────────────────────

function NarrativeBlock({ section }: { section: Extract<ReportSection, { type: 'narrative' }> }) {
  const paragraphs = section.body.split(/\n\n+/).filter(Boolean)
  return (
    <div className="space-y-4">
      {paragraphs.map((p, i) => {
        if (p.trim().startsWith('•') || p.trim().startsWith('-')) {
          const items = p.split('\n').filter(l => l.trim().startsWith('•') || l.trim().startsWith('-'))
          return (
            <ul key={i} className="space-y-1.5 pl-2">
              {items.map((item, j) => (
                <li key={j} className="flex items-start gap-2 text-foreground/80 leading-relaxed text-[15px]">
                  <ChevronRight className="size-3.5 mt-1 shrink-0 text-primary" />
                  <span>{item.replace(/^[•\-]\s*/, '')}</span>
                </li>
              ))}
            </ul>
          )
        }
        return <p key={i} className="text-foreground/80 leading-relaxed text-[15px]">{p}</p>
      })}
    </div>
  )
}

function MetricCardsBlock({
  section, records,
}: {
  section: Extract<ReportSection, { type: 'metric_cards' }>
  records: FinancialRecord[]
}) {
  const latest = latestPeriod(records)
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {section.cards.map((card, i) => {
        const period = card.period === 'latest' ? latest : card.period
        const value = sumMetric(records, card.metric, period)
        const compValue = card.comparisonPeriod
          ? sumMetric(records, card.metric, card.comparisonPeriod)
          : null
        const pctChange = compValue && compValue !== 0
          ? ((value - compValue) / Math.abs(compValue)) * 100
          : null
        const isGood = pctChange === null || (card.goodDirection === 'up' ? pctChange >= 0 : pctChange <= 0)

        const displayValue = card.format === 'currency'
          ? fmtCurrency(value)
          : card.format === 'percent'
          ? `${value.toFixed(1)}%`
          : value.toLocaleString()

        return (
          <Card key={i} className="bg-card/50 border-border p-4 space-y-2">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">{card.label}</p>
            <p className="text-2xl font-bold text-foreground">{displayValue}</p>
            {pctChange !== null && (
              <p className={cn("text-xs font-semibold flex items-center gap-1", isGood ? "text-emerald-500" : "text-destructive")}>
                {isGood ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}% vs prior
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">{fmtShortPeriod(period)}</p>
          </Card>
        )
      })}
    </div>
  )
}

function ChartBlock({
  section, records,
}: {
  section: ChartSection
  records: FinancialRecord[]
}) {
  const data = deriveChartData(section, records)
  if (!data.length) return (
    <div className="h-40 flex items-center justify-center text-muted-foreground text-sm italic border border-dashed border-border rounded-lg">
      No data available for this chart
    </div>
  )

  const metrics = section.metrics ?? []

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={260}>
        {section.chartType === 'bar' ? (
          <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => fmtCurrency(v)} width={64} />
            <Tooltip content={<DocTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            {metrics.map((metric, i) => (
              <Bar key={metric} dataKey={metric} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.8} radius={[3,3,0,0]} />
            ))}
          </BarChart>
        ) : (
          <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => fmtCurrency(v)} width={64} />
            <Tooltip content={<DocTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            {metrics.map((metric, i) => (
              <Line key={metric} type="monotone" dataKey={metric} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
      {section.insight && (
        <p className="text-xs text-muted-foreground italic text-center">{section.insight}</p>
      )}
    </div>
  )
}

function TableBlock({ section }: { section: Extract<ReportSection, { type: 'table' }> }) {
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {section.headers.map((h, i) => (
                <th key={i} className={cn(
                  "px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground",
                  i === 0 ? "text-left" : "text-right"
                )}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row, i) => (
              <tr key={i} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                {row.map((cell, j) => (
                  <td key={j} className={cn(
                    "px-4 py-2.5 text-xs",
                    j === 0 ? "text-left font-medium text-foreground" : "text-right text-foreground/80",
                    cell.startsWith('-') && j > 0 ? "text-destructive" : ""
                  )}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {section.insight && (
        <p className="text-xs text-muted-foreground italic">{section.insight}</p>
      )}
    </div>
  )
}

function CalloutBlock({ section }: { section: Extract<ReportSection, { type: 'callout' }> }) {
  const config = {
    insight:        { icon: <Lightbulb  className="size-4 shrink-0 mt-0.5" />, className: 'bg-primary/5 border-primary/20 text-primary' },
    risk:           { icon: <AlertTriangle className="size-4 shrink-0 mt-0.5" />, className: 'bg-destructive/5 border-destructive/20 text-destructive' },
    recommendation: { icon: <CheckCircle2  className="size-4 shrink-0 mt-0.5" />, className: 'bg-emerald-500/5 border-emerald-500/20 text-emerald-500' },
  }[section.variant]

  return (
    <div className={cn("rounded-lg border p-4 flex gap-3", config.className)}>
      {config.icon}
      <div>
        {section.title && <p className="font-bold text-sm mb-1">{section.title}</p>}
        <p className="text-sm leading-relaxed opacity-90">{section.body}</p>
      </div>
    </div>
  )
}

// ─── Section dispatcher ───────────────────────────────────────────────────────

function SectionBlock({ section, records, index }: { section: ReportSection; records: FinancialRecord[]; index: number }) {
  const showTitle = section.type !== 'metric_cards' && section.type !== 'callout' && (section as any).title
  const anchor = (section as any).title
    ? (section as any).title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    : `section-${index}`

  return (
    <div id={anchor} className="scroll-mt-8 space-y-4">
      {showTitle && (
        <h2 className="text-xl font-bold text-foreground border-b border-border pb-3">
          {(section as any).title}
        </h2>
      )}
      {section.type === 'narrative'     && <NarrativeBlock    section={section} />}
      {section.type === 'metric_cards'  && <MetricCardsBlock  section={section} records={records} />}
      {section.type === 'chart'         && <ChartBlock        section={section} records={records} />}
      {section.type === 'table'         && <TableBlock        section={section} />}
      {section.type === 'callout'       && <CalloutBlock      section={section} />}
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ReportDocumentProps {
  document: ReportDocumentData
  records: FinancialRecord[]
  className?: string
}

// ─── Table of contents ────────────────────────────────────────────────────────

function TableOfContents({ sections }: { sections: ReportSection[] }) {
  const items = sections
    .map((s, i) => {
      const title = (s as any).title
      if (!title || s.type === 'callout') return null
      const anchor = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      return { title, anchor, type: s.type, index: i }
    })
    .filter(Boolean) as { title: string; anchor: string; type: string; index: number }[]

  if (items.length < 2) return null

  return (
    <nav className="space-y-1">
      <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-3">Contents</p>
      {items.map((item) => (
        <a
          key={item.anchor}
          href={`#${item.anchor}`}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground py-1 transition-colors group"
        >
          <ChevronRight className="size-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          <span className="truncate">{item.title}</span>
        </a>
      ))}
    </nav>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReportDocument({ document, records, className }: ReportDocumentProps) {
  const meta = TEMPLATE_META[document.template]
  const date = new Date(document.generatedAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  return (
    <div className={cn("flex gap-8", className)}>

      {/* Sticky sidebar TOC */}
      <aside className="hidden xl:block w-52 shrink-0">
        <div className="sticky top-8">
          <TableOfContents sections={document.sections} />
        </div>
      </aside>

      {/* Document body */}
      <article className="flex-1 min-w-0 space-y-10">

        {/* Document header */}
        <header className="space-y-3 pb-8 border-b-2 border-border">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] uppercase tracking-widest">
              {meta.label}
            </Badge>
          </div>
          <h1 className="text-3xl font-bold text-foreground font-headline leading-tight">
            {document.title}
          </h1>
          {document.subtitle && (
            <p className="text-lg text-muted-foreground">{document.subtitle}</p>
          )}
          <p className="text-xs text-muted-foreground">Generated {date}</p>
        </header>

        {/* Sections */}
        {document.sections.map((section, i) => (
          <SectionBlock key={i} section={section} records={records} index={i} />
        ))}

        {/* Footer */}
        <footer className="pt-8 border-t border-border">
          <p className="text-[11px] text-muted-foreground">
            Generated by Warren · {date} · Data reflects financial records as of generation date
          </p>
        </footer>
      </article>
    </div>
  )
}
