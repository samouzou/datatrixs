
'use client';

import * as React from "react"
import {
  Library,
  FileText,
  Table as TableIcon,
  Sparkles,
  Loader2,
  ArrowRight,
  Trash2,
  Download,
  PackageOpen,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCollection, useFirestore, useUser, useMemoFirebase } from "@/firebase"
import { query, collection, where, doc } from "firebase/firestore"
import { deleteDocumentNonBlocking } from "@/firebase/non-blocking-updates"
import { SavedReport, SavedAnalysis } from "@/lib/types"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { SpreadsheetView } from "@/components/reports/spreadsheet-view"
import { ChartView } from "@/components/analyst/chart-view"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

function MarkdownTable({ content }: { content: string }) {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return <pre className="text-xs p-4 bg-muted rounded whitespace-pre-wrap">{content}</pre>;

  const headers = lines[0].split('|').filter(Boolean).map(s => s.trim());
  const rows = lines.slice(2).map(line => line.split('|').filter(Boolean).map(s => s.trim()));

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <Table className="min-w-full">
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            {headers.map((h, i) => (
              <TableHead key={i} className="text-xs font-bold uppercase tracking-wider h-10">{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i} className="hover:bg-muted/50">
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

export default function LibraryPage() {
  const { user } = useUser()
  const firestore = useFirestore()
  
  const [activeTab, setActiveTab] = React.useState("reports")

  // Query formal reports & exports
  const reportsQuery = useMemoFirebase(() => {
    if (!firestore || !user || (activeTab !== 'reports' && activeTab !== 'exports' && activeTab !== 'packages')) return null;
    return query(
      collection(firestore, "saved_reports"),
      where(`companyMembers.${user.uid}`, "in", ["admin", "member", true])
    );
  }, [firestore, user?.uid, activeTab]);
  const { data: rawReports, isLoading: isLoadingReports } = useCollection<SavedReport>(reportsQuery);
  const reports = React.useMemo(() => rawReports?.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)) ?? null, [rawReports]);

  // Query ad-hoc analyses
  const analysesQuery = useMemoFirebase(() => {
    if (!firestore || !user || activeTab !== 'analysis') return null;
    return query(
      collection(firestore, "saved_analysis"),
      where(`companyMembers.${user.uid}`, "in", ["admin", "member", true])
    );
  }, [firestore, user?.uid, activeTab]); 
  const { data: rawAnalyses, isLoading: isLoadingAnalyses } = useCollection<SavedAnalysis>(analysesQuery);
  const analyses = React.useMemo(() => rawAnalyses?.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)) ?? null, [rawAnalyses]);

  const handleDelete = (collectionName: string, id: string) => {
    if (!firestore) return;
    deleteDocumentNonBlocking(doc(firestore, collectionName, id));
  }

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Library className="size-6 text-primary" />
            <h2 className="text-3xl font-bold tracking-tight text-foreground font-headline">Saved Library</h2>
          </div>
          <p className="text-muted-foreground">Access all your historical reports, custom exports, and AI-driven analyst insights.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-card/50 border border-border p-1 h-12">
          <TabsTrigger value="reports" className="px-6 data-[state=active]:bg-primary h-10">Formal Reports</TabsTrigger>
          <TabsTrigger value="exports" className="px-6 data-[state=active]:bg-primary h-10">Data Exports</TabsTrigger>
          <TabsTrigger value="packages" className="px-6 data-[state=active]:bg-primary h-10 gap-2">
            <PackageOpen className="size-4" /> Financial Packages
          </TabsTrigger>
          <TabsTrigger value="analysis" className="px-6 data-[state=active]:bg-primary h-10">Analyst Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="animate-in fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reports?.filter(r => r.type === 'Financial Report').map((item) => (
              <SavedItemCard 
                key={item.id} 
                item={item} 
                icon={<FileText className="size-4" />}
                onDelete={() => handleDelete("saved_reports", item.id)}
              />
            ))}
            {!isLoadingReports && activeTab === 'reports' && !reports?.some(r => r.type === 'Financial Report') && <EmptyState text="No formal reports saved yet." />}
            {isLoadingReports && <LoadingState />}
          </div>
        </TabsContent>

        <TabsContent value="exports" className="animate-in fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reports?.filter(r => r.type === 'Data Export').map((item) => (
              <SavedItemCard 
                key={item.id} 
                item={item} 
                icon={<TableIcon className="size-4" />}
                onDelete={() => handleDelete("saved_reports", item.id)}
              />
            ))}
            {!isLoadingReports && activeTab === 'exports' && !reports?.some(r => r.type === 'Data Export') && <EmptyState text="No data exports compiled yet." />}
            {isLoadingReports && <LoadingState />}
          </div>
        </TabsContent>

        <TabsContent value="packages" className="animate-in fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reports?.filter(r => r.type === 'Financial Package').map((item) => (
              <SavedPackageCard
                key={item.id}
                item={item}
                onDelete={() => handleDelete("saved_reports", item.id)}
              />
            ))}
            {!isLoadingReports && activeTab === 'packages' && !reports?.some(r => r.type === 'Financial Package') && <EmptyState text="No financial packages saved yet." />}
            {isLoadingReports && <LoadingState />}
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="animate-in fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {analyses?.map((item) => (
              <SavedAnalysisCard 
                key={item.id} 
                item={item} 
                onDelete={() => handleDelete("saved_analysis", item.id)}
              />
            ))}
            {!isLoadingAnalyses && activeTab === 'analysis' && !analyses?.length && <EmptyState text="No analyst insights saved from chat yet." />}
            {isLoadingAnalyses && <LoadingState />}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SavedItemCard({ item, icon, onDelete }: { item: SavedReport, icon: React.ReactNode, onDelete: () => void }) {
  return (
    <Card className="bg-card/20 border-border hover:border-primary/50 hover:bg-card/40 transition-all group flex flex-col h-full">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <Badge variant="secondary" className="text-[10px] uppercase tracking-tight bg-secondary/30 text-secondary-foreground border-none">
            {item.type}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {new Date(item.createdAt).toLocaleDateString()}
          </span>
        </div>
        <CardTitle className="text-sm mt-3 text-foreground font-medium leading-tight flex items-center gap-2">
          {icon}
          <span className="truncate">{item.title}</span>
        </CardTitle>
        <CardDescription className="text-xs pt-1 line-clamp-2">{item.summary}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto pt-0 flex justify-between items-center">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="link" size="sm" className="p-0 h-auto text-xs text-primary/80 hover:text-primary">
              Open Document <ArrowRight className="ml-1 size-3" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>{item.title}</DialogTitle>
              <DialogDescription>Generated {new Date(item.createdAt).toLocaleString()}</DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="p-4 rounded-lg bg-muted/50 border border-border italic text-sm text-muted-foreground">
                {item.summary}
              </div>
              {item.type === 'Financial Report' ? (
                <MarkdownTable content={item.content} />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  {(() => {
                    const lines = item.content.split('\n');
                    if (lines.length < 1) return null;
                    const headers = lines[0].split(',');
                    const data = lines.slice(1).map(l => l.split(','));
                    return <SpreadsheetView title="Saved Export" headers={headers} data={data} className="border-none rounded-none" />;
                  })()}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="size-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={onDelete}>
            <Trash2 className="size-3.5" />
          </Button>
          <Download className="size-3.5 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  )
}

function SavedAnalysisCard({ item, onDelete }: { item: SavedAnalysis, onDelete: () => void }) {
  return (
    <Card className="bg-card/20 border-border hover:border-accent/50 hover:bg-card/40 transition-all group flex flex-col h-full">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <Badge variant="outline" className="text-[10px] uppercase tracking-tight border-accent/30 text-accent bg-accent/5">
            AI Insight
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {new Date(item.createdAt).toLocaleDateString()}
          </span>
        </div>
        <CardTitle className="text-sm mt-3 text-foreground font-medium leading-tight flex items-center gap-2">
          <Sparkles className="size-4 text-accent" />
          <span className="truncate">{item.title}</span>
        </CardTitle>
        <CardDescription className="text-xs pt-1 line-clamp-2">{item.summary}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto pt-0 flex justify-between items-center">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="link" size="sm" className="p-0 h-auto text-xs text-accent/80 hover:text-accent">
              View Insight <ArrowRight className="ml-1 size-3" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>{item.title}</DialogTitle>
              <DialogDescription>Analyst Insight from {new Date(item.createdAt).toLocaleString()}</DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="p-5 rounded-xl bg-accent/5 border border-accent/10 text-sm leading-relaxed text-foreground">
                {item.content}
              </div>
              {item.suggestedChart && item.results && (
                <div className="p-4 border border-border rounded-xl bg-card">
                  <ChartView
                    type={item.suggestedChart.type}
                    title={item.suggestedChart.title}
                    data={item.results}
                    xAxisLabel={item.suggestedChart.xAxisLabel}
                    yAxisLabel={item.suggestedChart.yAxisLabel}
                  />
                </div>
              )}
              {item.rawSpreadsheetData && (() => {
                const lines = item.rawSpreadsheetData.trim().split('\n');
                const headers = lines[0].split(',').map(h => h.trim());
                const data = lines.slice(1).map(l => l.split(',').map(c => c.trim()));
                return (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <SpreadsheetView
                      title="Spreadsheet Data"
                      headers={headers}
                      data={data}
                      className="border-none rounded-none"
                    />
                  </div>
                );
              })()}
            </div>
          </DialogContent>
        </Dialog>
        <Button variant="ghost" size="icon" className="size-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </Button>
      </CardContent>
    </Card>
  )
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** Parse a CSV line correctly — respects quoted cells containing commas */
function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells
}


function SavedPackageCard({ item, onDelete }: { item: SavedReport; onDelete: () => void }) {
  const { headers, rows } = React.useMemo(() => {
    const lines = item.content.split('\n').filter(Boolean)
    const headers = parseCsvLine(lines[0] ?? '')
    const rows = lines.slice(1).map(parseCsvLine)
    return { headers, rows }
  }, [item.content])

  return (
    <Card className="bg-card/20 border-border hover:border-primary/50 hover:bg-card/40 transition-all group flex flex-col h-full">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <Badge variant="secondary" className="text-[10px] uppercase tracking-tight bg-primary/10 text-primary border-primary/20">
            Financial Package
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {new Date(item.createdAt).toLocaleDateString()}
          </span>
        </div>
        <CardTitle className="text-sm mt-3 text-foreground font-medium leading-tight flex items-center gap-2">
          <PackageOpen className="size-4 text-primary" />
          <span className="truncate">{item.title}</span>
        </CardTitle>
        <CardDescription className="text-xs pt-1 line-clamp-2">{item.summary}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto pt-0 flex justify-between items-center">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="link" size="sm" className="p-0 h-auto text-xs text-primary/80 hover:text-primary">
              Open Package <ArrowRight className="ml-1 size-3" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>{item.title}</DialogTitle>
              <DialogDescription>Saved {new Date(item.createdAt).toLocaleString()}</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="rounded-xl border border-border overflow-hidden">
                <SpreadsheetView
                  title={item.title}
                  filename={item.title}
                  headers={headers}
                  data={rows}
                  className="border-none rounded-none"
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => downloadCsv(item.content, item.title)}
          >
            <Download className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={onDelete}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="col-span-full text-center py-20 border-2 border-dashed border-border rounded-xl">
      <Library className="mx-auto size-12 text-muted-foreground opacity-20 mb-4" />
      <p className="text-muted-foreground italic">{text}</p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="col-span-full flex justify-center py-20">
      <Loader2 className="size-8 animate-spin text-primary" />
    </div>
  )
}
