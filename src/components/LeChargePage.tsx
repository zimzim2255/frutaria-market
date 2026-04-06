import { useState, useEffect } from 'react';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Plus, Download, Trash2, Eye, DollarSign, TrendingDown, FileText, X, Search } from 'lucide-react';
import { toast } from 'sonner';

interface LeChargePageProps {
  session: any;
}

export function LeChargePage({ session }: LeChargePageProps) {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [currentStore, setCurrentStore] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('user');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterStore, setFilterStore] = useState('all');
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<any>(null);
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Table sorting (safe/minimal)
  type SortDirection = 'asc' | 'desc';
  type ExpensesSortKey = 'date' | 'store' | 'amount' | 'category';
  const [sortConfig, setSortConfig] = useState<{ key: ExpensesSortKey; direction: SortDirection } | null>(null);

  const toggleSort = (key: ExpensesSortKey) => {
    setSortConfig(prev => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  const getSortIndicator = (key: ExpensesSortKey) => {
    if (!sortConfig || sortConfig.key !== key) return '↕';
    return sortConfig.direction === 'asc' ? '▲' : '▼';
  };
  
  // Form states
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseReason, setExpenseReason] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [expenseDate, setExpenseDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Fetch user role and current store
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
            
            // If user has a store, fetch it
            if (currentUser.store_id) {
              try {
                const storeResponse = await fetch(
                  `https://${projectId}.supabase.co/functions/v1/super-handler/stores/${currentUser.store_id}`,
                  {
                    headers: {
                      'Authorization': `Bearer ${session.access_token}`,
                    },
                  }
                );

                if (storeResponse.ok) {
                  const storeData = await storeResponse.json();
                  setCurrentStore(storeData.store);
                }
              } catch (error) {
                console.warn('Could not fetch store details:', error);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    fetchUserData();
  }, [session.access_token]);

  // Fetch stores (for admin filter)
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

  // Fetch expenses
  const fetchExpenses = async () => {
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

      if (!response.ok) {
        console.warn('Expenses request failed:', response.status, response.statusText);
        toast.error('Erreur lors du chargement des dépenses');
        setExpenses([]);
        return;
      }

      // Be resilient: sometimes a 200 response may not be valid JSON (proxy/cors/issues).
      const raw = await response.text();
      let data: any = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch (e) {
        console.error('Expenses response is not valid JSON:', raw);
        toast.error('Réponse invalide lors du chargement des dépenses');
        setExpenses([]);
        return;
      }

      const list = Array.isArray(data?.expenses) ? data.expenses : [];
      setExpenses(list);
    } catch (error) {
      console.error('Error fetching expenses:', error);
      toast.error('Erreur lors du chargement des dépenses');
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [session.access_token]);

  // Fetch charge categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/charge-categories`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setCategories(data.categories || []);
        }
      } catch (error) {
        console.error('Error fetching categories:', error);
      }
    };

    fetchCategories();
  }, [session.access_token]);

  // Get filtered category suggestions
  const getCategorySuggestions = () => {
    if (!categorySearch.trim()) return [];
    const searchLower = categorySearch.toLowerCase();
    return categories.filter(cat => 
      cat.name?.toLowerCase().includes(searchLower) ||
      cat.description?.toLowerCase().includes(searchLower)
    );
  };

  // Handle add expense
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!expenseAmount || parseFloat(expenseAmount) <= 0) {
      toast.error('Veuillez entrer un montant valide');
      return;
    }

    if (!expenseReason.trim()) {
      toast.error('Veuillez sélectionner une catégorie de dépense');
      return;
    }

    setSubmitting(true);

    try {
      // Convert file to base64 if file exists
      let base64String: string | null = null;
      let proofFileType: string | null = null;
      let proofFileName: string | null = null;

      if (proofFile) {
        base64String = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve(reader.result as string);
          };
          reader.onerror = () => {
            reject(new Error('Failed to read file'));
          };
          reader.readAsDataURL(proofFile);
        });
        proofFileType = proofFile.type.startsWith('image') ? 'image' : 'pdf';
        proofFileName = proofFile.name;
      }

      // For admins, use selected warehouse; for users, use their store
      const storeId = userRole === 'admin' 
        ? (selectedWarehouse || null) 
        : (currentStore?.id || null);

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/expenses`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            store_id: storeId,
            amount: parseFloat(expenseAmount),
            reason: expenseReason,
            // Mark as a manual charge so Le Charge history can exclude system movements.
            expense_type: 'manual_charge',
            proof_file: base64String,
            proof_file_type: proofFileType,
            proof_file_name: proofFileName,
            payment_date: expenseDate,
          }),
        }
      );

      if (response.ok) {
        toast.success('Dépense enregistrée avec succès');
        setExpenseAmount('');
        setExpenseReason('');
        setProofFile(null);
        setSelectedWarehouse('');
        setExpenseDate(new Date().toISOString().split('T')[0]);
        setDialogOpen(false);
        fetchExpenses();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur lors de l\'enregistrement');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle delete expense
  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette dépense?')) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/expenses/${id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        toast.success('Dépense supprimée');
        fetchExpenses();
      } else {
        toast.error('Erreur lors de la suppression');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  // Filter expenses based on user role, selected store, and date range
  const getFilteredExpenses = () => {
    let filtered = expenses;

    // Filter by store
    if (userRole === 'admin') {
      if (filterStore !== 'all') {
        filtered = filtered.filter(e => e.store_id === filterStore);
      }
    } else {
      // Regular user sees only their store's expenses.
      // Some deployments may fail to load store details (/stores/:id 404), leaving `currentStore` null.
      // In that case, fall back to the store_id embedded in the expenses list itself.
      const myStoreId = currentStore?.id || expenses.find(e => e?.created_by === session.user?.id)?.store_id || null;
      if (myStoreId) {
        filtered = filtered.filter(e => e.store_id === myStoreId);
      } else {
        // Last resort: show only expenses created by the current user.
        filtered = filtered.filter(e => e?.created_by === session.user?.id);
      }
    }

    // Filter by date range - use payment_date if available, otherwise use created_at
    if (filterStartDate || filterEndDate) {
      filtered = filtered.filter(e => {
        // Dynamically choose which date to use: payment_date if exists, otherwise created_at
        const dateToFilter = e.payment_date ? e.payment_date : e.created_at;
        
        if (!dateToFilter) {
          return false; // No date available, exclude
        }
        
        const expenseDate = new Date(dateToFilter);
        // Reset time for consistent comparison
        expenseDate.setHours(0, 0, 0, 0);
        
        // If only start date is set (no end date), treat it as filtering for that specific day only
        if (filterStartDate && !filterEndDate) {
          const targetDate = new Date(filterStartDate);
          targetDate.setHours(0, 0, 0, 0);
          return expenseDate.getTime() === targetDate.getTime();
        }
        
        // If only end date is set (no start date), treat it as filtering for that specific day only
        if (filterEndDate && !filterStartDate) {
          const targetDate = new Date(filterEndDate);
          targetDate.setHours(0, 0, 0, 0);
          return expenseDate.getTime() === targetDate.getTime();
        }
        
        // If both dates are set, use range filtering
        if (filterStartDate) {
          const startDate = new Date(filterStartDate);
          startDate.setHours(0, 0, 0, 0);
          if (expenseDate < startDate) {
            return false;
          }
        }
        
        if (filterEndDate) {
          const endDate = new Date(filterEndDate);
          endDate.setHours(0, 0, 0, 0);
          if (expenseDate > endDate) {
            return false;
          }
        }
        
        return true;
      });
    }

    // IMPORTANT: Le Charge page must show ONLY manual expenses created via "Enregistrer une Dépense".
    // System movements (caisse/coffre bookkeeping) are stored in the same `expenses` table but must NOT appear here.
    // We rely on `expense_type='manual_charge'` (new writes) and also support legacy manual entries where
    // expense_type is empty/null.
    const norm = (v: any) => String(v || '').trim().toLowerCase();
    const isSystemType = (t: string) =>
      t.startsWith('coffer_') ||
      t.startsWith('coffre_') ||
      t.startsWith('caisse_out_') ||
      t === 'supplier_passage' ||
      t === 'coffer_out_check' ||
      t === 'coffer_out_cash' ||
      t === 'coffer_out_bank_transfer' ||
      t === 'coffer_deposit_cash' ||
      t === 'coffer_deposit_check' ||
      t === 'coffer_deposit_bank_transfer';

    filtered = filtered.filter((e: any) => {
      const t = norm(e?.expense_type);
      if (isSystemType(t)) return false;
      // Keep explicit manual charges
      if (t === 'manual_charge') return true;
      // Legacy manual entries: keep when no type is set
      if (!t) return true;
      // Otherwise hide unknown typed movements to avoid pollution
      return false;
    });

    return filtered;
  };

  const filteredExpenses = getFilteredExpenses();

  const sortedExpenses = (() => {
    const list = [...filteredExpenses];
    if (!sortConfig) return list;

    const dir = sortConfig.direction === 'asc' ? 1 : -1;

    const getStoreSortName = (storeId: string | null | undefined) => {
      if (!storeId) return '';
      const store = stores.find(s => s.id === storeId);
      return (store?.name || storeId || '').toString().toLowerCase();
    };

    const getCategorySortName = (reason: any) => (reason ?? '').toString().toLowerCase();

    list.sort((a, b) => {
      switch (sortConfig.key) {
        case 'date': {
          // Sort by payment_date (custom expense date) if available, fallback to created_at
          const aT = a?.payment_date 
            ? new Date(a.payment_date).getTime() 
            : new Date(a?.created_at || 0).getTime() || 0;
          const bT = b?.payment_date 
            ? new Date(b.payment_date).getTime() 
            : new Date(b?.created_at || 0).getTime() || 0;
          return (aT - bT) * dir;
        }
        case 'store': {
          const aS = getStoreSortName(a?.store_id);
          const bS = getStoreSortName(b?.store_id);
          return aS.localeCompare(bS) * dir;
        }
        case 'amount': {
          const aN = Number(a?.amount) || 0;
          const bN = Number(b?.amount) || 0;
          return (aN - bN) * dir;
        }
        case 'category': {
          const aC = getCategorySortName(a?.reason);
          const bC = getCategorySortName(b?.reason);
          return aC.localeCompare(bC) * dir;
        }
        default:
          return 0;
      }
    });

    return list;
  })();

  // Reset date filters
  const handleResetDateFilter = () => {
    setFilterStartDate('');
    setFilterEndDate('');
  };

  // Calculate statistics
  const calculateStats = () => {
    const filtered = getFilteredExpenses();
    const totalAmount = filtered.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalExpenses = filtered.length;

    return {
      totalAmount,
      totalExpenses,
    };
  };

  const stats = calculateStats();

  // Get store name by ID
  const getStoreName = (storeId: string | null) => {
    if (!storeId) return 'Non spécifié';
    const store = stores.find(s => s.id === storeId);
    return store?.name || storeId;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Le Charge (Dépenses)</h1>
          <p className="text-gray-600 mt-1">
            {userRole === 'admin' 
              ? 'Gestion des dépenses de tous les magasins' 
              : `Dépenses de ${currentStore?.name || 'votre magasin'}`}
          </p>
        </div>
      </div>

      {/* Stats Cards - Navbar Style */}
      <div className="flex flex-wrap w-full bg-white p-1 h-auto gap-1 border-b border-gray-200 rounded-lg">
        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-red-50 border-b-2 border-red-500 text-red-600 flex-1 min-w-max">
          <TrendingDown className="w-5 h-5" />
          <span className="text-xs font-medium">Total Dépensé</span>
          <span className="text-lg font-bold">{stats.totalAmount.toFixed(2)} MAD</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-orange-50 border-b-2 border-orange-500 text-orange-600 flex-1 min-w-max">
          <FileText className="w-5 h-5" />
          <span className="text-xs font-medium">Nombre de Dépenses</span>
          <span className="text-lg font-bold">{stats.totalExpenses}</span>
        </div>
      </div>

      {/* Admin Filter */}
      {userRole === 'admin' && (
        <Card>
          <CardHeader>
            <CardTitle>Filtrer par Magasin</CardTitle>
          </CardHeader>
          <CardContent>
            <select
              value={filterStore}
              onChange={(e) => setFilterStore(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tous les magasins</option>
              {stores.map(store => (
                <option key={store.id} value={store.id}>{store.name}</option>
              ))}
            </select>
          </CardContent>
        </Card>
      )}

      {/* Date Range Filter */}
      <Card>
        <CardHeader>
          <CardTitle>Filtrer par Période</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="start-date">Du</Label>
              <Input
                id="start-date"
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="end-date">Au</Label>
              <Input
                id="end-date"
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              onClick={handleResetDateFilter}
              className="flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Réinitialiser
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Add Expense Button */}
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: '#ef4444', color: 'white' }}>
              <Plus className="w-4 h-4 mr-2" />
              Ajouter une Dépense
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Enregistrer une Dépense</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddExpense} className="space-y-4">
              {/* Amount */}
              <div className="space-y-2">
                <Label htmlFor="amount">Montant (MAD) *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  required
                />
              </div>

              {/* Date Picker */}
              <div className="space-y-2">
                <Label htmlFor="expenseDate">Date de la Dépense *</Label>
                <Input
                  id="expenseDate"
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  required
                />
                <p className="text-xs text-gray-500">Sélectionnez la date à laquelle la dépense a eu lieu</p>
              </div>

              {/* Category Search */}
              <div className="space-y-2">
                <Label htmlFor="category">Catégorie de Dépense *</Label>
                <div className="relative">
                  <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2">
                    <Search className="w-4 h-4 text-gray-400" />
                    <Input
                      id="category"
                      placeholder="Rechercher une catégorie..."
                      value={categorySearch}
                      onChange={(e) => {
                        setCategorySearch(e.target.value);
                        setShowCategorySuggestions(true);
                      }}
                      onFocus={() => setShowCategorySuggestions(true)}
                      className="border-0 focus-visible:ring-0 p-0"
                    />
                  </div>
                  
                  {/* Category Suggestions */}
                  {showCategorySuggestions && getCategorySuggestions().length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                      {getCategorySuggestions().map((category) => (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => {
                            setExpenseReason(category.name);
                            setCategorySearch(category.name);
                            setShowCategorySuggestions(false);
                          }}
                          className="w-full px-4 py-2 text-left hover:bg-gray-100 border-b border-gray-100 last:border-b-0 transition-colors flex items-center gap-2"
                        >
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: category.color || '#3b82f6' }}
                          />
                          <div className="flex-1">
                            <p className="font-medium text-sm">{category.name}</p>
                            {category.description && (
                              <p className="text-xs text-gray-600">{category.description}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {expenseReason && (
                  <p className="text-xs text-green-600">✓ Catégorie sélectionnée: {expenseReason}</p>
                )}
              </div>

              {/* Proof File */}
              <div className="space-y-2">
                <Label htmlFor="proof">Preuve (PDF ou Image)</Label>
                <Input
                  id="proof"
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                />
                {proofFile && (
                  <p className="text-xs text-gray-600">Fichier sélectionné: {proofFile.name}</p>
                )}
                <p className="text-xs text-gray-500">JPG, PNG ou PDF (Max 10MB) - Optionnel</p>
              </div>

              {/* Admin Warehouse Selector */}
              {userRole === 'admin' && (
                <div className="space-y-2">
                  <Label htmlFor="warehouse">Entrepôt (Admin)</Label>
                  <select
                    id="warehouse"
                    value={selectedWarehouse}
                    onChange={(e) => setSelectedWarehouse(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Sélectionner un entrepôt...</option>
                    {stores.map(store => (
                      <option key={store.id} value={store.id}>{store.name}</option>
                    ))}
                  </select>
                  {selectedWarehouse && (
                    <p className="text-xs text-green-600">✓ Entrepôt sélectionné: {stores.find(s => s.id === selectedWarehouse)?.name}</p>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDialogOpen(false);
                    setExpenseAmount('');
                    setExpenseReason('');
                    setProofFile(null);
                    setExpenseDate(new Date().toISOString().split('T')[0]);
                  }}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  style={{ backgroundColor: '#ef4444', color: 'white' }}
                >
                  {submitting ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Expenses Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Historique des Dépenses ({filteredExpenses.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Chargement...</div>
          ) : filteredExpenses.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Aucune dépense enregistrée</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort('date')}
                        className="flex items-center gap-2 select-none"
                      >
                        <span>Date</span>
                        <span className="text-xs text-gray-500">{getSortIndicator('date')}</span>
                      </button>
                    </TableHead>
                    {userRole === 'admin' && (
                      <TableHead>
                        <button
                          type="button"
                          onClick={() => toggleSort('store')}
                          className="flex items-center gap-2 select-none"
                        >
                          <span>Magasin</span>
                          <span className="text-xs text-gray-500">{getSortIndicator('store')}</span>
                        </button>
                      </TableHead>
                    )}
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort('amount')}
                        className="flex items-center gap-2 select-none"
                      >
                        <span>Montant</span>
                        <span className="text-xs text-gray-500">{getSortIndicator('amount')}</span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort('category')}
                        className="flex items-center gap-2 select-none"
                      >
                        <span>Catégorie</span>
                        <span className="text-xs text-gray-500">{getSortIndicator('category')}</span>
                      </button>
                    </TableHead>
                    <TableHead>Preuve</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedExpenses.map((expense) => (
                    <TableRow key={expense.id} className="hover:bg-gray-50">
                      <TableCell className="text-sm">
                        {expense.payment_date
                          ? new Date(expense.payment_date).toLocaleDateString('fr-FR', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })
                          : new Date(expense.created_at).toLocaleDateString('fr-FR', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                      </TableCell>
                      {userRole === 'admin' && (
                        <TableCell className="text-sm font-medium">
                          {getStoreName(expense.store_id)}
                        </TableCell>
                      )}
                      <TableCell className="font-semibold text-red-600">
                        -{expense.amount?.toFixed(2)} MAD
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: categories.find(c => c.name === expense.reason)?.color || '#3b82f6' }}
                          />
                          <span>{expense.reason}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {expense.proof_file ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const link = document.createElement('a');
                              link.href = expense.proof_file;
                              link.target = '_blank';
                              link.download = expense.proof_file_name || 'proof';
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }}
                            title="Télécharger la preuve"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        ) : (
                          <span className="text-gray-400 text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Dialog open={detailsDialogOpen && selectedExpense?.id === expense.id} onOpenChange={(open) => {
                            if (!open) setSelectedExpense(null);
                            setDetailsDialogOpen(open);
                          }}>
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedExpense(expense);
                                  setDetailsDialogOpen(true);
                                }}
                                title="Voir les détails"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-md">
                              <DialogHeader>
                                <DialogTitle>Détails de la Dépense</DialogTitle>
                              </DialogHeader>
                              {selectedExpense && (
                                <div className="space-y-4">
                                  {userRole === 'admin' && (
                                    <div className="border-b pb-4">
                                      <p className="text-sm text-gray-600">Date et Heure</p>
                                      <p className="text-lg font-semibold">
                                        {new Date(selectedExpense.created_at).toLocaleDateString('fr-FR', {
                                          year: 'numeric',
                                          month: 'long',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                          second: '2-digit',
                                        })}
                                      </p>
                                    </div>
                                  )}

                                  {userRole === 'admin' && (
                                    <div className="border-b pb-4">
                                      <p className="text-sm text-gray-600">Entrepôt</p>
                                      <p className="text-lg font-semibold">{getStoreName(selectedExpense.store_id)}</p>
                                    </div>
                                  )}

                                  {userRole !== 'admin' && (
                                    <div className="border-b pb-4">
                                      <p className="text-sm text-gray-600">Date et Heure</p>
                                      <p className="text-lg font-semibold">
                                        {new Date(selectedExpense.created_at).toLocaleDateString('fr-FR', {
                                          year: 'numeric',
                                          month: 'long',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                          second: '2-digit',
                                        })}
                                      </p>
                                    </div>
                                  )}

                                  <div className="border-b pb-4">
                                    <p className="text-sm text-gray-600">Montant</p>
                                    <p className="text-lg font-semibold text-red-600">
                                      -{selectedExpense.amount?.toFixed(2)} MAD
                                    </p>
                                  </div>

                                  <div className="border-b pb-4">
                                    <p className="text-sm text-gray-600">Date de paiement</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Input
                                        type="date"
                                        value={selectedExpense.payment_date ? new Date(selectedExpense.payment_date).toISOString().split('T')[0] : ''}
                                        onChange={async (e) => {
                                          const newDate = e.target.value;
                                          if (!newDate || !selectedExpense.id) return;
                                          
                                          try {
                                            const response = await fetch(
                                              `https://${projectId}.supabase.co/rest/v1/expenses?id=eq.${selectedExpense.id}`,
                                              {
                                                method: 'PATCH',
                                                headers: {
                                                  'Content-Type': 'application/json',
                                                  'Authorization': `Bearer ${session.access_token}`,
                                                  'apikey': `${publicAnonKey}`,
                                                },
                                                body: JSON.stringify({
                                                  payment_date: newDate,
                                                }),
                                              }
                                            );
                                            
                                            if (response.ok) {
                                              toast.success('Date de paiement mise à jour');
                                              setSelectedExpense({ ...selectedExpense, payment_date: newDate });
                                              fetchExpenses();
                                            } else {
                                              toast.error('Erreur lors de la mise à jour de la date');
                                            }
                                          } catch (error) {
                                            console.error('Error updating payment date:', error);
                                            toast.error('Erreur lors de la mise à jour de la date');
                                          }
                                        }}
                                        className="w-auto"
                                      />
                                    </div>
                                  </div>

                                  <div className="border-b pb-4">
                                    <p className="text-sm text-gray-600">Catégorie</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <div
                                        className="w-4 h-4 rounded-full"
                                        style={{ backgroundColor: categories.find(c => c.name === selectedExpense.reason)?.color || '#3b82f6' }}
                                      />
                                      <p className="text-lg font-semibold">{selectedExpense.reason}</p>
                                    </div>
                                  </div>

                                  {selectedExpense.proof_file && (
                                    <div className="border-b pb-4">
                                      <p className="text-sm text-gray-600">Preuve</p>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          const link = document.createElement('a');
                                          link.href = selectedExpense.proof_file;
                                          link.target = '_blank';
                                          link.download = selectedExpense.proof_file_name || 'proof';
                                          document.body.appendChild(link);
                                          link.click();
                                          document.body.removeChild(link);
                                        }}
                                        className="mt-2"
                                      >
                                        <Download className="w-4 h-4 mr-2" />
                                        Télécharger
                                      </Button>
                                    </div>
                                  )}

                                  <div className="flex justify-end gap-2 pt-4">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => {
                                        setDetailsDialogOpen(false);
                                        setSelectedExpense(null);
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
                            variant="destructive"
                            onClick={() => handleDeleteExpense(expense.id)}
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
