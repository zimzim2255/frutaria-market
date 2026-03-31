import { useEffect, useMemo, useState } from 'react';
import { projectId } from '../utils/supabase/info';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { DollarSign, Download, Eye, FileText, TrendingDown, TrendingUp, Wallet, X } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';

interface CashManagementPageProps {
  session: any;
}

interface ConfirmedPayment {
  id: string;
  date: string;
  store_id: string | null;
  /** Derived at render-time to avoid staleness when stores load later */
  store_name?: string;
  /** Payment amount ONLY (must never include remise/discount). */
  amount: number;
  /** Remise/discount applied for this movement (display-only, not included in amount). */
  remise_amount?: number;
  reason: string;
  source_type: 'invoice' | 'sale' | 'facture' | 'accrual' | string;
  source_id: string;
  payment_method: string;
  reference: string;
  client_name?: string;
  client_email?: string;
  created_by?: string | null;
  created_by_email?: string;
  additional_payments?: any;
  paid_by_checks?: boolean;
  amount_paid_by_checks?: number;
  checks_count?: number;
  check_ids_used?: string;
  bank_transfer_reference?: string;
  bank_transfer_date?: string;

  // For unpaid/partial documents summary
  total_amount?: number;
  amount_paid_total?: number;
  remaining_balance?: number;
  payment_status?: string;
}

const normalizeMethod = (m: any) => String(m ?? '').toLowerCase().trim();

export function CashManagementPage({ session }: CashManagementPageProps) {
  const [payments, setPayments] = useState<ConfirmedPayment[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [checkInventory, setCheckInventory] = useState<any[]>([]);

  // Large data handling for Caisse table
  const PAGE_SIZE = 50;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [stores, setStores] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [currentStore, setCurrentStore] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('user');
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStore, setFilterStore] = useState('all');

  // Enforce per-store caisse by default:
  // - Admin: defaults to their own store (if any). "Tous les magasins" is still available.
  // - Non-admin: always forced to their own store (filterStore is ignored downstream anyway).
  const applyDefaultStoreFilter = (role: string, storeId: string | null | undefined) => {
    const r = String(role || '').toLowerCase();
    const sid = storeId ? String(storeId) : '';
    if (!sid) return;
    if (r === 'admin') {
      setFilterStore(sid);
    }
  };
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<ConfirmedPayment | null>(null);
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Amount filter for table (Historique des Paiements Confirmés)
  const [amountFilter, setAmountFilter] = useState<'all' | 'negative' | 'positive' | 'credit'>('all');

  // Safe table sorting (Historique des Paiements Confirmés)
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
    if (userRole === 'admin') return true;
    return userPermissions.includes(permission);
  };

  // Export permission (legacy label in permissions list)
  const canExportCaisse =
    hasPermission('Exporter Caisse (CSV)') ||
    hasPermission('Exporter Caisse') ||
    hasPermission('Exporter Caisse (Excel)') ||
    hasPermission('Exporter Caisse (PDF)');

  const safeText = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const formatMoney = (n: any) => (Number(n || 0) || 0).toFixed(2);

  const downloadHtmlAsXls = (filename: string, html: string) => {
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportCaisseToExcel = () => {
    try {
      if (!canExportCaisse) {
        toast.error("Vous n'avez pas la permission d'export");
        return;
      }

      if (!filteredPayments || filteredPayments.length === 0) {
        toast.error('Aucune donnée à exporter');
        return;
      }

      const now = new Date();
      const datePart = now.toISOString().slice(0, 10);
      const storeTitle =
        userRole === 'admin'
          ? filterStore === 'all'
            ? 'Tous les magasins'
            : (stores.find((s) => s.id === filterStore)?.name || filterStore)
          : (currentStore?.name || 'Magasin');

      const title = `RAPPORT - CAISSE`;
      const subtitle = `Magasin: ${storeTitle} • Période: ${filterStartDate ? new Date(filterStartDate).toLocaleDateString('fr-FR') : '—'} → ${filterEndDate ? new Date(filterEndDate).toLocaleDateString('fr-FR') : '—'} • Export: ${now.toLocaleDateString('fr-FR')}`;

      const rowsHtml = filteredPayments
        .map((p) => {
          const isAccrual = String(p.source_type || '') === 'accrual';
          const creditAmount = isAccrual ? (Number(p.remaining_balance || 0) || 0) : 0;
          const displayAmount = isAccrual ? creditAmount : (Number(p.amount || 0) || 0);

          const dateStr = new Date(p.date).toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });

          const typeLabel = String(p.id || '').startsWith('supplier-passage-')
            ? 'Fournisseur Passage'
            : String(p.id || '').startsWith('client-global-') ||
                String(p.id || '').startsWith('supplier-global-') ||
                String(p.id || '').startsWith('supplier-payment-')
              ? 'Global'
              : safeText(
                  getSourceTypeLabel(
                    p.source_type === 'accrual' ? (String(p.reference || '').startsWith('BL') ? 'sale' : 'invoice') : p.source_type
                  )
                );

          const statusLabel = safeText(
            String(p.source_type || '') === 'accrual'
              ? (Number(p.amount_paid_total || 0) > 0 ? 'Crédit (Partiel)' : 'Crédit (Non payé)')
              : String(p.id || '').startsWith('supplier-passage-')
                ? 'Fournisseur Passage'
                : String(p.id || '').startsWith('client-global-') ||
                    String(p.id || '').startsWith('supplier-global-') ||
                    String(p.id || '').startsWith('supplier-payment-')
                  ? 'Global'
                  : 'Paiement'
          );

          const method = String(p.source_type || '') === 'accrual' ? '—' : safeText(p.payment_method || 'Non spécifié');

          return `
            <tr>
              <td>${safeText(dateStr)}</td>
              ${userRole === 'admin' ? `<td>${safeText(p.store_name || 'Non spécifié')}</td>` : ''}
              <td>${safeText(p.client_name || 'Non spécifié')}</td>
              <td>${safeText(p.reference || '—')}</td>
              <td style="text-align:right; ${isAccrual ? 'color:#be123c;' : displayAmount < 0 ? 'color:#dc2626;' : 'color:#16a34a;'}">
                ${formatMoney(displayAmount)}
              </td>
              <td>${safeText(p.reason || '')}</td>
              <td>${statusLabel}</td>
              <td>${typeLabel}</td>
              <td>${method}</td>
            </tr>
          `;
        })
        .join('');

      const htmlContent = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body { font-family: Arial, Helvetica, sans-serif; }
              .wrap { width: 100%; }
              .title { font-size: 18px; font-weight: 800; text-align: center; margin: 8px 0 4px; color: #0f172a; }
              .sub { font-size: 12px; text-align: center; margin-bottom: 12px; color: #334155; }
              .stats { width: 100%; border-collapse: collapse; margin: 10px 0 14px; }
              .stats td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 12px; }
              .stats .k { font-weight: 700; background: #f8fafc; width: 40%; }
              table { width: 100%; border-collapse: collapse; }
              th { background: #2563eb; color: white; font-weight: 700; font-size: 12px; padding: 8px; border: 1px solid #1d4ed8; }
              td { font-size: 12px; padding: 7px 8px; border: 1px solid #e2e8f0; }
              tr:nth-child(even) td { background: #f8fafc; }
            </style>
          </head>
          <body>
            <div class="wrap">
              <div class="title">${safeText(title)}</div>
              <div class="sub">${safeText(subtitle)}</div>

              <table class="stats">
                <tr>
                  <td class="k">Total encaissé (net)</td><td style="text-align:right;">${formatMoney(stats.totalAmount)} MAD</td>
                  <td class="k">Total dépensé</td><td style="text-align:right;">${formatMoney(stats.totalExpenses)} MAD</td>
                </tr>
                <tr>
                  <td class="k">Solde</td><td style="text-align:right;">${formatMoney(stats.balance)} MAD</td>
                  <td class="k">Total crédit</td><td style="text-align:right;">${formatMoney((stats as any).totalCredit)} MAD</td>
                </tr>
                <tr>
                  <td class="k">Espèces</td><td style="text-align:right;">${formatMoney(paymentMethodStats.cashAmount)} MAD</td>
                  <td class="k">Chèques</td><td style="text-align:right;">${formatMoney(paymentMethodStats.checkAmount)} MAD</td>
                </tr>
                <tr>
                  <td class="k">Virements</td><td style="text-align:right;">${formatMoney(paymentMethodStats.bankTransferAmount)} MAD</td>
                  <td class="k">Remises</td><td style="text-align:right;">${formatMoney(paymentMethodStats.remiseTotal)} MAD</td>
                </tr>
              </table>

              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    ${userRole === 'admin' ? '<th>Magasin</th>' : ''}
                    <th>Client</th>
                    <th>Référence</th>
                    <th>Montant</th>
                    <th>Raison</th>
                    <th>Statut</th>
                    <th>Type</th>
                    <th>Méthode</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>
          </body>
        </html>
      `;

      const filename = `Rapport_Caisse_${storeTitle.replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '_')}_${datePart}.xls`;
      downloadHtmlAsXls(filename, htmlContent);
      toast.success('Rapport Caisse (Excel) téléchargé');
    } catch (e) {
      console.error('Error exporting caisse Excel:', e);
      toast.error("Erreur lors de l'export Excel");
    }
  };

  const exportCaisseToPdf = () => {
    try {
      if (!canExportCaisse) {
        toast.error("Vous n'avez pas la permission d'export");
        return;
      }

      if (!filteredPayments || filteredPayments.length === 0) {
        toast.error('Aucune donnée à exporter');
        return;
      }

      const now = new Date();
      const datePart = now.toISOString().slice(0, 10);
      const storeTitle =
        userRole === 'admin'
          ? filterStore === 'all'
            ? 'Tous les magasins'
            : (stores.find((s) => s.id === filterStore)?.name || filterStore)
          : (currentStore?.name || 'Magasin');

      const title = `RAPPORT - CAISSE`;
      const subtitle = `Magasin: ${storeTitle} • Période: ${filterStartDate ? new Date(filterStartDate).toLocaleDateString('fr-FR') : '—'} → ${filterEndDate ? new Date(filterEndDate).toLocaleDateString('fr-FR') : '—'} • Export: ${now.toLocaleDateString('fr-FR')}`;

      const doc = new jsPDF({ orientation: 'landscape' });

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(title, 148.5, 14, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(subtitle, 148.5, 20, { align: 'center' });

      // Stats small table
      autoTable(doc, {
        startY: 26,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235] },
        head: [['Indicateur', 'Valeur', 'Indicateur', 'Valeur']],
        body: [
          ['Total encaissé (net)', `${formatMoney(stats.totalAmount)} MAD`, 'Total dépensé', `${formatMoney(stats.totalExpenses)} MAD`],
          ['Solde', `${formatMoney(stats.balance)} MAD`, 'Total crédit', `${formatMoney((stats as any).totalCredit)} MAD`],
          ['Espèces', `${formatMoney(paymentMethodStats.cashAmount)} MAD`, 'Chèques', `${formatMoney(paymentMethodStats.checkAmount)} MAD`],
          ['Virements', `${formatMoney(paymentMethodStats.bankTransferAmount)} MAD`, 'Remises', `${formatMoney(paymentMethodStats.remiseTotal)} MAD`],
        ],
      });

      const head = [
        'Date',
        ...(userRole === 'admin' ? ['Magasin'] : []),
        'Client',
        'Référence',
        'Montant',
        'Raison',
        'Statut',
        'Type',
        'Méthode',
      ];

      const body = filteredPayments.map((p) => {
        const isAccrual = String(p.source_type || '') === 'accrual';
        const creditAmount = isAccrual ? (Number(p.remaining_balance || 0) || 0) : 0;
        const displayAmount = isAccrual ? creditAmount : (Number(p.amount || 0) || 0);

        const dateStr = new Date(p.date).toLocaleDateString('fr-FR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });

        const typeLabel = String(p.id || '').startsWith('supplier-passage-')
          ? 'Fournisseur Passage'
          : String(p.id || '').startsWith('client-global-') ||
              String(p.id || '').startsWith('supplier-global-') ||
              String(p.id || '').startsWith('supplier-payment-')
            ? 'Global'
            : getSourceTypeLabel(
                p.source_type === 'accrual' ? (String(p.reference || '').startsWith('BL') ? 'sale' : 'invoice') : p.source_type
              );

        const statusLabel =
          String(p.source_type || '') === 'accrual'
            ? Number(p.amount_paid_total || 0) > 0
              ? 'Crédit (Partiel)'
              : 'Crédit (Non payé)'
            : String(p.id || '').startsWith('supplier-passage-')
              ? 'Fournisseur Passage'
              : String(p.id || '').startsWith('client-global-') ||
                  String(p.id || '').startsWith('supplier-global-') ||
                  String(p.id || '').startsWith('supplier-payment-')
                ? 'Global'
                : 'Paiement';

        const method = String(p.source_type || '') === 'accrual' ? '—' : String(p.payment_method || 'Non spécifié');

        const row: any[] = [
          dateStr,
          ...(userRole === 'admin' ? [String(p.store_name || 'Non spécifié')] : []),
          String(p.client_name || 'Non spécifié'),
          String(p.reference || '—'),
          `${formatMoney(displayAmount)} MAD`,
          String(p.reason || ''),
          statusLabel,
          typeLabel,
          method,
        ];

        return row;
      });

      const lastY = (doc as any).lastAutoTable?.finalY || 26;

      autoTable(doc, {
        startY: lastY + 6,
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235] },
        head: [head],
        body,
      });

      const safeStore = storeTitle.replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '_');
      doc.save(`Rapport_Caisse_${safeStore}_${datePart}.pdf`);
      toast.success('Rapport Caisse (PDF) téléchargé');
    } catch (e) {
      console.error('Error exporting caisse PDF:', e);
      toast.error("Erreur lors de l'export PDF");
    }
  };

  // Permission checks are string-based and historically had accent / spacing variants.
  // Normalize by accepting common legacy variants too.
  const canViewCaisse = hasPermission('Voir la Caisse');
  const canViewCashSpace = hasPermission("Voir l'Espace Caisse") || hasPermission('Voir Espace Caisse');

  const canViewPaymentDetails =
    hasPermission('Voir Détails Paiement (Caisse)') ||
    hasPermission('Voir Details Paiement (Caisse)') ||
    hasPermission('Voir Details Paiement Caisse') ||
    hasPermission('Voir Détails Paiement Caisse');

  const getStoreName = (storeId: string | null) => {
    if (!storeId) return 'Non spécifié';
    const store = stores.find((s) => s.id === storeId);
    return store?.name || storeId;
  };

  const getSourceTypeLabel = (sourceType: string) => {
    switch (sourceType) {
      case 'invoice':
        return 'Facture';
      case 'sale':
        return 'Vente';
      case 'facture':
        return 'Facture';
      default:
        return sourceType;
    }
  };

  // Fetch user role/permissions and current store
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/users`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) return;

        const data = await response.json();
        const currentUser = data.users?.find((u: any) => u.email === session.user?.email);

        if (!currentUser) return;

        setUserRole(currentUser.role || 'user');
        setUserPermissions(Array.isArray(currentUser.permissions) ? currentUser.permissions : []);

        if (!currentUser.store_id) return;

        // Default caisse to the user's own store (admin included) so nobody lands on a global caisse by accident.
        applyDefaultStoreFilter(currentUser.role || 'user', currentUser.store_id);

        // First try to use store data from user object if available
        if (currentUser.store) {
          setCurrentStore(currentUser.store);
          return;
        }

        // Otherwise fetch the store details
        try {
          const storesResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/stores`, {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          });

          if (!storesResponse.ok) {
            setCurrentStore({ id: currentUser.store_id, name: currentUser.store_id });
            return;
          }

          const storesData = await storesResponse.json();
          const userStore = storesData.stores?.find((s: any) => s.id === currentUser.store_id);
          if (userStore) {
            setCurrentStore(userStore);
          } else {
            setCurrentStore({ id: currentUser.store_id, name: currentUser.store_id });
          }
        } catch (error) {
          console.warn('Could not fetch store details:', error);
          setCurrentStore({ id: currentUser.store_id, name: currentUser.store_id });
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    fetchUserData();
  }, [session.access_token, session.user?.email]);

  // Fetch stores (needed to show store names)
  useEffect(() => {
    const fetchStores = async () => {
      try {
        const response = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/stores`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) return;

        const data = await response.json();
        const sortedStores = (data.stores || []).sort((a: any, b: any) => a.name.localeCompare(b.name));
        setStores(sortedStores);
      } catch (error) {
        console.error('Error fetching stores:', error);
      }
    };

    // Always load stores when the user can see the cash space.
    if (canViewCashSpace) {
      fetchStores();
    }
  }, [canViewCashSpace, session.access_token]);

  // Fetch expenses
  const fetchExpenses = async () => {
    try {
      // IMPORTANT:
      // The backend /caisse-expenses endpoint is store-scoped (admin defaults to their own store).
      // But this page supports "Filtrer par Magasin" for admin.
      // So when admin selects a magasin, we MUST pass ?store_id=... to fetch the right caisse movements.
      const params = new URLSearchParams();

      if (userRole === 'admin') {
        if (filterStore && filterStore !== 'all') {
          params.set('store_id', filterStore);
        }
      } else {
        if (currentStore?.id) {
          params.set('store_id', currentStore.id);
        }
      }

      const url = `https://${projectId}.supabase.co/functions/v1/super-handler/caisse-expenses${params.toString() ? `?${params.toString()}` : ''}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setExpenses(data.expenses || []);
      } else {
        setExpenses([]);
      }
    } catch (error) {
      console.error('Error fetching expenses:', error);
      setExpenses([]);
    }
  };

  // IMPORTANT: check-safe transfer should create a movement in `expenses`.
  // But in some deployments it doesn't, so we MUST still document the transfer in Caisse history.
  // We do it purely in frontend by comparing the "before" inventory snapshot with the "after".

  // We keep an in-memory snapshot for the current page session. This avoids timing issues
  // (state updates are async, so localStorage-only snapshots can miss transitions).
  const [checkInventorySnapshot, setCheckInventorySnapshot] = useState<any[]>([]);

  const buildSyntheticCheckTransfers = (prevList: any[], currList: any[]) => {
    try {
      const norm = (s: any) => String(s || '').trim();
      const toIso = (d: any) => {
        const dt = d ? new Date(d) : new Date();
        return Number.isFinite(dt.getTime()) ? dt.toISOString() : new Date().toISOString();
      };

      const getAmount = (c: any) => Number(c?.amount_value ?? c?.amount ?? c?.amount_total ?? c?.value ?? 0) || 0;
      const getTransferredFlag = (c: any) => {
        // support multiple deployments
        if (c?.transferred_to_safe === true) return true;
        if (c?.transferred === true) return true;
        const status = String(c?.status || '').toLowerCase();
        if (status === 'in_safe' || status === 'transferred') return true;
        const cofferId = String(c?.coffer_id || c?.cofferId || '').trim();
        if (cofferId) return true;
        return false;
      };

      const prevById = new Map<string, any>();
      (Array.isArray(prevList) ? prevList : []).forEach((c: any) => {
        const id = norm(c?.id);
        if (id) prevById.set(id, c);
      });

      const synthetic: ConfirmedPayment[] = [];

      (Array.isArray(currList) ? currList : []).forEach((curr: any) => {
        const id = norm(curr?.id);
        if (!id) return;

        const prev = prevById.get(id);
        if (!prev) return;

        const wasTransferred = getTransferredFlag(prev);
        const isTransferred = getTransferredFlag(curr);

        // Transfer detected: was NOT transferred, now transferred
        if (wasTransferred || !isTransferred) return;

        const amt = getAmount(prev) || getAmount(curr);
        if (!amt || amt <= 0) return;

        const date = toIso(curr?.updated_at || curr?.transferred_at || curr?.created_at || Date.now());

        const storeId = (() => {
          if (userRole === 'admin') {
            if (filterStore && filterStore !== 'all') return filterStore;
            return curr?.store_id || curr?.created_by_store_id || null;
          }
          return currentStore?.id || curr?.store_id || curr?.created_by_store_id || null;
        })();

        const checkIdNumber = String(curr?.check_id_number || curr?.checkId || curr?.reference || id);

        const cofferName = (() => {
          const cid = String(curr?.coffer_id || curr?.cofferId || '').trim();
          if (!cid) return 'Coffre';
          return cid === 'main' ? 'Coffre Principal' : `Coffre ${cid}`;
        })();

        synthetic.push({
          id: `caisse-out-synthetic-check-${id}-${date}`,
          date,
          store_id: storeId,
          amount: -Math.abs(amt),
          reason: `Transformation: Chèque → Coffre • Chèque ${checkIdNumber}`,
          source_type: 'facture',
          source_id: id,
          payment_method: 'check',
          reference: checkIdNumber,
          client_name: cofferName,
          client_email: '-',
          created_by: null,
          created_by_email: '—',
        });
      });

      return synthetic;
    } catch (e) {
      console.warn('[Caisse] could not build synthetic cheque transfers:', e);
      return [] as ConfirmedPayment[];
    }
  };

  const refreshCaisseSideData = async () => {
    // Capture "before" snapshot (current state) BEFORE fetching updated data
    const before = Array.isArray(checkInventory) ? checkInventory : [];
    setCheckInventorySnapshot(before);

    await Promise.all([fetchExpenses(), fetchCheckInventory()]);
  };

  // Fetch check inventory (needed for "🏦 Chèques" caisse bucket)
  const fetchCheckInventory = async () => {
    try {
      const params = new URLSearchParams();
      // keep scope aligned with UI selection
      if (userRole === 'admin') {
        if (filterStore !== 'all') params.set('store_id', filterStore);
      } else {
        if (currentStore?.id) params.set('store_id', currentStore.id);
      }

      const url = `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory${params.toString() ? `?${params.toString()}` : ''}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        setCheckInventory(Array.isArray((data as any)?.check_inventory) ? (data as any).check_inventory : []);
      } else {
        setCheckInventory([]);
      }
    } catch (error) {
      console.error('Error fetching check inventory:', error);
      setCheckInventory([]);
    }
  };

  useEffect(() => {
    if (session?.access_token) {
      fetchExpenses();
      fetchCheckInventory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.access_token, userRole, filterStore, currentStore?.id]);

  const CAISSE_AUDIT_EVENTS_KEY = 'caisse_audit_events_v1';

  const readCaisseAuditEvents = (): ConfirmedPayment[] => {
    try {
      const raw = localStorage.getItem(CAISSE_AUDIT_EVENTS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return [];
      return list
        .filter(Boolean)
        .map((e: any) => ({
          id: String(e?.id || ''),
          date: String(e?.date || new Date().toISOString()),
          store_id: e?.store_id ?? null,
          amount: Number(e?.amount || 0) || 0,
          reason: String(e?.reason || ''),
          source_type: 'facture',
          source_id: String(e?.source_id || e?.id || ''),
          payment_method: String(e?.payment_method || 'check'),
          reference: String(e?.reference || e?.id || ''),
          client_name: String(e?.client_name || 'Coffre'),
          client_email: '-',
          created_by: null,
          created_by_email: '—',
        }))
        .filter((e: any) => e.id && e.date);
    } catch {
      return [];
    }
  };

  // Fetch confirmed payments from all sources
  const fetchConfirmedPayments = async () => {
    try {
      // Ensure we have the latest expenses BEFORE building the payments list.
      // Otherwise caisse_out_* rows (versement au coffre) may not be reflected in the header/cards.
      await refreshCaisseSideData();

      setLoading(true);
      const allPayments: ConfirmedPayment[] = [];

      // Accumulate remises (discounts) by source so we can show them separately in Caisse.
      // We treat remises as NOT payments.
      const remiseBySource = {
        sale: new Map<string, number>(),
        invoice: new Map<string, number>(),
        client_global: new Map<string, number>(),
      };

      const addRemise = (type: keyof typeof remiseBySource, id: any, amount: any) => {
        const key = String(id || '').trim();
        if (!key) return;
        const n = Number(amount || 0) || 0;
        if (n <= 0) return;
        remiseBySource[type].set(key, (remiseBySource[type].get(key) || 0) + n);
      };

      // Fetch users first to map created_by UUIDs to emails
      let usersMap: { [key: string]: string } = {};
      try {
        const usersResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/users`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (usersResponse.ok) {
          const usersData = await usersResponse.json();
          const usersList = usersData.users || [];
          setUsers(usersList);

          usersList.forEach((user: any) => {
            if (user.id && user.email) {
              usersMap[user.id] = user.email;
            }
          });
        }
      } catch (error) {
        console.warn('Error fetching users:', error);
      }

      // Fetch remises from discounts table
      // NOTE: the backend schema differs across deployments.
      // For linking remises to global payments we accept ANY of:
      // - client_global_payment_id
      // - ref_table='client_global_payments' + ref_id
      // - ref_table='client_global_payments' + refId
      try {
        const discountsRes = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/discounts`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (discountsRes.ok) {
          const discountsData = await discountsRes.json();
          const discounts = discountsData.discounts || [];

          const inDateScope = (d: any) => {
            const dt = new Date(d?.created_at || d?.date || d?.payment_date || Date.now());
            if (filterStartDate) {
              const startDate = new Date(filterStartDate);
              startDate.setHours(0, 0, 0, 0);
              if (dt < startDate) return false;
            }
            if (filterEndDate) {
              const endDate = new Date(filterEndDate);
              endDate.setHours(23, 59, 59, 999);
              if (dt > endDate) return false;
            }
            return true;
          };

          discounts
            .filter((d: any) => String(d?.status || 'active').toLowerCase() === 'active')
            .filter(inDateScope)
            .forEach((d: any) => {
              const amount = Number(d?.discount_amount ?? d?.amount ?? 0) || 0;

              const entityType = String(d?.entity_type || '').trim().toLowerCase();
              const entityId = d?.entity_id || d?.entityId || d?.entity_id_uuid || null;

              const refTable = String(d?.ref_table || d?.refTable || '').trim().toLowerCase();
              const refId = d?.ref_id ?? d?.refId ?? d?.ref ?? d?.reference_id ?? null;

              const saleId = d?.sale_id || (refTable === 'sales' ? refId : null);
              const invoiceId = d?.invoice_id || (refTable === 'invoices' ? refId : null);
              const clientGlobalId =
                d?.client_global_payment_id ||
                d?.client_global_id ||
                // legacy linkage
                (refTable === 'client_global_payments' ? refId : null) ||
                null;

              if (saleId) addRemise('sale', saleId, amount);
              else if (invoiceId) addRemise('invoice', invoiceId, amount);
              else if (clientGlobalId) addRemise('client_global', clientGlobalId, amount);
              else if (entityType === 'customer' && entityId) {
                addRemise('client_global', `customer:${String(entityId)}`, amount);
              }

              // Magasin global payment remise: link by ref_table/ref_id (store_global_payments)
              if (refTable === 'store_global_payments' && refId) {
                addRemise('client_global', `store_global:${String(refId)}`, amount);
              }
            });
        }
      } catch (e) {
        console.warn('Could not fetch discounts for remise aggregation:', e);
      }

      // Fetch invoices
      try {
        const invoicesResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/invoices`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        // Fetch client global payments early so we can de-duplicate invoice/sale paid amounts.
        // Business rule: avoid double counting when a global payment is used to settle documents.
        // We do a best-effort match based on reference number appearing in notes/reference.
        const globalPaidByRef = new Map<string, number>();
        try {
          const params = new URLSearchParams();
          if (userRole === 'admin') {
            if (filterStore !== 'all') params.set('store_id', filterStore);
          } else {
            if (currentStore?.id) params.set('store_id', currentStore.id);
          }
          if (filterStartDate) params.set('start_date', filterStartDate);
          if (filterEndDate) params.set('end_date', filterEndDate);

          const qp = params.toString();
          const gpUrl = `https://${projectId}.supabase.co/functions/v1/super-handler/client-global-payments${qp ? `?${qp}` : ''}`;
          const gpRes = await fetch(gpUrl, { headers: { Authorization: `Bearer ${session.access_token}` } });
          if (gpRes.ok) {
            const gpData = await gpRes.json();
            const gps = gpData.client_global_payments || [];

            (gps || []).forEach((gp: any) => {
              const amount = Number(gp?.amount || 0) || 0;
              if (amount <= 0) return;

              const ref = String(gp?.reference_number || '').trim();
              const notes = String(gp?.notes || '').trim();

              // Heuristics: capture "Facture XXX" or "BL-XXX" if present in notes/reference.
              const text = `${ref} ${notes}`.toUpperCase();
              const possibleRefs = new Set<string>();

              const mInv = text.match(/(FACTURE\s+)?(F\-?\d+|FV\-?\d+|FAC\-?\d+|\d{2,})/);
              if (mInv && mInv[2]) possibleRefs.add(String(mInv[2]));

              const mBl = text.match(/(BL\-?\d+)/);
              if (mBl && mBl[1]) possibleRefs.add(String(mBl[1]));

              possibleRefs.forEach((r) => {
                const key = String(r).trim();
                if (!key) return;
                globalPaidByRef.set(key, (globalPaidByRef.get(key) || 0) + amount);
              });
            });
          }
        } catch {
          // best-effort only
        }

        if (invoicesResponse.ok) {
          const invoicesData = await invoicesResponse.json();
          const invoices = invoicesData.invoices || [];
          console.log('[Caisse] invoices fetched:', invoices.length);
          console.log('[Caisse] invoice numbers sample:', (invoices || []).slice(0, 10).map((i: any) => ({ id: i?.id, invoice_number: i?.invoice_number, amount_paid: i?.amount_paid, store_id: i?.store_id, created_at: i?.created_at, updated_at: i?.updated_at, paid_at: i?.paid_at, payment_method: i?.payment_method, status: i?.status, payment_status: i?.payment_status })));
          console.log('[Caisse] invoice store filter', { userRole, filterStore, currentStoreId: currentStore?.id });

          invoices.forEach((invoice: any) => {
            const total = Number(invoice.total_amount || 0) || 0;
            const paid = Number(invoice.amount_paid || 0) || 0;
            const remaining = Number(invoice.remaining_balance ?? Math.max(0, total - paid)) || 0;
            const status = String(invoice.status || invoice.payment_status || '').toLowerCase();

            // Actor
            const actorEmail = invoice.created_by ? (usersMap[invoice.created_by] || null) : null;
            const isByActor = !!actorEmail;

            // De-dup paid amount if we can detect that a client-global payment already covers it
            const invRef = String(invoice.invoice_number || '').trim();
            const globalPaid = invRef ? (globalPaidByRef.get(invRef) || 0) : 0;

            // 1) Paid part
            // Show the invoice payment line when invoice.amount_paid > 0.
            // This makes the invoice appear in "Historique des Paiements Confirmés".
            // Anti double-counting (Test 11) must be handled by totals logic, not by hiding the row.
            if (paid > 0) {
              console.log('[Caisse] pushing invoice paid row', { id: invoice?.id, invoice_number: invoice?.invoice_number, paid, store_id: invoice?.store_id, date: invoice?.paid_at || invoice?.updated_at || invoice?.created_at });
              allPayments.push({
                id: `invoice-${invoice.id}`,
                // Prefer paid_at/updated_at when available so the row appears when payment happens,
                // not only when the invoice was created.
                date: invoice.paid_at || invoice.updated_at || invoice.created_at,
                store_id: invoice.store_id,
                amount: paid,
                remise_amount: Number(remiseBySource.invoice.get(String(invoice.id)) || 0) || 0,
                reason: `Facture ${invoice.invoice_number}`,
                source_type: 'invoice',
                source_id: invoice.id,
                payment_method: invoice.payment_method || 'Non spécifié',
                reference: invoice.invoice_number,
                client_name: invoice.client_name || 'Non spécifié',
                client_email: invoice.client_email || 'Non spécifié',
                created_by: invoice.created_by,
                created_by_email: actorEmail || 'Non spécifié',
                total_amount: total,
                amount_paid_total: paid,
                remaining_balance: remaining,
                payment_status: status || undefined,
              });
            }

            // 2) Credit part (remaining)
            // Always show credit when there is remaining balance, even if created_by email isn't resolved.
            // Requirement: unpaid invoices must appear as credit in caisse.
            if (remaining > 0.000001) {
              allPayments.push({
                id: `invoice-accrual-${invoice.id}`,
                date: invoice.created_at,
                store_id: invoice.store_id,
                amount: 0,
                remise_amount: 0,
                reason: `Facture ${invoice.invoice_number} (Crédit)` ,
                source_type: 'accrual',
                source_id: invoice.id,
                payment_method: 'credit',
                reference: invoice.invoice_number,
                client_name: invoice.client_name || 'Non spécifié',
                client_email: invoice.client_email || 'Non spécifié',
                created_by: invoice.created_by,
                created_by_email: actorEmail || 'Non spécifié',
                total_amount: total,
                amount_paid_total: paid,
                remaining_balance: remaining,
                payment_status: status || undefined,
              });
            }
          });
        }
      } catch (error) {
        console.warn('Error fetching invoices:', error);
      }

      // Fetch sales
      try {
        const salesResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/sales`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (salesResponse.ok) {
          const salesData = await salesResponse.json();
          const sales = salesData.sales || [];

          sales.forEach((sale: any) => {
            const saleNumber = String(sale?.sale_number || '');
            const isBl = saleNumber.includes('BL-') || saleNumber.startsWith('BL');
            const isTransferOrPurchase = saleNumber.includes('TRANSFER-') || saleNumber.includes('PURCHASE-');

            const total = Number(sale.total_amount || 0) || 0;
            const paid = Number(sale.amount_paid || 0) || 0;
            const remaining = Number(sale.remaining_balance ?? Math.max(0, total - paid)) || 0;
            const status = String(sale.payment_status || '').toLowerCase();

            const actorEmail = sale.created_by ? (usersMap[sale.created_by] || null) : null;
            const isByActor = !!actorEmail;

            // Paid part
            // IMPORTANT:
            // A sale can have amount_paid > 0 due to a Client Global Payment application.
            // In that case we must NOT create a separate "Paiement" line in Caisse,
            // otherwise the original credit BL appears as if it was paid.
            const isPaidOnlyByGlobalPayment = (() => {
              try {
                // We only attempt this heuristic for client BL/sales (not PURCHASE/TRANSFER)
                if (isTransferOrPurchase) return false;

                const notes = String((sale as any)?.payment_notes_admin || (sale as any)?.payment_notes || (sale as any)?.notes || '').toLowerCase();
                // The ClientsModule writes: "Paiement global: XX.XX MAD"
                return notes.includes('paiement global');
              } catch {
                return false;
              }
            })();

            if (paid > 0 && !isPaidOnlyByGlobalPayment) {
              allPayments.push({
                id: `sale-${sale.id}`,
                date: sale.execution_date || sale.created_at,
                store_id: sale.store_id,
                // Keep source store id so Caisse can show TRANSFER/PURCHASE to BOTH magasins.
                source_store_id: (sale as any)?.source_store_id || null,
                amount: paid,
                remise_amount: Number(
                  sale.pending_discount ??
                    sale.remise_amount ??
                    sale.discount_amount ??
                    sale.remise ??
                    remiseBySource.sale.get(String(sale.id)) ??
                    0
                ) || 0,
                reason: `${isBl ? 'BL' : isTransferOrPurchase ? 'Opération' : 'Vente'} ${sale.sale_number}`,
                source_type: 'sale',
                source_id: sale.id,
                payment_method: sale.payment_method || 'Non spécifié',
                reference: sale.sale_number,
                client_name: sale.client_name || 'Non spécifié',
                client_email: sale.client_email || 'Non spécifié',
                created_by: sale.created_by,
                created_by_email: actorEmail || 'Non spécifié',
                total_amount: total,
                amount_paid_total: paid,
                remaining_balance: remaining,
                payment_status: status || undefined,
              } as any);
            }

            // Remaining (credit) part
            // IMPORTANT:
            // - For normal sales/BL we keep the old behavior (only show credit when actor is known).
            // - For TRANSFER/PURCHASE we ALWAYS show an accrual row when unpaid/partial,
            //   so Magasin A and Magasin B both see it in Caisse.
            const shouldShowAccrual = (remaining > 0.000001) && (isTransferOrPurchase || isByActor);

            if (shouldShowAccrual) {
              allPayments.push({
                id: `sale-accrual-${sale.id}`,
                date: sale.execution_date || sale.created_at,
                store_id: sale.store_id,
                // Keep source store id so Caisse can show TRANSFER/PURCHASE to BOTH magasins.
                source_store_id: (sale as any)?.source_store_id || null,
                amount: 0,
                remise_amount: 0,
                reason: `${isBl ? 'BL' : isTransferOrPurchase ? 'Opération' : 'Vente'} ${sale.sale_number} (Non payé)`,
                source_type: 'accrual',
                source_id: sale.id,
                payment_method: 'credit',
                reference: sale.sale_number,
                client_name: sale.client_name || 'Non spécifié',
                client_email: sale.client_email || 'Non spécifié',
                created_by: sale.created_by,
                created_by_email: actorEmail || 'Non spécifié',
                total_amount: total,
                amount_paid_total: paid,
                remaining_balance: remaining,
                payment_status: status || undefined,
              } as any);
            }
          });
        }
      } catch (error) {
        console.warn('Error fetching sales:', error);
      }

      // Supplier Payments (standard payments to suppliers)
      // IMPORTANT BUSINESS RULE:
      // - Normal supplier payments are COFFRE operations.
      // - They are logged in Coffre movements (expenses as coffer_out_*), NOT in Caisse.
      // Therefore: do NOT merge /payments rows into the Caisse history.
      if (false) {
        try {
          const params = new URLSearchParams();

          if (userRole === 'admin') {
            if (filterStore !== 'all') params.set('store_id', filterStore);
          } else {
            if (currentStore?.id) params.set('store_id', currentStore.id);
          }

          if (filterStartDate) params.set('start_date', filterStartDate);
          if (filterEndDate) params.set('end_date', filterEndDate);

          const spUrl = `https://${projectId}.supabase.co/functions/v1/super-handler/payments?${params.toString()}`;

          const spRes = await fetch(spUrl, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });

          if (spRes.ok) {
            const spData = await spRes.json();
            const supplierPayments = spData.payments || [];

            supplierPayments
              .filter((p: any) => String(p?.notes || '').toLowerCase().includes('paiement global'))
              .forEach((p: any) => {
                allPayments.push({
                  id: `supplier-payment-${p.id}`,
                  date: p.created_at,
                  store_id: p.store_id || null,
                  amount: Number(p.amount || 0) || 0,
                  reason: 'Paiement Global Fournisseur',
                  source_type: 'facture',
                  source_id: p.id,
                  payment_method: p.payment_method || 'Non spécifié',
                  reference: p.reference_number || p.id,
                  client_name: p.supplier_name || 'Fournisseur',
                  client_email: '-',
                  created_by: p.created_by || null,
                  created_by_email:
                    p.created_by_email || (p.created_by ? usersMap[p.created_by] || 'Non spécifié' : 'Non spécifié'),
                });
              });
          }
        } catch (e) {
          console.warn('Could not merge supplier payments into payments history:', e);
        }
      }

      // Supplier Passage operations are stored as expenses; include them in payments list for visibility
      // NOTE: `expenses` state comes from /caisse-expenses (cash space movements).
      // Le Charge (general expenses) are fetched separately below from /expenses.
      try {
        let filteredExpenses = expenses;

        if (userRole === 'admin') {
          if (filterStore !== 'all') {
            filteredExpenses = filteredExpenses.filter((e: any) => e.store_id === filterStore);
          }
        } else {
          filteredExpenses = filteredExpenses.filter((e: any) => e.store_id === currentStore?.id);
        }

        if (filterStartDate) {
          const startDate = new Date(filterStartDate);
          startDate.setHours(0, 0, 0, 0);
          filteredExpenses = filteredExpenses.filter((e: any) => new Date(e.created_at) >= startDate);
        }

        if (filterEndDate) {
          const endDate = new Date(filterEndDate);
          endDate.setHours(23, 59, 59, 999);
          filteredExpenses = filteredExpenses.filter((e: any) => new Date(e.created_at) <= endDate);
        }

        const norm = (s: any) => String(s || '').trim().toLowerCase();

        // Supplier Passage operations are special caisse movements.
        // IMPORTANT: we push ONLY ONE row per expense entry.
        // We use different `id` prefixes so later generic expense merge does not overwrite them.
        const passageExpenses = (filteredExpenses || []).filter((e: any) => {
          const t = norm(e?.expense_type);
          return t === 'supplier_passage' || t === 'supplier_passage_admin_in' || t === 'supplier_passage_correction_return' || t === 'supplier_passage_correction_add';
        });

        passageExpenses.forEach((e: any) => {
          const t = norm(e?.expense_type);
          const rawAmount = Number(e.amount || 0) || 0;

          // supplier_passage: always OUT (negative)
          // supplier_passage_admin_in: always IN (positive)
          // supplier_passage_correction_return: IN (positive) - money returns to payment method
          // supplier_passage_correction_add: OUT (negative) - money taken from caisse
          let signedAmount: number;
          let reasonText: string;
          let clientName: string;
          
          if (t === 'supplier_passage_admin_in') {
            signedAmount = Math.abs(rawAmount);
            reasonText = 'Entrée Admin (Passage)';
            clientName = 'Admin';
          } else if (t === 'supplier_passage_correction_return') {
            signedAmount = Math.abs(rawAmount); // Positive - money returned
            reasonText = 'Correction Passage: Retour';
            clientName = 'Fournisseur Passage';
          } else if (t === 'supplier_passage_correction_add') {
            signedAmount = -Math.abs(rawAmount); // Negative - money taken from caisse
            reasonText = 'Correction Passage: Ajout';
            clientName = 'Fournisseur Passage';
          } else {
            // supplier_passage (default)
            signedAmount = -Math.abs(rawAmount);
            reasonText = 'Fournisseur Passage';
            clientName = 'Fournisseur Passage';
          }

          allPayments.push({
            // Ensure unique ids so they don't de-dupe with generic `expense-*` entries.
            id: `supplier-passage-${e.id}`,
            date: e.created_at,
            store_id: e.store_id || null,
            amount: signedAmount,
            reason: e.reason || e.category || reasonText,
            source_type: 'facture',
            source_id: e.id,
            payment_method: 'cash',
            reference: e.id,
            client_name: clientName,
            client_email: '-',
            created_by: e.created_by || null,
            created_by_email: (() => {
              const direct = String(e.created_by_email || '').trim();
              if (direct) return direct;
              const byId = e.created_by ? String(usersMap[e.created_by] || '').trim() : '';
              return byId || 'Non spécifié';
            })(),
          });
        });

        // NOTE: Le Charge (general expenses) are fetched separately below from /expenses.
        // Do NOT push them from /caisse-expenses here, otherwise they will be duplicated.

        // Caisse OUT operations (mirror of "Ajouter un Versement au Coffre")
        // We show them in the caisse table so the user can see the deduction lines.
        const caisseOutTypes = new Set(['caisse_out_cash', 'caisse_out_check', 'caisse_out_bank_transfer']);
        const caisseOutExpenses = (filteredExpenses || []).filter((e: any) => caisseOutTypes.has(norm(e?.expense_type)));

        caisseOutExpenses.forEach((e: any) => {
          const m = norm(e?.expense_type);
          const method = m === 'caisse_out_cash' ? 'cash' : m === 'caisse_out_check' ? 'check' : 'bank_transfer';

          const amt = Number(e.amount || 0) || 0;
          const absAmt = Math.abs(amt);

          const baseReason = e.reason || 'Versement au Coffre';
          const reason =
            m === 'caisse_out_check'
              ? `${baseReason} (chèque)`
              : m === 'caisse_out_bank_transfer'
                ? `${baseReason} (virement)`
                : `${baseReason} (cash)`;

          // For clarity, show "Coffre" and include method in reason.
          allPayments.push({
            id: `caisse-out-${e.id}`,
            date: e.created_at,
            store_id: e.store_id || null,
            // Backend should save it negative so it shows as a deduction.
            // But enforce negative to guarantee it always appears as OUT in history.
            amount: amt > 0 ? -absAmt : amt,
            reason,
            source_type: 'facture',
            source_id: e.id,
            payment_method: method,
            reference: e.id,
            client_name: 'Coffre',
            client_email: '-',
            created_by: e.created_by || null,
            created_by_email: (() => {
              const direct = String(e.created_by_email || '').trim();
              if (direct) return direct;
              const byId = e.created_by ? String(usersMap[e.created_by] || '').trim() : '';
              return byId || 'Non spécifié';
            })(),
          });
        });

        // Client Global Payments
        try {
        const params = new URLSearchParams();
        
        if (userRole === 'admin') {
        if (filterStore !== 'all') params.set('store_id', filterStore);
        } else {
        if (currentStore?.id) params.set('store_id', currentStore.id);
        }
        
        if (filterStartDate) params.set('start_date', filterStartDate);
        if (filterEndDate) params.set('end_date', filterEndDate);
        
        const qp = params.toString();
        const gpUrl = `https://${projectId}.supabase.co/functions/v1/super-handler/client-global-payments${qp ? `?${qp}` : ''}`;
        
        const gpRes = await fetch(gpUrl, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        });
        
        if (gpRes.ok) {
        const gpData = await gpRes.json();
        const gps = gpData.client_global_payments || [];
        
        gps.forEach((gp: any) => {
        const storeId = gp.paid_by_store_id || gp.acted_as_store_id || null;
        
        // For caisse display we want the remise that happened with THIS payment.
        // Customer-wide remises (entity_type='customer') must not be attached here.
        const linkedRemise = Number(remiseBySource.client_global.get(String(gp.id)) || 0) || 0;
        
        // CLIENT global payments are INCOMING to caisse.
        allPayments.push({
        id: `client-global-${gp.id}`,
        date: gp.payment_date || gp.created_at,
        store_id: storeId,
        amount: Number(gp.amount || 0) || 0,
        remise_amount: linkedRemise,
        reason: 'Paiement Global Client',
        source_type: 'facture',
        source_id: gp.id,
        payment_method: gp.payment_method || 'Non spécifié',
        reference: gp.reference_number || gp.id,
        client_name: gp.client_name || gp.client?.name || 'Client',
        client_email: '-',
        created_by: gp.created_by || null,
        created_by_email: gp.created_by_email || 'Non spécifié',
        additional_payments: gp.additional_payments || null,
        bank_transfer_reference: gp.bank_transfer_reference || null,
        bank_transfer_date: gp.bank_transfer_date || null,
        paid_by_checks: gp.paid_by_checks || null,
        amount_paid_by_checks: gp.amount_paid_by_checks || null,
        checks_count: gp.checks_count || null,
        check_ids_used: gp.check_ids_used || null,
        });
        });
        }
        } catch (e) {
        console.warn('Could not merge client global payments into payments history:', e);
        }
        
        // Store Global Payments (Magasins)
        // IMPORTANT BUSINESS RULE (per your requirement “each one has his own caisse”):
        // - store_global_payments is ALWAYS cash OUT for the payer caisse (paid_by_store_id)
        //   because it represents money that left that payer.
        // - When admin performs a magasin payment but we want it to be + in admin caisse, the backend
        //   must record it with paid_by_store_id = admin.store_id (admin caisse store).
        // So the UI does NOT invent signs. It simply shows cash OUT for the returned payer.
        try {
        const params = new URLSearchParams();
        
        if (userRole === 'admin') {
        // admin defaults to own caisse (filterStore is set to own store_id); still keep “all” option.
        if (filterStore !== 'all') params.set('store_id', filterStore);
        } else {
        if (currentStore?.id) params.set('store_id', currentStore.id);
        }
        
        if (filterStartDate) params.set('start_date', filterStartDate);
        if (filterEndDate) params.set('end_date', filterEndDate);
        
        const qp = params.toString();
        const sgpUrl = `https://${projectId}.supabase.co/functions/v1/super-handler/store-global-payments${qp ? `?${qp}` : ''}`;
        
        const sgpRes = await fetch(sgpUrl, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        });
        
        if (sgpRes.ok) {
        const sgpData = await sgpRes.json();
        const sGps = sgpData.store_global_payments || [];
        
        sGps.forEach((gp: any) => {
        const payerStoreId = gp.paid_by_store_id || null;

        const rawAmount = Number(gp.amount || 0) || 0;
        // Sign rule:
        // - If backend marked it as an admin-executed magasin payment, it is cash IN for admin caisse.
        // - Otherwise, it's cash OUT for the payer (magasin).
        // store_global_payments always represents money OUT of the payer caisse.
        // The credit/debit of the coffer/caisse is represented separately by `expenses` rows.
        const signedAmount = -Math.abs(rawAmount);

        // Link remise to this specific payment (like client-global). We stored it in discounts with:
        // ref_table='store_global_payments' and ref_id = gp.id
        const linkedRemise = Number(remiseBySource.client_global.get(`store_global:${String(gp.id)}`) || 0) || 0;

        // Display target magasin name if available (store_id), otherwise fallback to payer.
        const targetName = gp.store_name || gp.store?.name || null;
        const payerName = gp.paid_by_store_name || payerStoreId || null;

        const notesStr = String(gp?.notes || '');
        const isFournisseurAdminFlow = notesStr.includes('fournisseur_admin_id=');

        // NOTE: do not list store_global_payments as a caisse movement.
        // The caisse impact is represented by `expenses` rows (e.g. caisse_out_cash) which we already include.
        // Keeping this would duplicate the operation in the caisse history.
        if (false) {
          allPayments.push({
          id: `store-global-${gp.id}`,
          date: gp.payment_date || gp.created_at,
          store_id: payerStoreId,
          amount: signedAmount,
          remise_amount: linkedRemise,
          reason: isFournisseurAdminFlow ? 'Fournisseur Admin (Total Facture)' : 'Paiement Global Magasin',
          source_type: 'facture',
          source_id: gp.id,
          payment_method: gp.payment_method || 'Non spécifié',
          reference: gp.reference_number || gp.id,
          // “Client” column: show the target magasin if present; otherwise show payer.
          client_name: targetName || payerName || 'Magasin',
          client_email: '-',
          created_by: gp.created_by || null,
          created_by_email: gp.created_by_email || 'Non spécifié',
          });
        }
        });
        }
        } catch (e) {
        console.warn('Could not merge store global payments into payments history:', e);
        }

        // Le Charge (general expenses) must appear in caisse history as cash-only deductions.
        // These expenses are stored in /expenses (not /caisse-expenses), so fetch them explicitly.
        try {
        const params = new URLSearchParams();
        
        if (userRole === 'admin') {
        if (filterStore !== 'all') params.set('store_id', filterStore);
        } else {
        if (currentStore?.id) params.set('store_id', currentStore.id);
        }
        
        if (filterStartDate) params.set('start_date', filterStartDate);
        if (filterEndDate) params.set('end_date', filterEndDate);
        
        const expUrl = `https://${projectId}.supabase.co/functions/v1/super-handler/expenses?${params.toString()}`;
        const expRes = await fetch(expUrl, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        });
        
        if (expRes.ok) {
        const expData = await expRes.json();
        const rows = expData.expenses || [];
        
        const norm = (s: any) => String(s || '').trim().toLowerCase();
        const caisseOutTypes = new Set(['caisse_out_cash', 'caisse_out_check', 'caisse_out_bank_transfer']);
        const cofferDepositTypes = new Set(['coffer_deposit_cash', 'coffer_deposit_check', 'coffer_deposit_bank_transfer']);
        
        rows.forEach((e: any) => {
        const t = norm(e?.expense_type);
        const reasonTxt = String(e?.reason || '').toLowerCase();
        
        // keep Le Charge only; exclude special flows
        if (t === 'supplier_passage' || t === 'supplier_passage_admin_in') return;
        if (t === 'supplier_passage_correction_return' || t === 'supplier_passage_correction_add') return;
        if (caisseOutTypes.has(t)) return;
        if (cofferDepositTypes.has(t)) return;

        // EXCLUDE: normal supplier operations are COFFRE movements.
        // Some deployments still store them inside `expenses` with store_id, which makes them look like caisse expenses.
        // Do NOT show them in Caisse history.
        if (t.startsWith('coffer_') || t.startsWith('coffre_')) return;
        if (reasonTxt.includes('avance fournisseur') || reasonTxt.includes('paiement global fournisseur')) return;
        
        const amt = Math.abs(Number(e?.amount || 0) || 0);
        if (amt <= 0) return;
        
        allPayments.push({
        id: `expense-${e.id}`,
        date: e.payment_date || e.created_at,
        store_id: e.store_id || null,
        amount: -amt,
        reason: e.reason || e.category || 'Dépense',
        source_type: 'facture',
        source_id: e.id,
        payment_method: 'cash',
        reference: e.id,
        client_name: 'Dépense',
        client_email: '-',
        created_by: e.created_by || null,
        created_by_email: (() => {
        const direct = String(e.created_by_email || '').trim();
        if (direct) return direct;
        const byId = e.created_by ? String(usersMap[e.created_by] || '').trim() : '';
        return byId || 'Non spécifié';
        })(),
        });
        });
        }
        } catch (e) {
        console.warn('Could not merge Le Charge expenses into caisse history:', e);
        }
        
        // Supplier Advances
        // IMPORTANT BUSINESS RULE:
        // - Normal supplier advances are COFFRE operations.
        // - They are logged in Coffre movements (expenses as coffer_out_*), NOT in Caisse.
        // Therefore: do NOT merge /supplier-advances rows into the Caisse history.
        if (false) {
          try {
            const params = new URLSearchParams();

            if (userRole === 'admin') {
              if (filterStore !== 'all') params.set('store_id', filterStore);
            } else {
              if (currentStore?.id) params.set('store_id', currentStore.id);
            }

            const saUrl = `https://${projectId}.supabase.co/functions/v1/super-handler/supplier-advances?${params.toString()}`;
            const saRes = await fetch(saUrl, {
              headers: { Authorization: `Bearer ${session.access_token}` },
            });

            if (saRes.ok) {
              const saData = await saRes.json();
              const advances = saData.advances || [];

              const supplierNameById = new Map<string, string>();
              try {
                const suppliersRes = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/suppliers`, {
                  headers: { Authorization: `Bearer ${session.access_token}` },
                });
                if (suppliersRes.ok) {
                  const supData = await suppliersRes.json();
                  (supData.suppliers || []).forEach((s: any) => {
                    if (s?.id) supplierNameById.set(String(s.id), String(s.name || 'Fournisseur'));
                  });
                }
              } catch {
                // ignore enrichment errors
              }

              const startDate = filterStartDate ? new Date(filterStartDate) : null;
              if (startDate) startDate.setHours(0, 0, 0, 0);
              const endDate = filterEndDate ? new Date(filterEndDate) : null;
              if (endDate) endDate.setHours(23, 59, 59, 999);

              const filteredAdvances = (advances || []).filter((a: any) => {
                const d = new Date(a.created_at);
                if (startDate && d < startDate) return false;
                if (endDate && d > endDate) return false;
                return true;
              });

              filteredAdvances.forEach((a: any) => {
                const method = String(a.payment_method || '').toLowerCase().trim();
                const isCheque = method === 'check' || method === 'cheque' || method === 'chèque';

                allPayments.push({
                  id: `supplier-global-${a.id}`,
                  date: a.created_at,
                  store_id: a.store_id || null,
                  amount: isCheque ? 0 : -Math.abs(Number(a.amount || 0) || 0),
                  reason: 'Paiement Global Fournisseur',
                  source_type: 'facture',
                  source_id: a.id,
                  payment_method: a.payment_method || 'Non spécifié',
                  reference: a.reference_number || a.id,
                  client_name: supplierNameById.get(String(a.supplier_id)) || 'Fournisseur',
                  client_email: '-',
                  created_by: a.created_by || null,
                  created_by_email: a.created_by_email || 'Non spécifié',
                  bank_transfer_reference: a.bank_transfer_reference || null,
                  bank_transfer_date: a.bank_transfer_date || null,
                });
              });
            }
          } catch (e) {
            console.warn('Could not merge supplier advances into payments history:', e);
          }
        }
      } catch (e) {
        console.warn('Could not merge supplier passage expenses into payments history:', e);
      }

      // Add synthetic cheque->coffre transfers if backend didn't log them.
      // Use the in-memory "before" snapshot captured right before refresh.
      const before = Array.isArray(checkInventorySnapshot) ? checkInventorySnapshot : [];
      const after = Array.isArray(checkInventory) ? checkInventory : [];
      const syntheticTransfers = buildSyntheticCheckTransfers(before, after);

      // Also merge local audit events (fallback if backend rejected caisse-expenses).
      const auditEvents = readCaisseAuditEvents();

      // De-duplicate by id
      const byId = new Map<string, ConfirmedPayment>();
      [...allPayments, ...syntheticTransfers, ...auditEvents].forEach((p) => {
        if (p?.id) byId.set(String(p.id), p);
      });

      const merged = Array.from(byId.values());
      console.log('[Caisse] merged payments before store/date filtering:', merged.length);
      const previewInvoiceRows = merged.filter((p: any) => String(p?.id || '').startsWith('invoice-') || String(p?.id || '').startsWith('invoice-accrual-'));
      console.log('[Caisse] merged invoice rows (paid/accrual):', previewInvoiceRows.length, previewInvoiceRows.slice(0, 10).map((p: any) => ({ id: p.id, store_id: p.store_id, amount: p.amount, remaining_balance: p.remaining_balance, reference: p.reference, reason: p.reason })));
      merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setPayments(merged);
    } catch (error) {
      console.error('Error fetching confirmed payments:', error);
      toast.error('Erreur lors du chargement des paiements');
    } finally {
      setLoading(false);
    }
  };

  // Important: do NOT refetch all payments on every expenses refresh.
  useEffect(() => {
    if (session?.access_token) {
      fetchConfirmedPayments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.access_token, userRole, filterStore, currentStore?.id, filterStartDate, filterEndDate, expenses.length]);

  // Reset progressive rendering when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole, filterStore, currentStore?.id, filterStartDate, filterEndDate]);

  const filteredPayments = useMemo(() => {
    let filtered = payments;

    // Filter by store
    // IMPORTANT REQUIREMENT:
    // Invoices must always be visible in Caisse history even if legacy rows have missing/incorrect store_id.
    // So we DO NOT apply store filtering to invoice rows (invoice-*, invoice-accrual-*).
    // All other movements remain strictly store-scoped.
    const isInvoiceRow = (p: any) => {
      const id = String(p?.id || '');
      return id.startsWith('invoice-') || id.startsWith('invoice-accrual-');
    };

    if (userRole === 'admin') {
      if (filterStore !== 'all') {
        filtered = filtered.filter((p) => {
          if (isInvoiceRow(p)) return true;

          // Transfers/Purchases should be visible for BOTH magasins even in admin view
          // (when admin selects a magasin).
          const ref = String(p?.reference || '');
          const isTransferOrPurchase = ref.includes('TRANSFER-') || ref.includes('PURCHASE-');

          if (!isTransferOrPurchase) return p.store_id === filterStore;

          const dst = p.store_id;
          const src = (p as any)?.source_store_id;
          return dst === filterStore || src === filterStore;
        });
      }
    } else {
      // Non-admin: still restrict other movements, but keep invoice rows visible.
      filtered = filtered.filter((p) => {
        if (isInvoiceRow(p)) return true;

        // Transfers/Purchases should be visible for BOTH magasins:
        // - destination store_id
        // - OR source_store_id (persisted on sales rows)
        const ref = String(p?.reference || '');
        const isTransferOrPurchase = ref.includes('TRANSFER-') || ref.includes('PURCHASE-');

        if (!isTransferOrPurchase) return p.store_id === currentStore?.id;

        const dst = p.store_id;
        const src = (p as any)?.source_store_id;
        return dst === currentStore?.id || src === currentStore?.id;
      });
    }

    // Filter by date range
    if (filterStartDate) {
      const startDate = new Date(filterStartDate);
      startDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter((p) => new Date(p.date) >= startDate);
    }

    if (filterEndDate) {
      const endDate = new Date(filterEndDate);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter((p) => new Date(p.date) <= endDate);
    }

    // Filter by amount sign / credit (apply after store/date filters)
    const getDisplayAmount = (p: any) => {
      const isAccrual = String(p?.source_type || '').toLowerCase() === 'accrual';
      if (isAccrual) return Number(p?.remaining_balance || 0) || 0;
      return Number(p?.amount || 0) || 0;
    };

    if (amountFilter !== 'all') {
      filtered = filtered.filter((p: any) => {
        const isAccrual = String(p?.source_type || '').toLowerCase() === 'accrual';

        if (amountFilter === 'credit') return isAccrual;
        if (isAccrual) return false;

        const amt = getDisplayAmount(p);
        if (amountFilter === 'negative') return amt < 0;
        if (amountFilter === 'positive') return amt > 0;
        return true;
      });
    }

    // Derive store name at the last moment (stores may load after payments)
    return filtered.map((p) => ({
      ...p,
      store_name: p.store_id ? getStoreName(p.store_id) : 'Non spécifié',
    }));
  }, [payments, userRole, filterStore, currentStore?.id, filterStartDate, filterEndDate, stores, amountFilter]);

  const sortedPayments = useMemo(() => {
    const list = filteredPayments.slice();

    const getDisplayAmount = (p: any) => {
      const isAccrual = String(p.source_type || '') === 'accrual';
      const creditAmount = isAccrual ? (Number(p.remaining_balance || 0) || 0) : 0;
      return isAccrual ? creditAmount : (Number(p.amount || 0) || 0);
    };

    if (!sortConfig) {
      // Default: newest first
      return list.sort((a, b) => sortDate(b.date) - sortDate(a.date));
    }

    const { key, direction } = sortConfig;
    const factor = direction === 'asc' ? 1 : -1;

    const getValue = (p: any) => {
      switch (key) {
        case 'date':
          return sortDate(p.date);
        case 'store':
          return sortString(p.store_name);
        case 'client':
          return sortString(p.client_name);
        case 'reference':
          return sortString(p.reference);
        case 'amount':
          return sortNumber(getDisplayAmount(p));
        case 'reason':
          return sortString(p.reason);
        case 'type':
          return sortString(getSourceTypeLabel(p.source_type));
        case 'method':
          return sortString(p.payment_method);
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
  }, [filteredPayments, sortConfig]);

  const visiblePayments = useMemo(() => sortedPayments.slice(0, visibleCount), [sortedPayments, visibleCount]);

  // Reset date filters
  const handleResetDateFilter = () => {
    setFilterStartDate('');
    setFilterEndDate('');
  };

  const stats = useMemo(() => {
    // "Total Encaissé" should represent ONLY incoming money (payments received), not outflows.
    // Outflows are represented by "Total Dépensé" and should not reduce/affect Total Encaissé.
    const totalAmount = filteredPayments.reduce((sum, p) => sum + (p.amount > 0 ? p.amount : 0), 0);

    // "Total Crédit" is the sum of unpaid/partial amounts (credit), derived from accrual rows.
    // Accrual rows are created for invoices/sales where remaining_balance > 0.
    const totalCredit = filteredPayments
      .filter((p: any) => String(p?.source_type || '').toLowerCase() === 'accrual')
      .reduce((sum: number, p: any) => sum + (Number(p?.remaining_balance || 0) || 0), 0);

    const totalPayments = filteredPayments.length;

    let filteredExpenses = expenses;

    if (userRole === 'admin') {
      if (filterStore !== 'all') {
        filteredExpenses = filteredExpenses.filter((e) => e.store_id === filterStore);
      }
    } else {
      filteredExpenses = filteredExpenses.filter((e) => e.store_id === currentStore?.id);
    }

    if (filterStartDate) {
      const startDate = new Date(filterStartDate);
      startDate.setHours(0, 0, 0, 0);
      filteredExpenses = filteredExpenses.filter((e) => new Date(e.created_at) >= startDate);
    }

    if (filterEndDate) {
      const endDate = new Date(filterEndDate);
      endDate.setHours(23, 59, 59, 999);
      filteredExpenses = filteredExpenses.filter((e) => new Date(e.created_at) <= endDate);
    }

    // "Total Dépensé" should include ALL manual Le Charge expenses.
    // In this app those expenses live in the same `expenses` table but can come from either:
    // - /expenses (Le Charge)
    // - /caisse-expenses (depending on deployment)
    // So compute it from:
    //   A) Le Charge rows already merged into `filteredPayments` as `expense-*` (always negative amounts)
    //   B) Fallback: `expenses` list rows with expense_type manual_charge/empty
    // Supplier passage has its own dedicated metric/card.
    const norm = (s: any) => String(s || '').trim().toLowerCase();

    // A) From merged caisse rows (reliable because we already push Le Charge into payments list)
    const totalExpensesFromPayments = (filteredPayments || [])
      .filter((p: any) => String(p?.id || '').startsWith('expense-'))
      .reduce((sum: number, p: any) => sum + Math.abs(Number(p?.amount || 0) || 0), 0);

    // Supplier passage: separate card (from merged rows, so it matches the table)
    const passagePayments = (filteredPayments || []).filter((p: any) => String(p?.id || '').startsWith('supplier-passage-'));
    const totalSupplierPassageFromPayments = passagePayments.reduce((sum: number, p: any) => sum + Math.abs(Number(p?.amount || 0) || 0), 0);
    const totalSupplierPassageOut = -Math.abs(totalSupplierPassageFromPayments);

    // B) Fallback from raw expenses list (in case the merge failed)
    const manualChargeExpenses = (filteredExpenses || []).filter((e: any) => {
      const t = norm(e?.expense_type);
      if (t === 'supplier_passage') return false;
      if (t === 'supplier_passage_admin_in') return false;
      if (t === 'supplier_passage_correction_return' || t === 'supplier_passage_correction_add') return false;
      if (t.startsWith('coffer_') || t.startsWith('coffre_')) return false;
      if (t.startsWith('caisse_out_')) return false;
      if (t.startsWith('coffer_deposit_')) return false;
      if (t === 'manual_charge') return true;
      if (!t) return true; // legacy manual charge
      return false;
    });

    const totalExpensesFallback = manualChargeExpenses.reduce((sum: number, e: any) => sum + Math.abs(Number(e.amount) || 0), 0);

    // Prefer the merged value (table-consistent); fallback to raw if it's 0.
    const totalExpenses = totalExpensesFromPayments > 0 ? totalExpensesFromPayments : totalExpensesFallback;

    // Balance (Solde) = ALL movements (incoming - outgoing)
    const balance = filteredPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

    return {
      totalAmount,
      totalCredit,
      totalPayments,
      totalExpenses,
      balance,
      totalSupplierPassage: totalSupplierPassageOut,
      supplierPassageCount: passagePayments.length,
    };
  }, [filteredPayments, expenses, userRole, filterStore, currentStore?.id, filterStartDate, filterEndDate]);

  const paymentMethodStats = useMemo(() => {
    // Count/sum by payment method.
    // IMPORTANT: only consider rows that represent a REAL payment movement.
    // - Exclude accrual (credit tracker)
    // - Exclude synthetic rows like supplier-passage (payment_method='expense')
    // - Keep caisse-out rows (they are real movements and carry cash/check/transfer)

    const isRealPaymentMovement = (p: any) => {
      const sourceType = String(p?.source_type || '').toLowerCase();
      if (sourceType === 'accrual') return false;

      const id = String(p?.id || '');

      // Supplier passage MUST affect the cash bucket (cash out).
      // So it is a real movement.
      if (id.startsWith('supplier-passage-')) return true;

      const m = normalizeMethod(p?.payment_method);
      // Filter out placeholders and non-method markers
      if (!m || m === 'non spécifié' || m === 'non specifie') return false;
      if (m === 'expense' || m === 'credit') return false;

      return true;
    };

    const real = filteredPayments.filter(isRealPaymentMovement);

    // Expense handling for method cards:
    // Rule for Caisse:
    // - "💵 Espèces" decreases by normal expenses (Le Charge)
    // - "🏦 Chèques" decreases ONLY by cheque transfers to coffre (caisse_out_check)
    // - "💳 Virements" decreases ONLY by transfer-to-coffre (caisse_out_bank_transfer)
    //
    // IMPORTANT:
    // - We must NOT subtract general expenses from cheque/transfer buckets.
    // - We must NOT double-subtract: caisse_out_* rows are already included in `real` payments list.
    const norm = (s: any) => String(s || '').trim().toLowerCase();

    const computeNormalExpenseCashOutTotal = (() => {
      try {
        // Scope expenses to the same store/date filters as the caisse display.
        let scopedExpenses = expenses;

        if (userRole === 'admin') {
          if (filterStore !== 'all') scopedExpenses = scopedExpenses.filter((e: any) => e.store_id === filterStore);
        } else {
          scopedExpenses = scopedExpenses.filter((e: any) => e.store_id === currentStore?.id);
        }

        if (filterStartDate) {
          const startDate = new Date(filterStartDate);
          startDate.setHours(0, 0, 0, 0);
          scopedExpenses = scopedExpenses.filter((e: any) => new Date(e.created_at) >= startDate);
        }

        if (filterEndDate) {
          const endDate = new Date(filterEndDate);
          endDate.setHours(23, 59, 59, 999);
          scopedExpenses = scopedExpenses.filter((e: any) => new Date(e.created_at) <= endDate);
        }

        const caisseOutTypes = new Set(['caisse_out_cash', 'caisse_out_check', 'caisse_out_bank_transfer']);
        const cofferDepositTypes = new Set(['coffer_deposit_cash', 'coffer_deposit_check', 'coffer_deposit_bank_transfer']);

        // Normal expenses only: exclude caisse_out_* mirrors and coffer_deposit_* (coffre side)
        const normalExpenses = (scopedExpenses || []).filter((e: any) => {
          const t = norm(e?.expense_type);
          return !caisseOutTypes.has(t) && !cofferDepositTypes.has(t);
        });

        // IMPORTANT: these normal expenses already exist in `filteredPayments` (we push them as `expense-*` rows)
        // as negative cash movements.
        // Therefore we must NOT subtract them again here.
        // Keep this function for future use/debugging but return 0 to avoid double-subtraction.
        return 0;
      } catch (e) {
        console.warn('Could not compute normal expense cash-out total:', e);
        return 0;
      }
    })();

    const sumCaisseOutByType = (type: string) => {
      // NOTE: caisse_out_* rows are inserted as expenses AND also merged into payments list as `caisse-out-*`.
      // To avoid relying on sign conventions, compute by summing those specific rows from expenses.
      try {
        let scopedExpenses = expenses;

        if (userRole === 'admin') {
          if (filterStore !== 'all') scopedExpenses = scopedExpenses.filter((e: any) => e.store_id === filterStore);
        } else {
          scopedExpenses = scopedExpenses.filter((e: any) => e.store_id === currentStore?.id);
        }

        if (filterStartDate) {
          const startDate = new Date(filterStartDate);
          startDate.setHours(0, 0, 0, 0);
          scopedExpenses = scopedExpenses.filter((e: any) => new Date(e.created_at) >= startDate);
        }

        if (filterEndDate) {
          const endDate = new Date(filterEndDate);
          endDate.setHours(23, 59, 59, 999);
          scopedExpenses = scopedExpenses.filter((e: any) => new Date(e.created_at) <= endDate);
        }

        const rows = (scopedExpenses || []).filter((e: any) => norm(e?.expense_type) === type);
        // These are OUT movements; we return a positive number to subtract.
        return rows.reduce((sum: number, e: any) => sum + Math.abs(Number(e?.amount || 0) || 0), 0);
      } catch {
        return 0;
      }
    };

    const caisseOutCashTotal = sumCaisseOutByType('caisse_out_cash');
    const caisseOutCheckTotal = sumCaisseOutByType('caisse_out_check');
    const caisseOutTransferTotal = sumCaisseOutByType('caisse_out_bank_transfer');

    // ===== Cheque bucket rule (your requirement) =====
    // When a cheque is created in inventory => it MUST increase caisse "Chèques".
    // When transferred to coffre/safe => it must disappear from this bucket.
    // So the bucket is: SUM(check_inventory.amount_value) for "available" cheques.
    const chequeInventorySummary = (() => {
      try {
        const norm = (s: any) => String(s || '').trim().toLowerCase();

        // Filter: keep checks that are still in inventory (not transferred / not used).
        // In this codebase common statuses are: pending, partly_used.
        // We also require coffer_id to be null/empty when present.
        const available = (checkInventory || []).filter((c: any) => {
          const st = norm(c?.status);
          const cofferId = String(c?.coffer_id || '').trim();
          const isAvailableStatus = st === 'pending' || st === 'partly_used' || st === '';
          const isNotTransferred = !cofferId;
          return isAvailableStatus && isNotTransferred;
        });

        // Field name differs across deployments; support common ones.
        // IMPORTANT: some deployments keep the value under remaining_balance.
        const getAmount = (c: any) => Number(c?.remaining_balance ?? c?.amount_value ?? c?.amount ?? c?.amount_total ?? c?.value ?? 0) || 0;

        const amount = available.reduce((sum: number, c: any) => sum + getAmount(c), 0);
        const count = available.length;

        return { amount, count };
      } catch {
        return { amount: 0, count: 0 };
      }
    })();

    const isCash = (p: any) => normalizeMethod(p.payment_method) === 'cash';
    const isCheck = (p: any) => {
      const m = normalizeMethod(p.payment_method);
      return m === 'check' || m.includes('chèque') || m.includes('cheque');
    };
    const isTransfer = (p: any) => {
      const m = normalizeMethod(p.payment_method);
      return m === 'bank_transfer' || m.includes('virement') || m.includes('transfer');
    };

    const cashCount = real.filter(isCash).length;
    // Cheques count MUST follow the same movement-based logic as the cheque amount.
    // Count rows that represent a cheque movement OR have a cheque portion stored in amount_paid_by_checks.
    const checkCount = real.filter((p: any) => {
      const isCheque = (() => {
        const m = normalizeMethod(p?.payment_method);
        return m === 'check' || m === 'cheque' || m === 'chèque';
      })();

      const hasChequePortion = !!p?.paid_by_checks || Number(p?.amount_paid_by_checks || 0) > 0;
      return isCheque || hasChequePortion;
    }).length;
    const bankTransferCount = real.filter(isTransfer).length;

    // Method totals:
    // - Start from the NET movement list
    // - Then apply the business-specific subtractions per bucket
    const netCashFromMovements = real.filter(isCash).reduce((sum, p) => sum + (p.amount || 0), 0);
    const netCheckFromMovements = real.filter(isCheck).reduce((sum, p) => sum + (p.amount || 0), 0);
    const netTransferFromMovements = real.filter(isTransfer).reduce((sum, p) => sum + (p.amount || 0), 0);

    // Apply reductions:
    // - Cash: subtract normal expenses ONLY
    // - Check: subtract only cheque transfers to coffre (caisse_out_check)
    // - Transfer: subtract only transfer-to-coffre (caisse_out_bank_transfer)
    const allCashPayments = netCashFromMovements - computeNormalExpenseCashOutTotal;

    // Cheques bucket is inventory-based (not movement-based), per your rule.
    // NOTE: transfers to coffre remove cheques from inventory, so the bucket will decrease automatically.
    // Cheques bucket MUST represent cheque payments volume (movement-based), aligned with the history table.
    // Includes:
    // - direct cheque movements (payment_method == check/cheque/chèque)
    // - client global payments paid by checks (paid_by_checks / amount_paid_by_checks)
    const isChequeMethod = (p: any) => {
      const m = normalizeMethod(p?.payment_method);
      return m === 'check' || m === 'cheque' || m === 'chèque';
    };

    // NET cheque amount (basic calculation):
    // - positive cheque movements increase
    // - negative cheque movements decrease (e.g. cheque -> coffre)
    // Also include client-global rows where the cheque portion is stored in amount_paid_by_checks.
    const chequeNetFromMovements = real
      .filter((p: any) => isChequeMethod(p))
      .reduce((sum: number, p: any) => sum + (Number(p?.amount || 0) || 0), 0);

    const chequeNetFromPaidByChecksOnly = real
      // include only rows that are NOT already explicit cheque-method movements, to avoid double counting
      .filter((p: any) => (!isChequeMethod(p)) && (!!p?.paid_by_checks || Number(p?.amount_paid_by_checks || 0) > 0))
      .reduce((sum: number, p: any) => sum + (Number(p?.amount_paid_by_checks || 0) || 0), 0);

    const allCheckPayments = chequeNetFromMovements + chequeNetFromPaidByChecksOnly;

    const allBankTransferPayments = netTransferFromMovements - caisseOutTransferTotal;

    // Additional header metric: total of cheque amounts (absolute), useful for quick overview.
    // Example: if cheques are recorded as negative (caisse out), we still want to show the total volume of cheques.
    const checkTotalAbs = Math.abs(Number(allCheckPayments || 0) || 0);

    // Remises: keep including all non-accrual rows that have a remise_amount, including global payments.
    const remiseTotal = filteredPayments
      .filter((p: any) => String(p?.source_type || '').toLowerCase() !== 'accrual')
      .reduce((sum, p: any) => sum + (Number(p?.remise_amount) || 0), 0);

    // ===== BL / Facture breakdown =====
    // Build unique invoice/sale ids from payments + accrual rows.
    const getUniqueDocIds = (prefix: string) => {
      const ids = new Set<string>();
      filteredPayments.forEach((p: any) => {
        if (!String(p.id || '').startsWith(prefix)) return;
        const sid = String(p.source_id || '').trim();
        if (sid) ids.add(sid);
      });
      return ids;
    };

    const invoiceIds = new Set<string>([
      ...Array.from(getUniqueDocIds('invoice-')),
      ...Array.from(getUniqueDocIds('invoice-accrual-')),
    ]);
    const saleIds = new Set<string>([
      ...Array.from(getUniqueDocIds('sale-')),
      ...Array.from(getUniqueDocIds('sale-accrual-')),
    ]);

    // Split sales into BL / TRANSFER / PURCHASE using the reference (sale_number)
    const isTransferDoc = (p: any) => String(p?.reference || '').toUpperCase().includes('TRANSFER-');
    const isPurchaseDoc = (p: any) => String(p?.reference || '').toUpperCase().includes('PURCHASE-');
    const isBLDoc = (p: any) => {
      const ref = String(p?.reference || '');
      return ref.includes('BL-') || ref.startsWith('BL');
    };

    const summarize = (ids: Set<string>, predicate?: (p: any) => boolean) => {
      let paidCount = 0;
      let partialCount = 0;
      let unpaidCount = 0;

      let paidTotal = 0;
      let partialPaidTotal = 0;
      let partialUnpaidTotal = 0;
      let unpaidTotal = 0;

      ids.forEach((id) => {
        const row = filteredPayments.find((p: any) => {
          if (String(p.source_id || '') !== id) return false;
          if (p.total_amount === undefined && p.remaining_balance === undefined) return false;
          if (predicate && !predicate(p)) return false;
          return true;
        });
        if (!row) return;

        const total = Number(row.total_amount || 0) || 0;
        const paid = Number((row as any).amount_paid_total || 0) || 0;
        const remaining = Number((row as any).remaining_balance ?? Math.max(0, total - paid)) || 0;

        if (total <= 0 && paid <= 0 && remaining <= 0) return;

        if (remaining <= 0.000001) {
          paidCount += 1;
          paidTotal += total;
          return;
        }

        if (paid > 0.000001) {
          partialCount += 1;
          partialPaidTotal += paid;
          partialUnpaidTotal += remaining;
          return;
        }

        unpaidCount += 1;
        unpaidTotal += (remaining > 0 ? remaining : total);
      });

      return {
        paidCount,
        partialCount,
        unpaidCount,
        paidTotal,
        partialPaidTotal,
        partialUnpaidTotal,
        unpaidTotal,
      };
    };

    const factures = summarize(invoiceIds);
    const bls = summarize(saleIds, (p) => isBLDoc(p) && !isTransferDoc(p) && !isPurchaseDoc(p));
    const transfers = summarize(saleIds, (p) => isTransferDoc(p));
    const achats = summarize(saleIds, (p) => isPurchaseDoc(p));

    return {
      cashCount,
      checkCount,
      bankTransferCount,
      cashAmount: allCashPayments,
      checkAmount: allCheckPayments,
      bankTransferAmount: allBankTransferPayments,
      checkTotalAbs,
      remiseTotal,
      factures,
      bls,
      transfers,
      achats,
    };
  }, [filteredPayments, expenses, checkInventory, userRole, currentStore?.id, filterStore, filterStartDate, filterEndDate]);

  const getPaymentMethodDisplay = (payment: ConfirmedPayment) => {
    // IMPORTANT: keep "Méthode de Paiement" for real payment methods only.
    // Credit/accrual rows are not a payment method; they are a status/type.
    if (String(payment.source_type || '') === 'accrual') {
      return (
        <div className="flex flex-col gap-1">
          <span className="bg-gray-50 text-gray-500 px-2 py-1 rounded text-xs font-medium">—</span>
        </div>
      );
    }

    const method = normalizeMethod(payment.payment_method);

    if (method === 'check' || method.includes('chèque') || method.includes('cheque')) {
      return (
        <div className="flex flex-col gap-1">
          <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs font-medium">✓ Chèque</span>
          {payment.checks_count && payment.checks_count > 0 && (
            <span className="text-xs text-gray-600">
              {payment.checks_count} chèque{payment.checks_count > 1 ? 's' : ''}
            </span>
          )}
          {payment.amount_paid_by_checks && payment.amount_paid_by_checks > 0 && (
            <span className="text-xs text-purple-600 font-semibold">{payment.amount_paid_by_checks.toFixed(2)} MAD</span>
          )}
        </div>
      );
    }

    if (method === 'bank_transfer' || method.includes('virement') || method.includes('transfer')) {
      return (
        <div className="flex flex-col gap-1">
          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">🏦 Virement Bancaire</span>
          {payment.bank_transfer_reference && <span className="text-xs text-gray-600">Ref: {payment.bank_transfer_reference}</span>}
        </div>
      );
    }

    if (method === 'cash') {
      return (
        <div className="flex flex-col gap-1">
          <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">💵 Espèces</span>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-1">
        <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-medium">{payment.payment_method || 'Non spécifié'}</span>
      </div>
    );
  };

  const getStatusBadge = (payment: ConfirmedPayment) => {
    // New column: shows what this row represents
    if (String(payment.source_type || '') === 'accrual') {
      const s = String((payment.payment_status || '')).toLowerCase();
      const isPartial = (Number(payment.amount_paid_total || 0) || 0) > 0;
      if (isPartial) {
        return <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-medium">Crédit (Partiel)</span>;
      }
      return <span className="bg-rose-100 text-rose-800 px-2 py-1 rounded text-xs font-medium">Crédit (Non payé)</span>;
    }

    // Existing categories
    if (String(payment.id || '').startsWith('supplier-passage-')) {
      return <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-medium">Fournisseur Passage</span>;
    }

    if (
      String(payment.id || '').startsWith('client-global-') ||
      String(payment.id || '').startsWith('supplier-global-') ||
      String(payment.id || '').startsWith('supplier-payment-')
    ) {
      return <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-xs font-medium">Global</span>;
    }

    return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">Paiement</span>;
  };

  if (!canViewCaisse) {
    return (
      <div className="space-y-6">
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
          <h1 className="text-xl font-bold text-red-700">Accès refusé</h1>
          <p className="text-sm text-red-600 mt-1">Vous n'avez pas la permission « Voir la Caisse ».</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Caisse</h1>
          <p className="text-gray-600 mt-1">
            {userRole === 'admin'
              ? 'Suivi des paiements confirmés de tous les magasins'
              : `Caisse de ${currentStore?.name || 'votre magasin'}`}
          </p>
        </div>

        {canViewCashSpace && (
          <div className="flex items-center gap-2">
            <Button
              onClick={exportCaisseToExcel}
              disabled={!canExportCaisse}
              title={!canExportCaisse ? "Vous n'avez pas la permission « Exporter Caisse (CSV) »" : 'Exporter le rapport Caisse (Excel)'}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Download className="w-4 h-4 mr-2" />
              Exporter Excel
            </Button>
            <Button
              onClick={exportCaisseToPdf}
              disabled={!canExportCaisse}
              title={!canExportCaisse ? "Vous n'avez pas la permission « Exporter Caisse (CSV) »" : 'Exporter le rapport Caisse (PDF)'}
              variant="outline"
              className="border-blue-600 text-blue-700 hover:bg-blue-50"
            >
              <FileText className="w-4 h-4 mr-2" />
              Exporter PDF
            </Button>
          </div>
        )}
      </div>

      {/* Stats Cards - Navbar Style */}
      <div className="flex flex-wrap w-full bg-white p-1 h-auto gap-1 border-b border-gray-200 rounded-lg">
        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-blue-50 border-b-2 border-blue-500 text-blue-600 flex-1 min-w-max">
          <DollarSign className="w-5 h-5" />
          <span className="text-xs font-medium">Total Encaissé</span>
          <span className="text-lg font-bold">{stats.totalAmount.toFixed(2)} MAD</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-rose-50 border-b-2 border-rose-500 text-rose-700 flex-1 min-w-max">
          <TrendingDown className="w-5 h-5" />
          <span className="text-xs font-medium">Total Crédit</span>
          <span className="text-lg font-bold">{(Number((stats as any).totalCredit || 0) || 0).toFixed(2)} MAD</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-red-50 border-b-2 border-red-500 text-red-600 flex-1 min-w-max">
          <TrendingDown className="w-5 h-5" />
          <span className="text-xs font-medium">Total Dépensé</span>
          <span className="text-lg font-bold">{stats.totalExpenses.toFixed(2)} MAD</span>
          {/* Passage has its own dedicated box below; don't duplicate it in Total Dépensé */}
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-orange-50 border-b-2 border-orange-500 text-orange-700 flex-1 min-w-max">
          <Wallet className="w-5 h-5" />
          <span className="text-xs font-medium">Fournisseur Passage</span>
          <span className="text-lg font-bold">{stats.totalSupplierPassage.toFixed(2)} MAD</span>
          <span className="text-[11px] font-medium text-orange-800">{stats.supplierPassageCount} paiement(s)</span>
        </div>

        <div
          className={`flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all flex-1 min-w-max ${
            stats.balance >= 0
              ? 'bg-green-50 border-b-2 border-green-500 text-green-600'
              : 'bg-orange-50 border-b-2 border-orange-500 text-orange-600'
          }`}
        >
          <Wallet className="w-5 h-5" />
          <span className="text-xs font-medium">Solde</span>
          <span className="text-lg font-bold">{stats.balance.toFixed(2)} MAD</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-purple-50 border-b-2 border-purple-500 text-purple-700 flex-1 min-w-max">
          <Wallet className="w-5 h-5" />
          <span className="text-xs font-medium">Total Chèques</span>
          <span className="text-lg font-bold">{(Number((paymentMethodStats as any).checkTotalAbs || 0) || 0).toFixed(2)} MAD</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-green-50 border-b-2 border-green-500 text-green-600 flex-1 min-w-max">
          <TrendingUp className="w-5 h-5" />
          <span className="text-xs font-medium">Nombre de Paiements</span>
          <span className="text-lg font-bold">{stats.totalPayments}</span>
        </div>
      </div>

      {/* Payment Method Breakdown */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">💵 Espèces</h3>
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-gray-600">Nombre de Paiements</p>
              <p className="text-2xl font-bold text-green-600">{paymentMethodStats.cashCount}</p>
            </div>
            <div className="pt-2 border-t border-gray-200">
              <p className="text-xs text-gray-600">Montant Total</p>
              <p className="text-lg font-semibold text-green-700">{paymentMethodStats.cashAmount.toFixed(2)} MAD</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">🏦 Chèques</h3>
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-gray-600">Nombre de Paiements</p>
              <p className="text-2xl font-bold text-purple-600">{paymentMethodStats.checkCount}</p>
            </div>
            <div className="pt-2 border-t border-gray-200">
              <p className="text-xs text-gray-600">Montant Total</p>
              <p className="text-lg font-semibold text-purple-700">{paymentMethodStats.checkAmount.toFixed(2)} MAD</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">💳 Virements</h3>
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-gray-600">Nombre de Paiements</p>
              <p className="text-2xl font-bold text-blue-600">{paymentMethodStats.bankTransferCount}</p>
            </div>
            <div className="pt-2 border-t border-gray-200">
              <p className="text-xs text-gray-600">Montant Total</p>
              <p className="text-lg font-semibold text-blue-700">{paymentMethodStats.bankTransferAmount.toFixed(2)} MAD</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">🏷️ Remises</h3>
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-gray-600">Total Remises</p>
              <p className="text-2xl font-bold text-orange-600">{(Number(paymentMethodStats.remiseTotal || 0) || 0).toFixed(2)} MAD</p>
            </div>
            <div className="pt-2 border-t border-gray-200">
              <p className="text-xs text-gray-600">Impact</p>
              <p className="text-sm font-semibold text-gray-700">Non inclus dans les paiements</p>
            </div>
          </div>
        </div>
      </div>

      {/* BL / Factures / Transferts / Achats breakdown (Payé / Partiellement payé / Non payé) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">🧾 BL</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Payé</span>
              <span className="font-semibold text-emerald-700">{(paymentMethodStats as any).bls?.paidCount || 0} • {(Number((paymentMethodStats as any).bls?.paidTotal || 0) || 0).toFixed(2)} MAD</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Partiellement payé</span>
              <span className="font-semibold text-orange-700">
                {(paymentMethodStats as any).bls?.partialCount || 0} • Payé {(Number((paymentMethodStats as any).bls?.partialPaidTotal || 0) || 0).toFixed(2)} / Non payé {(Number((paymentMethodStats as any).bls?.partialUnpaidTotal || 0) || 0).toFixed(2)} MAD
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Non payé</span>
              <span className="font-semibold text-rose-700">{(paymentMethodStats as any).bls?.unpaidCount || 0} • {(Number((paymentMethodStats as any).bls?.unpaidTotal || 0) || 0).toFixed(2)} MAD</span>
            </div>
            <div className="text-xs text-gray-500">Les montants “Non payé” représentent du crédit (non inclus dans les paiements).</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">🧾 Factures</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Payé</span>
              <span className="font-semibold text-emerald-700">{(paymentMethodStats as any).factures?.paidCount || 0} • {(Number((paymentMethodStats as any).factures?.paidTotal || 0) || 0).toFixed(2)} MAD</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Partiellement payé</span>
              <span className="font-semibold text-orange-700">
                {(paymentMethodStats as any).factures?.partialCount || 0} • Payé {(Number((paymentMethodStats as any).factures?.partialPaidTotal || 0) || 0).toFixed(2)} / Non payé {(Number((paymentMethodStats as any).factures?.partialUnpaidTotal || 0) || 0).toFixed(2)} MAD
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Non payé</span>
              <span className="font-semibold text-rose-700">{(paymentMethodStats as any).factures?.unpaidCount || 0} • {(Number((paymentMethodStats as any).factures?.unpaidTotal || 0) || 0).toFixed(2)} MAD</span>
            </div>
            <div className="text-xs text-gray-500">Les montants “Non payé” représentent du crédit (non inclus dans les paiements).</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">🔁 Transferts</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Payé</span>
              <span className="font-semibold text-emerald-700">{(paymentMethodStats as any).transfers?.paidCount || 0} • {(Number((paymentMethodStats as any).transfers?.paidTotal || 0) || 0).toFixed(2)} MAD</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Partiellement payé</span>
              <span className="font-semibold text-orange-700">
                {(paymentMethodStats as any).transfers?.partialCount || 0} • Payé {(Number((paymentMethodStats as any).transfers?.partialPaidTotal || 0) || 0).toFixed(2)} / Non payé {(Number((paymentMethodStats as any).transfers?.partialUnpaidTotal || 0) || 0).toFixed(2)} MAD
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Non payé</span>
              <span className="font-semibold text-rose-700">{(paymentMethodStats as any).transfers?.unpaidCount || 0} • {(Number((paymentMethodStats as any).transfers?.unpaidTotal || 0) || 0).toFixed(2)} MAD</span>
            </div>
            <div className="text-xs text-gray-500">Les montants “Non payé” représentent du crédit (non inclus dans les paiements).</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">🛒 Achats</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Payé</span>
              <span className="font-semibold text-emerald-700">{(paymentMethodStats as any).achats?.paidCount || 0} • {(Number((paymentMethodStats as any).achats?.paidTotal || 0) || 0).toFixed(2)} MAD</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Partiellement payé</span>
              <span className="font-semibold text-orange-700">
                {(paymentMethodStats as any).achats?.partialCount || 0} • Payé {(Number((paymentMethodStats as any).achats?.partialPaidTotal || 0) || 0).toFixed(2)} / Non payé {(Number((paymentMethodStats as any).achats?.partialUnpaidTotal || 0) || 0).toFixed(2)} MAD
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Non payé</span>
              <span className="font-semibold text-rose-700">{(paymentMethodStats as any).achats?.unpaidCount || 0} • {(Number((paymentMethodStats as any).achats?.unpaidTotal || 0) || 0).toFixed(2)} MAD</span>
            </div>
            <div className="text-xs text-gray-500">Les montants “Non payé” représentent du crédit (non inclus dans les paiements).</div>
          </div>
        </div>
      </div>

      {/* Admin Filter */}
      {userRole === 'admin' && canViewCashSpace && (
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
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      )}

      {/* Date Range Filter */}
      {canViewCashSpace && (
        <Card>
          <CardHeader>
            <CardTitle>Filtrer par Période</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <Label htmlFor="start-date">Du</Label>
                <Input id="start-date" type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} />
              </div>
              <div className="flex-1">
                <Label htmlFor="end-date">Au</Label>
                <Input id="end-date" type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} />
              </div>
              <Button variant="outline" onClick={handleResetDateFilter} className="flex items-center gap-2">
                <X className="w-4 h-4" />
                Réinitialiser
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payments Table */}
      {canViewCashSpace && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Historique des Paiements Confirmés ({sortedPayments.length})
            </CardTitle>
            <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
            type="button"
            variant={amountFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAmountFilter('all')}
            >
            Tous
            </Button>
            <Button
            type="button"
            variant={amountFilter === 'positive' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAmountFilter('positive')}
            className={amountFilter === 'positive' ? '' : 'text-green-700 border-green-200 hover:border-green-300'}
            >
            + Positif
            </Button>
            <Button
            type="button"
            variant={amountFilter === 'negative' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAmountFilter('negative')}
            className={amountFilter === 'negative' ? '' : 'text-red-700 border-red-200 hover:border-red-300'}
            >
            − Négatif
            </Button>
            <Button
            type="button"
            variant={amountFilter === 'credit' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAmountFilter('credit')}
            className={amountFilter === 'credit' ? '' : 'text-rose-700 border-rose-200 hover:border-rose-300'}
            >
            Crédit
            </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">Chargement...</div>
            ) : sortedPayments.length === 0 ? (
              <div className="text-center py-8 text-gray-500">Aucun paiement confirmé enregistré</div>
            ) : (
              <div className="border rounded-lg overflow-x-auto max-h-[70vh] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-white z-[1]">
                    <TableRow>
                      <TableHead>
                        <button type="button" onClick={() => toggleSort('date')} className="inline-flex items-center gap-2 font-semibold hover:underline">
                          Date <span className="text-xs opacity-70">{getSortIndicator('date')}</span>
                        </button>
                      </TableHead>
                      {userRole === 'admin' && (
                        <TableHead>
                          <button type="button" onClick={() => toggleSort('store')} className="inline-flex items-center gap-2 font-semibold hover:underline">
                            Magasin <span className="text-xs opacity-70">{getSortIndicator('store')}</span>
                          </button>
                        </TableHead>
                      )}
                      <TableHead>
                        <button type="button" onClick={() => toggleSort('client')} className="inline-flex items-center gap-2 font-semibold hover:underline">
                          Client <span className="text-xs opacity-70">{getSortIndicator('client')}</span>
                        </button>
                      </TableHead>
                      <TableHead>
                        <button type="button" onClick={() => toggleSort('reference')} className="inline-flex items-center gap-2 font-semibold hover:underline">
                          Référence <span className="text-xs opacity-70">{getSortIndicator('reference')}</span>
                        </button>
                      </TableHead>
                      <TableHead>
                        <button type="button" onClick={() => toggleSort('amount')} className="inline-flex items-center gap-2 font-semibold hover:underline">
                          Montant <span className="text-xs opacity-70">{getSortIndicator('amount')}</span>
                        </button>
                      </TableHead>
                      <TableHead>
                        <button type="button" onClick={() => toggleSort('reason')} className="inline-flex items-center gap-2 font-semibold hover:underline">
                          Raison <span className="text-xs opacity-70">{getSortIndicator('reason')}</span>
                        </button>
                      </TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>
                        <button type="button" onClick={() => toggleSort('type')} className="inline-flex items-center gap-2 font-semibold hover:underline">
                          Type <span className="text-xs opacity-70">{getSortIndicator('type')}</span>
                        </button>
                      </TableHead>
                      <TableHead>
                        <button type="button" onClick={() => toggleSort('method')} className="inline-flex items-center gap-2 font-semibold hover:underline">
                          Méthode de Paiement <span className="text-xs opacity-70">{getSortIndicator('method')}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visiblePayments.map((payment) => (
                      <TableRow key={payment.id} className="hover:bg-gray-50">
                        <TableCell className="text-sm">
                          {new Date(payment.date).toLocaleDateString('fr-FR', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </TableCell>
                        {userRole === 'admin' && <TableCell className="text-sm font-medium">{payment.store_name}</TableCell>}
                        <TableCell className="text-sm font-medium">{payment.client_name || 'Non spécifié'}</TableCell>
                        <TableCell className="text-xs font-mono whitespace-nowrap" title={String(payment.reference || '')}>
                          {(() => {
                            const ref = String(payment.reference || '');
                            if (!ref) return '—';

                            // Shorten UUID-like references to keep the table readable.
                            // Example: a9f08bd9-f6fc-4f9e-86ee-db5593cbf465 -> a9f08bd9…b465
                            const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
                            if (uuidLike) return `${ref.slice(0, 8)}…${ref.slice(-4)}`;

                            // General fallback for very long refs
                            if (ref.length > 24) return `${ref.slice(0, 18)}…${ref.slice(-4)}`;

                            return ref;
                          })()}
                        </TableCell>
                        {(() => {
                          const isAccrual = String(payment.source_type || '') === 'accrual';
                          const creditAmount = isAccrual ? (Number(payment.remaining_balance || 0) || 0) : 0;
                          const displayAmount = isAccrual ? creditAmount : (Number(payment.amount || 0) || 0);

                          const cls = isAccrual
                            ? 'text-rose-700'
                            : (displayAmount < 0 ? 'text-red-600' : 'text-green-600');

                          return (
                            <TableCell className={`font-semibold ${cls}`}>
                              {displayAmount.toFixed(2)} MAD
                              {isAccrual && (
                                <div className="text-xs font-semibold text-gray-600 mt-1">(crédit)</div>
                              )}
                              {!isAccrual && (Number(payment.remise_amount) || 0) > 0 && (
                                <div className="text-xs font-semibold text-orange-700 mt-1">+ ({(Number(payment.remise_amount) || 0).toFixed(2)} MAD) remise</div>
                              )}
                            </TableCell>
                          );
                        })()}
                        <TableCell className="text-sm">{payment.reason}</TableCell>
                        <TableCell className="text-sm">{getStatusBadge(payment)}</TableCell>
                        <TableCell className="text-sm">
                          {payment.id.startsWith('supplier-passage-') ? (
                            <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-medium">Fournisseur Passage</span>
                          ) : payment.id.startsWith('client-global-') ||
                            payment.id.startsWith('supplier-global-') ||
                            payment.id.startsWith('supplier-payment-') ? (
                            <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-xs font-medium">Global</span>
                          ) : (
                            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">{getSourceTypeLabel(payment.source_type === 'accrual' ? (String(payment.reference || '').startsWith('BL') ? 'sale' : 'invoice') : payment.source_type)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{getPaymentMethodDisplay(payment)}</TableCell>
                        <TableCell className="text-right">
                          <Dialog
                            open={detailsDialogOpen && selectedPayment?.id === payment.id}
                            onOpenChange={(open) => {
                              if (!open) setSelectedPayment(null);
                              setDetailsDialogOpen(open);
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!canViewPaymentDetails}
                                onClick={() => {
                                  if (!canViewPaymentDetails) {
                                    toast.error("Vous n'avez pas la permission « Voir Détails Paiement (Caisse) »");
                                    return;
                                  }
                                  setSelectedPayment(payment);
                                  setDetailsDialogOpen(true);
                                }}
                                title={!canViewPaymentDetails ? "Vous n'avez pas la permission « Voir Détails Paiement (Caisse) »" : 'Voir les détails'}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-md">
                              <DialogHeader>
                                <DialogTitle>Détails du Paiement</DialogTitle>
                              </DialogHeader>
                              {selectedPayment && (
                                <div className="space-y-4">
                                  <div className="border-b pb-4">
                                    <p className="text-sm text-gray-600">Date et Heure</p>
                                    <p className="text-lg font-semibold">
                                      {new Date(selectedPayment.date).toLocaleDateString('fr-FR', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                      })}
                                    </p>
                                  </div>

                                  {userRole === 'admin' && (
                                    <div className="border-b pb-4">
                                      <p className="text-sm text-gray-600">Magasin</p>
                                      <p className="text-lg font-semibold">{selectedPayment.store_name}</p>
                                    </div>
                                  )}

                                  <div className="border-b pb-4">
                                    <p className="text-sm text-gray-600">Nom du Client</p>
                                    <p className="text-lg font-semibold">{selectedPayment.client_name || 'Non spécifié'}</p>
                                  </div>

                                  <div className="border-b pb-4">
                                    <p className="text-sm text-gray-600">Email du Client</p>
                                    <p className="text-lg font-semibold text-blue-600">{selectedPayment.client_email || 'Non spécifié'}</p>
                                  </div>

                                  <div className="border-b pb-4">
                                    <p className="text-sm text-gray-600">Montant</p>
                                    <p className="text-lg font-semibold text-green-600">{selectedPayment.amount.toFixed(2)} MAD</p>
                                  </div>

                                  <div className="border-b pb-4">
                                    <p className="text-sm text-gray-600">Raison</p>
                                    <p className="text-lg font-semibold">{selectedPayment.reason}</p>
                                  </div>

                                  <div className="border-b pb-4">
                                    <p className="text-sm text-gray-600">Type de Source</p>
                                    <p className="text-lg font-semibold">{getSourceTypeLabel(selectedPayment.source_type)}</p>
                                  </div>

                                  <div className="border-b pb-4">
                                    <p className="text-sm text-gray-600">Méthode de Paiement</p>
                                    <p className="text-lg font-semibold">{selectedPayment.payment_method}</p>
                                  </div>

                                  <div className="border-b pb-4">
                                    <p className="text-sm text-gray-600">Référence</p>
                                    <p className="text-lg font-semibold">{selectedPayment.reference}</p>
                                  </div>

                                  <div className="border-b pb-4">
                                    <p className="text-sm text-gray-600">Email de l'Utilisateur qui a Exécuté le Paiement</p>
                                    <p className="text-lg font-semibold text-blue-600">{selectedPayment.created_by_email || 'Non spécifié'}</p>
                                  </div>

                                  <div className="flex justify-end gap-2 pt-4">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => {
                                        setDetailsDialogOpen(false);
                                        setSelectedPayment(null);
                                      }}
                                    >
                                      Fermer
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="flex items-center justify-between gap-3 p-3">
                  <div className="text-xs text-gray-600">
                    Affichés: <span className="font-semibold">{Math.min(visibleCount, filteredPayments.length)}</span> /
                    <span className="font-semibold"> {filteredPayments.length}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {visibleCount < filteredPayments.length && (
                      <Button size="sm" variant="outline" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                        Charger plus
                      </Button>
                    )}

                    {filteredPayments.length > PAGE_SIZE && (
                      <Button size="sm" variant="ghost" onClick={() => setVisibleCount(PAGE_SIZE)}>
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
