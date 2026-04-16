'use client';

import * as React from "react"
import {
  Loader2, Save, Info, TrendingUp, TrendingDown, Plus, Minus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts"
import { doc, writeBatch } from "firebase/firestore"
import type { Firestore } from "firebase/firestore"
import type { User } from "firebase/auth"
import { FinancialRecord, FinancialPlan, Company } from "@/lib/types"
import type { VerticalConfig } from "@/lib/verticals"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type LocationMeta = { id: string; name: string }

type ForecastRow = {
  period: string
  label: string
  isBase: boolean
  revenue: number
  compRevenue: number
  newUnitRevenue: number
  cogs: number
  grossProfit: number
  grossMarginPct: number
  labor: number
  opex: number
  ebitda: number
  ebitdaMarginPct: number
  unitCount: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

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

function generateForwardPeriods(basePeriod: string, count: number): string[] {
  const periods: string[] = []
  if (basePeriod.includes('-Q')) {
    const [year, qStr] = basePeriod.split('-Q')
    let y = parseInt(year), q = parseInt(qStr)
    for (let i = 0; i < count; i++) {
      if (++q > 4) { q = 1; y++ }
      periods.push(`${y}-Q${q}`)
    }
  } else if (basePeriod.includes('-')) {
    const [year, month] = basePeriod.split('-')
    let y = parseInt(year), m = parseInt(month)
    for (let i = 0; i < count; i++) {
      if (++m > 12) { m = 1; y++ }
      periods.push(`${y}-${String(m).padStart(2, '0')}`)
    }
  } else {
    let y = parseInt(basePeriod) || new Date().getFullYear()
    for (let i = 0; i < count; i++) periods.push(String(++y))
  }
  return periods
}

function sumMetric(records: FinancialRecord[], ...names: string[]): number {
  const lower = names.map(n => n.toLowerCase())
  return records.filter(r => lower.includes(r.metric.toLowerCase())).reduce((s, r) => s + r.value, 0)
}

// New unit ramp: period 0 after open = 60%, period 1 = 85%, period 2+ = 100%
const RAMP = [0.6, 0.85, 1.0]
function rampFactor(periodsOpen: number): number {
  return RAMP[Math.min(periodsOpen, RAMP.length - 1)]
}

function buildForecast(
  basePeriod: string,
  baseRevenue: number,
  baseUnitCount: number,
  horizon: number,
  sssPct: number,
  newUnitsPerPeriod: number[],
  cogsPct: number,
  laborPct: number,
  opexPct: number,
  auv: number,
): ForecastRow[] {
  const forwardPeriods = generateForwardPeriods(basePeriod, horizon)
  const rows: ForecastRow[] = []
  let runningComp = baseRevenue
  let cumulativeNewUnits = 0
  const cohorts: { periodIdx: number; units: number }[] = []

  forwardPeriods.forEach((period, idx) => {
    runningComp = runningComp * (1 + sssPct / 100)

    const newThisPeriod = newUnitsPerPeriod[idx] ?? 0
    if (newThisPeriod > 0) {
      cohorts.push({ periodIdx: idx, units: newThisPeriod })
      cumulativeNewUnits += newThisPeriod
    }

    let newUnitRevenue = 0
    for (const c of cohorts) {
      newUnitRevenue += c.units * auv * rampFactor(idx - c.periodIdx)
    }

    const revenue = runningComp + newUnitRevenue
    const cogs = revenue * (cogsPct / 100)
    const grossProfit = revenue - cogs
    const labor = revenue * (laborPct / 100)
    const opex = revenue * (opexPct / 100)
    const ebitda = grossProfit - labor - opex

    rows.push({
      period,
      label: fmtShortPeriod(period),
      isBase: false,
      revenue,
      compRevenue: runningComp,
      newUnitRevenue,
      cogs,
      grossProfit,
      grossMarginPct: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
      labor,
      opex,
      ebitda,
      ebitdaMarginPct: revenue > 0 ? (ebitda / revenue) * 100 : 0,
      unitCount: baseUnitCount + cumulativeNewUnits,
    })
  })

  return rows
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function ForecastTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs space-y-1 min-w-[140px]">
      <p className="font-bold text-foreground mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-bold text-foreground">{fmtCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Metric row in the P&L table ─────────────────────────────────────────────

function PnlRow({
  label, dataKey, baseValue, rows, formatter, isSubRow = false, isHighlight = false, isDim = false,
}: {
  label: string
  dataKey?: string
  baseValue: number | null
  rows: ForecastRow[]
  formatter: (v: number) => string
  isSubRow?: boolean
  isHighlight?: boolean
  isDim?: boolean
}) {
  const key = dataKey ?? label
  return (
    <tr className={cn(
      "border-b border-border/50",
      isHighlight && "bg-primary/5 font-bold",
      isDim && "opacity-60",
    )}>
      <td className={cn("px-4 py-2.5 text-xs text-muted-foreground", isSubRow && "pl-8", isHighlight && "text-foreground font-bold")}>
        {isSubRow && <span className="text-muted-foreground mr-1">↳</span>}
        {label}
      </td>
      {/* Base */}
      <td className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground bg-muted/20">
        {baseValue !== null ? formatter(baseValue) : <span className="italic text-muted-foreground/50">—</span>}
      </td>
      {/* Forecast periods */}
      {rows.map((row, i) => {
        let val: number
        switch (key) {
          case 'Revenue':         val = row.revenue; break
          case 'Comp Revenue':    val = row.compRevenue; break
          case 'New Unit Rev.':   val = row.newUnitRevenue; break
          case 'COGS':            val = row.cogs; break
          case 'Gross Profit':    val = row.grossProfit; break
          case 'Gross Margin %':  val = row.grossMarginPct; break
          case 'Labor':           val = row.labor; break
          case 'OpEx':            val = row.opex; break
          case 'EBITDA':          val = row.ebitda; break
          case 'EBITDA %':        val = row.ebitdaMarginPct; break
          case 'Unit Count':      val = row.unitCount; break
          default:                val = 0
        }
        const prevVal = i === 0 ? (baseValue ?? 0) : (() => {
          const prevRow = rows[i - 1]
          switch (key) {
            case 'Revenue': return prevRow.revenue
            case 'EBITDA':  return prevRow.ebitda
            default:        return null
          }
        })()
        const showDelta = (key === 'Revenue' || key === 'EBITDA') && prevVal !== null
        const delta = showDelta ? ((val - (prevVal as number)) / Math.abs(prevVal as number || 1)) * 100 : null

        return (
          <td key={i} className="px-4 py-2.5 text-center text-xs">
            <div className="flex flex-col items-center gap-0.5">
              <span className={cn("font-medium", isHighlight && "font-bold text-foreground")}>
                {formatter(val)}
              </span>
              {delta !== null && (
                <span className={cn("text-[10px] font-semibold", delta >= 0 ? "text-emerald-500" : "text-destructive")}>
                  {delta >= 0 ? <TrendingUp className="size-2.5 inline mr-0.5" /> : <TrendingDown className="size-2.5 inline mr-0.5" />}
                  {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
                </span>
              )}
            </div>
          </td>
        )
      })}
    </tr>
  )
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface ForecastTabProps {
  records: FinancialRecord[]
  companies: Company[]
  user: User | null
  firestore: Firestore | null
  vertical: VerticalConfig
  locations: LocationMeta[]
  periods: string[]
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ForecastTab({
  records, companies, user, firestore, vertical, locations, periods,
}: ForecastTabProps) {

  // ── Base config ──
  const [basePeriod,  setBasePeriod]  = React.useState('')
  const [horizon,     setHorizon]     = React.useState(4)

  // ── Assumptions ──
  const [sssPct,      setSssPct]      = React.useState(3.0)
  const [cogsPct,     setCogsPct]     = React.useState(38.0)
  const [laborPct,    setLaborPct]    = React.useState(28.0)
  const [opexPct,     setOpexPct]     = React.useState(12.0)
  const [auv,         setAuv]         = React.useState(0)
  const [newUnits,    setNewUnits]    = React.useState<number[]>([])

  // ── Save dialog ──
  const [saveOpen,    setSaveOpen]    = React.useState(false)
  const [saveName,    setSaveName]    = React.useState('')
  const [isSaving,    setIsSaving]    = React.useState(false)

  // Auto-select latest period
  React.useEffect(() => {
    if (periods.length && !basePeriod) setBasePeriod(periods[periods.length - 1])
  }, [periods, basePeriod])

  // Auto-compute cost %s and AUV from base period actuals
  React.useEffect(() => {
    if (!basePeriod || !records.length) return
    const base = records.filter(r => r.period === basePeriod)
    const rev = sumMetric(base, 'Revenue')
    if (rev <= 0) return

    const cogs  = sumMetric(base, 'COGS')
    const labor = sumMetric(base, 'Labor', 'Payroll')
    const opex  = sumMetric(base, 'Operating Expenses', 'SG&A Expense')

    if (cogs  > 0) setCogsPct(+((cogs  / rev) * 100).toFixed(1))
    if (labor > 0) setLaborPct(+((labor / rev) * 100).toFixed(1))
    if (opex  > 0) setOpexPct(+((opex  / rev) * 100).toFixed(1))

    // AUV = base revenue / unit count
    const unitCount = locations.length || 1
    setAuv(Math.round(rev / unitCount))
  }, [basePeriod, records, locations])

  // Resize newUnits array when horizon changes
  React.useEffect(() => {
    setNewUnits(prev => {
      const next = [...prev]
      while (next.length < horizon) next.push(0)
      return next.slice(0, horizon)
    })
  }, [horizon])

  // ── Computed ──
  const baseRecords = React.useMemo(
    () => records.filter(r => r.period === basePeriod),
    [records, basePeriod]
  )

  const baseRevenue    = React.useMemo(() => sumMetric(baseRecords, 'Revenue'), [baseRecords])
  const baseCogs       = React.useMemo(() => sumMetric(baseRecords, 'COGS'), [baseRecords])
  const baseLabor      = React.useMemo(() => sumMetric(baseRecords, 'Labor', 'Payroll'), [baseRecords])
  const baseOpex       = React.useMemo(() => sumMetric(baseRecords, 'Operating Expenses', 'SG&A Expense'), [baseRecords])
  const baseNetProfit  = React.useMemo(() => sumMetric(baseRecords, 'Net Profit'), [baseRecords])
  const baseGrossProfit = baseRevenue - baseCogs
  const baseEbitda     = baseNetProfit || (baseGrossProfit - baseLabor - baseOpex)
  const baseUnitCount  = locations.length

  const forecastRows = React.useMemo(() => {
    if (!basePeriod || baseRevenue <= 0) return []
    return buildForecast(
      basePeriod, baseRevenue, baseUnitCount,
      horizon, sssPct, newUnits,
      cogsPct, laborPct, opexPct, auv,
    )
  }, [basePeriod, baseRevenue, baseUnitCount, horizon, sssPct, newUnits, cogsPct, laborPct, opexPct, auv])

  const hasNewUnits = newUnits.some(n => n > 0)

  // Chart data — base + forecast
  const chartData = React.useMemo(() => {
    const base = basePeriod
      ? [{ name: fmtShortPeriod(basePeriod), revenue: baseRevenue, ebitda: baseEbitda, isBase: true }]
      : []
    const forecast = forecastRows.map(r => ({
      name: r.label, revenue: r.revenue, ebitda: r.ebitda, isBase: false,
    }))
    return [...base, ...forecast]
  }, [basePeriod, baseRevenue, baseEbitda, forecastRows])

  // ── Save forecast to financial_plans ──
  async function handleSaveForecast() {
    if (!firestore || !user || !companies?.[0] || !forecastRows.length) return
    setIsSaving(true)

    const company = companies[0]
    const version = saveName.trim() || 'Forecast'
    const totalBase = baseRevenue || 1

    // Allocate portfolio totals to each location proportionally by base revenue share
    const locShares = locations.map(loc => {
      const locRev = baseRecords.filter(r => r.locationId === loc.id && r.metric === 'Revenue')
        .reduce((s, r) => s + r.value, 0)
      return { loc, share: locRev / totalBase }
    })

    // Batch writes (Firestore limit = 500 ops, chunk at 450)
    const allOps: { planId: string; data: FinancialPlan }[] = []

    for (const row of forecastRows) {
      const metricsToWrite = [
        { metric: 'Revenue',              value: row.revenue },
        { metric: 'COGS',                 value: row.cogs },
        { metric: 'Gross Profit',         value: row.grossProfit },
        { metric: 'Labor',                value: row.labor },
        { metric: 'Operating Expenses',   value: row.opex },
        { metric: 'Net Profit',           value: row.ebitda },
      ]

      for (const { metric, value } of metricsToWrite) {
        for (const { loc, share } of locShares) {
          const planId = `${loc.id}_${slugify(row.period)}_${slugify(metric)}_${slugify(version)}`
          allOps.push({
            planId,
            data: {
              id: planId,
              companyId: company.id,
              locationId: loc.id,
              locationName: loc.name,
              period: row.period,
              metric,
              plannedValue: value * share,
              version,
              companyMembers: company.members,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          })
        }
      }
    }

    // Execute in chunks of 450
    for (let i = 0; i < allOps.length; i += 450) {
      const chunk = allOps.slice(i, i + 450)
      const batch = writeBatch(firestore)
      for (const op of chunk) {
        batch.set(doc(firestore, 'financial_plans', op.planId), op.data, { merge: true })
      }
      await batch.commit()
    }

    setIsSaving(false)
    setSaveOpen(false)
    setSaveName('')
  }

  if (!basePeriod) {
    return (
      <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
        <TrendingUp className="mx-auto size-12 text-muted-foreground opacity-20 mb-4" />
        <p className="text-muted-foreground italic">No financial data available to forecast from.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ── Config row ── */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Base Period</Label>
          <Select value={basePeriod} onValueChange={setBasePeriod}>
            <SelectTrigger className="h-9 w-36 bg-card border-border text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periods.map(p => <SelectItem key={p} value={p}>{fmtShortPeriod(p)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Horizon</Label>
          <Select value={String(horizon)} onValueChange={v => setHorizon(+v)}>
            <SelectTrigger className="h-9 w-32 bg-card border-border text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 periods</SelectItem>
              <SelectItem value="4">4 periods</SelectItem>
              <SelectItem value="6">6 periods</SelectItem>
              <SelectItem value="8">8 periods</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto">
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90 h-9"
            onClick={() => { setSaveName(''); setSaveOpen(true) }}
            disabled={forecastRows.length === 0}
          >
            <Save className="size-3.5 mr-2" /> Save as Version
          </Button>
        </div>
      </div>

      {/* ── Main grid: assumptions + output ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-6">

        {/* Assumptions panel */}
        <div className="space-y-4">

          {/* Revenue drivers */}
          <Card className="bg-card/50 border-border">
            <CardHeader className="pb-3">
              <CardDescription className="text-[10px] uppercase tracking-widest font-bold text-foreground">Revenue Drivers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{vertical.forecastLabels.growthRateLabel}</Label>
                  <span className="text-xs font-bold text-primary">{sssPct.toFixed(1)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSssPct(p => Math.max(-20, +(p - 0.5).toFixed(1)))} className="size-7 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors">
                    <Minus className="size-3" />
                  </button>
                  <input
                    type="range" min={-20} max={30} step={0.5}
                    value={sssPct}
                    onChange={e => setSssPct(+e.target.value)}
                    className="flex-1 accent-primary"
                  />
                  <button onClick={() => setSssPct(p => Math.min(30, +(p + 0.5).toFixed(1)))} className="size-7 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors">
                    <Plus className="size-3" />
                  </button>
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>-20%</span><span className="font-bold text-primary">{sssPct > 0 ? '+' : ''}{sssPct}%</span><span>+30%</span>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">New {vertical.unitsLabel} Openings (per period)</Label>
                <div className="grid grid-cols-4 gap-1.5">
                  {newUnits.map((v, i) => (
                    <div key={i} className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground text-center block">
                        {fmtShortPeriod(generateForwardPeriods(basePeriod, horizon)[i] ?? '')}
                      </Label>
                      <Input
                        type="number" min={0} max={50}
                        value={v}
                        onChange={e => setNewUnits(prev => { const n=[...prev]; n[i]=Math.max(0,+e.target.value); return n })}
                        className="h-8 text-center bg-muted border-none text-sm px-1"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {hasNewUnits && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">{vertical.forecastLabels.newUnitValueLabel}</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                      <Input
                        type="number"
                        value={auv}
                        onChange={e => setAuv(+e.target.value)}
                        className="pl-6 bg-muted border-none h-9 text-sm"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Ramp: 60% → 85% → 100% over 3 periods
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Cost assumptions */}
          <Card className="bg-card/50 border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardDescription className="text-[10px] uppercase tracking-widest font-bold text-foreground">Cost Assumptions</CardDescription>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Info className="size-3" /> Auto-filled from actuals
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: 'COGS %', value: cogsPct, set: setCogsPct, max: 90 },
                { label: 'Labor %', value: laborPct, set: setLaborPct, max: 60 },
                { label: 'OpEx %', value: opexPct, set: setOpexPct, max: 40 },
              ].map(({ label, value, set, max }) => (
                <div key={label} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      type="number" min={0} max={max} step={0.1}
                      value={value}
                      onChange={e => set(+e.target.value)}
                      className="h-7 w-20 text-right bg-muted border-none text-xs px-2"
                    />
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/40 rounded-full"
                      style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}

              <Separator />

              <div className="pt-1 space-y-1">
                {[
                  { label: 'Gross Margin %', value: 100 - cogsPct },
                  { label: vertical.forecastLabels.profitPctLabel, value: 100 - cogsPct - laborPct - opexPct },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={cn("font-bold", value > 0 ? "text-emerald-500" : "text-destructive")}>
                      {value.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Output panel */}
        <div className="space-y-5">

          {/* P&L Projection table */}
          <Card className="bg-card/30 border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-36">Metric</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/30">
                      Base<br /><span className="font-normal normal-case">{fmtShortPeriod(basePeriod)}</span>
                    </th>
                    {forecastRows.map((row) => (
                      <th key={row.period} className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-primary">
                        Forecast<br /><span className="font-normal normal-case text-muted-foreground">{row.label}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <PnlRow label="Revenue"       baseValue={baseRevenue}    rows={forecastRows} formatter={fmtCurrency} isHighlight />
                  {hasNewUnits && <>
                    <PnlRow label="Comp Revenue"    baseValue={baseRevenue} rows={forecastRows} formatter={fmtCurrency} isSubRow isDim />
                    <PnlRow label="New Unit Rev."   baseValue={null}        rows={forecastRows} formatter={fmtCurrency} isSubRow isDim />
                  </>}
                  <PnlRow label="COGS"          baseValue={baseCogs}       rows={forecastRows} formatter={fmtCurrency} />
                  <PnlRow label="Gross Profit"  baseValue={baseGrossProfit}rows={forecastRows} formatter={fmtCurrency} />
                  <PnlRow label="Gross Margin %" baseValue={baseCogs > 0 ? ((baseGrossProfit/baseRevenue)*100) : null} rows={forecastRows} formatter={v => `${v.toFixed(1)}%`} isDim />
                  <PnlRow label="Labor"         baseValue={baseLabor || null} rows={forecastRows} formatter={fmtCurrency} />
                  <PnlRow label="OpEx"          baseValue={baseOpex || null}  rows={forecastRows} formatter={fmtCurrency} />
                  <PnlRow label={vertical.forecastLabels.profitLabel}    dataKey="EBITDA"   baseValue={baseEbitda}     rows={forecastRows} formatter={fmtCurrency} isHighlight />
                  <PnlRow label={vertical.forecastLabels.profitPctLabel} dataKey="EBITDA %" baseValue={baseRevenue > 0 ? (baseEbitda/baseRevenue)*100 : null} rows={forecastRows} formatter={v => `${v.toFixed(1)}%`} isDim />
                  {hasNewUnits && <PnlRow label="Unit Count" baseValue={baseUnitCount} rows={forecastRows} formatter={v => String(Math.round(v))} isDim />}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Trend chart */}
          <Card className="bg-card/30 border-border p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              {vertical.forecastLabels.chartTitle}
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => fmtCurrency(v)} width={56} />
                <Tooltip content={<ForecastTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone" dataKey="revenue" name="Revenue"
                  stroke="hsl(var(--primary))" strokeWidth={2.5}
                  dot={(props: any) => props.payload.isBase
                    ? <circle key={props.key} cx={props.cx} cy={props.cy} r={4} fill="hsl(var(--muted-foreground))" stroke="hsl(var(--background))" strokeWidth={2} />
                    : <circle key={props.key} cx={props.cx} cy={props.cy} r={4} fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth={2} />
                  }
                />
                <Line
                  type="monotone" dataKey="ebitda" name={vertical.forecastLabels.profitLabel}
                  stroke="hsl(var(--accent))" strokeWidth={2.5} strokeDasharray="5 3"
                  dot={(props: any) => props.payload.isBase
                    ? <circle key={props.key} cx={props.cx} cy={props.cy} r={4} fill="hsl(var(--muted-foreground))" stroke="hsl(var(--background))" strokeWidth={2} />
                    : <circle key={props.key} cx={props.cx} cy={props.cy} r={4} fill="hsl(var(--accent))" stroke="hsl(var(--background))" strokeWidth={2} />
                  }
                />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-muted-foreground mt-3 text-center">
              Solid dot = actual base · hollow dot = projected · dashed line = EBITDA
            </p>
          </Card>
        </div>
      </div>

      {/* Save dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save Forecast as Version</DialogTitle>
            <DialogDescription>
              This writes {horizon} projected periods into your budget plan data. It will appear as a selectable version in Plan vs. Actual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Version Name</Label>
              <Input
                placeholder="e.g. Q2 2025 Forecast — Base Case"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                className="bg-muted border-none text-sm"
              />
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-xs space-y-1 text-muted-foreground">
              <p>• {forecastRows.length} periods × {locations.length} {vertical.unitsLabel.toLowerCase()} × 6 metrics</p>
              <p>• Projected values allocated proportionally by base revenue share</p>
              <p>• {vertical.forecastLabels.growthRateLabel}: {sssPct > 0 ? '+' : ''}{sssPct}% · {vertical.forecastLabels.profitLabel} target: {(100 - cogsPct - laborPct - opexPct).toFixed(1)}%</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)} disabled={isSaving}>Cancel</Button>
            <Button onClick={handleSaveForecast} disabled={isSaving || !saveName.trim()} className="bg-primary hover:bg-primary/90">
              {isSaving ? <Loader2 className="size-4 animate-spin mr-2" /> : <Save className="size-4 mr-2" />}
              Save Forecast
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
