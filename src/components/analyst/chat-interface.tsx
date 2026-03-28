"use client"

import * as React from "react"
import { Send, Bot, User, Loader2, FileSpreadsheet, BarChart3, Maximize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent } from "@/components/ui/card"
import { aiFinancialQueryAnalysis, type AiFinancialQueryAnalysisOutput } from "@/ai/flows/ai-financial-query-analysis"
import { mockFinancialRecords } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import { SpreadsheetView } from "@/components/reports/spreadsheet-view"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  data?: AiFinancialQueryAnalysisOutput
}

function parseCSV(csvString: string) {
  if (!csvString) return { headers: [], data: [] };
  const lines = csvString.trim().split('\n');
  if (lines.length === 0) return { headers: [], data: [] };
  
  const headers = lines[0].split(',').map(h => h.trim());
  const data = lines.slice(1).map(line => line.split(',').map(c => c.trim()));
  
  return { headers, data };
}

export function ChatInterface() {
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hello! I'm your Datatrixs Financial Analyst. I can help you analyze your portfolio performance, generate spreadsheets, or identify trends. What data can I compile for you today?"
    }
  ])
  const [input, setInput] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }

  React.useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
        context: "Current entity: Datatrixs Holding Co. Retail location manager. Role: Admin."
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

  return (
    <Card className="flex flex-col h-[calc(100vh-12rem)] bg-card/20 border-white/5 backdrop-blur-md">
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
                  "p-4 rounded-2xl text-sm leading-relaxed",
                  m.role === "user" 
                    ? "bg-primary text-white rounded-tr-none" 
                    : "bg-muted text-foreground rounded-tl-none shadow-lg"
                )}>
                  {m.content}
                </div>
                
                <div className="flex flex-wrap gap-2 mt-2">
                  {m.data?.suggestedChart && (
                    <div className="bg-popover/80 p-3 rounded-xl border border-white/5 flex items-center gap-3 shadow-md backdrop-blur-sm">
                      <BarChart3 className="size-5 text-accent" />
                      <div className="flex-1">
                        <p className="text-xs font-semibold">{m.data.suggestedChart.title}</p>
                        <p className="text-[10px] text-muted-foreground">Visualization ready</p>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 text-[10px]">View</Button>
                    </div>
                  )}

                  {m.data?.rawSpreadsheetData && (
                    <div className="bg-popover/80 p-3 rounded-xl border border-white/5 flex items-center gap-3 shadow-md backdrop-blur-sm">
                      <FileSpreadsheet className="size-5 text-primary" />
                      <div className="flex-1">
                        <p className="text-xs font-semibold">Spreadsheet Data</p>
                        <p className="text-[10px] text-muted-foreground">Interactive grid available</p>
                      </div>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 text-[10px] border-primary/20 hover:bg-primary/10">
                            <Maximize2 className="size-3 mr-1" /> Explore
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-6xl max-h-[90vh] bg-background border-white/10 p-0 overflow-hidden">
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
              <div className="bg-muted p-4 rounded-2xl rounded-tl-none text-sm text-muted-foreground italic shadow-inner">
                Analyzing financial datasets and compiling interactive grids...
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>
      <div className="p-4 border-t border-white/5 bg-background/50 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input 
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
