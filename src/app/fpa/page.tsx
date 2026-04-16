'use client';

import * as React from "react"
import {
  TrendingUp, ArrowUpRight, ArrowDownRight, Target, GitCompare,
  FilePen, ChevronRight, Loader2, Cpu, Layers, Route,
} from "lucide-react"
import { ForecastTab } from "@/components/fpa/forecast-tab"
import { ScenarioTab } from "@/components/fpa/scenario-tab"
import { PipelineTab } from "@/components/fpa/pipeline-tab"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase"
import { query, collection, where, doc, writeBatch } from "firebase/firestore"
import { FinancialRecord, FinancialPlan, UnitPipeline, Company } from "@/lib/types"
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

function WaterfallTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]?.payload as WaterfallEntry;
  if (!entry) return null;
  const delta = entry.positive > 0 ? entry.positive : -entry.negative;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs space-y-1 min-w-[120px]">
      <p className="font-bold text-foreground">{label}</p>
      {entry.isTotal ? (
        <p className="text-muted-foreground">EBITDA: <span className="text-foreground font-bold">{fmtCurrency(entry.total)}</span></p>
      ) : (
        <p className={cn("font-bold", delta >= 0 ? "text-emerald-500" : "text-destructive")}>
          Impact: {delta >= 0 ? '+' : ''}{fmtCurrency(delta)}
        </p>
      )}
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ title, actual, planned }: { title: string; actual: number; planned: number }) {
  const hasPlanned = planned !== 0;
  const varPct = hasPlanned ? ((actual - planned) / Math.abs(planned)) * 100 : null;
  const isGood = !hasPlanned || actual >= planned;
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

  // ── Derived ──
  const locations  = React.useMemo(() => getLocations(records ?? []), [records]);
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
  const [activeTab,       setActiveTab]       = React.useState('pva');
  const [selectedMetric,  setSelectedMetric]  = React.useState('Revenue');
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

  // Metrics present in actuals for this period
  const availableMetrics = React.useMemo(() => {
    const s = new Set<string>();
    for (const r of periodRecords) s.add(r.metric);
    return Array.from(s).sort();
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
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-6 text-primary" />
          <h2 className="text-3xl font-bold tracking-tight font-headline">FP&amp;A</h2>
        </div>
        <p className="text-muted-foreground">
          Plan vs. actual performance and period-over-period analysis across your {vertical.unitsLabel.toLowerCase()}.
        </p>
      </div>

      {/* Controls */}
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
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Version</Label>
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

      {/* KPI summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard title="Total Revenue"  actual={totalActualRevenue}  planned={totalPlannedRevenue} />
        <KpiCard title="Net Profit"     actual={totalActualProfit}   planned={totalPlannedProfit} />

        {/* Net Margin card — manual since it's a % not $ */}
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
            {plannedMarginPct > 0 ? (
              <p className="text-[10px] text-muted-foreground">Budget: {plannedMarginPct.toFixed(1)}%</p>
            ) : (
              <p className="text-[10px] text-muted-foreground italic">Set budgets to compare</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card/50 border border-border p-1 h-11">
          <TabsTrigger value="pva"    className="px-5 data-[state=active]:bg-primary h-9 gap-2">
            <Target    className="size-3.5" /> Plan vs. Actual
          </TabsTrigger>
          <TabsTrigger value="bridge" className="px-5 data-[state=active]:bg-primary h-9 gap-2">
            <GitCompare className="size-3.5" /> EBITDA Bridge
          </TabsTrigger>
          <TabsTrigger value="forecast" className="px-5 data-[state=active]:bg-primary h-9 gap-2">
            <Cpu className="size-3.5" /> Forecast Builder
          </TabsTrigger>
          <TabsTrigger value="scenarios" className="px-5 data-[state=active]:bg-primary h-9 gap-2">
            <Layers className="size-3.5" /> Scenario Manager
          </TabsTrigger>
          <TabsTrigger value="pipeline" className="px-5 data-[state=active]:bg-primary h-9 gap-2">
            <Route className="size-3.5" /> Unit Pipeline
          </TabsTrigger>
        </TabsList>

        {/* ── Plan vs. Actual ── */}
        <TabsContent value="pva" className="space-y-4">

          {/* Metric pill selector */}
          {availableMetrics.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {availableMetrics.map(m => (
                <button
                  key={m}
                  onClick={() => setSelectedMetric(m)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-semibold border transition-all",
                    selectedMetric === m
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          {rows.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
              <TrendingUp className="mx-auto size-12 text-muted-foreground opacity-20 mb-4" />
              <p className="text-muted-foreground italic">No financial data found for this period.</p>
              <p className="text-xs text-muted-foreground mt-1">Upload data from the {vertical.unitsLabel} page first.</p>
            </div>
          ) : (
            <Card className="bg-card/30 border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-52">
                        {vertical.unitLabel}
                      </th>
                      <th className="px-5 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Actual</th>
                      <th className="px-5 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Budget</th>
                      <th className="px-5 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Var $</th>
                      <th className="px-5 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Var %</th>
                      <th className="px-5 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-28">
                        Attainment
                      </th>
                      <th className="px-5 py-3 w-32" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {rows.map(row => {
                      const actual  = row.actual[selectedMetric];
                      const planned = row.planned[selectedMetric];
                      const hasBudget  = planned !== undefined;
                      const varDollar  = hasBudget ? (actual ?? 0) - planned : undefined;
                      const varPct     = hasBudget && planned !== 0 ? (((actual ?? 0) - planned) / Math.abs(planned)) * 100 : undefined;
                      const isGood     = varDollar === undefined || varDollar >= 0;
                      const attainment = hasBudget && planned !== 0 ? Math.min(150, Math.max(0, ((actual ?? 0) / planned) * 100)) : null;

                      return (
                        <tr key={row.location.id} className="hover:bg-muted/20 transition-colors group">
                          <td className="px-5 py-3 font-medium text-foreground">{row.location.name}</td>
                          <td className="px-5 py-3 text-center font-medium">
                            {actual !== undefined ? fmtCurrency(actual) : <span className="text-muted-foreground text-xs">--</span>}
                          </td>
                          <td className="px-5 py-3 text-center text-muted-foreground">
                            {hasBudget ? fmtCurrency(planned) : <span className="text-xs italic">No budget</span>}
                          </td>
                          <td className={cn("px-5 py-3 text-center text-xs font-bold",
                            varDollar === undefined ? "text-muted-foreground" : isGood ? "text-emerald-500" : "text-destructive"
                          )}>
                            {varDollar !== undefined ? `${isGood ? '+' : ''}${fmtCurrency(varDollar)}` : '--'}
                          </td>
                          <td className={cn("px-5 py-3 text-center text-xs font-bold",
                            varPct === undefined ? "text-muted-foreground" : isGood ? "text-emerald-500" : "text-destructive"
                          )}>
                            {varPct !== undefined ? fmtPct(varPct) : '--'}
                          </td>
                          <td className="px-5 py-3">
                            {attainment !== null ? (
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={cn("h-full rounded-full", isGood ? "bg-emerald-500" : "bg-destructive")}
                                    style={{ width: `${Math.min(100, attainment)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">
                                  {attainment.toFixed(0)}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">--</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:text-primary"
                              onClick={() => openBudgetDialog(row.location)}
                            >
                              <FilePen className="size-3 mr-1" />
                              {hasBudget ? 'Edit' : 'Set'} Budget
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Totals footer */}
                  {rows.length > 1 && (() => {
                    const totAct  = rows.reduce((s, r) => s + (r.actual[selectedMetric]  ?? 0), 0);
                    const totPlan = rows.reduce((s, r) => s + (r.planned[selectedMetric] ?? 0), 0);
                    const anyBudget  = rows.some(r => r.planned[selectedMetric] !== undefined);
                    const varD = anyBudget ? totAct - totPlan : undefined;
                    const varP = anyBudget && totPlan !== 0 ? ((totAct - totPlan) / Math.abs(totPlan)) * 100 : undefined;
                    const isG  = varD === undefined || varD >= 0;
                    const att  = anyBudget && totPlan !== 0 ? Math.min(150, Math.max(0, (totAct / totPlan) * 100)) : null;

                    return (
                      <tfoot>
                        <tr className="border-t-2 border-border bg-muted/40">
                          <td className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Portfolio Total
                          </td>
                          <td className="px-5 py-3 text-center font-bold">{fmtCurrency(totAct)}</td>
                          <td className="px-5 py-3 text-center text-muted-foreground">
                            {anyBudget ? fmtCurrency(totPlan) : '--'}
                          </td>
                          <td className={cn("px-5 py-3 text-center text-xs font-bold",
                            varD === undefined ? "text-muted-foreground" : isG ? "text-emerald-500" : "text-destructive"
                          )}>
                            {varD !== undefined ? `${isG ? '+' : ''}${fmtCurrency(varD)}` : '--'}
                          </td>
                          <td className={cn("px-5 py-3 text-center text-xs font-bold",
                            varP === undefined ? "text-muted-foreground" : isG ? "text-emerald-500" : "text-destructive"
                          )}>
                            {varP !== undefined ? fmtPct(varP) : '--'}
                          </td>
                          <td className="px-5 py-3">
                            {att !== null ? (
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={cn("h-full rounded-full", isG ? "bg-emerald-500" : "bg-destructive")}
                                    style={{ width: `${Math.min(100, att)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">
                                  {att.toFixed(0)}%
                                </span>
                              </div>
                            ) : null}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    );
                  })()}
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
              <p className="text-muted-foreground italic">Select two different periods to generate a bridge.</p>
            </div>
          ) : (
            <Card className="bg-card/30 border-border p-6 space-y-4">
              <div>
                <h3 className="font-bold text-foreground">
                  EBITDA Bridge: {fmtShortPeriod(bridgeFrom)} → {fmtShortPeriod(bridgeTo)}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Waterfall showing each driver of change in EBITDA between the two periods.
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
                  <Tooltip content={<WaterfallTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
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

        {/* ── Scenario Manager ── */}
        <TabsContent value="scenarios">
          <ScenarioTab
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
    </div>
  );
}
