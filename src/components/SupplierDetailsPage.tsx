import { useEffect, useMemo, useState } from 'react';
import { projectId } from '../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ArrowLeft, Download, FileText, Eye, DollarSign, CheckCircle } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface SupplierDetailsPageProps {
  supplier: any;
  session: any;
  onBack: () => void;
  onSupplierUpdate?: (updatedSupplier: any) => void;
}

export function SupplierDetailsPage({ supplier, session, onBack, onSupplierUpdate }: SupplierDetailsPageProps) {
  // Local state for supplier that can be updated after corrections
  const [localSupplier, setLocalSupplier] = useState(supplier);

  // Update localSupplier when prop changes
  useEffect(() => {
    setLocalSupplier(supplier);
  }, [supplier?.id]);
  // NOTE:
  // `supplierProducts` is used for the "Achat" (stock additions) tab.
  // It MUST be immutable history, not the current `products` table, otherwise edits/restocks
  // will rewrite the past.
  // Source of truth: `product_additions_history` (append-only).
  const [supplierProducts, setSupplierProducts] = useState<any[]>([]);

  // Payment correction (audit-safe) UI state
  const [showCorrectPaymentModal, setShowCorrectPaymentModal] = useState(false);
  const [correctPaymentLoading, setCorrectPaymentLoading] = useState(false);
  const [selectedPaymentForCorrection, setSelectedPaymentForCorrection] = useState<any | null>(null);
  const [correctNewAmount, setCorrectNewAmount] = useState<string>('');
  const [correctReason, setCorrectReason] = useState<string>('');
  const [correctOperationType, setCorrectOperationType] = useState<string>(''); // 'Paiement', 'Avance', 'Facture', 'Remise'

  // Advance correction UI state
  const [showCorrectAdvanceModal, setShowCorrectAdvanceModal] = useState(false);
  const [selectedAdvanceForCorrection, setSelectedAdvanceForCorrection] = useState<any | null>(null);
  const [correctAdvanceNewAmount, setCorrectAdvanceNewAmount] = useState<string>('');
  const [correctAdvanceReason, setCorrectAdvanceReason] = useState<string>('');

  // Invoice (Facture) correction UI state
  const [showCorrectInvoiceModal, setShowCorrectInvoiceModal] = useState(false);
  const [selectedInvoiceForCorrection, setSelectedInvoiceForCorrection] = useState<any | null>(null);
  const [correctInvoiceNewAmount, setCorrectInvoiceNewAmount] = useState<string>('');
  const [correctInvoiceReason, setCorrectInvoiceReason] = useState<string>('');

  // Discount (Remise) correction UI state
  const [showCorrectDiscountModal, setShowCorrectDiscountModal] = useState(false);
  const [selectedDiscountForCorrection, setSelectedDiscountForCorrection] = useState<any | null>(null);
  const [correctDiscountNewAmount, setCorrectDiscountNewAmount] = useState<string>('');
  const [correctDiscountReason, setCorrectDiscountReason] = useState<string>('');

  // Enable correction buttons for all users for testing
  // TODO: Restore role check after testing
  const isAdminLike = useMemo(() => {
    return true; // Temporarily enable for all users
    // const role = String(session?.user?.user_metadata?.role || '').toLowerCase();
    // return role === 'admin' || role === 'manager' || role === 'magasin_manager';
  }, [session]);
  const [productsLoading, setProductsLoading] = useState<boolean>(false);
  const [productsSearch, setProductsSearch] = useState<string>('');

  const [supplierPayments, setSupplierPayments] = useState<any[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState<boolean>(false);
  const [paymentsSearch, setPaymentsSearch] = useState<string>('');

  // Admin-supplier specific invoices (Fournisseur Admin flow)
  const [adminSupplierInvoices, setAdminSupplierInvoices] = useState<any[]>([]);
  const [adminInvoicesLoading, setAdminInvoicesLoading] = useState<boolean>(false);

  const [supplierAdvances, setSupplierAdvances] = useState<any[]>([]);
  const [advancesLoading, setAdvancesLoading] = useState<boolean>(false);
  const [advancesSearch, setAdvancesSearch] = useState<string>('');

  const [supplierPassages, setSupplierPassages] = useState<any[]>([]);
  const [passagesLoading, setPassagesLoading] = useState<boolean>(false);
  const [passagesSearch, setPassagesSearch] = useState<string>('');

  // Discounts (Remise) for this supplier (needed to match SuppliersModule table numbers)
  const [supplierDiscounts, setSupplierDiscounts] = useState<any[]>([]);
  const [discountsLoading, setDiscountsLoading] = useState<boolean>(false);

  // Checks used under this supplier
  const [supplierChecksUsed, setSupplierChecksUsed] = useState<any[]>([]);
  const [checksLoading, setChecksLoading] = useState<boolean>(false);
  const [checksSearch, setChecksSearch] = useState<string>('');

  // Date range filter (affects payments view + export) - starts empty to show all records by default
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'operations' | 'passages' | 'stock' | 'checks'>('operations');
  const [selectedStockRef, setSelectedStockRef] = useState<string | null>(null);
  const [showStockRefDetails, setShowStockRefDetails] = useState(false);

  // Stock reference details (modal)
  const [stockRefDetailsData, setStockRefDetailsData] = useState<any | null>(null);
  const [stockRefDetailsLoading, setStockRefDetailsLoading] = useState<boolean>(false);

  // Date filter - removed default initialization to show all records by default

  useEffect(() => {
    fetchSupplierProducts();
    fetchSupplierPayments();
    fetchSupplierAdvances();
    fetchSupplierPassages();
    fetchAdminSupplierInvoices();
    fetchSupplierChecksUsed();
    fetchSupplierDiscounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplier?.id]);

  // Keep the "Achat" table fresh when the user returns to this page.
  // product_additions_history can be edited from StockReferenceHistoryModule.
  useEffect(() => {
    const onFocus = () => {
      fetchSupplierProducts();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplier?.id]);

  const fetchStockRefDetails = async (stockRef: string) => {
    const ref = String(stockRef || '').trim();
    if (!ref) {
      setStockRefDetailsData(null);
      return;
    }

    try {
      setStockRefDetailsLoading(true);

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/stock-reference-details?stock_reference=${encodeURIComponent(ref)}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!res.ok) {
        setStockRefDetailsData(null);
        return;
      }

      const data = await res.json().catch(() => ({}));
      // endpoint may return { details } OR direct object
      const details = (data as any)?.details ?? data;
      setStockRefDetailsData(details || null);
    } catch (e) {
      console.error('Error fetching stock reference details:', e);
      setStockRefDetailsData(null);
    } finally {
      setStockRefDetailsLoading(false);
    }
  };

  const fetchSupplierProducts = async () => {
    // IMPORTANT FIX:
    // "Détails du fournisseur" -> "Achat" must come from immutable history.
    // We use `product_additions_history` (append-only) via the super-handler endpoint.
    // Each row is a separate stock addition line, even if the same reference/stock_reference
    // appears multiple times.
    try {
      setProductsLoading(true);

      const qs = new URLSearchParams();
      if (supplier?.id) qs.set('supplier_id', String(supplier.id));
      if (supplier?.store_id) qs.set('store_id', String(supplier.store_id));

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/product-additions-history?${qs.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!res.ok) {
        setSupplierProducts([]);
        return;
      }

      const data = await res.json().catch(() => ({}));
      const rows = Array.isArray((data as any)?.history)
        ? (data as any).history
        : Array.isArray((data as any)?.product_additions_history)
          ? (data as any).product_additions_history
          : Array.isArray((data as any)?.rows)
            ? (data as any).rows
            : Array.isArray((data as any)?.data)
              ? (data as any).data
              : [];

      // CRITICAL FIX:
      // The backend endpoint currently does NOT filter by supplier_id.
      // Filter client-side so each supplier only sees its own history.
      const supplierIdStr = String(supplier?.id || '').trim();
      const filtered = supplierIdStr
        ? (rows || []).filter((r: any) => String(r?.supplier_id || '').trim() === supplierIdStr)
        : [];

      // Sort newest first (UI expectation)
      const list = (filtered || []).slice().sort((a: any, b: any) => {
        const da = new Date(a?.created_at || 0).getTime();
        const db = new Date(b?.created_at || 0).getTime();
        return db - da;
      });

      setSupplierProducts(list);
    } catch (e) {
      console.error('Error fetching supplier products history:', e);
      setSupplierProducts([]);
    } finally {
      setProductsLoading(false);
    }
  };

  const fetchSupplierPayments = async () => {
    // Source = global supplier payments stored in `payments` table.
    // For admin suppliers, payments are usually stored as store_global_payments, so this list can legitimately be empty.
    try {
      setPaymentsLoading(true);

      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/payments`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        setSupplierPayments([]);
        return;
      }

      const data = await res.json();
      const all = data.payments || [];

      const supplierId = String(supplier?.id || '');
      const list = all
        .filter((p: any) => String(p?.supplier_id || '') === supplierId)
        .sort((a: any, b: any) => {
          const da = new Date(a?.payment_date || a?.created_at || 0).getTime();
          const db = new Date(b?.payment_date || b?.created_at || 0).getTime();
          return db - da;
        });

      setSupplierPayments(list);
    } catch (e) {
      console.error('Error fetching supplier payments:', e);
      setSupplierPayments([]);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const fetchAdminSupplierInvoices = async () => {
    // For admin-linked suppliers: show invoices created by the Fournisseur Admin flow.
    // These invoices are stored in admin_supplier_invoices and represent the “TOTAL FACTURÉ”.
    const adminUserId = String(supplier?.admin_user_id || '').trim();
    if (!adminUserId) {
      setAdminSupplierInvoices([]);
      return;
    }

    try {
      setAdminInvoicesLoading(true);

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/admin-supplier-invoices?admin_user_id=${encodeURIComponent(adminUserId)}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        console.error('Error fetching admin supplier invoices:', res.status, t);
        setAdminSupplierInvoices([]);
        return;
      }

      const data = await res.json().catch(() => ({}));
      const rows = Array.isArray(data?.invoices) ? data.invoices : Array.isArray(data?.admin_supplier_invoices) ? data.admin_supplier_invoices : [];

      // normalize
      const list = rows
        .map((r: any) => {
          const rawDate = r.invoice_date || r.created_at || null;
          return {
            ...r,
            __dateRaw: rawDate,
            __amount: Number(r.total_amount || r.amount || 0) || 0,
          };
        })
        .sort((a: any, b: any) => {
          const da = new Date(a.__dateRaw || 0).getTime();
          const db = new Date(b.__dateRaw || 0).getTime();
          return db - da;
        });

      setAdminSupplierInvoices(list);
    } catch (e) {
      console.error('Error fetching admin supplier invoices:', e);
      setAdminSupplierInvoices([]);
    } finally {
      setAdminInvoicesLoading(false);
    }
  };

  const fetchSupplierAdvances = async () => {
    try {
      setAdvancesLoading(true);

      // We reuse the same role/store enforcement as the backend.
      // For non-admin user: store scope is inferred by backend.
      // For admin: if supplier has store_id, backend accepts store scope when provided.
      const qs = new URLSearchParams();
      if (supplier?.id) qs.set('supplier_id', String(supplier.id));
      if (supplier?.store_id) qs.set('store_id', String(supplier.store_id));

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/supplier-advances?${qs.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!res.ok) {
        setSupplierAdvances([]);
        return;
      }

      const data = await res.json();
      setSupplierAdvances((data.advances || []) as any[]);
    } catch (e) {
      console.error('Error fetching supplier advances:', e);
      setSupplierAdvances([]);
    } finally {
      setAdvancesLoading(false);
    }
  };

  const fetchSupplierPassages = async () => {
    try {
      setPassagesLoading(true);

      const qs = new URLSearchParams();
      if (supplier?.id) qs.set('supplier_id', String(supplier.id));
      if (supplier?.store_id) qs.set('store_id', String(supplier.store_id));

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/supplier-passages?${qs.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!res.ok) {
        setSupplierPassages([]);
        return;
      }

      const data = await res.json();
      setSupplierPassages((data.passages || []) as any[]);
    } catch (e) {
      console.error('Error fetching supplier passages:', e);
      setSupplierPassages([]);
    } finally {
      setPassagesLoading(false);
    }
  };

  const fetchSupplierDiscounts = async () => {
    try {
      setDiscountsLoading(true);

      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/discounts`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        setSupplierDiscounts([]);
        return;
      }

      const data = await res.json().catch(() => ({}));
      const all = Array.isArray(data?.discounts) ? data.discounts : [];
      const supplierId = String(supplier?.id || '');

      // SuppliersModule filters by d.supplier_id
      const list = all.filter((d: any) => String(d?.supplier_id || '') === supplierId);
      setSupplierDiscounts(list);
    } catch (e) {
      console.error('Error fetching supplier discounts:', e);
      setSupplierDiscounts([]);
    } finally {
      setDiscountsLoading(false);
    }
  };

  const fetchSupplierChecksUsed = async () => {
    // We show checks used under this supplier from BOTH sources:
    // 1) Coffre checks (check_safe) used via supplier advances paid by check.
    // 2) Check inventory (check_inventory) when supplier payments/global payments reference check ids.
    try {
      setChecksLoading(true);

      // 1) Load supplier advances so we can find which check_safe_id was used for this supplier.
      const qs = new URLSearchParams();
      if (supplier?.id) qs.set('supplier_id', String(supplier.id));
      if (supplier?.store_id) qs.set('store_id', String(supplier.store_id));

      const advRes = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/supplier-advances?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!advRes.ok) {
        setSupplierChecksUsed([]);
        return;
      }

      const advData = await advRes.json().catch(() => ({}));
      const advances = Array.isArray(advData?.advances) ? advData.advances : [];

      const checkAdvances = advances.filter((a: any) => {
        const m = String(a?.payment_method || '').toLowerCase();
        return m === 'check' || m.includes('chèque') || m.includes('cheque');
      });

      // Exact amount used for THIS supplier is the sum of the advances amounts per check.
      const usedAmountByCheckId = new Map<string, number>();
      const checkSafeIds: string[] = Array.from(
        new Set(
          checkAdvances
            .map((a: any) => {
              const id = a?.check_safe_id || a?.checkSafeId || a?.selected_check_safe_id;
              if (!id) return null;
              const key = String(id);
              const amt = Number(a?.amount || 0) || 0;
              usedAmountByCheckId.set(key, (usedAmountByCheckId.get(key) || 0) + amt);
              return key;
            })
            .filter((v: any): v is string => v !== null && v !== undefined)
            .map((v: any) => String(v))
        )
      );

      // Do not early-return here; supplier may have check_inventory-linked checks even if
      // there are no coffre (check_safe) advances.

      // 2) Get check_safe rows for these ids (only if we have any)
      const safeById = new Map<string, any>();
      if (checkSafeIds.length > 0) {
        const safeRes = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/check-safe`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        const safeRows = safeRes.ok ? ((await safeRes.json().catch(() => ({})))?.check_safe || []) : [];
        (safeRows || []).forEach((r: any) => {
          if (r?.id) safeById.set(String(r.id), r);
        });
      }

      // 3) Get check_safe_usages (to compute amounts used)
      // We have a backend endpoint that returns usage totals per check by coffer_id.
      // For supplier details, we can just compute from check_safe_usages table by fetching all rows.
      // The super-handler doesn't expose a dedicated endpoint for it, so we fallback to using the totals endpoint
      // when coffer_id is available on the check.

      const out: any[] = [];

      // 4) Add coffre checks (check_safe)
      checkSafeIds.forEach((id) => {
        const chk = safeById.get(id) || {};
        const amount = usedAmountByCheckId.get(id) ?? 0;
        const check_number = chk?.check_number || chk?.check_id_number || chk?.check_number_value || chk?.check_number || '-';
        const status = chk?.status || '-';
        const check_date = chk?.check_date || chk?.created_at || null;
        const giver_name = chk?.giver_name || chk?.given_to || null;
        const coffer_id = chk?.coffer_id || null;

        out.push({
          id: `safe:${id}`,
          source: 'check_safe',
          check_number,
          amount,
          status,
          check_date,
          giver_name,
          coffer_id,
          check_safe_id: id,
        });
      });

      // 4b) Fallback for "Avance" rows that have payment_method='check' BUT no linked check id.
      // This happens when the advance is recorded as a cheque payment but the selected check reference
      // was not persisted (check_safe_id / check_inventory_id missing).
      // In that case, still show the advances in the checks tab as "paiement chèque" rows,
      // so the UI doesn't incorrectly show 0.
      checkAdvances
        .filter((a: any) => {
          const hasAnyLink = !!(a?.check_safe_id || a?.checkSafeId || a?.selected_check_safe_id || a?.check_inventory_id || a?.check_id || a?.checkId);
          return !hasAnyLink;
        })
        .forEach((a: any) => {
          const amt = Number(a?.amount || 0) || 0;
          const rawDate = a?.created_at || null;
          const possibleNum = String(a?.check_reference || a?.reference || a?.bank_transfer_reference || '').trim();

          out.push({
            id: `advance-check-unlinked:${a?.id || rawDate || Math.random().toString(16).slice(2)}`,
            source: 'supplier_advances',
            check_number: possibleNum || '-',
            amount: amt,
            status: 'AVANCE',
            check_date: rawDate,
            giver_name: a?.created_by_email || a?.created_by || null,
            coffer_id: a?.coffer_id || a?.coffer_name || null,
            supplier_advance_id: a?.id || null,
          });
        });

      // 5) Add check_inventory checks referenced by supplier operations.
      // Sources:
      // - payments table (legacy supplier payments)
      // - supplier_passages (paiement passager)
      // - store_global_payments (Paiement Global Fournisseur - Coffre)
      //
      // IMPORTANT: several endpoints return ALL rows (ignoring supplier query params),
      // so we always fetch and filter client-side.
      try {
        const supplierIdStr = String(supplier?.id || '');

        // Helper: parse check_ids_used which can be JSON array string OR comma-separated.
        const parseCheckIdsUsed = (v: any): string[] => {
          const raw = String(v ?? '').trim();
          if (!raw) return [];

          // Try JSON first
          if ((raw.startsWith('[') && raw.endsWith(']')) || (raw.startsWith('"[') && raw.endsWith(']"'))) {
            try {
              const json = JSON.parse(raw.startsWith('"') ? JSON.parse(raw) : raw);
              if (Array.isArray(json)) return json.map((x) => String(x).trim()).filter(Boolean);
            } catch {
              // ignore
            }
          }

          // Fallback to comma-separated
          return raw
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
        };

        const isCheckMethod = (m: any) => {
          const mm = String(m || '').toLowerCase();
          return mm === 'check' || mm.includes('cheque') || mm.includes('chèque');
        };

        // A) payments
        const payRes = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/payments`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const pays = payRes.ok ? ((await payRes.json().catch(() => ({})))?.payments || []) : [];
        const supplierPays = (pays || []).filter((p: any) => String(p?.supplier_id || '') === supplierIdStr);
        const checkPaymentsFromPayments = supplierPays.filter((p: any) => isCheckMethod(p?.payment_method));

        // A2) Fallback: some deployments store "Paiement Global Fournisseur" into payments table (not store_global_payments)
        // and only mark it inside notes/reason (ex: "Paiement global pour <supplier>").
        // If the method is check, treat it as check payment even if supplier_id is missing.
        const looseGlobalSupplierPays = (pays || []).filter((p: any) => {
          if (!isCheckMethod(p?.payment_method)) return false;

          // Sometimes "Paiement global" is in notes, sometimes in reason, sometimes capitalized.
          const notes = String(p?.notes || '').toLowerCase();
          const reason = String(p?.reason || '').toLowerCase();
          const hay = `${notes} ${reason}`.trim();

          // Match either supplier id, supplier name, OR the reference shown in UI.
          const matchesId = supplierIdStr ? hay.includes(supplierIdStr.toLowerCase()) : false;
          const supplierName = String(supplier?.name || '').toLowerCase();
          const matchesName = supplierName ? hay.includes(supplierName) : false;

          // SupplierDetails operations table shows payments.reference_number.
          // If the note contains PAY-xxxx or the row itself is PAY-xxxx, keep it.
          const ref = String(p?.reference_number || p?.reference || '').toLowerCase();
          const looksLikePay = ref.startsWith('pay-') || hay.includes('pay-');

          const isGlobal = hay.includes('paiement global') || hay.includes('global') || hay.includes('paiement_global');

          return isGlobal && (matchesId || matchesName || looksLikePay);
        });

        // B) supplier passages
        const passageQs = new URLSearchParams();
        if (supplier?.id) passageQs.set('supplier_id', String(supplier.id));
        if (supplier?.store_id) passageQs.set('store_id', String(supplier.store_id));

        const passageRes = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/supplier-passages?${passageQs.toString()}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        const passages = passageRes.ok ? ((await passageRes.json().catch(() => ({})))?.passages || []) : [];
        const checkPaymentsFromPassages = (passages || []).filter((p: any) => isCheckMethod(p?.payment_method));

        // C) store global payments (Coffre: Paiement Global Fournisseur)
        // These operations are stored in store_global_payments but the super-handler route name
        // differs between deployments.
        // We therefore try multiple endpoints.
        const tryFetchJsonList = async (url: string, keyCandidates: string[]) => {
          try {
            const r = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });
            if (!r.ok) return [];
            const j = await r.json().catch(() => ({}));
            for (const k of keyCandidates) {
              const v = (j as any)?.[k];
              if (Array.isArray(v)) return v;
            }
            return [];
          } catch {
            return [];
          }
        };

        const sgpCandidates = [
          `https://${projectId}.supabase.co/functions/v1/super-handler/store-global-payments`,
          `https://${projectId}.supabase.co/functions/v1/super-handler/store_global_payments`,
          `https://${projectId}.supabase.co/functions/v1/super-handler/store-global-payments-list`,
          // fallback to the known generic store-global-payments handler path (some builds use /store-global-payments)
          `https://${projectId}.supabase.co/functions/v1/super-handler/store-global-payments`,
        ];

        let sgps: any[] = [];
        for (const url of sgpCandidates) {
          sgps = await tryFetchJsonList(url, ['store_global_payments', 'payments', 'data']);
          if (sgps.length > 0) break;
        }

        // If none worked, keep empty and continue with other sources.
        const supplierSgps = (sgps || []).filter((p: any) => String(p?.supplier_id || '') === supplierIdStr);
        const checkPaymentsFromStoreGlobal = supplierSgps.filter((p: any) => isCheckMethod(p?.payment_method));

        // D) Advances table: some deployments store the chosen check id under different keys.
        // We already handle check_safe_id (safe checks). Here we ALSO attempt to read check_inventory_id
        // if the advance used an inventory check directly.
        const checkAdvancesFromAdvances = (advances || []).filter((a: any) => isCheckMethod(a?.payment_method));

        const checkPayments = [...checkPaymentsFromPayments, ...looseGlobalSupplierPays, ...checkPaymentsFromPassages, ...checkPaymentsFromStoreGlobal];

        // Collect referenced check_inventory ids and check numbers.
        const invIds = Array.from(new Set([
          ...checkPayments.flatMap((p: any) => parseCheckIdsUsed(p?.check_ids_used)),
          // also accept direct linkage fields
          ...checkPayments
            .map((p: any) => p?.check_inventory_id || p?.check_id)
            .filter(Boolean)
            .map((x: any) => String(x)),
          ...checkAdvancesFromAdvances
            .map((a: any) => a?.check_inventory_id || a?.check_id || a?.checkId)
            .filter(Boolean)
            .map((x: any) => String(x)),
        ]));

        const invNumbers = Array.from(
          new Set([
            ...checkPayments
              .flatMap((p: any) => {
                const raw = String(
                  p?.check_number ||
                  p?.check_reference ||
                  p?.reference_number ||
                  p?.reference ||
                  p?.payment_reference ||
                  ''
                ).trim();
                if (!raw) return [];
                return raw.split(',').map((x) => x.trim()).filter(Boolean);
              })
              .filter(Boolean),
            ...checkAdvancesFromAdvances
              .map((a: any) => String(a?.check_reference || '').trim())
              .filter(Boolean),
          ])
        );

        // If the system recorded check payments without linking to any check rows,
        // still show them so the tab isn't empty.
        if (invIds.length === 0 && invNumbers.length === 0 && checkPayments.length > 0) {
          checkPayments.forEach((p: any) => {
            const amt = Number(p?.amount || 0) || 0;
            const rawDate = p?.payment_date || p?.passage_date || p?.created_at || null;
            const possibleNum = String(
              p?.check_number ||
              p?.check_reference ||
              p?.reference_number ||
              p?.reference ||
              ''
            ).trim();

            out.push({
              id: `paycheck:${p?.id || rawDate || Math.random().toString(16).slice(2)}`,
              source: p?.passage_date ? 'supplier_passages' : (p?.paid_by_store_id ? 'store_global_payments' : 'payment'),
              check_number: possibleNum || '-',
              amount: amt,
              status: 'PAIEMENT',
              check_date: rawDate,
              giver_name: p?.created_by_email || p?.created_by || null,
              coffer_id: null,
              payment_id: p?.id || null,
            });
          });

          return;
        }

        if (invIds.length > 0 || invNumbers.length > 0) {
          const invRes = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/checks`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });

          const invRows = invRes.ok ? ((await invRes.json().catch(() => ({})))?.check_inventory || []) : [];

          const invByNumber = new Map<string, any>();
          (invRows || []).forEach((r: any) => {
            const num = String(r?.check_id_number || r?.check_number || r?.check_id || '').trim();
            if (num) invByNumber.set(num, r);
          });

          const invById = new Map<string, any>();
          (invRows || []).forEach((r: any) => {
            if (r?.id) invById.set(String(r.id), r);
          });

          // Match by ids first, then by number.
          const matchedByKey = new Map<string, any>();
          invIds.forEach((id) => {
            const row = invById.get(String(id));
            if (row) matchedByKey.set(String(row.id), row);
          });
          invNumbers.forEach((num) => {
            const row = invByNumber.get(String(num));
            if (row) matchedByKey.set(String(row?.id || num), row);
          });

          const matched = Array.from(matchedByKey.values());

          // Attach amount if it's clearly a single-check payment.
          const paymentAmountByInvId = new Map<string, number>();
          const paymentAmountByInvNumber = new Map<string, number>();

          const getPaymentInvNumbers = (p: any) => {
            const raw = String(p?.check_number || p?.check_reference || p?.reference_number || '').trim();
            if (!raw) return [];
            return raw.split(',').map((x) => x.trim()).filter(Boolean);
          };

          (checkPayments || []).forEach((p: any) => {
            const amt = Number(p?.amount || 0) || 0;
            const ids = parseCheckIdsUsed(p?.check_ids_used);
            const nums = getPaymentInvNumbers(p);

            if (ids.length === 1) paymentAmountByInvId.set(String(ids[0]), amt);
            if (nums.length === 1) paymentAmountByInvNumber.set(String(nums[0]), amt);
          });

          matched.forEach((row: any) => {
            const checkNumber = String(row?.check_id_number || row?.check_number || row?.check_id || '-').trim();
            const invId = row?.id ? String(row.id) : '';

            const amount =
              (invId && paymentAmountByInvId.has(invId) ? (paymentAmountByInvId.get(invId) as number) : undefined) ??
              (checkNumber && paymentAmountByInvNumber.has(checkNumber) ? (paymentAmountByInvNumber.get(checkNumber) as number) : 0);

            out.push({
              id: `inv:${row?.id || checkNumber}`,
              source: 'check_inventory',
              check_number: checkNumber,
              amount,
              status: row?.status || '-',
              check_date: row?.created_at || null,
              giver_name: row?.given_to || row?.given_to_name || null,
              coffer_id: null,
              check_inventory_id: row?.id || null,
            });
          });
        }
      } catch (e) {
        console.warn('Could not merge check_inventory checks for supplier:', e);
      }

      // 6) FINAL FALLBACK:
      // If a "Paiement" appears in the operations list with payment_method='check',
      // it MUST also appear in the checks tab, even if the backend did not link it
      // to check_inventory/check_safe or if it comes from a source not fetched above.
      //
      // This guarantees UI consistency: Opérations (check) == Chèques.
      try {
        const isCheck = (m: any) => {
          const s = String(m || '').toLowerCase();
          return s === 'check' || s.includes('cheque') || s.includes('chèque');
        };

        const opsCheckPayments = (supplierPayments || [])
          .filter((p: any) => isCheck(p?.payment_method || p?.method || p?.type))
          .map((p: any) => {
            const amt = Number(p?.amount || 0) || 0;
            const rawDate = p?.payment_date || p?.created_at || null;
            const possibleNum = String(
              p?.check_number ||
              p?.check_reference ||
              p?.reference_number ||
              p?.reference ||
              ''
            ).trim();

            return {
              id: `op-payment-check:${p?.id || p?.reference_number || rawDate || Math.random().toString(16).slice(2)}`,
              source: 'payment',
              check_number: possibleNum || '-',
              amount: amt,
              status: 'PAIEMENT',
              check_date: rawDate,
              giver_name: p?.created_by_email || p?.created_by || null,
              coffer_id: null,
              payment_id: p?.id || null,
            };
          });

        // Also include supplier passage cheque operations (paiement passager)
        const opsCheckPassages = (supplierPassages || [])
          .filter((p: any) => isCheck(p?.payment_method))
          .map((p: any) => {
            const amt = Number(p?.amount || 0) || 0;
            const rawDate = p?.passage_date || p?.created_at || null;
            const possibleNum = String(
              p?.check_number ||
              p?.check_reference ||
              p?.reference ||
              ''
            ).trim();

            return {
              id: `op-passage-check:${p?.id || p?.reference || rawDate || Math.random().toString(16).slice(2)}`,
              source: 'supplier_passages',
              check_number: possibleNum || '-',
              amount: amt,
              status: 'PASSAGE',
              check_date: rawDate,
              giver_name: p?.created_by_email || p?.created_by || null,
              // passages are recorded as caisse expenses, not coffer; keep '-' (null)
              coffer_id: null,
              supplier_passage_id: p?.id || null,
            };
          });

        // De-duplicate by (source, check_number, amount, date)
        const key = (r: any) => `${String(r?.source || '')}|${String(r?.check_number || '')}|${Number(r?.amount || 0)}|${String(r?.check_date || '')}`;
        const seen = new Set(out.map(key));
        opsCheckPayments.forEach((r: any) => {
          const k = key(r);
          if (seen.has(k)) return;
          out.push(r);
          seen.add(k);
        });

        opsCheckPassages.forEach((r: any) => {
          const k = key(r);
          if (seen.has(k)) return;
          out.push(r);
          seen.add(k);
        });
      } catch {
        // ignore
      }

      out.sort((a, b) => {
        const da = new Date(a.check_date || 0).getTime();
        const db = new Date(b.check_date || 0).getTime();
        return db - da;
      });

      setSupplierChecksUsed(out);
    } catch (e) {
      console.error('Error fetching supplier checks used:', e);
      setSupplierChecksUsed([]);
    } finally {
      setChecksLoading(false);
    }
  };

  const filteredSupplierProducts = useMemo(() => {
    const q = productsSearch.trim().toLowerCase();
    if (!q) return supplierProducts;
    return supplierProducts.filter((p: any) => {
      const hay = `${p.name || ''} ${p.reference || ''} ${p.stock_reference || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [productsSearch, supplierProducts]);

  // In the UI, "Stock Achat" should count achats (stock_reference groups), not product lines.
  const filteredSupplierAchats = useMemo(() => {
    const map = new Map<string, any[]>();
    (filteredSupplierProducts || []).forEach((row: any) => {
      const key = String(row?.stock_reference || '').trim();
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    });
    return Array.from(map.entries()).map(([stock_reference, rows]) => ({ stock_reference, rows }));
  }, [filteredSupplierProducts]);

  const filteredSupplierPayments = useMemo(() => {
    const q = paymentsSearch.trim().toLowerCase();

    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    if (end) end.setHours(23, 59, 59, 999);

    return supplierPayments.filter((p: any) => {
      const hay = `${p.payment_method || ''} ${p.reference_number || ''} ${p.notes || ''} ${p.amount || ''} ${p.payment_date || ''} ${p.created_at || ''} ${p.created_by_email || ''} ${p.created_by || ''}`.toLowerCase();
      const matchesText = !q || hay.includes(q);

      const rawDate = p.payment_date || p.created_at;
      const d = rawDate ? new Date(rawDate) : null;
      const matchesDate =
        !start || !end
          ? true
          : (d && !Number.isNaN(d.getTime()) ? (d >= start && d <= end) : true);

      return matchesText && matchesDate;
    });
  }, [paymentsSearch, supplierPayments, startDate, endDate]);

  const filteredSupplierAdvances = useMemo(() => {
    const q = advancesSearch.trim().toLowerCase();

    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    if (end) end.setHours(23, 59, 59, 999);

    return supplierAdvances
      .slice()
      .sort((a: any, b: any) => {
        const da = new Date(a?.created_at || 0).getTime();
        const db = new Date(b?.created_at || 0).getTime();
        return db - da;
      })
      .filter((a: any) => {
        const hay = `${a.payment_method || ''} ${a.coffer_id || ''} ${a.coffer_name || ''} ${a.notes || ''} ${a.amount || ''} ${a.created_at || ''} ${a.created_by_email || ''} ${a.created_by_role || ''}`.toLowerCase();
        const matchesText = !q || hay.includes(q);

        const rawDate = a.created_at;
        const d = rawDate ? new Date(rawDate) : null;
        const matchesDate =
          !start || !end
            ? true
            : (d && !Number.isNaN(d.getTime()) ? (d >= start && d <= end) : true);

        return matchesText && matchesDate;
      });
  }, [advancesSearch, supplierAdvances, startDate, endDate]);

  const filteredSupplierChecksUsed = useMemo(() => {
    const q = checksSearch.trim().toLowerCase();
    if (!q) return supplierChecksUsed;
    return supplierChecksUsed.filter((c: any) => {
      const hay = `${c.check_number || ''} ${c.status || ''} ${c.giver_name || ''} ${c.amount || ''} ${c.coffer_id || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [checksSearch, supplierChecksUsed]);

  const filteredSupplierPassages = useMemo(() => {
    const q = passagesSearch.trim().toLowerCase();

    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    if (end) end.setHours(23, 59, 59, 999);

    return supplierPassages
      .slice()
      .sort((a: any, b: any) => {
        const da = new Date(a?.passage_date || a?.created_at || 0).getTime();
        const db = new Date(b?.passage_date || b?.created_at || 0).getTime();
        return db - da;
      })
      .filter((p: any) => {
        const hay = `${p.payment_method || ''} ${p.reference || ''} ${p.notes || ''} ${p.amount || ''} ${p.passage_date || ''} ${p.created_at || ''} ${p.created_by_email || ''} ${p.created_by_role || ''}`.toLowerCase();
        const matchesText = !q || hay.includes(q);

        const rawDate = p.passage_date || p.created_at;
        const d = rawDate ? new Date(rawDate) : null;
        const matchesDate =
          !start || !end
            ? true
            : (d && !Number.isNaN(d.getTime()) ? (d >= start && d <= end) : true);

        return matchesText && matchesDate;
      });
  }, [passagesSearch, supplierPassages, startDate, endDate]);

  const combinedOperations = useMemo(() => {
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    if (end) end.setHours(23, 59, 59, 999);

    const q = `${paymentsSearch} ${advancesSearch}`.trim().toLowerCase();

    const rows: any[] = [];

    const matchesFilter = (hay: string, rawDate: any) => {
      const matchesText = !q || String(hay || '').toLowerCase().includes(q);
      const d = rawDate ? new Date(rawDate) : null;
      const matchesDate =
        !start || !end ? true : (d && !Number.isNaN(d.getTime()) ? (d >= start && d <= end) : true);
      return { matchesText, matchesDate, d };
    };

    // Admin supplier invoices (Fournisseur Admin flow)
    // These are not in `payments`, so we add them to operations for visibility.
    for (const inv of adminSupplierInvoices) {
      const rawDate = inv.__dateRaw || inv.invoice_date || inv.created_at;
      const d = rawDate ? new Date(rawDate) : null;
      const matchesDate =
        !start || !end ? true : (d && !Number.isNaN(d.getTime()) ? (d >= start && d <= end) : true);

      const amount = Number(inv.__amount || inv.total_amount || inv.amount || 0) || 0;
      const ref = inv.stock_reference || inv.reference || inv.sale_id || inv.id || '-';
      const notes = inv.notes || inv.reason || 'Facture (Fournisseur Admin)';

      const hay = `${ref} ${notes} ${amount} ${rawDate || ''} ${inv.store_id || ''} ${inv.admin_user_id || ''}`;
      const { matchesDate: mDate, matchesText: mText } = matchesFilter(hay, rawDate);
      if (!mDate || !mText) continue;

      rows.push({
        id: `admin-invoice-${inv.id || inv.sale_id || ref}`,
        __type: 'Facture',
        __sort: d && !Number.isNaN(d.getTime()) ? d.getTime() : 0,
        __raw: inv,
        dateRaw: rawDate,
        amount,
        payment_method: 'ADMIN',
        reference: String(ref),
        actor: 'Fournisseur Admin',
        notes,
      });
    }

    for (const p of supplierPayments) {
      const rawDate = p.payment_date || p.created_at;
      const d = rawDate ? new Date(rawDate) : null;
      const matchesDate =
        !start || !end ? true : (d && !Number.isNaN(d.getTime()) ? (d >= start && d <= end) : true);

      const hay = `${p.payment_method || ''} ${p.reference_number || ''} ${p.notes || ''} ${p.amount || ''} ${p.payment_date || ''} ${p.created_at || ''} ${p.created_by_email || ''} ${p.created_by || ''}`;
      const { matchesDate: mDate, matchesText: mText } = matchesFilter(hay, rawDate);
      if (!mDate || !mText) continue;

      rows.push({
        id: `payment-${p.id}`,
        __type: 'Paiement',
        __sort: d && !Number.isNaN(d.getTime()) ? d.getTime() : 0,
        __raw: p,
        dateRaw: rawDate,
        amount: Number(p.amount || 0) || 0,
        payment_method: p.payment_method || p.method || p.type || '-',
        reference: p.reference_number || p.reference || '-',
        actor: p.created_by_email || p.created_by || '-',
        notes: p.notes || '-',
      });
    }

    for (const a of supplierAdvances) {
      const rawDate = a.payment_date || a.created_at;
      const d = rawDate ? new Date(rawDate) : null;
      const matchesDate =
        !start || !end ? true : (d && !Number.isNaN(d.getTime()) ? (d >= start && d <= end) : true);

      const hay = `${a.payment_method || ''} ${a.coffer_id || ''} ${a.coffer_name || ''} ${a.notes || ''} ${a.amount || ''} ${a.payment_date || a.created_at || ''} ${a.created_by_email || ''} ${a.created_by_role || ''}`;
      const { matchesDate: mDate, matchesText: mText } = matchesFilter(hay, rawDate);
      if (!mDate || !mText) continue;

      const actor = `${a.created_by_role || ''}${a.created_by_email ? ` • ${a.created_by_email}` : ''}`.trim() || a.created_by_email || a.created_by || '-';

      rows.push({
        id: `advance-${a.id}`,
        __type: 'Avance',
        __sort: d && !Number.isNaN(d.getTime()) ? d.getTime() : 0,
        __raw: a,
        dateRaw: rawDate,
        amount: Number(a.amount || 0) || 0,
        payment_method: a.payment_method || '-',
        reference: a.coffer_name || a.coffer_id || '-',
        actor,
        notes: a.notes || '-',
      });
    }

    // Remise (discounts) as its own operation rows
    for (const disc of supplierDiscounts || []) {
      const rawDate = disc.created_at || disc.discount_date || disc.date || null;
      const amt = Math.abs(Number(disc.amount || disc.discount_amount || 0) || 0);
      if (!amt) continue;

      const ref = disc.reference || disc.id || '-';
      const actor = disc.created_by_email || disc.created_by || '-';
      const notes = disc.notes || disc.reason || 'Remise fournisseur';
      const hay = `${ref} ${notes} ${amt} ${rawDate || ''} ${actor}`;

      const { matchesDate: mDate, matchesText: mText, d } = matchesFilter(hay, rawDate);
      if (!mDate || !mText) continue;

      rows.push({
        id: `discount-${disc.id || ref}`,
        __type: 'Remise',
        __sort: d && !Number.isNaN(d.getTime()) ? d.getTime() : 0,
        __raw: disc,
        dateRaw: rawDate,
        amount: -amt,
        payment_method: 'REMISE',
        reference: String(ref),
        actor,
        notes,
      });
    }

    rows.sort((x, y) => y.__sort - x.__sort);
    return rows;
  }, [supplierPayments, supplierAdvances, adminSupplierInvoices, supplierDiscounts, startDate, endDate, paymentsSearch, advancesSearch]);

  const totalCombinedOperations = useMemo(() => {
    return combinedOperations.reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);
  }, [combinedOperations]);

  const totalSupplierPassages = useMemo(() => {
    return filteredSupplierPassages.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
  }, [filteredSupplierPassages]);

  // Financial summary (like ClientDetailsPage cards)
  // MUST match SuppliersModule (the list table):
  // - Total Facturé = supplier.balance
  // - Total Payé = SUM(payments.amount) for this supplier (from payments table)
  // - Solde Restant = MAX(0, Total Facturé - Total Payé - Remise)
  // Note: SuppliersModule also subtracts discounts (remise) when displaying "Solde Restant".
  // SupplierDetailsPage does not load discounts currently, so to match exactly we also load them.
  const supplierDiscountsForSummary = useMemo(() => {
    return supplierDiscounts;
  }, [supplierDiscounts]);

  // Fetch fresh supplier data
  const fetchCurrentSupplier = async () => {
    if (!supplier?.id) return;
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/suppliers?id=${encodeURIComponent(supplier.id)}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );
      const data = await res.json();
      if (data.suppliers && data.suppliers[0]) {
        const updated = data.suppliers[0];
        setLocalSupplier(updated);
        // Also notify parent if callback provided
        if (onSupplierUpdate) {
          onSupplierUpdate(updated);
        }
      }
    } catch (e) {
      console.error('Error fetching supplier:', e);
    }
  };

  // Total Facturé: use localSupplier to get updated balance after corrections
  const totalFactureSupplier = useMemo(() => {
    return Number((localSupplier as any)?.balance || 0) || 0;
  }, [localSupplier]);

  // Total Payé (must include advances too for supplier balance view)
  // Otherwise creating an Avance will not change the supplier summary.
  const totalPayeSupplier = useMemo(() => {
    const paymentsTotal = (supplierPayments || []).reduce((sum: number, p: any) => sum + (Number(p?.amount || 0) || 0), 0);
    const advancesTotal = (supplierAdvances || []).reduce((sum: number, a: any) => sum + (Number(a?.amount || 0) || 0), 0);
    return paymentsTotal + advancesTotal;
  }, [supplierPayments, supplierAdvances]);

  // Remise Donnée: discounts table (same as list)
  const remiseDonneeSupplier = useMemo(() => {
    return (supplierDiscountsForSummary || []).reduce((sum: number, d: any) => sum + (Number(d?.amount || 0) || 0), 0);
  }, [supplierDiscountsForSummary]);

  const soldeRestantSupplier = useMemo(() => {
    const remainingBalance = (Number(totalFactureSupplier) || 0) - (Number(totalPayeSupplier) || 0);
    // IMPORTANT: allow negative (supplier credit) when overpaid.
    return remainingBalance - (Number(remiseDonneeSupplier) || 0);
  }, [totalFactureSupplier, totalPayeSupplier, remiseDonneeSupplier]);

  const buildRowsForExport = () => {
    // Export should include ONLY what is really displayed in the UI tables.
    // Concretely: Paiement + Avance + Passage + Remise + Achat + Chèque.

    const paymentsForExport = filteredSupplierPayments;
    const advancesForExport = filteredSupplierAdvances;

    const fmtDateTime = (raw: any) => {
      const d = raw ? new Date(raw) : null;
      if (!d || Number.isNaN(d.getTime())) return raw ? String(raw) : '-';
      return `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR')}`;
    };

    const sortTime = (raw: any) => {
      const d = raw ? new Date(raw) : null;
      return d && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
    };

    const rows: any[] = [];

    // NOTE: Facture (admin supplier invoices) is NOT exported from Supplier details.

    // Paiement
    (paymentsForExport || []).forEach((p: any) => {
      const rawDate = p.payment_date || p.created_at;
      rows.push({
        _type: 'Paiement',
        _isPayment: true,
        _sort: sortTime(rawDate),
        _dateStr: fmtDateTime(rawDate),
        _amount: Number(p.amount || 0) || 0,
        _method: String(p.payment_method || p.method || p.type || '-'),
        _reference: '-',
        _paymentReference: p.reference_number || p.reference || '-',
        _coffer: '-',
        _actor: p.created_by_email || p.created_by || '-',
        _notes: p.notes || '-',
        _remise: 0,
      });
    });

    // Avance
    (advancesForExport || []).forEach((a: any) => {
      const rawDate = a.created_at;
      rows.push({
        _type: 'Avance',
        _isPayment: true,
        _sort: sortTime(rawDate),
        _dateStr: fmtDateTime(rawDate),
        _amount: Number(a.amount || 0) || 0,
        _method: String(a.payment_method || '-'),
        _reference: '-',
        _paymentReference: '-',
        _coffer: a.coffer_name || a.coffer_id || '-',
        _actor: (`${a.created_by_role || ''}${a.created_by_email ? ` • ${a.created_by_email}` : ''}`.trim() || a.created_by_email || a.created_by || '-'),
        _notes: a.notes || '-',
        _remise: 0,
      });
    });

    // Achat (Stock Achat tab): export grouped by stock_reference (achat), not by each product line.
    // The report should show ONE line per stock_reference with summed quantity and value.
    try {
      const groups = new Map<string, { rawDate: any; qty: number; val: number; actor: string; notes: string }>();

      const getQty = (row: any) => {
        return (
          Number(
            row?.quantite ??
            row?.number_of_boxes ??
            row?.caisse ??
            row?.quantity_available ??
            row?.quantity ??
            row?.qty ??
            0
          ) || 0
        );
      };

      const getUnit = (row: any) => {
        return (
          Number(
            row?.purchase_price ??
            row?.buy_price ??
            row?.unit_price ??
            row?.price ??
            0
          ) || 0
        );
      };

      (filteredSupplierProducts || []).forEach((row: any, idx: number) => {
        const stockRef = String(row?.stock_reference || row?.stockRef || row?.reference || row?.id || idx).trim() || '-';
        const rawDate = row?.created_at || null;
        const qty = getQty(row);
        const unit = getUnit(row);
        const val = qty * unit;

        const prev = groups.get(stockRef);
        if (!prev) {
          groups.set(stockRef, {
            rawDate,
            qty,
            val,
            actor: row?.created_by_email || row?.created_by || '-',
            notes: String(row?.notes || row?.reason || '').trim(),
          });
          return;
        }

        // Keep earliest date for sorting (so the achat appears at its start time)
        const prevT = prev.rawDate ? new Date(prev.rawDate).getTime() : 0;
        const curT = rawDate ? new Date(rawDate).getTime() : 0;
        const earliest = prevT && curT ? (curT < prevT ? rawDate : prev.rawDate) : (prev.rawDate || rawDate);

        groups.set(stockRef, {
          rawDate: earliest,
          qty: prev.qty + qty,
          val: prev.val + val,
          actor: prev.actor || (row?.created_by_email || row?.created_by || '-'),
          notes: prev.notes || String(row?.notes || row?.reason || '').trim(),
        });
      });

      Array.from(groups.entries()).forEach(([stockRef, g]) => {
        rows.push({
          _type: 'Achat',
          _isPayment: false,
          _sort: sortTime(g.rawDate),
          _dateStr: fmtDateTime(g.rawDate),
          _amount: g.val,
          _method: 'STOCK',
          _reference: stockRef,
          _paymentReference: '-',
          _coffer: '-',
          _actor: g.actor || '-',
          _notes: g.notes || `Achat stock (${stockRef})`,
          _remise: 0,
        });
      });
    } catch {
      // ignore
    }

    // Chèques utilisés
    // Do not include this table/section in supplier report exports.
    // (User request: hide "Chèques utilisés" from both PDF and Excel exports.)

    // Fournisseur Exceptionnel (passages)
    // Do not include Passages in exported documents.
    // (These are a separate view/tab in the UI and should not appear in supplier report exports.)

    // Remise (discounts)
    (supplierDiscounts || []).forEach((d: any) => {
      const rawDate = d.created_at || d.discount_date || d.date || null;
      const amount = Number(d.amount || 0) || 0;
      const actor = d.created_by_email || d.created_by || '-';
      const ref = d.reference || d.id || '-';
      const notes = d.notes || d.reason || 'Remise fournisseur';

      rows.push({
        _type: 'Remise',
        _isPayment: true,
        _sort: sortTime(rawDate),
        _dateStr: fmtDateTime(rawDate),
        // remise is a negative movement
        _amount: -Math.abs(amount),
        _method: 'REMISE',
        _reference: '-',
        _paymentReference: String(ref),
        _coffer: '-',
        _actor: actor,
        _notes: notes,
        _remise: amount,
      });
    });

    const rowsForExport = rows.sort((a: any, b: any) => a._sort - b._sort);

    // Summary totals
    // Supplier "paid" must include BOTH:
    // - global payments (payments table)
    // - supplier advances (supplier_advances table)
    // IMPORTANT: Calculate totalFacture from the rows (Achat type) instead of supplier.balance
    // as supplier.balance may be stale or not properly updated for all supplier types
    const totalFactureFromRows = rowsForExport
      .filter((r: any) => r._type === 'Achat')
      .reduce((sum: number, r: any) => sum + (Number(r._amount) || 0), 0);
    // Also include admin supplier invoices in total facturé if any
    const totalFromAdminInvoices = (adminSupplierInvoices || []).reduce(
      (sum: number, inv: any) => sum + (Number(inv.total_amount || inv.amount || 0) || 0),
      0
    );
    const totalFacture = totalFactureFromRows + totalFromAdminInvoices;
    const totalPaidPayments = paymentsForExport.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
    const totalPaidAdvances = advancesForExport.reduce((sum: number, a: any) => sum + (Number(a.amount) || 0), 0);
    const totalPaid = totalPaidPayments + totalPaidAdvances;
    
    // NOTE: Remise (discounts) are already included in the rows as negative amounts.
    // Do NOT subtract them again in Solde Restant to avoid double-counting.
    // The totalRemise is kept for display purposes only.
    const totalRemise = (supplierDiscounts || []).reduce((sum: number, d: any) => sum + (Number(d?.amount || 0) || 0), 0);
    // Solde Restant = Total Facturé - Total Paid (remise already reflected in rows)
    const soldeRestant = totalFacture - totalPaid;

    // Extra totals (informational only)
    const totalAdvances = advancesForExport.reduce((sum: number, a: any) => sum + (Number(a.amount) || 0), 0);
    const totalAllMovements = rowsForExport.reduce((sum: number, r: any) => sum + (Number(r._amount) || 0), 0);

    return {
      paymentsForExport,
      advancesForExport,
      rowsForExport,
      totalFacture,
      totalPaid,
      totalRemise,
      soldeRestant,
      totalAdvances,
      totalAllMovements,
    };
  };

  const exportToExcel = () => {
    try {
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;
      if (end) end.setHours(23, 59, 59, 999);

      const { rowsForExport, totalFacture, totalPaid, totalRemise, soldeRestant, totalAdvances, totalAllMovements } = buildRowsForExport();

      const money = (n: any) => `${(Number(n || 0) || 0).toFixed(2)} DH`;

      // Use a report-like layout similar to client screenshot
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
            <div class="title">RAPPORT FOURNISSEUR : ${String(supplier.name || '').toLowerCase()}</div>

            <table class="summary">
              <tr>
                <th>Total Facturé</th>
                <th>Total Payé</th>
                <th>Remise Donnée</th>
                <th>Solde Restant</th>
                              </tr>
              <tr>
                <td class="center">${money(totalFacture)}</td>
                <td class="center">${money(totalPaid)}</td>
                <td class="center">${money(totalRemise)}</td>
                <td class="center">${money(soldeRestant)}</td>
                              </tr>
            </table>

            <div class="filter" style="margin-top:6px;">
              <span class="label">Info</span>
              <span>Avances (période): ${money(totalAdvances)} | Mouvements (période): ${money(totalAllMovements)}</span>
            </div>

            <div class="filter">
              <span class="label">Filtrage</span>
              <span>${start ? start.toLocaleDateString('fr-FR') : '-'} → ${end ? end.toLocaleDateString('fr-FR') : '-'}</span>
            </div>

            <table>
              <thead class="header">
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Référence</th>
                  <th>Montant Achat</th>
                  <th>Montant Paiement</th>
                  <th>Méthode</th>
                  <th>Coffre</th>
                  <th>Effectué par</th>
                  <th>Remise</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                ${rowsForExport
                  .map((r: any) => {
                    return `
                      <tr>
                        <td>${r._dateStr}</td>
                        <td>${r._type || '-'}</td>
                        <td>${(r._reference && r._reference !== '-') ? r._reference : (r._paymentReference && r._paymentReference !== '-') ? r._paymentReference : '-'}</td>
                        <td class="right">${r._type === 'Achat' ? money(r._amount) : '-'}</td>
                        <td class="right">${r._isPayment ? money(r._amount) : '-'}</td>
                        <td class="center">${r._method}</td>
                        <td class="center">${r._coffer}</td>
                        <td>${r._actor}</td>
                        <td class="right">${money(r._remise || 0)}</td>
                        <td>${r._notes}</td>
                      </tr>
                    `;
                  })
                  .join('')}

                <tr class="total-row">
                  <td colspan="1">TOTALE (MOUVEMENTS PÉRIODE)</td>
                  <td colspan="2"></td>
                  <td class="right">${money(totalAllMovements)}</td>
                  <td colspan="5"></td>
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
      link.setAttribute('download', `Rapport_Fournisseur_${supplier.name}_${new Date().toISOString().split('T')[0]}.xls`);
      link.style.visibility = 'hidden';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('Rapport exporté avec succès');
    } catch (error) {
      console.error('Error exporting supplier report:', error);
      toast.error("Erreur lors de l'export");
    }
  };

  const correctPayment = async () => {
    // Prevent double-submit
    if (correctPaymentLoading) return;
    
    try {
      if (!selectedPaymentForCorrection?.id) {
        toast.error('Paiement invalide');
        return;
      }

      const paymentId = String(selectedPaymentForCorrection.id);

      const parsedAmount = Number(String(correctNewAmount || '').replace(',', '.'));
      const currentAmount = Number(selectedPaymentForCorrection.amount || 0);
      
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        toast.error('Montant invalide');
        return;
      }

      // Check if the new amount is the same as current amount
      if (parsedAmount === currentAmount) {
        toast.error('Le nouveau montant est identique au montant actuel');
        return;
      }

      setCorrectPaymentLoading(true);

      // For now: the only allowed correction is changing the AMOUNT.
      // Backend resolves coffer_id/check_safe_id from ledgers when missing.
      const originalMethod = String(selectedPaymentForCorrection?.payment_method || selectedPaymentForCorrection?.method || selectedPaymentForCorrection?.type || 'cash').trim().toLowerCase();

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/payments/${encodeURIComponent(paymentId)}/correct`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            new_amount: parsedAmount,
            old_amount: currentAmount,
            // amount-only correction keeps the original method by default (backend also keeps it)
            new_payment_method: originalMethod,
            reason: String(correctReason || '').trim() || 'Correction paiement',
          }),
        }
      );

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        
        // Try to parse the error response for AMOUNT_MISMATCH
        try {
          const errJson = JSON.parse(t);
          if (errJson.code === 'AMOUNT_MISMATCH') {
            toast.error('Le montant a été modifié. Veuillez rafraîchir la page et réessayer.');
            // Refresh the data
            await fetchSupplierPayments();
            setShowCorrectPaymentModal(false);
            setSelectedPaymentForCorrection(null);
            return;
          }
        } catch (e) {
          // Not JSON, continue with generic error
        }
        
        console.error('Payment correction failed:', res.status, t);
        toast.error(`Erreur correction paiement (${res.status})`);
        return;
      }

      toast.success('Paiement corrigé (annulation + nouveau paiement)');

      // Clear data first to avoid showing stale/duplicate entries during fetch
      setSupplierPayments([]);
      
      // Then fetch fresh data
      await fetchSupplierPayments();
      await fetchSupplierChecksUsed();
      await fetchCurrentSupplier();

      setShowCorrectPaymentModal(false);
      setSelectedPaymentForCorrection(null);
      
      // Full page reload to ensure all data is fresh
      window.location.reload();
    } catch (e) {
      console.error('Error correcting payment:', e);
      toast.error('Erreur lors de la correction');
    } finally {
      setCorrectPaymentLoading(false);
    }
  };

  // Correct Advance (Avance) amount
  const correctAdvance = async () => {
    // Prevent double-submit
    if (correctPaymentLoading) return;
    
    try {
      if (!selectedAdvanceForCorrection?.id) {
        toast.error('Avance invalide');
        return;
      }

      const advanceId = String(selectedAdvanceForCorrection.id);
      const parsedAmount = Number(String(correctAdvanceNewAmount || '').replace(',', '.'));
      const currentAmount = Number(selectedAdvanceForCorrection.amount || 0);
      
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        toast.error('Montant invalide');
        return;
      }

      // Check if the new amount is the same as current amount
      if (parsedAmount === currentAmount) {
        toast.error('Le nouveau montant est identique au montant actuel');
        return;
      }

      setCorrectPaymentLoading(true);

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/supplier-advances/${encodeURIComponent(advanceId)}/correct`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            new_amount: parsedAmount,
            old_amount: currentAmount,
            reason: String(correctAdvanceReason || '').trim() || 'Correction avance',
          }),
        }
      );

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        
        // Try to parse the error response for AMOUNT_MISMATCH
        try {
          const errJson = JSON.parse(t);
          if (errJson.code === 'AMOUNT_MISMATCH') {
            toast.error('Le montant a été modifié. Veuillez rafraîchir la page et réessayer.');
            // Refresh the data
            await fetchSupplierAdvances();
            await fetchSupplierPayments();
            setShowCorrectAdvanceModal(false);
            setSelectedAdvanceForCorrection(null);
            return;
          }
        } catch (e) {
          // Not JSON, continue with generic error
        }
        
        console.error('Advance correction failed:', res.status, t);
        toast.error(`Erreur correction avance (${res.status})`);
        return;
      }

      toast.success('Avance corrigée avec succès');

      // Clear data first to avoid showing stale/duplicate entries during fetch
      setSupplierAdvances([]);
      setSupplierPayments([]);
       
      // Then fetch fresh data
      await fetchSupplierAdvances();
      await fetchSupplierPayments();
      await fetchCurrentSupplier();

      setShowCorrectAdvanceModal(false);
      setSelectedAdvanceForCorrection(null);
      
      // Full page reload to ensure all data is fresh
      window.location.reload();
    } catch (e) {
      console.error('Error correcting advance:', e);
      toast.error('Erreur lors de la correction');
    } finally {
      setCorrectPaymentLoading(false);
    }
  };

  // Correct Invoice (Facture) amount
  const correctInvoice = async () => {
    // Prevent double-submit
    if (correctPaymentLoading) return;
    
    try {
      if (!selectedInvoiceForCorrection?.id) {
        toast.error('Facture invalide');
        return;
      }

      const invoiceId = String(selectedInvoiceForCorrection.id);
      const parsedAmount = Number(String(correctInvoiceNewAmount || '').replace(',', '.'));
      const currentAmount = Number(selectedInvoiceForCorrection.total_amount || selectedInvoiceForCorrection.amount || 0);
      
      if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
        toast.error('Montant invalide');
        return;
      }

      // Check if the new amount is the same as current amount
      if (parsedAmount === currentAmount) {
        toast.error('Le nouveau montant est identique au montant actuel');
        return;
      }

      setCorrectPaymentLoading(true);

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/supplier-admin-invoices/${encodeURIComponent(invoiceId)}/correct`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            new_amount: parsedAmount,
            old_amount: currentAmount,
            reason: String(correctInvoiceReason || '').trim() || 'Correction facture',
          }),
        }
      );

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        console.error('Invoice correction failed:', res.status, t);
        toast.error(`Erreur correction facture (${res.status})`);
        return;
      }

      toast.success('Facture corrigée avec succès');

      // Clear data first to avoid showing stale/duplicate entries during fetch
      setAdminSupplierInvoices([]);
       
      // Then fetch fresh data
      await fetchAdminSupplierInvoices();
      await fetchCurrentSupplier();

      setShowCorrectInvoiceModal(false);
      setSelectedInvoiceForCorrection(null);
      
      // Full page reload to ensure all data is fresh
      window.location.reload();
    } catch (e) {
      console.error('Error correcting invoice:', e);
      toast.error('Erreur lors de la correction');
    } finally {
      setCorrectPaymentLoading(false);
    }
  };

  // Correct Discount (Remise) amount
  const correctDiscount = async () => {
    // Prevent double-submit
    if (correctPaymentLoading) return;
    
    try {
      if (!selectedDiscountForCorrection?.id) {
        toast.error('Remise invalide');
        return;
      }

      const discountId = String(selectedDiscountForCorrection.id);
      const parsedAmount = Number(String(correctDiscountNewAmount || '').replace(',', '.'));
      const currentAmount = Math.abs(Number(selectedDiscountForCorrection.discount_amount || selectedDiscountForCorrection.amount || 0));
      
      if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
        toast.error('Montant invalide');
        return;
      }

      // Check if the new amount is the same as current amount
      if (parsedAmount === currentAmount) {
        toast.error('Le nouveau montant est identique au montant actuel');
        return;
      }

      setCorrectPaymentLoading(true);

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/discounts/${encodeURIComponent(discountId)}/correct`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            new_amount: parsedAmount,
            old_amount: currentAmount,
            reason: String(correctDiscountReason || '').trim() || 'Correction remise',
          }),
        }
      );

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        console.error('Discount correction failed:', res.status, t);
        toast.error(`Erreur correction remise (${res.status})`);
        return;
      }

      toast.success('Remise corrigée avec succès');

      // Clear data first to avoid showing stale/duplicate entries during fetch
      setSupplierDiscounts([]);
       
      // Then fetch fresh data
      await fetchSupplierDiscounts();
      await fetchSupplierPayments();
      await fetchCurrentSupplier();

      setShowCorrectDiscountModal(false);
      setSelectedDiscountForCorrection(null);
      
      // Full page reload to ensure all data is fresh
      window.location.reload();
    } catch (e) {
      console.error('Error correcting discount:', e);
      toast.error('Erreur lors de la correction');
    } finally {
      setCorrectPaymentLoading(false);
    }
  };

  const exportToPdf = () => {
    try {
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;
      if (end) end.setHours(23, 59, 59, 999);

      const { rowsForExport, totalFacture, totalPaid, totalRemise, soldeRestant, totalAdvances, totalAllMovements } = buildRowsForExport();

      const money = (n: any) => `${(Number(n || 0) || 0).toFixed(2)} DH`;

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`RAPPORT FOURNISSEUR : ${String(supplier.name || '').toLowerCase()}`, 148.5, 20, { align: 'center' });

      // Summary MUST match SuppliersModule

      (doc as any).autoTable({
        startY: 28,
        theme: 'grid',
        tableWidth: 235,
        margin: { left: 30 },
        head: [[
          'TOTAL FACTURÉ',
          'TOTAL PAYÉ',
          'REMISE DONNÉE',
          'SOLDE RESTANT',
                  ]],
        body: [[
          money(totalFacture),
          money(totalPaid),
          money(totalRemise),
          money(soldeRestant),
                  ]],
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

      const afterSummaryY = (doc as any).lastAutoTable?.finalY || 40;
      (doc as any).autoTable({
        startY: afterSummaryY + 2,
        theme: 'plain',
        tableWidth: 110,
        margin: { left: 48 },
        body: [[
          { content: 'FILTRAGE', styles: { fillColor: [185, 201, 234], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'left', lineWidth: 0.2, lineColor: [107, 134, 201] } },
          { content: `${start ? start.toLocaleDateString('fr-FR') : '-'} → ${end ? end.toLocaleDateString('fr-FR') : '-'}`,
            styles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'normal', halign: 'left', lineWidth: 0.2, lineColor: [107, 134, 201] } },
        ]],
        styles: { fontSize: 9, cellPadding: 1.5 },
      });

      // Add info about movements in this period
      const afterFilterInfoY = (doc as any).lastAutoTable?.finalY || afterSummaryY + 10;
      (doc as any).autoTable({
        startY: afterFilterInfoY + 2,
        theme: 'plain',
        tableWidth: 170,
        margin: { left: 48 },
        body: [[
          { content: 'INFO', styles: { fillColor: [185, 201, 234], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'left', lineWidth: 0.2, lineColor: [107, 134, 201] } },
          { content: `Avances (période): ${money(totalAdvances)} | Mouvements (période): ${money(totalAllMovements)}`,
            styles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'normal', halign: 'left', lineWidth: 0.2, lineColor: [107, 134, 201] } },
        ]],
        styles: { fontSize: 9, cellPadding: 1.5 },
      });

      const afterFilterY = (doc as any).lastAutoTable?.finalY || afterSummaryY + 10;

      const body = rowsForExport.map((r: any) => [
        r._dateStr,
        r._type || '-',
        (r._reference && r._reference !== '-') ? r._reference : (r._paymentReference && r._paymentReference !== '-') ? r._paymentReference : '-',
        r._type === 'Achat' ? money(r._amount) : '-',
        r._isPayment ? money(r._amount) : '-',
        r._method,
        r._coffer,
        r._actor,
        money(r._remise || 0),
        r._notes,
      ]);

      (doc as any).autoTable({
        startY: afterFilterY + 4,
        theme: 'grid',
        tableWidth: 280,
        margin: { left: 10 },
        head: [[
          'DATE',
          'TYPE',
          'REFERENCE',
          'MONTANT ACHAT',
          'MONTANT PAIEMENT',
          'METHODE',
          'COFFRE',
          'EFFECTUE PAR',
          'REMISE',
          'NOTES',
        ]],
        body,
        styles: {
          fontSize: 8.5,
          cellPadding: 2,
          lineColor: [107, 134, 201],
          lineWidth: 0.2,
          valign: 'middle',
        },
        headStyles: {
          fillColor: [63, 105, 198],
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center',
        },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 20 },
          2: { cellWidth: 28 },
          3: { cellWidth: 24, halign: 'right' },
          4: { cellWidth: 24, halign: 'right' },
          5: { cellWidth: 18, halign: 'center' },
          6: { cellWidth: 25 },
          7: { cellWidth: 28 },
          8: { cellWidth: 28, halign: 'right' },
          9: { cellWidth: 35 },
        },
        });

      // RÉCAPITULATIF (like ClientDetailsPage)
      const afterTableY = (doc as any).lastAutoTable?.finalY || afterFilterY + 30;

      const recapRows: Array<[string, string]> = [
        ['Total Facturé', money(totalFacture)],
        ['Total Payé', money(totalPaid)],
        ['Total Remise', money(totalRemise)],
        ['Solde Restant', money(soldeRestant)],
      ];

      // Ensure the entire recap block (title + table) stays on ONE page.
      // If there isn't enough space, push it to the next page before rendering.
      const pageHeight = (doc as any).internal?.pageSize?.getHeight
        ? (doc as any).internal.pageSize.getHeight()
        : (doc as any).internal?.pageSize?.height;

      const recapTitleYCurrent = afterTableY + 8;
      const recapTableYCurrent = afterTableY + 10;
      const approxRecapHeightMm = 6 /* header */ + (recapRows.length * 8) + 6; // safe estimate
      const needNewPage = Boolean(pageHeight && (recapTableYCurrent + approxRecapHeightMm) > (pageHeight - 10));

      if (needNewPage) {
        doc.addPage();
      }

      const recapTitleY = needNewPage ? 18 : recapTitleYCurrent;
      const recapTableY = needNewPage ? 20 : recapTableYCurrent;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('RÉCAPITULATIF', 20, recapTitleY);

      (doc as any).autoTable({
        startY: recapTableY,
        theme: 'grid',
        tableWidth: 90,
        margin: { left: 20 },
        head: [['', '']],
        body: recapRows,
        styles: {
          fontSize: 9,
          cellPadding: 2,
          lineColor: [107, 134, 201],
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
        },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 40, halign: 'right' },
        },
        didParseCell: (data: any) => {
          // Highlight last row (total général)
          if (data.section === 'body' && data.row.index === recapRows.length - 1) {
            data.cell.styles.fillColor = [185, 201, 234];
            data.cell.styles.fontStyle = 'bold';
          }
          if (data.section === 'body' && data.column.index === 0) {
            data.cell.styles.fontStyle = 'bold';
          }
        },
        // Avoid row splitting so "Total Général" always stays inside the recap table
        // and never renders alone on the next page.
        rowPageBreak: 'avoid',
      });

      const safeName = String(supplier.name || 'Fournisseur').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '_');
      doc.save(`Rapport_Fournisseur_${safeName}_${new Date().toISOString().split('T')[0]}.pdf`);

      toast.success('PDF exporté avec succès');
    } catch (error) {
      console.error('Error exporting supplier PDF:', error);
      toast.error("Erreur lors de l'export PDF");
    }
  };

  
  return (
    <>
      {showCorrectPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md border">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Corriger le montant</h3>
                <p className="text-xs text-gray-500">Annulation + nouveau paiement (audit-safe)</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (correctPaymentLoading) return;
                  setShowCorrectPaymentModal(false);
                  setSelectedPaymentForCorrection(null);
                }}
              >
                ✕
              </Button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="text-xs text-gray-600">
                Réf: <span className="font-mono">{String(selectedPaymentForCorrection?.reference_number || selectedPaymentForCorrection?.reference || selectedPaymentForCorrection?.id || '-')}</span>
                <span className="mx-2">•</span>
                Ancien montant: <span className="font-semibold">{(Number(selectedPaymentForCorrection?.amount || 0) || 0).toFixed(2)} MAD</span>
              </div>

              <div className="space-y-2">
                <Label>Nouveau montant</Label>
                <Input
                  type="number"
                  value={correctNewAmount}
                  onChange={(e) => setCorrectNewAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label>Raison (optionnel)</Label>
                <Input
                  value={correctReason}
                  onChange={(e) => setCorrectReason(e.target.value)}
                  placeholder="Ex: erreur de saisie"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (correctPaymentLoading) return;
                    setShowCorrectPaymentModal(false);
                    setSelectedPaymentForCorrection(null);
                  }}
                >
                  Annuler
                </Button>
                <Button
                  onClick={correctPayment}
                  disabled={correctPaymentLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {correctPaymentLoading ? 'Correction...' : 'Confirmer'}
                </Button>
              </div>

              <p className="text-[11px] text-gray-500">
                Note: cette correction ne change pas la méthode/coffre/chèque, uniquement le montant.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Advance Correction Modal */}
      {showCorrectAdvanceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md border">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Corriger le montant de l'avance</h3>
                <p className="text-xs text-gray-500">Modification du montant de l'avance</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (correctPaymentLoading) return;
                  setShowCorrectAdvanceModal(false);
                  setSelectedAdvanceForCorrection(null);
                }}
              >
                ✕
              </Button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="text-xs text-gray-600">
                Réf: <span className="font-mono">{String(selectedAdvanceForCorrection?.coffer_name || selectedAdvanceForCorrection?.id || '-')}</span>
                <span className="mx-2">•</span>
                Ancien montant: <span className="font-semibold">{(Number(selectedAdvanceForCorrection?.amount || 0) || 0).toFixed(2)} MAD</span>
              </div>

              <div className="space-y-2">
                <Label>Nouveau montant</Label>
                <Input
                  type="number"
                  value={correctAdvanceNewAmount}
                  onChange={(e) => setCorrectAdvanceNewAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label>Raison (optionnel)</Label>
                <Input
                  value={correctAdvanceReason}
                  onChange={(e) => setCorrectAdvanceReason(e.target.value)}
                  placeholder="Ex: erreur de saisie"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (correctPaymentLoading) return;
                    setShowCorrectAdvanceModal(false);
                    setSelectedAdvanceForCorrection(null);
                  }}
                >
                  Annuler
                </Button>
                <Button
                  onClick={correctAdvance}
                  disabled={correctPaymentLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {correctPaymentLoading ? 'Correction...' : 'Confirmer'}
                </Button>
              </div>

              <p className="text-[11px] text-gray-500">
                Note: cette correction met à jour le montant de l'avance et recalcule les soldes.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Invoice (Facture) Correction Modal */}
      {showCorrectInvoiceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md border">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Corriger le montant de la facture</h3>
                <p className="text-xs text-gray-500">Modification du montant de la facture fournisseur</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (correctPaymentLoading) return;
                  setShowCorrectInvoiceModal(false);
                  setSelectedInvoiceForCorrection(null);
                }}
              >
                ✕
              </Button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="text-xs text-gray-600">
                Réf: <span className="font-mono">{String(selectedInvoiceForCorrection?.stock_reference || selectedInvoiceForCorrection?.reference || selectedInvoiceForCorrection?.id || '-')}</span>
                <span className="mx-2">•</span>
                Ancien montant: <span className="font-semibold">{(Number(selectedInvoiceForCorrection?.amount || selectedInvoiceForCorrection?.total_amount || 0) || 0).toFixed(2)} MAD</span>
              </div>

              <div className="space-y-2">
                <Label>Nouveau montant</Label>
                <Input
                  type="number"
                  value={correctInvoiceNewAmount}
                  onChange={(e) => setCorrectInvoiceNewAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label>Raison (optionnel)</Label>
                <Input
                  value={correctInvoiceReason}
                  onChange={(e) => setCorrectInvoiceReason(e.target.value)}
                  placeholder="Ex: erreur de saisie, rabais supplémentaire"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (correctPaymentLoading) return;
                    setShowCorrectInvoiceModal(false);
                    setSelectedInvoiceForCorrection(null);
                  }}
                >
                  Annuler
                </Button>
                <Button
                  onClick={correctInvoice}
                  disabled={correctPaymentLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {correctPaymentLoading ? 'Correction...' : 'Confirmer'}
                </Button>
              </div>

              <p className="text-[11px] text-gray-500">
                Note: cette correction met à jour le montant de la facture et recalcule le total facturé du fournisseur.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Discount (Remise) Correction Modal */}
      {showCorrectDiscountModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md border">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Corriger le montant de la remise</h3>
                <p className="text-xs text-gray-500">Modification du montant de la remise fournisseur</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (correctPaymentLoading) return;
                  setShowCorrectDiscountModal(false);
                  setSelectedDiscountForCorrection(null);
                }}
              >
                ✕
              </Button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="text-xs text-gray-600">
                Réf: <span className="font-mono">{String(selectedDiscountForCorrection?.reference || selectedDiscountForCorrection?.id || '-')}</span>
                <span className="mx-2">•</span>
                Ancien montant: <span className="font-semibold">{(Math.abs(Number(selectedDiscountForCorrection?.amount || selectedDiscountForCorrection?.discount_amount || 0)) || 0).toFixed(2)} MAD</span>
              </div>

              <div className="space-y-2">
                <Label>Nouveau montant</Label>
                <Input
                  type="number"
                  value={correctDiscountNewAmount}
                  onChange={(e) => setCorrectDiscountNewAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label>Raison (optionnel)</Label>
                <Input
                  value={correctDiscountReason}
                  onChange={(e) => setCorrectDiscountReason(e.target.value)}
                  placeholder="Ex: erreur de saisie, ajustement"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (correctPaymentLoading) return;
                    setShowCorrectDiscountModal(false);
                    setSelectedDiscountForCorrection(null);
                  }}
                >
                  Annuler
                </Button>
                <Button
                  onClick={correctDiscount}
                  disabled={correctPaymentLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {correctPaymentLoading ? 'Correction...' : 'Confirmer'}
                </Button>
              </div>

              <p className="text-[11px] text-gray-500">
                Note: cette correction met à jour le montant de la remise et recalcule le solde du fournisseur.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Retour
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{localSupplier.name}</h1>
              <p className="text-gray-600">Détails du fournisseur</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={exportToExcel} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Download className="w-4 h-4 mr-2" />
              Exporter Excel
            </Button>
            <Button onClick={exportToPdf} variant="outline" className="border-blue-600 text-blue-700 hover:bg-blue-50">
              <FileText className="w-4 h-4 mr-2" />
              Exporter PDF
            </Button>
          </div>
        </div>

        {/* Date Range Filter (affects export + payments view) */}
        <Card className="border-blue-200 bg-blue-50/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-blue-900">Filtrer par Période</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate" className="text-gray-700 font-medium">Date de Début</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border-blue-300 focus:border-blue-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate" className="text-gray-700 font-medium">Date de Fin</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border-blue-300 focus:border-blue-500"
                />
              </div>
            </div>
            <p className="text-xs text-blue-800 mt-3">
              Export & paiements filtrés par: <span className="font-semibold">{startDate ? new Date(startDate).toLocaleDateString('fr-FR') : '-'} au {endDate ? new Date(endDate).toLocaleDateString('fr-FR') : '-'}</span>
            </p>
          </CardContent>
        </Card>

        {/* Financial Summary (like client details) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-800 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Total Facturé
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-600">{(Number(totalFactureSupplier) || 0).toFixed(2)} MAD</p>
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
              <p className="text-2xl font-bold text-green-600">{(Number(totalPayeSupplier) || 0).toFixed(2)} MAD</p>
            </CardContent>
          </Card>

          <Card className="bg-amber-50 border-amber-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-amber-800 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Remise Donnée
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-700">{(Number(remiseDonneeSupplier) || 0).toFixed(2)} MAD</p>
            </CardContent>
          </Card>

          <Card className="bg-red-50 border-red-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-800 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Solde Restant (après remise)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-600">{(Number(soldeRestantSupplier) || 0).toFixed(2)} MAD</p>
            </CardContent>
          </Card>
        </div>

        {/* Supplier Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Téléphone</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{supplier.phone || '-'}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Email</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{supplier.email || '-'}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Créé par</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <p className="text-sm font-semibold break-all">
                  {supplier.created_by_email || supplier.created_by || '-'}
                </p>
                <p className="text-xs text-gray-500">
                  {(() => {
                    const raw = supplier.created_at || supplier.createdAt;
                    if (!raw) return '-';
                    const d = new Date(raw);
                    if (Number.isNaN(d.getTime())) return String(raw);
                    return d.toLocaleString('fr-FR');
                  })()}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Informations Détaillées</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Adresse</h3>
                <p className="text-gray-700">{supplier.address || '-'}</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Ville</h3>
                <p className="text-gray-700">{supplier.city || '-'}</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Personne de Contact</h3>
                <p className="text-gray-700">{supplier.contact_person || '-'}</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Conditions de Paiement</h3>
                <p className="text-gray-700">{supplier.payment_terms || '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs switch: Payments vs Advances vs Passages vs Stock references */}
        <div className="flex flex-wrap w-full bg-gray-50 p-1 h-auto gap-1 border border-black rounded-xl shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab('operations')}
            className={`flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all flex-1 min-w-max border ${
              activeTab === 'operations'
                ? 'bg-white border-black text-blue-700 shadow-sm'
                : 'bg-transparent border-transparent hover:bg-white hover:border-gray-200 text-gray-600'
            }`}
            aria-pressed={activeTab === 'operations'}
          >
            <span className="text-xs font-medium">Opérations</span>
            <span className="text-lg font-bold">{combinedOperations.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('stock')}
            className={`flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all flex-1 min-w-max border ${
              activeTab === 'stock'
                ? 'bg-white border-black text-green-700 shadow-sm'
                : 'bg-transparent border-transparent hover:bg-white hover:border-gray-200 text-gray-600'
            }`}
            aria-pressed={activeTab === 'stock'}
          >
            <span className="text-xs font-medium">Stock Achat</span>
            <span className="text-lg font-bold">{filteredSupplierAchats.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('checks')}
            className={`flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all flex-1 min-w-max border ${
              activeTab === 'checks'
                ? 'bg-white border-black text-purple-700 shadow-sm'
                : 'bg-transparent border-transparent hover:bg-white hover:border-gray-200 text-gray-600'
            }`}
            aria-pressed={activeTab === 'checks'}
          >
            <span className="text-xs font-medium">Chèques</span>
            <span className="text-lg font-bold">{filteredSupplierChecksUsed.length}</span>
          </button>

          {(supplier?.is_passage || String(supplier?.type || '').toLowerCase() === 'passage') && (
            <button
              type="button"
              onClick={() => setActiveTab('passages')}
              className={`flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all flex-1 min-w-max border ${
                activeTab === 'passages'
                  ? 'bg-white border-black text-orange-700 shadow-sm'
                  : 'bg-transparent border-transparent hover:bg-white hover:border-gray-200 text-gray-600'
              }`}
              aria-pressed={activeTab === 'passages'}
            >
              <span className="text-xs font-medium">Fournisseur Passage</span>
              <span className="text-lg font-bold">{filteredSupplierPassages.length}</span>
            </button>
          )}

                  </div>

        {/* Supplier stock products - Grouped by Stock Reference */}
        {activeTab === 'stock' && (
          <Card>
            <CardHeader>
              <CardTitle>Achat ({filteredSupplierAchats.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="space-y-2">
                  <Label>Recherche</Label>
                  <Input
                    value={productsSearch}
                    onChange={(e) => setProductsSearch(e.target.value)}
                    placeholder="Rechercher (nom, référence, stock ref...)"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Total achats</Label>
                  <div className="text-2xl font-bold text-green-700">{filteredSupplierAchats.length}</div>
                  <p className="text-xs text-gray-500">Références de stock (achats) sous ce fournisseur</p>
                </div>
              </div>

              {productsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
                </div>
              ) : filteredSupplierProducts.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Aucun produit trouvé pour ce fournisseur</p>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Référence de Stock</th>
                        <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">Nombre de Produits</th>
                        <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">Date Opération</th>
                        <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Quantité Totale</th>
                        <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Valeur Totale</th>
                        <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Prix Moyen</th>
                        <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(() => {
                      // Group products by stock_reference ONLY.
                      // IMPORTANT: SupplierDetails "Achat" must follow the Products page behavior.
                      // Products can be updated (PUT) and overwrite timestamps, so splitting by time here
                      // would create fake "operations" that don't exist in the DB.
                      
                      const stockRefGroups = filteredSupplierProducts
                      .filter(p => p.stock_reference) // Only show products with stock reference
                      .reduce((acc: { [key: string]: any }, product) => {
                      const stockRef = product.stock_reference || 'N/A';
                      const groupKey = stockRef;
                      
                      if (!acc[groupKey]) {
                      acc[groupKey] = {
                      stock_reference: stockRef,
                                            products: [],
                      total_quantity: 0,
                      total_value: 0,
                      product_count: 0,
                      };
                      }
                      
                      acc[groupKey].products.push(product);
                      
                      // Compute totals from reliable fields:
                      // - quantity_available is sometimes 0/empty for supplier products (especially when stock is managed elsewhere)
                      // - unit_price may be empty; prefer purchase_price (or fallback to sale_price)
                      // IMPORTANT in this app:
                      // - quantity_available = Caisse (stock)
                      // - number_of_boxes   = Quantité (movement)
                      // For Achat grouping, we want the operation quantity => prefer number_of_boxes.
                      const qty = Number(
                      (product as any).quantite ??
                      (product as any).number_of_boxes ??
                      (product as any).quantity ??
                      (product as any).qte ??
                      (product as any).initial_quantity ??
                      (product as any).quantity_available ??
                      0
                      ) || 0;
                      
                      const price = Number(
                      product.unit_price ??
                      product.unitPrice ??
                      product.purchase_price ??
                      product.price ??
                      product.sale_price ??
                      0
                      ) || 0;
                      
                      acc[groupKey].total_quantity += qty;
                      // Always recalculate total_value from quantity * unit_price
                      // Do NOT use precomputed total_value as it may be incorrect
                      acc[groupKey].total_value += (qty * price);
                      acc[groupKey].product_count += 1;
                      return acc;
                      }, {});

                        const groups = Object.values(stockRefGroups);

                        if (groups.length === 0) {
                          return (
                            <tr>
                              <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                                Aucune référence de stock trouvée
                              </td>
                            </tr>
                          );
                        }

                        return groups
                        // stable order: newest bucket first (unknown-time last)
                        .sort((a: any, b: any) => {
                        const ta = 0;
                        const tb = 0;
                        return tb - ta;
                        })
                        .map((group: any) => (
                        <tr key={`${group.stock_reference}`} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-mono font-bold text-blue-600">
                        <div className="flex flex-col">
                        <span>{group.stock_reference}</span>
                                                </div>
                        </td>
                            <td className="px-6 py-4 text-sm text-center font-semibold text-gray-900">
                              {group.product_count}
                            </td>
                            <td className="px-6 py-4 text-sm text-center text-gray-600">
                              {(() => {
                                const times = (group.products || [])
                                  .map((p: any) => (p?.created_at ? new Date(p.created_at).getTime() : NaN))
                                  .filter((t: number) => Number.isFinite(t));

                                if (times.length === 0) return '-';

                                const t0 = Math.min(...times);
                                return new Date(t0).toLocaleDateString('fr-FR');
                              })()}
                            </td>
                            <td className="px-6 py-4 text-sm text-right font-semibold text-blue-600">
                              {group.total_quantity.toFixed(2)}
                            </td>
                            <td className="px-6 py-4 text-sm text-right font-semibold text-green-600">
                              {(Number(group.total_value) || 0).toFixed(2)} MAD
                            </td>
                            <td className="px-6 py-4 text-sm text-right font-semibold text-orange-600">
                              {(() => {
                                const qty = Number(group.total_quantity) || 0;
                                const val = Number(group.total_value) || 0;
                                if (qty <= 0) return '0.00 MAD';
                                return `${(val / qty).toFixed(2)} MAD`;
                              })()}
                            </td>
                            <td className="px-6 py-4 text-sm text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-blue-600 hover:text-blue-700"
                                onClick={() => {
                                  setSelectedStockRef(group.stock_reference);
                                  setShowStockRefDetails(true);
                                  setStockRefDetailsData(null);
                                  fetchStockRefDetails(group.stock_reference);
                                }}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Supplier checks used */}
        {activeTab === 'checks' && (
          <Card>
            <CardHeader>
              <CardTitle>Chèques utilisés ({filteredSupplierChecksUsed.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="space-y-2">
                  <Label>Recherche</Label>
                  <Input
                    value={checksSearch}
                    onChange={(e) => setChecksSearch(e.target.value)}
                    placeholder="Rechercher (numéro, statut, donneur, montant...)"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Total chèques</Label>
                  <div className="text-2xl font-bold text-purple-700">{filteredSupplierChecksUsed.length}</div>
                  <p className="text-xs text-gray-500">Chèques utilisés dans les avances fournisseur</p>
                </div>
                <div className="space-y-2">
                  <Label>Total montant</Label>
                  <div className="text-2xl font-bold text-purple-700">
                    {filteredSupplierChecksUsed.reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0).toFixed(2)} MAD
                  </div>
                </div>
              </div>

              {checksLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
                </div>
              ) : filteredSupplierChecksUsed.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Aucun chèque trouvé pour ce fournisseur</p>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Numéro</TableHead>
                        <TableHead>Donneur</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="text-right">Montant</TableHead>
                        <TableHead>Coffre</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSupplierChecksUsed.map((c: any) => {
                        const d = c.check_date ? new Date(c.check_date) : null;
                        const dateStr = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('fr-FR') : '-';
                        return (
                          <TableRow key={c.id}>
                            <TableCell className="text-sm font-medium">{dateStr}</TableCell>
                            <TableCell className="text-sm font-mono">{c.check_number || '-'}</TableCell>
                            <TableCell className="text-sm">{c.giver_name || '-'}</TableCell>
                            <TableCell className="text-sm">{c.status || '-'}</TableCell>
                            <TableCell className="text-sm text-right font-semibold text-purple-700">{(Number(c.amount) || 0).toFixed(2)} MAD</TableCell>
                            <TableCell className="text-sm">{c.coffer_id || '-'}</TableCell>
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

        {/* Supplier operations (payments + advances) */}
        {activeTab === 'operations' && (
          <Card>
            <CardHeader>
              <CardTitle>Opérations ({combinedOperations.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="space-y-2">
                  <Label>Recherche</Label>
                  <Input
                    value={paymentsSearch}
                    onChange={(e) => {
                      setPaymentsSearch(e.target.value);
                      setAdvancesSearch(e.target.value);
                    }}
                    placeholder="Rechercher (méthode, référence, coffre, notes...)"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Total affiché</Label>
                  <div className="text-2xl font-bold text-blue-700">{totalCombinedOperations.toFixed(2)} MAD</div>
                  <p className="text-xs text-gray-500">Basé sur les lignes filtrées</p>
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <div className="text-sm text-gray-700">Paiement / Avance</div>
                </div>
              </div>

              {paymentsLoading || advancesLoading || adminInvoicesLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : combinedOperations.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Aucune opération trouvée pour ce fournisseur</p>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Montant</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Méthode</TableHead>
                        <TableHead>Référence</TableHead>
                        <TableHead>Effectué par</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="text-right">Remise</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {combinedOperations.map((row: any) => {
                        const dateRaw = row.dateRaw;

                        const operationRemise = (() => {
                          const type = String(row?.__type || '').trim();

                          // Remises are displayed as their own operations rows.
                          if (type === 'Remise') return Math.abs(Number(row?.amount || 0) || 0);

                          // For other operation types, do not guess remise from notes/timestamps.
                          return 0;
                        })();
                        const d = dateRaw ? new Date(dateRaw) : null;
                        const dateStr =
                          d && !Number.isNaN(d.getTime())
                            ? d.toLocaleDateString('fr-FR')
                            : (dateRaw ? String(dateRaw) : '-');

                        const typeBadgeClass =
                          row.__type === 'Avance'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-orange-100 text-orange-800';

                        return (
                          <TableRow key={row.id}>
                            <TableCell className="text-sm font-medium">{dateStr}</TableCell>
                            <TableCell className="font-semibold text-blue-700">{Number(row.amount || 0).toFixed(2)} MAD</TableCell>
                            <TableCell>
                              <Badge className={typeBadgeClass}>{row.__type}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">{String(row.payment_method || '-')}</TableCell>
                            <TableCell className="text-sm font-mono">{String(row.reference || '-')}</TableCell>
                            <TableCell className="text-sm break-all">{String(row.actor || '-')}</TableCell>
                            <TableCell className="text-sm text-gray-700 max-w-xs">
                              <div className="truncate" title={String(row.notes || '-')}>{String(row.notes || '-')}</div>
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {operationRemise > 0 ? operationRemise.toFixed(2) : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              {isAdminLike ? (
                                row.__type === 'Paiement' ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const p = row.__raw || {};
                                      setSelectedPaymentForCorrection(p);
                                      setCorrectNewAmount(String(Number(p.amount || 0) || 0));
                                      setCorrectReason('');
                                      setCorrectOperationType('Paiement');
                                      setShowCorrectPaymentModal(true);
                                    }}
                                  >
                                    Corriger
                                  </Button>
                                ) : row.__type === 'Avance' ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const a = row.__raw || {};
                                      setSelectedAdvanceForCorrection(a);
                                      setCorrectAdvanceNewAmount(String(Number(a.amount || 0) || 0));
                                      setCorrectAdvanceReason('');
                                      setShowCorrectAdvanceModal(true);
                                    }}
                                  >
                                    Corriger
                                  </Button>
                                ) : row.__type === 'Facture' ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const inv = row.__raw || {};
                                      setSelectedInvoiceForCorrection(inv);
                                      setCorrectInvoiceNewAmount(String(Number(inv.amount || inv.total_amount || 0) || 0));
                                      setCorrectInvoiceReason('');
                                      setShowCorrectInvoiceModal(true);
                                    }}
                                  >
                                    Corriger
                                  </Button>
                                ) : row.__type === 'Remise' ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const d = row.__raw || {};
                                      setSelectedDiscountForCorrection(d);
                                      setCorrectDiscountNewAmount(String(Math.abs(Number(d.amount || d.discount_amount || 0) || 0)));
                                      setCorrectDiscountReason('');
                                      setShowCorrectDiscountModal(true);
                                    }}
                                  >
                                    Corriger
                                  </Button>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
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

        {/* Supplier passages */}
        {activeTab === 'passages' && (supplier?.is_passage || String(supplier?.type || '').toLowerCase() === 'passage') && (
          <Card>
            <CardHeader>
              <CardTitle>
                Fournisseur Exceptionnel ({filteredSupplierPassages.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="space-y-2">
                  <Label>Recherche</Label>
                  <Input
                    value={passagesSearch}
                    onChange={(e) => setPassagesSearch(e.target.value)}
                    placeholder="Rechercher (méthode, ref, notes...)"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Total affiché</Label>
                  <div className="text-2xl font-bold text-orange-700">{totalSupplierPassages.toFixed(2)} MAD</div>
                  <p className="text-xs text-gray-500">Basé sur les lignes filtrées</p>
                </div>
                <div className="space-y-2">
                  <Label>Effectué par</Label>
                  <div className="text-sm text-gray-700">Rôle + email (si disponible)</div>
                </div>
              </div>

              {passagesLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
                </div>
              ) : filteredSupplierPassages.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Aucun paiement passage pour ce fournisseur</p>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Montant</TableHead>
                        <TableHead>Méthode</TableHead>
                        <TableHead>Référence</TableHead>
                        <TableHead>Effectué par</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSupplierPassages.map((p: any) => {
                        const dateRaw = p.passage_date || p.created_at;
                        const d = dateRaw ? new Date(dateRaw) : null;
                        const dateStr =
                          d && !Number.isNaN(d.getTime())
                            ? d.toLocaleDateString('fr-FR')
                            : (dateRaw ? String(dateRaw) : '-');

                        const method = String(p.payment_method || '-');
                        const ref = p.reference || '-';
                        const notes = p.notes || '-';
                        const actor = `${p.created_by_role || ''}${p.created_by_email ? ` • ${p.created_by_email}` : ''}`.trim() || p.created_by_email || p.created_by || '-';

                        return (
                          <TableRow key={p.id}>
                            <TableCell className="text-sm font-medium">{dateStr}</TableCell>
                            <TableCell className="font-semibold text-orange-700">{Number(p.amount || 0).toFixed(2)} MAD</TableCell>
                            <TableCell className="text-sm">{method}</TableCell>
                            <TableCell className="text-sm font-mono">{ref}</TableCell>
                            <TableCell className="text-sm break-all">{actor}</TableCell>
                            <TableCell className="text-sm text-gray-700 max-w-xs">
                              <div className="truncate" title={notes}>{notes}</div>
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

        {/* Stock Reference Details Modal - Fullsize */}
        {showStockRefDetails && selectedStockRef && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-[9999] flex flex-col">
            {/* Header */}
            <div className="bg-white border-b px-6 py-4 flex items-center justify-between flex-shrink-0">
              <h1 className="text-2xl font-bold text-gray-900">Produits - Référence de Stock: {selectedStockRef}</h1>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowStockRefDetails(false);
                  setSelectedStockRef(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto bg-white px-6 py-6">
              {(() => {
                const productsInRef = filteredSupplierProducts.filter((p) => p.stock_reference === selectedStockRef);

                // IMPORTANT:
                // In this app:
                // - Caisse (stock) is stored in quantity_available
                // - Quantité is stored in number_of_boxes
                // Totals in Stock Ref Details v2 must match the add-stock "Sous-total" logic:
                //   Sous-total = Quantité * Prix Unitaire
                const getQty = (p: any) => Number(p?.quantite ?? p?.number_of_boxes ?? 0) || 0;

                const getPrice = (p: any) =>
                  Number(p?.purchase_price ?? p?.unit_price ?? p?.unitPrice ?? p?.price ?? p?.sale_price ?? 0) || 0;

                // TOTAL GÉNÉRAL must be computed from the same "Valeur Totale" column shown in the table (frontend-only).
                // Valeur Totale must be: Quantité (number_of_boxes) * Prix Unitaire.
                // IMPORTANT: do NOT use "Caisse" (quantity_available) for value calculation.
                const getRowValeurTotale = (p: any) => {
                  const quantity = Number((p as any).quantite ?? (p as any).number_of_boxes ?? 0) || 0;
                  const unit = Number((p as any).purchase_price ?? (p as any).unit_price ?? (p as any).sale_price ?? 0) || 0;
                  const v = quantity * unit;
                  return Number.isFinite(v) ? v : 0;
                };

                const totalQty = productsInRef.reduce((sum, p) => sum + getQty(p), 0);
                const totalVal = productsInRef.reduce((sum, p) => sum + getRowValeurTotale(p), 0);
                const avgPrice = totalQty > 0 ? (totalVal / totalQty) : 0;

                // Extra charges (frais) from stock reference details must be included in the TOTAL GÉNÉRAL.
                // These are achat-level charges, not per-product, so we add them once.
                const toNum = (v: any) => {
                  const n = Number(String(v ?? '').replace(',', '.'));
                  return Number.isFinite(n) ? n : 0;
                };

                const totalFrais =
                  toNum(stockRefDetailsData?.frais_maritime) +
                  toNum(stockRefDetailsData?.frais_transit) +
                  toNum(stockRefDetailsData?.onssa) +
                  toNum(stockRefDetailsData?.frais_divers) +
                  toNum(stockRefDetailsData?.frais_transport) +
                  toNum(stockRefDetailsData?.magasinage) +
                  toNum(stockRefDetailsData?.taxe);

                const totalGeneral = totalVal + totalFrais;

                return (
                  <div className="space-y-6">
                    
                    {/* Informations Entreprise */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Informations Entreprise</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {stockRefDetailsLoading ? (
                          <p className="text-gray-600">Chargement...</p>
                        ) : !stockRefDetailsData ? (
                          <p className="text-gray-600">-</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-6">
                              <div>
                                <p className="text-xs text-gray-500">Palette/Catégorie</p>
                                <p className="text-sm font-semibold text-gray-900">
                                  {(() => {
                                    const pick = (v: any) => {
                                      const s = String(v ?? '').trim();
                                      return s ? s : null;
                                    };

                                    return (
                                      pick(stockRefDetailsData?.palette_category) ||
                                      pick(stockRefDetailsData?.palette_categorie) ||
                                      pick(stockRefDetailsData?.palette) ||
                                      pick(stockRefDetailsData?.categorie) ||
                                      pick(stockRefDetailsData?.category) ||
                                      pick(stockRefDetailsData?.paletteCategory) ||
                                      pick(stockRefDetailsData?.paletteCategorie) ||
                                      '-'
                                    );
                                  })()}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs text-gray-500">Matricule</p>
                                <p className="text-sm font-semibold text-gray-900">{stockRefDetailsData?.matricule || '-'}</p>
                              </div>

                              <div>
                                <p className="text-xs text-gray-500">Date Déchargement</p>
                                <p className="text-sm font-semibold text-gray-900">
                                  {(() => {
                                    const raw = stockRefDetailsData?.date_dechargement;
                                    if (raw == null) return '-';
                                    const s = String(raw).trim();
                                    if (!s) return '-';
                                    const m = /^\d{4}-\d{2}-\d{2}$/.exec(s);
                                    if (!m) return s;
                                    const d = new Date(`${s}T00:00:00`);
                                    if (Number.isNaN(d.getTime())) return s;
                                    return d.toLocaleDateString('fr-FR');
                                  })()}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs text-gray-500">Frais Transit (MAD)</p>
                                <p className="text-sm font-semibold text-gray-900">{stockRefDetailsData?.frais_transit ?? '-'}</p>
                              </div>

                              <div>
                                <p className="text-xs text-gray-500">Frais Divers (MAD)</p>
                                <p className="text-sm font-semibold text-gray-900">{stockRefDetailsData?.frais_divers ?? '-'}</p>
                              </div>

                              <div>
                                <p className="text-xs text-gray-500">Magasinage (MAD)</p>
                                <p className="text-sm font-semibold text-gray-900">{stockRefDetailsData?.magasinage ?? '-'}</p>
                              </div>
                            </div>

                            <div className="space-y-6">
                              <div>
                                <p className="text-xs text-gray-500">Entrepôt (Magasin)</p>
                                <p className="text-sm font-semibold text-gray-900">{stockRefDetailsData?.entrepot || '-'}</p>
                              </div>

                              <div>
                                <p className="text-xs text-gray-500">Date Chargement</p>
                                <p className="text-sm font-semibold text-gray-900">
                                  {(() => {
                                    const raw = stockRefDetailsData?.date_chargement;
                                    if (raw == null) return '-';
                                    const s = String(raw).trim();
                                    if (!s) return '-';
                                    const m = /^\d{4}-\d{2}-\d{2}$/.exec(s);
                                    if (!m) return s;
                                    const d = new Date(`${s}T00:00:00`);
                                    if (Number.isNaN(d.getTime())) return s;
                                    return d.toLocaleDateString('fr-FR');
                                  })()}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs text-gray-500">Frais Maritime (MAD)</p>
                                <p className="text-sm font-semibold text-gray-900">{stockRefDetailsData?.frais_maritime ?? '-'}</p>
                              </div>

                              <div>
                                <p className="text-xs text-gray-500">ONSSA (MAD)</p>
                                <p className="text-sm font-semibold text-gray-900">{stockRefDetailsData?.onssa ?? '-'}</p>
                              </div>

                              <div>
                                <p className="text-xs text-gray-500">Frais Transport (MAD)</p>
                                <p className="text-sm font-semibold text-gray-900">{stockRefDetailsData?.frais_transport ?? '-'}</p>
                              </div>

                              <div>
                                <p className="text-xs text-gray-500">Taxe (MAD)</p>
                                <p className="text-sm font-semibold text-gray-900">{stockRefDetailsData?.taxe ?? '-'}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Pièce jointe livraison van */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Pièce Jointe Livraison Van</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {(() => {
                          const fromDetails = String(stockRefDetailsData?.van_delivery_attachment_url || '').trim();
                          const fromProduct = String(
                            (productsInRef.find((p: any) => !!p?.van_delivery_attachment_url) as any)?.van_delivery_attachment_url ||
                              ''
                          ).trim();

                          const url = fromDetails || fromProduct;

                          try {
                            console.log('[SupplierDetailsPage] van attach debug', {
                              hasAttachment: !!url,
                              attachmentUrlPrefix: url ? String(url).slice(0, 40) : '',
                            });
                          } catch {
                            // ignore
                          }

                          if (!url) return <p className="text-gray-600">-</p>;
                          return (
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:underline font-medium"
                            >
                              Ouvrir la pièce jointe
                            </a>
                          );
                        })()}
                      </CardContent>
                    </Card>

                    {/* Products Table */}
                    <div className="border rounded-lg overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b sticky top-0">
                          <tr>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Nom du Produit</th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Référence</th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Catégorie</th>
                            <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Quantité</th>
                            <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Caisse</th>
                            <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Moyenne</th>
                            <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Prix Unitaire</th>
                            <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Valeur Totale</th>
                            <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Fourchette Min</th>
                            <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Fourchette Max</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {productsInRef.length === 0 ? (
                            <tr>
                              <td colSpan={10} className="px-6 py-8 text-center text-gray-500">
                                Aucun produit trouvé
                              </td>
                            </tr>
                          ) : (
                            productsInRef.map((product: any) => {
                              const quantity = Number(product.quantite ?? product.number_of_boxes ?? 0) || 0;
                              // IMPORTANT:
                              // In this app:
                              // - Caisse  (stock)  is stored in quantity_available
                              // - Quantité is stored in number_of_boxes
                              // Stock Ref Details v2 must display:
                              //   Quantité = number_of_boxes
                              //   Caisse   = quantity_available
                              const caisse = Number(
                                product.caisse ??
                                product.quantity_available ??
                                product.quantity ??
                                product.qte ??
                                product.initial_quantity ??
                                0
                              ) || 0;
                              const quantite = Number(product.quantite ?? product.number_of_boxes ?? 0) || 0;

                              // Moyenne = Quantité / Caisse
                              const moyenne = caisse > 0 ? (quantite / caisse).toFixed(2) : '-';

                              return (
                                <tr key={product.id} className="hover:bg-gray-50">
                                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{product.name || '-'}</td>
                                  <td className="px-6 py-4 text-sm font-mono text-gray-600">{product.reference || '-'}</td>
                                  <td className="px-6 py-4 text-sm text-gray-600">{product.category || '-'}</td>
                                  <td className="px-6 py-4 text-sm text-right font-semibold text-blue-600">
                                    {quantite.toFixed(2)}
                                  </td>
                                  <td className="px-6 py-4 text-sm text-right font-semibold text-indigo-600">
                                    {caisse > 0 ? caisse : '-'}
                                  </td>
                                  <td className="px-6 py-4 text-sm text-right font-semibold text-purple-600">
                                    {moyenne}
                                  </td>
                                  <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
                                    {(Number(product.purchase_price ?? product.unit_price ?? product.sale_price ?? 0) || 0).toFixed(2)} MAD
                                  </td>
                                  <td className="px-6 py-4 text-sm text-right font-semibold text-green-600">
                                    {(quantity * (Number(product.purchase_price ?? product.unit_price ?? product.sale_price ?? 0) || 0)).toFixed(2)} MAD
                                  </td>
                                  <td className="px-6 py-4 text-sm text-right font-semibold text-purple-600">
                                    {product.fourchette_min !== undefined && product.fourchette_min !== null ? String(product.fourchette_min) : '-'}
                                  </td>
                                  <td className="px-6 py-4 text-sm text-right font-semibold text-purple-600">
                                    {product.fourchette_max !== undefined && product.fourchette_max !== null ? String(product.fourchette_max) : '-'}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Totals (under table) */}
                    <div className="flex items-center justify-end">
                      <div className="bg-gray-50 border rounded-lg px-4 py-3 text-right min-w-[260px]">
                        <div className="text-sm text-gray-600">TOTAL GÉNÉRAL</div>
                        <div className="text-xl font-bold text-gray-900">{(Number(totalGeneral) || 0).toFixed(2)} MAD</div>
                        <div className="text-xs text-gray-500 mt-1">
                          Quantité: {(Number(totalQty) || 0).toFixed(2)} • Prix moyen: {(Number(avgPrice) || 0).toFixed(2)}
                          {totalFrais > 0 ? ` • Frais: ${totalFrais.toFixed(2)}` : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="bg-white border-t px-6 py-4 flex justify-end gap-2 flex-shrink-0">
              <Button
                onClick={() => {
                  setShowStockRefDetails(false);
                  setSelectedStockRef(null);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Fermer
              </Button>
            </div>
          </div>
        )}

        </div>
    </>
  );
}
