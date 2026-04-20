'use client';

import * as React from "react"
import {
  TrendingUp, ArrowUpRight, ArrowDownRight, GitCompare,
  FilePen, ChevronRight, Loader2, Cpu, Route, ShieldCheck, Sparkles,
  TableProperties, Upload, FileBarChart2, Lock,
} from "lucide-react"
import { ForecastTab } from "@/components/fpa/forecast-tab"
import { PipelineTab } from "@/components/fpa/pipeline-tab"
import { CovenantTab } from "@/components/fpa/covenant-tab"
import { LedgerTab } from "@/components/fpa/ledger-tab"
import { ImportDialog } from "@/components/fpa/import-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase"
import { query, collection, where, doc, writeBatch } from "firebase/firestore"
import { FinancialRecord, FinancialPlan, UnitPipeline, CovenantSnapshot, Company, Location } from "@/lib/types"
import { seedDemoData } from "@/lib/demo-seed"
import { useVertical } from "@/contexts/vertical-context"
import { cn } from "@/lib/utils"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts"

// ─── Formatting helpers ──────────────────────────────────────────────────────

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function fmtCurrency(val: number): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtPct(val: number): string {
  return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;
}

function fmtShortPeriod(period: string): string {
  if (period.includes('-Q')) {
    const [y, q] = period.split('-');
    return `${q} ${y}`;
  }
  if (period.includes('-')) {
    const parts = period.split('-');
    if (parts.length === 2) {
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return `${months[+parts[1] - 1] ?? parts[1]} ${parts[0]}`;
    }
  }
  return period;
}

function sortPeriods(periods: string[]) {
  return [...periods].sort((a, b) => a.localeCompare(b));
}

// ─── Data types & utilities ──────────────────────────────────────────────────

type LocationMeta = { id: string; name: string };

function getLocations(records: FinancialRecord[]): LocationMeta[] {
  const seen = new Map<string, string>();
  for (const r of records) {
    if (!seen.has(r.locationId)) seen.set(r.locationId, r.locationName);
  }
  return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
}

function getPeriods(records: FinancialRecord[]): string[] {
  return sortPeriods([...new Set(records.map(r => r.period))]);
}

function sumMetric(records: FinancialRecord[], ...names: string[]): number {
  const lower = names.map(n => n.toLowerCase());
  return records
    .filter(r => lower.includes(r.metric.toLowerCase()))
    .reduce((s, r) => s + r.value, 0);
}

type LocationRow = {
  location: LocationMeta;
  actual: Record<string, number>;
  planned: Record<string, number>;
};

function buildRows(
  locations: LocationMeta[],
  periodRecords: FinancialRecord[],
  periodPlans: FinancialPlan[]
): LocationRow[] {
  return locations.map(loc => {
    const locRecords = periodRecords.filter(r => r.locationId === loc.id);
    const locPlans = periodPlans.filter(p => p.locationId === loc.id);
    const actual: Record<string, number> = {};
    const planned: Record<string, number> = {};
    for (const r of locRecords) actual[r.metric] = (actual[r.metric] ?? 0) + r.value;
    for (const p of locPlans) planned[p.metric] = p.plannedValue;
    return { location: loc, actual, planned };
  });
}

// ─── Waterfall (EBITDA Bridge) ───────────────────────────────────────────────

type WaterfallEntry = {
  name: string;
  base: number;
  positive: number;
  negative: number;
  isTotal: boolean;
  total: number;
};

function buildWaterfall(
  fromPeriod: string,
  toPeriod: string,
  records: FinancialRecord[]
): WaterfallEntry[] {
  const from = records.filter(r => r.period === fromPeriod);
  const to   = records.filter(r => r.period === toPeriod);

  const fromRevenue = sumMetric(from, 'Revenue');
  const toRevenue   = sumMetric(to,   'Revenue');
  const fromCOGS    = sumMetric(from, 'COGS');
  const toCOGS      = sumMetric(to,   'COGS');
  const fromOpEx    = sumMetric(from, 'Operating Expenses', 'SG&A Expense');
  const toOpEx      = sumMetric(to,   'Operating Expenses', 'SG&A Expense');
  const fromLabor   = sumMetric(from, 'Labor', 'Payroll');
  const toLabor     = sumMetric(to,   'Labor', 'Payroll');
  const fromRD      = sumMetric(from, 'R&D Expense', 'Clinical Trial Costs');
  const toRD        = sumMetric(to,   'R&D Expense', 'Clinical Trial Costs');
  const fromProfit  = sumMetric(from, 'Net Profit');
  const toProfit    = sumMetric(to,   'Net Profit');

  // Use Net Profit if available, otherwise build EBITDA from components
  const fromEBITDA = fromProfit || (fromRevenue - fromCOGS - fromOpEx - fromLabor - fromRD);
  const toEBITDA   = toProfit   || (toRevenue   - toCOGS   - toOpEx   - toLabor   - toRD);

  const drivers = [
    { name: 'Revenue',  delta: toRevenue - fromRevenue },
    ...(fromCOGS || toCOGS   ? [{ name: 'COGS',      delta: -(toCOGS  - fromCOGS) }]  : []),
    ...(fromLabor || toLabor  ? [{ name: 'Labor',     delta: -(toLabor - fromLabor) }] : []),
    ...(fromRD || toRD        ? [{ name: 'R&D / CT',  delta: -(toRD    - fromRD) }]    : []),
    ...(fromOpEx || toOpEx    ? [{ name: 'OpEx',      delta: -(toOpEx  - fromOpEx) }]  : []),
  ].filter(d => d.delta !== 0);

  const entries: WaterfallEntry[] = [];
  let running = fromEBITDA;

  entries.push({ name: fmtShortPeriod(fromPeriod), base: 0, positive: fromEBITDA, negative: 0, isTotal: true, total: fromEBITDA });

  for (const d of drivers) {
    if (d.delta >= 0) {
      entries.push({ name: d.name, base: running, positive: d.delta, negative: 0, isTotal: false, total: running + d.delta });
    } else {
      entries.push({ name: d.name, base: running + d.delta, positive: 0, negative: Math.abs(d.delta), isTotal: false, total: running + d.delta });
    }
    running += d.delta;
  }

  entries.push({ name: fmtShortPeriod(toPeriod), base: 0, positive: toEBITDA, negative: 0, isTotal: true, total: toEBITDA });

  return entries;
}

function WaterfallTooltip({ active, payload, label, bridgeLabel }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]?.payload as WaterfallEntry;
  if (!entry) return null;
  const delta = entry.positive > 0 ? entry.positive : -entry.negative;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs space-y-1 min-w-[120px]">
      <p className="font-bold text-foreground">{label}</p>
      {entry.isTotal ? (
        <p className="text-muted-foreground">{bridgeLabel ?? 'EBITDA'}: <span className="text-foreground font-bold">{fmtCurrency(entry.total)}</span></p>
      ) : (
        <p className={cn("font-bold", delta >= 0 ? "text-emerald-500" : "text-destructive")}>
          Impact: {delta >= 0 ? '+' : ''}{fmtCurrency(delta)}
        </p>
      )}
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ title, actual, planned, goodDirection = 'up' }: { title: string; actual: number; planned: number; goodDirection?: 'up' | 'down' }) {
  const hasPlanned = planned !== 0;
  const varPct = hasPlanned ? ((actual - planned) / Math.abs(planned)) * 100 : null;
  const isGood = !hasPlanned || (goodDirection === 'up' ? actual >= planned : actual <= planned);
  const progress = hasPlanned ? Math.min(100, Math.max(0, (actual / planned) * 100)) : 0;

  return (
    <Card className="bg-card/50 border-border">
      <CardHeader className="pb-1">
        <CardDescription className="text-[10px] uppercase tracking-widest font-semibold">{title}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-2">
          <span className="text-2xl font-bold">{fmtCurrency(actual)}</span>
          {varPct !== null && (
            <span className={cn("flex items-center text-sm font-bold mb-0.5", isGood ? "text-emerald-500" : "text-destructive")}>
              {isGood ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {fmtPct(varPct)}
            </span>
          )}
        </div>
        {hasPlanned ? (
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Budget: {fmtCurrency(planned)}</span>
              <span className={isGood ? "text-emerald-500" : "text-destructive"}>
                {isGood ? '+' : ''}{fmtCurrency(actual - planned)} vs plan
              </span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", isGood ? "bg-emerald-500" : "bg-destructive")}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground italic">No budget set</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const DEFAULT_VERSION = 'Annual Budget';

export default function FpaPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const vertical = useVertical();

  // ── Queries ──
  const recordsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, "financial_records"), where(`companyMembers.${user.uid}`, "in", ["admin", "member", true]));
  }, [firestore, user]);
  const { data: records, isLoading: isLoadingRecords } = useCollection<FinancialRecord>(recordsQuery);

  const plansQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, "financial_plans"), where(`companyMembers.${user.uid}`, "in", ["admin", "member", true]));
  }, [firestore, user]);
  const { data: plans } = useCollection<FinancialPlan>(plansQuery);

  const companiesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, "companies"), where(`members.${user.uid}`, "in", ["admin", "member", true]));
  }, [firestore, user]);
  const { data: companies } = useCollection<Company>(companiesQuery);

  const pipelineQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, "unit_pipeline"), where(`companyMembers.${user.uid}`, "in", ["admin", "member", true]));
  }, [firestore, user]);
  const { data: pipelineUnits } = useCollection<UnitPipeline>(pipelineQuery);

  const covenantQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, "covenant_snapshots"), where(`companyMembers.${user.uid}`, "in", ["admin", "member", true]));
  }, [firestore, user]);
  const { data: covenantSnapshots } = useCollection<CovenantSnapshot>(covenantQuery);

  const locationsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, "locations"), where(`companyMembers.${user.uid}`, "in", ["admin", "member", true]));
  }, [firestore, user]);
  const { data: locationDocs } = useCollection<Location>(locationsQuery);

  // ── Derived ──
  // Merge locations from records (for periods they appear in) with the full locations collection
  const locations = React.useMemo(() => {
    const fromRecords = getLocations(records ?? []);
    const fromDocs = (locationDocs ?? []).map(l => ({ id: l.id, name: l.name }));
    const merged = new Map<string, string>();
    for (const l of [...fromDocs, ...fromRecords]) merged.set(l.id, l.name);
    return Array.from(merged.entries()).map(([id, name]) => ({ id, name }));
  }, [records, locationDocs]);
  // Include periods from both actuals and saved plans (so forecast periods appear in the selector)
  const periods    = React.useMemo(() => {
    const all = new Set<string>();
    (records ?? []).forEach(r => all.add(r.period));
    (plans ?? []).forEach(p => all.add(p.period));
    return sortPeriods(Array.from(all));
  }, [records, plans]);
  const versions   = React.useMemo(() => {
    const v = new Set((plans ?? []).map(p => p.version));
    v.add(DEFAULT_VERSION);
    return Array.from(v);
  }, [plans]);

  // ── Controls ──
  const [selectedPeriod,  setSelectedPeriod]  = React.useState('');
  const [selectedVersion, setSelectedVersion] = React.useState(DEFAULT_VERSION);
  const [activeTab,       setActiveTab]       = React.useState('forecast');
  const [bridgeFrom,      setBridgeFrom]      = React.useState('');
  const [bridgeTo,        setBridgeTo]        = React.useState('');

  // Auto-select sensible defaults once data loads
  React.useEffect(() => {
    if (periods.length && !selectedPeriod) setSelectedPeriod(periods[periods.length - 1]);
    if (periods.length >= 2 && !bridgeFrom) {
      setBridgeFrom(periods[periods.length - 2]);
      setBridgeTo(periods[periods.length - 1]);
    } else if (periods.length === 1 && !bridgeFrom) {
      setBridgeFrom(periods[0]);
      setBridgeTo(periods[0]);
    }
  }, [periods, selectedPeriod, bridgeFrom]);

  // ── Budget dialog ──
  const [budgetOpen,     setBudgetOpen]     = React.useState(false);
  const [budgetLocation, setBudgetLocation] = React.useState<LocationMeta | null>(null);
  const [budgetInputs,   setBudgetInputs]   = React.useState<Record<string, string>>({});
  const [newVersionName, setNewVersionName] = React.useState('');
  const [isSaving,       setIsSaving]       = React.useState(false);

  // ── Demo seed ──
  const [isSeeding, setIsSeeding] = React.useState(false);

  // ── Import ──
  const [importOpen, setImportOpen] = React.useState(false);

  async function handleSeedDemo() {
    if (!firestore || !companies?.[0]) return;
    setIsSeeding(true);
    try {
      await seedDemoData(firestore, companies[0]);
    } finally {
      setIsSeeding(false);
    }
  }

  function openBudgetDialog(loc: LocationMeta) {
    setBudgetLocation(loc);
    const existing = (plans ?? []).filter(p =>
      p.locationId === loc.id && p.period === selectedPeriod && p.version === selectedVersion
    );
    const inputs: Record<string, string> = {};
    for (const p of existing) inputs[p.metric] = String(p.plannedValue);
    setBudgetInputs(inputs);
    setNewVersionName('');
    setBudgetOpen(true);
  }

  async function handleSaveBudget() {
    if (!firestore || !user || !budgetLocation || !companies?.[0]) return;
    setIsSaving(true);

    const version = newVersionName.trim() || selectedVersion;
    const company = companies[0];
    const batch = writeBatch(firestore);

    for (const [metric, rawValue] of Object.entries(budgetInputs)) {
      const value = parseFloat(rawValue);
      if (isNaN(value) || rawValue.trim() === '') continue;
      const planId = `${budgetLocation.id}_${slugify(selectedPeriod)}_${slugify(metric)}_${slugify(version)}`;
      const planRef = doc(firestore, "financial_plans", planId);
      const planData: FinancialPlan = {
        id: planId,
        companyId: company.id,
        locationId: budgetLocation.id,
        locationName: budgetLocation.name,
        period: selectedPeriod,
        metric,
        plannedValue: value,
        version,
        companyMembers: company.members,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      batch.set(planRef, planData, { merge: true });
    }

    await batch.commit();
    if (newVersionName.trim()) setSelectedVersion(newVersionName.trim());
    setIsSaving(false);
    setBudgetOpen(false);
  }

  // ── Filtered data ──
  const periodRecords = React.useMemo(
    () => (records ?? []).filter(r => r.period === selectedPeriod),
    [records, selectedPeriod]
  );
  const periodPlans = React.useMemo(
    () => (plans ?? []).filter(p => p.period === selectedPeriod && p.version === selectedVersion),
    [plans, selectedPeriod, selectedVersion]
  );

  const rows = React.useMemo(
    () => buildRows(locations, periodRecords, periodPlans),
    [locations, periodRecords, periodPlans]
  );

  // Metrics present in actuals for this period, sorted in income statement order
  const METRIC_ORDER = ['Revenue', 'COGS', 'Gross Profit', 'Gross Margin', 'Labor', 'Payroll',
    'Operating Expenses', 'SG&A Expense', 'Net Profit', 'Operating Income',
    'R&D Expense', 'Clinical Trial Costs', 'EBITDA', 'Gross Margin %', 'Inventory Value',
    'MRR', 'ARR', 'Churn Rate', 'CAC', 'Units Sold', 'Utilization Rate'];
  const availableMetrics = React.useMemo(() => {
    const s = new Set<string>();
    for (const r of periodRecords) s.add(r.metric);
    const all = Array.from(s);
    return all.sort((a, b) => {
      const ai = METRIC_ORDER.indexOf(a);
      const bi = METRIC_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [periodRecords]);

  // Metrics to show in budget dialog: actuals union vertical defaults
  const budgetMetrics = React.useMemo(() => {
    const s = new Set(availableMetrics);
    vertical.defaultMetrics.forEach(m => s.add(m));
    return Array.from(s).sort();
  }, [availableMetrics, vertical]);

  // ── Portfolio totals ──
  const totalActualRevenue  = rows.reduce((s, r) => s + (r.actual['Revenue']    ?? 0), 0);
  const totalPlannedRevenue = rows.reduce((s, r) => s + (r.planned['Revenue']   ?? 0), 0);
  const totalActualProfit   = rows.reduce((s, r) => s + (r.actual['Net Profit'] ?? 0), 0);
  const totalPlannedProfit  = rows.reduce((s, r) => s + (r.planned['Net Profit']?? 0), 0);

  const actualMarginPct  = totalActualRevenue  > 0 ? (totalActualProfit  / totalActualRevenue)  * 100 : 0;
  const plannedMarginPct = totalPlannedRevenue > 0 ? (totalPlannedProfit / totalPlannedRevenue) * 100 : 0;
  const marginIsGood     = !plannedMarginPct   || actualMarginPct >= plannedMarginPct;

  // ── Bridge ──
  const waterfallData = React.useMemo(() => {
    if (!bridgeFrom || !bridgeTo || bridgeFrom === bridgeTo || !(records?.length)) return [];
    return buildWaterfall(bridgeFrom, bridgeTo, records);
  }, [bridgeFrom, bridgeTo, records]);

  if (isLoadingRecords) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-6 text-primary" />
            <h2 className="text-3xl font-bold tracking-tight font-headline">FP&amp;A</h2>
          </div>
          <p className="text-muted-foreground text-sm">
            Build forecasts, analyze scenarios, and review financial reports.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!(records ?? []).length && companies?.[0] && (
            <Button variant="outline" size="sm" onClick={handleSeedDemo} disabled={isSeeding} className="h-9 gap-2 border-primary/40 text-primary hover:bg-primary/10">
              {isSeeding ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {isSeeding ? 'Loading sample data…' : 'Load sample data'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="h-9 gap-2">
            <Upload className="size-3.5" /> Import CSV
          </Button>
        </div>
      </div>

      {/* Top-level tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card/50 border border-border p-1 h-11">
          <TabsTrigger value="forecast" className="px-5 data-[state=active]:bg-primary h-9 gap-2">
            <Cpu className="size-3.5" /> Forecast
          </TabsTrigger>
          <TabsTrigger value="reports" className="px-5 data-[state=active]:bg-primary h-9 gap-2">
            <FileBarChart2 className="size-3.5" /> Reports
          </TabsTrigger>
          <TabsTrigger value="pipeline" className="px-5 data-[state=active]:bg-primary h-9 gap-2">
            <Route className="size-3.5" /> Unit Pipeline
          </TabsTrigger>
          <TabsTrigger value="covenants" className="px-5 data-[state=active]:bg-primary h-9 gap-2">
            <ShieldCheck className="size-3.5" /> Covenants
          </TabsTrigger>
        </TabsList>

        {/* ── Reports — nested sub-tabs ── */}
        <TabsContent value="reports">
          <Tabs defaultValue="pva" className="space-y-4">
            <TabsList className="bg-muted/40 border border-border/50 p-1 h-9">
              <TabsTrigger value="pva"    className="px-4 text-xs data-[state=active]:bg-card h-7 gap-1.5">
                Plan vs. Actual
              </TabsTrigger>
              <TabsTrigger value="bridge" className="px-4 text-xs data-[state=active]:bg-card h-7 gap-1.5">
                <GitCompare className="size-3" /> {vertical.bridgeLabel} Bridge
              </TabsTrigger>
              <TabsTrigger value="ledger" className="px-4 text-xs data-[state=active]:bg-card h-7 gap-1.5">
                <TableProperties className="size-3" /> P&amp;L Ledger
              </TabsTrigger>
              <TabsTrigger value="capex" disabled className="px-4 text-xs h-7 gap-1.5 opacity-50 cursor-not-allowed">
                <Lock className="size-3" /> CapEx / Cash Flow
              </TabsTrigger>
              <TabsTrigger value="bs" disabled className="px-4 text-xs h-7 gap-1.5 opacity-50 cursor-not-allowed">
                <Lock className="size-3" /> Balance Sheet
              </TabsTrigger>
            </TabsList>

            {/* PvA controls (period + version + KPI cards) live here */}
            <TabsContent value="pva" className="space-y-5">

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Period</Label>
                  <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                    <SelectTrigger className="h-9 w-36 bg-card border-border text-sm">
                      <SelectValue placeholder="Select period" />
                    </SelectTrigger>
                    <SelectContent>
                      {periods.map(p => <SelectItem key={p} value={p}>{fmtShortPeriod(p)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">vs. Budget</Label>
                  <Select value={selectedVersion} onValueChange={setSelectedVersion}>
                    <SelectTrigger className="h-9 w-44 bg-card border-border text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {versions.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {rows.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {vertical.kpiCards ? (
                    vertical.kpiCards.map(card => {
                      const actual  = rows.reduce((s, r) => s + card.metrics.reduce((ms, m) => ms + (r.actual[m]  ?? 0), 0), 0);
                      const planned = rows.reduce((s, r) => s + card.metrics.reduce((ms, m) => ms + (r.planned[m] ?? 0), 0), 0);
                      return <KpiCard key={card.title} title={card.title} actual={actual} planned={planned} goodDirection={card.goodDirection} />;
                    })
                  ) : (
                    <>
                      <KpiCard title="Total Revenue" actual={totalActualRevenue} planned={totalPlannedRevenue} />
                      <KpiCard title="Net Profit"    actual={totalActualProfit}  planned={totalPlannedProfit} />
                      <Card className="bg-card/50 border-border">
                        <CardHeader className="pb-1">
                          <CardDescription className="text-[10px] uppercase tracking-widest font-semibold">Net Margin %</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-end gap-2">
                            <span className="text-2xl font-bold">{actualMarginPct.toFixed(1)}%</span>
                            {plannedMarginPct > 0 && (
                              <span className={cn("flex items-center text-sm font-bold mb-0.5", marginIsGood ? "text-emerald-500" : "text-destructive")}>
                                {marginIsGood ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                                {fmtPct(actualMarginPct - plannedMarginPct)}
                              </span>
                            )}
                          </div>
                          {plannedMarginPct > 0
                            ? <p className="text-[10px] text-muted-foreground">Budget: {plannedMarginPct.toFixed(1)}%</p>
                            : <p className="text-[10px] text-muted-foreground italic">Set budgets to compare</p>
                          }
                        </CardContent>
                      </Card>
                    </>
                  )}
                </div>
              )}

          {rows.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-border rounded-xl space-y-4">
              <TrendingUp className="mx-auto size-12 text-muted-foreground opacity-20" />
              <div className="space-y-1">
                <p className="text-muted-foreground italic">No financial data found for this period.</p>
                <p className="text-xs text-muted-foreground">Upload data from the {vertical.unitsLabel} page, or try sample data below.</p>
              </div>
              {companies?.[0] && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSeedDemo}
                  disabled={isSeeding}
                  className="gap-2 border-primary/40 text-primary hover:bg-primary/10"
                >
                  {isSeeding ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                  {isSeeding ? 'Loading sample data…' : 'Load sample data'}
                </Button>
              )}
            </div>
          ) : (
            <Card className="bg-card/30 border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-48 sticky left-0 bg-muted/30">
                        Metric
                      </th>
                      {rows.map(row => (
                        <th key={row.location.id} colSpan={2} className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-l border-border/50">
                          <div className="flex items-center justify-between gap-2 min-w-[180px]">
                            <span className="truncate">{row.location.name}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] px-2 shrink-0 text-primary hover:text-primary opacity-60 hover:opacity-100"
                              onClick={() => openBudgetDialog(row.location)}
                            >
                              <FilePen className="size-3 mr-1" />
                              Budget
                            </Button>
                          </div>
                        </th>
                      ))}
                      {rows.length > 1 && (
                        <th colSpan={2} className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-l border-border/50">
                          <span className="min-w-[120px] block">Portfolio Total</span>
                        </th>
                      )}
                    </tr>
                    <tr className="border-b border-border/50 bg-muted/10">
                      <th className="px-5 py-2 sticky left-0 bg-muted/10" />
                      {rows.map(row => (
                        <React.Fragment key={row.location.id}>
                          <th className="px-3 py-2 text-center text-[10px] text-muted-foreground font-normal border-l border-border/30">Actual</th>
                          <th className="px-3 py-2 text-center text-[10px] text-muted-foreground font-normal">Budget</th>
                        </React.Fragment>
                      ))}
                      {rows.length > 1 && (
                        <React.Fragment>
                          <th className="px-3 py-2 text-center text-[10px] text-muted-foreground font-normal border-l border-border/30">Actual</th>
                          <th className="px-3 py-2 text-center text-[10px] text-muted-foreground font-normal">Budget</th>
                        </React.Fragment>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {availableMetrics.map(metric => {
                      const isRevenue   = metric === 'Revenue';
                      const isProfit    = metric === 'Net Profit' || metric === 'EBITDA' || metric === 'Operating Income';
                      const totAct      = rows.reduce((s, r) => s + (r.actual[metric]  ?? 0), 0);
                      const totPlan     = rows.reduce((s, r) => s + (r.planned[metric] ?? 0), 0);
                      const anyBudget   = rows.some(r => r.planned[metric] !== undefined);
                      return (
                        <tr key={metric} className={cn(
                          "hover:bg-muted/20 transition-colors",
                          (isRevenue || isProfit) && "bg-primary/5 font-semibold"
                        )}>
                          <td className={cn(
                            "px-5 py-2.5 text-xs sticky left-0 bg-card",
                            (isRevenue || isProfit) ? "text-foreground font-semibold bg-primary/5" : "text-muted-foreground"
                          )}>
                            {metric}
                          </td>
                          {rows.map(row => {
                            const actual  = row.actual[metric];
                            const planned = row.planned[metric];
                            const hasBudget = planned !== undefined;
                            const varPct = hasBudget && planned !== 0
                              ? (((actual ?? 0) - planned) / Math.abs(planned)) * 100
                              : undefined;
                            const isGood = varPct === undefined || varPct >= 0;
                            return (
                              <React.Fragment key={row.location.id}>
                                <td className="px-3 py-2.5 text-center text-xs font-medium border-l border-border/30">
                                  {actual !== undefined ? fmtCurrency(actual) : <span className="text-muted-foreground/40">—</span>}
                                </td>
                                <td className="px-3 py-2.5 text-center text-xs">
                                  {hasBudget ? (
                                    <span className={cn("font-semibold", isGood ? "text-emerald-500" : "text-destructive")}>
                                      {varPct !== undefined ? `${isGood ? '+' : ''}${varPct.toFixed(1)}%` : fmtCurrency(planned)}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/40 text-[10px] italic">—</span>
                                  )}
                                </td>
                              </React.Fragment>
                            );
                          })}
                          {rows.length > 1 && (
                            <React.Fragment>
                              <td className="px-3 py-2.5 text-center text-xs font-bold border-l border-border/30">
                                {fmtCurrency(totAct)}
                              </td>
                              <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">
                                {anyBudget ? fmtCurrency(totPlan) : <span className="text-muted-foreground/40 text-[10px] italic">—</span>}
                              </td>
                            </React.Fragment>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ── EBITDA Bridge ── */}
        <TabsContent value="bridge" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">From</Label>
              <Select value={bridgeFrom} onValueChange={setBridgeFrom}>
                <SelectTrigger className="h-9 w-36 bg-card border-border text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periods.map(p => <SelectItem key={p} value={p}>{fmtShortPeriod(p)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">To</Label>
              <Select value={bridgeTo} onValueChange={setBridgeTo}>
                <SelectTrigger className="h-9 w-36 bg-card border-border text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periods.map(p => <SelectItem key={p} value={p}>{fmtShortPeriod(p)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {waterfallData.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
              <GitCompare className="mx-auto size-12 text-muted-foreground opacity-20 mb-4" />
              <p className="text-muted-foreground italic">Select two different periods to generate a {vertical.bridgeLabel} bridge.</p>
            </div>
          ) : (
            <Card className="bg-card/30 border-border p-6 space-y-4">
              <div>
                <h3 className="font-bold text-foreground">
                  {vertical.bridgeLabel} Bridge: {fmtShortPeriod(bridgeFrom)} → {fmtShortPeriod(bridgeTo)}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Waterfall showing each driver of change in {vertical.bridgeLabel} between the two periods.
                </p>
              </div>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={waterfallData} margin={{ top: 24, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
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
                  <Tooltip content={(props) => <WaterfallTooltip {...props} bridgeLabel={vertical.bridgeLabel} />} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
                  {/* Invisible lift bar */}
                  <Bar dataKey="base" stackId="a" fill="transparent" />
                  {/* Positive bars */}
                  <Bar dataKey="positive" stackId="a" radius={[3, 3, 0, 0]}>
                    {waterfallData.map((entry, i) => (
                      <Cell key={`pos-${i}`} fill={entry.isTotal ? 'hsl(var(--primary))' : 'hsl(142 71% 45%)'} />
                    ))}
                  </Bar>
                  {/* Negative bars */}
                  <Bar dataKey="negative" stackId="a" radius={[3, 3, 0, 0]}>
                    {waterfallData.map((_, i) => (
                      <Cell key={`neg-${i}`} fill="hsl(var(--destructive))" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Legend */}
              <div className="flex items-center gap-6 justify-center text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-primary inline-block" /> Total
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-emerald-500 inline-block" /> Positive driver
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-destructive inline-block" /> Negative driver
                </span>
              </div>

              {/* Delta summary */}
              <div className="grid grid-cols-3 gap-4 pt-2 border-t border-border">
                {waterfallData.filter(e => !e.isTotal).map((entry, i) => {
                  const delta = entry.positive > 0 ? entry.positive : -entry.negative;
                  return (
                    <div key={i} className="text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{entry.name}</p>
                      <p className={cn("text-sm font-bold mt-0.5", delta >= 0 ? "text-emerald-500" : "text-destructive")}>
                        {delta >= 0 ? '+' : ''}{fmtCurrency(delta)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </TabsContent>

          {/* ── P&L Ledger ── */}
          <TabsContent value="ledger">
            <LedgerTab
              records={records ?? []}
              plans={plans ?? []}
              companies={companies ?? []}
              user={user}
              firestore={firestore}
              vertical={vertical}
              locations={locations}
              periods={periods}
              versions={versions}
            />
          </TabsContent>

          {/* ── CapEx / Cash Flow (coming soon) ── */}
          <TabsContent value="capex">
            <div className="text-center border-2 border-dashed border-border rounded-xl space-y-3 py-20">
              <Lock className="mx-auto size-10 text-muted-foreground opacity-20" />
              <p className="text-muted-foreground font-medium">CapEx / Cash Flow — Coming Soon</p>
              <p className="text-xs text-muted-foreground">Capital expenditure and cash flow statements will appear here.</p>
            </div>
          </TabsContent>

          {/* ── Balance Sheet (coming soon) ── */}
          <TabsContent value="bs">
            <div className="text-center border-2 border-dashed border-border rounded-xl space-y-3 py-20">
              <Lock className="mx-auto size-10 text-muted-foreground opacity-20" />
              <p className="text-muted-foreground font-medium">Balance Sheet — Coming Soon</p>
              <p className="text-xs text-muted-foreground">Balance sheet reporting will appear here.</p>
            </div>
          </TabsContent>
        </Tabs>
      </TabsContent>

      {/* ── Forecast Builder ── */}
      <TabsContent value="forecast">
        <ForecastTab
          records={records ?? []}
          companies={companies ?? []}
          user={user}
          firestore={firestore}
          vertical={vertical}
          locations={locations}
          periods={periods}
        />
      </TabsContent>

      {/* ── Unit Pipeline ── */}
      <TabsContent value="pipeline">
        <PipelineTab
          units={pipelineUnits ?? []}
          companies={companies ?? []}
          user={user}
          firestore={firestore}
          vertical={vertical}
        />
      </TabsContent>

      {/* ── Covenant Dashboard ── */}
      <TabsContent value="covenants">
        <CovenantTab
          records={records ?? []}
          snapshots={covenantSnapshots ?? []}
          companies={companies ?? []}
          user={user}
          firestore={firestore}
          periods={periods}
        />
      </TabsContent>
    </Tabs>

      {/* Budget Entry Dialog */}
      <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{budgetLocation?.name} — Set Budget</DialogTitle>
            <DialogDescription>
              Enter budget values for {fmtShortPeriod(selectedPeriod)}. Actuals shown as reference. Leave blank to skip.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Version */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Budget Version</Label>
              <div className="flex gap-2">
                <Select
                  value={newVersionName || selectedVersion}
                  onValueChange={v => setNewVersionName(v === selectedVersion ? '' : v)}
                >
                  <SelectTrigger className="bg-muted border-none h-9 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Or create new version..."
                  value={newVersionName}
                  onChange={e => setNewVersionName(e.target.value)}
                  className="bg-muted border-none h-9 flex-1 text-sm"
                />
              </div>
            </div>

            {/* Metric inputs */}
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 pb-1 border-b border-border">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Metric</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold text-right w-24">Actual</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold text-right w-28">Budget</span>
              </div>
              {budgetMetrics.map(metric => {
                const row = rows.find(r => r.location.id === budgetLocation?.id);
                const actual = row?.actual[metric];
                return (
                  <div key={metric} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3">
                    <Label className="text-xs text-foreground">{metric}</Label>
                    <span className="text-xs text-muted-foreground text-right w-24">
                      {actual !== undefined ? fmtCurrency(actual) : '--'}
                    </span>
                    <div className="relative w-28">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                      <Input
                        type="number"
                        placeholder="0"
                        value={budgetInputs[metric] ?? ''}
                        onChange={e => setBudgetInputs(prev => ({ ...prev, [metric]: e.target.value }))}
                        className="pl-5 bg-muted border-none h-8 text-sm w-full"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBudgetOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveBudget} disabled={isSaving} className="bg-primary hover:bg-primary/90">
              {isSaving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Save Budget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        locations={locations}
        companies={companies ?? []}
        user={user}
        firestore={firestore}
      />
    </div>
  );
}
