'use client';

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  Layers,
  ArrowRight,
  History,
  FileText,
  Cloud,
  Link2,
  Building2,
  Lock,
  Zap,
  Pencil
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useCollection, useFirestore, useUser, useMemoFirebase } from "@/firebase"
import { collection, query, where, doc, setDoc, deleteDoc, writeBatch, getDocs } from "firebase/firestore"
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
import { getVerticalConfig } from "@/lib/verticals"
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
import Link from "next/link"

const FALLBACK_METRICS = ["Revenue", "Net Profit", "COGS", "Operating Expenses", "Inventory Value"];

// Mock Ledger Data for API Simulations
const MOCK_LEDGERS = {
  QuickBooks: ["Sales: Retail", "Cost of Goods Sold", "Gross Profit", "Total Expenses", "Warehouse Inventory", "Operating Income"],
  NetSuite: ["Total Revenue (USD)", "Cost of Sales", "Net Income", "SG&A Expenses", "On-Hand Inventory", "EBITDA"],
  SageIntacct: ["Net Revenue", "Cost of Revenue", "R&D Expense", "Clinical Trial Costs", "SG&A Expense", "Operating Income", "WIP Inventory"]
};

// Normalization Utility for Periods
const normalizePeriod = (p: string): string => {
  const trimmed = p.trim();
  const qMatch = trimmed.match(/Q([1-4])\s+(\d{4})/i);
  if (qMatch) return `${qMatch[2]}-Q${qMatch[1]}`;
  const qMatchRev = trimmed.match(/(\d{4})\s+Q([1-4])/i);
  if (qMatchRev) return `${qMatchRev[1]}-Q${qMatchRev[2]}`;
  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${y}-${m}`;
  }
  return trimmed; 
};

const parseAccountingNumber = (val: string): number => {
  if (!val) return 0;
  let clean = val.trim();
  const isNegative = clean.startsWith('(') && clean.endsWith(')');
  if (isNegative) clean = clean.slice(1, -1);
  const num = Number(clean.replace(/[^0-9.-]+/g, ""));
  return isNegative ? -Math.abs(num) : num;
};

export default function LocationsPage() {
  const { user } = useUser()
  const firestore = useFirestore()
  const { toast } = useToast()
  
  const [isCreateOpen, setIsCreateOpen] = React.useState(false)
  const [isUploadOpen, setIsUploadOpen] = React.useState(false)
  const [uploadStep, setUploadStep] = React.useState<"source" | "input" | "mapping">("source")
  const [uploadingLocation, setUploadingLocation] = React.useState<Location | null>(null)
  const [selectedSource, setSelectedSource] = React.useState<'Manual' | 'QuickBooks' | 'NetSuite' | 'SageIntacct' | 'Excel'>('Manual')
  const [csvContent, setCsvContent] = React.useState("")
  const [isConnecting, setIsConnecting] = React.useState(false)
  const [isUploading, setIsUploading] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  
  const [availableMetrics, setAvailableMetrics] = React.useState<string[]>(FALLBACK_METRICS)
  const [isAddingMetric, setIsAddingMetric] = React.useState(false)
  const [newMetricName, setNewMetricName] = React.useState("")

  const [headers, setHeaders] = React.useState<string[]>([])
  const [mapping, setMapping] = React.useState<Record<string, string | "ignore">>({})
  const [periodColumn, setPeriodColumn] = React.useState<string>("")
  const [programColumn, setProgramColumn] = React.useState<string>("")

  const [name, setName] = React.useState("")
  const [companyId, setCompanyId] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [city, setCity] = React.useState("")
  const [state, setState] = React.useState("")
  const [zip, setZip] = React.useState("")
  const [phone, setPhone] = React.useState("")

  const [isEditOpen, setIsEditOpen] = React.useState(false)
  const [editingLocation, setEditingLocation] = React.useState<Location | null>(null)
  const [editName, setEditName] = React.useState("")
  const [editAddress, setEditAddress] = React.useState("")
  const [editCity, setEditCity] = React.useState("")
  const [editState, setEditState] = React.useState("")
  const [editZip, setEditZip] = React.useState("")
  const [editPhone, setEditPhone] = React.useState("")

  const companiesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "companies"), 
      where(`members.${user.uid}`, "in", ["admin", "member", true])
    );
  }, [firestore, user]);
  const { data: companies } = useCollection<Company>(companiesQuery);
  const activeCompany = companies?.[0];

  const locationsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "locations"), 
      where(`companyMembers.${user.uid}`, "in", ["admin", "member", true])
    );
  }, [firestore, user]);
  const { data: locations, isLoading } = useCollection<Location>(locationsQuery);

  // License Ceiling Enforcement
  const locationLimit = activeCompany?.subscription?.locationLimit || 0;
  const currentUnitCount = locations?.length || 0;
  const isLimitReached = currentUnitCount >= locationLimit && locationLimit > 0;

  const handleCreateLocation = () => {
    if (!firestore || !user || !companyId || !name.trim()) return;
    if (isLimitReached) {
      toast({
        variant: "destructive",
        title: "Capacity Reached",
        description: "Please upgrade your Entity Connection Licenses to add more units."
      });
      return;
    }

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
    setUploadStep("source");
    setSelectedSource(location.integrationType === 'Manual' ? 'Manual' : location.integrationType);
    setCsvContent(location.lastRawData || "");
    setHeaders([]);
    setMapping({});
    setPeriodColumn("");
    setProgramColumn("");

    const verticalMetrics = getVerticalConfig(parentCompany?.vertical).defaultMetrics;
    const companyMetrics = parentCompany?.customMetrics || [];
    setAvailableMetrics([...verticalMetrics, ...companyMetrics.filter(m => !verticalMetrics.includes(m))]);
  };

  const handleSourceSelect = (source: 'Manual' | 'QuickBooks' | 'NetSuite' | 'SageIntacct' | 'Excel') => {
    setSelectedSource(source);
    if (source === 'Manual' || source === 'Excel') {
      setUploadStep("input");
    } else {
      setIsConnecting(true);
      setTimeout(() => {
        setIsConnecting(false);
        const mockHeaders = ["Period", ...MOCK_LEDGERS[source as 'QuickBooks' | 'NetSuite' | 'SageIntacct']];
        setHeaders(mockHeaders);
        setPeriodColumn("Period");
        
        const initialMapping: Record<string, string | "ignore"> = {};
        mockHeaders.forEach(h => {
          if (h === "Period") return;
          const lowerH = h.toLowerCase();
          const match = availableMetrics.find(m => {
            const lowerM = m.toLowerCase();
            return lowerH.includes(lowerM) || lowerM.includes(lowerH);
          });
          initialMapping[h] = match || "ignore";
        });
        setMapping(initialMapping);
        setUploadStep("mapping");
        
        toast({
          title: `${source} Connected`,
          description: `Fetched ${mockHeaders.length} account headers from the cloud ledger.`
        });
      }, 1500);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvContent(content);
      toast({ title: "File Loaded", description: `${file.name} has been parsed.` });
    };
    reader.readAsText(file);
  };

  const handleAnalyzeCSV = () => {
    if (!csvContent.trim()) return;
    const lines = csvContent.trim().split('\n');
    if (lines.length < 1) return;
    const firstLine = lines[0].split(',').map(h => h.trim());
    setHeaders(firstLine);
    const initialMapping: Record<string, string | "ignore"> = {};
    let suggestedPeriod = "";
    let suggestedProgram = "";
    firstLine.forEach(h => {
      const lowerH = h.toLowerCase();
      if (lowerH.includes('period') || lowerH.includes('date') || lowerH.includes('month') || lowerH.includes('quarter')) {
        suggestedPeriod = h;
        return;
      }
      if (lowerH === 'class' || lowerH === 'program' || lowerH === 'segment') {
        suggestedProgram = h;
        return;
      }
      const match = availableMetrics.find(m => {
        const lowerM = m.toLowerCase();
        return lowerH.includes(lowerM) || lowerM.includes(lowerH);
      });
      initialMapping[h] = match || "ignore";
    });
    setMapping(initialMapping);
    setPeriodColumn(suggestedPeriod);
    setProgramColumn(suggestedProgram);
    setUploadStep("mapping");
  };

  const handleAddCustomMetric = () => {
    const trimmed = newMetricName.trim();
    if (!trimmed || !uploadingLocation || !firestore) return;
    const parentCompany = companies?.find(c => c.id === uploadingLocation.companyId);
    if (!parentCompany) return;
    const currentMetrics = parentCompany.customMetrics || [];
    if (currentMetrics.includes(trimmed)) return;
    const updatedMetrics = [...currentMetrics, trimmed];
    setAvailableMetrics(prev => [...prev, trimmed]);
    const companyRef = doc(firestore, "companies", parentCompany.id);
    updateDocumentNonBlocking(companyRef, { customMetrics: updatedMetrics, updatedAt: new Date().toISOString() });
    setNewMetricName("");
    setIsAddingMetric(false);
  };

  const handleUploadData = async () => {
    if (!firestore || !uploadingLocation || !periodColumn) return;
    setIsUploading(true);
    const batch = writeBatch(firestore);
    const now = new Date().toISOString();
    try {
      let dataRows: string[][] = [];
      if (selectedSource === 'Manual' || selectedSource === 'Excel') {
        const lines = csvContent.trim().split('\n');
        dataRows = lines.slice(1).map(l => l.split(',').map(s => s.trim()));
      } else {
        dataRows = [
          ["2024-Q1", "125000", "75000", "50000", "20000", "15000", "12000"],
          ["2024-Q2", "135000", "80000", "55000", "22000", "16000", "14000"]
        ];
      }
      let successCount = 0;
      for (const row of dataRows) {
        const rowObj: Record<string, string> = {};
        headers.forEach((h, i) => { rowObj[h] = row[i]; });
        const rawPeriod = rowObj[periodColumn];
        if (!rawPeriod) continue;
        const normalizedPeriod = normalizePeriod(rawPeriod);
        const programValue = programColumn ? (rowObj[programColumn] || '').trim() : '';
        Object.entries(mapping).forEach(([colName, metric]) => {
          if (metric === "ignore" || colName === periodColumn || colName === programColumn) return;
          const valStr = rowObj[colName];
          const valNum = parseAccountingNumber(valStr);
          if (!isNaN(valNum)) {
            const metricSlug = metric.toLowerCase().replace(/\s+/g, '_');
            const programSlug = programValue ? `_${programValue.toLowerCase().replace(/\s+/g, '_')}` : '';
            const deterministicId = `${uploadingLocation.id}_${normalizedPeriod}_${metricSlug}${programSlug}`;
            const recordRef = doc(firestore, "financial_records", deterministicId);
            const record: FinancialRecord = {
              id: deterministicId,
              locationId: uploadingLocation.id,
              locationName: uploadingLocation.name,
              period: normalizedPeriod,
              metric: metric as FinancialMetric,
              value: valNum,
              ...(programValue ? { program: programValue } : {}),
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
          integrationType: selectedSource,
          updatedAt: now,
          lastSync: new Date().toLocaleString(),
          lastRawData: csvContent 
        });
        await batch.commit();
        toast({ title: "Sync Complete", description: `Standardized ${successCount} financial data points.` });
        setIsUploadOpen(false);
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Normalization Error", description: "Could not process ledger data." });
    } finally {
      setIsUploading(false);
    }
  };

  const handleOpenEdit = (loc: Location) => {
    setEditingLocation(loc)
    setEditName(loc.name)
    setEditAddress(loc.addressLine1 || "")
    setEditCity(loc.city || "")
    setEditState(loc.state || "")
    setEditZip(loc.zipCode || "")
    setEditPhone(loc.phoneNumber || "")
    setIsEditOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!firestore || !editingLocation || !editName.trim()) return
    const locRef = doc(firestore, "locations", editingLocation.id)
    await updateDocumentNonBlocking(locRef, {
      name: editName.trim(),
      addressLine1: editAddress,
      city: editCity,
      state: editState,
      zipCode: editZip,
      phoneNumber: editPhone,
      updatedAt: new Date().toISOString(),
    })
    toast({ title: "Location Updated", description: `${editName} has been saved.` })
    setIsEditOpen(false)
    setEditingLocation(null)
  }

  const handleDeleteLocation = async (loc: Location) => {
    if (!firestore) return;
    const batch = writeBatch(firestore);

    // Delete the location itself
    batch.delete(doc(firestore, "locations", loc.id));

    // Cascade delete all financial records for this location
    const recordsSnap = await getDocs(
      query(collection(firestore, "financial_records"), where("locationId", "==", loc.id))
    );
    recordsSnap.docs.forEach(d => batch.delete(d.ref));

    await batch.commit();
    toast({ title: "Location Removed", description: `${loc.name} and its financial data have been deleted.` });
  };

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-foreground font-headline">Manage Locations</h2>
          <div className="flex items-center gap-3">
            <p className="text-muted-foreground">Standardizing financials across your business units.</p>
            {activeCompany?.subscription && (
              <Badge variant="outline" className={cn(
                "h-6 px-3 text-[10px] uppercase font-bold tracking-widest",
                isLimitReached ? "border-destructive/50 text-destructive bg-destructive/5" : "border-primary/30 text-primary bg-primary/5"
              )}>
                {currentUnitCount} / {locationLimit} Unit Licenses Used
              </Badge>
            )}
          </div>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button 
              className={cn(
                "transition-all",
                isLimitReached ? "bg-primary hover:bg-primary/90" : "bg-accent text-background hover:bg-accent/90"
              )} 
              disabled={!companies?.length}
            >
              {isLimitReached ? <Zap className="mr-2 size-4" /> : <Plus className="mr-2 size-4" />}
              {isLimitReached ? "Expand Capacity" : "Add New Location"}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{isLimitReached ? "Capacity Reached" : "Add Business Unit"}</DialogTitle>
              <DialogDescription>
                {isLimitReached
                  ? "You have used all available unit licenses."
                  : "Register a new business unit and connect its data source."}
              </DialogDescription>
            </DialogHeader>
            
            {isLimitReached ? (
              <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
                <div className="p-4 rounded-full bg-destructive/10">
                  <Building2 className="size-12 text-destructive" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-bold text-lg">Expansion Required</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    You have used all {locationLimit} unit licenses. To manage more units, please expand your capacity.
                  </p>
                </div>
                <Button asChild className="bg-primary">
                  <Link href="/settings/billing">
                    Update Subscription & Add Licenses <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="grid gap-2 col-span-2">
                  <Label htmlFor="company">Parent Organization</Label>
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
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" placeholder="(555) 000-0000" value={phone} onChange={e => setPhone(e.target.value)} />
                </div>
              </div>
            )}
            
            {!isLimitReached && (
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateLocation} disabled={!companyId || !name.trim()}>Add Location</Button>
              </DialogFooter>
            )}
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
                    {loc.integrationType !== 'Manual' && (
                      <div className="flex items-center text-primary" title={`${loc.integrationType} API Connected`}>
                        <Cloud className="size-4" />
                      </div>
                    )}
                  </div>
                  <CardDescription>{loc.addressLine1}, {loc.city}, {loc.state} {loc.zipCode}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setTimeout(() => handleOpenEdit(loc), 0)}>
                        <Pencil className="size-4 mr-2" /> Edit Location
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDeleteLocation(loc)}>
                        <Trash2 className="size-4 mr-2" /> Delete Location
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Last Sync</p>
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <History className="size-3 text-muted-foreground" />
                      {loc.lastSync || "Never"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Source Engine</p>
                    <p className="text-sm font-medium capitalize">{loc.integrationType}</p>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" size="sm" className="h-8 text-xs bg-primary/10 text-primary border-primary/20 hover:bg-primary/20" onClick={() => handleOpenUpload(loc)}>
                      <Database className="mr-2 size-3" /> Connect Data Source
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
        {!locations?.length && !isLoading && (
          <div className="text-center py-20 border-2 border-dashed border-border rounded-xl bg-card/20">
            <Building2 className="mx-auto size-12 text-muted-foreground opacity-20 mb-4" />
            <p className="text-muted-foreground font-medium italic">No normalized locations found. Add your first unit to begin aggregation.</p>
          </div>
        )}
      </div>

      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) setEditingLocation(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Location</DialogTitle>
            <DialogDescription>Update the details for this business unit.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="grid gap-2 col-span-2">
              <Label htmlFor="edit-name">Location Name</Label>
              <Input id="edit-name" placeholder="e.g., Houston West Branch" value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className="grid gap-2 col-span-2">
              <Label htmlFor="edit-address">Address</Label>
              <Input id="edit-address" placeholder="123 Main St" value={editAddress} onChange={e => setEditAddress(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-city">City</Label>
              <Input id="edit-city" placeholder="Houston" value={editCity} onChange={e => setEditCity(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-state">State</Label>
              <Input id="edit-state" placeholder="TX" value={editState} onChange={e => setEditState(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-zip">ZIP Code</Label>
              <Input id="edit-zip" placeholder="77001" value={editZip} onChange={e => setEditZip(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input id="edit-phone" placeholder="(555) 000-0000" value={editPhone} onChange={e => setEditPhone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={!editName.trim()}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Data Connection Engine: {uploadingLocation?.name}</DialogTitle>
            <DialogDescription>Select a data source and map accounts to your global standardized schema.</DialogDescription>
          </DialogHeader>

          {uploadStep === "source" && (
            <div className="grid grid-cols-2 gap-4 py-8">
              {[
                { id: 'Manual', name: 'Manual Entry / CSV', icon: ClipboardList, desc: 'Paste or upload ledger snapshots.' },
                { id: 'QuickBooks', name: 'QuickBooks Online', icon: Cloud, desc: 'Direct API sync with Intuit.' },
                { id: 'NetSuite', name: 'Oracle NetSuite', icon: Database, desc: 'Enterprise ERP integration.' },
                { id: 'SageIntacct', name: 'Sage Intacct', icon: Layers, desc: 'Multi-dimensional GL with class & department.' },
                { id: 'Excel', name: 'Excel Loader', icon: FileText, desc: 'Import from .XLSX workbooks.' }
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSourceSelect(s.id as any)}
                  className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-center space-y-3 group"
                >
                  <div className="p-3 rounded-full bg-muted group-hover:bg-primary/20 transition-colors">
                    <s.icon className="size-8 text-muted-foreground group-hover:text-primary" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-sm">{s.name}</h4>
                    <p className="text-[11px] text-muted-foreground leading-tight">{s.desc}</p>
                  </div>
                </button>
              ))}
              {isConnecting && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center z-50">
                  <Loader2 className="size-12 animate-spin text-primary mb-4" />
                  <p className="font-bold">Establishing Secure Connection...</p>
                  <p className="text-xs text-muted-foreground">Authorizing OAuth 2.0 Handshake</p>
                </div>
              )}
            </div>
          )}

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
                  <Button variant="outline" size="sm" className="mt-4 pointer-events-none">Select File</Button>
                </TabsContent>
              </Tabs>
              <DialogFooter>
                <Button variant="outline" onClick={() => setUploadStep("source")}>Back</Button>
                <Button onClick={handleAnalyzeCSV} disabled={!csvContent.trim()} className="bg-primary">Analyze Mapping <ArrowRight className="ml-2 size-4" /></Button>
              </DialogFooter>
            </div>
          ) : uploadStep === "mapping" && (
            <div className="space-y-6 py-4">
              <div className="grid gap-4">
                <div className="p-4 bg-primary/5 rounded-lg border border-primary/10 flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div>
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-primary mb-2 block">1. Period Column</Label>
                      <Select value={periodColumn} onValueChange={setPeriodColumn}>
                        <SelectTrigger className="bg-background border-border h-11 w-[200px]">
                          <SelectValue placeholder="Select period column" />
                        </SelectTrigger>
                        <SelectContent>
                          {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {programColumn && (
                      <div>
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-accent mb-2 block">Program Dimension</Label>
                        <div className="h-11 flex items-center gap-2 px-3 rounded-md bg-accent/10 border border-accent/20 text-sm font-medium text-accent">
                          <Layers className="size-3" /> {programColumn}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Connected via</p>
                    <p className="text-sm font-bold flex items-center gap-1 justify-end">
                      <Link2 className="size-3 text-accent" /> {selectedSource}
                    </p>
                  </div>
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
                  <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader className="bg-muted/50 sticky top-0 z-10">
                        <TableRow>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider">Source Ledger Account</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">Standardized Target</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {headers.filter(h => h !== periodColumn && h !== programColumn).map((h) => (
                          <TableRow key={h} className="group">
                            <TableCell className="text-xs font-medium py-3">{h}</TableCell>
                            <TableCell className="text-right">
                              <Select 
                                value={mapping[h] || "ignore"} 
                                onValueChange={(val) => setMapping(prev => ({ ...prev, [h]: val }))}
                              >
                                <SelectTrigger className="h-8 text-[11px] bg-background border-border w-[200px] ml-auto">
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
                <Button variant="outline" onClick={() => setUploadStep("source")}>Change Source</Button>
                <Button onClick={handleUploadData} disabled={isUploading || !periodColumn} className="bg-primary">
                  {isUploading ? <Loader2 className="size-4 animate-spin mr-2" /> : <Check className="size-4 mr-2" />}
                  Normalize & Sync
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
