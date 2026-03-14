import { useEffect, useMemo, useState } from 'react';
import { projectId } from '../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';

interface SupplierAdminPaymentsPageProps {
  session: any;
  adminUserId: string;
  adminEmail?: string;
  onBack: () => void;
}

export function SupplierAdminPaymentsPage({
  session,
  adminUserId,
  adminEmail,
  onBack,
}: SupplierAdminPaymentsPageProps) {
  const [loading, setLoading] = useState(false);
  const [payments, setPayments] = useState<any[]>([]);

  // Operations (Transferts & Achats) between magasin and this admin supplier
  const [opsLoading, setOpsLoading] = useState(false);
  const [operations, setOperations] = useState<any[]>([]);

  // Horizontal switch (tabs)
  const [activeTab, setActiveTab] = useState<'payments' | 'operations'>('payments');

  // Payment details (cheques list)
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsPayment, setDetailsPayment] = useState<any>(null);
  const [detailsChecks, setDetailsChecks] = useState<any[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Operation details dialog (products/items)
  const [opDetailsOpen, setOpDetailsOpen] = useState(false);
  const [opDetailsOperation, setOpDetailsOperation] = useState<any>(null);
  const [opDetailsItems, setOpDetailsItems] = useState<any[]>([]);
  const [opDetailsLoading, setOpDetailsLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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

  const buildReadableNotes = (notes: any) => {
    const txt = String(notes || '').trim();
    if (!txt) return '-';

    // If it doesn't look like our structured marker, return as-is.
    if (!txt.toLowerCase().includes('paiement global') || !txt.includes('fournisseur_admin_id=')) {
      return txt;
    }

    const parts: string[] = [];

    // Keep a short title
    parts.push('Paiement global (Fournisseur Admin)');

    // magasin_payeur
    const mStore = txt.match(/magasin_payeur=([^|\n\r]+)/i);
    if (mStore && mStore[1]) {
      parts.push(`Magasin: ${String(mStore[1]).trim()}`);
    }

    // check inventory ids (count)
    const ids = parseCheckInventoryIdsFromNotes(txt);
    if (ids.length > 0) {
      parts.push(`Chèques: ${ids.length}`);
    }

    // Try to keep any extra free text after the structured prefix
    // (remove the known markers to avoid UUID noise)
    const cleaned = txt
      .replace(/\|\s*fournisseur_admin_id=[^|\n\r]+/gi, '')
      .replace(/\|\s*magasin_payeur=[^|\n\r]+/gi, '')
      .replace(/\|\s*check_inventory_ids=[^|\n\r]+/gi, '')
      .replace(/\|\s*check_inventory_id=[^|\n\r]+/gi, '')
      .replace(/^Paiement\s+global\s*\(Fournisseur\s+Admin\)\s*/i, '')
      .replace(/^\|\s*/g, '')
      .trim();

    if (cleaned) {
      parts.push(cleaned);
    }

    return parts.join(' • ');
  };

  const loadPaymentCheques = async (payment: any) => {
    if (!payment) return;

    setDetailsLoading(true);
    try {
      const idsFromMulti = parseCheckInventoryIdsFromNotes(payment?.notes);
      const singleId = payment?.check_inventory_id ? String(payment.check_inventory_id).trim() : '';
      const ids = Array.from(new Set([...(idsFromMulti || []), ...(singleId ? [singleId] : [])].filter(Boolean)));

      if (ids.length === 0) {
        setDetailsChecks([]);
        return;
      }

      const invRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!invRes.ok) {
        const t = await invRes.text().catch(() => '');
        console.error('Failed to fetch check-inventory for payment details', invRes.status, t);
        toast.error('Erreur lors du chargement des chèques');
        setDetailsChecks([]);
        return;
      }

      const invData = await invRes.json().catch(() => ({}));
      const invRows = Array.isArray(invData?.checks)
        ? invData.checks
        : (Array.isArray(invData?.check_inventory) ? invData.check_inventory : []);

      const byId = new Map(invRows.map((c: any) => [String(c?.id), c]));
      const out = ids.map((id) => byId.get(String(id)) || ({ id, __missing: true } as any));
      setDetailsChecks(out);
    } catch (e) {
      console.error('loadPaymentCheques error', e);
      toast.error('Erreur lors du chargement des détails');
      setDetailsChecks([]);
    } finally {
      setDetailsLoading(false);
    }
  };

  const fetchPayments = async () => {
    setLoading(true);
    try {
      // We reuse store_global_payments table because this flow stores payments there.
      // We filter by notes marker: fournisseur_admin_id=<admin_user_id>
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/store-global-payments`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        console.error('Failed to fetch store global payments', res.status, t);
        toast.error('Erreur lors du chargement des paiements');
        setPayments([]);
        return;
      }

      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data?.store_global_payments) ? data.store_global_payments : [];

      const tag = `fournisseur_admin_id=${String(adminUserId)}`;
      const onlyThisAdmin = list
        .filter((p: any) => String(p?.notes || '').includes(tag))
        .map((p: any) => ({
          ...p,
          __checkIds: parseCheckInventoryIdsFromNotes(p?.notes),
          __readableNotes: buildReadableNotes(p?.notes),
        }));

      setPayments(onlyThisAdmin);
    } catch (e) {
      console.error('fetchPayments error', e);
      toast.error('Erreur lors du chargement');
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchOperations = async () => {
    setOpsLoading(true);
    try {
      // Backend scopes this endpoint to the caller store when role is manager/magasin_manager.
      // For admin role it can return all stores, but in this page we still show it as an operation list.
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/admin-supplier-invoices?admin_user_id=${encodeURIComponent(
          String(adminUserId)
        )}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        console.error('Failed to fetch admin supplier invoices (operations)', res.status, t);
        toast.error('Erreur lors du chargement des opérations');
        setOperations([]);
        return;
      }

      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data?.invoices) ? data.invoices : [];

      // Normalize to allow future extension (e.g. purchases)
      const normalized = list.map((r: any) => ({
        ...r,
        __type: String(r?.sale_id ? 'transfer_admin' : 'operation'),
      }));

      setOperations(normalized);
    } catch (e) {
      console.error('fetchOperations error', e);
      toast.error('Erreur lors du chargement des opérations');
      setOperations([]);
    } finally {
      setOpsLoading(false);
    }
  };

  const loadOperationItems = async (op: any) => {
    if (!op) return;

    const saleId = op?.sale_id ? String(op.sale_id).trim() : '';
    if (!saleId) {
      toast.error('Cette opération ne contient pas de sale_id (détails indisponibles)');
      setOpDetailsItems([]);
      return;
    }

    setOpDetailsLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/sales/${encodeURIComponent(saleId)}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        console.error('Failed to fetch sale details for operation', res.status, t);
        toast.error('Erreur lors du chargement des produits');
        setOpDetailsItems([]);
        return;
      }

      const data = await res.json().catch(() => ({}));

      // Prefer sale_items from the sale endpoint.
      // But some operations (like admin supplier invoices) may not have any sale_items saved.
      const items = Array.isArray(data?.sale?.sale_items) ? data.sale.sale_items : [];

      // Fallback: if the operation has a stock_reference, try to show products under that stock reference.
      // This matches how many "transferts" in this app are organized.
      if (items.length === 0 && op?.stock_reference) {
        const sr = String(op.stock_reference).trim();
        if (sr) {
          try {
            const pRes = await fetch(
              `https://${projectId}.supabase.co/functions/v1/super-handler/products?stock_reference=${encodeURIComponent(sr)}`,
              {
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                },
              }
            );

            if (pRes.ok) {
              const pData = await pRes.json().catch(() => ({}));
              const prods = Array.isArray(pData?.products) ? pData.products : [];
              // Map to a sale_items-like shape so UI can render it.
              const mapped = prods.map((p: any) => {
                const caisses = Number(p?.number_of_boxes ?? 0) || 0;
                // In this app, quantity_available is often the "caisse" stock.
                // If we don't have a real movement quantity, we use caisses as quantity fallback.
                const qty = Number(p?.quantity_available ?? caisses ?? 0) || 0;
                const unit = Number(p?.purchase_price ?? p?.sale_price ?? 0) || 0;
                const total = qty * unit;

                return {
                  id: p?.id,
                  product_id: p?.id,
                  product_name: p?.name || p?.reference || p?.id,
                  reference: p?.reference,
                  number_of_boxes: caisses,
                  caisse: caisses,
                  quantity: qty,
                  unit_price: unit,
                  total_price: total,
                };
              });
              setOpDetailsItems(mapped);
              return;
            }
          } catch (e) {
            // silent fallback
            console.warn('Fallback products by stock_reference failed', e);
          }
        }
      }

      setOpDetailsItems(items);
    } catch (e) {
      console.error('loadOperationItems error', e);
      toast.error('Erreur lors du chargement des produits');
      setOpDetailsItems([]);
    } finally {
      setOpDetailsLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
    fetchOperations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminUserId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;

    return (payments || [])
      .filter((p: any) => {
        const hay = `${p?.paid_by_store_name || ''} ${p?.reference_number || ''} ${p?.payment_method || ''} ${p?.notes || ''}`.toLowerCase();
        if (q && !hay.includes(q)) return false;

        const d = p?.payment_date || p?.created_at;
        if (from || to) {
          const ts = d ? new Date(d).getTime() : NaN;
          if (from && Number.isFinite(ts) && ts < from) return false;
          if (to && Number.isFinite(ts) && ts > to) return false;
        }

        return true;
      })
      .sort((a: any, b: any) => {
        const da = new Date(a?.payment_date || a?.created_at || 0).getTime();
        const db = new Date(b?.payment_date || b?.created_at || 0).getTime();
        return db - da;
      });
  }, [payments, search, dateFrom, dateTo]);

  const totalAmount = useMemo(
    () => filtered.reduce((sum: number, p: any) => sum + (Number(p?.amount || 0) || 0), 0),
    [filtered]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Paiements (Fournisseur Admin)</h2>
          <p className="text-sm text-gray-600">
            {adminEmail ? `${adminEmail} — ` : ''}Historique des paiements enregistrés via « Paiement Global (Fournisseur Admin) »
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>
            Retour
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              fetchPayments();
              fetchOperations();
            }}
            disabled={loading || opsLoading}
          >
            Rafraîchir
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtres</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-6 space-y-1">
              <Label>Rechercher</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Magasin, réf, notes..." />
            </div>
            <div className="md:col-span-3 space-y-1">
              <Label>Du</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="md:col-span-3 space-y-1">
              <Label>Au</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <div className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-200">
              <div className="text-xs text-blue-700 font-semibold">Nombre</div>
              <div className="text-lg font-bold text-blue-900">{filtered.length}</div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-green-50 border border-green-200">
              <div className="text-xs text-green-700 font-semibold">Total</div>
              <div className="text-lg font-bold text-green-900">{totalAmount.toFixed(2)} MAD</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Horizontal switch */}
      <div className="flex gap-2">
        <Button
          variant={activeTab === 'payments' ? 'default' : 'outline'}
          onClick={() => setActiveTab('payments')}
          className="flex-1"
        >
          Paiements
        </Button>
        <Button
          variant={activeTab === 'operations' ? 'default' : 'outline'}
          onClick={() => setActiveTab('operations')}
          className="flex-1"
        >
          Opérations
        </Button>
      </div>

      {activeTab === 'payments' ? (
        <Card>
          <CardHeader>
            <CardTitle>Liste des Paiements</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Aucun paiement trouvé</p>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Magasin payeur</TableHead>
                      <TableHead>Référence</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead>Méthode</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Chèques</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p: any) => {
                      const checkCount = Array.isArray(p.__checkIds) ? p.__checkIds.length : 0;
                      return (
                        <TableRow key={String(p.id)}>
                          <TableCell className="font-semibold">{p.paid_by_store_name || p.paid_by_store_id || p.store_id || '-'}</TableCell>
                          <TableCell>{p.reference_number || '-'}</TableCell>
                          <TableCell className="text-right font-bold">{(Number(p.amount || 0) || 0).toFixed(2)} MAD</TableCell>
                          <TableCell>{p.payment_method || '-'}</TableCell>
                          <TableCell>{p.payment_date ? new Date(p.payment_date).toLocaleDateString('fr-FR') : '-'}</TableCell>
                          <TableCell>{checkCount > 0 ? `${checkCount} chèque(s)` : '-'}</TableCell>
                          <TableCell className="max-w-[420px] truncate" title={String(p.notes || '')}>
                            {String(p.__readableNotes || p.notes || '-')}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={checkCount === 0 && !String(p?.check_inventory_id || '').trim()}
                              onClick={async () => {
                                setDetailsPayment(p);
                                setDetailsOpen(true);
                                await loadPaymentCheques(p);
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
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Opérations (Transferts & Achats de Produits)</CardTitle>
          </CardHeader>
          <CardContent>
            {opsLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (operations || []).length === 0 ? (
              <p className="text-center text-gray-500 py-8">Aucune opération trouvée</p>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Référence</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(operations || [])
                      .slice()
                      .sort((a: any, b: any) => {
                        const da = new Date(a?.created_at || 0).getTime();
                        const db = new Date(b?.created_at || 0).getTime();
                        return db - da;
                      })
                      .map((op: any) => {
                        const amount = Number(op?.total_amount ?? op?.amount ?? 0) || 0;
                        const when = op?.created_at ? new Date(op.created_at).toLocaleDateString('fr-FR') : '-';
                        const typeLabel = 'Transfert (Admin)';
                        const ref = op?.stock_reference || op?.sale_id || op?.id || '-';

                        const canView = !!String(op?.sale_id || '').trim();

                        return (
                          <TableRow key={String(op?.id || op?.sale_id)}>
                            <TableCell className="font-semibold">{typeLabel}</TableCell>
                            <TableCell>{String(ref)}</TableCell>
                            <TableCell className="text-right font-bold">{amount.toFixed(2)} MAD</TableCell>
                            <TableCell>{when}</TableCell>
                            <TableCell className="max-w-[520px] truncate" title={String(op?.notes || '')}>
                              {String(op?.notes || '-')}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!canView}
                                onClick={async () => {
                                  setOpDetailsOperation(op);
                                  setOpDetailsOpen(true);
                                  await loadOperationItems(op);
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
              </div>
            )}

            <p className="text-xs text-gray-500 mt-3">
              Note: cette liste est basée sur les factures fournisseur admin enregistrées (TRANSFER-ADMIN-*). Les achats/achats produits seront ajoutés dès que la source est confirmée.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Operation details dialog (products) */}
      <Dialog
        open={opDetailsOpen}
        onOpenChange={(open) => {
          setOpDetailsOpen(open);
          if (!open) {
            setOpDetailsOperation(null);
            setOpDetailsItems([]);
            setOpDetailsLoading(false);
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Détails de l’opération (Produits)</DialogTitle>
          </DialogHeader>

          {opDetailsOperation && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg border space-y-1">
                <div className="text-sm text-gray-700">
                  Référence:{' '}
                  <span className="font-semibold">
                    {String(opDetailsOperation?.stock_reference || opDetailsOperation?.sale_id || opDetailsOperation?.id || '-')}
                  </span>
                </div>
                <div className="text-sm text-gray-700">
                  Montant:{' '}
                  <span className="font-semibold">{(Number(opDetailsOperation?.total_amount ?? 0) || 0).toFixed(2)} MAD</span>
                </div>
                <div className="text-sm text-gray-700">
                  Date:{' '}
                  <span className="font-semibold">
                    {opDetailsOperation?.created_at ? new Date(opDetailsOperation.created_at).toLocaleDateString('fr-FR') : '-'}
                  </span>
                </div>
              </div>

              {opDetailsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : opDetailsItems.length === 0 ? (
                <p className="text-sm text-gray-600">Aucun produit trouvé pour cette opération.</p>
              ) : (
                <div className="border rounded-lg overflow-x-auto max-h-[65vh] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produit</TableHead>
                        <TableHead>Réf</TableHead>
                        <TableHead className="text-right">Caisses</TableHead>
                        <TableHead className="text-right">Quantité</TableHead>
                        <TableHead className="text-right">Moyen</TableHead>
                        <TableHead className="text-right">Prix U</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {opDetailsItems.map((it: any, idx: number) => {
                        const name = String(it?.product_name || it?.name || it?.product_reference || it?.reference || it?.product_id || '-');
                        const ref = String(it?.reference || it?.product_reference || it?.product_ref || it?.product_code || '-');

                        // Quantités:
                        // - sale_items: quantity is usually "quantity" and caisses may be stored in "caisse"
                        // - fallback products list: we mapped quantity from number_of_boxes/quantity_available
                        const caissesRaw = it?.caisse ?? it?.number_of_boxes;
                        const qtyRaw = it?.quantity;

                        const caissesNum = Number(caissesRaw);
                        const qtyNum = Number(qtyRaw);

                        const caisses = Number.isFinite(caissesNum) ? caissesNum : 0;
                        const qty = Number.isFinite(qtyNum) ? qtyNum : 0;

                        // Moyen (average per caisse) best-effort:
                        // if qty exists and caisses exists => qty/caisses
                        const moyen = caisses > 0 ? qty / caisses : 0;

                        const unitNum = Number(it?.unit_price ?? 0);
                        const unit = Number.isFinite(unitNum) ? unitNum : 0;

                        const totalNum = it?.total_price !== undefined && it?.total_price !== null
                          ? Number(it?.total_price)
                          : (qty * unit);
                        const total = Number.isFinite(totalNum) ? totalNum : (qty * unit);

                        return (
                          <TableRow key={String(it?.id || `${it?.product_id}-${idx}`)}>
                            <TableCell className="font-semibold">{name}</TableCell>
                            <TableCell>{ref}</TableCell>
                            <TableCell className="text-right">{Number.isFinite(caisses) && caisses > 0 ? caisses : '-'}</TableCell>
                            <TableCell className="text-right">{Number.isFinite(qty) && qty > 0 ? qty : '-'}</TableCell>
                            <TableCell className="text-right">{moyen > 0 ? moyen.toFixed(2) : '-'}</TableCell>
                            <TableCell className="text-right">{unit.toFixed(2)} MAD</TableCell>
                            <TableCell className="text-right font-bold">{total.toFixed(2)} MAD</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setOpDetailsOpen(false)}>
                  Fermer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment details dialog (cheques list) */}
      <Dialog
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) {
            setDetailsPayment(null);
            setDetailsChecks([]);
            setDetailsLoading(false);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Détails du paiement (Chèques)</DialogTitle>
          </DialogHeader>

          {detailsPayment && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg border">
                <div className="text-sm text-gray-700">
                  Magasin: <span className="font-semibold">{detailsPayment.paid_by_store_name || detailsPayment.paid_by_store_id || detailsPayment.store_id || '-'}</span>
                </div>
                <div className="text-sm text-gray-700">
                  Référence: <span className="font-semibold">{detailsPayment.reference_number || '-'}</span>
                </div>
                <div className="text-sm text-gray-700">
                  Montant: <span className="font-semibold">{(Number(detailsPayment.amount || 0) || 0).toFixed(2)} MAD</span>
                </div>
              </div>

              {detailsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : detailsChecks.length === 0 ? (
                <p className="text-sm text-gray-600">Aucun chèque lié à ce paiement.</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-700">
                      Nombre de chèques: <span className="font-semibold">{detailsChecks.length}</span>
                    </div>
                    <div className="text-sm text-gray-700">
                      Total chèques: <span className="font-semibold">{detailsChecks.reduce((s: number, c: any) => s + (Number(c?.remaining_balance ?? c?.amount_value ?? 0) || 0), 0).toFixed(2)} MAD</span>
                    </div>
                  </div>

                  <div className="border rounded-lg overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Chèque</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead className="text-right">Montant</TableHead>
                          <TableHead className="text-right">Reste</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailsChecks.map((c: any) => {
                          const amount = Number(c?.amount_value ?? 0) || 0;
                          const remaining = c?.remaining_balance === null || c?.remaining_balance === undefined ? amount : (Number(c?.remaining_balance) || 0);
                          const st = String(c?.status || '').trim() || '-';
                          const idNumber = c?.check_id_number || (c.__missing ? String(c.id) : '-');

                          return (
                            <TableRow key={String(c?.id)}>
                              <TableCell className="font-semibold">{idNumber}{c.__missing ? ' (introuvable)' : ''}</TableCell>
                              <TableCell>{st}</TableCell>
                              <TableCell className="text-right">{amount.toFixed(2)} MAD</TableCell>
                              <TableCell className="text-right">{remaining.toFixed(2)} MAD</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <p className="text-xs text-gray-500">
                    Note: la liste est basée sur <code>check_inventory_ids</code> (notes) et/ou <code>check_inventory_id</code>.
                  </p>
                </div>
              )}

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setDetailsOpen(false)}>
                  Fermer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
