'use client';

import * as React from "react"
import { Upload, FileText, AlertTriangle, CheckCircle2, Loader2, X, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { doc, writeBatch } from "firebase/firestore"
import type { Firestore } from "firebase/firestore"
import type { User } from "firebase/auth"
import type { Company } from "@/lib/types"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type LocationMeta = { id: string; name: string }

type ColumnMapping = {
  location: string   // CSV column name mapped to location
  period: string     // CSV column name mapped to period
  metric: string     // CSV column name mapped to metric
  value: string      // CSV column name mapped to value
}

type ParsedRow = {
  location: string
  period: string
  metric: string
  value: number
  matched: boolean   // whether location was matched to a known location
  locationId?: string
  locationName?: string
}

type Step = 'upload' | 'map' | 'preview' | 'done'

// ─── CSV parsing ──────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (!lines.length) return { headers: [], rows: [] }

  function splitLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = splitLine(lines[0]).filter(h => h.length > 0)
  const rows = lines.slice(1).map(splitLine)
  return { headers, rows }
}

// Guess which column maps to which field based on common header names
function guessMapping(headers: string[]): Partial<ColumnMapping> {
  const lower = headers.map(h => h.toLowerCase())
  function find(...keywords: string[]): string {
    for (const kw of keywords) {
      const idx = lower.findIndex(h => h.includes(kw))
      if (idx !== -1) return headers[idx]
    }
    return ''
  }
  return {
    location: find('location', 'store', 'unit', 'product line', 'site', 'branch', 'entity'),
    period:   find('period', 'month', 'quarter', 'date', 'year'),
    metric:   find('metric', 'account', 'category', 'type', 'line item', 'description'),
    value:    find('value', 'amount', 'actual', 'revenue', 'total', 'balance'),
  }
}

function parseValue(raw: string): number {
  if (!raw) return NaN
  // Remove $, commas, parentheses (accounting negative notation)
  const cleaned = raw.replace(/[$,\s]/g, '').replace(/\(([^)]+)\)/, '-$1')
  return parseFloat(cleaned)
}

// ─── Step components ──────────────────────────────────────────────────────────

function DropZone({ onFile }: { onFile: (file: File) => void }) {
  const [isDragging, setIsDragging] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-4 cursor-pointer transition-colors",
        isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/30"
      )}
    >
      <Upload className={cn("size-10", isDragging ? "text-primary" : "text-muted-foreground opacity-40")} />
      <div className="text-center">
        <p className="text-sm font-semibold text-foreground">Drop your CSV here</p>
        <p className="text-xs text-muted-foreground mt-1">or click to browse · .csv files only</p>
      </div>
      <div className="bg-muted/50 rounded-lg px-4 py-3 text-xs text-muted-foreground space-y-1 w-full max-w-sm">
        <p className="font-semibold text-foreground mb-1">Expected columns (any order):</p>
        <p>• <span className="font-mono">Location</span> — location / store / product line name</p>
        <p>• <span className="font-mono">Period</span> — e.g. <span className="font-mono">2025-03</span> or <span className="font-mono">2025-Q1</span></p>
        <p>• <span className="font-mono">Metric</span> — e.g. <span className="font-mono">Revenue</span>, <span className="font-mono">COGS</span></p>
        <p>• <span className="font-mono">Value</span> — numeric amount</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}
      />
    </div>
  )
}

// ─── Column mapping UI ────────────────────────────────────────────────────────

const REQUIRED_FIELDS: { key: keyof ColumnMapping; label: string; hint: string }[] = [
  { key: 'location', label: 'Location column',  hint: 'Maps to store / unit / product line name' },
  { key: 'period',   label: 'Period column',     hint: 'e.g. 2025-03 or 2025-Q1' },
  { key: 'metric',   label: 'Metric column',     hint: 'e.g. Revenue, COGS, Net Profit' },
  { key: 'value',    label: 'Value column',      hint: 'Numeric financial amount' },
]

function MappingStep({
  headers,
  mapping,
  onChange,
  sampleRows,
}: {
  headers: string[]
  mapping: ColumnMapping
  onChange: (m: ColumnMapping) => void
  sampleRows: string[][]
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Map your CSV columns to the required fields. We've pre-filled our best guess — adjust if needed.
      </p>
      <div className="space-y-3">
        {REQUIRED_FIELDS.map(({ key, label, hint }) => (
          <div key={key} className="grid grid-cols-[160px_1fr] items-center gap-4">
            <div>
              <Label className="text-xs font-semibold">{label}</Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>
            </div>
            <Select
              value={mapping[key]}
              onValueChange={v => onChange({ ...mapping, [key]: v })}
            >
              <SelectTrigger className="h-9 bg-card border-border text-sm">
                <SelectValue placeholder="Select column…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— not mapped —</SelectItem>
                {headers.map(h => (
                  <SelectItem key={h} value={h}>{h}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {/* Sample data preview */}
      {sampleRows.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Preview (first 3 rows)</p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  {headers.map(h => (
                    <th key={h} className={cn(
                      "px-3 py-2 text-left font-semibold whitespace-nowrap",
                      Object.values(mapping).includes(h) ? "text-primary" : "text-muted-foreground"
                    )}>
                      {h}
                      {Object.values(mapping).includes(h) && (
                        <span className="ml-1 text-[9px] bg-primary/15 text-primary px-1 py-0.5 rounded">
                          {Object.entries(mapping).find(([, v]) => v === h)?.[0]}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {sampleRows.slice(0, 3).map((row, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    {row.map((cell, j) => (
                      <td key={j} className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Preview step ─────────────────────────────────────────────────────────────

function PreviewStep({ parsed, totalRows }: { parsed: ParsedRow[]; totalRows: number }) {
  const matched   = parsed.filter(r => r.matched).length
  const unmatched = parsed.filter(r => !r.matched).length
  const invalid   = totalRows - parsed.length

  const unmatchedNames = Array.from(new Set(parsed.filter(r => !r.matched).map(r => r.location)))

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Rows ready',     value: matched,   color: 'text-emerald-500' },
          { label: 'Unmatched locs', value: unmatched, color: unmatched > 0 ? 'text-amber-500' : 'text-muted-foreground' },
          { label: 'Skipped (bad)',  value: invalid,   color: invalid > 0 ? 'text-destructive' : 'text-muted-foreground' },
        ].map(s => (
          <div key={s.label} className="bg-muted/40 rounded-lg p-3 text-center">
            <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {unmatchedNames.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 space-y-1.5">
          <div className="flex items-center gap-2 text-amber-500 text-xs font-semibold">
            <AlertTriangle className="size-3.5" />
            These location names weren't matched — rows will be skipped:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unmatchedNames.map(n => (
              <span key={n} className="bg-amber-500/15 text-amber-500 text-[10px] px-2 py-0.5 rounded-full font-mono">{n}</span>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Make sure location names in the CSV exactly match your {' '}
            <span className="font-semibold">Locations</span> page. Names are case-insensitive.
          </p>
        </div>
      )}

      {/* Sample of matched rows */}
      {matched > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Sample of rows to import (up to 5)
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  {['Location', 'Period', 'Metric', 'Value'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {parsed.filter(r => r.matched).slice(0, 5).map((r, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-3 py-1.5 font-medium">{r.locationName}</td>
                    <td className="px-3 py-1.5 text-muted-foreground font-mono">{r.period}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{r.metric}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{r.value.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  locations: LocationMeta[]
  companies: Company[]
  user: User | null
  firestore: Firestore | null
}

export function ImportDialog({
  open, onOpenChange, locations, companies, user, firestore,
}: ImportDialogProps) {
  const [step, setStep]           = React.useState<Step>('upload')
  const [fileName, setFileName]   = React.useState('')
  const [headers, setHeaders]     = React.useState<string[]>([])
  const [rawRows, setRawRows]     = React.useState<string[][]>([])
  const [mapping, setMapping]     = React.useState<ColumnMapping>({ location: '', period: '', metric: '', value: '' })
  const [parsed, setParsed]       = React.useState<ParsedRow[]>([])
  const [isImporting, setIsImporting] = React.useState(false)
  const [importedCount, setImportedCount] = React.useState(0)

  // Reset when dialog closes
  React.useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep('upload'); setFileName(''); setHeaders([]); setRawRows([])
        setMapping({ location: '', period: '', metric: '', value: '' })
        setParsed([]); setIsImporting(false)
      }, 300)
    }
  }, [open])

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const { headers: h, rows } = parseCSV(text)
      setFileName(file.name)
      setHeaders(h)
      setRawRows(rows)
      const guessed = guessMapping(h)
      setMapping({
        location: guessed.location ?? '',
        period:   guessed.period   ?? '',
        metric:   guessed.metric   ?? '',
        value:    guessed.value    ?? '',
      })
      setStep('map')
    }
    reader.readAsText(file)
  }

  function buildParsedRows(): ParsedRow[] {
    const locMap = new Map<string, LocationMeta>()
    for (const loc of locations) locMap.set(loc.name.toLowerCase().trim(), loc)

    const hi = (col: string) => headers.indexOf(col)
    const li = hi(mapping.location)
    const pi = hi(mapping.period)
    const mi = hi(mapping.metric)
    const vi = hi(mapping.value)

    const results: ParsedRow[] = []

    for (const row of rawRows) {
      const locRaw    = li >= 0 ? (row[li] ?? '').trim() : ''
      const periodRaw = pi >= 0 ? (row[pi] ?? '').trim() : ''
      const metricRaw = mi >= 0 ? (row[mi] ?? '').trim() : ''
      const valueRaw  = vi >= 0 ? (row[vi] ?? '').trim() : ''

      if (!locRaw || !periodRaw || !metricRaw || !valueRaw) continue
      const value = parseValue(valueRaw)
      if (isNaN(value)) continue

      const matchedLoc = locMap.get(locRaw.toLowerCase())
      results.push({
        location: locRaw,
        period: periodRaw,
        metric: metricRaw,
        value,
        matched: !!matchedLoc,
        locationId: matchedLoc?.id,
        locationName: matchedLoc?.name,
      })
    }

    return results
  }

  function handleProceedToPreview() {
    setParsed(buildParsedRows())
    setStep('preview')
  }

  async function handleImport() {
    if (!firestore || !user || !companies?.[0]) return
    setIsImporting(true)

    const company = companies[0]
    const toWrite = parsed.filter(r => r.matched && r.locationId)

    const allOps = toWrite.map(r => {
      const id = `${company.id}-${r.locationId}-${r.period}-${r.metric}`
        .toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
      return {
        id,
        data: {
          id,
          locationId: r.locationId!,
          locationName: r.locationName!,
          period: r.period,
          metric: r.metric,
          value: r.value,
          companyMembers: company.members,
          createdAt: new Date().toISOString(),
        },
      }
    })

    for (let i = 0; i < allOps.length; i += 450) {
      const chunk = allOps.slice(i, i + 450)
      const batch = writeBatch(firestore)
      for (const op of chunk) {
        batch.set(doc(firestore, 'financial_records', op.id), op.data, { merge: true })
      }
      await batch.commit()
    }

    setImportedCount(allOps.length)
    setIsImporting(false)
    setStep('done')
  }

  const mappingComplete = Object.values(mapping).every(v => v && v !== '_none')
  const matchedCount = parsed.filter(r => r.matched).length

  const STEP_TITLES: Record<Step, string> = {
    upload:  'Import Financial Data',
    map:     'Map Columns',
    preview: 'Review & Import',
    done:    'Import Complete',
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            {STEP_TITLES[step]}
          </DialogTitle>
          {step !== 'upload' && step !== 'done' && (
            <DialogDescription className="flex items-center gap-1.5 text-xs">
              <span className={cn(step === 'map' ? "text-primary font-semibold" : "text-muted-foreground")}>Map columns</span>
              <ChevronRight className="size-3 text-muted-foreground" />
              <span className={cn(step === 'preview' ? "text-primary font-semibold" : "text-muted-foreground")}>Preview</span>
              {fileName && <span className="ml-auto font-mono text-muted-foreground">{fileName}</span>}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="py-2">
          {step === 'upload' && <DropZone onFile={handleFile} />}

          {step === 'map' && (
            <MappingStep
              headers={headers}
              mapping={mapping}
              onChange={setMapping}
              sampleRows={rawRows}
            />
          )}

          {step === 'preview' && (
            <PreviewStep parsed={parsed} totalRows={rawRows.length} />
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <CheckCircle2 className="size-12 text-emerald-500" />
              <div>
                <p className="text-lg font-bold">{importedCount.toLocaleString()} records imported</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Data is now live in your FP&A dashboard. Head to Plan vs. Actual to see it.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border mt-2">
          <div>
            {step !== 'upload' && step !== 'done' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep(step === 'preview' ? 'map' : 'upload')}
              >
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {step === 'done' ? 'Close' : 'Cancel'}
            </Button>
            {step === 'map' && (
              <Button
                size="sm"
                onClick={handleProceedToPreview}
                disabled={!mappingComplete}
                className="bg-primary hover:bg-primary/90"
              >
                Preview import <ChevronRight className="size-3.5 ml-1" />
              </Button>
            )}
            {step === 'preview' && (
              <Button
                size="sm"
                onClick={handleImport}
                disabled={isImporting || matchedCount === 0}
                className="bg-primary hover:bg-primary/90"
              >
                {isImporting
                  ? <><Loader2 className="size-3.5 animate-spin mr-2" />Importing…</>
                  : <>Import {matchedCount.toLocaleString()} records</>
                }
              </Button>
            )}
            {step === 'done' && (
              <Button
                size="sm"
                onClick={() => { setStep('upload'); setFileName(''); setHeaders([]); setRawRows([]); setParsed([]) }}
                variant="outline"
              >
                Import another file
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
