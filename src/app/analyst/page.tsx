
'use client';

import * as React from "react"
import { ChatInterface } from "@/components/analyst/chat-interface"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Bot, Info } from "lucide-react"

export default function AnalystPage() {
  const [selectedQuery, setSelectedQuery] = React.useState<string | undefined>();

  const handleQueryClick = (query: string) => {
    setSelectedQuery(query);
  };

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex flex-col space-y-2">
        <div className="flex items-center gap-2">
          <Bot className="size-6 text-accent" />
          <h2 className="text-3xl font-bold tracking-tight text-foreground font-headline">AI Financial Analyst</h2>
        </div>
        <p className="text-muted-foreground">Ask questions about your holdings, request reports, or generate spreadsheet data.</p>
      </div>

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
              <CardDescription className="text-xs">Try asking these to get started:</CardDescription>
            </CardHeader>
            <div className="px-6 pb-6 space-y-2">
              {[
                "Which location had the highest margin in Q4?",
                "Compare Houston and Dallas revenue trends",
                "Export a monthly performance table for all stores",
                "What is our total portfolio profit year-to-date?",
                "Identify stores with declining revenue"
              ].map((query, i) => (
                <button 
                  key={i} 
                  onClick={() => handleQueryClick(query)}
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
              You can ask for data in specific formats. For example: "Give me a breakdown of operating expenses for Dallas in a table format."
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
