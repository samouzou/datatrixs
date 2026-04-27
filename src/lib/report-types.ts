// ─── Report Document Types ────────────────────────────────────────────────────

export type ReportTemplate = 'mda' | 'board_update' | 'variance' | 'ic_memo' | 'custom'

export type NarrativeSection = {
  type: 'narrative'
  title: string
  body: string
}

export type MetricCard = {
  label: string
  metric: string          // must match a record.metric value exactly
  period: string          // exact period string, or 'latest'
  comparisonPeriod?: string
  format: 'currency' | 'percent' | 'number'
  goodDirection: 'up' | 'down'
}

export type MetricCardsSection = {
  type: 'metric_cards'
  title?: string
  cards: MetricCard[]
}

export type ChartSection = {
  type: 'chart'
  title: string
  chartType: 'line' | 'bar'
  metrics: string[]        // metric names to plot — must match record.metric
  groupBy: 'period' | 'location'
  fromPeriod?: string
  toPeriod?: string
  insight?: string
}

export type TableSection = {
  type: 'table'
  title: string
  headers: string[]
  rows: string[][]
  insight?: string
}

export type CalloutSection = {
  type: 'callout'
  variant: 'insight' | 'risk' | 'recommendation'
  title: string
  body: string
}

export type ReportSection =
  | NarrativeSection
  | MetricCardsSection
  | ChartSection
  | TableSection
  | CalloutSection

export type ReportDocumentData = {
  title: string
  subtitle?: string
  template: ReportTemplate
  generatedAt: string
  prompt?: string
  sections: ReportSection[]
}

// Firestore record wrapping a document
export type SavedDocument = {
  id: string
  userId: string
  companyId: string
  companyMembers: Record<string, any>
  title: string
  subtitle?: string
  template: ReportTemplate
  prompt?: string
  sections: ReportSection[]
  generatedAt: string
  createdAt: string
}

export const TEMPLATE_META: Record<ReportTemplate, { label: string; description: string; icon: string; sections: string[] }> = {
  mda: {
    label: 'MD&A',
    description: 'Management Discussion & Analysis — narrative performance review with charts and key metrics',
    icon: 'FileText',
    sections: ['Executive Summary', 'Revenue Analysis', 'Margin & Cost Review', 'Outlook & Risks'],
  },
  board_update: {
    label: 'Board Update',
    description: 'Executive board package — KPI snapshot, highlights, risks, and next steps',
    icon: 'Presentation',
    sections: ['KPI Snapshot', 'Business Highlights', 'Key Risks', 'Actions & Next Steps'],
  },
  variance: {
    label: 'Variance Analysis',
    description: 'Actual vs. plan deep dive — where you beat budget and where you missed',
    icon: 'GitCompare',
    sections: ['Variance Summary', 'Revenue Variance', 'Cost Variance', 'Explanations'],
  },
  ic_memo: {
    label: 'IC Memo',
    description: 'Investment Committee memo — thesis, financial summary, risks, and recommendation',
    icon: 'Briefcase',
    sections: ['Investment Thesis', 'Financial Performance', 'Risk Factors', 'Recommendation'],
  },
  custom: {
    label: 'Custom',
    description: 'Describe the report you want and Warren will build it',
    icon: 'Sparkles',
    sections: ['AI-generated based on your prompt'],
  },
}
