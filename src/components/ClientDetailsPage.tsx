import { useState, useEffect, useMemo } from 'react';
import { projectId } from '../utils/supabase/info';

const downloadRemoteFile = async (url: string, filename: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
};

const getUrlFilename = (url: string) => {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last || 'document';
  } catch {
    const parts = String(url).split('/');
    return parts[parts.length - 1] || 'document';
  }
};

const makeCheckDownloadName = (check: any, url: string) => {
  const base = String(check?.check_id_number || check?.id || 'cheque').replace(/[^a-z0-9-_]/gi, '_');
  const fromUrl = getUrlFilename(url);
  const ext = fromUrl.includes('.') ? fromUrl.split('.').pop() : '';
  const finalExt = ext ? `.${ext}` : (String(check?.file_type).toLowerCase() === 'pdf' ? '.pdf' : '.jpg');
  return `${base}${finalExt}`;
};
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
ArrowLeft,
FileText,
DollarSign,
CheckCircle,
Download,
Calendar,
Filter,
Eye,
X,
ShoppingCart,
Building2,
Pencil,
Save,
Loader2,
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { InvoiceDetailsFullPage } from './InvoiceDetailsFullPage';

interface ClientDetailsPageProps {
  client: any;
  session: any;
  onBack: () => void;
}

export function ClientDetailsPage({ client, session, onBack }: ClientDetailsPageProps) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [checks, setChecks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [allInvoices, setAllInvoices] = useState<any[]>([]);
  const [allSales, setAllSales] = useState<any[]>([]);
  const [allChecks, setAllChecks] = useState<any[]>([]);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [showInvoiceDetailsPage, setShowInvoiceDetailsPage] = useState(false);
  const [selectedCheck, setSelectedCheck] = useState<any>(null);
  const [showCheckDetails, setShowCheckDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<'invoices' | 'sales' | 'checks' | 'global_payments'>(
    'invoices'
  );

  const [clientGlobalPayments, setClientGlobalPayments] = useState<any[]>([]);
  const [clientDiscounts, setClientDiscounts] = useState<any[]>([]);

  // Per-payment remise (discount) map: sum discount_amount for discounts linked to client_global_payments rows.
  const remiseByGlobalPaymentId = useMemo(() => {
    const map = new Map<string, number>();
    (clientDiscounts || []).forEach((d: any) => {
      if (String(d?.ref_table || '') !== 'client_global_payments') return;
      const refId = d?.ref_id ? String(d.ref_id) : '';
      if (!refId) return;
      const raw = d?.discount_amount ?? d?.remise_amount ?? d?.amount ?? 0;
      const n = typeof raw === 'string' ? Number(String(raw).replace(',', '.')) : Number(raw);
      const amt = Number.isFinite(n) ? Math.abs(n) : 0;
      if (amt <= 0) return;
      map.set(refId, (map.get(refId) || 0) + amt);
    });
    return map;
  }, [clientDiscounts]);

  // Edit Global Payment dialog state
  const [editingGlobalPayment, setEditingGlobalPayment] = useState<any>(null);
  const [editGpOpen, setEditGpOpen] = useState(false);
  const [editGpSaving, setEditGpSaving] = useState(false);
  const [editGpAmount, setEditGpAmount] = useState<string>('');
  const [editGpMethod, setEditGpMethod] = useState<string>('cash');
  const [editGpDate, setEditGpDate] = useState<string>('');
  const [editGpNotes, setEditGpNotes] = useState<string>('');

  // Counter state for this client (seconds remaining before becoming inactive)
  const [counterSeconds, setCounterSeconds] = useState(30 * 86400);

  // Export dropdown state
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);

  const normalizeText = (v: any) => String(v ?? '').trim().toLowerCase();
  const normalizePhone = (v: any) => String(v ?? '').replace(/\D+/g, '');
  const normalizeIce = (v: any) => String(v ?? '').replace(/\s+/g, '').toLowerCase();

  // Initialize dates (last 30 days by default)
  useEffect(() => {
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    setEndDate(today.toISOString().split('T')[0]);
    setStartDate(thirtyDaysAgo.toISOString().split('T')[0]);
  }, []);

  useEffect(() => {
    fetchClientData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  // Helpers for matching and computing sales amounts
  const doesSaleMatchClient = (sale: any, c: any) => {
    const saleName = normalizeText(sale?.client_name);
    const salePhone = normalizePhone(sale?.client_phone);
    const saleIce = normalizeIce(sale?.client_ice);

    const clientName = normalizeText(c?.name);
    const clientPhone = normalizePhone(c?.phone);
    const clientIce = normalizeIce(c?.ice);

    if (clientIce && saleIce && clientIce === saleIce) return true;
    if (clientPhone && salePhone && clientPhone === salePhone) return true;
    if (clientName && saleName && clientName === saleName) return true;

    // ALSO support magasin details:
    // When opening a magasin as a "client-like" page, the relevant movements are purchases/transfers
    // stored as sales with sale_number prefixes.
    const sn = String(sale?.sale_number || '');
    if (sn.startsWith('PURCHASE-') || sn.startsWith('TRANSFER-')) {
      const storeId = String(c?.id || '');
      const src = sale?.source_store_id ? String(sale.source_store_id) : '';
      const dst = sale?.store_id ? String(sale.store_id) : '';
      if (storeId && (src === storeId || dst === storeId)) return true;
    }

    return false;
  };

  // For both clients and magasins:
  // - Total Facturé should always include total_amount
  // - Total Payé should include:
  //    * paid  -> total_amount
  //    * partial -> amount_paid
  // - Solde Restant should include:
  //    * paid -> 0
  //    * partial/unpaid -> remaining_balance (or total - amount_paid)
  const computeSalePaid = (sale: any) => {
    const status = String(sale?.payment_status || 'unpaid').toLowerCase();
    const total = Number(sale?.total_amount || 0) || 0;
    const paid = Number(sale?.amount_paid || 0) || 0;

    if (status === 'paid') return total;
    if (status === 'partial') return Math.max(0, paid);
    return 0;
  };

  const computeSaleRemaining = (sale: any) => {
    const status = String(sale?.payment_status || 'unpaid').toLowerCase();
    const total = Number(sale?.total_amount || 0) || 0;
    const paid = Number(sale?.amount_paid || 0) || 0;

    const rawRemaining =
      sale?.remaining_balance !== undefined && sale?.remaining_balance !== null
        ? (Number(sale.remaining_balance) || 0)
        : Math.max(0, total - paid);

    if (status === 'paid') return 0;
    if (status === 'partial') return Math.max(0, rawRemaining);
    // unpaid
    return Math.max(0, rawRemaining > 0 ? rawRemaining : total);
  };

  const doesCheckMatchClient = (check: any, c: any) => {
    const givenTo = normalizeText(check?.given_to);
    const givenToPhoneDigits = normalizePhone(check?.given_to);

    const clientName = normalizeText(c?.name);
    const clientPhoneDigits = normalizePhone(c?.phone);
    const clientIce = normalizeIce(c?.ice);

    // More permissive matching: includes for names, digit-only for phone, and ICE substring.
    if (givenTo && clientName && givenTo.includes(clientName)) return true;
    if (clientPhoneDigits && givenToPhoneDigits && givenToPhoneDigits.includes(clientPhoneDigits)) return true;
    if (clientIce && givenTo && givenTo.includes(clientIce)) return true;
    return false;
  };

  // Filter invoices, sales and checks based on date range
  useEffect(() => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const filteredInvoices = allInvoices.filter((inv: any) => {
        const invDate = new Date(inv.created_at);
        return invDate >= start && invDate <= end;
      });

      const filteredSales = allSales.filter((s: any) => {
        const d = new Date(s.execution_date || s.created_at);
        return d >= start && d <= end;
      });

      const filteredChecks = allChecks.filter((check: any) => {
        const checkDate = new Date(check.due_date || check.execution_date || check.created_at);
        return checkDate >= start && checkDate <= end;
      });

      setInvoices(filteredInvoices);
      setSales(filteredSales);
      setChecks(filteredChecks);
    }
  }, [startDate, endDate, allInvoices, allSales, allChecks]);

  const openEditGlobalPayment = (payment: any) => {
    setEditingGlobalPayment(payment);

    const amount = payment?.amount !== undefined && payment?.amount !== null ? String(payment.amount) : '';
    setEditGpAmount(amount);

    const method = String(payment?.payment_method || 'cash').toLowerCase();
    setEditGpMethod(method);

    const rawDate = payment?.payment_date || payment?.created_at || null;
    const d = rawDate ? new Date(rawDate) : null;
    const dateStr = d && !Number.isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
    setEditGpDate(dateStr);

    setEditGpNotes(payment?.notes ? String(payment.notes) : '');
    setEditGpOpen(true);
  };

  const submitEditGlobalPayment = async () => {
    if (!editingGlobalPayment?.id) return;

    const amount = Number(String(editGpAmount || '').replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error('Montant invalide');
      return;
    }

    const method = String(editGpMethod || '').toLowerCase();
    if (!['cash', 'check', 'bank_transfer'].includes(method)) {
      toast.error('Méthode invalide');
      return;
    }

    if (!editGpDate) {
      toast.error('Date invalide');
      return;
    }

    setEditGpSaving(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/client-global-payments/${editingGlobalPayment.id}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount,
            payment_method: method,
            payment_date: editGpDate,
            notes: editGpNotes || null,
          }),
        }
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.error('Failed to update global payment', res.status, txt);
        toast.error("Erreur lors de la modification du paiement global");
        return;
      }

      toast.success('Paiement global modifié');
      setEditGpOpen(false);
      setEditingGlobalPayment(null);
      await fetchClientData();
    } catch (e) {
      console.error('submitEditGlobalPayment error', e);
      toast.error("Erreur lors de la modification du paiement global");
    } finally {
      setEditGpSaving(false);
    }
  };

  const fetchClientData = async () => {
    try {
      setLoading(true);

      const isMagasinEntity = Boolean((client as any)?.user_id) || Boolean((client as any)?.store_id === undefined && (client as any)?.email);

      // Fetch invoices for this entity.
      // - For clients: match by client fields (existing behavior)
      // - For magasins: match invoices where store_id == magasin.id OR client_name == magasin.name
      const invoicesResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/invoices`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (invoicesResponse.ok) {
        const data = await invoicesResponse.json();

        const entityInvoices = (data.invoices || []).filter((inv: any) => {
          if (isMagasinEntity) {
            return String(inv.store_id || '') === String(client.id) || String(inv.client_name || '') === String(client.name || '');
          }

          const invIce = normalizeIce(inv?.client_ice);
          const invName = normalizeText(inv?.client_name);
          const invPhone = normalizePhone(inv?.client_phone);

          const cIce = normalizeIce(client?.ice);
          const cName = normalizeText(client?.name);
          const cPhone = normalizePhone(client?.phone);

          if (cIce && invIce && cIce === invIce) return true;
          if (cPhone && invPhone && cPhone === invPhone) return true;
          if (cName && invName && cName === invName) return true;
          return false;
        });
        setAllInvoices(entityInvoices);
      }

      // Fetch sales activity for this entity
      // - Clients: keep existing behavior (exclude PURCHASE/TRANSFER)
      // - Magasins: load only PURCHASE/TRANSFER rows for that store via backend endpoint
      if (isMagasinEntity) {
        const tradingRes = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/store-trading?store_id=${client.id}`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        if (tradingRes.ok) {
          const data = await tradingRes.json();
          setAllSales(data.sales || []);
        } else {
          setAllSales([]);
        }
      } else {
        // Client sales (exclude PURCHASE/TRANSFER)
        const salesResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/sales?user_id=${session.user.id}`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        if (salesResponse.ok) {
          const data = await salesResponse.json();
          const allSalesRows = data.sales || [];

          const clientSales = allSalesRows.filter((s: any) => {
            const sn = String(s?.sale_number || '');
            if (sn.startsWith('PURCHASE-') || sn.startsWith('TRANSFER-')) return false;
            return doesSaleMatchClient(s, client);
          });

          setAllSales(clientSales);
        }
      }

      // Fetch checks used under this client from BOTH sources:
      // 1) Checks directly given to the client (check_inventory.given_to matches client)
      // 2) Checks referenced by client operations (invoices/sales/global payments) via check_inventory_id(s)
      const [checksInvRes, invoicesResForChecks, salesResForChecks, gpResForChecks] = await Promise.all([
        fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/invoices`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/sales?user_id=${session.user.id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/client-global-payments?client_id=${client.id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
      ]);

      let checkInventoryRows: any[] = [];
      if (checksInvRes.ok) {
        const data = await checksInvRes.json().catch(() => ({}));
        checkInventoryRows = Array.isArray(data?.check_inventory) ? data.check_inventory : [];
      }

      const checkById = new Map<string, any>();
      const checkByNumber = new Map<string, any>();
      (checkInventoryRows || []).forEach((c: any) => {
        if (c?.id) checkById.set(String(c.id), c);
        const num = String(c?.check_id_number || c?.check_number || c?.check_id || '').trim();
        if (num) checkByNumber.set(num, c);
      });

      const directClientChecks = (checkInventoryRows || []).filter((check: any) => doesCheckMatchClient(check, client));

      const parseIdsFromNotes = (notes: any): string[] => {
        const txt = String(notes || '');
        const m = txt.match(/check_inventory_ids=([^|\n\r]+)/i);
        if (!m || !m[1]) return [];
        return m[1]
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
      };

      const parseIdsUsed = (v: any): string[] => {
        const raw = String(v ?? '').trim();
        if (!raw) return [];
        if (raw.startsWith('[') && raw.endsWith(']')) {
          try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) return arr.map((x) => String(x).trim()).filter(Boolean);
          } catch {
            // ignore
          }
        }
        return raw.split(',').map((x) => x.trim()).filter(Boolean);
      };

      const referencedCheckIds = new Set<string>();
      const referencedCheckNumbers = new Set<string>();

      // 2a) From invoices
      if (invoicesResForChecks.ok) {
        const invData = await invoicesResForChecks.json().catch(() => ({}));
        const allInv = Array.isArray(invData?.invoices) ? invData.invoices : [];
        const entityInv = allInv.filter((inv: any) => {
          const invIce = normalizeIce(inv?.client_ice);
          const invName = normalizeText(inv?.client_name);
          const invPhone = normalizePhone(inv?.client_phone);

          const cIce = normalizeIce(client?.ice);
          const cName = normalizeText(client?.name);
          const cPhone = normalizePhone(client?.phone);

          if (cIce && invIce && cIce === invIce) return true;
          if (cPhone && invPhone && cPhone === invPhone) return true;
          if (cName && invName && cName === invName) return true;
          return false;
        });

        entityInv.forEach((inv: any) => {
          const method = String(inv?.payment_method || '').toLowerCase();
          if (method.includes('check') || method.includes('chèque') || method.includes('cheque')) {
            if (inv?.check_inventory_id) referencedCheckIds.add(String(inv.check_inventory_id));
            parseIdsUsed(inv?.check_ids_used).forEach((id) => referencedCheckIds.add(String(id)));
            const num = String(inv?.check_number || inv?.reference_number || '').trim();
            if (num) referencedCheckNumbers.add(num);
          }
        });
      }

      // 2b) From sales
      if (salesResForChecks.ok) {
        const salesData = await salesResForChecks.json().catch(() => ({}));
        const allS = Array.isArray(salesData?.sales) ? salesData.sales : [];
        const clientSales = allS.filter((s: any) => {
          const sn = String(s?.sale_number || '');
          if (sn.startsWith('PURCHASE-') || sn.startsWith('TRANSFER-')) return false;
          return doesSaleMatchClient(s, client);
        });

        clientSales.forEach((s: any) => {
          const method = String(s?.payment_method || '').toLowerCase();
          if (method.includes('check') || method.includes('chèque') || method.includes('cheque')) {
            if (s?.check_inventory_id) referencedCheckIds.add(String(s.check_inventory_id));
            parseIdsUsed(s?.check_ids_used).forEach((id) => referencedCheckIds.add(String(id)));
            const num = String(s?.check_number || s?.reference_number || '').trim();
            if (num) referencedCheckNumbers.add(num);
          }
        });
      }

      // 2c) From global payments (client_global_payments)
      if (gpResForChecks.ok) {
        const gpData = await gpResForChecks.json().catch(() => ({}));
        const gps = Array.isArray(gpData?.client_global_payments) ? gpData.client_global_payments : [];

        gps.forEach((p: any) => {
          const method = String(p?.payment_method || '').toLowerCase();
          const notes = String(p?.notes || '');
          const hasMarker = /check_inventory_ids=|check_inventory_id=/i.test(notes);
          if (method === 'check' || hasMarker) {
            if (p?.check_inventory_id) referencedCheckIds.add(String(p.check_inventory_id));
            parseIdsFromNotes(p?.notes).forEach((id) => referencedCheckIds.add(String(id)));
          }
        });
      }

      const referencedChecks: any[] = [];
      referencedCheckIds.forEach((id) => {
        const row = checkById.get(String(id));
        if (row) referencedChecks.push(row);
      });

      referencedCheckNumbers.forEach((num) => {
        const row = checkByNumber.get(String(num));
        if (row) referencedChecks.push(row);
      });

      const mergedChecksMap = new Map<string, any>();
      [...directClientChecks, ...referencedChecks].forEach((c: any) => {
        const key = String(c?.id || c?.check_id_number || Math.random());
        if (!key) return;
        mergedChecksMap.set(key, c);
      });

      setAllChecks(Array.from(mergedChecksMap.values()));

      // Fetch global payments
      // - Clients: client_global_payments
      // - Magasins: store_global_payments
      try {
        const gpUrl = isMagasinEntity
          ? `https://${projectId}.supabase.co/functions/v1/super-handler/store-global-payments?store_id=${client.id}`
          : `https://${projectId}.supabase.co/functions/v1/super-handler/client-global-payments?client_id=${client.id}`;

        const gpRes = await fetch(gpUrl, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (gpRes.ok) {
          const gpData = await gpRes.json();
          setClientGlobalPayments(
            isMagasinEntity ? (gpData.store_global_payments || []) : (gpData.client_global_payments || [])
          );
        } else {
          setClientGlobalPayments([]);
        }
      } catch (e) {
        console.warn('Failed to fetch global payments:', e);
        setClientGlobalPayments([]);
      }

      // Fetch client discounts (remises)
      // We need two views:
      //  1) Per-client total (legacy logic based on entity_name)
      //  2) Per-global-payment remise (linked via ref_table/ref_id)
      // We fetch once and keep ALL rows for this client entity_id, then reuse the list for both computations.
      try {
        const dRes = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/discounts`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (dRes.ok) {
          const dData = await dRes.json();
          const list = Array.isArray(dData?.discounts) ? dData.discounts : [];

          const clientEntityId = String(client?.id || '').trim();
          const clientName = String(client?.name || '').trim();
          const clientIce = String(client?.ice || '').trim();

          // Keep all discounts rows for this client_id (entity_id) so we can compute per-payment remises.
          const byEntityId = list.filter((disc: any) => String(disc?.entity_id || '') === clientEntityId);

          // For the Remise card, keep backward-compatible logic used by ClientsModule.
          const matchedForTotals = byEntityId.filter((disc: any) => {
            const et = String(disc?.entity_type || '').toLowerCase();
            const en = String(disc?.entity_name || '').trim();
            const st = String(disc?.status || '').toLowerCase();

            if (st !== 'active') return false;
            if (et !== 'customer') return false;

            return (clientName && en === clientName) || (clientIce && en === clientIce);
          });

          // Store ALL entity discounts (for per-payment mapping) but preserve totals behavior.
          setClientDiscounts(byEntityId);

          // NOTE: clientDiscountTotal uses clientDiscounts state; we keep it consistent with totals by filtering in the memo.
          // (clientDiscountTotal memo already checks status/entity_type and sums discount_amount.)
          // It will now include other discounts too; to preserve totals exactly, the memo already filters active+customer,
          // but we also want to keep entity_name match; we enforce it here by attaching a helper flag.
          // Simpler: tag which rows are part of totals.
          // We do that by adding a synthetic field.
          setClientDiscounts(byEntityId.map((d: any) => ({ ...d, __count_for_totals: matchedForTotals.some((m: any) => String(m.id) === String(d.id)) })));
        } else {
          setClientDiscounts([]);
        }
      } catch (e) {
        console.warn('Failed to fetch client discounts:', e);
        setClientDiscounts([]);
      }
    } catch (error) {
      console.error('Error fetching client data:', error);
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  const totalInvoiced =
    invoices.reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0) +
    sales.reduce((sum, s) => sum + (Number(s?.total_amount || 0) || 0), 0);

  // Totals (client debt view): include global payments as real payments.
  // So "Total Payé" reflects ALL payments applied to the client's invoices (including those paid by store).
  const clientInvoicesOnly = useMemo(() => {
    return invoices.map((inv) => {
      const totalAmount = Number(inv?.total_amount) || 0;

      // Always count invoice.amount_paid regardless of who paid it.
      // Global payments are expected to be reflected in invoices.amount_paid/remaining_balance.
      const amountPaidForClient = Number(inv?.amount_paid) || 0;

      const remainingBalanceRaw = inv?.remaining_balance;
      const remainingBalance =
        remainingBalanceRaw !== undefined && remainingBalanceRaw !== null
          ? Number(remainingBalanceRaw) || 0
          : Math.max(0, totalAmount - amountPaidForClient);

      return {
        ...inv,
        __isGlobalPayment: Boolean(inv?.paid_by_store_name),
        __totalAmount: totalAmount,
        __amountPaidForClient: amountPaidForClient,
        __remainingForClient: Math.max(0, remainingBalance),
      };
    });
  }, [invoices]);

  // Match ClientsModule behavior exactly:
  // - Only count HISTORY-ONLY global payments
  // - And only those belonging to this client id
  const totalGlobalPaymentsHistoryOnly = useMemo(() => {
    return (clientGlobalPayments || [])
      .filter((p: any) => {
        const clientIdMatch = String(p?.client_id || '') === String(client?.id || '');
        if (!clientIdMatch) return false;
        const notes = String(p?.notes || '').toLowerCase();
        return notes.includes('history-only') || notes.includes('historique uniquement');
      })
      .reduce((sum: number, p: any) => sum + (Number(p?.amount || 0) || 0), 0);
  }, [clientGlobalPayments, client?.id]);

  const totalPaid =
    clientInvoicesOnly.reduce((sum, inv) => sum + (Number(inv.__amountPaidForClient) || 0), 0) +
    sales.reduce((sum, s) => sum + computeSalePaid(s), 0) +
    totalGlobalPaymentsHistoryOnly;

  // Keep remaining balance consistent with ClientsModule: allow negative (client credit).
  const totalRemainingRaw = (Number(totalInvoiced) || 0) - (Number(totalPaid) || 0);
  const totalRemaining = totalRemainingRaw;

  const totalChecks = checks.reduce((sum, check) => sum + (Number(check.amount_value) || 0), 0);

  // Remise client
  // IMPORTANT: Remise is stored in multiple places:
  // - discounts table (manual remises + remises linked to global payments)
  // - sales.total_remise (BL / ventes)
  // - invoices.total_remise (factures)
  // We must aggregate all of them WITHOUT double-counting.
  // Rule:
  // - If a discount row links to a sale/invoice via (ref_table, ref_id), we count it from discounts
  //   and we SKIP counting embedded remise from that sale/invoice.
  const clientDiscountTotal = useMemo(() => {
    const list = Array.isArray(clientDiscounts) ? clientDiscounts : [];

    // Preserve legacy behavior for the Remise card: only count rows that match the legacy filter.
    const filtered = list.filter((d: any) => d?.__count_for_totals);

    // Collect linked docs to avoid double counting
    const linkedSaleIds = new Set<string>();
    const linkedInvoiceIds = new Set<string>();

    filtered.forEach((d: any) => {
      const rt = String(d?.ref_table || '').toLowerCase().trim();
      const rid = d?.ref_id !== undefined && d?.ref_id !== null ? String(d.ref_id).trim() : '';
      if (!rid) return;
      if (rt === 'sales' || rt === 'sale') linkedSaleIds.add(rid);
      if (rt === 'invoices' || rt === 'invoice') linkedInvoiceIds.add(rid);
    });

    // 1) discounts-based remises
    const discountsSum = filtered.reduce((acc: number, d: any) => {
      const raw = d?.discount_amount ?? d?.amount ?? d?.value ?? d?.remise_amount ?? d?.remise ?? 0;
      const n = typeof raw === 'string' ? Number(String(raw).replace(',', '.')) : Number(raw);
      if (!Number.isFinite(n)) return acc;
      return acc + Math.max(0, Math.abs(n));
    }, 0);

    // 2) sales-based remises (skip linked sales)
    const salesSum = (sales || []).reduce((sum: number, s: any) => {
      const sid = s?.id !== undefined && s?.id !== null ? String(s.id) : '';
      if (sid && linkedSaleIds.has(sid)) return sum;

      const raw =
        s?.total_remise ??
        (s as any)?.totalRemise ??
        s?.remise_amount ??
        (s as any)?.remiseAmount ??
        s?.discount_amount ??
        (s as any)?.discountAmount ??
        s?.total_discount ??
        s?.remise ??
        s?.remise_value ??
        0;

      const n = typeof raw === 'string' ? Number(String(raw).replace(',', '.')) : Number(raw);
      if (!Number.isFinite(n)) return sum;
      return sum + Math.max(0, Math.abs(n));
    }, 0);

    // 3) invoices-based remises (skip linked invoices)
    const invoicesSum = (invoices || []).reduce((sum: number, inv: any) => {
      const iid = inv?.id !== undefined && inv?.id !== null ? String(inv.id) : '';
      if (iid && linkedInvoiceIds.has(iid)) return sum;

      const raw =
        (inv as any)?.pending_discount ??
        (inv as any)?.pendingDiscount ??
        (inv as any)?.total_remise ??
        (inv as any)?.totalRemise ??
        (inv as any)?.remise_amount ??
        (inv as any)?.discount_amount ??
        (inv as any)?.total_discount ??
        (inv as any)?.remise ??
        0;

      const n = typeof raw === 'string' ? Number(String(raw).replace(',', '.')) : Number(raw);
      if (!Number.isFinite(n)) return sum;
      return sum + Math.max(0, Math.abs(n));
    }, 0);

    return Math.max(0, discountsSum + salesSum + invoicesSum);
  }, [clientDiscounts, sales, invoices]);

  // Solde restant APRÈS remise
  // IMPORTANT:
  // - Must be computed from totalRemaining (which can be negative = credit)
  // - Then subtract remise
  // - Clamp at 0 for display in cards
  const totalAfterDiscount = Math.max(0, totalRemaining - clientDiscountTotal);

  // Calculate inactivity info and keep the countdown synced with the last activity
  const inactivityInfo = useMemo(() => {
    if (allInvoices.length === 0 && allSales.length === 0 && allChecks.length === 0) {
      return {
        isInactive: true,
        daysRemaining: 0,
        lastActivityDate: null as Date | null,
        lastActivityMs: null as number | null,
        message: 'Aucune activité',
      };
    }

    const invoiceDates = allInvoices
      .map((inv) => new Date(inv.created_at).getTime())
      .filter((t: number) => Number.isFinite(t));
    const salesDates = allSales
      .map((s) => new Date(s.created_at).getTime())
      .filter((t: number) => Number.isFinite(t));
    const checkDates = allChecks
      .map((check) => new Date(check.due_date || check.execution_date || check.created_at).getTime())
      .filter((t: number) => Number.isFinite(t));

    const allDates = [...invoiceDates, ...salesDates, ...checkDates];
    const lastActivityMs = Math.max(...allDates);
    const lastActivityDate = new Date(lastActivityMs);

    const today = new Date();
    const daysSinceActivity = Math.floor((today.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, 30 - daysSinceActivity);
    const isInactive = daysRemaining === 0;

    return {
      isInactive,
      daysRemaining,
      lastActivityDate,
      lastActivityMs,
      daysSinceActivity,
      message: isInactive
        ? 'Inactif depuis 30 jours'
        : `${daysRemaining} jour${daysRemaining !== 1 ? 's' : ''} avant inactivité`,
    };
  }, [allInvoices, allSales, allChecks]);

  const { isInactive, daysRemaining, lastActivityDate, message, lastActivityMs } = inactivityInfo;

  // Keep the countdown in sync with lastActivityMs
  useEffect(() => {
    if (!lastActivityMs) {
      setCounterSeconds(0);
      return;
    }

    const update = () => {
      const deadlineMs = lastActivityMs + 30 * 86400 * 1000;
      const remaining = Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000));
      setCounterSeconds(remaining);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [lastActivityMs]);

  const handleViewInvoice = (invoice: any) => {
    setSelectedInvoice(invoice);
    setShowInvoiceDetailsPage(true);
  };

  const handleDownloadInvoicePDF = async (invoice: any) => {
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('clientName', invoice.client_name);
      queryParams.append('clientPhone', invoice.client_phone || '');
      queryParams.append('clientAddress', invoice.client_address || '');
      queryParams.append('clientICE', invoice.client_ice || '');
      queryParams.append('date', new Date(invoice.invoice_date || invoice.created_at).toISOString().split('T')[0]);
      queryParams.append('items', JSON.stringify(invoice.items || []));
      queryParams.append('subtotal', invoice.total_amount.toString());
      queryParams.append('totalWithTVA', invoice.total_amount.toString());
      queryParams.append('paymentHeaderNote', `Statut: ${invoice.status}`);

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/documents/${invoice.invoice_number}/pdf?${queryParams.toString()}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to download PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoice.invoice_number}.pdf`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);

      toast.success('PDF téléchargé avec succès');
    } catch (error: any) {
      console.error('Error downloading PDF:', error);
      toast.error('Erreur lors du téléchargement du PDF');
    }
  };

  // Download BL (Bon de Livraison) PDF (same flow as SalesModule / SalesHistoryModule)
  const handleDownloadSaleBL = async (sale: any) => {
    try {
      // PERF: Avoid the extra POST /documents (it adds latency and writes DB rows).
      // Use sale_number as the document id directly (same pattern as invoices).
      const documentId = sale?.sale_number || `BL-${sale?.id || Date.now()}`;

      const itemsSource = sale?.sale_items && sale.sale_items.length > 0 ? sale.sale_items : (sale?.items || []);

      const items = (itemsSource || []).map((it: any) => {
        const unitPrice = it?.products?.sale_price || it?.unit_price || it?.unitPrice || 0;
        const qty = it?.quantity || 1;
        const total = it?.total_price || it?.subtotal || (qty * unitPrice);
        return {
          description: it?.products?.name || it?.description || it?.name || 'Produit',
          caisse: String(it?.caisse || ''),
          quantity: qty,
          moyenne: it?.moyenne || '',
          unitPrice,
          total,
        };
      });

      const subtotal = items.reduce((s: number, it: any) => s + (Number(it.total) || 0), 0);

      const dateStr = new Date(sale.created_at).toISOString().split('T')[0];
      const invoiceDateStr = (sale as any).invoice_date || dateStr;
      const executionDateStr = (sale as any).execution_date || dateStr;
      const clientName = sale?.client_name || sale?.stores?.name || 'Client';
      const clientAddress = sale?.client_address || '';
      const clientICE = sale?.client_ice || '';
      const clientPhone = sale?.client_phone || '';

      const paymentHeaderNote = `Statut: ${sale.payment_status === 'paid' ? 'Payée' : sale.payment_status === 'partial' ? 'Partiellement payée' : 'Non payée'}`;

      const q = new URLSearchParams();
      q.append('type', 'Bon Livraison');
      q.append('clientName', clientName);
      q.append('clientPhone', clientPhone);
      q.append('clientAddress', clientAddress);
      q.append('clientICE', clientICE);
      q.append('invoiceDate', invoiceDateStr);
      q.append('executionDate', executionDateStr);
      q.append('date', invoiceDateStr);
      const remiseDoc =
        sale?.total_remise ??
        (sale as any)?.totalRemise ??
        sale?.remise_amount ??
        (sale as any)?.remiseAmount ??
        sale?.discount_amount ??
        (sale as any)?.discountAmount ??
        sale?.total_discount ??
        sale?.remise ??
        0;

      const remiseAmount = Math.max(0, Number(remiseDoc || 0) || 0);
      const subtotalAfterRemise = Math.max(0, subtotal - remiseAmount);

      q.append('items', JSON.stringify(items));
      q.append('subtotal', String(subtotal));
      // IMPORTANT: documents/template treats `remise` as a PERCENTAGE.
      // For BL we only support amount-based remise.
      q.append('remise', '0');
      q.append('remisePercentage', '0');
      q.append('totalRemise', String(remiseAmount));
      q.append('subtotalAfterRemise', String(subtotalAfterRemise));
      // Backward-compat aliases (some template codepaths read snake_case)
      q.append('total_remise', String(remiseAmount));
      q.append('subtotal_after_remise', String(subtotalAfterRemise));
      q.append('tva', '0');
      q.append('tvaPercentage', '0');
      q.append('totalWithTVA', String(subtotalAfterRemise));
      q.append('paymentHeaderNote', paymentHeaderNote);

      const pdfRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/documents/${encodeURIComponent(documentId)}/pdf?${q.toString()}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/pdf',
          },
        }
      );

      if (!pdfRes.ok) {
        const txt = await pdfRes.text().catch(() => '');
        console.error('BL pdf download failed', pdfRes.status, txt);
        toast.error('Erreur lors du téléchargement du BL');
        return;
      }

      const blob = await pdfRes.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${documentId}.pdf`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);

      toast.success('Bon de Livraison téléchargé');
    } catch (e) {
      console.error('BL download error', e);
      toast.error('Erreur lors du téléchargement du BL');
    }
  };

  const handleDownloadCheckDocument = async (check: any) => {
    try {
      const url = (check?.image_url || check?.pdf_url) as string;
      if (!url) {
        toast.error('Aucun fichier associé à ce chèque');
        return;
      }

      const filename = makeCheckDownloadName(check, url);
      await downloadRemoteFile(url, filename);
      toast.success('Fichier téléchargé');
    } catch (error: any) {
      console.error('Error downloading check document:', error);
      toast.error('Erreur lors du téléchargement du fichier');
    }
  };

  const buildClientTransactionsForExport = () => {
    // Combine all transactions (invoices + sales + checks + global payments) into one unified table
    const allTransactions: any[] = [];

    // Add invoices to the combined list
    // For client debt reporting, ignore global payments in the "amountPaid" column.
    clientInvoicesOnly.forEach((invoice) => {
      const d = new Date(invoice.created_at);
      const dateStr = d && !Number.isNaN(d.getTime())
        ? `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR')}`
        : '-';

      // Export invoice remise exactly like the Details page logic:
      // - If there is a linked discount row (ref_table=invoices, ref_id=invoice.id), the Details page counts that
      //   from discounts and does NOT count embedded invoice remise.
      // - Otherwise, the Details page counts embedded invoice remise fields.
      // For export we only need the final displayed amount per invoice line.
      const invoiceId = invoice?.id !== undefined && invoice?.id !== null ? String(invoice.id) : '';
      const invoiceHasLinkedDiscount = invoiceId
        ? (clientDiscounts || []).some((d: any) => {
            const rt = String(d?.ref_table || '').toLowerCase().trim();
            const rid = d?.ref_id !== undefined && d?.ref_id !== null ? String(d.ref_id).trim() : '';
            return (rt === 'invoices' || rt === 'invoice') && rid === invoiceId;
          })
        : false;

      const invoiceRemise = (() => {
        if (invoiceHasLinkedDiscount) return 0;
        const raw =
          (invoice as any)?.pending_discount ??
          (invoice as any)?.pendingDiscount ??
          (invoice as any)?.total_remise ??
          (invoice as any)?.totalRemise ??
          (invoice as any)?.remise_amount ??
          (invoice as any)?.discount_amount ??
          (invoice as any)?.total_discount ??
          (invoice as any)?.remise ??
          0;
        const n = typeof raw === 'string' ? Number(String(raw).replace(',', '.')) : Number(raw);
        return Number.isFinite(n) ? Math.max(0, Math.abs(n)) : 0;
      })();
      
      allTransactions.push({
        category: 'Transaction',
        type: 'Facture',
        documentNumber: invoice.invoice_number,
        date: dateStr,
        totalAmount: Number(invoice.__totalAmount) || 0,
        amountPaid: Number(invoice.__amountPaidForClient) || 0,
        remainingBalance: Number(invoice.__remainingForClient) || 0,
        discountAmount: invoiceRemise,
        status: invoice.status === 'paid' ? 'Payée' : invoice.status === 'partial' ? 'Partielle' : 'En attente',
        notes: invoice.payment_notes || '-',
        sortDate: new Date(invoice.created_at).getTime(),
      });
    });

    // Add sales (ventes / BL) to the combined list
    sales.forEach((s) => {
      const d = s.created_at ? new Date(s.created_at) : null;
      const dateStr = d && !Number.isNaN(d.getTime())
        ? `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR')}`
        : '-';
      const status = s.payment_status === 'paid' ? 'Payée' : s.payment_status === 'partial' ? 'Partielle' : 'Non payée';

      // Export sale remise exactly like the Details page logic:
      // If there is a linked discount row (ref_table=sales, ref_id=sale.id), the Details page counts that
      // from discounts and does NOT count embedded sale remise.
      const saleId = s?.id !== undefined && s?.id !== null ? String(s.id) : '';
      const saleHasLinkedDiscount = saleId
        ? (clientDiscounts || []).some((d: any) => {
            const rt = String(d?.ref_table || '').toLowerCase().trim();
            const rid = d?.ref_id !== undefined && d?.ref_id !== null ? String(d.ref_id).trim() : '';
            return (rt === 'sales' || rt === 'sale') && rid === saleId;
          })
        : false;

      const remiseValue = (() => {
        if (saleHasLinkedDiscount) return 0;
        const raw =
          s?.total_remise ??
          (s as any)?.totalRemise ??
          s?.remise_amount ??
          (s as any)?.remiseAmount ??
          s?.discount_amount ??
          (s as any)?.discountAmount ??
          s?.total_discount ??
          s?.remise ??
          s?.remise_value ??
          0;
        const n = typeof raw === 'string' ? Number(String(raw).replace(',', '.')) : Number(raw);
        return Number.isFinite(n) ? Math.max(0, Math.abs(n)) : 0;
      })();

      allTransactions.push({
        category: 'Transaction',
        type: 'Vente (BL)',
        documentNumber: s.sale_number || '-',
        date: dateStr,
        totalAmount: Number(s.total_amount || 0) || 0,
        amountPaid: Number(computeSalePaid(s)) || 0,
        remainingBalance: Number(computeSaleRemaining(s)) || 0,
        discountAmount: remiseValue,
        status,
        notes: s.payment_method ? `Méthode: ${String(s.payment_method).toUpperCase()}` : '-',
        sortDate: s.created_at ? new Date(s.created_at).getTime() : 0,
      });
    });

    // Add checks to the combined list
    checks.forEach((check) => {
      let d: Date | null = null;
      if (check.due_date) {
        d = new Date(check.due_date);
      } else if (check.execution_date) {
        d = new Date(check.execution_date);
      }
      
      const dueDate = d && !Number.isNaN(d.getTime())
        ? `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR')}`
        : '-';

      allTransactions.push({
        category: 'Transaction',
        type: 'Chèque',
        documentNumber: check.check_id_number,
        date: dueDate,
        // For the report, a cheque is a PAYMENT, not an invoice amount.
        totalAmount: 0,
        amountPaid: Number(check.amount_value) || 0,
        remainingBalance: Number(check.remaining_balance) || 0,
        status: check.status === 'used' ? 'Utilisé' : check.status === 'pending' ? 'En attente' : check.status,
        notes: check.notes || '-',
        sortDate: check.due_date
          ? new Date(check.due_date).getTime()
          : check.execution_date
            ? new Date(check.execution_date).getTime()
            : (check.created_at ? new Date(check.created_at).getTime() : 0),
      });
    });

    // Add global payments to the combined list (audit log; does not affect client debt)
    // Requirement: if a global payment exists on a specific day, it must appear as a dated row
    // in the report table (not only included in totals).
    clientGlobalPayments.forEach((p) => {
      const d = p.payment_date || p.created_at;
      const dateObj = d ? new Date(d) : null;
      const dateStr =
        dateObj && !Number.isNaN(dateObj.getTime())
          ? `${dateObj.toLocaleDateString('fr-FR')} ${dateObj.toLocaleTimeString('fr-FR')}`
          : '-';

      // Translate payment method to French
      const methodFr = (() => {
        const m = String(p.payment_method || '').toLowerCase();
        if (m === 'cash') return 'Espèces';
        if (m === 'check') return 'Chèque';
        if (m === 'bank_transfer') return 'Virement bancaire';
        return '-';
      })();

      // Discount/remise may come from different fields depending on backend evolution.
      // Also: some clients show "Remise Donnée" in list as negative numbers.
      // We export remise as an absolute value so it prints as a positive "REMIS".
      const rawRemise =
        p.remise_amount ??
        p.discount_amount ??
        p.remise ??
        p.remise_given ??
        p.remise_donnee ??
        p.discount ??
        p.remise_value ??
        0;

      const discountAmount = Math.abs(Number(rawRemise || 0) || 0);

      // Some records store remise only inside notes (legacy): "remise=12.5" or "discount=12.5".
      // Use it as a fallback ONLY if there is no explicit remise field.
      const finalDiscountAmount = (() => {
        if (discountAmount > 0) return discountAmount;
        const notes = String(p?.notes || '');
        const m = notes.match(/(?:^|\b)(?:remise|discount)\s*=\s*([0-9]+(?:[\.,][0-9]+)?)/i);
        if (!m || !m[1]) return 0;
        const n = Number(String(m[1]).replace(',', '.'));
        return Number.isFinite(n) ? Math.abs(n) : 0;
      })();

      const ref = String(p.reference_number || '').trim();
      const store = String(p.paid_by_store_name || '').trim();

      // IMPORTANT:
      // For "Paiement Global", the "Ref" column must be the user-entered reference (Réf de Paiement).
      // Do NOT auto-generate a default ref, so the accounting/management stays consistent.
      const documentNumber = ref || '-';

      allTransactions.push({
        category: 'Audit',
        type: 'Paiement Global',
        documentNumber,
        date: dateStr,
        // This row is a payment record; there is no invoice amount on the same line.
        totalAmount: 0,
        amountPaid: Number(p.amount || 0) || 0,
        remainingBalance: 0,
        discountAmount: finalDiscountAmount,
        status: 'Enregistré',
        notes: `Méthode: ${methodFr}${store ? ` • Magasin: ${store}` : ''}${p.notes ? ` • ${String(p.notes)
          .replace(/Global payment - applied across\s+(\d+)\s+item\(s\)/gi, 'Paiement global — appliqué sur $1 élément(s)')
          .replace(/Global payment - client balance was 0 \(history-only\)/gi, 'Paiement global — solde client déjà à 0 (historique uniquement)')
          }` : ''}`,
        sortDate: d ? new Date(d).getTime() : 0,
      });
    });

    // Add client remises (discounts) as dated rows (same requirement style as global payments)
    // If a remise exists on a specific day, it must appear as its own line in the report table.
    (clientDiscounts || []).forEach((d: any) => {
      const rawDate = d?.created_at || d?.discount_date || d?.date || d?.updated_at || null;
      const dateObj = rawDate ? new Date(rawDate) : null;
      const dateStr =
        dateObj && !Number.isNaN(dateObj.getTime())
          ? `${dateObj.toLocaleDateString('fr-FR')} ${dateObj.toLocaleTimeString('fr-FR')}`
          : '-';

      const rawRemise =
        d?.discount_amount ??
        d?.amount ??
        d?.value ??
        d?.remise_amount ??
        d?.remise ??
        0;
      const discountAmount = Math.abs(Number(rawRemise || 0) || 0);

      // Use a readable reference for the report line.
      // Avoid leaking UUIDs in the exported report.
      const looksLikeUuid = (v: any) => {
        const s = String(v || '').trim();
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
      };

      const rawRef = String(d?.reference_number || d?.reference || '').trim();
      const safeRef = rawRef && !looksLikeUuid(rawRef) ? rawRef : '';
      const documentNumber = safeRef || 'Remise';

      allTransactions.push({
        category: 'Audit',
        type: 'Remise',
        documentNumber,
        date: dateStr,
        totalAmount: 0,
        amountPaid: 0,
        remainingBalance: 0,
        discountAmount,
        status: String(d?.status || 'active').toLowerCase() === 'active' ? 'Active' : String(d?.status || '-'),
        notes: d?.notes ? String(d.notes) : 'Remise client',
        sortDate: dateObj && !Number.isNaN(dateObj.getTime()) ? dateObj.getTime() : 0,
      });
    });

    // Sort transactions by date
    allTransactions.sort((a, b) => a.sortDate - b.sortDate);

    // Calculate totals
    const totalAllAmount = allTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
    const totalAllPaid = allTransactions.reduce((sum, t) => sum + t.amountPaid, 0);
    const totalAllRemaining = allTransactions.reduce((sum, t) => sum + t.remainingBalance, 0);
    const totalAllDiscount = allTransactions.reduce((sum, t) => sum + (Number((t as any).discountAmount || 0) || 0), 0);

    return {
      allTransactions,
      totalAllAmount,
      totalAllPaid,
      totalAllRemaining,
      totalAllDiscount,
    };
  };

  const exportToExcel = () => {
    try {
      const { allTransactions, totalAllDiscount } = buildClientTransactionsForExport();

      // Build a more "report-like" Excel (HTML) matching the screenshot
      const money = (n: any) => `${(Number(n ?? 0) || 0).toFixed(2)} DH`;

      // Totals based on the report rows we export
      const totalFacture = totalInvoiced;
      const totalPaiement = totalPaid;
      // totalAllDiscount is already computed from exported rows (it includes both:
      // - explicit Remise rows (from clientDiscounts)
      // - any discount field included on global payment rows (if present)
      // So do NOT add clientDiscountTotal again, otherwise remises are double-counted.
      const totalRemis = totalAllDiscount;

      // IMPORTANT: allow negative values (client credit) in exports.
      // "Solde Restant" must be printed as-is (can be negative).
      const soldRest = totalRemaining;
      const soldRestApresRemise = totalRemaining - clientDiscountTotal;

      const rows = allTransactions
        // Include both Transaction + Audit (global payments) in the report table
        // Exclude ONLY global payments with 0.00 amounts (ledger-only records, historical entries)
        // Keep all invoices, sales/BLs, remises, etc. even if 0.00
        .filter((t) => (t.category === 'Transaction' || t.category === 'Audit') && 
                       !(t.type === 'Paiement Global' && 
                         Math.abs(Number(t.totalAmount || 0)) < 0.01 && 
                         Math.abs(Number(t.amountPaid || 0)) < 0.01 && 
                         Math.abs(Number(t.discountAmount || 0)) < 0.01))
        .map((t) => {
          // Map transaction into the screenshot columns
          const typePaiement = (() => {
            // Preferred: use the transaction type directly for cheque rows.
            if (String(t.type || '').toLowerCase().includes('chèque') || String(t.type || '').toLowerCase().includes('cheque')) {
              return 'chèque';
            }

            // Fallback: derive from notes when available.
            const n = String(t.notes || '').toLowerCase();
            if (n.includes('méthode:')) {
              // e.g. "Méthode: ESPECES"
              const extracted = String(t.notes).replace(/^.*Méthode:\s*/i, '').trim();
              // If the extracted info is just "-" or empty, fallback to '-'
              return extracted || '-';
            }
            return '-';
          })();

          const remise = Math.abs(Number((t as any).discountAmount || 0) || 0);

          return {
            date: t.date,
            ref: t.documentNumber,
            mntFact: money(t.totalAmount),
            paiement: money(t.amountPaid),
            remis: money(remise),
            typePaiement,
            statu: t.status,
          };
        });

      const htmlContent = `
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { font-family: Arial, sans-serif; margin: 24px; color: #000; }
              .title { text-align: center; font-weight: bold; font-size: 18px; margin: 10px 0 18px; }
              table { border-collapse: collapse; width: 720px; margin: 0 auto; }
              th, td { border: 1px solid #6b86c9; padding: 6px 8px; font-size: 12px; }
              .summary th { background: #b9c9ea; font-weight: bold; text-transform: uppercase; font-size: 11px; }
              .summary td { text-align: center; }
              .filter { width: 720px; margin: 6px auto 0; font-size: 12px; }
              .filter span { display: inline-block; padding: 2px 6px; border: 1px solid #6b86c9; }
              .filter .label { background: #b9c9ea; font-weight: bold; text-transform: uppercase; }
              .header th { background: #3f69c6; color: #fff; font-weight: bold; text-transform: uppercase; font-size: 11px; }
              .total-row td { background: #8fa9dd; font-weight: bold; }
              .right { text-align: right; }
              .center { text-align: center; }
            </style>
          </head>
          <body>
            <div class="title">RAPPORT CLIENT : ${String(client.name || '').toLowerCase()}</div>

            <table class="summary">
              <tr>
                <th>Montant de facture du</th>
                <th>Totale de paiement</th>
                <th>Totale de remis</th>
                <th>Sold rest</th>
              </tr>
              <tr>
                <td class="center">${money(totalFacture)}</td>
                <td class="center">${money(totalPaiement)}</td>
                <td class="center">${money(totalRemis)}</td>
                <td class="center">${money(soldRest)}</td>
              </tr>
            </table>

            <div class="filter">
              <span class="label">Filtrage</span>
              <span>${new Date(startDate).toLocaleDateString('fr-FR')} → ${new Date(endDate).toLocaleDateString('fr-FR')}</span>
            </div>

            <table>
              <thead class="header">
                <tr>
                  <th>Date</th>
                  <th>Ref/Vent ou Paiem statu</th>
                  <th>Mnt fc° du</th>
                  <th>Paiement</th>
                  <th>Remis</th>
                  <th>Type de paiement</th>
                  <th>Statu</th>
                </tr>
              </thead>
              <tbody>
                ${rows
                  .map(
                    (r) => `
                  <tr>
                    <td>${r.date}</td>
                    <td>${r.ref}</td>
                    <td class="right">${r.mntFact}</td>
                    <td class="right">${r.paiement}</td>
                    <td class="right">${r.remis}</td>
                    <td class="center">${r.typePaiement}</td>
                    <td class="center">${r.statu}</td>
                  </tr>
                `
                  )
                  .join('')}

                <tr class="total-row">
                  <td colspan="2">TOTALE</td>
                  <td class="right">${money(totalFacture)}</td>
                  <td class="right">${money(totalPaiement)}</td>
                  <td class="right">${money(totalRemis)}</td>
                  <td colspan="2"></td>
                </tr>

                <tr class="total-row">
                  <td colspan="2">REMISE CLIENT</td>
                  <td class="right">-</td>
                  <td class="right">-</td>
                  <td class="right">${money(clientDiscountTotal)}</td>
                  <td colspan="2"></td>
                </tr>

                <tr class="total-row">
                  <td colspan="2">SOLD REST</td>
                  <td class="right">-</td>
                  <td class="right">-</td>
                  <td class="right">${money(soldRest)}</td>
                  <td class="right">-</td>
                  <td class="right">-</td>
                </tr>

                <tr class="total-row">
                  <td colspan="2">SOLD REST APRÈS REMISE</td>
                  <td class="right">-</td>
                  <td class="right">-</td>
                  <td class="right">${money(soldRestApresRemise)}</td>
                  <td class="right">-</td>
                  <td class="right">-</td>
                </tr>
              </tbody>
            </table>
          </body>
        </html>
      `;

      const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      link.setAttribute('href', url);
      link.setAttribute('download', `Rapport_Client_${client.name}_${new Date().toISOString().split('T')[0]}.xls`);
      link.style.visibility = 'hidden';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('Rapport exporté avec succès');
    } catch (error) {
      console.error('Error exporting data:', error);
      toast.error("Erreur lors de l'export");
    }
  };

  const exportToPdf = () => {
    try {
      const { allTransactions, totalAllDiscount } = buildClientTransactionsForExport();

      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;
      if (end) end.setHours(23, 59, 59, 999);

      const money = (n: any) => `${(Number(n ?? 0) || 0).toFixed(2)} DH`;

      const totalFacture = totalInvoiced;
      const totalPaiement = totalPaid;
      // totalAllDiscount is already computed from exported rows (it includes both:
      // - explicit Remise rows (from clientDiscounts)
      // - any discount field included on global payment rows (if present)
      // So do NOT add clientDiscountTotal again, otherwise remises are double-counted.
      const totalRemis = totalAllDiscount;

      // IMPORTANT: allow negative values (client credit) in exports.
      const soldRest = totalRemaining;
      const soldRestApresRemise = totalRemaining - clientDiscountTotal;

      const rows = allTransactions
        // Do NOT print the cheque table/rows in the PDF report.
        // Keep only invoices/sales + audit (global payments/remises).
        // Exclude ONLY global payments with 0.00 amounts (ledger-only records, historical entries)
        // Keep all invoices, sales/BLs, remises, etc. even if 0.00
        .filter((t) => (t.category === 'Transaction' || t.category === 'Audit') && String(t.type || '').toLowerCase() !== 'chèque' && String(t.type || '').toLowerCase() !== 'cheque' && 
                       !(t.type === 'Paiement Global' && 
                         Math.abs(Number(t.totalAmount || 0)) < 0.01 && 
                         Math.abs(Number(t.amountPaid || 0)) < 0.01 && 
                         Math.abs(Number(t.discountAmount || 0)) < 0.01))
        .map((t: any) => {
          const typePaiement = (() => {
            // Keep this column VERY compact because long notes can consume whole pages.
            // We show only the important info:
            // - Payment method (short)
            // - Optional store (short)
            // - Optional global payment status (short)
            const notes = String(t.notes || '');

            // Extract method
            const m = notes.match(/Méthode:\s*([^•\n]+)/i);
            const method = m && m[1] ? m[1].trim() : '';

            // Extract store name
            const st = notes.match(/Magasin:\s*([^•\n]+)/i);
            const store = st && st[1] ? st[1].trim() : '';

            // Detect global-payment note type
            const lower = notes.toLowerCase();
            let gp = '';
            if (lower.includes('solde client déjà à 0')) gp = 'Hist.';
            else {
              const applied = notes.match(/appliqué\s+sur\s+(\d+)\s+élément/i);
              if (applied && applied[1]) gp = `Appliqué(${applied[1]})`;
            }

            const parts = [method || '-', store ? `Magasin:${store}` : '', gp].filter(Boolean);
            return parts.join(' | ');
          })();

          const remise = Math.abs(Number((t as any).discountAmount || 0) || 0);

          return [
            t.date,
            t.documentNumber,
            money(t.totalAmount),
            money(t.amountPaid),
            money(remise),
            typePaiement,
            t.status,
          ];
        });

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      // Title centered
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`RAPPORT CLIENT : ${String(client.name || '').toLowerCase()}`, 148.5, 20, { align: 'center' });

      // Summary table (like screenshot)
      (doc as any).autoTable({
        startY: 28,
        theme: 'grid',
        // Wider table so the last column is not cut off.
        tableWidth: 260,
        margin: { left: 20 },
        head: [[
          'MONTANT DE FACTEUR DU',
          'TOTALE DE\nPAIEMENT',
          'TOTALE DE\nREMIS',
          'SOLD REST',
          'SOLD REST\nAPRÈS REMISE',
        ]],
        body: [[
          money(totalFacture),
          money(totalPaiement),
          money(totalRemis),
          money(soldRest),
          money(soldRestApresRemise),
        ]],
        columnStyles: {
          0: { cellWidth: 85 },
          1: { cellWidth: 41 },
          2: { cellWidth: 41 },
          3: { cellWidth: 41 },
          4: { cellWidth: 52 },
        },
        styles: {
          fontSize: 9,
          halign: 'center',
          valign: 'middle',
          cellPadding: 2.2,
          lineColor: [107, 134, 201],
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: [185, 201, 234],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
        },
        bodyStyles: {
          textColor: [0, 0, 0],
        },
      });

      // Filtrage line
      const afterSummaryY = (doc as any).lastAutoTable?.finalY || 40;
      // Filtrage line (must reflect the selected date range)
      (doc as any).autoTable({
        startY: afterSummaryY + 2,
        theme: 'plain',
        tableWidth: 120,
        margin: { left: 58 },
        body: [[
          { content: 'FILTRAGE', styles: { fillColor: [185, 201, 234], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'left', lineWidth: 0.2, lineColor: [107, 134, 201] } },
          {
            content: `${startDate ? new Date(startDate).toLocaleDateString('fr-FR') : '-'} → ${endDate ? new Date(endDate).toLocaleDateString('fr-FR') : '-'}`,
            styles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'normal', halign: 'left', lineWidth: 0.2, lineColor: [107, 134, 201] },
          },
        ]],
        styles: { fontSize: 9, cellPadding: 1.5 },
      });

      const afterFilterY = (doc as any).lastAutoTable?.finalY || afterSummaryY + 10;

      // Main table
      // IMPORTANT (multi-page):
      // - We must NOT repeat totals on every page.
      // - We render the table body normally, then add ONE totals table after it.
      // - Also add a consistent header + page number footer on every page.
      const reportTitle = `RAPPORT CLIENT : ${String(client.name || '').toLowerCase()}`;
      const filterLabel = `${startDate ? new Date(startDate).toLocaleDateString('fr-FR') : '-'} → ${endDate ? new Date(endDate).toLocaleDateString('fr-FR') : '-'}`;

      (doc as any).autoTable({
        startY: afterFilterY + 4,
        theme: 'grid',
        tableWidth: 200,
        // Reserve top space so the first page header area is not too tight and
        // subsequent pages don't start too close to the top.
        margin: { left: 48, top: 26, bottom: 14 },
        head: [[
          'DATE',
          'REF/VENT OU PAIEM\nSTATU',
          'MNT FC° DU',
          'PAIEMENT',
          'REMIS',
          'TYPE DE PAIEMENT',
          'STATU',
        ]],
        body: rows,
        styles: {
          fontSize: 9,
          cellPadding: 2,
          lineColor: [107, 134, 201],
          lineWidth: 0.2,
          valign: 'middle',
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [63, 105, 198],
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center',
        },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 52 },
          2: { cellWidth: 30, halign: 'right', overflow: 'hidden' },
          3: { cellWidth: 30, halign: 'right', overflow: 'hidden' },
          4: { cellWidth: 30, halign: 'right', overflow: 'hidden' },
          5: { cellWidth: 30, halign: 'center' },
          6: { cellWidth: 22, halign: 'center' },
        },
        // Repeat ONLY the page number on each page.
        // We avoid re-drawing the report title/filtrage here because it can overlap
        // with the table header on page 2+ depending on autoTable pagination.
        didDrawPage: (data: any) => {
          const pageNumber = doc.getNumberOfPages();
          const pageHeight = doc.internal.pageSize.getHeight();
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.text(`Page ${pageNumber}`, 148.5, pageHeight - 8, { align: 'center' });
        },
      });

      // ONE totals block at the end (not repeated per page)
      // Make it compact + readable: 2-column summary (Label | Amount)
      const afterBodyY = (doc as any).lastAutoTable?.finalY || (afterFilterY + 10);

      const totalsRows: Array<[string, string]> = [
        ['Total Facturé', money(totalFacture)],
        ['Total Payé', money(totalPaiement)],
        ['Total Remise', money(totalRemis)],
        // Print both balances explicitly (even if negative)
        ['Solde Restant', money(soldRest)],
        ['Solde Restant (après remise)', money(soldRestApresRemise)],
      ];

      // Section title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      // Keep the recap block on one page (avoid splitting the last row)
      const pageHeight = doc.internal.pageSize.getHeight();
      const recapTitleYCurrent = afterBodyY + 8;
      const recapTableYCurrent = afterBodyY + 10;
      const approxRecapHeightMm = 6 + (totalsRows.length * 8) + 6;
      const needNewPage = (recapTableYCurrent + approxRecapHeightMm) > (pageHeight - 10);

      if (needNewPage) {
        doc.addPage();
      }

      const recapTitleY = needNewPage ? 18 : recapTitleYCurrent;
      const recapTableY = needNewPage ? 20 : recapTableYCurrent;

      doc.text('RÉCAPITULATIF', 48, recapTitleY);

      (doc as any).autoTable({
        startY: recapTableY,
        theme: 'grid',
        tableWidth: 120,
        margin: { left: 48 },
        head: [['', '']],
        body: totalsRows,
        styles: {
          fontSize: 9,
          cellPadding: 2.2,
          lineColor: [107, 134, 201],
          lineWidth: 0.2,
          valign: 'middle',
        },
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          lineWidth: 0,
          halign: 'left',
        },
        bodyStyles: {
          textColor: [0, 0, 0],
        },
        columnStyles: {
          0: { cellWidth: 80, fontStyle: 'bold' },
          1: { cellWidth: 40, halign: 'right', fontStyle: 'bold' },
        },
        didParseCell: (data: any) => {
          // Zebra rows
          if (data.section === 'body') {
            data.cell.styles.fillColor = data.row.index % 2 === 0 ? [240, 245, 255] : [255, 255, 255];
          }
          // Highlight last row (total général)
          if (data.section === 'body' && data.row.index === totalsRows.length - 1) {
            data.cell.styles.fillColor = [185, 201, 234];
          }
        },
        rowPageBreak: 'avoid',
      });

      const safeName = String(client.name || 'Client').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '_');
      doc.save(`Rapport_Client_${safeName}_${new Date().toISOString().split('T')[0]}.pdf`);

      toast.success('PDF exporté avec succès');
    } catch (error) {
      console.error('Error exporting client PDF:', error);
      toast.error("Erreur lors de l'export PDF");
    }
  };

  // Format counter to DD:HH:MM:SS format
  const formatCounter = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${String(days).padStart(2, '0')}:${String(hours).padStart(2, '0')}:${String(minutes).padStart(
      2,
      '0'
    )}:${String(secs).padStart(2, '0')}`;
  };

  // Get counter color based on remaining time
  const getCounterColor = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    if (days <= 7) {
      return '#ea580c'; // Orange warning
    }
    return '#3b82f6'; // Blue normal
  };

  // If showing invoice details page, render only that
  if (showInvoiceDetailsPage && selectedInvoice) {
    return (
      <InvoiceDetailsFullPage
        invoice={selectedInvoice}
        session={session}
        onBack={() => {
          setShowInvoiceDetailsPage(false);
          setSelectedInvoice(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 flex-1">
          <Button variant="outline" onClick={onBack} className="shrink-0">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>

          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 truncate">{client.name}</h1>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-600">
              <span>Détails du client</span>
              <span className={`${lastActivityDate ? 'text-gray-500' : 'text-red-500 font-medium'}`}>
                • {message}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {/* Status Badge */}
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                isInactive 
                  ? 'bg-red-100 text-red-700 border border-red-300' 
                  : daysRemaining <= 7
                  ? 'bg-orange-100 text-orange-700 border border-orange-300'
                  : 'bg-green-100 text-green-700 border border-green-300'
              }`}>
                <span className={`w-2 h-2 rounded-full ${
                  isInactive 
                    ? 'bg-red-500' 
                    : daysRemaining <= 7
                    ? 'bg-orange-500'
                    : 'bg-green-500'
                }`}></span>
                {isInactive ? 'INACTIF' : daysRemaining <= 7 ? `${daysRemaining}j RESTANTS` : 'ACTIF'}
              </div>

              {/* Counter */}
              <span
                className="text-xs font-semibold rounded-full px-3 py-1.5 font-mono bg-gray-100 text-gray-900 border border-gray-300"
              >
                {formatCounter(counterSeconds)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-end shrink-0">
          <div className="relative">
            <Button 
              onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Download className="w-4 h-4 mr-2" />
              Exporter
              <span className={`ml-2 transition-transform ${exportDropdownOpen ? 'rotate-180' : ''}`}>▼</span>
            </Button>

            {exportDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <button
                  onClick={() => {
                    exportToExcel();
                    setExportDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-100 flex items-center gap-2 text-gray-700 hover:text-blue-600 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span className="font-medium">Exporter Excel</span>
                </button>

                <button
                  onClick={() => {
                    exportToPdf();
                    setExportDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 flex items-center gap-2 text-gray-700 hover:text-blue-600 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  <span className="font-medium">Exporter PDF</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Date Range Filter */}
      <Card className="border-blue-200 bg-blue-50/60">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Calendar className="w-5 h-5 text-blue-600" />
              <span>Filtrer par Période</span>
            </CardTitle>

            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Reset to all data from first invoice/check to today
                  let earliestDate = new Date();

                  // Find earliest invoice date
                  if (allInvoices.length > 0) {
                    const firstInvoiceDate = new Date(
                      Math.min(...allInvoices.map((inv) => new Date(inv.created_at).getTime()))
                    );
                    if (firstInvoiceDate < earliestDate) {
                      earliestDate = firstInvoiceDate;
                    }
                  }

                  // Find earliest check date
                  if (allChecks.length > 0) {
                    const firstCheckDate = new Date(
                      Math.min(
                        ...allChecks.map((check) =>
                          new Date(check.created_at || check.due_date || check.execution_date).getTime()
                        )
                      )
                    );
                    if (firstCheckDate < earliestDate) {
                      earliestDate = firstCheckDate;
                    }
                  }

                  const today = new Date();
                  setStartDate(earliestDate.toISOString().split('T')[0]);
                  setEndDate(today.toISOString().split('T')[0]);
                  setShowFilters(false);
                  toast.success(
                    `Filtre réinitialisé: ${earliestDate.toLocaleDateString('fr-FR')} au ${today.toLocaleDateString(
                      'fr-FR'
                    )}`
                  );
                }}
                className="bg-white"
                title="Réinitialiser le filtre pour afficher toutes les données depuis la création du compte"
              >
                ↻ Réinitialiser
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="bg-white">
                <Filter className="w-4 h-4 mr-2" />
                {showFilters ? 'Masquer' : 'Afficher'}
              </Button>
            </div>
          </div>

          {!showFilters && (
            <p className="mt-2 text-sm text-blue-800">
              Période sélectionnée:{' '}
              <span className="font-semibold">
                {new Date(startDate).toLocaleDateString('fr-FR')} au {new Date(endDate).toLocaleDateString('fr-FR')}
              </span>
            </p>
          )}
        </CardHeader>

        {showFilters && (
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate" className="text-gray-700 font-medium">
                  Date de Début
                </Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border-blue-300 focus:border-blue-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate" className="text-gray-700 font-medium">
                  Date de Fin
                </Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border-blue-300 focus:border-blue-500"
                />
              </div>
            </div>
            <p className="text-sm text-blue-800 mt-4 font-medium">
              Période sélectionnée:{' '}
              <span className="font-semibold">
                {new Date(startDate).toLocaleDateString('fr-FR')} au {new Date(endDate).toLocaleDateString('fr-FR')}
              </span>
            </p>
          </CardContent>
        )}
      </Card>

      {/* Client Information - Organized Grid */}
      <Card>
        <CardHeader>
          <CardTitle>Détails du Client</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Contact Information */}
            <div className="space-y-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <Label className="text-xs font-semibold text-blue-700 uppercase">Télephone</Label>
              <p className="text-lg font-semibold text-gray-900">{client.phone || '-'}</p>
            </div>

            {/* ICE */}
            <div className="space-y-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
              <Label className="text-xs font-semibold text-purple-700 uppercase">ICE</Label>
              <p className="text-lg font-mono font-semibold text-gray-900">{client.ice || '-'}</p>
            </div>

            {/* IF */}
            <div className="space-y-2 p-3 bg-green-50 rounded-lg border border-green-200">
              <Label className="text-xs font-semibold text-green-700 uppercase">IF</Label>
              <p className="text-lg font-mono font-semibold text-gray-900">{client.if_number || '-'}</p>
            </div>

            {/* RC */}
            <div className="space-y-2 p-3 bg-orange-50 rounded-lg border border-orange-200">
              <Label className="text-xs font-semibold text-orange-700 uppercase">RC</Label>
              <p className="text-lg font-mono font-semibold text-gray-900">{client.rc || '-'}</p>
            </div>
          </div>

          {/* Address Section */}
          <div className="mt-4 pt-4 border-t">
            <Label className="text-xs font-semibold text-gray-700 uppercase block mb-2">Adresse</Label>
            <p className="text-gray-700 leading-relaxed">{client.address || '-'}</p>
          </div>

          {/* Fiscal Information */}
          <div className="mt-4 pt-4 border-t">
            <Label className="text-xs font-semibold text-gray-700 uppercase block mb-2">Informations Fiscales</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <span className="text-xs text-gray-600">Patente</span>
                <p className="text-sm font-semibold text-gray-900">{client.patente || '-'}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-gray-600">Créé par</span>
                <p className="text-sm font-semibold text-gray-900 break-all">{client.created_by_email || '-'}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-gray-600">Date de Création</span>
                <p className="text-sm font-semibold text-gray-900">
                  {client.created_at
                    ? new Date(client.created_at).toLocaleDateString('fr-FR', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })
                    : '-'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-800 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Total Facturé
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{totalInvoiced.toFixed(2)} MAD</p>
          </CardContent>
        </Card>

        <Card className="bg-green-50 border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-800 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Total Payé
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{totalPaid.toFixed(2)} MAD</p>
          </CardContent>
        </Card>

        <Card className="bg-yellow-50 border-yellow-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-800 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Remise
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-700">{clientDiscountTotal.toFixed(2)} MAD</p>
          </CardContent>
        </Card>

        <Card className="bg-red-50 border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-800 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Solde Restant après remise
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/*
              IMPORTANT: match "Mes Clients" table behavior.
              In the clients list, "Solde Restant" (après remise) is NOT clamped to 0 and can be negative (client credit).
              The details page should display the same number.
            */}
            <p className="text-2xl font-bold text-red-600">{(totalRemaining - clientDiscountTotal).toFixed(2)} MAD</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs (switch) to choose what table to display */}
      <div className="flex flex-wrap w-full bg-white p-1 h-auto gap-1 border-b border-gray-200 rounded-lg">
        <button
          type="button"
          onClick={() => setActiveTab('invoices')}
          className={`flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all flex-1 min-w-max ${
            activeTab === 'invoices'
              ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600'
              : 'hover:bg-gray-50 text-gray-600'
          }`}
        >
          <FileText className="w-5 h-5" />
          <span className="text-xs font-medium">Factures</span>
          <span className="text-lg font-bold">{invoices.length}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('global_payments')}
          className={`flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all flex-1 min-w-max ${
            activeTab === 'global_payments'
              ? 'bg-orange-50 border-b-2 border-orange-500 text-orange-600'
              : 'hover:bg-gray-50 text-gray-600'
          }`}
        >
          <Building2 className="w-5 h-5" />
          <span className="text-xs font-medium">Paiements Globaux</span>
          <span className="text-lg font-bold">{clientGlobalPayments.length}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sales')}
          className={`flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all flex-1 min-w-max ${
            activeTab === 'sales'
              ? 'bg-purple-50 border-b-2 border-purple-500 text-purple-600'
              : 'hover:bg-gray-50 text-gray-600'
          }`}
        >
          <ShoppingCart className="w-5 h-5" />
          <span className="text-xs font-medium">Ventes</span>
          <span className="text-lg font-bold">{sales.length}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('checks')}
          className={`flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all flex-1 min-w-max ${
            activeTab === 'checks'
              ? 'bg-green-50 border-b-2 border-green-500 text-green-600'
              : 'hover:bg-gray-50 text-gray-600'
          }`}
        >
          <CheckCircle className="w-5 h-5" />
          <span className="text-xs font-medium">Chèques</span>
          <span className="text-lg font-bold">{checks.length}</span>
        </button>
      </div>

      {/* Invoices Section */}
      {activeTab === 'invoices' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Factures ({invoices.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : invoices.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Aucune facture pour ce client</p>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N° Facture</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Montant Total</TableHead>
                      <TableHead>Remise</TableHead>
                      <TableHead>Montant Total après remise</TableHead>
                      <TableHead>Montant Payé</TableHead>
                      <TableHead>Solde (Reste)</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientInvoicesOnly.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-mono text-sm">{invoice.invoice_number}</TableCell>
                        <TableCell>{new Date(invoice.created_at).toLocaleDateString('fr-FR')}</TableCell>
                        <TableCell>{Number(invoice.__totalAmount).toFixed(2)} MAD</TableCell>
                        <TableCell className="text-amber-700">
                          {Number(
                            (invoice as any)?.pending_discount ??
                            (invoice as any)?.pendingDiscount ??
                            (invoice as any)?.total_remise ??
                            (invoice as any)?.totalRemise ??
                            (invoice as any)?.remise_amount ??
                            (invoice as any)?.remiseAmount ??
                            (invoice as any)?.discount_amount ??
                            (invoice as any)?.discountAmount ??
                            0
                          ).toFixed(2)}{' '}
                          MAD
                        </TableCell>
                        <TableCell>
                          {Math.max(
                            0,
                            (Number(invoice.__totalAmount) || 0) -
                              (Number((invoice as any)?.pending_discount ?? (invoice as any)?.total_remise ?? 0) || 0)
                          ).toFixed(2)}{' '}
                          MAD
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{Number(invoice.__amountPaidForClient).toFixed(2)} MAD</span>
                            {invoice.paid_by_store_name && (
                              <span className="text-xs text-purple-600 font-semibold">
                                (global payment by {invoice.paid_by_store_name})
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{Number(invoice.__remainingForClient).toFixed(2)} MAD</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              invoice.status === 'paid' ? 'default' : invoice.status === 'partial' ? 'secondary' : 'outline'
                            }
                          >
                            {invoice.status === 'paid' ? 'Payée' : invoice.status === 'partial' ? 'Partielle' : 'En attente'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-blue-600 hover:text-blue-700"
                            title="Voir les détails"
                            onClick={() => handleViewInvoice(invoice)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-green-600 hover:text-green-700"
                            title="Télécharger le PDF"
                            onClick={() => handleDownloadInvoicePDF(invoice)}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Global Payments Section */}
      {activeTab === 'global_payments' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-orange-600" />
              Paiements Globaux ({clientGlobalPayments.length})
              <span className="text-xs text-gray-500 font-normal">(n'affecte pas la dette du client)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : clientGlobalPayments.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Aucun paiement global enregistré</p>
            ) : (
              <div className="border rounded-lg overflow-x-auto bg-gradient-to-r from-orange-50 to-yellow-50 p-4">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-orange-100">
                      <TableHead className="text-orange-900">Date du Paiement</TableHead>
                      <TableHead className="text-orange-900">Magasin Payeur</TableHead>
                      <TableHead className="text-orange-900">Montant Payé</TableHead>
                      <TableHead className="text-orange-900">Remise</TableHead>
                      <TableHead className="text-orange-900">Méthode</TableHead>
                      <TableHead className="text-orange-900">Référence</TableHead>
                      <TableHead className="text-orange-900">Effectué Par</TableHead>
                      <TableHead className="text-orange-900">Notes</TableHead>
                      <TableHead className="text-orange-900 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientGlobalPayments.map((payment) => {
                      const createdByEmail = payment.created_by_email || payment.created_by || '-';
                      const isAdminPayment = Boolean(payment.is_admin_payment);

                      // Remise for this global payment is NOT stored on client_global_payments.
                      // It's stored in `discounts` as a separate operation (see Remise card / exports).
                      // So, unless backend sends a remise field on the payment row, this will be 0.
                      // Prefer the canonical per-payment discount sum from /discounts (ref_id = payment.id).
                      // Fallback to whatever the backend returns if there are no linked discounts.
                      const remiseFromDiscounts = payment?.id
                        ? (remiseByGlobalPaymentId.get(String(payment.id)) || 0)
                        : 0;

                      const backendRemise = Math.abs(
                        Number(
                          (payment as any)?.remise_display_amount ??
                          (payment as any)?.remise_amount ??
                          (payment as any)?.discount_amount ??
                          (payment as any)?.remise ??
                          0
                        ) || 0
                      );

                      return (
                        <TableRow key={`payment-${payment.id}`} className="hover:bg-orange-100 transition-colors">
                          <TableCell className="text-sm font-semibold">
                            {new Date(payment.payment_date || payment.created_at).toLocaleDateString('fr-FR')}
                          </TableCell>

                          <TableCell>
                            <span className="inline-flex items-center gap-2 px-3 py-1 bg-orange-200 text-orange-800 rounded-full text-xs font-semibold">
                              <span>{payment.paid_by_store_name || '-'}</span>
                              {isAdminPayment && (
                                <span className="text-purple-800 font-bold">• Par Admin</span>
                              )}
                            </span>
                          </TableCell>

                          <TableCell className="font-semibold text-green-600">{Number(payment.amount || 0).toFixed(2)} MAD</TableCell>

                          <TableCell className="font-semibold text-yellow-700">
                            {Number(
                              (payment?.id
                                ? (remiseByGlobalPaymentId.get(String(payment.id)) || 0)
                                : 0) ||
                                Math.abs(
                                  Number(
                                    (payment as any)?.remise_display_amount ??
                                      (payment as any)?.remise_amount ??
                                      (payment as any)?.discount_amount ??
                                      (payment as any)?.remise ??
                                      0
                                  ) || 0
                                )
                            ).toFixed(2)}{' '}
                            MAD
                          </TableCell>

                          <TableCell className="text-sm">
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold">
                              {String(payment.payment_method || '-').toUpperCase()}
                            </span>
                          </TableCell>

                          <TableCell className="text-sm">
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-semibold break-all">
                              {payment.reference_number || '-'}
                            </span>
                          </TableCell>

                          <TableCell className="text-sm">
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-semibold break-all">
                              {createdByEmail}
                            </span>
                          </TableCell>

                          <TableCell className="text-sm text-gray-600 max-w-xs">
                            <div className="space-y-1">
                              {payment.notes ? (
                                <p className="text-xs font-medium text-gray-700">{payment.notes}</p>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </div>
                          </TableCell>

                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-orange-700 hover:text-orange-800"
                              title="Modifier"
                              onClick={() => openEditGlobalPayment(payment)}
                            >
                              <Pencil className="w-4 h-4" />
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
      )}

      {/* Sales Section */}
      {activeTab === 'sales' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Ventes ({sales.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : sales.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Aucune vente pour ce client</p>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N° Vente</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Montant Total</TableHead>
                      <TableHead>Remise</TableHead>
                      <TableHead>Montant Total après remise</TableHead>
                      <TableHead>Montant Payé</TableHead>
                      <TableHead>Solde (Reste)</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-sm">{s.sale_number}</TableCell>
                        <TableCell>{(s as any).execution_date ? new Date((s as any).execution_date).toLocaleDateString('fr-FR') : new Date(s.created_at).toLocaleDateString('fr-FR')}</TableCell>
                        <TableCell>{(Number(s.total_amount || 0) || 0).toFixed(2)} MAD</TableCell>
                        <TableCell className="text-amber-700">{(Number((s as any).total_remise ?? (s as any).totalRemise ?? 0) || 0).toFixed(2)} MAD</TableCell>
                        <TableCell>
                        {(
                        Math.max(
                        0,
                        (Number(s.total_amount || 0) || 0) -
                        (Number((s as any).total_remise ?? (s as any).totalRemise ?? 0) || 0)
                        )
                        ).toFixed(2)}{' '}
                        MAD
                        </TableCell>
                        <TableCell>{(Number(computeSalePaid(s)) || 0).toFixed(2)} MAD</TableCell>
                        <TableCell>
                        {(
                        Math.max(
                        0,
                        Math.max(
                        0,
                        (Number(s.total_amount || 0) || 0) -
                        (Number((s as any).total_remise ?? (s as any).totalRemise ?? 0) || 0)
                        ) - (Number(computeSalePaid(s)) || 0)
                        )
                        ).toFixed(2)}{' '}
                        MAD
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              s.payment_status === 'paid' ? 'default' : s.payment_status === 'partial' ? 'secondary' : 'outline'
                            }
                          >
                            {s.payment_status === 'paid' ? 'Payée' : s.payment_status === 'partial' ? 'Partielle' : 'Non payée'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-green-600 hover:text-green-700"
                            title="Télécharger le Bon de Livraison"
                            onClick={() => handleDownloadSaleBL(s)}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Checks Section */}
      {activeTab === 'checks' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Chèques ({checks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : checks.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Aucun chèque pour ce client</p>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N° Chèque</TableHead>
                      <TableHead>Montant</TableHead>
                      <TableHead>Date d'Échéance</TableHead>
                      <TableHead>Solde Restant</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {checks.map((check) => (
                      <TableRow key={check.id}>
                        <TableCell className="font-mono text-sm">{check.check_id_number}</TableCell>
                        <TableCell>{check.amount_value?.toFixed(2)} MAD</TableCell>
                        <TableCell>
                          {(() => {
                            const raw = check.due_date || check.execution_date || null;
                            if (!raw) return '-';

                            const d = new Date(raw);
                            if (Number.isNaN(d.getTime())) {
                              // fallback if backend sends a non-ISO date string
                              return String(raw);
                            }

                            return d.toLocaleDateString('fr-FR');
                          })()}
                        </TableCell>
                        <TableCell>{check.remaining_balance?.toFixed(2)} MAD</TableCell>
                        <TableCell className="text-right space-x-2">
                        <Button
                        size="sm"
                        variant="ghost"
                        className="text-blue-600 hover:text-blue-700"
                        title="Voir les détails"
                        onClick={() => {
                        setSelectedCheck(check);
                        setShowCheckDetails(true);
                        }}
                        >
                        <Eye className="w-4 h-4" />
                        </Button>
                        {(check?.image_url || check?.pdf_url) && (
                        <Button
                        size="sm"
                        variant="ghost"
                        className="text-green-600 hover:text-green-700"
                        title={check?.image_url ? "Télécharger l'image" : 'Télécharger le PDF'}
                        onClick={() => handleDownloadCheckDocument(check)}
                        >
                        <Download className="w-4 h-4" />
                        </Button>
                        )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit Global Payment Modal */}
      <Dialog
        open={editGpOpen}
        onOpenChange={(open) => {
          setEditGpOpen(open);
          if (!open) {
            setEditingGlobalPayment(null);
            setEditGpSaving(false);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between w-full">
              <DialogTitle>Modifier Paiement Global</DialogTitle>
              <Button variant="ghost" size="sm" onClick={() => setEditGpOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Montant (MAD)</Label>
                <Input value={editGpAmount} onChange={(e) => setEditGpAmount(e.target.value)} placeholder="0.00" />
              </div>

              <div className="space-y-2">
                <Label>Méthode</Label>
                <select
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  value={editGpMethod}
                  onChange={(e) => setEditGpMethod(e.target.value)}
                >
                  <option value="cash">Espèces</option>
                  <option value="check">Chèque</option>
                  <option value="bank_transfer">Virement bancaire</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={editGpDate} onChange={(e) => setEditGpDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={editGpNotes} onChange={(e) => setEditGpNotes(e.target.value)} placeholder="Notes..." />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditGpOpen(false)} disabled={editGpSaving}>
                Annuler
              </Button>
              <Button
                style={{ backgroundColor: '#ea580c', color: 'white', border: '1px solid #7c2d12' }}
                onClick={submitEditGlobalPayment}
                disabled={editGpSaving}
              >
                {editGpSaving ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enregistrement...
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
                    <Save className="w-4 h-4" />
                    Enregistrer
                  </span>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Check Details Modal */}
      <Dialog open={showCheckDetails} onOpenChange={setShowCheckDetails}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between w-full">
              <DialogTitle>Détails du Chèque</DialogTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowCheckDetails(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </DialogHeader>
          {selectedCheck && (
            <div className="space-y-6">
              {/* Check Header */}
              <div className="border-b pb-4">
                <h3 className="text-lg font-semibold text-gray-900">Chèque #{selectedCheck.check_id_number}</h3>
                <p className="text-sm text-gray-600 mt-1">Créé le: {new Date(selectedCheck.created_at).toLocaleDateString('fr-FR')}</p>
              </div>

              {/* Check Information */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-600">N° Chèque</p>
                  <p className="text-gray-900 font-mono">{selectedCheck.check_id_number}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Montant</p>
                  <p className="text-gray-900 font-semibold text-lg">{selectedCheck.amount_value?.toFixed(2)} MAD</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Date d'Échéance</p>
                  <p className="text-gray-900">
                    {selectedCheck.due_date
                      ? new Date(selectedCheck.due_date).toLocaleDateString('fr-FR')
                      : selectedCheck.execution_date
                        ? new Date(selectedCheck.execution_date).toLocaleDateString('fr-FR')
                        : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Donné à</p>
                  <p className="text-gray-900">{selectedCheck.given_to || '-'}</p>
                </div>
              </div>

              {/* Balance */}
              <div className="bg-gray-50 p-4 rounded-lg space-y-3">
              <div className="flex justify-between">
              <span className="text-gray-600">Montant Total:</span>
              <span className="font-semibold text-gray-900">{selectedCheck.amount_value?.toFixed(2)} MAD</span>
              </div>
                <div className="flex justify-between border-t pt-3">
                  <span className="text-gray-600">Solde Restant:</span>
                  <span className="font-semibold text-orange-600">{selectedCheck.remaining_balance?.toFixed(2)} MAD</span>
                </div>
              </div>

              {/* Additional Information */}
              {selectedCheck.notes && (
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-1">Notes</p>
                  <p className="text-gray-900">{selectedCheck.notes}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowCheckDetails(false)} className="flex-1">
                  Fermer
                </Button>
                {(selectedCheck?.image_url || selectedCheck?.pdf_url) && (
                <Button
                onClick={() => {
                handleDownloadCheckDocument(selectedCheck);
                setShowCheckDetails(false);
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                <Download className="w-4 h-4 mr-2" />
                Télécharger Document
                </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Invoice Details Full Page is rendered via the early return above */}
    </div>
  );
}
