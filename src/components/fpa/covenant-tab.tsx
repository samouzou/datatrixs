'use client';

import * as React from "react"
import {
  Loader2, Save, ShieldAlert, ShieldCheck, ShieldX, Settings2, Info,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from "recharts"
import { doc, setDoc } from "firebase/firestore"
import type { Firestore } from "firebase/firestore"
import type { User } from "firebase/auth"
import { FinancialRecord, CovenantSnapshot, CovenantThresholds, Company } from "@/lib/types"
import { cn } from "@/lib/utils"

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function fmtX(val: number): string {
  return `${val.toFixed(2)}x`
}

function sumMetric(records: FinancialRecord[], ...names: string[]): number {
  const lower = names.map(n => n.toLowerCase())
  return records.filter(r => lower.includes(r.metric.toLowerCase())).reduce((s, r) => s + r.value, 0)
}

// ─── RAG status ───────────────────────────────────────────────────────────────

type RagStatus = 'green' | 'amber' | 'red'

function netLeverageStatus(ratio: number | null, ceiling: number): RagStatus {
  if (ratio === null) return 'green'
  if (ratio > ceiling) return 'red'
  if (ratio > ceiling * 0.85) return 'amber'
  return 'green'
}

function coverageStatus(ratio: number | null, floor: number): RagStatus {
  if (ratio === null) return 'green'
  if (ratio < floor) return 'red'
  if (ratio < floor * 1.15) return 'amber'
  return 'green'
}

const RAG_ICON: Record<RagStatus, React.ReactNode> = {
  green: <ShieldCheck className="size-5 text-emerald-500" />,
  amber: <ShieldAlert className="size-5 text-amber-500" />,
  red:   <ShieldX className="size-5 text-destructive" />,
}

const RAG_LABEL: Record<RagStatus, { text: string; cls: string }> = {
  green: { text: 'In Compliance', cls: 'text-emerald-500' },
  amber: { text: 'Approaching Limit', cls: 'text-amber-500' },
  red:   { text: 'Covenant Breach', cls: 'text-destructive' },
}

const RAG_BG: Record<RagStatus, string> = {
  green: 'border-emerald-500/20 bg-emerald-500/5',
  amber: 'border-amber-500/20 bg-amber-500/5',
  red:   'border-destructive/20 bg-destructive/5',
}

// ─── Covenant KPI card ────────────────────────────────────────────────────────

function CovenantCard({
  title, value, threshold, thresholdLabel, status, isCeiling, hint,
}: {
  title: string
  value: number | null
  threshold: number
  thresholdLabel: string
  status: RagStatus
  isCeiling: boolean   // true = breach above, false = breach below
  hint: string
}) {
  return (
    <Card className={cn("border-2", RAG_BG[status])}>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">{title}</p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="size-3 text-muted-foreground/50 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[220px] text-xs">{hint}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-3xl font-bold">
              {value !== null ? fmtX(value) : <span className="text-muted-foreground text-xl italic">—</span>}
            </p>
          </div>
          {RAG_ICON[status]}
        </div>

        <div className="space-y-2">
          {/* Progress bar toward limit */}
          {value !== null && (
            <div className="space-y-1">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                {isCeiling ? (
                  <div
                    className={cn("h-full rounded-full transition-all", status === 'green' ? 'bg-emerald-500' : status === 'amber' ? 'bg-amber-500' : 'bg-destructive')}
                    style={{ width: `${Math.min(100, (value / threshold) * 100)}%` }}
                  />
                ) : (
                  <div
                    className={cn("h-full rounded-full transition-all", status === 'green' ? 'bg-emerald-500' : status === 'amber' ? 'bg-amber-500' : 'bg-destructive')}
                    style={{ width: `${Math.min(100, (value / (threshold * 2)) * 100)}%` }}
                  />
                )}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span className={RAG_LABEL[status].cls + ' font-semibold'}>{RAG_LABEL[status].text}</span>
                <span>{thresholdLabel}: {fmtX(threshold)}</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs space-y-1.5 min-w-[160px]">
      <p className="font-bold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-bold text-foreground">{typeof p.value === 'number' ? fmtX(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Financial input row ──────────────────────────────────────────────────────

function FinRow({
  label, value, onChange, hint,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs">{label}</Label>
        {hint && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="size-3 text-muted-foreground/50 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[200px] text-xs">{hint}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
        <Input
          type="number"
          value={value || ''}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="h-9 pl-6"
          placeholder="0"
        />
      </div>
    </div>
  )
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface CovenantTabProps {
  records: FinancialRecord[]
  snapshots: CovenantSnapshot[]
  companies: Company[]
  user: User | null
  firestore: Firestore | null
  periods: string[]
}

const DEFAULT_THRESHOLDS: CovenantThresholds = {
  netLeverageCeiling:    5.0,
  interestCoverageFloor: 2.0,
  fccrFloor:             1.1,
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CovenantTab({ records, snapshots, companies, user, firestore, periods }: CovenantTabProps) {

  const [selectedPeriod, setSelectedPeriod] = React.useState('')
  const [thresholds, setThresholds] = React.useState<CovenantThresholds>(DEFAULT_THRESHOLDS)
  const [showThresholds, setShowThresholds] = React.useState(false)

  // Financials dialog
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [formDebt,     setFormDebt]     = React.useState(0)
  const [formCash,     setFormCash]     = React.useState(0)
  const [formInterest, setFormInterest] = React.useState(0)
  const [formFixed,    setFormFixed]    = React.useState(0)
  const [isSaving,     setIsSaving]     = React.useState(false)

  // Auto-select most recent period
  React.useEffect(() => {
    if (periods.length && !selectedPeriod) setSelectedPeriod(periods[periods.length - 1])
  }, [periods, selectedPeriod])

  // All unique periods across records + snapshots
  const allPeriods = React.useMemo(() => {
    const s = new Set(periods)
    snapshots.forEach(sn => s.add(sn.period))
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [periods, snapshots])

  // Current period snapshot
  const snapshot = snapshots.find(s => s.period === selectedPeriod) ?? null

  // EBITDA from actuals for selected period
  const periodRecords = React.useMemo(
    () => records.filter(r => r.period === selectedPeriod),
    [records, selectedPeriod]
  )
  const revenue    = sumMetric(periodRecords, 'Revenue')
  const cogs       = sumMetric(periodRecords, 'COGS')
  const labor      = sumMetric(periodRecords, 'Labor', 'Payroll')
  const opex       = sumMetric(periodRecords, 'Operating Expenses', 'SG&A Expense')
  const netProfit  = sumMetric(periodRecords, 'Net Profit')
  const ebitda     = netProfit || (revenue - cogs - labor - opex)

  // Ratios
  const netDebt    = snapshot ? snapshot.totalDebt - snapshot.cash : null
  const netLeverage = (netDebt !== null && ebitda > 0) ? netDebt / ebitda : null
  const interestCoverage = (snapshot?.interestExpense && ebitda > 0) ? ebitda / snapshot.interestExpense : null
  const fccr = (snapshot?.fixedCharges && ebitda > 0) ? ebitda / snapshot.fixedCharges : null

  // Status
  const levStatus  = netLeverageStatus(netLeverage, thresholds.netLeverageCeiling)
  const icStatus   = coverageStatus(interestCoverage, thresholds.interestCoverageFloor)
  const fccrStatus = coverageStatus(fccr, thresholds.fccrFloor)
  const overallStatus: RagStatus =
    levStatus === 'red' || icStatus === 'red' || fccrStatus === 'red' ? 'red'
    : levStatus === 'amber' || icStatus === 'amber' || fccrStatus === 'amber' ? 'amber'
    : 'green'

  // Trend data — one row per period that has both records and a snapshot
  const trendData = React.useMemo(() => {
    return allPeriods.map(p => {
      const snap = snapshots.find(s => s.period === p)
      const pRecs = records.filter(r => r.period === p)
      const pRev   = sumMetric(pRecs, 'Revenue')
      const pCogs  = sumMetric(pRecs, 'COGS')
      const pLabor = sumMetric(pRecs, 'Labor', 'Payroll')
      const pOpex  = sumMetric(pRecs, 'Operating Expenses', 'SG&A Expense')
      const pProfit = sumMetric(pRecs, 'Net Profit')
      const pEbitda = pProfit || (pRev - pCogs - pLabor - pOpex)

      const pNetDebt = snap ? snap.totalDebt - snap.cash : null
      const pLev  = pNetDebt !== null && pEbitda > 0 ? +(pNetDebt / pEbitda).toFixed(2) : null
      const pIc   = snap?.interestExpense && pEbitda > 0 ? +(pEbitda / snap.interestExpense).toFixed(2) : null
      const pFccr = snap?.fixedCharges    && pEbitda > 0 ? +(pEbitda / snap.fixedCharges).toFixed(2) : null

      if (pLev === null && pIc === null && pFccr === null) return null
      return {
        period: fmtShortPeriod(p),
        'Net Leverage': pLev,
        'Int. Coverage': pIc,
        'FCCR': pFccr,
      }
    }).filter(Boolean)
  }, [allPeriods, snapshots, records])

  function openDialog() {
    setFormDebt(snapshot?.totalDebt ?? 0)
    setFormCash(snapshot?.cash ?? 0)
    setFormInterest(snapshot?.interestExpense ?? 0)
    setFormFixed(snapshot?.fixedCharges ?? 0)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!firestore || !user || !companies?.[0]) return
    setIsSaving(true)
    const company = companies[0]
    const id = `${company.id}_${selectedPeriod}`
    const now = new Date().toISOString()
    const data: CovenantSnapshot = {
      id,
      companyId: company.id,
      period: selectedPeriod,
      totalDebt:       formDebt,
      cash:            formCash,
      interestExpense: formInterest,
      fixedCharges:    formFixed,
      companyMembers:  company.members,
      createdAt: snapshot?.createdAt ?? now,
      updatedAt: now,
    }
    await setDoc(doc(firestore, 'covenant_snapshots', id), data, { merge: true })
    setIsSaving(false)
    setDialogOpen(false)
  }

  const hasEbitda = ebitda !== 0

  return (
    <div className="space-y-6">

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Period</Label>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="h-9 w-36 bg-card border-border text-sm">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {allPeriods.map(p => <SelectItem key={p} value={p}>{fmtShortPeriod(p)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowThresholds(v => !v)}
            className="h-9 gap-2"
          >
            <Settings2 className="size-4" />
            Covenant Thresholds
          </Button>
          <Button size="sm" onClick={openDialog} className="h-9 gap-2" disabled={!selectedPeriod}>
            <Save className="size-4" />
            {snapshot ? 'Update' : 'Enter'} Financials
          </Button>
        </div>
      </div>

      {/* Threshold editor */}
      {showThresholds && (
        <Card className="bg-card/30 border-border">
          <CardContent className="p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">Covenant Thresholds</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="space-y-1.5">
                <Label className="text-xs">Net Leverage Ceiling (x)</Label>
                <Input
                  type="number"
                  step={0.25}
                  value={thresholds.netLeverageCeiling}
                  onChange={e => setThresholds(t => ({ ...t, netLeverageCeiling: parseFloat(e.target.value) || 0 }))}
                  className="h-9"
                />
                <p className="text-[10px] text-muted-foreground">Breach if Net Leverage exceeds this</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Interest Coverage Floor (x)</Label>
                <Input
                  type="number"
                  step={0.25}
                  value={thresholds.interestCoverageFloor}
                  onChange={e => setThresholds(t => ({ ...t, interestCoverageFloor: parseFloat(e.target.value) || 0 }))}
                  className="h-9"
                />
                <p className="text-[10px] text-muted-foreground">Breach if coverage falls below this</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">FCCR Floor (x)</Label>
                <Input
                  type="number"
                  step={0.1}
                  value={thresholds.fccrFloor}
                  onChange={e => setThresholds(t => ({ ...t, fccrFloor: parseFloat(e.target.value) || 0 }))}
                  className="h-9"
                />
                <p className="text-[10px] text-muted-foreground">Breach if FCCR falls below this</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overall status banner */}
      <div className={cn(
        "flex items-center gap-3 rounded-xl px-5 py-3 border",
        RAG_BG[overallStatus]
      )}>
        {RAG_ICON[overallStatus]}
        <div>
          <p className={cn("font-bold text-sm", RAG_LABEL[overallStatus].cls)}>
            {overallStatus === 'green' && 'All covenants in compliance'}
            {overallStatus === 'amber' && 'One or more covenants approaching limit'}
            {overallStatus === 'red'   && 'Covenant breach detected'}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {fmtShortPeriod(selectedPeriod)}
            {!snapshot && ' — No debt data entered yet. Click "Enter Financials" to add.'}
            {!hasEbitda && snapshot && ' — No EBITDA data for this period in actuals.'}
          </p>
        </div>
      </div>

      {/* Covenant KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <CovenantCard
          title="Net Leverage"
          value={netLeverage}
          threshold={thresholds.netLeverageCeiling}
          thresholdLabel="Ceiling"
          status={levStatus}
          isCeiling
          hint="Net Debt (Total Debt − Cash) divided by EBITDA. Lower is better. Lenders typically covenant at 4x–6x."
        />
        <CovenantCard
          title="Interest Coverage"
          value={interestCoverage}
          threshold={thresholds.interestCoverageFloor}
          thresholdLabel="Floor"
          status={icStatus}
          isCeiling={false}
          hint="EBITDA divided by Interest Expense. Higher is better. Typical covenant floor is 2.0x–2.5x."
        />
        <CovenantCard
          title="FCCR"
          value={fccr}
          threshold={thresholds.fccrFloor}
          thresholdLabel="Floor"
          status={fccrStatus}
          isCeiling={false}
          hint="Fixed Charge Coverage Ratio: EBITDA ÷ Fixed Charges (rent + interest + debt service). Floor typically 1.1x–1.25x."
        />
      </div>

      {/* Debt snapshot panel */}
      {snapshot && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Debt',       value: snapshot.totalDebt },
            { label: 'Cash',             value: snapshot.cash },
            { label: 'Net Debt',         value: snapshot.totalDebt - snapshot.cash },
            { label: 'EBITDA (actuals)', value: ebitda },
          ].map(({ label, value }) => (
            <Card key={label} className="bg-card/30 border-border">
              <CardContent className="p-4">
                <CardDescription className="text-[10px] uppercase tracking-widest">{label}</CardDescription>
                <p className="text-lg font-bold mt-1">{fmtCurrency(value)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Trend chart */}
      {trendData.length >= 2 && (
        <Card className="bg-card/30 border-border p-6 space-y-4">
          <div>
            <h3 className="font-bold text-foreground">Ratio Trends</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Historical covenant ratios across all periods with data.</p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
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
                tickFormatter={v => `${v}x`}
                width={40}
              />
              <RechartTooltip content={<ChartTooltip />} cursor={{ stroke: 'hsl(var(--border))' }} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />

              {/* Covenant reference lines */}
              <ReferenceLine y={thresholds.netLeverageCeiling}    stroke="hsl(var(--destructive))" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: `Lev. ceiling ${fmtX(thresholds.netLeverageCeiling)}`, position: 'insideTopRight', fontSize: 9, fill: 'hsl(var(--destructive))' }} />
              <ReferenceLine y={thresholds.interestCoverageFloor} stroke="hsl(142 71% 45%)"        strokeDasharray="4 4" strokeWidth={1.5} label={{ value: `IC floor ${fmtX(thresholds.interestCoverageFloor)}`, position: 'insideBottomRight', fontSize: 9, fill: 'hsl(142 71% 45%)' }} />
              <ReferenceLine y={thresholds.fccrFloor}             stroke="hsl(38 92% 50%)"         strokeDasharray="4 4" strokeWidth={1.5} label={{ value: `FCCR floor ${fmtX(thresholds.fccrFloor)}`, position: 'insideBottomLeft', fontSize: 9, fill: 'hsl(38 92% 50%)' }} />

              <Line type="monotone" dataKey="Net Leverage"  stroke="hsl(var(--destructive))"  strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="Int. Coverage" stroke="hsl(142 71% 45%)"         strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="FCCR"          stroke="hsl(38 92% 50%)"          strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Compliance summary table */}
      {snapshot && (
        <Card className="bg-card/30 border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {['Covenant', 'Actual', 'Threshold', 'Headroom', 'Status'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                <ComplianceRow
                  covenant="Net Leverage"
                  actual={netLeverage}
                  threshold={thresholds.netLeverageCeiling}
                  status={levStatus}
                  isCeiling
                />
                <ComplianceRow
                  covenant="Interest Coverage"
                  actual={interestCoverage}
                  threshold={thresholds.interestCoverageFloor}
                  status={icStatus}
                  isCeiling={false}
                />
                <ComplianceRow
                  covenant="FCCR"
                  actual={fccr}
                  threshold={thresholds.fccrFloor}
                  status={fccrStatus}
                  isCeiling={false}
                />
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Enter Financials dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Debt &amp; Financing — {fmtShortPeriod(selectedPeriod)}</DialogTitle>
            <DialogDescription>
              Enter balance sheet and financing data for this period. EBITDA is pulled automatically from actuals.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* EBITDA read-only reference */}
            <div className="rounded-lg bg-muted/50 border border-border px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">EBITDA from Actuals</p>
              <p className="text-xl font-bold mt-0.5">{hasEbitda ? fmtCurrency(ebitda) : <span className="text-muted-foreground italic text-sm">No data for this period</span>}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FinRow
                label="Total Debt"
                value={formDebt}
                onChange={setFormDebt}
                hint="Gross debt outstanding: term loans, revolvers, bonds, etc."
              />
              <FinRow
                label="Cash &amp; Equivalents"
                value={formCash}
                onChange={setFormCash}
                hint="Unrestricted cash and short-term liquid investments."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FinRow
                label="Interest Expense"
                value={formInterest}
                onChange={setFormInterest}
                hint="Total cash interest paid in the period on all debt facilities."
              />
              <FinRow
                label="Fixed Charges"
                value={formFixed}
                onChange={setFormFixed}
                hint="Interest + rent + lease payments + scheduled debt amortization."
              />
            </div>

            {/* Live preview */}
            {hasEbitda && (formDebt > 0 || formInterest > 0 || formFixed > 0) && (
              <div className="rounded-lg bg-muted/50 border border-border px-4 py-3 space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Preview</p>
                {formDebt > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Net Leverage</span>
                    <span className={cn("font-bold", netLeverageStatus((formDebt - formCash) / ebitda, thresholds.netLeverageCeiling) === 'green' ? 'text-emerald-500' : netLeverageStatus((formDebt - formCash) / ebitda, thresholds.netLeverageCeiling) === 'amber' ? 'text-amber-500' : 'text-destructive')}>
                      {fmtX((formDebt - formCash) / ebitda)}
                    </span>
                  </div>
                )}
                {formInterest > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Interest Coverage</span>
                    <span className={cn("font-bold", coverageStatus(ebitda / formInterest, thresholds.interestCoverageFloor) === 'green' ? 'text-emerald-500' : coverageStatus(ebitda / formInterest, thresholds.interestCoverageFloor) === 'amber' ? 'text-amber-500' : 'text-destructive')}>
                      {fmtX(ebitda / formInterest)}
                    </span>
                  </div>
                )}
                {formFixed > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">FCCR</span>
                    <span className={cn("font-bold", coverageStatus(ebitda / formFixed, thresholds.fccrFloor) === 'green' ? 'text-emerald-500' : coverageStatus(ebitda / formFixed, thresholds.fccrFloor) === 'amber' ? 'text-amber-500' : 'text-destructive')}>
                      {fmtX(ebitda / formFixed)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              {isSaving && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

// ─── Compliance table row ─────────────────────────────────────────────────────

function ComplianceRow({
  covenant, actual, threshold, status, isCeiling,
}: {
  covenant: string
  actual: number | null
  threshold: number
  status: RagStatus
  isCeiling: boolean
}) {
  const headroom = actual !== null
    ? isCeiling
      ? threshold - actual
      : actual - threshold
    : null

  return (
    <tr className="hover:bg-muted/20 transition-colors">
      <td className="px-5 py-3 font-medium text-sm">{covenant}</td>
      <td className="px-5 py-3 font-bold text-sm">
        {actual !== null ? fmtX(actual) : <span className="text-muted-foreground italic text-xs">—</span>}
      </td>
      <td className="px-5 py-3 text-muted-foreground text-sm">
        {isCeiling ? '≤ ' : '≥ '}{fmtX(threshold)}
      </td>
      <td className="px-5 py-3 text-sm">
        {headroom !== null ? (
          <span className={cn("font-semibold", headroom >= 0 ? "text-emerald-500" : "text-destructive")}>
            {headroom >= 0 ? '+' : ''}{fmtX(headroom)}
          </span>
        ) : (
          <span className="text-muted-foreground italic text-xs">—</span>
        )}
      </td>
      <td className="px-5 py-3">
        <span className={cn(
          "inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border",
          status === 'green' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
            : status === 'amber' ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
            : 'bg-destructive/10 border-destructive/30 text-destructive'
        )}>
          {RAG_ICON[status]}
          {RAG_LABEL[status].text}
        </span>
      </td>
    </tr>
  )
}
