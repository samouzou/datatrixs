'use client'

import * as React from "react"
import {
  FileText, Presentation, GitCompare, Briefcase, Sparkles,
  Loader2, Save, ChevronLeft, Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useVertical } from "@/contexts/vertical-context"
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase"
import { collection, where, query, addDoc } from "firebase/firestore"
import type { FinancialRecord, Company } from "@/lib/types"
import type { ReportTemplate, ReportDocumentData } from "@/lib/report-types"
import { TEMPLATE_META } from "@/lib/report-types"
import { aiReportDocumentGeneration } from "@/ai/flows/ai-report-document-generation"
import { ReportDocument } from "@/components/analyst/report-document"

// ─── Template icon map ────────────────────────────────────────────────────────

const TEMPLATE_ICONS: Record<ReportTemplate, React.ReactNode> = {
  mda: <FileText className="size-5" />,
  board_update: <Presentation className="size-5" />,
  variance: <GitCompare className="size-5" />,
  ic_memo: <Briefcase className="size-5" />,
  custom: <Sparkles className="size-5" />,
}

const TEMPLATE_ORDER: ReportTemplate[] = ['mda', 'board_update', 'variance', 'ic_memo', 'custom']

// ─── Financial summary builder ────────────────────────────────────────────────

function buildFinancialSummary(records: FinancialRecord[]): string {
  const periods = [...new Set(records.map(r => r.period))].sort((a, b) => {
    const norm = (p: string) => {
      const m = p.match(/^(\d{4})-Q(\d)$/)
      return m ? `${m[1]}-${String(parseInt(m[2]) * 3).padStart(2, '0')}` : p
    }
    return norm(a).localeCompare(norm(b))
  })

  const metrics = [...new Set(records.map(r => r.metric))]
  const locations = [...new Set(records.map(r => r.locationName))]

  type Row = { period: string; metric: string; total: number; byLocation: Record<string, number> }
  const rows: Row[] = []

  for (const period of periods) {
    for (const metric of metrics) {
      const subset = records.filter(r => r.period === period && r.metric === metric)
      if (subset.length === 0) continue
      const total = subset.reduce((s, r) => s + r.value, 0)
      const byLocation: Record<string, number> = {}
      for (const r of subset) {
        byLocation[r.locationName] = (byLocation[r.locationName] ?? 0) + r.value
      }
      rows.push({ period, metric, total, byLocation })
    }
  }

  const summary = {
    periods,
    metrics,
    locations,
    totals: rows.map(r => ({
      period: r.period,
      metric: r.metric,
      total: Math.round(r.total),
      byLocation: Object.fromEntries(
        Object.entries(r.byLocation).map(([k, v]) => [k, Math.round(v)])
      ),
    })),
  }

  return JSON.stringify(summary)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReportBuilder() {
  const vertical = useVertical()
  const { user } = useUser()
  const firestore = useFirestore()

  const [template, setTemplate] = React.useState<ReportTemplate | null>(null)
  const [customPrompt, setCustomPrompt] = React.useState('')
  const [generating, setGenerating] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [document, setDocument] = React.useState<ReportDocumentData | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // Load records
  const recordsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null
    return query(
      collection(firestore, "financial_records"),
      where(`companyMembers.${user.uid}`, "in", ["admin", "member", true])
    )
  }, [firestore, user?.uid])
  const { data: records } = useCollection<FinancialRecord>(recordsQuery)

  // Load company
  const companiesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null
    return query(
      collection(firestore, "companies"),
      where(`members.${user.uid}`, "in", ["admin", "member", true])
    )
  }, [firestore, user?.uid])
  const { data: companies } = useCollection<Company>(companiesQuery)

  const company = companies?.[0]

  async function handleGenerate() {
    if (!template || !records?.length) return
    setGenerating(true)
    setError(null)
    setDocument(null)
    setSaved(false)

    try {
      const financialSummary = buildFinancialSummary(records)
      const periods = [...new Set(records.map(r => r.period))].sort()
      const context = [
        `Company: ${company?.companyName ?? 'Unknown Company'}`,
        `Industry: ${vertical.label}`,
        `Unit type: ${vertical.unitsLabel}`,
        `Periods covered: ${periods[0]} to ${periods[periods.length - 1]} (${periods.length} periods)`,
        `Number of ${vertical.unitsLabel.toLowerCase()}: ${[...new Set(records.map(r => r.locationName))].length}`,
        `Today's date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      ].join('\n')

      const result = await aiReportDocumentGeneration({
        template,
        customPrompt: customPrompt || undefined,
        financialSummary,
        context,
      })

      setDocument({
        ...result,
        template,
        generatedAt: new Date().toISOString(),
        prompt: customPrompt || undefined,
      })
    } catch (e) {
      setError('Generation failed. Please try again.')
      console.error(e)
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    if (!document || !firestore || !user || !company) return
    setSaving(true)
    try {
      const membership = company.members as Record<string, string>
      await addDoc(collection(firestore, 'report_documents'), {
        userId: user.uid,
        companyId: company.id,
        companyMembers: membership,
        title: document.title,
        subtitle: document.subtitle ?? null,
        template: document.template,
        prompt: document.prompt ?? null,
        sections: JSON.stringify(document.sections),
        generatedAt: document.generatedAt,
        createdAt: new Date().toISOString(),
      })
      setSaved(true)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  // ── Document view ────────────────────────────────────────────────────────────
  if (document) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => { setDocument(null); setSaved(false) }}
          >
            <ChevronLeft className="size-4" /> New Report
          </Button>
          <Button
            size="sm"
            variant={saved ? "secondary" : "default"}
            className="gap-1.5"
            onClick={handleSave}
            disabled={saving || saved}
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : saved ? (
              <Check className="size-3.5" />
            ) : (
              <Save className="size-3.5" />
            )}
            {saved ? 'Saved to Library' : 'Save to Library'}
          </Button>
        </div>
        <ReportDocument document={document} records={records ?? []} />
      </div>
    )
  }

  // ── Builder view ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 max-w-3xl">
      {/* Template picker */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Choose a template</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TEMPLATE_ORDER.map(t => {
            const meta = TEMPLATE_META[t]
            const isSelected = template === t
            return (
              <button
                key={t}
                onClick={() => setTemplate(t)}
                className={cn(
                  "text-left p-4 rounded-xl border transition-all",
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border bg-card/30 hover:border-primary/40 hover:bg-card/60"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "mt-0.5 shrink-0 rounded-lg p-1.5",
                    isSelected ? "text-primary bg-primary/10" : "text-muted-foreground bg-muted"
                  )}>
                    {TEMPLATE_ICONS[t]}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-foreground">{meta.label}</span>
                      {isSelected && <Badge className="text-[10px] px-1.5 py-0 h-4 bg-primary/20 text-primary border-none">Selected</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{meta.description}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {meta.sections.map(s => (
                        <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{s}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Custom prompt */}
      {template && (
        <div className="space-y-2 animate-in fade-in duration-200">
          <h3 className="text-sm font-semibold text-foreground">
            {template === 'custom' ? 'Describe the report you want' : 'Additional instructions (optional)'}
          </h3>
          <Textarea
            placeholder={
              template === 'custom'
                ? "E.g. 'Create a one-page cash flow summary with a focus on burn rate and runway...'"
                : "Add any specific focus areas, notes, or context Warren should include..."
            }
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
            className="min-h-[100px] bg-card/40 border-border text-sm resize-none focus-visible:ring-primary"
          />
        </div>
      )}

      {/* Data summary */}
      {records && records.length > 0 && (
        <div className="rounded-lg bg-muted/30 border border-border p-4 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground text-sm mb-2">Data available</p>
          <p>{[...new Set(records.map(r => r.period))].length} periods · {[...new Set(records.map(r => r.locationName))].length} {vertical.unitsLabel.toLowerCase()} · {[...new Set(records.map(r => r.metric))].length} metrics</p>
          <p>
            {(() => {
              const periods = [...new Set(records.map(r => r.period))].sort()
              return `${periods[0]} → ${periods[periods.length - 1]}`
            })()}
          </p>
        </div>
      )}

      {!records?.length && (
        <p className="text-xs text-muted-foreground italic">No financial records found — upload data first to generate a report.</p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button
        onClick={handleGenerate}
        disabled={!template || generating || !records?.length || (template === 'custom' && !customPrompt.trim())}
        className="gap-2"
        size="default"
      >
        {generating ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Warren is building your report…
          </>
        ) : (
          <>
            <Sparkles className="size-4" />
            Generate Report
          </>
        )}
      </Button>
    </div>
  )
}
