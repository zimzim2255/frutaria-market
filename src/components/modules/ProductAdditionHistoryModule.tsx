import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Eye, Download, Search, Filter, Calendar, Package, TrendingUp, DollarSign, Trash2, ArrowLeft, FileText } from 'lucide-react';
import { projectId } from '../../utils/supabase/info';
import { toast } from 'sonner';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { exportToExcelHtml, exportToPdfTable, type TableColumn } from '../../utils/export/exportUtils';

interface ProductAddition {
  id: string;
  product_id: string;
  reference: string;
  name: string;
  quantity_added: number;
  purchase_price: number;
  sale_price: number;
  supplier_id?: string;
  supplier_name?: string;
  category?: string;
  created_at: string;
  operation_date?: string; // Custom operation date (optional, falls back to created_at)
  created_by?: string;
  created_by_email?: string;
  lot?: string;
  number_of_boxes?: number;
  avg_net_weight_per_box?: number;
  fourchette_min?: number;
  fourchette_max?: number;
  total_value: number;
  stock_reference?: string;
  // Requested extra fields
  caisse?: string;
  moyenne?: number;
  // Magasin filter support (when backend returns store_id)
  store_id?: string;
}

interface StockReferenceGroup {
  stock_reference: string;
  products: ProductAddition[];
  total_quantity: number;
  total_value: number;
  product_count: number;
}

interface ProductAdditionStats {
  totalAdditions: number;
  totalQuantityAdded: number;
  totalCaisseAdded: number;
  totalValueAdded: number;
  averagePrice: number;
  uniqueProducts: number;
}

export default function ProductAdditionHistoryModule({ session }: { session: any }) {
  const [additions, setAdditions] = useState<ProductAddition[]>([]);
  const [filteredAdditions, setFilteredAdditions] = useState<ProductAddition[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string>('user');
  const [effectiveUserPermissions, setEffectiveUserPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<ProductAdditionStats>({
    totalAdditions: 0,
    totalQuantityAdded: 0,
    totalCaisseAdded: 0,
    totalValueAdded: 0,
    averagePrice: 0,
    uniqueProducts: 0,
  });

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [filterSupplier, setFilterSupplier] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStore, setFilterStore] = useState<string>('all');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // Details dialog
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedAddition, setSelectedAddition] = useState<ProductAddition | null>(null);

  // Sorting state
  const [sortByValue, setSortByValue] = useState<'none' | 'high-to-low' | 'low-to-high'>('none');

  // Pagination state
  const [displayLimit, setDisplayLimit] = useState(100);

  // Safe table sorting (click headers)
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
  // Helper to get the display date: use operation_date if set, otherwise fall back to created_at
  const getDisplayDate = (a: ProductAddition) => {
    return a.operation_date || a.created_at;
  };

  const sortDate = (v: any) => {
    const t = v ? new Date(String(v)).getTime() : NaN;
    return Number.isFinite(t) ? t : 0;
  };

  const hasPermission = (permission: string) => {
    if (currentUserRole === 'admin') return true;
    return effectiveUserPermissions.includes(permission);
  };

  const canViewHistory = hasPermission('Voir Historique Ajouts');
  const canExportHistory = hasPermission('Exporter Historique Ajouts (CSV)');
  // Reuse the same permission for other export formats.
  const canExportPdf = canExportHistory;
  const canExportExcel = canExportHistory;
  const canViewAdditionDetails = hasPermission("Voir Détails Ajout");

  // Fetch current user role + permissions
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/users`,
          {
            headers: {
              'Authorization': `Bearer ${session?.access_token}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const currentUser = data.users?.find((u: any) => u.email === session.user?.email);
          setCurrentUserRole(currentUser?.role || 'user');
          setEffectiveUserPermissions(Array.isArray(currentUser?.permissions) ? currentUser.permissions : []);
        }
      } catch (e) {
        console.warn('Error loading user permissions for product addition history:', e);
      }
    };

    if (session?.access_token) fetchCurrentUser();
  }, [session?.access_token]);

  // Fetch product additions history
  const fetchProductAdditions = async () => {
    setLoading(true);
    try {
      // Fetch immutable additions history
      const historyResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/product-additions-history`,
        {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
          },
        }
      );

      if (!historyResponse.ok) {
        toast.error('Erreur lors du chargement de l\'historique');
        setLoading(false);
        return;
      }

      const historyData = await historyResponse.json();
      const historyRows = historyData.history || [];

      // Fetch stores (magasins) for filter dropdown
      try {
        const storesRes = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/stores`,
          {
            headers: {
              'Authorization': `Bearer ${session?.access_token}`,
            },
          }
        );

        if (storesRes.ok) {
          const storesData = await storesRes.json();
          const list = (storesData.stores || []).sort((a: any, b: any) => String(a?.name || '').localeCompare(String(b?.name || '')));
          setStores(list);
        }
      } catch (e) {
        console.warn('Could not fetch stores for product additions filter:', e);
      }

      // Fetch suppliers to map supplier_id to supplier_name
      let suppliersMap: { [key: string]: string } = {};
      try {
        const suppliersResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/suppliers`,
          {
            headers: {
              'Authorization': `Bearer ${session?.access_token}`,
            },
          }
        );

        if (suppliersResponse.ok) {
          const suppliersData = await suppliersResponse.json();
          const suppliers = suppliersData.suppliers || [];
          suppliersMap = suppliers.reduce((acc: any, supplier: any) => {
            acc[supplier.id] = supplier.name;
            return acc;
          }, {});
        }
      } catch (error) {
        console.warn('Could not fetch suppliers:', error);
      }

      // Transform history rows into additions history (rendering must stay identical)
      const additionsHistory: ProductAddition[] = historyRows.map((row: any) => {
        const caisseNum = Number(row.caisse ?? 0) || 0;
        const quantite = Number(row.quantite ?? 0) || 0;
        const purchase = Number(row.purchase_price ?? 0) || 0;

        const caisse = caisseNum > 0 ? String(caisseNum) : '';

        const moyenneFromDb = Number(row.moyenne);
        const moyenne = Number.isFinite(moyenneFromDb) && moyenneFromDb > 0
          ? moyenneFromDb
          : (caisseNum > 0 && quantite > 0 ? Number((quantite / caisseNum).toFixed(2)) : 0);

        // IMPORTANT: In this page, "Valeur Totale" must be based on the operation quantity (quantite),
        // not on caisse. This keeps the history consistent with the user's expectation.
        const computedTotalValue = (Number.isFinite(quantite) ? quantite : 0) * (Number.isFinite(purchase) ? purchase : 0);

        return {
          id: row.id,
          product_id: row.product_id,
          reference: row.reference || '',
          name: row.name || '',
          quantity_added: quantite,
          purchase_price: purchase,
          sale_price: Number(row.sale_price ?? 0) || 0,
          supplier_id: row.supplier_id,
          supplier_name: row.supplier_name || (row.supplier_id ? (suppliersMap[row.supplier_id] || '') : ''),
          category: row.category || '',
          created_at: row.created_at || new Date().toISOString(),
          operation_date: row.operation_date || null, // Custom operation date (optional)
          created_by: row.created_by,
          created_by_email: row.created_by_email,
          lot: row.lot,
          number_of_boxes: row.quantite,
          avg_net_weight_per_box: row.moyenne,
          fourchette_min: row.fourchette_min,
          fourchette_max: row.fourchette_max,
          // Use computed value (quantite × prix_achat). Do not use row.total_value (which is caisse × prix_achat).
          total_value: computedTotalValue,
          stock_reference: row.stock_reference || '',
          caisse,
          moyenne,
          store_id: row.store_id || undefined,
        };
      });

      setAdditions(additionsHistory);
      // Stats will be computed from the filtered list (see filters effect)
      extractFilters(additionsHistory);
    } catch (error: any) {
      console.error('Error fetching product additions:', error);
      toast.error('Erreur lors du chargement de l\'historique');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (additionsList: ProductAddition[]) => {
    const stats: ProductAdditionStats = {
      totalAdditions: additionsList.length,
      totalQuantityAdded: additionsList.reduce((sum, a) => sum + a.quantity_added, 0),
      totalCaisseAdded: additionsList.reduce((sum, a) => sum + (Number((a as any).caisse) || 0), 0),
      totalValueAdded: additionsList.reduce((sum, a) => sum + a.total_value, 0),
      averagePrice: 0,
      uniqueProducts: new Set(additionsList.map(a => a.product_id)).size,
    };

    if (additionsList.length > 0 && stats.totalQuantityAdded > 0) {
      stats.averagePrice = stats.totalValueAdded / stats.totalQuantityAdded;
    }

    setStats(stats);
  };

  const extractFilters = (additionsList: ProductAddition[]) => {
    // Extract unique suppliers
    const uniqueSuppliers = Array.from(
      new Map(
        additionsList
          .filter(a => a.supplier_id)
          .map(a => [a.supplier_id, { id: a.supplier_id, name: a.supplier_name }])
      ).values()
    );
    setSuppliers(uniqueSuppliers);

    // Extract unique categories
    const uniqueCategories = Array.from(
      new Set(additionsList.map(a => a.category).filter(Boolean))
    ) as string[];
    setCategories(uniqueCategories);
  };

  useEffect(() => {
    if (session?.access_token && canViewHistory) {
      fetchProductAdditions();
    }
    if (session?.access_token && !canViewHistory) {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token, canViewHistory]);

  // Apply filters
  useEffect(() => {
    // Reset pagination when filters change
    setDisplayLimit(100);

    let filtered = additions;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(a =>
        a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.reference.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Date range filter
    if (startDate) {
      const start = new Date(startDate + 'T00:00:00');
      filtered = filtered.filter(a => new Date(a.created_at) >= start);
    }

    if (endDate) {
      const end = new Date(endDate + 'T23:59:59');
      filtered = filtered.filter(a => new Date(a.created_at) <= end);
    }

    // Supplier filter
    if (filterSupplier !== 'all') {
      filtered = filtered.filter(a => a.supplier_id === filterSupplier);
    }

    // Category filter
    if (filterCategory !== 'all') {
      filtered = filtered.filter(a => a.category === filterCategory);
    }

    // Store (Magasin) filter
    if (filterStore !== 'all') {
      filtered = filtered.filter(a => String((a as any).store_id || '') === String(filterStore));
    }

    // Sort by Valeur Totale
    if (sortByValue === 'high-to-low') {
      filtered = filtered.sort((a, b) => b.total_value - a.total_value);
    } else if (sortByValue === 'low-to-high') {
      filtered = filtered.sort((a, b) => a.total_value - b.total_value);
    }

    setFilteredAdditions(filtered);

    // IMPORTANT: stats must reflect the currently filtered list, not the full dataset
    calculateStats(filtered);
  }, [searchTerm, startDate, endDate, filterSupplier, filterCategory, filterStore, additions, sortByValue]);

  const sortedAdditions = (() => {
    const list = filteredAdditions.slice();
    if (!sortConfig) return list;

    const { key, direction } = sortConfig;
    const factor = direction === 'asc' ? 1 : -1;

    const getValue = (a: ProductAddition) => {
      switch (key) {
        case 'reference':
          return sortString(a.reference);
        case 'name':
          return sortString(a.name);
        case 'category':
          return sortString(a.category);
        case 'caisse':
          return sortNumber((a as any).caisse);
        case 'quantity':
          return sortNumber(a.quantity_added);
        case 'moyenne':
          return sortNumber((a as any).moyenne);
        case 'total_value':
          return sortNumber(a.total_value);
        case 'fourchette_min':
          return sortNumber(a.fourchette_min);
        case 'fourchette_max':
          return sortNumber(a.fourchette_max);
        case 'purchase_price':
          return sortNumber(a.purchase_price);
        case 'supplier':
          return sortString(a.supplier_name);
        case 'date':
          return sortDate(a.created_at);
        default:
          return '';
      }
    };

    list.sort((x, y) => {
      const av: any = getValue(x);
      const bv: any = getValue(y);

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

  // Paginated additions (display only first `displayLimit` items)
  const paginatedAdditions = sortedAdditions.slice(0, displayLimit);

  const handleViewDetails = (addition: ProductAddition) => {
    if (!canViewAdditionDetails) {
      toast.error("Vous n'avez pas la permission « Voir Détails Ajout »");
      return;
    }
    setSelectedAddition(addition);
    setShowDetailsDialog(true);
  };

  const handleBackFromDetails = () => {
    setShowDetailsDialog(false);
    setSelectedAddition(null);
  };

  // If showing details, render full-page view
  if (showDetailsDialog && selectedAddition) {
    return (
      <div className="space-y-6 p-6">
        {/* Header with Back Button */}
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={handleBackFromDetails}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Détails de l'Ajout de Produit</h1>
            <p className="text-gray-600 mt-1">Référence: {selectedAddition.reference}</p>
          </div>
        </div>

        {/* Product Information */}
        <Card>
          <CardHeader>
            <CardTitle>Informations du Produit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-semibold text-gray-700">Référence</Label>
                <p className="text-lg font-mono font-medium text-gray-900 mt-1">
                  {selectedAddition.reference}
                </p>
              </div>
              <div>
                <Label className="text-sm font-semibold text-gray-700">Nom du Produit</Label>
                <p className="text-lg font-medium text-gray-900 mt-1">
                  {selectedAddition.name}
                </p>
              </div>
              <div>
                <Label className="text-sm font-semibold text-gray-700">Catégorie</Label>
                <p className="text-lg font-medium text-gray-900 mt-1">
                  {selectedAddition.category || '-'}
                </p>
              </div>
              <div>
                <Label className="text-sm font-semibold text-gray-700">Lot</Label>
                <p className="text-lg font-medium text-gray-900 mt-1">
                  {selectedAddition.lot || '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quantity and Pricing */}
        <Card>
          <CardHeader>
            <CardTitle>Quantité et Tarification</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <Label className="text-sm font-semibold text-gray-700">Quantité Ajoutée</Label>
                <p className="text-3xl font-bold text-blue-600 mt-2">
                  {selectedAddition.quantity_added}
                </p>
              </div>
              <div>
                <Label className="text-sm font-semibold text-gray-700">Prix d'Achat (MAD)</Label>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {selectedAddition.purchase_price.toFixed(2)}
                </p>
              </div>
              <div>
                <Label className="text-sm font-semibold text-gray-700">Prix de Vente (MAD)</Label>
                <p className="text-3xl font-bold text-green-600 mt-2">
                  {selectedAddition.sale_price.toFixed(2)}
                </p>
              </div>
              <div>
                <Label className="text-sm font-semibold text-gray-700">Valeur Totale (MAD)</Label>
                <p className="text-3xl font-bold text-orange-600 mt-2">
                  {selectedAddition.total_value.toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Supplier Information */}
        <Card>
          <CardHeader>
            <CardTitle>Fournisseur</CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <Label className="text-sm font-semibold text-gray-700">Nom du Fournisseur</Label>
              <p className="text-lg font-medium text-gray-900 mt-2">
                {selectedAddition.supplier_name || '-'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Weight and Packaging Details */}
        {(selectedAddition.number_of_boxes || selectedAddition.avg_net_weight_per_box) && (
          <Card>
            <CardHeader>
              <CardTitle>Détails d'Emballage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                {selectedAddition.number_of_boxes && (
                  <div>
                    <Label className="text-sm font-semibold text-gray-700">Nombre de Boîtes</Label>
                    <p className="text-lg font-medium text-gray-900 mt-2">
                      {selectedAddition.number_of_boxes}
                    </p>
                  </div>
                )}
                {selectedAddition.avg_net_weight_per_box && (
                  <div>
                    <Label className="text-sm font-semibold text-gray-700">Poids Moyen/Boîte (kg)</Label>
                    <p className="text-lg font-medium text-gray-900 mt-2">
                      {selectedAddition.avg_net_weight_per_box}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Fourchette Information */}
        {(selectedAddition.fourchette_min !== undefined || selectedAddition.fourchette_max !== undefined) && (
          <Card>
            <CardHeader>
              <CardTitle>Fourchette de Prix</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                {selectedAddition.fourchette_min !== undefined && (
                  <div>
                    <Label className="text-sm font-semibold text-gray-700">Fourchette Min</Label>
                    <p className="text-lg font-medium text-gray-900 mt-2">
                      {selectedAddition.fourchette_min || '-'}
                    </p>
                  </div>
                )}
                {selectedAddition.fourchette_max !== undefined && (
                  <div>
                    <Label className="text-sm font-semibold text-gray-700">Fourchette Max</Label>
                    <p className="text-lg font-medium text-gray-900 mt-2">
                      {selectedAddition.fourchette_max || '-'}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Metadata */}
        <Card>
          <CardHeader>
            <CardTitle>Informations Supplémentaires</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <div>
                <Label className="text-sm font-semibold text-gray-700">Date d'Opération</Label>
                <p className="text-lg font-medium text-gray-900 mt-2">
                  {new Date(getDisplayDate(selectedAddition)).toLocaleDateString('fr-FR')}
                </p>
              </div>
              <div>
                <Label className="text-sm font-semibold text-gray-700">Heure d'Ajout</Label>
                <p className="text-lg font-medium text-gray-900 mt-2">
                  {new Date(selectedAddition.created_at).toLocaleTimeString('fr-FR')}
                </p>
              </div>
              <div>
                <Label className="text-sm font-semibold text-gray-700">Ajouté par</Label>
                <p className="text-lg font-medium text-gray-900 mt-2">
                  {selectedAddition.created_by_email || '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Back Button */}
        <div className="flex justify-start">
          <Button onClick={handleBackFromDetails} className="bg-blue-600 hover:bg-blue-700 text-white">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour à la Liste
          </Button>
        </div>
      </div>
    );
  }

  const getExportColumns = (): TableColumn<ProductAddition>[] => [
    { header: 'Référence', accessor: (a) => a.reference, cellWidth: 22 },
    { header: 'Nom du Produit', accessor: (a) => a.name, cellWidth: 34 },
    { header: 'Catégorie', accessor: (a) => a.category || '-', cellWidth: 22 },
    { header: 'Caisse', accessor: (a) => a.caisse || '-', cellWidth: 18 },
    { header: 'Quantité\nAjoutée', accessor: (a) => a.quantity_added, align: 'right', cellWidth: 14 },
    { header: 'Moyenne', accessor: (a) => (a.moyenne !== undefined ? Number(a.moyenne).toFixed(2) : '-'), align: 'right', cellWidth: 14 },
    { header: 'Valeur\nTotale (MAD)', accessor: (a) => a.total_value.toFixed(2), align: 'right', cellWidth: 18 },
    { header: 'Fourchette\nMin', accessor: (a) => a.fourchette_min ?? '-', align: 'right', cellWidth: 14 },
    { header: 'Fourchette\nMax', accessor: (a) => a.fourchette_max ?? '-', align: 'right', cellWidth: 14 },
    { header: "Prix d'Achat\n(MAD)", accessor: (a) => a.purchase_price.toFixed(2), align: 'right', cellWidth: 16 },
    { header: 'Fournisseur', accessor: (a) => a.supplier_name || '-', cellWidth: 24 },
    { header: "Date\nd'Opération", accessor: (a) => new Date(getDisplayDate(a)).toLocaleDateString('fr-FR'), cellWidth: 14 },
    { header: 'Ajouté\npar', accessor: (a) => a.created_by_email || '-', cellWidth: 18 },
  ];

  const ensureCanExport = () => {
    if (!canExportHistory) {
      toast.error("Vous n'avez pas la permission « Exporter Historique Ajouts (CSV) »");
      return false;
    }
    if (sortedAdditions.length === 0) {
      toast.error('Aucune donnée à exporter');
      return false;
    }
    return true;
  };

  
  const handleExportExcel = () => {
    if (!ensureCanExport()) return;

    const datePart = new Date().toISOString().split('T')[0];
    exportToExcelHtml(sortedAdditions, getExportColumns(), `historique-ajouts-produits-${datePart}.xls`);
    toast.success('Fichier Excel exporté avec succès');
  };

  const handleExportPdf = () => {
    if (!ensureCanExport()) return;

    const datePart = new Date().toISOString().split('T')[0];

    exportToPdfTable({
      title: 'RAPPORT - Historique Produit Ajouts',
      subtitle: `Période: ${startDate ? new Date(startDate).toLocaleDateString('fr-FR') : '—'} → ${endDate ? new Date(endDate).toLocaleDateString('fr-FR') : '—'}`,
      filename: `Rapport_Historique_Ajouts_${datePart}.pdf`,
      headerStats: [
        { label: 'TOTAL AJOUTS', value: String(stats.totalAdditions) },
        { label: 'QUANTITÉ TOTALE', value: String(stats.totalQuantityAdded) },
        { label: 'CAISSE TOTALE', value: String(stats.totalCaisseAdded) },
        { label: 'VALEUR TOTALE', value: `${stats.totalValueAdded.toFixed(2)} MAD` },
        { label: 'PRODUITS UNIQUES', value: String(stats.uniqueProducts) },
      ],
      rows: sortedAdditions,
      columns: getExportColumns(),
      orientation: 'landscape',
    });

    toast.success('PDF exporté avec succès');
  };

  if (!canViewHistory) {
    return (
      <div className="space-y-6 p-6">
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
          <h1 className="text-xl font-bold text-red-700">Accès refusé</h1>
          <p className="text-sm text-red-600 mt-1">Vous n'avez pas la permission « Voir Historique Ajouts ».</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">📋 Historique Produit Ajouts</h1>
          <p className="text-gray-600 mt-1">Consultez tous les produits ajoutés à l'inventaire avec filtres avancés</p>
        </div>
        <Button
          onClick={fetchProductAdditions}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {loading ? 'Chargement...' : 'Actualiser'}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-gray-600 text-sm">Total Ajouts</p>
              <p className="text-3xl font-bold text-gray-900">{stats.totalAdditions}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-gray-600 text-sm">Quantité Totale</p>
              <p className="text-3xl font-bold text-blue-600">{stats.totalQuantityAdded}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-gray-600 text-sm">Valeur Totale</p>
              <p className="text-3xl font-bold text-green-600">{stats.totalValueAdded.toFixed(2)} MAD</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-gray-600 text-sm">Caisse Totale</p>
              <p className="text-3xl font-bold text-sky-600">{stats.totalCaisseAdded}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-gray-600 text-sm">Prix Moyen</p>
              <p className="text-3xl font-bold text-orange-600">{stats.averagePrice.toFixed(2)} MAD</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-gray-600 text-sm">Produits Uniques</p>
              <p className="text-3xl font-bold text-purple-600">{stats.uniqueProducts}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters (collapsible) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filtres Avancés
            </CardTitle>

            {/* Export actions are visible even when filters panel is collapsed */}
            <div className="flex items-center gap-2 flex-wrap justify-end">
              
              <Button
                onClick={handleExportExcel}
                disabled={!canExportExcel}
                title={!canExportExcel ? "Vous n'avez pas la permission « Exporter Historique Ajouts (CSV) »" : undefined}
                variant="outline"
                size="sm"
                className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
              >
                <Download className="w-4 h-4 mr-2" />
                Excel
              </Button>

              <Button
                onClick={handleExportPdf}
                disabled={!canExportPdf}
                title={!canExportPdf ? "Vous n'avez pas la permission « Exporter Historique Ajouts (CSV) »" : undefined}
                variant="outline"
                size="sm"
                className="border-red-600 text-red-700 hover:bg-red-50"
              >
                <FileText className="w-4 h-4 mr-2" />
                PDF
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowFilters((v) => !v)}
                className="bg-white"
              >
                {showFilters ? 'Masquer' : 'Afficher'}
              </Button>
            </div>
          </div>
        </CardHeader>
        {showFilters && (
          <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Rechercher par nom ou référence..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Start Date */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                type="date"
                className="pl-10"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="Date de début"
              />
            </div>

            {/* End Date */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                type="date"
                className="pl-10"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="Date de fin"
              />
            </div>

            {/* Supplier Filter */}
            <select
              value={filterSupplier}
              onChange={(e) => setFilterSupplier(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tous les fournisseurs</option>
              {suppliers.map(supplier => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>

            {/* Category Filter */}
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Toutes les catégories</option>
              {categories.map(category => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

            {/* Store Filter (Magasin) */}
            <select
              value={filterStore}
              onChange={(e) => setFilterStore(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              title={stores.length === 0 ? 'Aucun magasin chargé (ou API non disponible)' : undefined}
            >
              <option value="all">Tous les magasins</option>
              {stores.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            {/* Sort by Valeur Totale */}
            <select
              value={sortByValue}
              onChange={(e) => setSortByValue(e.target.value as 'none' | 'high-to-low' | 'low-to-high')}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="none">Trier par Valeur Totale</option>
              <option value="high-to-low">📊 Valeur Totale: Élevée → Basse</option>
              <option value="low-to-high">📊 Valeur Totale: Basse → Élevée</option>
            </select>
          </div>

          {/* Clear Filters Button */}
          <div className="mt-4 flex gap-2">
            <Button
              onClick={() => {
                setSearchTerm('');
                setStartDate('');
                setEndDate('');
                setFilterSupplier('all');
                setFilterCategory('all');
                setFilterStore('all');
              }}
              variant="outline"
              className="text-gray-700"
            >
              Réinitialiser les filtres
            </Button>
          </div>
          </CardContent>
        )}
      </Card>

      {/* Additions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Ajouts de Produits ({sortedAdditions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {sortedAdditions.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">Aucun ajout de produit trouvé</p>
              <p className="text-sm text-gray-500 mt-1">Essayez de modifier vos filtres</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('reference')} className="inline-flex items-center gap-2 hover:underline">
                        Référence <span className="text-xs opacity-70">{getSortIndicator('reference')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('name')} className="inline-flex items-center gap-2 hover:underline">
                        Nom du Produit <span className="text-xs opacity-70">{getSortIndicator('name')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('category')} className="inline-flex items-center gap-2 hover:underline">
                        Catégorie <span className="text-xs opacity-70">{getSortIndicator('category')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('caisse')} className="inline-flex items-center gap-2 hover:underline">
                        Caisse <span className="text-xs opacity-70">{getSortIndicator('caisse')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('quantity')} className="inline-flex items-center gap-2 hover:underline justify-end w-full">
                        Quantité <span className="text-xs opacity-70">{getSortIndicator('quantity')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('moyenne')} className="inline-flex items-center gap-2 hover:underline justify-end w-full">
                        Moyenne <span className="text-xs opacity-70">{getSortIndicator('moyenne')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('total_value')} className="inline-flex items-center gap-2 hover:underline justify-end w-full">
                        Valeur Totale <span className="text-xs opacity-70">{getSortIndicator('total_value')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('fourchette_min')} className="inline-flex items-center gap-2 hover:underline justify-end w-full">
                        Fourchette Min <span className="text-xs opacity-70">{getSortIndicator('fourchette_min')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('fourchette_max')} className="inline-flex items-center gap-2 hover:underline justify-end w-full">
                        Fourchette Max <span className="text-xs opacity-70">{getSortIndicator('fourchette_max')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('purchase_price')} className="inline-flex items-center gap-2 hover:underline justify-end w-full">
                        Prix d'Achat <span className="text-xs opacity-70">{getSortIndicator('purchase_price')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('supplier')} className="inline-flex items-center gap-2 hover:underline">
                        Fournisseur <span className="text-xs opacity-70">{getSortIndicator('supplier')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('date')} className="inline-flex items-center gap-2 hover:underline">
                        Date <span className="text-xs opacity-70">{getSortIndicator('date')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {paginatedAdditions.map((addition) => (
                    <tr key={addition.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-mono font-medium text-gray-900">{addition.reference}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 font-medium">{addition.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{addition.category || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{(addition as any).caisse || '-'}</td>
                      <td className="px-6 py-4 text-sm text-right font-semibold text-blue-600">{addition.quantity_added}</td>
                      <td className="px-6 py-4 text-sm text-right font-semibold text-indigo-600">
                        {(addition as any).moyenne !== undefined ? Number((addition as any).moyenne).toFixed(2) : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-semibold text-green-600">{addition.total_value.toFixed(2)} MAD</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-700">{addition.fourchette_min ?? '-'}</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-700">{addition.fourchette_max ?? '-'}</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-600">{addition.purchase_price.toFixed(2)} MAD</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{addition.supplier_name || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{new Date(getDisplayDate(addition)).toLocaleDateString('fr-FR')}</td>
                      <td className="px-6 py-4 text-sm text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-blue-600 hover:text-blue-700"
                          disabled={!canViewAdditionDetails}
                          title={!canViewAdditionDetails ? "Vous n'avez pas la permission « Voir Détails Ajout »" : undefined}
                          onClick={() => handleViewDetails(addition)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Voir plus button */}
              {sortedAdditions.length > displayLimit && (
                <div className="flex justify-center mt-4">
                  <Button
                    onClick={() => setDisplayLimit((prev) => prev + 100)}
                    variant="outline"
                    className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-300"
                  >
                    Voir plus ({sortedAdditions.length - displayLimit} restants)
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
