import { useState, useEffect } from 'react';
import { projectId } from '../../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '../ui/dialog';
import { Plus, Edit, Trash2, Search, Percent, TrendingDown, Toggle2 } from 'lucide-react';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

interface DiscountManagementModuleProps {
  session: any;
}

interface Discount {
  id: string;
  entity_id?: string;
  entity_name: string;
  entity_type: 'customer' | 'supplier' | 'store';
  discount_percentage: number;
  discount_amount: number;
  reason: string;
  applied_date: string;
  created_by: string;
  status: 'active' | 'inactive';
}

interface Entity {
  id: string;
  name: string;
  balance?: number;
}

export function DiscountManagementModule({ session }: DiscountManagementModuleProps) {
  const [discounts, setDiscounts] = useState<Discount[]>([]);

  // Resolve role+permissions from DB
  const [currentUserRole, setCurrentUserRole] = useState<string>('user');
  const [currentUserPermissions, setCurrentUserPermissions] = useState<string[]>([]);

  const isAdmin = currentUserRole === 'admin';
  const hasPermission = (permission: string): boolean => {
    if (isAdmin) return true;
    return currentUserPermissions.includes(permission);
  };

  const canViewDiscounts = hasPermission('Voir les Remises');
  const canAddDiscount = hasPermission('Ajouter une Remise');
  const canEditDiscount = hasPermission('Modifier une Remise');
  const canDeleteDiscount = hasPermission('Supprimer une Remise');
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'customer' | 'supplier' | 'store'>('customer');
  const [showSuggestions, setShowSuggestions] = useState(false);

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
  const sortNumber = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const sortDate = (v: any) => {
    const t = v ? new Date(String(v)).getTime() : NaN;
    return Number.isFinite(t) ? t : 0;
  };
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [formData, setFormData] = useState({
    entity_name: '',
    discount_percentage: 0,
    discount_amount: 0,
    reason: '',
  });

  // Fetch all data
  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch discounts
      const discountsResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/discounts`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (discountsResponse.ok) {
        const data = await discountsResponse.json();
        setDiscounts(data.discounts || []);
      }

      // Fetch entities based on active tab
      await fetchEntities(activeTab);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  const fetchEntities = async (type: 'customer' | 'supplier' | 'store') => {
    try {
      let endpoint = '';

      if (type === 'customer') {
        endpoint = 'clients';
      } else if (type === 'supplier') {
        endpoint = 'suppliers';
      } else {
        endpoint = 'stores';
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/${endpoint}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.ok) return;

      const data = await response.json();
      let entitiesData = data[endpoint] || data.clients || data.suppliers || data.stores || [];

      // CUSTOMER: compute real outstanding balance like Clients page
      if (type === 'customer') {
        try {
          const invoicesResponse = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/invoices`,
            {
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
              },
            }
          );

          if (invoicesResponse.ok) {
            const invoicesData = await invoicesResponse.json();
            const invoices = invoicesData.invoices || [];

            // Index invoices by client_id when available
            const byClientId = new Map<string, number>();
            const byIceOrName = new Map<string, number>();

            for (const inv of invoices) {
              const remaining = Number(inv.remaining_balance || 0) || 0;
              if (remaining <= 0) continue;

              if (inv.client_id) {
                byClientId.set(String(inv.client_id), (byClientId.get(String(inv.client_id)) || 0) + remaining);
              }

              const keyIce = inv.client_ice ? `ice:${String(inv.client_ice).trim().toLowerCase()}` : '';
              const keyName = inv.client_name ? `name:${String(inv.client_name).trim().toLowerCase()}` : '';
              if (keyIce) byIceOrName.set(keyIce, (byIceOrName.get(keyIce) || 0) + remaining);
              if (keyName) byIceOrName.set(keyName, (byIceOrName.get(keyName) || 0) + remaining);
            }

            entitiesData = entitiesData.map((c: any) => {
              const cid = String(c.id);
              const iceKey = c.ice ? `ice:${String(c.ice).trim().toLowerCase()}` : '';
              const nameKey = c.name ? `name:${String(c.name).trim().toLowerCase()}` : '';

              const balanceFromId = byClientId.get(cid) || 0;
              const balanceFromIce = iceKey ? (byIceOrName.get(iceKey) || 0) : 0;
              const balanceFromName = nameKey ? (byIceOrName.get(nameKey) || 0) : 0;

              // Prefer client_id match, else ICE, else name
              const computed = balanceFromId || balanceFromIce || balanceFromName || 0;

              return {
                ...c,
                balance: computed,
              };
            });
          }
        } catch (err) {
          console.warn('Could not compute customer balance from invoices:', err);
        }
      }

      // Map to consistent format
      entitiesData = entitiesData.map((entity: any) => ({
        id: entity.id,
        name: entity.name,
        balance: Number(entity.balance || 0) || 0,
      }));

      setEntities(entitiesData);
    } catch (error) {
      console.error(`Error fetching ${type}:`, error);
    }
  };

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/users`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        if (!res.ok) return;
        const data = await res.json();
        const me = data.users?.find((u: any) => u.id === session.user.id);
        if (me) {
          setCurrentUserRole(String(me.role || 'user'));
          setCurrentUserPermissions(Array.isArray(me.permissions) ? me.permissions : []);
        }
      } catch (e) {
        console.warn('[DiscountManagementModule] Could not resolve current user:', e);
      }
    };

    fetchMe();
    fetchData();
  }, []);

  useEffect(() => {
    if (dialogOpen) {
      fetchEntities(activeTab);
    }
  }, [activeTab, dialogOpen]);

  const handleEntityNameChange = (value: string) => {
    setFormData({ ...formData, entity_name: value });
    setShowSuggestions(value.length > 0);
  };

  const getSuggestions = () => {
    return entities.filter(item =>
      item.name.toLowerCase().includes(formData.entity_name.toLowerCase())
    );
  };

  const handleSelectEntity = (entity: Entity) => {
    setFormData({ ...formData, entity_name: entity.name });
    setSelectedEntity(entity);
    setShowSuggestions(false);
  };

  // Auto-calculate discount amount from percentage
  const handlePercentageChange = (percentage: number) => {
    setFormData({ ...formData, discount_percentage: percentage });
    
    if (selectedEntity && selectedEntity.balance && percentage > 0) {
      const calculatedAmount = (selectedEntity.balance * percentage) / 100;
      setFormData(prev => ({ ...prev, discount_amount: Math.round(calculatedAmount * 100) / 100 }));
    }
  };

  // Auto-calculate percentage from amount
  const handleAmountChange = (amount: number) => {
    setFormData({ ...formData, discount_amount: amount });
    
    if (selectedEntity && selectedEntity.balance && amount > 0) {
      const calculatedPercentage = (amount / selectedEntity.balance) * 100;
      setFormData(prev => ({ ...prev, discount_percentage: Math.round(calculatedPercentage * 100) / 100 }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingDiscount && !canAddDiscount) {
      toast.error("Vous n'avez pas la permission « Ajouter une Remise »");
      return;
    }

    if (editingDiscount && !canEditDiscount) {
      toast.error("Vous n'avez pas la permission « Modifier une Remise »");
      return;
    }
    
    // Validation
    if (!formData.entity_name) {
      toast.error('Veuillez sélectionner une entité');
      return;
    }

    if (formData.discount_amount <= 0 && formData.discount_percentage <= 0) {
      toast.error('Veuillez entrer un montant ou un pourcentage de remise');
      return;
    }

    if (selectedEntity && formData.discount_amount > selectedEntity.balance) {
      toast.error(`Le montant de remise ne peut pas dépasser le solde (${selectedEntity.balance.toFixed(2)} MAD)`);
      return;
    }

    setLoading(true);

    try {
      const url = editingDiscount
        ? `https://${projectId}.supabase.co/functions/v1/super-handler/discounts/${editingDiscount.id}`
        : `https://${projectId}.supabase.co/functions/v1/super-handler/discounts`;

      const response = await fetch(url, {
        method: editingDiscount ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          entity_name: formData.entity_name,
          entity_type: activeTab,
          entity_id: selectedEntity?.id || null,
          discount_percentage: formData.discount_percentage,
          discount_amount: formData.discount_amount,
          reason: formData.reason,
          status: 'active',
        }),
      });

      if (response.ok) {
        toast.success(editingDiscount ? 'Remise modifiée avec succès' : 'Remise ajoutée avec succès');
        setDialogOpen(false);
        resetForm();
        fetchData();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur lors de l\'enregistrement');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!canDeleteDiscount) {
      toast.error("Vous n'avez pas la permission « Supprimer une Remise »");
      return;
    }

    if (!confirm('Êtes-vous sûr de vouloir supprimer cette remise?')) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/discounts/${id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        toast.success('Remise supprimée avec succès');
        fetchData();
      } else {
        toast.error('Erreur lors de la suppression');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const handleToggleStatus = async (discount: Discount) => {
    if (!canEditDiscount) {
      toast.error("Vous n'avez pas la permission « Modifier une Remise »");
      return;
    }

    try {
      const newStatus = discount.status === 'active' ? 'inactive' : 'active';
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/discounts/${discount.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            ...discount,
            status: newStatus,
          }),
        }
      );

      if (response.ok) {
        toast.success(`Remise ${newStatus === 'active' ? 'activée' : 'désactivée'}`);
        fetchData();
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const resetForm = () => {
    setFormData({
      entity_name: '',
      discount_percentage: 0,
      discount_amount: 0,
      reason: '',
    });
    setEditingDiscount(null);
    setSelectedEntity(null);
    setShowSuggestions(false);
    setSearchTerm('');
  };

  const handleEdit = (discount: Discount) => {
    if (!canEditDiscount) {
      toast.error("Vous n'avez pas la permission « Modifier une Remise »");
      return;
    }

    setEditingDiscount(discount);
    setFormData({
      entity_name: discount.entity_name,
      discount_percentage: discount.discount_percentage,
      discount_amount: discount.discount_amount,
      reason: discount.reason,
    });
    setActiveTab(discount.entity_type);
    setDialogOpen(true);
  };

  const filteredDiscounts = discounts.filter(discount => {
    const matchesTab = discount.entity_type === activeTab;
    const matchesSearch = 
      discount.entity_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      discount.reason?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const sortedDiscounts = (() => {
    const list = filteredDiscounts.slice();
    if (!sortConfig) return list;

    const { key, direction } = sortConfig;
    const factor = direction === 'asc' ? 1 : -1;

    const getValue = (d: Discount) => {
      switch (key) {
        case 'name':
          return sortString(d.entity_name);
        case 'type':
          return sortString(d.entity_type);
        case 'percentage':
          return sortNumber(d.discount_percentage);
        case 'amount':
          return sortNumber(d.discount_amount);
        case 'reason':
          return sortString(d.reason);
        case 'date':
          return sortDate(d.applied_date);
        case 'status':
          return sortString(d.status);
        default:
          return '';
      }
    };

    list.sort((a: Discount, b: Discount) => {
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

  const totalDiscountAmount = sortedDiscounts.reduce((sum, d) => sum + d.discount_amount, 0);
  const activeDiscounts = sortedDiscounts.filter(d => d.status === 'active');

  const getEntityTypeLabel = (type: 'customer' | 'supplier' | 'store') => {
    return type === 'customer' ? 'Client' : type === 'supplier' ? 'Fournisseur' : 'Magasin';
  };

  const calculateRemainingBalance = () => {
    if (!selectedEntity) return null;
    const currentBalance = selectedEntity.balance || 0;
    const discountAmount = formData.discount_amount || 0;
    return Math.max(0, currentBalance - discountAmount);
  };

  const remainingBalance = calculateRemainingBalance();
  const suggestions = getSuggestions();

  if (!canViewDiscounts) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Accès refusé</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">Vous n'avez pas la permission « Voir les Remises ».</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="flex flex-wrap w-full bg-white p-1 h-auto gap-1 border-b border-gray-200 rounded-lg">
        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-blue-50 border-b-2 border-blue-500 text-blue-600 flex-1 min-w-max">
          <Percent className="w-5 h-5" />
          <span className="text-xs font-medium">Remises Actives</span>
          <span className="text-lg font-bold">{activeDiscounts.length}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-green-50 border-b-2 border-green-500 text-green-600 flex-1 min-w-max">
          <TrendingDown className="w-5 h-5" />
          <span className="text-xs font-medium">Montant Total</span>
          <span className="text-lg font-bold">{totalDiscountAmount.toFixed(2)} MAD</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-purple-50 border-b-2 border-purple-500 text-purple-600 flex-1 min-w-max">
          <Percent className="w-5 h-5" />
          <span className="text-xs font-medium">Total Remises</span>
          <span className="text-lg font-bold">{sortedDiscounts.length}</span>
        </div>
      </div>

      {/* Main Discounts Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Percent className="w-5 h-5" />
              Gestion des Remises Générales
            </CardTitle>
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button
                  disabled={!canAddDiscount}
                  title={!canAddDiscount ? "Vous n'avez pas la permission « Ajouter une Remise »" : undefined}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter une Remise
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {editingDiscount ? 'Modifier la remise' : 'Ajouter une remise générale'}
                  </DialogTitle>
                  <DialogDescription>
                    {editingDiscount ? 'Modifiez les détails de la remise' : 'Créez une remise générale applicable aux factures, BL d\'achat et autres documents'}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Entity Type Selection */}
                  <div className="space-y-2">
                    <Label>Type d'entité</Label>
                    <div className="flex gap-4 flex-wrap">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          value="customer"
                          checked={activeTab === 'customer'}
                          onChange={(e) => {
                            setActiveTab(e.target.value as 'customer' | 'supplier' | 'store');
                            setSelectedEntity(null);
                            setFormData({ ...formData, entity_name: '' });
                          }}
                          className="w-4 h-4"
                        />
                        <span>Client</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          value="supplier"
                          checked={activeTab === 'supplier'}
                          onChange={(e) => {
                            setActiveTab(e.target.value as 'customer' | 'supplier' | 'store');
                            setSelectedEntity(null);
                            setFormData({ ...formData, entity_name: '' });
                          }}
                          className="w-4 h-4"
                        />
                        <span>Fournisseur</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          value="store"
                          checked={activeTab === 'store'}
                          onChange={(e) => {
                            setActiveTab(e.target.value as 'customer' | 'supplier' | 'store');
                            setSelectedEntity(null);
                            setFormData({ ...formData, entity_name: '' });
                          }}
                          className="w-4 h-4"
                        />
                        <span>Magasin</span>
                      </label>
                    </div>
                  </div>

                  {/* Entity Name with Autocomplete */}
                  <div className="space-y-2 relative">
                    <Label htmlFor="entity_name">Nom du {getEntityTypeLabel(activeTab)} *</Label>
                    <Input
                      id="entity_name"
                      value={formData.entity_name}
                      onChange={(e) => handleEntityNameChange(e.target.value)}
                      onFocus={() => formData.entity_name.length > 0 && setShowSuggestions(true)}
                      placeholder={`Sélectionnez un ${getEntityTypeLabel(activeTab).toLowerCase()}`}
                      required
                      autoComplete="off"
                    />
                    
                    {/* Autocomplete Suggestions */}
                    {showSuggestions && suggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                        {suggestions.map((entity) => (
                          <button
                            key={entity.id}
                            type="button"
                            onClick={() => handleSelectEntity(entity)}
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 border-b last:border-b-0 transition-colors"
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-medium">{entity.name}</span>
                              <span className="text-sm text-gray-600">
                                Solde: {(entity.balance || 0).toFixed(2)} MAD
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Current Balance Display */}
                  {selectedEntity && (
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                      <p className="text-sm text-blue-800">
                        <span className="font-semibold">Solde Actuel:</span> {(selectedEntity.balance || 0).toFixed(2)} MAD
                      </p>
                    </div>
                  )}

                  {/* Discount Percentage */}
                  <div className="space-y-2">
                    <Label htmlFor="discount_percentage">Pourcentage de Remise (%)</Label>
                    <Input
                      id="discount_percentage"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={formData.discount_percentage}
                      onChange={(e) => handlePercentageChange(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-500">Entrez un pourcentage (sera auto-calculé en montant)</p>
                  </div>

                  {/* Discount Amount */}
                  <div className="space-y-2">
                    <Label htmlFor="discount_amount">Montant de Remise (MAD)</Label>
                    <Input
                      id="discount_amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.discount_amount}
                      onChange={(e) => handleAmountChange(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-500">Entrez un montant (sera auto-calculé en pourcentage)</p>
                  </div>

                  {/* Remaining Balance After Discount */}
                  {selectedEntity && remainingBalance !== null && (
                    <div className={`p-3 rounded-lg border ${
                      remainingBalance > 0 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-red-50 border-red-200'
                    }`}>
                      <p className={`text-sm font-semibold ${
                        remainingBalance > 0 
                          ? 'text-green-800' 
                          : 'text-red-800'
                      }`}>
                        Solde Restant Après Remise: {remainingBalance.toFixed(2)} MAD
                      </p>
                    </div>
                  )}

                  {/* Reason */}
                  <div className="space-y-2">
                    <Label htmlFor="reason">Raison de la Remise</Label>
                    <Input
                      id="reason"
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      placeholder="Ex: Fidélité client, Volume d'achat, Accord commercial"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Annuler
                    </Button>
                    <Button type="submit" disabled={loading}>
                      {loading ? 'Enregistrement...' : 'Enregistrer'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value) => {
            setActiveTab(value as 'customer' | 'supplier' | 'store');
            setSearchTerm('');
            setSortConfig(null);
          }}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="customer">Clients</TabsTrigger>
              <TabsTrigger value="supplier">Fournisseurs</TabsTrigger>
              <TabsTrigger value="store">Magasins</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder={`Rechercher une remise ${getEntityTypeLabel(activeTab).toLowerCase()}...`}
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
                            onClick={() => toggleSort('type')}
                            className="inline-flex items-center gap-2 font-semibold hover:underline"
                            title="Trier"
                          >
                            Type <span className="text-xs opacity-70">{getSortIndicator('type')}</span>
                          </button>
                        </TableHead>
                        <TableHead className="text-center">
                          <button
                            type="button"
                            onClick={() => toggleSort('percentage')}
                            className="inline-flex items-center gap-2 font-semibold hover:underline justify-center w-full"
                            title="Trier"
                          >
                            Pourcentage (%) <span className="text-xs opacity-70">{getSortIndicator('percentage')}</span>
                          </button>
                        </TableHead>
                        <TableHead className="text-center">
                          <button
                            type="button"
                            onClick={() => toggleSort('amount')}
                            className="inline-flex items-center gap-2 font-semibold hover:underline justify-center w-full"
                            title="Trier"
                          >
                            Montant (MAD) <span className="text-xs opacity-70">{getSortIndicator('amount')}</span>
                          </button>
                        </TableHead>
                        <TableHead>
                          <button
                            type="button"
                            onClick={() => toggleSort('reason')}
                            className="inline-flex items-center gap-2 font-semibold hover:underline"
                            title="Trier"
                          >
                            Raison <span className="text-xs opacity-70">{getSortIndicator('reason')}</span>
                          </button>
                        </TableHead>
                        <TableHead>
                          <button
                            type="button"
                            onClick={() => toggleSort('date')}
                            className="inline-flex items-center gap-2 font-semibold hover:underline"
                            title="Trier"
                          >
                            Date <span className="text-xs opacity-70">{getSortIndicator('date')}</span>
                          </button>
                        </TableHead>
                        <TableHead className="text-center">
                          <button
                            type="button"
                            onClick={() => toggleSort('status')}
                            className="inline-flex items-center gap-2 font-semibold hover:underline justify-center w-full"
                            title="Trier"
                          >
                            Statut <span className="text-xs opacity-70">{getSortIndicator('status')}</span>
                          </button>
                        </TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedDiscounts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-gray-500 py-8">
                            Aucune remise trouvée
                          </TableCell>
                        </TableRow>
                      ) : (
                        sortedDiscounts.map((discount) => (
                          <TableRow key={discount.id}>
                            <TableCell className="font-medium">{discount.entity_name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {getEntityTypeLabel(discount.entity_type)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center font-semibold">
                              {discount.discount_percentage.toFixed(2)}%
                            </TableCell>
                            <TableCell className="text-center font-semibold text-green-600">
                              {discount.discount_amount.toFixed(2)} MAD
                            </TableCell>
                            <TableCell className="max-w-xs truncate">{discount.reason || '-'}</TableCell>
                            <TableCell className="text-sm text-gray-600">
                              {new Date(discount.applied_date).toLocaleDateString('fr-FR')}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge
                                className={`cursor-pointer ${
                                  discount.status === 'active'
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}
                                onClick={() => handleToggleStatus(discount)}
                              >
                                {discount.status === 'active' ? '✓ Actif' : '✗ Inactif'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEdit(discount)}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDelete(discount.id)}
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
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-800">À propos de la Gestion des Remises Générales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-blue-700 space-y-2">
            <p>✓ Gérez les remises générales pour clients, fournisseurs et magasins</p>
            <p>✓ Appliquez des remises en pourcentage ou en montant fixe (auto-calculé)</p>
            <p>✓ Les remises s'appliquent automatiquement aux factures, BL d'achat et tous les documents</p>
            <p>✓ Autocomplete pour sélectionner rapidement une entité</p>
            <p>✓ Visualisez le solde restant après application de la remise</p>
            <p>✓ Activez/désactivez les remises en cliquant sur le statut</p>
            <p>✓ Suivez les raisons et les dates d'application des remises</p>
            <p>✓ Validation automatique pour éviter les remises supérieures au solde</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
