import React, { useEffect, useMemo, useState } from 'react';
import { projectId } from '../../utils/supabase/info';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Download, Filter, History, Search, Calendar, Package, FileText } from 'lucide-react';
import { exportToExcelHtml, exportToPdfTable, type TableColumn } from '../../utils/export/exportUtils';

// Row per sold item (sale_items) enriched with sale header fields.
interface SoldProductRow {
  id: string;
  sale_id: string;
  sale_number: string;
  sale_date?: string;
  store_id?: string;
  store_name?: string;

  client_name?: string;

  product_id?: string;
  product_name?: string;
  reference?: string;
  stock_reference?: string;

  // Quantity/caisse columns
  quantity: number; // Quantité
  caisse: number; // Caisse
  moyenne: number; // Moyenne = Quantité / Caisse

  unit_price: number;
  total_price: number;

  created_at?: string;
  created_by_email?: string;

  // inferred doc type
  doc_type: 'BL' | 'TRANSFER' | 'ACHAT' | 'SALE' | 'UNKNOWN';
}

interface Stats {
  totalRows: number;
  totalQuantity: number;
  totalCaisse: number;
  totalValue: number;
  uniqueProducts: number;
}

export default function SalesProductHistoryModule({ session }: { session: any }) {
  const [rows, setRows] = useState<SoldProductRow[]>([]);
  const [loading, setLoading] = useState(false);

  // permissions
  const [currentUserRole, setCurrentUserRole] = useState<string>('user');
  const [effectiveUserPermissions, setEffectiveUserPermissions] = useState<string[]>([]);

  // filters
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [filterDocType, setFilterDocType] = useState<'all' | SoldProductRow['doc_type']>('all');
  const [filterStore, setFilterStore] = useState<string>('all');
  const [stores, setStores] = useState<any[]>([]);

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
  const sortDate = (v: any) => {
    const t = v ? new Date(String(v)).getTime() : NaN;
    return Number.isFinite(t) ? t : 0;
  };

  const hasPermission = (permission: string) => {
    if (currentUserRole === 'admin') return true;
    return effectiveUserPermissions.includes(permission);
  };

  // Reuse existing permission (keeps it simple)
  const canViewHistory = hasPermission('Voir les Ventes') || hasPermission("Voir l'Historique des Ventes") || hasPermission('Voir les Produits');
  const canExport = hasPermission('Exporter Historique Ajouts (CSV)') || hasPermission("Voir l'Historique des Ventes") || currentUserRole === 'admin';

  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const response = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/users`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (!response.ok) return;
        const data = await response.json().catch(() => ({}));
        const currentUser = data.users?.find((u: any) => u.email === session.user?.email);
        setCurrentUserRole(currentUser?.role || 'user');
        setEffectiveUserPermissions(Array.isArray(currentUser?.permissions) ? currentUser.permissions : []);
      } catch (e) {
        console.warn('Error loading user permissions for sales product history:', e);
      }
    };

    if (session?.access_token) fetchCurrentUser();
  }, [session?.access_token]);

  const inferDocType = (saleNumber: string): SoldProductRow['doc_type'] => {
    const sn = String(saleNumber || '').toUpperCase();
    if (sn.includes('TRANSFER')) return 'TRANSFER';
    if (sn.startsWith('BL') || sn.includes('BON') || sn.includes('BL-')) return 'BL';
    if (sn.includes('ACHAT') || sn.includes('PURCHASE')) return 'ACHAT';
    if (sn) return 'SALE';
    return 'UNKNOWN';
  };

  const fetchSoldProducts = async () => {
    setLoading(true);
    try {
      // 1) Fetch sales (with sale_items)
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/sales`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (!res.ok) {
        toast.error("Erreur lors du chargement de l'historique ventes");
        setRows([]);
        return;
      }

      const data = await res.json().catch(() => ({}));
      const sales = Array.isArray(data?.sales) ? data.sales : [];

      // 2) Fetch products for stock_reference lookup (sale_items often doesn't contain it)
      const productsRes = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/products`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const productsData = productsRes.ok ? await productsRes.json().catch(() => ({})) : {};
      const products = Array.isArray(productsData?.products) ? productsData.products : [];

      // 3) Fetch stores (magasins) for filter dropdown
      try {
        const storesRes = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/stores`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (storesRes.ok) {
          const storesData = await storesRes.json().catch(() => ({}));
          const list = (storesData.stores || []).sort((a: any, b: any) => String(a?.name || '').localeCompare(String(b?.name || '')));
          setStores(list);
        }
      } catch (e) {
        console.warn('Could not fetch stores for sales product history filter:', e);
      }

      const productById = new Map<string, any>();
      const productByRef = new Map<string, any>();
      for (const p of products) {
        if (p?.id) productById.set(String(p.id), p);
        if (p?.reference) productByRef.set(String(p.reference), p);
      }

      const flat: SoldProductRow[] = [];

      for (const s of sales) {
        const saleId = String(s?.id || '');
        const saleNumber = String(s?.sale_number || '');
        const docType = inferDocType(saleNumber);

        const items = Array.isArray(s?.sale_items) ? s.sale_items : Array.isArray(s?.items) ? s.items : [];
        for (const it of items) {
          // Quantity and caisse can be stored differently depending on the flow:
          // - Normal sales: quantity = quantity, caisse = caisse
          // - Some purchase/transfer flows: quantity may be stored in `caisse` and quantity defaults to 1
          // We pick the best available numeric values.
          const rawQty = it?.quantity ?? it?.quantity_sold ?? it?.qty;
          const rawCaisse = it?.caisse ?? it?.boxes ?? it?.box_count ?? it?.number_of_boxes;

          const qty = Number(rawQty ?? 0) || 0;
          const caisse = Number(rawCaisse ?? 0) || 0;

          // Heuristic: if quantity looks like a placeholder (1) but caisse has a meaningful value,
          // treat that meaningful value as quantity as well (this matches legacy data patterns).
          const safeQty = qty === 1 && caisse > 1 ? caisse : qty;
          const safeCaisse = caisse;
          const moyenne = safeCaisse > 0 ? (safeQty / safeCaisse) : 0;
          const unitPrice = Number(it?.unit_price || it?.price || it?.unitPrice || 0) || 0;
          const totalPrice = Number(it?.total_price || it?.total || 0) || (qty * unitPrice);

          const productId = String(it?.product_id || it?.productId || '').trim();
          const ref = String(it?.reference || it?.product_reference || '').trim();

          const prod = (productId && productById.get(productId)) || (ref && productByRef.get(ref)) || null;
          const stockRef = String(it?.stock_reference || s?.stock_reference || prod?.stock_reference || '').trim();

          flat.push({
            id: String(it?.id || `${saleId}:${productId || ref || it?.name || Math.random()}`),
            sale_id: saleId,
            sale_number: saleNumber,
            sale_date: s?.sale_date || s?.created_at || undefined,
            store_id: s?.store_id || undefined,
            store_name: s?.store_name || undefined,

            client_name: s?.client_name || s?.created_for_store_name || undefined,

            product_id: productId || undefined,
            product_name: it?.name || it?.product_name || it?.productName || prod?.name || undefined,
            reference: ref || prod?.reference || undefined,
            stock_reference: stockRef || undefined,

            quantity: safeQty,
            caisse: safeCaisse,
            moyenne,
            unit_price: unitPrice,
            total_price: totalPrice,

            created_at: it?.created_at || s?.created_at || undefined,
            created_by_email: s?.created_by_email || undefined,

            doc_type: docType,
          });
        }
      }

      setRows(flat);
    } catch (e: any) {
      console.error('Error fetching sold products history:', e);
      toast.error("Erreur lors du chargement de l'historique ventes");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.access_token && canViewHistory) {
      fetchSoldProducts();
    } else if (session?.access_token && !canViewHistory) {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token, canViewHistory]);

  const filtered = useMemo(() => {
    let list = rows.slice();

    const normalize = (v: any) =>
      String(v ?? '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    const q = normalize(searchTerm);
    if (q) {
      const tokens = q.split(' ').filter(Boolean);

      list = list.filter((r) => {
        const hay = normalize([
          r.product_name,
          r.reference,
          r.stock_reference,
          r.sale_number,
          r.doc_type,
          r.store_name,
          r.store_id,
          r.client_name,
          r.created_by_email,
          r.product_id,
          r.caisse,
          r.quantity,
          r.moyenne,
          r.unit_price,
          r.total_price,
        ]
          .map((x) => String(x ?? ''))
          .join(' '));

        return tokens.every((t) => hay.includes(t));
      });
    }

    if (startDate) {
      const start = new Date(startDate + 'T00:00:00');
      list = list.filter((r) => {
        const raw = r.sale_date || r.created_at;
        if (!raw) return false;
        const t = new Date(String(raw)).getTime();
        if (!Number.isFinite(t)) return false;
        return t >= start.getTime();
      });
    }

    if (endDate) {
      const end = new Date(endDate + 'T23:59:59.999');
      list = list.filter((r) => {
        const raw = r.sale_date || r.created_at;
        if (!raw) return false;
        const t = new Date(String(raw)).getTime();
        if (!Number.isFinite(t)) return false;
        return t <= end.getTime();
      });
    }

    if (filterDocType !== 'all') {
      list = list.filter((r) => r.doc_type === filterDocType);
    }

    if (filterStore !== 'all') {
      list = list.filter((r) => String(r.store_id || '') === String(filterStore));
    }

    // Only rows that are in a sale (qty > 0)
    list = list.filter((r) => (Number(r.quantity) || 0) > 0);

    // newest first (default when no manual sorting is selected)
    list.sort((a, b) => new Date(b.sale_date || b.created_at || 0).getTime() - new Date(a.sale_date || a.created_at || 0).getTime());
    return list;
  }, [rows, searchTerm, startDate, endDate, filterDocType, filterStore]);

  const sortedRows = useMemo(() => {
    const list = filtered.slice();
    if (!sortConfig) return list;

    const { key, direction } = sortConfig;
    const factor = direction === 'asc' ? 1 : -1;

    const getValue = (r: SoldProductRow) => {
      switch (key) {
        case 'date':
          return sortDate(r.sale_date || r.created_at);
        case 'type':
          return sortString(r.doc_type);
        case 'number':
          return sortString(r.sale_number);
        case 'product':
          return sortString(r.product_name);
        case 'ref':
          return sortString(r.reference);
        case 'stock_ref':
          return sortString(r.stock_reference);
        case 'quantity':
          return sortNumber(r.quantity);
        case 'caisse':
          return sortNumber(r.caisse);
        case 'moyenne':
          return sortNumber(r.moyenne);
        case 'unit_price':
          return sortNumber(r.unit_price);
        case 'total':
          return sortNumber(r.total_price);
        case 'store':
          return sortString(r.store_name || r.store_id);
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
  }, [filtered, sortConfig]);

  // Stats should follow FILTERS, not sorting order. Use the filtered dataset.
  const stats: Stats = useMemo(() => {
    const totalRows = filtered.length;
    const totalQuantity = filtered.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
    const totalCaisse = filtered.reduce((sum, r) => sum + (Number(r.caisse) || 0), 0);
    const totalValue = filtered.reduce((sum, r) => sum + (Number(r.total_price) || 0), 0);
    // Prefer reference as the stable identifier (works even when product_id is missing).
    // Fallback to product_id then product_name.
    const uniqueProducts = new Set(
      filtered
        .map((r) => String(r.reference || r.product_id || r.product_name || '').trim().toLowerCase())
        .filter(Boolean)
    ).size;
    return { totalRows, totalQuantity, totalCaisse, totalValue, uniqueProducts };
  }, [filtered]);

  const getExportColumns = (): TableColumn<SoldProductRow>[] => [
    { header: 'Date', accessor: (r) => (r.sale_date ? new Date(r.sale_date).toLocaleDateString('fr-FR') : '-'), cellWidth: 14 },
    { header: 'Type', accessor: (r) => r.doc_type, cellWidth: 12 },
    { header: 'N°', accessor: (r) => r.sale_number || '-', cellWidth: 18 },
    { header: 'Produit', accessor: (r) => r.product_name || '-', cellWidth: 34 },
    { header: 'Réf', accessor: (r) => r.reference || '-', cellWidth: 18 },
    { header: 'Stock Ref', accessor: (r) => r.stock_reference || '-', cellWidth: 18 },
    { header: 'Caisse', accessor: (r) => Number(r.caisse || 0).toFixed(2), align: 'right', cellWidth: 12 },
    { header: 'Quantité', accessor: (r) => Number(r.quantity || 0).toFixed(2), align: 'right', cellWidth: 14 },
    { header: 'Moyenne', accessor: (r) => Number(r.moyenne || 0).toFixed(2), align: 'right', cellWidth: 12 },
    { header: 'Prix Unitaire (MAD)', accessor: (r) => Number(r.unit_price || 0).toFixed(2), align: 'right', cellWidth: 18 },
    { header: 'Total (MAD)', accessor: (r) => Number(r.total_price || 0).toFixed(2), align: 'right', cellWidth: 16 },
    { header: 'Client', accessor: (r) => String(r.client_name || '-').replace(/\s*-\s*/g, ' -\n'), cellWidth: 14 },
    { header: 'Magasin', accessor: (r) => String(r.store_name || r.store_id || '-').replace(/\s*-\s*/g, ' -\n'), cellWidth: 14 },
  ];

  const ensureCanExport = () => {
    if (!canExport) {
      toast.error("Vous n'avez pas la permission d'export");
      return false;
    }
    if (sortedRows.length === 0) {
      toast.error('Aucune donnée à exporter');
      return false;
    }
    return true;
  };

  const handleExportExcel = () => {
    if (!ensureCanExport()) return;
    const datePart = new Date().toISOString().split('T')[0];
    exportToExcelHtml(sortedRows, getExportColumns(), `historique-produits-ventes-${datePart}.xls`);
    toast.success('Fichier Excel exporté avec succès');
  };

  const handleExportPdf = () => {
    if (!ensureCanExport()) return;
    const datePart = new Date().toISOString().split('T')[0];

    exportToPdfTable({
      title: 'RAPPORT - Historique Produits Ventes',
      subtitle: `Période: ${startDate ? new Date(startDate).toLocaleDateString('fr-FR') : '—'} → ${endDate ? new Date(endDate).toLocaleDateString('fr-FR') : '—'}`,
      filename: `Rapport_Historique_Ventes_${datePart}.pdf`,
      headerStats: [
        { label: 'LIGNES', value: String(stats.totalRows) },
        { label: 'QUANTITÉ TOTAL', value: String(stats.totalQuantity.toFixed(2)) },
        { label: 'TOTAL CAISSE', value: String(stats.totalCaisse.toFixed(2)) },
        { label: 'VALEUR', value: `${stats.totalValue.toFixed(2)} MAD` },
        { label: 'PRODUITS UNIQUES', value: String(stats.uniqueProducts) },
      ],
      rows: sortedRows,
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
          <p className="text-sm text-red-600 mt-1">Vous n'avez pas la permission de voir l'historique des ventes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">📋 Historique Produits Ventes</h1>
          <p className="text-gray-600 mt-1">Consultez les produits présents dans les ventes (BL / transferts / achats)</p>
        </div>
        <Button onClick={fetchSoldProducts} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
          {loading ? 'Chargement...' : 'Actualiser'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-gray-600 text-sm">Lignes</p>
              <p className="text-3xl font-bold text-gray-900">{stats.totalRows}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-gray-600 text-sm">Quantité total</p>
              <p className="text-3xl font-bold text-blue-600">{stats.totalQuantity.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-gray-600 text-sm">Total caisse</p>
              <p className="text-3xl font-bold text-indigo-600">{stats.totalCaisse.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-gray-600 text-sm">Valeur Totale</p>
              <p className="text-3xl font-bold text-green-600">{stats.totalValue.toFixed(2)} MAD</p>
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
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filtres
            </CardTitle>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Button
                onClick={handleExportExcel}
                disabled={!canExport}
                variant="outline"
                size="sm"
                className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
              >
                <Download className="w-4 h-4 mr-2" />
                Excel
              </Button>

              <Button
                onClick={handleExportPdf}
                disabled={!canExport}
                variant="outline"
                size="sm"
                className="border-red-600 text-red-700 hover:bg-red-50"
              >
                <FileText className="w-4 h-4 mr-2" />
                PDF
              </Button>

              <Button type="button" variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)} className="bg-white">
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
                  placeholder="Rechercher (produit, réf, BL, stock ref...)"
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Start Date */}
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input type="date" className="pl-10" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>

              {/* End Date */}
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input type="date" className="pl-10" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>

              {/* Type */}
              <select
                value={filterDocType}
                onChange={(e) => setFilterDocType(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tous les types</option>
                <option value="BL">BL</option>
                <option value="TRANSFER">TRANSFER</option>
                <option value="ACHAT">ACHAT</option>
                <option value="SALE">SALE</option>
              </select>

              {/* Magasin */}
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
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm('');
                  setStartDate('');
                  setEndDate('');
                  setFilterDocType('all');
                  setFilterStore('all');
                }}
              >
                Réinitialiser les filtres
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Produits vendus ({sortedRows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {sortedRows.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">Aucun produit trouvé</p>
              <p className="text-sm text-gray-500 mt-1">Essayez de modifier vos filtres</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="mb-2 text-xs text-gray-500">
                Debug: rows={rows.length} filtered={filtered.length} sortedRows={sortedRows.length} search="{searchTerm}"
              </div>
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('date')} className="inline-flex items-center gap-2 hover:underline">
                        Date <span className="text-xs opacity-70">{getSortIndicator('date')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('type')} className="inline-flex items-center gap-2 hover:underline">
                        Type <span className="text-xs opacity-70">{getSortIndicator('type')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('number')} className="inline-flex items-center gap-2 hover:underline">
                        N° <span className="text-xs opacity-70">{getSortIndicator('number')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('product')} className="inline-flex items-center gap-2 hover:underline">
                        Produit <span className="text-xs opacity-70">{getSortIndicator('product')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('ref')} className="inline-flex items-center gap-2 hover:underline">
                        Réf <span className="text-xs opacity-70">{getSortIndicator('ref')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('stock_ref')} className="inline-flex items-center gap-2 hover:underline">
                        Stock Ref <span className="text-xs opacity-70">{getSortIndicator('stock_ref')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('caisse')} className="inline-flex items-center gap-2 hover:underline justify-end w-full">
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
                      <button type="button" onClick={() => toggleSort('unit_price')} className="inline-flex items-center gap-2 hover:underline justify-end w-full">
                        Prix Unitaire <span className="text-xs opacity-70">{getSortIndicator('unit_price')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('total')} className="inline-flex items-center gap-2 hover:underline justify-end w-full">
                        Total <span className="text-xs opacity-70">{getSortIndicator('total')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Client</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      <button type="button" onClick={() => toggleSort('store')} className="inline-flex items-center gap-2 hover:underline">
                        Magasin <span className="text-xs opacity-70">{getSortIndicator('store')}</span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody
                  key={`${searchTerm}__${startDate}__${endDate}__${filterDocType}__${filterStore}__${sortConfig?.key || 'none'}__${sortConfig?.direction || 'none'}__${sortedRows.length}`}
                  className="divide-y"
                >
                  {sortedRows.map((r) => {
                    const d = r.sale_date ? new Date(r.sale_date) : (r.created_at ? new Date(r.created_at) : null);
                    const dateStr = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('fr-FR') : '-';
                    return (
                      <tr key={`${r.sale_id}-${r.product_id || r.reference || r.id}`} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-600">{dateStr}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-gray-900">{r.doc_type}</td>
                        <td className="px-6 py-4 text-sm font-mono text-gray-900">{r.sale_number || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-900 font-medium">{r.product_name || '-'}</td>
                        <td className="px-6 py-4 text-sm font-mono text-gray-700">{r.reference || '-'}</td>
                        <td className="px-6 py-4 text-sm font-mono text-blue-700">{r.stock_reference || '-'}</td>
                        <td className="px-6 py-4 text-sm text-right text-gray-700">{Number(r.caisse || 0).toFixed(2)}</td>
                        <td className="px-6 py-4 text-sm text-right font-semibold text-blue-600">{Number(r.quantity || 0).toFixed(2)}</td>
                        <td className="px-6 py-4 text-sm text-right text-gray-700">{Number(r.moyenne || 0).toFixed(2)}</td>
                        <td className="px-6 py-4 text-sm text-right text-gray-700">{Number(r.unit_price || 0).toFixed(2)} MAD</td>
                        <td className="px-6 py-4 text-sm text-right font-semibold text-green-600">{Number(r.total_price || 0).toFixed(2)} MAD</td>
                        <td className="px-6 py-4 text-sm text-gray-700">{r.client_name || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-700">{r.store_name || r.store_id || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
