
'use client';

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Building2, Plus, Users, Shield, Loader2, Trash2, Settings2, Save, X, Mail, Check, Bell } from "lucide-react"
import { useCollection, useFirestore, useUser, useMemoFirebase } from "@/firebase"
import { collection, query, where, doc, getDocs, writeBatch } from "firebase/firestore"
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
import { Company, CompanyInvitation, CompanyRole } from "@/lib/types"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { errorEmitter } from "@/firebase/error-emitter"
import { FirestorePermissionError } from "@/firebase/errors"
import { updateDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking } from "@/firebase/non-blocking-updates"

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
  
  // Invite State
  const [inviteEmail, setInviteEmail] = React.useState("")
  const [inviteRole, setInviteRole] = React.useState<CompanyRole>("member")
  const [isProcessingInvite, setIsProcessingInvite] = React.useState<string | null>(null)

  // Query for companies. Filtered by membership to satisfy security rules.
  const companiesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "companies"),
      where(`members.${user.uid}`, "in", ["admin", "member", true])
    );
  }, [firestore, user]);

  const { data: companies, isLoading } = useCollection<Company>(companiesQuery);

  // Query for pending invitations for current user. 
  const invitationsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.email) return null;
    return query(
      collection(firestore, "company_invitations"),
      where("email", "==", user.email.toLowerCase()),
      where("status", "==", "pending")
    );
  }, [firestore, user]);

  const { data: invitations } = useCollection<CompanyInvitation>(invitationsQuery);

  const handleCreateCompany = () => {
    if (!firestore || !user || !newCompanyName.trim()) return;

    const companyRef = doc(collection(firestore, "companies"));
    const companyData = {
      id: companyRef.id,
      name: newCompanyName,
      description: newCompanyDesc,
      members: { [user.uid]: 'admin' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setDocumentNonBlocking(companyRef, companyData, { merge: true });
    
    setIsCreateOpen(false);
    setNewCompanyName("");
    setNewCompanyDesc("");
  };

  const handleUpdateCompany = () => {
    if (!firestore || !editingCompany) return;

    const companyRef = doc(firestore, "companies", editingCompany.id);
    updateDocumentNonBlocking(companyRef, {
      name: editName,
      description: editDesc,
      updatedAt: new Date().toISOString()
    });

    setEditingCompany(null);
  };

  const handleDeleteCompany = (id: string) => {
    if (!firestore) return;
    deleteDocumentNonBlocking(doc(firestore, "companies", id));
  };

  const handleSendInvite = () => {
    if (!firestore || !user || !editingCompany || !inviteEmail.trim()) return;

    const inviteRef = doc(collection(firestore, "company_invitations"));
    const inviteData: CompanyInvitation = {
      id: inviteRef.id,
      companyId: editingCompany.id,
      companyName: editingCompany.name,
      email: inviteEmail.trim().toLowerCase(),
      role: inviteRole,
      invitedBy: user.uid,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    setDocumentNonBlocking(inviteRef, inviteData, { merge: true });
    setInviteEmail("");
    setInviteRole("member");
  };

  const handleAcceptInvite = async (invite: CompanyInvitation) => {
    if (!firestore || !user) return;
    setIsProcessingInvite(invite.id);

    const now = new Date().toISOString();
    const batch = writeBatch(firestore);

    try {
      // 1. Add user to Company members list
      const companyRef = doc(firestore, "companies", invite.companyId);
      batch.update(companyRef, {
        [`members.${user.uid}`]: invite.role,
        updatedAt: now
      });

      // 2. Mark the invitation as accepted
      const inviteRef = doc(firestore, "company_invitations", invite.id);
      batch.update(inviteRef, { 
        status: 'accepted',
        updatedAt: now
      });

      // 3. Synchronize Membership to all existing Locations
      const locationsQuery = query(
        collection(firestore, "locations"), 
        where("companyId", "==", invite.companyId)
      );
      
      const locationsSnap = await getDocs(locationsQuery);
      const locationIds: string[] = [];
      
      locationsSnap.docs.forEach(locDoc => {
        locationIds.push(locDoc.id);
        batch.update(locDoc.ref, {
          [`companyMembers.${user.uid}`]: invite.role,
          updatedAt: now
        });
      });

      // 4. Deep Synchronize Membership to existing Financial Records
      // This ensures the dashboard calculations "unlock" for the new member immediately.
      for (const locId of locationIds) {
        const recordsQuery = query(
          collection(firestore, "financial_records"),
          where("locationId", "==", locId)
        );
        const recordsSnap = await getDocs(recordsQuery);
        recordsSnap.docs.forEach(recordDoc => {
          batch.update(recordDoc.ref, {
            [`companyMembers.${user.uid}`]: invite.role
          });
        });
      }

      // 5. Commit all updates as a single atomic job
      await batch.commit();

    } catch (e: any) {
      const permissionError = new FirestorePermissionError({
        path: `companies/${invite.companyId}`,
        operation: 'update',
        requestResourceData: { 
          [`members.${user.uid}`]: invite.role,
          updatedAt: now
        }
      });
      errorEmitter.emit('permission-error', permissionError);
    } finally {
      setIsProcessingInvite(null);
    }
  };

  const openManageDialog = (company: Company) => {
    setEditingCompany(company);
    setEditName(company.name);
    setEditDesc(company.description || "");
  };

  const getUserRoleInCompany = (company: Company): CompanyRole => {
    if (!user || !company.members) return 'member';
    const role = company.members[user.uid];
    if (typeof role === 'boolean' && role === true) return 'admin';
    return (role as CompanyRole) || 'member';
  };

  const currentUserRole = React.useMemo(() => {
    if (!user || !editingCompany) return null;
    return getUserRoleInCompany(editingCompany);
  }, [user, editingCompany]);

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

      {invitations && invitations.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold flex items-center gap-2 text-accent">
            <Bell className="size-4" /> Pending Invitations
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {invitations.map((invite) => (
              <Card key={invite.id} className="bg-accent/5 border-accent/20 animate-in fade-in slide-in-from-top-2">
                <CardHeader className="p-4">
                  <CardTitle className="text-sm font-bold">Join {invite.companyName}</CardTitle>
                  <CardDescription className="text-xs">Invited as: <span className="font-bold uppercase text-accent">{invite.role}</span></CardDescription>
                </CardHeader>
                <CardContent className="px-4 pb-4 flex gap-2">
                  <Button 
                    size="sm" 
                    className="bg-accent text-background hover:bg-accent/90" 
                    onClick={() => handleAcceptInvite(invite)}
                    disabled={isProcessingInvite === invite.id}
                  >
                    {isProcessingInvite === invite.id ? <Loader2 className="size-3 animate-spin mr-2" /> : <Check className="mr-2 size-3" />}
                    Accept
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" disabled={isProcessingInvite === invite.id}>
                    Decline
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-6">
          {companies?.map((entity) => {
            const role = getUserRoleInCompany(entity);
            return (
              <Card key={entity.id} className="bg-card/40 border-border backdrop-blur-sm shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="space-y-1">
                    <CardTitle className="text-lg text-foreground">{entity.name}</CardTitle>
                    <CardDescription className="text-[10px] uppercase tracking-wider font-bold text-accent">
                      {role === 'admin' ? 'Administrator' : 'Authorized Member'}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-8 text-xs bg-background/50"
                      onClick={() => openManageDialog(entity)}
                    >
                      {role === 'admin' ? (
                        <><Settings2 className="mr-2 size-3" /> Manage Structure</>
                      ) : (
                        <><Users className="mr-2 size-3" /> View Team</>
                      )}
                    </Button>
                    {role === 'admin' && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteCompany(entity.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
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
                        <p className="text-sm font-medium capitalize">{role}</p>
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
                </CardContent>
              </Card>
            );
          })}
          {!companies?.length && (
            <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
              <Building2 className="mx-auto size-12 text-muted-foreground opacity-20 mb-4" />
              <p className="text-muted-foreground">No holding entities found. Define a parent company to begin organizing your portfolio.</p>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!editingCompany} onOpenChange={(open) => !open && setEditingCompany(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{currentUserRole === 'admin' ? 'Manage Holding Structure' : 'View Team Structure'}</DialogTitle>
            <DialogDescription>
              {currentUserRole === 'admin' 
                ? 'Configure organizational details and access control for this holding entity.'
                : 'View details and active members for this organization.'}
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
                  readOnly={currentUserRole !== 'admin'}
                  className={currentUserRole !== 'admin' ? 'bg-muted' : ''}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-desc">Business Focus & Description</Label>
                <Textarea 
                  id="edit-desc" 
                  rows={4}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  readOnly={currentUserRole !== 'admin'}
                  className={currentUserRole !== 'admin' ? 'bg-muted' : ''}
                />
              </div>
            </TabsContent>

            <TabsContent value="members" className="py-4 space-y-6">
              <div className="space-y-4">
                {currentUserRole === 'admin' && (
                  <div className="flex flex-col gap-2 p-4 rounded-lg bg-muted/30 border border-border">
                    <Label htmlFor="invite-email" className="text-xs font-bold uppercase tracking-wider">Invite New Member</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input 
                          id="invite-email" 
                          placeholder="colleague@company.com" 
                          className="pl-10 h-10"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                        />
                      </div>
                      <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as CompanyRole)}>
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button onClick={handleSendInvite} disabled={!inviteEmail.trim()}>Send Invite</Button>
                    </div>
                  </div>
                )}
                
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Current Access List</p>
                  {editingCompany && Object.entries(editingCompany.members || {}).map(([uid, role]) => {
                    const displayRole = typeof role === 'boolean' ? (role ? 'admin' : 'member') : role;
                    return (
                      <div key={uid} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold">
                            {uid.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-medium">{uid === user?.uid ? "You" : "Authorized User"}</p>
                            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">
                              {displayRole}
                            </p>
                          </div>
                        </div>
                        {currentUserRole === 'admin' && uid !== user?.uid && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10">
                            <X className="size-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setEditingCompany(null)}>
              {currentUserRole === 'admin' ? 'Cancel' : 'Close'}
            </Button>
            {currentUserRole === 'admin' && (
              <Button onClick={handleUpdateCompany} className="bg-primary hover:bg-primary/90">
                <Save className="mr-2 size-4" /> Save Changes
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
