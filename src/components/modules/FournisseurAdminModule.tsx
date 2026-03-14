import { useEffect, useMemo, useState } from 'react';
import { projectId } from '../../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { Building2, Download, Search, DollarSign, Eye } from 'lucide-react';
import { SupplierAdminPaymentsPage } from '../SupplierAdminPaymentsPage';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

interface FournisseurAdminModuleProps {
  session: any;
}

type TotalsRow = {
  admin_user_id: string;
  admin_email: string;
  total_facture: number;
  total_paye: number;
  solde_restant: number;
};

type GroupedPayment = {
  reference: string;
  payments: any[];
  totalAmount: number;
  firstDate: number;
  lastDate: number;
  confirmedCount: number;
  pendingCount: number;
};

export function FournisseurAdminModule({ session }: FournisseurAdminModuleProps) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TotalsRow[]>([]);
  const [search, setSearch] = useState('');

  // Paiement global (magasin -> fournisseur admin)
  const [globalPaymentDialogOpen, setGlobalPaymentDialogOpen] = useState(false);
  // Selected admin supplier (admin user)
  const [globalPaymentSelectedAdminId, setGlobalPaymentSelectedAdminId] = useState('');
  // Paying magasin (real stores.id)
  const [globalPaymentSelectedStoreId, setGlobalPaymentSelectedStoreId] = useState('');
  const [storesForPayment, setStoresForPayment] = useState<any[]>([]);
  const [globalPaymentAmount, setGlobalPaymentAmount] = useState('');
  const [globalPaymentRemiseAmount, setGlobalPaymentRemiseAmount] = useState('');
  const [globalPaymentReference, setGlobalPaymentReference] = useState('');
  const [globalPaymentMethod, setGlobalPaymentMethod] = useState<'cash' | 'check' | 'bank_transfer'>('cash');
  const [globalPaymentLoading, setGlobalPaymentLoading] = useState(false);
  const [coffers, setCoffers] = useState<any[]>([]);
  // Coffer selection is ADMIN-only. Managers/users do not select a coffer for Fournisseur Admin global payments.
  // Admin will choose the target coffer at confirmation time (Paiements Reçus).
  const [selectedCofferId, setSelectedCofferId] = useState<string>('main');
  const [checks, setChecks] = useState<any[]>([]);
  // Allow selecting multiple cheques for one payment
  const [selectedChecks, setSelectedChecks] = useState<any[]>([]);
  const [checkSearchQuery, setCheckSearchQuery] = useState('');

  // Sum selected cheques and autofill payment amount
  const getCheckAmount = (c: any) => {
    const amount = Number(c?.amount_value ?? c?.amount ?? 0) || 0;
    const remaining = c?.remaining_balance;
    // Prefer remaining_balance when present (partial usage)
    if (remaining === null || remaining === undefined || remaining === '') return amount;
    const rem = Number(remaining);
    return Number.isFinite(rem) ? rem : amount;
  };

  const selectedChecksSum = useMemo(() => {
    return (selectedChecks || []).reduce((sum: number, c: any) => sum + getCheckAmount(c), 0);
  }, [selectedChecks]);
  const [showCheckDialog, setShowCheckDialog] = useState(false);
  const [showCreateCheckDialog, setShowCreateCheckDialog] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCheckId, setUploadCheckId] = useState('');
  const [uploadAmount, setUploadAmount] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadGiverName, setUploadGiverName] = useState('');
  const [uploadCheckDate, setUploadCheckDate] = useState('');
  const [uploadExecutionDate, setUploadExecutionDate] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);

  // Current user's store_id from DB (more reliable than user_metadata)
  const [currentUserStoreId, setCurrentUserStoreId] = useState<string>('');

  // Make it behave like SuppliersModule (list -> details)
  const [showDetailsPage, setShowDetailsPage] = useState(false);
  const [detailsSupplier, setDetailsSupplier] = useState<any>(null);

  // Separate page: payments history for Paiement Global (Fournisseur Admin)
  const [showPaymentsPage, setShowPaymentsPage] = useState(false);
  const [paymentsAdmin, setPaymentsAdmin] = useState<{ adminUserId: string; adminEmail?: string } | null>(null);

  // ===== Paiements Reçus (Fournisseur Admin) =====
  const [paymentsReceived, setPaymentsReceived] = useState<any[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  // Filters
  const [paymentsAdminFilter, setPaymentsAdminFilter] = useState<string>('');
  const [paymentsDateFrom, setPaymentsDateFrom] = useState<string>('');
  const [paymentsDateTo, setPaymentsDateTo] = useState<string>('');

  // Payment reference -> cheques details dialog
  const [checksDialogOpen, setChecksDialogOpen] = useState(false);
  const [checksDialogRef, setChecksDialogRef] = useState<string>('');
  const [checksDialogChecks, setChecksDialogChecks] = useState<any[]>([]);
  const [checksDialogLoading, setChecksDialogLoading] = useState(false);

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

  const fetchPaymentsReceived = async () => {
    setPaymentsLoading(true);
    try {
      // For this page, payments are stored in the dedicated table `supplier_admin_global_payments`.
      // This avoids relying on parsing store_global_payments.notes.
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/supplier-admin-global-payments`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.error('Failed to fetch supplier-admin-global-payments (Paiements Reçus)', res.status, txt);
        setPaymentsReceived([]);
        return;
      }

      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data?.payments) ? data.payments : [];

      const inDateRange = (p: any) => {
        if (!paymentsDateFrom && !paymentsDateTo) return true;

        const raw = p?.payment_date || p?.created_at || null;
        const d = raw ? new Date(raw) : null;
        if (!d || Number.isNaN(d.getTime())) return false;

        if (paymentsDateFrom) {
          const from = new Date(paymentsDateFrom);
          from.setHours(0, 0, 0, 0);
          if (d < from) return false;
        }

        if (paymentsDateTo) {
          const to = new Date(paymentsDateTo);
          to.setHours(23, 59, 59, 999);
          if (d > to) return false;
        }

        return true;
      };

      const matchAdmin = (p: any) => {
        if (!paymentsAdminFilter) return true;
        return String(p?.admin_user_id || '').trim() === String(paymentsAdminFilter).trim();
      };

      const filtered = list
        .filter(matchAdmin)
        .filter(inDateRange)
        .map((p: any) => ({
          ...p,
          __fournisseur_admin_id: p?.admin_user_id || null,
          // Backend returns a deterministic confirmed boolean.
          __confirmed: Boolean(p?.confirmed),
        }))
        .sort((a: any, b: any) => {
          const da = a?.payment_date || a?.created_at || 0;
          const db = b?.payment_date || b?.created_at || 0;
          return new Date(db).getTime() - new Date(da).getTime();
        });

      setPaymentsReceived(filtered);
    } catch (e) {
      console.error('fetchPaymentsReceived error', e);
      setPaymentsReceived([]);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const loadChecksForReference = async (reference: string, paymentsForRef: any[]) => {
    setChecksDialogRef(reference);
    setChecksDialogOpen(true);
    setChecksDialogLoading(true);
    setChecksDialogChecks([]);

    try {
      const ids: string[] = [];
      for (const p of paymentsForRef) {
        const arr = Array.isArray(p?.check_inventory_ids) ? p.check_inventory_ids : [];
        ids.push(...arr.map((x: any) => String(x)));
      }
      const uniqueIds = Array.from(new Set(ids.map((x) => String(x).trim()).filter(Boolean)));

      if (uniqueIds.length === 0) {
        setChecksDialogChecks([]);
        return;
      }

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

  const paymentsByReference: GroupedPayment[] = useMemo(() => {
    const groups = new Map<string, GroupedPayment>();

    for (const p of paymentsReceived || []) {
      const ref = String(p?.reference_number || '').trim() || 'Sans Référence';
      const dRaw = p?.payment_date || p?.created_at || null;
      const d = dRaw ? new Date(dRaw).getTime() : 0;
      const amount = Number(p?.amount || 0) || 0;
      const confirmed = Boolean(p?.__confirmed);

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

    const out = Array.from(groups.values()).map((g) => ({
      ...g,
      firstDate: g.firstDate === Number.MAX_SAFE_INTEGER ? 0 : g.firstDate,
    }));

    out.sort((a, b) => (b.lastDate || 0) - (a.lastDate || 0));
    return out;
  }, [paymentsReceived]);

  const fetchTotals = async () => {
    setLoading(true);
    try {
      // In this page, we must list ADMIN users (admins are suppliers too).
      // We therefore build rows from:
      // - users(role='admin') => list
      // - for each admin, compute totals based on their store transfers/payments
      //   (fallback logic using sales TRANSFER-* and store_global_payments).

      // 1) Load all users then filter admins (existing endpoint returns all users for admin).
      const usersRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/users`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!usersRes.ok) {
        const txt = await usersRes.text().catch(() => '');
        console.error('Failed to fetch users', usersRes.status, txt);
        toast.error('Erreur lors du chargement des admins');
        setRows([]);
        return;
      }

      const usersData = await usersRes.json();

      // Capture current user's store_id (backend /users returns current user row for non-admin)
      const currentUserId = String(session?.user?.id || '');
      const me = (usersData.users || []).find((u: any) => String(u?.id) === currentUserId) || null;
      if (me?.store_id) setCurrentUserStoreId(String(me.store_id));

      const admins = (usersData.users || []).filter((u: any) => String(u?.role || '').toLowerCase() === 'admin');

      // Map admin user id -> admin user's store_id (if any)
      const adminStoreIdByUserId = new Map<string, string>();
      (usersData.users || []).forEach((u: any) => {
        if (!u?.id) return;
        const sid = u?.store_id ? String(u.store_id) : '';
        if (sid) adminStoreIdByUserId.set(String(u.id), sid);
      });

      // 2) Load admin supplier debts (per admin_user_id).
      const debtsRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/admin-supplier-debts`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!debtsRes.ok) {
        const txt = await debtsRes.text().catch(() => '');
        console.error('Failed to fetch admin-supplier-debts', debtsRes.status, txt);
        toast.error('Erreur lors du chargement des dettes fournisseurs admin');
        setRows([]);
        return;
      }

      const debtsData = await debtsRes.json();
      const debts = (debtsData?.debts || []) as TotalsRow[];
      const byAdminId = new Map<string, TotalsRow>();
      debts.forEach((d: any) => {
        if (!d?.admin_user_id) return;
        byAdminId.set(String(d.admin_user_id), {
          admin_user_id: String(d.admin_user_id),
          admin_email: String(d.admin_email || d.admin_user_id),
          total_facture: Number(d.total_facture || 0) || 0,
          total_paye: Number(d.total_paye || 0) || 0,
          solde_restant: Number(d.solde_restant || 0) || 0,
        });
      });

      const normalized: TotalsRow[] = admins.map((a: any) => {
        const aid = String(a.id);
        const totals = byAdminId.get(aid);
        return {
          admin_user_id: aid,
          admin_email: String(a.email || a.name || a.id),
          total_facture: Number(totals?.total_facture || 0) || 0,
          total_paye: Number(totals?.total_paye || 0) || 0,
          solde_restant: Number(totals?.solde_restant || 0) || 0,
          // keep store_id for payment resolution (non-breaking extra field)
          store_id: adminStoreIdByUserId.get(aid) || null,
        } as any;
      });

      setRows(normalized);
    } catch (e) {
      console.error('fetchTotals error', e);
      toast.error('Erreur lors du chargement');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTotals();
    fetchPaymentsReceived();

    // Load available coffers (admin-managed). Always includes 'main'.
      // NOTE: Only admins can choose a target coffer for Fournisseur Admin payments.
      // Managers/users should never see this selector.
      (async () => {
        try {
          const res = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/coffers`,
            { headers: { Authorization: `Bearer ${session.access_token}` } }
          );

          if (!res.ok) {
            const t = await res.text().catch(() => '');
            console.error('Failed to fetch coffers', res.status, t);
            setCoffers([]);
            return;
          }

          const data = await res.json().catch(() => ({}));
          const list = Array.isArray(data?.coffers) ? data.coffers : [];

          // Ensure main exists in UI list
          const hasMain = list.some((c: any) => String(c?.id) === 'main');
          const merged = hasMain ? list : [{ id: 'main', name: 'Coffre principal', is_active: true }, ...list];
          setCoffers(merged);

          // Keep selectedCofferId valid
          if (!merged.some((c: any) => String(c?.id) === String(selectedCofferId))) {
            setSelectedCofferId('main');
          }
        } catch (e) {
          console.error('Failed to fetch coffers', e);
          setCoffers([]);
        }
      })();

    // Load real magasins for Paiement Global.
    // IMPORTANT: FournisseurAdminModule rows use admin-user ids (not store ids),
    // so we must load stores separately to avoid FK errors on store_global_payments.
    (async () => {
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/stores`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        if (!res.ok) {
          const t = await res.text().catch(() => '');
          console.error('Failed to fetch stores for payment', res.status, t);
          setStoresForPayment([]);
          return;
        }

        const data = await res.json().catch(() => ({}));
        setStoresForPayment(Array.isArray(data?.stores) ? data.stores : []);
      } catch (e) {
        console.error('Failed to fetch stores for payment', e);
        setStoresForPayment([]);
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autofill payment amount when method is cheque and cheques are selected.
  // Do NOT overwrite if user manually typed a different amount after selecting.
  useEffect(() => {
    if (globalPaymentMethod !== 'check') return;
    if (!selectedChecks || selectedChecks.length === 0) return;

    const formatted = selectedChecksSum.toFixed(2);
    setGlobalPaymentAmount((prev) => {
      const prevNum = Number(String(prev || '').replace(',', '.'));
      // If empty or equals old selected sum -> update
      if (!String(prev || '').trim()) return formatted;
      if (Number.isFinite(prevNum) && Math.abs(prevNum - selectedChecksSum) < 0.000001) return formatted;
      // If user typed something else, keep it
      return prev;
    });
  }, [globalPaymentMethod, selectedChecksSum, selectedChecks]);

  // In this page, the "fournisseurs" are the ADMINS (users.role='admin').
  // We map each admin to his store and show totals per store.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
    const hay = `${r.admin_email || ''} ${r.admin_user_id || ''}`.toLowerCase();
    return hay.includes(q);
    });
  }, [rows, search]);

  const totals = useMemo(() => {
    const totalRemaining = filtered.reduce((sum, r) => sum + (Number(r.solde_restant) || 0), 0);
    const totalTransfers = filtered.reduce((sum, r) => sum + (Number(r.total_facture) || 0), 0);
    const totalPayments = filtered.reduce((sum, r) => sum + (Number(r.total_paye) || 0), 0);
    return { totalRemaining, totalTransfers, totalPayments };
  }, [filtered]);

  const formatMoney = (n: any) => `${(Number(n || 0) || 0).toFixed(2)} MAD`;

  const statusBadge = (remaining: number) => {
    if (remaining <= 0.000001) return <Badge className="bg-green-100 text-green-800">Soldé</Badge>;
    if (remaining > 0) return <Badge className="bg-red-100 text-red-800">En dette</Badge>;
    return <Badge variant="outline">-</Badge>;
  };

  const exportToExcel = () => {
    try {
      const safe = (v: any) => String(v ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            body{font-family:Arial,sans-serif;margin:18px;}
            .title{font-size:18px;font-weight:bold;text-align:center;margin-bottom:10px;}
            table{border-collapse:collapse;width:100%;}
            th,td{border:1px solid #e5e7eb;padding:8px;font-size:12px;}
            th{background:#2563eb;color:#fff;text-align:left;}
            tr:nth-child(even) td{background:#f9fafb;}
          </style>
        </head>
        <body>
          <div class="title">FOURNISSEUR ADMIN — PAIEMENTS REÇUS</div>
          <table>
            <thead>
              <tr>
                <th>Référence</th>
                <th>Montant Total</th>
                <th>Nombre de paiements</th>
                <th>Du</th>
                <th>Au</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              ${paymentsByReference
                .map((g) => {
                  const status = g.pendingCount > 0 ? 'En attente' : 'Confirmé';
                  const from = g.firstDate ? new Date(g.firstDate).toLocaleDateString('fr-FR') : '-';
                  const to = g.lastDate ? new Date(g.lastDate).toLocaleDateString('fr-FR') : '-';

                  return `
                    <tr>
                      <td>${safe(g.reference)}</td>
                      <td>${safe(formatMoney(g.totalAmount))}</td>
                      <td>${safe(String(g.payments.length))}</td>
                      <td>${safe(from)}</td>
                      <td>${safe(to)}</td>
                      <td>${safe(status)}</td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </body>
      </html>
      `;

      const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Fournisseur_Admin_Paiements_Recus_${new Date().toISOString().split('T')[0]}.xls`;
     document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Export Excel terminé');
    } catch (e) {
      console.error('exportToExcel error', e);
      toast.error("Erreur lors de l'export");
    }
  };

  const handleStoreGlobalPayment = async (e: React.FormEvent) => {
    e.preventDefault();

    // The UI selects the Fournisseur Admin (admin user)
    const adminUserId = String(globalPaymentSelectedAdminId || '').trim();
    const adminRow = (rows || []).find((r: any) => String(r.admin_user_id) === adminUserId) || null;

    // Determine paying magasin:
    // - magasin manager: must pay from his own store (no selector)
    // - admin: can choose any store (selector)
    const sessionRole = String(session?.user?.user_metadata?.role || '').toLowerCase();
    const isAdmin = sessionRole === 'admin';

    const sessionStoreId = String(currentUserStoreId || session?.user?.user_metadata?.store_id || '').trim();
    const chosenStoreId = String(globalPaymentSelectedStoreId || '').trim();

    const paidByStoreId = isAdmin ? chosenStoreId : sessionStoreId;
    const storeForPayment = (storesForPayment || []).find((s: any) => String(s?.id) === paidByStoreId) || null;
    const paidByStoreName = storeForPayment?.name ? String(storeForPayment.name) : null;

    void adminRow;
    const amount = Number(String(globalPaymentAmount || '').replace(',', '.'));
    const remiseAmount = Number(String(globalPaymentRemiseAmount || '').replace(',', '.'));

    if (!adminUserId) {
      toast.error('Veuillez sélectionner un fournisseur admin');
      return;
    }

    if (!paidByStoreId) {
      toast.error(isAdmin ? 'Veuillez sélectionner le magasin payeur' : 'Votre compte n\'a pas de magasin (store_id)');
      return;
    }

    if ((!Number.isFinite(amount) || amount <= 0) && (!Number.isFinite(remiseAmount) || remiseAmount <= 0)) {
      toast.error('Veuillez entrer un montant de paiement ou une remise');
      return;
    }

    setGlobalPaymentLoading(true);
    try {
      const paymentToSave = Math.max(0, Number(amount) || 0);
      let createdStoreGpId: string | null = null;

      const selectedCheckIds = (selectedChecks || [])
        .map((c: any) => c?.id)
        .filter((v: any) => v !== null && v !== undefined)
        .map((v: any) => String(v));

      // If amount is 0, we are doing a remise-only operation.
      // In that case we should NOT call /store-global-payments because backend requires amount > 0.
      if (paymentToSave > 0) {
        // 1) Create the store_global_payments movement (money out of caisse)
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/store-global-payments`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              store_id: paidByStoreId,
              paid_by_store_id: paidByStoreId,
              paid_by_store_name: paidByStoreName,
              amount: paymentToSave,
              payment_method: globalPaymentMethod,
              // Backend requires coffer_id for cash payments.
              // For magasin caisse flows we use a stable default bucket.
              // Coffer selection is ADMIN-only. For manager/user we DO NOT send coffer_id.
              // The admin will pick the target coffer when confirming the pending transfer.
              coffer_id: (String(session?.user?.user_metadata?.role || '').toLowerCase() === 'admin' && globalPaymentMethod === 'cash')
                ? (String(selectedCofferId || '').trim() || 'main')
                : null,
              payment_date: new Date().toISOString(),
              reference_number: String(globalPaymentReference || '').trim() || null,
              check_inventory_id:
                globalPaymentMethod === 'check'
                  ? (selectedCheckIds.length > 0 ? selectedCheckIds[0] : null)
                  : null,
              check_inventory_ids: globalPaymentMethod === 'check' ? selectedCheckIds : [],
              // No fournisseur-admin tags in notes anymore.
              notes: `Paiement global (Fournisseur Admin)`,
            }),
          }
        );

        if (!res.ok) {
          const t = await res.text().catch(() => '');
          console.error('store-global-payments failed', res.status, t);
          toast.error(`Erreur paiement: ${res.status}`);
          return;
        }

        const created = await res.json().catch(() => null);
        createdStoreGpId = created?.store_global_payment?.id || null;

        // 2) Create the supplier_admin_global_payments row (the real link to the admin supplier)
        const linkRes = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/supplier-admin-global-payments`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              admin_user_id: String(adminUserId),
              paid_by_store_id: String(paidByStoreId),
              store_global_payment_id: createdStoreGpId,
              amount: paymentToSave,
              payment_method: globalPaymentMethod,
              payment_date: new Date().toISOString(),
              reference_number: String(globalPaymentReference || '').trim() || null,
              notes: null,
              check_inventory_ids: globalPaymentMethod === 'check' ? selectedCheckIds : [],
            }),
          }
        );

        if (!linkRes.ok) {
          const t2 = await linkRes.text().catch(() => '');
          console.error('supplier-admin-global-payments failed', linkRes.status, t2);
          toast.error(`Erreur liaison paiement fournisseur admin: ${linkRes.status}`);
          return;
        }
      }

      // If a REMISE was provided, record it in discounts and link to this store_global_payments row.
      // This makes it display in Caisse as a separate “remise” line.
      const remiseToSave = Math.max(0, Number(remiseAmount) || 0);
      if (remiseToSave > 0) {
        try {
          const discountBody: any = {
            entity_type: 'store',
            entity_id: String(paidByStoreId),
            entity_name: String(paidByStoreName || paidByStoreId),
            discount_percentage: 0,
            discount_amount: remiseToSave,
            status: 'active',
            reason: `Remise via Paiement Global Fournisseur Admin | fournisseur_admin_id=${String(adminUserId)}${globalPaymentReference ? ` (ref: ${String(globalPaymentReference).trim()})` : ''}`,
          };

          if (createdStoreGpId) {
            // Remise is linked to the supplier_admin_global_payments row.
            // We keep `ref_id` unset here, because the backend will create/return
            // the supplier_admin_global_payments id.
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
      if (paymentToSave > 0) msgParts.push(`Paiement ${paymentToSave.toFixed(2)} MAD`);
      if (remiseToSave > 0) msgParts.push(`Remise ${remiseToSave.toFixed(2)} MAD`);
      toast.success(`✅ ${msgParts.join(' + ')} enregistré`);

      setGlobalPaymentDialogOpen(false);
      setGlobalPaymentSelectedAdminId('');
      setGlobalPaymentSelectedStoreId('');
      setGlobalPaymentAmount('');
      setGlobalPaymentRemiseAmount('');
      setGlobalPaymentReference('');
      setGlobalPaymentMethod('cash');
      setSelectedChecks([]);

      await fetchTotals();
    } catch (err: any) {
      console.error('handleStoreGlobalPayment error', err);
      toast.error(`Erreur: ${err?.message || 'inconnue'}`);
    } finally {
      setGlobalPaymentLoading(false);
    }
  };

  // Separate page: payments history
  if (showPaymentsPage && paymentsAdmin?.adminUserId) {
    return (
      <SupplierAdminPaymentsPage
        session={session}
        adminUserId={paymentsAdmin.adminUserId}
        adminEmail={paymentsAdmin.adminEmail}
        onBack={() => {
          setShowPaymentsPage(false);
          setPaymentsAdmin(null);
        }}
      />
    );
  }

  // Supplier details page removed for Fournisseur Admin flow.
  // We keep only payments/operations history here.

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Building2 className="w-6 h-6" />
              Fournisseur Admin (Total Facture)
            </h1>
            <p className="text-sm text-gray-600">Vue consolidée des dettes de tous les magasins (accrual).</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchTotals}>
              Rafraîchir
            </Button>
            <Button onClick={exportToExcel} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Download className="w-4 h-4 mr-2" />
              Export Excel
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <CardTitle>Paiements Reçus</CardTitle>
              <div className="flex gap-2">
                <Button
                  style={{ backgroundColor: '#10b981', color: 'white' }}
                  onClick={() => setGlobalPaymentDialogOpen(true)}
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Paiement Global
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    fetchPaymentsReceived();
                  }}
                  disabled={paymentsLoading}
                >
                  Appliquer
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end mb-4">
            <div className="lg:col-span-4 space-y-1">
              <label className="text-sm font-medium">Fournisseur Admin</label>
              <select
                value={paymentsAdminFilter}
                onChange={(e) => setPaymentsAdminFilter(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">Tous les fournisseurs admin</option>
                {(rows || [])
                  .slice()
                  .sort((a: any, b: any) => String(a?.admin_email || '').localeCompare(String(b?.admin_email || '')))
                  .map((r: any) => (
                    <option key={String(r.admin_user_id)} value={String(r.admin_user_id)}>
                      {String(r.admin_email || r.admin_user_id)}
                    </option>
                  ))}
              </select>
            </div>

            <div className="lg:col-span-3 space-y-1">
              <label className="text-sm font-medium">Du</label>
              <Input type="date" value={paymentsDateFrom} onChange={(e) => setPaymentsDateFrom(e.target.value)} />
            </div>

            <div className="lg:col-span-3 space-y-1">
              <label className="text-sm font-medium">Au</label>
              <Input type="date" value={paymentsDateTo} onChange={(e) => setPaymentsDateTo(e.target.value)} />
            </div>

            <div className="lg:col-span-2 flex lg:justify-end">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setPaymentsAdminFilter('');
                  setPaymentsDateFrom('');
                  setPaymentsDateTo('');
                }}
              >
                Réinitialiser
              </Button>
            </div>
          </div>

          {paymentsLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : paymentsByReference.length === 0 ? (
            <p className="text-sm text-gray-600">Aucun paiement reçu.</p>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
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
                  {paymentsByReference.map((g) => {
                    const status = g.pendingCount > 0 ? 'En attente' : 'Confirmé';

                    return (
                      <TableRow key={g.reference}>
                        <TableCell className="font-semibold">{g.reference}</TableCell>
                        <TableCell className="text-right font-bold">{formatMoney(g.totalAmount)}</TableCell>
                        <TableCell className="text-right">{g.payments.length}</TableCell>
                        <TableCell>{g.firstDate ? new Date(g.firstDate).toLocaleDateString('fr-FR') : '-'}</TableCell>
                        <TableCell>{g.lastDate ? new Date(g.lastDate).toLocaleDateString('fr-FR') : '-'}</TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold ${
                              status === 'Confirmé' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => loadChecksForReference(g.reference, g.payments)}
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

      {/* Paiement Global dialog */}
      <Card className="bg-white border border-gray-200">
        {/* Keep dialog markup close to where it is used to avoid extra dependencies */}
      </Card>

      {globalPaymentDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Paiement Global (Fournisseur Admin)</h2>
              <Button
                variant="outline"
                onClick={() => {
                  setGlobalPaymentDialogOpen(false);
                }}
              >
                Fermer
              </Button>
            </div>

            <form onSubmit={handleStoreGlobalPayment} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Fournisseur Admin</label>
                <select
                  value={globalPaymentSelectedAdminId}
                  onChange={(e) => setGlobalPaymentSelectedAdminId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="">-- Sélectionner un fournisseur admin --</option>
                  {(rows || [])
                    .slice()
                    .sort((a: any, b: any) => String(a?.admin_email || '').localeCompare(String(b?.admin_email || '')))
                    .map((r: any) => (
                      <option key={String(r.admin_user_id)} value={String(r.admin_user_id)}>
                        {String(r.admin_email || r.admin_user_id)}
                      </option>
                    ))}
                </select>
              </div>

              {String(session?.user?.user_metadata?.role || '').toLowerCase() === 'admin' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Magasin payeur</label>
                  <select
                    value={globalPaymentSelectedStoreId}
                    onChange={(e) => setGlobalPaymentSelectedStoreId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="">-- Sélectionner un magasin --</option>
                    {(storesForPayment || [])
                      .slice()
                      .sort((a: any, b: any) => String(a?.name || '').localeCompare(String(b?.name || '')))
                      .map((s: any) => (
                        <option key={String(s.id)} value={String(s.id)}>
                          {String(s.name || s.id)}
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-gray-500">Le paiement/remise est enregistré sur ce magasin (obligatoire).</p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Montant à Payer (MAD)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={globalPaymentAmount}
                  onChange={(e) => setGlobalPaymentAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Remise (MAD)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={globalPaymentRemiseAmount}
                  onChange={(e) => setGlobalPaymentRemiseAmount(e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-xs text-gray-500">La remise s'affiche séparément dans la Caisse (non incluse dans le montant).</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Méthode</label>
                <select
                  value={globalPaymentMethod}
                  onChange={(e) => setGlobalPaymentMethod(e.target.value as any)}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="cash">Espèces</option>
                  <option value="check">Chèque</option>
                  <option value="bank_transfer">Virement</option>
                </select>
              </div>

              {globalPaymentMethod === 'cash' && String(session?.user?.user_metadata?.role || '').toLowerCase() === 'admin' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Coffre cible</label>
                  <select
                    value={selectedCofferId}
                    onChange={(e) => setSelectedCofferId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    {(coffers || []).length === 0 ? (
                      <option value="main">Coffre principal</option>
                    ) : (
                      (coffers || []).map((c: any) => (
                        <option key={String(c.id)} value={String(c.id)}>
                          {String(c.name || c.id)}
                        </option>
                      ))
                    )}
                  </select>
                  <p className="text-xs text-gray-500">
                    Admin: sélectionnez le coffre. Le magasin ne choisit pas le coffre.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Référence <span className="text-red-500">*</span></label>
                <Input
                  value={globalPaymentReference}
                  onChange={(e) => setGlobalPaymentReference(e.target.value)}
                  placeholder="REF-..."
                  required
                />
                <p className="text-xs text-gray-500">Référence obligatoire pour tracer le paiement</p>
              </div>

              {globalPaymentMethod === 'check' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Chèque(s) <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await fetch(
                            `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory`,
                            {
                              headers: {
                                'Authorization': `Bearer ${session.access_token}`,
                              },
                            }
                          );
                          if (res.ok) {
                            const data = await res.json();
                            // Only show/select cheques that are NOT fully received/used.
                            // Keep: pending + partially_used (and a few legacy aliases)
                            // Hide: received/used/cashed/paid/etc.
                            const available = (data.check_inventory || []).filter((c: any) => {
                              const st = String(c?.status || '').toLowerCase().trim();
                              const remaining = Number(c?.remaining_balance ?? c?.remaining_amount ?? c?.remaining ?? c?.remaining_value ?? NaN);
                              const amount = Number(c?.amount_value ?? c?.amount ?? NaN);

                              const isPending = st === 'pending' || st === 'en attente' || st === 'available' || st === 'disponible' || st === '';
                              const isPartial = st === 'partially_used' || st === 'partial' || st === 'partiel' || st === 'partiellement_utilise' || st === 'partiellement_utilisé';

                              // Defensive: if status is unclear but remaining < amount, treat as partial.
                              const inferredPartial = Number.isFinite(remaining) && Number.isFinite(amount) && remaining > 0 && remaining < amount;

                              return isPending || isPartial || inferredPartial;
                            });
                            setChecks(available);
                            setShowCheckDialog(true);
                          }
                        } catch (error) {
                          toast.error('Erreur lors du chargement des chèques');
                        }
                      }}
                      className="flex-1"
                      style={{ backgroundColor: '#3b82f6', color: 'white' }}
                    >
                      🏦 Sélectionner des Chèques
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setShowCreateCheckDialog(true)}
                      className="flex-1"
                      style={{ backgroundColor: '#16a34a', color: 'white' }}
                    >
                      ➕ Créer un Chèque
                    </Button>
                  </div>
                  {selectedChecks.length > 0 && (
                    <div className="p-3 bg-green-50 border border-green-300 rounded-md space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-green-800">✓ {selectedChecks.length} chèque(s) sélectionné(s) — Total: {selectedChecksSum.toFixed(2)} MAD</p>
                        <button
                          type="button"
                          className="text-xs text-red-700 hover:underline"
                          onClick={() => {
                            setSelectedChecks([]);
                            // If amount currently equals selected sum, clear it too
                            setGlobalPaymentAmount((prev) => {
                              const prevNum = Number(String(prev || '').replace(',', '.'));
                              return Number.isFinite(prevNum) && Math.abs(prevNum - selectedChecksSum) < 0.000001 ? '' : prev;
                            });
                          }}
                        >
                          Vider
                        </button>
                      </div>
                      <div className="space-y-1">
                        {selectedChecks.slice(0, 5).map((c: any) => (
                          <div key={String(c?.id)} className="text-xs text-green-700 flex items-center justify-between gap-2">
                            <span>
                              ID: {c.check_id_number} | Montant: {c.remaining_balance || c.amount_value} MAD
                            </span>
                            <button
                              type="button"
                              className="text-xs text-red-700 hover:underline"
                              onClick={() => setSelectedChecks((prev: any[]) => prev.filter((x: any) => String(x?.id) !== String(c?.id)))}
                            >
                              Retirer
                            </button>
                          </div>
                        ))}
                        {selectedChecks.length > 5 && (
                          <p className="text-xs text-green-700">… +{selectedChecks.length - 5} autre(s)</p>
                        )}
                      </div>
                      <p className="text-xs text-green-700">
                        Les chèques seront liés via <code>check_inventory_ids</code> (notes). Le champ <code>check_inventory_id</code> garde le 1er chèque pour compatibilité.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={globalPaymentLoading}
                  onClick={() => setGlobalPaymentDialogOpen(false)}
                >
                  Annuler
                </Button>
                <Button 
                  type="submit" 
                  disabled={globalPaymentLoading || !globalPaymentReference.trim() || (globalPaymentMethod === 'check' && selectedChecks.length === 0)}
                >
                  {globalPaymentLoading ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Check Selection Dialog */}
      {showCheckDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-lg max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Sélectionner des Chèques</h2>
              <Button variant="outline" onClick={() => {
                setShowCheckDialog(false);
                setCheckSearchQuery('');
              }}>Fermer</Button>
            </div>

            <Input
              placeholder="Rechercher par ID, montant..."
              value={checkSearchQuery}
              onChange={(e) => setCheckSearchQuery(e.target.value)}
              className="mb-4"
              autoFocus
            />

            {checkSearchQuery.trim() === '' ? (
              <div className="text-center py-8 text-gray-500 space-y-2">
                <p>Tapez pour rechercher des chèques...</p>
                {selectedChecks.length > 0 && (
                  <p className="text-sm text-green-700">{selectedChecks.length} sélectionné(s)</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600">{selectedChecks.length} sélectionné(s)</p>
                  <button
                    type="button"
                    className="text-sm text-red-700 hover:underline"
                    onClick={() => {
                    setSelectedChecks([]);
                    // If amount currently equals selected sum, clear it too
                    setGlobalPaymentAmount((prev) => {
                    const prevNum = Number(String(prev || '').replace(',', '.'));
                    return Number.isFinite(prevNum) && Math.abs(prevNum - selectedChecksSum) < 0.000001 ? '' : prev;
                    });
                    }}
                    >
                    Vider
                    </button>
                </div>

                {checks
                  .filter((c: any) => {
                    const q = checkSearchQuery.toLowerCase();
                    const checkId = String(c.check_id_number || '').toLowerCase();
                    const amount = String(c.amount_value || '');
                    return checkId.includes(q) || amount.includes(q);
                  })
                  .length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>Aucun chèque trouvé pour "{checkSearchQuery}"</p>
                  </div>
                ) : (
                  checks
                    .filter((c: any) => {
                      const q = checkSearchQuery.toLowerCase();
                      const checkId = String(c.check_id_number || '').toLowerCase();
                      const amount = String(c.amount_value || '');
                      return checkId.includes(q) || amount.includes(q);
                    })
                    .map((check: any) => {
                      const isSelected = (selectedChecks || []).some((c: any) => String(c?.id) === String(check?.id));
                      return (
                        <button
                          type="button"
                          key={check.id}
                          onClick={() => {
                            setSelectedChecks((prev: any[]) => {
                              const exists = prev.some((c: any) => String(c?.id) === String(check?.id));
                              if (exists) return prev.filter((c: any) => String(c?.id) !== String(check?.id));
                              return [...prev, check];
                            });

                            // Autofill amount (best-effort) after toggling
                            setGlobalPaymentAmount((prev) => {
                              const prevNum = Number(String(prev || '').replace(',', '.'));
                              // If user already typed a custom amount, don't override
                              if (String(prev || '').trim() && Number.isFinite(prevNum) && Math.abs(prevNum - selectedChecksSum) > 0.000001) {
                                return prev;
                              }
                              // New sum will be computed by effect; if empty, set a quick preview
                              return String(prev || '').trim() ? prev : selectedChecksSum.toFixed(2);
                            });
                          }}
                          className={`w-full text-left p-3 border rounded-lg transition ${isSelected ? 'bg-green-50 border-green-400' : 'hover:bg-blue-50'}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-semibold">{check.check_id_number}</div>
                              <div className="text-sm text-gray-600">
                                {(() => {
                                  const st = String(check?.status || '').toLowerCase().trim();
                                  const amount = Number(check?.amount_value ?? 0) || 0;
                                  const remaining = Number(check?.remaining_balance ?? amount) || 0;

                                  const toStatusFr = (raw: any) => {
                                    const s = String(raw || '').toLowerCase().trim();
                                    // Most common check_inventory statuses in this project
                                    if (s === 'pending') return 'En attente';
                                    if (s === 'received') return 'Reçu';
                                    if (s === 'used') return 'Utilisé';
                                    if (s === 'archived') return 'Archivé';
                                    if (s === 'partly_used' || s === 'partially_used') return 'Partiellement utilisé';
                                    // Some legacy/alias values
                                    if (s === 'available') return 'Disponible';
                                    if (s === 'partial') return 'Partiellement utilisé';
                                    // If status already looks French, keep it
                                    if (s === 'en attente' || s === 'reçu' || s === 'utilisé' || s === 'archivé' || s.includes('partiel')) return String(raw);
                                    return String(raw || '-');
                                  };

                                  const isPartial = st === 'partially_used' || st === 'partly_used' || st === 'partial' || st === 'partiel' || (remaining > 0 && remaining < amount);
                                  const statusFr = toStatusFr(check?.status);

                                  if (isPartial) {
                                    return `Montant initial: ${amount} MAD | Reste: ${remaining} MAD | Statut: ${statusFr}`;
                                  }

                                  return `Montant: ${remaining || amount} MAD | Statut: ${statusFr}`;
                                })()}
                              </div>
                            </div>
                            <div className={`text-xs font-semibold px-2 py-1 rounded ${isSelected ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                              {isSelected ? 'Sélectionné' : 'Choisir'}
                            </div>
                          </div>
                        </button>
                      );
                    })
                )}

                <div className="flex justify-end gap-2 mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      // On close, sync payment amount with selected cheques total
                      if (globalPaymentMethod === 'check' && (selectedChecks || []).length > 0) {
                        setGlobalPaymentAmount(selectedChecksSum.toFixed(2));
                      }
                      setShowCheckDialog(false);
                      setCheckSearchQuery('');
                    }}
                  >
                    Terminer
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Check Dialog */}
      {showCreateCheckDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Créer un Nouveau Chèque</h2>
              <Button variant="outline" onClick={() => setShowCreateCheckDialog(false)}>Fermer</Button>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              setUploadLoading(true);

              try {
                const formData = new FormData();
                if (uploadFile) formData.append('file', uploadFile);
                formData.append('check_id_number', uploadCheckId);
                formData.append('amount_value', uploadAmount);
                formData.append('user_email', session?.user?.email || 'unknown');
                formData.append('notes', uploadNotes);
                formData.append('giver_name', uploadGiverName);
                formData.append('check_date', uploadCheckDate);
                formData.append('execution_date', uploadExecutionDate);

                const response = await fetch(
                  `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory/upload`,
                  {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${session.access_token}`,
                    },
                    body: formData,
                  }
                );

                if (response.ok) {
                  toast.success('Chèque créé avec succès');
                  setShowCreateCheckDialog(false);
                  setUploadFile(null);
                  setUploadCheckId('');
                  setUploadAmount('');
                  setUploadNotes('');
                  setUploadGiverName('');
                  setUploadCheckDate('');
                  setUploadExecutionDate('');

                  // Reload checks
                  const checksRes = await fetch(
                    `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory`,
                    {
                      headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                      },
                    }
                  );
                  if (checksRes.ok) {
                    const data = await checksRes.json();
                    setChecks(data.check_inventory || []);

                    // Try to auto-select the newly created cheque by its check_id_number
                    const createdNumber = String(uploadCheckId || '').trim();
                    const newlyCreated = (data.check_inventory || []).find((c: any) => String(c?.check_id_number || '').trim() === createdNumber);
                    if (newlyCreated) {
                      setSelectedChecks((prev: any[]) => {
                        const exists = prev.some((x: any) => String(x?.id) === String(newlyCreated?.id));
                        return exists ? prev : [...prev, newlyCreated];
                      });

                      // If paying by cheque, auto-fill the amount with the new sum
                      if (globalPaymentMethod === 'check') {
                        const sumAfter = (selectedChecks || []).reduce((s: number, c: any) => s + getCheckAmount(c), 0) + getCheckAmount(newlyCreated);
                        setGlobalPaymentAmount((prev) => {
                          const prevNum = Number(String(prev || '').replace(',', '.'));
                          if (!String(prev || '').trim()) return sumAfter.toFixed(2);
                          // If it was already following selection sum, update it
                          if (Number.isFinite(prevNum) && Math.abs(prevNum - selectedChecksSum) < 0.000001) return sumAfter.toFixed(2);
                          return prev;
                        });
                      }
                    }
                  }
                } else {
                  toast.error('Erreur lors de la création du chèque');
                }
              } catch (error) {
                toast.error('Erreur lors de la création du chèque');
              } finally {
                setUploadLoading(false);
              }
            }} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">ID du Chèque *</label>
                <Input
                  value={uploadCheckId}
                  onChange={(e) => setUploadCheckId(e.target.value)}
                  placeholder="Ex: CHK-001"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Montant *</label>
                <Input
                  type="number"
                  step="0.01"
                  value={uploadAmount}
                  onChange={(e) => setUploadAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Donné par</label>
                <Input
                  value={uploadGiverName}
                  onChange={(e) => setUploadGiverName(e.target.value)}
                  placeholder="Nom du donneur"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Date du Chèque</label>
                <Input
                  type="date"
                  value={uploadCheckDate}
                  onChange={(e) => setUploadCheckDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Date d'Exécution</label>
                <Input
                  type="date"
                  value={uploadExecutionDate}
                  onChange={(e) => setUploadExecutionDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Notes</label>
                <Input
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  placeholder="Notes supplémentaires"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Fichier (image/PDF)</label>
                <Input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={uploadLoading}
                  onClick={() => setShowCreateCheckDialog(false)}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={uploadLoading || !uploadCheckId || !uploadAmount}>
                  {uploadLoading ? 'Création...' : 'Créer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-800">Règles (supplier-admin)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-blue-700 space-y-2 text-sm">
            <p>• Les transferts (TRANSFER-*) augmentent la dette du magasin.</p>
            <p>• Les paiements (store_global_payments) réduisent la dette (et déduisent la caisse magasin par méthode).</p>
            <p>• Le solde peut devenir négatif (crédit).</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
