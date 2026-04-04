
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
    
    // Load Company-level custom metrics + default metrics
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
        description: `${file.name} has been parsed. Click 'Continue' to map columns.`
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
    
    // Auto-suggest mappings
    const initialMapping: Record<string, string | "ignore"> = {};
    let suggestedPeriod = "";
    
    firstLine.forEach(h => {
      const lowerH = h.toLowerCase();
      if (lowerH.includes('period') || lowerH.includes('date') || lowerH.includes('month') || lowerH.includes('quarter')) {
        suggestedPeriod = h;
      }
      
      const match = availableMetrics.find(m => lowerH.includes(m.toLowerCase()));
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
      toast({ title: "Metric exists", description: "This metric is already in your holding's list." });
      return;
    }

    const updatedMetrics = [...currentMetrics, trimmed];
    
    // Update local state
    setAvailableMetrics(prev => [...prev, trimmed]);
    
    // Persist to Company document (Shared across all locations)
    const companyRef = doc(firestore, "companies", parentCompany.id);
    updateDocumentNonBlocking(companyRef, {
      customMetrics: updatedMetrics,
      updatedAt: new Date().toISOString()
    });

    setNewMetricName("");
    setIsAddingMetric(false);
    toast({ 
      title: "Metric Added", 
      description: `"${trimmed}" is now shared across all locations in this holding.` 
    });
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

        const period = rowObj[periodColumn];
        if (!period) continue;

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
              period,
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
        toast({ title: "Data Ingested", description: `Successfully imported ${successCount} data points for ${uploadingLocation.name}.` });
        setIsUploadOpen(false);
      } else {
        toast({ variant: "destructive", title: "Upload Failed", description: "No valid numeric data found in mapped columns." });
      }
    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: "Failed to process data." });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-foreground font-headline">Manage Locations</h2>
          <p className="text-muted-foreground">Portfolio of retail locations across your holding companies.</p>
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
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Status</p>
                    <div className="flex items-center gap-2">
                      <div className={cn("size-2 rounded-full", loc.integrationStatus === 'connected' ? "bg-accent" : "bg-yellow-500")} />
                      <span className="text-sm font-medium capitalize">{loc.integrationStatus}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Last Sync</p>
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <History className="size-3 text-muted-foreground" />
                      {loc.lastSync || "Never"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Parent Company</p>
                    <p className="text-sm truncate">{companies?.find(c => c.id === loc.companyId)?.name || 'Unknown'}</p>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" size="sm" className="h-8 text-xs bg-primary/10 text-primary" onClick={() => handleOpenUpload(loc)}>
                      <Upload className="mr-2 size-3" /> Ingest Financials
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
            <DialogTitle>Ingest Financial Data: {uploadingLocation?.name}</DialogTitle>
            <DialogDescription>Map your spreadsheet columns to internal financial metrics.</DialogDescription>
          </DialogHeader>

          {uploadStep === "input" ? (
            <div className="space-y-4 py-4">
              <Tabs defaultValue="paste" className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-muted/50 h-11">
                  <TabsTrigger value="paste" className="h-9"><ClipboardList className="size-4 mr-2" /> Paste CSV</TabsTrigger>
                  <TabsTrigger value="upload" className="h-9"><Database className="size-4 mr-2" /> Upload File</TabsTrigger>
                </TabsList>
                <TabsContent value="paste" className="space-y-4 pt-4">
                  <div className="bg-primary/5 p-3 rounded border border-primary/10 flex justify-between items-center">
                    <p className="text-[11px] text-muted-foreground">
                      <AlertCircle className="size-3 inline mr-1" /> 
                      Ensure the first row contains headers. Use comma-separated values.
                    </p>
                    {uploadingLocation?.lastRawData && (
                      <span className="text-[10px] font-bold text-primary uppercase flex items-center gap-1">
                        <FileText className="size-3" /> Showing stored data
                      </span>
                    )}
                  </div>
                  <Textarea 
                    placeholder="Period, Revenue, COGS, Net Profit..." 
                    rows={12} 
                    className="font-mono text-xs"
                    value={csvContent}
                    onChange={(e) => setCsvContent(e.target.value)}
                  />
                </TabsContent>
                <TabsContent value="upload" className="py-12 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground relative">
                  <input 
                    type="file" 
                    accept=".csv" 
                    className="absolute inset-0 opacity-0 cursor-pointer" 
                    ref={fileInputRef}
                    onChange={handleFileChange}
                  />
                  <Upload className="size-8 mb-4 opacity-20" />
                  <p className="text-sm">Click or drag a CSV file here</p>
                  <p className="text-[10px] uppercase mt-2">Supports .CSV only</p>
                  <Button variant="outline" size="sm" className="mt-4 pointer-events-none">Browse Files</Button>
                </TabsContent>
              </Tabs>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsUploadOpen(false)}>Cancel</Button>
                <Button onClick={handleAnalyzeCSV} disabled={!csvContent.trim()}>Continue to Mapping <ArrowRight className="ml-2 size-4" /></Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-6 py-4">
              <div className="grid gap-4">
                <div className="p-3 bg-muted/30 rounded-lg border border-border">
                  <Label className="text-xs font-bold uppercase tracking-tight mb-2 block">1. Select Period Column</Label>
                  <Select value={periodColumn} onValueChange={setPeriodColumn}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Choose the column containing the date/period" />
                    </SelectTrigger>
                    <SelectContent>
                      {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1 italic">Format: "Q1 2024", "Oct 2023", "2024-01-01"</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold uppercase tracking-tight block">2. Map Financial Metrics</Label>
                    <Dialog open={isAddingMetric} onOpenChange={setIsAddingMetric}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 text-[10px] text-primary">
                          <Plus className="size-3 mr-1" /> Add Custom Metric
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Custom Financial Metric</DialogTitle>
                          <DialogDescription>Define a new metric type for your holding's analysis.</DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                          <Label htmlFor="custom-metric">Metric Name</Label>
                          <Input 
                            id="custom-metric" 
                            placeholder="e.g., Marketing ROI, EBITDA, etc." 
                            value={newMetricName}
                            onChange={(e) => setNewMetricName(e.target.value)}
                          />
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsAddingMetric(false)}>Cancel</Button>
                          <Button onClick={handleAddCustomMetric} disabled={!newMetricName.trim()}>Add Metric</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="rounded-md border border-border overflow-hidden bg-card">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="text-[10px] font-bold">CSV Header</TableHead>
                          <TableHead className="text-[10px] font-bold">Datatrixs Metric</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {headers.filter(h => {
                          const lowerH = h.toLowerCase();
                          return h !== periodColumn && 
                                 !lowerH.includes('ai red flag') && 
                                 !lowerH.includes('sync status') &&
                                 !lowerH.includes('data source');
                        }).map((h) => (
                          <TableRow key={h}>
                            <TableCell className="text-xs font-medium">{h}</TableCell>
                            <TableCell>
                              <Select 
                                value={mapping[h] || "ignore"} 
                                onValueChange={(val) => setMapping(prev => ({ ...prev, [h]: val }))}
                              >
                                <SelectTrigger className="h-8 text-xs bg-background">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="ignore" className="text-muted-foreground italic">-- Ignore Column --</SelectItem>
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
                <Button onClick={handleUploadData} disabled={isUploading || !periodColumn}>
                  {isUploading ? <Loader2 className="size-4 animate-spin mr-2" /> : <Check className="size-4 mr-2" />}
                  Ingest {csvContent.trim().split('\n').filter(l => l.trim()).length - 1} Records
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
