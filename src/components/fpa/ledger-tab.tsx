'use client'

import * as React from "react"
import { Download, Save, Loader2, FileSpreadsheet, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { doc, writeBatch } from "firebase/firestore"
import type { Firestore } from "firebase/firestore"
import type { User } from "firebase/auth"
import { FinancialRecord, FinancialPlan, Company } from "@/lib/types"
import type { VerticalConfig } from "@/lib/verticals"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type LocationMeta = { id: string; name: string }

type LedgerRowDef = {
  key: string
  label: string
  section: string
  isHighlight?: boolean
  isPct?: boolean
  isDim?: boolean
  isEditable?: boolean
  isComputed?: boolean
  goodDirection: 'up' | 'down'
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function fmtC(val: number): string {
  const abs = Math.abs(val)
  const sign = val < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(0)}K`
  return `${sign}$${abs.toFixed(0)}`
}

function fmtPeriod(p: string): string {
  if (p.includes('-Q')) {
    const [y, q] = p.split('-')
    return `${q} '${y.slice(2)}`
  }
  if (p.includes('-')) {
    const [y, m] = p.split('-')
    const mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    return `${mo[+m - 1] ?? m} '${y.slice(2)}`
  }
  return p
}

function getYear(p: string): string { return p.split('-')[0] }

function sumR(records: FinancialRecord[], ...keys: string[]): number {
  const lower = keys.map(k => k.toLowerCase())
  return records.filter(r => lower.includes(r.metric.toLowerCase())).reduce((s, r) => s + r.value, 0)
}

function sumP(plans: FinancialPlan[], ...keys: string[]): number {
  const lower = keys.map(k => k.toLowerCase())
  return plans.filter(p => lower.includes(p.metric.toLowerCase())).reduce((s, p) => s + p.plannedValue, 0)
}

// Allow users to type "3.5M", "350K", or raw numbers
function parseBudgetInput(raw: string): number | null {
  const s = raw.trim().replace(/[$,\s]/g, '')
  if (!s) return null
  const mul = /[Mm]$/.test(s) ? 1_000_000 : /[Kk]$/.test(s) ? 1_000 : 1
  const num = parseFloat(s.replace(/[KkMm]$/, ''))
  return isNaN(num) ? null : num * mul
}

// ─── Row definitions ─────────────────────────────────────────────────────────

function getRowDefs(vertical: VerticalConfig): LedgerRowDef[] {
  if (vertical.id === 'biotech') {
    return [
      { key: 'Revenue',              label: 'Revenue',                               section: 'Revenue',            isHighlight: true, isEditable: true,  goodDirection: 'up'   },
      { key: 'R&D Expense',          label: 'R&D Expense',                           section: 'R&D Costs',          isEditable: true,                     goodDirection: 'down' },
      { key: 'Clinical Trial Costs', label: 'Clinical Trial Costs',                  section: 'R&D Costs',          isEditable: true,                     goodDirection: 'down' },
      { key: 'Total R&D',            label: 'Total R&D Burn',                        section: 'R&D Costs',          isHighlight: true, isComputed: true,   goodDirection: 'down' },
      { key: 'SG&A Expense',         label: 'SG&A Expense',                          section: 'Operating Expenses', isEditable: true,                     goodDirection: 'down' },
      { key: 'Operating Income',     label: vertical.forecastLabels.profitLabel,     section: 'Bottom Line',        isHighlight: true, isEditable: true,   goodDirection: 'up'   },
      { key: 'Op. Income %',         label: vertical.forecastLabels.profitPctLabel,  section: 'Bottom Line',        isPct: true, isDim: true, isComputed: true, goodDirection: 'up' },
    ]
  }
  return [
    { key: 'Revenue',            label: 'Revenue',                              section: 'Revenue',            isHighlight: true, isEditable: true,  goodDirection: 'up'   },
    { key: 'COGS',               label: 'COGS',                                 section: 'Cost of Revenue',    isEditable: true,                     goodDirection: 'down' },
    { key: 'Gross Profit',       label: 'Gross Profit',                         section: 'Gross Profit',       isHighlight: true, isComputed: true,  goodDirection: 'up'   },
    { key: 'Gross Margin %',     label: 'Gross Margin %',                       section: 'Gross Profit',       isPct: true, isDim: true, isComputed: true, goodDirection: 'up' },
    { key: 'Labor',              label: 'Labor',                                section: 'Operating Expenses', isEditable: true,                     goodDirection: 'down' },
    { key: 'Operating Expenses', label: 'OpEx',                                 section: 'Operating Expenses', isEditable: true,                     goodDirection: 'down' },
    { key: 'Net Profit',         label: vertical.forecastLabels.profitLabel,    section: 'Bottom Line',        isHighlight: true, isEditable: true,  goodDirection: 'up'   },
    { key: 'EBITDA %',           label: vertical.forecastLabels.profitPctLabel, section: 'Bottom Line',        isPct: true, isDim: true, isComputed: true, goodDirection: 'up' },
  ]
}

// ─── Actual / budget computation per row ─────────────────────────────────────

function getActual(recs: FinancialRecord[], key: string): number | null {
  const rev  = sumR(recs, 'Revenue')
  const cogs = sumR(recs, 'COGS')
  const gp   = rev - cogs
  switch (key) {
    case 'Gross Profit':   return rev || cogs ? gp : null
    case 'Gross Margin %': return rev > 0 ? (gp / rev) * 100 : null
    case 'EBITDA %': {
      const labor  = sumR(recs, 'Labor', 'Payroll')
      const opex   = sumR(recs, 'Operating Expenses', 'SG&A Expense')
      const np     = sumR(recs, 'Net Profit')
      const ebitda = np || (gp - labor - opex)
      return rev > 0 ? (ebitda / rev) * 100 : null
    }
    case 'Op. Income %': {
      const oi = sumR(recs, 'Operating Income')
      return rev > 0 ? (oi / rev) * 100 : null
    }
    case 'Total R&D': {
      const v = sumR(recs, 'R&D Expense', 'Clinical Trial Costs')
      return v ? v : null
    }
    default: {
      const v = sumR(recs, key)
      return v !== 0 ? v : null
    }
  }
}

function getBudget(plans: FinancialPlan[], key: string): number | null {
  const rev  = sumP(plans, 'Revenue')
  const cogs = sumP(plans, 'COGS')
  const gp   = rev - cogs
  switch (key) {
    case 'Gross Profit':   return rev || cogs ? gp : null
    case 'Gross Margin %': return rev > 0 ? (gp / rev) * 100 : null
    case 'EBITDA %': {
      const labor  = sumP(plans, 'Labor', 'Payroll')
      const opex   = sumP(plans, 'Operating Expenses', 'SG&A Expense')
      const np     = sumP(plans, 'Net Profit')
      const ebitda = np || (gp - labor - opex)
      return rev > 0 ? (ebitda / rev) * 100 : null
    }
    case 'Op. Income %': {
      const oi = sumP(plans, 'Operating Income')
      return rev > 0 ? (oi / rev) * 100 : null
    }
    case 'Total R&D': {
      const v = sumP(plans, 'R&D Expense', 'Clinical Trial Costs')
      return v ? v : null
    }
    default: {
      const v = sumP(plans, key)
      return v !== 0 ? v : null
    }
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface LedgerTabProps {
  records:   FinancialRecord[]
  plans:     FinancialPlan[]
  companies: Company[]
  user:      User | null
  firestore: Firestore | null
  vertical:  VerticalConfig
  locations: LocationMeta[]
  periods:   string[]
  versions:  string[]
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LedgerTab({
  records, plans, companies, user, firestore, vertical, locations, periods, versions,
}: LedgerTabProps) {

  const rowDefs = React.useMemo(() => getRowDefs(vertical), [vertical])

  const [version, setVersion] = React.useState(
    () => versions.includes('Annual Budget') ? 'Annual Budget' : versions[0] ?? 'Annual Budget'
  )
  const [editingKey, setEditingKey]     = React.useState<string | null>(null)
  const [pendingEdits, setPendingEdits] = React.useState<Record<string, string>>({})
  const [isSaving, setIsSaving]         = React.useState(false)

  // Sync version when list changes
  React.useEffect(() => {
    if (versions.length && !versions.includes(version)) setVersion(versions[0])
  }, [versions, version])

  // Only show periods that have actual data
  const actualPeriods = React.useMemo(() => {
    const withData = new Set(records.map(r => r.period))
    return periods.filter(p => withData.has(p))
  }, [records, periods])

  // YTD: all actual periods in the latest year
  const latestYear    = actualPeriods.length ? getYear(actualPeriods[actualPeriods.length - 1]) : ''
  const ytdPeriods    = actualPeriods.filter(p => getYear(p) === latestYear)
  const priorYear     = latestYear ? String(parseInt(latestYear) - 1) : ''
  const priorYtdAll   = actualPeriods.filter(p => getYear(p) === priorYear)
  // Match the same number of periods (Jan–Apr 2025 vs Jan–Apr 2026)
  const priorYtd      = priorYtdAll.slice(-ytdPeriods.length)
  const hasPriorYtd   = priorYtd.length > 0
  const showYtd       = ytdPeriods.length > 1

  const versionPlans = React.useMemo(
    () => plans.filter(p => p.version === version),
    [plans, version]
  )

  // Compute actual + budget for a given set of periods and row key
  const getCellData = React.useCallback((periodList: string[], rowKey: string) => {
    const recs = records.filter(r => periodList.includes(r.period))
    const plns = versionPlans.filter(p => periodList.includes(p.period))
    return { actual: getActual(recs, rowKey), budget: getBudget(plns, rowKey) }
  }, [records, versionPlans])

  const hasPendingEdits = Object.keys(pendingEdits).length > 0

  // Save all pending budget edits, distributing to locations by revenue share
  async function handleSave() {
    if (!firestore || !user || !companies?.[0] || !hasPendingEdits) return
    setIsSaving(true)
    const company  = companies[0]
    const now      = new Date().toISOString()

    // Revenue share from the latest actual period
    const latestPeriod = actualPeriods[actualPeriods.length - 1]
    const latestRecs   = records.filter(r => r.period === latestPeriod)
    const totalRev     = sumR(latestRecs, 'Revenue') || 1
    const locShares    = locations.map(loc => {
      const locRev = latestRecs
        .filter(r => r.locationId === loc.id && r.metric.toLowerCase() === 'revenue')
        .reduce((s, r) => s + r.value, 0)
      return { loc, share: locRev / totalRev }
    })

    const allOps: Array<{ id: string; data: object }> = []
    for (const [key, rawVal] of Object.entries(pendingEdits)) {
      const sepIdx     = key.indexOf('|')
      const period     = key.slice(0, sepIdx)
      const metricKey  = key.slice(sepIdx + 1)
      const totalBudget = parseBudgetInput(rawVal)
      if (totalBudget === null) continue
      for (const { loc, share } of locShares) {
        const planId = `${loc.id}_${slugify(period)}_${slugify(metricKey)}_${slugify(version)}`
        allOps.push({
          id: planId,
          data: {
            id: planId, companyId: company.id,
            locationId: loc.id, locationName: loc.name,
            period, metric: metricKey,
            plannedValue: totalBudget * share,
            version, companyMembers: company.members,
            createdAt: now, updatedAt: now,
          },
        })
      }
    }

    for (let i = 0; i < allOps.length; i += 450) {
      const batch = writeBatch(firestore)
      for (const op of allOps.slice(i, i + 450))
        batch.set(doc(firestore, 'financial_plans', op.id), op.data as any, { merge: true })
      await batch.commit()
    }
    setPendingEdits({})
    setIsSaving(false)
  }

  // CSV export
  function handleDownload() {
    const allCols = [
      ...actualPeriods.map(p => ({ label: fmtPeriod(p), periodList: [p] })),
      ...(showYtd    ? [{ label: `YTD ${latestYear}`, periodList: ytdPeriods  }] : []),
      ...(hasPriorYtd ? [{ label: `YTD ${priorYear}`, periodList: priorYtd   }] : []),
    ]
    const headers = ['Metric', ...allCols.flatMap(c => [`${c.label} Actual`, `${c.label} Budget`, `${c.label} Var%`])]
    const csvRows = rowDefs.map(row => {
      const cells: string[] = [row.label]
      for (const col of allCols) {
        const { actual, budget } = getCellData(col.periodList, row.key)
        const varPct = actual !== null && budget !== null && budget !== 0
          ? ((actual - budget) / Math.abs(budget)) * 100 : null
        cells.push(actual !== null ? actual.toFixed(0) : '')
        cells.push(budget !== null ? budget.toFixed(0) : '')
        cells.push(varPct !== null ? `${varPct.toFixed(1)}%` : '')
      }
      return cells
    })
    const csv  = [headers, ...csvRows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'fpa-ledger.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  if (!actualPeriods.length) {
    return (
      <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
        <FileSpreadsheet className="mx-auto size-12 text-muted-foreground opacity-20 mb-4" />
        <p className="text-muted-foreground italic">
          No financial data available. Upload data from the {vertical.unitsLabel} page first.
        </p>
      </div>
    )
  }

  const sections = [...new Set(rowDefs.map(r => r.section))]
  const extraCols: Array<{ label: string; periodList: string[] }> = [
    ...(showYtd     ? [{ label: `YTD ${latestYear}`, periodList: ytdPeriods }] : []),
    ...(hasPriorYtd ? [{ label: `YTD ${priorYear}`,  periodList: priorYtd  }] : []),
  ]
  const totalCols = actualPeriods.length + extraCols.length

  return (
    <div className="space-y-4">

      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">vs</Label>
          <Select value={version} onValueChange={setVersion}>
            <SelectTrigger className="h-9 w-48 bg-card border-border text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {versions.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Click any budget value to edit · type <span className="font-mono bg-muted px-1 rounded">3.5M</span>, <span className="font-mono bg-muted px-1 rounded">350K</span>, or raw dollars
        </p>
        <div className="ml-auto flex items-center gap-2">
          {hasPendingEdits && (
            <Button size="sm" onClick={handleSave} disabled={isSaving} className="h-9 gap-2 bg-primary hover:bg-primary/90">
              {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              Save {Object.keys(pendingEdits).length} Edit{Object.keys(pendingEdits).length !== 1 ? 's' : ''}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleDownload} className="h-9 gap-2">
            <Download className="size-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="rounded-xl border border-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="border-collapse w-full text-sm">

            {/* Header */}
            <thead>
              <tr className="bg-muted/60 border-b-2 border-border">
                <th className="sticky left-0 z-20 bg-muted/80 backdrop-blur-sm px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-r-2 border-border min-w-[168px]">
                  Metric
                </th>
                {actualPeriods.map(p => (
                  <th key={p} className="px-3 py-3 text-center text-[11px] font-semibold text-muted-foreground border-r border-border/60 min-w-[110px] whitespace-nowrap">
                    {fmtPeriod(p)}
                  </th>
                ))}
                {extraCols.map(col => (
                  <th key={col.label} className="px-3 py-3 text-center text-[11px] font-bold text-primary border-r border-border/60 min-w-[110px] whitespace-nowrap last:border-r-0 bg-primary/5">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {sections.map(section => {
                const sectionRows = rowDefs.filter(r => r.section === section)
                return (
                  <React.Fragment key={section}>
                    {/* Section divider */}
                    <tr className="bg-muted/25 border-y border-border/40">
                      <td
                        colSpan={totalCols + 1}
                        className="sticky left-0 px-4 py-1.5 bg-muted/25"
                      >
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          {section}
                        </span>
                      </td>
                    </tr>

                    {sectionRows.map(row => (
                      <LedgerRow
                        key={row.key}
                        row={row}
                        actualPeriods={actualPeriods}
                        extraCols={extraCols}
                        getCellData={getCellData}
                        editingKey={editingKey}
                        setEditingKey={setEditingKey}
                        pendingEdits={pendingEdits}
                        setPendingEdits={setPendingEdits}
                      />
                    ))}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-muted/10 border-t border-border text-[10px] text-muted-foreground font-medium">
          <span>
            {actualPeriods.length} periods · {locations.length} {vertical.unitsLabel.toLowerCase()} · portfolio totals
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-accent animate-pulse" />
            Live
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Individual row ───────────────────────────────────────────────────────────

function LedgerRow({
  row, actualPeriods, extraCols, getCellData,
  editingKey, setEditingKey, pendingEdits, setPendingEdits,
}: {
  row: LedgerRowDef
  actualPeriods: string[]
  extraCols: Array<{ label: string; periodList: string[] }>
  getCellData: (periods: string[], key: string) => { actual: number | null; budget: number | null }
  editingKey: string | null
  setEditingKey: (k: string | null) => void
  pendingEdits: Record<string, string>
  setPendingEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>
}) {
  const allCols = [
    ...actualPeriods.map(p => ({ key: p, periodList: [p], isExtra: false })),
    ...extraCols.map(c => ({ key: c.label, periodList: c.periodList, isExtra: true })),
  ]

  const fmt = row.isPct
    ? (v: number) => `${v.toFixed(1)}%`
    : fmtC

  return (
    <tr className={cn(
      "border-b border-border/30 transition-colors group hover:bg-muted/10",
      row.isHighlight && "bg-primary/[0.02]",
    )}>
      {/* Metric label — sticky */}
      <td className={cn(
        "sticky left-0 z-10 px-4 py-2.5 text-xs border-r-2 border-border/60",
        row.isHighlight
          ? "bg-primary/5 font-bold text-foreground group-hover:bg-primary/10"
          : "bg-card text-muted-foreground group-hover:bg-muted/20",
        row.isDim && "opacity-60",
      )}>
        {row.label}
      </td>

      {allCols.map(col => {
        const ck = `${col.key}|${row.key}`
        const { actual, budget: dbBudget } = getCellData(col.periodList, row.key)
        const pendingVal   = pendingEdits[ck]
        const displayBudget = pendingVal !== undefined
          ? (parseBudgetInput(pendingVal) ?? dbBudget)
          : dbBudget
        const isEditing = editingKey === ck && !!row.isEditable && !col.isExtra

        // Variance
        let varDisplay: React.ReactNode = null
        if (actual !== null && displayBudget !== null && displayBudget !== 0) {
          if (row.isPct) {
            const diff = actual - displayBudget
            const isGood = row.goodDirection === 'down' ? diff <= 0 : diff >= 0
            varDisplay = (
              <span className={cn("text-[10px] font-semibold", isGood ? "text-emerald-500" : "text-destructive")}>
                {diff >= 0 ? '+' : ''}{diff.toFixed(1)}pp
              </span>
            )
          } else {
            const varPct = ((actual - displayBudget) / Math.abs(displayBudget)) * 100
            const isGood = row.goodDirection === 'down' ? varPct <= 0 : varPct >= 0
            varDisplay = (
              <span className={cn("text-[10px] font-semibold", isGood ? "text-emerald-500" : "text-destructive")}>
                {varPct >= 0 ? '+' : ''}{varPct.toFixed(1)}%
              </span>
            )
          }
        }

        return (
          <td key={col.key} className={cn(
            "px-3 py-2 text-center border-r border-border/30 last:border-r-0",
            col.isExtra && "bg-primary/[0.015]",
          )}>
            <div className="flex flex-col items-center gap-0.5">

              {/* Actual value */}
              <span className={cn(
                "text-xs",
                row.isHighlight ? "font-bold text-foreground" : "font-medium text-foreground/80",
                row.isDim && "text-muted-foreground",
                actual === null && "text-muted-foreground/30 italic text-[11px]",
              )}>
                {actual !== null ? fmt(actual) : '—'}
              </span>

              {/* Budget value — editable or computed */}
              {row.isEditable && !col.isExtra ? (
                isEditing ? (
                  <input
                    type="text"
                    autoFocus
                    placeholder="e.g. 3.5M"
                    className="w-20 text-center text-[11px] bg-primary/10 border border-primary/50 rounded px-1 py-0.5 outline-none focus:border-primary"
                    defaultValue={pendingVal ?? (dbBudget !== null ? String(Math.round(dbBudget)) : '')}
                    onBlur={e => {
                      const v = e.target.value.trim()
                      if (v) setPendingEdits(prev => ({ ...prev, [ck]: v }))
                      setEditingKey(null)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') { setEditingKey(null) }
                    }}
                  />
                ) : (
                  <button
                    onClick={() => setEditingKey(ck)}
                    className={cn(
                      "text-[11px] transition-colors flex items-center gap-0.5 group/btn",
                      pendingVal !== undefined
                        ? "text-primary font-semibold"
                        : "text-muted-foreground/60 hover:text-muted-foreground",
                    )}
                  >
                    {displayBudget !== null
                      ? fmt(displayBudget)
                      : <span className="italic text-[10px] opacity-40">budget</span>
                    }
                    <Pencil className="size-2.5 opacity-0 group-hover/btn:opacity-50 transition-opacity ml-0.5" />
                  </button>
                )
              ) : (displayBudget !== null && (row.isComputed || col.isExtra)) ? (
                <span className="text-[11px] text-muted-foreground/40">{fmt(displayBudget)}</span>
              ) : null}

              {/* Variance */}
              {varDisplay}
            </div>
          </td>
        )
      })}
    </tr>
  )
}
