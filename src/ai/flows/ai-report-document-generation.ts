'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import type { ReportTemplate } from '@/lib/report-types';

// ─── Input ────────────────────────────────────────────────────────────────────

const AiReportDocumentInputSchema = z.object({
  template: z.enum(['mda', 'board_update', 'variance', 'ic_memo', 'custom']),
  customPrompt: z.string().optional().describe('User-written prompt for custom reports or additional instructions'),
  financialSummary: z.string().describe('JSON string: key financial figures by period — periods, metrics, totals, locations'),
  context: z.string().describe('Business context: vertical, company name, date range, unit count'),
})
export type AiReportDocumentInput = z.infer<typeof AiReportDocumentInputSchema>

// ─── Section schema (flat to maximise structured-output reliability) ──────────

const SectionSchema = z.object({
  type: z.enum(['narrative', 'metric_cards', 'chart', 'table', 'callout'])
    .describe('The type of section'),
  title: z.string().optional()
    .describe('Section heading — shown in table of contents. Required for all except metric_cards'),

  // narrative + callout
  body: z.string().optional()
    .describe('narrative: multi-paragraph text. callout: one short paragraph'),

  // metric_cards
  cards: z.array(z.object({
    label: z.string().describe('Display label for the card'),
    metric: z.string().describe('Exact metric name matching the financial data (e.g. "Revenue", "Net Profit")'),
    period: z.string().describe('Exact period string from the data (e.g. "2026-Q1") or the word "latest"'),
    comparisonPeriod: z.string().optional().describe('Prior period for % change calculation'),
    format: z.enum(['currency', 'percent', 'number']),
    goodDirection: z.enum(['up', 'down']).describe('Whether higher values are positive (up) or negative (down)'),
  })).optional().describe('metric_cards sections only'),

  // chart
  chartType: z.enum(['line', 'bar']).optional().describe('chart sections only'),
  metrics: z.array(z.string()).optional()
    .describe('chart sections: which metrics to plot — must exactly match metric names in the data'),
  groupBy: z.enum(['period', 'location']).optional()
    .describe('chart sections: group data by time period or by location/unit'),
  fromPeriod: z.string().optional().describe('chart sections: earliest period to include'),
  toPeriod: z.string().optional().describe('chart sections: latest period to include'),
  insight: z.string().optional().describe('chart/table sections: one-sentence key insight about this visual'),

  // table
  headers: z.array(z.string()).optional().describe('table sections: column header labels'),
  rows: z.array(z.array(z.string())).optional()
    .describe('table sections: data rows — all values as formatted strings'),

  // callout
  variant: z.enum(['insight', 'risk', 'recommendation']).optional()
    .describe('callout sections: the tone/purpose of the callout box'),
})

// ─── Output ───────────────────────────────────────────────────────────────────

const AiReportDocumentOutputSchema = z.object({
  title: z.string().describe('Report title'),
  subtitle: z.string().optional().describe('One-line subtitle or period covered'),
  sections: z.array(SectionSchema).describe('Ordered document sections'),
})
export type AiReportDocumentOutput = z.infer<typeof AiReportDocumentOutputSchema>

// ─── Template instructions ────────────────────────────────────────────────────

const TEMPLATE_INSTRUCTIONS: Record<ReportTemplate, string> = {
  mda: `Generate a Management Discussion & Analysis (MD&A) report. Structure:
1. metric_cards section with 4 key metrics (Revenue, gross profit, EBITDA/net profit, margin %) for the most recent period vs prior period
2. narrative section "Executive Summary" — 2-3 paragraphs: overall performance, key drivers, notable changes
3. chart section — Revenue trend over all periods, line chart grouped by period
4. narrative section "Revenue Analysis" — detailed revenue discussion with growth rates
5. chart section — EBITDA/profit trend, line chart grouped by period
6. narrative section "Margin & Cost Review" — cost structure, margin trends, efficiency discussion
7. callout "insight" — the single most important takeaway from this period
8. callout "risk" — the most significant risk or concern in the data
9. narrative section "Outlook" — forward-looking commentary based on the trend data`,

  board_update: `Generate a Board Update / Executive Package. Structure:
1. metric_cards section with 4-5 KPIs for the latest period
2. narrative section "Business Overview" — 1-2 paragraphs executive summary for a board audience
3. chart section — Revenue by period (bar chart) showing trend
4. table section "Performance Summary" — key metrics across the last 3-4 periods in columns
5. callout "insight" — biggest positive highlight this period
6. callout "risk" — top risk requiring board attention
7. narrative section "Key Actions & Next Steps" — 3-5 bullet points (write as a bulleted list using • character)`,

  variance: `Generate a Variance Analysis report. Structure:
1. narrative section "Variance Summary" — overview of actual vs plan performance
2. metric_cards section — key variances (4 metrics: Revenue, COGS/cost, profit, margin)
3. chart section — compare Revenue actuals vs plan by period if plan data is available, else Revenue trend
4. table section "Detailed Variance Table" — metrics as rows, with Actual, Plan, Variance $, Variance % columns
5. narrative section "Revenue Drivers" — what drove the revenue variance
6. narrative section "Cost Analysis" — where costs came in vs plan
7. callout "recommendation" — the most important corrective action based on the variances`,

  ic_memo: `Generate an Investment Committee Memo. Structure:
1. narrative section "Investment Thesis" — 2 paragraphs: what this business does, why the performance supports investment
2. metric_cards section — 4 headline KPIs showing investment-relevant metrics
3. chart section — Revenue trend (all periods, line chart)
4. chart section — EBITDA/profit trend (all periods, line chart) or location comparison (bar)
5. table section "Financial Summary" — 4-6 periods as columns, key P&L metrics as rows
6. callout "risk" — top 2-3 investment risks (write as a short bulleted list using • character)
7. narrative section "Recommendation" — clear investment recommendation with supporting rationale`,

  custom: `Generate the report described in the user's custom prompt. Use the financial data provided to populate all charts, tables, and metric cards with accurate figures. Structure the document logically with an executive summary at the top, supporting data in the middle, and conclusions/recommendations at the end. Include at least one chart and one metric_cards section.`,
}

// ─── Internal prompt schema (adds pre-computed templateInstructions) ──────────

const ReportDocumentPromptSchema = AiReportDocumentInputSchema.extend({
  templateInstructions: z.string(),
})

// ─── Flow ─────────────────────────────────────────────────────────────────────

const reportDocumentPrompt = ai.definePrompt({
  name: 'aiReportDocumentPrompt',
  input: { schema: ReportDocumentPromptSchema },
  output: { schema: AiReportDocumentOutputSchema },
  prompt: `You are Warren, an expert financial analyst and report writer. Generate a professional financial report document based on the template and financial data provided.

Business Context:
{{{context}}}

Financial Data Summary:
{{{financialSummary}}}

{{#if customPrompt}}
User Instructions:
{{{customPrompt}}}
{{/if}}

Report Template: {{template}}

Template Instructions:
{{{templateInstructions}}}

CRITICAL RULES:
1. All metric names in cards[].metric and chart metrics[] MUST exactly match metric names from the financial data (e.g. "Revenue", "Net Profit", "COGS", "Labor", "Operating Expenses")
2. All period strings must exactly match period values from the financial data (e.g. "2026-Q1", "2026-05")
3. For narrative sections, write professional finance prose — not bullet points unless specifically instructed
4. Currency values in table rows must be formatted as "$1.2M" or "$450K"
5. Percent values must be formatted as "12.3%"
6. Charts should use real metric names from the data so the live renderer can look them up
7. Be specific — use actual numbers from the financial data in your narrative text
8. The document should read like a real institutional finance document, not a chatbot response`,
})

const aiReportDocumentFlow = ai.defineFlow(
  {
    name: 'aiReportDocumentFlow',
    inputSchema: AiReportDocumentInputSchema,
    outputSchema: AiReportDocumentOutputSchema,
  },
  async (input) => {
    const { output } = await reportDocumentPrompt({
      ...input,
      templateInstructions: TEMPLATE_INSTRUCTIONS[input.template],
    })
    return output!
  }
)

export async function aiReportDocumentGeneration(
  input: AiReportDocumentInput
): Promise<AiReportDocumentOutput> {
  return aiReportDocumentFlow(input)
}
