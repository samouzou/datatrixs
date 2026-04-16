
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
  Save,
  PackageOpen,
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
import { PackageTab } from "@/components/reports/package-tab"
import { useFirestore, useUser, useCollection, useMemoFirebase } from "@/firebase"
import { query, collection, where, doc } from "firebase/firestore"
import { setDocumentNonBlocking } from "@/firebase/non-blocking-updates"
import { SavedReport, FinancialRecord, FinancialPlan, Company } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"
import { useVertical } from "@/contexts/vertical-context"

function MarkdownTable({ content }: { content: string }) {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return <pre className="text-xs p-4 bg-muted rounded whitespace-pre-wrap">{content}</pre>;

  const headers = lines[0].split('|').filter(Boolean).map(s => s.trim());
  const rows = lines.slice(2).map(line => line.split('|').filter(Boolean).map(s => s.trim()));

  if (headers.length === 0) return <pre className="text-xs p-4 bg-muted rounded whitespace-pre-wrap">{content}</pre>;

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 border-border hover:bg-muted/50">
            {headers.map((h, i) => (
              <TableHead key={i} className="text-xs font-bold uppercase tracking-wider text-foreground h-10">{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i} className="border-border hover:bg-muted/50">
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
  const { user } = useUser()
  const firestore = useFirestore()
  const { toast } = useToast()
  const vertical = useVertical()
  
  const [reportQuery, setReportQuery] = React.useState("")
  const [exportQuery, setExportQuery] = React.useState("")
  const [reportResult, setReportResult] = React.useState<AiAssistedReportGenerationOutput | null>(null)
  const [exportResult, setExportResult] = React.useState<AiDrivenCustomDataExportOutput | null>(null)
  const [loadingReport, setLoadingReport] = React.useState(false)
  const [loadingExport, setLoadingExport] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState<string | null>(null)

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

  const plansQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "financial_plans"),
      where(`companyMembers.${user.uid}`, "in", ["admin", "member", true])
    );
  }, [firestore, user]);
  const { data: plans } = useCollection<FinancialPlan>(plansQuery);

  const aiContext = React.useMemo(() => {
    if (!records) return "[]";
    return JSON.stringify(records.map(r => ({
      location: r.locationName,
      period: r.period,
      metric: r.metric,
      value: r.value
    })));
  }, [records]);

  const handleGenerateReport = async () => {
    if (!reportQuery.trim() || loadingReport || isRecordsLoading) return
    setLoadingReport(true)
    try {
      const result = await aiAssistedReportGeneration({ 
        query: reportQuery,
        financialData: aiContext
      })
      setReportResult(result)
    } catch (error) {
      console.error(error)
      toast({ variant: "destructive", title: "Generation Failed", description: "AI could not process your report request." })
    } finally {
      setLoadingReport(false)
    }
  }

  const handleGenerateExport = async () => {
    if (!exportQuery.trim() || loadingExport || isRecordsLoading) return
    setLoadingExport(true)
    try {
      const result = await aiDrivenCustomDataExport({ 
        query: exportQuery,
        financialData: aiContext
      })
      setExportResult(result)
    } catch (error) {
      console.error(error)
      toast({ variant: "destructive", title: "Export Failed", description: "AI could not compile the spreadsheet data." })
    } finally {
      setLoadingExport(false)
    }
  }

  const handleSaveToLibrary = (type: 'report' | 'export') => {
    if (!user || !firestore) return;
    
    setIsSaving(type);

    // Default to the user's primary holding or just themselves if no companies found
    const defaultMembership = (companies && companies.length > 0) 
      ? companies[0].members 
      : { [user.uid]: 'admin' };

    const reportId = doc(collection(firestore, "saved_reports")).id;
    const reportRef = doc(firestore, "saved_reports", reportId);

    let savedData: SavedReport;

    if (type === 'report' && reportResult) {
      savedData = {
        id: reportId,
        userId: user.uid,
        title: `${reportResult.reportType}: ${reportResult.entityName}`,
        type: 'Financial Report',
        summary: reportResult.reportSummary,
        content: reportResult.reportContent,
        companyMembers: defaultMembership,
        createdAt: new Date().toISOString()
      };
    } else if (type === 'export' && exportResult) {
      const csvContent = [
        exportResult.header.join(','),
        ...exportResult.data.map(row => row.join(','))
      ].join('\n');

      savedData = {
        id: reportId,
        userId: user.uid,
        title: exportResult.tableName,
        type: 'Data Export',
        summary: `Grounded data export based on: "${exportQuery}"`,
        content: csvContent,
        companyMembers: defaultMembership,
        createdAt: new Date().toISOString()
      };
    } else return;

    setDocumentNonBlocking(reportRef, savedData, { merge: true });
    
    setTimeout(() => {
      setIsSaving(null);
      toast({
        title: "Saved to Library",
        description: `"${savedData.title}" is now available in your Saved Library.`
      });
    }, 500);
  }

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FilePieChart className="size-6 text-accent" />
            <h2 className="text-3xl font-bold tracking-tight text-foreground font-headline">Reports & Exports</h2>
          </div>
          <p className="text-muted-foreground">Generate tailored financial documentation and structured data for your organization.</p>
        </div>
      </div>

      <Tabs defaultValue="reports" className="space-y-6">
        <TabsList className="bg-card/50 border border-border p-1 h-12">
          <TabsTrigger value="reports" className="px-6 data-[state=active]:bg-primary h-10">AI Report Builder</TabsTrigger>
          <TabsTrigger value="exports" className="px-6 data-[state=active]:bg-primary h-10">Data Explorer</TabsTrigger>
          <TabsTrigger value="packages" className="px-6 data-[state=active]:bg-primary h-10 gap-2">
            <PackageOpen className="size-4" /> Financial Packages
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="space-y-6 animate-in fade-in duration-300">
          <Card className="bg-card/40 border-border backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-foreground">
                <Sparkles className="size-5 text-accent" />
                Intelligent Report Builder
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Describe the report you need, and our AI will build a professional P&L or executive summary.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => { e.preventDefault(); handleGenerateReport(); }} className="flex gap-3">
                <Input 
                  placeholder={isRecordsLoading ? "Grounded data loading..." : "e.g., 'Consolidated P&L for all locations in Q4'"} 
                  className="bg-muted/50 border-border focus-visible:ring-primary h-12"
                  value={reportQuery}
                  onChange={(e) => setReportQuery(e.target.value)}
                  disabled={loadingReport || isRecordsLoading}
                />
                <Button size="lg" onClick={handleGenerateReport} disabled={loadingReport || isRecordsLoading || !reportQuery.trim()} className="bg-primary hover:bg-primary/90 h-12 px-8">
                  {loadingReport ? <Loader2 className="size-4 animate-spin mr-2" /> : <Plus className="size-4 mr-2" />}
                  Generate
                </Button>
              </form>
            </CardContent>
          </Card>

          {reportResult && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
              <Card className="bg-card/30 border-border overflow-hidden">
                <CardHeader className="bg-muted/20 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Badge variant="outline" className="text-[10px] uppercase tracking-widest text-accent border-accent/30 bg-accent/5">
                        {reportResult.reportType}
                      </Badge>
                      <CardTitle className="text-xl text-foreground">{reportResult.entityName} — {reportResult.period}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-9 border-border text-xs bg-muted/50 hover:bg-muted" onClick={() => handleSaveToLibrary('report')} disabled={!!isSaving}>
                        {isSaving === 'report' ? <Loader2 className="size-3.5 animate-spin mr-2" /> : <Save className="size-3.5 mr-2" />}
                        Save to Library
                      </Button>
                    </div>
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
           <Card className="bg-card/40 border-border backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-foreground">
                <TableIcon className="size-5 text-primary" />
                Custom Data Explorer
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Compile multi-location datasets into a high-fidelity spreadsheet for external analysis.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => { e.preventDefault(); handleGenerateExport(); }} className="flex gap-3">
                <Input 
                  placeholder={isRecordsLoading ? "Grounded data loading..." : "e.g., 'Export revenue and inventory values for all Texas stores'"} 
                  className="bg-muted/50 border-border focus-visible:ring-primary h-12"
                  value={exportQuery}
                  onChange={(e) => setExportQuery(e.target.value)}
                  disabled={loadingExport || isRecordsLoading}
                />
                <Button size="lg" onClick={handleGenerateExport} disabled={loadingExport || isRecordsLoading || !exportQuery.trim()} className="bg-primary hover:bg-primary/90 h-12 px-8">
                  {loadingExport ? <Loader2 className="size-4 animate-spin mr-2" /> : <FileText className="size-4 mr-2" />}
                  Build Dataset
                </Button>
              </form>
            </CardContent>
          </Card>

          {exportResult && (
            <div className="animate-in fade-in slide-in-from-top-4 duration-500 space-y-4">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => handleSaveToLibrary('export')} disabled={!!isSaving}>
                  {isSaving === 'export' ? <Loader2 className="size-3.5 animate-spin mr-2" /> : <Save className="size-3.5 mr-2" />}
                  Save to Library
                </Button>
              </div>
              <SpreadsheetView 
                title={exportResult.tableName}
                headers={exportResult.header}
                data={exportResult.data}
              />
            </div>
          )}
        </TabsContent>
        <TabsContent value="packages" className="space-y-6 animate-in fade-in duration-300">
          <PackageTab
            records={records ?? []}
            plans={plans ?? []}
            companies={companies ?? []}
            user={user}
            firestore={firestore}
            vertical={vertical}
            onSaved={title => toast({ title: "Saved to Library", description: `"${title}" is now available in your Saved Library.` })}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
