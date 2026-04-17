
"use client"

import * as React from "react"
import { Send, User, Loader2, FileSpreadsheet, BarChart3, Maximize2, Save, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card } from "@/components/ui/card"
import { aiFinancialQueryAnalysis, type AiFinancialQueryAnalysisOutput } from "@/ai/flows/ai-financial-query-analysis"
import { cn } from "@/lib/utils"
import { SpreadsheetView } from "@/components/reports/spreadsheet-view"
import { ChartView } from "@/components/analyst/chart-view"
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase"
import { collection, doc, query, where } from "firebase/firestore"
import { setDocumentNonBlocking } from "@/firebase/non-blocking-updates"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { FinancialRecord, Company, SavedAnalysis } from "@/lib/types"
import { useVertical } from "@/contexts/vertical-context"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  data?: AiFinancialQueryAnalysisOutput
  saved?: boolean
}

function parseCSV(csvString: string) {
  if (!csvString) return { headers: [], data: [] };
  const lines = csvString.trim().split('\n');
  if (lines.length === 0) return { headers: [], data: [] };

  const headers = lines[0].split(',').map(h => h.trim());
  const data = lines.slice(1).map(line => line.split(',').map(c => c.trim()));

  return { headers, data };
}

// Detects whether a line is a markdown table row (starts and ends with |)
function isTableRow(line: string) {
  return line.trim().startsWith('|') && line.trim().endsWith('|');
}

// Detects separator rows like |---|---|
function isSeparatorRow(line: string) {
  return isTableRow(line) && /^\|[\s|:\-]+\|$/.test(line.trim());
}

type ContentBlock = { type: 'text'; value: string } | { type: 'table'; lines: string[] };

function parseMessageContent(content: string): ContentBlock[] {
  // Normalize escaped newlines the model sometimes emits
  const normalized = content.replace(/\\n/g, '\n');
  const lines = normalized.split('\n');
  const blocks: ContentBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    if (isTableRow(lines[i])) {
      // Collect contiguous table lines
      const tableLines: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      // Only treat as a real table if there's a separator row (2nd line)
      if (tableLines.length >= 2 && isSeparatorRow(tableLines[1])) {
        blocks.push({ type: 'table', lines: tableLines });
      } else {
        blocks.push({ type: 'text', value: tableLines.join('\n') });
      }
    } else {
      // Collect contiguous non-table lines
      const textLines: string[] = [];
      while (i < lines.length && !isTableRow(lines[i])) {
        textLines.push(lines[i]);
        i++;
      }
      const text = textLines.join('\n').trim();
      if (text) blocks.push({ type: 'text', value: text });
    }
  }

  return blocks;
}

function MarkdownTable({ lines }: { lines: string[] }) {
  const headers = lines[0].split('|').filter(Boolean).map(s => s.trim());
  const rows = lines.slice(2).map(line => line.split('|').filter(Boolean).map(s => s.trim()));

  return (
    <div className="rounded-md border border-border overflow-hidden my-2">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="bg-muted/50">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-bold uppercase tracking-wider text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border hover:bg-muted/30">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MessageContent({ content }: { content: string }) {
  const blocks = parseMessageContent(content);
  return (
    <div className="space-y-1">
      {blocks.map((block, i) =>
        block.type === 'table'
          ? <MarkdownTable key={i} lines={block.lines} />
          : <p key={i} className="leading-relaxed whitespace-pre-wrap">{block.value}</p>
      )}
    </div>
  );
}

interface ChatInterfaceProps {
  externalQuery?: string;
  onQueryProcessed?: () => void;
}

export function ChatInterface({ externalQuery, onQueryProcessed }: ChatInterfaceProps) {
  const { user } = useUser()
  const firestore = useFirestore()
  const { toast } = useToast()
  const vertical = useVertical()
  
  const recordsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "financial_records"),
      where(`companyMembers.${user.uid}`, "in", ["admin", "member", true])
    );
  }, [firestore, user]);
  const { data: records, isLoading: isRecordsLoading } = useCollection<FinancialRecord>(recordsQuery);

  const companiesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "companies"),
      where(`members.${user.uid}`, "in", ["admin", "member", true])
    );
  }, [firestore, user]);
  const { data: companies } = useCollection<Company>(companiesQuery);

  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: `Hello! I'm Warren, your AI financial analyst. I have access to your normalized financial data. I can generate spreadsheets, identify trends, or compare performance across your ${vertical.unitsLabel.toLowerCase()}. What data can I compile for you today?`
    }
  ])
  const [input, setInput] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }

  React.useEffect(() => {
    scrollToBottom()
  }, [messages])

  React.useEffect(() => {
    if (externalQuery) {
      setInput(externalQuery);
      inputRef.current?.focus();
      onQueryProcessed?.();
    }
  }, [externalQuery, onQueryProcessed]);

  // Number of prior exchanges (user + assistant pairs) to include as history
  const HISTORY_WINDOW = 4;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || loading || isRecordsLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input
    }

    // Capture history before updating state — skip the initial welcome message (id "1")
    // Take the last HISTORY_WINDOW * 2 messages (each exchange = user + assistant)
    const historySnapshot = messages
      .filter(m => m.id !== "1")
      .slice(-(HISTORY_WINDOW * 2))
      .map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [...prev, userMessage])
    setInput("")
    setLoading(true)

    const aiData = records?.map(r => ({
      location: r.locationName,
      period: r.period,
      metric: r.metric,
      value: r.value
    })) || [];

    try {
      const result = await aiFinancialQueryAnalysis({
        query: input,
        financialData: JSON.stringify(aiData),
        context: `Current date is ${new Date().toLocaleDateString()}. This is ${vertical.aiContext}.`,
        history: historySnapshot.length > 0 ? historySnapshot : undefined,
      })

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: result.answer,
        data: result
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I'm sorry, I encountered an error while analyzing your live data. Please ensure you have uploaded normalized financials."
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const handleSaveResult = (message: Message) => {
    if (!user || !firestore || !message.data) return;

    // Use primary company membership or just the user if no companies found
    const membership = (companies && companies.length > 0) 
      ? companies[0].members 
      : { [user.uid]: 'admin' };

    const analysisId = doc(collection(firestore, "saved_analysis")).id;
    const analysisRef = doc(firestore, "saved_analysis", analysisId);
    
    const title = message.data.suggestedChart?.title || `Insight: ${message.content.substring(0, 30)}...`;

    const analysisData: SavedAnalysis = {
      id: analysisId,
      userId: user.uid,
      title,
      summary: message.content,
      content: message.data.answer,
      results: message.data.results || [],
      suggestedChart: message.data.suggestedChart,
      rawSpreadsheetData: message.data.rawSpreadsheetData,
      companyMembers: membership,
      createdAt: new Date().toISOString()
    };

    setDocumentNonBlocking(analysisRef, analysisData, { merge: true });
    
    setMessages(prev => prev.map(m => m.id === message.id ? { ...m, saved: true } : m));
    
    toast({
      title: "Saved to Library",
      description: `"${title}" has been moved to your Analyst Library.`
    });
  }

  return (
    <Card className="flex flex-col h-[calc(100vh-12rem)] bg-card/20 border-border backdrop-blur-md">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          {messages.map((m) => (
            <div key={m.id} className={cn(
              "flex gap-3",
              m.role === "user" ? "flex-row-reverse" : "flex-row"
            )}>
              <div className={cn(
                "size-8 rounded-full flex items-center justify-center shrink-0",
                m.role === "user" ? "bg-primary" : "bg-accent"
              )}>
                {m.role === "user" ? <User className="size-5 text-white" /> : <img src="/dx-icon.svg" className="size-5" alt="Warren" />}
              </div>
              <div className={cn(
                "max-w-[85%] space-y-2",
                m.role === "user" ? "items-end" : "items-start"
              )}>
                <div className={cn(
                  "p-4 rounded-2xl text-sm leading-relaxed shadow-sm transition-colors group relative",
                  m.role === "user" 
                    ? "bg-primary text-white rounded-tr-none" 
                    : "bg-muted text-foreground rounded-tl-none border border-border"
                )}>
                  {m.role === "assistant" ? <MessageContent content={m.content} /> : m.content}

                  {m.role === "assistant" && m.data && (
                    <Button 
                      onClick={() => handleSaveResult(m)}
                      disabled={m.saved}
                      variant="ghost" 
                      size="icon" 
                      className={cn(
                        "absolute -right-12 top-0 opacity-0 group-hover:opacity-100 transition-opacity",
                        m.saved ? "text-accent" : "text-muted-foreground hover:text-primary"
                      )}
                    >
                      {m.saved ? <Check className="size-4" /> : <Save className="size-4" />}
                    </Button>
                  )}
                </div>
                
                <div className="flex flex-wrap gap-2 mt-2">
                  {m.data?.suggestedChart && m.data.results && (
                    <div className="bg-popover/80 p-3 rounded-xl border border-border flex items-center gap-3 shadow-md backdrop-blur-sm">
                      <BarChart3 className="size-5 text-accent" />
                      <div className="flex-1">
                        <p className="text-xs font-semibold">{m.data.suggestedChart.title}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Visualization ready</p>
                      </div>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 text-[10px] hover:bg-accent hover:text-accent-foreground">
                            View
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl bg-background border-border p-6 overflow-hidden">
                          <DialogHeader>
                            <DialogTitle>{m.data.suggestedChart.title}</DialogTitle>
                            <DialogDescription className="sr-only">
                              Visual representation of financial data analysis.
                            </DialogDescription>
                          </DialogHeader>
                          <ChartView 
                            type={m.data.suggestedChart.type}
                            title={m.data.suggestedChart.title}
                            data={m.data.results}
                            xAxisLabel={m.data.suggestedChart.xAxisLabel}
                            yAxisLabel={m.data.suggestedChart.yAxisLabel}
                          />
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}

                  {m.data?.rawSpreadsheetData && (
                    <div className="bg-popover/80 p-3 rounded-xl border border-border flex items-center gap-3 shadow-md backdrop-blur-sm">
                      <FileSpreadsheet className="size-5 text-primary" />
                      <div className="flex-1">
                        <p className="text-xs font-semibold">Spreadsheet Data</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Interactive grid available</p>
                      </div>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 text-[10px] border-primary/20 hover:bg-primary/10">
                            <Maximize2 className="size-3 mr-1" /> Explore
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-6xl max-h-[90vh] bg-background border-border p-0 overflow-hidden">
                          <DialogHeader className="sr-only">
                            <DialogTitle>Data Analysis Result</DialogTitle>
                          </DialogHeader>
                          <div className="p-1">
                            {(() => {
                              const { headers, data } = parseCSV(m.data.rawSpreadsheetData!);
                              return (
                                <SpreadsheetView 
                                  title="Data Analysis Result"
                                  headers={headers}
                                  data={data}
                                  className="border-none rounded-none shadow-none"
                                />
                              );
                            })()}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="size-8 rounded-full bg-accent flex items-center justify-center shrink-0">
                <Loader2 className="size-5 text-background animate-spin" />
              </div>
              <div className="bg-muted p-4 rounded-2xl rounded-tl-none text-sm text-muted-foreground italic border border-border shadow-inner">
                Analyzing financial datasets and compiling interactive grids...
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>
      <div className="p-4 border-t border-border bg-background/50 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input 
            ref={inputRef}
            placeholder={isRecordsLoading ? "Loading financial data..." : "Ask the analyst a question..."} 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading || isRecordsLoading}
            className="bg-muted border-none focus-visible:ring-primary h-12 text-sm"
          />
          <Button type="submit" size="icon" disabled={loading || isRecordsLoading || !input.trim()} className="h-12 w-12 rounded-lg bg-primary hover:bg-primary/90 transition-transform active:scale-95">
            <Send className="size-5" />
          </Button>
        </form>
      </div>
    </Card>
  )
}
