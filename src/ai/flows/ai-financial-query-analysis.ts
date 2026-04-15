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

const HistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

const AiFinancialQueryAnalysisInputSchema = z.object({
  query: z.string().describe('The natural language financial query from the user.'),
  financialData: z
    .string()
    .describe(
      'A JSON string representing an array of financial records. Each object in the array should contain at least \'location\', \'period\', \'metric\', and \'value\' fields. Example: [{ "location": "Houston", "period": "2024-Q1", "metric": "Net Profit", "value": 150000 }]'
    ),
  context: z
    .string()
    .optional()
    .describe(
      'Additional context such as the current date or specific user preferences. Example: "Current date is 2023-10-26."'
    ),
  history: z
    .array(HistoryMessageSchema)
    .optional()
    .describe('Recent conversation history (last few exchanges) to enable follow-up questions.'),
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
  prompt: `You are an expert financial analyst for Datatrixs. Your task is to analyze financial data and provide clear, concise, and actionable insights based on user queries.

{{#if context}}Business Context: {{{context}}}{{/if}}

Financial Data: {{{financialData}}}

{{#if history}}
Conversation so far (use this to answer follow-up questions):
{{#each history}}
{{this.role}}: {{{this.content}}}
{{/each}}
{{/if}}

Current User Query: {{{query}}}

CRITICAL DATA HANDLING RULES:
1. The provided data is NORMALIZED. Each record contains a 'metric' name (e.g., "Revenue", "Net Profit", "COGS") and a 'value'.
2. When answering queries or generating CSVs, look for these specific 'metric' labels in the data.
3. If the user asks for a table or spreadsheet involving multiple metrics, PIVOT the data so that Location/Period are rows and the Metrics (Revenue, Profit, etc.) are COLUMNS.
4. For follow-up questions ("now break that down", "which of those", "compare that"), resolve the reference using the conversation history above.

CRITICAL FORMATTING & STRUCTURE RULES:
1. Always use compact currency notation in your 'answer' and 'rawSpreadsheetData'.
   - Use 'K' for thousands (e.g., $450K)
   - Use 'M' for millions (e.g., $1.2M)
2. In the 'results' array, provide raw numeric values (no suffixes) for chart processing.
3. Be professional and objective.

Follow these steps:
1. **Analyze the normalized data** to directly answer the user's query.
2. **Determine the primary analysis type**.
3. **Extract structured data points** for the 'results' array (using raw numbers).
4. **Suggest a chart type** (bar, line, pie, table) if quantifiable.
5. **Provide raw CSV data** in 'rawSpreadsheetData'. If comparing multiple metrics, prefer a WIDE format (metrics as headers).
6. **Provide recommendations** based on the analysis.

Example Wide CSV for 'Compare revenue and profit for Houston':
Location,Period,Revenue,Net Profit
Houston,2024-Q1,$1.2M,$240K
Houston,2024-Q2,$1.3M,$260K

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
