'use client';

import * as React from "react"
import { ChatInterface } from "@/components/analyst/chat-interface"
import { ReportBuilder } from "@/components/analyst/report-builder"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Info, MessageSquare, FileText } from "lucide-react"
import { useVertical } from "@/contexts/vertical-context"
import { BusinessVertical } from "@/lib/types"

const SAMPLE_QUERIES: Record<BusinessVertical, string[]> = {
  retail: [
    "Which location had the highest margin last period?",
    "Compare revenue trends across my locations",
    "Export a performance table for all active stores",
    "What is the total profit for the current year?",
    "Identify any locations with declining revenue",
    "Breakdown operating expenses by location",
  ],
  hardware: [
    "Which product line had the highest gross margin last quarter?",
    "Compare revenue trends across my product lines",
    "Export a performance table for all product lines",
    "What is the total profit for the current year?",
    "Identify product lines with declining revenue",
    "Breakdown COGS by product line",
  ],
  saas: [
    "Which client accounts have the highest MRR this quarter?",
    "Compare churn rate trends across my client accounts",
    "Export an ARR summary table for all clients",
    "What is total recurring revenue for the current year?",
    "Identify clients with declining revenue",
    "Breakdown operating expenses by workspace",
  ],
  services: [
    "Which engagements had the highest utilization rate last period?",
    "Compare revenue trends across my engagements",
    "Export a performance summary for all active engagements",
    "What is total billable revenue for the current year?",
    "Identify engagements with declining gross margin",
    "Breakdown operating expenses by practice",
  ],
  biotech: [
    "Which program has the highest R&D burn rate this quarter?",
    "Compare clinical trial costs across my programs",
    "Export a financial summary for all active programs",
    "What is total R&D expenditure for the current year?",
    "Identify programs where costs are exceeding prior periods",
    "Breakdown operating expenses by research program",
  ],
  other: [
    "Which unit had the highest margin last period?",
    "Compare revenue trends across my units",
    "Export a performance table for all active units",
    "What is the total profit for the current year?",
    "Identify any units with declining revenue",
    "Breakdown operating expenses by unit",
  ],
};

export default function AnalystPage() {
  const vertical = useVertical()
  const [selectedQuery, setSelectedQuery] = React.useState<string | undefined>();
  const sampleQueries = SAMPLE_QUERIES[vertical.id];

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex flex-col space-y-2">
        <div className="flex items-center gap-2">
          <img src="/dx-icon.svg" className="size-6" alt="Warren" />
          <h2 className="text-3xl font-bold tracking-tight text-foreground font-headline">Warren</h2>
        </div>
        <p className="text-muted-foreground">Ask questions about your {vertical.unitsLabel.toLowerCase()}, request reports, or generate full financial documents from your data.</p>
      </div>

      <Tabs defaultValue="chat" className="space-y-6">
        <TabsList className="bg-card/50 border border-border p-1 h-12">
          <TabsTrigger value="chat" className="px-6 data-[state=active]:bg-primary h-10 gap-2">
            <MessageSquare className="size-4" /> Chat
          </TabsTrigger>
          <TabsTrigger value="reports" className="px-6 data-[state=active]:bg-primary h-10 gap-2">
            <FileText className="size-4" /> Report Studio
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="animate-in fade-in duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3">
              <ChatInterface
                externalQuery={selectedQuery}
                onQueryProcessed={() => setSelectedQuery(undefined)}
              />
            </div>
            <div className="space-y-6">
              <Card className="bg-card border-border shadow-sm">
                <CardHeader>
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="size-4 text-primary" />
                    <CardTitle className="text-sm">Sample Queries</CardTitle>
                  </div>
                  <CardDescription className="text-xs">Try asking these to explore your data:</CardDescription>
                </CardHeader>
                <div className="px-6 pb-6 space-y-2">
                  {sampleQueries.map((query, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedQuery(query)}
                      className="w-full text-left text-xs p-2 rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors border border-transparent hover:border-border"
                    >
                      "{query}"
                    </button>
                  ))}
                </div>
              </Card>

              <Card className="bg-primary/5 border-primary/20 p-6">
                <h4 className="text-sm font-bold text-primary mb-2">Expert Tip</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {`You can ask for data in specific formats. For example: "Give me a breakdown of COGS for my top 3 ${vertical.unitsLabel.toLowerCase()} in a table format."`}
                </p>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="reports" className="animate-in fade-in duration-200">
          <ReportBuilder />
        </TabsContent>
      </Tabs>
    </div>
  )
}
