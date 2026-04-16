'use client';

import * as React from "react"
import {
  Loader2, Save, ChevronDown, ChevronUp, TrendingUp, TrendingDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts"
import { doc, writeBatch } from "firebase/firestore"
import type { Firestore } from "firebase/firestore"
import type { User } from "firebase/auth"
import { FinancialRecord, FinancialPlan, Company } from "@/lib/types"
import type { VerticalConfig, ForecastLabels } from "@/lib/verticals"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type LocationMeta = { id: string; name: string }

type ScenarioId = 'bear' | 'base' | 'bull'

type ScenarioConfig = {
  id: ScenarioId
  name: string
  color: string
  badgeClass: string
  sssPct: number
  newUnitsPerPeriod: number
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
function rampFactor(periodsOpen: number): number {
  return RAMP[Math.min(periodsOpen, RAMP.length - 1)]
}

function buildScenarioForecast(
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

    const newThisPeriod = cfg.newUnitsPerPeriod
    if (newThisPeriod > 0) {
      cohorts.push({ periodIdx: idx, units: newThisPeriod })
      cumulativeNewUnits += newThisPeriod
    }

    let newUnitRevenue = 0
    for (const c of cohorts) {
      newUnitRevenue += c.units * cfg.auv * rampFactor(idx - c.periodIdx)
    }

    const revenue = runningComp + newUnitRevenue
    const cogs = revenue * (cfg.cogsPct / 100)
    const grossProfit = revenue - cogs
    const labor = revenue * (cfg.laborPct / 100)
    const opex = revenue * (cfg.opexPct / 100)
    const ebitda = grossProfit - labor - opex

    rows.push({
      period,
      label: fmtShortPeriod(period),
      revenue,
      ebitda,
      ebitdaMarginPct: revenue > 0 ? (ebitda / revenue) * 100 : 0,
      unitCount: baseUnitCount + cumulativeNewUnits,
    })
  })

  return rows
}

// ─── Assumption input ─────────────────────────────────────────────────────────

function AssumptionRow({
  label, value, onChange, suffix = '', step = 0.5, min = -100, max = 200,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  suffix?: string
  step?: number
  min?: number
  max?: number
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, +(value - step).toFixed(1)))}
          className="size-6 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors text-xs"
        >
          <ChevronDown className="size-3" />
        </button>
        <div className="relative">
          <Input
            type="number"
            value={value}
            step={step}
            min={min}
            max={max}
            onChange={e => onChange(parseFloat(e.target.value) || 0)}
            className="h-7 w-20 text-center text-xs bg-muted border-none pr-5"
          />
          {suffix && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
              {suffix}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, +(value + step).toFixed(1)))}
          className="size-6 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors text-xs"
        >
          <ChevronUp className="size-3" />
        </button>
      </div>
    </div>
  )
}

// ─── Scenario card ────────────────────────────────────────────────────────────

function ScenarioCard({
  scenario, onChange, rows, forecastLabels,
}: {
  scenario: ScenarioConfig
  onChange: (partial: Partial<ScenarioConfig>) => void
  rows: ForecastRow[]
  forecastLabels: ForecastLabels
}) {
  const lastRow = rows[rows.length - 1]

  return (
    <Card className={cn("border-2 flex-1 min-w-[260px] max-w-sm", scenario.badgeClass)}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="size-3 rounded-full shrink-0"
              style={{ backgroundColor: scenario.color }}
            />
            <Input
              value={scenario.name}
              onChange={e => onChange({ name: e.target.value })}
              className="h-7 text-sm font-bold bg-transparent border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0 w-24"
            />
          </div>
          {lastRow && (
            <span className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded-full",
              lastRow.ebitdaMarginPct >= 15 ? "bg-emerald-500/15 text-emerald-500"
                : lastRow.ebitdaMarginPct >= 8 ? "bg-amber-500/15 text-amber-500"
                : "bg-destructive/15 text-destructive"
            )}>
              {lastRow.ebitdaMarginPct.toFixed(1)}% {forecastLabels.profitLabel}
            </span>
          )}
        </div>
        {lastRow && (
          <div className="mt-2 space-y-0.5">
            <p className="text-xl font-bold">{fmtCurrency(lastRow.revenue)}</p>
            <CardDescription className="text-[10px]">
              Revenue at end of forecast · {forecastLabels.profitLabel} {fmtCurrency(lastRow.ebitda)}
            </CardDescription>
          </div>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="h-px bg-border mb-3" />
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">Assumptions</p>
        <AssumptionRow label={forecastLabels.scenarioGrowthLabel} value={scenario.sssPct} onChange={v => onChange({ sssPct: v })} suffix="%" step={0.5} min={-20} max={30} />
        <AssumptionRow label="New Units / Period" value={scenario.newUnitsPerPeriod} onChange={v => onChange({ newUnitsPerPeriod: Math.max(0, Math.round(v)) })} suffix="" step={1} min={0} max={50} />
        <AssumptionRow label={forecastLabels.scenarioNewUnitValueLabel} value={scenario.auv} onChange={v => onChange({ auv: Math.max(0, Math.round(v)) })} suffix="" step={10000} min={0} max={10000000} />
        <div className="h-px bg-border/50 my-2" />
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">Cost Structure</p>
        <AssumptionRow label="COGS %" value={scenario.cogsPct} onChange={v => onChange({ cogsPct: v })} suffix="%" step={0.5} min={0} max={100} />
        <AssumptionRow label="Labor %" value={scenario.laborPct} onChange={v => onChange({ laborPct: v })} suffix="%" step={0.5} min={0} max={100} />
        <AssumptionRow label="OpEx %" value={scenario.opexPct} onChange={v => onChange({ opexPct: v })} suffix="%" step={0.5} min={0} max={100} />
      </CardContent>
    </Card>
  )
}

// ─── Comparison tooltip ───────────────────────────────────────────────────────

function CompTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs space-y-1.5 min-w-[160px]">
      <p className="font-bold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.fill }}>{p.name}</span>
          <span className="font-bold text-foreground">{fmtCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface ScenarioTabProps {
  records: FinancialRecord[]
  companies: Company[]
  user: User | null
  firestore: Firestore | null
  vertical: VerticalConfig
  locations: LocationMeta[]
  periods: string[]
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ScenarioTab({
  records, companies, user, firestore, vertical, locations, periods,
}: ScenarioTabProps) {

  const [basePeriod, setBasePeriod] = React.useState('')
  const [horizon, setHorizon] = React.useState(4)
  const [chartMetric, setChartMetric] = React.useState<'revenue' | 'ebitda'>('revenue')
  const [isSaving, setIsSaving] = React.useState(false)
  const [savedMsg, setSavedMsg] = React.useState('')

  // Scenarios state — seeded from vertical defaults
  const [scenarios, setScenarios] = React.useState<ScenarioConfig[]>(() => {
    const d = vertical.scenarioDefaults
    return [
      { id: 'bear', name: 'Bear', color: 'hsl(var(--destructive))', badgeClass: 'border-destructive/20',  ...d.bear },
      { id: 'base', name: 'Base', color: 'hsl(var(--primary))',     badgeClass: 'border-primary/20',      ...d.base },
      { id: 'bull', name: 'Bull', color: 'hsl(142 71% 45%)',        badgeClass: 'border-emerald-500/20',  ...d.bull },
    ]
  })

  function updateScenario(id: ScenarioId, partial: Partial<ScenarioConfig>) {
    setScenarios(prev => prev.map(s => s.id === id ? { ...s, ...partial } : s))
  }

  // Auto-select latest period
  React.useEffect(() => {
    if (periods.length && !basePeriod) setBasePeriod(periods[periods.length - 1])
  }, [periods, basePeriod])

  // Auto-populate cost %s and AUV from base period actuals, apply to all scenarios
  React.useEffect(() => {
    if (!basePeriod || !records.length) return
    const base = records.filter(r => r.period === basePeriod)
    const rev = sumMetric(base, 'Revenue')
    if (rev <= 0) return

    const cogs  = sumMetric(base, 'COGS')
    const labor = sumMetric(base, 'Labor', 'Payroll')
    const opex  = sumMetric(base, 'Operating Expenses', 'SG&A Expense')
    const unitCount = locations.length || 1
    const derivedAuv = Math.round(rev / unitCount)

    setScenarios(prev => prev.map((s, i) => {
      // Nudge cost %s slightly per scenario: bear is higher cost, bull is lower
      const nudge = i === 0 ? 2 : i === 2 ? -2 : 0
      return {
        ...s,
        cogsPct:  cogs  > 0 ? +((cogs  / rev) * 100 + nudge * 0.5).toFixed(1) : s.cogsPct,
        laborPct: labor > 0 ? +((labor / rev) * 100 + nudge * 0.5).toFixed(1) : s.laborPct,
        opexPct:  opex  > 0 ? +((opex  / rev) * 100 + nudge * 0.3).toFixed(1) : s.opexPct,
        auv: derivedAuv,
      }
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePeriod, records, locations])

  // Base period data
  const baseRecords = React.useMemo(
    () => records.filter(r => r.period === basePeriod),
    [records, basePeriod]
  )
  const baseRevenue = React.useMemo(() => sumMetric(baseRecords, 'Revenue'), [baseRecords])
  const baseCogs    = React.useMemo(() => sumMetric(baseRecords, 'COGS'), [baseRecords])
  const baseLabor   = React.useMemo(() => sumMetric(baseRecords, 'Labor', 'Payroll'), [baseRecords])
  const baseOpex    = React.useMemo(() => sumMetric(baseRecords, 'Operating Expenses', 'SG&A Expense'), [baseRecords])
  const baseNetProfit = React.useMemo(() => sumMetric(baseRecords, 'Net Profit'), [baseRecords])
  const baseEbitda  = baseNetProfit || (baseRevenue - baseCogs - baseLabor - baseOpex)
  const baseUnitCount = locations.length

  // Compute forecast for each scenario
  const forecastMap = React.useMemo(() => {
    if (!basePeriod || baseRevenue <= 0) {
      return { bear: [], base: [], bull: [] } as Record<ScenarioId, ForecastRow[]>
    }
    const result = {} as Record<ScenarioId, ForecastRow[]>
    for (const s of scenarios) {
      result[s.id] = buildScenarioForecast(basePeriod, baseRevenue, baseUnitCount, horizon, s)
    }
    return result
  }, [basePeriod, baseRevenue, baseUnitCount, horizon, scenarios])

  // Chart data — one entry per forward period, bars for each scenario
  const chartData = React.useMemo(() => {
    const forwardPeriods = generateForwardPeriods(basePeriod, horizon)
    return forwardPeriods.map((_, idx) => {
      const entry: Record<string, string | number> = {
        period: forecastMap.base[idx]?.label ?? '',
      }
      for (const s of scenarios) {
        const row = forecastMap[s.id][idx]
        if (row) entry[s.name] = chartMetric === 'revenue' ? row.revenue : row.ebitda
      }
      return entry
    })
  }, [basePeriod, horizon, forecastMap, scenarios, chartMetric])

  // Save all scenarios as financial_plan versions
  async function handleSaveScenarios() {
    if (!firestore || !user || !companies?.[0] || !baseRevenue) return
    setIsSaving(true)
    setSavedMsg('')

    const company = companies[0]
    const allOps: { id: string; data: FinancialPlan }[] = []

    for (const s of scenarios) {
      const rows = forecastMap[s.id]
      const version = s.name

      // Allocate proportionally by location's base revenue share
      const locShares = locations.map(loc => {
        const locRev = baseRecords
          .filter(r => r.locationId === loc.id && r.metric === 'Revenue')
          .reduce((sum, r) => sum + r.value, 0)
        return { loc, share: locRev / (baseRevenue || 1) }
      })

      for (const row of rows) {
        for (const { loc, share } of locShares) {
          const metrics: [string, number][] = [
            ['Revenue', row.revenue * share],
            ['EBITDA',  row.ebitda  * share],
          ]
          for (const [metric, value] of metrics) {
            const planId = `${loc.id}_${slugify(row.period)}_${slugify(metric)}_${slugify(version)}`
            allOps.push({
              id: planId,
              data: {
                id: planId,
                companyId: company.id,
                locationId: loc.id,
                locationName: loc.name,
                period: row.period,
                metric,
                plannedValue: value,
                version,
                companyMembers: company.members,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            })
          }
        }
      }
    }

    // Chunk at 450 ops per batch
    for (let i = 0; i < allOps.length; i += 450) {
      const chunk = allOps.slice(i, i + 450)
      const batch = writeBatch(firestore)
      for (const op of chunk) {
        batch.set(doc(firestore, "financial_plans", op.id), op.data, { merge: true })
      }
      await batch.commit()
    }

    setIsSaving(false)
    setSavedMsg(`${scenarios.map(s => s.name).join(', ')} saved as forecast versions.`)
    setTimeout(() => setSavedMsg(''), 5000)
  }

  const hasData = baseRevenue > 0

  return (
    <div className="space-y-6">

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Base Period</Label>
          <Select value={basePeriod} onValueChange={setBasePeriod}>
            <SelectTrigger className="h-9 w-36 bg-card border-border text-sm">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {periods.map(p => <SelectItem key={p} value={p}>{fmtShortPeriod(p)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Horizon</Label>
          <Select value={String(horizon)} onValueChange={v => setHorizon(Number(v))}>
            <SelectTrigger className="h-9 w-28 bg-card border-border text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="4">4 periods</SelectItem>
              <SelectItem value="6">6 periods</SelectItem>
              <SelectItem value="8">8 periods</SelectItem>
              <SelectItem value="12">12 periods</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {savedMsg && <span className="text-xs text-emerald-500">{savedMsg}</span>}
          <Button
            size="sm"
            onClick={handleSaveScenarios}
            disabled={isSaving || !hasData}
            className="h-9 gap-2"
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save All Scenarios
          </Button>
        </div>
      </div>

      {/* No data state */}
      {!hasData && (
        <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
          <TrendingUp className="mx-auto size-12 text-muted-foreground opacity-20 mb-4" />
          <p className="text-muted-foreground italic">No revenue data for this period.</p>
          <p className="text-xs text-muted-foreground mt-1">Upload data from the {vertical.unitsLabel} page first.</p>
        </div>
      )}

      {hasData && (
        <>
          {/* Scenario cards */}
          <div className="flex gap-4 flex-wrap">
            {scenarios.map(s => (
              <ScenarioCard
                key={s.id}
                scenario={s}
                onChange={partial => updateScenario(s.id, partial)}
                rows={forecastMap[s.id]}
                forecastLabels={vertical.forecastLabels}
              />
            ))}
          </div>

          {/* Comparison chart */}
          <Card className="bg-card/30 border-border p-6 space-y-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-bold text-foreground">Scenario Comparison</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Side-by-side {chartMetric === 'revenue' ? 'Revenue' : vertical.forecastLabels.profitLabel} trajectory across all scenarios.
                </p>
              </div>
              <div className="flex gap-1">
                {(['revenue', 'ebitda'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setChartMetric(m)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-semibold border transition-all",
                      chartMetric === m
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {m === 'revenue' ? 'Revenue' : vertical.forecastLabels.profitLabel}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }} barCategoryGap="20%">
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="period"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={v => fmtCurrency(v)}
                  width={64}
                />
                <Tooltip content={<CompTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                {scenarios.map(s => (
                  <Bar key={s.id} dataKey={s.name} fill={s.color} radius={[3, 3, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Summary comparison table */}
          <Card className="bg-card/30 border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-40">
                      Metric
                    </th>
                    {/* Base period */}
                    <th className="px-5 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Base ({fmtShortPeriod(basePeriod)})
                    </th>
                    {scenarios.map(s => (
                      <th
                        key={s.id}
                        className="px-5 py-3 text-center text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: s.color }}
                      >
                        {s.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {/* Revenue */}
                  <CompRow
                    label="Revenue (final period)"
                    baseValue={baseRevenue}
                    scenarios={scenarios}
                    forecastMap={forecastMap}
                    getValue={row => row.revenue}
                    format={fmtCurrency}
                    higherIsBetter
                  />
                  {/* Profit metric */}
                  <CompRow
                    label={`${vertical.forecastLabels.profitLabel} (final period)`}
                    baseValue={baseEbitda}
                    scenarios={scenarios}
                    forecastMap={forecastMap}
                    getValue={row => row.ebitda}
                    format={fmtCurrency}
                    higherIsBetter
                  />
                  {/* Profit margin */}
                  <CompRow
                    label={`${vertical.forecastLabels.profitPctLabel} (final)`}
                    baseValue={baseRevenue > 0 ? (baseEbitda / baseRevenue) * 100 : 0}
                    scenarios={scenarios}
                    forecastMap={forecastMap}
                    getValue={row => row.ebitdaMarginPct}
                    format={v => `${v.toFixed(1)}%`}
                    higherIsBetter
                  />
                  {/* Unit count */}
                  <CompRow
                    label={`${vertical.unitLabel} Count (final)`}
                    baseValue={baseUnitCount}
                    scenarios={scenarios}
                    forecastMap={forecastMap}
                    getValue={row => row.unitCount}
                    format={v => String(Math.round(v))}
                    higherIsBetter
                  />
                  {/* Cumulative revenue */}
                  <CompRow
                    label="Cumulative Revenue"
                    baseValue={null}
                    scenarios={scenarios}
                    forecastMap={forecastMap}
                    getValue={null}
                    getCumulative={rows => rows.reduce((s, r) => s + r.revenue, 0)}
                    format={fmtCurrency}
                    higherIsBetter
                  />
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

// ─── Comparison table row ─────────────────────────────────────────────────────

function CompRow({
  label,
  baseValue,
  scenarios,
  forecastMap,
  getValue,
  getCumulative,
  format,
  higherIsBetter,
}: {
  label: string
  baseValue: number | null
  scenarios: ScenarioConfig[]
  forecastMap: Record<ScenarioId, ForecastRow[]>
  getValue: ((row: ForecastRow) => number) | null
  getCumulative?: (rows: ForecastRow[]) => number
  format: (v: number) => string
  higherIsBetter: boolean
}) {
  function getVal(id: ScenarioId): number {
    const rows = forecastMap[id]
    if (!rows.length) return 0
    if (getCumulative) return getCumulative(rows)
    if (getValue) return getValue(rows[rows.length - 1])
    return 0
  }

  const values = scenarios.map(s => ({ id: s.id, name: s.name, color: s.color, val: getVal(s.id) }))
  const maxVal = Math.max(...values.map(v => v.val))
  const minVal = Math.min(...values.map(v => v.val))

  return (
    <tr className="hover:bg-muted/20 transition-colors">
      <td className="px-5 py-3 text-xs text-muted-foreground">{label}</td>
      <td className="px-5 py-3 text-center text-xs text-muted-foreground">
        {baseValue !== null ? format(baseValue) : <span className="italic text-muted-foreground/40">—</span>}
      </td>
      {values.map(v => {
        const isBest  = higherIsBetter ? v.val === maxVal : v.val === minVal
        const isWorst = higherIsBetter ? v.val === minVal : v.val === maxVal
        return (
          <td key={v.id} className="px-5 py-3 text-center">
            <div className="flex flex-col items-center gap-0.5">
              <span className={cn(
                "text-xs font-bold",
                isBest && "text-emerald-500",
                isWorst && "text-destructive",
                !isBest && !isWorst && "text-foreground",
              )}>
                {format(v.val)}
              </span>
              {isBest && (
                <span className="text-[10px] text-emerald-500 flex items-center gap-0.5">
                  <TrendingUp className="size-2.5" /> Best
                </span>
              )}
              {isWorst && (
                <span className="text-[10px] text-destructive flex items-center gap-0.5">
                  <TrendingDown className="size-2.5" /> Worst
                </span>
              )}
            </div>
          </td>
        )
      })}
    </tr>
  )
}
