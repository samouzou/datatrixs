
'use client';

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { 
  Plus, 
  MoreVertical, 
  Upload, 
  Loader2, 
  Trash2, 
  Check, 
  AlertCircle, 
  ClipboardList, 
  Database,
  ArrowRight,
  History,
  FileText
} from "lucide-react"
import { useCollection, useFirestore, useUser, useMemoFirebase } from "@/firebase"
import { collection, query, where, doc, setDoc, deleteDoc, writeBatch } from "firebase/firestore"
import { updateDocumentNonBlocking } from "@/firebase/non-blocking-updates"
import { cn } from "@/lib/utils"
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Company, Location, FinancialRecord, FinancialMetric } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"

const INITIAL_FINANCIAL_METRICS = ["Revenue", "Net Profit", "COGS", "Operating Expenses", "Inventory Value"];

// Normalization Utility for Periods
const normalizePeriod = (p: string): string => {
  const trimmed = p.trim();
  
  // Try QX YYYY -> YYYY-QN
  const qMatch = trimmed.match(/Q([1-4])\s+(\d{4})/i);
  if (qMatch) return `${qMatch[2]}-Q${qMatch[1]}`;
  
  // Try YYYY QX
  const qMatchRev = trimmed.match(/(\d{4})\s+Q([1-4])/i);
  if (qMatchRev) return `${qMatchRev[1]}-Q${qMatchRev[2]}`;

  // Try Date Parser
  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${y}-${m}`;
  }
  
  return trimmed; // Fallback to raw if unparseable
};

export default function LocationsPage() {
  const { user } = useUser()
  const firestore = useFirestore()
  const { toast } = useToast()
  
  const [isCreateOpen, setIsCreateOpen] = React.useState(false)
  const [isUploadOpen, setIsUploadOpen] = React.useState(false)
  const [uploadStep, setUploadStep] = React.useState<"input" | "mapping">("input")
  const [uploadingLocation, setUploadingLocation] = React.useState<Location | null>(null)
  const [csvContent, setCsvContent] = React.useState("")
  const [isUploading, setIsUploading] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  
  // Custom Metrics State (Shared at Company Level)
  const [availableMetrics, setAvailableMetrics] = React.useState<string[]>(INITIAL_FINANCIAL_METRICS)
  const [isAddingMetric, setIsAddingMetric] = React.useState(false)
  const [newMetricName, setNewMetricName] = React.useState("")

  // Mapping State
  const [headers, setHeaders] = React.useState<string[]>([])
  const [mapping, setMapping] = React.useState<Record<string, string | "ignore">>({})
  const [periodColumn, setPeriodColumn] = React.useState<string>("")

  // Create Location Form State
  const [name, setName] = React.useState("")
  const [companyId, setCompanyId] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [city, setCity] = React.useState("")
  const [state, setState] = React.useState("")
  const [zip, setZip] = React.useState("")
  const [phone, setPhone] = React.useState("")

  // Fetch Companies
  const companiesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "companies"), 
      where(`members.${user.uid}`, "in", ["admin", "member", true])
    );
  }, [firestore, user]);
  const { data: companies } = useCollection<Company>(companiesQuery);

  // Fetch Locations
  const locationsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "locations"), 
      where(`companyMembers.${user.uid}`, "in", ["admin", "member", true])
    );
  }, [firestore, user]);
  const { data: locations, isLoading } = useCollection<Location>(locationsQuery);

  const handleCreateLocation = () => {
    if (!firestore || !user || !companyId || !name.trim()) return;

    const selectedCompany = companies?.find(c => c.id === companyId);
    if (!selectedCompany) return;

    const locRef = doc(collection(firestore, "locations"));
    const locData: Location = {
      id: locRef.id,
      companyId,
      name,
      addressLine1: address,
      city,
      state,
      zipCode: zip,
      phoneNumber: phone,
      companyMembers: selectedCompany.members,
      integrationStatus: 'pending',
      integrationType: 'Manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setDoc(locRef, locData);
    setIsCreateOpen(false);
    resetForm();
    
    toast({
      title: "Location Created",
      description: `Successfully added ${name}.`
    });
  };

  const resetForm = () => {
    setName("");
    setCompanyId("");
    setAddress("");
    setCity("");
    setState("");
    setZip("");
    setPhone("");
  };

  const handleOpenUpload = (location: Location) => {
    const parentCompany = companies?.find(c => c.id === location.companyId);
    setUploadingLocation(location);
    setIsUploadOpen(true);
    setUploadStep("input");
    setCsvContent(location.lastRawData || "");
    setHeaders([]);
    setMapping({});
    setPeriodColumn("");
    
    // Load Holding-level normalization catalog
    const companyMetrics = parentCompany?.customMetrics || [];
    setAvailableMetrics([...INITIAL_FINANCIAL_METRICS, ...companyMetrics]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvContent(content);
      toast({
        title: "File Loaded",
        description: `${file.name} has been parsed. Proceed to map columns.`
      });
    };
    reader.readAsText(file);
  };

  const handleAnalyzeCSV = () => {
    if (!csvContent.trim()) return;
    const lines = csvContent.trim().split('\n');
    if (lines.length < 1) {
      toast({ variant: "destructive", title: "Invalid Data", description: "Need at least a header row." });
      return;
    }

    const firstLine = lines[0].split(',').map(h => h.trim());
    setHeaders(firstLine);
    
    // Auto-Normalization Suggestions
    const initialMapping: Record<string, string | "ignore"> = {};
    let suggestedPeriod = "";
    
    const internalFields = ["ai red flag", "sync status", "data source", "location"];

    firstLine.forEach(h => {
      const lowerH = h.toLowerCase();
      
      // Filter out internal system fields
      if (internalFields.some(f => lowerH.includes(f))) {
        initialMapping[h] = "ignore";
        return;
      }

      if (lowerH.includes('period') || lowerH.includes('date') || lowerH.includes('month') || lowerH.includes('quarter')) {
        suggestedPeriod = h;
      }
      
      const match = availableMetrics.find(m => {
        const lowerM = m.toLowerCase();
        return lowerH.includes(lowerM) || lowerM.includes(lowerH);
      });
      
      if (match) {
        initialMapping[h] = match;
      } else {
        initialMapping[h] = "ignore";
      }
    });

    setMapping(initialMapping);
    setPeriodColumn(suggestedPeriod);
    setUploadStep("mapping");
  };

  const handleAddCustomMetric = () => {
    const trimmed = newMetricName.trim();
    if (!trimmed || !uploadingLocation || !firestore) return;
    
    const parentCompany = companies?.find(c => c.id === uploadingLocation.companyId);
    if (!parentCompany) return;

    const currentMetrics = parentCompany.customMetrics || [];
    if (currentMetrics.includes(trimmed)) {
      toast({ title: "Metric exists", description: "This metric is already in your global chart of accounts." });
      return;
    }

    const updatedMetrics = [...currentMetrics, trimmed];
    setAvailableMetrics(prev => [...prev, trimmed]);
    
    // Persist to Holding Company Document (Normalization Catalog)
    const companyRef = doc(firestore, "companies", parentCompany.id);
    updateDocumentNonBlocking(companyRef, {
      customMetrics: updatedMetrics,
      updatedAt: new Date().toISOString()
    });

    setNewMetricName("");
    setIsAddingMetric(false);
    toast({ title: "Global Metric Added", description: `"${trimmed}" added to holding COA.` });
  };

  const handleUploadData = async () => {
    if (!firestore || !uploadingLocation || !csvContent.trim() || !periodColumn) return;
    
    setIsUploading(true);
    const batch = writeBatch(firestore);
    const now = new Date().toISOString();
    
    try {
      const lines = csvContent.trim().split('\n');
      const dataRows = lines.slice(1);
      let successCount = 0;
      
      for (const line of dataRows) {
        if (!line.trim()) continue;
        const values = line.split(',').map(s => s.trim());
        const rowObj: Record<string, string> = {};
        headers.forEach((h, i) => {
          rowObj[h] = values[i];
        });

        const rawPeriod = rowObj[periodColumn];
        if (!rawPeriod) continue;
        
        // --- DATA NORMALIZATION ---
        const normalizedPeriod = normalizePeriod(rawPeriod);

        Object.entries(mapping).forEach(([colName, metric]) => {
          if (metric === "ignore" || colName === periodColumn) return;
          
          const valStr = rowObj[colName];
          const valNum = Number(valStr?.replace(/[^0-9.-]+/g, ""));
          
          if (!isNaN(valNum)) {
            const recordRef = doc(collection(firestore, "financial_records"));
            const record: FinancialRecord = {
              id: recordRef.id,
              locationId: uploadingLocation.id,
              locationName: uploadingLocation.name,
              period: normalizedPeriod, // Store normalized version
              metric: metric as FinancialMetric,
              value: valNum,
              companyMembers: uploadingLocation.companyMembers,
              createdAt: now
            };
            batch.set(recordRef, record);
            successCount++;
          }
        });
      }
      
      if (successCount > 0) {
        const locRef = doc(firestore, "locations", uploadingLocation.id);
        batch.update(locRef, {
          integrationStatus: 'connected',
          updatedAt: now,
          lastSync: new Date().toLocaleString(),
          lastRawData: csvContent 
        });
        
        await batch.commit();
        toast({ title: "Data Normalized", description: `Ingested ${successCount} records for ${uploadingLocation.name}.` });
        setIsUploadOpen(false);
      } else {
        toast({ variant: "destructive", title: "Upload Failed", description: "No valid numeric data found." });
      }
    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "Normalization Error", description: "Could not process data." });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-foreground font-headline">Manage Locations</h2>
          <p className="text-muted-foreground">Standardizing financials across your private equity portfolio.</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent text-background hover:bg-accent/90" disabled={!companies?.length}>
              <Plus className="mr-2 size-4" /> Add New Location
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add Business Location</DialogTitle>
              <DialogDescription>Register a new retail or service location.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="grid gap-2 col-span-2">
                <Label htmlFor="company">Parent Holding Company</Label>
                <Select onValueChange={setCompanyId} value={companyId}>
                  <SelectTrigger><SelectValue placeholder="Select a company" /></SelectTrigger>
                  <SelectContent>
                    {companies?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 col-span-2">
                <Label htmlFor="name">Location Name</Label>
                <Input id="name" placeholder="e.g., Houston West Branch" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="grid gap-2 col-span-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" placeholder="123 Main St" value={address} onChange={e => setAddress(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" placeholder="Houston" value={city} onChange={e => setCity(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="state">State</Label>
                <Input id="state" placeholder="TX" value={state} onChange={e => setState(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="zip">ZIP Code</Label>
                <Input id="zip" placeholder="77001" value={zip} onChange={e => setZip(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateLocation} disabled={!companyId || !name.trim()}>Add Location</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="size-8 animate-spin text-primary" /></div>
        ) : (
          locations?.map((loc) => (
            <Card key={loc.id} className="bg-card/50 border-border shadow-sm group">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-xl">{loc.name}</CardTitle>
                    {loc.lastRawData && (
                      <div className="flex items-center text-primary" title="Persistent data available">
                        <FileText className="size-4" />
                      </div>
                    )}
                  </div>
                  <CardDescription>{loc.addressLine1}, {loc.city}, {loc.state} {loc.zipCode}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteDoc(doc(firestore, "locations", loc.id))}><Trash2 className="size-4" /></Button>
                  <Button variant="ghost" size="icon" className="text-muted-foreground"><MoreVertical className="size-4" /></Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-4">
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Normalization Status</p>
                    <div className="flex items-center gap-2">
                      <div className={cn("size-2 rounded-full", loc.integrationStatus === 'connected' ? "bg-accent" : "bg-yellow-500")} />
                      <span className="text-sm font-medium capitalize">{loc.integrationStatus}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Last Standard Sync</p>
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <History className="size-3 text-muted-foreground" />
                      {loc.lastSync || "Never"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Parent Holding</p>
                    <p className="text-sm truncate font-medium">{companies?.find(c => c.id === loc.companyId)?.name || 'Unknown'}</p>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" size="sm" className="h-8 text-xs bg-primary/10 text-primary border-primary/20 hover:bg-primary/20" onClick={() => handleOpenUpload(loc)}>
                      <Upload className="mr-2 size-3" /> Normalize Data
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Normalization Engine: {uploadingLocation?.name}</DialogTitle>
            <DialogDescription>Map disparate spreadsheet columns to your global chart of accounts.</DialogDescription>
          </DialogHeader>

          {uploadStep === "input" ? (
            <div className="space-y-4 py-4">
              <Tabs defaultValue="paste" className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-muted/50 h-11">
                  <TabsTrigger value="paste" className="h-9"><ClipboardList className="size-4 mr-2" /> Paste CSV</TabsTrigger>
                  <TabsTrigger value="upload" className="h-9"><Database className="size-4 mr-2" /> Upload CSV</TabsTrigger>
                </TabsList>
                <TabsContent value="paste" className="space-y-4 pt-4">
                  <div className="bg-primary/5 p-3 rounded border border-primary/10 flex justify-between items-center">
                    <p className="text-[11px] text-muted-foreground">
                      <AlertCircle className="size-3 inline mr-1" /> 
                      Normalization will automatically detect periods and scale values.
                    </p>
                    {uploadingLocation?.lastRawData && (
                      <span className="text-[10px] font-bold text-primary uppercase flex items-center gap-1">
                        <FileText className="size-3" /> Persistent cache available
                      </span>
                    )}
                  </div>
                  <Textarea 
                    placeholder="Period, Revenue, COGS, Net Profit..." 
                    rows={12} 
                    className="font-mono text-xs border-muted focus-visible:ring-primary"
                    value={csvContent}
                    onChange={(e) => setCsvContent(e.target.value)}
                  />
                </TabsContent>
                <TabsContent value="upload" className="py-12 border-2 border-dashed border-muted rounded-lg flex flex-col items-center justify-center text-muted-foreground relative hover:bg-muted/30 transition-colors">
                  <input 
                    type="file" 
                    accept=".csv" 
                    className="absolute inset-0 opacity-0 cursor-pointer" 
                    ref={fileInputRef}
                    onChange={handleFileChange}
                  />
                  <Upload className="size-8 mb-4 opacity-20" />
                  <p className="text-sm font-medium">Click or drag a CSV file here</p>
                  <p className="text-[10px] uppercase mt-2 tracking-widest">Supports .CSV UTF-8</p>
                  <Button variant="outline" size="sm" className="mt-4 pointer-events-none">Select File</Button>
                </TabsContent>
              </Tabs>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsUploadOpen(false)}>Cancel</Button>
                <Button onClick={handleAnalyzeCSV} disabled={!csvContent.trim()} className="bg-primary">Continue to Mapping <ArrowRight className="ml-2 size-4" /></Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-6 py-4">
              <div className="grid gap-4">
                <div className="p-4 bg-primary/5 rounded-lg border border-primary/10">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-primary mb-2 block">1. Source Period Normalization</Label>
                  <Select value={periodColumn} onValueChange={setPeriodColumn}>
                    <SelectTrigger className="bg-background border-border h-11">
                      <SelectValue placeholder="Select column containing date or fiscal period" />
                    </SelectTrigger>
                    <SelectContent>
                      {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-2 italic">Engine supports: Q1 2024, Jan-24, 2024-01-01, etc.</p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-foreground block">2. Map to Global Chart of Accounts</Label>
                    <Dialog open={isAddingMetric} onOpenChange={setIsAddingMetric}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 text-[10px] text-primary hover:bg-primary/10">
                          <Plus className="size-3 mr-1" /> Extend COA
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Extend Global Chart of Accounts</DialogTitle>
                          <DialogDescription>Define a new standardized metric for all locations in this holding.</DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                          <Label htmlFor="custom-metric">Metric Name</Label>
                          <Input 
                            id="custom-metric" 
                            placeholder="e.g., Marketing ROI, EBITDA" 
                            value={newMetricName}
                            onChange={(e) => setNewMetricName(e.target.value)}
                            className="mt-2"
                          />
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsAddingMetric(false)}>Cancel</Button>
                          <Button onClick={handleAddCustomMetric} disabled={!newMetricName.trim()}>Add Metric</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider">Source Header</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">Standardized Target</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {headers.filter(h => h !== periodColumn).map((h) => (
                          <TableRow key={h} className="group">
                            <TableCell className="text-xs font-medium py-3">{h}</TableCell>
                            <TableCell className="text-right">
                              <Select 
                                value={mapping[h] || "ignore"} 
                                onValueChange={(val) => setMapping(prev => ({ ...prev, [h]: val }))}
                              >
                                <SelectTrigger className="h-8 text-[11px] bg-background border-border w-[180px] ml-auto">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="ignore" className="text-muted-foreground italic">-- Ignore --</SelectItem>
                                  {availableMetrics.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setUploadStep("input")}>Back</Button>
                <Button onClick={handleUploadData} disabled={isUploading || !periodColumn} className="bg-primary">
                  {isUploading ? <Loader2 className="size-4 animate-spin mr-2" /> : <Check className="size-4 mr-2" />}
                  Normalize & Commit
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
