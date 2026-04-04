
"use client"

import * as React from "react"
import { Send, Bot, User, Loader2, FileSpreadsheet, BarChart3, Maximize2, Save, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card } from "@/components/ui/card"
import { aiFinancialQueryAnalysis, type AiFinancialQueryAnalysisOutput } from "@/ai/flows/ai-financial-query-analysis"
import { mockFinancialRecords } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import { SpreadsheetView } from "@/components/reports/spreadsheet-view"
import { ChartView } from "@/components/analyst/chart-view"
import { useUser, useFirestore } from "@/firebase"
import { collection, doc } from "firebase/firestore"
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

interface ChatInterfaceProps {
  externalQuery?: string;
  onQueryProcessed?: () => void;
}

export function ChatInterface({ externalQuery, onQueryProcessed }: ChatInterfaceProps) {
  const { user } = useUser()
  const firestore = useFirestore()
  const { toast } = useToast()
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hello! I'm your Datatrixs Financial Analyst. I can help you analyze your portfolio performance through the end of 2025. I can generate spreadsheets, identify trends, or compare margins across your locations. What data can I compile for you today?"
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

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || loading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input
    }

    setMessages(prev => [...prev, userMessage])
    setInput("")
    setLoading(true)

    try {
      const result = await aiFinancialQueryAnalysis({
        query: input,
        financialData: JSON.stringify(mockFinancialRecords),
        context: "Current date is Jan 15, 2026. Data is complete for full years 2024 and 2025. Current entity: Datatrixs Holding Co. Retail location manager. Role: Admin."
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
        content: "I'm sorry, I encountered an error while analyzing the data. Please try again."
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const handleSaveResult = (message: Message) => {
    if (!user || !firestore || !message.data) return;

    const reportId = doc(collection(firestore, "saved_reports")).id;
    const reportRef = doc(firestore, "saved_reports", reportId);
    
    const title = message.data.suggestedChart?.title || `Analysis: ${message.content.substring(0, 30)}...`;
    const type = message.data.analysisType === 'data_extraction' ? 'Data Export' : 
                 message.data.analysisType === 'report' ? 'Financial Report' : 'Analysis';

    const reportData = {
      id: reportId,
      userId: user.uid,
      title,
      type,
      summary: message.content,
      content: message.data.rawSpreadsheetData || "",
      metadata: {
        results: message.data.results || null,
        chart: message.data.suggestedChart || null,
        analysisType: message.data.analysisType
      },
      createdAt: new Date().toISOString()
    };

    setDocumentNonBlocking(reportRef, reportData, { merge: true });
    
    setMessages(prev => prev.map(m => m.id === message.id ? { ...m, saved: true } : m));
    
    toast({
      title: "Saved to Library",
      description: `"${title}" has been added to your reports history.`
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
                {m.role === "user" ? <User className="size-5 text-white" /> : <Bot className="size-5 text-background" />}
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
                  {m.content}
                  
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
                            <DialogDescription>
                              Interactive spreadsheet view of the compiled financial data.
                            </DialogDescription>
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
            placeholder="e.g., 'Compare revenue for Houston and Dallas across all quarters in a table'" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            className="bg-muted border-none focus-visible:ring-primary h-12 text-sm"
          />
          <Button type="submit" size="icon" disabled={loading} className="h-12 w-12 rounded-lg bg-primary hover:bg-primary/90 transition-transform active:scale-95">
            <Send className="size-5" />
          </Button>
        </form>
      </div>
    </Card>
  )
}
