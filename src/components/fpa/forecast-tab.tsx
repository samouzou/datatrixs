'use client';

import * as React from "react"
import {
  Loader2, Save, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Info,
  CalendarDays, ChevronLeft, ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts"
import { doc, writeBatch, getDoc, setDoc } from "firebase/firestore"
import type { Firestore } from "firebase/firestore"
import type { User } from "firebase/auth"
import { FinancialRecord, FinancialPlan, Company } from "@/lib/types"
import type { VerticalConfig } from "@/lib/verticals"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type LocationMeta = { id: string; name: string }
type ScenarioId = 'bear' | 'base' | 'bull'

type ScenarioConfig = {
  id: ScenarioId
  name: string
  color: string
  activeClass: string    // bg color when selected pill
  borderClass: string    // card border color
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

const RAMP = [0.6, 0.85, 1.0]
function rampFactor(periodsOpen: number) {
  return RAMP[Math.min(periodsOpen, RAMP.length - 1)]
}

function buildScenario(
  basePeriod: string,
  baseRevenue: number,
  baseUnitCount: number,
  horizon: number,
  cfg: ScenarioConfig,
): ForecastRow[] {
  const forwardPeriods = generateForwardPeriods(basePeriod, horizon)
  const rows: ForecastRow[] = []
  let runningComp = baseRevenue
  let cumulativeNewUnits = 0
  const cohorts: { periodIdx: number; units: number }[] = []

  forwardPeriods.forEach((period, idx) => {
    runningComp = runningComp * (1 + cfg.sssPct / 100)
    const newThisPeriod = cfg.newUnits[idx] ?? 0
    if (newThisPeriod > 0) {
      cohorts.push({ periodIdx: idx, units: newThisPeriod })
      cumulativeNewUnits += newThisPeriod
    }
    let newUnitRevenue = 0
    for (const c of cohorts) newUnitRevenue += c.units * cfg.auv * rampFactor(idx - c.periodIdx)

    const revenue = runningComp + newUnitRevenue
    const cogs = revenue * (cfg.cogsPct / 100)
    const grossProfit = revenue - cogs
    const labor = revenue * (cfg.laborPct / 100)
    const opex = revenue * (cfg.opexPct / 100)
    const ebitda = grossProfit - labor - opex

    rows.push({
      period, label: fmtShortPeriod(period),
      revenue, compRevenue: runningComp, newUnitRevenue,
      cogs, grossProfit,
      grossMarginPct: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
      labor, opex, ebitda,
      ebitdaMarginPct: revenue > 0 ? (ebitda / revenue) * 100 : 0,
      unitCount: baseUnitCount + cumulativeNewUnits,
    })
  })
  return rows
}

// ─── Assumption stepper ───────────────────────────────────────────────────────

function AssumptionRow({ label, value, onChange, suffix = '%', step = 0.5, min = -100, max = 200, hint }: {
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
        <button
          type="button"
          onClick={() => onChange(Math.max(min, +(value - step).toFixed(1)))}
          className="size-7 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
        >
          <ChevronDown className="size-3.5" />
        </button>
        <div className="relative">
          <Input
            type="number" value={value} step={step} min={min} max={max}
            onChange={e => onChange(parseFloat(e.target.value) || 0)}
            className="h-8 w-24 text-center text-sm bg-muted border-none pr-6"
          />
          {suffix && (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">{suffix}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, +(value + step).toFixed(1)))}
          className="size-7 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
        >
          <ChevronUp className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── P&L table row ────────────────────────────────────────────────────────────

function PnlRow({ label, baseValue, rows, getVal, formatter, isHighlight = false, isSubRow = false, isDim = false }: {
  label: string
  baseValue: number | null
  rows: ForecastRow[]
  getVal: (r: ForecastRow) => number
  formatter: (v: number) => string
  isHighlight?: boolean
  isSubRow?: boolean
  isDim?: boolean
}) {
  return (
    <tr className={cn("border-b border-border/40", isHighlight && "bg-primary/5 font-bold", isDim && "opacity-60")}>
      <td className={cn("px-4 py-2.5 text-xs sticky left-0 bg-card", isSubRow && "pl-8", isHighlight ? "text-foreground font-bold bg-primary/5" : "text-muted-foreground")}>
        {isSubRow && <span className="text-muted-foreground mr-1">↳</span>}
        {label}
      </td>
      <td className="px-4 py-2.5 text-center text-xs text-muted-foreground bg-muted/20">
        {baseValue !== null ? formatter(baseValue) : <span className="italic opacity-40">—</span>}
      </td>
      {rows.map((row, i) => {
        const val = getVal(row)
        const prevVal = i === 0 ? (baseValue ?? 0) : getVal(rows[i - 1])
        const showDelta = isHighlight && prevVal !== 0
        const delta = showDelta ? ((val - prevVal) / Math.abs(prevVal)) * 100 : null
        return (
          <td key={row.period} className="px-4 py-2.5 text-center text-xs">
            <div className="flex flex-col items-center gap-0.5">
              <span className={cn("font-medium", isHighlight && "font-bold text-foreground")}>{formatter(val)}</span>
              {delta !== null && (
                <span className={cn("text-[10px] font-semibold flex items-center gap-0.5", delta >= 0 ? "text-emerald-500" : "text-destructive")}>
                  {delta >= 0 ? <TrendingUp className="size-2.5" /> : <TrendingDown className="size-2.5" />}
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

// ─── Chart tooltip ────────────────────────────────────────────────────────────

function ScenarioTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs space-y-1.5 min-w-[160px]">
      <p className="font-bold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.stroke }}>{p.name}</span>
          <span className="font-bold text-foreground">{fmtCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Period diff (months between two YYYY-MM periods) ────────────────────────

function periodDiff(from: string, to: string): number {
  if (!from || !to) return 6
  if (from.includes('-Q') && to.includes('-Q')) {
    const [fy, fq] = from.split('-Q').map(Number)
    const [ty, tq] = to.split('-Q').map(Number)
    return Math.max(1, (ty - fy) * 4 + (tq - fq))
  }
  if (/^\d{4}-\d{2}$/.test(from) && /^\d{4}-\d{2}$/.test(to)) {
    const [fy, fm] = from.split('-').map(Number)
    const [ty, tm] = to.split('-').map(Number)
    return Math.max(1, (ty - fy) * 12 + (tm - fm))
  }
  return Math.max(1, parseInt(to) - parseInt(from))
}

// ─── Month picker ─────────────────────────────────────────────────────────────

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

function MonthPicker({ value, onChange, minPeriod, placeholder = 'Pick month' }: {
  value: string
  onChange: (v: string) => void
  minPeriod?: string
  placeholder?: string
}) {
  const [open, setOpen] = React.useState(false)

  const selectedYear  = value ? parseInt(value.slice(0, 4)) : null
  const selectedMonth = value ? parseInt(value.slice(5, 7)) - 1 : null

  const [viewYear, setViewYear] = React.useState(
    () => selectedYear ?? new Date().getFullYear()
  )

  // Keep viewYear in sync when value changes externally
  React.useEffect(() => {
    if (selectedYear) setViewYear(selectedYear)
  }, [selectedYear])

  const minYear  = minPeriod ? parseInt(minPeriod.slice(0, 4)) : 2000
  const minMonth = minPeriod ? parseInt(minPeriod.slice(5, 7)) - 1 : 0

  function isDisabled(monthIdx: number) {
    if (!minPeriod) return false
    if (viewYear > minYear) return false
    if (viewYear < minYear) return true
    return monthIdx <= minMonth
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="h-9 px-3 rounded-md border border-border bg-card text-sm flex items-center gap-2 hover:bg-muted transition-colors min-w-[130px]">
          <CalendarDays className="size-3.5 text-muted-foreground shrink-0" />
          <span className={value ? "text-foreground" : "text-muted-foreground"}>
            {value ? `${MONTH_LABELS[selectedMonth!]} ${selectedYear}` : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        {/* Year nav */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setViewYear(y => y - 1)}
            className="size-7 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <span className="text-sm font-semibold">{viewYear}</span>
          <button
            onClick={() => setViewYear(y => y + 1)}
            className="size-7 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
        {/* Month grid */}
        <div className="grid grid-cols-3 gap-1">
          {MONTH_LABELS.map((m, i) => {
            const isSelected = selectedYear === viewYear && selectedMonth === i
            const disabled   = isDisabled(i)
            return (
              <button
                key={m}
                disabled={disabled}
                onClick={() => {
                  onChange(`${viewYear}-${String(i + 1).padStart(2, '0')}`)
                  setOpen(false)
                }}
                className={cn(
                  "h-8 rounded text-sm font-medium transition-colors",
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : disabled
                    ? "text-muted-foreground/30 cursor-not-allowed"
                    : "hover:bg-muted text-foreground"
                )}
              >
                {m}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

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

  const fl = vertical.forecastLabels
  const d  = vertical.scenarioDefaults

  const [basePeriod,  setBasePeriod]  = React.useState('')
  const [timeline,    setTimeline]    = React.useState<'1y'|'2y'|'3y'|'4y'>('1y')
  const [viewFrom,    setViewFrom]    = React.useState('')   // optional table filter
  const [viewThrough, setViewThrough] = React.useState('')
  const [activeId,    setActiveId]    = React.useState<ScenarioId>('base')
  const [chartMetric, setChartMetric] = React.useState<'revenue' | 'ebitda'>('revenue')
  const [isSaving,    setIsSaving]    = React.useState(false)
  const [savedMsg,    setSavedMsg]    = React.useState('')

  // Draft flags
  const [draftLoaded, setDraftLoaded] = React.useState(false)
  const [skipSeed,    setSkipSeed]    = React.useState(false)
  const draftTimerRef = React.useRef<ReturnType<typeof setTimeout>>()

  // horizon derived from timeline × data granularity
  const periodsPerYear = basePeriod.includes('-Q') ? 4 : /^\d{4}-\d{2}$/.test(basePeriod) ? 12 : 1
  const TIMELINE_YEARS: Record<string, number> = { '1y': 1, '2y': 2, '3y': 3, '4y': 4 }
  const horizon = (TIMELINE_YEARS[timeline] ?? 1) * periodsPerYear

  const [scenarios, setScenarios] = React.useState<ScenarioConfig[]>([
    { id: 'bear', name: 'Bear', color: 'hsl(var(--destructive))', activeClass: 'bg-destructive text-destructive-foreground', borderClass: 'border-destructive/30', newUnits: [], auv: 0, ...d.bear },
    { id: 'base', name: 'Base', color: 'hsl(var(--primary))',     activeClass: 'bg-primary text-primary-foreground',         borderClass: 'border-primary/30',     newUnits: [], auv: 0, ...d.base },
    { id: 'bull', name: 'Bull', color: 'hsl(142 71% 45%)',        activeClass: 'bg-emerald-600 text-white',                  borderClass: 'border-emerald-500/30', newUnits: [], auv: 0, ...d.bull },
  ])

  function updateScenario(id: ScenarioId, partial: Partial<ScenarioConfig>) {
    setScenarios(prev => prev.map(s => s.id === id ? { ...s, ...partial } : s))
  }

  // Load draft from Firestore once on mount
  React.useEffect(() => {
    if (!firestore || !companies?.[0] || draftLoaded) return
    const load = async () => {
      try {
        const snap = await getDoc(doc(firestore, 'forecast_drafts', companies[0].id))
        if (snap.exists()) {
          const data = snap.data() as any
          if (data.timeline) setTimeline(data.timeline)
          if (Array.isArray(data.scenarios) && data.scenarios.length === 3) {
            setScenarios(data.scenarios)
            setSkipSeed(true)
          }
        }
      } catch {}
      setDraftLoaded(true)
    }
    load()
  }, [firestore, companies, draftLoaded])

  // Auto-save draft (debounced 1.5s)
  React.useEffect(() => {
    if (!draftLoaded || !firestore || !companies?.[0] || !user) return
    clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(async () => {
      try {
        await setDoc(
          doc(firestore, 'forecast_drafts', companies[0].id),
          { companyId: companies[0].id, companyMembers: companies[0].members, timeline, scenarios, updatedAt: new Date().toISOString() },
          { merge: true }
        )
      } catch {}
    }, 1500)
    return () => clearTimeout(draftTimerRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, scenarios, draftLoaded])

  // Always track the first actuals period as basePeriod
  React.useEffect(() => {
    if (periods.length) setBasePeriod(periods[0])
  }, [periods])


  // Seed cost %s from actuals — only on first visit (no draft), never after draft loads
  React.useEffect(() => {
    if (!draftLoaded || !basePeriod || !records.length || skipSeed) return
    const base = records.filter(r => r.period === basePeriod)
    const rev  = sumMetric(base, 'Revenue')
    if (rev <= 0) return
    const cogs  = sumMetric(base, 'COGS')
    const labor = sumMetric(base, 'Labor', 'Payroll')
    const opex  = sumMetric(base, 'Operating Expenses', 'SG&A Expense')
    const derivedAuv = Math.round(rev / (locations.length || 1))

    setScenarios(prev => prev.map((s, i) => {
      const nudge = i === 0 ? 2 : i === 2 ? -2 : 0
      return {
        ...s,
        cogsPct:  cogs  > 0 ? +((cogs  / rev) * 100 + nudge * 0.5).toFixed(1) : s.cogsPct,
        laborPct: labor > 0 ? +((labor / rev) * 100 + nudge * 0.5).toFixed(1) : s.laborPct,
        opexPct:  opex  > 0 ? +((opex  / rev) * 100 + nudge * 0.3).toFixed(1) : s.opexPct,
        auv: s.auv || derivedAuv,
      }
    }))
    setSkipSeed(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePeriod, records, locations])

  // Keep newUnits arrays in sync with horizon
  React.useEffect(() => {
    setScenarios(prev => prev.map(s => {
      const next = [...s.newUnits]
      while (next.length < horizon) next.push(0)
      return { ...s, newUnits: next.slice(0, horizon) }
    }))
  }, [horizon])

  // Base period data
  const baseRecords    = React.useMemo(() => records.filter(r => r.period === basePeriod), [records, basePeriod])
  const baseRevenue    = React.useMemo(() => sumMetric(baseRecords, 'Revenue'), [baseRecords])
  const baseCogs       = React.useMemo(() => sumMetric(baseRecords, 'COGS'), [baseRecords])
  const baseLabor      = React.useMemo(() => sumMetric(baseRecords, 'Labor', 'Payroll'), [baseRecords])
  const baseOpex       = React.useMemo(() => sumMetric(baseRecords, 'Operating Expenses', 'SG&A Expense'), [baseRecords])
  const baseNetProfit  = React.useMemo(() => sumMetric(baseRecords, 'Net Profit'), [baseRecords])
  const baseGrossProfit = baseRevenue - baseCogs
  const baseEbitda     = baseNetProfit || (baseGrossProfit - baseLabor - baseOpex)
  const baseUnitCount  = locations.length

  const forwardPeriods = React.useMemo(() => generateForwardPeriods(basePeriod, horizon), [basePeriod, horizon])

  // Forecast per scenario
  const forecastMap = React.useMemo(() => {
    if (!basePeriod || baseRevenue <= 0) return { bear: [], base: [], bull: [] } as Record<ScenarioId, ForecastRow[]>
    const result = {} as Record<ScenarioId, ForecastRow[]>
    for (const s of scenarios) result[s.id] = buildScenario(basePeriod, baseRevenue, baseUnitCount, horizon, s)
    return result
  }, [basePeriod, baseRevenue, baseUnitCount, horizon, scenarios])

  const active      = scenarios.find(s => s.id === activeId)!
  const activeRows  = forecastMap[activeId] ?? []
  const hasNewUnits = active.newUnits.some(n => n > 0)

  const displayRows = React.useMemo(() => {
    if (!viewFrom && !viewThrough) return activeRows
    const toYYYYMM = (p: string) => {
      const m = p.match(/^(\d{4})-Q(\d)$/)
      return m ? `${m[1]}-${String(parseInt(m[2]) * 3).padStart(2, '0')}` : p
    }
    return activeRows.filter(r => {
      const p = toYYYYMM(r.period)
      if (viewFrom && p < viewFrom) return false
      if (viewThrough && p > viewThrough) return false
      return true
    })
  }, [activeRows, viewFrom, viewThrough])

  // Chart data — base anchor + all 3 trajectories
  const chartData = React.useMemo(() => {
    const anchor: Record<string, any> = { period: fmtShortPeriod(basePeriod), isBase: true }
    for (const s of scenarios) anchor[s.name] = chartMetric === 'revenue' ? baseRevenue : baseEbitda
    const forward = forwardPeriods.map((_, idx) => {
      const entry: Record<string, any> = { period: forecastMap.base[idx]?.label ?? '', isBase: false }
      for (const s of scenarios) {
        const r = forecastMap[s.id][idx]
        if (r) entry[s.name] = chartMetric === 'revenue' ? r.revenue : r.ebitda
      }
      return entry
    })
    return basePeriod ? [anchor, ...forward] : forward
  }, [basePeriod, baseRevenue, baseEbitda, forwardPeriods, forecastMap, scenarios, chartMetric])

  // Save all scenarios as financial_plan versions
  async function handleSaveAll() {
    if (!firestore || !user || !companies?.[0] || baseRevenue <= 0) return
    setIsSaving(true)
    setSavedMsg('')

    const company = companies[0]
    const locShares = locations.map(loc => {
      const locRev = baseRecords.filter(r => r.locationId === loc.id && r.metric === 'Revenue').reduce((s, r) => s + r.value, 0)
      return { loc, share: locRev / (baseRevenue || 1) }
    })
    const allOps: { id: string; data: FinancialPlan }[] = []

    for (const s of scenarios) {
      const version = s.name
      for (const row of forecastMap[s.id]) {
        const metrics: [string, number][] = [
          ['Revenue',            row.revenue],
          ['COGS',               row.cogs],
          ['Gross Profit',       row.grossProfit],
          ['Labor',              row.labor],
          ['Operating Expenses', row.opex],
          ['Net Profit',         row.ebitda],
        ]
        for (const { loc, share } of locShares) {
          for (const [metric, value] of metrics) {
            const planId = `${loc.id}_${slugify(row.period)}_${slugify(metric)}_${slugify(version)}`
            allOps.push({
              id: planId,
              data: {
                id: planId, companyId: company.id,
                locationId: loc.id, locationName: loc.name,
                period: row.period, metric,
                plannedValue: value * share,
                version, companyMembers: company.members,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            })
          }
        }
      }
    }

    for (let i = 0; i < allOps.length; i += 450) {
      const chunk = allOps.slice(i, i + 450)
      const batch = writeBatch(firestore)
      for (const op of chunk) batch.set(doc(firestore, 'financial_plans', op.id), op.data, { merge: true })
      await batch.commit()
    }

    setIsSaving(false)
    setSavedMsg(`Saved — select Bear / Base / Bull in Reports › Plan vs. Actual`)
    setTimeout(() => setSavedMsg(''), 6000)
  }

  if (!basePeriod || !draftLoaded) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    )
  }

  const hasData = baseRevenue > 0

  return (
    <div className="space-y-6">

      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center gap-3">

        {/* Scenario pills */}
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

        {/* Timeline dropdown */}
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

        <div className="ml-auto flex items-center gap-3">
          {/* Optional view filter */}
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">View</Label>
          <MonthPicker value={viewFrom} onChange={setViewFrom} placeholder="From" />
          <span className="text-muted-foreground text-sm">—</span>
          <MonthPicker value={viewThrough} onChange={setViewThrough} minPeriod={viewFrom} placeholder="Through" />
          {(viewFrom || viewThrough) && (
            <button
              onClick={() => { setViewFrom(''); setViewThrough('') }}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
          {savedMsg && <span className="text-xs text-emerald-500">{savedMsg}</span>}
          <Button
            size="sm" onClick={handleSaveAll}
            disabled={isSaving || !hasData}
            className="h-9 gap-2 bg-primary hover:bg-primary/90"
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save All Scenarios
          </Button>
        </div>
      </div>

      {!hasData ? (
        <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
          <TrendingUp className="mx-auto size-12 text-muted-foreground opacity-20 mb-4" />
          <p className="text-muted-foreground italic">No revenue data for the selected period.</p>
        </div>
      ) : (
        <>
          {/* ── Active scenario: assumptions + P&L ── */}
          <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-6">

            {/* Assumptions panel */}
            <div className="space-y-4">

              {/* Scenario name + margin badge */}
              <div className="flex items-center gap-3">
                <span className="size-3 rounded-full shrink-0" style={{ backgroundColor: active.color }} />
                <Input
                  value={active.name}
                  onChange={e => updateScenario(active.id, { name: e.target.value })}
                  className="h-9 text-base font-bold bg-transparent border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                {activeRows[activeRows.length - 1] && (
                  <span className={cn(
                    "ml-auto text-xs font-bold px-2.5 py-1 rounded-full shrink-0",
                    activeRows[activeRows.length - 1].ebitdaMarginPct >= 15 ? "bg-emerald-500/15 text-emerald-500"
                      : activeRows[activeRows.length - 1].ebitdaMarginPct >= 8 ? "bg-amber-500/15 text-amber-500"
                      : "bg-destructive/15 text-destructive"
                  )}>
                    {activeRows[activeRows.length - 1].ebitdaMarginPct.toFixed(1)}% margin
                  </span>
                )}
              </div>

              {/* Revenue drivers */}
              <Card className={cn("bg-card/50 border-2", active.borderClass)}>
                <CardHeader className="pb-2 pt-4">
                  <CardDescription className="text-[10px] uppercase tracking-widest font-bold text-foreground">Revenue Drivers</CardDescription>
                </CardHeader>
                <CardContent className="space-y-0">
                  <AssumptionRow
                    label={fl.scenarioGrowthLabel}
                    value={active.sssPct}
                    onChange={v => updateScenario(active.id, { sssPct: v })}
                    suffix="%" step={0.5} min={-20} max={30}
                    hint="Applied to comp revenue each period"
                  />

                  <Separator className="my-3" />

                  <Label className="text-xs text-muted-foreground block mb-2">
                    New {vertical.unitsLabel} Openings / Period
                  </Label>
                  {Object.entries(
                    forwardPeriods.reduce((acc, p, i) => {
                      const yr = p.slice(0, 4)
                      if (!acc[yr]) acc[yr] = []
                      acc[yr].push({ period: p, idx: i })
                      return acc
                    }, {} as Record<string, { period: string; idx: number }[]>)
                  ).map(([year, items]) => (
                    <div key={year} className="mb-3">
                      <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">{year}</p>
                      <div className="grid grid-cols-6 gap-2">
                        {items.map(({ period, idx }) => (
                          <div key={idx} className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground text-center block truncate">
                              {fmtShortPeriod(period).replace(/(\w+)\s(\d{4})/, (_, m, y) => `${m} '${y.slice(2)}`)}
                            </Label>
                            <Input
                              type="number" min={0} max={50}
                              value={active.newUnits[idx] ?? 0}
                              onChange={e => {
                                const next = [...active.newUnits]
                                next[idx] = Math.max(0, +e.target.value)
                                updateScenario(active.id, { newUnits: next })
                              }}
                              className="h-8 text-center bg-muted border-none text-sm px-1"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {hasNewUnits && (
                    <AssumptionRow
                      label={fl.scenarioNewUnitValueLabel}
                      value={active.auv}
                      onChange={v => updateScenario(active.id, { auv: Math.max(0, Math.round(v)) })}
                      suffix="" step={10000} min={0} max={10_000_000}
                      hint="Ramps: 60% → 85% → 100% over 3 periods"
                    />
                  )}
                </CardContent>
              </Card>

              {/* Cost structure */}
              <Card className={cn("bg-card/50 border-2", active.borderClass)}>
                <CardHeader className="pb-2 pt-4">
                  <div className="flex items-center justify-between">
                    <CardDescription className="text-[10px] uppercase tracking-widest font-bold text-foreground">Cost Structure</CardDescription>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Info className="size-3" /> Auto-seeded from actuals
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-0 pb-4">
                  <AssumptionRow label="COGS %"  value={active.cogsPct}  onChange={v => updateScenario(active.id, { cogsPct: v })}  suffix="%" step={0.5} min={0} max={100} />
                  <AssumptionRow label="Labor %" value={active.laborPct} onChange={v => updateScenario(active.id, { laborPct: v })} suffix="%" step={0.5} min={0} max={100} />
                  <AssumptionRow label="OpEx %"  value={active.opexPct}  onChange={v => updateScenario(active.id, { opexPct: v })}  suffix="%" step={0.5} min={0} max={100} />

                  <div className="mt-4 pt-3 border-t border-border space-y-1.5">
                    {[
                      { label: 'Gross Margin %', value: 100 - active.cogsPct },
                      { label: fl.profitPctLabel, value: 100 - active.cogsPct - active.laborPct - active.opexPct },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between text-sm">
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
            <div className="space-y-5 min-w-0">

              {/* P&L projection table */}
              <Card className="bg-card/30 border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-36 sticky left-0 bg-muted/30">Metric</th>
                        <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/40">
                          Actuals<br /><span className="font-normal normal-case">{fmtShortPeriod(basePeriod)}</span>
                        </th>
                        {displayRows.map(row => (
                          <th key={row.period} className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider" style={{ color: active.color }}>
                            {active.name}<br /><span className="font-normal normal-case text-muted-foreground">{row.label}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <PnlRow label="Revenue"      baseValue={baseRevenue}       rows={displayRows} getVal={r => r.revenue}         formatter={fmtCurrency} isHighlight />
                      {hasNewUnits && <>
                        <PnlRow label="↳ Comp Rev."  baseValue={baseRevenue}     rows={displayRows} getVal={r => r.compRevenue}     formatter={fmtCurrency} isSubRow isDim />
                        <PnlRow label="↳ New Units"  baseValue={null}            rows={displayRows} getVal={r => r.newUnitRevenue}  formatter={fmtCurrency} isSubRow isDim />
                      </>}
                      <PnlRow label="COGS"          baseValue={baseCogs || null} rows={displayRows} getVal={r => r.cogs}            formatter={fmtCurrency} />
                      <PnlRow label="Gross Profit"  baseValue={baseGrossProfit}  rows={displayRows} getVal={r => r.grossProfit}     formatter={fmtCurrency} />
                      <PnlRow label="Gross Margin"  baseValue={baseCogs > 0 ? (baseGrossProfit / baseRevenue) * 100 : null} rows={displayRows} getVal={r => r.grossMarginPct} formatter={v => `${v.toFixed(1)}%`} isDim />
                      <PnlRow label="Labor"         baseValue={baseLabor || null} rows={displayRows} getVal={r => r.labor}          formatter={fmtCurrency} />
                      <PnlRow label="OpEx"          baseValue={baseOpex  || null} rows={displayRows} getVal={r => r.opex}           formatter={fmtCurrency} />
                      <PnlRow label={fl.profitLabel}     baseValue={baseEbitda}   rows={displayRows} getVal={r => r.ebitda}         formatter={fmtCurrency} isHighlight />
                      <PnlRow label={fl.profitPctLabel}  baseValue={baseRevenue > 0 ? (baseEbitda / baseRevenue) * 100 : null} rows={displayRows} getVal={r => r.ebitdaMarginPct} formatter={v => `${v.toFixed(1)}%`} isDim />
                      {hasNewUnits && (
                        <PnlRow label={`${vertical.unitLabel} Count`} baseValue={baseUnitCount} rows={displayRows} getVal={r => r.unitCount} formatter={v => String(Math.round(v))} isDim />
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Trajectory chart — all 3 scenarios for context */}
              <Card className="bg-card/30 border-border p-5 space-y-4">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="font-bold text-foreground text-sm">All Scenarios</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {chartMetric === 'revenue' ? 'Revenue' : fl.profitLabel} — Bear · Base · Bull · {timeline === '1y' ? '1 Year' : timeline === '2y' ? '2 Years' : timeline === '3y' ? '3 Years' : '4 Years'}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {(['revenue', 'ebitda'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setChartMetric(m)}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-semibold border transition-all",
                          chartMetric === m ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {m === 'revenue' ? 'Revenue' : fl.profitLabel}
                      </button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => fmtCurrency(v)} width={64} />
                    <Tooltip content={<ScenarioTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    {scenarios.map(s => (
                      <Line
                        key={s.id} type="monotone" dataKey={s.name}
                        stroke={s.color}
                        strokeWidth={s.id === activeId ? 3 : 1.5}
                        strokeOpacity={s.id === activeId ? 1 : 0.4}
                        connectNulls
                        dot={(props: any) => (
                          <circle
                            key={props.key}
                            cx={props.cx} cy={props.cy}
                            r={props.payload.isBase ? 5 : s.id === activeId ? 4 : 3}
                            fill={props.payload.isBase ? 'hsl(var(--muted-foreground))' : s.color}
                            fillOpacity={s.id === activeId ? 1 : 0.4}
                            stroke="hsl(var(--background))" strokeWidth={2}
                          />
                        )}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-muted-foreground text-center">
                  Active scenario highlighted · grey dot = {fmtShortPeriod(basePeriod)} actuals
                </p>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
