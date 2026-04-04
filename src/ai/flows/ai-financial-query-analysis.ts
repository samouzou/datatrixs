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
        value: z.number().describe('The numeric value for the data point (unformatted).'),
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
      'Raw data formatted for spreadsheet export (e.g., CSV string or JSON string of an array of arrays).' + 'Include headers in the first row. Currency values MUST be formatted with K/M suffixes (e.g., $1.2M, $450K).'
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

Financial Data: {{{financialData}}}
User Query: {{{query}}}
{{#if context}}Context: {{{context}}}{{/if}}

CRITICAL FORMATTING RULES:
1. Always use compact currency notation in your 'answer' and 'rawSpreadsheetData'. 
   - Use 'K' for thousands (e.g., $450K)
   - Use 'M' for millions (e.g., $1.2M)
2. In the 'results' array, provide raw numeric values (no suffixes) for chart processing.
3. Be professional and objective.

Follow these steps:
1. **Analyze the data** to directly answer the user's query.
2. **Determine the primary analysis type**.
3. **Extract structured data points** for the 'results' array (using raw numbers).
4. **Suggest a chart type** (bar, line, pie, table) if quantifiable.
5. **Provide raw CSV data** in 'rawSpreadsheetData' with formatted currency values.
6. **Provide recommendations** based on the analysis.

Example Output format for 'What was the profit?':
{
  "answer": "The net profit for the portfolio was $1.1M, representing an 8% increase.",
  "analysisType": "summary",
  "results": [{ "label": "Total", "value": 1100000, "metric": "Net Profit" }],
  "rawSpreadsheetData": "Metric,Value\nNet Profit,$1.1M"
}

Strictly adhere to the output JSON schema.`,
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
