import { useState, useEffect } from 'react';
import { projectId } from '../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Search, DollarSign, TrendingUp, TrendingDown, Wallet, Plus, Eye, Trash2, Edit2, Calendar, User, FileText } from 'lucide-react';
import { Badge } from './ui/badge';
import { toast } from 'sonner';

interface CashSpacePageProps {
  session: any;
}

interface CashEntry {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  category: string;
  date: string;
  created_by?: string;
  created_by_email?: string;
  notes?: string;
  reference?: string;
  status: 'pending' | 'confirmed' | 'archived';
}

export function CashSpacePage({ session }: CashSpacePageProps) {
  const [cashEntries, setCashEntries] = useState<CashEntry[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [currentStore, setCurrentStore] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('user');
  const [loading, setLoading] = useState(true);
  
  // Filter states
  const [filterStore, setFilterStore] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Dialog states
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<CashEntry | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CashEntry | null>(null);

  // Form states
  const [formType, setFormType] = useState<'income' | 'expense'>('income');
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formReference, setFormReference] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Fetch user data
  useEffect(() => {
    const fetchUserData = async () => {
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
          const currentUser = data.users?.find((u: any) => u.email === session.user?.email);
          
          if (currentUser) {
            setUserRole(currentUser.role || 'user');
            setUsers(data.users || []);
            
            if (currentUser.store_id) {
              setCurrentStore({ id: currentUser.store_id, name: currentUser.store_id });
            }
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    fetchUserData();
  }, [session.access_token]);

  // Fetch stores
  useEffect(() => {
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
          const sortedStores = (data.stores || []).sort((a: any, b: any) => 
            a.name.localeCompare(b.name)
          );
          setStores(sortedStores);
        }
      } catch (error) {
        console.error('Error fetching stores:', error);
      }
    };

    if (userRole === 'admin') {
      fetchStores();
    }
  }, [userRole, session.access_token]);

  // Fetch cash entries (from expenses table with cash_space type)
  const fetchCashEntries = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/expenses`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        // Filter for cash space entries only
        const cashSpaceEntries = (data.expenses || [])
          .filter((e: any) => e.expense_type === 'cash_space' || e.category === 'cash_space')
          .map((e: any) => ({
            id: e.id,
            type: e.type || 'expense',
            amount: e.amount,
            description: e.reason || e.description || '',
            category: e.category || 'General',
            date: e.created_at,
            created_by: e.created_by,
            created_by_email: getUserEmail(e.created_by),
            notes: e.notes || '',
            reference: e.reference || '',
            status: e.status || 'confirmed',
          }));
        
        setCashEntries(cashSpaceEntries);
      }
    } catch (error) {
      console.error('Error fetching cash entries:', error);
      toast.error('Erreur lors du chargement des entrées de caisse');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.access_token) {
      fetchCashEntries();
    }
  }, [session.access_token]);

  // Get user email by ID
  const getUserEmail = (userId?: string) => {
    if (!userId) return 'Non spécifié';
    const user = users.find(u => u.id === userId);
    return user?.email || 'Non spécifié';
  };

  // Filter entries
  const getFilteredEntries = () => {
    let filtered = cashEntries;

    // Filter by store
    if (userRole === 'admin' && filterStore !== 'all') {
      // Store filtering would be based on created_by user's store
    } else if (userRole !== 'admin' && currentStore) {
      // Regular users see all entries (or could be filtered by store)
    }

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter(e => e.type === filterType);
    }

    // Filter by status
    if (filterStatus !== 'all') {
      filtered = filtered.filter(e => e.status === filterStatus);
    }

    // Filter by date range
    if (filterStartDate) {
      const startDate = new Date(filterStartDate);
      startDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter(e => new Date(e.date) >= startDate);
    }

    if (filterEndDate) {
      const endDate = new Date(filterEndDate);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(e => new Date(e.date) <= endDate);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(e =>
        e.description.toLowerCase().includes(term) ||
        e.category.toLowerCase().includes(term) ||
        e.reference?.toLowerCase().includes(term)
      );
    }

    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const filteredEntries = getFilteredEntries();

  // Calculate statistics
  const calculateStats = () => {
    const filtered = getFilteredEntries();
    const totalIncome = filtered
      .filter(e => e.type === 'income')
      .reduce((sum, e) => sum + e.amount, 0);
    const totalExpense = filtered
      .filter(e => e.type === 'expense')
      .reduce((sum, e) => sum + e.amount, 0);
    const balance = totalIncome - totalExpense;

    return {
      totalIncome,
      totalExpense,
      balance,
      totalEntries: filtered.length,
    };
  };

  const stats = calculateStats();

  // Handle add/edit entry
  const handleSaveEntry = async () => {
    if (!formAmount || !formDescription || !formCategory) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }

    setFormSubmitting(true);

    try {
      const payload = {
        store_id: currentStore?.id || null,
        amount: parseFloat(formAmount),
        reason: formDescription,
        category: formCategory,
        notes: formNotes,
        reference: formReference,
        expense_type: 'cash_space',
        type: formType,
        status: 'confirmed',
      };

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/expenses`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        toast.success('Entrée de caisse enregistrée avec succès');
        setAddDialogOpen(false);
        resetForm();
        fetchCashEntries();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur lors de l\'enregistrement');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle delete entry
  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette entrée?')) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/expenses/${entryId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        toast.success('Entrée supprimée avec succès');
        fetchCashEntries();
      } else {
        toast.error('Erreur lors de la suppression');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const resetForm = () => {
    setFormType('income');
    setFormAmount('');
    setFormDescription('');
    setFormCategory('');
    setFormNotes('');
    setFormReference('');
    setEditingEntry(null);
  };

  const getTypeColor = (type: string) => {
    return type === 'income' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  const getTypeLabel = (type: string) => {
    return type === 'income' ? 'Revenu' : 'Dépense';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'archived':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return 'En Attente';
      case 'confirmed':
        return 'Confirmé';
      case 'archived':
        return 'Archivé';
      default:
        return status;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Espace Caisse</h1>
          <p className="text-gray-600 mt-1">Gestion complète des entrées et sorties de caisse</p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: '#3b82f6' }} className="text-white">
              <Plus className="w-4 h-4 mr-2" />
              Nouvelle Entrée
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Ajouter une Entrée de Caisse</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              handleSaveEntry();
            }} className="space-y-4">
              {/* Type */}
              <div className="space-y-2">
                <Label htmlFor="type">Type *</Label>
                <select
                  id="type"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as 'income' | 'expense')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="income">Revenu</option>
                  <option value="expense">Dépense</option>
                </select>
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <Label htmlFor="amount">Montant (MAD) *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  required
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Input
                  id="description"
                  placeholder="Ex: Vente du jour, Achat fournitures..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  required
                />
              </div>

              {/* Category */}
              <div className="space-y-2">
                <Label htmlFor="category">Catégorie *</Label>
                <Input
                  id="category"
                  placeholder="Ex: Ventes, Fournitures, Salaires..."
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  required
                />
              </div>

              {/* Reference */}
              <div className="space-y-2">
                <Label htmlFor="reference">Référence</Label>
                <Input
                  id="reference"
                  placeholder="Ex: INV-001, CHK-123..."
                  value={formReference}
                  onChange={(e) => setFormReference(e.target.value)}
                />
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  placeholder="Notes supplémentaires..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setAddDialogOpen(false);
                    resetForm();
                  }}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={formSubmitting}
                  style={{ backgroundColor: '#3b82f6' }}
                  className="text-white"
                >
                  {formSubmitting ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="flex flex-wrap w-full bg-white p-1 h-auto gap-1 border-b border-gray-200 rounded-lg">
        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-green-50 border-b-2 border-green-500 text-green-600 flex-1 min-w-max">
          <TrendingUp className="w-5 h-5" />
          <span className="text-xs font-medium">Total Revenus</span>
          <span className="text-lg font-bold">{stats.totalIncome.toFixed(2)} MAD</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-red-50 border-b-2 border-red-500 text-red-600 flex-1 min-w-max">
          <TrendingDown className="w-5 h-5" />
          <span className="text-xs font-medium">Total Dépenses</span>
          <span className="text-lg font-bold">{stats.totalExpense.toFixed(2)} MAD</span>
        </div>

        <div className={`flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all flex-1 min-w-max ${
          stats.balance >= 0 
            ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
            : 'bg-orange-50 border-b-2 border-orange-500 text-orange-600'
        }`}>
          <Wallet className="w-5 h-5" />
          <span className="text-xs font-medium">Solde</span>
          <span className="text-lg font-bold">{stats.balance.toFixed(2)} MAD</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-purple-50 border-b-2 border-purple-500 text-purple-600 flex-1 min-w-max">
          <DollarSign className="w-5 h-5" />
          <span className="text-xs font-medium">Nombre d'Entrées</span>
          <span className="text-lg font-bold">{stats.totalEntries}</span>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtres</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Rechercher par description, catégorie, référence..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Filter Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Type Filter */}
              <div>
                <Label htmlFor="filter-type">Type</Label>
                <select
                  id="filter-type"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Tous les types</option>
                  <option value="income">Revenus</option>
                  <option value="expense">Dépenses</option>
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <Label htmlFor="filter-status">Statut</Label>
                <select
                  id="filter-status"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="pending">En Attente</option>
                  <option value="confirmed">Confirmé</option>
                  <option value="archived">Archivé</option>
                </select>
              </div>

              {/* Start Date */}
              <div>
                <Label htmlFor="start-date">Du</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                />
              </div>

              {/* End Date */}
              <div>
                <Label htmlFor="end-date">Au</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* Reset Button */}
            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm('');
                setFilterType('all');
                setFilterStatus('all');
                setFilterStartDate('');
                setFilterEndDate('');
              }}
              className="w-full"
            >
              Réinitialiser les filtres
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Entries Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Entrées de Caisse ({filteredEntries.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Chargement...</div>
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Aucune entrée de caisse enregistrée</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Référence</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry) => (
                    <TableRow key={entry.id} className="hover:bg-gray-50">
                      <TableCell className="text-sm">
                        {new Date(entry.date).toLocaleDateString('fr-FR', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge className={getTypeColor(entry.type)}>
                          {getTypeLabel(entry.type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{entry.description}</TableCell>
                      <TableCell className="text-sm">{entry.category}</TableCell>
                      <TableCell className={`font-semibold ${entry.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                        {entry.type === 'income' ? '+' : '-'}{entry.amount.toFixed(2)} MAD
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(entry.status)}>
                          {getStatusLabel(entry.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{entry.reference || '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Dialog open={detailsDialogOpen && selectedEntry?.id === entry.id} onOpenChange={(open) => {
                            if (!open) setSelectedEntry(null);
                            setDetailsDialogOpen(open);
                          }}>
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedEntry(entry);
                                  setDetailsDialogOpen(true);
                                }}
                                title="Voir les détails"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-md">
                              <DialogHeader>
                                <DialogTitle>Détails de l'Entrée de Caisse</DialogTitle>
                              </DialogHeader>
                              {selectedEntry && (
                                <div className="space-y-4">
                                  <div className="border-b pb-4">
                                    <p className="text-sm text-gray-600">Date et Heure</p>
                                    <p className="text-lg font-semibold">
                                      {new Date(selectedEntry.date).toLocaleDateString('fr-FR', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                      })}
                                    </p>
                                  </div>

                                  <div className="border-b pb-4">
                                    <p className="text-sm text-gray-600">Type</p>
                                    <Badge className={getTypeColor(selectedEntry.type)}>
                                      {getTypeLabel(selectedEntry.type)}
                                    </Badge>
                                  </div>

                                  <div className="border-b pb-4">
                                    <p className="text-sm text-gray-600">Description</p>
                                    <p className="text-lg font-semibold">{selectedEntry.description}</p>
                                  </div>

                                  <div className="border-b pb-4">
                                    <p className="text-sm text-gray-600">Catégorie</p>
                                    <p className="text-lg font-semibold">{selectedEntry.category}</p>
                                  </div>

                                  <div className="border-b pb-4">
                                    <p className="text-sm text-gray-600">Montant</p>
                                    <p className={`text-lg font-semibold ${selectedEntry.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                                      {selectedEntry.type === 'income' ? '+' : '-'}{selectedEntry.amount.toFixed(2)} MAD
                                    </p>
                                  </div>

                                  <div className="border-b pb-4">
                                    <p className="text-sm text-gray-600">Statut</p>
                                    <Badge className={getStatusColor(selectedEntry.status)}>
                                      {getStatusLabel(selectedEntry.status)}
                                    </Badge>
                                  </div>

                                  {selectedEntry.reference && (
                                    <div className="border-b pb-4">
                                      <p className="text-sm text-gray-600">Référence</p>
                                      <p className="text-lg font-semibold">{selectedEntry.reference}</p>
                                    </div>
                                  )}

                                  {selectedEntry.notes && (
                                    <div className="border-b pb-4">
                                      <p className="text-sm text-gray-600">Notes</p>
                                      <p className="text-base">{selectedEntry.notes}</p>
                                    </div>
                                  )}

                                  <div className="border-b pb-4">
                                    <p className="text-sm text-gray-600">Créé par</p>
                                    <p className="text-lg font-semibold">{selectedEntry.created_by_email}</p>
                                  </div>

                                  <div className="flex justify-end gap-2 pt-4">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => {
                                        setDetailsDialogOpen(false);
                                        setSelectedEntry(null);
                                      }}
                                    >
                                      Fermer
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>

                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => handleDeleteEntry(entry.id)}
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
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
