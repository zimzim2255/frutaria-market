import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Plus, Trash2, Download, Eye, Search, Check, Upload, DollarSign, CreditCard, Banknote } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { projectId } from '../../utils/supabase/info';
import { toast } from 'sonner';

interface StoreInfo {
  id: string;
  name: string;
  phone?: string;
}

interface CompanyInfo {
  referenceNumero: string;
  palette: string;
  transporteur: string;
  fraisMaritime: number;
  fraisTransit: number;
  onssa: number;
  fraisDivers: number;
  fraisTransport: number;
  dateDecharge: string;
  entrepot: string;
  dateChargement: string;
  matricule: string;
  magasinage: number;
  taxe: number;
}

interface ClientInfo {
  name: string;
  phone: string;
  address: string;
  ice: string;
  if: string;
  rc: string;
  patente: string;
}

interface InvoiceItem {
  id: string;
  description: string;
  productId?: string; // Store product ID to ensure correct product is referenced
  caisse: string;
  quantity: number;
  moyenne: string;
  unitPrice: number;
  subtotal: number;
  reference?: string;
  category?: string;
  lot?: string;
  fourchette_min?: number;
  fourchette_max?: number;
}

interface InvoiceData {
  company: CompanyInfo;
  client: ClientInfo;
  items: InvoiceItem[];
  status: 'Payée' | 'Non Payée' | 'Partiellement payée';
  paymentMethod: 'cash' | 'check' | 'bank_transfer';
  amountPaid?: number;
  tvaPercentage: number;
}

interface SavedInvoice {
  id: string;
  invoice_number: string;
  client_name: string;
  total_amount: number;
  amount_paid: number;
  payment_method: 'cash' | 'check' | 'bank_transfer';
  status: 'pending' | 'paid' | 'partial' | 'cancelled';
  created_at: string;
}

interface CheckInventoryItem {
  id: string;
  check_id_number: string;
  amount_value: number;
  remaining_balance: number;
  status: string;
  given_to: string;
}

export default function FactureModule({ session, setActiveTab }: { session: any; setActiveTab?: (tab: string) => void }) {
  // Resolve role+permissions from DB (not user_metadata)
  const [currentUserRole, setCurrentUserRole] = useState<string>('user');
  const [currentUserPermissions, setCurrentUserPermissions] = useState<string[]>([]);

  const isAdmin = currentUserRole === 'admin';
  const hasPermission = (permission: string): boolean => {
    if (isAdmin) return true;
    return currentUserPermissions.includes(permission);
  };

  // Factures permissions
  const canViewFactures = hasPermission("Voir la page Facture (Création)");
  const canCreateFacture = hasPermission('Créer une Facture');
  const canEditFacture = hasPermission('Modifier une Facture');
  const canDeleteFacture = hasPermission('Supprimer une Facture');

  const [savedInvoices, setSavedInvoices] = useState<SavedInvoice[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [checks, setChecks] = useState<CheckInventoryItem[]>([]);
  const [loadingChecks, setLoadingChecks] = useState(false);
  const [checkDialogOpen, setCheckDialogOpen] = useState(false);
  const [selectedCheck, setSelectedCheck] = useState<CheckInventoryItem | null>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [filteredClients, setFilteredClients] = useState<any[]>([]);
  const [allStores, setAllStores] = useState<StoreInfo[]>([]);
  const [selectedStore, setSelectedStore] = useState<StoreInfo | null>(null);
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [productTemplates, setProductTemplates] = useState<any[]>([]);

  // Template lookup (source of truth for: template name, reference, fourchette)
  const templateByReference = React.useMemo(() => {
    const m = new Map<string, any>();
    (productTemplates || []).forEach((t: any) => {
      const key = String(t?.reference_number || t?.reference || '').trim();
      if (key) m.set(key, t);
    });
    return m;
  }, [productTemplates]);

  const normalizeRefKey = (v: any): string => String(v ?? '').trim().toLowerCase();

  const getTemplateForProduct = (p: any) => {
    const refKey = normalizeRefKey(p?.reference ?? p?.stock_reference ?? '');
    // templateByReference keys are not normalized; try both
    if (!refKey) return null;
    return (
      templateByReference.get(refKey) ||
      templateByReference.get(String(p?.reference ?? p?.stock_reference ?? '').trim()) ||
      null
    );
  };
  const [filteredProducts, setFilteredProducts] = useState<any[]>([]);
  const [showProductSuggestions, setShowProductSuggestions] = useState<{ [key: string]: boolean }>({});
  const [productDialogOpen, setProductDialogOpen] = useState<string | null>(null);
  const [hasUserTyped, setHasUserTyped] = useState<{ [key: string]: boolean }>({});
  const [createCheckDialogOpen, setCreateCheckDialogOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCheckId, setUploadCheckId] = useState('');
  const [uploadAmount, setUploadAmount] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadGiverName, setUploadGiverName] = useState('');
  const [uploadCheckDate, setUploadCheckDate] = useState('');
  const [uploadExecutionDate, setUploadExecutionDate] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [bankProofFile, setBankProofFile] = useState<File | null>(null);
  const [bankProofUrl, setBankProofUrl] = useState<string>('');
  const [documents, setDocuments] = useState<any[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<any[]>([]);
  const [showDocumentDialog, setShowDocumentDialog] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddPaymentDialog, setShowAddPaymentDialog] = useState(false);
  const [additionalPayments, setAdditionalPayments] = useState<{ [key: string]: number }>({});
  const [currentAdditionalPaymentType, setCurrentAdditionalPaymentType] = useState<'cash' | 'check' | 'bank_transfer' | null>(null);
  const [additionalSelectedCheck, setAdditionalSelectedCheck] = useState<CheckInventoryItem | null>(null);
  const [additionalBankProofFile, setAdditionalBankProofFile] = useState<File | null>(null);
  const [checkSearchTerm, setCheckSearchTerm] = useState('');
  const [invoiceData, setInvoiceData] = useState<InvoiceData>({
    company: {
      referenceNumero: '',
      palette: '',
      transporteur: '',
      fraisMaritime: 0,
      fraisTransit: 0,
      onssa: 0,
      fraisDivers: 0,
      fraisTransport: 0,
      dateDecharge: '',
      entrepot: '',
      dateChargement: '',
      matricule: '',
      magasinage: 0,
      taxe: 0,
    },
    client: {
      name: '',
      phone: '',
      address: '',
      ice: '',
      if: '',
      rc: '',
      patente: '',
    },
    items: [],
    status: 'Non Payée',
    paymentMethod: 'cash',
    tvaPercentage: 20,
  });
  const [remise, setRemise] = useState('');

  // Default invoice number previewed from backend (FAC-xxxx).
  // User can optionally override the displayed reference in the same input.
  const [invoiceId, setInvoiceId] = useState<string>('');
  const [customInvoiceRef, setCustomInvoiceRef] = useState<string>('');

  // Resolve current user (role+permissions) from DB
  useEffect(() => {
    const fetchMe = async () => {
      try {
        if (!session?.access_token) return;

        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/users`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        const me = data?.users?.find((u: any) => u.id === session.user.id);
        if (me) {
          setCurrentUserRole(String(me.role || 'user'));
          setCurrentUserPermissions(Array.isArray(me.permissions) ? me.permissions : []);
        }
      } catch (e) {
        console.warn('[FactureModule] Could not resolve current user:', e);
      }
    };

    fetchMe();
  }, [session?.access_token, session?.user?.id]);

  // Invoice number is generated by backend. On load we preview the next number
  // (no increment) so the UI doesn't always show FAC-000001.
  useEffect(() => {
    const previewNextInvoiceNumber = async () => {
      try {
        if (!session?.access_token) return;

        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/invoices/preview-number?counter_id=global`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        if (!res.ok) {
          // fallback to empty (better than wrong static number)
          setInvoiceId('');
          return;
        }

        const data = await res.json().catch(() => null);
        const n = data?.invoice_number;
        setInvoiceId(typeof n === 'string' ? n : '');
      } catch {
        setInvoiceId('');
      }
    };

    previewNextInvoiceNumber();
  }, [session?.access_token]);

  const handleCompanyChange = (field: keyof CompanyInfo, value: string): void => {
    setInvoiceData({
      ...invoiceData,
      company: {
        ...invoiceData.company,
        [field]: value,
      },
    });
  };

  const handleClientChange = (field: keyof ClientInfo, value: string): void => {
    setInvoiceData({
      ...invoiceData,
      client: {
        ...invoiceData.client,
        [field]: value,
      },
    });

    if (field === 'name') {
      if (value.trim() === '') {
        setFilteredClients([]);
        setShowClientSuggestions(false);
      } else {
        const filtered = clients.filter(client =>
          client.name?.toLowerCase().includes(value.toLowerCase())
        );
        setFilteredClients(filtered);
        setShowClientSuggestions(filtered.length > 0);
      }
    }
  };

  const selectClient = (client: any): void => {
    setInvoiceData({
      ...invoiceData,
      client: {
        name: client.name || '',
        phone: client.phone || '',
        address: client.address || '',
        ice: client.ice || '',
        if: client.if_number || '',
        rc: client.rc || '',
        patente: client.patente || '',
      },
    });
    setShowClientSuggestions(false);
  };

  useEffect(() => {
    const fetchStoresIfAdmin = async () => {
      try {
        if (!session?.access_token) return;
        if (!isAdmin) return;

        const storesRes = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/stores`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!storesRes.ok) return;

        const payload = await storesRes.json().catch(() => null);
        const stores = (payload?.stores || []) as StoreInfo[];

        const sorted = [...stores].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
        setAllStores(sorted);

        // Default selection for admin: do not force a store; keep null = "my own".
      } catch (e) {
        console.warn('Failed to fetch stores list:', e);
      }
    };

    fetchStoresIfAdmin();
  }, [session?.access_token, isAdmin]);

  useEffect(() => {
    const fetchClientsAndProducts = async () => {
      try {
        if (!session?.access_token) return;

        const actingAsStoreId = selectedStore?.id;
        const storeQuery = actingAsStoreId ? `?store_id=${encodeURIComponent(actingAsStoreId)}` : '';

        const [templatesResponse, clientsResponse, productsResponse] = await Promise.all([
          fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/product-templates`,
            {
              headers: {
                Authorization: `Bearer ${session.access_token}`,
              },
            }
          ),
          fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/clients${storeQuery}`,
            {
              headers: {
                Authorization: `Bearer ${session.access_token}`,
              },
            }
          ),
          fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/products${storeQuery}`,
            {
              headers: {
                Authorization: `Bearer ${session.access_token}`,
              },
            }
          ),
        ]);

        if (templatesResponse.ok) {
          const tData = await templatesResponse.json().catch(() => null);
          setProductTemplates(tData?.templates || []);
        }

        if (clientsResponse.ok) {
          const data = await clientsResponse.json().catch(() => null);
          setClients(data?.clients || []);
        } else {
          // If backend does not support store_id filtering yet, fallback to default endpoint
          const fallback = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/clients`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (fallback.ok) {
            const data = await fallback.json().catch(() => null);
            setClients(data?.clients || []);
          }
        }

        if (productsResponse.ok) {
          const data = await productsResponse.json().catch(() => null);
          const rawProducts = data?.products || [];

          // Normalize products so price is always accessible
          const normalizedProducts = rawProducts.map((p: any) => {
            const toNum = (v: any) => {
              if (v === null || v === undefined) return null;
              if (typeof v === 'string') {
                // Support both "12.50" and "12,50"
                const cleaned = v.replace(',', '.');
                const n = parseFloat(cleaned);
                return Number.isFinite(n) ? n : null;
              }
              const n = Number(v);
              return Number.isFinite(n) ? n : null;
            };

            const salePrice =
              toNum(p?.sale_price) ??
              toNum(p?.salePrice) ??
              toNum(p?.price) ??
              toNum(p?.unit_price) ??
              toNum(p?.unitPrice) ??
              null;

            return {
              ...p,
              sale_price: salePrice ?? p?.sale_price,
            };
          });

          setProducts(normalizedProducts);
        } else {
          // Same fallback
          const fallback = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/products`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (fallback.ok) {
            const data = await fallback.json().catch(() => null);
            const rawProducts = data?.products || [];
            setProducts(rawProducts);
          }
        }
      } catch (error) {
        console.error('Error fetching clients and products:', error);
      }
    };

    fetchClientsAndProducts();
  }, [session?.access_token, selectedStore?.id]);

  const handleItemChange = (id: string, field: keyof InvoiceItem, value: string | number): void => {
    // If changing moyenne, validate against fourchette min/max
    if (field === 'moyenne') {
      const moyenneValue = parseFloat(String(value)) || 0;
      const item = invoiceData.items.find(i => i.id === id);

      if (item && item.description) {
        // Find the product using productId if available, otherwise by name
        const product = item.productId
          ? products.find(p => p.id === item.productId)
          : products.find(p => p.name === item.description);

        // Prefer template fourchette; fallback to product table
        const tpl = product ? (templateByReference.get(String(product.reference || '').trim()) || null) : null;
        const min = (tpl?.fourchette_min ?? product?.fourchette_min) ?? null;
        const max = (tpl?.fourchette_max ?? product?.fourchette_max) ?? null;

        if (min !== null && moyenneValue < Number(min)) {
          toast.error(`❌ Moyenne minimale: ${min}`);
          return;
        }

        if (max !== null && moyenneValue > Number(max)) {
          toast.error(`❌ Moyenne maximale: ${max}`);
          return;
        }
      }
    }

    setInvoiceData({
      ...invoiceData,
      items: invoiceData.items.map((item) => {
        if (item.id === id) {
          const updated: any = { ...item, [field]: value };

          // Quantité supports decimals
          if (field === 'quantity') {
            const qNum = typeof value === 'string'
              ? Number(String(value).replace(',', '.'))
              : Number(value);
            updated.quantity = Number.isFinite(qNum) ? qNum : 0;
          }

          if (field === 'quantity' || field === 'unitPrice') {
            updated.subtotal = (Number(updated.quantity) || 0) * (Number(updated.unitPrice) || 0);
          }
          if (field === 'quantity' || field === 'caisse') {
            const caisse = field === 'caisse' ? parseFloat(String(value)) || 0 : parseFloat(item.caisse) || 0;
            const quantity = field === 'quantity' ? (Number(updated.quantity) || 0) : (Number(item.quantity) || 0);
            
            if (caisse > 0 && quantity > 0) {
              updated.moyenne = (quantity / caisse).toFixed(2);
            } else {
              updated.moyenne = '';
            }
          }
          return updated;
        }
        return item;
      }),
    });
  };

  const addItem = (): void => {
    const newItem: InvoiceItem = {
      id: Date.now().toString(),
      description: '',
      caisse: '',
      quantity: 0,
      moyenne: '',
      unitPrice: 0,
      subtotal: 0,
    };
    setInvoiceData({
      ...invoiceData,
      items: [...invoiceData.items, newItem],
    });
  };

  const removeItem = (id: string): void => {
    setInvoiceData({
      ...invoiceData,
      items: invoiceData.items.filter((item) => item.id !== id),
    });
  };

  const calculateTotals = (): { subtotal: number; tva: number; total: number } => {
    const subtotal = invoiceData.items.reduce((sum, item) => sum + item.subtotal, 0);

    // Remise is an amount in MAD (not percentage)
    const remiseAmount = Math.max(0, Number(remise) || 0);

    // Apply remise BEFORE TVA (common invoice logic)
    const taxableBase = Math.max(0, subtotal - remiseAmount);

    const tvaRate = invoiceData.tvaPercentage / 100;
    const tva = taxableBase * tvaRate;

    const total = taxableBase + tva;
    return { subtotal, tva, total };
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
      toast.error('Veuillez entrer l\'ID du chèque');
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
          toast.error(error.error || 'Erreur lors de l\'upload');
        } catch {
          toast.error(`Erreur lors de l\'upload: ${response.status}`);
        }
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setUploadLoading(false);
    }
  };

  const handleGeneratePDF = async (uploadedProofUrl?: string): Promise<void> => {
    try {
      if (!invoiceData.client.name?.trim()) {
        toast.error('Veuillez sélectionner un client');
        return;
      }
      if (!invoiceData.items || invoiceData.items.length === 0) {
        toast.error('Veuillez ajouter au moins un article');
        return;
      }

      const totals = calculateTotals();

      const remiseAmount = Math.max(0, Number(remise) || 0);
      const subtotalAfterRemise = Math.max(0, totals.subtotal - remiseAmount);

      // 1) Create a document (keeps your existing documents system)
      const facturePayload = {
        type: 'Facture',
        clientName: invoiceData.client.name || 'Client',
        clientEmail: '',
        clientAddress: invoiceData.client.address || 'Adresse non spécifiée',
        clientICE: invoiceData.client.ice || '',
        clientIF: invoiceData.client.if || '',
        clientRC: invoiceData.client.rc || '',
        clientPatente: invoiceData.client.patente || '',
        companyAddress: invoiceData.company.referenceNumero || '',
        companyPhone: invoiceData.company.palette || '',
        companyEmail: invoiceData.company.transporteur || '',
        companyICE: invoiceData.company.fraisMaritime || '',
        companyIF: invoiceData.company.fraisTransit || '',
        companyRC: invoiceData.company.onssa || '',
        companyPatente: invoiceData.company.fraisDivers || '',
        date: new Date().toISOString().split('T')[0],
        items: invoiceData.items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.subtotal,
        })),
        notes: '',
        paymentHeaderNote: `Statut: ${invoiceData.status}`,

        // IMPORTANT: `documents/template` treats `remise` as percentage.
        // For Facture we use amount-based remise, so keep remise=0 and send amount in totalRemise.
        remise: 0,
        subtotal: totals.subtotal,
        totalRemise: remiseAmount,
        subtotalAfterRemise,
        tva: totals.tva,
        totalWithTVA: totals.total,
      };

      const factureResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/documents`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify(facturePayload),
        }
      );

      if (!factureResponse.ok) {
        toast.error('Erreur lors de la création du document');
        return;
      }

      const factureData = await factureResponse.json();
      const documentId = factureData.id;

      // 2) Save invoice FIRST so backend allocates FAC-000001
      const normalizedStatus =
        invoiceData.status === 'Payée'
          ? 'paid'
          : invoiceData.status === 'Partiellement payée'
            ? 'partial'
            : 'pending';

      const paidAmount = Number(invoiceData.amountPaid || 0) || 0;
      const remaining = Math.max(0, totals.total - paidAmount);

      const invoicePayload = {
        // Let backend allocate invoice_number (FAC-000001) atomically on save
        invoice_number: undefined,
        // Optional user-entered reference to display across the UI (history/details)
        // Backend will persist it in invoices.display_number (fallback to invoice_number).
        display_number: customInvoiceRef.trim() || undefined,
        client_name: invoiceData.client.name,
        client_phone: invoiceData.client.phone,
        client_address: invoiceData.client.address,
        client_ice: invoiceData.client.ice,
        payment_method: invoiceData.paymentMethod,
        bank_transfer_proof_url: uploadedProofUrl || bankProofUrl || undefined,
        total_amount: totals.total,
        amount_paid: (invoiceData.paymentMethod === 'cash' || invoiceData.paymentMethod === 'bank_transfer') ? paidAmount : 0,
        remaining_balance: (invoiceData.paymentMethod === 'cash' || invoiceData.paymentMethod === 'bank_transfer') ? remaining : totals.total,
        // Per-invoice remise (MAD). Backend stores it in invoices.pending_discount.
        pending_discount: remiseAmount,
        tva_percentage: invoiceData.tvaPercentage,
        status: normalizedStatus,
        items: invoiceData.items.map(item => ({
          description: item.description,
          productId: item.productId,
          reference: item.reference,
          category: item.category,
          lot: item.lot,
          fourchette_min: item.fourchette_min,
          fourchette_max: item.fourchette_max,
          caisse: item.caisse,
          moyenne: item.moyenne,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
        })),
        notes: '',
        additional_payments: additionalPayments,
      };

      let saveResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/invoices`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify(invoicePayload),
        }
      );

      // If the DB isn't migrated yet (missing display_number column), the backend insert can fail.
      // Retry once without display_number to avoid blocking invoice creation.
      if (!saveResponse.ok) {
        const errorText = await saveResponse.text().catch(() => '');
        const msg = (errorText || '').toLowerCase();

        const looksLikeMissingDisplayNumber =
          msg.includes('display_number') ||
          msg.includes('invoice_display_number') ||
          msg.includes('custom_invoice_ref') ||
          msg.includes('column') && msg.includes('display');

        if (looksLikeMissingDisplayNumber) {
          const fallbackPayload = { ...invoicePayload } as any;
          delete fallbackPayload.display_number;

          saveResponse = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/invoices`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session?.access_token}`,
              },
              body: JSON.stringify(fallbackPayload),
            }
          );
        }

        if (!saveResponse.ok) {
          const errorText2 = await saveResponse.text().catch(() => '');
          const msg2 = (errorText2 || '').toLowerCase();

          // Duplicate invoice_number (unique violation)
          if (
            saveResponse.status === 409 ||
            msg2.includes('duplicate') ||
            msg2.includes('unique') ||
            msg2.includes('invoice_number')
          ) {
            toast.error('❌ Numéro de facture déjà existant. Opération annulée.');
          } else {
            // Expose backend error details to debug what is failing (schema, RLS, validation, etc.)
            const short = (errorText2 || '').slice(0, 250);
            toast.error(`❌ Impossible de sauvegarder la facture. ${saveResponse.status} ${short}`);
          }

          return;
        }
      }

      const saved = await saveResponse.json().catch(() => null);
      const backendInvoiceNumber = saved?.invoice?.invoice_number || saved?.invoice_number || null;

      // Update UI with the saved (consumed) invoice number
      if (backendInvoiceNumber) setInvoiceId(String(backendInvoiceNumber));

      // Immediately preview the NEXT number (no increment) so the form is ready
      // for the next invoice without requiring a page reload.
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/invoices/preview-number?counter_id=global`,
          {
            headers: {
              Authorization: `Bearer ${session?.access_token}`,
            },
          }
        );
        if (res.ok) {
          const data = await res.json().catch(() => null);
          const n = data?.invoice_number;
          if (typeof n === 'string' && n) {
            // show the next number (preview) after save
            setInvoiceId(n);
          }
        }
      } catch {
        // ignore
      }

      // IMPORTANT: Trigger a refresh of sales/invoices data so the Products page
      // can recalculate "Ventes Totales" with the newly created invoice
      // This is done by emitting a custom event that ProductsModule listens to
      try {
        window.dispatchEvent(new CustomEvent('invoiceCreated', { detail: { invoiceNumber: backendInvoiceNumber } }));
      } catch (e) {
        console.warn('Could not dispatch invoiceCreated event:', e);
      }

      // 3) Generate PDF using invoiceNumber = FAC-000001 (NOT documentId)
      // If the user typed a reference, use it; otherwise use backend invoice number.
      const finalInvoiceRef = customInvoiceRef.trim() || (backendInvoiceNumber ? String(backendInvoiceNumber) : '');

      const pdfData = {
        clientName: invoiceData.client.name,
        clientPhone: invoiceData.client.phone,
        clientAddress: invoiceData.client.address,
        clientICE: invoiceData.client.ice,
        clientIF: invoiceData.client.if,
        clientRC: invoiceData.client.rc,
        clientPatente: invoiceData.client.patente,
        companyAddress: invoiceData.company.referenceNumero,
        companyPhone: invoiceData.company.palette,
        companyEmail: invoiceData.company.transporteur,
        companyICE: invoiceData.company.fraisMaritime,
        companyIF: invoiceData.company.fraisTransit,
        companyRC: invoiceData.company.onssa,
        companyPatente: invoiceData.company.fraisDivers,
        date: new Date().toISOString().split('T')[0],
        items: invoiceData.items.map(item => ({
          description: item.description,
          caisse: item.caisse,
          quantity: item.quantity,
          moyenne: item.moyenne,
          unitPrice: item.unitPrice,
          total: item.subtotal,
        })),
        paymentHeaderNote: `Statut: ${invoiceData.status}`,
        subtotal: totals.subtotal,
        totalRemise: remiseAmount,
        tva: totals.tva,
        totalWithTVA: totals.total,
      };

      const queryParams = new URLSearchParams();
      queryParams.append('type', 'Facture');
      queryParams.append('clientName', pdfData.clientName);
      queryParams.append('clientPhone', pdfData.clientPhone);
      queryParams.append('clientAddress', pdfData.clientAddress);
      queryParams.append('clientICE', pdfData.clientICE);
      if (pdfData.clientIF && pdfData.clientIF !== 'XXXXXXXXXX') queryParams.append('clientIF', pdfData.clientIF);
      if (pdfData.clientRC && pdfData.clientRC !== 'XXXXXXXXXX') queryParams.append('clientRC', pdfData.clientRC);
      if (pdfData.clientPatente && pdfData.clientPatente !== 'XXXXXXXXXX') queryParams.append('clientPatente', pdfData.clientPatente);
      queryParams.append('companyAddress', pdfData.companyAddress);
      queryParams.append('companyPhone', pdfData.companyPhone);
      queryParams.append('companyEmail', pdfData.companyEmail);
      queryParams.append('companyICE', pdfData.companyICE);
      if (pdfData.companyIF && pdfData.companyIF !== 'XXXXXXXXXX') queryParams.append('companyIF', pdfData.companyIF);
      if (pdfData.companyRC && pdfData.companyRC !== 'XXXXXXXXXX') queryParams.append('companyRC', pdfData.companyRC);
      if (pdfData.companyPatente && pdfData.companyPatente !== 'XXXXXXXXXX') queryParams.append('companyPatente', pdfData.companyPatente);
      queryParams.append('referenceNumero', invoiceData.company.referenceNumero);
      queryParams.append('palette', invoiceData.company.palette);
      queryParams.append('transporteur', invoiceData.company.transporteur);
      queryParams.append('fraisMaritime', invoiceData.company.fraisMaritime.toString());
      queryParams.append('fraisTransit', invoiceData.company.fraisTransit.toString());
      queryParams.append('onssa', invoiceData.company.onssa.toString());
      queryParams.append('fraisDivers', invoiceData.company.fraisDivers.toString());
      queryParams.append('fraisTransport', invoiceData.company.fraisTransport.toString());
      queryParams.append('dateDecharge', invoiceData.company.dateDecharge);
      queryParams.append('entrepot', invoiceData.company.entrepot);
      queryParams.append('dateChargement', invoiceData.company.dateChargement);
      queryParams.append('matricule', invoiceData.company.matricule);
      queryParams.append('magasinage', invoiceData.company.magasinage.toString());
      queryParams.append('taxe', invoiceData.company.taxe.toString());
      queryParams.append('date', pdfData.date);
      queryParams.append('items', JSON.stringify(pdfData.items));
      queryParams.append('subtotal', pdfData.subtotal.toString());
      // The PDF template supports amount-based remise via totalRemise/subtotalAfterRemise.
      // Keep `remise` (percentage) at 0.
      queryParams.append('remise', '0');
      queryParams.append('remisePercentage', '0');
      queryParams.append('totalRemise', String(remiseAmount));
      queryParams.append('subtotalAfterRemise', String(subtotalAfterRemise));
      queryParams.append('tva', pdfData.tva.toString());
      queryParams.append('tvaPercentage', invoiceData.tvaPercentage.toString());
      queryParams.append('totalWithTVA', pdfData.totalWithTVA.toString());
      queryParams.append('paymentHeaderNote', pdfData.paymentHeaderNote);
      // Use the user custom ref if provided, otherwise use the backend invoice number.
      if (finalInvoiceRef) queryParams.append('invoiceNumber', finalInvoiceRef);

      const pdfResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/documents/${documentId}/pdf?${queryParams.toString()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/pdf',
            'Authorization': `Bearer ${session?.access_token}`,
          },
        }
      );

      if (!pdfResponse.ok) {
        toast.error('Erreur lors du téléchargement du PDF');
        return;
      }

      const blob = await pdfResponse.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      // Download name should match the displayed reference on the PDF
      link.download = `${finalInvoiceRef || backendInvoiceNumber || documentId}.pdf`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);

      // Toast should match the displayed reference on the PDF
      toast.success(`Facture générée: ${finalInvoiceRef || backendInvoiceNumber || documentId}`);
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const totals = calculateTotals();

  const loadDeliveryNotes = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/sales`,
        {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const sales = data.sales || [];

        // Keep only BL-like rows (exclude PURCHASE/TRANSFER)
        const blRows = sales.filter((sale: any) => {
          const dt = String(sale.doc_type || '').toUpperCase();
          if (dt === 'ACHAT' || dt === 'TRANSFER') return false;
          const sn = String(sale.sale_number || '').toUpperCase();
          return dt === 'BL' || dt === 'VENTE' || sn.startsWith('BL');
        });

        const bonLivraisons = blRows.map((sale: any) => {
          const saleItems = Array.isArray(sale.items) ? sale.items : [];

          return {
            id: sale.id,
            sale_number: sale.sale_number,
            type: 'Bon Livraison',
            clientName: sale.client_name || sale.created_for_store_name || 'Client',
            clientEmail: sale.client_phone || '',
            clientAddress: sale.client_address || '',
            clientICE: sale.client_ice || '',
            clientIF: sale.client_if_number || '',
            clientRC: sale.client_rc || '',
            clientPatente: sale.client_patente || '',
            date: sale.created_at || new Date().toISOString(),
            items: saleItems,
            totalWithTVA: sale.total_amount || 0,
            delivery_status: sale.delivery_status,
            payment_status: sale.payment_status,
            amount_paid: sale.amount_paid,
            payment_method: sale.payment_method,
            client_phone: sale.client_phone,
            client_address: sale.client_address,
            client_ice: sale.client_ice,
            client_if_number: sale.client_if_number,
            client_rc: sale.client_rc,
            client_patente: sale.client_patente,
          };
        });

        setDocuments(bonLivraisons);
        setFilteredDocuments([]);

        if (bonLivraisons.length === 0) {
          toast.info('Aucun bon de livraison trouvé.');
        }
      } else {
        toast.error('Erreur lors du chargement des bons de livraison');
      }
    } catch (error) {
      console.error('Error loading delivery notes:', error);
      toast.error('Erreur lors du chargement des bons de livraison');
    }
  };

  const convertDocumentToInvoice = (doc: any) => {
    if (!doc) return;

    const items = (doc.items || []).map((item: any, index: number) => {
      return {
        id: `item-${index}`,
        description: item.description || item.name || '',
        caisse: item.caisse || '',
        quantity: item.quantity || 0,
        moyenne: item.moyenne || '',
        unitPrice: item.unitPrice || item.unit_price || item.price || 0,
        subtotal: item.total || item.subtotal || (item.quantity * (item.unitPrice || item.unit_price || item.price || 0)) || 0,
      };
    });

    setInvoiceData({
      ...invoiceData,
      client: {
        name: doc.clientName || '',
        phone: doc.clientEmail || doc.client_phone || '',
        address: doc.clientAddress || doc.client_address || '',
        ice: doc.clientICE || doc.client_ice || '',
        if: doc.clientIF || doc.client_if_number || '',
        rc: doc.clientRC || doc.client_rc || '',
        patente: doc.clientPatente || doc.client_patente || '',
      },
      items: items,
      status: doc.payment_status === 'paid' ? 'Payée' : (doc.payment_status === 'partial' ? 'Partiellement payée' : 'Non Payée'),
      paymentMethod: (doc.payment_method || 'cash') as 'cash' | 'check' | 'bank_transfer',
      amountPaid: doc.amount_paid || 0,
    });

    setFilteredProducts([]);
    setProductDialogOpen(null);
    setHasUserTyped({});

    setShowDocumentDialog(false);
    toast.success(`Bon de Livraison "${doc.id}" converti en facture - ${items.length} article(s) importé(s)`);
  };

  if (!canViewFactures) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Accès refusé</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">Vous n'avez pas la permission « Voir les Factures ».</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header with Generate PDF Button */}
      <div className="flex flex-row justify-between items-center mb-8 w-full gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900">Créer une Facture</h1>

          {session?.user?.user_metadata?.role === 'admin' && (
            <div className="mt-3 max-w-xl">
              <Label className="text-sm font-semibold text-gray-700 mb-2 block">Agir en tant que magasin</Label>
              <select
                value={selectedStore?.id || ''}
                onChange={(e) => {
                  const storeId = e.target.value;
                  const store = allStores.find((s) => s.id === storeId) || null;
                  setSelectedStore(store);

                  // reset suggestions when store changes
                  setFilteredClients([]);
                  setShowClientSuggestions(false);
                  setFilteredProducts([]);
                  setShowProductSuggestions({});
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
              >
                <option value="">Mon magasin (par défaut)</option>
                {allStores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {selectedStore && (
                <p className="text-xs text-gray-600 mt-1">
                  Vous agissez maintenant en tant que <span className="font-semibold">{selectedStore.name}</span>
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Dialog
            open={showDocumentDialog}
            onOpenChange={(open) => {
              if (open && !canCreateFacture && !canEditFacture) {
                toast.error("Vous n'avez pas la permission « Créer une Facture »");
                return;
              }
              setShowDocumentDialog(open);
            }}
          >
            <DialogTrigger asChild>
              <Button 
                size="lg"
                style={{ backgroundColor: '#f59e0b', color: 'white' }}
                disabled={!canCreateFacture && !canEditFacture}
                title={!canCreateFacture && !canEditFacture ? "Vous n'avez pas la permission « Créer une Facture »" : undefined}
              >
                <Upload className="w-5 h-5" />
                Convertir BL
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col" aria-describedby="convert-bl-description">
              <DialogHeader>
                <DialogTitle>Convertir un Bon de Livraison en Facture</DialogTitle>
                <div id="convert-bl-description" className="sr-only">
                  Sélectionnez un bon de livraison pour le convertir en facture
                </div>
              </DialogHeader>
              <div className="space-y-4 flex-1 flex flex-col min-h-0">
                <div className="relative flex-shrink-0">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Rechercher un bon de livraison..."
                    className="pl-10"
                    onChange={(e) => {
                      const term = e.target.value.toLowerCase();
                      if (term.trim() === '') {
                        setFilteredDocuments([]);
                      } else {
                        if (documents.length === 0) {
                          loadDeliveryNotes();
                        }
                        const filtered = documents.filter(doc => {
                          const matchesSearch = 
                            doc.id?.toLowerCase().includes(term) ||
                            doc.sale_number?.toLowerCase().includes(term) ||
                            doc.clientName?.toLowerCase().includes(term);
                          
                          const isSearchingById = 
                            doc.id?.toLowerCase().includes(term) ||
                            doc.sale_number?.toLowerCase().includes(term);
                          
                          if (isSearchingById) {
                            return matchesSearch;
                          }
                          
                          return matchesSearch && doc.clientName !== 'Client';
                        });
                        
                        setFilteredDocuments(filtered);
                      }
                    }}
                  />
                </div>

                {filteredDocuments.length === 0 ? (
                  <div className="text-center py-12 flex-1 flex items-center justify-center">
                    <p className="text-gray-500">Aucun bon de livraison trouvé</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden flex flex-col flex-1 min-h-0">
                    <div className="overflow-y-auto flex-1">
                      <Table>
                        <TableHeader className="sticky top-0 bg-white z-10">
                          <TableRow>
                            <TableHead className="w-1/5">Numéro</TableHead>
                            <TableHead className="w-1/4">Client</TableHead>
                            <TableHead className="w-1/5">Date</TableHead>
                            <TableHead className="w-1/5">Montant</TableHead>
                            <TableHead className="w-1/5 text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredDocuments.map((doc) => (
                            <TableRow key={doc.id} className="hover:bg-gray-50">
                              <TableCell className="font-semibold text-sm">{doc.sale_number || doc.id}</TableCell>
                              <TableCell className="text-sm">{doc.clientName}</TableCell>
                              <TableCell className="text-sm">{new Date(doc.date).toLocaleDateString('fr-FR')}</TableCell>
                              <TableCell className="font-semibold text-sm">{(doc.totalWithTVA || 0).toFixed(2)} MAD</TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  style={{ backgroundColor: '#10b981', color: 'white' }}
                                  onClick={() => convertDocumentToInvoice(doc)}
                                  className="whitespace-nowrap"
                                >
                                  <Check className="w-4 h-4 mr-1" />
                                  Convertir
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
          <Button 
            onClick={() => {
              if (!canCreateFacture && !canEditFacture) {
                toast.error("Vous n'avez pas la permission « Créer une Facture »");
                return;
              }
              handleGeneratePDF();
            }}
            size="lg"
            style={{ backgroundColor: '#ea580c', color: 'white' }}
            disabled={!canCreateFacture && !canEditFacture}
            title={!canCreateFacture && !canEditFacture ? "Vous n'avez pas la permission « Créer une Facture »" : undefined}
          >
            <Download className="w-5 h-5" />
            Générer PDF
          </Button>
        </div>
      </div>

      {/* Admin gate: require selecting a magasin before enabling inputs */}
      {isAdmin && !selectedStore && (
        <Card>
          <CardHeader>
            <CardTitle>Magasin requis</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700">
              Vous êtes connecté en tant qu'admin. Veuillez sélectionner un magasin ("Agir en tant que magasin") pour activer la saisie.
            </p>
          </CardContent>
        </Card>
      )}

      <div className={(isAdmin && !selectedStore) || (!canCreateFacture && !canEditFacture) ? 'pointer-events-none opacity-50' : ''}>

      <div className="grid grid-cols-1 gap-6">
        {/* Client Information */}
        <Card>
          <CardHeader>
            <CardTitle>Informations Client</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-semibold text-gray-700 mb-2 block">N° Facture</Label>
              <Input
                value={customInvoiceRef}
                onChange={(e) => setCustomInvoiceRef(e.target.value)}
                onBlur={() => setCustomInvoiceRef((v) => String(v || '').trim())}
                placeholder={invoiceId ? `Par défaut: ${invoiceId}` : 'Par défaut: FAC-XXXXXX'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono font-semibold"
              />
              <p className="text-xs text-gray-500 mt-1">Laissez vide pour utiliser le numéro auto-généré</p>
            </div>
            <div className="relative">
              <Label>Nom du Client</Label>
              <Input
                value={invoiceData.client.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleClientChange('name', e.target.value)}
                onFocus={() => invoiceData.client.name && setShowClientSuggestions(true)}
                placeholder="Tapez le nom d'un client..."
              />
              
              {showClientSuggestions && filteredClients.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                  {filteredClients.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => selectClient(client)}
                      className="w-full text-left px-4 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors"
                    >
                      <div className="font-medium text-gray-900">{client.name}</div>
                      <div className="text-xs text-gray-500">
                        📱 {client.phone} | 🏢 {client.ice}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Téléphone</Label>
              <Input
                value={invoiceData.client.phone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleClientChange('phone', e.target.value)}
              />
            </div>
            <div>
              <Label>Adresse</Label>
              <Input
                value={invoiceData.client.address}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleClientChange('address', e.target.value)}
              />
            </div>
            <div>
              <Label>ICE</Label>
              <Input
                value={invoiceData.client.ice}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleClientChange('ice', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>IF</Label>
                <Input
                  value={invoiceData.client.if}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleClientChange('if', e.target.value)}
                />
              </div>
              <div>
                <Label>RC</Label>
                <Input
                  value={invoiceData.client.rc}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleClientChange('rc', e.target.value)}
                />
              </div>
              <div>
                <Label>Patente</Label>
                <Input
                  value={invoiceData.client.patente}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleClientChange('patente', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invoice Items */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Articles de la Facture</CardTitle>
            <Button onClick={addItem} size="sm" className="gap-2">
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
                  <th className="text-left py-2 px-2">Description</th>
                  <th className="text-left py-2 px-2">Caisse</th>
                  <th className="text-left py-2 px-2">Quantité</th>
                  <th className="text-left py-2 px-2">Moyenne</th>
                  <th className="text-left py-2 px-2">Prix Unitaire</th>
                  <th className="text-left py-2 px-2">Sous-total</th>
                  <th className="text-center py-2 px-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {invoiceData.items.map((item, index) => (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-2">{index + 1}</td>
                    <td className="py-2 px-2 relative">
                      <Input
                        value={item.description}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          const searchValue = e.target.value;
                          handleItemChange(item.id, 'description', searchValue);
                          if (searchValue.trim() === '') {
                            setShowProductSuggestions({ ...showProductSuggestions, [item.id]: false });
                          } else {
                            const filtered = products.filter(product =>
                              product.name?.toLowerCase().includes(searchValue.toLowerCase()) ||
                              product.reference?.toLowerCase().includes(searchValue.toLowerCase())
                            );
                            setFilteredProducts(filtered);
                            setShowProductSuggestions({ ...showProductSuggestions, [item.id]: filtered.length > 0 });
                          }
                        }}
                        onFocus={() => {
                          if (item.description.trim() === '') {
                            setShowProductSuggestions({ ...showProductSuggestions, [item.id]: false });
                          } else {
                            setShowProductSuggestions({ ...showProductSuggestions, [item.id]: true });
                          }
                        }}
                        className="h-8 relative z-10"
                        placeholder="Tapez le nom du produit..."
                      />
                      {/* Product Suggestions Dropdown */}
                      {showProductSuggestions[item.id] && filteredProducts.length > 0 && (
                        <div className="fixed bg-white border border-gray-300 rounded-lg shadow-2xl z-[9999] min-w-[500px]" style={{
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          maxHeight: '70vh',
                          display: 'flex',
                          flexDirection: 'column',
                        }}>
                          {/* Header */}
                          <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-blue-100">
                            <h3 className="font-semibold text-gray-900 text-sm">🔍 Produits disponibles</h3>
                            <p className="text-xs text-gray-600 mt-1">{filteredProducts.length} résultat{filteredProducts.length > 1 ? 's' : ''}</p>
                          </div>
                          
                          {/* Scrollable List */}
                          <div className="overflow-y-auto flex-1">
                            {filteredProducts.map((product) => {
                              // Always prefer per-store stock (store_stocks) / computed totals from backend.
                              // quantity_available can be stale in some flows, so keep it as a last fallback.
                              const stock =
                                Number(product?.total_store_stock ?? 0) > 0
                                  ? Number(product.total_store_stock)
                                  : product?.store_stocks && typeof product.store_stocks === 'object'
                                    ? Object.values(product.store_stocks).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0)
                                    : (Number(product?.quantity_available) || 0);

                              // Read template data by product reference (source of truth)
                              const tpl = templateByReference.get(String(product?.reference || '').trim()) || null;
                              const tplName = tpl?.name ?? null;
                              const tplRef = String(tpl?.reference_number || tpl?.reference || '').trim() || null;
                              const tplMin = tpl?.fourchette_min ?? null;
                              const tplMax = tpl?.fourchette_max ?? null;
                              const hasFourchette = tplMin !== null || tplMax !== null;
                              
                              return (
                                <button
                                  key={product.id}
                                  type="button"
                                  onClick={() => {
                                    // Block selecting products that are out of stock
                                    if ((Number(stock) || 0) <= 0) {
                                      toast.error(`❌ Rupture de stock: ${product.name}`);
                                      return;
                                    }

                                    // Only import product name + unit price (as requested).
                                    // Do NOT auto-fill caisse/quantity/moyenne/subtotal.
                                    // Some products may have the price under different keys.
                                    const toNum = (v: any) => {
                                      const n = typeof v === 'string' ? parseFloat(v) : Number(v);
                                      return Number.isFinite(n) ? n : 0;
                                    };

                                    // Use purchase_price as the unit price for Facture (as requested).
                                    // We still try a few variants for robustness.
                                    const purchasePrice =
                                      toNum(product?.purchase_price) ||
                                      toNum(product?.purchasePrice) ||
                                      toNum(product?.buy_price) ||
                                      toNum(product?.buyPrice) ||
                                      toNum(product?.cost_price) ||
                                      toNum(product?.costPrice) ||
                                      0;

                                    if (!purchasePrice) {
                                      console.warn('[FactureModule] selected product has no purchase_price:', product);
                                      toast.error(
                                        '⚠️ Prix Unitaire manquant pour ce produit (purchase_price est vide). Ouvrez Produits et mettez un prix d\'achat.'
                                      );
                                    }

                                    const updatedItem = {
                                      description: product.name,
                                      productId: product.id,
                                      unitPrice: purchasePrice,
                                      reference: (tplRef ?? product.reference) || undefined,
                                      category: product.category || undefined,
                                      lot: product.lot || undefined,
                                      // Prefer template fourchette when available.
                                      fourchette_min: (tplMin ?? product.fourchette_min) ?? undefined,
                                      fourchette_max: (tplMax ?? product.fourchette_max) ?? undefined,
                                    };

                                    setInvoiceData({
                                      ...invoiceData,
                                      items: invoiceData.items.map((i) => {
                                        if (i.id === item.id) {
                                          const merged: any = {
                                            ...i,
                                            ...updatedItem,
                                            // Store stock so we can cap caisse/quantity inputs
                                            __available_stock: stock,
                                          };
                                          // keep subtotal consistent; if qty is still 0 (user hasn't entered it yet),
                                          // leave subtotal at 0 until quantity is provided.
                                          merged.subtotal = (merged.quantity || 0) * (merged.unitPrice || 0);

                                          // If user hasn't filled qty yet, keep it 0 but make sure
                                          // unit price is visible immediately.
                                          if (!merged.unitPrice && purchasePrice) {
                                            merged.unitPrice = purchasePrice;
                                          }

                                          return merged;
                                        }
                                        return i;
                                      }),
                                    });

                                    setShowProductSuggestions({ ...showProductSuggestions, [item.id]: false });
                                    toast.success(`${product.name} ajouté`);
                                  }}
                                  className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors group"
                                >
                                  <div className="flex justify-between items-start gap-3">
                                    <div className="flex-1">
                                      <div className="font-medium text-gray-900 text-sm group-hover:text-blue-600">{product.name}</div>
                                      <div className="text-xs text-gray-600 mt-1">
                                        Ref: <span className="font-mono text-gray-700">{tplRef || product.reference}</span>
                                      </div>
                                      {tplName && tplName !== product.name && (
                                        <div className="text-xs text-gray-600 mt-1">
                                          Modèle: <span className="font-mono text-gray-700">{tplName}</span>
                                        </div>
                                      )}
                                      <div className="text-xs text-gray-600 mt-1">
                                        📦 Stock: <span className="font-semibold text-blue-700">{stock} unités</span>
                                      </div>
                                      {hasFourchette && (
                                        <div className="text-xs text-gray-600 mt-1">
                                          📊 Fourchette: <span className="font-semibold text-purple-700">{tplMin ?? '-'} - {tplMax ?? '-'}</span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="text-right flex flex-col gap-1">
                                      <span className={`inline-block px-2 py-1 rounded text-xs font-semibold whitespace-nowrap ${
                                        stock > 0
                                          ? 'bg-green-100 text-green-800' 
                                          : 'bg-red-100 text-red-800'
                                      }`}>
                                        {stock > 0 ? `✓ ${stock}` : '✗ Rupture'}
                                      </span>
                                      {hasFourchette && (
                                        <span className="inline-block px-2 py-1 rounded text-xs font-semibold bg-purple-100 text-purple-800 whitespace-nowrap">
                                          Fourchette
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                          
                          {/* Footer */}
                          <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-600">
                            Cliquez sur un produit pour le sélectionner
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      <Input
                        value={item.caisse}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          const v = e.target.value;
                          const available = Number((item as any).__available_stock);
                          const n = parseFloat(String(v)) || 0;
                          if (Number.isFinite(available) && available >= 0 && n > available) {
                            toast.error(`❌ Stock insuffisant: max ${available}`);
                            handleItemChange(item.id, 'caisse', String(available));
                            return;
                          }
                          handleItemChange(item.id, 'caisse', v);
                        }}
                        onBlur={() => {
                          // Validate moyenne when leaving caisse field
                          const caisse = parseFloat(item.caisse) || 0;
                          const quantity = item.quantity || 0;
                          if (caisse > 0 && quantity > 0) {
                            const calculatedMoyenne = parseFloat((quantity / caisse).toFixed(2));
                            const product = item.productId
                              ? products.find(p => p.id === item.productId)
                              : products.find(p => p.name === item.description);
                            if (product && (product.fourchette_min !== null || product.fourchette_max !== null)) {
                              const min = product.fourchette_min;
                              const max = product.fourchette_max;
                              if (min !== null && calculatedMoyenne < min) {
                                toast.error(`❌ Moyenne minimale requise: ${min} (calculée: ${calculatedMoyenne})`);
                              } else if (max !== null && calculatedMoyenne > max) {
                                toast.error(`❌ Moyenne maximale autorisée: ${max} (calculée: ${calculatedMoyenne})`);
                              }
                            }
                          }
                        }}
                        className="h-8"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        value={item.quantity === 0 ? '' : item.quantity}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          const raw = e.target.value === '' ? 0 : parseFloat(String(e.target.value).replace(',', '.'));
                          handleItemChange(item.id, 'quantity', raw);
                        }}
                        onBlur={() => {
                          // Validate moyenne when leaving quantity field
                          const caisse = parseFloat(item.caisse) || 0;
                          const quantity = parseFloat(item.quantity.toString()) || 0;
                          if (caisse > 0 && quantity > 0) {
                            const calculatedMoyenne = parseFloat((quantity / caisse).toFixed(2));
                            const product = item.productId
                              ? products.find(p => p.id === item.productId)
                              : products.find(p => p.name === item.description);
                            if (product && (product.fourchette_min !== null || product.fourchette_max !== null)) {
                              const min = product.fourchette_min;
                              const max = product.fourchette_max;
                              if (min !== null && calculatedMoyenne < min) {
                                toast.error(`❌ Moyenne minimale requise: ${min} (calculée: ${calculatedMoyenne})`);
                              } else if (max !== null && calculatedMoyenne > max) {
                                toast.error(`❌ Moyenne maximale autorisée: ${max} (calculée: ${calculatedMoyenne})`);
                              }
                            }
                          }
                        }}
                        className="h-8"
                        placeholder=""
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Input
                        value={item.moyenne}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleItemChange(item.id, 'moyenne', e.target.value)}
                        className="h-8"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Input
                        type="number"
                        value={item.unitPrice === 0 ? '' : item.unitPrice}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleItemChange(item.id, 'unitPrice', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                        className="h-8"
                        placeholder=""
                      />
                    </td>
                    <td className="py-2 px-2 font-semibold">
                      {(item.quantity > 0 && item.unitPrice > 0) ? `${item.subtotal.toFixed(2)} MAD` : '—'}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <Button
                        onClick={() => removeItem(item.id)}
                        size="sm"
                        variant="destructive"
                        className="h-8 w-8 p-0"
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

      {/* Totals */}
      <Card>
        <CardHeader>
          <CardTitle>Résumé</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between mb-3">
                  <span className="text-gray-600">Sous-total HT:</span>
                  <span className="font-bold text-lg">{totals.subtotal.toFixed(2)} MAD</span>
                </div>
                <div className="flex justify-between mb-3">
                  <span className="text-gray-600">Remise ({(Number(remise) || 0).toFixed(2)} MAD):</span>
                  <span className="font-bold text-lg">-{(Number(remise) || 0).toFixed(2)} MAD</span>
                </div>
                <div className="flex justify-between mb-3">
                  <span className="text-gray-600">TVA ({invoiceData.tvaPercentage}%):</span>
                  <span className="font-bold text-lg">{totals.tva.toFixed(2)} MAD</span>
                </div>
                <div className="border-t pt-3 flex justify-between">
                  <span className="text-gray-900 font-bold">Total TTC:</span>
                  <span className="font-bold text-2xl text-blue-600">{totals.total.toFixed(2)} MAD</span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-semibold">Remise (MAD)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={remise}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const value = parseFloat(e.target.value) || 0;
                      setRemise(Math.max(0, value));
                    }}
                    placeholder="0"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm font-semibold">TVA (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={invoiceData.tvaPercentage}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const value = parseFloat(e.target.value) || 0;
                      setInvoiceData({
                        ...invoiceData,
                        tvaPercentage: Math.max(0, Math.min(100, value)),
                      });
                    }}
                    placeholder="0"
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Payment Status */}
            <div className="border-t pt-4">
              <div className="mb-4">
                <div className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                  invoiceData.status === 'Payée' 
                    ? 'bg-green-100 text-green-800' 
                    : invoiceData.status === 'Partiellement payée'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {invoiceData.status === 'Payee' ? '✓ Payée' : invoiceData.status === 'Partiellement payée' ? '◐ Partiellement Payée' : '✗ Non Payée'}
                </div>
              </div>

              {/* Payment Method Selection */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Méthode de Paiement</Label>
                <div className="flex flex-col gap-3">
                  <Button
                    onClick={() => setInvoiceData({ ...invoiceData, paymentMethod: 'cash' })}
                    variant={invoiceData.paymentMethod === 'cash' ? 'default' : 'outline'}
                    className="w-full justify-start"
                  >
                     Espèces
                  </Button>
                  <Button
                    onClick={() => setInvoiceData({ ...invoiceData, paymentMethod: 'check' })}
                    variant={invoiceData.paymentMethod === 'check' ? 'default' : 'outline'}
                    className="w-full justify-start"
                  >
                     Chèque
                  </Button>
                  <Button
                    onClick={() => setInvoiceData({ ...invoiceData, paymentMethod: 'bank_transfer' })}
                    variant={invoiceData.paymentMethod === 'bank_transfer' ? 'default' : 'outline'}
                    className="w-full justify-start"
                  >
                     Virement bancaire
                  </Button>
                </div>
              </div>
              {invoiceData.paymentMethod === 'cash' && (
                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                  <Label className="text-sm font-semibold text-gray-700 mb-2 block">Montant Payé</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      placeholder="Entrez le montant payé"
                      value={invoiceData.amountPaid || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const amountPaid = parseFloat(e.target.value) || 0;
                        let newStatus: 'Payée' | 'Non Payée' = 'Non Payée';
                        
                        if (amountPaid > 0) {
                          if (amountPaid >= totals.total) {
                            newStatus = 'Payée';
                          } else {
                            newStatus = 'Partiellement payée' as any;
                          }
                        }
                        
                        setInvoiceData({
                          ...invoiceData,
                          amountPaid: amountPaid,
                          status: newStatus,
                        });
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                    <span className="font-semibold text-gray-700">MAD</span>
                  </div>
                  {invoiceData.amountPaid !== undefined && invoiceData.amountPaid > 0 && (
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total:</span>
                        <span className="font-semibold">{totals.total.toFixed(2)} MAD</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Payé:</span>
                        <span className="font-semibold text-green-600">{invoiceData.amountPaid.toFixed(2)} MAD</span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="text-gray-600">Reste:</span>
                        <span className={`font-semibold ${(totals.total - invoiceData.amountPaid) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {(totals.total - invoiceData.amountPaid).toFixed(2)} MAD
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {invoiceData.paymentMethod === 'bank_transfer' && (
                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200 space-y-3">
                  <Label className="text-sm font-semibold text-gray-700 mb-2 block">Montant Payé (Virement)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      placeholder="Entrez le montant payé"
                      value={invoiceData.amountPaid || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const amountPaid = parseFloat(e.target.value) || 0;
                        let newStatus: 'Payée' | 'Non Payée' = 'Non Payée';
                        if (amountPaid > 0) {
                          if (amountPaid >= totals.total) {
                            newStatus = 'Payée';
                          } else {
                            newStatus = 'Partiellement payée' as any;
                          }
                        }
                        setInvoiceData({
                          ...invoiceData,
                          amountPaid,
                          status: newStatus,
                        });
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <span className="font-semibold text-gray-700">MAD</span>
                  </div>
                  {invoiceData.amountPaid !== undefined && (
                    <div className="mt-1 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total:</span>
                        <span className="font-semibold">{totals.total.toFixed(2)} MAD</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Payé:</span>
                        <span className="font-semibold text-indigo-600">{(invoiceData.amountPaid || 0).toFixed(2)} MAD</span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="text-gray-600">Reste:</span>
                        <span className={`font-semibold ${((totals.total - (invoiceData.amountPaid || 0)) > 0) ? 'text-orange-600' : 'text-green-600'}`}>
                          {(Math.max(0, totals.total - (invoiceData.amountPaid || 0))).toFixed(2)} MAD
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="pt-2">
                    <Label className="text-sm font-semibold text-gray-700 mb-2 block">Preuve de Virement (image ou PDF)</Label>
                    <Input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setBankProofFile(e.target.files?.[0] || null)}
                    />
                    {bankProofUrl && (
                      <p className="text-xs text-gray-600 mt-2">Fichier prêt: {bankProofUrl}</p>
                    )}
                  </div>
                </div>
              )}
              {invoiceData.paymentMethod === 'check' && (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <Label className="text-sm font-semibold text-gray-700 mb-2 block">Sélectionner un Chèque</Label>
                  
                  {checkDialogOpen && (
                    <Card className="mt-4 w-full">
                      <CardHeader>
                        <CardTitle>Sélectionner un Chèque pour le Paiement</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <Input
                            placeholder="Rechercher par ID, montant ou donneur..."
                            className="pl-10"
                            value={checkSearchTerm}
                            onChange={(e) => setCheckSearchTerm(e.target.value)}
                          />
                        </div>
                        {loadingChecks ? (
                          <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                          </div>
                        ) : checks.length === 0 ? (
                          <div className="text-center py-12">
                            <p className="text-gray-500">Aucun chèque disponible</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
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
                                {checks.filter((check) => {
                                  if (check.status === 'used' || check.status === 'archived') return false;
                                  if (!checkSearchTerm.trim()) return true;
                                  const term = checkSearchTerm.toLowerCase();
                                  return (
                                    check.check_id_number?.toLowerCase().includes(term) ||
                                    check.given_to?.toLowerCase().includes(term) ||
                                    check.amount_value?.toString().includes(term) ||
                                    check.remaining_balance?.toString().includes(term)
                                  );
                                }).map((check) => (
                                  <TableRow key={check.id}>
                                    <TableCell className="font-semibold">{check.check_id_number}</TableCell>
                                    <TableCell className="font-semibold text-blue-600">
                                      {(check.amount_value || 0).toFixed(2)} MAD
                                    </TableCell>
                                    <TableCell className="font-semibold text-green-600">
                                      {(check.remaining_balance || 0).toFixed(2)} MAD
                                    </TableCell>
                                    <TableCell>
                                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                        check.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                        check.status === 'received' ? 'bg-blue-100 text-blue-800' :
                                        check.status === 'used' ? 'bg-green-100 text-green-800' :
                                        'bg-gray-100 text-gray-800'
                                      }`}>
                                        {check.status}
                                      </span>
                                    </TableCell>
                                    <TableCell>{check.given_to}</TableCell>
                                    <TableCell className="text-right">
                                      <Button
                                        size="lg"
                                        className="bg-black text-white hover:bg-gray-800"
                                        onClick={() => {
                                          setSelectedCheck(check);
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
                        )}
                        <div className="mt-4 flex gap-4">
                          <Button
                            onClick={() => setCheckDialogOpen(false)}
                            size="lg"
                            className="flex-1 bg-white text-black border-2 border-gray-300 hover:bg-gray-100"
                          >
                            Fermer
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  <div className="flex gap-4">
                    <Button
                      className="flex-1 text-white hover:opacity-90"
                      style={{ backgroundColor: '#000000ff' }}
                      size="lg"
                      onClick={async () => {
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
                            setCheckDialogOpen(true);
                          }
                        } catch (error) {
                          toast.error('Erreur lors du chargement des chèques');
                        } finally {
                          setLoadingChecks(false);
                        }
                      }}
                    >
                      Choisir un Chèque
                    </Button>
                    <Button
                      className="flex-1 bg-white text-black border-2 border-gray-300 hover:bg-gray-100"
                      size="lg"
                      onClick={() => {
                        setCreateCheckDialogOpen(true);
                        setUploadCheckDate(getTodayDate());
                        setUploadExecutionDate(getTodayDate());
                      }}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Créer Chèque
                    </Button>
                  </div>
                  
                  <Dialog open={createCheckDialogOpen} onOpenChange={setCreateCheckDialogOpen}>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                  {selectedCheck && (
                    <div className="mt-3 p-3 bg-white rounded-lg border border-blue-300 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-gray-700">Chèque Sélectionné:</span>
                        <span className="text-sm font-bold text-blue-600">{selectedCheck.check_id_number}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-gray-700">Montant Disponible:</span>
                        <span className="text-sm font-bold text-green-600">{(selectedCheck.remaining_balance || 0).toFixed(2)} MAD</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-gray-700">Total Facture:</span>
                        <span className="text-sm font-bold text-orange-600">{totals.total.toFixed(2)} MAD</span>
                      </div>
                      {(selectedCheck.remaining_balance || 0) < totals.total && (
                        <div className="bg-yellow-50 p-2 rounded border border-yellow-200">
                          <p className="text-xs text-yellow-700 font-semibold">
                            ⚠️ Le chèque ne couvre pas le montant total. Reste à payer: {(totals.total - (selectedCheck.remaining_balance || 0)).toFixed(2)} MAD
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2 mt-4 flex-col">
                <Button
                  onClick={() => {
                    // Validate all items have valid moyenne within fourchette
                    const invalidItems: string[] = [];
                    
                    invoiceData.items.forEach((item, index) => {
                    if (item.description && item.moyenne) {
                    const product = products.find(p => p.name === item.description);
                    const tpl = product ? getTemplateForProduct(product) : null;
                    
                    // Use the fourchette that is actually on the line (copied from template on selection),
                    // fallback to template/product only if missing.
                    const moyenneValue = parseFloat(String(item.moyenne)) || 0;
                    const min = item.fourchette_min ?? tpl?.fourchette_min ?? product?.fourchette_min ?? null;
                    const max = item.fourchette_max ?? tpl?.fourchette_max ?? product?.fourchette_max ?? null;
                    
                    if (min !== null || max !== null) {
                    if ((min !== null && moyenneValue < Number(min)) || (max !== null && moyenneValue > Number(max))) {
                    invalidItems.push(
                    `Ligne ${index + 1} (${item.description}): Moyenne ${moyenneValue} - Fourchette requise: ${min ?? '∞'} à ${max ?? '∞'}`
                    );
                    }
                    }
                    }
                    });

                    if (invalidItems.length > 0) {
                      toast.error(`❌ Erreur de validation:\n${invalidItems.join('\n')}`);
                      return;
                    }

                    const proceed = async () => {
                      let uploadedUrl: string | undefined = undefined;
                      if (invoiceData.paymentMethod === 'bank_transfer' && bankProofFile) {
                        try {
                          const form = new FormData();
                          form.append('file', bankProofFile);
                          form.append('folder', 'invoices-proofs');
                          const res = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/uploads/bank-transfer-proof`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${session?.access_token}` },
                            body: form,
                          });
                          if (res.ok) {
                            const data = await res.json();
                            uploadedUrl = data.url;
                            setBankProofUrl(uploadedUrl);
                          } else {
                            toast.error('Erreur upload de la preuve de virement');
                            return;
                          }
                        } catch (e) {
                          toast.error('Erreur upload');
                          return;
                        }
                      }
                      await handleGeneratePDF(uploadedUrl);
                    };

                    if (invoiceData.paymentMethod === 'check' && !selectedCheck) {
                      toast.error('Veuillez sélectionner un chèque');
                      return;
                    }
                    
                    // If no amount paid, set status to "Non Payée" and proceed
                    if (invoiceData.paymentMethod === 'cash' && (!invoiceData.amountPaid || invoiceData.amountPaid <= 0)) {
                      setInvoiceData({
                        ...invoiceData,
                        status: 'Non Payée',
                      });
                    }
                    if (invoiceData.paymentMethod === 'bank_transfer' && (!invoiceData.amountPaid || invoiceData.amountPaid <= 0)) {
                      setInvoiceData({
                        ...invoiceData,
                        status: 'Non Payée',
                      });
                    }
                    
                    proceed();
                  }}
                  size="lg"
                  style={{ backgroundColor: '#10b981', color: 'white' }}
                  className="w-full"
                >
                  <Check className="w-5 h-5 mr-2" />
                  Confirmer et Générer
                </Button>
                {/* Display Additional Payment Methods */}
              {Object.keys(additionalPayments).length > 0 && (
                <div className="border-t pt-4">
                  <Label className="text-sm font-semibold text-gray-700 mb-3 block">Méthodes de Paiement Supplémentaires</Label>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(additionalPayments).map(([method, amount]) => (
                      <div key={method} className="flex items-center gap-2 bg-purple-100 text-purple-800 px-3 py-2 rounded-lg border border-purple-300">
                        <span className="text-sm font-semibold">
                          {method === 'cash' ? '💵 Espèces' : method === 'check' ? '🏦 Chèque' : '🏦 Virement'}
                        </span>
                        <span className="text-sm font-bold">{amount.toFixed(2)} MAD</span>
                        <button
                          type="button"
                          onClick={() => {
                            const newPayments = { ...additionalPayments };
                            delete newPayments[method];
                            setAdditionalPayments(newPayments);
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

              {Object.keys(additionalPayments).length < 3 && (
                  <Button
                    type="button"
                    onClick={() => setShowAddPaymentDialog(true)}
                    className="w-full"
                    style={{ backgroundColor: '#a855f7', color: 'white' }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    + Ajouter une Méthode de Paiement
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Product Suggestions Dialog */}
      <Dialog open={productDialogOpen !== null && filteredProducts.length > 0 && hasUserTyped[productDialogOpen || '']} onOpenChange={(open) => {
        if (!open) {
          setProductDialogOpen(null);
          setFilteredProducts([]);
        }
      }}>
        <DialogContent className="max-w-md max-h-96">
          <DialogHeader>
            <DialogTitle className="text-sm">Produits disponibles ({filteredProducts.length})</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 overflow-y-auto max-h-64">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => {
                  if (productDialogOpen) {
                    handleItemChange(productDialogOpen, 'description', product.name);
                    setProductDialogOpen(null);
                  }
                }}
                className="w-full text-left px-3 py-2 hover:bg-blue-50 border border-gray-200 rounded transition-colors group text-xs"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate group-hover:text-blue-600">{product.name}</div>
                    <div className="text-xs text-gray-600 truncate">
                      Ref: {product.reference}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`inline-block px-1 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${
                      product.max_purchase_limit 
                        ? 'bg-orange-100 text-orange-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {product.max_purchase_limit ? `Max: ${product.max_purchase_limit}` : 'Illimité'}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Additional Payment Method Dialog */}
      <Dialog open={showAddPaymentDialog} onOpenChange={setShowAddPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter une Méthode de Paiement Supplémentaire</DialogTitle>
          </DialogHeader>
          
          {currentAdditionalPaymentType === null ? (
            <div className="space-y-6 py-6">
              <p className="text-sm text-gray-600 font-medium">Sélectionnez une méthode de paiement supplémentaire:</p>
              <div className="space-y-4">
                <Button
                  onClick={() => setCurrentAdditionalPaymentType('cash')}
                  className="w-full justify-start h-14 text-base font-semibold"
                  style={{ backgroundColor: '#f59e0b', color: 'white' }}
                >
                  <DollarSign className="w-6 h-6 mr-4" />
                  💵 Espèces
                </Button>
                <Button
                  onClick={() => setCurrentAdditionalPaymentType('check')}
                  className="w-full justify-start h-14 text-base font-semibold"
                  style={{ backgroundColor: '#3b82f6', color: 'white' }}
                >
                  <CreditCard className="w-6 h-6 mr-4" />
                  🏦 Chèque
                </Button>
                <Button
                  onClick={() => setCurrentAdditionalPaymentType('bank_transfer')}
                  className="w-full justify-start h-14 text-base font-semibold"
                  style={{ backgroundColor: '#6366f1', color: 'white' }}
                >
                  <Banknote className="w-6 h-6 mr-4" />
                  🏦 Virement Bancaire
                </Button>
              </div>
            </div>
          ) : currentAdditionalPaymentType === 'cash' ? (
            <div className="space-y-4">
              <div>
                <Label>Montant (Espèces)</Label>
                <Input
                  type="number"
                  placeholder="Montant en MAD"
                  id="additional_cash_amount"
                  min="0.01"
                  step="0.01"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      const input = document.getElementById('additional_cash_amount') as HTMLInputElement;
                      const amount = parseFloat(input.value);
                      if (amount > 0) {
                        setAdditionalPayments({ ...additionalPayments, cash: amount });
                        setCurrentAdditionalPaymentType(null);
                        setShowAddPaymentDialog(false);
                        toast.success('Espèces ajoutées');
                      }
                    }
                  }}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setCurrentAdditionalPaymentType(null)}
                  variant="outline"
                  className="flex-1"
                >
                  Retour
                </Button>
                <Button
                  onClick={() => {
                    const input = document.getElementById('additional_cash_amount') as HTMLInputElement;
                    const amount = parseFloat(input.value);
                    if (amount > 0) {
                      setAdditionalPayments({ ...additionalPayments, cash: amount });
                      setCurrentAdditionalPaymentType(null);
                      setShowAddPaymentDialog(false);
                      toast.success('Espèces ajoutées');
                    } else {
                      toast.error('Veuillez entrer un montant valide');
                    }
                  }}
                  style={{ backgroundColor: '#10b981', color: 'white' }}
                  className="flex-1"
                >
                  Ajouter
                </Button>
              </div>
            </div>
          ) : currentAdditionalPaymentType === 'check' ? (
            <div className="space-y-4">
              <div>
                <Label>Sélectionner un Chèque</Label>
                <Button
                  onClick={async () => {
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
                  className="w-full"
                  style={{ backgroundColor: '#3b82f6', color: 'white' }}
                >
                  {loadingChecks ? 'Chargement...' : 'Choisir un Chèque'}
                </Button>
              </div>
              {checks.length > 0 && (
                <div className="max-h-48 overflow-y-auto border rounded-lg">
                  {checks.filter((check) => check.status !== 'used' && check.status !== 'archived').map((check) => (
                    <button
                      key={check.id}
                      onClick={() => {
                        setAdditionalSelectedCheck(check);
                      }}
                      className={`w-full text-left p-3 border-b hover:bg-blue-50 transition ${
                        additionalSelectedCheck?.id === check.id ? 'bg-blue-100' : ''
                      }`}
                    >
                      <div className="font-semibold text-sm">{check.check_id_number}</div>
                      <div className="text-xs text-gray-600">Disponible: {(check.remaining_balance || 0).toFixed(2)} MAD</div>
                    </button>
                  ))}
                </div>
              )}
              {additionalSelectedCheck && (
                <div className="bg-blue-50 p-3 rounded border border-blue-200">
                  <p className="text-sm font-semibold text-gray-700">Chèque sélectionné: {additionalSelectedCheck.check_id_number}</p>
                  <p className="text-xs text-gray-600 mt-1">Montant disponible: {(additionalSelectedCheck.remaining_balance || 0).toFixed(2)} MAD</p>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setCurrentAdditionalPaymentType(null);
                    setAdditionalSelectedCheck(null);
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Retour
                </Button>
                <Button
                  onClick={() => {
                    if (additionalSelectedCheck) {
                      setAdditionalPayments({
                        ...additionalPayments,
                        check: additionalSelectedCheck.remaining_balance || 0,
                      });
                      setCurrentAdditionalPaymentType(null);
                      setAdditionalSelectedCheck(null);
                      setShowAddPaymentDialog(false);
                      toast.success('Chèque ajouté');
                    } else {
                      toast.error('Veuillez sélectionner un chèque');
                    }
                  }}
                  style={{ backgroundColor: '#10b981', color: 'white' }}
                  className="flex-1"
                >
                  Ajouter
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>Montant (Virement Bancaire)</Label>
                <Input
                  type="number"
                  placeholder="Montant en MAD"
                  id="additional_bank_amount"
                  min="0.01"
                  step="0.01"
                />
              </div>
              <div>
                <Label>Preuve de Virement (image ou PDF)</Label>
                <Input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setAdditionalBankProofFile(e.target.files?.[0] || null)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setCurrentAdditionalPaymentType(null)}
                  variant="outline"
                  className="flex-1"
                >
                  Retour
                </Button>
                <Button
                  onClick={() => {
                    const input = document.getElementById('additional_bank_amount') as HTMLInputElement;
                    const amount = parseFloat(input.value);
                    if (amount > 0) {
                      setAdditionalPayments({ ...additionalPayments, bank_transfer: amount });
                      setCurrentAdditionalPaymentType(null);
                      setAdditionalBankProofFile(null);
                      setShowAddPaymentDialog(false);
                      toast.success('Virement bancaire ajouté');
                    } else {
                      toast.error('Veuillez entrer un montant valide');
                    }
                  }}
                  style={{ backgroundColor: '#10b981', color: 'white' }}
                  className="flex-1"
                >
                  Ajouter
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </div>
   
  );
}
