import { useEffect, useMemo, useState } from 'react';
import { projectId } from '../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { ArrowLeft, Eye, RefreshCw, Repeat, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner@2.0.3';

interface ClientMagasinDetailsPageProps {
  store: any;
  session: any;
  onBack: () => void;
}

type TradingRow = any;

type GroupedPayment = {
  reference: string;
  payments: any[];
  totalAmount: number;
  firstDate: number;
  lastDate: number;
  confirmedCount: number;
  pendingCount: number;
};

export function ClientMagasinDetailsPage({ store, session, onBack }: ClientMagasinDetailsPageProps) {
  const [loading, setLoading] = useState(true);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [tradingLoading, setTradingLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'payments' | 'transfers' | 'purchases'>('payments');

  const [payments, setPayments] = useState<any[]>([]);
  const [trading, setTrading] = useState<TradingRow[]>([]);
  const [confirmedPaymentIds, setConfirmedPaymentIds] = useState<Set<string>>(new Set());

  // Large data handling: progressive rendering (client-side pagination)
  const PAGE_SIZE = 100;
  const [paymentsVisibleCount, setPaymentsVisibleCount] = useState(PAGE_SIZE);
  const [transfersVisibleCount, setTransfersVisibleCount] = useState(PAGE_SIZE);
  const [purchasesVisibleCount, setPurchasesVisibleCount] = useState(PAGE_SIZE);

  // Confirmation lookup can be heavy; compute on-demand (not on initial load)
  const [confirmedLoading, setConfirmedLoading] = useState(false);

  // Payment reference -> cheques details dialog
  const [checksDialogOpen, setChecksDialogOpen] = useState(false);
  const [checksDialogRef, setChecksDialogRef] = useState<string>('');
  const [checksDialogChecks, setChecksDialogChecks] = useState<any[]>([]);
  const [checksDialogLoading, setChecksDialogLoading] = useState(false);

  // Transfert/Achat -> products details dialog
  const [opDetailsOpen, setOpDetailsOpen] = useState(false);
  const [opDetailsTitle, setOpDetailsTitle] = useState<string>('');
  const [opDetailsItems, setOpDetailsItems] = useState<any[]>([]);
  const [opDetailsLoading, setOpDetailsLoading] = useState(false);

  // Large data handling inside operation details dialog
  const [opDetailsQuery, setOpDetailsQuery] = useState('');
  const [opDetailsVisibleCount, setOpDetailsVisibleCount] = useState(PAGE_SIZE);

  const storeId = String(store?.id || '').trim();

  const fetchConfirmedPaymentIds = async () => {
    // Confirmation heuristic in this app:
    // a store_global_payment is confirmed when a check_inventory row exists
    // whose notes contain: store_global_payment_id=<payment_id>
    try {
      const invRes = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!invRes.ok) return new Set<string>();

      const invData = await invRes.json().catch(() => ({}));
      const invRows = Array.isArray(invData?.checks)
        ? invData.checks
        : (Array.isArray(invData?.check_inventory) ? invData.check_inventory : []);

      const ids = new Set<string>();
      for (const r of invRows) {
        const notes = String(r?.notes || '');
        const m = notes.match(/store_global_payment_id=([0-9a-fA-F-]{36})/);
        if (m && m[1]) ids.add(String(m[1]));
      }

      return ids;
    } catch {
      return new Set<string>();
    }
  };

  const ensureConfirmedLoaded = async () => {
    if (confirmedPaymentIds.size > 0 || confirmedLoading) return;
    setConfirmedLoading(true);
    try {
      const confirmed = await fetchConfirmedPaymentIds();
      setConfirmedPaymentIds(confirmed);
    } finally {
      setConfirmedLoading(false);
    }
  };

  const fetchPayments = async () => {
    if (!storeId) {
      setPayments([]);
      return;
    }

    setPaymentsLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/store-global-payments?store_id=${encodeURIComponent(storeId)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.error('Failed to fetch store-global-payments', res.status, txt);
        setPayments([]);
        return;
      }

      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data?.store_global_payments) ? data.store_global_payments : [];

      // Do NOT fetch check_inventory here (it can be huge). We'll compute confirmation on-demand.
      setPayments(list);
      setConfirmedPaymentIds(new Set());
    } catch (e) {
      console.error('fetchPayments error', e);
      setPayments([]);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const parseCheckInventoryIdsFromNotes = (notes: any): string[] => {
    const txt = String(notes || '');
    const m = txt.match(/check_inventory_ids=([^|\n\r]+)/i);
    if (m && m[1]) {
      return String(m[1])
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  };

  const loadChecksForReference = async (reference: string) => {
    setChecksDialogRef(reference);
    setChecksDialogOpen(true);
    setChecksDialogLoading(true);
    setChecksDialogChecks([]);

    try {
      // Find payments that match this reference
      const matchedPayments = (payments || []).filter((p: any) => {
        const ref = String(p?.reference_number || '').trim() || 'Sans Référence';
        return ref === reference;
      });

      // Extract check_inventory ids from all matched payments
      const ids: string[] = [];
      for (const p of matchedPayments) {
        ids.push(...parseCheckInventoryIdsFromNotes(p?.notes));
        if (p?.check_inventory_id) ids.push(String(p.check_inventory_id));
      }
      const uniqueIds = Array.from(new Set(ids.map((x) => String(x).trim()).filter(Boolean)));

      if (uniqueIds.length === 0) {
        setChecksDialogChecks([]);
        return;
      }

      // Fetch inventory and filter by ids
      const invRes = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!invRes.ok) {
        const t = await invRes.text().catch(() => '');
        console.error('Failed to fetch check-inventory', invRes.status, t);
        toast.error('Erreur lors du chargement des chèques');
        setChecksDialogChecks([]);
        return;
      }

      const invData = await invRes.json().catch(() => ({}));
      const invRows = Array.isArray(invData?.checks)
        ? invData.checks
        : (Array.isArray(invData?.check_inventory) ? invData.check_inventory : []);

      const byId = new Map(invRows.map((c: any) => [String(c?.id), c]));
      const out = uniqueIds.map((id) => byId.get(id) || ({ id, __missing: true } as any));
      setChecksDialogChecks(out);
    } catch (e) {
      console.error('loadChecksForReference error', e);
      toast.error('Erreur lors du chargement des chèques');
      setChecksDialogChecks([]);
    } finally {
      setChecksDialogLoading(false);
    }
  };

  const fetchTrading = async () => {
    if (!storeId) {
      setTrading([]);
      return;
    }

    setTradingLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/store-trading?store_id=${encodeURIComponent(storeId)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.error('Failed to fetch store-trading', res.status, txt);
        setTrading([]);
        return;
      }

      const data = await res.json().catch(() => ({}));
      const rows = Array.isArray(data?.sales) ? data.sales : [];
      setTrading(rows);
    } catch (e) {
      console.error('fetchTrading error', e);
      setTrading([]);
    } finally {
      setTradingLoading(false);
    }
  };

  const reloadAll = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchPayments(), fetchTrading()]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Reset progressive rendering when store changes
    setPaymentsVisibleCount(PAGE_SIZE);
    setTransfersVisibleCount(PAGE_SIZE);
    setPurchasesVisibleCount(PAGE_SIZE);

    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useEffect(() => {
    // Reset visible counts when switching tabs for smoother UX
    if (activeTab === 'payments') setPaymentsVisibleCount(PAGE_SIZE);
    if (activeTab === 'transfers') setTransfersVisibleCount(PAGE_SIZE);
    if (activeTab === 'purchases') setPurchasesVisibleCount(PAGE_SIZE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const paymentsByReference: GroupedPayment[] = useMemo(() => {
    const groups = new Map<string, GroupedPayment>();

    for (const p of payments || []) {
      const ref = String(p?.reference_number || '').trim() || 'Sans Référence';
      const dRaw = p?.payment_date || p?.created_at || null;
      const d = dRaw ? new Date(dRaw).getTime() : 0;
      const amount = Number(p?.amount || 0) || 0;

      // Use confirmedPaymentIds to derive status (computed on-demand)
      const confirmed = confirmedPaymentIds.has(String(p?.id));

      const g = groups.get(ref) || {
        reference: ref,
        payments: [],
        totalAmount: 0,
        firstDate: d || Number.MAX_SAFE_INTEGER,
        lastDate: d || 0,
        confirmedCount: 0,
        pendingCount: 0,
      };

      g.payments.push(p);
      g.totalAmount += amount;
      if (d) {
        g.firstDate = Math.min(g.firstDate, d);
        g.lastDate = Math.max(g.lastDate, d);
      }
      if (confirmed) g.confirmedCount += 1;
      else g.pendingCount += 1;

      groups.set(ref, g);
    }

    // Normalize when no dates
    const out = Array.from(groups.values()).map((g) => ({
      ...g,
      firstDate: g.firstDate === Number.MAX_SAFE_INTEGER ? 0 : g.firstDate,
    }));

    out.sort((a, b) => (b.lastDate || 0) - (a.lastDate || 0));
    return out;
  }, [payments, confirmedPaymentIds]);

  const transferRows = useMemo(() => {
    return (trading || []).filter((r: any) => String(r?.sale_number || '').includes('TRANSFER-'));
  }, [trading]);

  const purchaseRows = useMemo(() => {
    return (trading || []).filter((r: any) => String(r?.sale_number || '').includes('PURCHASE-'));
  }, [trading]);

  const visiblePaymentsByReference = useMemo(
    () => paymentsByReference.slice(0, paymentsVisibleCount),
    [paymentsByReference, paymentsVisibleCount]
  );

  const visibleTransferRows = useMemo(
    () => transferRows.slice(0, transfersVisibleCount),
    [transferRows, transfersVisibleCount]
  );

  const visiblePurchaseRows = useMemo(
    () => purchaseRows.slice(0, purchasesVisibleCount),
    [purchaseRows, purchasesVisibleCount]
  );

  const money = (n: any) => (Number(n || 0) || 0).toFixed(2);

  const pickOpItemsFromRow = (row: any): any[] => {
    const direct = Array.isArray(row?.items)
      ? row.items
      : (Array.isArray(row?.sale_items) ? row.sale_items : (Array.isArray(row?.sale_items?.items) ? row.sale_items.items : []));

    return Array.isArray(direct) ? direct : [];
  };

  const normalizeOpItem = (it: any) => {
    const ref = String(it?.reference || it?.product_reference || it?.ref || it?.product?.reference || it?.products?.reference || '-');
    const name = String(it?.name || it?.product_name || it?.product?.name || it?.products?.name || '-');

    const caisse = Number(it?.caisse ?? it?.quantity_available ?? it?.product?.quantity_available ?? it?.products?.quantity_available ?? 0) || 0;

    // Quantity fields are inconsistent across older rows
    const quantity = Number(it?.quantity ?? it?.qty ?? it?.box_quantity ?? it?.number_of_boxes ?? it?.count ?? 0) || 0;

    const moyenne = Number(it?.moyenne ?? it?.avg ?? it?.avg_net_weight_per_box ?? it?.product?.avg_net_weight_per_box ?? it?.products?.avg_net_weight_per_box ?? 0) || 0;

    // Unit price can also come as total / quantity or from nested product pricing
    const rawSubTotal = it?.sub_total ?? it?.subtotal ?? it?.total ?? it?.total_price ?? it?.total_amount;
    const asNumber = (v: any) => {
      if (v === null || v === undefined) return 0;
      if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
      if (typeof v === 'string') {
        const n = Number(String(v).replace(',', '.'));
        return Number.isFinite(n) ? n : 0;
      }
      return 0;
    };

    const unitPrice = (() => {
      const direct =
        asNumber(it?.unit_price) ||
        asNumber(it?.unitPrice) ||
        asNumber(it?.price_unit) ||
        asNumber(it?.prix_unitaire) ||
        asNumber(it?.unit_price_value) ||
        asNumber(it?.price_per_unit) ||
        asNumber(it?.unitCost) ||
        asNumber(it?.price) ||
        asNumber(it?.sale_price) ||
        asNumber(it?.purchase_price) ||
        asNumber(it?.product?.unit_price) ||
        asNumber(it?.product?.sale_price) ||
        asNumber(it?.product?.purchase_price) ||
        asNumber(it?.products?.unit_price) ||
        asNumber(it?.products?.sale_price) ||
        asNumber(it?.products?.purchase_price);

      if (direct > 0) return direct;

      const st = asNumber(rawSubTotal);
      if (st > 0 && quantity > 0) return st / quantity;

      return 0;
    })();

    const subTotal = (() => {
      const st = asNumber(rawSubTotal);
      if (st > 0) return st;
      if (quantity > 0 && unitPrice > 0) return quantity * unitPrice;
      return 0;
    })();

    return { ref, name, caisse, quantity, moyenne, unitPrice, subTotal };
  };

  const loadOpDetails = async (row: any) => {
    const sn = String(row?.sale_number || '-');
    const isTransfer = sn.includes('TRANSFER-');

    setOpDetailsTitle(`${isTransfer ? 'Transfert' : 'Achat'} — ${sn}`);
    setOpDetailsOpen(true);
    setOpDetailsLoading(true);
    setOpDetailsItems([]);
    setOpDetailsQuery('');
    setOpDetailsVisibleCount(PAGE_SIZE);

    try {
      const localItems = pickOpItemsFromRow(row);
      if (localItems.length > 0) {
        setOpDetailsItems(localItems);
        return;
      }

      // Backend endpoint removed by request; if no items are present in the row, show empty.
      setOpDetailsItems([]);
    } catch (e) {
      console.error('loadOpDetails error', e);
      toast.error('Erreur lors du chargement des détails');
      setOpDetailsItems([]);
    } finally {
      setOpDetailsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="outline" onClick={onBack} className="shrink-0">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 truncate">{store?.name || 'Magasin'}</h1>
              <Badge variant="secondary" className="text-xs sm:text-sm">Clients Magasins</Badge>
            </div>
            <div className="mt-1 text-sm text-gray-600">Paiements (par référence) • Transferts • Achats</div>
          </div>
        </div>

        <div className="flex justify-end sm:justify-start">
          <Button variant="outline" onClick={reloadAll} disabled={loading || paymentsLoading || tradingLoading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Rafraîchir
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap w-full bg-white p-1 h-auto gap-1 border-b border-gray-200 rounded-lg">
        <button
          type="button"
          onClick={() => setActiveTab('payments')}
          className={`flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all flex-1 min-w-max ${
            activeTab === 'payments'
              ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600'
              : 'hover:bg-gray-50 text-gray-600'
          }`}
        >
          <span className="text-xs font-medium">Paiements (Réf)</span>
          <span className="text-lg font-bold">{paymentsByReference.length}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('transfers')}
          className={`flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all flex-1 min-w-max ${
            activeTab === 'transfers'
              ? 'bg-purple-50 border-b-2 border-purple-500 text-purple-600'
              : 'hover:bg-gray-50 text-gray-600'
          }`}
        >
          <span className="text-xs font-medium">Transferts</span>
          <span className="text-lg font-bold">{transferRows.length}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('purchases')}
          className={`flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all flex-1 min-w-max ${
            activeTab === 'purchases'
              ? 'bg-green-50 border-b-2 border-green-500 text-green-600'
              : 'hover:bg-gray-50 text-gray-600'
          }`}
        >
          <span className="text-xs font-medium">Achats</span>
          <span className="text-lg font-bold">{purchaseRows.length}</span>
        </button>
      </div>

      {/* Paiements */}
      {activeTab === 'payments' && (
        <Card>
          <CardHeader>
            <CardTitle>Paiements (groupés par référence)</CardTitle>
          </CardHeader>
          <CardContent>
            {paymentsLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : paymentsByReference.length === 0 ? (
              <p className="text-sm text-gray-600">Aucun paiement trouvé pour ce magasin.</p>
            ) : (
              <div className="border rounded-lg overflow-x-auto max-h-[60vh] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-white z-[1]">
                    <TableRow>
                      <TableHead>Référence</TableHead>
                      <TableHead className="text-right">Montant Total</TableHead>
                      <TableHead className="text-right">Paiements</TableHead>
                      <TableHead>Du</TableHead>
                      <TableHead>Au</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visiblePaymentsByReference.map((g) => {
                      const status = g.pendingCount > 0 ? 'En attente' : 'Confirmé';
                      return (
                        <TableRow key={g.reference}>
                          <TableCell className="font-semibold">{g.reference}</TableCell>
                          <TableCell className="text-right font-bold">{money(g.totalAmount)} MAD</TableCell>
                          <TableCell className="text-right">{g.payments.length}</TableCell>
                          <TableCell>{g.firstDate ? new Date(g.firstDate).toLocaleDateString('fr-FR') : '-'}</TableCell>
                          <TableCell>{g.lastDate ? new Date(g.lastDate).toLocaleDateString('fr-FR') : '-'}</TableCell>
                          <TableCell>
                            <span
                              className={`px-2 py-1 rounded text-xs font-semibold ${
                                status === 'Confirmé' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {confirmedLoading && confirmedPaymentIds.size === 0 ? 'Chargement...' : status}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                await ensureConfirmedLoaded();
                                loadChecksForReference(g.reference);
                              }}
                            >
                              Voir
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                <div className="flex items-center justify-between gap-3 p-3">
                  <div className="text-xs text-gray-600">
                    Affichés: <span className="font-semibold">{Math.min(paymentsVisibleCount, paymentsByReference.length)}</span> /
                    <span className="font-semibold"> {paymentsByReference.length}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {confirmedPaymentIds.size === 0 && (
                      <Button size="sm" variant="outline" disabled={confirmedLoading} onClick={ensureConfirmedLoaded}>
                        {confirmedLoading ? 'Chargement statuts...' : 'Charger statuts'}
                      </Button>
                    )}

                    {paymentsVisibleCount < paymentsByReference.length && (
                      <Button size="sm" variant="outline" onClick={() => setPaymentsVisibleCount((c) => c + PAGE_SIZE)}>
                        Charger plus
                      </Button>
                    )}

                    {paymentsByReference.length > PAGE_SIZE && (
                      <Button size="sm" variant="ghost" onClick={() => setPaymentsVisibleCount(PAGE_SIZE)}>
                        Haut
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Transferts */}
      {activeTab === 'transfers' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Repeat className="w-5 h-5" />
              Transferts ({transferRows.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tradingLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : transferRows.length === 0 ? (
              <p className="text-sm text-gray-600">Aucun transfert trouvé.</p>
            ) : (
              <div className="border rounded-lg overflow-x-auto max-h-[60vh] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-white z-[1]">
                    <TableRow>
                      <TableHead>N°</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead>Direction</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleTransferRows.map((r: any) => {
                      const sn = String(r?.sale_number || '-');
                      const createdAt = r?.created_at ? new Date(r.created_at) : null;
                      const amt = Number(r?.total_amount || 0) || 0;
                      const direction = String(r?.store_id) === storeId ? 'Entrant' : 'Sortant';

                      return (
                        <TableRow key={String(r?.id || sn)}>
                          <TableCell className="font-mono text-sm">{sn}</TableCell>
                          <TableCell>{createdAt ? createdAt.toLocaleDateString('fr-FR') : '-'}</TableCell>
                          <TableCell className="text-right font-semibold">{money(amt)} MAD</TableCell>
                          <TableCell>
                            <span
                              className={`px-2 py-1 rounded text-xs font-semibold ${
                                direction === 'Entrant' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                              }`}
                            >
                              {direction}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="outline" onClick={() => loadOpDetails(r)}>
                              <Eye className="w-4 h-4 mr-2" />
                              Voir détails
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                <div className="flex items-center justify-between gap-3 p-3">
                  <div className="text-xs text-gray-600">
                    Affichés: <span className="font-semibold">{Math.min(transfersVisibleCount, transferRows.length)}</span> /
                    <span className="font-semibold"> {transferRows.length}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {transfersVisibleCount < transferRows.length && (
                      <Button size="sm" variant="outline" onClick={() => setTransfersVisibleCount((c) => c + PAGE_SIZE)}>
                        Charger plus
                      </Button>
                    )}

                    {transferRows.length > PAGE_SIZE && (
                      <Button size="sm" variant="ghost" onClick={() => setTransfersVisibleCount(PAGE_SIZE)}>
                        Haut
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialog: Chèques (paiement par référence) */}
      <Dialog
        open={checksDialogOpen}
        onOpenChange={(open) => {
          setChecksDialogOpen(open);
          if (!open) {
            setChecksDialogRef('');
            setChecksDialogChecks([]);
            setChecksDialogLoading(false);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chèques du paiement — {checksDialogRef || '-'}</DialogTitle>
          </DialogHeader>

          {checksDialogLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : checksDialogChecks.length === 0 ? (
            <p className="text-sm text-gray-600">Aucun chèque lié à cette référence.</p>
          ) : (
            <div className="space-y-3">
              <div className="text-sm text-gray-700">
                Nombre de chèques: <span className="font-semibold">{checksDialogChecks.length}</span>
              </div>

              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Chèque</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead className="text-right">Reste</TableHead>
                      <TableHead>Donné à</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {checksDialogChecks.map((c: any) => {
                      const amount = Number(c?.amount_value ?? 0) || 0;
                      const remaining =
                        c?.remaining_balance === null || c?.remaining_balance === undefined
                          ? amount
                          : (Number(c?.remaining_balance) || 0);
                      const st = String(c?.status || '').trim() || '-';
                      const idNumber = c?.check_id_number || (c.__missing ? String(c.id) : '-');

                      return (
                        <TableRow key={String(c?.id)}>
                          <TableCell className="font-semibold">
                            {idNumber}
                            {c.__missing ? ' (introuvable)' : ''}
                          </TableCell>
                          <TableCell>{st}</TableCell>
                          <TableCell className="text-right">{amount.toFixed(2)} MAD</TableCell>
                          <TableCell className="text-right">{remaining.toFixed(2)} MAD</TableCell>
                          <TableCell>{String(c?.given_to || '-')}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setChecksDialogOpen(false)}>
                  Fermer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: Détails Transfert/Achat */}
      <Dialog
        open={opDetailsOpen}
        onOpenChange={(open) => {
          setOpDetailsOpen(open);
          if (!open) {
            setOpDetailsTitle('');
            setOpDetailsItems([]);
            setOpDetailsLoading(false);
            setOpDetailsQuery('');
            setOpDetailsVisibleCount(PAGE_SIZE);
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{opDetailsTitle || 'Détails'}</DialogTitle>
          </DialogHeader>

          {opDetailsLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : opDetailsItems.length === 0 ? (
            <p className="text-sm text-gray-600">Aucun produit trouvé pour cette opération.</p>
          ) : (
            <div className="space-y-3">
              {(() => {
                // PERF: normalize once, then filter/slice on normalized array
                const normalized = opDetailsItems.map((raw: any, idx: number) => {
                  const it = normalizeOpItem(raw);
                  return { raw, it, __key: String(raw?.id || `${it.ref}-${idx}`) };
                });

                const q = opDetailsQuery.trim().toLowerCase();
                const filtered = q ? normalized.filter(({ it }) => `${it.ref} ${it.name}`.toLowerCase().includes(q)) : normalized;
                const visible = filtered.slice(0, opDetailsVisibleCount);

                return (
                  <>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm text-gray-700">
                        Produits: <span className="font-semibold">{filtered.length}</span>
                        {filtered.length !== opDetailsItems.length ? (
                          <span className="text-gray-500"> (filtré depuis {opDetailsItems.length})</span>
                        ) : null}
                      </div>

                      <input
                        value={opDetailsQuery}
                        onChange={(e) => {
                          setOpDetailsQuery(e.target.value);
                          setOpDetailsVisibleCount(PAGE_SIZE);
                        }}
                        placeholder="Rechercher (réf / produit)..."
                        className="h-9 w-full sm:w-80 rounded-md border border-gray-300 bg-white px-3 text-sm outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="border rounded-lg overflow-x-auto max-h-[60vh] overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-white z-[1]">
                          <TableRow>
                            <TableHead>Réf</TableHead>
                            <TableHead>Produit</TableHead>
                            <TableHead className="text-right">Caisse</TableHead>
                            <TableHead className="text-right">Quantité</TableHead>
                            <TableHead className="text-right">Moyenne</TableHead>
                            <TableHead className="text-right">Prix Unitaire</TableHead>
                            <TableHead className="text-right">Sous-total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visible.map(({ it, __key }) => (
                            <TableRow key={__key}>
                              <TableCell className="font-mono text-sm">{it.ref}</TableCell>
                              <TableCell className="font-semibold">{it.name}</TableCell>
                              <TableCell className="text-right">{money(it.caisse)}</TableCell>
                              <TableCell className="text-right">{money(it.quantity)}</TableCell>
                              <TableCell className="text-right">{money(it.moyenne)}</TableCell>
                              <TableCell className="text-right">{money(it.unitPrice)} MAD</TableCell>
                              <TableCell className="text-right font-semibold">{money(it.subTotal)} MAD</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>

                      <div className="flex items-center justify-between gap-3 p-3">
                        <div className="text-xs text-gray-600">
                          Affichés: <span className="font-semibold">{Math.min(opDetailsVisibleCount, filtered.length)}</span> /
                          <span className="font-semibold"> {filtered.length}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          {opDetailsVisibleCount < filtered.length && (
                            <Button size="sm" variant="outline" onClick={() => setOpDetailsVisibleCount((c) => c + PAGE_SIZE)}>
                              Charger plus
                            </Button>
                          )}

                          {filtered.length > PAGE_SIZE && (
                            <Button size="sm" variant="ghost" onClick={() => setOpDetailsVisibleCount(PAGE_SIZE)}>
                              Haut
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button variant="outline" onClick={() => setOpDetailsOpen(false)}>
                        Fermer
                      </Button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Achats */}
      {activeTab === 'purchases' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Achats de Produits ({purchaseRows.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tradingLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : purchaseRows.length === 0 ? (
              <p className="text-sm text-gray-600">Aucun achat trouvé.</p>
            ) : (
              <div className="border rounded-lg overflow-x-auto max-h-[60vh] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-white z-[1]">
                    <TableRow>
                      <TableHead>N°</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead>Direction</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visiblePurchaseRows.map((r: any) => {
                      const sn = String(r?.sale_number || '-');
                      const createdAt = r?.created_at ? new Date(r.created_at) : null;
                      const amt = Number(r?.total_amount || 0) || 0;
                      const direction = String(r?.store_id) === storeId ? 'Entrant' : 'Sortant';

                      return (
                        <TableRow key={String(r?.id || sn)}>
                          <TableCell className="font-mono text-sm">{sn}</TableCell>
                          <TableCell>{createdAt ? createdAt.toLocaleDateString('fr-FR') : '-'}</TableCell>
                          <TableCell className="text-right font-semibold">{money(amt)} MAD</TableCell>
                          <TableCell>
                            <span
                              className={`px-2 py-1 rounded text-xs font-semibold ${
                                direction === 'Entrant' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                              }`}
                            >
                              {direction}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="outline" onClick={() => loadOpDetails(r)}>
                              <Eye className="w-4 h-4 mr-2" />
                              Voir détails
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                <div className="flex items-center justify-between gap-3 p-3">
                  <div className="text-xs text-gray-600">
                    Affichés: <span className="font-semibold">{Math.min(purchasesVisibleCount, purchaseRows.length)}</span> /
                    <span className="font-semibold"> {purchaseRows.length}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {purchasesVisibleCount < purchaseRows.length && (
                      <Button size="sm" variant="outline" onClick={() => setPurchasesVisibleCount((c) => c + PAGE_SIZE)}>
                        Charger plus
                      </Button>
                    )}

                    {purchaseRows.length > PAGE_SIZE && (
                      <Button size="sm" variant="ghost" onClick={() => setPurchasesVisibleCount(PAGE_SIZE)}>
                        Haut
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
