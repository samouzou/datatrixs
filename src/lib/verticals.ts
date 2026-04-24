import { BusinessVertical } from '@/lib/types';

export type ForecastLabels = {
  growthRateLabel: string;
  newUnitValueLabel: string;
  profitLabel: string;
  profitPctLabel: string;
  scenarioGrowthLabel: string;
  scenarioNewUnitValueLabel: string;
  chartTitle: string;
};

export type ScenarioDefault = {
  sssPct: number;
  newUnitsPerPeriod: number;
  cogsPct: number;
  laborPct: number;
  opexPct: number;
  auv: number;
};

export type ScenarioDefaults = {
  bear: ScenarioDefault;
  base: ScenarioDefault;
  bull: ScenarioDefault;
};

export type PipelineIconKey =
  | 'building' | 'chevron' | 'calendar' | 'alert' | 'trending' | 'check'
  | 'flask' | 'activity' | 'file-check' | 'shield-check';

export type PipelineStageDef = {
  name: string;
  color: string;
  bgClass: string;
  borderClass: string;
  iconKey: PipelineIconKey;
};

export type PipelineFieldLabels = {
  unitNameLabel: string;
  unitNamePlaceholder: string;
  marketLabel: string;
  marketPlaceholder: string;
  budgetLabel: string;
  spendLabel: string;
  valueLabel: string;
  valueSub: string;
  returnLabel: string;
  returnAggLabel: string;
  milestoneLabel: string;
  completedStage: string;
  notesPlaceholder: string;
  investmentHint: string;
  maintenanceHint: string;
};

export type KpiCardDef = {
  title: string;
  /** One or more metric names to sum from financial_records */
  metrics: string[];
  /** Whether higher actual vs budget is good (green) or bad (red) */
  goodDirection: 'up' | 'down';
};

export type VerticalConfig = {
  id: BusinessVertical;
  label: string;
  description: string;
  /** Singular label for a single managed unit (e.g. "Location", "Client") */
  unitLabel: string;
  /** Plural label for managed units */
  unitsLabel: string;
  /** Label for the 4th KPI card (the one that varies most by vertical) */
  kpi4Label: string;
  /** The financial metric key used for the 4th KPI */
  kpi4Metric: string;
  /** Injected into AI analyst prompts for context grounding */
  aiContext: string;
  /** Default metric names pre-loaded in the data upload mapping step */
  defaultMetrics: string[];
  /** Label used for the organizational grouping concept (replaces "Holding") */
  organizationLabel: string;
  /** Label for the waterfall bridge chart (default 'EBITDA') */
  bridgeLabel: string;
  /** Override the 3 summary KPI cards on the FP&A page. Omit to use generic Revenue/Profit/Margin. */
  kpiCards?: KpiCardDef[];
  /** Ordered pipeline stages for this vertical */
  pipelineStages: PipelineStageDef[];
  /** Field and label config for the pipeline tab */
  pipelineLabels: PipelineFieldLabels;
  /** Label overrides for the Forecast Builder tab */
  forecastLabels: ForecastLabels;
  /** Default assumption seeds for the three scenario cards */
  scenarioDefaults: ScenarioDefaults;
};

const RETAIL_FORECAST_LABELS: ForecastLabels = {
  growthRateLabel: 'Same-Store Sales Growth %',
  newUnitValueLabel: 'Target AUV at Maturity',
  profitLabel: 'EBITDA',
  profitPctLabel: 'EBITDA %',
  scenarioGrowthLabel: 'SSS Growth / Period',
  scenarioNewUnitValueLabel: 'AUV',
  chartTitle: 'Revenue & EBITDA Trajectory',
};

const RETAIL_SCENARIO_DEFAULTS: ScenarioDefaults = {
  bear: { sssPct: -1.0, newUnitsPerPeriod: 0, cogsPct: 40, laborPct: 30, opexPct: 14, auv: 0 },
  base: { sssPct:  3.0, newUnitsPerPeriod: 0, cogsPct: 38, laborPct: 28, opexPct: 12, auv: 0 },
  bull: { sssPct:  7.0, newUnitsPerPeriod: 1, cogsPct: 36, laborPct: 26, opexPct: 11, auv: 0 },
};

const BIOTECH_FORECAST_LABELS: ForecastLabels = {
  growthRateLabel: 'Revenue Growth %',
  newUnitValueLabel: 'Milestone / Licensing Value',
  profitLabel: 'Operating Income/(Loss)',
  profitPctLabel: 'Op. Income %',
  scenarioGrowthLabel: 'Revenue Growth / Period',
  scenarioNewUnitValueLabel: 'Milestone Value',
  chartTitle: 'Revenue & Operating Loss Trajectory',
};

const BIOTECH_SCENARIO_DEFAULTS: ScenarioDefaults = {
  bear: { sssPct: -15, newUnitsPerPeriod: 0, cogsPct: 0, laborPct: 65, opexPct: 25, auv:         0 },
  base: { sssPct:   5, newUnitsPerPeriod: 0, cogsPct: 0, laborPct: 60, opexPct: 20, auv:         0 },
  bull: { sssPct:  25, newUnitsPerPeriod: 1, cogsPct: 0, laborPct: 55, opexPct: 18, auv: 5_000_000 },
};

const RETAIL_PIPELINE_STAGES: PipelineStageDef[] = [
  { name: 'Site Identified',    color: '#94a3b8', bgClass: 'bg-slate-500/10',   borderClass: 'border-slate-500/30',   iconKey: 'building'   },
  { name: 'LOI Signed',         color: '#a78bfa', bgClass: 'bg-violet-500/10',  borderClass: 'border-violet-500/30',  iconKey: 'chevron'    },
  { name: 'Lease Executed',     color: '#60a5fa', bgClass: 'bg-blue-500/10',    borderClass: 'border-blue-500/30',    iconKey: 'calendar'   },
  { name: 'Under Construction', color: '#fb923c', bgClass: 'bg-orange-500/10',  borderClass: 'border-orange-500/30',  iconKey: 'alert'      },
  { name: 'Pre-Opening',        color: '#facc15', bgClass: 'bg-yellow-500/10',  borderClass: 'border-yellow-500/30',  iconKey: 'trending'   },
  { name: 'Open',               color: '#4ade80', bgClass: 'bg-emerald-500/10', borderClass: 'border-emerald-500/30', iconKey: 'check'      },
];

const RETAIL_PIPELINE_LABELS: PipelineFieldLabels = {
  unitNameLabel: 'Unit Name',
  unitNamePlaceholder: 'e.g. Austin – Domain',
  marketLabel: 'Market / City',
  marketPlaceholder: 'e.g. Austin, TX',
  budgetLabel: 'CapEx Budget',
  spendLabel: 'CapEx Deployed',
  valueLabel: 'AUV Underwrite',
  valueSub: 'at portfolio maturity',
  returnLabel: 'Target EBITDA %',
  returnAggLabel: 'Projected EBITDA',
  milestoneLabel: 'Expected Open Date',
  completedStage: 'Open',
  notesPlaceholder: 'Landlord contacts, co-tenancy requirements, timeline risks…',
  investmentHint: 'Buildout, equipment & pre-opening costs',
  maintenanceHint: 'Ongoing repairs & replacements as % of revenue',
};

const BIOTECH_PIPELINE_STAGES: PipelineStageDef[] = [
  { name: 'Preclinical', color: '#94a3b8', bgClass: 'bg-slate-500/10',   borderClass: 'border-slate-500/30',   iconKey: 'flask'       },
  { name: 'Phase 1',     color: '#a78bfa', bgClass: 'bg-violet-500/10',  borderClass: 'border-violet-500/30',  iconKey: 'activity'    },
  { name: 'Phase 2',     color: '#60a5fa', bgClass: 'bg-blue-500/10',    borderClass: 'border-blue-500/30',    iconKey: 'activity'    },
  { name: 'Phase 3',     color: '#fb923c', bgClass: 'bg-orange-500/10',  borderClass: 'border-orange-500/30',  iconKey: 'activity'    },
  { name: 'Filed',       color: '#facc15', bgClass: 'bg-yellow-500/10',  borderClass: 'border-yellow-500/30',  iconKey: 'file-check'  },
  { name: 'Approved',    color: '#4ade80', bgClass: 'bg-emerald-500/10', borderClass: 'border-emerald-500/30', iconKey: 'shield-check'},
];

const BIOTECH_PIPELINE_LABELS: PipelineFieldLabels = {
  unitNameLabel: 'Program Name',
  unitNamePlaceholder: 'e.g. BXT-001',
  marketLabel: 'Indication',
  marketPlaceholder: 'e.g. NSCLC, Type 2 Diabetes',
  budgetLabel: 'R&D Budget',
  spendLabel: 'Spend to Date',
  valueLabel: 'Peak Sales Potential',
  valueSub: 'if approved',
  returnLabel: 'Prob. of Success %',
  returnAggLabel: 'Avg. PoS',
  milestoneLabel: 'Expected Readout / Approval',
  completedStage: 'Approved',
  notesPlaceholder: 'CRO partners, trial sites, regulatory strategy, key risks…',
  investmentHint: 'Clinical trials, CRO contracts & regulatory filing costs',
  maintenanceHint: 'Platform & overhead R&D as % of revenue',
};

const HARDWARE_FORECAST_LABELS: ForecastLabels = {
  growthRateLabel: 'Revenue Growth %',
  newUnitValueLabel: 'Target Revenue / Product Line at Maturity',
  profitLabel: 'EBITDA',
  profitPctLabel: 'EBITDA %',
  scenarioGrowthLabel: 'Revenue Growth / Period',
  scenarioNewUnitValueLabel: 'Product Line Revenue',
  chartTitle: 'Revenue & EBITDA Trajectory',
};

const HARDWARE_SCENARIO_DEFAULTS: ScenarioDefaults = {
  bear: { sssPct:  -5, newUnitsPerPeriod: 0, cogsPct: 52, laborPct: 20, opexPct: 15, auv: 0 },
  base: { sssPct:   8, newUnitsPerPeriod: 0, cogsPct: 48, laborPct: 18, opexPct: 12, auv: 0 },
  bull: { sssPct:  18, newUnitsPerPeriod: 1, cogsPct: 44, laborPct: 15, opexPct: 10, auv: 0 },
};

const HARDWARE_PIPELINE_STAGES: PipelineStageDef[] = [
  { name: 'Concept',               color: '#94a3b8', bgClass: 'bg-slate-500/10',   borderClass: 'border-slate-500/30',   iconKey: 'building'    },
  { name: 'Design / Engineering',  color: '#a78bfa', bgClass: 'bg-violet-500/10',  borderClass: 'border-violet-500/30',  iconKey: 'trending'    },
  { name: 'Prototype',             color: '#60a5fa', bgClass: 'bg-blue-500/10',    borderClass: 'border-blue-500/30',    iconKey: 'flask'       },
  { name: 'Testing / Cert',        color: '#fb923c', bgClass: 'bg-orange-500/10',  borderClass: 'border-orange-500/30',  iconKey: 'shield-check'},
  { name: 'Pre-Production',        color: '#facc15', bgClass: 'bg-yellow-500/10',  borderClass: 'border-yellow-500/30',  iconKey: 'file-check'  },
  { name: 'Production',            color: '#4ade80', bgClass: 'bg-emerald-500/10', borderClass: 'border-emerald-500/30', iconKey: 'check'       },
];

const HARDWARE_PIPELINE_LABELS: PipelineFieldLabels = {
  unitNameLabel: 'Product SKU / Line',
  unitNamePlaceholder: 'e.g. HW-X1 Pro',
  marketLabel: 'Target Market',
  marketPlaceholder: 'e.g. North America, EU Industrial',
  budgetLabel: 'Development Budget',
  spendLabel: 'Spend to Date',
  valueLabel: 'Projected Annual Revenue',
  valueSub: 'at full production volume',
  returnLabel: 'Target Gross Margin %',
  returnAggLabel: 'Projected EBITDA',
  milestoneLabel: 'Expected Launch Date',
  completedStage: 'Production',
  notesPlaceholder: 'Supply chain partners, certifications required, DfM notes, key risks…',
  investmentHint: 'Tooling, NRE & manufacturing setup costs',
  maintenanceHint: 'Sustaining engineering & tooling refresh as % of revenue',
};

export const VERTICALS: Record<BusinessVertical, VerticalConfig> = {
  retail: {
    id: 'retail',
    label: 'Retail',
    description: 'Physical stores, restaurants, or franchise units',
    unitLabel: 'Location',
    unitsLabel: 'Locations',
    kpi4Label: 'Inventory Turn',
    kpi4Metric: 'inventory value',
    aiContext: 'a portfolio of retail locations managed by a private equity holding firm',
    defaultMetrics: ['Revenue', 'Net Profit', 'COGS', 'Operating Expenses', 'Inventory Value'],
    organizationLabel: 'Group',
    bridgeLabel: 'EBITDA',
    pipelineStages: RETAIL_PIPELINE_STAGES,
    pipelineLabels: RETAIL_PIPELINE_LABELS,
    forecastLabels: RETAIL_FORECAST_LABELS,
    scenarioDefaults: RETAIL_SCENARIO_DEFAULTS,
  },
  hardware: {
    id: 'hardware',
    label: 'Hardware',
    description: 'Physical product manufacturing, distribution, or OEM',
    unitLabel: 'Product Line',
    unitsLabel: 'Product Lines',
    kpi4Label: 'Gross Margin %',
    kpi4Metric: 'gross margin',
    aiContext: 'a hardware product and distribution business with multiple product lines',
    defaultMetrics: ['Revenue', 'Net Profit', 'COGS', 'Gross Margin', 'Inventory Value', 'Units Sold'],
    organizationLabel: 'Division',
    bridgeLabel: 'EBITDA',
    pipelineStages: HARDWARE_PIPELINE_STAGES,
    pipelineLabels: HARDWARE_PIPELINE_LABELS,
    forecastLabels: HARDWARE_FORECAST_LABELS,
    scenarioDefaults: HARDWARE_SCENARIO_DEFAULTS,
  },
  saas: {
    id: 'saas',
    label: 'SaaS',
    description: 'Software products with recurring subscription revenue',
    unitLabel: 'Client',
    unitsLabel: 'Clients',
    kpi4Label: 'Churn Rate',
    kpi4Metric: 'churn rate',
    aiContext: 'a SaaS business with recurring subscription revenue and multiple client accounts',
    defaultMetrics: ['Revenue', 'Net Profit', 'MRR', 'ARR', 'Operating Expenses', 'Churn Rate', 'CAC'],
    organizationLabel: 'Workspace',
    bridgeLabel: 'EBITDA',
    pipelineStages: RETAIL_PIPELINE_STAGES,
    pipelineLabels: { ...RETAIL_PIPELINE_LABELS, investmentHint: 'Infrastructure, tooling & onboarding costs', maintenanceHint: 'Infrastructure & platform upkeep as % of revenue' },
    forecastLabels: RETAIL_FORECAST_LABELS,
    scenarioDefaults: RETAIL_SCENARIO_DEFAULTS,
  },
  services: {
    id: 'services',
    label: 'Services',
    description: 'Consulting, agencies, or professional services firms',
    unitLabel: 'Engagement',
    unitsLabel: 'Engagements',
    kpi4Label: 'Utilization Rate',
    kpi4Metric: 'utilization rate',
    aiContext: 'a professional services business with client engagements and project-based revenue',
    defaultMetrics: ['Revenue', 'Net Profit', 'Operating Expenses', 'Gross Margin', 'Utilization Rate'],
    organizationLabel: 'Practice',
    bridgeLabel: 'EBITDA',
    pipelineStages: RETAIL_PIPELINE_STAGES,
    pipelineLabels: { ...RETAIL_PIPELINE_LABELS, investmentHint: 'Talent acquisition, tooling & ramp costs', maintenanceHint: 'Overhead & tooling refresh as % of revenue' },
    forecastLabels: RETAIL_FORECAST_LABELS,
    scenarioDefaults: RETAIL_SCENARIO_DEFAULTS,
  },
  biotech: {
    id: 'biotech',
    label: 'Biotech',
    description: 'Life sciences, drug development, or medical devices',
    unitLabel: 'Program',
    unitsLabel: 'Programs',
    kpi4Label: 'R&D Burn Rate',
    kpi4Metric: 'r&d burn',
    aiContext: 'a biotech or life sciences company with research programs and product pipelines',
    defaultMetrics: ['Revenue', 'R&D Expense', 'Clinical Trial Costs', 'SG&A Expense', 'Operating Income', 'COGS', 'Gross Margin', 'WIP Inventory'],
    organizationLabel: 'Institute',
    bridgeLabel: 'Operating Loss',
    kpiCards: [
      { title: 'Total R&D Burn', metrics: ['R&D Expense', 'Clinical Trial Costs'], goodDirection: 'down' },
      { title: 'SG&A Expense',   metrics: ['SG&A Expense'],                        goodDirection: 'down' },
      { title: 'Operating Income', metrics: ['Operating Income'],                  goodDirection: 'up'  },
    ],
    pipelineStages: BIOTECH_PIPELINE_STAGES,
    pipelineLabels: BIOTECH_PIPELINE_LABELS,
    forecastLabels: BIOTECH_FORECAST_LABELS,
    scenarioDefaults: BIOTECH_SCENARIO_DEFAULTS,
  },
  other: {
    id: 'other',
    label: 'Other',
    description: 'Business models not listed above',
    unitLabel: 'Unit',
    unitsLabel: 'Units',
    kpi4Label: 'Operating Margin',
    kpi4Metric: 'operating margin',
    aiContext: 'a diversified business portfolio',
    defaultMetrics: ['Revenue', 'Net Profit', 'COGS', 'Operating Expenses', 'Gross Margin'],
    organizationLabel: 'Organization',
    bridgeLabel: 'EBITDA',
    pipelineStages: RETAIL_PIPELINE_STAGES,
    pipelineLabels: { ...RETAIL_PIPELINE_LABELS, investmentHint: 'Capital required to launch a new unit', maintenanceHint: 'Ongoing capital spend as % of revenue' },
    forecastLabels: RETAIL_FORECAST_LABELS,
    scenarioDefaults: RETAIL_SCENARIO_DEFAULTS,
  },
};

export const DEFAULT_VERTICAL: BusinessVertical = 'retail';

export function getVerticalConfig(vertical?: string | null): VerticalConfig {
  if (!vertical) return VERTICALS[DEFAULT_VERTICAL];
  return VERTICALS[vertical as BusinessVertical] ?? VERTICALS[DEFAULT_VERTICAL];
}
