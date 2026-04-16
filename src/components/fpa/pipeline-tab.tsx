'use client';

import * as React from "react"
import {
  Plus, Pencil, Trash2, Loader2, Building2, CalendarDays, DollarSign,
  TrendingUp, AlertCircle, CheckCircle2, ChevronRight,
  FlaskConical, Activity, FileCheck, ShieldCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { doc, setDoc, deleteDoc, collection } from "firebase/firestore"
import type { Firestore } from "firebase/firestore"
import type { User } from "firebase/auth"
import { UnitPipeline, PipelineStage, Company } from "@/lib/types"
import type { VerticalConfig, PipelineStageDef } from "@/lib/verticals"
import { cn } from "@/lib/utils"

// ─── Icon map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ReactNode> = {
  'building':    <Building2    className="size-3.5" />,
  'chevron':     <ChevronRight className="size-3.5" />,
  'calendar':    <CalendarDays className="size-3.5" />,
  'alert':       <AlertCircle  className="size-3.5" />,
  'trending':    <TrendingUp   className="size-3.5" />,
  'check':       <CheckCircle2 className="size-3.5" />,
  'flask':       <FlaskConical className="size-3.5" />,
  'activity':    <Activity     className="size-3.5" />,
  'file-check':  <FileCheck    className="size-3.5" />,
  'shield-check':<ShieldCheck  className="size-3.5" />,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCurrency(val: number): string {
  const abs = Math.abs(val)
  const sign = val < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`
  return `${sign}$${abs.toFixed(0)}`
}

function fmtDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function daysUntil(iso: string): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}

// ─── Blank form ───────────────────────────────────────────────────────────────

function blankForm(defaultStage: string): Omit<UnitPipeline, 'id' | 'companyId' | 'companyMembers' | 'createdAt' | 'updatedAt'> {
  return {
    unitName: '',
    market: '',
    stage: defaultStage as PipelineStage,
    expectedOpenDate: '',
    capexBudget: 0,
    capexDeployed: 0,
    auvUnderwrite: 0,
    ebitdaTargetPct: 15,
    notes: '',
  }
}

// ─── KPI stat ─────────────────────────────────────────────────────────────────

function KpiStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

// ─── Unit card ────────────────────────────────────────────────────────────────

function UnitCard({
  unit, stageMeta, vertical, onEdit, onDelete,
}: {
  unit: UnitPipeline
  stageMeta: PipelineStageDef
  vertical: VerticalConfig
  onEdit: (u: UnitPipeline) => void
  onDelete: (u: UnitPipeline) => void
}) {
  const labels  = vertical.pipelineLabels
  const days    = daysUntil(unit.expectedOpenDate)
  const spendPct = unit.capexBudget > 0
    ? Math.min(100, Math.round((unit.capexDeployed / unit.capexBudget) * 100))
    : 0
  const isCompleted = unit.stage === labels.completedStage

  return (
    <Card className={cn("border group hover:shadow-md transition-all", stageMeta.borderClass)}>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold text-sm text-foreground leading-tight">{unit.unitName}</p>
            <p className="text-[11px] text-muted-foreground">{unit.market}</p>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={() => onEdit(unit)}
              className="size-6 flex items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              onClick={() => onDelete(unit)}
              className="size-6 flex items-center justify-center rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Milestone date */}
        {unit.expectedOpenDate && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CalendarDays className="size-3" />
            <span>{isCompleted ? fmtDate(unit.expectedOpenDate) : `${fmtDate(unit.expectedOpenDate)}`}</span>
            {days !== null && days > 0 && !isCompleted && (
              <span className="text-primary font-semibold">({days}d)</span>
            )}
            {days !== null && days <= 0 && !isCompleted && (
              <span className="text-destructive font-semibold">(overdue)</span>
            )}
          </div>
        )}

        {/* Budget progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{labels.spendLabel}: {fmtCurrency(unit.capexDeployed)} / {fmtCurrency(unit.capexBudget)}</span>
            <span className="font-semibold">{spendPct}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", spendPct >= 90 ? "bg-amber-500" : "bg-primary")}
              style={{ width: `${spendPct}%` }}
            />
          </div>
        </div>

        {/* Value + return */}
        <div className="flex justify-between text-[11px]">
          <div>
            <p className="text-[10px] text-muted-foreground">{labels.valueLabel}</p>
            <p className="font-bold">{fmtCurrency(unit.auvUnderwrite)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">{labels.returnLabel}</p>
            <p className="font-bold text-emerald-500">{unit.ebitdaTargetPct}%</p>
          </div>
        </div>

        {unit.notes ? (
          <p className="text-[10px] text-muted-foreground italic border-t border-border/50 pt-2 line-clamp-2">
            {unit.notes}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ─── Stage progress bar (biotech only) ───────────────────────────────────────

function ClinicalFunnel({ units, stages }: { units: UnitPipeline[]; stages: PipelineStageDef[] }) {
  return (
    <div className="flex items-end gap-1.5 w-full">
      {stages.map((stage, i) => {
        const count = units.filter(u => u.stage === stage.name).length
        const isLast = i === stages.length - 1
        return (
          <React.Fragment key={stage.name}>
            <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
              <div
                className={cn("w-full rounded-t-md flex items-end justify-center pb-1 transition-all", stage.bgClass, "border", stage.borderClass)}
                style={{ height: `${Math.max(28, 28 + count * 18)}px` }}
              >
                <span className="text-xs font-bold" style={{ color: stage.color }}>{count}</span>
              </div>
              <div className="flex items-center gap-1">
                <span style={{ color: stage.color }}>{ICON_MAP[stage.iconKey]}</span>
                <p className="text-[9px] font-semibold uppercase tracking-tight text-muted-foreground truncate">{stage.name}</p>
              </div>
            </div>
            {!isLast && <ChevronRight className="size-3 text-muted-foreground/40 shrink-0 mb-7" />}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface PipelineTabProps {
  units: UnitPipeline[]
  companies: Company[]
  user: User | null
  firestore: Firestore | null
  vertical: VerticalConfig
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PipelineTab({ units, companies, user, firestore, vertical }: PipelineTabProps) {
  const stages = vertical.pipelineStages
  const labels = vertical.pipelineLabels
  const isBiotech = vertical.id === 'biotech'

  const stageMap = React.useMemo(() => {
    const m = new Map<string, PipelineStageDef>()
    for (const s of stages) m.set(s.name, s)
    return m
  }, [stages])

  const [view, setView] = React.useState<'kanban' | 'table'>('kanban')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<UnitPipeline | null>(null)
  const [form, setForm] = React.useState(() => blankForm(stages[0]?.name ?? ''))
  const [isSaving, setIsSaving] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<UnitPipeline | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

  function openAdd() {
    setEditTarget(null)
    setForm(blankForm(stages[0]?.name ?? ''))
    setDialogOpen(true)
  }

  function openEdit(u: UnitPipeline) {
    setEditTarget(u)
    setForm({
      unitName: u.unitName,
      market: u.market,
      stage: u.stage,
      expectedOpenDate: u.expectedOpenDate,
      capexBudget: u.capexBudget,
      capexDeployed: u.capexDeployed,
      auvUnderwrite: u.auvUnderwrite,
      ebitdaTargetPct: u.ebitdaTargetPct,
      notes: u.notes ?? '',
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!firestore || !user || !companies?.[0]) return
    setIsSaving(true)
    const company = companies[0]
    const id = editTarget?.id ?? doc(collection(firestore, 'unit_pipeline')).id
    const now = new Date().toISOString()
    const data: UnitPipeline = {
      id,
      companyId: company.id,
      unitName: form.unitName.trim(),
      market: form.market.trim(),
      stage: form.stage,
      expectedOpenDate: form.expectedOpenDate,
      capexBudget: Number(form.capexBudget) || 0,
      capexDeployed: Number(form.capexDeployed) || 0,
      auvUnderwrite: Number(form.auvUnderwrite) || 0,
      ebitdaTargetPct: Number(form.ebitdaTargetPct) || 0,
      notes: form.notes?.trim() || '',
      companyMembers: company.members,
      createdAt: editTarget?.createdAt ?? now,
      updatedAt: now,
    }
    await setDoc(doc(firestore, 'unit_pipeline', id), data, { merge: true })
    setIsSaving(false)
    setDialogOpen(false)
  }

  async function handleDelete() {
    if (!firestore || !deleteTarget) return
    setIsDeleting(true)
    await deleteDoc(doc(firestore, 'unit_pipeline', deleteTarget.id))
    setIsDeleting(false)
    setDeleteTarget(null)
  }

  // ── Portfolio KPIs ──
  const totalBudget     = units.reduce((s, u) => s + u.capexBudget,    0)
  const totalSpend      = units.reduce((s, u) => s + u.capexDeployed,  0)
  const totalRemaining  = totalBudget - totalSpend
  const completedUnits  = units.filter(u => u.stage === labels.completedStage).length
  const activeUnits     = units.length - completedUnits
  const totalValue      = units.reduce((s, u) => s + u.auvUnderwrite, 0)
  // For biotech: avg PoS across non-approved; for others: projected EBITDA sum
  const portfolioReturn = isBiotech
    ? (units.length > 0 ? units.reduce((s, u) => s + u.ebitdaTargetPct, 0) / units.length : 0)
    : units.reduce((s, u) => s + u.auvUnderwrite * (u.ebitdaTargetPct / 100), 0)

  const byStage = React.useMemo(() => {
    const map = new Map<string, UnitPipeline[]>()
    for (const s of stages) map.set(s.name, [])
    for (const u of units) {
      const key = u.stage as string
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(u)
    }
    return map
  }, [units, stages])

  const fallbackMeta: PipelineStageDef = {
    name: '', color: '#94a3b8',
    bgClass: 'bg-slate-500/10', borderClass: 'border-slate-500/30', iconKey: 'building',
  }

  return (
    <div className="space-y-6">

      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1">
          {(['kanban', 'table'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "px-3 py-1.5 rounded text-xs font-semibold border transition-all",
                view === v
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {v === 'kanban' ? 'Kanban' : 'Table'}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={openAdd} className="h-9 gap-2">
          <Plus className="size-4" />
          Add {vertical.unitLabel}
        </Button>
      </div>

      {/* Portfolio summary */}
      <Card className="bg-card/30 border-border">
        <CardContent className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
          <KpiStat
            label="In Pipeline"
            value={String(activeUnits)}
            sub={`${completedUnits} ${labels.completedStage.toLowerCase()}`}
          />
          <KpiStat label={`Total ${labels.budgetLabel}`} value={fmtCurrency(totalBudget)} />
          <KpiStat
            label={labels.spendLabel}
            value={fmtCurrency(totalSpend)}
            sub={`${totalBudget > 0 ? Math.round((totalSpend / totalBudget) * 100) : 0}% of budget`}
          />
          <KpiStat label="Budget Remaining" value={fmtCurrency(totalRemaining)} />
          <KpiStat
            label={`Portfolio ${labels.valueLabel}`}
            value={fmtCurrency(totalValue)}
            sub={labels.valueSub}
          />
          <KpiStat
            label={labels.returnAggLabel}
            value={isBiotech ? `${portfolioReturn.toFixed(0)}%` : fmtCurrency(portfolioReturn)}
            sub={isBiotech ? 'portfolio average' : labels.valueSub}
          />
        </CardContent>
      </Card>

      {/* Biotech funnel view (above kanban) */}
      {isBiotech && units.length > 0 && (
        <Card className="bg-card/30 border-border">
          <CardContent className="p-5 space-y-3">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Clinical Pipeline</p>
            <ClinicalFunnel units={units} stages={stages} />
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {units.length === 0 && (
        <div className="text-center py-24 border-2 border-dashed border-border rounded-xl">
          <Building2 className="mx-auto size-12 text-muted-foreground opacity-20 mb-4" />
          <p className="text-muted-foreground italic">No {vertical.unitsLabel.toLowerCase()} in the pipeline yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add your first {vertical.unitLabel.toLowerCase()} to start tracking progress.
          </p>
          <Button size="sm" onClick={openAdd} className="mt-4 gap-2">
            <Plus className="size-4" /> Add {vertical.unitLabel}
          </Button>
        </div>
      )}

      {/* ── Kanban view ── */}
      {units.length > 0 && view === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map(stage => {
            const cards = byStage.get(stage.name) ?? []
            return (
              <div key={stage.name} className="flex flex-col gap-3 min-w-[220px] w-[220px] shrink-0">
                <div className={cn("rounded-lg px-3 py-2 flex items-center gap-2 border", stage.bgClass, stage.borderClass)}>
                  <span style={{ color: stage.color }}>{ICON_MAP[stage.iconKey]}</span>
                  <span className="text-xs font-bold" style={{ color: stage.color }}>{stage.name}</span>
                  <span className="ml-auto text-[10px] font-bold text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                    {cards.length}
                  </span>
                </div>
                {cards.map(u => (
                  <UnitCard
                    key={u.id}
                    unit={u}
                    stageMeta={stageMap.get(u.stage as string) ?? fallbackMeta}
                    vertical={vertical}
                    onEdit={openEdit}
                    onDelete={u => setDeleteTarget(u)}
                  />
                ))}
                {cards.length === 0 && (
                  <div className="border-2 border-dashed border-border/40 rounded-lg p-4 text-center">
                    <p className="text-[10px] text-muted-foreground/50 italic">No {vertical.unitsLabel.toLowerCase()}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Table view ── */}
      {units.length > 0 && view === 'table' && (
        <Card className="bg-card/30 border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {[
                    labels.unitNameLabel,
                    labels.marketLabel,
                    'Stage',
                    labels.milestoneLabel,
                    labels.budgetLabel,
                    labels.spendLabel,
                    labels.valueLabel,
                    labels.returnLabel,
                    '',
                  ].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {units.map(u => {
                  const meta = stageMap.get(u.stage as string) ?? fallbackMeta
                  return (
                    <tr key={u.id} className="hover:bg-muted/20 transition-colors group">
                      <td className="px-4 py-3 font-medium">{u.unitName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.market}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border", meta.bgClass, meta.borderClass)}
                          style={{ color: meta.color }}
                        >
                          {ICON_MAP[meta.iconKey]} {u.stage}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(u.expectedOpenDate)}</td>
                      <td className="px-4 py-3">{fmtCurrency(u.capexBudget)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${u.capexBudget > 0 ? Math.min(100, (u.capexDeployed / u.capexBudget) * 100) : 0}%` }}
                            />
                          </div>
                          <span className="text-xs">{fmtCurrency(u.capexDeployed)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium">{fmtCurrency(u.auvUnderwrite)}</td>
                      <td className="px-4 py-3 font-medium text-emerald-500">
                        {u.ebitdaTargetPct}%
                        {!isBiotech && (
                          <span className="text-[10px] text-muted-foreground ml-1">
                            ({fmtCurrency(u.auvUnderwrite * (u.ebitdaTargetPct / 100))})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(u)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTarget(u)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>

              {units.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/40">
                    <td className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground" colSpan={4}>
                      Portfolio Total
                    </td>
                    <td className="px-4 py-3 font-bold">{fmtCurrency(totalBudget)}</td>
                    <td className="px-4 py-3 font-bold">{fmtCurrency(totalSpend)}</td>
                    <td className="px-4 py-3 font-bold">{fmtCurrency(totalValue)}</td>
                    <td className="px-4 py-3 font-bold text-emerald-500">
                      {isBiotech
                        ? `${portfolioReturn.toFixed(0)}% avg`
                        : fmtCurrency(portfolioReturn)
                      }
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}

      {/* ── Add / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? `Edit — ${editTarget.unitName}` : `New ${vertical.unitLabel}`}</DialogTitle>
            <DialogDescription>
              Track this {vertical.unitLabel.toLowerCase()} through its development pipeline.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name + Market/Indication */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{labels.unitNameLabel}</Label>
                <Input
                  value={form.unitName}
                  onChange={e => setForm(f => ({ ...f, unitName: e.target.value }))}
                  placeholder={labels.unitNamePlaceholder}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{labels.marketLabel}</Label>
                <Input
                  value={form.market}
                  onChange={e => setForm(f => ({ ...f, market: e.target.value }))}
                  placeholder={labels.marketPlaceholder}
                  className="h-9"
                />
              </div>
            </div>

            {/* Stage + Milestone date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Stage</Label>
                <Select value={form.stage} onValueChange={v => setForm(f => ({ ...f, stage: v as PipelineStage }))}>
                  <SelectTrigger className="h-9 bg-muted border-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map(s => (
                      <SelectItem key={s.name} value={s.name}>
                        <span className="flex items-center gap-2">
                          <span style={{ color: s.color }}>{ICON_MAP[s.iconKey]}</span>
                          {s.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{labels.milestoneLabel}</Label>
                <Input
                  type="date"
                  value={form.expectedOpenDate}
                  onChange={e => setForm(f => ({ ...f, expectedOpenDate: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>

            {/* Budget / Spend */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-widest">Budget</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{labels.budgetLabel} ($)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input
                      type="number"
                      value={form.capexBudget || ''}
                      onChange={e => setForm(f => ({ ...f, capexBudget: parseFloat(e.target.value) || 0 }))}
                      className="h-9 pl-7"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{labels.spendLabel} ($)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input
                      type="number"
                      value={form.capexDeployed || ''}
                      onChange={e => setForm(f => ({ ...f, capexDeployed: parseFloat(e.target.value) || 0 }))}
                      className="h-9 pl-7"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Value + Return */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-widest">Projections</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{labels.valueLabel} ($)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input
                      type="number"
                      value={form.auvUnderwrite || ''}
                      onChange={e => setForm(f => ({ ...f, auvUnderwrite: parseFloat(e.target.value) || 0 }))}
                      className="h-9 pl-7"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{labels.returnLabel}</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={form.ebitdaTargetPct || ''}
                      onChange={e => setForm(f => ({ ...f, ebitdaTargetPct: parseFloat(e.target.value) || 0 }))}
                      className="h-9 pr-6"
                      placeholder={isBiotech ? "25" : "15"}
                      step={0.5}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                  </div>
                </div>
              </div>
              {form.auvUnderwrite > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {isBiotech
                    ? <>PoS-adjusted value: <span className="text-emerald-500 font-bold">{fmtCurrency(form.auvUnderwrite * (form.ebitdaTargetPct / 100))} / yr</span></>
                    : <>Projected EBITDA at maturity: <span className="text-emerald-500 font-bold">{fmtCurrency(form.auvUnderwrite * (form.ebitdaTargetPct / 100))} / yr</span></>
                  }
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={form.notes ?? ''}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder={labels.notesPlaceholder}
                className="resize-none text-sm h-20"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving || !form.unitName.trim()} className="gap-2">
              {isSaving && <Loader2 className="size-4 animate-spin" />}
              {editTarget ? 'Save Changes' : `Add ${vertical.unitLabel}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.unitName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this {vertical.unitLabel.toLowerCase()} from the pipeline. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
