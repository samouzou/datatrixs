'use client';

import * as React from "react"
import { 
  FilePieChart, 
  Download, 
  Plus, 
  FileText, 
  Table as TableIcon, 
  Sparkles,
  Loader2,
  ArrowRight
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { aiAssistedReportGeneration, type AiAssistedReportGenerationOutput } from "@/ai/flows/ai-assisted-report-generation"
import { aiDrivenCustomDataExport, type AiDrivenCustomDataExportOutput } from "@/ai/flows/ai-driven-custom-data-export"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { SpreadsheetView } from "@/components/reports/spreadsheet-view"

function MarkdownTable({ content }: { content: string }) {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return <pre className="text-xs p-4 bg-muted rounded whitespace-pre-wrap">{content}</pre>;

  const headers = lines[0].split('|').filter(Boolean).map(s => s.trim());
  const rows = lines.slice(2).map(line => line.split('|').filter(Boolean).map(s => s.trim()));

  if (headers.length === 0) return <pre className="text-xs p-4 bg-muted rounded whitespace-pre-wrap">{content}</pre>;

  return (
    <div className="rounded-md border border-white/5 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 border-white/5 hover:bg-muted/50">
            {headers.map((h, i) => (
              <TableHead key={i} className="text-xs font-bold uppercase tracking-wider text-white h-10">{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i} className="border-white/5 hover:bg-white/5">
              {row.map((cell, j) => (
                <TableCell key={j} className="text-sm py-3">{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function ReportsPage() {
  const [reportQuery, setReportQuery] = React.useState("")
  const [exportQuery, setExportQuery] = React.useState("")
  const [reportResult, setReportResult] = React.useState<AiAssistedReportGenerationOutput | null>(null)
  const [exportResult, setExportResult] = React.useState<AiDrivenCustomDataExportOutput | null>(null)
  const [loadingReport, setLoadingReport] = React.useState(false)
  const [loadingExport, setLoadingExport] = React.useState(false)

  const handleGenerateReport = async () => {
    if (!reportQuery.trim() || loadingReport) return
    setLoadingReport(true)
    try {
      const result = await aiAssistedReportGeneration({ query: reportQuery })
      setReportResult(result)
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingReport(false)
    }
  }

  const handleGenerateExport = async () => {
    if (!exportQuery.trim() || loadingExport) return
    setLoadingExport(true)
    try {
      const result = await aiDrivenCustomDataExport({ query: exportQuery })
      setExportResult(result)
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingExport(false)
    }
  }

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FilePieChart className="size-6 text-accent" />
            <h2 className="text-3xl font-bold tracking-tight text-white font-headline">Reports & Exports</h2>
          </div>
          <p className="text-muted-foreground">Generate tailored financial documentation and structured data for your portfolio.</p>
        </div>
      </div>

      <Tabs defaultValue="reports" className="space-y-6">
        <TabsList className="bg-card/50 border border-white/5 p-1 h-12">
          <TabsTrigger value="reports" className="px-6 data-[state=active]:bg-primary h-10">AI Report Builder</TabsTrigger>
          <TabsTrigger value="exports" className="px-6 data-[state=active]:bg-primary h-10">Data Explorer</TabsTrigger>
          <TabsTrigger value="history" className="px-6 data-[state=active]:bg-primary h-10">Saved Library</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="space-y-6 animate-in fade-in duration-300">
          <Card className="bg-card/40 border-white/5 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-white">
                <Sparkles className="size-5 text-accent" />
                Intelligent Report Generation
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Enter a natural language request like "Summarize Austin's P&L for last quarter" to build a formatted report.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => { e.preventDefault(); handleGenerateReport(); }} className="flex gap-3">
                <Input 
                  placeholder="Describe the report you need..." 
                  className="bg-muted/50 border-white/10 focus-visible:ring-primary h-12"
                  value={reportQuery}
                  onChange={(e) => setReportQuery(e.target.value)}
                  disabled={loadingReport}
                />
                <Button size="lg" onClick={handleGenerateReport} disabled={loadingReport || !reportQuery.trim()} className="bg-primary hover:bg-primary/90 h-12 px-8">
                  {loadingReport ? <Loader2 className="size-4 animate-spin mr-2" /> : <Plus className="size-4 mr-2" />}
                  Generate
                </Button>
              </form>
            </CardContent>
          </Card>

          {reportResult && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
              <Card className="bg-card/30 border-white/5 overflow-hidden">
                <CardHeader className="bg-muted/20 border-b border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Badge variant="outline" className="text-[10px] uppercase tracking-widest text-accent border-accent/30 bg-accent/5">
                        {reportResult.reportType}
                      </Badge>
                      <CardTitle className="text-xl text-white">{reportResult.entityName} — {reportResult.period}</CardTitle>
                    </div>
                    <Button variant="outline" size="sm" className="h-9 border-white/10 text-xs bg-white/5 hover:bg-white/10">
                      <Download className="size-3.5 mr-2" /> Download PDF
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                    <p className="text-sm leading-relaxed text-muted-foreground italic">
                      {reportResult.reportSummary}
                    </p>
                  </div>
                  <MarkdownTable content={reportResult.reportContent} />
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="exports" className="space-y-6 animate-in fade-in duration-300">
           <Card className="bg-card/40 border-white/5 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-white">
                <TableIcon className="size-5 text-primary" />
                Raw Data Explorer
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Compile and view raw datasets directly in the browser, such as "All revenue transactions for Dallas in Q4".
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => { e.preventDefault(); handleGenerateExport(); }} className="flex gap-3">
                <Input 
                  placeholder="e.g., 'Monthly sales data for all locations in 2023'..." 
                  className="bg-muted/50 border-white/10 focus-visible:ring-primary h-12"
                  value={exportQuery}
                  onChange={(e) => setExportQuery(e.target.value)}
                  disabled={loadingExport}
                />
                <Button size="lg" onClick={handleGenerateExport} disabled={loadingExport || !exportQuery.trim()} className="bg-primary hover:bg-primary/90 h-12 px-8">
                  {loadingExport ? <Loader2 className="size-4 animate-spin mr-2" /> : <FileText className="size-4 mr-2" />}
                  Build Spreadsheet
                </Button>
              </form>
            </CardContent>
          </Card>

          {exportResult && (
            <div className="animate-in fade-in slide-in-from-top-4 duration-500">
              <SpreadsheetView 
                title={exportResult.tableName}
                headers={exportResult.header}
                data={exportResult.data}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="animate-in fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: "Q3 Performance Audit - Houston", date: "2 days ago", type: "Financial Report", size: "1.2 MB" },
              { title: "Global Inventory Valuation", date: "1 week ago", type: "Data Export", size: "450 KB" },
              { title: "Dallas Central Opex Breakdown", date: "Oct 24, 2023", type: "Financial Report", size: "890 KB" },
              { title: "2023 Year-End Projection", date: "Oct 15, 2023", type: "Analysis", size: "2.1 MB" }
            ].map((item, i) => (
              <Card key={i} className="bg-card/20 border-white/5 hover:border-primary/50 hover:bg-card/40 transition-all cursor-pointer group">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <Badge variant="secondary" className="text-[10px] uppercase tracking-tight bg-secondary/30 text-secondary-foreground border-none">
                      {item.type}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{item.size}</span>
                  </div>
                  <CardTitle className="text-sm mt-3 text-white font-medium leading-tight group-hover:text-primary transition-colors">
                    {item.title}
                  </CardTitle>
                  <CardDescription className="text-xs pt-1">{item.date}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0 flex justify-between items-center">
                  <Button variant="link" size="sm" className="p-0 h-auto text-xs text-primary/80 hover:text-primary">
                    View Details <ArrowRight className="ml-1 size-3" />
                  </Button>
                  <Download className="size-3.5 text-muted-foreground group-hover:text-white transition-colors" />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
