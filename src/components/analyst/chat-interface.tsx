"use client"

import * as React from "react"
import { Send, Bot, User, Loader2, FileSpreadsheet, BarChart3, Table as TableIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent } from "@/components/ui/card"
import { aiFinancialQueryAnalysis, type AiFinancialQueryAnalysisOutput } from "@/ai/flows/ai-financial-query-analysis"
import { mockFinancialRecords } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  data?: AiFinancialQueryAnalysisOutput
}

export function ChatInterface() {
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hello! I'm your Datatrixs Financial Analyst. I can help you analyze your portfolio performance, generate reports, or extract specific data points. What would you like to know today?"
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
                "max-w-[80%] space-y-2",
                m.role === "user" ? "items-end" : "items-start"
              )}>
                <div className={cn(
                  "p-4 rounded-2xl text-sm leading-relaxed",
                  m.role === "user" 
                    ? "bg-primary text-white rounded-tr-none" 
                    : "bg-muted text-foreground rounded-tl-none"
                )}>
                  {m.content}
                </div>
                
                {m.data?.suggestedChart && (
                  <div className="bg-popover/50 p-3 rounded-xl border border-white/5 flex items-center gap-3">
                    <BarChart3 className="size-5 text-accent" />
                    <div className="flex-1">
                      <p className="text-xs font-semibold">{m.data.suggestedChart.title}</p>
                      <p className="text-[10px] text-muted-foreground">Visualization generated: {m.data.suggestedChart.type}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-[10px]">View</Button>
                  </div>
                )}

                {m.data?.rawSpreadsheetData && (
                  <div className="bg-popover/50 p-3 rounded-xl border border-white/5 flex items-center gap-3">
                    <FileSpreadsheet className="size-5 text-primary" />
                    <div className="flex-1">
                      <p className="text-xs font-semibold">Spreadsheet Export Ready</p>
                      <p className="text-[10px] text-muted-foreground">CSV formatting prepared</p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-[10px]">Download</Button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="size-8 rounded-full bg-accent flex items-center justify-center shrink-0">
                <Loader2 className="size-5 text-background animate-spin" />
              </div>
              <div className="bg-muted p-4 rounded-2xl rounded-tl-none text-sm text-muted-foreground italic">
                Analyzing financial data...
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>
      <div className="p-4 border-t border-white/5 bg-background/50">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input 
            placeholder="e.g., 'What was the revenue for Houston store in Q4?'" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            className="bg-muted border-none focus-visible:ring-primary h-12"
          />
          <Button type="submit" size="icon" disabled={loading} className="h-12 w-12 rounded-lg bg-primary hover:bg-primary/90">
            <Send className="size-5" />
          </Button>
        </form>
      </div>
    </Card>
  )
}