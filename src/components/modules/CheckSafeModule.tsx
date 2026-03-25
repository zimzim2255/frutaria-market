import { useState, useEffect, useMemo } from 'react';
import { projectId } from '../../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Search, Lock, CheckCircle, AlertTriangle, TrendingUp, Clock, Shield, Eye, Trash2, Plus, Download, FileText } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Supplier advance creation
interface SupplierAdvance {
  id: string;
  supplier_id: string;
  store_id: string | null;
  coffer_id: string;
  coffer_name?: string | null;
  amount: number;
  payment_method: 'cash' | 'check' | 'bank_transfer';
  check_reference?: string | null;
  bank_transfer_reference?: string | null;
  bank_transfer_date?: string | null;
  notes?: string | null;
  payment_date?: string | null;
  created_by_email?: string | null;
  created_by_role?: string | null;
  created_at: string;
}

interface CheckSafeModuleProps {
  session: any;
}

interface Coffer {
  id: string;
  name: string;
  createdAt: string;
}

export function CheckSafeModule({ session }: CheckSafeModuleProps) {
  const looksLikeUuid = (v: any) => {
    const s = String(v || '').trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
  };

  // Normalize any amount coming from DB/UI so we never display invalid "--" values.
  // Also ensures table totals use the same numeric interpretation.
  const normalizeSignedAmount = (raw: any) => {
    if (raw === null || raw === undefined) return 0;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;

    const s0 = String(raw).trim();
    if (!s0) return 0;

    // Keep digits, minus, dot and comma only
    let s = s0.replace(/[^0-9,\.\-]/g, '');
    // Convert comma decimals
    s = s.replace(/,/g, '.');

    // Detect negativity (one or more leading '-') then strip all '-'
    const isNeg = /^-+/.test(s);
    s = s.replace(/-/g, '');

    const n = Number(s);
    if (!Number.isFinite(n)) return 0;
    return isNeg ? -n : n;
  };
  const [checksSafe, setChecksSafe] = useState<any[]>([]);
  const [checkSafeUsages, setCheckSafeUsages] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [borrowedMoneyList, setBorrowedMoneyList] = useState<any[]>([]);

  const [currentUserRole, setCurrentUserRole] = useState<string>('user');
  const [currentUserPermissions, setCurrentUserPermissions] = useState<string[]>([]);

  const isAdmin = currentUserRole === 'admin';
  const hasPermission = (permission: string): boolean => {
    if (isAdmin) return true;
    return currentUserPermissions.includes(permission);
  };

  const canViewCoffre = hasPermission('Voir le Coffre');
  const canAddCoffreEntry = hasPermission('Ajouter une Entrée Coffre');
  const canEditCoffreEntry = hasPermission('Modifier une Entrée Coffre');
  const canDeleteCoffreEntry = hasPermission('Supprimer une Entrée Coffre');
  const canCreateSupplierAdvance = hasPermission('Créer une Avance Fournisseur (Coffre)');
  const canSupplierGlobalPayment = hasPermission('Paiement Global Fournisseur (Coffre)');

  // Coffer movements (deposits/expenses) - stored in `expenses` table
  const [cofferMovements, setCofferMovements] = useState<any[]>([]);
  const [cofferMovementsLoading, setCofferMovementsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  // Movements date filter
  const [cofferMovementsDateFrom, setCofferMovementsDateFrom] = useState<string>('');
  const [cofferMovementsDateTo, setCofferMovementsDateTo] = useState<string>('');
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedCheckSafe, setSelectedCheckSafe] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterStore, setFilterStore] = useState('all');

  // Advanced filters (aligned with CheckInventoryModule)
  const [filterCheckDateFrom, setFilterCheckDateFrom] = useState<string>('');
  const [filterCheckDateTo, setFilterCheckDateTo] = useState<string>('');
  const [filterDueDateFrom, setFilterDueDateFrom] = useState<string>('');
  const [filterDueDateTo, setFilterDueDateTo] = useState<string>('');
  const [filterConfirmedDateFrom, setFilterConfirmedDateFrom] = useState<string>('');
  const [filterConfirmedDateTo, setFilterConfirmedDateTo] = useState<string>('');
  const [filterTransferredDateFrom, setFilterTransferredDateFrom] = useState<string>('');
  const [filterTransferredDateTo, setFilterTransferredDateTo] = useState<string>('');
  const [filterAmountFrom, setFilterAmountFrom] = useState<string>('');
  const [filterAmountTo, setFilterAmountTo] = useState<string>('');

  const [selectedChecks, setSelectedChecks] = useState<Map<string, boolean>>(new Map());
  const [bulkAction, setBulkAction] = useState<string>('verified');
  const [showFilters, setShowFilters] = useState(false);
  const [bulkTransferPaymentDialogOpen, setBulkTransferPaymentDialogOpen] = useState(false);
  const [bulkTransferPaymentNote, setBulkTransferPaymentNote] = useState('');
  const [bulkTransferPaymentSubmitting, setBulkTransferPaymentSubmitting] = useState(false);

  // View switcher
  // movements: coffer history (deposits/expenses)
  // checks: checks safe
  const [activeView, setActiveView] = useState<'movements' | 'checks'>('checks');

  // Movement creation state (NEW)
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [depositMethod, setDepositMethod] = useState<'cash' | 'check' | 'bank_transfer'>('cash');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositReason, setDepositReason] = useState('');
  const [depositReference, setDepositReference] = useState('');
  const [depositNotes, setDepositNotes] = useState('');
  const [depositSubmitting, setDepositSubmitting] = useState(false);
  const [depositDate, setDepositDate] = useState<string>('');

  // NEW: Versement (direct to Coffre, no caisse deduction)
  const [versementDialogOpen, setVersementDialogOpen] = useState(false);
  const [versementMethod, setVersementMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [versementAmount, setVersementAmount] = useState('');
  const [versementReason, setVersementReason] = useState('');
  const [versementReference, setVersementReference] = useState('');
  const [versementNotes, setVersementNotes] = useState('');
  const [versementSubmitting, setVersementSubmitting] = useState(false);
  const [versementDate, setVersementDate] = useState<string>('');

  // Coffer management state
  const [coffers, setCoffers] = useState<Coffer[]>([]);
  const [selectedCofferId, setSelectedCofferId] = useState<string>('main');
  const [createCofferDialogOpen, setCreateCofferDialogOpen] = useState(false);
  const [newCofferName, setNewCofferName] = useState('');
  const [cofferLoading, setCofferLoading] = useState(false);
  const [users, setUsers] = useState<any[]>([]);

  // Global payment state
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [paymentSupplierSearch, setPaymentSupplierSearch] = useState('');
  const [selectedPaymentSupplier, setSelectedPaymentSupplier] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentRemiseAmount, setPaymentRemiseAmount] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [supplierPayments, setSupplierPayments] = useState<any[]>([]);
  const [discounts, setDiscounts] = useState<any[]>([]);
  const [globalPaymentLoading, setGlobalPaymentLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'check' | 'bank_transfer'>('cash');
  const [checks, setChecks] = useState<any[]>([]);
  const [supplierPaymentDate, setSupplierPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  // IMPORTANT:
  // - checksSafe: actual Coffre checks (check_safe)
  // - checks: legacy check_inventory list used only for the header "Non transférés"
  const [selectedCheck, setSelectedCheck] = useState<any>(null);
  const [bankProofFile, setBankProofFile] = useState<File | null>(null);
  const [loadingChecks, setLoadingChecks] = useState(false);
  const [checkDialogOpen, setCheckDialogOpen] = useState(false);
  const [checkSearchTerm, setCheckSearchTerm] = useState('');
  const [createCheckDialogOpen, setCreateCheckDialogOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCheckId, setUploadCheckId] = useState('');
  const [uploadAmount, setUploadAmount] = useState('');
  const [uploadGiverName, setUploadGiverName] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadCheckDate, setUploadCheckDate] = useState('');
  const [uploadExecutionDate, setUploadExecutionDate] = useState('');

  // Coffer Expenses state
  const [cofferExpensesDialogOpen, setCofferExpensesDialogOpen] = useState(false);
  const [cofferExpenseAmount, setCofferExpenseAmount] = useState('');
  const [cofferExpenseReason, setCofferExpenseReason] = useState('');
  const [cofferExpenseProofFile, setCofferExpenseProofFile] = useState<File | null>(null);
  const [cofferExpenseDate, setCofferExpenseDate] = useState<string>('');
  const [cofferExpenseSubmitting, setCofferExpenseSubmitting] = useState(false);
  const [cofferExpenseCategories, setCofferExpenseCategories] = useState<any[]>([]);
  const [cofferExpenseCategorySearch, setCofferExpenseCategorySearch] = useState('');
  const [showCofferExpenseCategorySuggestions, setShowCofferExpenseCategorySuggestions] = useState(false);

  // ===== Supplier Advances (Advance payments to suppliers) =====
  const [advanceDialogOpen, setAdvanceDialogOpen] = useState(false);
  const [advanceSubmitting, setAdvanceSubmitting] = useState(false);
  const [advanceSuppliers, setAdvanceSuppliers] = useState<any[]>([]);
  const [advanceSupplierId, setAdvanceSupplierId] = useState<string>('');
  const [advanceAmount, setAdvanceAmount] = useState<string>('');
  const [advancePaymentMethod, setAdvancePaymentMethod] = useState<'cash' | 'check' | 'bank_transfer'>('cash');
  const [advanceDate, setAdvanceDate] = useState<string>('');
  const [advanceCheckReference, setAdvanceCheckReference] = useState<string>('');
  const [advanceBankTransferReference, setAdvanceBankTransferReference] = useState<string>('');
  const [advanceBankTransferDate, setAdvanceBankTransferDate] = useState<string>('');
  const [advanceBankTransferProofFile, setAdvanceBankTransferProofFile] = useState<File | null>(null);
  const [advanceNotes, setAdvanceNotes] = useState<string>('');

  const [advanceHistoryOpen, setAdvanceHistoryOpen] = useState(false);
  const [advances, setAdvances] = useState<SupplierAdvance[]>([]);
  const [advancesLoading, setAdvancesLoading] = useState(false);
  const [advancesSearch, setAdvancesSearch] = useState('');

  const [advanceUserRole, setAdvanceUserRole] = useState<string>('user');
  const [advanceCurrentStoreId, setAdvanceCurrentStoreId] = useState<string | null>(null);
  const [advanceStores, setAdvanceStores] = useState<any[]>([]);
  const [advanceFilterStore, setAdvanceFilterStore] = useState<string>('all');

  // Export dropdown state
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);

  // Global payment dialog state
  const [globalPaymentDialogOpen, setGlobalPaymentDialogOpen] = useState(false);
  const [globalPaymentSelectedMagasin, setGlobalPaymentSelectedMagasin] = useState<any>(null);
  const [additionalPaymentMethod, setAdditionalPaymentMethod] = useState<'cash' | 'check' | 'bank_transfer' | null>(null);
  const [additionalPaymentAmount, setAdditionalPaymentAmount] = useState('');
  const [selectedAdditionalCheck, setSelectedAdditionalCheck] = useState<any>(null);
  const [checkDialogOpenAdditional, setCheckDialogOpenAdditional] = useState(false);
  const [checkSearchTermAdditional, setCheckSearchTermAdditional] = useState('');
  const [additionalBankProofFile, setAdditionalBankProofFile] = useState<File | null>(null);

  const fetchChecksSafe = async (cofferId: string = 'main') => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/check-safe?coffer_id=${cofferId}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();

        // Build helper maps for better enrichment
        const userById = new Map<string, any>((users || []).map((u: any) => [String(u.id), u]));
        const storeById = new Map<string, any>((stores || []).map((s: any) => [String(s.id), s]));

        // Enrich check data with:
        // - created_by_user
        // - created_by_store (via user's store_id)
        // - inventory_due_date (from check_inventory.due_date)
        let inventoryById = new Map<string, any>();
        let inventoryByNumber = new Map<string, any>();

        try {
          const invRes = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory`,
            {
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
              },
            }
          );
          if (invRes.ok) {
            const invJson = await invRes.json().catch(() => ({}));
            const invRows = invJson.check_inventory || [];
            inventoryById = new Map(invRows.map((r: any) => [String(r.id), r]));
            inventoryByNumber = new Map(invRows.map((r: any) => [String(r.check_id_number || '').trim(), r]));
          }
        } catch {
          // best-effort
        }

        const enrichedChecks = (data.check_safe || []).map((check: any) => {
          const createdByUser = check?.created_by ? userById.get(String(check.created_by)) : undefined;
          const createdByStore = createdByUser?.store_id ? storeById.get(String(createdByUser.store_id)) : undefined;

          const inv = (check?.check_inventory_id && inventoryById.get(String(check.check_inventory_id)))
            || (check?.check_number && inventoryByNumber.get(String(check.check_number).trim()))
            || null;

          return {
            ...check,
            inventory_due_date: inv?.due_date || null,
            // Bring inventory notes into Coffre UI so we can display them in the table.
            inventory_notes: inv?.notes || null,
            created_by_user: createdByUser
              ? {
                  id: createdByUser.id,
                  email: createdByUser.email,
                  full_name: createdByUser.full_name || createdByUser.name,
                  role: createdByUser.role,
                  store_id: createdByUser.store_id,
                }
              : undefined,
            created_by_store: createdByStore
              ? {
                  id: createdByStore.id,
                  name: createdByStore.name,
                }
              : undefined,
          };
        });

        setChecksSafe(enrichedChecks);
      }
    } catch (error) {
      console.error('Error fetching checks safe:', error);
      toast.error('Erreur lors du chargement du coffre-fort');
    }
  };

  // Fetch users
  const fetchUsers = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/users`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchStores = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/stores`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setStores(data.stores || []);
      }
    } catch (error) {
      console.error('Error fetching stores:', error);
    }
  };

  const fetchSales = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/sales`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setSales(data.sales || []);
      }
    } catch (error) {
      console.error('Error fetching sales:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch suppliers for global payment
  const fetchSuppliers = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/suppliers`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setSuppliers(data.suppliers || []);
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    }
  };

  // Fetch payments for global payment
  const fetchSupplierPayments = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/payments`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setSupplierPayments(data.payments || []);
      }
    } catch (error) {
      console.error('Error fetching supplier payments:', error);
    }
  };

  // Fetch discounts for global payment
  const fetchDiscountsList = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/discounts`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setDiscounts(data.discounts || []);
      }
    } catch (error) {
      console.error('Error fetching discounts:', error);
    }
  };

  // Fetch borrowed money
  const fetchBorrowedMoney = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/borrowed-money`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setBorrowedMoneyList(data.borrowed_money || []);
      }
    } catch (error) {
      console.error('Error fetching borrowed money:', error);
    }
  };

  // Fetch check safe usages (how much of each check has been used)
  const fetchCheckSafeUsages = async () => {
    try {
      const qs = new URLSearchParams();
      qs.set('coffer_id', selectedCofferId || 'main');

      // Admin: if a magasin is selected, scope to it
      if (advanceUserRole === 'admin' && advanceFilterStore !== 'all') {
        qs.set('store_id', advanceFilterStore);
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/check-safe-usages?${qs.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setCheckSafeUsages(data.check_safe_usages || []);
      }
    } catch (error) {
      console.error('Error fetching check safe usages:', error);
    }
  };

  const normalizeMovementType = (t: any) => String(t || '').trim().toLowerCase();
  const isDepositType = (t: string) =>
    t.includes('deposit') || t.includes('depot') || t.includes('versement') || t.includes('credit') || t.includes('in');
  const isCofferType = (t: string) =>
    t.includes('coffer') || t.includes('coffre') || t.includes('safe') || t.includes('bank_safe');

  const isCofferDepositType = (t: string) =>
    t.includes('coffer_deposit') || t.includes('coffre_depot') || t.includes('coffre_deposit');

  const fetchCofferMovements = async (cofferId: string) => {
    setCofferMovementsLoading(true);
    try {
      // Backend currently returns expenses store-scoped; we apply coffer + date filtering client-side.
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/expenses`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();

        // Normalize amounts so UI never ends up with "--" and totals are consistent.
        const normalizedExpenses = (data.expenses || []).map((e: any) => ({
          ...e,
          amount: normalizeSignedAmount(e?.amount),
        }));

        const movements = normalizedExpenses.filter((e: any) => {
          const sameCoffer = String(e.coffer_id || '') === String(cofferId || '');
          const type = normalizeMovementType(e.expense_type);

          // Optional date range filter (payment_date or created_at)
          // UI passes YYYY-MM-DD, compare by creating boundaries.
          const dateToCheck = e?.payment_date || e?.created_at;
          if (cofferMovementsDateFrom) {
            const fromT = new Date(`${cofferMovementsDateFrom}T00:00:00.000Z`).getTime();
            const t = dateToCheck ? new Date(dateToCheck).getTime() : NaN;
            if (Number.isFinite(fromT) && Number.isFinite(t) && t < fromT) return false;
          }
          if (cofferMovementsDateTo) {
            const toT = new Date(`${cofferMovementsDateTo}T23:59:59.999Z`).getTime();
            const t = dateToCheck ? new Date(dateToCheck).getTime() : NaN;
            if (Number.isFinite(toT) && Number.isFinite(t) && t > toT) return false;
          }

          // Be tolerant: if expense_type is missing but coffer_id is present, still show it.
          if (!type) return sameCoffer;

          // Otherwise, show anything that looks coffer-related or deposit/withdrawal.
          return sameCoffer && (
            isCofferType(type) ||
            isCofferDepositType(type) ||
            isDepositType(type) ||
            type.includes('withdraw') ||
            type.includes('expense') ||
            type.includes('out')
          );
        });

        // newest first
        movements.sort((a: any, b: any) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        setCofferMovements(movements);
      } else {
        setCofferMovements([]);
      }
    } catch (error) {
      console.error('Error fetching coffer movements:', error);
      setCofferMovements([]);
    } finally {
      setCofferMovementsLoading(false);
    }
  };

  // Resolve current user role/permissions
  useEffect(() => {
    const fetchMe = async () => {
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/users`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        if (!res.ok) return;
        const data = await res.json();
        const me = data.users?.find((u: any) => u.email === session.user?.email);
        if (me) {
          setCurrentUserRole(me.role || 'user');
          setCurrentUserPermissions(Array.isArray(me.permissions) ? me.permissions : []);

          // Keep existing advance state in sync
          setAdvanceUserRole(me.role || 'user');
          setAdvanceCurrentStoreId(me.store_id ? String(me.store_id) : null);
        }
      } catch (e) {
        console.warn('Could not fetch current user:', e);
      }
    };

    if (session?.access_token) fetchMe();
  }, [session.access_token, session.user?.email]);

  // Fetch stores for admin filter (advance)
  useEffect(() => {
    const fetchStores = async () => {
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/stores`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );
        if (!res.ok) return;
        const data = await res.json();
        const sorted = (data.stores || []).sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')));
        setAdvanceStores(sorted);
      } catch (e) {
        console.warn('Could not fetch stores for advances:', e);
      }
    };

    if (advanceUserRole === 'admin') fetchStores();
  }, [advanceUserRole, session.access_token]);

  const fetchSuppliersForAdvance = async () => {
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/suppliers`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!res.ok) {
        setAdvanceSuppliers([]);
        return;
      }

      const data = await res.json();
      const list = (data.suppliers || []) as any[];

      const effectiveStoreId = advanceUserRole === 'admin'
        ? (advanceFilterStore !== 'all' ? advanceFilterStore : null)
        : (advanceCurrentStoreId ? String(advanceCurrentStoreId) : null);

      const filtered = effectiveStoreId
        ? list.filter((s: any) => String(s.store_id || '') === String(effectiveStoreId) && !s.is_passage && s.type !== 'passage')
        : (advanceUserRole === 'admin' ? list.filter((s: any) => !s.is_passage && s.type !== 'passage') : list.filter((s: any) => !s.is_passage && s.type !== 'passage'));

      filtered.sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')));
      setAdvanceSuppliers(filtered);
    } catch (e) {
      console.warn('Could not fetch suppliers for advances:', e);
      setAdvanceSuppliers([]);
    }
  };

  const fetchAdvances = async () => {
    try {
      setAdvancesLoading(true);
      const qs = new URLSearchParams();
      if (advanceUserRole === 'admin') {
        if (advanceFilterStore !== 'all') qs.set('store_id', advanceFilterStore);
      }

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/supplier-advances?${qs.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!res.ok) {
        setAdvances([]);
        return;
      }

      const data = await res.json();
      setAdvances((data.advances || []) as SupplierAdvance[]);
    } catch (e) {
      console.warn('Could not fetch advances:', e);
      setAdvances([]);
    } finally {
      setAdvancesLoading(false);
    }
  };

  useEffect(() => {
    if (!session?.access_token) return;
    fetchSuppliersForAdvance();
    fetchAdvances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advanceFilterStore, advanceUserRole, advanceCurrentStoreId]);

  // Initialize coffers from backend endpoint (uses service role -> bypasses RLS issues).
  // This is required because reading `public.coffers` via PostgREST can be blocked by RLS
  // after logout/login, depending on policies.
  useEffect(() => {
    const init = async () => {
      const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

      // 1) Try backend-derived coffers from edge function
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/coffers`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        if (res.ok) {
          const json = await res.json().catch(() => ({}));
          const rows = (json as any)?.coffers || [];

          const normalized: Coffer[] = [
            { id: 'main', name: 'Coffre Principal', createdAt: new Date().toISOString() },
            ...(Array.isArray(rows) ? rows : [])
              .filter((r: any) => r && String(r.id || '').trim() && String(r.id).trim() !== 'main')
              .filter((r: any) => r?.is_active !== false)
              .map((r: any) => ({
                id: String(r.id),
                name: String(r.name || r.id),
                createdAt: String(r.created_at || new Date().toISOString()),
              })),
          ];

          setCoffers(normalized);
          localStorage.setItem('coffers', JSON.stringify(normalized));
          return;
        }
      } catch (_e) {
        // ignore; fallback below
      }

      // 2) Fallback localStorage
      const savedCoffers = localStorage.getItem('coffers');
      if (savedCoffers) {
        try {
          const parsed = JSON.parse(savedCoffers);
          const normalized = Array.isArray(parsed) ? parsed : [];
          const now = Date.now();

          // Purge expired deletions on load
          const kept = normalized.filter((c: any) => {
            if (!c?.deletion_requested_at) return true;
            const t = new Date(c.deletion_requested_at).getTime();
            if (!Number.isFinite(t)) return true;
            return now - t < TWO_DAYS_MS;
          });

          // Ensure main exists
          const hasMain = kept.some((c: any) => String(c?.id) === 'main');
          if (!hasMain) {
            kept.unshift({ id: 'main', name: 'Coffre Principal', createdAt: new Date().toISOString() });
          }

          setCoffers(kept);
          localStorage.setItem('coffers', JSON.stringify(kept));
        } catch (_e) {
          const mainCoffer: Coffer = { id: 'main', name: 'Coffre Principal', createdAt: new Date().toISOString() };
          setCoffers([mainCoffer]);
          localStorage.setItem('coffers', JSON.stringify([mainCoffer]));
        }
      } else {
        const mainCoffer: Coffer = { id: 'main', name: 'Coffre Principal', createdAt: new Date().toISOString() };
        setCoffers([mainCoffer]);
        localStorage.setItem('coffers', JSON.stringify([mainCoffer]));
      }
    };

    if (session?.access_token) init();
  }, [session?.access_token]);

  useEffect(() => {
    const loadData = async () => {
      // Fetch users first, then fetch checks with enriched data
      await fetchUsers();
      await Promise.all([
        fetchChecksSafe('main'),
        fetchStores(),
        fetchSales(),
        fetchSuppliers(),
        fetchSupplierPayments(),
        fetchDiscountsList(),
        fetchBorrowedMoney(),
        fetchCofferMovements('main'),
      ]);

      // Also load check_inventory so we can show "non transférés" summary in the header.
      try {
        const invRes = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory`,
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }
        );
        if (invRes.ok) {
          const invData = await invRes.json();
          setChecks(invData.check_inventory || []);
        }
      } catch (e) {
        // ignore; header will just show 0
      }

      setLoading(false);
    };
    loadData();
  }, []);

  // Poll per-check usage every 3 seconds so badges update after payments
  useEffect(() => {
    if (!session?.access_token) return;

    fetchCheckSafeUsages();
    const id = setInterval(fetchCheckSafeUsages, 3000);
    return () => clearInterval(id);
  }, [session.access_token, selectedCofferId, advanceUserRole, advanceFilterStore]);

  // Fetch checks when selected coffer changes
  useEffect(() => {
    fetchChecksSafe(selectedCofferId);
    fetchCofferMovements(selectedCofferId);
  }, [selectedCofferId]);

  // Create a new coffer
  const createCoffer = async () => {
    if (!canAddCoffreEntry) {
      toast.error("Vous n'avez pas la permission « Ajouter une Entrée Coffre »");
      return;
    }

    if (!newCofferName.trim()) {
      toast.error('Veuillez entrer un nom pour le coffre');
      return;
    }

    setCofferLoading(true);
    try {
      const newCoffer: Coffer = {
        id: `coffer-${Date.now()}`,
        name: newCofferName,
        createdAt: new Date().toISOString(),
      };

      // Persist the coffer in DB (source of truth: public.coffers)
      const createRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/coffers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            id: newCoffer.id,
            name: newCoffer.name,
          }),
        }
      );

      if (!createRes.ok) {
        const txt = await createRes.text().catch(() => '');
        throw new Error(`Échec création coffre: ${createRes.status} ${txt}`);
      }

      // Optional: materialize a seed movement row so legacy code paths that derive coffers from expenses
      // (or totals views that expect at least one movement) remain stable.
      try {
        await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/expenses`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              coffer_id: newCoffer.id,
              amount: 0,
              expense_type: 'coffer_seed',
              reason: `Coffre créé: ${newCoffer.name}`,
              notes: `coffer_seed name=${newCoffer.name}`,
            }),
          }
        );
      } catch {
        // best-effort
      }

      const updatedCoffers = [...coffers, newCoffer];
      setCoffers(updatedCoffers);
      localStorage.setItem('coffers', JSON.stringify(updatedCoffers));

      setSelectedCofferId(newCoffer.id);
      setNewCofferName('');
      setCreateCofferDialogOpen(false);
      toast.success(`Coffre "${newCoffer.name}" créé avec succès`);
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setCofferLoading(false);
    }
  };

  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

  // Schedule deletion of a coffer (48h delay)
  const deleteCoffer = async (cofferId: string) => {
    if (!canDeleteCoffreEntry) {
      toast.error("Vous n'avez pas la permission « Supprimer une Entrée Coffre »");
      return;
    }

    if (cofferId === 'main') {
      toast.error('Impossible de supprimer le coffre principal');
      return;
    }

    const coffer = coffers.find((c: any) => c.id === cofferId);
    if (!coffer) return;

    // If already scheduled, this button acts as "delete now"
    if ((coffer as any).deletion_requested_at) {
      if (!confirm('Ce coffre est déjà en suppression planifiée. Supprimer définitivement maintenant ?')) return;
      try {
        const updatedCoffers = coffers.filter((c: any) => c.id !== cofferId);
        setCoffers(updatedCoffers);
        localStorage.setItem('coffers', JSON.stringify(updatedCoffers));
        if (selectedCofferId === cofferId) setSelectedCofferId('main');
        toast.success('Coffre supprimé définitivement');
      } catch (error: any) {
        toast.error(`Erreur: ${error.message}`);
      }
      return;
    }

    if (!confirm('Planifier la suppression de ce coffre ? (Suppression automatique dans 48h)')) return;

    try {
      const updatedCoffers = coffers.map((c: any) =>
        c.id === cofferId ? { ...c, deletion_requested_at: new Date().toISOString() } : c
      );

      setCoffers(updatedCoffers);
      localStorage.setItem('coffers', JSON.stringify(updatedCoffers));

      if (selectedCofferId === cofferId) {
        setSelectedCofferId('main');
      }

      toast.success('Suppression planifiée (48h). Vous pouvez annuler avant la fin du délai.');
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const cancelCofferDeletion = (cofferId: string) => {
    try {
      const updatedCoffers = coffers.map((c: any) => {
        if (c.id !== cofferId) return c;
        const { deletion_requested_at, ...rest } = c;
        return rest;
      });
      setCoffers(updatedCoffers);
      localStorage.setItem('coffers', JSON.stringify(updatedCoffers));
      toast.success('Suppression annulée');
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const bulkTransferPayment = async () => {
    if (!canEditCoffreEntry) {
      toast.error("Vous n'avez pas la permission « Modifier une Entrée Coffre »");
      return;
    }

    if (selectedChecks.size === 0) {
      toast.error('Veuillez sélectionner au moins un chèque');
      return;
    }

    setBulkTransferPaymentSubmitting(true);
    try {
      const checkIds = Array.from(selectedChecks.keys());
      let successCount = 0;
      let errorCount = 0;

      // Pre-compute totals so we can add ONE movement row (not one per check)
      const selectedRows = checkIds
        .map((id) => (checksSafe || []).find((c: any) => String(c.id) === String(id)))
        .filter(Boolean) as any[];

      const totalChecksAmount = selectedRows.reduce((s, r) => s + (Number(r?.amount ?? 0) || 0), 0);

      for (const checkId of checkIds) {
        try {
          // 1) Mark check as transferred (workflow status)
          const payload: any = {
            status: 'transferred',
            payment_transferred_note: bulkTransferPaymentNote || null,
          };

          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/check-safe/${checkId}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify(payload),
            }
          );

          if (!response.ok) {
            errorCount++;
            continue;
          }

          // 2) Record full usage in check_safe_usages so the "Type" badge becomes "Utilisé"
          // The UI computes Disponible/Utilisé from check_safe_usages.total_used.
          const checkRow = (checksSafe || []).find((c: any) => String(c.id) === String(checkId));
          const checkAmount = Number(checkRow?.amount ?? 0) || 0;

          if (checkAmount > 0) {
            await fetch(
              `https://${projectId}.supabase.co/functions/v1/super-handler/check-safe-usages`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                  check_safe_id: checkId,
                  amount_used: checkAmount,
                  usage_type: 'payment_transfer',
                  notes: bulkTransferPaymentNote ? `Transféré vers: ${bulkTransferPaymentNote}` : null,
                  coffer_id: selectedCofferId || 'main',
                }),
              }
            );
          }

          successCount++;
        } catch (error) {
          errorCount++;
        }
      }

      // 3) Add a coffer movement (withdrawal) so it appears in "Mouvements du Coffre"
      // IMPORTANT: the Coffre movements list is driven by `expenses` rows that have `coffer_id` + `expense_type`.
      // So we must use /coffer-expenses (NOT /expenses).
      if (totalChecksAmount > 0) {
        try {
          const movementReason = `Transfert chèques vers banque${bulkTransferPaymentNote ? ` • ${bulkTransferPaymentNote}` : ''} • ${checkIds.length} chèque(s)`;

          await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/coffer-expenses`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                coffer_id: selectedCofferId || 'main',
                amount: totalChecksAmount,
                reason: movementReason,
                // optional meta (backend ignores unknown fields, but safe to include)
                expense_type: 'coffer_transfer_check_bank',
              }),
            }
          );
        } catch {
          // movement insert is best-effort (do not fail whole transfer)
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} chèque(s) transféré(s) avec succès`);
      }
      if (errorCount > 0) {
        toast.error(`${errorCount} chèque(s) n'ont pas pu être transférés`);
      }

      setBulkTransferPaymentDialogOpen(false);
      setBulkTransferPaymentNote('');
      setSelectedChecks(new Map());
      fetchChecksSafe(selectedCofferId);
      fetchCheckSafeUsages();
      fetchCofferMovements(selectedCofferId);
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setBulkTransferPaymentSubmitting(false);
    }
  };

  const updateCheckSafeStatus = async (
    checkSafeId: string,
    newStatus: string,
    options?: { payment_transferred_note?: string | null }
  ) => {
    if (!canEditCoffreEntry) {
      toast.error("Vous n'avez pas la permission « Modifier une Entrée Coffre »");
      return;
    }

    // IMPORTANT UX CHANGE:
    // For "transferred" we always use the React dialog "Transférer le paiement - Chèques en masse"
    // (even for a single check) to avoid having 2 different modals.
    if (newStatus === 'transferred') {
      // Select only this check and open the bulk dialog (single-item flow)
      setSelectedChecks(new Map([[String(checkSafeId), true]]));
      setBulkTransferPaymentDialogOpen(true);
      // Prefill note if available
      if (options?.payment_transferred_note !== undefined) {
        setBulkTransferPaymentNote(options?.payment_transferred_note || '');
      }
      return;
    }

    try {
      const payload: any = { status: newStatus };

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/check-safe/${checkSafeId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        const statusLabels: { [key: string]: string } = {
          'verified': 'Vérifié',
          'confirmed': 'Confirmé',
          'in_safe': 'En coffre-fort',
          'transferred': 'Transféré',
        };
        toast.success(`Statut mis à jour: ${statusLabels[newStatus]}`);
        fetchChecksSafe(selectedCofferId);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const deleteCheckSafe = async (checkSafeId: string) => {
    if (!canDeleteCoffreEntry) {
      toast.error("Vous n'avez pas la permission « Supprimer une Entrée Coffre »");
      return;
    }

    if (!confirm('Êtes-vous sûr de vouloir supprimer ce chèque du coffre-fort?')) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/check-safe/${checkSafeId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        toast.success('Chèque supprimé du coffre-fort');
        fetchChecksSafe();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-gray-100 text-gray-800';
      case 'verified':
        return 'bg-blue-100 text-blue-800';
      case 'confirmed':
        return 'bg-purple-100 text-purple-800';
      case 'in_safe':
        return 'bg-green-100 text-green-800';
      case 'transferred':
        return 'bg-emerald-100 text-emerald-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return 'En attente';
      case 'verified':
        return 'Vérifié';
      case 'confirmed':
        return 'Confirmé';
      case 'in_safe':
        return 'En coffre-fort';
      case 'transferred':
        return 'Transféré';
      default:
        return status;
    }
  };

  const getStoreInfo = (storeId: string) => {
    const store = stores.find(s => String(s.id) === String(storeId));
    return store?.name || 'Magasin inconnu';
  };

  const getUserStoreLabel = (checkSafeRow: any) => {
    // Prefer explicit store_id on the safe row
    if (checkSafeRow?.store_id) return getStoreInfo(checkSafeRow.store_id);

    // Fallback: creator's store
    const s = checkSafeRow?.created_by_store?.name;
    if (s) return s;

    return 'Magasin inconnu';
  };

  const getCreatorLabel = (row: any) => {
    const storeName = row?.created_by_store?.name;
    if (storeName) return storeName;

    const u = row?.created_by_user;
    const email = (u?.email ? String(u.email) : '').trim();
    const fullName = (u?.full_name ? String(u.full_name) : '').trim();

    if (fullName && email) return `${fullName} (${email})`;
    if (fullName) return fullName;
    if (email) return `Admin (${email})`;

    const raw = row?.created_by;
    if (raw && !looksLikeUuid(raw)) return String(raw);

    return '-';
  };

  const downloadHtmlAsXls = (filename: string, htmlContent: string) => {
    const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportCoffreToExcel = () => {
    try {
      const title = `Rapport Coffre - ${coffers.find(c => c.id === selectedCofferId)?.name || 'Coffre'}`;
      const now = new Date();
      const dateStr = now.toLocaleString('fr-FR');

      const checksRows = (sortedChecksSafe || []).map((cs: any, i: number) => {
        const amount = Number(cs?.amount ?? 0) || 0;
        const status = getStatusLabel(String(cs?.status || ''));
        const magasin = getCreatorLabel(cs);
        const reference = resolveChequeNumber(cs);
        const transferredNote = cs?.payment_transferred_note || '-';
        const createdAt = cs?.created_at ? new Date(cs.created_at).toLocaleString('fr-FR') : '-';
        const notes = cs?.inventory_notes || cs?.notes || cs?.note || '-';

        return {
          index: i + 1,
          reference,
          magasin,
          statut: status,
          montant: amount,
          transfere_vers: transferredNote,
          date: createdAt,
          notes: notes,
        };
      });

      const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const totals = {
        nonTransferes: inventoryNotTransferredAmount,
        transferes: transferredTotalAmount,
        espece: transferredCashAmount,
        chequesDisponibles: checksAvailableAmount,
        chequesUtilises: checksUsedAmount,
        chequesTransferes: checksTransferredAmount,
        virement: transferredBankTransferAmount,
      };

      const htmlContent = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial, sans-serif; }
            h1 { font-size: 18px; margin: 0 0 6px 0; }
            .meta { font-size: 12px; color: #555; margin-bottom: 12px; }
            .summary { margin: 10px 0 14px 0; font-size: 12px; }
            .summary td { padding: 4px 8px; border: 1px solid #ddd; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; }
            th { background: #f3f4f6; text-align: left; }
            .num { text-align: right; }
            .section { margin-top: 18px; }
          </style>
        </head>
        <body>
          <h1>${esc(title)}</h1>
          <div class="meta">Généré le: ${esc(dateStr)}</div>

          <table class="summary">
            <tr><td><b>Montant (Non transférés)</b></td><td class="num">${totals.nonTransferes.toFixed(2)} MAD</td></tr>
            <tr><td><b>Montant (Transférés)</b></td><td class="num">${totals.transferes.toFixed(2)} MAD</td></tr>
            <tr><td><b>Montant (Espèce)</b></td><td class="num">${totals.espece.toFixed(2)} MAD</td></tr>
            <tr><td><b>Montant (Chèque - Disponible)</b></td><td class="num">${totals.chequesDisponibles.toFixed(2)} MAD</td></tr>
            <tr><td><b>Montant (Chèque - Utilisés)</b></td><td class="num">${totals.chequesUtilises.toFixed(2)} MAD</td></tr>
            <tr><td><b>Montant (Chèque - Transférés)</b></td><td class="num">${totals.chequesTransferes.toFixed(2)} MAD</td></tr>
            <tr><td><b>Montant (Virement)</b></td><td class="num">${totals.virement.toFixed(2)} MAD</td></tr>
          </table>

          <div class="section">
            <h1>Chèques (Coffre)</h1>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Référence</th>
                  <th>Magasin</th>
                  <th>Statut</th>
                  <th class="num">Montant (MAD)</th>
                  <th>Transféré vers</th>
                  <th>Date</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                ${checksRows.map(r => `
                  <tr>
                    <td>${r.index}</td>
                    <td>${esc(r.reference)}</td>
                    <td>${esc(r.magasin)}</td>
                    <td>${esc(r.statut)}</td>
                    <td class="num">${r.montant.toFixed(2)}</td>
                    <td>${esc(r.transfere_vers)}</td>
                    <td>${esc(r.date)}</td>
                    <td>${esc(r.notes)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </body>
      </html>`;

      const fileSafeName = `${title.replace(/\s+/g, '_')}_${now.toISOString().slice(0, 10)}.xls`;
      downloadHtmlAsXls(fileSafeName, htmlContent);
      toast.success('Rapport Coffre (Excel) téléchargé');
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'export Excel");
    }
  };

  const exportMovementsToExcel = () => {
    try {
      const title = `Rapport Mouvements - ${coffers.find(c => c.id === selectedCofferId)?.name || 'Coffre'}`;
      const now = new Date();
      const dateStr = now.toLocaleString('fr-FR');

      const movementsRows = (cofferMovements || []).map((m: any, i: number) => {
        const amount = normalizeSignedAmount(m?.amount);
        const methodRaw = String(m?.method || m?.payment_method || '').trim().toLowerCase();
        const methodLabel =
          methodRaw === 'cash' || methodRaw === 'espece' || methodRaw === 'espèce'
            ? 'Espèce'
            : (methodRaw === 'bank_transfer' || methodRaw === 'transfer' || methodRaw === 'virement'
                ? 'Virement'
                : (methodRaw === 'check' || methodRaw === 'cheque' || methodRaw === 'chèque'
                    ? 'Chèque'
                    : (m?.method || m?.payment_method || '-')));

        const type = String(m?.expense_type || m?.type || '-');
        const reason = String(m?.reason || '-');
        const notes = String(m?.notes || '-');
        const dateRaw = m?.payment_date || m?.created_at;
        const date = dateRaw ? new Date(dateRaw).toLocaleString('fr-FR') : '-';
        return {
          index: i + 1,
          type,
          methode: String(methodLabel || '-'),
          montant: amount,
          raison: reason,
          notes,
          date,
        };
      });

      const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const totalMouvements = movementsRows.reduce((s, r) => s + (Number(r.montant) || 0), 0);

      const htmlContent = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial, sans-serif; }
            h1 { font-size: 18px; margin: 0 0 6px 0; }
            .meta { font-size: 12px; color: #555; margin-bottom: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; }
            th { background: #f3f4f6; text-align: left; }
            .num { text-align: right; }
          </style>
        </head>
        <body>
          <h1>${esc(title)}</h1>
          <div class="meta">Généré le: ${esc(dateStr)} | Total mouvements: ${totalMouvements.toFixed(2)} MAD</div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Type</th>
                <th>Méthode</th>
                <th class="num">Montant (MAD)</th>
                <th>Raison</th>
                <th>Notes</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              ${movementsRows.map(r => `
                <tr>
                  <td>${r.index}</td>
                  <td>${esc(r.type)}</td>
                  <td>${esc(r.methode)}</td>
                  <td class="num">${Number(r.montant).toFixed(2)}</td>
                  <td>${esc(r.raison)}</td>
                  <td>${esc(r.notes)}</td>
                  <td>${esc(r.date)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>`;

      const fileName = `${title.replace(/\s+/g, '_')}_${now.toISOString().slice(0, 10)}.xls`;
      downloadHtmlAsXls(fileName, htmlContent);
      toast.success('Rapport Mouvements (Excel) téléchargé');
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'export Excel");
    }
  };

  const exportCoffreToPdf = () => {
    try {
      const title = `Rapport Coffre - ${coffers.find(c => c.id === selectedCofferId)?.name || 'Coffre'}`;
      const now = new Date();

      const doc = new jsPDF('l', 'mm', 'a4');
      doc.setFontSize(14);
      doc.text(title, 14, 12);
      doc.setFontSize(10);
      doc.text(`Généré le: ${now.toLocaleString('fr-FR')}`, 14, 18);

      const summaryBody = [
        ['Montant (Non transférés)', `${inventoryNotTransferredAmount.toFixed(2)} MAD`],
        ['Montant (Transférés)', `${transferredTotalAmount.toFixed(2)} MAD`],
        ['Montant (Espèce)', `${transferredCashAmount.toFixed(2)} MAD`],
        ['Montant (Chèque - Disponible)', `${checksAvailableAmount.toFixed(2)} MAD`],
        ['Montant (Chèque - Utilisés)', `${checksUsedAmount.toFixed(2)} MAD`],
        ['Montant (Chèque - Transférés)', `${checksTransferredAmount.toFixed(2)} MAD`],
        ['Montant (Virement)', `${transferredBankTransferAmount.toFixed(2)} MAD`],
      ];

      autoTable(doc, {
        startY: 24,
        head: [['Résumé', 'Valeur']],
        body: summaryBody,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [37, 99, 235] },
        theme: 'grid',
      });

      const afterSummaryY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : 60;

      autoTable(doc, {
        startY: afterSummaryY,
        head: [['#', 'Référence', 'Magasin', 'Statut', 'Montant (MAD)', 'Transféré vers', 'Date', 'Notes']],
        body: (sortedChecksSafe || []).map((cs: any, i: number) => {
          const amount = Number(cs?.amount ?? 0) || 0;
          const method = String(cs?.payment_method || cs?.method || cs?.type || 'Chèque');
          const status = getStatusLabel(String(cs?.status || ''));
          const magasin = getCreatorLabel(cs);
          const reference = resolveChequeNumber(cs);
          const transferredNote = cs?.payment_transferred_note || '-';
          const createdAt = cs?.created_at ? new Date(cs.created_at).toLocaleString('fr-FR') : '-';
          const notes = cs?.inventory_notes || cs?.notes || cs?.note || '-';
          return [
            String(i + 1),
            String(reference),
            String(magasin),
            String(status),
            amount.toFixed(2),
            String(transferredNote),
            String(createdAt),
            String(notes),
          ];
        }),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [37, 99, 235] },
        theme: 'grid',
      });

      doc.save(`${title.replace(/\s+/g, '_')}_${now.toISOString().slice(0, 10)}.pdf`);
      toast.success('Rapport Coffre (PDF) téléchargé');
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'export PDF");
    }
  };

  const exportChecksToPdf = () => {
    try {
      const cofferName = coffers.find(c => c.id === selectedCofferId)?.name || 'Coffre';
      const title = `Liste des Chèques - ${cofferName}`;
      const now = new Date();

      const doc = new jsPDF('l', 'mm', 'a4');
      doc.setFontSize(16);
      doc.text(title, 14, 14);
      doc.setFontSize(10);
      doc.text(`Généré le: ${now.toLocaleString('fr-FR')}`, 14, 22);
      doc.text(`Total des chèques: ${sortedChecksSafe.length}`, 14, 28);
      doc.text(`Montant total: ${sortedChecksSafe.reduce((sum, cs) => sum + (Number(cs?.amount) || 0), 0).toFixed(2)} MAD`, 14, 34);

      // Build store map for export
      const storeByIdMap = new Map<string, any>((stores || []).map((s: any) => [String(s.id), s]));
      const checksBody = (sortedChecksSafe || []).map((cs: any, i: number) => {
        const amount = Number(cs?.amount ?? 0) || 0;
        const status = getStatusLabel(String(cs?.status || ''));
        // Try to get store from check_safe.store_id or from enriched created_by_store
        const storeId = cs?.store_id;
        const storeName = storeId ? (storeByIdMap?.get(String(storeId))?.name || getCreatorLabel(cs)) : getCreatorLabel(cs);
        const reference = resolveChequeNumber(cs);
        // Use giver_name field (added in migration 108)
        const giver = cs?.giver_name || cs?.given_to || cs?.giver || '-';
        // Use check_due_date (added in migration 130) or due_date
        const dueDate = cs?.check_due_date ? new Date(cs.check_due_date).toLocaleDateString('fr-FR') : (cs?.due_date ? new Date(cs.due_date).toLocaleDateString('fr-FR') : '-');
        const createdAt = cs?.created_at ? new Date(cs.created_at).toLocaleDateString('fr-FR') : '-';
        const transferredNote = cs?.payment_transferred_note || '-';
        const notes = cs?.inventory_notes || cs?.notes || cs?.note || '-';
        return [
          String(i + 1),
          String(reference),
          String(storeName),
          String(giver),
          amount.toFixed(2),
          String(status),
          String(dueDate),
          String(createdAt),
          String(transferredNote),
          String(notes),
        ];
      });

      autoTable(doc, {
        startY: 40,
        head: [['#', 'N° Chèque', 'Magasin', 'Donneur', 'Montant (MAD)', 'Statut', 'Échéance', 'Date création', 'Transféré vers', 'Notes']],
        body: checksBody,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [37, 99, 235] },
        theme: 'grid',
        columnStyles: {
          0: { cellWidth: 12 },
          1: { cellWidth: 30 },
          2: { cellWidth: 35 },
          3: { cellWidth: 40 },
          4: { cellWidth: 25 },
          5: { cellWidth: 25 },
          6: { cellWidth: 22 },
          7: { cellWidth: 25 },
          8: { cellWidth: 35 },
        },
      });

      doc.save(`${title.replace(/\s+/g, '_')}_${now.toISOString().slice(0, 10)}.pdf`);
      toast.success('Liste des chèques (PDF) téléchargée');
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'export PDF des chèques");
    }
  };

  const exportChecksToExcel = () => {
    try {
      const cofferName = coffers.find(c => c.id === selectedCofferId)?.name || 'Coffre';
      const title = `Liste des Chèques - ${cofferName}`;
      const now = new Date();
      const dateStr = now.toLocaleString('fr-FR');
      const totalAmount = sortedChecksSafe.reduce((sum, cs) => sum + (Number(cs?.amount) || 0), 0);

      // Build store map for export
      const storeByIdMap = new Map<string, any>((stores || []).map((s: any) => [String(s.id), s]));
      const checksRows = (sortedChecksSafe || []).map((cs: any, i: number) => {
        const amount = Number(cs?.amount ?? 0) || 0;
        const status = getStatusLabel(String(cs?.status || ''));
        // Try to get store from check_safe.store_id or from enriched created_by_store
        const storeId = cs?.store_id;
        const magasin = storeId ? (storeByIdMap?.get(String(storeId))?.name || getCreatorLabel(cs)) : getCreatorLabel(cs);
        const reference = resolveChequeNumber(cs);
        // Use giver_name field (added in migration 108)
        const giver = cs?.giver_name || cs?.given_to || cs?.giver || '-';
        // Use check_due_date (added in migration 130) or due_date
        const dueDate = cs?.check_due_date ? new Date(cs.check_due_date).toLocaleDateString('fr-FR') : (cs?.due_date ? new Date(cs.due_date).toLocaleDateString('fr-FR') : '-');
        const createdAt = cs?.created_at ? new Date(cs.created_at).toLocaleString('fr-FR') : '-';
        const transferredNote = cs?.payment_transferred_note || '-';
        // Get notes field for export
        const notes = cs?.inventory_notes || cs?.notes || cs?.note || '-';

        return {
          index: i + 1,
          reference,
          magasin,
          giver,
          montant: amount,
          statut: status,
          echeance: dueDate,
          date: createdAt,
          transfere_vers: transferredNote,
          notes: notes,
        };
      });

      const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const htmlContent = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial, sans-serif; }
            h1 { font-size: 18px; margin: 0 0 6px 0; }
            .meta { font-size: 12px; color: #555; margin-bottom: 12px; }
            .summary { margin: 10px 0 14px 0; font-size: 12px; }
            .summary td { padding: 4px 8px; border: 1px solid #ddd; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; }
            th { background: #f3f4f6; text-align: left; }
            .num { text-align: right; }
          </style>
        </head>
        <body>
          <h1>${esc(title)}</h1>
          <div class="meta">Généré le: ${esc(dateStr)}</div>
          
          <table class="summary">
            <tr><td><b>Total des chèques</b></td><td class="num">${sortedChecksSafe.length}</td></tr>
            <tr><td><b>Montant total</b></td><td class="num">${totalAmount.toFixed(2)} MAD</td></tr>
          </table>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>N° Chèque</th>
                <th>Magasin</th>
                <th>Donneur</th>
                <th class="num">Montant (MAD)</th>
                <th>Statut</th>
                <th>Échéance</th>
                <th>Date création</th>
                <th>Transféré vers</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${checksRows.map(r => `
                <tr>
                  <td>${r.index}</td>
                  <td>${esc(r.reference)}</td>
                  <td>${esc(r.magasin)}</td>
                  <td>${esc(r.giver)}</td>
                  <td class="num">${r.montant.toFixed(2)}</td>
                  <td>${esc(r.statut)}</td>
                  <td>${esc(r.echeance)}</td>
                  <td>${esc(r.date)}</td>
                  <td>${esc(r.transfere_vers)}</td>
                  <td>${esc(r.notes)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>`;

      const fileName = `${title.replace(/\s+/g, '_')}_${now.toISOString().slice(0, 10)}.xls`;
      downloadHtmlAsXls(fileName, htmlContent);
      toast.success('Liste des chèques (Excel) téléchargée');
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'export Excel des chèques");
    }
  };

  const exportMovementsToPdf = () => {
    try {
      const title = `Rapport Mouvements - ${coffers.find(c => c.id === selectedCofferId)?.name || 'Coffre'}`;
      const now = new Date();

      const doc = new jsPDF('l', 'mm', 'a4');
      doc.setFontSize(14);
      doc.text(title, 14, 12);
      doc.setFontSize(10);
      doc.text(`Généré le: ${now.toLocaleString('fr-FR')}`, 14, 18);

      const rows = (cofferMovements || []).map((m: any, i: number) => {
        const amount = normalizeSignedAmount(m?.amount);
        const methodRaw = String(m?.method || m?.payment_method || '').trim().toLowerCase();
        const methodLabel =
          methodRaw === 'cash' || methodRaw === 'espece' || methodRaw === 'espèce'
            ? 'Espèce'
            : (methodRaw === 'bank_transfer' || methodRaw === 'transfer' || methodRaw === 'virement'
                ? 'Virement'
                : (methodRaw === 'check' || methodRaw === 'cheque' || methodRaw === 'chèque'
                    ? 'Chèque'
                    : (m?.method || m?.payment_method || '-')));

        const type = String(m?.expense_type || m?.type || '-');
        const reason = String(m?.reason || '-');
        const notes = String(m?.notes || '-');
        const dateRaw = m?.payment_date || m?.created_at;
        const date = dateRaw ? new Date(dateRaw).toLocaleString('fr-FR') : '-';
        return [String(i + 1), type, String(methodLabel || '-'), amount.toFixed(2), reason, notes, date];
      });

      autoTable(doc, {
        startY: 24,
        head: [['#', 'Type', 'Méthode', 'Montant (MAD)', 'Raison', 'Notes', 'Date']],
        body: rows,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [14, 165, 233] },
        theme: 'grid',
      });

      doc.save(`${title.replace(/\s+/g, '_')}_${now.toISOString().slice(0, 10)}.pdf`);
      toast.success('Rapport Mouvements (PDF) téléchargé');
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'export PDF");
    }
  };

  const getSaleInfo = (saleId: string) => {
    if (!saleId) return 'N/A';
    const sale = sales.find(s => s.id === saleId);
    return sale?.sale_number || 'N/A';
  };

  const resolveChequeNumber = (row: any) => {
    // Priority:
    // 1) Prefer parsing from notes marker when present: backend writes `check_number=...`
    //    This is the most reliable in mixed/legacy DB states.
    // 2) explicit check_number column
    // 3) legacy/alternate field names
    const notes = String(row?.notes || '').trim();
    const m = notes.match(/\bcheck_number=([^|\n]+)|\bcheck_id_number=([^|\n]+)/i);
    const parsed = (m && (m[1] || m[2])) ? String(m[1] || m[2]).trim() : '';
    if (parsed) return parsed;

    const direct = String(row?.check_number || '').trim();
    if (direct) return direct;

    const legacy = String(row?.check_id_number || row?.check_reference || row?.reference || '').trim();
    if (legacy) return legacy;

    return '-';
  };

  const filteredChecksSafe = checksSafe.filter((cs) => {
    const q = String(searchTerm || '').toLowerCase();

    const chequeNumber = resolveChequeNumber(cs).toLowerCase();
    const storeLabel = String(getStoreInfo(cs.store_id) || '').toLowerCase();
    const creatorLabel = String(getCreatorLabel(cs) || '').toLowerCase();
    const giverLabel = String(cs?.giver_name || cs?.given_to || cs?.giver || cs?.notes || '').toLowerCase();

    const matchesSearch =
      !q ||
      chequeNumber.includes(q) ||
      storeLabel.includes(q) ||
      creatorLabel.includes(q) ||
      giverLabel.includes(q);

    const matchesStatus = filterStatus === 'all' || String(cs.status || '') === String(filterStatus);
    const matchesStore = filterStore === 'all' || String(cs.store_id || '') === String(filterStore);

    // Date du chèque
    const rawCheckDate: any = (cs as any)?.check_date || (cs as any)?.created_at;
    const parsedCheckDate = rawCheckDate ? new Date(rawCheckDate) : null;

    // Date inputs are YYYY-MM-DD; compare using day boundaries in local time.
    const checkDateFrom = filterCheckDateFrom ? new Date(`${filterCheckDateFrom}T00:00:00`) : null;
    const checkDateTo = filterCheckDateTo ? new Date(`${filterCheckDateTo}T23:59:59.999`) : null;
    const matchesCheckDateRange =
      (!checkDateFrom || (parsedCheckDate && parsedCheckDate >= checkDateFrom)) &&
      (!checkDateTo || (parsedCheckDate && parsedCheckDate <= checkDateTo));

    // Échéance (prefer inventory_due_date enriched from check_inventory)
    const rawDue: any = (cs as any)?.inventory_due_date || (cs as any)?.due_date || (cs as any)?.execution_date;
    const parsedDue = rawDue ? new Date(rawDue) : null;
    const dueFrom = filterDueDateFrom ? new Date(`${filterDueDateFrom}T00:00:00`) : null;
    const dueTo = filterDueDateTo ? new Date(`${filterDueDateTo}T23:59:59.999`) : null;
    const matchesDueDateRange =
      (!dueFrom || (parsedDue && parsedDue >= dueFrom)) &&
      (!dueTo || (parsedDue && parsedDue <= dueTo));

    // Confirmed date range
    const rawConfirmed: any = (cs as any)?.confirmed_at;
    const parsedConfirmed = rawConfirmed ? new Date(rawConfirmed) : null;
    const confirmedFrom = filterConfirmedDateFrom ? new Date(`${filterConfirmedDateFrom}T00:00:00`) : null;
    const confirmedTo = filterConfirmedDateTo ? new Date(`${filterConfirmedDateTo}T23:59:59.999`) : null;
    const matchesConfirmedRange =
      (!confirmedFrom || (parsedConfirmed && parsedConfirmed >= confirmedFrom)) &&
      (!confirmedTo || (parsedConfirmed && parsedConfirmed <= confirmedTo));

    // Transferred date range
    const rawTransferred: any = (cs as any)?.payment_transferred_at || (cs as any)?.transferred_at;
    const parsedTransferred = rawTransferred ? new Date(rawTransferred) : null;
    const transferredFrom = filterTransferredDateFrom ? new Date(`${filterTransferredDateFrom}T00:00:00`) : null;
    const transferredTo = filterTransferredDateTo ? new Date(`${filterTransferredDateTo}T23:59:59.999`) : null;
    const matchesTransferredRange =
      (!transferredFrom || (parsedTransferred && parsedTransferred >= transferredFrom)) &&
      (!transferredTo || (parsedTransferred && parsedTransferred <= transferredTo));

    // Amount range
    // IMPORTANT: HTML number inputs can produce empty strings and users may type comma decimals.
    // Using Number('') => 0 was causing filters to behave incorrectly.
    // We parse safely and only apply the bound when the value is a real number.
    const amount = Number((cs as any)?.amount ?? 0) || 0;

    const parseAmountFilter = (raw: string) => {
      // Accept both "1234.56" and "1 234,56" and ignore currency symbols.
      const s0 = String(raw ?? '').trim();
      if (!s0) return null;

      // Keep digits, dot, comma, minus only
      let s = s0.replace(/[^0-9,\.\-]/g, '');
      if (!s) return null;

      // Support comma decimals
      s = s.replace(/,/g, '.');

      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };

    const amountFrom = parseAmountFilter(filterAmountFrom);
    const amountTo = parseAmountFilter(filterAmountTo);

    // If user swaps min/max, still behave correctly.
    const minAmount = amountFrom !== null && amountTo !== null ? Math.min(amountFrom, amountTo) : amountFrom;
    const maxAmount = amountFrom !== null && amountTo !== null ? Math.max(amountFrom, amountTo) : amountTo;

    const matchesAmountRange =
      (minAmount === null || amount >= minAmount) &&
      (maxAmount === null || amount <= maxAmount);

    return (
      matchesSearch &&
      matchesStatus &&
      matchesStore &&
      matchesCheckDateRange &&
      matchesDueDateRange &&
      matchesConfirmedRange &&
      matchesTransferredRange &&
      matchesAmountRange
    );
  });

  // ===== Table sorting (click headers) =====
  const [sortChecksConfig, setSortChecksConfig] = useState<{ key: any; direction: any } | null>(null);
  const [sortMovementsConfig, setSortMovementsConfig] = useState<{ key: any; direction: any } | null>(null);

  const toggleChecksSort = (key: any) => {
    setSortChecksConfig((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  const toggleMovementsSort = (key: any) => {
    setSortMovementsConfig((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  const getSortIndicator = (active: any, key: any) => {
    if (!active || active.key !== key) return '↕';
    return active.direction === 'asc' ? '▲' : '▼';
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

  // Hide internal/system markers from Notes (same approach as CheckInventoryModule)
  const cleanNotesForDisplay = (raw: any) => {
    const s = String(raw || '');
    if (!s.trim()) return '';

    return s
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => {
        const ll = l.toLowerCase();
        if (ll.includes('source fruta')) return false;
        if (ll.includes('client_global_payment_pending_consume=')) return false;
        if (ll.includes('store_global_payment_pending_consume=')) return false;
        if (ll.includes('supplier_global_payment_pending_consume=')) return false;
        if (ll.includes('pending_consume=')) return false;
        return true;
      })
      .join(' | ');
  };

  const sortedChecksSafe = (() => {
    const list = (filteredChecksSafe || []).slice();
    if (!sortChecksConfig) return list;

    const { key, direction } = sortChecksConfig;
    const factor = direction === 'asc' ? 1 : -1;

    const getValue = (cs: any) => {
      const safeNotes = cleanNotesForDisplay(
        cs?.inventory_notes ??
          cs?.notes ??
          cs?.verification_notes ??
          cs?.payment_transferred_note
      );

      switch (key) {
        case 'check_number':
          return sortString(resolveChequeNumber(cs));
        case 'giver':
          return sortString(cs?.giver_name || cs?.given_to || cs?.giver || cs?.notes);
        case 'amount':
          return sortNumber(cs?.amount);
        case 'usage_type': {
          const usageRow = (checkSafeUsages || []).find((u: any) => String(u.check_safe_id) === String(cs.id));
          const usedMad = Number(usageRow?.total_used ?? 0) || 0;
          return usedMad > 0 ? 1 : 0;
        }
        case 'magasin':
          return sortString(getCreatorLabel(cs) || getUserStoreLabel(cs));
        case 'sale':
          return sortString(getSaleInfo(cs?.sale_id));
        case 'check_date':
          return sortDate(cs?.check_date || cs?.due_date || cs?.created_at);
        case 'status':
          return sortString(getStatusLabel(String(cs?.status || '')));
        case 'confirmed_at':
          return sortDate(cs?.confirmed_at);
        case 'transferred_at':
          return sortDate(cs?.payment_transferred_at || cs?.transferred_at);
        case 'notes':
          return sortString(safeNotes);
        default:
          return '';
      }
    };

    list.sort((a: any, b: any) => {
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

  const sortedCofferMovements = (() => {
    const list = (cofferMovements || []).slice();
    if (!sortMovementsConfig) return list;

    const { key, direction } = sortMovementsConfig;
    const factor = direction === 'asc' ? 1 : -1;

    const getValue = (m: any) => {
      switch (key) {
        case 'date':
          return sortDate(m?.payment_date || m?.created_at);
        case 'type':
          return sortString(m?.expense_type || m?.type);
        case 'reason':
          return sortString(m?.reason);
        case 'reference':
          return sortString(m?.reference || m?.id);
        case 'amount':
          return normalizeSignedAmount(m?.amount);
        default:
          return '';
      }
    };

    list.sort((a: any, b: any) => {
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

  // ===== Header totals (source-of-truth) =====
  // IMPORTANT:
  // The backend validation for supplier advances uses `coffer_totals_admin_v1` (via /coffer-totals).
  // The Coffre header in the UI MUST show the same numbers, otherwise users will see a higher
  // "Espèce" amount than what the backend allows.

  const [cofferTotals, setCofferTotals] = useState<any>(null);

  const fetchCofferTotals = async () => {
    try {
      const qs = new URLSearchParams();
      qs.set('coffer_id', selectedCofferId || 'main');

      // IMPORTANT: always send a store_id so totals match the exact DB row the user expects.
      // - Admin: if no explicit store filter is selected, default to the admin's own store.
      // - Non-admin: always use their own store.
      if (advanceUserRole === 'admin') {
        const sid = advanceFilterStore !== 'all'
          ? String(advanceFilterStore)
          : (advanceCurrentStoreId ? String(advanceCurrentStoreId) : null);
        if (sid) qs.set('store_id', sid);
      } else if (advanceCurrentStoreId) {
        qs.set('store_id', String(advanceCurrentStoreId));
      }

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/coffer-totals?${qs.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      setCofferTotals(data?.totals || null);
    } catch (e) {
      console.warn('Could not fetch /coffer-totals:', e);
    }
  };

  // Keep header totals in sync with selected coffer + store scope
  useEffect(() => {
    if (!session?.access_token) return;
    fetchCofferTotals();
    const id = setInterval(fetchCofferTotals, 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token, selectedCofferId, advanceUserRole, advanceFilterStore, advanceCurrentStoreId]);

  const headerTotals = useMemo(() => {
    const t = cofferTotals || {};
    return {
      montant_non_transferes: Number(t?.montant_non_transferes ?? 0) || 0,
      montant_transferes: Number(t?.montant_transferes ?? 0) || 0,
      montant_espece: Number(t?.montant_espece ?? 0) || 0,
      montant_cheque: Number(t?.montant_cheque ?? 0) || 0,
      montant_cheques_transferred: Number(t?.montant_cheques_transferred ?? 0) || 0,
      montant_cheques_utilises: Number(t?.montant_cheques_utilises ?? 0) || 0,
      montant_virement: Number(t?.montant_virement ?? 0) || 0,
      montant_mouvements_total: Number(t?.montant_mouvements_total ?? 0) || 0,
    };
  }, [cofferTotals]);

  const movementTotals = useMemo(() => {
    const rows = Array.isArray(cofferMovements) ? cofferMovements : [];

    let espece = 0;
    let virement = 0;
    let chequeTransfer = 0;
    let chequeOut = 0;
    let total = 0;

    for (const m of rows) {
      const amt = normalizeSignedAmount(m?.amount);
      total += amt;

      const t = normalizeMovementType(m?.expense_type);

      // Cheque payments/expenses from Coffre (like supplier payment by cheque)
      if (t.includes('coffer_out_check')) {
        chequeOut += amt;
        continue;
      }

      // Cheque transfers to bank are negative movements
      if (t.includes('transfer_check') || t.includes('coffer_transfer_check_bank')) {
        chequeTransfer += amt;
        continue;
      }

      // Bank transfer deposits are + (virement)
      if (t.includes('bank_transfer') || t.includes('virement')) {
        virement += amt;
        continue;
      }

      // Default cash bucket (includes coffer_deposit_cash, versement, and other cash-like rows)
      espece += amt;
    }

    return {
      total,
      espece,
      virement,
      chequeTransfer,
      chequeOut,
    };
  }, [cofferMovements]);

  const checksSafeTotals = useMemo(() => {
    const rows = Array.isArray(filteredChecksSafe) ? filteredChecksSafe : [];

    // Available/used are derived from checkSafeUsages, but we keep it simple here:
    // - available = sum of remaining (if present) else amount
    // - transferred = sum of all checks currently marked transferred
    // NOTE: your existing view had more sophisticated logic; this is movement-aligned.

    let totalAll = 0;
    let transferred = 0;

    for (const cs of rows) {
      const amount = Number(cs?.amount ?? 0) || 0;
      totalAll += amount;
      if (String(cs?.status || '') === 'transferred') {
        transferred += amount;
      }
    }

    return { totalAll, transferred };
  }, [filteredChecksSafe]);

  // Reconcile cheque totals ONLY with cheque-specific movements.
  // A normal versement (+) must not reduce cheque totals.
  // Only transfers of cheques to bank (negative movement) should reduce what is "available".
  const reconciledTotals = useMemo(() => {
    // NOTE:
    // - chequeTransfer is used only for "transféré vers banque" type movements.
    // - chequeOut represents cheque payments/expenses from the Coffre (supplier payments by cheque, etc.).

    const chequeTransferOut = movementTotals.chequeTransfer < 0 ? Math.abs(movementTotals.chequeTransfer) : 0;

    // In this UI, coffer_out_check rows currently store POSITIVE amounts.
    // We treat them as money leaving the cheque availability.
    const chequeOutAbs = movementTotals.chequeOut > 0 ? movementTotals.chequeOut : Math.abs(movementTotals.chequeOut);

    // Disponible = total cheques in safe - transfers to bank - cheque payments (supplier cheque usage)
    const adjustedCheques = Math.max(0, checksSafeTotals.totalAll - chequeTransferOut - chequeOutAbs);

    return {
      // Keep movement totals for reporting
      montant_transferes: movementTotals.total,
      montant_espece: movementTotals.espece,
      montant_virement: movementTotals.virement,
      // Cheque metrics
      montant_cheques_transferred: checksSafeTotals.transferred,
      montant_cheque: adjustedCheques,
      // We can expose used amount as a derived value so the header doesn't stay stale.
      montant_cheques_utilises: Math.max(0, checksSafeTotals.totalAll - adjustedCheques),
      montant_non_transferes: 0,
    };
  }, [movementTotals, checksSafeTotals]);

  // ===== Header summary: inventory (not transferred) vs transferred-to-safe =====
  // In your workflow, checks live in check_inventory first (transferred_to_safe = false)
  // and then get moved into check_safe (transferred_to_safe = true).
  //
  // Here in the Coffer page, we display BOTH:
  // - "Non transférés"  -> from check_inventory (not in coffre yet)
  // - "Transférés"      -> from check_safe (already transferred)
  // NOTE:
  // Sometimes old rows may not have transferred_to_safe correctly backfilled.
  // To avoid "ghost" non-transferred amounts, treat a check as transferred if:
  // - transferred_to_safe is true OR
  // - there is a matching check_safe row with the same check number.
  const safeNumbers = new Set(
    (checksSafe || []).map((s: any) => String(s?.check_number ?? '').trim()).filter(Boolean)
  );

  // Build a map of how much of each check number is already present in the safe.
  // This prevents double-counting in the header when the same check exists in inventory and safe.
  const safeAmountByNumber = new Map<string, number>();
  (checksSafe || []).forEach((s: any) => {
    const n = String(s?.check_number ?? '').trim();
    if (!n) return;
    const a = Number(s?.amount ?? 0) || 0;
    safeAmountByNumber.set(n, (safeAmountByNumber.get(n) || 0) + a);
  });

  const inventoryNotTransferredChecks = (checks || []).filter((c: any) => {
    const num = String(c?.check_id_number ?? '').trim();
    const flagTransferred = Boolean((c as any)?.transferred_to_safe);

    // Also exclude checks that are not usable in inventory anymore.
    const status = String(c?.status || '').toLowerCase();
    const isClosed = status === 'used' || status === 'archived';

    // Exclude checks that have no remaining amount.
    const remaining = Number(c?.remaining_balance ?? c?.amount_value ?? 0) || 0;
    const hasRemaining = remaining > 0;

    // If already marked transferred, ignore.
    if (flagTransferred || isClosed || !hasRemaining) return false;

    // If the check number exists in safe, it means some/all of it is already transferred.
    // Keep it in the list only if there is still a leftover amount not yet transferred.
    if (num && safeAmountByNumber.has(num)) {
      const alreadyInSafe = safeAmountByNumber.get(num) || 0;
      return remaining - alreadyInSafe > 0.000001;
    }

    return true;
  });

  // Amounts now come from DB source-of-truth (/coffer-totals)
  const inventoryNotTransferredAmount = Number(headerTotals?.montant_non_transferes ?? 0) || 0;

  const checksAmount = filteredChecksSafe.reduce((sum, cs) => sum + (cs.amount || 0), 0);
  const borrowedMoneyAmount = borrowedMoneyList.reduce((sum, bm) => sum + (bm.amount || 0), 0);
  const totalAmount = checksAmount + borrowedMoneyAmount;

  const pendingChecks = filteredChecksSafe.filter(cs => cs.status === 'pending');
  const verifiedChecks = filteredChecksSafe.filter(cs => cs.status === 'verified');
  const confirmedChecks = filteredChecksSafe.filter(cs => cs.status === 'confirmed');
  const inSafeChecks = filteredChecksSafe.filter(cs => cs.status === 'in_safe');
  const transferredChecks = filteredChecksSafe.filter(cs => cs.status === 'transferred');

  // ===== Amount separation (backend totals) =====
  const transferredTotalAmount = Number(headerTotals?.montant_transferes ?? 0) || 0;
  const transferredCashAmount = Number(headerTotals?.montant_espece ?? 0) || 0;

  // With the DB logic (source-of-truth):
  // - montant_cheques_transferred = total checks moved into the safe (historical)
  // - montant_cheque            = remaining checks available in the safe
  // - montant_cheques_utilises  = checks used inside the coffer
  //
  // However, some deployments may still have coffer_totals views that double-count cheque transfers
  // into "montant_transferes" or keep "montant_cheques_utilises" at 0.
  //
  // UI expectations (per your screenshot):
  // - "Montant (Chèque - Utilisés)" should equal the sum of checks marked as used/partly_used in the table
  //   (or usage ledger if available).
  // - "Montant (Transférés)" should be 0 unless checks have actually been transferred to bank
  //   (i.e. status='transferred' / payment_transferred_at set).
  const checksTransferredAmount = Number(headerTotals?.montant_cheques_transferred ?? 0) || 0;
  const checksAvailableAmount = Number(headerTotals?.montant_cheque ?? 0) || 0;

  // Prefer DB ledger when present, otherwise compute from UI rows.
  const checksUsedAmountFromDb = Number(headerTotals?.montant_cheques_utilises ?? 0) || 0;

  // Compute from current checks list:
  // - full used: status=used OR badge "Utilisé"
  // - partly used: remaining_balance < amount_value
  const computeUsedFromRows = () => {
    const rows = Array.isArray(checksSafe) ? checksSafe : [];
    let used = 0;

    for (const cs of rows) {
      const status = String(cs?.status || '').toLowerCase();
      const amount = Number(cs?.amount ?? 0) || 0;
      const remaining = Number(cs?.remaining_balance ?? cs?.remainingBalance ?? cs?.remaining_amount ?? NaN);

      // Used checks: explicit status or usage ledger suggests used > 0
      const usageRow = (checkSafeUsages || []).find((u: any) => String(u?.check_safe_id) === String(cs?.id));
      const usedByLedger = Number(usageRow?.total_used ?? 0) || 0;
      if (usedByLedger > 0) {
        used += usedByLedger;
        continue;
      }

      // If status explicitly marks used
      if (status === 'used' || status === 'utilise' || status === 'utilisé' || status === 'partly_used' || status === 'partiellement_utilise' || status === 'partiellement_utilisé') {
        if (Number.isFinite(remaining) && remaining >= 0 && remaining <= amount) {
          used += Math.max(0, amount - remaining);
        } else {
          used += amount;
        }
        continue;
      }

      // Fallback: if remaining balance exists and is < amount, treat the difference as used
      if (Number.isFinite(remaining) && remaining >= 0 && remaining < amount) {
        used += Math.max(0, amount - remaining);
      }
    }

    return used;
  };

  const checksUsedAmount = checksUsedAmountFromDb > 0 ? checksUsedAmountFromDb : computeUsedFromRows();

  // "Montant (Virement)" should ONLY reflect actual bank transfer movements.
  // Some deployments may accidentally mix cheque-to-bank transfer movements (expense_type=coffer_transfer_check_bank)
  // into montant_virement in /coffer-totals.
  //
  // UI expectation: if there was no real virement, this must be 0.
  const transferredBankTransferAmount = Math.max(0, movementTotals.virement);

  // Fetch coffer expense categories
  useEffect(() => {
    const fetchCofferExpenseCategories = async () => {
      try {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/charge-categories`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setCofferExpenseCategories(data.categories || []);
        }
      } catch (error) {
        console.error('Error fetching coffer expense categories:', error);
      }
    };

    fetchCofferExpenseCategories();
  }, [session.access_token]);

  if (!canViewCoffre) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Accès refusé</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">Vous n'avez pas la permission « Voir le Coffre ».</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Bank Safe Overview Cards */}
      <div className="text-xs text-gray-500 mb-2">
        <b>Note :</b> Les montants ci-dessous proviennent de <code>/coffer-totals</code> (source de vérité) pour correspondre aux validations backend.
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-medium text-gray-600">Total Coffre</div>
            <div className="text-xl font-bold text-gray-900">{filteredChecksSafe.length}</div>
          </div>
          <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-medium text-gray-600">Non transférés</div>
            <div className="text-xl font-bold text-gray-900">{inventoryNotTransferredChecks.length}</div>
          </div>
          <div className="h-10 w-10 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-medium text-gray-600">En Attente</div>
            <div className="text-xl font-bold text-gray-900">{pendingChecks.length}</div>
          </div>
          <div className="h-10 w-10 rounded-lg bg-gray-50 text-gray-700 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-medium text-gray-600">Confirmés</div>
            <div className="text-xl font-bold text-gray-900">{confirmedChecks.length}</div>
          </div>
          <div className="h-10 w-10 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-medium text-gray-600">Transférés</div>
            <div className="text-xl font-bold text-gray-900">{transferredChecks.length}</div>
          </div>
          <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-medium text-gray-600">Montant (Non transférés)</div>
            <div className="text-xl font-bold text-gray-900">{inventoryNotTransferredAmount.toFixed(2)} MAD</div>
          </div>
          <div className="h-10 w-10 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-medium text-gray-600">Montant (Transférés)</div>
            <div className="text-xl font-bold text-gray-900">{transferredTotalAmount.toFixed(2)} MAD</div>
          </div>
          <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-medium text-gray-600">Montant (Espèce)</div>
            <div className="text-xl font-bold text-gray-900">{transferredCashAmount.toFixed(2)} MAD</div>
          </div>
          <div className="h-10 w-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-medium text-gray-600">Montant (Chèque - Disponible)</div>
            <div className="text-xl font-bold text-gray-900">{checksAvailableAmount.toFixed(2)} MAD</div>
          </div>
          <div className="h-10 w-10 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-medium text-gray-600">Montant (Chèque - Utilisés)</div>
            <div className="text-xl font-bold text-gray-900">{checksUsedAmount.toFixed(2)} MAD</div>
          </div>
          <div className="h-10 w-10 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-medium text-gray-600">Montant (Chèque - Transférés)</div>
            <div className="text-xl font-bold text-gray-900">{checksTransferredAmount.toFixed(2)} MAD</div>
          </div>
          <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-medium text-gray-600">Montant (Virement)</div>
            <div className="text-xl font-bold text-gray-900">{transferredBankTransferAmount.toFixed(2)} MAD</div>
          </div>
          <div className="h-10 w-10 rounded-lg bg-cyan-50 text-cyan-700 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Coffer Management Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              Gestion des Coffres
            </CardTitle>
            <Dialog open={createCofferDialogOpen} onOpenChange={setCreateCofferDialogOpen}>
              <DialogTrigger asChild>
              <Button className="gap-2" disabled={!canAddCoffreEntry} title={!canAddCoffreEntry ? "Vous n'avez pas la permission « Ajouter une Entrée Coffre »" : undefined}>
              <Plus className="w-4 h-4" />
              Créer un Coffre
              </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Créer un Nouveau Coffre</DialogTitle>
                </DialogHeader>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  createCoffer();
                }} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="coffer_name">Nom du Coffre</Label>
                    <Input
                      id="coffer_name"
                      placeholder="Ex: Coffre 2, Coffre Secondaire..."
                      value={newCofferName}
                      onChange={(e) => setNewCofferName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setCreateCofferDialogOpen(false);
                        setNewCofferName('');
                      }}
                    >
                      Annuler
                    </Button>
                    <Button
                      type="submit"
                      disabled={cofferLoading || !newCofferName.trim()}
                    >
                      {cofferLoading ? 'Création...' : 'Créer'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {coffers.map((coffer) => (
              <div key={coffer.id} style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  onClick={() => setSelectedCofferId(coffer.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    border: '2px solid',
                    backgroundColor: selectedCofferId === coffer.id ? '#4f46e5' : '#ffffff',
                    color: selectedCofferId === coffer.id ? '#ffffff' : '#374151',
                    borderColor: selectedCofferId === coffer.id ? '#4f46e5' : '#d1d5db',
                  }}
                >
                  <Lock style={{ width: '16px', height: '16px' }} />
                  {coffer.name}
                </button>
                {coffer.id !== 'main' && (
                  <button
                    onClick={() => {
                      // If deletion is scheduled, clicking this cancels it.
                      if ((coffer as any).deletion_requested_at) {
                        cancelCofferDeletion(coffer.id);
                        return;
                      }
                      deleteCoffer(coffer.id);
                    }}
                    style={{
                      position: 'absolute',
                      top: '-12px',
                      right: '-12px',
                      backgroundColor: (coffer as any).deletion_requested_at ? '#16a34a' : '#ef4444',
                      color: '#ffffff',
                      borderRadius: '50%',
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      border: 'none',
                      zIndex: 10,
                    }}
                    title={(coffer as any).deletion_requested_at ? 'Annuler la suppression planifiée' : 'Planifier la suppression'}
                  >
                    {(coffer as any).deletion_requested_at ? '↺' : '×'}
                  </button>
                )}
              </div>
            ))}
          </div>
          <p style={{ fontSize: '14px', color: '#4b5563', marginTop: '16px' }}>
            Coffre sélectionné: <span style={{ fontWeight: '600', color: '#4f46e5' }}>{coffers.find(c => c.id === selectedCofferId)?.name}</span>
          </p>
        </CardContent>
      </Card>

      {/* Global Payment Button - Top Section */}
      <div className="flex justify-between items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Gestion du Coffre-fort</h2>
        <div className="flex gap-2 flex-wrap justify-end">
          {/* Export Dropdown */}
          <div className="relative">
            <Button
              onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
              style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
              className="hover:opacity-90 font-semibold text-white"
            >
              <Download className="w-4 h-4 mr-2" />
              Exporter
              <svg className={`w-4 h-4 ml-2 transition-transform ${exportDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </Button>
            {exportDropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <button
                  onClick={() => {
                    exportCoffreToExcel();
                    setExportDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-blue-50 text-gray-700 text-sm flex items-center gap-2 border-b border-gray-100"
                >
                  <Download className="w-4 h-4" />
                  Coffre (Excel)
                </button>
                <button
                  onClick={() => {
                    exportCoffreToPdf();
                    setExportDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-blue-50 text-gray-700 text-sm flex items-center gap-2 border-b border-gray-100"
                >
                  <FileText className="w-4 h-4" />
                  Coffre (PDF)
                </button>
                <button
                  onClick={() => {
                    exportChecksToPdf();
                    setExportDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-blue-50 text-gray-700 text-sm flex items-center gap-2 border-b border-gray-100"
                >
                  <FileText className="w-4 h-4" />
                  Chèques (PDF)
                </button>
                <button
                  onClick={() => {
                    exportCoffreToExcel();
                    setExportDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-blue-50 text-gray-700 text-sm flex items-center gap-2 border-b border-gray-100"
                >
                  <Download className="w-4 h-4" />
                  Coffre (Excel)
                </button>
                <button
                  onClick={() => {
                    exportChecksToExcel();
                    setExportDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-blue-50 text-gray-700 text-sm flex items-center gap-2 border-b border-gray-100"
                >
                  <Download className="w-4 h-4" />
                  Chèques (Excel)
                </button>
                <button
                  onClick={() => {
                    exportMovementsToExcel();
                    setExportDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-blue-50 text-gray-700 text-sm flex items-center gap-2 border-b border-gray-100"
                >
                  <Download className="w-4 h-4" />
                  Mouvements (Excel)
                </button>
                <button
                  onClick={() => {
                    exportMovementsToPdf();
                    setExportDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-blue-50 text-gray-700 text-sm flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Mouvements (PDF)
                </button>
              </div>
            )}
          </div>
          {/* Versement (direct to Coffre, no caisse deduction) */}
          <Dialog open={versementDialogOpen} onOpenChange={setVersementDialogOpen}>
            <DialogTrigger asChild>
              <Button
                style={{ backgroundColor: '#16a34a', color: '#ffffff' }}
                className="hover:opacity-90 font-semibold text-white"
                disabled={!canAddCoffreEntry}
                title={!canAddCoffreEntry ? "Vous n'avez pas la permission « Ajouter une Entrée Coffre »" : undefined}
              >
                + Versement
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Ajouter un Versement au Coffre</DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Coffre *</Label>
                  <select
                    value={selectedCofferId}
                    onChange={(e) => setSelectedCofferId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {coffers.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Méthode *</Label>
                  <select
                    value={versementMethod}
                    onChange={(e) => setVersementMethod(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="cash">Espèce</option>
                    <option value="bank_transfer">Virement</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Référence {versementMethod === 'bank_transfer' ? 'Virement' : 'Espèce'} (optionnel)</Label>
                  <Input
                    placeholder={versementMethod === 'bank_transfer' ? "Ex: TRF123456, Numéro de transaction..." : "Ex: Numéro de reçu, Référence..."}
                    value={versementReference}
                    onChange={(e) => setVersementReference(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Montant (MAD) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={versementAmount}
                    onChange={(e) => setVersementAmount(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Raison (optionnel)</Label>
                  <Input
                    placeholder="Ex: Versement..."
                    value={versementReason}
                    onChange={(e) => setVersementReason(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Notes (optionnel)</Label>
                  <Input
                    placeholder="Ex: détails, référence, ..."
                    value={versementNotes}
                    onChange={(e) => setVersementNotes(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Date du Versement (optionnel)</Label>
                  <Input
                    type="date"
                    value={versementDate}
                    onChange={(e) => setVersementDate(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setVersementDialogOpen(false)}
                    disabled={versementSubmitting}
                  >
                    Annuler
                  </Button>
                  <Button
                    style={{ backgroundColor: '#16a34a', color: '#ffffff' }}
                    className="hover:opacity-90 text-white font-semibold"
                    disabled={versementSubmitting}
                    onClick={async () => {
                      if (!canAddCoffreEntry) {
                        toast.error("Vous n'avez pas la permission « Ajouter une Entrée Coffre »");
                        return;
                      }

                      const amount = Number(versementAmount);
                      if (!Number.isFinite(amount) || amount <= 0) {
                        toast.error('Veuillez entrer un montant valide (> 0)');
                        return;
                      }

                      try {
                        setVersementSubmitting(true);

                        // Combine reference and notes
                        let combinedNotes = versementReference || '';
                        if (versementNotes) {
                          combinedNotes = combinedNotes ? `${combinedNotes} | ${versementNotes}` : versementNotes;
                        }

                        const payload: any = {
                          operation: 'versement',
                          coffer_id: selectedCofferId,
                          amount,
                          method: versementMethod,
                          reason: versementReason || null,
                          notes: combinedNotes || null,
                          payment_date: versementDate || null,
                        };

                        const res = await fetch(
                          `https://${projectId}.supabase.co/functions/v1/super-handler/coffer-movements`,
                          {
                            method: 'POST',
                            headers: {
                              Authorization: `Bearer ${session.access_token}`,
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(payload),
                          }
                        );

                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          toast.error(data?.error || 'Erreur lors de l\'enregistrement');
                          return;
                        }

                        toast.success('Versement enregistré');

                        setVersementDialogOpen(false);
                        setVersementAmount('');
                        setVersementReason('');
                        setVersementNotes('');
                        setVersementMethod('cash');
                        setVersementDate('');

                        // Refresh history
                        fetchCofferMovements(selectedCofferId);
                        setActiveView('movements');
                      } catch (e: any) {
                        console.error(e);
                        toast.error(e?.message || 'Erreur');
                      } finally {
                        setVersementSubmitting(false);
                      }
                    }}
                  >
                    {versementSubmitting ? 'Enregistrement...' : 'Enregistrer'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* NEW: Add extra amount into the coffer (deposit) */}
          <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
            <DialogTrigger asChild>
              <Button
                style={{ backgroundColor: '#0ea5e9', color: '#ffffff' }}
                className="hover:opacity-90 font-semibold text-white"
                disabled={!canAddCoffreEntry}
                title={!canAddCoffreEntry ? "Vous n'avez pas la permission « Ajouter une Entrée Coffre »" : undefined}
              >
                + Versement (Caisse → Coffre)
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Ajouter un Versement au Coffre (depuis la Caisse)</DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                
                <div className="space-y-2">
                  <Label>Coffre *</Label>
                  <select
                    value={selectedCofferId}
                    onChange={(e) => setSelectedCofferId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {coffers.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Méthode *</Label>
                  <select
                    value={depositMethod}
                    onChange={(e) => setDepositMethod(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="cash">Espèce</option>
                    <option value="bank_transfer">Virement</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Référence {depositMethod === 'bank_transfer' ? 'Virement' : 'Espèce'} (optionnel)</Label>
                  <Input
                    placeholder={depositMethod === 'bank_transfer' ? "Ex: TRF123456, Numéro de transaction..." : "Ex: Numéro de reçu, Référence..."}
                    value={depositReference}
                    onChange={(e) => setDepositReference(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Montant (MAD) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Raison (optionnel)</Label>
                  <Input
                    placeholder="Ex: Versement caisse journée..."
                    value={depositReason}
                    onChange={(e) => setDepositReason(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Notes (optionnel)</Label>
                  <Input
                    placeholder="Ex: détails, référence, ..."
                    value={depositNotes}
                    onChange={(e) => setDepositNotes(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Date du Versement (optionnel)</Label>
                  <Input
                    type="date"
                    value={depositDate}
                    onChange={(e) => setDepositDate(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setDepositDialogOpen(false)}
                    disabled={depositSubmitting}
                  >
                    Annuler
                  </Button>
                  <Button
                    style={{ backgroundColor: '#0ea5e9', color: '#ffffff' }}
                    className="hover:opacity-90 text-white font-semibold"
                    disabled={depositSubmitting}
                    onClick={async () => {
                      if (!canAddCoffreEntry) {
                        toast.error("Vous n'avez pas la permission « Ajouter une Entrée Coffre »");
                        return;
                      }

                      const amount = Number(depositAmount);
                      if (!Number.isFinite(amount) || amount <= 0) {
                        toast.error('Veuillez entrer un montant valide (> 0)');
                        return;
                      }

                      
                      try {
                        setDepositSubmitting(true);

                        // Combine reference and notes
                        let combinedNotes = depositReference || '';
                        if (depositNotes) {
                          combinedNotes = combinedNotes ? `${combinedNotes} | ${depositNotes}` : depositNotes;
                        }

                        const payload: any = {
                          coffer_id: selectedCofferId,
                          amount,
                          method: depositMethod,
                          reason: depositReason || null,
                          notes: combinedNotes || null,
                          payment_date: depositDate || null,
                        };

                        
                        const res = await fetch(
                          `https://${projectId}.supabase.co/functions/v1/super-handler/coffer-movements`,
                          {
                            // NOTE: if you get "Not Found", your deployed Supabase Edge Function
                            // may not include the new endpoint yet. Redeploy the function after pulling changes.
                            method: 'POST',
                            headers: {
                              Authorization: `Bearer ${session.access_token}`,
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(payload),
                          }
                        );

                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          toast.error(data?.error || 'Erreur lors de l\'enregistrement');
                          return;
                        }

                        toast.success('Versement (Caisse → Coffre) enregistré');

                        setDepositDialogOpen(false);
                        setDepositAmount('');
                        setDepositReason('');
                        setDepositNotes('');
                        setDepositMethod('cash');
                        setDepositDate('');

                        // Refresh history
                        fetchCofferMovements(selectedCofferId);
                        setActiveView('movements');
                      } catch (e: any) {
                        console.error(e);
                        toast.error(e?.message || 'Erreur');
                      } finally {
                        setDepositSubmitting(false);
                      }
                    }}
                  >
                    {depositSubmitting ? 'Enregistrement...' : 'Enregistrer'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Advance Button */}
          <Dialog
            open={advanceDialogOpen}
            onOpenChange={(open) => {
              setAdvanceDialogOpen(open);
              if (open) {
                fetchSuppliersForAdvance();
              }
            }}
          >
            <DialogTrigger asChild>
              <Button
                style={{ backgroundColor: '#059669', color: '#ffffff' }}
                className="hover:opacity-90 font-semibold text-white"
                disabled={!canCreateSupplierAdvance}
                title={!canCreateSupplierAdvance ? "Vous n'avez pas la permission « Créer une Avance Fournisseur (Coffre) »" : undefined}
              >
                + Avance
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Créer une Avance Fournisseur</DialogTitle>
              </DialogHeader>

              {advanceUserRole === 'admin' && (
                <div className="space-y-2">
                  <Label>Magasin *</Label>
                  <select
                    value={advanceFilterStore}
                    onChange={(e) => setAdvanceFilterStore(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="all">-- Sélectionner --</option>
                    {advanceStores.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500">Admin: choisissez le magasin, puis le fournisseur.</p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Coffre *</Label>
                <select
                  value={selectedCofferId}
                  onChange={(e) => setSelectedCofferId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {coffers.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Fournisseur *</Label>
                <select
                  value={advanceSupplierId}
                  onChange={(e) => setAdvanceSupplierId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Sélectionner --</option>
                  {advanceSuppliers.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                {advanceUserRole === 'admin' && advanceFilterStore === 'all' && (
                  <p className="text-xs text-red-600">Sélectionnez un magasin pour afficher ses fournisseurs.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Montant (MAD) *</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={advanceAmount}
                    onChange={(e) => setAdvanceAmount(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Méthode *</Label>
                  <select
                    value={advancePaymentMethod}
                    onChange={(e) => setAdvancePaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="cash">Cash</option>
                    <option value="check">Chèque</option>
                    <option value="bank_transfer">Virement</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Date de l'avance (optionnel)</Label>
                <Input
                  type="date"
                  value={advanceDate}
                  onChange={(e) => setAdvanceDate(e.target.value)}
                  className="border-emerald-300 focus:border-emerald-500"
                />
                <p className="text-xs text-gray-500">Laissez vide pour utiliser la date du jour</p>
              </div>

              {advancePaymentMethod === 'check' && (
                <div className="space-y-4">
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                    <p className="text-sm font-semibold text-blue-900">Sélectionner un Chèque</p>
                    <p className="text-xs text-blue-700 mt-1">Choisissez un chèque existant ou créez-en un nouveau</p>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={async () => {
                        try {
                          const response = await fetch(
                            `https://${projectId}.supabase.co/functions/v1/super-handler/check-safe?coffer_id=${selectedCofferId}`,
                            {
                              headers: {
                                'Authorization': `Bearer ${session.access_token}`,
                              },
                            }
                          );
                          if (response.ok) {
                            const data = await response.json();

                            // Only checks already in the selected coffer/safe
                            const safeChecks = (data.check_safe || [])
                              .filter((cs: any) => {
                                const st = String(cs.status || '').toLowerCase();
                                return st !== 'used' && st !== 'archived';
                              })
                              .map((cs: any) => ({
                                ...cs,
                                // normalize fields so the UI can reuse existing rendering
                                check_id_number: cs.check_number,
                                amount_value: cs.amount,
                                remaining_balance: cs.amount,
                              }));

                            setChecks(safeChecks);
                            setCheckDialogOpen(true);
                          }
                        } catch (error) {
                          toast.error('Erreur lors du chargement des chèques');
                        }
                      }}
                      style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
                      className="flex-1 hover:opacity-90 text-white font-semibold"
                    >
                      Choisir du Stock
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setCreateCheckDialogOpen(true)}
                      style={{ backgroundColor: '#16a34a', color: '#ffffff' }}
                      className="flex-1 hover:opacity-90 text-white font-semibold"
                    >
                      Créer Nouveau
                    </Button>
                  </div>

                  {selectedCheck && (
                    <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-sm font-semibold text-green-900">Chèque Sélectionné</p>
                      <p className="text-sm text-green-700 mt-1">{selectedCheck.check_id_number}</p>
                      <p className="text-xs text-green-600 mt-1">Disponible: {(selectedCheck.remaining_balance || 0).toFixed(2)} MAD</p>
                    </div>
                  )}

                  {/* Check Selection Dialog */}
                  <Dialog
                    open={checkDialogOpen}
                    onOpenChange={(open) => {
                      setCheckDialogOpen(open);
                      if (!open) setCheckSearchTerm('');
                    }}
                  >
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Sélectionner un Chèque du Coffre</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <Input
                            placeholder="Tapez pour rechercher (min 2 caractères)..."
                            className="pl-10"
                            value={checkSearchTerm}
                            onChange={(e) => setCheckSearchTerm(e.target.value)}
                          />
                        </div>

                        {(() => {
                          const term = checkSearchTerm.trim().toLowerCase();
                          if (term.length < 2) {
                            return (
                              <div className="text-center py-4 text-gray-500">
                                Commencez à taper pour afficher des suggestions
                              </div>
                            );
                          }

                          const filtered = checks
                            .filter((check) => {
                              // checks here come from check_safe (selected coffer)
                              const st = String(check.status || '').toLowerCase();
                              if (st === 'used' || st === 'archived') return false;

                              const available =
                                Number((check as any).remaining_balance ?? (check as any).amount_value ?? 0) || 0;
                              // Only show checks with remaining balance > 0
                              if (available <= 0) return false;

                              return (
                                String(check.check_id_number || '').toLowerCase().includes(term) ||
                                String(check.given_to || '').toLowerCase().includes(term) ||
                                String(check.amount_value || '').includes(term) ||
                                String((check as any).original_amount ?? '').includes(term) ||
                                String((check as any).remaining_balance ?? '').includes(term)
                              );
                            })
                            .slice(0, 6);

                          if (checks.length === 0) {
                            return (
                              <div className="text-center py-4 text-gray-500">Aucun chèque disponible dans le coffre</div>
                            );
                          }

                          if (filtered.length === 0) {
                            return <div className="text-center py-4 text-gray-500">Aucun résultat</div>;
                          }

                          return (
                            <div className="max-h-64 overflow-y-auto border rounded-lg">
                              {filtered.map((check) => {
                                const original =
                                  Number((check as any).original_amount ?? (check as any).amount_value ?? 0) || 0;
                                const remaining =
                                  Number((check as any).remaining_balance ?? (check as any).amount_value ?? 0) || 0;
                                const used = Math.max(0, original - remaining);
                                
                                // Determine status badge
                                const isPartiallyUsed = used > 0 && remaining > 0;
                                const statusBadge = isPartiallyUsed 
                                  ? { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Partiellement utilisé' }
                                  : { bg: 'bg-green-100', text: 'text-green-800', label: 'Disponible' };

                                return (
                                  <button
                                    key={check.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedCheck(check);

                                      // Auto-fill ADVANCE amount from selected check available
                                      {
                                        const amt =
                                          Number((check as any).remaining_balance ?? (check as any).amount_value ?? 0) || 0;
                                        setAdvanceAmount(amt > 0 ? String(amt) : '');
                                      }

                                      setCheckDialogOpen(false);
                                      setCheckSearchTerm('');
                                      toast.success(`Chèque ${check.check_id_number} sélectionné`);
                                    }}
                                    className="w-full text-left p-3 border-b hover:bg-blue-50 transition"
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="font-semibold text-sm">{check.check_id_number}</div>
                                      <span className={`text-xs font-semibold px-2 py-1 rounded ${statusBadge.bg} ${statusBadge.text}`}>
                                        {statusBadge.label}
                                      </span>
                                    </div>
                                    <div className="text-xs text-gray-600">
                                      <div>Montant original: {original.toFixed(2)} MAD</div>
                                      <div>
                                        Utilisé: {used.toFixed(2)} MAD • Reste: {remaining.toFixed(2)} MAD
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}

                        <Button type="button" onClick={() => setCheckDialogOpen(false)} variant="outline" className="w-full">
                          Fermer
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  {/* Create Check Dialog */}
                  <Dialog open={createCheckDialogOpen} onOpenChange={setCreateCheckDialogOpen}>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Uploader un Chèque à l'Inventaire</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={async (e) => {
                        e.preventDefault();
                        setLoading(true);
                        try {
                          // If file is provided, use the upload endpoint
                          if (uploadFile) {
                            const formDataUpload = new FormData();
                            formDataUpload.append('file', uploadFile);
                            formDataUpload.append('check_id_number', uploadCheckId);
                            formDataUpload.append('amount_value', uploadAmount);
                            formDataUpload.append('user_email', session?.user?.email || 'unknown');
                            formDataUpload.append('notes', uploadNotes);
                            formDataUpload.append('giver_name', uploadGiverName);
                            formDataUpload.append('check_date', uploadCheckDate);
                            formDataUpload.append('execution_date', uploadExecutionDate);

                            const response = await fetch(
                              `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory/upload`,
                              {
                                method: 'POST',
                                headers: {
                                  'Authorization': `Bearer ${session.access_token}`,
                                },
                                body: formDataUpload,
                              }
                            );

                            if (response.ok) {
                              const data = await response.json();
                              setSelectedCheck(data.check);
                              toast.success('Chèque uploadé avec succès');
                              setCreateCheckDialogOpen(false);
                              setUploadFile(null);
                              setUploadCheckId('');
                              setUploadAmount('');
                              setUploadNotes('');
                              setUploadGiverName('');
                              setUploadCheckDate('');
                              setUploadExecutionDate('');
                            } else {
                              const error = await response.json();
                              toast.error(error.error || 'Erreur lors de l\'upload');
                            }
                          } else {
                            // If no file, create check without upload
                            const response = await fetch(
                              `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory`,
                              {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  'Authorization': `Bearer ${session.access_token}`,
                                },
                                body: JSON.stringify({
                                  check_id_number: uploadCheckId,
                                  amount_value: uploadAmount ? parseFloat(uploadAmount) : 0,
                                  // Persist "Donneur" (giver) so it can be displayed later in the safe table.
                                  // If not provided, fallback to current user email.
                                  given_to: uploadGiverName || session?.user?.email || 'unknown',
                                  given_to_type: uploadGiverName ? 'client' : 'user',
                                  given_to_id: null,
                                  status: 'pending',
                                  notes: uploadNotes || null,
                                  due_date: uploadExecutionDate || null,
                                }),
                              }
                            );

                            if (response.ok) {
                              const data = await response.json();
                              setSelectedCheck(data.check);
                              toast.success('Chèque créé avec succès');
                              setCreateCheckDialogOpen(false);
                              setUploadFile(null);
                              setUploadCheckId('');
                              setUploadAmount('');
                              setUploadNotes('');
                              setUploadGiverName('');
                              setUploadCheckDate('');
                              setUploadExecutionDate('');
                            } else {
                              const error = await response.json();
                              toast.error(error.error || 'Erreur lors de la création du chèque');
                            }
                          }
                        } catch (error: any) {
                          toast.error(`Erreur: ${error.message}`);
                        } finally {
                          setLoading(false);
                        }
                      }} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="upload_file">Fichier (Image ou PDF)</Label>
                          <Input
                            id="upload_file"
                            type="file"
                            accept="image/*,.pdf"
                            onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                          />
                          <p className="text-xs text-gray-500">JPG, PNG ou PDF (Max 10MB)</p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="upload_check_id">ID du Chèque</Label>
                          <Input
                            id="upload_check_id"
                            value={uploadCheckId}
                            onChange={(e) => setUploadCheckId(e.target.value)}
                            placeholder="Ex: CHK-2024-001"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="upload_amount">Montant (MAD)</Label>
                          <Input
                            id="upload_amount"
                            type="number"
                            step="0.01"
                            value={uploadAmount}
                            onChange={(e) => setUploadAmount(e.target.value)}
                            placeholder="0.00"
                          />
                        </div>

                        <div className="space-y-2 relative">
                          <Label htmlFor="upload_giver_name">Donneur du Chèque (Optionnel)</Label>
                          <Input
                            id="upload_giver_name"
                            value={uploadGiverName}
                            onChange={(e) => setUploadGiverName(e.target.value)}
                            placeholder="Tapez le nom d'un client..."
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="upload_check_date">Date du Chèque (Optionnel)</Label>
                          <Input
                            id="upload_check_date"
                            type="date"
                            value={uploadCheckDate}
                            onChange={(e) => setUploadCheckDate(e.target.value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="upload_execution_date">Date d'Échéance (Optionnel)</Label>
                          <Input
                            id="upload_execution_date"
                            type="date"
                            value={uploadExecutionDate}
                            onChange={(e) => setUploadExecutionDate(e.target.value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="upload_notes">Notes</Label>
                          <Input
                            id="upload_notes"
                            value={uploadNotes}
                            onChange={(e) => setUploadNotes(e.target.value)}
                            placeholder="Notes supplémentaires..."
                          />
                        </div>

                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            onClick={() => {
                              setCreateCheckDialogOpen(false);
                              setUploadFile(null);
                              setUploadCheckId('');
                              setUploadAmount('');
                              setUploadGiverName('');
                              setUploadNotes('');
                              setUploadCheckDate('');
                              setUploadExecutionDate('');
                            }}
                            style={{ backgroundColor: '#d1d5db' }}
                            className="text-gray-800 hover:opacity-90"
                          >
                            Annuler
                          </Button>
                          <Button
                            type="submit"
                            disabled={loading}
                            style={{ backgroundColor: '#f59e0b' }}
                            className="text-white hover:opacity-90"
                          >
                            {loading ? 'Upload...' : 'Uploader'}
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              )}

              {advancePaymentMethod === 'bank_transfer' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Date virement</Label>
                    <Input
                      type="date"
                      value={advanceBankTransferDate}
                      onChange={(e) => setAdvanceBankTransferDate(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="bank_transfer_proof">Preuve de virement (PDF ou Image)</Label>
                    <Input
                      id="bank_transfer_proof"
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setAdvanceBankTransferProofFile(e.target.files?.[0] || null)}
                    />
                    {advanceBankTransferProofFile && (
                      <p className="text-xs text-gray-600">✓ Fichier sélectionné: {advanceBankTransferProofFile.name}</p>
                    )}
                    <p className="text-xs text-gray-500">JPG, PNG ou PDF (Max 10MB) - Optionnel</p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Notes</Label>
                <Input
                  value={advanceNotes}
                  onChange={(e) => setAdvanceNotes(e.target.value)}
                  placeholder="Optionnel..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setAdvanceDialogOpen(false)}
                  disabled={advanceSubmitting}
                >
                  Annuler
                </Button>
                <Button
                  style={{ backgroundColor: '#059669', color: '#ffffff' }}
                  className="hover:opacity-90 text-white font-semibold"
                  disabled={advanceSubmitting}
                  onClick={async () => {
                    if (!canCreateSupplierAdvance) {
                      toast.error("Vous n'avez pas la permission « Créer une Avance Fournisseur (Coffre) »");
                      return;
                    }

                    try {
                      const amount = Number(advanceAmount);
                      if (!advanceSupplierId) {
                        toast.error('Veuillez sélectionner un fournisseur');
                        return;
                      }
                      if (!Number.isFinite(amount) || amount <= 0) {
                        toast.error('Veuillez entrer un montant valide (> 0)');
                        return;
                      }
                      if (advanceUserRole === 'admin' && advanceFilterStore === 'all') {
                        toast.error('Veuillez sélectionner un magasin');
                        return;
                      }

                      setAdvanceSubmitting(true);

                      const cofferName = coffers.find((c: any) => c.id === selectedCofferId)?.name || null;

                      const payload: any = {
                        supplier_id: advanceSupplierId,
                        amount,
                        payment_method: advancePaymentMethod,
                        coffer_id: selectedCofferId,
                        coffer_name: cofferName,
                        notes: advanceNotes || null,
                        payment_date: advanceDate ? new Date(advanceDate + 'T12:00:00').toISOString() : null,
                      };

                      if (advanceUserRole === 'admin' && advanceFilterStore !== 'all') {
                        payload.store_id = advanceFilterStore;
                      }

                      if (advancePaymentMethod === 'check') {
                        payload.check_reference = advanceCheckReference || null;
                      }

                      if (advancePaymentMethod === 'bank_transfer') {
                        payload.bank_transfer_reference = advanceBankTransferReference || null;
                        payload.bank_transfer_date = advanceBankTransferDate || null;
                        
                        // Handle bank transfer proof file
                        if (advanceBankTransferProofFile) {
                          const base64String = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => {
                              resolve(reader.result as string);
                            };
                            reader.onerror = () => {
                              reject(new Error('Failed to read file'));
                            };
                            reader.readAsDataURL(advanceBankTransferProofFile);
                          });
                          payload.bank_transfer_proof_file = base64String;
                          payload.bank_transfer_proof_file_type = advanceBankTransferProofFile.type.startsWith('image') ? 'image' : 'pdf';
                          payload.bank_transfer_proof_file_name = advanceBankTransferProofFile.name;
                        }
                      }

                      const res = await fetch(
                        `https://${projectId}.supabase.co/functions/v1/super-handler/supplier-advances`,
                        {
                          method: 'POST',
                          headers: {
                            Authorization: `Bearer ${session.access_token}`,
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify(payload),
                        }
                      );

                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) {
                        toast.error(data?.error || 'Erreur lors de la création de l\'avance');
                        return;
                      }

                      toast.success('Avance enregistrée');

                      setAdvanceSupplierId('');
                      setAdvanceAmount('');
                      setAdvancePaymentMethod('cash');
                      setAdvanceDate('');
                      setAdvanceCheckReference('');
                      setAdvanceBankTransferReference('');
                      setAdvanceBankTransferDate('');
                      setAdvanceNotes('');
                      setAdvanceDialogOpen(false);

                      // Refresh history
                      fetchAdvances();
                      setAdvanceHistoryOpen(true);
                    } catch (e: any) {
                      console.error(e);
                      toast.error(e?.message || 'Erreur');
                    } finally {
                      setAdvanceSubmitting(false);
                    }
                  }}
                >
                  {advanceSubmitting ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          
          {/* Coffer Expenses Button */}
          <Dialog open={cofferExpensesDialogOpen} onOpenChange={setCofferExpensesDialogOpen}>
            <DialogTrigger asChild>
              <Button style={{ backgroundColor: '#f59e0b' }} className="text-white" disabled={!canAddCoffreEntry} title={!canAddCoffreEntry ? "Vous n'avez pas la permission « Ajouter une Entrée Coffre »" : undefined}>
                <Plus className="w-4 h-4 mr-2" />
                Dépense Coffre
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Enregistrer une Dépense Coffre</DialogTitle>
              </DialogHeader>
              <form onSubmit={async (e) => {
                e.preventDefault();

                if (!cofferExpenseAmount || parseFloat(cofferExpenseAmount) <= 0) {
                  toast.error('Veuillez entrer un montant valide');
                  return;
                }

                if (!cofferExpenseReason.trim()) {
                  toast.error('Veuillez sélectionner une catégorie de dépense');
                  return;
                }

                setCofferExpenseSubmitting(true);

                try {
                  // Convert file to base64 if file exists
                  let base64String: string | null = null;
                  let proofFileType: string | null = null;
                  let proofFileName: string | null = null;

                  if (cofferExpenseProofFile) {
                    base64String = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => {
                        resolve(reader.result as string);
                      };
                      reader.onerror = () => {
                        reject(new Error('Failed to read file'));
                      };
                      reader.readAsDataURL(cofferExpenseProofFile);
                    });
                    proofFileType = cofferExpenseProofFile.type.startsWith('image') ? 'image' : 'pdf';
                    proofFileName = cofferExpenseProofFile.name;
                  }

                  const response = await fetch(
                    `https://${projectId}.supabase.co/functions/v1/super-handler/coffer-expenses`,
                    {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`,
                      },
                      body: JSON.stringify({
                        coffer_id: selectedCofferId,
                        amount: parseFloat(cofferExpenseAmount),
                        reason: cofferExpenseReason,
                        proof_file: base64String,
                        proof_file_type: proofFileType,
                        proof_file_name: proofFileName,
                        payment_date: cofferExpenseDate || null,
                      }),
                    }
                  );

                  if (response.ok) {
                    toast.success('Dépense coffre enregistrée avec succès');
                    setCofferExpenseAmount('');
                    setCofferExpenseReason('');
                    setCofferExpenseProofFile(null);
                    setCofferExpensesDialogOpen(false);
                  } else {
                    const error = await response.json();
                    toast.error(error.error || 'Erreur lors de l\'enregistrement');
                  }
                } catch (error: any) {
                  toast.error(`Erreur: ${error.message}`);
                } finally {
                  setCofferExpenseSubmitting(false);
                }
              }} className="space-y-4">
                {/* Amount */}
                <div className="space-y-2">
                  <Label htmlFor="coffer_expense_amount">Montant (MAD) *</Label>
                  <Input
                    id="coffer_expense_amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={cofferExpenseAmount}
                    onChange={(e) => setCofferExpenseAmount(e.target.value)}
                    required
                  />
                </div>

                {/* Category Search */}
                <div className="space-y-2">
                  <Label htmlFor="coffer_expense_category">Catégorie de Dépense *</Label>
                  <div className="relative">
                    <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2">
                      <Search className="w-4 h-4 text-gray-400" />
                      <Input
                        id="coffer_expense_category"
                        placeholder="Rechercher une catégorie..."
                        value={cofferExpenseCategorySearch}
                        onChange={(e) => {
                          setCofferExpenseCategorySearch(e.target.value);
                          setShowCofferExpenseCategorySuggestions(true);
                        }}
                        onFocus={() => setShowCofferExpenseCategorySuggestions(true)}
                        className="border-0 focus-visible:ring-0 p-0"
                      />
                    </div>
                    
                    {/* Category Suggestions */}
                    {showCofferExpenseCategorySuggestions && (() => {
                      const searchLower = cofferExpenseCategorySearch.toLowerCase();
                      const suggestions = cofferExpenseCategories.filter(cat => 
                        cat.name?.toLowerCase().includes(searchLower) ||
                        cat.description?.toLowerCase().includes(searchLower)
                      );
                      return suggestions.length > 0 ? (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                          {suggestions.map((category) => (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => {
                                setCofferExpenseReason(category.name);
                                setCofferExpenseCategorySearch(category.name);
                                setShowCofferExpenseCategorySuggestions(false);
                              }}
                              className="w-full px-4 py-2 text-left hover:bg-gray-100 border-b border-gray-100 last:border-b-0 transition-colors flex items-center gap-2"
                            >
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: category.color || '#3b82f6' }}
                              />
                              <div className="flex-1">
                                <p className="font-medium text-sm">{category.name}</p>
                                {category.description && (
                                  <p className="text-xs text-gray-600">{category.description}</p>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : null;
                    })()}
                  </div>
                  {cofferExpenseReason && (
                    <p className="text-xs text-green-600">✓ Catégorie sélectionnée: {cofferExpenseReason}</p>
                  )}
                </div>

                {/* Proof File */}
                <div className="space-y-2">
                  <Label htmlFor="coffer_expense_proof">Preuve (PDF ou Image)</Label>
                  <Input
                    id="coffer_expense_proof"
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setCofferExpenseProofFile(e.target.files?.[0] || null)}
                  />
                  {cofferExpenseProofFile && (
                    <p className="text-xs text-gray-600">Fichier sélectionné: {cofferExpenseProofFile.name}</p>
                  )}
                  <p className="text-xs text-gray-500">JPG, PNG ou PDF (Max 10MB) - Optionnel</p>
                </div>

                {/* Date */}
                <div className="space-y-2">
                  <Label htmlFor="coffer_expense_date">Date de la Dépense (optionnel)</Label>
                  <Input
                    id="coffer_expense_date"
                    type="date"
                    value={cofferExpenseDate}
                    onChange={(e) => setCofferExpenseDate(e.target.value)}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCofferExpensesDialogOpen(false);
                      setCofferExpenseAmount('');
                      setCofferExpenseReason('');
                      setCofferExpenseProofFile(null);
                      setCofferExpenseDate('');
                    }}
                  >
                    Annuler
                  </Button>
                  <Button
                    type="submit"
                    disabled={cofferExpenseSubmitting}
                    style={{ backgroundColor: '#f59e0b' }}
                    className="text-white"
                  >
                    {cofferExpenseSubmitting ? 'Enregistrement...' : 'Enregistrer'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {/* Global Payment Button */}
          <Dialog open={globalPaymentDialogOpen} onOpenChange={setGlobalPaymentDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                style={{ backgroundColor: '#16a34a' }} 
                className="text-white"
                disabled={!canSupplierGlobalPayment}
                title={!canSupplierGlobalPayment ? "Vous n'avez pas la permission « Paiement Global Fournisseur (Coffre) »" : undefined}
              >
                <Plus className="w-4 h-4 mr-2" />
                Paiement Global Fournisseur
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
            <DialogTitle>Paiement Global Fournisseur</DialogTitle>
            </DialogHeader>
            <form onSubmit={async (e) => {
            e.preventDefault();
            
            if (!canSupplierGlobalPayment) {
            toast.error("Vous n'avez pas la permission « Paiement Global Fournisseur (Coffre) »");
            return;
            }
            
            // Admin must select magasin for global payment
            if (currentUserRole === 'admin' && !globalPaymentSelectedMagasin) {
            toast.error('Veuillez sélectionner un magasin pour ce paiement');
            return;
            }
            
            if (!selectedPaymentSupplier) {
            toast.error('Veuillez sélectionner un fournisseur');
            return;
            }

                let amount = parseFloat(paymentAmount) || 0;
                let remiseAmount = parseFloat(paymentRemiseAmount) || 0;
                let additionalAmount = parseFloat(additionalPaymentAmount) || 0;

                if (amount <= 0 && additionalAmount <= 0 && remiseAmount <= 0) {
                  toast.error('Veuillez entrer un montant de paiement ou une remise');
                  return;
                }

                if (paymentMethod === 'check' && amount > 0 && !selectedCheck) {
                  toast.error('Veuillez sélectionner un chèque pour la première méthode');
                  return;
                }

                if (additionalPaymentMethod && additionalAmount > 0 && additionalPaymentMethod === 'check' && !selectedAdditionalCheck) {
                  toast.error('Veuillez sélectionner un chèque pour la deuxième méthode');
                  return;
                }

                const supplierPaymentsList = supplierPayments.filter(p => p.supplier_id === selectedPaymentSupplier.id);
                const currentTotalPaid = supplierPaymentsList.reduce((sum, p) => sum + (p.amount || 0), 0);
                const totalInvoiced = selectedPaymentSupplier.balance || 0;
                const supplierDiscount = (discounts || [])
                  .filter((d: any) =>
                    String(d?.status || '').toLowerCase() === 'active' &&
                    String(d?.entity_type || '').toLowerCase() === 'supplier' &&
                    String(d?.entity_id || '') === String(selectedPaymentSupplier.id)
                  )
                  .reduce((s: number, d: any) => s + (Number(d?.discount_amount || 0) || 0), 0);
                const remainingBalance = totalInvoiced - currentTotalPaid - supplierDiscount;
                const totalToApply = amount + remiseAmount;

                if (totalToApply > remainingBalance) {
                  toast.error(`Le montant total (paiement + remise) ne peut pas dépasser le solde restant (${remainingBalance.toFixed(2)} MAD)`);
                  return;
                }

                setGlobalPaymentLoading(true);

                try {
                  if (remiseAmount > 0) {
                    const remiseResponse = await fetch(
                      `https://${projectId}.supabase.co/functions/v1/super-handler/discounts`,
                      {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${session.access_token}`,
                        },
                        body: JSON.stringify({
                          entity_id: selectedPaymentSupplier.id,
                          entity_name: selectedPaymentSupplier.name,
                          entity_type: 'supplier',
                          discount_percentage: 0,
                          discount_amount: remiseAmount,
                          reason: `Remise Faild - Paiement Global`,
                          status: 'active',
                        }),
                      }
                    );

                    if (!remiseResponse.ok) {
                      throw new Error('Erreur lors de l\'application de la remise');
                    }
                  }

                  if (amount > 0) {
                    const paymentResponse = await fetch(
                      `https://${projectId}.supabase.co/functions/v1/super-handler/payments`,
                      {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${session.access_token}`,
                        },
                        body: JSON.stringify({
                        supplier_id: selectedPaymentSupplier.id,
                        amount: amount,
                        payment_method: paymentMethod,
                        payment_date: supplierPaymentDate ? new Date(supplierPaymentDate + 'T12:00:00').toISOString() : new Date().toISOString(),
                        coffer_id: selectedCofferId || 'main',
                        ...(paymentMethod === 'check'
                        ? {
                        check_safe_id: selectedCheck?.id ? String(selectedCheck.id) : null,
                        check_number: selectedCheck?.check_number ? String(selectedCheck.check_number) : undefined,
                        }
                        : {}),
                        reference_number: String(paymentReference || '').trim() || `PAY-${Date.now()}`,
                        notes: `Paiement global pour ${selectedPaymentSupplier.name}`,
                        }),
                      }
                    );

                    if (!paymentResponse.ok) {
                      const errJson = await paymentResponse.json().catch(() => ({} as any));
                      const errMsg = (errJson as any)?.error || (errJson as any)?.message;
                      throw new Error(errMsg || 'Erreur lors de l\'enregistrement du paiement');
                    }
                  }

                  if (additionalAmount > 0) {
                    const additionalPaymentResponse = await fetch(
                      `https://${projectId}.supabase.co/functions/v1/super-handler/payments`,
                      {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${session.access_token}`,
                        },
                        body: JSON.stringify({
                        supplier_id: selectedPaymentSupplier.id,
                        amount: additionalAmount,
                        payment_method: additionalPaymentMethod,
                        payment_date: supplierPaymentDate ? new Date(supplierPaymentDate + 'T12:00:00').toISOString() : new Date().toISOString(),
                        coffer_id: selectedCofferId || 'main',
                        ...(additionalPaymentMethod === 'check'
                        ? {
                        check_safe_id: selectedAdditionalCheck?.id ? String(selectedAdditionalCheck.id) : null,
                        check_number: selectedAdditionalCheck?.check_number ? String(selectedAdditionalCheck.check_number) : undefined,
                        }
                        : {}),
                        reference_number: String(paymentReference || '').trim() || `PAY-${Date.now()}`,
                        notes: `Paiement global (2ème méthode) pour ${selectedPaymentSupplier.name}`,
                        }),
                      }
                    );

                    if (!additionalPaymentResponse.ok) {
                      const errJson = await additionalPaymentResponse.json().catch(() => ({} as any));
                      const errMsg = (errJson as any)?.error || (errJson as any)?.message;
                      throw new Error(errMsg || 'Erreur lors de l\'enregistrement du paiement supplémentaire');
                    }
                  }

                  let successMessage = `Paiement de ${amount.toFixed(2)} MAD enregistré`;
                  if (remiseAmount > 0) {
                    successMessage += ` + Remise de ${remiseAmount.toFixed(2)} MAD`;
                  }
                  if (additionalAmount > 0) {
                    successMessage += ` + ${additionalAmount.toFixed(2)} MAD (${additionalPaymentMethod})`;
                  }
                  successMessage += ` pour ${selectedPaymentSupplier.name}`;
                  
                  toast.success(successMessage);
                  setGlobalPaymentDialogOpen(false);
                  setPaymentSupplierSearch('');
                  setSelectedPaymentSupplier(null);
                  setPaymentAmount('');
                  setPaymentRemiseAmount('');
                  setPaymentReference('');
                  setPaymentMethod('cash');
                  setSelectedCheck(null);
                  setBankProofFile(null);
                  setAdditionalPaymentMethod(null);
                  setAdditionalPaymentAmount('');
                  setSelectedAdditionalCheck(null);
                  setAdditionalBankProofFile(null);
                  setGlobalPaymentSelectedMagasin(null);
                  setSupplierPaymentDate(new Date().toISOString().split('T')[0]);
                  fetchSupplierPayments();
                  fetchDiscountsList();
                  fetchSuppliers();
                  // IMPORTANT: Refresh cheque data so Type changes from Disponible to Utilisé
                  fetchChecksSafe(selectedCofferId);
                  fetchCheckSafeUsages();
                  // IMPORTANT: Refresh Coffre movements so payment appears in the list
                  fetchCofferMovements(selectedCofferId);
                } catch (error: any) {
                  toast.error(`Erreur: ${error.message}`);
                } finally {
                  setGlobalPaymentLoading(false);
                }
              }} className="space-y-4">
                {/* Admin: Select Magasin for Global Payment */}
                {currentUserRole === 'admin' && (
                  <div className="bg-purple-50 p-4 rounded-lg border border-purple-200 space-y-2">
                    <Label className="font-semibold text-purple-900">Magasin pour ce Paiement *</Label>
                    <p className="text-xs text-purple-700 mb-2">
                      Sélectionnez le magasin pour lequel vous effectuez ce paiement global
                    </p>
                    <select
                      value={globalPaymentSelectedMagasin?.id || ''}
                      onChange={(e) => {
                        const selectedStore = stores.find(s => s.id === e.target.value);
                        setGlobalPaymentSelectedMagasin(selectedStore || null);
                      }}
                      className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                      required
                    >
                      <option value="">-- Sélectionner un magasin --</option>
                      {stores.map(store => (
                        <option key={store.id} value={store.id}>{store.name}</option>
                      ))}
                    </select>
                    {globalPaymentSelectedMagasin && (
                      <div className="text-xs text-green-700 font-semibold mt-2">
                        ✓ Magasin sélectionné: {globalPaymentSelectedMagasin.name}
                      </div>
                    )}
                  </div>
                )}

                {/* Supplier Search */}
                <div>
                  <Label className="text-sm font-semibold text-gray-900 mb-2 block">Sélectionner un Fournisseur</Label>
                  <Input
                    placeholder="Tapez le nom du fournisseur..."
                    value={paymentSupplierSearch}
                    onChange={(e) => {
                      setPaymentSupplierSearch(e.target.value);
                      if (e.target.value.trim() === '') {
                        setSelectedPaymentSupplier(null);
                      }
                    }}
                    className="text-sm border-gray-300"
                  />
                  
                  {/* Supplier Suggestions - Filtered by Magasin */}
                  {paymentSupplierSearch.trim() !== '' && !selectedPaymentSupplier && (
                  <div className="border border-gray-200 rounded-lg mt-2 max-h-48 overflow-y-auto">
                  {suppliers
                  .filter(s => {
                    // Filter out passage suppliers (is_passage=true or type='passage')
                    if (s.is_passage || s.type === 'passage') return false;
                    // Admin: Filter by selected magasin
                    if (currentUserRole === 'admin' && globalPaymentSelectedMagasin) {
                    if (String(s.store_id || '') !== String(globalPaymentSelectedMagasin.id)) return false;
                    }
                    // Filter by search term
                    return (
                    s.name?.toLowerCase().includes(paymentSupplierSearch.toLowerCase()) ||
                    s.phone?.includes(paymentSupplierSearch)
                    );
                  })
                  .map(supplier => {
                  const supplierPaymentsList = supplierPayments.filter(p => p.supplier_id === supplier.id);
                  const currentTotalPaid = supplierPaymentsList.reduce((sum, p) => sum + (p.amount || 0), 0);
                  const totalInvoiced = supplier.balance || 0;
                  const supplierDiscount = (discounts || [])
                    .filter((d: any) =>
                      String(d?.status || '').toLowerCase() === 'active' &&
                      String(d?.entity_type || '').toLowerCase() === 'supplier' &&
                      String(d?.entity_id || '') === String(supplier.id)
                    )
                    .reduce((s: number, d: any) => s + (Number(d?.discount_amount || 0) || 0), 0);
                  const remainingBalance = totalInvoiced - currentTotalPaid - supplierDiscount;
                  return (
                  <button
                  key={supplier.id}
                  type="button"
                  onClick={() => {
                  setSelectedPaymentSupplier(supplier);
                  setPaymentSupplierSearch('');
                  }}
                  className="w-full text-left p-2 border-b border-gray-100 hover:bg-gray-50 transition text-sm"
                  >
                  <div className="font-semibold text-gray-900">{supplier.name}</div>
                  <div className="text-xs text-gray-500">
                  Solde: {remainingBalance.toFixed(2)} MAD
                  </div>
                  </button>
                  );
                  })}
                  </div>
                  )}
                </div>

                {/* Selected Supplier Info - Detailed Calculation */}
                {selectedPaymentSupplier && (
                  <div className="pt-3 border-t border-gray-200 bg-blue-50 p-4 rounded-lg space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-gray-700">Fournisseur sélectionné:</span>
                      <span className="text-sm font-bold text-blue-900">{selectedPaymentSupplier.name}</span>
                    </div>

                    {/* Calculation Details */}
                    {(() => {
                      const supplierPaymentsList = supplierPayments.filter(p => p.supplier_id === selectedPaymentSupplier.id);
                      const currentTotalPaid = supplierPaymentsList.reduce((sum, p) => sum + (p.amount || 0), 0);
                      const totalInvoiced = selectedPaymentSupplier.balance || 0;
                      const supplierDiscount = (discounts || [])
                        .filter((d: any) =>
                          String(d?.status || '').toLowerCase() === 'active' &&
                          String(d?.entity_type || '').toLowerCase() === 'supplier' &&
                          String(d?.entity_id || '') === String(selectedPaymentSupplier.id)
                        )
                        .reduce((s: number, d: any) => s + (Number(d?.discount_amount || 0) || 0), 0);
                      const remainingBalance = totalInvoiced - currentTotalPaid - supplierDiscount;
                      const paymentAmt = parseFloat(paymentAmount) || 0;
                      const remiseAmt = parseFloat(paymentRemiseAmount) || 0;
                      const totalToApply = paymentAmt + remiseAmt;
                      const balanceAfterPayment = remainingBalance - totalToApply;

                      return (
                        <>
                          {/* Total Invoiced */}
                          <div className="flex justify-between items-center py-2 border-b border-blue-200">
                            <span className="text-xs text-gray-600">Montant total facturé:</span>
                            <span className="text-sm font-semibold text-gray-900">{totalInvoiced.toFixed(2)} MAD</span>
                          </div>

                          {/* Already Paid */}
                          <div className="flex justify-between items-center py-2 border-b border-blue-200">
                            <span className="text-xs text-gray-600">Déjà payé:</span>
                            <span className="text-sm font-semibold text-green-700">{currentTotalPaid.toFixed(2)} MAD</span>
                          </div>

                          {/* Remaining Balance */}
                          <div className="flex justify-between items-center py-2 border-b border-blue-200 bg-white px-2 rounded">
                            <span className="text-xs font-semibold text-gray-700">Solde restant dû:</span>
                            <span className="text-sm font-bold text-red-600">{remainingBalance.toFixed(2)} MAD</span>
                          </div>

                          {/* Payment Breakdown */}
                          {(paymentAmt > 0 || remiseAmt > 0) && (
                            <>
                              <div className="pt-2 border-t-2 border-blue-300">
                                <p className="text-xs font-semibold text-gray-700 mb-2">Détail du paiement:</p>
                                
                                {paymentAmt > 0 && (
                                  <div className="flex justify-between items-center py-1 ml-2">
                                    <span className="text-xs text-gray-600">Paiement:</span>
                                    <span className="text-sm font-semibold text-blue-700">{paymentAmt.toFixed(2)} MAD</span>
                                  </div>
                                )}

                                {remiseAmt > 0 && (
                                  <div className="flex justify-between items-center py-1 ml-2">
                                    <span className="text-xs text-gray-600">Remise:</span>
                                    <span className="text-sm font-semibold text-orange-600">{remiseAmt.toFixed(2)} MAD</span>
                                  </div>
                                )}

                                {totalToApply > 0 && (
                                  <div className="flex justify-between items-center py-2 ml-2 border-t border-blue-200 mt-1">
                                    <span className="text-xs font-semibold text-gray-700">Total à appliquer:</span>
                                    <span className="text-sm font-bold text-purple-700">{totalToApply.toFixed(2)} MAD</span>
                                  </div>
                                )}
                              </div>

                              {/* Balance After Payment */}
                              <div className="flex justify-between items-center py-2 bg-white px-2 rounded border-2 border-blue-300">
                                <span className="text-xs font-semibold text-gray-700">Solde après paiement:</span>
                                <span className={`text-sm font-bold ${balanceAfterPayment > 0 ? 'text-red-600' : balanceAfterPayment < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                                  {balanceAfterPayment.toFixed(2)} MAD
                                </span>
                              </div>

                              {/* Warning if overpayment */}
                              {balanceAfterPayment < 0 && (
                                <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                                  <p className="text-xs text-yellow-800 font-semibold">
                                    ⚠️ Surpaiement de {Math.abs(balanceAfterPayment).toFixed(2)} MAD
                                  </p>
                                </div>
                              )}

                              {/* Success if exact payment */}
                              {balanceAfterPayment === 0 && totalToApply > 0 && (
                                <div className="bg-green-50 border border-green-200 rounded p-2">
                                  <p className="text-xs text-green-800 font-semibold">
                                    ✓ Paiement exact - Compte soldé
                                  </p>
                                </div>
                              )}
                            </>
                          )}
                        </>
                      );
                    })()}

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPaymentSupplier(null);
                        setPaymentAmount('');
                        setPaymentRemiseAmount('');
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold mt-2"
                    >
                      Changer de fournisseur
                    </button>
                  </div>
                )}

                {/* Payment Amount */}
                <div className="pt-3 border-t border-gray-200">
                  <Label className="text-sm font-semibold text-gray-900 mb-2 block">Montant à Payer (MAD)</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    step="0.01"
                    disabled={!selectedPaymentSupplier}
                    className="text-sm border-gray-300"
                  />
                  {selectedPaymentSupplier && (
                    <p className="text-xs text-gray-500 mt-1">
                      Max: {(() => {
                        const supplierPaymentsList = supplierPayments.filter(p => p.supplier_id === selectedPaymentSupplier.id);
                        const currentTotalPaid = supplierPaymentsList.reduce((sum, p) => sum + (p.amount || 0), 0);
                        const totalInvoiced = selectedPaymentSupplier.balance || 0;
                        const supplierDiscount = (discounts || [])
                          .filter((d: any) =>
                            String(d?.status || '').toLowerCase() === 'active' &&
                            String(d?.entity_type || '').toLowerCase() === 'supplier' &&
                            String(d?.entity_id || '') === String(selectedPaymentSupplier.id)
                          )
                          .reduce((s: number, d: any) => s + (Number(d?.discount_amount || 0) || 0), 0);
                        const remainingBalance = totalInvoiced - currentTotalPaid - supplierDiscount;
                        return remainingBalance.toFixed(2);
                      })()} MAD
                    </p>
                  )}
                </div>

                {/* Remise */}
                <div>
                  <Label className="text-sm font-semibold text-gray-900 mb-2 block">Réf de Paiement (optionnel)</Label>
                  <Input
                    placeholder="Ex: REF-2026-001"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                  />
                  <p className="text-xs text-gray-500 mt-1">Référence interne / banque / reçu.</p>

                  <Label className="text-sm font-semibold text-gray-900 mb-2 block">Remise (MAD)</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={paymentRemiseAmount}
                    onChange={(e) => setPaymentRemiseAmount(e.target.value)}
                    step="0.01"
                    disabled={!selectedPaymentSupplier}
                    className="text-sm border-gray-300"
                  />
                  <p className="text-xs text-gray-500 mt-1">Remise supplémentaire à appliquer</p>
                </div>

                {/* Payment Method */}
                <div>
                  <Label htmlFor="payment_method" className="text-sm font-semibold text-gray-900 mb-2 block">Méthode de Paiement</Label>
                  <select
                    id="payment_method"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'check' | 'bank_transfer')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                  >
                    <option value="cash">Espèces</option>
                    <option value="check">Chèque</option>
                    <option value="bank_transfer">Virement Bancaire</option>
                  </select>
                </div>

                {/* Payment Date Picker */}
                <div>
                  <Label htmlFor="supplier_payment_date" className="text-sm font-semibold text-gray-900 mb-2 block">Date du Paiement</Label>
                  <Input
                    type="date"
                    id="supplier_payment_date"
                    value={supplierPaymentDate}
                    onChange={(e) => setSupplierPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Sélectionnez la date à laquelle le paiement sera enregistré
                  </p>
                </div>

                {/* Check Selection */}
                {paymentMethod === 'check' && (
                  <div className="pt-3 border-t border-gray-200">
                    <Label className="text-sm font-semibold text-gray-900 mb-2 block">Sélectionner un Chèque</Label>
                    <Button
                      type="button"
                      onClick={async () => {
                        setLoadingChecks(true);
                        try {
                          // IMPORTANT:
                          // For supplier payments in Coffre, the cheque MUST come from check_safe.
                          // So we load cheques using /check-safe (not /check-inventory).
                          const cofferId = selectedCofferId || 'main';
                          await fetchChecksSafe(cofferId);
                          setCheckDialogOpen(true);
                        } finally {
                          setLoadingChecks(false);
                        }
                      }}
                      className="w-full text-sm py-2"
                      disabled={loadingChecks}
                    >
                      {loadingChecks ? 'Chargement...' : 'Choisir un Chèque'}
                    </Button>

                    {selectedCheck && (
                      <div className="mt-2 p-2 bg-gray-50 rounded-lg text-sm">
                        <p><span className="font-semibold">Chèque:</span> {selectedCheck.check_id_number}</p>
                        <p><span className="font-semibold">Disponible:</span> {(selectedCheck.remaining_balance || 0).toFixed(2)} MAD</p>
                      </div>
                    )}

                    {/* Check Selection Dialog */}
                    <Dialog open={checkDialogOpen} onOpenChange={setCheckDialogOpen}>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Sélectionner un Chèque</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                              placeholder="Rechercher un chèque..."
                              className="pl-10"
                              value={checkSearchTerm}
                              onChange={(e) => setCheckSearchTerm(e.target.value)}
                            />
                          </div>

                          {checksSafe.length === 0 ? (
                          <div className="text-center py-4 text-gray-500">
                          Aucun chèque disponible
                          </div>
                          ) : (
                          <div className="max-h-64 overflow-y-auto border rounded-lg">
                            {(() => {
                              const term = checkSearchTerm.trim().toLowerCase();

                              if (term.length < 2) {
                                return (
                                  <div className="text-center py-4 text-gray-500">
                                    Commencez à taper pour afficher des suggestions
                                  </div>
                                );
                              }

                              const filtered = checksSafe
                                .filter((check) => {
                                  // Filter out checks that have been fully used
                                  const usageRow = (checkSafeUsages || []).find((u: any) => String(u.check_safe_id) === String(check.id));
                                  const totalUsed = Number(usageRow?.total_used ?? 0) || 0;
                                  const available = Number(check?.amount ?? 0) - totalUsed;
                                  
                                  if (available <= 0) return false;

                                  const checkNumber = resolveChequeNumber(check);
                                  return (
                                    checkNumber.toLowerCase().includes(term) ||
                                    String(check?.giver_name || check?.given_to || '').toLowerCase().includes(term) ||
                                    String(check?.amount ?? '').includes(term)
                                  );
                                })
                                .slice(0, 6);

                              if (filtered.length === 0) {
                                return (
                                  <div className="text-center py-4 text-gray-500">
                                    Aucun résultat
                                  </div>
                                );
                              }

                              return filtered.map((check) => {
                                const usageRow = (checkSafeUsages || []).find((u: any) => String(u.check_safe_id) === String(check.id));
                                const totalUsed = Number(usageRow?.total_used ?? 0) || 0;
                                const original = Number(check?.amount ?? 0) || 0;
                                const remaining = original - totalUsed;
                                const checkNumber = resolveChequeNumber(check);

                                return (
                                  <button
                                    key={check.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedCheck(check);

                                      // Auto-fill payment amount from selected check remaining balance
                                      setPaymentAmount(remaining > 0 ? String(remaining) : '');

                                      setCheckDialogOpen(false);
                                      setCheckSearchTerm('');
                                      toast.success(`Chèque ${checkNumber} sélectionné`);
                                    }}
                                    className="w-full text-left p-3 border-b hover:bg-blue-50 transition"
                                  >
                                    <div className="font-semibold text-sm">{checkNumber}</div>
                                    <div className="text-xs text-gray-600">
                                      <div>Montant: {original.toFixed(2)} MAD</div>
                                      <div>Utilisé: {totalUsed.toFixed(2)} MAD • Reste: {remaining.toFixed(2)} MAD</div>
                                    </div>
                                  </button>
                                );
                              });
                              })()}
                              </div>
                              )}

                          <Button
                            type="button"
                            onClick={() => setCheckDialogOpen(false)}
                            variant="outline"
                            className="w-full"
                          >
                            Fermer
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}

                {/* Bank Transfer */}
                {paymentMethod === 'bank_transfer' && (
                  <div className="pt-3 border-t border-gray-200">
                    <Label htmlFor="bank_proof" className="text-sm font-semibold text-gray-900 mb-2 block">Preuve de Virement</Label>
                    <Input
                      id="bank_proof"
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setBankProofFile(e.target.files?.[0] || null)}
                      className="cursor-pointer text-sm border-gray-300"
                    />
                    {bankProofFile && (
                      <p className="text-xs text-gray-500 mt-1">Fichier: {bankProofFile.name}</p>
                    )}
                  </div>
                )}

                {/* Add Second Payment Method */}
                {!additionalPaymentMethod && (
                  <Button
                    type="button"
                    onClick={() => setAdditionalPaymentMethod('cash')}
                    variant="outline"
                    className="w-full text-sm py-2 text-blue-600 border-blue-300"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter une Deuxième Méthode
                  </Button>
                )}

                {/* Additional Payment Method */}
                {additionalPaymentMethod && (
                  <div className="pt-3 border-t border-gray-200 space-y-3">
                    <div className="flex justify-between items-center">
                      <h3 className="font-semibold text-sm text-gray-900">Deuxième Méthode de Paiement</h3>
                      <button
                        type="button"
                        onClick={() => {
                          setAdditionalPaymentMethod(null);
                          setAdditionalPaymentAmount('');
                          setSelectedAdditionalCheck(null);
                        }}
                        className="text-xs text-red-600 hover:text-red-800 font-semibold"
                      >
                        Supprimer
                      </button>
                    </div>

                    <div>
                      <Label htmlFor="additional_payment_method" className="text-sm font-semibold text-gray-900 mb-2 block">Type de Paiement</Label>
                      <select
                        id="additional_payment_method"
                        value={additionalPaymentMethod}
                        onChange={(e) => setAdditionalPaymentMethod(e.target.value as 'cash' | 'check' | 'bank_transfer')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                      >
                        <option value="cash">Espèces</option>
                        <option value="check">Chèque</option>
                        <option value="bank_transfer">Virement Bancaire</option>
                      </select>
                    </div>

                    <div>
                      <Label htmlFor="additional_payment_amount" className="text-sm font-semibold text-gray-900 mb-2 block">Montant (MAD)</Label>
                      <Input
                        id="additional_payment_amount"
                        type="number"
                        placeholder="0.00"
                        value={additionalPaymentAmount}
                        onChange={(e) => setAdditionalPaymentAmount(e.target.value)}
                        step="0.01"
                        min="0"
                        disabled={!selectedPaymentSupplier}
                        className="text-sm border-gray-300"
                      />
                    </div>

                    {additionalPaymentMethod === 'check' && (
                      <div>
                        <Button
                          type="button"
                          onClick={async () => {
                            setLoadingChecks(true);
                            try {
                              const storeIdToFilter = advanceUserRole === 'admin'
                                ? (advanceFilterStore !== 'all' ? advanceFilterStore : null)
                                : (advanceCurrentStoreId ? String(advanceCurrentStoreId) : null);

                              const params = new URLSearchParams();
                              if (storeIdToFilter) {
                                params.append('store_id', storeIdToFilter);
                              }

                              const response = await fetch(
                                `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory?${params.toString()}`,
                                {
                                  headers: {
                                    'Authorization': `Bearer ${session.access_token}`,
                                  },
                                }
                              );
                              if (response.ok) {
                                const data = await response.json();

                                // Use the same normalization as CheckInventoryModule so search/pickers see the same data
                                const normalized = (data.check_inventory || []).map((c: any) => ({
                                  ...c,
                                  due_date: c.due_date ?? c.execution_date ?? c.date_echeance ?? null,
                                  check_date: c.check_date ?? c.date_emission ?? c.check_emission_date ?? c.created_at ?? null,
                                }));

                                setChecks(normalized);
                                setCheckDialogOpenAdditional(true);
                              }
                            } finally {
                              setLoadingChecks(false);
                            }
                          }}
                          className="w-full text-sm py-2"
                          disabled={loadingChecks}
                        >
                          {loadingChecks ? 'Chargement...' : 'Sélectionner Chèque'}
                        </Button>
                        {selectedAdditionalCheck && (
                          <div className="mt-2 p-2 bg-gray-50 rounded-lg text-xs">
                            <p><span className="font-semibold">Chèque:</span> {selectedAdditionalCheck.check_id_number}</p>
                            <p>
                            <span className="font-semibold">Disponible:</span>{' '}
                            {(Number((selectedAdditionalCheck as any).remaining_balance ?? (selectedAdditionalCheck as any).amount_value ?? 0) || 0).toFixed(2)} MAD
                            </p>
                          </div>
                        )}

                        {/* Additional Check Selection Dialog */}
                        <Dialog
                        open={checkDialogOpenAdditional}
                        onOpenChange={(open) => {
                        setCheckDialogOpenAdditional(open);
                        if (!open) setCheckSearchTermAdditional('');
                        }}
                        >
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle>Sélectionner un Chèque</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-3">
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <Input
                                  placeholder="Tapez pour rechercher (min 2 caractères)..."
                                  className="pl-10"
                                  value={checkSearchTermAdditional}
                                  onChange={(e) => setCheckSearchTermAdditional(e.target.value)}
                                />
                              </div>

                              {checks.length === 0 ? (
                                <div className="text-center py-4 text-gray-500">
                                  Aucun chèque disponible
                                </div>
                              ) : (
                              <div className="max-h-64 overflow-y-auto border rounded-lg">
                              {(() => {
                              const filtered = checks.filter((check) => {
                              const st = String(check.status || '').toLowerCase();
                              if (st === 'used' || st === 'archived') return false;
                              
                              const available =
                              Number(
                              (check as any).remaining_balance ?? (check as any).amount_value ?? 0
                              ) || 0;
                              if (available <= 0) return false;
                              
                              const term = checkSearchTermAdditional.trim().toLowerCase();
                              if (term.length < 2) {
                                return (
                                  <div className="text-center py-4 text-gray-500">
                                    Commencez à taper pour afficher des suggestions
                                  </div>
                                );
                              }
                              
                              return (
                              check.check_id_number?.toLowerCase().includes(term) ||
                              check.given_to?.toLowerCase().includes(term) ||
                              check.amount_value?.toString().includes(term) ||
                              String((check as any).original_amount ?? '').includes(term) ||
                              String((check as any).remaining_balance ?? '').includes(term)
                              );
                              });
                              
                              if (filtered.length === 0) {
                              return (
                              <div className="text-center py-4 text-gray-500">
                              Aucun résultat
                              </div>
                              );
                              }
                              
                              return (
                              <>
                              {filtered.slice(0, 6).map((check) => (
                              <button
                              key={check.id}
                              type="button"
                              onClick={() => {
                              setSelectedAdditionalCheck(check);
                              setCheckDialogOpenAdditional(false);
                              setCheckSearchTermAdditional('');
                              toast.success(`Chèque ${check.check_id_number} sélectionné`);
                              }}
                              className="w-full text-left p-3 border-b hover:bg-blue-50 transition"
                              >
                              <div className="font-semibold text-sm">{check.check_id_number}</div>
                              <div className="text-xs text-gray-600">
                              Disponible: {(check.remaining_balance || 0).toFixed(2)} MAD
                              </div>
                              </button>
                              ))}
                              </>
                              );
                              })()}
                              </div>
                              )}

                              <Button
                                type="button"
                                onClick={() => setCheckDialogOpenAdditional(false)}
                                variant="outline"
                                className="w-full"
                              >
                                Fermer
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    )}

                    {additionalPaymentMethod === 'bank_transfer' && (
                      <div>
                        <Label htmlFor="additional_bank_proof" className="text-sm font-semibold text-gray-900 mb-2 block">Preuve de Virement</Label>
                        <Input
                          id="additional_bank_proof"
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => setAdditionalBankProofFile(e.target.files?.[0] || null)}
                          className="cursor-pointer text-sm border-gray-300"
                        />
                        {additionalBankProofFile && (
                          <p className="text-xs text-gray-500 mt-1">Fichier: {additionalBankProofFile.name}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Total Summary */}
                {additionalPaymentMethod && (
                  <div className="pt-3 border-t border-gray-200">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-gray-600">Total Paiement:</span>
                      <span className="text-lg font-bold text-green-600">
                        {(parseFloat(paymentAmount || '0') + parseFloat(additionalPaymentAmount || '0')).toFixed(2)} MAD
                      </span>
                    </div>
                    {selectedPaymentSupplier && (
                      <div className="flex justify-between items-center text-xs text-gray-600">
                        <span>Solde Restant:</span>
                        <span className="font-semibold">{(() => {
                          const supplierPaymentsList = supplierPayments.filter(p => p.supplier_id === selectedPaymentSupplier.id);
                          const currentTotalPaid = supplierPaymentsList.reduce((sum, p) => sum + (p.amount || 0), 0);
                          const totalInvoiced = selectedPaymentSupplier.balance || 0;
                          const supplierDiscount = (discounts || [])
                            .filter((d: any) =>
                              String(d?.status || '').toLowerCase() === 'active' &&
                              String(d?.entity_type || '').toLowerCase() === 'supplier' &&
                              String(d?.entity_id || '') === String(selectedPaymentSupplier.id)
                            )
                            .reduce((s: number, d: any) => s + (Number(d?.discount_amount || 0) || 0), 0);
                          const remainingBalance = totalInvoiced - currentTotalPaid - supplierDiscount;
                          return remainingBalance.toFixed(2);
                        })()} MAD</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setGlobalPaymentDialogOpen(false);
                      setSelectedPaymentSupplier(null);
                      setPaymentAmount('');
                      setPaymentSupplierSearch('');
                      setPaymentRemiseAmount('');
                      setPaymentMethod('cash');
                      setSelectedCheck(null);
                      setBankProofFile(null);
                      setAdditionalPaymentMethod(null);
                      setAdditionalPaymentAmount('');
                      setSelectedAdditionalCheck(null);
                      setAdditionalBankProofFile(null);
                      setSupplierPaymentDate(new Date().toISOString().split('T')[0]);
                    }}
                    className="text-sm"
                  >
                    Annuler
                  </Button>
                  <Button
                    type="submit"
                    disabled={globalPaymentLoading || !selectedPaymentSupplier}
                    style={{ backgroundColor: '#10b981', color: 'white' }}
                    className="text-sm"
                  >
                    {globalPaymentLoading ? 'Enregistrement...' : 'Enregistrer'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* View Switcher */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={activeView === 'movements' ? 'default' : 'outline'}
              onClick={() => setActiveView('movements')}
              className={activeView === 'movements' ? '' : 'bg-white'}
            >
              Mouvements du Coffre
            </Button>
            <Button
              type="button"
              variant={activeView === 'checks' ? 'default' : 'outline'}
              onClick={() => setActiveView('checks')}
              className={activeView === 'checks' ? '' : 'bg-white'}
            >
              Coffre-fort des Chèques
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filters Section (collapsible) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Filtres
            </CardTitle>
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
        </CardHeader>
        {showFilters && (
          <CardContent>
          {/* Base filters (always visible in filters panel) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
          <Label htmlFor="search">Recherche</Label>
          <Input
          id="search"
          placeholder="Numéro de chèque, magasin..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          />
          </div>
          
          <div className="space-y-2">
          <Label htmlFor="filter-status">Statut</Label>
          <select
          id="filter-status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="w-full px-3 py-2 border rounded-md bg-white"
          >
          <option value="all">Tous les statuts</option>
          <option value="pending">En attente</option>
          <option value="verified">Vérifié</option>
          <option value="confirmed">Confirmé</option>
          <option value="in_safe">En coffre-fort</option>
          <option value="transferred">Transféré</option>
          </select>
          </div>
          
          <div className="space-y-2">
          <Label htmlFor="filter-store">Magasin</Label>
          <select
          id="filter-store"
          value={filterStore}
          onChange={(e) => setFilterStore(e.target.value)}
          className="w-full px-3 py-2 border rounded-md bg-white"
          >
          <option value="all">Tous les magasins</option>
          {stores.map((store) => (
          <option key={store.id} value={store.id}>
          {store.name}
          </option>
          ))}
          </select>
          </div>
          </div>
          
          {/* Movements date filters (only relevant for movements view) */}
          {activeView === 'movements' && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
          <Label>Du (mouvements)</Label>
          <Input
          type="date"
          value={cofferMovementsDateFrom}
          onChange={(e) => {
          setCofferMovementsDateFrom(e.target.value);
          setTimeout(() => fetchCofferMovements(selectedCofferId), 0);
          }}
          />
          </div>
          
          <div className="space-y-2">
          <Label>Au (mouvements)</Label>
          <Input
          type="date"
          value={cofferMovementsDateTo}
          onChange={(e) => {
          setCofferMovementsDateTo(e.target.value);
          setTimeout(() => fetchCofferMovements(selectedCofferId), 0);
          }}
          />
          </div>
          </div>
          )}
          
          {/* Filtres avancés (chèque) - alignés avec Inventaire des Chèques */}
          {activeView === 'checks' && (
          <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
          <Label>Date du chèque (Du)</Label>
          <Input type="date" value={filterCheckDateFrom} onChange={(e) => setFilterCheckDateFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
          <Label>Date du chèque (Au)</Label>
          <Input type="date" value={filterCheckDateTo} onChange={(e) => setFilterCheckDateTo(e.target.value)} />
          </div>
          <div className="space-y-2">
          <Label>Échéance (Du)</Label>
          <Input type="date" value={filterDueDateFrom} onChange={(e) => setFilterDueDateFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
          <Label>Échéance (Au)</Label>
          <Input type="date" value={filterDueDateTo} onChange={(e) => setFilterDueDateTo(e.target.value)} />
          </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
          <Label>Confirmé (Du)</Label>
          <Input type="date" value={filterConfirmedDateFrom} onChange={(e) => setFilterConfirmedDateFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
          <Label>Confirmé (Au)</Label>
          <Input type="date" value={filterConfirmedDateTo} onChange={(e) => setFilterConfirmedDateTo(e.target.value)} />
          </div>
          <div className="space-y-2">
          <Label>Transféré (Du)</Label>
          <Input type="date" value={filterTransferredDateFrom} onChange={(e) => setFilterTransferredDateFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
          <Label>Transféré (Au)</Label>
          <Input type="date" value={filterTransferredDateTo} onChange={(e) => setFilterTransferredDateTo(e.target.value)} />
          </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
          <Label>Montant (Min)</Label>
          <Input type="number" step="0.01" value={filterAmountFrom} onChange={(e) => setFilterAmountFrom(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-2">
          <Label>Montant (Max)</Label>
          <Input type="number" step="0.01" value={filterAmountTo} onChange={(e) => setFilterAmountTo(e.target.value)} placeholder="0.00" />
          </div>
          </div>
          </div>
          )}
          
          <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="text-gray-700"
                onClick={() => {
                  setSearchTerm('');
                  setFilterStatus('all');
                  setFilterStore('all');
                  setCofferMovementsDateFrom('');
                  setCofferMovementsDateTo('');
                  
                  // reset checks advanced filters
                  setFilterCheckDateFrom('');
                  setFilterCheckDateTo('');
                  setFilterDueDateFrom('');
                  setFilterDueDateTo('');
                  setFilterConfirmedDateFrom('');
                  setFilterConfirmedDateTo('');
                  setFilterTransferredDateFrom('');
                  setFilterTransferredDateTo('');
                  setFilterAmountFrom('');
                  setFilterAmountTo('');
                  
                  if (activeView === 'movements') setTimeout(() => fetchCofferMovements(selectedCofferId), 0);
                  }}
              >
                Réinitialiser les filtres
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {activeView === 'movements' && (
      /* Coffer Movements (Deposits / Expenses) */
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Mouvements du Coffre
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cofferMovementsLoading ? (
            <div className="text-center py-6 text-gray-500">Chargement...</div>
          ) : cofferMovements.length === 0 ? (
            <div className="text-center py-6 text-gray-500">Aucun mouvement pour ce coffre</div>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Motif</TableHead>
                    <TableHead>Référence</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cofferMovements.map((m: any) => {
                    const type = normalizeMovementType(m.expense_type);
                    const isDeposit = isDepositType(type);
                    return (
                      <TableRow key={m.id} className="hover:bg-gray-50">
                        <TableCell className="text-sm">
                          {m.payment_date || m.created_at
                            ? new Date(m.payment_date || m.created_at).toLocaleString('fr-FR')
                            : '-'}
                        </TableCell>
                        <TableCell className="text-sm">
                          <Badge className={isDeposit ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                            {m.expense_type || (isDeposit ? 'deposit' : 'expense')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{m.reason || '-'}</TableCell>
                        <TableCell className="text-sm">{m.notes || '-'}</TableCell>
                        <TableCell className={`text-right font-semibold ${isDeposit ? 'text-green-600' : 'text-red-600'}`}>
                          {isDeposit ? '+' : '-'}{Number(m.amount || 0).toFixed(2)} MAD
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

      {activeView === 'checks' && (
      /* Main Checks Safe Table - Bank Style */
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Coffre-fort des Chèques - Gestion Bancaire
              </CardTitle>
              {/* Status Summary */}
              <div className="flex gap-4 mt-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                  <span>En attente: <span className="font-semibold">{filteredChecksSafe.filter(cs => cs.status === 'pending').length}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span>Vérifié: <span className="font-semibold">{filteredChecksSafe.filter(cs => cs.status === 'verified').length}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                  <span>Confirmé: <span className="font-semibold">{filteredChecksSafe.filter(cs => cs.status === 'confirmed').length}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span>En coffre: <span className="font-semibold">{filteredChecksSafe.filter(cs => cs.status === 'in_safe').length}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-600"></div>
                  <span>Transféré: <span className="font-semibold">{filteredChecksSafe.filter(cs => cs.status === 'transferred').length}</span></span>
                </div>
              </div>
            </div>
            {selectedChecks.size > 0 && (() => {
              const selectedChecksList = Array.from(selectedChecks.keys()).map(id => checksSafe.find(cs => cs.id === id));
              const firstStatus = selectedChecksList[0]?.status;
              const allSameStatus = selectedChecksList.every(cs => cs?.status === firstStatus);
              
              let nextStatus = '';
              let buttonLabel = '';
              let buttonColor = '';
              
              if (allSameStatus) {
                switch (firstStatus) {
                  case 'pending':
                    nextStatus = 'confirmed';
                    buttonLabel = 'Confirmer';
                    buttonColor = '#a855f7';
                    break;
                  case 'confirmed':
                    nextStatus = 'transferred';
                    buttonLabel = 'Transférer';
                    buttonColor = '#059669';
                    break;
                  default:
                    return null;
                }
              } else {
                return null;
              }
              
              return (
                <Button
                  style={{ display: 'none' }}
                  disabled
                  className="text-white hover:opacity-90"
                  onClick={async () => {
                    const checkIds = Array.from(selectedChecks.keys());
                    for (const checkId of checkIds) {
                      await updateCheckSafeStatus(checkId, nextStatus);
                    }
                  }}
                >
                  {buttonLabel} ({selectedChecks.size})
                </Button>
              );
            })()}
              
              {selectedChecks.size > 0 && (
                <Dialog open={bulkTransferPaymentDialogOpen} onOpenChange={setBulkTransferPaymentDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      style={{ backgroundColor: '#059669', color: '#ffffff' }}
                      className="text-white font-semibold hover:opacity-90"
                      disabled={!canEditCoffreEntry}
                      title={!canEditCoffreEntry ? "Vous n'avez pas la permission « Modifier une Entrée Coffre »" : undefined}
                    >
                      Transférer le paiement ({selectedChecks.size})
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Transférer le paiement - Chèques en masse</DialogTitle>
                    </DialogHeader>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        bulkTransferPayment();
                      }}
                      className="space-y-4"
                    >
                      {/* Summary */}
                      <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                        <p className="text-xs text-emerald-600 font-semibold">Résumé</p>
                        <p className="text-sm font-bold text-emerald-900">{selectedChecks.size} chèque(s) sélectionné(s)</p>
                        <p className="text-xs text-emerald-600 mt-1">
                          Montant total: {Array.from(selectedChecks.keys()).reduce((sum, id) => {
                            const check = filteredChecksSafe.find(c => c.id === id);
                            return sum + (check?.amount || 0);
                          }, 0).toFixed(2)} MAD
                        </p>
                      </div>

                      {/* Transfer Note */}
                      <div className="space-y-2">
                        <Label htmlFor="bulk_transfer_note">Transféré vers (optionnel)</Label>
                        <Input
                          id="bulk_transfer_note"
                          placeholder="Ex: Attijari, Banque Populaire, Paiement fournisseur..."
                          value={bulkTransferPaymentNote}
                          onChange={(e) => setBulkTransferPaymentNote(e.target.value)}
                        />
                        <p className="text-xs text-gray-500">Cette note sera appliquée à tous les chèques sélectionnés</p>
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setBulkTransferPaymentDialogOpen(false)}
                          disabled={bulkTransferPaymentSubmitting}
                        >
                          Annuler
                        </Button>
                        <Button
                          type="submit"
                          disabled={bulkTransferPaymentSubmitting || selectedChecks.size === 0}
                          style={{ backgroundColor: '#059669', color: '#ffffff' }}
                          className="text-white hover:opacity-90 font-semibold"
                        >
                          {bulkTransferPaymentSubmitting ? 'Transfert...' : 'Transférer'}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedChecks.size === filteredChecksSafe.filter(cs => cs.status !== 'transferred').length && filteredChecksSafe.filter(cs => cs.status !== 'transferred').length > 0}
                        onCheckedChange={() => {
                          const newSelected = new Map(selectedChecks);
                          const pendingChecks = filteredChecksSafe.filter(cs => cs.status !== 'transferred');
                          if (newSelected.size === pendingChecks.length) {
                            newSelected.clear();
                          } else {
                            pendingChecks.forEach(check => {
                              newSelected.set(check.id, true);
                            });
                          }
                          setSelectedChecks(newSelected);
                        }}
                      />
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleChecksSort('check_number')}
                        className="inline-flex items-center gap-2 font-semibold hover:underline"
                        title="Trier"
                      >
                        N° Chèque <span className="text-xs opacity-70">{getSortIndicator(sortChecksConfig as any, 'check_number')}</span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleChecksSort('giver')}
                        className="inline-flex items-center gap-2 font-semibold hover:underline"
                        title="Trier"
                      >
                        Donneur <span className="text-xs opacity-70">{getSortIndicator(sortChecksConfig as any, 'giver')}</span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleChecksSort('amount')}
                        className="inline-flex items-center gap-2 font-semibold hover:underline"
                        title="Trier"
                      >
                        Montant <span className="text-xs opacity-70">{getSortIndicator(sortChecksConfig as any, 'amount')}</span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleChecksSort('usage_type')}
                        className="inline-flex items-center gap-2 font-semibold hover:underline"
                        title="Trier"
                      >
                        Type <span className="text-xs opacity-70">{getSortIndicator(sortChecksConfig as any, 'usage_type')}</span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleChecksSort('magasin')}
                        className="inline-flex items-center gap-2 font-semibold hover:underline"
                        title="Trier"
                      >
                        Magasin <span className="text-xs opacity-70">{getSortIndicator(sortChecksConfig as any, 'magasin')}</span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleChecksSort('sale')}
                        className="inline-flex items-center gap-2 font-semibold hover:underline"
                        title="Trier"
                      >
                        Vente <span className="text-xs opacity-70">{getSortIndicator(sortChecksConfig as any, 'sale')}</span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleChecksSort('check_date')}
                        className="inline-flex items-center gap-2 font-semibold hover:underline"
                        title="Trier"
                      >
                        Date du chèque <span className="text-xs opacity-70">{getSortIndicator(sortChecksConfig as any, 'check_date')}</span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        className="flex items-center gap-1 hover:underline"
                        onClick={() => toggleChecksSort('inventory_due_date')}
                        type="button"
                      >
                        Échéance <span className="text-xs opacity-70">{getSortIndicator(sortChecksConfig as any, 'inventory_due_date')}</span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleChecksSort('status')}
                        className="inline-flex items-center gap-2 font-semibold hover:underline"
                        title="Trier"
                      >
                        Statut <span className="text-xs opacity-70">{getSortIndicator(sortChecksConfig as any, 'status')}</span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleChecksSort('confirmed_at')}
                        className="inline-flex items-center gap-2 font-semibold hover:underline"
                        title="Trier"
                      >
                        Confirmé le <span className="text-xs opacity-70">{getSortIndicator(sortChecksConfig as any, 'confirmed_at')}</span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleChecksSort('transferred_at')}
                        className="inline-flex items-center gap-2 font-semibold hover:underline"
                        title="Trier"
                      >
                        Transféré le <span className="text-xs opacity-70">{getSortIndicator(sortChecksConfig as any, 'transferred_at')}</span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleChecksSort('notes')}
                        className="inline-flex items-center gap-2 font-semibold hover:underline"
                        title="Trier"
                      >
                        Notes <span className="text-xs opacity-70">{getSortIndicator(sortChecksConfig as any, 'notes')}</span>
                      </button>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredChecksSafe.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center text-gray-500 py-8">
                        Aucun chèque dans le coffre-fort
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedChecksSafe.map((cs) => (
                      <TableRow key={cs.id} className="hover:bg-gray-50">
                        <TableCell>
                          <Checkbox
                            checked={selectedChecks.get(cs.id) || false}
                            onCheckedChange={() => {
                              const newSelected = new Map(selectedChecks);
                              if (newSelected.get(cs.id)) {
                                newSelected.delete(cs.id);
                              } else {
                                newSelected.set(cs.id, true);
                              }
                              setSelectedChecks(newSelected);
                            }}
                            disabled={cs.status === 'transferred'}
                          />
                        </TableCell>
                        <TableCell className="font-medium font-mono">{cs.check_number}</TableCell>
                        <TableCell className="text-sm">{cs.given_to || cs.giver_name || '-'}</TableCell>
                        <TableCell className="font-semibold text-green-600">{cs.amount?.toFixed(2)} MAD</TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-2">
                            {(() => {
                              // Calculate check usage from backend stats
                              const usageRow = (checkSafeUsages || []).find((u: any) => String(u.check_safe_id) === String(cs.id));
                              const usedMad = Number(usageRow?.total_used ?? 0) || 0;
                              const remainingMad = Number(usageRow?.remaining ?? 0);
                              const checkAmount = Number(usageRow?.check_amount ?? cs.amount ?? 0) || 0;
                              
                              // Fallback if API didn't return a row yet
                              // Prefer backend "remaining" when available; otherwise derive remaining from total_used.
                              const safeRemaining = Number.isFinite(remainingMad)
                              ? remainingMad
                              : Math.max(0, checkAmount - usedMad);
                              
                              const isFullyUsed = checkAmount > 0
                              ? safeRemaining <= 0.000001
                              : usedMad > 0;
                              const isPartlyUsed = checkAmount > 0
                              ? (safeRemaining > 0.000001 && safeRemaining < checkAmount - 0.000001)
                              : usedMad > 0;
                              
                              if (isFullyUsed) {
                              return (
                              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 border border-green-300">
                              <span className="text-xs font-semibold text-green-800">✓ Utilisé</span>
                              </div>
                              );
                              } else if (isPartlyUsed) {
                              return (
                              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-orange-100 border border-orange-300">
                              <span className="text-xs font-semibold text-orange-800">⊘ Partiellement (Reste: {safeRemaining.toFixed(2)} MAD)</span>
                              </div>
                              );
                              }
                              
                              return (
                              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 border border-blue-300">
                              <span className="text-xs font-semibold text-blue-800">Disponible</span>
                              </div>
                              );
                            })()}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{getUserStoreLabel(cs)}</TableCell>
                        <TableCell className="text-sm">{cs.sale_id ? getSaleInfo(cs.sale_id) : '-'}</TableCell>
                        <TableCell className="text-sm">
                          {(() => {
                            const d = (cs as any)?.check_date || (cs as any)?.due_date || (cs as any)?.execution_date;
                            return d ? new Date(d).toLocaleDateString('fr-FR') : '-';
                          })()}
                        </TableCell>
                        <TableCell className="text-sm">
                          {(() => {
                            const d = (cs as any)?.inventory_due_date || (cs as any)?.due_date || (cs as any)?.execution_date;
                            return d ? new Date(d).toLocaleDateString('fr-FR') : '-';
                          })()}
                        </TableCell>
                        <TableCell>
                        <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                        cs.status === 'pending' ? 'bg-gray-400' :
                        cs.status === 'verified' ? 'bg-blue-500' :
                        cs.status === 'confirmed' ? 'bg-purple-500' :
                        cs.status === 'in_safe' ? 'bg-green-500' :
                        cs.status === 'transferred' ? 'bg-emerald-600' :
                        'bg-gray-300'
                        }`}></div>
                        <Badge className={getStatusColor(cs.status)}>
                        {getStatusLabel(cs.status)}
                        </Badge>
                        </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {cs.confirmed_at ? new Date(cs.confirmed_at).toLocaleDateString('fr-FR') : '-'}
                        </TableCell>
                        <TableCell className="text-sm">
                        {cs.payment_transferred_at ? new Date(cs.payment_transferred_at).toLocaleDateString('fr-FR') : '-'}
                        </TableCell>
                        <TableCell
                        className="text-sm max-w-[260px] truncate"
                        title={cleanNotesForDisplay(cs?.inventory_notes ?? cs?.notes ?? '')}
                        >
                        {cleanNotesForDisplay(cs?.inventory_notes ?? cs?.notes ?? '').trim() || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {/* Details Button */}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedCheckSafe(cs);
                                setDetailsDialogOpen(true);
                              }}
                              title="Voir les détails"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>

                            {/* Status Transition Buttons */}
                            {cs.status === 'pending' && (
                              <Button
                                size="sm"
                                style={{ backgroundColor: '#a855f7' }}
                                className="text-white hover:opacity-90"
                                onClick={() => updateCheckSafeStatus(cs.id, 'confirmed')}
                              >
                                Confirmer
                              </Button>
                            )}
                            {cs.status === 'confirmed' && (
                              <Button
                                size="sm"
                                style={{ backgroundColor: '#059669' }}
                                className="text-white hover:opacity-90"
                                onClick={() => updateCheckSafeStatus(cs.id, 'transferred', { payment_transferred_note: cs.payment_transferred_note || null })}
                              >
                                Transférer
                              </Button>
                            )}

                            {/* Delete Button */}
                            {cs.status === 'pending' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 hover:bg-red-50"
                                onClick={() => deleteCheckSafe(cs.id)}
                                title="Supprimer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}

                            {/* Payment Transferred Badge */}
                            {cs.payment_transferred && (
                              <Badge className="bg-green-100 text-green-800 text-xs">
                                ✓ Paiement Transféré{cs?.payment_transferred_note ? ` (${cs.payment_transferred_note})` : ''}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Détails du Chèque - {selectedCheckSafe?.check_number}</DialogTitle>
          </DialogHeader>
          {selectedCheckSafe && (
            <div className="space-y-6">
              {/* Check Information */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <p className="text-xs text-blue-600 font-semibold mb-1">Numéro de Chèque</p>
                  <p className="text-lg font-bold text-blue-900 font-mono">{selectedCheckSafe.check_number}</p>
                </div>

                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <p className="text-xs text-green-600 font-semibold mb-1">Montant</p>
                  <p className="text-lg font-bold text-green-900">{selectedCheckSafe.amount?.toFixed(2)} MAD</p>
                </div>

                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                  <p className="text-xs text-purple-600 font-semibold mb-1">Magasin Assigné</p>
                  <p className="text-lg font-bold text-purple-900">{getUserStoreLabel(selectedCheckSafe)}</p>
                </div>

                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                  <p className="text-xs text-orange-600 font-semibold mb-1">Vente Liée</p>
                  <p className="text-lg font-bold text-orange-900">{selectedCheckSafe.sale_id ? getSaleInfo(selectedCheckSafe.sale_id) : 'Aucune'}</p>
                </div>

                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                  <p className="text-xs text-indigo-600 font-semibold mb-1">Crée par</p>
                  <p className="text-lg font-bold text-indigo-900">
                    {selectedCheckSafe.created_by_user?.full_name || selectedCheckSafe.created_by_user?.email || selectedCheckSafe.created_by || session?.user?.email || 'N/A'}
                  </p>
                  <p className="text-xs text-indigo-600 mt-1">
                    {selectedCheckSafe.created_by_user?.email || session?.user?.email || 'Email non disponible'}
                  </p>
                </div>

                <div className="bg-cyan-50 p-4 rounded-lg border border-cyan-200">
                  <p className="text-xs text-cyan-600 font-semibold mb-1">Rôle</p>
                  <p className="text-lg font-bold text-cyan-900 capitalize">{selectedCheckSafe.created_by_user?.role || 'admin'}</p>
                </div>

                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                <p className="text-xs text-indigo-600 font-semibold mb-1">Nom du Client</p>
                <p className="text-lg font-bold text-indigo-900">
                {selectedCheckSafe.sale_id
                ? (sales.find(s => s.id === selectedCheckSafe.sale_id)?.client_name || 'Client inconnu')
                : 'Pas de vente liée'
                }
                </p>
                </div>
              </div>

              {/* Status Timeline */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <p className="text-sm font-semibold text-gray-700 mb-3">Historique du Statut</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Statut Actuel:</span>
                    <Badge className={getStatusColor(selectedCheckSafe.status)}>
                      {getStatusLabel(selectedCheckSafe.status)}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Vérifié le:</span>
                    <span className="font-mono">{selectedCheckSafe.verified_at ? new Date(selectedCheckSafe.verified_at).toLocaleString('fr-FR') : '-'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Confirmé le:</span>
                    <span className="font-mono">{selectedCheckSafe.confirmed_at ? new Date(selectedCheckSafe.confirmed_at).toLocaleString('fr-FR') : '-'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">En Coffre le:</span>
                    <span className="font-mono">{selectedCheckSafe.placed_in_safe_at ? new Date(selectedCheckSafe.placed_in_safe_at).toLocaleString('fr-FR') : '-'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Transféré le:</span>
                    <span className="font-mono">{selectedCheckSafe.payment_transferred_at ? new Date(selectedCheckSafe.payment_transferred_at).toLocaleString('fr-FR') : '-'}</span>
                  </div>
                </div>
              </div>

              {/* Payment Status */}
              {selectedCheckSafe.payment_transferred && (
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <p className="text-sm font-semibold text-green-700 mb-2">
                    ✓ Paiement Transféré{selectedCheckSafe?.payment_transferred_note ? ` (${selectedCheckSafe.payment_transferred_note})` : ''}
                  </p>
                  <p className="text-xs text-green-600">
                    Le paiement de {selectedCheckSafe.amount?.toFixed(2)} MAD a été automatiquement transféré au magasin {getStoreInfo(selectedCheckSafe.store_id)}.
                  </p>
                </div>
              )}

              {/* Verification Notes */}
              {selectedCheckSafe.verification_notes && (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <p className="text-sm font-semibold text-blue-700 mb-2">Notes de Vérification</p>
                  <p className="text-sm text-blue-600">{selectedCheckSafe.verification_notes}</p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => setDetailsDialogOpen(false)}
                  style={{ backgroundColor: '#d1d5db' }}
                  className="text-gray-800 hover:opacity-90"
                >
                  Fermer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bank Safe Info Card */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-800 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Coffre-fort Bancaire - Gestion des Chèques
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-blue-700 space-y-3">
            <p className="font-semibold">Workflow de Confirmation Bancaire:</p>
            <ol className="list-decimal list-inside space-y-2 ml-2">
              <li><strong>Réception:</strong> Les chèques sont transférés depuis l'inventaire des magasins</li>
              <li><strong>Vérification:</strong> L'admin vérifie les détails et l'authenticité du chèque</li>
              <li><strong>Confirmation:</strong> L'admin confirme que le chèque est valide et peut être traité</li>
              <li><strong>Placement en Coffre:</strong> Le chèque est placé en sécurité dans le coffre-fort</li>
              <li><strong>Transfert de Paiement:</strong> Le paiement est automatiquement transféré au magasin</li>
            </ol>
            <div className="mt-4 p-3 bg-blue-100 rounded-lg border border-blue-300">
              <p className="text-sm italic text-blue-800">
                💡 <strong>Remarque:</strong> Une fois le chèque placé en coffre-fort, le statut de paiement de la vente associée est automatiquement mis à jour à "Payé" et le paiement est transféré au magasin.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
