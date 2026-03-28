'use server';
/**
 * @fileOverview This file implements an AI-assisted report generation flow.
 *
 * - aiAssistedReportGeneration - A function that handles the generation of financial reports based on user queries.
 * - AiAssistedReportGenerationInput - The input type for the aiAssistedReportGeneration function.
 * - AiAssistedReportGenerationOutput - The return type for the aiAssistedReportGeneration function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AiAssistedReportGenerationInputSchema = z.object({
  query: z.string().describe('The user\'s natural language query for a financial report.'),
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
    .describe('A high-level summary or analysis of the financial report, based on the request and potentially simulated data.'),
  reportContent: z
    .string()
    .describe('The structured content of the report, ideally formatted as a markdown table with example data, if actual data is not integrated.'),
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
  prompt: `You are an expert financial analyst. Your task is to interpret a user's request for a financial report and generate a report in JSON format.
If actual financial data is not available, you should simulate plausible financial figures to create a meaningful, albeit illustrative, report.

Identify the report type, the entity it pertains to, and the reporting period from the user's query.
Then, provide a high-level summary or analysis of this report.
Finally, generate the structured content of the report as a markdown table. Use example data that makes sense for the report type and period.

User Query: {{{query}}}

Consider the following examples:

Example Query 1: "Generate a P&L for Datatrixs Holding Co. for Q4 2023"
Example Output 1:
{
  "reportType": "Profit & Loss",
  "entityName": "Datatrixs Holding Co.",
  "period": "Q4 2023",
  "reportSummary": "This Profit & Loss statement for Datatrixs Holding Co. for Q4 2023 shows strong revenue growth and healthy operating income, reflecting successful seasonal sales and efficient cost management.",
  "reportContent": "| Category            | Amount (USD) |\n| :------------------ | :----------- |\n| Revenue             | 1,200,000    |\n| Cost of Goods Sold  | 450,000      |\n| Gross Profit        | 750,000      |\n| Operating Expenses  | 200,000      |\n| Net Income          | 550,000      |"
}

Example Query 2: "Show me the balance sheet for the Dallas location as of year-end 2023"
Example Output 2:
{
  "reportType": "Balance Sheet",
  "entityName": "Dallas Location",
  "period": "Year-End 2023",
  "reportSummary": "The Balance Sheet for the Dallas Location as of Year-End 2023 indicates a solid financial position with a good mix of current and non-current assets and manageable liabilities, suggesting strong liquidity and solvency.",
  "reportContent": "| Category          | Amount (USD) |\n| :---------------- | :----------- |\n| Cash              | 150,000      |\n| Accounts Receivable | 80,000       |\n| Inventory         | 120,000      |\n| Property, Plant & Equipment | 500,000      |\n| Total Assets      | 850,000      |\n| Accounts Payable  | 90,000       |\n| Long-term Debt    | 200,000      |\n| Equity            | 560,000      |\n| Total Liabilities & Equity | 850,000      |"
}

Now, generate the report for the following query. Focus on providing a realistic, albeit simulated, financial report in the markdown table.
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
