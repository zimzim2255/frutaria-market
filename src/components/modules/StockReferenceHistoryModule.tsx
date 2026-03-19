import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Eye, Download, Search, Filter, Calendar, Package, ArrowLeft, Edit, Save, X } from 'lucide-react';
import { projectId } from '../../utils/supabase/info';
import { toast } from 'sonner';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { StockReferenceExportButtons } from './StockReferenceExportButtons';

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
  created_by?: string;
  created_by_email?: string;
  lot?: string;
  number_of_boxes?: number;
  avg_net_weight_per_box?: number;
  fourchette_min?: number;
  fourchette_max?: number;
  total_value: number;
  stock_reference?: string;
}

interface StockReferenceGroup {
  stock_reference: string;
  products: ProductAddition[];
  supplier_name: string;
  total_quantity: number;
  total_value: number;
  product_count: number;
}

const pickGroupSupplierName = (products: ProductAddition[], stockRefSupplierName?: string) => {
  // Source of truth for the group supplier is the Stock Reference Details table.
  // The products list can contain stale supplier_name values (e.g. old cached values on products).
  const authoritative = String(stockRefSupplierName || '').trim();
  if (authoritative) return authoritative;

  // Fallback: pick most frequent supplier_name among products with a supplier_id.
  const counts = new Map<string, number>();
  for (const p of products) {
    const name = String(p?.supplier_name || '').trim();
    const supplierId = String(p?.supplier_id || '').trim();
    if (!supplierId || !name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  if (counts.size === 0) return '-';

  let bestName = '-';
  let bestCount = -1;
  for (const [name, count] of counts.entries()) {
    if (count > bestCount) {
      bestCount = count;
      bestName = name;
    }
  }
  return bestName;
};

interface ProductAdditionStats {
  totalAdditions: number;
  totalQuantityAdded: number;
  totalCaisseAdded: number;
  totalValueAdded: number;
  averagePrice: number;
  uniqueProducts: number;
}

export default function StockReferenceHistoryModule({ session }: { session: any }) {
  // Debug helper: log the exact request body that is sent for product-additions-history PATCH.
  // This helps detect cases where DevTools shows a different payload than what we think we send.
  const debugLogPatchRequest = (historyRowId: string, body: any) => {
    try {
      const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
      console.log('[stock-reference-history] PATCH request about to send', {
        history_row_id: historyRowId,
        bodyString,
      });
    } catch (e) {
      console.log('[stock-reference-history] PATCH request about to send (unstringifiable body)', {
        history_row_id: historyRowId,
        body,
      });
    }
  };
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

  // Stock reference view
  const [showStockRefDetails, setShowStockRefDetails] = useState(false);
  const [selectedStockRef, setSelectedStockRef] = useState<string | null>(null);
  const [stockRefViewMode, setStockRefViewMode] = useState<'by_reference' | 'by_stock_reference'>('by_stock_reference');
  const [stockRefDetailsData, setStockRefDetailsData] = useState<any>(null);
  const [stockRefSupplierNameByRef, setStockRefSupplierNameByRef] = useState<Record<string, string>>({});

  // Stock reference details edit mode (header + company info)
  const [isEditingStockRefDetails, setIsEditingStockRefDetails] = useState(false);
  const [stockRefDetailsDraft, setStockRefDetailsDraft] = useState<any>({});
  const [savingStockRefDetails, setSavingStockRefDetails] = useState(false);

  // Stock reference details modal (for viewing individual products within stock ref details)
  const [showStockRefProductDetails, setShowStockRefProductDetails] = useState(false);
  const [selectedStockRefProduct, setSelectedStockRefProduct] = useState<ProductAddition | null>(null);

  // Sorting state
  const [sortByValue, setSortByValue] = useState<'none' | 'high-to-low' | 'low-to-high'>('none');

  // Safe table sorting (click headers)
  const [groupsSortConfig, setGroupsSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [productsSortConfig, setProductsSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const toggleSort = (table: 'groups' | 'products', key: string) => {
    const setter = table === 'groups' ? setGroupsSortConfig : setProductsSortConfig;
    setter((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  const getSortIndicator = (table: 'groups' | 'products', key: string) => {
    const cfg = table === 'groups' ? groupsSortConfig : productsSortConfig;
    if (!cfg || cfg.key !== key) return '↕';
    return cfg.direction === 'asc' ? '▲' : '▼';
  };

  const sortString = (v: any) => String(v ?? '').trim().toLowerCase();
  const sortNumber = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const formatQty = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(1) : '0.0';
  };

  const formatMoney = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(2) : '0.00';
  };
  const sortDate = (v: any) => {
    const t = v ? new Date(String(v)).getTime() : NaN;
    return Number.isFinite(t) ? t : 0;
  };

  // Produits table edit mode is controlled by header button.
  // We keep per-row drafts but do not show per-row action buttons.
  const [productsDraftById, setProductsDraftById] = useState<Record<string, {
    purchase_price: string;
    number_of_boxes: string;
    supplier_id: string;
  }>>({});

  const hasPermission = (permission: string) => {
    if (currentUserRole === 'admin') return true;
    return effectiveUserPermissions.includes(permission);
  };

  const canViewStockRefHistory = hasPermission('Voir Historique Références Stock');
  const canExportStockRefHistory = hasPermission('Exporter Historique Références Stock (CSV)');
  const canViewStockRefDetails = hasPermission('Voir Détails Référence Stock');

  // Only admin can modify stock reference history details.
  // Manager/user must not see the "Modifier" button.
  const canEditStockRefHistory = String(currentUserRole || '').toLowerCase() === 'admin';

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
        console.warn('Error loading user permissions for stock reference history:', e);
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

      // Fetch stores (magasins) for filter dropdown
      try {
        const storesRes = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/stores`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (storesRes.ok) {
          const storesData = await storesRes.json();
          const list = (storesData.stores || []).sort((a: any, b: any) => String(a?.name || '').localeCompare(String(b?.name || '')));
          setStores(list);
        }
      } catch (e) {
        console.warn('Could not fetch stores for stock reference history filter:', e);
      }

      // Transform history rows into additions history
      const additionsHistory: ProductAddition[] = historyRows.map((row: any) => {
        const caisseNum = Number(row.caisse ?? 0) || 0;
        const quantite = Number(row.quantite ?? 0) || 0;
        const purchase = Number(row.purchase_price ?? 0) || 0;

        // In this module, "Quantité Ajoutée" represents the quantity field (not caisse).
        const effectiveQuantity = quantite;

        // Use computed value (quantite × prix_achat). Do not use row.total_value (which is caisse × prix_achat).
        // Existing DB rows were saved with the old formula and are causing wrong totals.
        const computedTotalValue = (Number.isFinite(quantite) ? quantite : 0) * (Number.isFinite(purchase) ? purchase : 0);

        return {
          id: row.id,
          product_id: row.product_id,
          reference: row.reference || '',
          name: row.name || '',
          quantity_added: effectiveQuantity,
          purchase_price: purchase,
          sale_price: Number(row.sale_price ?? 0) || 0,
          supplier_id: row.supplier_id,
          supplier_name: row.supplier_name || (row.supplier_id ? (suppliersMap[row.supplier_id] || '') : ''),
          category: row.category || '',
          created_at: row.created_at || new Date().toISOString(),
          created_by: row.created_by,
          created_by_email: row.created_by_email,
          lot: row.lot,
          number_of_boxes: row.quantite,
          caisse: caisseNum,
          avg_net_weight_per_box: row.moyenne,
          fourchette_min: row.fourchette_min,
          fourchette_max: row.fourchette_max,
          total_value: computedTotalValue,
          stock_reference: row.stock_reference || '',
          store_id: row.store_id || null,
        } as any;
      });

      setAdditions(additionsHistory);
      calculateStats(additionsHistory);
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
      totalCaisseAdded: additionsList.reduce((sum, a: any) => sum + (Number((a as any).caisse) || 0), 0),
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
    // Extract unique suppliers.
    // IMPORTANT:
    // - For admin: show ALL suppliers from the suppliers table.
    // - For manager/user: keep showing ONLY suppliers that exist in their scoped dataset (their store).

    const buildFromAdditions = () => Array.from(
      new Map(
        additionsList
          .filter(a => a.supplier_id)
          .map(a => [a.supplier_id, { id: a.supplier_id, name: a.supplier_name }])
      ).values()
    );

    if (String(currentUserRole || '').toLowerCase() !== 'admin') {
      setSuppliers(buildFromAdditions());
    } else {
      // Admin: fetch full suppliers list
      (async () => {
        try {
          const resp = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/suppliers`,
            { headers: { Authorization: `Bearer ${session?.access_token}` } }
          );
          if (!resp.ok) {
            setSuppliers(buildFromAdditions());
            return;
          }
          const data = await resp.json().catch(() => ({}));
          const list = Array.isArray(data?.suppliers) ? data.suppliers : [];
          const all = list
            .filter((s: any) => s?.id)
            .map((s: any) => ({ id: String(s.id), name: String(s.name || '').trim() }))
            .filter((s: any) => s.name);

          // Sort by name for dropdown
          all.sort((a: any, b: any) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));

          setSuppliers(all.length > 0 ? all : buildFromAdditions());
        } catch (e) {
          console.warn('Could not fetch full suppliers list for admin filter:', e);
          setSuppliers(buildFromAdditions());
        }
      })();
    }

    // Extract unique categories
    const uniqueCategories = Array.from(
      new Set(additionsList.map(a => a.category).filter(Boolean))
    ) as string[];
    setCategories(uniqueCategories);
  };

  useEffect(() => {
    if (session?.access_token && canViewStockRefHistory) {
      fetchProductAdditions();
    }
    if (session?.access_token && !canViewStockRefHistory) {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token, canViewStockRefHistory]);

  // Apply filters
  useEffect(() => {
    let filtered = additions;

    // IMPORTANT: Override stale supplier names with cached values from stock reference details
    // This ensures the main table always shows the most up-to-date supplier names
    filtered = filtered.map((row) => {
      const stockRef = String(row.stock_reference || '').trim();
      const cachedSupplierName = stockRefSupplierNameByRef[stockRef];
      if (cachedSupplierName && cachedSupplierName !== row.supplier_name) {
        return {
          ...row,
          supplier_name: cachedSupplierName,
        };
      }
      return row;
    });

    // Search filter
    // Search across more fields so "Rechercher" behaves as expected.
    // Includes: product name, reference, stock_reference, supplier name, category.
    if (searchTerm) {
      const q = searchTerm.trim().toLowerCase();
      filtered = filtered.filter((a: any) => {
        const hay = [
          a?.name,
          a?.reference,
          a?.stock_reference,
          a?.supplier_name,
          a?.category,
        ]
          .map((v) => String(v || '').toLowerCase())
          .join(' ');
        return hay.includes(q);
      });
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
      filtered = filtered.filter((a: any) => String(a?.store_id || '') === String(filterStore));
    }

    // Sort by Valeur Totale
    if (sortByValue === 'high-to-low') {
      filtered = filtered.sort((a, b) => b.total_value - a.total_value);
    } else if (sortByValue === 'low-to-high') {
      filtered = filtered.sort((a, b) => a.total_value - b.total_value);
    }

    setFilteredAdditions(filtered);
    calculateStats(filtered);
  }, [searchTerm, startDate, endDate, filterSupplier, filterCategory, filterStore, additions, sortByValue]);

  // Preload stock reference supplier names so the groups table matches the details page.
  // NOTE: Browser console may show NS_BINDING_ABORTED for some requests.
  // This is expected when we abort in-flight requests during rapid re-renders/navigation.
  useEffect(() => {
    if (!session?.access_token) return;
    if (!canViewStockRefHistory) return;
    if (filteredAdditions.length === 0) return;

    const refs = Array.from(
      new Set(
        filteredAdditions
          .map((a) => String(a.stock_reference || '').trim())
          .filter(Boolean)
      )
    );

    const missing = refs.filter((r) => !stockRefSupplierNameByRef[r]);
    if (missing.length === 0) return;

    const controller = new AbortController();

    (async () => {
      try {
        // Be gentle: reduce concurrency + add small spacing to avoid a burst of preflight+GET.
        const concurrency = 2;
        for (let i = 0; i < missing.length; i += concurrency) {
          const chunk = missing.slice(i, i + concurrency);
          const results = await Promise.all(
            chunk.map(async (stockRef) => {
              const resp = await fetch(
                `https://${projectId}.supabase.co/functions/v1/super-handler/stock-reference-details?stock_reference=${encodeURIComponent(stockRef)}`,
                {
                  headers: {
                    Authorization: `Bearer ${session?.access_token}`,
                  },
                  signal: controller.signal,
                }
              );
              if (!resp.ok) return { stockRef, supplier_name: '' };
              const data = await resp.json().catch(() => ({}));
              return {
                stockRef,
                supplier_name: String(data?.details?.supplier_name || '').trim(),
              };
            })
          );

          setStockRefSupplierNameByRef((prev) => {
            const next = { ...prev };
            for (const r of results) {
              if (r.supplier_name) next[r.stockRef] = r.supplier_name;
            }
            return next;
          });

          // tiny delay between batches
          await new Promise((res) => setTimeout(res, 100));
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        console.warn('Failed to preload stock reference suppliers:', e);
      }
    })();

    return () => controller.abort();
  }, [session?.access_token, canViewStockRefHistory, filteredAdditions, stockRefSupplierNameByRef]);

  const fetchStockRefDetails = async (stockRef: string) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/stock-reference-details?stock_reference=${stockRef}`,
        {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const details = data.details || null;

        setStockRefDetailsData(details);

        // Keep a cache of supplier_name by stock_reference for the groups table.
        const supplierName = String(details?.supplier_name || '').trim();
        if (supplierName) {
          setStockRefSupplierNameByRef((prev) => ({
            ...prev,
            [stockRef]: supplierName,
          }));
        }

        // Reset edit mode when navigating between stock refs
        setIsEditingStockRefDetails(false);
        setStockRefDetailsDraft(details || {});
      }
    } catch (error) {
      console.warn('Could not fetch stock reference details:', error);
    }
  };

  const handleViewStockRefProduct = (product: ProductAddition) => {
    setSelectedStockRefProduct(product);
    setShowStockRefProductDetails(true);
  };

  const initProductsDraft = (products: ProductAddition[]) => {
    const next: Record<string, { purchase_price: string; number_of_boxes: string; supplier_id: string; }> = {};
    products.forEach((p) => {
      next[p.id] = {
        purchase_price: String(Number(p.purchase_price ?? 0) || 0),
        number_of_boxes: p.number_of_boxes === undefined || p.number_of_boxes === null ? '' : String(p.number_of_boxes),
        // IMPORTANT: Use the product's own supplier_id, not the stock reference's supplier_id
        // This allows each product to have its own supplier when editing
        supplier_id: String(p.supplier_id || '').trim(),
      };
    });
    setProductsDraftById(next);
  };

  const handleExportCSV = () => {
    if (!canExportStockRefHistory) {
      toast.error("Vous n'avez pas la permission « Exporter Historique Références Stock (CSV) »");
      return;
    }
    if (filteredAdditions.length === 0) {
      toast.error('Aucune donnée à exporter');
      return;
    }

    const headers = [
      'Référence de Stock',
      'Référence',
      'Nom du Produit',
      'Catégorie',
      'Quantité Ajoutée',
      'Prix d\'Achat (MAD)',
      'Prix de Vente (MAD)',
      'Valeur Totale (MAD)',
      'Fournisseur',
      'Lot',
      'Nombre de Boîtes',
      'Poids Moyen/Boîte',
      'Fourchette Min',
      'Fourchette Max',
      'Date d\'Ajout',
      'Ajouté par',
    ];

    const rows = filteredAdditions.map(a => [
      a.stock_reference || '-',
      a.reference,
      a.name,
      a.category || '-',
      a.quantity_added,
      a.purchase_price.toFixed(2),
      a.sale_price.toFixed(2),
      a.total_value.toFixed(2),
      a.supplier_name || '-',
      a.lot || '-',
      a.number_of_boxes || '-',
      a.avg_net_weight_per_box || '-',
      a.fourchette_min || '-',
      a.fourchette_max || '-',
      new Date(a.created_at).toLocaleDateString('fr-FR'),
      a.created_by_email || '-',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `historique-references-stock-${new Date().toISOString().split('T')[0]}.csv`);
    link.click();

    toast.success('Fichier CSV exporté avec succès');
  };

  if (!canViewStockRefHistory) {
    return (
      <div className="space-y-6 p-6">
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
          <h1 className="text-xl font-bold text-red-700">Accès refusé</h1>
          <p className="text-sm text-red-600 mt-1">Vous n'avez pas la permission « Voir Historique Références Stock ».</p>
        </div>
      </div>
    );
  }

  // If showing stock reference details, render full-page view
  if (showStockRefDetails && selectedStockRef) {
    const productsInRefRaw = filteredAdditions.filter(a => a.stock_reference === selectedStockRef);

    // The details page must show ONE row per real product (products.id).
    // `product_additions_history` can have multiple rows per product (restocks), which looks like duplicates.
    // We keep the most recent history row per product_id for display/edit.
    const productsInRef = (() => {
      const byProductId = new Map<string, any>();
      for (const row of productsInRefRaw) {
        const pid = String((row as any)?.product_id || '').trim();
        if (!pid) continue;
        const prev = byProductId.get(pid);
        if (!prev) {
          byProductId.set(pid, row);
          continue;
        }
        const tPrev = prev?.created_at ? new Date(String(prev.created_at)).getTime() : 0;
        const tNext = row?.created_at ? new Date(String(row.created_at)).getTime() : 0;
        if (tNext >= tPrev) byProductId.set(pid, row);
      }
      return Array.from(byProductId.values());
    })();

    const sortedProductsInRef = (() => {
      const list = productsInRef.slice();
      if (!productsSortConfig) return list;

      const { key, direction } = productsSortConfig;
      const factor = direction === 'asc' ? 1 : -1;

      const getValue = (p: ProductAddition) => {
        switch (key) {
          case 'reference':
            return sortString(p.reference);
          case 'name':
            return sortString(p.name);
          case 'category':
            return sortString(p.category);
          case 'caisse':
            return sortNumber((p as any).caisse);
          case 'quantity':
            return sortNumber(p.quantity_added);
          case 'moyenne':
            // moyenne = Quantité / Caisse
            // Here quantity_added is already effectiveQuantity (Quantité × Caisse)
            // so moyenne = effectiveQuantity / Caisse = Quantité
            return p.number_of_boxes ? sortNumber((Number(p.quantity_added || 0) || 0) / (Number(p.number_of_boxes || 0) || 1)) : 0;
          case 'purchase_price':
            return sortNumber(p.purchase_price);
          case 'fourchette_min':
            return sortNumber(p.fourchette_min);
          case 'fourchette_max':
            return sortNumber(p.fourchette_max);
          case 'date':
            return sortDate(p.created_at);
          default:
            return '';
        }
      };

      list.sort((a, b) => {
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
    const totalQty = productsInRef.reduce((sum, p) => sum + p.quantity_added, 0);
    const totalVal = productsInRef.reduce((sum, p) => sum + p.total_value, 0);
    const avgPrice = productsInRef.length > 0 ? totalVal / totalQty : 0;

    // Group by reference if in that mode
    const groupedByReference = stockRefViewMode === 'by_reference' 
      ? productsInRef.reduce((acc: { [key: string]: ProductAddition[] }, product) => {
          const ref = product.reference || 'N/A';
          if (!acc[ref]) {
            acc[ref] = [];
          }
          acc[ref].push(product);
          return acc;
        }, {})
      : null;

    return (
      <div className="space-y-6 p-6">
        {/* Header with Back Button + Edit Mode */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => {
              setShowStockRefDetails(false);
              setIsEditingStockRefDetails(false);
              setProductsSortConfig(null);
            }} disabled={!canViewStockRefDetails} title={!canViewStockRefDetails ? "Vous n'avez pas la permission « Voir Détails Référence Stock »" : undefined}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Retour
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Détails de la Référence de Stock</h1>
            </div>
          </div>

          {canEditStockRefHistory && (
            <div className="flex items-center gap-2">
              {isEditingStockRefDetails ? (
                <>
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white"
                    disabled={savingStockRefDetails}
                    onClick={async () => {
                      if (!selectedStockRef) return;
                      setSavingStockRefDetails(true);
                      try {
                        // 1) Save stock reference details
                        const resp = await fetch(
                          `https://${projectId}.supabase.co/functions/v1/super-handler/stock-reference-details/${encodeURIComponent(selectedStockRef)}`,
                          {
                            method: 'PUT',
                            headers: {
                              'Content-Type': 'application/json',
                              'Authorization': `Bearer ${session?.access_token}`,
                            },
                            body: JSON.stringify({
                              supplier_id: stockRefDetailsDraft?.supplier_id || null,
                              palette_category: stockRefDetailsDraft?.palette_category || null,
                              frais_maritime: stockRefDetailsDraft?.frais_maritime ?? null,
                              frais_transit: stockRefDetailsDraft?.frais_transit ?? null,
                              onssa: stockRefDetailsDraft?.onssa ?? null,
                              frais_divers: stockRefDetailsDraft?.frais_divers ?? null,
                              frais_transport: stockRefDetailsDraft?.frais_transport ?? null,
                              date_dechargement: stockRefDetailsDraft?.date_dechargement || null,
                              entrepot: stockRefDetailsDraft?.entrepot || null,
                              matricule: stockRefDetailsDraft?.matricule || null,
                              date_chargement: stockRefDetailsDraft?.date_chargement || null,
                              magasinage: stockRefDetailsDraft?.magasinage ?? null,
                              taxe: stockRefDetailsDraft?.taxe ?? null,
                            }),
                          }
                        );

                        if (!resp.ok) {
                          const t = await resp.text().catch(() => '');
                          console.error('Failed to update stock reference details:', t);
                          toast.error("Erreur lors de l'enregistrement");
                          return;
                        }

                        const detailsData = await resp.json().catch(() => ({}));
                        setStockRefDetailsData(detailsData.details || stockRefDetailsDraft);

                        // 2) If supplier changed at stock reference level, do a single aggregated update.
                        // This moves the TOTAL of the achat from old supplier -> new supplier and updates all rows.
                        const selectedSupplierId = String(stockRefDetailsDraft?.supplier_id || '').trim() || null;
                        if (selectedSupplierId) {
                          const bulkResp = await fetch(
                            `https://${projectId}.supabase.co/functions/v1/super-handler/product-additions-history/by-stock-reference/${encodeURIComponent(selectedStockRef)}`,
                            {
                              method: 'PATCH',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${session?.access_token}`,
                              },
                              body: JSON.stringify({ supplier_id: selectedSupplierId }),
                            }
                          );

                          if (!bulkResp.ok) {
                            const t = await bulkResp.text().catch(() => '');
                            console.error('Failed to bulk update supplier by stock_reference:', t);
                            toast.error("Erreur lors de l'enregistrement (mise à jour fournisseur)");
                            return;
                          }
                        }

                        // 3) Save products drafts (per-row edits: purchase_price / quantite)
                        // Snapshot drafts at click time to avoid any state mutation during the async loop.
                        const draftsSnapshot = { ...productsDraftById };
                        const updates = Object.entries(draftsSnapshot);
                        for (const [productId, draft] of updates) {
                          const pp = Number(String(draft.purchase_price || '').replace(',', '.'));
                          if (!Number.isFinite(pp) || pp < 0) {
                            toast.error("Prix d'achat invalide");
                            return;
                          }

                          const boxes = draft.number_of_boxes === ''
                            ? null
                            : Number(String(draft.number_of_boxes || '').replace(',', '.'));

                          if (boxes !== null && (!Number.isFinite(boxes) || boxes < 0)) {
                            toast.error('Nombre de boîtes invalide');
                            return;
                          }

                          const resolvedProductRow: any = productsInRef.find((p: any) => String(p.id) === String(productId));
                          const resolvedProductsId = String(resolvedProductRow?.product_id || '').trim();
                          if (!resolvedProductsId) {
                            console.error('[stock-reference-history] Missing resolvedProductsId for history row:', { productId, resolvedProductRow });
                            toast.error("Erreur: produit introuvable (product_id manquant)");
                            return;
                          }

                          // IMPORTANT:
                          // This screen edits an EXISTING product (products.id = resolvedProductsId).
                          // If we send stock_reference in the payload, the backend may treat it as a request
                          // to create/attach a new product under that stock reference (depending on server logic).
                          // So we explicitly avoid sending stock_reference here.
                          // Update the immutable purchase/history row (product_additions_history),
                          // NOT the live products table.
                          // This matches the Supplier Details "Achat" tab which reads from product_additions_history.
                          const r = await fetch(
                            `https://${projectId}.supabase.co/functions/v1/super-handler/product-additions-history/${encodeURIComponent(String(productId))}`,
                            {
                              method: 'PATCH',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${session?.access_token}`,
                              },
                              body: (() => {
                                const payload = {
                                  purchase_price: pp,
                                  quantite: boxes,
                                  // IMPORTANT: in this screen, the supplier dropdown is per-stock-reference.
                                  // The PATCH must use the selected supplier from the stock reference header,
                                  // not the per-row draft (which can remain the old supplier).
                                  supplier_id: String(stockRefDetailsDraft?.supplier_id || '').trim() || null,
                                };
                                console.log('[stock-reference-history] PATCH payload (header save)', {
                                  history_row_id: productId,
                                  payload,
                                });
                                const bodyString = JSON.stringify(payload);
                                debugLogPatchRequest(String(productId), bodyString);
                                return bodyString;
                              })(),
                            }
                          );

                          // If backend says Product not found, it usually means:
                          // - the history row points to a deleted/missing products.id
                          // - or the user is scoped to a different store
                          // In that case, stop early with a clearer message.
                          if (!r.ok) {
                            const t = await r.text().catch(() => '');
                            console.error('Failed to update product:', t);
                            if (t.includes('Product not found')) {
                              toast.error("Produit introuvable (il a peut-être été supprimé ou vous n'avez pas accès à ce magasin)");
                            } else {
                              toast.error("Erreur lors de l'enregistrement");
                            }
                            return;
                          }

                          if (!r.ok) {
                            const t = await r.text().catch(() => '');
                            console.error('Failed to update product:', t);
                            toast.error("Erreur lors de l'enregistrement");
                            return;
                          }
                        }

                        // Refresh history + stock ref details
                        await fetchProductAdditions();
                        await fetchStockRefDetails(selectedStockRef);

                        // IMPORTANT:
                        // This screen displays rows from product_additions_history (immutable snapshots).
                        // Editing a product updates the `products` table, but does NOT rewrite old history rows.
                        // So after saving, we must also update the local UI rows to reflect the new values.
                        // We do this by patching the in-memory additions list for the edited products.
                        setAdditions((prev) => {
                          const next = prev.slice();
                          for (const [historyRowId, draft] of Object.entries(productsDraftById)) {
                            const resolvedProductRow: any = productsInRef.find((p: any) => String(p.id) === String(historyRowId));
                            const pid = String(resolvedProductRow?.product_id || '').trim();
                            if (!pid) continue;

                            const pp = Number(String((draft as any).purchase_price || '').replace(',', '.'));
                            const boxes = (draft as any).number_of_boxes === ''
                              ? null
                              : Number(String((draft as any).number_of_boxes || '').replace(',', '.'));

                            for (let i = 0; i < next.length; i++) {
                              const row: any = next[i];
                              if (String(row?.product_id || '') !== pid) continue;
                              next[i] = {
                                ...row,
                                purchase_price: Number.isFinite(pp) ? pp : row.purchase_price,
                                number_of_boxes: (boxes === null || Number.isFinite(boxes)) ? boxes : row.number_of_boxes,
                                supplier_id: (draft as any).supplier_id || null,
                              };
                            }
                          }
                          return next;
                        });

                        setIsEditingStockRefDetails(false);
                        toast.success('Modifications enregistrées');
                      } catch (e) {
                        console.error('Error saving stock reference + products:', e);
                        toast.error("Erreur lors de l'enregistrement");
                      } finally {
                        setSavingStockRefDetails(false);
                      }
                    }}
                  >
                    {savingStockRefDetails ? 'Enregistrement...' : 'Enregistrer'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsEditingStockRefDetails(false);
                      setStockRefDetailsDraft(stockRefDetailsData || {});
                      // Reset drafts to current values
                      initProductsDraft(productsInRef);
                    }}
                  >
                    Annuler
                  </Button>
                </>
              ) : (
                <Button
                  style={{ backgroundColor: '#ea580c', color: 'white' }}
                  className="hover:opacity-90"
                  onClick={() => {
                    setIsEditingStockRefDetails(true);
                    setStockRefDetailsDraft(stockRefDetailsData || {});
                    initProductsDraft(productsInRef);
                  }}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Modifier
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Main Details Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle>Référence de Stock</CardTitle>
              <StockReferenceExportButtons
                stockReference={String(selectedStockRef || '')}
                supplierName={String(stockRefDetailsData?.supplier_name || '')}
                rows={(productsInRef || []).map((p: any) => ({
                  reference: p.reference,
                  name: p.name,
                  category: p.category,
                  lot: p.lot,
                  number_of_boxes: p.number_of_boxes,
                  purchase_price: p.purchase_price,
                  created_at: p.created_at,
                  caisse: (p as any).caisse,
                }))}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Reference Number */}
            <div>
              <p className="text-gray-600 text-sm font-semibold mb-2">Référence</p>
              <p className="text-3xl font-mono font-bold text-blue-600">{selectedStockRef}</p>
            </div>

            
            {/* Fournisseur Section */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Fournisseur</h3>
              {isEditingStockRefDetails ? (
                <select
                  value={stockRefDetailsDraft?.supplier_id || ''}
                  onChange={(e) => setStockRefDetailsDraft((d: any) => ({ ...d, supplier_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">(Aucun fournisseur)</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              ) : (
                <p className="text-lg font-medium text-gray-900">
                  {stockRefDetailsData?.supplier_name || '-'}
                </p>
              )}
            </div>

            {/* Informations Entreprise Section */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Informations Entreprise</h3>
              
              {/* Palette/Catégorie */}
              <div className="mb-6">
                <Label className="text-sm font-semibold text-gray-700">Palette/Catégorie</Label>
                {isEditingStockRefDetails ? (
                  <Input
                    value={stockRefDetailsDraft?.palette_category || ''}
                    onChange={(e) => setStockRefDetailsDraft((d: any) => ({ ...d, palette_category: e.target.value }))}
                    placeholder="Palette/Catégorie"
                    className="mt-2"
                  />
                ) : (
                  <p className="text-lg font-medium text-gray-900 mt-2">
                    {stockRefDetailsData?.palette_category || '-'}
                  </p>
                )}
              </div>

              {/* Frais Section - Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <Label className="text-sm font-semibold text-gray-700">Frais Maritime (MAD)</Label>
                  {isEditingStockRefDetails ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={stockRefDetailsDraft?.frais_maritime ?? ''}
                      onChange={(e) => setStockRefDetailsDraft((d: any) => ({ ...d, frais_maritime: e.target.value }))}
                      className="mt-2"
                    />
                  ) : (
                    <p className="text-lg font-medium text-gray-900 mt-2">
                      {stockRefDetailsData?.frais_maritime || '0'}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-sm font-semibold text-gray-700">Frais Transit (MAD)</Label>
                  {isEditingStockRefDetails ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={stockRefDetailsDraft?.frais_transit ?? ''}
                      onChange={(e) => setStockRefDetailsDraft((d: any) => ({ ...d, frais_transit: e.target.value }))}
                      className="mt-2"
                    />
                  ) : (
                    <p className="text-lg font-medium text-gray-900 mt-2">
                      {stockRefDetailsData?.frais_transit || '0'}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-sm font-semibold text-gray-700">ONSSA (MAD)</Label>
                  {isEditingStockRefDetails ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={stockRefDetailsDraft?.onssa ?? ''}
                      onChange={(e) => setStockRefDetailsDraft((d: any) => ({ ...d, onssa: e.target.value }))}
                      className="mt-2"
                    />
                  ) : (
                    <p className="text-lg font-medium text-gray-900 mt-2">
                      {stockRefDetailsData?.onssa || '0'}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-sm font-semibold text-gray-700">Frais Divers (MAD)</Label>
                  {isEditingStockRefDetails ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={stockRefDetailsDraft?.frais_divers ?? ''}
                      onChange={(e) => setStockRefDetailsDraft((d: any) => ({ ...d, frais_divers: e.target.value }))}
                      className="mt-2"
                    />
                  ) : (
                    <p className="text-lg font-medium text-gray-900 mt-2">
                      {stockRefDetailsData?.frais_divers || '0'}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-sm font-semibold text-gray-700">Frais Transport (MAD)</Label>
                  {isEditingStockRefDetails ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={stockRefDetailsDraft?.frais_transport ?? ''}
                      onChange={(e) => setStockRefDetailsDraft((d: any) => ({ ...d, frais_transport: e.target.value }))}
                      className="mt-2"
                    />
                  ) : (
                    <p className="text-lg font-medium text-gray-900 mt-2">
                      {stockRefDetailsData?.frais_transport || '0'}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-sm font-semibold text-gray-700">Date Déchargement</Label>
                  {isEditingStockRefDetails ? (
                    <Input
                      type="date"
                      value={stockRefDetailsDraft?.date_dechargement ? String(stockRefDetailsDraft.date_dechargement).slice(0, 10) : ''}
                      onChange={(e) => setStockRefDetailsDraft((d: any) => ({ ...d, date_dechargement: e.target.value }))}
                      className="mt-2"
                    />
                  ) : (
                    <p className="text-lg font-medium text-gray-900 mt-2">
                      {stockRefDetailsData?.date_dechargement 
                        ? new Date(stockRefDetailsData.date_dechargement).toLocaleDateString('fr-FR')
                        : '-'}
                    </p>
                  )}
                </div>
              </div>

              {/* Entrepôt and other fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <Label className="text-sm font-semibold text-gray-700">Entrepôt</Label>
                  {isEditingStockRefDetails ? (
                    <Input
                      value={stockRefDetailsDraft?.entrepot || ''}
                      onChange={(e) => setStockRefDetailsDraft((d: any) => ({ ...d, entrepot: e.target.value }))}
                      className="mt-2"
                    />
                  ) : (
                    <p className="text-lg font-medium text-gray-900 mt-2">
                      {stockRefDetailsData?.entrepot || '-'}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-sm font-semibold text-gray-700">Matricule</Label>
                  {isEditingStockRefDetails ? (
                    <Input
                      value={stockRefDetailsDraft?.matricule || ''}
                      onChange={(e) => setStockRefDetailsDraft((d: any) => ({ ...d, matricule: e.target.value }))}
                      className="mt-2"
                    />
                  ) : (
                    <p className="text-lg font-medium text-gray-900 mt-2">
                      {stockRefDetailsData?.matricule || '-'}
                    </p>
                  )}
                </div>
              </div>

              {/* Date Chargement and Magasinage */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label className="text-sm font-semibold text-gray-700">Date Chargement</Label>
                  {isEditingStockRefDetails ? (
                    <Input
                      type="date"
                      value={stockRefDetailsDraft?.date_chargement ? String(stockRefDetailsDraft.date_chargement).slice(0, 10) : ''}
                      onChange={(e) => setStockRefDetailsDraft((d: any) => ({ ...d, date_chargement: e.target.value }))}
                      className="mt-2"
                    />
                  ) : (
                    <p className="text-lg font-medium text-gray-900 mt-2">
                      {stockRefDetailsData?.date_chargement 
                        ? new Date(stockRefDetailsData.date_chargement).toLocaleDateString('fr-FR')
                        : '-'}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-sm font-semibold text-gray-700">Magasinage (MAD)</Label>
                  {isEditingStockRefDetails ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={stockRefDetailsDraft?.magasinage ?? ''}
                      onChange={(e) => setStockRefDetailsDraft((d: any) => ({ ...d, magasinage: e.target.value }))}
                      className="mt-2"
                    />
                  ) : (
                    <p className="text-lg font-medium text-gray-900 mt-2">
                      {stockRefDetailsData?.magasinage || '0'}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-sm font-semibold text-gray-700">Taxe (MAD)</Label>
                  {isEditingStockRefDetails ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={stockRefDetailsDraft?.taxe ?? ''}
                      onChange={(e) => setStockRefDetailsDraft((d: any) => ({ ...d, taxe: e.target.value }))}
                      className="mt-2"
                    />
                  ) : (
                    <p className="text-lg font-medium text-gray-900 mt-2">
                      {stockRefDetailsData?.taxe || '0'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Products Table */}
        <Card>
          <CardHeader>
            <CardTitle>Produits ({productsInRef.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('products', 'reference')} className="inline-flex items-center gap-2 hover:underline">
                        Référence <span className="text-xs opacity-70">{getSortIndicator('products', 'reference')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('products', 'name')} className="inline-flex items-center gap-2 hover:underline">
                        Nom du Produit <span className="text-xs opacity-70">{getSortIndicator('products', 'name')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('products', 'category')} className="inline-flex items-center gap-2 hover:underline">
                        Catégorie <span className="text-xs opacity-70">{getSortIndicator('products', 'category')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('products', 'caisse')} className="inline-flex items-center gap-2 hover:underline justify-end w-full">
                        Caisse <span className="text-xs opacity-70">{getSortIndicator('products', 'caisse')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('products', 'quantity')} className="inline-flex items-center gap-2 hover:underline justify-end w-full">
                        Quantité <span className="text-xs opacity-70">{getSortIndicator('products', 'quantity')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('products', 'moyenne')} className="inline-flex items-center gap-2 hover:underline justify-end w-full">
                        Moyenne <span className="text-xs opacity-70">{getSortIndicator('products', 'moyenne')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('products', 'purchase_price')} className="inline-flex items-center gap-2 hover:underline justify-end w-full">
                        Prix Unitaire (Achat) <span className="text-xs opacity-70">{getSortIndicator('products', 'purchase_price')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('products', 'fourchette_min')} className="inline-flex items-center gap-2 hover:underline justify-end w-full">
                        Fourchette Min <span className="text-xs opacity-70">{getSortIndicator('products', 'fourchette_min')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('products', 'fourchette_max')} className="inline-flex items-center gap-2 hover:underline justify-end w-full">
                        Fourchette Max <span className="text-xs opacity-70">{getSortIndicator('products', 'fourchette_max')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('products', 'date')} className="inline-flex items-center gap-2 hover:underline">
                        Date <span className="text-xs opacity-70">{getSortIndicator('products', 'date')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedProductsInRef.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-mono font-medium text-gray-900">
                        {product.reference}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                        {product.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {product.category || '-'}
                        {isEditingStockRefDetails && (
                          <div className="mt-2">
                            <select
                              value={productsDraftById[product.id]?.supplier_id || ''}
                              onChange={(e) => {
                                const nextSupplierId = String(e.target.value || '').trim();
                                console.log('[stock-reference-history] supplier dropdown change', {
                                  history_row_id: product.id,
                                  product_id: (product as any)?.product_id,
                                  prev_supplier_id: productsDraftById[product.id]?.supplier_id,
                                  next_supplier_id: nextSupplierId,
                                });
                                setProductsDraftById((prev) => ({
                                  ...prev,
                                  [product.id]: {
                                    ...(prev[product.id] || { purchase_price: '0', number_of_boxes: '', supplier_id: '' }),
                                    supplier_id: nextSupplierId,
                                  },
                                }));
                              }}
                              className="w-full px-2 py-1 border border-gray-300 rounded-md text-xs"
                            >
                              <option value="">(Aucun fournisseur)</option>
                              {suppliers.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
                        {(() => {
                          const caisse = (product as any).caisse;
                          return caisse === undefined || caisse === null ? '0.0' : formatQty(caisse);
                        })()}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-semibold text-blue-600">
                        {isEditingStockRefDetails ? (
                          <Input
                            type="number"
                            step="0.1"
                            value={productsDraftById[product.id]?.number_of_boxes ?? ''}
                            onChange={(e) => setProductsDraftById(prev => ({
                              ...prev,
                              [product.id]: {
                                ...(prev[product.id] || { purchase_price: '0', number_of_boxes: '', supplier_id: '' }),
                                number_of_boxes: e.target.value,
                              },
                            }))}
                            className="w-24 text-right"
                          />
                        ) : (
                          (product.number_of_boxes === undefined || product.number_of_boxes === null)
                            ? '-'
                            : formatQty(product.number_of_boxes)
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-semibold text-purple-700">
                        {(() => {
                          const effectiveQty = Number(product.quantity_added || 0) || 0;
                          const caisse = Number((product as any).caisse || 0) || 0;
                          return caisse > 0 ? formatQty(effectiveQty / caisse) : '0.0';
                        })()}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-600">
                        {isEditingStockRefDetails ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={productsDraftById[product.id]?.purchase_price ?? ''}
                            onChange={(e) => setProductsDraftById(prev => ({
                              ...prev,
                              [product.id]: {
                                ...(prev[product.id] || { purchase_price: '0', number_of_boxes: '', supplier_id: '' }),
                                purchase_price: e.target.value,
                              },
                            }))}
                            className="w-28 text-right"
                          />
                        ) : (
                          `${formatMoney(product.purchase_price)} MAD`
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-600">
                        {product.fourchette_min !== undefined && product.fourchette_min !== null ? String(product.fourchette_min) : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-600">
                        {product.fourchette_max !== undefined && product.fourchette_max !== null ? String(product.fourchette_max) : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(product.created_at).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-6 py-4 text-sm text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-blue-600 hover:text-blue-700"
                            onClick={() => handleViewStockRefProduct(product)}
                            title="Voir détails"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Back Button */}
        <div className="flex justify-between items-center gap-3">
          <Button onClick={() => setShowStockRefDetails(false)} className="bg-blue-600 hover:bg-blue-700 text-white">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour à la Liste
          </Button>
          
          {isEditingStockRefDetails && (
            <Button
              size="lg"
              style={{ backgroundColor: '#22c55e', color: 'white' }}
              className="hover:opacity-90 font-bold"
              disabled={savingStockRefDetails}
              onClick={async () => {
                if (!selectedStockRef) return;
                setSavingStockRefDetails(true);
                try {
                  // 1) Save stock reference details
                  const resp = await fetch(
                    `https://${projectId}.supabase.co/functions/v1/super-handler/stock-reference-details/${encodeURIComponent(selectedStockRef)}`,
                    {
                      method: 'PUT',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session?.access_token}`,
                      },
                      body: JSON.stringify({
                        supplier_id: stockRefDetailsDraft?.supplier_id || null,
                        palette_category: stockRefDetailsDraft?.palette_category || null,
                        frais_maritime: stockRefDetailsDraft?.frais_maritime ?? null,
                        frais_transit: stockRefDetailsDraft?.frais_transit ?? null,
                        onssa: stockRefDetailsDraft?.onssa ?? null,
                        frais_divers: stockRefDetailsDraft?.frais_divers ?? null,
                        frais_transport: stockRefDetailsDraft?.frais_transport ?? null,
                        date_dechargement: stockRefDetailsDraft?.date_dechargement || null,
                        entrepot: stockRefDetailsDraft?.entrepot || null,
                        matricule: stockRefDetailsDraft?.matricule || null,
                        date_chargement: stockRefDetailsDraft?.date_chargement || null,
                        magasinage: stockRefDetailsDraft?.magasinage ?? null,
                        taxe: stockRefDetailsDraft?.taxe ?? null,
                      }),
                    }
                  );

                  if (!resp.ok) {
                    const t = await resp.text().catch(() => '');
                    console.error('Failed to update stock reference details:', t);
                    toast.error("Erreur lors de l'enregistrement");
                    return;
                  }

                  const detailsData = await resp.json().catch(() => ({}));
                  setStockRefDetailsData(detailsData.details || stockRefDetailsDraft);

                  // 2) If supplier changed at stock reference level, do a single aggregated update.
                  // This moves the TOTAL of the achat from old supplier -> new supplier and updates all rows.
                  const selectedSupplierId = String(stockRefDetailsDraft?.supplier_id || '').trim() || null;
                  if (selectedSupplierId) {
                    const bulkResp = await fetch(
                      `https://${projectId}.supabase.co/functions/v1/super-handler/product-additions-history/by-stock-reference/${encodeURIComponent(selectedStockRef)}`,
                      {
                        method: 'PATCH',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${session?.access_token}`,
                        },
                        body: JSON.stringify({ supplier_id: selectedSupplierId }),
                      }
                    );

                    if (!bulkResp.ok) {
                      const t = await bulkResp.text().catch(() => '');
                      console.error('Failed to bulk update supplier by stock_reference:', t);
                      toast.error("Erreur lors de l'enregistrement (mise à jour fournisseur)");
                      return;
                    }
                  }

                  // 3) Save products drafts (per-row edits: purchase_price / quantite)
                  // Snapshot drafts at click time to avoid any state mutation during the async loop.
                  const draftsSnapshot = { ...productsDraftById };
                  const updates = Object.entries(draftsSnapshot);
                  for (const [productId, draft] of updates) {
                    const pp = Number(String(draft.purchase_price || '').replace(',', '.'));
                    if (!Number.isFinite(pp) || pp < 0) {
                      toast.error("Prix d'achat invalide");
                      return;
                    }

                    const boxes = draft.number_of_boxes === ''
                      ? null
                      : Number(String(draft.number_of_boxes || '').replace(',', '.'));

                    if (boxes !== null && (!Number.isFinite(boxes) || boxes < 0)) {
                      toast.error('Nombre de boîtes invalide');
                      return;
                    }

                    const resolvedProductRow: any = productsInRef.find((p: any) => String(p.id) === String(productId));
                    const resolvedProductsId = String(resolvedProductRow?.product_id || '').trim();
                    if (!resolvedProductsId) {
                      console.error('[stock-reference-history] Missing resolvedProductsId for history row:', { productId, resolvedProductRow });
                      toast.error("Erreur: produit introuvable (product_id manquant)");
                      return;
                    }

                    // IMPORTANT:
                    // This screen edits an EXISTING product (products.id = resolvedProductsId).
                    // If we send stock_reference in the payload, the backend may treat it as a request
                    // to create/attach a new product under that stock reference (depending on server logic).
                    // So we explicitly avoid sending stock_reference here.
                    // Update the immutable purchase/history row (product_additions_history),
                    // NOT the live products table.
                    // This matches the Supplier Details "Achat" tab which reads from product_additions_history.
                    const r = await fetch(
                      `https://${projectId}.supabase.co/functions/v1/super-handler/product-additions-history/${encodeURIComponent(String(productId))}`,
                      {
                        method: 'PATCH',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${session?.access_token}`,
                        },
                        body: (() => {
                          const payload = {
                            purchase_price: pp,
                            quantite: boxes,
                            supplier_id: String(stockRefDetailsDraft?.supplier_id || '').trim() || null,
                          };
                          console.log('[stock-reference-history] PATCH payload (bottom save)', {
                            history_row_id: productId,
                            payload,
                          });
                          const bodyString = JSON.stringify(payload);
                          debugLogPatchRequest(String(productId), bodyString);
                          return bodyString;
                        })(),
                      }
                    );

                    if (!r.ok) {
                      const t = await r.text().catch(() => '');
                      console.error('Failed to update product:', t);
                      if (t.includes('Product not found')) {
                        toast.error("Produit introuvable (il a peut-être été supprimé ou vous n'avez pas accès à ce magasin)");
                      } else {
                        toast.error("Erreur lors de l'enregistrement");
                      }
                      return;
                    }

                    if (!r.ok) {
                      const t = await r.text().catch(() => '');
                      console.error('Failed to update product:', t);
                      toast.error("Erreur lors de l'enregistrement");
                      return;
                    }
                  }

                  // Refresh history + stock ref details
                  await fetchProductAdditions();
                  await fetchStockRefDetails(selectedStockRef);

                  // IMPORTANT:
                  // This screen displays rows from product_additions_history (immutable snapshots).
                  // Editing a product updates the `products` table, but does NOT rewrite old history rows.
                  // So after saving, we must also update the local UI rows to reflect the new values.
                  // We do this by patching the in-memory additions list for the edited products.
                  setAdditions((prev) => {
                    const next = prev.slice();
                    for (const [historyRowId, draft] of Object.entries(productsDraftById)) {
                      const resolvedProductRow: any = productsInRef.find((p: any) => String(p.id) === String(historyRowId));
                      const pid = String(resolvedProductRow?.product_id || '').trim();
                      if (!pid) continue;

                      const pp = Number(String((draft as any).purchase_price || '').replace(',', '.'));
                      const boxes = (draft as any).number_of_boxes === ''
                        ? null
                        : Number(String((draft as any).number_of_boxes || '').replace(',', '.'));

                      for (let i = 0; i < next.length; i++) {
                        const row: any = next[i];
                        if (String(row?.product_id || '') !== pid) continue;
                        next[i] = {
                          ...row,
                          purchase_price: Number.isFinite(pp) ? pp : row.purchase_price,
                          number_of_boxes: (boxes === null || Number.isFinite(boxes)) ? boxes : row.number_of_boxes,
                          supplier_id: (draft as any).supplier_id || null,
                        };
                      }
                    }
                    return next;
                  });

                  setIsEditingStockRefDetails(false);
                  toast.success('Modifications enregistrées');
                } catch (e) {
                  console.error('Error saving stock reference + products:', e);
                  toast.error("Erreur lors de l'enregistrement");
                } finally {
                  setSavingStockRefDetails(false);
                }
              }}
            >
              <Save className="w-5 h-5 mr-2" />
              {savingStockRefDetails ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          )}
        </div>

        {/* Product Details Modal Overlay */}
        {showStockRefProductDetails && selectedStockRefProduct && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
            <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <CardHeader className="sticky top-0 bg-white border-b">
                <div className="flex items-center justify-between">
                  <CardTitle>Détails de l'Ajout de Produit</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowStockRefProductDetails(false);
                      setSelectedStockRefProduct(null);
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                {/* Product Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Informations du Produit</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-semibold text-gray-700">Référence</Label>
                      <p className="text-lg font-mono font-medium text-gray-900 mt-1">
                        {selectedStockRefProduct.reference}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-700">Nom du Produit</Label>
                      <p className="text-lg font-medium text-gray-900 mt-1">
                        {selectedStockRefProduct.name}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-700">Catégorie</Label>
                      <p className="text-lg font-medium text-gray-900 mt-1">
                        {selectedStockRefProduct.category || '-'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-700">Lot</Label>
                      <p className="text-lg font-medium text-gray-900 mt-1">
                        {selectedStockRefProduct.lot || '-'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Quantity and Pricing */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Quantité et Tarification</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <Label className="text-sm font-semibold text-gray-700">Quantité Ajoutée</Label>
                      <p className="text-2xl font-bold text-blue-600 mt-2">
                        {selectedStockRefProduct.quantity_added}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-700">Prix d'Achat (MAD)</Label>
                      <p className="text-2xl font-bold text-gray-900 mt-2">
                        {selectedStockRefProduct.purchase_price.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-700">Prix de Vente (MAD)</Label>
                      <p className="text-2xl font-bold text-green-600 mt-2">
                        {selectedStockRefProduct.sale_price.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-700">Valeur Totale (MAD)</Label>
                      <p className="text-2xl font-bold text-orange-600 mt-2">
                        {selectedStockRefProduct.total_value.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Supplier Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Fournisseur</h3>
                  <p className="text-lg font-medium text-gray-900">
                    {selectedStockRefProduct.supplier_name || '-'}
                  </p>
                </div>

                {/* Added By */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Ajouté par (Email)</h3>
                  <p className="text-lg font-medium text-gray-900">
                    {selectedStockRefProduct.created_by_email || '-'}
                  </p>
                </div>

                {/* Close Button */}
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button
                    onClick={() => {
                      setShowStockRefProductDetails(false);
                      setSelectedStockRefProduct(null);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Fermer
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">📦 Historique Ajouts - Groupes par Référence de Stock</h1>
          <p className="text-gray-600 mt-1">Consultez tous les produits groupés par référence de stock avec filtres avancés</p>
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

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filtres Avancés
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
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
            <Button
              onClick={handleExportCSV}
              disabled={!canExportStockRefHistory}
              title={!canExportStockRefHistory ? "Vous n'avez pas la permission « Exporter Historique Références Stock (CSV) »" : undefined}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Download className="w-4 h-4 mr-2" />
              Exporter en CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stock Reference Groups Table */}
      <Card>
        <CardHeader>
          <CardTitle>📦 Groupes par Référence de Stock</CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            // Group products by stock_reference
            const stockRefGroups = filteredAdditions
              .filter(a => a.stock_reference) // Only show products with stock reference
              .reduce((acc: { [key: string]: StockReferenceGroup }, product) => {
                const ref = product.stock_reference || 'N/A';
                if (!acc[ref]) {
                  acc[ref] = {
                    stock_reference: ref,
                    products: [],
                    supplier_name: '-',
                    total_quantity: 0,
                    total_value: 0,
                    product_count: 0,
                  };
                }
                acc[ref].products.push(product);
                acc[ref].total_quantity += product.quantity_added;
                acc[ref].total_value += product.total_value;
                acc[ref].product_count += 1;
                return acc;
              }, {});

            const groups = Object.values(stockRefGroups).map((g) => ({
              ...g,
              supplier_name: pickGroupSupplierName(g.products, stockRefSupplierNameByRef[g.stock_reference]),
            }));

            const sortedGroups = (() => {
              const list = groups.slice();
              if (!groupsSortConfig) return list;

              const { key, direction } = groupsSortConfig;
              const factor = direction === 'asc' ? 1 : -1;

              const getValue = (g: StockReferenceGroup) => {
                switch (key) {
                  case 'stock_reference':
                    return sortString(g.stock_reference);
                  case 'supplier':
                    return sortString(g.supplier_name);
                  case 'product_count':
                    return sortNumber(g.product_count);
                  case 'total_quantity':
                    return sortNumber(g.total_quantity);
                  case 'total_value':
                    return sortNumber(g.total_value);
                  default:
                    return '';
                }
              };

              list.sort((a, b) => {
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

            if (groups.length === 0) {
              return (
                <div className="text-center py-12">
                  <Package className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600">Aucune référence de stock trouvée</p>
                  <p className="text-sm text-gray-500 mt-1">Les produits doivent avoir une référence de stock assignée</p>
                </div>
              );
            }

            return (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                        <button type="button" onClick={() => toggleSort('groups', 'stock_reference')} className="inline-flex items-center gap-2 hover:underline">
                          Référence de Stock <span className="text-xs opacity-70">{getSortIndicator('groups', 'stock_reference')}</span>
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                        <button type="button" onClick={() => toggleSort('groups', 'supplier')} className="inline-flex items-center gap-2 hover:underline">
                          Fournisseur <span className="text-xs opacity-70">{getSortIndicator('groups', 'supplier')}</span>
                        </button>
                      </th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">
                        <button type="button" onClick={() => toggleSort('groups', 'product_count')} className="inline-flex items-center gap-2 hover:underline justify-center w-full">
                          Nombre de Produits <span className="text-xs opacity-70">{getSortIndicator('groups', 'product_count')}</span>
                        </button>
                      </th>
                      <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                        <button type="button" onClick={() => toggleSort('groups', 'total_quantity')} className="inline-flex items-center gap-2 hover:underline justify-end w-full">
                          Quantité Totale <span className="text-xs opacity-70">{getSortIndicator('groups', 'total_quantity')}</span>
                        </button>
                      </th>
                      <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                        <button type="button" onClick={() => toggleSort('groups', 'total_value')} className="inline-flex items-center gap-2 hover:underline justify-end w-full">
                          Valeur Totale <span className="text-xs opacity-70">{getSortIndicator('groups', 'total_value')}</span>
                        </button>
                      </th>
                      <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sortedGroups.map((group) => (
                      <tr key={group.stock_reference} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-mono font-bold text-blue-600">
                          {group.stock_reference}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {group.supplier_name || '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-center font-semibold text-gray-900">
                          {group.product_count}
                        </td>
                        <td className="px-6 py-4 text-sm text-right font-semibold text-blue-600">
                          {formatQty(group.total_quantity)}
                        </td>
                        <td className="px-6 py-4 text-sm text-right font-semibold text-green-600">
                          {group.total_value.toFixed(2)} MAD
                        </td>
                        <td className="px-6 py-4 text-sm text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-blue-600 hover:text-blue-700"
                            onClick={() => {
                              if (!canViewStockRefDetails) {
                                toast.error("Vous n'avez pas la permission « Voir Détails Référence Stock »");
                                return;
                              }
                              setSelectedStockRef(group.stock_reference);
                              setShowStockRefDetails(true);
                              setProductsSortConfig(null);
                              fetchStockRefDetails(group.stock_reference);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}