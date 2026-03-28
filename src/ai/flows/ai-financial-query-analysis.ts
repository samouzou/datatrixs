'use server';
/**
 * @fileOverview A Genkit flow for an AI financial analyst that answers natural language queries about financial performance.
 *
 * - aiFinancialQueryAnalysis - A function that handles financial data queries and analysis.
 * - AiFinancialQueryAnalysisInput - The input type for the aiFinancialQueryAnalysis function.
 * - AiFinancialQueryAnalysisOutput - The return type for the aiFinancialQueryAnalysis function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AiFinancialQueryAnalysisInputSchema = z.object({
  query: z.string().describe('The natural language financial query from the user.'),
  financialData: z
    .string()
    .describe(
      'A JSON string representing an array of financial records. Each object in the array should contain at least \'location\', \'period\', \'metric\', and \'value\' fields. Example: [{ "location": "Houston", "period": "Q1 2023", "metric": "Net Profit", "value": 150000 }]'
    ),
  context: z
    .string()
    .optional()
    .describe(
      'Additional context such as the current date or specific user preferences. Example: "Current date is 2023-10-26."'
    ),
});
export type AiFinancialQueryAnalysisInput = z.infer<typeof AiFinancialQueryAnalysisInputSchema>;

const AiFinancialQueryAnalysisOutputSchema = z.object({
  answer: z.string().describe('A natural language answer summarizing the financial analysis.'),
  analysisType: z
    .enum(['summary', 'comparison', 'trend', 'report', 'data_extraction', 'other'])
    .describe('The type of financial analysis performed.'),
  results: z
    .array(
      z.object({
        label: z.string().describe('A label for the data point (e.g., "Q1 2023", "Houston Store").'),
        value: z.number().describe('The numeric value for the data point.'),
        metric: z.string().describe('The financial metric (e.g., "Net Profit", "Revenue").'),
        location: z.string().optional().describe('The location associated with the data point.'),
        period: z.string().optional().describe('The period associated with the data point.'),
      })
    )
    .optional()
    .describe('Structured data points derived from the analysis, suitable for charts or tables.'),
  suggestedChart: z
    .object({
      type: z.enum(['bar', 'line', 'pie', 'table']).describe('The suggested type of chart or visualization.'),
      title: z.string().describe('The title for the suggested chart.'),
      xAxisLabel: z.string().optional().describe('Label for the X-axis.'),
      yAxisLabel: z.string().optional().describe('Label for the Y-axis.'),
    })
    .optional()
    .describe('A suggestion for a chart or visualization based on the analysis results.'),
  rawSpreadsheetData: z
    .string()
    .optional()
    .describe(
      'Raw data formatted for spreadsheet export (e.g., CSV string or JSON string of an array of arrays).' + 'Include headers in the first row if providing CSV or array of arrays.'
    ),
  recommendations: z.string().optional().describe('Optional recommendations or insights based on the financial analysis.'),
});
export type AiFinancialQueryAnalysisOutput = z.infer<typeof AiFinancialQueryAnalysisOutputSchema>;

export async function aiFinancialQueryAnalysis(
  input: AiFinancialQueryAnalysisInput
): Promise<AiFinancialQueryAnalysisOutput> {
  return aiFinancialQueryAnalysisFlow(input);
}

const prompt = ai.definePrompt({
  name: 'aiFinancialQueryAnalysisPrompt',
  input: { schema: AiFinancialQueryAnalysisInputSchema },
  output: { schema: AiFinancialQueryAnalysisOutputSchema },
  prompt: `You are an expert financial analyst for Datatrixs, a private equity firm. Your task is to analyze financial data for various retail locations and the entire holding company, and provide clear, concise, and actionable insights based on user queries.

Here is the financial data you have access to. It is provided as a JSON string representing an array of financial records. Each record includes 'location', 'period', 'metric', and 'value'.
Financial Data: {{{financialData}}}

User Query: {{{query}}}

{{#if context}}
Additional Context: {{{context}}}
{{/if}}

Based on the user's query and the provided financial data, perform the following:
1.  **Analyze the data** to directly answer the user's query.
2.  **Determine the primary analysis type** (e.g., summary, comparison, trend, report, data_extraction).
3.  **Extract key data points** that are relevant to the query and suitable for visualization or tabular presentation. Structure these in the 'results' array.
4.  **Suggest a suitable chart type** or visualization (bar, line, pie, table) if the data is quantifiable and could be visualized. Provide a title and axis labels.
5.  **Optionally, provide raw data** in a spreadsheet-friendly format (e.g., CSV or JSON array of arrays) if the query implies a need for export.
6.  **Optionally, provide brief recommendations or insights** based on your analysis.

Ensure your 'answer' is a natural language response. The 'results' array should contain objects with 'label', 'value', 'metric', and optionally 'location' and 'period'.

If the query asks for data for specific locations or periods, make sure to filter and present only that relevant data. If comparing across locations or periods, ensure your results array facilitates that comparison.

Example for 'What was the net profit for the Houston store last quarter?':
{
  "answer": "The net profit for the Houston store last quarter (Q2 2023) was $160,000.",
  "analysisType": "summary",
  "results": [
    { "label": "Houston - Q2 2023", "value": 160000, "metric": "Net Profit", "location": "Houston", "period": "Q2 2023" }
  ],
  "suggestedChart": {
    "type": "table",
    "title": "Houston Store Net Profit - Q2 2023"
  },
  "rawSpreadsheetData": "Location,Period,Metric,Value\nHouston,Q2 2023,Net Profit,160000"
}

Example for 'Compare Q2 revenue across all locations?':
{
  "answer": "Comparing Q2 revenue across all locations: Houston had $250,000, Dallas had $200,000, and Austin had $180,000.",
  "analysisType": "comparison",
  "results": [
    { "label": "Houston", "value": 250000, "metric": "Revenue", "location": "Houston", "period": "Q2 2023" },
    { "label": "Dallas", "value": 200000, "metric": "Revenue", "location": "Dallas", "period": "Q2 2023" },
    { "label": "Austin", "value": 180000, "metric": "Revenue", "location": "Austin", "period": "Q2 2023" }
  ],
  "suggestedChart": {
    "type": "bar",
    "title": "Q2 Revenue Across Locations",
    "xAxisLabel": "Location",
    "yAxisLabel": "Revenue"
  },
  "rawSpreadsheetData": "Location,Revenue\nHouston,250000\nDallas,200000\nAustin,180000"
}

Strictly adhere to the output JSON schema and provide only the requested JSON. If specific data requested by the user is not found in the provided financial data, clearly state that in the 'answer'.`,
});

const aiFinancialQueryAnalysisFlow = ai.defineFlow(
  {
    name: 'aiFinancialQueryAnalysisFlow',
    inputSchema: AiFinancialQueryAnalysisInputSchema,
    outputSchema: AiFinancialQueryAnalysisOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
