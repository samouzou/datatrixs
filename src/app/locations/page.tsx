
'use client';

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, MoreVertical, RefreshCw, Upload, FileText, Loader2, Trash2, MapPin, Check, AlertCircle } from "lucide-react"
import { useCollection, useFirestore, useUser, useMemoFirebase } from "@/firebase"
import { collection, query, where, doc, setDoc, deleteDoc, writeBatch } from "firebase/firestore"
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

export default function LocationsPage() {
  const { user } = useUser()
  const firestore = useFirestore()
  const { toast } = useToast()
  
  const [isCreateOpen, setIsCreateOpen] = React.useState(false)
  const [isUploadOpen, setIsUploadOpen] = React.useState(false)
  const [uploadingLocation, setUploadingLocation] = React.useState<Location | null>(null)
  const [csvContent, setCsvContent] = React.useState("")
  const [isUploading, setIsUploading] = React.useState(false)
  
  // Create Location Form State
  const [name, setName] = React.useState("")
  const [companyId, setCompanyId] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [city, setCity] = React.useState("")
  const [state, setState] = React.useState("")
  const [zip, setZip] = React.useState("")
  const [phone, setPhone] = React.useState("")

  // Fetch Companies for selection. Filtered by membership.
  const companiesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "companies"), 
      where(`members.${user.uid}`, "in", ["admin", "member", true])
    );
  }, [firestore, user]);
  const { data: companies } = useCollection<Company>(companiesQuery);

  // Fetch Locations. Filtered by membership.
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
      companyMembers: selectedCompany.members, // Denormalize membership for rules
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

  const handleDeleteLocation = (id: string) => {
    if (!firestore) return;
    deleteDoc(doc(firestore, "locations", id));
    toast({
      title: "Location Deleted",
      description: "Business unit removed from portfolio."
    });
  };

  const handleOpenUpload = (location: Location) => {
    setUploadingLocation(location);
    setIsUploadOpen(true);
    setCsvContent("");
  };

  const handleUploadData = async () => {
    if (!firestore || !uploadingLocation || !csvContent.trim()) return;
    
    setIsUploading(true);
    const batch = writeBatch(firestore);
    const now = new Date().toISOString();
    
    try {
      const lines = csvContent.trim().split('\n');
      let successCount = 0;
      
      // Expected Format: Period, Metric, Value
      // Example: Q1 2024, Revenue, 125000
      
      for (const line of lines) {
        const [period, metric, value] = line.split(',').map(s => s.trim());
        
        // Simple validation
        if (!period || !metric || isNaN(Number(value))) continue;
        
        const recordRef = doc(collection(firestore, "locations", uploadingLocation.id, "financial_records"));
        const record: FinancialRecord = {
          locationId: uploadingLocation.id,
          locationName: uploadingLocation.name,
          period,
          metric: metric as FinancialMetric,
          value: Number(value),
          createdAt: now
        };
        
        batch.set(recordRef, record);
        successCount++;
      }
      
      if (successCount > 0) {
        // Update location status to connected if it was pending
        const locRef = doc(firestore, "locations", uploadingLocation.id);
        batch.update(locRef, {
          integrationStatus: 'connected',
          updatedAt: now,
          lastSync: new Date().toLocaleString()
        });
        
        await batch.commit();
        toast({
          title: "Data Uploaded",
          description: `Successfully imported ${successCount} financial records for ${uploadingLocation.name}.`
        });
      } else {
        toast({
          variant: "destructive",
          title: "Upload Failed",
          description: "No valid data found in CSV content."
        });
      }
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to process data. Please check formatting."
      });
    } finally {
      setIsUploading(false);
      setIsUploadOpen(false);
      setUploadingLocation(null);
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
              <DialogDescription>
                Register a new retail or service location and link it to a holding company.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="grid gap-2 col-span-2">
                <Label htmlFor="company">Parent Holding Company</Label>
                <Select onValueChange={setCompanyId} value={companyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies?.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
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
                <Label htmlFor="phone">Phone Number</Label>
                <Input id="phone" placeholder="(555) 000-0000" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateLocation} disabled={!companyId || !name.trim()}>Add Location</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-6">
          {locations?.map((loc) => (
            <Card key={loc.id} className="bg-card/50 border-border shadow-sm group">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-xl">{loc.name}</CardTitle>
                  <CardDescription>
                    {loc.addressLine1}, {loc.city}, {loc.state} {loc.zipCode}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10"
                    onClick={() => handleDeleteLocation(loc.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-muted-foreground"><MoreVertical className="size-4" /></Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Integration</p>
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "size-2 rounded-full",
                        loc.integrationStatus === 'connected' ? "bg-accent" : "bg-yellow-500"
                      )} />
                      <span className="text-sm font-medium">{loc.integrationType}</span>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Parent Company</p>
                    <p className="text-sm truncate">
                      {companies?.find(c => c.id === loc.companyId)?.name || 'Unknown'}
                    </p>
                  </div>
                  
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Status</p>
                    <div className="flex items-center gap-1">
                      <span className={cn(
                        "text-xs capitalize px-2 py-0.5 rounded-full",
                        loc.integrationStatus === 'connected' ? "bg-accent/10 text-accent" : "bg-yellow-500/10 text-yellow-600"
                      )}>
                        {loc.integrationStatus}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" size="sm" className="h-8 text-xs bg-muted/50">
                      <RefreshCw className="mr-2 size-3" /> Sync
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-8 text-xs bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                      onClick={() => handleOpenUpload(loc)}
                    >
                      <Upload className="mr-2 size-3" /> Upload Data
                    </Button>
                  </div>
                </div>
                {loc.lastSync && (
                  <p className="text-[10px] text-muted-foreground mt-4 italic">
                    Last activity: {loc.lastSync}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
          {!locations?.length && (
            <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
              <MapPin className="mx-auto size-12 text-muted-foreground opacity-20 mb-4" />
              <p className="text-muted-foreground">No business locations found. Start by creating a company, then add locations.</p>
            </div>
          )}
        </div>
      )}

      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ingest Financial Data: {uploadingLocation?.name}</DialogTitle>
            <DialogDescription>
              Paste comma-separated values to manually populate this location's ledger.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="bg-primary/5 p-4 rounded-lg border border-primary/10 space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-tight">
                <AlertCircle className="size-3" /> Format Guide
              </div>
              <p className="text-[11px] text-muted-foreground">
                Paste rows in format: <code className="bg-primary/10 px-1 rounded text-primary">Period, Metric, Value</code>
              </p>
              <p className="text-[11px] text-muted-foreground">
                Example metrics: <code className="bg-primary/10 px-1 rounded text-primary">Revenue, Net Profit, COGS, Operating Expenses</code>
              </p>
              <pre className="text-[10px] bg-background p-2 rounded border border-border mt-2 font-mono">
                Q1 2024, Revenue, 150000{"\n"}
                Q1 2024, Net Profit, 25000{"\n"}
                Q2 2024, Revenue, 165000
              </pre>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="csv">CSV Payload</Label>
              <Textarea 
                id="csv" 
                placeholder="Paste your CSV data here..." 
                rows={10}
                className="font-mono text-xs bg-muted/30 focus-visible:ring-primary"
                value={csvContent}
                onChange={(e) => setCsvContent(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadOpen(false)} disabled={isUploading}>Cancel</Button>
            <Button onClick={handleUploadData} disabled={isUploading || !csvContent.trim()} className="bg-primary">
              {isUploading ? <Loader2 className="size-4 animate-spin mr-2" /> : <Check className="size-4 mr-2" />}
              Import Records
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
