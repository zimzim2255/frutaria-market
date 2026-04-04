import { useState, useEffect } from 'react';
import { projectId } from '../../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Plus, Edit, Trash2, Search, Users, Shield, UserCheck, ArrowLeft, Clock, Activity, Power, Eye, EyeOff } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import { toast } from 'sonner';

interface UsersModuleProps {
  session: any;
}

const permissionCategories = {
  "Tableau de Bord": [
    "Voir le Tableau de Bord",
    "Voir les Rapports"
  ],
  "Produits": [
    "Voir les Produits",
    "Ajouter un Produit",
    "Modifier un Produit",
    "Supprimer un Produit"
  ],
  "Modèles de Produits": [
    "Voir les Modèles de Produits",
    "Ajouter un Modèle de Produit",
    "Modifier un Modèle de Produit",
    "Supprimer un Modèle de Produit"
  ],
  "Magasins": [
    "Voir les Magasins",
    "Ajouter un Magasin",
    "Modifier un Magasin",
    "Supprimer un Magasin",
    "Échanges Inter-Magasins"
  ],
  "Fournisseurs": [
    "Voir les Fournisseurs",
    "Ajouter un Fournisseur",
    "Modifier un Fournisseur",
    "Supprimer un Fournisseur"
  ],
  "Commandes": [
    "Voir les Commandes",
    "Créer une Commande",
    "Modifier une Commande",
    "Supprimer une Commande",
    "Voir les Bons de Commande",
    "Créer un Bon de Commande",
    "Modifier un Bon de Commande",
    "Supprimer un Bon de Commande"
  ],
  "Ventes": [
    "Voir les Ventes",
    "Créer une Vente",
    "Modifier une Vente",
    "Supprimer une Vente",
    "Voir l'Historique des Ventes",
    "Imprimer une Vente"
  ],
  "Paiements": [
    "Voir les Paiements",
    "Ajouter un Paiement",
    "Modifier un Paiement",
    "Supprimer un Paiement"
  ],
  "Chèques": [
    "Voir les Chèques",
    "Ajouter un Chèque",
    "Modifier un Chèque",
    "Supprimer un Chèque",
    "Voir l'Inventaire des Chèques",
    "Transférer un Chèque au Coffre",
    "Payer un Fournisseur par Chèque",
    "Payer un Client par Chèque"
  ],
  "Achats / Transferts": [
    "Voir Achats/Transferts",
    "Créer un Achat/Transfert",
    "Modifier un Achat/Transfert",
    "Supprimer un Achat/Transfert"
  ],
  "Factures (Création)": [
    "Voir la page Facture (Création)",
    "Créer une Facture"
  ],
  "Historique des Factures": [
    "Voir l'Historique des Factures",
    "Voir le Détail d'une Facture",
    "Imprimer / Télécharger une Facture (PDF)",
    "Modifier une Facture",
    "Supprimer une Facture"
  ],
  "Remises": [
    "Voir les Remises",
    "Ajouter une Remise",
    "Modifier une Remise",
    "Supprimer une Remise"
  ],
  "Clients": [
    "Voir les Clients",
    "Ajouter un Client",
    "Modifier un Client",
    "Supprimer un Client"
  ],
  "Caisse": [
    "Voir la Caisse",
    "Voir l'Espace Caisse",
    "Voir les Charges",
    "Exporter Caisse (CSV)",
    "Voir Détails Paiement (Caisse)"
  ],
  "Prêts": [
    "Voir les Prêts",
    "Ajouter un Prêt",
    "Enregistrer un Paiement de Prêt",
    "Supprimer un Prêt",
    "Voir le Détail d'un Prêt"
  ],
  "Historique": [
    "Voir Historique Ajouts",
    "Exporter Historique Ajouts (CSV)",
    "Voir Détails Ajout",
    "Voir Historique Références Stock",
    "Exporter Historique Références Stock (CSV)",
    "Voir Détails Référence Stock",
    "Modifier Historique Références Stock"
  ],
  "Coffre": [
    "Voir le Coffre",
    "Ajouter une Entrée Coffre",
    "Modifier une Entrée Coffre",
    "Supprimer une Entrée Coffre",
    "Créer une Avance Fournisseur (Coffre)",
    "Paiement Global Fournisseur (Coffre)"
  ],
  "Administration": [
    "Gérer les Utilisateurs"
  ]
};

const permissionsList = Object.values(permissionCategories).flat();

// Updated default permissions based on the requested authorization model:
// - Admin: authorization to all functions, and is the only one allowed to view/use the Coffre (safe) zone.
// - Manager: has all operational permissions EXCEPT anything related to Coffre (and no cheque transfer to Coffre).
//            Data visibility is still restricted to their own store via store_id filtering/RLS.
// - User (Gestionnaire): can do Sales/Purchases, add clients/suppliers, passenger payments, add cheques,
//                         pay by cheque, but:
//                         - cannot transfer cheques to Coffre
//                         - cannot modify (edit) entities (Products/Achats/Ventes/Paiements/Chèques/etc.)
const defaultPermissions = {
  admin: permissionsList,
  manager: permissionsList.filter((p) => {
    // Managers: everything except Coffre + no cheque transfer to Coffre + no user management
    if (p === 'Gérer les Utilisateurs') return false;
    if (p.startsWith('Voir le Coffre')) return false;
    if (p.includes('Coffre')) return false;
    if (p === 'Transférer un Chèque au Coffre') return false;
    return true;
  }),
  user: [
    // Dashboard (view only)
    'Voir le Tableau de Bord',

    // Core operations
    'Voir les Ventes',
    'Créer une Vente',

    'Voir Achats/Transferts',
    'Créer un Achat/Transfert',

    // Clients / Fournisseurs creation
    'Voir les Clients',
    'Ajouter un Client',

    'Voir les Fournisseurs',
    'Ajouter un Fournisseur',

    // Payments (add only; no edit/delete)
    'Voir les Paiements',
    'Ajouter un Paiement',

    // Cheques: add + view inventory + pay by cheque, but no transfer to Coffre and no edit/delete
    'Voir les Chèques',
    'Ajouter un Chèque',
    "Voir l'Inventaire des Chèques",
    'Payer un Fournisseur par Chèque',
    'Payer un Client par Chèque',

    // Optional: view caisse (not Coffre)
    'Voir la Caisse',
    "Voir l'Espace Caisse",
    'Voir les Charges',
  ],
};

export function UsersModule({ session }: UsersModuleProps) {
  const [users, setUsers] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
    const [formData, setFormData] = useState({
    email: '',
    name: '',
    role: 'user',
    password: '',
    store_id: '',
    permissions: [] as string[],
    storeData: {
      storeName: '',
      storeEmail: '',
      storePhone: '',
      storeAddress: '',
    },
  });
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Safe table sorting (minimal changes)
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const toggleSort = (key: string) => {
    setSortConfig((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  const getSortIndicator = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) return '↕';
    return sortConfig.direction === 'asc' ? '▲' : '▼';
  };

  const sortString = (v: any) => String(v ?? '').trim().toLowerCase();
  const sortDate = (v: any) => {
    const t = v ? new Date(String(v)).getTime() : NaN;
    return Number.isFinite(t) ? t : 0;
  };

  // Calculate session duration
  const calculateSessionDuration = (lastLogin: string | null, lastLogout: string | null) => {
    if (!lastLogin) return 'Jamais connecté';
    
    const loginTime = new Date(lastLogin);
    const now = new Date();
    const logoutTime = lastLogout ? new Date(lastLogout) : now;
    
    const diffMs = logoutTime.getTime() - loginTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `${diffDays}j ${diffHours % 24}h`;
    if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`;
    return `${diffMins}m`;
  };

  // Format last activity time
  const formatLastActivity = (timestamp: string | null) => {
    if (!timestamp) return 'Jamais';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `Il y a ${diffDays}j`;
    if (diffHours > 0) return `Il y a ${diffHours}h`;
    if (diffMins > 0) return `Il y a ${diffMins}m`;
    return 'À l\'instant';
  };

  // Toggle user active status
  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    setTogglingUserId(userId);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/users/${userId}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            is_active: !currentStatus,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        
        // If deactivating user, show logout message
        if (currentStatus) {
          toast.success('Utilisateur désactivé et déconnecté');
        } else {
          toast.success('Utilisateur activé');
        }
        
        fetchUsers();
      } else {
        toast.error('Erreur lors de la modification du statut');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setTogglingUserId(null);
    }
  };

  const fetchStores = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/stores`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
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

  const fetchUsers = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/users`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Erreur lors du chargement des utilisateurs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStores();
    fetchUsers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url = editingUser
        ? `https://${projectId}.supabase.co/functions/v1/super-handler/users/${editingUser.id}`
        : `https://${projectId}.supabase.co/functions/v1/super-handler/users`;

      // When editing, only send password if it's not empty
      let dataToSend: any;
      
      if (editingUser) {
        dataToSend = {
          name: formData.name,
          role: formData.role,
          permissions: formData.permissions,
          ...(formData.password && { password: formData.password }),
        };
      } else {
        // For new users, prepare the data properly
        dataToSend = {
          email: formData.email,
          name: formData.name,
          role: formData.role,
          password: formData.password,
          permissions: formData.permissions,
        };

        // Store validation rules:
        // - If a store is chosen => use store_id
        // - Else if manager role => require at least storeName to create a new store
        // - Else => no store assignment
        if (formData.store_id) {
          dataToSend.store_id = formData.store_id;
        } else if (formData.role === 'manager') {
          const hasAnyStoreField = !!(
            formData.storeData.storeName ||
            formData.storeData.storeEmail ||
            formData.storeData.storePhone ||
            formData.storeData.storeAddress
          );

          if (hasAnyStoreField) {
            if (!formData.storeData.storeName.trim()) {
              toast.error('Nom du magasin requis pour créer un gestionnaire');
              setLoading(false);
              return;
            }
            dataToSend.storeData = formData.storeData;
          }
        }
      }

      console.log('Sending data:', dataToSend);

      const response = await fetch(url, {
        method: editingUser ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(dataToSend),
      });

      if (response.ok) {
        toast.success(editingUser ? 'Utilisateur modifié' : 'Utilisateur ajouté');
        setShowForm(false);
        resetForm();
        fetchUsers();
      } else {
        const error = await response.json();
        console.error('Error response:', error);
        toast.error(error.error || 'Erreur');
      }
    } catch (error: any) {
      console.error('Submit error:', error);
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur?')) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/users/${id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        toast.success('Utilisateur supprimé');
        fetchUsers();
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      name: '',
      role: 'user',
      password: '',
      store_id: '',
      permissions: defaultPermissions.user,
      storeData: {
        storeName: '',
        storeEmail: '',
        storePhone: '',
        storeAddress: '',
      },
    });
    setShowPassword(false);
    setEditingUser(null);
  };

  const handleEdit = (user: any) => {
    // Editing disabled for all user types
    return;
    
    setEditingUser(user);

    const roleKey: keyof typeof defaultPermissions =
      user?.role === 'admin' || user?.role === 'manager' || user?.role === 'user' ? user.role : 'user';

    setFormData({
      email: user.email,
      name: user.name || '',
      role: roleKey,
      password: '',
      store_id: user.store_id || '',
      // Role-based only: ignore stored per-user permissions
      permissions: defaultPermissions[roleKey],
      storeData: {
        storeName: '',
        storeEmail: '',
        storePhone: '',
        storeAddress: '',
      },
    });
    setShowForm(true);
  };

  const handleRoleChange = (role: string) => {
    const roleKey: keyof typeof defaultPermissions =
      role === 'admin' || role === 'manager' || role === 'user' ? role : 'user';

    setFormData({
      ...formData,
      role: roleKey,
      // Always start from default permissions for the new role
      permissions: defaultPermissions[roleKey],
      // When switching roles away from manager, clear store creation fields
      storeData: roleKey === 'manager'
        ? formData.storeData
        : { storeName: '', storeEmail: '', storePhone: '', storeAddress: '' },
    });
  };

  const handlePermissionChange = (permission: string, checked: boolean) => {
    setFormData({
      ...formData,
      permissions: checked
        ? [...formData.permissions, permission]
        : formData.permissions.filter(p => p !== permission),
    });
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800';
      case 'manager':
        return 'bg-blue-100 text-blue-800';
      case 'user':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredUsers = users.filter(user =>
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedUsers = (() => {
    const list = filteredUsers.slice();
    if (!sortConfig) return list;

    const { key, direction } = sortConfig;
    const factor = direction === 'asc' ? 1 : -1;

    const getValue = (u: any) => {
      switch (key) {
        case 'email':
          return sortString(u?.email);
        case 'name':
          return sortString(u?.name);
        case 'role':
          return sortString(u?.role);
        case 'status':
          // active first when asc
          return (u?.is_active === false) ? 0 : 1;
        case 'last_activity':
          return sortDate(u?.last_login);
        case 'session_duration':
          // Best effort: sort by login time (most recent)
          return sortDate(u?.last_login);
        default:
          return '';
      }
    };

    list.sort((a: any, b: any) => {
      const av: any = getValue(a);
      const bv: any = getValue(b);

      if (typeof av === 'number' && typeof bv === 'number') {
        if (av === bv) return 0;
        return av > bv ? factor : -factor;
      }

      const as = String(av ?? '');
      const bs = String(bv ?? '');
      if (as === bs) return 0;
      return as.localeCompare(bs, 'fr', { sensitivity: 'base', numeric: true }) * factor;
    });

    return list;
  })();

  const activeUsers = sortedUsers.filter(u => u.is_active !== false);
  const adminUsers = filteredUsers.filter(u => u.role === 'admin');
  const managerUsers = filteredUsers.filter(u => u.role === 'manager');

  // If showing form, render full page instead
  if (showForm) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            {editingUser ? 'Modifier l\'utilisateur' : 'Ajouter un nouvel utilisateur'}
          </h1>
          <Button
            onClick={() => {
              setShowForm(false);
              resetForm();
            }}
            variant="outline"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Informations de l'utilisateur</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    disabled={!!editingUser}
                    placeholder="utilisateur@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Nom complet</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Ahmed Bennani"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Rôle dans le système *</Label>
                <select
                  id="role"
                  value={formData.role}
                  onChange={(e) => handleRoleChange(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="user">Utilisateur Standard</option>
                  <option value="manager">Gestionnaire de Magasin</option>
                  <option value="admin">Administrateur Système</option>
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  • <strong>Utilisateur:</strong> Accès limité aux fonctions de base<br/>
                  • <strong>Gestionnaire:</strong> Gestion des commandes et stocks<br/>
                  • <strong>Administrateur:</strong> Accès complet à toutes les fonctionnalités
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">
                  Mot de passe {editingUser ? '(laisser vide pour ne pas changer)' : '*'}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Mot de passe sécurisé"
                    required={!editingUser}
                    className="pl-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {!editingUser && (
                  <p className="text-xs text-gray-500">
                    Minimum 8 caractères avec lettres et chiffres
                  </p>
                )}
              </div>

              <div className="space-y-2">
              <Label htmlFor="store_id">Magasin (Optionnel)</Label>
              <select
              id="store_id"
              value={formData.store_id}
              onChange={(e) => setFormData({ ...formData, store_id: e.target.value })}
              className="w-full px-3 py-2 border rounded-md"
              >
              <option value="">-- Aucun magasin --</option>
              {stores.map((store) => (
              <option key={store.id} value={store.id}>
              {store.name} {store.email ? `(${store.email})` : ''}
              </option>
              ))}
              </select>
              <p className="text-xs text-gray-500 mt-2">
              Vous pouvez associer un magasin à cet utilisateur (optionnel)
              </p>
              </div>

              {formData.role === 'manager' && !editingUser && (
                <Card className="bg-blue-50 border-blue-200">
                  <CardHeader>
                    <CardTitle className="text-blue-900 flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                      Informations du Magasin
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-blue-700">
                      Un nouveau magasin sera automatiquement créé avec ces informations
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="storeName">Nom du Magasin</Label>
                        <Input
                          id="storeName"
                          value={formData.storeData.storeName}
                          onChange={(e) => setFormData({
                            ...formData,
                            storeData: { ...formData.storeData, storeName: e.target.value }
                          })}
                          placeholder="Ex: Magasin Centre-Ville"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="storeEmail">Email du Magasin</Label>
                        <Input
                          id="storeEmail"
                          type="email"
                          value={formData.storeData.storeEmail}
                          onChange={(e) => setFormData({
                            ...formData,
                            storeData: { ...formData.storeData, storeEmail: e.target.value }
                          })}
                          placeholder="Ex: magasin@example.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="storePhone">Téléphone du Magasin</Label>
                        <Input
                          id="storePhone"
                          value={formData.storeData.storePhone}
                          onChange={(e) => setFormData({
                            ...formData,
                            storeData: { ...formData.storeData, storePhone: e.target.value }
                          })}
                          placeholder="Ex: +212 5XX XXX XXX"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="storeAddress">Adresse du Magasin</Label>
                        <Input
                          id="storeAddress"
                          value={formData.storeData.storeAddress}
                          onChange={(e) => setFormData({
                            ...formData,
                            storeData: { ...formData.storeData, storeAddress: e.target.value }
                          })}
                          placeholder="Ex: 123 Rue Principale, Ville"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Permissions are role-based only (no manual per-user permission editing) */}

              <div className="flex justify-end gap-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                >
                  Annuler
                </Button>
                <Button 
                  type="submit" 
                  disabled={loading}
                  style={{ backgroundColor: '#ea580c' }}
                  className="text-white hover:opacity-90"
                >
                  {loading ? 'Enregistrement...' : 'Enregistrer l\'Utilisateur'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Users Overview Cards - Navbar Style */}
      <div className="flex flex-wrap w-full bg-white p-1 h-auto gap-1 border-b border-gray-200 rounded-lg">
        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-blue-50 border-b-2 border-blue-500 text-blue-600 flex-1 min-w-max">
          <Users className="w-5 h-5" />
          <span className="text-xs font-medium">Utilisateurs Actifs</span>
          <span className="text-lg font-bold">{activeUsers.length}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-red-50 border-b-2 border-red-500 text-red-600 flex-1 min-w-max">
          <Shield className="w-5 h-5" />
          <span className="text-xs font-medium">Administrateurs</span>
          <span className="text-lg font-bold">{adminUsers.length}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-orange-50 border-b-2 border-orange-500 text-orange-600 flex-1 min-w-max">
          <UserCheck className="w-5 h-5" />
          <span className="text-xs font-medium">Gestionnaires</span>
          <span className="text-lg font-bold">{managerUsers.length}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-purple-50 border-b-2 border-purple-500 text-purple-600 flex-1 min-w-max">
          <Users className="w-5 h-5" />
          <span className="text-xs font-medium">Total Utilisateurs</span>
          <span className="text-lg font-bold">{sortedUsers.length}</span>
        </div>
      </div>

      {/* Main Users Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Utilisateurs - Gestion des Accès
            </CardTitle>
            <Button
              onClick={() => {
                setEditingUser(null);
                resetForm();
                setShowForm(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Nouvel Utilisateur
            </Button>
          </div>
        </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Rechercher un utilisateur..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort('email')}
                        className="inline-flex items-center gap-2 font-semibold hover:underline"
                        title="Trier"
                      >
                        Email <span className="text-xs opacity-70">{getSortIndicator('email')}</span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort('name')}
                        className="inline-flex items-center gap-2 font-semibold hover:underline"
                        title="Trier"
                      >
                        Nom <span className="text-xs opacity-70">{getSortIndicator('name')}</span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort('role')}
                        className="inline-flex items-center gap-2 font-semibold hover:underline"
                        title="Trier"
                      >
                        Rôle <span className="text-xs opacity-70">{getSortIndicator('role')}</span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort('status')}
                        className="inline-flex items-center gap-2 font-semibold hover:underline"
                        title="Trier"
                      >
                        Statut <span className="text-xs opacity-70">{getSortIndicator('status')}</span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort('last_activity')}
                        className="inline-flex items-center gap-2 font-semibold hover:underline"
                        title="Trier"
                      >
                        Dernière Activité <span className="text-xs opacity-70">{getSortIndicator('last_activity')}</span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort('session_duration')}
                        className="inline-flex items-center gap-2 font-semibold hover:underline"
                        title="Trier"
                      >
                        Durée Session <span className="text-xs opacity-70">{getSortIndicator('session_duration')}</span>
                      </button>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                        Aucun utilisateur trouvé
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedUsers.map((user) => (
                      <TableRow key={user.id} className={!user.is_active ? 'bg-gray-50 opacity-60' : ''}>
                        <TableCell className="font-medium">{user.email}</TableCell>
                        <TableCell>{user.name || '-'}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-sm ${getRoleColor(user.role)}`}>
                            {user.role}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${user.is_active ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                            <span className={`text-sm font-medium ${user.is_active ? 'text-green-700' : 'text-gray-600'}`}>
                              {user.is_active ? 'Actif' : 'Inactif'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-1 text-gray-600">
                            <Clock className="w-4 h-4" />
                            {formatLastActivity(user.last_login)}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-1 text-gray-600">
                            <Activity className="w-4 h-4" />
                            {calculateSessionDuration(user.last_login, user.last_logout)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toggleUserStatus(user.id, user.is_active)}
                              disabled={togglingUserId === user.id}
                              title={user.is_active ? 'Désactiver l\'utilisateur' : 'Activer l\'utilisateur'}
                            >
                              <Power className={`w-4 h-4 ${user.is_active ? 'text-green-600' : 'text-red-600'}`} />
                            </Button>
                            {/* Modification button disabled for all users */}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled
                              className="opacity-50 cursor-not-allowed"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDelete(user.id)}
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-800">À propos de la Gestion des Utilisateurs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-blue-700 space-y-2">
            <p>• <strong>Administrateurs:</strong> Accès complet à toutes les fonctionnalités du système</p>
            <p>• <strong>Gestionnaires:</strong> Gestion des magasins, commandes et stocks</p>
            <p>• <strong>Utilisateurs:</strong> Accès limité aux fonctions de base</p>
            <p>• Chaque utilisateur peut être associé à un magasin spécifique</p>
            <p>• Contrôle d'accès granulaire pour sécuriser les opérations</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}