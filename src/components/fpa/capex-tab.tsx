'use client'

import * as React from "react"
import {
  Loader2, ChevronDown, ChevronUp, TrendingUp,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine, Cell,
} from "recharts"
import { doc, getDoc, setDoc } from "firebase/firestore"
import type { Firestore } from "firebase/firestore"
import type { User } from "firebase/auth"
import { FinancialRecord, Company } from "@/lib/types"
import type { VerticalConfig } from "@/lib/verticals"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type LocationMeta = { id: string; name: string }
type ScenarioId = 'bear' | 'base' | 'bull'

type ScenarioConfig = {
  id: ScenarioId
  name: string
  color: string
  activeClass: string
  borderClass: string
  sssPct: number
  newUnits: number[]
  cogsPct: number
  laborPct: number
  opexPct: number
  auv: number
}

type ForecastRow = {
  period: string
  label: string
  revenue: number
  ebitda: number
}

type CapexRow = ForecastRow & {
  growthCapex: number
  maintenanceCapex: number
  totalCapex: number
  fcf: number
  cumulativeFcf: number
}

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

const RAMP = [0.6, 0.85, 1.0]

function buildForecastRows(
  basePeriod: string,
  baseRevenue: number,
  baseUnitCount: number,
  horizon: number,
  cfg: ScenarioConfig,
): ForecastRow[] {
  const forwardPeriods = generateForwardPeriods(basePeriod, horizon)
  let runningComp = baseRevenue
  let cumulativeNewUnits = 0
  const cohorts: { periodIdx: number; units: number }[] = []

  return forwardPeriods.map((period, idx) => {
    runningComp = runningComp * (1 + cfg.sssPct / 100)
    const newThisPeriod = cfg.newUnits[idx] ?? 0
    if (newThisPeriod > 0) {
      cohorts.push({ periodIdx: idx, units: newThisPeriod })
      cumulativeNewUnits += newThisPeriod
    }
    let newUnitRevenue = 0
    for (const c of cohorts) {
      newUnitRevenue += c.units * cfg.auv * RAMP[Math.min(idx - c.periodIdx, RAMP.length - 1)]
    }
    const revenue = runningComp + newUnitRevenue
    const cogs     = revenue * (cfg.cogsPct  / 100)
    const labor    = revenue * (cfg.laborPct / 100)
    const opex     = revenue * (cfg.opexPct  / 100)
    const ebitda   = revenue - cogs - labor - opex
    return { period, label: fmtShortPeriod(period), revenue, ebitda }
  })
}

// ─── Stepper input ────────────────────────────────────────────────────────────

function AssumptionRow({ label, value, onChange, suffix = '%', step = 0.5, min = 0, max = 200, hint }: {
  label: string; value: number; onChange: (v: number) => void
  suffix?: string; step?: number; min?: number; max?: number; hint?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border/30 last:border-0">
      <div className="flex-1">
        <span className="text-sm text-foreground">{label}</span>
        {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button type="button"
          onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
          className="size-7 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
        >
          <ChevronDown className="size-3.5" />
        </button>
        <div className="relative">
          <Input
            type="number" value={value} step={step} min={min} max={max}
            onChange={e => onChange(parseFloat(e.target.value) || 0)}
            className="h-8 w-28 text-center text-sm bg-muted border-none pr-6"
          />
          {suffix && (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">{suffix}</span>
          )}
        </div>
        <button type="button"
          onClick={() => onChange(Math.min(max, +(value + step).toFixed(2)))}
          className="size-7 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
        >
          <ChevronUp className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function CapexTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs space-y-1.5 min-w-[180px]">
      <p className="font-bold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color ?? p.stroke }}>{p.name}</span>
          <span className="font-bold text-foreground">{fmtCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CapexTabProps {
  records: FinancialRecord[]
  companies: Company[]
  user: User | null
  firestore: Firestore | null
  vertical: VerticalConfig
  locations: LocationMeta[]
  periods: string[]
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CapexTab({ records, companies, user, firestore, vertical, locations, periods }: CapexTabProps) {

  const [draftLoaded,  setDraftLoaded]  = React.useState(false)
  const [scenarios,    setScenarios]    = React.useState<ScenarioConfig[]>([])
  const [timeline,     setTimeline]     = React.useState<'1y'|'2y'|'3y'|'4y'>('1y')
  const [activeId,     setActiveId]     = React.useState<ScenarioId>('base')

  // CapEx assumptions
  const [investmentPerUnit,    setInvestmentPerUnit]    = React.useState(500_000)
  const [maintenanceCapexPct,  setMaintenanceCapexPct]  = React.useState(2.0)

  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout>>()

  // Load from forecast_drafts (scenarios + CapEx assumptions stored together)
  React.useEffect(() => {
    if (!firestore || !companies?.[0] || draftLoaded) return
    const load = async () => {
      try {
        const snap = await getDoc(doc(firestore, 'forecast_drafts', companies[0].id))
        if (snap.exists()) {
          const data = snap.data() as any
          if (data.timeline) setTimeline(data.timeline)
          if (Array.isArray(data.scenarios) && data.scenarios.length === 3) setScenarios(data.scenarios)
          if (typeof data.investmentPerUnit   === 'number') setInvestmentPerUnit(data.investmentPerUnit)
          if (typeof data.maintenanceCapexPct === 'number') setMaintenanceCapexPct(data.maintenanceCapexPct)
        }
      } catch {}
      setDraftLoaded(true)
    }
    load()
  }, [firestore, companies, draftLoaded])

  // Auto-save CapEx assumptions to forecast_drafts (merge)
  React.useEffect(() => {
    if (!draftLoaded || !firestore || !companies?.[0] || !user) return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        await setDoc(
          doc(firestore, 'forecast_drafts', companies[0].id),
          { investmentPerUnit, maintenanceCapexPct, updatedAt: new Date().toISOString() },
          { merge: true }
        )
      } catch {}
    }, 1500)
    return () => clearTimeout(saveTimerRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investmentPerUnit, maintenanceCapexPct, draftLoaded])

  const basePeriod    = periods[0] ?? ''
  const periodsPerYear = basePeriod.includes('-Q') ? 4 : /^\d{4}-\d{2}$/.test(basePeriod) ? 12 : 1
  const TIMELINE_YEARS: Record<string, number> = { '1y': 1, '2y': 2, '3y': 3, '4y': 4 }
  const horizon = (TIMELINE_YEARS[timeline] ?? 1) * periodsPerYear

  const baseRecords = React.useMemo(() => records.filter(r => r.period === basePeriod), [records, basePeriod])
  const baseRevenue = React.useMemo(() => sumMetric(baseRecords, 'Revenue'), [baseRecords])
  const baseUnitCount = locations.length

  const active = scenarios.find(s => s.id === activeId) ?? null

  const forecastRows = React.useMemo(() => {
    if (!active || !basePeriod || baseRevenue <= 0) return []
    return buildForecastRows(basePeriod, baseRevenue, baseUnitCount, horizon, active)
  }, [active, basePeriod, baseRevenue, baseUnitCount, horizon])

  const capexRows: CapexRow[] = React.useMemo(() => {
    let cumulative = 0
    return forecastRows.map((row, i) => {
      const newThisPeriod  = active?.newUnits[i] ?? 0
      const growthCapex    = newThisPeriod * investmentPerUnit
      const maintenanceCapex = row.revenue * (maintenanceCapexPct / 100)
      const totalCapex     = growthCapex + maintenanceCapex
      const fcf            = row.ebitda - totalCapex
      cumulative += fcf
      return { ...row, growthCapex, maintenanceCapex, totalCapex, fcf, cumulativeFcf: cumulative }
    })
  }, [forecastRows, active, investmentPerUnit, maintenanceCapexPct])

  // ── Totals ──
  const totalEbitda  = capexRows.reduce((s, r) => s + r.ebitda,    0)
  const totalGrowth  = capexRows.reduce((s, r) => s + r.growthCapex, 0)
  const totalMaint   = capexRows.reduce((s, r) => s + r.maintenanceCapex, 0)
  const totalCapex   = capexRows.reduce((s, r) => s + r.totalCapex, 0)
  const totalFcf     = capexRows.reduce((s, r) => s + r.fcf,       0)
  const fcfConversion = totalEbitda > 0 ? (totalFcf / totalEbitda) * 100 : 0

  // ── Unit economics ──
  const hasNewUnits = active?.newUnits.some(n => n > 0) ?? false
  const annualEbitdaPerUnit = active && active.auv > 0
    ? active.auv * (1 - active.cogsPct / 100 - active.laborPct / 100 - active.opexPct / 100) * (periodsPerYear === 4 ? 4 : 1)
    : 0
  const paybackYears = investmentPerUnit > 0 && annualEbitdaPerUnit > 0
    ? investmentPerUnit / annualEbitdaPerUnit
    : null

  // ── Chart data ──
  const chartData = capexRows.map(r => ({
    period:         r.label,
    'EBITDA':       r.ebitda,
    'Growth CapEx': r.growthCapex > 0 ? r.growthCapex : null,
    'Maint. CapEx': r.maintenanceCapex,
    'FCF':          r.fcf,
  }))

  if (!draftLoaded) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!scenarios.length || baseRevenue <= 0) {
    return (
      <div className="text-center py-20 border-2 border-dashed border-border rounded-xl space-y-3">
        <TrendingUp className="mx-auto size-12 text-muted-foreground opacity-20" />
        <p className="text-muted-foreground font-medium">No forecast found.</p>
        <p className="text-xs text-muted-foreground">Build your scenarios in the Forecast tab first, then return here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {scenarios.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={cn(
                "px-5 h-9 text-sm font-semibold transition-colors",
                activeId === s.id ? s.activeClass : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {s.name}
            </button>
          ))}
        </div>

        <Select value={timeline} onValueChange={v => setTimeline(v as '1y'|'2y'|'3y'|'4y')}>
          <SelectTrigger className="h-9 w-32 bg-card border-border text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1y">1 Year</SelectItem>
            <SelectItem value="2y">2 Years</SelectItem>
            <SelectItem value="3y">3 Years</SelectItem>
            <SelectItem value="4y">4 Years</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── KPI summary ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total EBITDA',    val: fmtCurrency(totalEbitda),  color: 'text-foreground' },
          { label: 'Total CapEx',     val: fmtCurrency(totalCapex),   color: 'text-amber-500' },
          { label: 'Free Cash Flow',  val: fmtCurrency(totalFcf),     color: totalFcf >= 0 ? 'text-emerald-500' : 'text-destructive' },
          { label: 'FCF Conversion',  val: `${fcfConversion.toFixed(1)}%`, color: fcfConversion >= 60 ? 'text-emerald-500' : fcfConversion >= 30 ? 'text-amber-500' : 'text-destructive' },
        ].map(({ label, val, color }) => (
          <Card key={label} className="bg-card/50 border-border">
            <CardHeader className="pb-1 pt-4">
              <CardDescription className="text-[10px] uppercase tracking-widest font-semibold">{label}</CardDescription>
            </CardHeader>
            <CardContent>
              <span className={cn("text-2xl font-bold", color)}>{val}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Main layout ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6">

        {/* Assumptions panel */}
        <div className="space-y-4">
          <Card className={cn("bg-card/50 border-2", active?.borderClass ?? 'border-border')}>
            <CardHeader className="pb-2 pt-4">
              <CardDescription className="text-[10px] uppercase tracking-widest font-bold text-foreground">
                CapEx Assumptions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-0 pb-4">
              <AssumptionRow
                label={`Investment / New ${vertical.unitLabel}`}
                value={investmentPerUnit}
                onChange={v => setInvestmentPerUnit(Math.max(0, Math.round(v)))}
                suffix="" step={25_000} min={0} max={20_000_000}
                hint="Buildout, equipment & pre-opening costs"
              />
              <AssumptionRow
                label="Maintenance CapEx"
                value={maintenanceCapexPct}
                onChange={setMaintenanceCapexPct}
                suffix="%" step={0.25} min={0} max={20}
                hint="Ongoing upkeep as % of revenue"
              />
            </CardContent>
          </Card>

          {/* Unit economics — only visible when new units are planned */}
          {hasNewUnits && active && (
            <Card className={cn("bg-card/50 border-2", active.borderClass)}>
              <CardHeader className="pb-2 pt-4">
                <CardDescription className="text-[10px] uppercase tracking-widest font-bold text-foreground">
                  New {vertical.unitLabel} Economics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5 pb-4">
                {[
                  { label: `Investment / ${vertical.unitLabel}`,    value: fmtCurrency(investmentPerUnit) },
                  { label: `AUV`,                                   value: active.auv > 0 ? fmtCurrency(active.auv) : '—' },
                  { label: `Yr 1 EBITDA / ${vertical.unitLabel}`,   value: annualEbitdaPerUnit > 0 ? fmtCurrency(annualEbitdaPerUnit) : '—' },
                  { label: 'Est. Payback Period',                   value: paybackYears !== null ? `${paybackYears.toFixed(1)} yrs` : '—' },
                  { label: 'Cash-on-Cash Return (Yr 1)',            value: investmentPerUnit > 0 && annualEbitdaPerUnit > 0 ? `${((annualEbitdaPerUnit / investmentPerUnit) * 100).toFixed(1)}%` : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-bold text-foreground">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Output panel */}
        <div className="space-y-5 min-w-0">

          {/* Chart */}
          <Card className="bg-card/30 border-border p-5 space-y-4">
            <div>
              <h3 className="font-bold text-foreground text-sm">EBITDA vs. CapEx — Free Cash Flow</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Bars show EBITDA and CapEx breakdown · Line shows free cash flow per period
              </p>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => fmtCurrency(v)} width={64} />
                <Tooltip content={<CapexTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="4 4" />
                <Bar dataKey="EBITDA" fill="hsl(var(--primary))" fillOpacity={0.65} radius={[3,3,0,0]} />
                <Bar dataKey="Growth CapEx" stackId="capex" fill="hsl(38 92% 50%)" fillOpacity={0.85} />
                <Bar dataKey="Maint. CapEx" stackId="capex" fill="hsl(38 92% 68%)" fillOpacity={0.85} radius={[3,3,0,0]} />
                <Line type="monotone" dataKey="FCF" stroke="hsl(142 71% 45%)" strokeWidth={2.5} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          {/* Schedule table */}
          <Card className="bg-card/30 border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-28 sticky left-0 bg-muted/30">Period</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">EBITDA</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-amber-500/80">Growth CapEx</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-amber-400/70">Maint. CapEx</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-amber-500">Total CapEx</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-emerald-500">FCF</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cumul. FCF</th>
                  </tr>
                </thead>
                <tbody>
                  {capexRows.map(row => (
                    <tr key={row.period} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-2.5 text-xs font-medium text-foreground sticky left-0 bg-card">{row.label}</td>
                      <td className="px-4 py-2.5 text-center text-xs font-medium">{fmtCurrency(row.ebitda)}</td>
                      <td className="px-4 py-2.5 text-center text-xs text-amber-500/80">
                        {row.growthCapex > 0 ? fmtCurrency(row.growthCapex) : <span className="text-muted-foreground/30">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs text-amber-400/70">{fmtCurrency(row.maintenanceCapex)}</td>
                      <td className="px-4 py-2.5 text-center text-xs font-semibold text-amber-500">{fmtCurrency(row.totalCapex)}</td>
                      <td className={cn("px-4 py-2.5 text-center text-xs font-bold", row.fcf >= 0 ? "text-emerald-500" : "text-destructive")}>
                        {fmtCurrency(row.fcf)}
                      </td>
                      <td className={cn("px-4 py-2.5 text-center text-xs", row.cumulativeFcf >= 0 ? "text-emerald-500/70" : "text-destructive/70")}>
                        {fmtCurrency(row.cumulativeFcf)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/20">
                    <td className="px-4 py-2.5 text-xs font-bold sticky left-0 bg-muted/20">Total</td>
                    <td className="px-4 py-2.5 text-center text-xs font-bold">{fmtCurrency(totalEbitda)}</td>
                    <td className="px-4 py-2.5 text-center text-xs font-bold text-amber-500/80">{fmtCurrency(totalGrowth)}</td>
                    <td className="px-4 py-2.5 text-center text-xs font-bold text-amber-400/70">{fmtCurrency(totalMaint)}</td>
                    <td className="px-4 py-2.5 text-center text-xs font-bold text-amber-500">{fmtCurrency(totalCapex)}</td>
                    <td className={cn("px-4 py-2.5 text-center text-xs font-bold", totalFcf >= 0 ? "text-emerald-500" : "text-destructive")}>
                      {fmtCurrency(totalFcf)}
                    </td>
                    <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

        </div>
      </div>
    </div>
  )
}
