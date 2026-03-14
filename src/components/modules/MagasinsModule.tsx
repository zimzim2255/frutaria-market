import { useEffect, useState } from 'react';
import { projectId } from '../../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Plus, ArrowLeft, FileText, DollarSign, CheckCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { toast } from 'sonner@2.0.3';
import { ClientDetailsPage } from '../ClientDetailsPage';

interface MagasinsModuleProps {
  session: any;
}

export function MagasinsModule({ session }: MagasinsModuleProps) {
  const [stores, setStores] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    manager_password: '',
  });
  const [selectedStore, setSelectedStore] = useState<any>(null);
  const [storeInvoices, setStoreInvoices] = useState<any[]>([]);
  const [storeChecks, setStoreChecks] = useState<any[]>([]);
  const [storeUsers, setStoreUsers] = useState<any[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [currentUserRole, setCurrentUserRole] = useState<string>('user');
  const [currentUserPermissions, setCurrentUserPermissions] = useState<string[]>([]);

  const isAdmin = currentUserRole === 'admin';
  const hasPermission = (permission: string): boolean => {
    if (isAdmin) return true;
    return currentUserPermissions.includes(permission);
  };

  const canViewMagasins = hasPermission('Voir les Magasins');

  // Restrict store modifications:
  // - Only admin can add/edit/delete magasins.
  // - acc_manager, user, manager, magasin_manager can view but cannot modify.
  const canManageMagasins = currentUserRole === 'admin';
  const canAddMagasin = canManageMagasins && hasPermission('Ajouter un Magasin');
  const canEditMagasin = canManageMagasins && hasPermission('Modifier un Magasin');
  const canDeleteMagasin = canManageMagasins && hasPermission('Supprimer un Magasin');

  const fetchStores = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/stores`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setStores(data.stores || []);
      }
    } catch (error) {
      console.error('Error fetching stores:', error);
      toast.error('Erreur lors du chargement des magasins');
    }
  };

  // Resolve current user role/permissions from DB via backend (/users)
  const fetchEffectiveUser = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/users`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const me = data?.users?.find(
          (u: any) => String(u.id) === String(session?.user?.id) || u.email === session?.user?.email
        );

        const role = me?.role || 'user';
        const permissions: string[] = Array.isArray(me?.permissions) ? me.permissions : [];

        setCurrentUserRole(role);
        setCurrentUserPermissions(permissions);
      }
    } catch (error) {
      console.error('[MagasinsModule] Error fetching effective user:', error);
    }
  };

  useEffect(() => {
    if (session?.access_token) {
      fetchEffectiveUser();
      fetchStores();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  const resetForm = () => {
    setEditingStore(null);
    setFormData({ name: '', email: '', phone: '', address: '', manager_password: '' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canAddMagasin && !editingStore) {
      toast.error("Vous n'avez pas la permission « Ajouter un Magasin »");
      return;
    }

    if (!canEditMagasin && editingStore) {
      toast.error("Vous n'avez pas la permission « Modifier un Magasin »");
      return;
    }

    try {
      // Editing store: keep current behavior (no account creation here)
      if (editingStore) {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/stores/${editingStore.id}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              name: formData.name,
              email: formData.email,
              phone: formData.phone,
              address: formData.address,
            }),
          }
        );

        if (response.ok) {
          toast.success('Magasin modifié');
          setDialogOpen(false);
          resetForm();
          fetchStores();
        } else {
          toast.error("Erreur lors de l'enregistrement du magasin");
        }
        return;
      }

      // Creating a new store: create a manager user + store (quick access)
      // This reuses the existing backend flow used in UsersModule.
      if (!formData.email || !formData.manager_password) {
        toast.error('Veuillez renseigner Email du magasin (utilisé comme login) et Mot de passe');
        return;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/users`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            // Use the store email as the manager login (avoid asking twice)
            email: formData.email,
            name: formData.name,
            role: 'manager',
            password: formData.manager_password,
            permissions: [],
            storeData: {
              storeName: formData.name,
              storeEmail: formData.email,
              storePhone: formData.phone,
              storeAddress: formData.address,
            },
          }),
        }
      );

      if (response.ok) {
        toast.success('Magasin ajouté + compte gestionnaire créé');
        setDialogOpen(false);
        resetForm();
        fetchStores();
      } else {
        const err = await response.json().catch(() => ({}));
        toast.error(err.error || "Erreur lors de la création du magasin/compte");
      }
    } catch (error) {
      console.error('Error saving store:', error);
      toast.error("Erreur lors de l'enregistrement du magasin");
    }
  };

  const handleEdit = (store: any) => {
    if (!canEditMagasin) {
      toast.error("Vous n'avez pas la permission « Modifier un Magasin »");
      return;
    }

    setEditingStore(store);
    setFormData({
      name: store.name || '',
      email: store.email || '',
      phone: store.phone || '',
      address: store.address || '',
      manager_password: '',
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!canDeleteMagasin) {
      toast.error("Vous n'avez pas la permission « Supprimer un Magasin »");
      return;
    }

    if (!confirm('Êtes-vous sûr de vouloir supprimer ce magasin?')) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/stores/${id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        toast.success('Magasin supprimé');
        fetchStores();
      } else {
        toast.error("Erreur lors de la suppression du magasin");
      }
    } catch (error) {
      console.error('Error deleting store:', error);
      toast.error("Erreur lors de la suppression du magasin");
    }
  };

  const loadStoreDetails = async (store: any) => {
    try {
      setDetailsLoading(true);

      // Fetch invoices for this store
      const invoicesResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/invoices`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (invoicesResponse.ok) {
        const data = await invoicesResponse.json();
        const storeInvoicesList = (data.invoices || []).filter(
          (inv: any) => inv.store_id === store.id || inv.client_name === store.name
        );
        setStoreInvoices(storeInvoicesList);
      }

      // Fetch checks for this store
      const checksResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (checksResponse.ok) {
        const data = await checksResponse.json();
        const storeChecksList = (data.check_inventory || []).filter(
          (check: any) => check.given_to === store.name
        );
        setStoreChecks(storeChecksList);
      }

      // Fetch users for this store
      const usersResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/users`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (usersResponse.ok) {
        const data = await usersResponse.json();
        const storeUsersList = (data.users || []).filter(
          (user: any) => user.store_id === store.id
        );
        setStoreUsers(storeUsersList);
      }
    } catch (error) {
      console.error('Error fetching store details:', error);
      toast.error('Erreur lors du chargement des détails du magasin');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleOpenDetails = (store: any) => {
    // Open magasin in the SAME "client-like" details page UI
    setSelectedStore(store);
  };

  const filteredStores = stores.filter((store) => {
    const term = searchTerm.toLowerCase();
    return (
      store.name?.toLowerCase().includes(term) ||
      store.email?.toLowerCase().includes(term) ||
      store.phone?.includes(searchTerm) ||
      store.address?.toLowerCase().includes(term)
    );
  });

  // Calculate totals for details view
  const totalInvoiced = storeInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
  const totalPaid = storeInvoices.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0);
  const totalRemaining = storeInvoices.reduce((sum, inv) => sum + (inv.remaining_balance || 0), 0);
  const totalChecks = storeChecks.reduce((sum, check) => sum + (check.amount_value || 0), 0);

  // If a store is selected, open the client-like details page for magasin
  if (selectedStore) {
    return (
      <ClientDetailsPage
        client={selectedStore}
        session={session}
        onBack={() => {
          setSelectedStore(null);
          // keep list refreshed
          fetchStores();
        }}
      />
    );
  }

  // Legacy store details view removed in favor of ClientDetailsPage
  if (false) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => setSelectedStore(null)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Retour
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{selectedStore.name}</h1>
              <p className="text-gray-600">Détails du magasin & transactions</p>
            </div>
          </div>
        </div>

        {/* Store Information Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Email</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{selectedStore.email || '-'}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Téléphone</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{selectedStore.phone || '-'}</p>
            </CardContent>
          </Card>
        </div>

        {/* Address Card */}
        <Card>
          <CardHeader>
            <CardTitle>Adresse</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">{selectedStore.address || '-'}</p>
          </CardContent>
        </Card>

        {/* Financial Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-800 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Total Facturé
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-600">{totalInvoiced.toFixed(2)} MAD</p>
            </CardContent>
          </Card>

          <Card className="bg-green-50 border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-800 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Total Payé
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">{totalPaid.toFixed(2)} MAD</p>
            </CardContent>
          </Card>

          <Card className="bg-red-50 border-red-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-800 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Solde Restant
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-600">{totalRemaining.toFixed(2)} MAD</p>
            </CardContent>
          </Card>
        </div>

        {/* Invoices Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Factures ({storeInvoices.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {detailsLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : storeInvoices.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Aucune facture pour ce magasin</p>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N° Facture</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Montant Total</TableHead>
                      <TableHead>Montant Payé</TableHead>
                      <TableHead>Solde</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {storeInvoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-mono text-sm">{invoice.invoice_number}</TableCell>
                        <TableCell>{new Date(invoice.created_at).toLocaleDateString('fr-FR')}</TableCell>
                        <TableCell>{invoice.total_amount?.toFixed(2)} MAD</TableCell>
                        <TableCell>{invoice.amount_paid?.toFixed(2)} MAD</TableCell>
                        <TableCell>{invoice.remaining_balance?.toFixed(2)} MAD</TableCell>
                        <TableCell>
                          <Badge variant={
                            invoice.status === 'paid' ? 'default' :
                            invoice.status === 'partial' ? 'secondary' :
                            'outline'
                          }>
                            {invoice.status === 'paid' ? 'Payée' :
                             invoice.status === 'partial' ? 'Partielle' :
                             'En attente'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Checks Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Chèques ({storeChecks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {detailsLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : storeChecks.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Aucun chèque pour ce magasin</p>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N° Chèque</TableHead>
                      <TableHead>Montant</TableHead>
                      <TableHead>Date d'Échéance</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Solde Restant</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {storeChecks.map((check) => (
                      <TableRow key={check.id}>
                        <TableCell className="font-mono text-sm">{check.check_id_number}</TableCell>
                        <TableCell>{check.amount_value?.toFixed(2)} MAD</TableCell>
                        <TableCell>
                          {check.due_date 
                            ? new Date(check.due_date).toLocaleDateString('fr-FR')
                            : check.execution_date
                            ? new Date(check.execution_date).toLocaleDateString('fr-FR')
                            : '-'
                          }
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            check.status === 'used' ? 'default' :
                            check.status === 'pending' ? 'secondary' :
                            'outline'
                          }>
                            {check.status === 'used' ? 'Utilisé' :
                             check.status === 'pending' ? 'En attente' :
                             check.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{check.remaining_balance?.toFixed(2)} MAD</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Users Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              👥 Utilisateurs ({storeUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {detailsLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : storeUsers.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Aucun utilisateur assigné à ce magasin</p>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead>Rôle</TableHead>
                      <TableHead>Date de création</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {storeUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-mono text-sm">{user.email}</TableCell>
                        <TableCell>{user.name || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={
                            user.role === 'admin' ? 'default' :
                            user.role === 'manager' ? 'secondary' :
                            'outline'
                          }>
                            {user.role === 'admin' ? 'Admin' :
                             user.role === 'manager' ? 'Gestionnaire' :
                             'Utilisateur'}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(user.created_at).toLocaleDateString('fr-FR')}</TableCell>
                        <TableCell>
                          <Badge variant={user.is_active ? 'default' : 'outline'}>
                            {user.is_active ? 'Actif' : 'Inactif'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!canViewMagasins) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Accès refusé</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">Vous n'avez pas la permission « Voir les Magasins ».</p>
        </CardContent>
      </Card>
    );
  }

  // Show the list view
  return (
    <div className="space-y-6">
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-800">À propos de vos Magasins</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-blue-700 text-sm">
            Gérez ici tous vos magasins (points de vente). Chaque magasin peut avoir son propre stock, ses ventes et ses utilisateurs.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Magasins</CardTitle>
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" disabled={!canAddMagasin} title={!canAddMagasin ? "Vous n'avez pas la permission « Ajouter un Magasin »" : undefined}>
                <Plus className="w-4 h-4 mr-2" />
                Ajouter un magasin
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingStore ? 'Modifier le magasin' : 'Nouveau magasin'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nom du magasin</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Magasin Principal"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Ex: contact@magasin.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Téléphone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="Ex: +212 6 12 34 56 78"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Adresse</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Ex: 123 Rue de la Paix, Casablanca"
                  />
                </div>

                {!editingStore && (
                  <div className="space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800 font-semibold">Compte Gestionnaire (accès rapide)</p>
                    <p className="text-xs text-blue-700">
                      En créant un magasin ici, vous pouvez aussi créer directement le compte "Gestionnaire" associé.
                    </p>
                    <p className="text-xs text-blue-700">
                      Le login du gestionnaire sera l'email du magasin.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="manager_password">Mot de passe du gestionnaire *</Label>
                      <Input
                        id="manager_password"
                        type="password"
                        value={formData.manager_password}
                        onChange={(e) => setFormData({ ...formData, manager_password: e.target.value })}
                        placeholder="Mot de passe"
                        required
                      />
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Annuler
                  </Button>
                  <Button type="submit">{editingStore ? 'Enregistrer' : 'Ajouter'}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4 gap-4">
            <Input
              placeholder="Rechercher un magasin..."
              className="max-w-xs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="w-full overflow-x-auto">
            <div className="min-w-max">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[150px]">Nom du magasin</TableHead>
                    <TableHead className="min-w-[200px]">Email</TableHead>
                    <TableHead className="min-w-[120px]">Téléphone</TableHead>
                    <TableHead className="min-w-[150px]">Adresse</TableHead>
                    <TableHead className="min-w-[280px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStores.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                        Aucun magasin trouvé
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredStores.map((store) => (
                      <TableRow key={store.id}>
                        <TableCell className="font-medium">{store.name}</TableCell>
                        <TableCell>{store.email}</TableCell>
                        <TableCell>{store.phone}</TableCell>
                        <TableCell className="truncate">{store.address}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenDetails(store)}
                            >
                              Voir
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(store)}
                              disabled={!canEditMagasin}
                              title={!canEditMagasin ? "Vous n'avez pas la permission « Modifier un Magasin »" : undefined}
                            >
                              Modifier
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDelete(store.id)}
                              disabled={!canDeleteMagasin}
                              title={!canDeleteMagasin ? "Vous n'avez pas la permission « Supprimer un Magasin »" : undefined}
                            >
                              Supprimer
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
