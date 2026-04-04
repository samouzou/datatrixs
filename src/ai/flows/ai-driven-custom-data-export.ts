'use server';
/**
 * @fileOverview A Genkit flow for an AI financial analyst to compile specific financial data into a tabular format for export.
 *
 * - aiDrivenCustomDataExport - A function that takes a user query and returns financial data in a tabular structure.
 * - AiDrivenCustomDataExportInput - The input type for the aiDrivenCustomDataExport function.
 * - AiDrivenCustomDataExportOutput - The return type for the aiDrivenCustomDataExport function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

// Input Schema
const AiDrivenCustomDataExportInputSchema = z.object({
  query:
    z.string()
      .describe(
        "The user's natural language request for specific financial data to be compiled into a table."
      ),
  financialData: z.string().optional().describe('JSON string of normalized financial records.'),
});
export type AiDrivenCustomDataExportInput = z.infer<
  typeof AiDrivenCustomDataExportInputSchema
>;

// Output Schema
const AiDrivenCustomDataExportOutputSchema = z.object({
  tableName: z.string().describe('A descriptive name for the generated table.'),
  header:
    z.array(z.string())
      .describe('The column headers for the table, in order.'),
  data:
    z.array(z.array(z.string()))
      .describe(
        'The data rows, where each inner array represents a row and contains string values for each column, matching the order of the "header".'
      ),
});
export type AiDrivenCustomDataExportOutput = z.infer<
  typeof AiDrivenCustomDataExportOutputSchema
>;

// Wrapper function
export async function aiDrivenCustomDataExport(
  input: AiDrivenCustomDataExportInput
): Promise<AiDrivenCustomDataExportOutput> {
  return aiDrivenCustomDataExportFlow(input);
}

// Prompt definition
const aiDrivenCustomDataExportPrompt = ai.definePrompt({
  name: 'aiDrivenCustomDataExportPrompt',
  input: {schema: AiDrivenCustomDataExportInputSchema},
  output: {schema: AiDrivenCustomDataExportOutputSchema},
  prompt: `You are an expert financial analyst for Datatrixs. Your task is to interpret a user's request for specific financial data and compile a dataset into a tabular JSON format.

{{#if financialData}}
Base your table on the following normalized records:
{{{financialData}}}
{{else}}
Act as if you have access to historical financial data for a multi-location retail business. Generate realistic-looking data based on the request.
{{/if}}

Follow these rules:
1.  **Strictly adhere to the output JSON schema.** 
2.  **Identify key metrics, timeframes, locations** from the user's query.
3.  **Populate the 'tableName' field** with a clear title.
4.  **Populate the 'header' and 'data' fields**.
5.  **Use compact currency notation ($1.2M, $450K) for all financial values in the data rows.**

User Request: {{{query}}}`,
});

// Flow definition
const aiDrivenCustomDataExportFlow = ai.defineFlow(
  {
    name: 'aiDrivenCustomDataExportFlow',
    inputSchema: AiDrivenCustomDataExportInputSchema,
    outputSchema: AiDrivenCustomDataExportOutputSchema,
  },
  async input => {
    const {output} = await aiDrivenCustomDataExportPrompt(input);
    return output!;
  }
);
