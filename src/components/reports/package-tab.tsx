'use client';

import * as React from "react"
import {
  Download, Save, Loader2, PackageOpen, FileText, BarChart2,
  GitCompare, TrendingUp, ArrowUpRight, ArrowDownRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { doc, collection, setDoc } from "firebase/firestore"
import type { Firestore } from "firebase/firestore"
import type { User } from "firebase/auth"
import { FinancialRecord, FinancialPlan, SavedReport, Company } from "@/lib/types"
import type { VerticalConfig } from "@/lib/verticals"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type PackageType = 'portfolio-pl' | 'period-over-period' | 'budget-vs-actual'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCurrency(val: number): string {
  const abs = Math.abs(val)
  const sign = val < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toLocaleString()}`
}

function fmtPct(val: number): string {
  return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`
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

function sortPeriods(periods: string[]) {
  return [...periods].sort((a, b) => a.localeCompare(b))
}

function downloadCsv(rows: string[][], filename: string) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Package type card ────────────────────────────────────────────────────────

function PackageTypeCard({
  type, selected, onSelect,
}: {
  type: PackageType
  selected: boolean
  onSelect: () => void
}) {
  const meta: Record<PackageType, { icon: React.ReactNode; title: string; desc: string }> = {
    'portfolio-pl': {
      icon: <BarChart2 className="size-5" />,
      title: 'Portfolio P&L',
      desc: 'All metrics × all locations for a single period, with portfolio totals.',
    },
    'period-over-period': {
      icon: <GitCompare className="size-5" />,
      title: 'Period-over-Period',
      desc: 'Two periods side-by-side with $ and % variance for every metric.',
    },
    'budget-vs-actual': {
      icon: <TrendingUp className="size-5" />,
      title: 'Budget vs. Actual',
      desc: 'Actuals vs. a saved budget version with attainment for every metric.',
    },
  }
  const m = meta[type]
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-2 p-4 rounded-xl border-2 text-left transition-all",
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/40 bg-card/40"
      )}
    >
      <span className={cn("", selected ? "text-primary" : "text-muted-foreground")}>{m.icon}</span>
      <p className={cn("text-sm font-bold", selected ? "text-foreground" : "text-foreground/80")}>{m.title}</p>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{m.desc}</p>
    </button>
  )
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface PackageTabProps {
  records: FinancialRecord[]
  plans: FinancialPlan[]
  companies: Company[]
  user: User | null
  firestore: Firestore | null
  vertical: VerticalConfig
  onSaved?: (title: string) => void
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PackageTab({ records, plans, companies, user, firestore, vertical, onSaved }: PackageTabProps) {

  const [pkgType,  setPkgType]  = React.useState<PackageType>('portfolio-pl')
  const [period,   setPeriod]   = React.useState('')
  const [periodA,  setPeriodA]  = React.useState('')
  const [periodB,  setPeriodB]  = React.useState('')
  const [version,  setVersion]  = React.useState('Annual Budget')
  const [isSaving, setIsSaving] = React.useState(false)

  const periods = React.useMemo(() => {
    const s = new Set<string>()
    records.forEach(r => s.add(r.period))
    plans.forEach(p => s.add(p.period))
    return sortPeriods(Array.from(s))
  }, [records, plans])

  const versions = React.useMemo(() => {
    const v = new Set(plans.map(p => p.version))
    v.add('Annual Budget')
    return Array.from(v)
  }, [plans])

  // Auto-select sensible defaults
  React.useEffect(() => {
    if (periods.length) {
      if (!period)  setPeriod(periods[periods.length - 1])
      if (!periodB) setPeriodB(periods[periods.length - 1])
      if (!periodA) setPeriodA(periods.length >= 2 ? periods[periods.length - 2] : periods[0])
    }
  }, [periods, period, periodA, periodB])

  // Derived: unique locations and metrics in actuals
  const locations = React.useMemo(() => {
    const m = new Map<string, string>()
    records.forEach(r => { if (!m.has(r.locationId)) m.set(r.locationId, r.locationName) })
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }))
  }, [records])

  const allMetrics = React.useMemo(() => {
    const s = new Set<string>()
    records.forEach(r => s.add(r.metric))
    return Array.from(s).sort()
  }, [records])

  // ── Build: Portfolio P&L ──
  const portfolioTable = React.useMemo(() => {
    if (pkgType !== 'portfolio-pl' || !period) return null
    const pr = records.filter(r => r.period === period)
    if (!pr.length) return null

    const metrics = [...new Set(pr.map(r => r.metric))].sort()

    const headers = [
      vertical.unitLabel,
      ...locations.map(l => l.name),
      'Portfolio Total',
    ]

    const rows = metrics.map(metric => {
      const locVals = locations.map(loc => {
        const sum = pr.filter(r => r.locationId === loc.id && r.metric === metric).reduce((s, r) => s + r.value, 0)
        return sum
      })
      const total = locVals.reduce((s, v) => s + v, 0)
      return { metric, locVals, total }
    })

    return { headers, rows }
  }, [pkgType, period, records, locations, vertical])

  // ── Build: Period-over-Period ──
  const popTable = React.useMemo(() => {
    if (pkgType !== 'period-over-period' || !periodA || !periodB) return null
    const rA = records.filter(r => r.period === periodA)
    const rB = records.filter(r => r.period === periodB)
    if (!rA.length && !rB.length) return null

    const metrics = [...new Set([...rA, ...rB].map(r => r.metric))].sort()

    return metrics.map(metric => {
      const sumA = rA.filter(r => r.metric === metric).reduce((s, r) => s + r.value, 0)
      const sumB = rB.filter(r => r.metric === metric).reduce((s, r) => s + r.value, 0)
      const delta = sumB - sumA
      const pct   = sumA !== 0 ? (delta / Math.abs(sumA)) * 100 : null
      return { metric, sumA, sumB, delta, pct }
    })
  }, [pkgType, periodA, periodB, records])

  // ── Build: Budget vs. Actual ──
  const bvaTable = React.useMemo(() => {
    if (pkgType !== 'budget-vs-actual' || !period) return null
    const pr = records.filter(r => r.period === period)
    const pp = plans.filter(p => p.period === period && p.version === version)

    const metrics = [...new Set([...pr.map(r => r.metric), ...pp.map(p => p.metric)])].sort()

    return metrics.map(metric => {
      const actual  = pr.filter(r => r.metric === metric).reduce((s, r) => s + r.value, 0)
      const planned = pp.filter(p => p.metric === metric).reduce((s, p) => s + p.plannedValue, 0)
      const hasP = planned !== 0
      const varD = hasP ? actual - planned : null
      const varPct = (hasP && planned !== 0) ? ((actual - planned) / Math.abs(planned)) * 100 : null
      const attainment = (hasP && planned !== 0) ? (actual / planned) * 100 : null
      return { metric, actual, planned: hasP ? planned : null, varD, varPct, attainment }
    })
  }, [pkgType, period, version, records, plans])

  // ── CSV export ──
  function handleDownload() {
    const date = fmtShortPeriod(period || periodB || '')
    if (pkgType === 'portfolio-pl' && portfolioTable) {
      const csvRows: string[][] = [
        portfolioTable.headers,
        ...portfolioTable.rows.map(r => [
          r.metric,
          ...r.locVals.map(v => String(v)),
          String(r.total),
        ]),
      ]
      downloadCsv(csvRows, `Portfolio_PL_${date}`)
    } else if (pkgType === 'period-over-period' && popTable) {
      const csvRows: string[][] = [
        ['Metric', fmtShortPeriod(periodA), fmtShortPeriod(periodB), 'Var $', 'Var %'],
        ...popTable.map(r => [
          r.metric,
          String(r.sumA),
          String(r.sumB),
          String(r.delta),
          r.pct !== null ? r.pct.toFixed(1) + '%' : '—',
        ]),
      ]
      downloadCsv(csvRows, `PeriodOverPeriod_${fmtShortPeriod(periodA)}_vs_${fmtShortPeriod(periodB)}`)
    } else if (pkgType === 'budget-vs-actual' && bvaTable) {
      const csvRows: string[][] = [
        ['Metric', 'Actual', 'Budget', 'Var $', 'Var %', 'Attainment'],
        ...bvaTable.map(r => [
          r.metric,
          String(r.actual),
          r.planned !== null ? String(r.planned) : '—',
          r.varD !== null ? String(r.varD) : '—',
          r.varPct !== null ? r.varPct.toFixed(1) + '%' : '—',
          r.attainment !== null ? r.attainment.toFixed(1) + '%' : '—',
        ]),
      ]
      downloadCsv(csvRows, `BudgetVsActual_${date}_${version}`)
    }
  }

  // ── Save to Library ──
  async function handleSave() {
    if (!firestore || !user || !companies?.[0]) return
    setIsSaving(true)
    const company = companies[0]
    const id = doc(collection(firestore, 'saved_reports')).id

    const titles: Record<PackageType, string> = {
      'portfolio-pl':       `Portfolio P&L — ${fmtShortPeriod(period)}`,
      'period-over-period': `Period Comparison — ${fmtShortPeriod(periodA)} vs. ${fmtShortPeriod(periodB)}`,
      'budget-vs-actual':   `Budget vs. Actual — ${fmtShortPeriod(period)} (${version})`,
    }

    let content = ''
    if (pkgType === 'portfolio-pl' && portfolioTable) {
      content = [
        portfolioTable.headers.join(','),
        ...portfolioTable.rows.map(r => [r.metric, ...r.locVals.map(String), String(r.total)].join(',')),
      ].join('\n')
    } else if (pkgType === 'period-over-period' && popTable) {
      content = [
        ['Metric', fmtShortPeriod(periodA), fmtShortPeriod(periodB), 'Var $', 'Var %'].join(','),
        ...popTable.map(r => [r.metric, String(r.sumA), String(r.sumB), String(r.delta), r.pct?.toFixed(1) + '%'].join(',')),
      ].join('\n')
    } else if (pkgType === 'budget-vs-actual' && bvaTable) {
      content = [
        ['Metric', 'Actual', 'Budget', 'Var $', 'Var %', 'Attainment'].join(','),
        ...bvaTable.map(r => [r.metric, String(r.actual), String(r.planned ?? '—'), String(r.varD ?? '—'), (r.varPct?.toFixed(1) ?? '—') + '%', (r.attainment?.toFixed(1) ?? '—') + '%'].join(',')),
      ].join('\n')
    }

    const report: SavedReport = {
      id,
      userId: user.uid,
      title: titles[pkgType],
      type: 'Financial Package',
      summary: `Structured financial package: ${titles[pkgType]}`,
      content,
      companyMembers: company.members,
      createdAt: new Date().toISOString(),
    }

    await setDoc(doc(firestore, 'saved_reports', id), report)
    setIsSaving(false)
    onSaved?.(report.title)
  }

  const hasData = !!(
    (pkgType === 'portfolio-pl' && portfolioTable) ||
    (pkgType === 'period-over-period' && popTable?.length) ||
    (pkgType === 'budget-vs-actual' && bvaTable?.length)
  )

  return (
    <div className="space-y-6">

      {/* Package type selector */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(['portfolio-pl', 'period-over-period', 'budget-vs-actual'] as PackageType[]).map(t => (
          <PackageTypeCard key={t} type={t} selected={pkgType === t} onSelect={() => setPkgType(t)} />
        ))}
      </div>

      {/* Period/version controls */}
      <div className="flex flex-wrap items-center gap-4">
        {pkgType === 'period-over-period' ? (
          <>
            <div className="flex items-center gap-2">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">From</Label>
              <Select value={periodA} onValueChange={setPeriodA}>
                <SelectTrigger className="h-9 w-36 bg-card border-border text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{periods.map(p => <SelectItem key={p} value={p}>{fmtShortPeriod(p)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">To</Label>
              <Select value={periodB} onValueChange={setPeriodB}>
                <SelectTrigger className="h-9 w-36 bg-card border-border text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{periods.map(p => <SelectItem key={p} value={p}>{fmtShortPeriod(p)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Period</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-9 w-36 bg-card border-border text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{periods.map(p => <SelectItem key={p} value={p}>{fmtShortPeriod(p)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        {pkgType === 'budget-vs-actual' && (
          <div className="flex items-center gap-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Version</Label>
            <Select value={version} onValueChange={setVersion}>
              <SelectTrigger className="h-9 w-44 bg-card border-border text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{versions.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        {hasData && (
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" className="h-9 gap-2" onClick={handleDownload}>
              <Download className="size-4" /> Download CSV
            </Button>
            <Button size="sm" className="h-9 gap-2" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save to Library
            </Button>
          </div>
        )}
      </div>

      {/* ── No data state ── */}
      {!hasData && (
        <div className="text-center py-24 border-2 border-dashed border-border rounded-xl">
          <PackageOpen className="mx-auto size-12 text-muted-foreground opacity-20 mb-4" />
          <p className="text-muted-foreground italic">No data available for this selection.</p>
          <p className="text-xs text-muted-foreground mt-1">Upload financial data from the {vertical.unitsLabel} page first.</p>
        </div>
      )}

      {/* ── Portfolio P&L ── */}
      {pkgType === 'portfolio-pl' && portfolioTable && (
        <PackageCard
          title={`Portfolio P&L — ${fmtShortPeriod(period)}`}
          subtitle={`${locations.length} ${vertical.unitsLabel.toLowerCase()} · All metrics`}
          icon={<BarChart2 className="size-4 text-primary" />}
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-muted/30 hover:bg-muted/30">
                  {portfolioTable.headers.map((h, i) => (
                    <TableHead key={i} className={cn(
                      "text-[10px] font-bold uppercase tracking-wider whitespace-nowrap border-r border-border last:border-r-0",
                      i === 0 ? "text-muted-foreground" : i === portfolioTable.headers.length - 1 ? "text-foreground bg-muted/50" : "text-center text-muted-foreground"
                    )}>
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {portfolioTable.rows.map((row, ri) => {
                  const isHighlight = ['Revenue', 'Net Profit', 'EBITDA', 'Gross Profit'].includes(row.metric)
                  return (
                    <TableRow key={ri} className={cn("border-border hover:bg-muted/20", isHighlight && "bg-primary/5 font-semibold")}>
                      <TableCell className="font-medium text-sm whitespace-nowrap border-r border-border">{row.metric}</TableCell>
                      {row.locVals.map((v, li) => (
                        <TableCell key={li} className="text-center text-sm font-mono border-r border-border">
                          {v !== 0 ? fmtCurrency(v) : <span className="text-muted-foreground/40">—</span>}
                        </TableCell>
                      ))}
                      <TableCell className="text-center text-sm font-bold font-mono bg-muted/20">
                        {row.total !== 0 ? fmtCurrency(row.total) : <span className="text-muted-foreground/40">—</span>}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </PackageCard>
      )}

      {/* ── Period-over-Period ── */}
      {pkgType === 'period-over-period' && popTable && (
        <PackageCard
          title={`${fmtShortPeriod(periodA)} vs. ${fmtShortPeriod(periodB)}`}
          subtitle="Period-over-period variance analysis"
          icon={<GitCompare className="size-4 text-primary" />}
        >
          {/* Summary KPIs */}
          {(() => {
            const rev = popTable.find(r => r.metric === 'Revenue')
            const profit = popTable.find(r => r.metric === 'Net Profit') ?? popTable.find(r => r.metric === 'EBITDA')
            return (rev || profit) ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 border-b border-border bg-muted/20">
                {[rev, profit].filter(Boolean).flatMap(r => r ? [
                  { label: `${r.metric} (${fmtShortPeriod(periodA)})`, value: fmtCurrency(r.sumA), delta: null },
                  { label: `${r.metric} (${fmtShortPeriod(periodB)})`, value: fmtCurrency(r.sumB), delta: r.pct },
                ] : []).map((kpi, i) => (
                  <div key={i} className="space-y-0.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{kpi.label}</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-lg font-bold">{kpi.value}</p>
                      {kpi.delta !== null && (
                        <span className={cn("text-xs font-bold flex items-center gap-0.5", kpi.delta >= 0 ? "text-emerald-500" : "text-destructive")}>
                          {kpi.delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                          {fmtPct(kpi.delta)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : null
          })()}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-muted/30 hover:bg-muted/30">
                  {['Metric', fmtShortPeriod(periodA), fmtShortPeriod(periodB), 'Var $', 'Var %'].map((h, i) => (
                    <TableHead key={i} className="text-[10px] font-bold uppercase tracking-wider border-r border-border last:border-r-0 text-muted-foreground">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {popTable.map((row, ri) => {
                  const isGood = row.delta >= 0
                  const isHighlight = ['Revenue', 'Net Profit', 'EBITDA', 'Gross Profit'].includes(row.metric)
                  return (
                    <TableRow key={ri} className={cn("border-border hover:bg-muted/20", isHighlight && "bg-primary/5 font-semibold")}>
                      <TableCell className="font-medium text-sm border-r border-border">{row.metric}</TableCell>
                      <TableCell className="text-sm font-mono border-r border-border">{fmtCurrency(row.sumA)}</TableCell>
                      <TableCell className="text-sm font-mono font-bold border-r border-border">{fmtCurrency(row.sumB)}</TableCell>
                      <TableCell className={cn("text-sm font-mono font-bold border-r border-border", isGood ? "text-emerald-500" : "text-destructive")}>
                        {row.delta >= 0 ? '+' : ''}{fmtCurrency(row.delta)}
                      </TableCell>
                      <TableCell className={cn("text-sm font-bold", row.pct === null ? "text-muted-foreground" : isGood ? "text-emerald-500" : "text-destructive")}>
                        {row.pct !== null ? (
                          <span className="flex items-center gap-1">
                            {isGood ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                            {fmtPct(row.pct)}
                          </span>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </PackageCard>
      )}

      {/* ── Budget vs. Actual ── */}
      {pkgType === 'budget-vs-actual' && bvaTable && (
        <PackageCard
          title={`Budget vs. Actual — ${fmtShortPeriod(period)}`}
          subtitle={`Version: ${version}`}
          icon={<TrendingUp className="size-4 text-primary" />}
        >
          {/* Summary KPIs */}
          {(() => {
            const rev = bvaTable.find(r => r.metric === 'Revenue')
            const profit = bvaTable.find(r => r.metric === 'Net Profit') ?? bvaTable.find(r => r.metric === 'EBITDA')
            const items = [rev, profit].filter(Boolean).filter(r => r!.planned !== null)
            return items.length ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 border-b border-border bg-muted/20">
                {items.flatMap(r => r ? [
                  { label: `${r.metric} Actual`, value: fmtCurrency(r.actual), delta: null },
                  { label: `${r.metric} Attainment`, value: r.attainment !== null ? `${r.attainment.toFixed(1)}%` : '—', delta: r.varPct },
                ] : []).map((kpi, i) => (
                  <div key={i} className="space-y-0.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{kpi.label}</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-lg font-bold">{kpi.value}</p>
                      {kpi.delta !== null && (
                        <span className={cn("text-xs font-bold flex items-center gap-0.5", kpi.delta >= 0 ? "text-emerald-500" : "text-destructive")}>
                          {kpi.delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                          {fmtPct(kpi.delta)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : null
          })()}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-muted/30 hover:bg-muted/30">
                  {['Metric', 'Actual', 'Budget', 'Var $', 'Var %', 'Attainment'].map((h, i) => (
                    <TableHead key={i} className="text-[10px] font-bold uppercase tracking-wider border-r border-border last:border-r-0 text-muted-foreground">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {bvaTable.map((row, ri) => {
                  const isGood = row.varD === null || row.varD >= 0
                  const isHighlight = ['Revenue', 'Net Profit', 'EBITDA', 'Gross Profit'].includes(row.metric)
                  return (
                    <TableRow key={ri} className={cn("border-border hover:bg-muted/20", isHighlight && "bg-primary/5 font-semibold")}>
                      <TableCell className="font-medium text-sm border-r border-border">{row.metric}</TableCell>
                      <TableCell className="text-sm font-mono font-bold border-r border-border">{fmtCurrency(row.actual)}</TableCell>
                      <TableCell className="text-sm font-mono text-muted-foreground border-r border-border">
                        {row.planned !== null ? fmtCurrency(row.planned) : <span className="italic text-xs">No budget</span>}
                      </TableCell>
                      <TableCell className={cn("text-sm font-mono font-bold border-r border-border",
                        row.varD === null ? "text-muted-foreground" : isGood ? "text-emerald-500" : "text-destructive"
                      )}>
                        {row.varD !== null ? `${isGood ? '+' : ''}${fmtCurrency(row.varD)}` : '—'}
                      </TableCell>
                      <TableCell className={cn("text-sm font-bold border-r border-border",
                        row.varPct === null ? "text-muted-foreground" : isGood ? "text-emerald-500" : "text-destructive"
                      )}>
                        {row.varPct !== null ? (
                          <span className="flex items-center gap-1">
                            {isGood ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                            {fmtPct(row.varPct)}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        {row.attainment !== null ? (
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn("h-full rounded-full", isGood ? "bg-emerald-500" : "bg-destructive")}
                                style={{ width: `${Math.min(100, row.attainment)}%` }}
                              />
                            </div>
                            <span className={cn("text-xs font-bold", isGood ? "text-emerald-500" : "text-destructive")}>
                              {row.attainment.toFixed(0)}%
                            </span>
                          </div>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </PackageCard>
      )}
    </div>
  )
}

// ─── Package card wrapper ─────────────────────────────────────────────────────

function PackageCard({
  title, subtitle, icon, children,
}: {
  title: string
  subtitle: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className="bg-card/30 border-border overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 bg-muted/20 border-b border-border">
        <div className="p-1.5 rounded-lg bg-primary/10">{icon}</div>
        <div>
          <p className="font-bold text-sm text-foreground">{title}</p>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Live Data</span>
        </div>
      </div>
      {children}
    </Card>
  )
}
