'use client';

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, MoreVertical, RefreshCw, Upload, FileText, Loader2, Trash2, MapPin } from "lucide-react"
import { useCollection, useFirestore, useUser, useMemoFirebase } from "@/firebase"
import { collection, query, where, doc, setDoc, deleteDoc } from "firebase/firestore"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Company, Location } from "@/lib/types"

export default function LocationsPage() {
  const { user } = useUser()
  const firestore = useFirestore()
  const [isCreateOpen, setIsCreateOpen] = React.useState(false)
  
  // Form State
  const [name, setName] = React.useState("")
  const [companyId, setCompanyId] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [city, setCity] = React.useState("")
  const [state, setState] = React.useState("")
  const [zip, setZip] = React.useState("")
  const [phone, setPhone] = React.useState("")

  // Fetch Companies for selection
  const companiesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, "companies"), where(`members.${user.uid}`, "==", true));
  }, [firestore, user]);
  const { data: companies } = useCollection<Company>(companiesQuery);

  // Fetch Locations
  const locationsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, "locations"), where(`companyMembers.${user.uid}`, "==", true));
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
  };

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-foreground font-headline">Manage Locations</h2>
          <p className="text-muted-foreground">Portfolio of retail tire shops across your holding companies.</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent text-background hover:bg-accent/90" disabled={!companies?.length}>
              <Plus className="mr-2 size-4" /> Add New Location
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add Retail Location</DialogTitle>
              <DialogDescription>
                Register a new tire shop location and link it to a holding company.
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
                <Input id="name" placeholder="e.g., Houston West Tires" value={name} onChange={e => setName(e.target.value)} />
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
            <Card key={loc.id} className="bg-card/50 border-border">
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
                    className="text-destructive hover:bg-destructive/10"
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
                    <Button variant="outline" size="sm" className="h-8 text-xs bg-muted/50">
                      <Upload className="mr-2 size-3" /> Upload Excel
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {!locations?.length && (
            <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
              <MapPin className="mx-auto size-12 text-muted-foreground opacity-20 mb-4" />
              <p className="text-muted-foreground">No retail locations found. Start by creating a company, then add locations.</p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-secondary/20 border-secondary/30">
          <CardHeader>
            <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center mb-2">
              <RefreshCw className="size-5 text-primary" />
            </div>
            <CardTitle>Automatic Ingestion</CardTitle>
            <CardDescription>
              Connect your locations' QuickBooks or NetSuite accounts for real-time financial normalization and categorization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="link" className="text-primary p-0">Learn about our standardized schema →</Button>
          </CardContent>
        </Card>
        
        <Card className="bg-accent/5 border-accent/20">
          <CardHeader>
            <div className="size-10 rounded-full bg-accent/20 flex items-center justify-center mb-2">
              <FileText className="size-5 text-accent" />
            </div>
            <CardTitle>Legacy Data Upload</CardTitle>
            <CardDescription>
              Locations using Excel or manual accounting can upload CSV files. Our AI will automatically map headers to your global metrics.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="link" className="text-accent p-0">Download upload template →</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
