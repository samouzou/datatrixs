'use server';
/**
 * @fileOverview This file implements an AI-assisted report generation flow grounded in live data.
 *
 * - aiAssistedReportGeneration - A function that handles the generation of financial reports based on user queries.
 * - AiAssistedReportGenerationInput - The input type for the aiAssistedReportGeneration function.
 * - AiAssistedReportGenerationOutput - The return type for the aiAssistedReportGeneration function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AiAssistedReportGenerationInputSchema = z.object({
  query: z.string().describe('The user\'s natural language query for a financial report.'),
  financialData: z.string().optional().describe('JSON string of normalized financial records.'),
});
export type AiAssistedReportGenerationInput = z.infer<typeof AiAssistedReportGenerationInputSchema>;

const AiAssistedReportGenerationOutputSchema = z.object({
  reportType: z
    .string()
    .describe('The type of financial report identified (e.g., "Profit & Loss", "Balance Sheet", "Cash Flow Statement").'),
  entityName: z
    .string()
    .describe('The name of the entity for which the report is requested (e.g., "Datatrixs Holding Co.", "Dallas location").'),
  period: z
    .string()
    .describe('The reporting period for the financial data (e.g., "Q4 2023", "Year-End 2023").'),
  reportSummary: z
    .string()
    .describe('A high-level summary or analysis of the financial report, based on the provided data.'),
  reportContent: z
    .string()
    .describe('The structured content of the report, formatted as a markdown table. Use K/M suffixes for currency.'),
});
export type AiAssistedReportGenerationOutput = z.infer<typeof AiAssistedReportGenerationOutputSchema>;

export async function aiAssistedReportGeneration(
  input: AiAssistedReportGenerationInput
): Promise<AiAssistedReportGenerationOutput> {
  return aiAssistedReportGenerationFlow(input);
}

const aiAssistedReportGenerationPrompt = ai.definePrompt({
  name: 'aiAssistedReportGenerationPrompt',
  input: { schema: AiAssistedReportGenerationInputSchema },
  output: { schema: AiAssistedReportGenerationOutputSchema },
  prompt: `You are an expert financial analyst for Datatrixs. Your task is to interpret a user's request for a financial report and generate a report grounded in normalized data.

{{#if financialData}}
Use the following normalized financial data to ground your report. Each record has a 'metric' label (e.g., Revenue, COGS, Net Profit):
{{{financialData}}}
{{else}}
If actual financial data is not provided, simulate plausible financial figures to create a meaningful, albeit illustrative, report.
{{/if}}

Identify the report type, the entity it pertains to, and the reporting period from the user's query.
Use the metrics provided in the data to build the report. For a P&L, ensure Revenue, COGS, and Net Profit are explicitly identified from the 'metric' labels.

Finally, generate the structured content of the report as a markdown table. 

CRITICAL: Use compact currency notation (e.g., $1.2M, $450K) in both the summary and the markdown table.

User Query: {{{query}}}
`,
});

const aiAssistedReportGenerationFlow = ai.defineFlow(
  {
    name: 'aiAssistedReportGenerationFlow',
    inputSchema: AiAssistedReportGenerationInputSchema,
    outputSchema: AiAssistedReportGenerationOutputSchema,
  },
  async (input) => {
    const { output } = await aiAssistedReportGenerationPrompt(input);
    return output!;
  }
);
