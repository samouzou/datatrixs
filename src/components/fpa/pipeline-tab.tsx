'use client';

import * as React from "react"
import {
  Plus, Pencil, Trash2, Loader2, Building2, CalendarDays, DollarSign,
  TrendingUp, AlertCircle, CheckCircle2, ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card"
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
import type { VerticalConfig } from "@/lib/verticals"
import { cn } from "@/lib/utils"

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGES: PipelineStage[] = [
  'Site Identified',
  'LOI Signed',
  'Lease Executed',
  'Under Construction',
  'Pre-Opening',
  'Open',
]

const STAGE_META: Record<PipelineStage, { color: string; bgClass: string; borderClass: string; icon: React.ReactNode }> = {
  'Site Identified':    { color: '#94a3b8', bgClass: 'bg-slate-500/10',  borderClass: 'border-slate-500/30',  icon: <Building2 className="size-3.5" /> },
  'LOI Signed':         { color: '#a78bfa', bgClass: 'bg-violet-500/10', borderClass: 'border-violet-500/30', icon: <ChevronRight className="size-3.5" /> },
  'Lease Executed':     { color: '#60a5fa', bgClass: 'bg-blue-500/10',   borderClass: 'border-blue-500/30',   icon: <CalendarDays className="size-3.5" /> },
  'Under Construction': { color: '#fb923c', bgClass: 'bg-orange-500/10', borderClass: 'border-orange-500/30', icon: <AlertCircle className="size-3.5" /> },
  'Pre-Opening':        { color: '#facc15', bgClass: 'bg-yellow-500/10', borderClass: 'border-yellow-500/30', icon: <TrendingUp className="size-3.5" /> },
  'Open':               { color: '#4ade80', bgClass: 'bg-emerald-500/10',borderClass: 'border-emerald-500/30',icon: <CheckCircle2 className="size-3.5" /> },
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
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function daysUntilOpen(iso: string): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}

// ─── Blank unit form ──────────────────────────────────────────────────────────

function blankForm(): Omit<UnitPipeline, 'id' | 'companyId' | 'companyMembers' | 'createdAt' | 'updatedAt'> {
  return {
    unitName: '',
    market: '',
    stage: 'Site Identified',
    expectedOpenDate: '',
    capexBudget: 0,
    capexDeployed: 0,
    auvUnderwrite: 0,
    ebitdaTargetPct: 15,
    notes: '',
  }
}

// ─── KPI summary card ─────────────────────────────────────────────────────────

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
  unit, onEdit, onDelete,
}: {
  unit: UnitPipeline
  onEdit: (u: UnitPipeline) => void
  onDelete: (u: UnitPipeline) => void
}) {
  const meta   = STAGE_META[unit.stage]
  const days   = daysUntilOpen(unit.expectedOpenDate)
  const capexPct = unit.capexBudget > 0
    ? Math.min(100, Math.round((unit.capexDeployed / unit.capexBudget) * 100))
    : 0
  const projEbitda = unit.auvUnderwrite * (unit.ebitdaTargetPct / 100)

  return (
    <Card className={cn("border group hover:shadow-md transition-all", meta.borderClass)}>
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

        {/* Open date */}
        {unit.expectedOpenDate && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CalendarDays className="size-3" />
            <span>Opens {fmtDate(unit.expectedOpenDate)}</span>
            {days !== null && days > 0 && (
              <span className="text-primary font-semibold">({days}d)</span>
            )}
            {days !== null && days <= 0 && unit.stage !== 'Open' && (
              <span className="text-destructive font-semibold">(overdue)</span>
            )}
          </div>
        )}

        {/* CapEx progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>CapEx: {fmtCurrency(unit.capexDeployed)} / {fmtCurrency(unit.capexBudget)}</span>
            <span className="font-semibold">{capexPct}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", capexPct >= 90 ? "bg-amber-500" : "bg-primary")}
              style={{ width: `${capexPct}%` }}
            />
          </div>
        </div>

        {/* AUV + EBITDA */}
        <div className="flex justify-between text-[11px]">
          <div>
            <p className="text-[10px] text-muted-foreground">AUV Underwrite</p>
            <p className="font-bold">{fmtCurrency(unit.auvUnderwrite)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Proj. EBITDA</p>
            <p className="font-bold text-emerald-500">{fmtCurrency(projEbitda)} ({unit.ebitdaTargetPct}%)</p>
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

  const [view, setView] = React.useState<'kanban' | 'table'>('kanban')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<UnitPipeline | null>(null)
  const [form, setForm] = React.useState(blankForm())
  const [isSaving, setIsSaving] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<UnitPipeline | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

  function openAdd() {
    setEditTarget(null)
    setForm(blankForm())
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
  const totalCapexBudget   = units.reduce((s, u) => s + u.capexBudget, 0)
  const totalCapexDeployed = units.reduce((s, u) => s + u.capexDeployed, 0)
  const totalCapexRemaining = totalCapexBudget - totalCapexDeployed
  const activeUnits   = units.filter(u => u.stage !== 'Open').length
  const openUnits     = units.filter(u => u.stage === 'Open').length
  const projAuv       = units.reduce((s, u) => s + u.auvUnderwrite, 0)
  const projEbitda    = units.reduce((s, u) => s + u.auvUnderwrite * (u.ebitdaTargetPct / 100), 0)

  // Group by stage for kanban
  const byStage = React.useMemo(() => {
    const map = new Map<PipelineStage, UnitPipeline[]>()
    for (const stage of STAGES) map.set(stage, [])
    for (const u of units) map.get(u.stage)?.push(u)
    return map
  }, [units])

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
          <KpiStat label="In Pipeline" value={String(activeUnits)} sub={`${openUnits} open`} />
          <KpiStat label="Total CapEx Budget" value={fmtCurrency(totalCapexBudget)} />
          <KpiStat label="CapEx Deployed" value={fmtCurrency(totalCapexDeployed)} sub={`${totalCapexBudget > 0 ? Math.round((totalCapexDeployed / totalCapexBudget) * 100) : 0}% of budget`} />
          <KpiStat label="CapEx Remaining" value={fmtCurrency(totalCapexRemaining)} />
          <KpiStat label="Projected AUV" value={fmtCurrency(projAuv)} sub="at portfolio maturity" />
          <KpiStat label="Projected EBITDA" value={fmtCurrency(projEbitda)} sub="at portfolio maturity" />
        </CardContent>
      </Card>

      {/* Empty state */}
      {units.length === 0 && (
        <div className="text-center py-24 border-2 border-dashed border-border rounded-xl">
          <Building2 className="mx-auto size-12 text-muted-foreground opacity-20 mb-4" />
          <p className="text-muted-foreground italic">No {vertical.unitsLabel.toLowerCase()} in the pipeline yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Add your first unit to start tracking development progress.</p>
          <Button size="sm" onClick={openAdd} className="mt-4 gap-2">
            <Plus className="size-4" /> Add {vertical.unitLabel}
          </Button>
        </div>
      )}

      {/* ── Kanban view ── */}
      {units.length > 0 && view === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map(stage => {
            const meta  = STAGE_META[stage]
            const cards = byStage.get(stage) ?? []
            return (
              <div key={stage} className="flex flex-col gap-3 min-w-[220px] w-[220px] shrink-0">
                {/* Column header */}
                <div className={cn("rounded-lg px-3 py-2 flex items-center gap-2 border", meta.bgClass, meta.borderClass)}>
                  <span style={{ color: meta.color }}>{meta.icon}</span>
                  <span className="text-xs font-bold" style={{ color: meta.color }}>{stage}</span>
                  <span className="ml-auto text-[10px] font-bold text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                    {cards.length}
                  </span>
                </div>
                {/* Cards */}
                {cards.map(u => (
                  <UnitCard key={u.id} unit={u} onEdit={openEdit} onDelete={u => setDeleteTarget(u)} />
                ))}
                {cards.length === 0 && (
                  <div className="border-2 border-dashed border-border/40 rounded-lg p-4 text-center">
                    <p className="text-[10px] text-muted-foreground/50 italic">No units</p>
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
                  {['Unit Name', 'Market', 'Stage', 'Open Date', 'CapEx Budget', 'Deployed', 'AUV', 'Proj. EBITDA', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {units.map(u => {
                  const meta = STAGE_META[u.stage]
                  return (
                    <tr key={u.id} className="hover:bg-muted/20 transition-colors group">
                      <td className="px-4 py-3 font-medium">{u.unitName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.market}</td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border", meta.bgClass, meta.borderClass)}
                          style={{ color: meta.color }}>
                          {meta.icon} {u.stage}
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
                        {fmtCurrency(u.auvUnderwrite * (u.ebitdaTargetPct / 100))}
                        <span className="text-[10px] text-muted-foreground ml-1">({u.ebitdaTargetPct}%)</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(u)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteTarget(u)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>

              {/* Footer totals */}
              {units.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/40">
                    <td className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground" colSpan={4}>
                      Portfolio Total
                    </td>
                    <td className="px-4 py-3 font-bold">{fmtCurrency(totalCapexBudget)}</td>
                    <td className="px-4 py-3 font-bold">{fmtCurrency(totalCapexDeployed)}</td>
                    <td className="px-4 py-3 font-bold">{fmtCurrency(projAuv)}</td>
                    <td className="px-4 py-3 font-bold text-emerald-500">{fmtCurrency(projEbitda)}</td>
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
              Track this unit through its development pipeline.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name + Market */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Unit Name</Label>
                <Input
                  value={form.unitName}
                  onChange={e => setForm(f => ({ ...f, unitName: e.target.value }))}
                  placeholder="e.g. Austin – Domain"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Market / City</Label>
                <Input
                  value={form.market}
                  onChange={e => setForm(f => ({ ...f, market: e.target.value }))}
                  placeholder="e.g. Austin, TX"
                  className="h-9"
                />
              </div>
            </div>

            {/* Stage + Open Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Stage</Label>
                <Select value={form.stage} onValueChange={v => setForm(f => ({ ...f, stage: v as PipelineStage }))}>
                  <SelectTrigger className="h-9 bg-muted border-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map(s => (
                      <SelectItem key={s} value={s}>
                        <span className="flex items-center gap-2">
                          <span style={{ color: STAGE_META[s].color }}>{STAGE_META[s].icon}</span>
                          {s}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Expected Open Date</Label>
                <Input
                  type="date"
                  value={form.expectedOpenDate}
                  onChange={e => setForm(f => ({ ...f, expectedOpenDate: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>

            {/* CapEx */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-widest">CapEx</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Budget ($)</Label>
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
                  <Label className="text-xs">Deployed ($)</Label>
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

            {/* Underwriting */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-widest">Underwriting</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">AUV Underwrite ($)</Label>
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
                  <Label className="text-xs">Target EBITDA %</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={form.ebitdaTargetPct || ''}
                      onChange={e => setForm(f => ({ ...f, ebitdaTargetPct: parseFloat(e.target.value) || 0 }))}
                      className="h-9 pr-6"
                      placeholder="15"
                      step={0.5}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                  </div>
                </div>
              </div>
              {form.auvUnderwrite > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Projected EBITDA at maturity:{' '}
                  <span className="text-emerald-500 font-bold">
                    {fmtCurrency(form.auvUnderwrite * (form.ebitdaTargetPct / 100))} / yr
                  </span>
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={form.notes ?? ''}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Landlord contacts, co-tenancy requirements, timeline risks…"
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
              This will permanently remove this unit from the pipeline. This cannot be undone.
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
