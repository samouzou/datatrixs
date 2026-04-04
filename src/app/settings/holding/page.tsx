'use client';

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Building2, Plus, Users, Shield, Loader2, Trash2, Settings2, Save, X } from "lucide-react"
import { useCollection, useFirestore, useUser, useMemoFirebase } from "@/firebase"
import { collection, query, where, doc, setDoc, deleteDoc, updateDoc } from "firebase/firestore"
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
import { Company } from "@/lib/types"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function HoldingStructurePage() {
  const { user } = useUser()
  const firestore = useFirestore()
  
  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = React.useState(false)
  const [newCompanyName, setNewCompanyName] = React.useState("")
  const [newCompanyDesc, setNewCompanyDesc] = React.useState("")

  // Edit/Manage Modal State
  const [editingCompany, setEditingCompany] = React.useState<Company | null>(null)
  const [editName, setEditName] = React.useState("")
  const [editDesc, setEditDesc] = React.useState("")

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
    const companyData: Company = {
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

  const handleUpdateCompany = () => {
    if (!firestore || !editingCompany) return;

    const companyRef = doc(firestore, "companies", editingCompany.id);
    updateDoc(companyRef, {
      name: editName,
      description: editDesc,
      updatedAt: new Date().toISOString()
    });

    setEditingCompany(null);
  };

  const handleDeleteCompany = (id: string) => {
    if (!firestore) return;
    deleteDoc(doc(firestore, "companies", id));
  };

  const openManageDialog = (company: Company) => {
    setEditingCompany(company);
    setEditName(company.name);
    setEditDesc(company.description || "");
  };

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Building2 className="size-6 text-primary" />
            <h2 className="text-3xl font-bold tracking-tight text-foreground font-headline">Holding Structure</h2>
          </div>
          <p className="text-muted-foreground">Manage your parent organizations and corporate entities.</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus className="mr-2 size-4" /> Add Parent Entity
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Holding Company</DialogTitle>
              <DialogDescription>
                Define a new parent organization for your portfolio management.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Entity Name</Label>
                <Input 
                  id="name" 
                  placeholder="e.g., Datatrixs Strategic Holdings" 
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="desc">Description (Optional)</Label>
                <Textarea 
                  id="desc" 
                  placeholder="Briefly describe this organization's focus..." 
                  value={newCompanyDesc}
                  onChange={(e) => setNewCompanyDesc(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateCompany} disabled={!newCompanyName.trim()}>Save Entity</Button>
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
            <Card key={entity.id} className="bg-card/40 border-border backdrop-blur-sm shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-lg text-foreground">{entity.name}</CardTitle>
                  <CardDescription className="text-[10px] uppercase tracking-wider font-bold text-accent">
                    Active Portfolio Entity
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-xs bg-background/50"
                    onClick={() => openManageDialog(entity)}
                  >
                    <Settings2 className="mr-2 size-3" /> Manage Structure
                  </Button>
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
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Authorized Users</p>
                      <p className="text-sm font-medium">{Object.keys(entity.members || {}).length}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                    <Shield className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Access Level</p>
                      <p className="text-sm font-medium">Standard</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                    <Building2 className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Entity Identifier</p>
                      <p className="text-[10px] font-mono truncate max-w-[120px]">{entity.id}</p>
                    </div>
                  </div>
                </div>
                {entity.description && (
                  <p className="mt-4 text-sm text-muted-foreground line-clamp-2">
                    {entity.description}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
          {!companies?.length && (
            <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
              <Building2 className="mx-auto size-12 text-muted-foreground opacity-20 mb-4" />
              <p className="text-muted-foreground">No holding entities found. Define a parent company to begin organizing your portfolio.</p>
            </div>
          )}
        </div>
      )}

      {/* Manage Structure Dialog */}
      <Dialog open={!!editingCompany} onOpenChange={(open) => !open && setEditingCompany(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Holding Structure</DialogTitle>
            <DialogDescription>
              Configure organizational details and access control for this holding entity.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="profile" className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="profile">Entity Profile</TabsTrigger>
              <TabsTrigger value="members">Authorized Members</TabsTrigger>
            </TabsList>
            
            <TabsContent value="profile" className="space-y-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Legal Entity Name</Label>
                <Input 
                  id="edit-name" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-desc">Business Focus & Description</Label>
                <Textarea 
                  id="edit-desc" 
                  rows={4}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                />
              </div>
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Technical ID</p>
                <code className="text-xs break-all">{editingCompany?.id}</code>
              </div>
            </TabsContent>

            <TabsContent value="members" className="py-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Current Access List</p>
                  <Button size="sm" variant="outline" className="h-8 text-[10px] uppercase font-bold">
                    <Plus className="mr-1 size-3" /> Add Member
                  </Button>
                </div>
                <div className="space-y-2">
                  {editingCompany && Object.entries(editingCompany.members || {}).map(([uid, role]) => (
                    <div key={uid} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold">
                          {uid.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-medium">{uid === user?.uid ? "You (Current Session)" : "Authorized User"}</p>
                          <p className="text-[10px] text-muted-foreground uppercase">{role === true ? "Administrator" : "Member"}</p>
                        </div>
                      </div>
                      {uid !== user?.uid && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                          <X className="size-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setEditingCompany(null)}>Cancel</Button>
            <Button onClick={handleUpdateCompany} className="bg-primary hover:bg-primary/90">
              <Save className="mr-2 size-4" /> Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="bg-primary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="text-sm font-bold">Entity Relationships</CardTitle>
          <CardDescription className="text-xs">
            These entities serve as the root for your data roll-ups. All business locations and financial transactions are organized under this hierarchy.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
