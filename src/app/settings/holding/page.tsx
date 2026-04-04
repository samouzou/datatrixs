'use client';

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Building2, Plus, Users, Shield, MapPin, Loader2, Trash2 } from "lucide-react"
import { useCollection, useFirestore, useUser, useMemoFirebase } from "@/firebase"
import { collection, query, where, doc, serverTimestamp, setDoc, deleteDoc } from "firebase/firestore"
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
import { addDocumentNonBlocking, deleteDocumentNonBlocking } from "@/firebase/non-blocking-updates"
import { Company } from "@/lib/types"

export default function HoldingStructurePage() {
  const { user } = useUser()
  const firestore = useFirestore()
  const [isCreateOpen, setIsCreateOpen] = React.useState(false)
  const [newCompanyName, setNewCompanyName] = React.useState("")
  const [newCompanyDesc, setNewCompanyDesc] = React.useState("")

  // Query for companies where user is a member
  const companiesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "companies"),
      where(`members.${user.uid}`, "==", true)
    );
  }, [firestore, user]);

  const { data: companies, isLoading } = useCollection<Company>(companiesQuery);

  const handleCreateCompany = () => {
    if (!firestore || !user || !newCompanyName.trim()) return;

    const companyRef = doc(collection(firestore, "companies"));
    const companyData = {
      id: companyRef.id,
      name: newCompanyName,
      description: newCompanyDesc,
      members: { [user.uid]: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setDoc(companyRef, companyData);
    setIsCreateOpen(false);
    setNewCompanyName("");
    setNewCompanyDesc("");
  };

  const handleDeleteCompany = (id: string) => {
    if (!firestore) return;
    deleteDoc(doc(firestore, "companies", id));
  };

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Building2 className="size-6 text-primary" />
            <h2 className="text-3xl font-bold tracking-tight text-foreground font-headline">Holding Structure</h2>
          </div>
          <p className="text-muted-foreground">Manage your corporate hierarchy and entity relationships.</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus className="mr-2 size-4" /> Create New Entity
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Holding Company</DialogTitle>
              <DialogDescription>
                Add a new parent organization to your portfolio.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Company Name</Label>
                <Input 
                  id="name" 
                  placeholder="e.g., Acme Holdings" 
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="desc">Description</Label>
                <Textarea 
                  id="desc" 
                  placeholder="Describe this entity..." 
                  value={newCompanyDesc}
                  onChange={(e) => setNewCompanyDesc(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateCompany} disabled={!newCompanyName.trim()}>Create Company</Button>
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
          {companies?.map((entity) => (
            <Card key={entity.id} className="bg-card/40 border-border backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-lg text-foreground">{entity.name}</CardTitle>
                  <CardDescription className="text-xs uppercase tracking-wider font-bold text-primary/80">
                    Parent Entity
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-8 text-xs">Manage</Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    onClick={() => handleDeleteCompany(entity.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                    <Users className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Members</p>
                      <p className="text-sm font-medium">{Object.keys(entity.members || {}).length}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                    <Shield className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Security</p>
                      <p className="text-sm font-medium">Standard</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                    <Building2 className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">ID</p>
                      <p className="text-[10px] font-mono truncate max-w-[100px]">{entity.id}</p>
                    </div>
                  </div>
                </div>
                {entity.description && (
                  <p className="mt-4 text-sm text-muted-foreground">
                    {entity.description}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
          {!companies?.length && (
            <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
              <Building2 className="mx-auto size-12 text-muted-foreground opacity-20 mb-4" />
              <p className="text-muted-foreground">No holding companies found. Create one to get started.</p>
            </div>
          )}
        </div>
      )}

      <Card className="bg-primary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="text-sm font-bold">Hierarchy Visualization</CardTitle>
          <CardDescription className="text-xs">
            The structure above represents how data roll-ups are calculated for your global dashboard and AI analyst.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
