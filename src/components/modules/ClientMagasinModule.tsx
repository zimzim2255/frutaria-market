import { useEffect, useMemo, useState } from 'react';
import { projectId } from '../../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import { DollarSign, Eye, RefreshCw, Search, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { ClientMagasinDetailsPage } from '../ClientMagasinDetailsPage';

interface ClientMagasinModuleProps {
  session: any;
}

export function ClientMagasinModule({ session }: ClientMagasinModuleProps) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [sortOrder, setSortOrder] = useState<'high-to-low' | 'low-to-high'>('high-to-low');
  const [activeTab, setActiveTab] = useState<'debts' | 'payments'>('debts');

  // Global payment (magasin) — no "admin select magasin first" requirement.
  const [globalPaymentDialogOpen, setGlobalPaymentDialogOpen] = useState(false);
  const [globalPaymentSelectedStore, setGlobalPaymentSelectedStore] = useState<any>(null);
  const [globalPaymentAmount, setGlobalPaymentAmount] = useState('');
  const [globalPaymentRemiseAmount, setGlobalPaymentRemiseAmount] = useState('');
  const [globalPaymentReference, setGlobalPaymentReference] = useState('');
  const [globalPaymentMethod, setGlobalPaymentMethod] = useState<'cash' | 'check' | 'bank_transfer' | 'other'>('cash');
  const [globalPaymentLoading, setGlobalPaymentLoading] = useState(false);
  const [globalPaymentCoffer, setGlobalPaymentCoffer] = useState('');

  // Payments received from magasins (Clients Magasins confirmations)
  // NOTE: cash + bank_transfer are now pending via pending_coffer_transfers (Option A).
  // Checks are still confirmed via store_global_payments PUT flow.
  const [paymentsReceived, setPaymentsReceived] = useState<any[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  // Admin filter: show payments for a specific magasin
  const [paymentsStoreFilter, setPaymentsStoreFilter] = useState<string>('');
  // Date filter (payment_date)
  const [paymentsDateFrom, setPaymentsDateFrom] = useState<string>('');
  const [paymentsDateTo, setPaymentsDateTo] = useState<string>('');
  const [confirmPaymentDialogOpen, setConfirmPaymentDialogOpen] = useState(false);
  const [selectedPaymentToConfirm, setSelectedPaymentToConfirm] = useState<any>(null);
  const [selectedCoffer, setSelectedCoffer] = useState('');
  const [coffers, setCoffers] = useState<any[]>([]);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Payment details (show which cheques were sent for this payment)
  const [paymentDetailsDialogOpen, setPaymentDetailsDialogOpen] = useState(false);
  const [selectedPaymentForDetails, setSelectedPaymentForDetails] = useState<any>(null);
  const [paymentDetailsChecks, setPaymentDetailsChecks] = useState<any[]>([]);
  const [paymentDetailsLoading, setPaymentDetailsLoading] = useState(false);

  const fetchPaymentsReceived = async () => {
    setPaymentsLoading(true);
    try {
      // NEW source of truth for "Paiements Reçus" (cash + bank_transfer pending confirmations)
      // is pending_coffer_transfers.
      // Checks confirmation remains on the cheque flow and is NOT part of this pending table.

      const qs = new URLSearchParams();
      if (paymentsStoreFilter) qs.set('store_id', paymentsStoreFilter);
      // Default: show pending only (admin confirmations table)
      qs.set('status', 'pending');

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/pending-coffer-transfers?${qs.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.error('Failed to fetch pending-coffer-transfers', res.status, txt);
        setPaymentsReceived([]);
        return;
      }

      const data = await res.json().catch(() => ({}));
      const transfers = Array.isArray((data as any)?.transfers) ? (data as any).transfers : [];

      // Normalize to existing table shape
      const normalized = (transfers || []).map((t: any) => {
        const st = String(t?.status || '').toLowerCase();
        return {
          id: String(t?.id || ''),
          store_id: t?.store_id ? String(t.store_id) : null,
          paid_by_store_id: t?.store_id ? String(t.store_id) : null,
          paid_by_store_name: t?.store_name || null,
          amount: t?.amount,
          payment_method: 'cash', // pending transfers currently represent cash/bank_transfer
          payment_date: t?.created_at || null,
          reference_number: t?.reference_number || null,
          notes: t?.notes || null,
          __source: 'pending_coffer_transfers',
          __pending_transfer_id: String(t?.id || ''),
          __confirmed: st === 'confirmed',
          __pending_status: (st === 'pending' || st === 'confirmed' || st === 'rejected') ? st : 'pending',
          __target_coffer_id: t?.target_coffer_id ? String(t.target_coffer_id) : null,
        };
      });

      setPaymentsReceived(
        normalized.sort((a: any, b: any) => {
          const da = new Date(a?.payment_date || 0).getTime();
          const db = new Date(b?.payment_date || 0).getTime();
          return db - da;
        })
      );
    } catch (e) {
      console.error('fetchPaymentsReceived error', e);
      setPaymentsReceived([]);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const fetchCoffers = async () => {
    try {
      // Source of truth for coffers in this app is localStorage('coffers') (used by CheckSafeModule).
      // The backend may not expose a /coffers endpoint.
      const stored = localStorage.getItem('coffers');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const list = Array.isArray(parsed) ? parsed : [];
          if (list.length > 0) {
            setCoffers(list);
            return;
          }
        } catch {
          // ignore and fallback
        }
      }

      // Fallback: derive coffers from existing check_safe rows
      const fallback = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/check-safe`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (fallback.ok) {
        const data = await fallback.json();
        const rows = Array.isArray(data?.check_safe) ? data.check_safe : [];
        const cofferIds = Array.from(
          new Set(rows.map((r: any) => String(r?.coffer_id || '').trim()).filter(Boolean))
        );

        // Normalize to the same shape used everywhere else
        const normalized = cofferIds.map((id) => ({
          id: String(id),
          name: String(id) === 'main' ? 'Coffre Principal' : String(id),
          createdAt: new Date().toISOString(),
        }));

        if (normalized.length > 0) {
          setCoffers(normalized);
          return;
        }
      }

      // Last fallback: main
      setCoffers([{ id: 'main', name: 'Coffre Principal', createdAt: new Date().toISOString() }]);
    } catch (e) {
      console.error('fetchCoffers error', e);
      setCoffers([{ id: 'main', name: 'Coffre Principal', createdAt: new Date().toISOString() }]);
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

  const getCheckIdsForPayment = (payment: any): string[] => {
    const fromNotes = parseCheckInventoryIdsFromNotes(payment?.notes);
    const fromArray = Array.isArray(payment?.__check_inventory_ids)
      ? payment.__check_inventory_ids.map((x: any) => String(x).trim()).filter(Boolean)
      : [];
    const firstId = payment?.check_inventory_id ? String(payment.check_inventory_id).trim() : '';

    return Array.from(new Set([...(fromArray || []), ...(fromNotes || []), ...(firstId ? [firstId] : [])].filter(Boolean)));
  };

  const loadPaymentDetails = async (payment: any) => {
    if (!payment) return;

    setPaymentDetailsLoading(true);
    try {
      const uniqueIds = getCheckIdsForPayment(payment);

      if (uniqueIds.length === 0) {
        setPaymentDetailsChecks([]);
        return;
      }

      // Fetch inventory and filter by ids (no dedicated endpoint yet)
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
        setPaymentDetailsChecks([]);
        return;
      }

      const invData = await invRes.json().catch(() => ({}));
      const invRows = Array.isArray(invData?.checks)
        ? invData.checks
        : (Array.isArray(invData?.check_inventory) ? invData.check_inventory : []);

      const byId = new Map(invRows.map((c: any) => [String(c?.id), c]));
      const out = uniqueIds.map((id) => byId.get(String(id)) || ({ id, __missing: true } as any));
      setPaymentDetailsChecks(out);
    } catch (e) {
      console.error('loadPaymentDetails error', e);
      toast.error('Erreur lors du chargement des détails');
      setPaymentDetailsChecks([]);
    } finally {
      setPaymentDetailsLoading(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!selectedPaymentToConfirm || !selectedCoffer) {
      toast.error('Veuillez sélectionner un coffre');
      return;
    }

    setConfirmLoading(true);
    try {
      const transferId = String(
        selectedPaymentToConfirm?.__pending_transfer_id || selectedPaymentToConfirm?.id || ''
      ).trim();

      if (!transferId) {
        toast.error('Transfert introuvable');
        return;
      }

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/pending-coffer-transfers/${transferId}/confirm`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            // keep ability to attach optional admin note later
            notes: null,
            // NOTE: coffer selection is already stored on transfer.target_coffer_id,
            // but we keep UI requiring it; backend confirm uses stored target_coffer_id.
            coffer_id: selectedCoffer,
          }),
        }
      );

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        console.error('Failed to confirm pending transfer', res.status, t);
        toast.error(`Erreur confirmation: ${res.status}`);
        return;
      }

      const paymentAmount = Number(selectedPaymentToConfirm.amount || 0) || 0;
      toast.success(`✅ Transfert de ${paymentAmount.toFixed(2)} MAD confirmé (coffre ${selectedCoffer})`);

      setConfirmPaymentDialogOpen(false);
      setSelectedPaymentToConfirm(null);
      setSelectedCoffer('');

      await fetchPaymentsReceived();
      await fetchDebts();
    } catch (err: any) {
      console.error('handleConfirmPayment error', err);
      toast.error(`Erreur: ${err?.message || 'inconnue'}`);
    } finally {
      setConfirmLoading(false);
    }
  };

  const fetchDebts = async () => {
    setLoading(true);
    try {
      // Try admin endpoint first (returns all magasins). If forbidden, fallback to /mine.
      const adminRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/magasin-debts`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (adminRes.ok) {
        const payload = await adminRes.json();
        const list = Array.isArray(payload?.debts) ? payload.debts : [];
        const mapped = list.map((d: any) => ({
          id: String(d.store_id),
          name: String(d.store_name || d.store_id),
          // financial columns
          total_transfers: Number(d.total_transfers || 0) || 0,
          // backend can return either total_payments or total_paid depending on deployment
          total_payments: Number(d.total_payments ?? d.total_paid ?? 0) || 0,
          remaining_balance: Number(d.remaining_balance || 0) || 0,
          // mark as magasin-like entity for ClientDetailsPage
          user_id: 'magasin',
          email: 'magasin',
          phone: '-',
          address: '-',
          ice: '-',
          if_number: '-',
          rc: '-',
          patente: '-',
          created_by_email: null,
          created_at: null,
          __entityType: 'store',
          __isStore: true,
        }));

        setRows(mapped);
        if (showDetails && selectedClient?.id) {
          const updated = mapped.find((r: any) => String(r.id) === String(selectedClient.id));
          if (updated) setSelectedClient(updated);
        }

        return;
      }

      // Not admin (or admin endpoint unavailable): fallback to mine
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/magasin-debts/mine`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.error('Failed to fetch magasin-debts', res.status, txt);
        toast.error('Erreur lors du chargement de la page magasin');
        setRows([]);
        return;
      }

      const payload = await res.json();
      const d = payload?.debt || null;
      if (!d) {
        setRows([]);
        return;
      }

      const mineRow = {
        id: String(d.store_id),
        name: String(d.store_name || d.store_id),
        total_transfers: Number(d.total_transfers || 0) || 0,
        // backend can return either total_payments or total_paid depending on deployment
        total_payments: Number(d.total_payments ?? d.total_paid ?? 0) || 0,
        remaining_balance: Number(d.remaining_balance || 0) || 0,
        user_id: 'magasin',
        email: 'magasin',
        phone: '-',
        address: '-',
        ice: '-',
        if_number: '-',
        rc: '-',
        patente: '-',
        created_by_email: null,
        created_at: null,
        __entityType: 'store',
        __isStore: true,
      };

      setRows([mineRow]);
      if (showDetails) setSelectedClient(mineRow);
    } catch (e) {
      console.error('fetchDebts error', e);
      toast.error('Erreur lors du chargement de la page magasin');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDebts();
    fetchCoffers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = Array.isArray(rows) ? rows : [];
    const filtered = !q
      ? list
      : list.filter((r: any) => `${r.name || ''} ${r.id || ''}`.toLowerCase().includes(q));

    return filtered.sort((a: any, b: any) => {
      const balA = Number(a.remaining_balance || 0) || 0;
      const balB = Number(b.remaining_balance || 0) || 0;
      const diff = sortOrder === 'high-to-low' ? (balB - balA) : (balA - balB);
      if (diff !== 0) return diff;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [rows, searchTerm, sortOrder]);

  const totals = useMemo(() => {
    const list = Array.isArray(rows) ? rows : [];
    return {
      totalFacture: list.reduce((s: number, r: any) => s + (Number(r.total_transfers || 0) || 0), 0),
      totalPaye: list.reduce((s: number, r: any) => s + (Number(r.total_payments || 0) || 0), 0),
      totalRest: list.reduce((s: number, r: any) => s + (Number(r.remaining_balance || 0) || 0), 0),
    };
  }, [rows]);

  const handleStoreGlobalPayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!globalPaymentSelectedStore?.id) {
      toast.error('Veuillez sélectionner un magasin');
      return;
    }

    const amount = Number(String(globalPaymentAmount || '').replace(',', '.'));
    const remiseAmount = Number(String(globalPaymentRemiseAmount || '').replace(',', '.'));

    if ((!Number.isFinite(amount) || amount <= 0) && (!Number.isFinite(remiseAmount) || remiseAmount <= 0)) {
      toast.error('Veuillez entrer un montant de paiement ou une remise');
      return;
    }

    setGlobalPaymentLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/store-global-payments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            store_id: String(globalPaymentSelectedStore.id),
            // Only cash/check/bank goes into store_global_payments.amount.
            // Remise is stored separately in discounts.
            amount: Math.max(0, Number(amount) || 0),
            payment_method: globalPaymentMethod,
            // Required by backend for ESPÈCE (cash) payments
            coffer_id: globalPaymentMethod === 'cash' ? (String(globalPaymentCoffer || '').trim() || null) : null,
            payment_date: new Date().toISOString(),
            reference_number: String(globalPaymentReference || '').trim() || null,
            notes: 'Paiement global magasin (depuis page Clients Magasins)',
          }),
        }
      );

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        console.error('store-global-payments failed', res.status, t);
        toast.error(`Erreur paiement magasin: ${res.status}`);
        return;
      }

      const created = await res.json().catch(() => null);
      const createdStoreGpId = created?.store_global_payment?.id || null;

      // If a REMISE was provided, record it in discounts and link to this store_global_payments row.
      // This makes it display in Caisse as a separate “remise” line.
      const remiseToSave = Math.max(0, Number(remiseAmount) || 0);
      if (remiseToSave > 0) {
        try {
          const discountBody: any = {
            entity_type: 'store',
            entity_id: String(globalPaymentSelectedStore.id),
            entity_name: String(globalPaymentSelectedStore.name || globalPaymentSelectedStore.id),
            discount_percentage: 0,
            discount_amount: remiseToSave,
            status: 'active',
            reason: `Remise via Paiement Global Magasin${globalPaymentReference ? ` (ref: ${String(globalPaymentReference).trim()})` : ''}`,
          };

          if (createdStoreGpId) {
            discountBody.ref_table = 'store_global_payments';
            discountBody.ref_id = createdStoreGpId;
          }

          const dRes = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/discounts`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify(discountBody),
            }
          );

          if (!dRes.ok) {
            const t = await dRes.text().catch(() => '');
            console.warn('Failed to save store remise (discounts):', dRes.status, t);
            toast.error(`Erreur remise (discounts): ${dRes.status}`);
          }
        } catch (e) {
          console.warn('Failed to save store remise (discounts):', e);
        }
      }

      const msgParts: string[] = [];
      if ((Number(amount) || 0) > 0) msgParts.push(`Paiement ${Number(amount).toFixed(2)} MAD`);
      if (remiseToSave > 0) msgParts.push(`Remise ${remiseToSave.toFixed(2)} MAD`);
      toast.success(`✅ ${msgParts.join(' + ')} enregistré — ${globalPaymentSelectedStore.name}`);

      setGlobalPaymentDialogOpen(false);
      setGlobalPaymentSelectedStore(null);
      setGlobalPaymentAmount('');
      setGlobalPaymentRemiseAmount('');
      setGlobalPaymentReference('');
      setGlobalPaymentMethod('cash');
      setGlobalPaymentCoffer('');

      // Refresh debts immediately so the table numbers update after Paiement Global Magasin
      await fetchDebts();

      // If user is currently on "Paiements Reçus", refresh it too to keep summary cards consistent
      if (activeTab === 'payments') {
        await fetchPaymentsReceived();
      }
    } catch (err: any) {
      console.error('handleStoreGlobalPayment error', err);
      toast.error(`Erreur: ${err?.message || 'inconnue'}`);
    } finally {
      setGlobalPaymentLoading(false);
    }
  };

  if (showDetails && selectedClient) {
    return (
      <ClientMagasinDetailsPage
        store={selectedClient}
        session={session}
        onBack={() => {
          setShowDetails(false);
          setSelectedClient(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview cards (similar to Clients ranking cards) */}
      <div className="flex flex-wrap w-full bg-white p-1 h-auto gap-1 border-b border-gray-200 rounded-lg">
        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-blue-50 border-b-2 border-blue-500 text-blue-600 flex-1 min-w-max">
          <Users className="w-5 h-5" />
          <span className="text-xs font-medium">Magasins</span>
          <span className="text-lg font-bold">{rows.length}</span>
        </div>

        <div className={`flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all ${totals.totalRest >= 0 ? 'bg-red-50 border-b-2 border-red-500 text-red-600' : 'bg-green-50 border-b-2 border-green-500 text-green-600'} flex-1 min-w-max`}>
          {totals.totalRest >= 0 ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
          <span className="text-xs font-medium">Solde Total</span>
          <span className="text-lg font-bold">{totals.totalRest.toFixed(2)} MAD</span>
        </div>
      </div>

      <Dialog
        open={globalPaymentDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setGlobalPaymentSelectedStore(null);
            setGlobalPaymentAmount('');
            setGlobalPaymentRemiseAmount('');
            setGlobalPaymentReference('');
            setGlobalPaymentMethod('cash');
            setGlobalPaymentCoffer('');
          }
          setGlobalPaymentDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="sticky top-0 bg-white z-10 pb-4">
            <DialogTitle>Paiement Global Magasin</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleStoreGlobalPayment} className="space-y-4 pb-4">
            {globalPaymentMethod === 'cash' && (
              <div className="space-y-2">
                <Label>Coffre (obligatoire pour espèces)</Label>
                <select
                  value={globalPaymentCoffer}
                  onChange={(e) => setGlobalPaymentCoffer(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="">-- Choisir un coffre --</option>
                  {coffers.map((c: any) => (
                    <option key={String(c.id ?? c.coffer_id)} value={String(c.id ?? c.coffer_id)}>
                      {String(c.name ?? c.id ?? c.coffer_id)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Magasin</Label>
              <select
                value={globalPaymentSelectedStore?.id || ''}
                onChange={(e) => {
                  const selected = rows.find((r: any) => String(r.id) === String(e.target.value));
                  setGlobalPaymentSelectedStore(selected || null);
                }}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">-- Sélectionner un magasin --</option>
                {rows.map((r: any) => (
                  <option key={String(r.id)} value={String(r.id)}>
                    {r.name}
                  </option>
                ))}
              </select>
              {globalPaymentSelectedStore && (
                <p className="text-xs text-gray-600">
                  Solde restant: {(Number(globalPaymentSelectedStore.remaining_balance || 0) || 0).toFixed(2)} MAD
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Montant à Payer</Label>
              <Input
                type="number"
                placeholder="Montant en MAD"
                value={globalPaymentAmount}
                onChange={(e) => setGlobalPaymentAmount(e.target.value)}
                step="0.01"
              />
            </div>

            <div className="space-y-2">
              <Label>Remise (MAD)</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={globalPaymentRemiseAmount}
                onChange={(e) => setGlobalPaymentRemiseAmount(e.target.value)}
                step="0.01"
              />
              <p className="text-xs text-gray-500">La remise s'affiche séparément dans la Caisse (non incluse dans le montant).</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mg_payment_method">Méthode de Paiement</Label>
              <select
                id="mg_payment_method"
                value={globalPaymentMethod}
                onChange={(e) => setGlobalPaymentMethod(e.target.value as any)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="cash">Espèces</option>
                <option value="check">Chèque</option>
                <option value="bank_transfer">Virement Bancaire</option>
                <option value="other">Autre</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label>Réf de Paiement (optionnel)</Label>
              <Input
                placeholder="Ex: REF-2026-001"
                value={globalPaymentReference}
                onChange={(e) => setGlobalPaymentReference(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setGlobalPaymentDialogOpen(false)}
                disabled={globalPaymentLoading}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={globalPaymentLoading || (globalPaymentMethod === 'cash' && !String(globalPaymentCoffer || '').trim())}>
                {globalPaymentLoading ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <CardTitle>Clients Magasins</CardTitle>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setGlobalPaymentDialogOpen(true);
                  }}
                  style={{ backgroundColor: '#10b981', color: 'white' }}
                  title="Paiement Global"
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Paiement Global
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setSortOrder((p) => (p === 'high-to-low' ? 'low-to-high' : 'high-to-low'))}
                  title="Trier par solde restant"
                >
                  {sortOrder === 'high-to-low' ? 'Solde: Élevé → Bas' : 'Solde: Bas → Élevé'}
                </Button>
                <Button variant="outline" onClick={fetchDebts}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Rafraîchir
                </Button>
              </div>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex gap-2 mt-4 border-b">
            <Button
              variant={activeTab === 'debts' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('debts')}
              className="rounded-b-none"
            >
              Dettes Magasins
            </Button>
            <Button
              variant={activeTab === 'payments' ? 'default' : 'ghost'}
              onClick={() => {
                setActiveTab('payments');
                fetchPaymentsReceived();
                fetchCoffers();
              }}
              className="rounded-b-none"
            >
              Paiements Reçus
            </Button>
          </div>

          {/* Summary for Payments Tab */}
          {activeTab === 'payments' && (
            <div className="flex flex-col gap-3 mt-4 pt-4 border-t">
              {String(session?.user?.user_metadata?.role || session?.user?.role || '').toLowerCase() === 'admin' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
                  <div className="lg:col-span-4 space-y-1">
                    <Label>Magasin</Label>
                    <select
                      value={paymentsStoreFilter}
                      onChange={(e) => {
                        setPaymentsStoreFilter(e.target.value);
                        setTimeout(() => fetchPaymentsReceived(), 0);
                      }}
                      className="w-full px-3 py-2 border rounded-md"
                    >
                      <option value="">Tous les magasins</option>
                      {rows.map((r: any) => (
                        <option key={String(r.id)} value={String(r.id)}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="lg:col-span-3 space-y-1">
                    <Label>Du</Label>
                    <Input
                      type="date"
                      value={paymentsDateFrom}
                      onChange={(e) => {
                        setPaymentsDateFrom(e.target.value);
                        setTimeout(() => fetchPaymentsReceived(), 0);
                      }}
                    />
                  </div>

                  <div className="lg:col-span-3 space-y-1">
                    <Label>Au</Label>
                    <Input
                      type="date"
                      value={paymentsDateTo}
                      onChange={(e) => {
                        setPaymentsDateTo(e.target.value);
                        setTimeout(() => fetchPaymentsReceived(), 0);
                      }}
                    />
                  </div>

                  <div className="lg:col-span-2 flex lg:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setPaymentsDateFrom('');
                        setPaymentsDateTo('');
                        setTimeout(() => fetchPaymentsReceived(), 0);
                      }}
                    >
                      Réinitialiser
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <div className="flex flex-col items-center gap-1 py-2 px-4 rounded-lg bg-blue-50 border border-blue-200 flex-1 min-w-max">
                <span className="text-xs font-medium text-blue-700">Paiements en Attente</span>
                <span className="text-lg font-bold text-blue-600">
                  {paymentsReceived.filter((p: any) => !p.__confirmed).length}
                </span>
              </div>
              <div className="flex flex-col items-center gap-1 py-2 px-4 rounded-lg bg-green-50 border border-green-200 flex-1 min-w-max">
                <span className="text-xs font-medium text-green-700">Montant en Attente</span>
                <span className="text-lg font-bold text-green-600">
                  {paymentsReceived
                    .filter((p: any) => !p.__confirmed)
                    .reduce((sum: number, p: any) => sum + (Number(p.amount || 0) || 0), 0)
                    .toFixed(2)} MAD
                </span>
              </div>
              <div className="flex flex-col items-center gap-1 py-2 px-4 rounded-lg bg-purple-50 border border-purple-200 flex-1 min-w-max">
                <span className="text-xs font-medium text-purple-700">Paiements Confirmés</span>
                <span className="text-lg font-bold text-purple-600">
                  {paymentsReceived.filter((p: any) => p.__confirmed).length}
                </span>
              </div>
              <div className="flex flex-col items-center gap-1 py-2 px-4 rounded-lg bg-orange-50 border border-orange-200 flex-1 min-w-max">
                <span className="text-xs font-medium text-orange-700">Montant Confirmé</span>
                <span className="text-lg font-bold text-orange-600">
                  {paymentsReceived
                    .filter((p: any) => p.__confirmed)
                    .reduce((sum: number, p: any) => sum + (Number(p.amount || 0) || 0), 0)
                    .toFixed(2)} MAD
                </span>
              </div>
            </div>
          </div>
          )}

          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              className="pl-10"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>

        <CardContent>
          {activeTab === 'debts' ? (
            <>
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : filteredRows.length === 0 ? (
                <p className="text-sm text-gray-600">Aucune donnée trouvée.</p>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nom</TableHead>
                        <TableHead className="text-right">Total Facturé</TableHead>
                        <TableHead className="text-right">Total Payé</TableHead>
                        <TableHead className="text-right">Solde Restant</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.map((r: any) => (
                        <TableRow key={String(r.id)}>
                          <TableCell className="font-semibold">{r.name}</TableCell>
                          <TableCell className="text-right">{(Number(r.total_transfers || 0) || 0).toFixed(2)} MAD</TableCell>
                          <TableCell className="text-right">{(Number(r.total_payments || 0) || 0).toFixed(2)} MAD</TableCell>
                          <TableCell className="text-right font-bold text-red-700">{(Number(r.remaining_balance || 0) || 0).toFixed(2)} MAD</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-blue-600 hover:text-blue-700"
                              title="Voir les détails"
                              onClick={() => {
                                setSelectedClient(r);
                                setShowDetails(true);
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          ) : (
            <>
              {paymentsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : paymentsReceived.length === 0 ? (
                <p className="text-sm text-gray-600">Aucun paiement reçu.</p>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Magasin</TableHead>
                        <TableHead>Référence</TableHead>
                        <TableHead className="text-right">Montant</TableHead>
                        <TableHead>Méthode</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentsReceived.map((p: any) => (
                        <TableRow key={String(p.id)}>
                          <TableCell className="font-semibold">{p.paid_by_store_name || p.store_id}</TableCell>
                          <TableCell>
                            <span>{p.reference_number || '-'}</span>
                          </TableCell>
                          <TableCell className="text-right font-bold">{(Number(p.amount || 0) || 0).toFixed(2)} MAD</TableCell>
                          <TableCell>{p.payment_method || '-'}</TableCell>
                          <TableCell>{new Date(p.payment_date).toLocaleDateString('fr-FR')}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${p.__confirmed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                              {p.__confirmed ? '✓ Confirmé' : 'En attente'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {['check', 'chèque', 'cheque'].includes(String(p.payment_method || '').toLowerCase().trim()) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    setSelectedPaymentForDetails(p);
                                    setPaymentDetailsDialogOpen(true);
                                    await loadPaymentDetails(p);
                                  }}
                                  title="Voir le détail des chèques"
                                >
                                  Voir
                                </Button>
                              )}

                              {!p.__confirmed && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSelectedPaymentToConfirm(p);
                                    setConfirmPaymentDialogOpen(true);
                                  }}
                                  style={{ backgroundColor: '#3b82f6', color: 'white' }}
                                >
                                  Confirmer
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Payment Details Dialog (cheques list) */}
      <Dialog
        open={paymentDetailsDialogOpen}
        onOpenChange={(open) => {
          setPaymentDetailsDialogOpen(open);
          if (!open) {
            setSelectedPaymentForDetails(null);
            setPaymentDetailsChecks([]);
            setPaymentDetailsLoading(false);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Détails du paiement (Chèques)</DialogTitle>
          </DialogHeader>

          {selectedPaymentForDetails && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg border">
                <div className="text-sm text-gray-700">Magasin: <span className="font-semibold">{selectedPaymentForDetails.paid_by_store_name || selectedPaymentForDetails.store_id}</span></div>
                <div className="text-sm text-gray-700">Référence: <span className="font-semibold">{selectedPaymentForDetails.reference_number || '-'}</span></div>
                <div className="text-sm text-gray-700">Montant (paiement): <span className="font-semibold">{(Number(selectedPaymentForDetails.amount || 0) || 0).toFixed(2)} MAD</span></div>
              </div>

              {paymentDetailsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : paymentDetailsChecks.length === 0 ? (
                <p className="text-sm text-gray-600">Aucun chèque lié à ce paiement (marker absent).</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-700">
                      Nombre de chèques: <span className="font-semibold">{paymentDetailsChecks.length}</span>
                    </div>
                    <div className="text-sm text-gray-700">
                      Total chèques: <span className="font-semibold">{paymentDetailsChecks.reduce((s: number, c: any) => s + (Number(c?.remaining_balance ?? c?.amount_value ?? 0) || 0), 0).toFixed(2)} MAD</span>
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
                        {paymentDetailsChecks.map((c: any) => {
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
                    Note: la liste est basée sur <code>check_inventory_ids</code> stocké dans les notes du paiement.
                  </p>
                </div>
              )}

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setPaymentDetailsDialogOpen(false)}>
                  Fermer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Payment Dialog */}
      <Dialog open={confirmPaymentDialogOpen} onOpenChange={setConfirmPaymentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmer le Paiement</DialogTitle>
          </DialogHeader>

          {selectedPaymentToConfirm && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-600">Magasin: <span className="font-semibold">{selectedPaymentToConfirm.paid_by_store_name}</span></p>
                <p className="text-sm text-gray-600">Montant: <span className="font-semibold">{(Number(selectedPaymentToConfirm.amount || 0) || 0).toFixed(2)} MAD</span></p>
                <p className="text-sm text-gray-600">Référence: <span className="font-semibold">{selectedPaymentToConfirm.reference_number || '-'}</span></p>
              </div>

              <div className="space-y-2">
                <Label>Sélectionner un Coffre</Label>
                <select
                  value={selectedCoffer}
                  onChange={(e) => setSelectedCoffer(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="">-- Choisir un coffre --</option>
                  {coffers.map((c: any) => (
                    <option key={String(c.id ?? c.coffer_id)} value={String(c.id ?? c.coffer_id)}>
                      {String(c.name ?? c.id ?? c.coffer_id)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setConfirmPaymentDialogOpen(false);
                    setSelectedPaymentToConfirm(null);
                    setSelectedCoffer('');
                  }}
                  disabled={confirmLoading}
                >
                  Annuler
                </Button>
                <Button
                  onClick={handleConfirmPayment}
                  disabled={confirmLoading || !selectedCoffer}
                  style={{ backgroundColor: '#10b981', color: 'white' }}
                >
                  {confirmLoading ? 'Confirmation...' : 'Confirmer'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
