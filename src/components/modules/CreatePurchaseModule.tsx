import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Plus, Trash2, X, Upload, DollarSign, CreditCard, FileText, Check, AlertCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { projectId } from '../../utils/supabase/info';
import { toast } from 'sonner';

interface StoreInfo {
  id?: string;
  name: string;
}

interface PurchaseItem {
  id: string;
  description: string;
  reference: string;
  // Keep as string for better typing UX (supports "", "1.", "0,5")
  quantity: string;
  unitPrice: number;
  subtotal: number;
  // Keep as string for better typing UX
  caisse: string;
  moyenne: string;
  product_id?: string;
  stock_reference?: string;
  fourchette_min?: number;
  fourchette_max?: number;
  category?: string;
  lot?: string;
}

// NOTE: Payment UX must match "Bon de Commande" / sales payment process.
// This means:
// - main payment method (cash/check/bank_transfer)
// - optional additional payment methods
// - full check chooser + create-check upload flow
// (Do not revert to single-method-only; BonCommande supports multi payments.)
interface PurchaseData {
  store: StoreInfo;
  items: PurchaseItem[];
  notes: string;
  type: 'transfer' | 'purchase';

  // Other charges (counted in total)
  otherCharges?: number;

  // BonCommande-like payment fields
  paymentMethod: 'cash' | 'check' | 'bank_transfer';
  status: 'Payée' | 'Non Payée' | 'Partiellement payée';
  amountPaid?: number;
  bankTransferProofFile?: File | null;

  // Cheque selection/creation
  selectedCheckId?: string;

  // Additional payment methods (same concept as BonCommande)
  additionalPayments?: { [key: string]: number };
}

interface StoreOption {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  ice?: string;
}

interface CheckInventoryItem {
  id: string;
  check_id_number: string;
  amount_value: number;
  remaining_balance?: number;
  status: string;
  given_to?: string;
}

export default function CreatePurchaseModule({ 
  session, 
  onBack, 
  purchaseType = 'purchase',
  adminSelectedMagasinId 
}: { 
  session: any; 
  onBack?: () => void; 
  purchaseType?: 'transfer' | 'purchase';
  adminSelectedMagasinId?: string | null;
}) {
  const [currentUserRole, setCurrentUserRole] = useState<string>('user');
  const [currentUserPermissions, setCurrentUserPermissions] = useState<string[]>([]);
  const isAdmin = currentUserRole === 'admin';
  const adminHasSelectedStore = !!adminSelectedMagasinId;

  const hasPermission = (perm: string) => {
    if (isAdmin) return true;
    return currentUserPermissions.includes(perm);
  };

  // For admin users:
  // - adminSelectedMagasinId is the magasin selected from dashboard ("act as")
  // - In TRANSFER flow, this is the SOURCE store (where stock is taken from)
  // - Destination store is chosen in the "Magasin Destinataire" select
  // For non-admin:
  // - Destination is the user's own store
  const destinationStoreId = isAdmin
    ? (purchaseType === 'transfer' ? null : adminSelectedMagasinId)
    : null;

  const [stores, setStores] = useState<StoreOption[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [productTemplates, setProductTemplates] = useState<any[]>([]);
  const [filteredProductsByRow, setFilteredProductsByRow] = useState<Record<string, any[]>>({});
  const [showProductSuggestions, setShowProductSuggestions] = useState<{ [key: string]: boolean }>({});
  const [activeSuggestFieldByRow, setActiveSuggestFieldByRow] = useState<Record<string, 'description' | 'reference'>>({});
  const [debounceTimers, setDebounceTimers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [currentUserStoreId, setCurrentUserStoreId] = useState<string | null>(null);
  const [checks, setChecks] = useState<CheckInventoryItem[]>([]);
  const [loadingChecks, setLoadingChecks] = useState(false);
  const [checkDialogOpen, setCheckDialogOpen] = useState(false);
  const [selectedCheck, setSelectedCheck] = useState<CheckInventoryItem | null>(null);
  const [createCheckDialogOpen, setCreateCheckDialogOpen] = useState(false);
  const [checkSearchQuery, setCheckSearchQuery] = useState('');

  // Create-check upload (copied from BonCommande flow)
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCheckId, setUploadCheckId] = useState('');
  const [uploadAmount, setUploadAmount] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadGiverName, setUploadGiverName] = useState('');
  const [uploadCheckDate, setUploadCheckDate] = useState('');
  const [uploadExecutionDate, setUploadExecutionDate] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);

  const [bankProofFile, setBankProofFile] = useState<File | null>(null);

  // Additional payment methods (same as BonCommande)
  const [additionalPayments, setAdditionalPayments] = useState<{ [key: string]: number }>({});
  const [currentAdditionalPaymentType, setCurrentAdditionalPaymentType] = useState<'cash' | 'check' | 'bank_transfer' | null>(null);
  const [additionalSelectedCheck, setAdditionalSelectedCheck] = useState<CheckInventoryItem | null>(null);
  const [additionalBankProofFile, setAdditionalBankProofFile] = useState<File | null>(null);
  const [additionalPaymentDialogOpen, setAdditionalPaymentDialogOpen] = useState(false);

  const [purchaseData, setPurchaseData] = useState<PurchaseData>({
    store: {
      name: '',
    },
    items: [],
    notes: '',
    type: purchaseType,

    otherCharges: 0,

    paymentMethod: 'cash',
    status: 'Non Payée',
    amountPaid: 0,
    bankTransferProofFile: null,
    selectedCheckId: '',
    additionalPayments: {},
  });

  // Track store ids explicitly (source vs destination)
  // - For admin transfer: source is the dashboard-selected magasin
  // - For others: source is selected in UI
  const [sourceStoreId, setSourceStoreId] = useState<string | null>(adminSelectedMagasinId || null);
  const [destinationStoreIdState, setDestinationStoreIdState] = useState<string | null>(
    isAdmin
      ? (purchaseType === 'transfer' ? null : adminSelectedMagasinId || null)
      : null
  );

  const fetchStores = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/stores?all=true`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const sortedStores = (data.stores || []).sort((a: any, b: any) => a.name.localeCompare(b.name));
        setStores(sortedStores);
      }
    } catch (error) {
      console.error('Error fetching stores:', error);
      toast.error('Erreur lors du chargement des magasins');
    }
  };

  const fetchProductsAndTemplates = async () => {
    try {
      // Product suggestions in TRANSFER must come from the SOURCE store (where stock is taken from).
      // - Admin transfer: source = adminSelectedMagasinId (dashboard "act as")
      // - Non-admin transfer: source = purchaseData.store.id (selected in UI)
      // - Purchase flow: source = adminSelectedMagasinId (admin) or purchaseData.store.id (non-admin)
      const sourceIdCandidate =
        (purchaseType === 'transfer' && isAdmin)
          ? (adminSelectedMagasinId || null)
          : (purchaseData?.store?.id || adminSelectedMagasinId || null);

      const effectiveSourceStoreId = sourceIdCandidate ? String(sourceIdCandidate) : (currentUserStoreId ? String(currentUserStoreId) : null);
      const storeQuery = effectiveSourceStoreId ? `?store_id=${encodeURIComponent(effectiveSourceStoreId)}` : '';

      const [productsRes, templatesRes] = await Promise.all([
        fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/products${storeQuery}`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        ),
        fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/product-templates`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        ),
      ]);

      if (templatesRes.ok) {
        const tData = await templatesRes.json().catch(() => null);
        setProductTemplates(tData?.templates || []);
      }

      if (productsRes.ok) {
        const data = await productsRes.json();
        const storeProducts = data.products || [];

        setAllProducts(storeProducts);
        setProducts(storeProducts);

        // Make sure stock UI reads from the correct source store.
        if (effectiveSourceStoreId) setSourceStoreId(effectiveSourceStoreId);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Erreur lors du chargement des produits');
    }
  };

  const normalizeRefKey = (v: any): string => String(v ?? '').trim().toLowerCase();

  const templateByReference = new Map(
    (productTemplates || []).map((t: any) => {
      const ref = normalizeRefKey(t?.reference_number ?? t?.reference ?? '');
      return [ref, t];
    })
  );

  const getTemplateForProduct = (p: any) => {
    const refKey = normalizeRefKey(p?.reference ?? p?.stock_reference ?? '');
    return (refKey ? templateByReference.get(refKey) : null) || null;
  };

  const fetchChecks = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const availableChecks = (data.check_inventory || []).filter((check: any) => 
          check.status === 'pending' || check.status === 'partly_used'
        );
        setChecks(availableChecks);
      }
    } catch (error) {
      console.error('Error fetching checks:', error);
    }
  };

  useEffect(() => {
    fetchStores();
    fetchProductsAndTemplates();
    fetchChecks();
    // Intentionally include store selection dependencies so suggestions refresh when source changes.
  }, [adminSelectedMagasinId, currentUserStoreId, purchaseType, isAdmin, purchaseData?.store?.id]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/users`, {
          headers: { 'Authorization': `Bearer ${session?.access_token}` },
        });
        if (res.ok) {
          const payload = await res.json();
          const me = (payload?.users || []).find((u: any) => u.id === session?.user?.id);
          if (me?.role) setCurrentUserRole(me.role);
          if (Array.isArray(me?.permissions)) setCurrentUserPermissions(me.permissions);
        }
      } catch (e) {
        console.error('[CreatePurchaseModule] failed to load permissions', e);
      }
    })();
  }, [session?.access_token, session?.user?.id]);

  // Apply destination store automatically:
  // - Admin purchase: destination is the dashboard-selected magasin
  // - Non-admin: destination is the user's store
  useEffect(() => {
    if (isAdmin) {
      if (purchaseType === 'purchase' && adminSelectedMagasinId) {
        setCurrentUserStoreId((prev) => (prev === adminSelectedMagasinId ? prev : adminSelectedMagasinId));
        setDestinationStoreIdState((prev) => (prev === adminSelectedMagasinId ? prev : adminSelectedMagasinId));
      }
      return;
    }
  }, [isAdmin, purchaseType, adminSelectedMagasinId]);

  // Close suggestion list on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowProductSuggestions({});
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Close suggestion list when clicking outside
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      // Any click inside the dropdown or the description input should not close.
      if (target?.closest?.('[data-product-suggest-container="true"]')) return;
      setShowProductSuggestions({});
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const handleStoreSelect = (store: StoreOption, isSourceStore: boolean = true) => {
    if (isSourceStore) {
      // SOURCE store selection
      setPurchaseData(prev => ({
        ...prev,
        store: {
          id: store.id || '',
          name: store.name || '',
        },
        items: [],
      }));

      setSourceStoreId(store?.id ? String(store.id) : null);

      // Load products for the selected SOURCE store.
      if (store?.id) {
        (async () => {
          try {
            const res = await fetch(
              `https://${projectId}.supabase.co/functions/v1/super-handler/products?store_id=${encodeURIComponent(String(store.id))}`,
              { headers: { 'Authorization': `Bearer ${session.access_token}` } }
            );
            if (res.ok) {
              const data = await res.json().catch(() => null);
              const list = data?.products || [];
              setAllProducts(list);
              setProducts(list);
            }
          } catch (e) {
            console.warn('[CreatePurchaseModule] failed to load products for source store:', e);
          }
        })();
      }
      return;
    }

    // DESTINATION store selection (TRANSFER admin flow)
    setDestinationStoreIdState(store?.id ? String(store.id) : null);
  };

  const parseDecimal = (v: string): number | null => {
    const s = String(v ?? '').trim();
    if (!s) return null;
    // support French comma
    const normalized = s.replace(',', '.');
    // Allow unfinished numbers like "1." while typing
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  };

  const computeMoyenne = (quantityStr: string, caisseStr: string): number | null => {
    const q = parseDecimal(quantityStr);
    const c = parseDecimal(caisseStr);
    if (q === null || c === null || c <= 0) return null;
    return Number((q / c).toFixed(2));
  };

  const isMoyenneInFourchette = (m: number, min?: number, max?: number): boolean => {
    if (min !== undefined && min !== 0 && m < min) return false;
    if (max !== undefined && max !== 0 && m > max) return false;
    return true;
  };

  const handleItemChange = (id: string, field: keyof PurchaseItem, value: string | number): void => {
    setPurchaseData(prev => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.id !== id) return item;

        const updated: PurchaseItem = { ...(item as any), [field]: value };

        // Quantité supports decimals
        if (field === 'quantity') {
          const qNum = parseDecimal(String(value));
          if (qNum !== null) {
            updated.quantity = String(qNum);
          }
        }

        // Recompute subtotal using parsed quantity (string) and unitPrice
        if (field === 'quantity' || field === 'unitPrice') {
          const q = parseDecimal(String(updated.quantity)) || 0;
          const price = Number(updated.unitPrice) || 0;
          updated.subtotal = q * price;
        }

        return updated;
      }),
    }));
  };

  const addItem = (): void => {
    const newItem: PurchaseItem = {
      id: Date.now().toString(),
      description: '',
      reference: '',
      quantity: '',
      unitPrice: 0,
      subtotal: 0,
      caisse: '',
      moyenne: '',
    };
    setPurchaseData({
      ...purchaseData,
      items: [...purchaseData.items, newItem],
    });
  };

  const removeItem = (id: string): void => {
    setPurchaseData({
      ...purchaseData,
      items: purchaseData.items.filter((item) => item.id !== id),
    });
  };

  const calculateTotals = (): { subtotal: number; total: number } => {
    const subtotal = purchaseData.items.reduce((sum, item) => sum + item.subtotal, 0);
    const otherCharges = Number((purchaseData as any).otherCharges) || 0;
    const total = subtotal + Math.max(0, otherCharges);
    return { subtotal, total };
  };

  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleUploadCheck = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!uploadFile) {
      toast.error('Veuillez sélectionner un fichier');
      return;
    }

    if (!uploadCheckId) {
      toast.error("Veuillez entrer l'ID du chèque");
      return;
    }

    if (!uploadAmount) {
      toast.error('Veuillez entrer le montant');
      return;
    }

    const amountValue = parseFloat(uploadAmount);
    if (isNaN(amountValue) || amountValue <= 0) {
      toast.error('Le montant doit être un nombre valide et positif');
      return;
    }

    setUploadLoading(true);

    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', uploadFile);
      formDataUpload.append('check_id_number', uploadCheckId);
      formDataUpload.append('amount_value', amountValue.toString());
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
        toast.success('Chèque uploadé avec succès');
        setCreateCheckDialogOpen(false);
        setUploadFile(null);
        setUploadCheckId('');
        setUploadAmount('');
        setUploadNotes('');
        setUploadGiverName('');
        setUploadCheckDate('');
        setUploadExecutionDate('');

        // Reload checks and auto-select latest
        try {
          const checksResponse = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory`,
            {
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
              },
            }
          );
          if (checksResponse.ok) {
            const data = await checksResponse.json();
            const checkInventory = data.check_inventory || [];
            setChecks(checkInventory);

            if (checkInventory.length > 0) {
              const newCheck = checkInventory[0];
              setSelectedCheck(newCheck);
              setPurchaseData(prev => ({ ...prev, selectedCheckId: newCheck.id }));
              toast.success(`Chèque ${newCheck.check_id_number} sélectionné automatiquement`);
            }
          }
        } catch (error) {
          console.error('Error reloading checks:', error);
        }
      } else {
        const errorText = await response.text();
        try {
          const error = JSON.parse(errorText);
          toast.error(error.error || "Erreur lors de l'upload");
        } catch {
          toast.error(`Erreur lors de l'upload: ${response.status}`);
        }
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setUploadLoading(false);
    }
  };

  const handleConfirm = async () => {
    const canCreatePurchase = hasPermission('Créer un Achat/Transfert');
    if (!canCreatePurchase) {
      // No permission: hard block silently (no UI noise)
      return;
    }
    const hasSelectedStore = Boolean(
      // Non-admin flow: user must select a source store
      purchaseData.store.id || purchaseData.store.name ||
      // Admin flow: store is selected globally from dashboard
      (isAdmin && adminHasSelectedStore)
    );
    if (!hasSelectedStore) {
      toast.error('Veuillez sélectionner un magasin vendeur');
      return;
    }

    const hasValidLineItem = purchaseData.items.some((it) => {
      const q = parseDecimal(String(it.quantity));
      return q !== null && q > 0;
    });

    if (!hasValidLineItem) {
      toast.error('Veuillez saisir une quantité > 0 pour au moins un article');
      return;
    }

    const totals = calculateTotals();

    // BonCommande-like: amount paid depends on chosen method + additional payments
    const mainPaid = (purchaseData.paymentMethod === 'cash' || purchaseData.paymentMethod === 'bank_transfer')
      ? (Number(purchaseData.amountPaid) || 0)
      : (purchaseData.paymentMethod === 'check'
        ? (selectedCheck?.remaining_balance ?? selectedCheck?.amount_value ?? 0)
        : 0);

    const additionalPaid = Object.values(purchaseData.additionalPayments || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);

    const totalPaid = mainPaid + additionalPaid;

    // Allow unpaid purchases - no validation needed

    setLoading(true);

    try {
      const saleNumber = purchaseData.type === 'transfer' 
        ? `TRANSFER-${Date.now()}` 
        : `PURCHASE-${Date.now()}`;

      // Prepare payment methods data for storage (BonCommande-like, but still stored as payment_methods array)
      const paymentMethodsData = await (async () => {
        const methods: any[] = [];

        const maybeUploadBankProof = async (file: File | null) => {
          if (!file) return undefined;
          const formData = new FormData();
          formData.append('file', file);

          const uploadResponse = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/uploads/bank-transfer-proof`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: formData,
            }
          );

          if (uploadResponse.ok) {
            const uploadData = await uploadResponse.json();
            return uploadData.url as string | undefined;
          }
          return undefined;
        };

        // Main method
        if (purchaseData.paymentMethod === 'cash') {
          methods.push({ type: 'cash', amount: Number(purchaseData.amountPaid) || 0 });
        } else if (purchaseData.paymentMethod === 'check') {
          if (selectedCheck) {
            methods.push({
              type: 'check',
              amount: (selectedCheck.remaining_balance ?? selectedCheck.amount_value ?? 0),
              checkId: selectedCheck.id,
              checkData: {
                check_id_number: selectedCheck.check_id_number,
                amount_value: selectedCheck.amount_value,
                remaining_balance: selectedCheck.remaining_balance,
              },
            });
          }
        } else if (purchaseData.paymentMethod === 'bank_transfer') {
          const proofUrl = await maybeUploadBankProof(purchaseData.bankTransferProofFile || null);
          methods.push({ type: 'bank_transfer', amount: Number(purchaseData.amountPaid) || 0, proofUrl });
        }

        // Additional methods
        const additional = purchaseData.additionalPayments || {};
        for (const [method, amount] of Object.entries(additional)) {
          if (!amount || amount <= 0) continue;
          if (method === 'cash') {
            methods.push({ type: 'cash', amount });
          } else if (method === 'check') {
            if (additionalSelectedCheck) {
              methods.push({
                type: 'check',
                amount,
                checkId: additionalSelectedCheck.id,
                checkData: {
                  check_id_number: additionalSelectedCheck.check_id_number,
                  amount_value: additionalSelectedCheck.amount_value,
                  remaining_balance: additionalSelectedCheck.remaining_balance,
                },
              });
            }
          } else if (method === 'bank_transfer') {
            const proofUrl = await maybeUploadBankProof(additionalBankProofFile);
            methods.push({ type: 'bank_transfer', amount, proofUrl });
          }
        }

        return methods;
      })();

      // Create sale record
      // Determine payment status (BonCommande-like)
      let paymentStatus = 'unpaid';
      if (totalPaid >= totals.total && totals.total > 0) {
        paymentStatus = 'paid';
      } else if (totalPaid > 0) {
        paymentStatus = 'partial';
      }

      const computedSourceStoreId = isAdmin && purchaseData.type === 'transfer'
        ? (adminSelectedMagasinId ? String(adminSelectedMagasinId) : null)
        : (purchaseData.store.id ? String(purchaseData.store.id) : null);

      const computedDestinationStoreId = isAdmin && purchaseData.type === 'transfer'
        ? (destinationStoreIdState ? String(destinationStoreIdState) : null)
        : String(destinationStoreId || currentUserStoreId || '');

      const salePayload = {
        sale_number: saleNumber,
        // Destination store (the magasin that receives the purchase/transfer)
        store_id: computedDestinationStoreId || null,
        // Source store (the selling magasin)
        source_store_id: computedSourceStoreId || null,
        total_amount: totals.total,
        amount_paid: totalPaid,
        payment_status: paymentStatus,
        delivery_status: 'in_transit',
        notes: purchaseData.notes || `${purchaseData.type === 'transfer' ? 'Transfert' : 'Achat'} de ${purchaseData.store.name}`,
        // keep a single main payment method for details pages
        payment_method: purchaseData.paymentMethod,
        payment_methods: paymentMethodsData,
        // Persist charges so they show in details pages (SalesDetailsPage reads from sale.*)
        other_charges: Math.max(0, Number((purchaseData as any).otherCharges) || 0),
        // ALSO send items in the sales payload (JSONB) so old reads still work
        items: purchaseData.items.map((item) => ({
          id: item.product_id || null,
          name: item.description,
          quantity: parseDecimal(item.quantity) || 0,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          caisse: item.caisse,
          moyenne: item.moyenne,
          reference: item.stock_reference || item.reference || null,
          category: item.category || null,
          lot: item.lot || null,
          fourchette_min: item.fourchette_min ?? null,
          fourchette_max: item.fourchette_max ?? null,
        })),
      };

      const saleResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/sales`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(salePayload),
        }
      );

      if (!saleResponse.ok) {
        const error = await saleResponse.json();
        toast.error(error.error || 'Erreur lors de la création de la commande');
        setLoading(false);
        return;
      }

      const saleData = await saleResponse.json();
      const saleId = saleData.sale?.id;

      if (!saleId) {
        toast.error('Erreur: ID de vente non reçu');
        setLoading(false);
        return;
      }

      // Create sale items
      const saleItems = purchaseData.items.map(item => ({
        sale_id: saleId,
        product_id: item.product_id || null,
        // IMPORTANT: for purchases/transfers, the real movement is often stored in `caisse`.
        // We still keep `quantity` for compatibility, but we also persist caisse/moyenne/fourchette.
        quantity: parseDecimal(item.quantity) || 0,
        caisse: item.caisse,
        moyenne: item.moyenne,
        fourchette_min: item.fourchette_min,
        fourchette_max: item.fourchette_max,
        lot: item.lot,
        category: item.category || '',
        unit_price: item.unitPrice,
        total_price: item.subtotal,
        subtotal: item.subtotal,
        name: item.description,
        reference: item.stock_reference || item.reference,
      }));

      const itemsResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/sales/${saleId}/items`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ items: saleItems }),
        }
      );

      if (!itemsResponse.ok) {
        console.warn('Warning: Could not create sale items');
      }

      // Calculate total amount purchased early (needed for admin supplier invoice)
      const totalAmountPurchased = purchaseData.items.reduce((sum, item) => sum + item.subtotal, 0);

      // If source is "Fournisseur Admin", create an admin_supplier_invoices record
      // This makes the transfer appear in the "Fournisseur Admin (Total Facture)" page
      const sourceStore = stores.find(s => String(s.id) === String(computedSourceStoreId));
      const isAdminSupplierSource = sourceStore && String(sourceStore.name || '').toLowerCase().includes('caisse admin');

      if (isAdminSupplierSource && computedDestinationStoreId) {
        try {
          // Fetch the admin user ID from the suppliers table
          // The "Fournisseur Admin" supplier has admin_user_id set
          const suppliersResponse = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/suppliers`,
            {
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
              },
            }
          );

          if (suppliersResponse.ok) {
            const suppliersData = await suppliersResponse.json();
            // Find the admin supplier by looking for one with admin_user_id set
            const adminSupplier = (suppliersData.suppliers || []).find((s: any) => 
              s.admin_user_id && String(s.name || '').toLowerCase().includes('fournisseur admin')
            );

            if (adminSupplier?.admin_user_id) {
              // Create admin supplier invoice with the correct admin_user_id
              const invoiceResponse = await fetch(
                `https://${projectId}.supabase.co/functions/v1/super-handler/admin-supplier-invoices`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                  },
                  body: JSON.stringify({
                    admin_user_id: adminSupplier.admin_user_id,
                    store_id: computedDestinationStoreId,
                    total_amount: totalAmountPurchased,
                    notes: `Transfert depuis Fournisseur Admin - ${saleNumber}`,
                  }),
                }
              );

              if (!invoiceResponse.ok) {
                const errorData = await invoiceResponse.json();
                console.warn('Warning: Could not create admin supplier invoice for transfer', errorData);
              } else {
                console.log('Admin supplier invoice created successfully for transfer');
              }
            } else {
              console.warn('No admin supplier found with admin_user_id');
            }
          }
        } catch (error) {
          console.error('Error creating admin supplier invoice:', error);
        }
      }

      // Stock updates are handled securely on the backend (super-handler /sales POST).
      // The frontend must never update store_stocks directly.

      // Create products from purchased items (for Achats Directs)
      // Only create products for items that don't already have a product_id
      const newProductsToCreate = purchaseData.items
        .filter(item => !item.product_id && item.description) // Only new products
        .map(item => {
          // Use caisse as the primary stock quantity (this is what the Products page displays)
          const stockQuantity = item.caisse ? parseDecimal(item.caisse) : (parseDecimal(item.quantity) || 0);
          
          return {
            name: item.description,
            reference: item.stock_reference || item.reference || '',
            store_id: destinationStoreId || currentUserStoreId,
            // quantity_available drives store_stocks creation in backend
            quantity_available: stockQuantity,
            sale_price: item.unitPrice,
            purchase_price: item.unitPrice,
            category: item.category || '',
            lot: item.lot || '',
            fourchette_min: item.fourchette_min || 0,
            fourchette_max: item.fourchette_max || 0,
            // number_of_boxes is the "caisse" display field on Products page
            number_of_boxes: stockQuantity,
            // avg_net_weight_per_box is the moyenne
            avg_net_weight_per_box: item.moyenne ? parseDecimal(item.moyenne) : 0,
            created_by: session?.user?.id,
          };
        });

      // Create products if there are any new ones
      if (newProductsToCreate.length > 0) {
        try {
          const productsResponse = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/products`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ products: newProductsToCreate }),
            }
          );

          if (productsResponse.ok) {
            const totalAmountAdded = newProductsToCreate.reduce((sum, product) => sum + (product.quantity_available * product.sale_price), 0);
            toast.success(`✅ ${newProductsToCreate.length} produit(s) ajouté(s) à votre inventaire!\n💰 Montant total: ${totalAmountAdded.toFixed(2)} MAD`);
          } else {
            console.warn('Warning: Could not create products from purchase items');
          }
        } catch (error) {
          console.error('Error creating products:', error);
        }
      }

      const srcName = String(purchaseData.store?.name || '').trim() || '—';
      const dstName = String(stores.find(s => String(s.id) === String(computedDestinationStoreId))?.name || '').trim() || '—';

      if (purchaseData.type === 'transfer') {
        toast.success(
          `📦 Transfert créé\n` +
          `💰 Montant: ${totalAmountPurchased.toFixed(2)} MAD\n` +
          `➡️ De: ${srcName}  →  Vers: ${dstName}\n` +
          `📌 Le Fournisseur Admin doit ${totalAmountPurchased.toFixed(2)} MAD à ${dstName}.`
        );
      } else {
        toast.success(
          `🛒 Achat créé\n` +
          `💰 Montant: ${totalAmountPurchased.toFixed(2)} MAD\n` +
          `🏪 Magasin vendeur: ${srcName}\n` +
          `📌 Ce montant s’ajoute à vos achats (dette envers le vendeur si non payé).`
        );
      }
      
      if (onBack) {
        onBack();
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const totals = calculateTotals();

  // Button should be enabled only when required fields are set.
  // - Store: either selected by user, or pre-selected for admin from dashboard.
  // - Items: at least one item with a valid numeric quantity (> 0).
  const hasSelectedStore = Boolean(
    purchaseData.store.id || purchaseData.store.name || (isAdmin && adminHasSelectedStore)
  );
  const hasValidLineItem = purchaseData.items.some((it) => {
    const q = parseDecimal(String(it.quantity));
    return q !== null && q > 0;
  });

  // BonCommande-like totals (main + additional)
  const computedMainPaid = (purchaseData.paymentMethod === 'cash' || purchaseData.paymentMethod === 'bank_transfer')
    ? (Number(purchaseData.amountPaid) || 0)
    : (purchaseData.paymentMethod === 'check'
      ? (selectedCheck?.remaining_balance ?? selectedCheck?.amount_value ?? 0)
      : 0);

  const computedAdditionalPaid = Object.values(purchaseData.additionalPayments || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);

  const totalPaid = computedMainPaid + computedAdditionalPaid;
  const remainingAmount = Math.max(0, totals.total - totalPaid);

  // Permissions for this page (merged Achats/Transferts)
  // NOTE: permission string must match UsersModule.tsx exactly.
  // Users page uses: "Voir Achats/Transferts" (plural)
  const canViewPurchases = hasPermission('Voir Achats/Transferts');
  const canCreatePurchase = hasPermission('Créer un Achat/Transfert');

  if (!canViewPurchases) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 mx-auto text-red-500 mb-2" />
          <p className="text-lg font-semibold">Accès refusé</p>
          <p className="text-sm text-gray-600">Vous n'avez pas la permission de voir cette page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-row justify-between items-center mb-8 w-full gap-4">
        <h1 className="text-3xl font-bold text-gray-900 flex-1">
          {purchaseData.type === 'transfer' ? '📦 Créer un Transfert' : '🛒 Créer un Achat'}
        </h1>
        <div className="flex gap-2">
          <Button 
            onClick={onBack}
            size="lg"
            variant="outline"
            className="border-gray-300"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Admin gate: must select a magasin before creating Purchase/Transfer */}
      {isAdmin && !adminHasSelectedStore && (
        <Card>
          <CardHeader>
            <CardTitle>Magasin requis</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700">
              Vous êtes connecté en tant qu'admin. Pour créer un achat / transfert, veuillez d'abord sélectionner un magasin
              ("Agir en tant que magasin") depuis le tableau de bord.
            </p>
          </CardContent>
        </Card>
      )}

      <div className={(isAdmin && !adminHasSelectedStore) || !canCreatePurchase ? 'pointer-events-none opacity-50' : ''}>

      <div className="grid grid-cols-1 gap-6">
        {/* Store Selection */}
        <Card>
          <CardHeader>
            <CardTitle>
              {purchaseData.type === 'transfer' ? 'Magasins du Transfert' : 'Magasin Vendeur'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {purchaseData.type === 'transfer' && (
              <>
                {/* For admin: the pre-selected store from dashboard is the SOURCE */}
                {isAdmin && adminHasSelectedStore ? (
                  <>
                    <div>
                      <Label>Magasin Source (D'où provient le transfert)</Label>
                      <select
                        value={stores.find(s => s.id === adminSelectedMagasinId)?.name || ''}
                        onChange={(e) => {
                          // Locked for admin - cannot change
                        }}
                        disabled={true}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">-- Magasin sélectionné depuis le tableau de bord --</option>
                        {stores.map((store) => (
                          <option key={store.id} value={store.name}>
                            {store.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <Label>Magasin Destinataire (Où va le transfert)</Label>
                      <select
                        value={destinationStoreIdState ? (stores.find(s => s.id === destinationStoreIdState)?.name || '') : ''}
                        onChange={(e) => {
                          const selectedStore = stores.find(s => s.name === e.target.value);
                          if (selectedStore) {
                            handleStoreSelect(selectedStore, false);
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">-- Sélectionner le magasin destinataire --</option>
                        {stores.map((store) => (
                          <option key={store.id} value={store.name}>
                            {store.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {destinationStoreIdState && (
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                        <p className="text-sm text-blue-700">
                          ✓ Magasin Source: <strong>{stores.find(s => s.id === adminSelectedMagasinId)?.name || '—'}</strong>
                        </p>
                        <p className="text-sm text-blue-700 mt-1">
                          ✓ Magasin Destinataire: <strong>{stores.find(s => s.id === destinationStoreIdState)?.name || '—'}</strong>
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <Label>Magasin Source (D'où provient le transfert)</Label>
                      <select
                        value={purchaseData.store.name}
                        onChange={(e) => {
                          const selectedStore = stores.find(s => s.name === e.target.value);
                          if (selectedStore) {
                            handleStoreSelect(selectedStore);
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">-- Sélectionner le magasin source --</option>
                        {stores.map((store) => (
                          <option key={store.id} value={store.name}>
                            {store.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <Label>Magasin Destinataire (Où va le transfert)</Label>
                      <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100">
                        {stores.find(s => s.id === currentUserStoreId)?.name || '—'}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Destinataire auto: votre magasin.</p>
                    </div>

                    {purchaseData.store.name && (
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                        <p className="text-sm text-blue-700">
                          ✓ Magasin Source: <strong>{purchaseData.store.name}</strong>
                        </p>
                        <p className="text-sm text-blue-700 mt-1">
                          ✓ Magasin Destinataire: <strong>
                            {stores.find(s => s.id === currentUserStoreId)?.name || '—'}
                          </strong>
                        </p>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {purchaseData.type === 'purchase' && (
              <div>
                <Label>Sélectionner le magasin vendeur</Label>
                <select
                  value={purchaseData.store.name}
                  onChange={(e) => {
                    const selectedStore = stores.find(s => s.name === e.target.value);
                    if (selectedStore) {
                      handleStoreSelect(selectedStore);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Sélectionner un magasin --</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.name}>
                      {store.name}
                    </option>
                  ))}
                </select>

                {purchaseData.store.name && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md mt-3">
                    <p className="text-sm text-blue-700">
                      ✓ Magasin vendeur sélectionné: <strong>{purchaseData.store.name}</strong>
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Order Items */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Articles de la Commande</CardTitle>
            <Button onClick={() => {
              if (!hasPermission('Créer un Achat/Transfert')) return;
              addItem();
            }} size="sm" className="gap-2" disabled={!hasPermission('Créer un Achat/Transfert')}>
              <Plus className="w-4 h-4" />
              Ajouter Article
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2">No</th>
                  <th className="text-left py-2 px-2">Référence</th>
                  <th className="text-left py-2 px-2">Description</th>
                  <th className="text-left py-2 px-2">Caisse</th>
                  <th className="text-left py-2 px-2">Quantité</th>
                  <th className="text-left py-2 px-2">Moyenne</th>
                  <th className="text-left py-2 px-2">Prix Unitaire</th>
                  <th className="text-left py-2 px-2">Fourchette Min</th>
                  <th className="text-left py-2 px-2">Fourchette Max</th>
                  <th className="text-left py-2 px-2">Sous-total</th>
                  <th className="text-center py-2 px-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {purchaseData.items.map((item, index) => (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-2">{index + 1}</td>
                    <td className="py-2 px-2">
                      <Input
                        value={item.reference}
                        onChange={(e) => {
                          const searchValue = e.target.value;
                          handleItemChange(item.id, 'reference', searchValue);

                          // Trigger suggestions based on reference input too
                          setActiveSuggestFieldByRow(prev => ({ ...prev, [item.id]: 'reference' }));

                          const prevTimer = debounceTimers[item.id];
                          if (prevTimer) {
                            window.clearTimeout(prevTimer);
                          }

                          const timer = window.setTimeout(() => {
                            const q = searchValue.trim().toLowerCase();

                            if (!q) {
                              setFilteredProductsByRow(prev => ({ ...prev, [item.id]: [] }));
                              setShowProductSuggestions(prev => ({ ...prev, [item.id]: false }));
                              return;
                            }

                            const filtered = products
                              .filter((product) => {
                                const name = (product.name || '').toLowerCase();
                                const ref = (product.reference || '').toLowerCase();
                                const stockRef = (product.stock_reference || '').toLowerCase();
                                // Here we prioritize reference-like matches, but still allow name/stockRef.
                                return ref.includes(q) || stockRef.includes(q) || name.includes(q);
                              })
                              .slice(0, 20);

                            setFilteredProductsByRow(prev => ({ ...prev, [item.id]: filtered }));
                            setShowProductSuggestions(prev => ({ ...prev, [item.id]: filtered.length > 0 }));
                          }, 200);

                          setDebounceTimers(prev => ({ ...prev, [item.id]: timer }));
                        }}
                        onFocus={() => {
                          setActiveSuggestFieldByRow(prev => ({ ...prev, [item.id]: 'reference' }));
                          const q = String(item.reference || '').trim();
                          const list = filteredProductsByRow[item.id] || [];
                          if (q !== '' && list.length > 0) {
                            setShowProductSuggestions(prev => ({ ...prev, [item.id]: true }));
                          }
                        }}
                        disabled={!!item.product_id}
                        className={`h-8 ${item.product_id ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                        placeholder="Ref"
                      />
                    </td>
                    <td className="py-2 px-2 relative" data-product-suggest-container="true">
                      <Input
                        value={item.description}
                        onChange={(e) => {
                          const searchValue = e.target.value;
                          handleItemChange(item.id, 'description', searchValue);

                          setActiveSuggestFieldByRow(prev => ({ ...prev, [item.id]: 'description' }));

                          // Debounce per-row to avoid heavy filtering on each keystroke
                          const prevTimer = debounceTimers[item.id];
                          if (prevTimer) {
                            window.clearTimeout(prevTimer);
                          }

                          const timer = window.setTimeout(() => {
                            const q = searchValue.trim().toLowerCase();

                            if (!q) {
                              setFilteredProductsByRow(prev => ({ ...prev, [item.id]: [] }));
                              setShowProductSuggestions(prev => ({ ...prev, [item.id]: false }));
                              return;
                            }

                            const filtered = products
                              .filter((product) => {
                                const name = (product.name || '').toLowerCase();
                                const ref = (product.reference || '').toLowerCase();
                                const stockRef = (product.stock_reference || '').toLowerCase();
                                return name.includes(q) || ref.includes(q) || stockRef.includes(q);
                              })
                              .slice(0, 20);

                            setFilteredProductsByRow(prev => ({ ...prev, [item.id]: filtered }));
                            setShowProductSuggestions(prev => ({ ...prev, [item.id]: filtered.length > 0 }));
                          }, 200);

                          setDebounceTimers(prev => ({ ...prev, [item.id]: timer }));
                        }}
                        onFocus={() => {
                          setActiveSuggestFieldByRow(prev => ({ ...prev, [item.id]: 'description' }));
                          const q = item.description.trim();
                          const list = filteredProductsByRow[item.id] || [];
                          if (q !== '' && list.length > 0) {
                            setShowProductSuggestions(prev => ({ ...prev, [item.id]: true }));
                          }
                        }}
                        className="h-8"
                        placeholder="Tapez le nom du produit..."
                      />

                      {/* Product Suggestions Dropdown */}
                      {showProductSuggestions[item.id] && (filteredProductsByRow[item.id] || []).length > 0 && (
                        <div
                          className="fixed bg-white border border-gray-300 rounded-lg shadow-2xl z-[2147483647] min-w-[500px]"
                          style={{
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            maxHeight: '70vh',
                            display: 'flex',
                            flexDirection: 'column',
                            // Force it into its own top-most layer across browsers
                            isolation: 'isolate',
                            position: 'fixed',
                            pointerEvents: 'auto',
                          }}
                        >
                          <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-blue-100" style={{ position: 'relative', zIndex: 1 }}>
                            <h3 className="font-semibold text-gray-900 text-sm">Produits disponibles</h3>
                            <p className="text-xs text-gray-600 mt-1">{(filteredProductsByRow[item.id] || []).length} résultat{(filteredProductsByRow[item.id] || []).length > 1 ? 's' : ''}</p>
                          </div>

                          <div className="overflow-y-auto flex-1" style={{ position: 'relative', zIndex: 1 }}>
                            {(filteredProductsByRow[item.id] || []).map((product) => (
                              <button
                                key={product.id}
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();

                                  // Stock should reflect ONLY the selected source magasin.
                                  // For admin, `products` is already filtered by source store, but grouped rows may still
                                  // carry multi-store aggregates in total_store_stock.
                                  const stock = (() => {
                                    const sid = sourceStoreId ? String(sourceStoreId) : null;

                                    // Prefer per-store stock from store_stocks when possible.
                                    if (sid && product?.store_stocks && typeof product.store_stocks === 'object') {
                                      return Number((product.store_stocks as any)[sid] ?? 0) || 0;
                                    }

                                    // Fallback: if products list is store-filtered, quantity_available is typically store-scoped.
                                    // Use it instead of total_store_stock to avoid showing global totals.
                                    return Number(product?.quantity_available || 0) || 0;
                                  })();

                                  // Block selecting products that are out of stock
                                  if ((Number(stock) || 0) <= 0) {
                                    toast.error(`❌ Rupture de stock: ${product.name}`);
                                    return;
                                  }

                                  const tpl = getTemplateForProduct(product);
                                  const tplRef = tpl?.reference_number ?? tpl?.reference ?? null;
                                  const tplName = tpl?.name ?? null;
                                  const tplMin = tpl?.fourchette_min ?? null;
                                  const tplMax = tpl?.fourchette_max ?? null;

                                  setPurchaseData(prevData => ({
                                    ...prevData,
                                    items: prevData.items.map(i => {
                                      if (i.id === item.id) {
                                        const updatedItem: any = {
                                          ...i,
                                          // Keep the product table name in description for stock/price linkage,
                                          // but store the template fields in their dedicated columns.
                                          description: product.name,
                                          reference: (tplRef ?? product.reference) || '',
                                          stock_reference: product.stock_reference || product.reference || '',
                                          unitPrice: (product.purchase_price ?? product.sale_price ?? 0),
                                          fourchette_min: (tplMin ?? product.fourchette_min) || 0,
                                          fourchette_max: (tplMax ?? product.fourchette_max) || 0,
                                          category: product.category || '',
                                          lot: product.lot || '',
                                          product_id: product.id,
                                        };

                                        // If the user selected by reference, it is usually a product already existing.
                                        // Keep caisse/moyenne empty until user enters them.
                                        return updatedItem;
                                      }
                                      return i;
                                    }),
                                  }));

                                  setShowProductSuggestions(prev => ({ ...prev, [item.id]: false }));
                                  setFilteredProductsByRow(prev => ({ ...prev, [item.id]: [] }));
                                  toast.success(`${product.name} sélectionné avec tous les détails`);
                                }}
                                className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors group"
                              >
                                <div className="flex justify-between items-start gap-3">
                                  <div className="flex-1">
                                    <div className="font-medium text-gray-900 text-sm group-hover:text-blue-600">{product.name}</div>
                                    {(() => {
                                      const tpl = getTemplateForProduct(product);
                                      const ref = tpl?.reference_number ?? tpl?.reference ?? product.reference;
                                      const tplName = tpl?.name ?? null;
                                      return (
                                        <>
                                          <div className="text-xs text-gray-600 mt-1">
                                            Ref: <span className="font-mono text-gray-700">{ref || '-'}</span>
                                          </div>
                                          {tplName && tplName !== product.name && (
                                            <div className="text-xs text-gray-600 mt-1">
                                              Modèle: <span className="font-medium text-gray-800">{tplName}</span>
                                            </div>
                                          )}
                                        </>
                                      );
                                    })()}
                                    <div className="text-xs text-gray-600 mt-1">
                                      Stock Ref: <span className="font-mono text-gray-700">{product.stock_reference || 'N/A'}</span>
                                    </div>
                                    <div className="text-xs text-gray-600 mt-1">
                                      Caisse: <span className="font-mono text-gray-700">{product.number_of_boxes || 'N/A'}</span>
                                    </div>

                                    {(() => {
                                      // Stock should reflect ONLY the selected source magasin.
                                      const stock = (() => {
                                        const sid = sourceStoreId ? String(sourceStoreId) : null;

                                        if (sid && product?.store_stocks && typeof product.store_stocks === 'object') {
                                          return Number((product.store_stocks as any)[sid] ?? 0) || 0;
                                        }

                                        return Number(product?.quantity_available || 0) || 0;
                                      })();

                                      return (
                                        <div className="text-xs text-gray-600 mt-1">
                                          📦 Stock: <span className="font-semibold text-blue-700">{stock}</span>
                                        </div>
                                      );
                                    })()}

                                    {(() => {
                                      const tpl = getTemplateForProduct(product);
                                      const min = tpl?.fourchette_min ?? null;
                                      const max = tpl?.fourchette_max ?? null;
                                      return (
                                        <div className="text-xs text-gray-600 mt-1">
                                          Fourchette: <span className="font-mono text-gray-700">[{min ?? '-'} - {max ?? '-'}]</span>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                  <div className="text-right">
                                    <span className="text-sm font-semibold text-blue-600">{(product.purchase_price ?? product.sale_price ?? 0)?.toFixed(2)} MAD</span>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>

                          <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-600" style={{ position: 'relative', zIndex: 1 }}>
                            Cliquez sur un produit pour le sélectionner
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={item.caisse}
                        onChange={(e) => {
                          const caisseValue = e.target.value;

                          // Enforce: caisse cannot exceed available stock for selected product (source store)
                          if (item.product_id) {
                            const p = products.find((pp: any) => String(pp?.id) === String(item.product_id));
                            const available = (() => {
                              const sid = sourceStoreId ? String(sourceStoreId) : null;
                              if (sid && p?.store_stocks && typeof p.store_stocks === 'object') {
                                return Number((p.store_stocks as any)[sid] ?? 0) || 0;
                              }
                              return Number(p?.quantity_available ?? 0) || 0;
                            })();

                            const n = parseDecimal(String(caisseValue));
                            if (n !== null && n > available) {
                              toast.error(`❌ Stock insuffisant: max ${available}`);
                              handleItemChange(item.id, 'caisse', String(available));

                              const m2 = computeMoyenne(item.quantity, String(available));
                              if (m2 !== null) handleItemChange(item.id, 'moyenne', m2.toFixed(2));
                              return;
                            }
                          }

                          handleItemChange(item.id, 'caisse', caisseValue);

                          const m = computeMoyenne(item.quantity, caisseValue);
                          if (m !== null && !isMoyenneInFourchette(m, item.fourchette_min, item.fourchette_max)) {
                            toast.error(`❌ Moyenne ${m} hors fourchette [${item.fourchette_min || '∞'}, ${item.fourchette_max || '∞'}]`);
                            return;
                          }
                          if (m !== null) {
                            handleItemChange(item.id, 'moyenne', m.toFixed(2));
                          }
                        }}
                        onBlur={(e) => {
                          // Normalize comma to dot on blur
                          const normalized = e.target.value.replace(',', '.');
                          if (normalized !== e.target.value) handleItemChange(item.id, 'caisse', normalized);
                        }}
                        className="h-8"
                        placeholder="Caisse"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={item.quantity === '0' ? '' : item.quantity}
                        onChange={(e) => {
                          const quantityStr = e.target.value;
                          handleItemChange(item.id, 'quantity', quantityStr);

                          const m = computeMoyenne(quantityStr, item.caisse);
                          if (m !== null && !isMoyenneInFourchette(m, item.fourchette_min, item.fourchette_max)) {
                            toast.error(`❌ Moyenne ${m} hors fourchette [${item.fourchette_min || '∞'}, ${item.fourchette_max || '∞'}]`);
                            return;
                          }
                          if (m !== null) {
                            handleItemChange(item.id, 'moyenne', m.toFixed(2));
                          }
                        }}
                        onBlur={(e) => {
                          // Normalize comma to dot on blur
                          const normalized = e.target.value.replace(',', '.');
                          if (normalized !== e.target.value) handleItemChange(item.id, 'quantity', normalized);
                        }}
                        className="h-8"
                        placeholder="0"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Input
                        type="number"
                        value={item.moyenne === '' ? '' : item.moyenne}
                        onChange={(e) => {
                          const moyenneValue = e.target.value === '' ? '' : parseFloat(e.target.value);
                          
                          if (moyenneValue !== '' && item.fourchette_min !== undefined && item.fourchette_max !== undefined) {
                            const moyenne = parseFloat(String(moyenneValue));
                            const min = item.fourchette_min;
                            const max = item.fourchette_max;
                            
                            if ((min !== 0 && moyenne < min) || (max !== 0 && moyenne > max)) {
                              toast.error(`❌ Moyenne ${moyenne} hors fourchette [${min}, ${max}]`);
                              return;
                            }
                          }
                          
                          handleItemChange(item.id, 'moyenne', moyenneValue);
                        }}
                        className="h-8"
                        placeholder="Moyenne"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Input
                        type="number"
                        value={item.unitPrice === 0 ? '' : item.unitPrice}
                        onChange={(e) => handleItemChange(item.id, 'unitPrice', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                        className="h-8"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Input
                        type="number"
                        value={item.fourchette_min === 0 || !item.fourchette_min ? '' : item.fourchette_min}
                        disabled
                        className="h-8 bg-gray-100 cursor-not-allowed"
                        placeholder="Min"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Input
                        type="number"
                        value={item.fourchette_max === 0 || !item.fourchette_max ? '' : item.fourchette_max}
                        disabled
                        className="h-8 bg-gray-100 cursor-not-allowed"
                        placeholder="Max"
                      />
                    </td>
                    <td className="py-2 px-2 font-semibold">{item.subtotal.toFixed(2)} MAD</td>
                    <td className="py-2 px-2 text-center">
                      <Button
                        onClick={() => {
                          if (!hasPermission('Créer un Achat/Transfert')) return;
                          removeItem(item.id)
                        }}
                        size="sm"
                        variant="destructive"
                        className="h-8 w-8 p-0"
                        disabled={!hasPermission('Créer un Achat/Transfert')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Payment Methods - EXACT BonCommande UX */}
      <Card>
        <CardHeader>
          <CardTitle>Méthodes de Paiement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 mb-6">
            <Label className="text-sm font-semibold text-gray-700">Autres charges (MAD)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={(() => {
                const v = (purchaseData as any).otherCharges;
                return v === null || v === undefined || Number(v) === 0 ? '' : v;
              })()}
              onChange={(e) => {
                const raw = e.target.value;
                // Allow empty while typing
                if (raw === '') {
                  setPurchaseData((prev) => ({
                    ...prev,
                    otherCharges: 0,
                  }));
                  return;
                }

                const v = Number(raw);
                setPurchaseData((prev) => ({
                  ...prev,
                  otherCharges: Number.isFinite(v) ? v : 0,
                }));
              }}
              className="w-full"
              placeholder="Ex: transport, manutention..."
            />
            <p className="text-xs text-gray-500">Ces charges s’ajoutent au total de l’achat/transfert.</p>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold text-gray-700 mb-2 block">Statut de Paiement</Label>
              {/* Match BonCommande styling */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                <Button
                  type="button"
                  onClick={() => {
                    setPurchaseData({
                      ...purchaseData,
                      status: 'Non Payée',
                      amountPaid: 0,
                    } as any);
                    toast.success('Statut: Non Payée');
                  }}
                  className={`h-9 px-3 rounded-md text-sm font-semibold border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black ${
                    (purchaseData as any).status === 'Non Payée'
                      ? '!bg-black !text-white !border-black'
                      : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  Non Payée
                </Button>

                <Button
                  type="button"
                  onClick={() => {
                    setPurchaseData({
                      ...purchaseData,
                      status: 'Partiellement payée',
                      amountPaid: 0,
                    } as any);
                    toast.success('Statut: Partiellement payée');
                  }}
                  className={`h-9 px-3 rounded-md text-sm font-semibold border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black ${
                    (purchaseData as any).status === 'Partiellement payée'
                      ? '!bg-black !text-white !border-black'
                      : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  Partiellement payée
                </Button>

                <Button
                  type="button"
                  onClick={() => {
                    setPurchaseData({
                      ...purchaseData,
                      status: 'Payée',
                      amountPaid: totals.total,
                    } as any);
                    toast.success('Statut: Payée');
                  }}
                  className={`h-9 px-3 rounded-md text-sm font-semibold border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black ${
                    (purchaseData as any).status === 'Payée'
                      ? '!bg-black !text-white !border-black'
                      : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  Payée
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold text-gray-700 mb-2 block">Méthode de Paiement</Label>
              <select
                value={(purchaseData as any).paymentMethod || 'cash'}
                onChange={(e) => {
                  const method = e.target.value as 'cash' | 'check' | 'bank_transfer';
                  setPurchaseData({
                    ...purchaseData,
                    paymentMethod: method,
                  } as any);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all bg-white hover:border-gray-400"
              >
                <option value="cash"> Espèces</option>
                <option value="check"> Chèque</option>
                <option value="bank_transfer"> Virement bancaire</option>
              </select>
            </div>

            {(purchaseData as any).paymentMethod === 'cash' && (
              <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                <Label className="text-sm font-semibold text-gray-700 mb-2 block">Montant Payé</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Entrez le montant payé"
                    value={(purchaseData as any).amountPaid || ''}
                    onChange={(e) => {
                      const amountPaid = parseFloat(e.target.value) || 0;
                      let newStatus: any = 'Non Payée';
                      if (amountPaid > 0) {
                        if (amountPaid >= totals.total) newStatus = 'Payée';
                        else newStatus = 'Partiellement payée';
                      }
                      setPurchaseData({
                        ...purchaseData,
                        amountPaid,
                        status: newStatus,
                      } as any);
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                  <span className="font-semibold text-gray-700">MAD</span>
                </div>
              </div>
            )}

            {(purchaseData as any).paymentMethod === 'bank_transfer' && (
              <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200 space-y-3">
                <Label className="text-sm font-semibold text-gray-700 mb-2 block">Montant Payé (Virement)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Entrez le montant payé"
                    value={(purchaseData as any).amountPaid || ''}
                    onChange={(e) => {
                      const amountPaid = parseFloat(e.target.value) || 0;
                      let newStatus: any = 'Non Payée';
                      if (amountPaid > 0) {
                        if (amountPaid >= totals.total) newStatus = 'Payée';
                        else newStatus = 'Partiellement payée';
                      }
                      setPurchaseData({
                        ...purchaseData,
                        amountPaid,
                        status: newStatus,
                      } as any);
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <span className="font-semibold text-gray-700">MAD</span>
                </div>

                <div className="pt-2">
                  <Label className="text-sm font-semibold text-gray-700 mb-2 block">Preuve de Virement (image ou PDF)</Label>
                  <Input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setBankProofFile(file);
                      setPurchaseData(prev => ({ ...prev, bankTransferProofFile: file }));
                    }}
                  />
                </div>
              </div>
            )}

            {(purchaseData as any).paymentMethod === 'check' && (
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <Label className="text-sm font-semibold text-gray-700 mb-2 block">Sélectionner un Chèque</Label>
                <div className="flex gap-2 mb-3">
                  <Dialog open={checkDialogOpen} onOpenChange={setCheckDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        className="flex-1"
                        style={{ backgroundColor: '#3b82f6', color: 'white' }}
                        onClick={async () => {
                          setCheckSearchQuery('');
                          setLoadingChecks(true);
                          try {
                            const response = await fetch(
                              `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory`,
                              {
                                headers: {
                                  'Authorization': `Bearer ${session.access_token}`,
                                },
                              }
                            );
                            if (response.ok) {
                              const data = await response.json();
                              setChecks(data.check_inventory || []);
                            }
                          } catch (error) {
                            toast.error('Erreur lors du chargement des chèques');
                          } finally {
                            setLoadingChecks(false);
                          }
                        }}
                      >
                        🏦 Choisir un Chèque
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-6xl w-[min(1400px,calc(100vw-2rem))]">
                      <DialogHeader>
                        <DialogTitle>Sélectionner un Chèque pour le Paiement</DialogTitle>
                      </DialogHeader>

                      <div className="space-y-3">
                        <div>
                          <Label className="text-sm font-semibold text-gray-700 mb-2 block">Recherche</Label>
                          <Input
                            value={checkSearchQuery}
                            onChange={(e) => setCheckSearchQuery(e.target.value)}
                            placeholder="Rechercher par ID, statut, donneur..."
                            className="w-full"
                          />
                        </div>

                        {loadingChecks ? (
                          <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                          </div>
                        ) : checks.length === 0 ? (
                          <div className="text-center py-8">
                            <p className="text-gray-500">Aucun chèque disponible</p>
                          </div>
                        ) : (
                          <div className="border border-gray-200 rounded-lg overflow-hidden">
                            <div className="max-h-[70vh] overflow-x-auto overflow-y-auto">
                              <Table>
                                <TableHeader className="sticky top-0 bg-white z-10">
                                  <TableRow>
                                    <TableHead>ID Chèque</TableHead>
                                    <TableHead>Montant Original</TableHead>
                                    <TableHead>Disponible</TableHead>
                                    <TableHead>Statut</TableHead>
                                    <TableHead>Donné par</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {checks
                                    .filter((check) => check.status !== 'used' && check.status !== 'archived')
                                    .filter((check) => {
                                      const q = checkSearchQuery.trim().toLowerCase();
                                      if (!q) return true;
                                      const hay = `${check.check_id_number} ${check.status} ${(check.given_to || '')} ${(check.amount_value || 0)} ${(check.remaining_balance || 0)}`.toLowerCase();
                                      return hay.includes(q);
                                    })
                                    .map((check) => (
                                      <TableRow key={check.id}>
                                        <TableCell className="font-semibold">{check.check_id_number}</TableCell>
                                        <TableCell className="font-semibold text-blue-600">
                                          {(check.amount_value || 0).toFixed(2)} MAD
                                        </TableCell>
                                        <TableCell className="font-semibold text-green-600">
                                          {(check.remaining_balance || check.amount_value || 0).toFixed(2)} MAD
                                        </TableCell>
                                        <TableCell>
                                          <span
                                            className={`px-2 py-1 rounded text-xs font-semibold ${
                                              check.status === 'pending'
                                                ? 'bg-yellow-100 text-yellow-800'
                                                : check.status === 'received'
                                                  ? 'bg-blue-100 text-blue-800'
                                                  : check.status === 'used'
                                                    ? 'bg-green-100 text-green-800'
                                                    : 'bg-gray-100 text-gray-800'
                                            }`}
                                          >
                                            {check.status}
                                          </span>
                                        </TableCell>
                                        <TableCell>{check.given_to || ''}</TableCell>
                                        <TableCell className="text-right">
                                          <Button
                                            size="sm"
                                            style={{ backgroundColor: '#10b981', color: 'white' }}
                                            onClick={() => {
                                              // If we're in "additional payment" flow, store into additionalSelectedCheck,
                                              // otherwise store into main selectedCheck.
                                              if (currentAdditionalPaymentType === 'check') {
                                                setAdditionalSelectedCheck(check);
                                              } else {
                                                setSelectedCheck(check);
                                                setPurchaseData(prev => ({ ...prev, selectedCheckId: check.id }));
                                              }

                                              setCheckDialogOpen(false);
                                              toast.success(`Chèque ${check.check_id_number} sélectionné`);
                                            }}
                                          >
                                            <Check className="w-4 h-4 mr-1" />
                                            Sélectionner
                                          </Button>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Dialog
                    open={createCheckDialogOpen}
                    onOpenChange={(open: boolean) => {
                      setCreateCheckDialogOpen(open);
                      if (open) {
                        setUploadCheckDate(getTodayDate());
                        setUploadExecutionDate(getTodayDate());
                      }
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button
                        className="flex-1"
                        style={{ backgroundColor: '#8b5cf6', color: 'white' }}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Créer Chèque
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Uploader un Chèque à l'Inventaire</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleUploadCheck} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="upload_file">Fichier (Image ou PDF) *</Label>
                          <Input
                            id="upload_file"
                            type="file"
                            accept="image/*,.pdf"
                            onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                            required
                          />
                          <p className="text-xs text-gray-500">JPG, PNG ou PDF (Max 10MB)</p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="upload_check_id">ID du Chèque *</Label>
                          <Input
                            id="upload_check_id"
                            value={uploadCheckId}
                            onChange={(e) => setUploadCheckId(e.target.value)}
                            placeholder="Ex: CHK-2024-001"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="upload_amount">Montant (MAD) *</Label>
                          <Input
                            id="upload_amount"
                            type="number"
                            step="0.01"
                            min="0.01"
                            max="999999999.99"
                            value={uploadAmount}
                            onChange={(e) => setUploadAmount(e.target.value)}
                            placeholder="0.00"
                            required
                          />
                          <p className="text-xs text-gray-500">Max: 999,999,999.99 MAD</p>
                        </div>

                        <div className="space-y-2">
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
                          <Label htmlFor="upload_execution_date">Date d'Exécution (Optionnel)</Label>
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
                            onClick={() => setCreateCheckDialogOpen(false)}
                            style={{ backgroundColor: '#d1d5db' }}
                            className="text-gray-800 hover:opacity-90"
                          >
                            Annuler
                          </Button>
                          <Button
                            type="submit"
                            disabled={uploadLoading}
                            style={{ backgroundColor: '#f59e0b' }}
                            className="text-white hover:opacity-90"
                          >
                            {uploadLoading ? 'Upload...' : 'Uploader'}
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>

                {selectedCheck && (
                  <div className="mt-3 p-3 bg-white rounded-lg border border-blue-300 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-gray-700">Chèque Sélectionné:</span>
                      <span className="text-sm font-bold text-blue-600">{selectedCheck.check_id_number}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-gray-700">Montant Disponible:</span>
                      <span className="text-sm font-bold text-green-600">{(selectedCheck.remaining_balance || selectedCheck.amount_value || 0).toFixed(2)} MAD</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-gray-700">Total Bon:</span>
                      <span className="text-sm font-bold text-orange-600">{totals.total.toFixed(2)} MAD</span>
                    </div>
                    {(selectedCheck.remaining_balance || selectedCheck.amount_value || 0) < totals.total && (
                      <div className="bg-yellow-50 p-2 rounded border border-yellow-200">
                        <p className="text-xs text-yellow-700 font-semibold">
                          ⚠️ Le chèque ne couvre pas le montant total. Reste à payer: {(totals.total - (selectedCheck.remaining_balance || selectedCheck.amount_value || 0)).toFixed(2)} MAD
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Additional Payment Methods Section */}
            {Object.keys(purchaseData.additionalPayments || {}).length > 0 && (
              <div className="border-t pt-4">
                <Label className="text-sm font-semibold text-gray-700 mb-3 block">Méthodes de Paiement Supplémentaires</Label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(purchaseData.additionalPayments || {}).map(([method, amount]) => (
                    <div key={method} className="flex items-center gap-2 bg-purple-100 text-purple-800 px-3 py-2 rounded-lg border border-purple-300">
                      <span className="text-sm font-semibold">
                        {method === 'cash' ? '💵 Espèces' : method === 'check' ? '🏦 Chèque' : '🏦 Virement'}
                      </span>
                      <span className="text-sm font-bold">{(amount as number).toFixed(2)} MAD</span>
                      <button
                        type="button"
                        onClick={() => {
                          const newPayments = { ...(purchaseData.additionalPayments || {}) };
                          delete newPayments[method];
                          setPurchaseData(prev => ({ ...prev, additionalPayments: newPayments }));
                          toast.success(`Méthode de paiement supprimée`);
                        }}
                        className="ml-1 text-purple-600 hover:text-purple-800 font-bold"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add Additional Payment Method */}
            <div className="border-t pt-4">
              <Dialog open={additionalPaymentDialogOpen} onOpenChange={setAdditionalPaymentDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    style={{ backgroundColor: '#f59e0b', color: 'white' }}
                    className="w-full"
                    onClick={() => {
                      setCurrentAdditionalPaymentType(null);
                      setAdditionalSelectedCheck(null);
                      setAdditionalBankProofFile(null);
                    }}
                  >
                    + Ajouter une Méthode de Paiement
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[420px] max-w-[calc(100vw-2rem)]">
                  <DialogHeader>
                    <DialogTitle>Ajouter une méthode de paiement supplémentaire</DialogTitle>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-semibold text-gray-700 mb-2 block">Méthode</Label>
                      <select
                        value={currentAdditionalPaymentType || ''}
                        onChange={(e) => setCurrentAdditionalPaymentType(e.target.value as any)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                      >
                        <option value="">-- Sélectionner --</option>
                        <option value="cash">💵 Espèces</option>
                        <option value="check">🏦 Chèque</option>
                        <option value="bank_transfer">🏦 Virement bancaire</option>
                      </select>
                    </div>

                    {currentAdditionalPaymentType && (
                      <div>
                        <Label className="text-sm font-semibold text-gray-700 mb-2 block">Montant</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            placeholder="0.00"
                            onChange={(e) => {
                              const amount = parseFloat(e.target.value) || 0;
                              setAdditionalPayments(prev => ({
                                ...prev,
                                [currentAdditionalPaymentType]: amount,
                              }));
                            }}
                          />
                          <span className="font-semibold text-gray-700">MAD</span>
                        </div>
                      </div>
                    )}

                    {currentAdditionalPaymentType === 'check' && (
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-gray-700">Chèque</Label>

                        <div className="flex gap-2">
                          <Button
                            type="button"
                            className="flex-1"
                            style={{ backgroundColor: '#3b82f6', color: 'white' }}
                            onClick={async () => {
                              // Load checks then open selector dialog
                              setLoadingChecks(true);
                              try {
                                const response = await fetch(
                                  `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory`,
                                  {
                                    headers: {
                                      'Authorization': `Bearer ${session.access_token}`,
                                    },
                                  }
                                );
                                if (response.ok) {
                                  const data = await response.json();
                                  setChecks(data.check_inventory || []);
                                }

                                // Close additional dialog so it doesn't sit on top
                                setAdditionalPaymentDialogOpen(false);
                                // Open selector
                                setCheckDialogOpen(true);
                              } catch {
                                toast.error('Erreur lors du chargement des chèques');
                              } finally {
                                setLoadingChecks(false);
                              }
                            }}
                          >
                            🏦 Choisir un Chèque
                          </Button>

                          <Button
                            type="button"
                            className="flex-1"
                            style={{ backgroundColor: '#8b5cf6', color: 'white' }}
                            onClick={() => {
                              // Close additional dialog and open create-check dialog
                              setAdditionalPaymentDialogOpen(false);
                              setUploadCheckDate(getTodayDate());
                              setUploadExecutionDate(getTodayDate());
                              setCreateCheckDialogOpen(true);
                            }}
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            Créer Chèque
                          </Button>
                        </div>

                        {additionalSelectedCheck && (
                          <div className="text-sm text-gray-700">
                            Sélectionné: <span className="font-semibold">{additionalSelectedCheck.check_id_number}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {currentAdditionalPaymentType === 'bank_transfer' && (
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-gray-700">Preuve de Virement</Label>
                        <Input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => setAdditionalBankProofFile(e.target.files?.[0] || null)}
                        />
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        type="button"
                        onClick={() => setAdditionalPaymentDialogOpen(false)}
                        style={{ backgroundColor: '#d1d5db' }}
                        className="text-gray-800 hover:opacity-90"
                      >
                        Annuler
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          if (!currentAdditionalPaymentType) {
                            toast.error('Veuillez sélectionner une méthode');
                            return;
                          }
                          setPurchaseData(prev => ({
                            ...prev,
                            additionalPayments: {
                              ...(prev.additionalPayments || {}),
                              [currentAdditionalPaymentType]: additionalPayments[currentAdditionalPaymentType] || 0,
                            },
                          }));
                          toast.success('Méthode ajoutée');
                          setAdditionalPaymentDialogOpen(false);
                        }}
                        style={{ backgroundColor: '#f59e0b', color: 'white' }}
                        className="text-white hover:opacity-90"
                      >
                        Ajouter
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={purchaseData.notes}
            onChange={(e) => setPurchaseData({ ...purchaseData, notes: e.target.value })}
            placeholder="Ajouter des notes..."
            className="w-full"
          />
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Résumé</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-w-xs ml-auto">
            <div className="flex justify-between">
              <span>Sous-total:</span>
              <span className="font-semibold">{totals.subtotal.toFixed(2)} MAD</span>
            </div>
            <div className="border-t pt-3 flex justify-between text-lg font-bold text-blue-600">
              <span>Total:</span>
              <span>{totals.total.toFixed(2)} MAD</span>
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Montant Payé:</span>
                <span className="font-semibold text-green-600">{totalPaid.toFixed(2)} MAD</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Montant Restant:</span>
                <span className={`font-semibold ${remainingAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {remainingAmount.toFixed(2)} MAD
                </span>
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => onBack?.()}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={loading || !hasSelectedStore || !hasValidLineItem || (isAdmin && !adminHasSelectedStore)}
                  style={{
                    backgroundColor: '#16a34a',
                    color: 'white',
                    flex: 1,
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontWeight: '600',
                    fontSize: '14px',
                    border: 'none',
                    cursor: loading || purchaseData.items.length === 0 || !purchaseData.store.name ? 'not-allowed' : 'pointer',
                    opacity: loading || purchaseData.items.length === 0 || !purchaseData.store.name ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!(loading || purchaseData.items.length === 0 || !purchaseData.store.name)) {
                      e.currentTarget.style.backgroundColor = '#15803d';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#16a34a';
                  }}
                >
                  {loading ? 'Traitement...' : 'Confirmer la Commande'}
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
