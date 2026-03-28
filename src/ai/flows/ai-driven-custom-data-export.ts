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
  prompt: `You are an expert financial analyst for Datatrixs. Your task is to interpret a user's request for specific financial data and compile a plausible, representative dataset into a tabular JSON format suitable for export.

Follow these rules:
1.  **Strictly adhere to the output JSON schema.** Do not include any additional text or formatting outside of the JSON object.
2.  **Act as if you have access to historical financial data for a tire retail business.** Generate realistic-looking data based on the request.
3.  **Identify key metrics, timeframes, locations, and product categories** from the user's query to construct relevant data.
4.  **Populate the 'tableName' field** with a clear, descriptive title for the generated data.
5.  **Populate the 'header' field** with an array of string column names.
6.  **Populate the 'data' field** with an array of arrays of strings. Each inner array represents a row, and its values must correspond to the 'header' columns in order.
7.  **All data values in the 'data' array must be strings.**
8.  If the request implies calculation (e.g., "total sales"), include those calculated values in the generated data.
9.  If the request is vague, make reasonable assumptions to generate representative data.

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
