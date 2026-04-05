import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Plus, Trash2, Download, Eye, Search, Check, Upload, X, DollarSign, CreditCard, Banknote } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { projectId } from '../../utils/supabase/info';
import { toast } from 'sonner';

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

interface OrderItem {
  id: string;
  description: string;
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
  product_id?: string;
}

interface OrderData {
  company: CompanyInfo;
  client: ClientInfo;
  items: OrderItem[];
  status: 'Payée' | 'Non Payée' | 'Partiellement payée';
  paymentMethod: 'cash' | 'check' | 'bank_transfer';
  amountPaid?: number;
  remiseAmount?: number;
  // Some parts of the PDF/export flow expect this field.
  // Keep it optional for backward compatibility.
  remisePercentage?: number;
  invoiceDate?: string;
  executionDate?: string;
}

interface CheckInventoryItem {
  id: string;
  check_id_number: string;
  amount_value: number;
  remaining_balance: number;
  status: string;
  given_to: string;
}

export default function BonCommandeModule({ session, onBack, sale, adminSelectedMagasinId }: { session: any; onBack?: () => void; sale?: any; adminSelectedMagasinId?: string | null }) {
  // Debug: ensure adminSelectedMagasinId is actually passed when saving.
  useEffect(() => {
    console.log('[BonCommandeModule] adminSelectedMagasinId:', adminSelectedMagasinId);
  }, [adminSelectedMagasinId]);
  const [clients, setClients] = useState<any[]>([]);
  const [filteredClients, setFilteredClients] = useState<any[]>([]);
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  // Keep a stable client identifier to allow safe edits (move balance from old client to new client).
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [productTemplates, setProductTemplates] = useState<any[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<any[]>([]);
  const [showProductSuggestions, setShowProductSuggestions] = useState<{ [key: string]: boolean }>({});
  const [showProductDialog, setShowProductDialog] = useState<{ [key: string]: boolean }>({});
  const [loading, setLoading] = useState(false);
  const [checks, setChecks] = useState<CheckInventoryItem[]>([]);
  const [loadingChecks, setLoadingChecks] = useState(false);
  const [checkDialogOpen, setCheckDialogOpen] = useState(false);
  const [selectedCheck, setSelectedCheck] = useState<CheckInventoryItem | null>(null);
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
  const [additionalPayments, setAdditionalPayments] = useState<{ [key: string]: number }>({});
  const [currentAdditionalPaymentType, setCurrentAdditionalPaymentType] = useState<'cash' | 'check' | 'bank_transfer' | null>(null);
  const [additionalSelectedCheck, setAdditionalSelectedCheck] = useState<CheckInventoryItem | null>(null);
  const [additionalBankProofFile, setAdditionalBankProofFile] = useState<File | null>(null);
  const [additionalPaymentDialogOpen, setAdditionalPaymentDialogOpen] = useState(false);
  const [blId, setBlId] = useState<string>('');
  const [customBlId, setCustomBlId] = useState<string>('');
  // Track original caisse values when editing an order to calculate stock adjustments
  const [originalCaisseValues, setOriginalCaisseValues] = useState<{ [itemId: string]: number }>({});

  // Generate auto BL ID on component mount using a concurrency-safe server-side counter.
  // This avoids duplicates across devices/users and removes localStorage reliance.
  useEffect(() => {
    // If editing, use the existing sale number and keep it unchanged (don't auto-generate new one)
    if (sale && sale.sale_number) {
      setBlId(sale.sale_number);
      setCustomBlId(sale.sale_number);
      return;
    }

    const generateBlIdFromServer = async () => {
      try {
        // Preview only: do NOT consume a number when opening the form.
        // We will consume the BL number only when user confirms/saves.
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/bl/preview?counter_id=global`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token}`,
            },
          }
        );

        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          console.error('[BonCommandeModule] BL next failed', res.status, txt);
          // Fallback: timestamp-based (still unique-ish) so user can continue working
          setBlId(`BL-${Date.now()}`);
          return;
        }

        const payload = await res.json();
        setBlId(payload?.bl_number || `BL-${Date.now()}`);
      } catch (e) {
        console.error('[BonCommandeModule] BL next exception', e);
        setBlId(`BL-${Date.now()}`);
      }
    };

    // Always attempt server BL generation. If session isn't ready yet,
    // retry shortly instead of falling back to a timestamp BL format.
    if (!session?.access_token) {
      const t = setTimeout(() => {
        // triggers effect again once session is available
        // (session state comes from parent; this is just a delayed retry)
        if (session?.access_token) generateBlIdFromServer();
      }, 600);
      return () => clearTimeout(t);
    }

    generateBlIdFromServer();
  }, [sale, session?.access_token]);

  const [orderData, setOrderData] = useState<OrderData>({
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
    invoiceDate: new Date().toISOString().split('T')[0],
    executionDate: new Date().toISOString().split('T')[0],
  });

  const handleCompanyChange = (field: keyof CompanyInfo, value: string): void => {
    setOrderData({
      ...orderData,
      company: {
        ...orderData.company,
        [field]: value,
      },
    });
  };

  const handleClientChange = (field: keyof ClientInfo, value: string): void => {
    // If user manually changes the name (instead of selecting from suggestions),
    // we no longer know the exact client id.
    if (field === 'name') {
      setSelectedClientId(null);
    }

    setOrderData({
      ...orderData,
      client: {
        ...orderData.client,
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
    setSelectedClientId(client?.id ?? null);
    setOrderData({
      ...orderData,
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

  useEffect(() => {
    const fetchClientsAndProducts = async () => {
      try {
        // If backend supports store_id filtering, prefer it so stock is correct.
        const storeQuery = adminSelectedMagasinId ? `?store_id=${encodeURIComponent(adminSelectedMagasinId)}` : '';

        const [templatesResponse, clientsResponse, productsResponse] = await Promise.all([
          fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/product-templates`,
            {
              headers: {
                'Authorization': `Bearer ${session?.access_token}`,
              },
            }
          ),
          fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/clients${storeQuery}`,
            {
              headers: {
                'Authorization': `Bearer ${session?.access_token}`,
              },
            }
          ),
          fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/products${storeQuery}`,
            {
              headers: {
                'Authorization': `Bearer ${session?.access_token}`,
              },
            }
          ),
        ]);

        if (templatesResponse.ok) {
          const tData = await templatesResponse.json().catch(() => null);
          setProductTemplates(tData?.templates || []);
        }

        // Clients
        if (clientsResponse.ok) {
          const data = await clientsResponse.json().catch(() => null);
          let allClients = data?.clients || [];

          // Extra safety if backend doesn't support store filter and still returns all
          if (adminSelectedMagasinId) {
            allClients = allClients.filter((c: any) => String(c.store_id || '') === String(adminSelectedMagasinId));
          }

          setClients(allClients);
        } else {
          // fallback
          const fallback = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/clients`,
            {
              headers: {
                'Authorization': `Bearer ${session?.access_token}`,
              },
            }
          );
          if (fallback.ok) {
            const data = await fallback.json().catch(() => null);
            let allClients = data?.clients || [];
            if (adminSelectedMagasinId) {
              allClients = allClients.filter((c: any) => String(c.store_id || '') === String(adminSelectedMagasinId));
            }
            setClients(allClients);
          }
        }

        // Products
        if (productsResponse.ok) {
          const data = await productsResponse.json().catch(() => null);
          let allProducts = data?.products || [];

          if (adminSelectedMagasinId) {
            allProducts = allProducts.filter((p: any) => String(p.store_id || '') === String(adminSelectedMagasinId));
          }

          setProducts(allProducts);
        } else {
          // fallback
          const fallback = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/products`,
            {
              headers: {
                'Authorization': `Bearer ${session?.access_token}`,
              },
            }
          );
          if (fallback.ok) {
            const data = await fallback.json().catch(() => null);
            let allProducts = data?.products || [];
            if (adminSelectedMagasinId) {
              allProducts = allProducts.filter((p: any) => String(p.store_id || '') === String(adminSelectedMagasinId));
            }
            setProducts(allProducts);
          }
        }
      } catch (error) {
        console.error('Error fetching clients and products:', error);
      }
    };

    if (session?.access_token) {
      fetchClientsAndProducts();
    }
  }, [session?.access_token, adminSelectedMagasinId]);

  // Populate form with sale data if provided
  useEffect(() => {
    console.log('=== POPULATE FORM EFFECT ===');
    console.log('Sale prop:', JSON.stringify(sale, null, 2));
    
    if (sale) {
      console.log('Sale object exists');
      
      // Try to get items from either sale_items or items field
      const itemsArray = (sale.sale_items && Array.isArray(sale.sale_items) && sale.sale_items.length > 0) 
        ? sale.sale_items 
        : (sale.items && Array.isArray(sale.items) && sale.items.length > 0) 
          ? sale.items 
          : [];
      
      console.log('Items array source:', itemsArray.length > 0 ? (sale.sale_items?.length > 0 ? 'sale_items' : 'items') : 'none');
      console.log('Items array length:', itemsArray.length);
      
      if (itemsArray.length > 0) {
        console.log('Populating form with sale data');
        console.log('Number of items:', itemsArray.length);
        
        const mappedItems = itemsArray.map((item: any, idx: number) => {
          console.log(`Mapping item ${idx}:`, JSON.stringify(item, null, 2));
          const mapped = {
            id: item.id || `item-${idx}`,
            description: item.name || item.description || '',
            caisse: String(item.caisse || ''),
            quantity: Number(item.quantity) || 0,
            moyenne: String(item.moyenne || ''),
            unitPrice: Number(item.unit_price || item.unitPrice || 0),
            subtotal: Number(item.total_price || item.subtotal || 0),
            reference: item.reference || undefined,
            category: item.category || undefined,
            lot: item.lot || undefined,
            fourchette_min: item.fourchette_min || undefined,
            fourchette_max: item.fourchette_max || undefined,
            product_id: item.product_id || undefined,
          };
          console.log(`Mapped item ${idx}:`, mapped);
          return mapped;
        });
        
        console.log('All mapped items:', JSON.stringify(mappedItems, null, 2));
        
        // Populate original caisse values for stock synchronization
        const initialCaisseValues: { [itemId: string]: number } = {};
        mappedItems.forEach((item: any) => {
          if (item.id && item.caisse !== undefined) {
            const caisseNum = parseFloat(String(item.caisse).replace(',', '.'));
            if (Number.isFinite(caisseNum)) {
              initialCaisseValues[item.id] = caisseNum;
            }
          }
        });
        setOriginalCaisseValues(initialCaisseValues);
        
        // Populate client info from sale
        setSelectedClientId(sale.client_id ?? null);
        
        // Determine payment status from sale
        const saleStatus = sale.payment_status || sale.status || 'pending';
        let displayStatus: 'Payée' | 'Non Payée' | 'Partiellement payée' = 'Non Payée';
        if (saleStatus === 'paid') {
          displayStatus = 'Payée';
        } else if (saleStatus === 'partial') {
          displayStatus = 'Partiellement payée';
        }
        
        // Determine payment method
        const salePaymentMethod = sale.payment_method || 'cash';
        
        setOrderData(prevData => {
          const newData = {
            ...prevData,
            client: {
              name: sale.client_name || '',
              phone: sale.client_phone || '',
              address: sale.client_address || '',
              ice: sale.client_ice || '',
              if: sale.client_if || sale.client_if_number || '',
              rc: sale.client_rc || '',
              patente: sale.client_patente || '',
            },
            // Populate items from either sale_items or items
            items: mappedItems,
            // Populate payment-related fields
            status: displayStatus,
            paymentMethod: salePaymentMethod,
            amountPaid: Number(sale.amount_paid || 0),
            remiseAmount: Number(sale.total_remise || sale.totalRemise || 0),
            // Populate dates
            invoiceDate: sale.invoice_date || sale.invoiceDate || new Date().toISOString().split('T')[0],
            executionDate: sale.execution_date || sale.executionDate || new Date().toISOString().split('T')[0],
          };
          console.log('New order data:', JSON.stringify(newData, null, 2));
          return newData;
        });
      } else {
        console.log('No items to populate');
      }
    } else {
      console.log('No sale prop provided');
    }
    console.log('=== END POPULATE FORM EFFECT ===');
  }, [sale]);

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

  // Calculate cumulative quantity (quantite) for a product across all order lines
  const getCumulativeQuantity = (productId: string, currentItemId: string): number => {
    return orderData.items.reduce((sum, item) => {
      if (item.product_id === productId && item.id !== currentItemId) {
        return sum + (Number(item.quantity) || 0);
      }
      return sum;
    }, 0);
  };

  // Calculate cumulative caisse for a product across all order lines
  const getCumulativeCaisse = (productId: string, currentItemId: string): number => {
    return orderData.items.reduce((sum, item) => {
      if (item.product_id === productId && item.id !== currentItemId) {
        return sum + (parseFloat(String(item.caisse).replace(',', '.')) || 0);
      }
      return sum;
    }, 0);
  };

  // Get remaining stock for a product considering all order lines
  const getRemainingStock = (productId: string, currentItemId: string): number => {
    const item = orderData.items.find(i => i.id === currentItemId);
    const availableStock = Number((item as any)?.__available_stock) || 0;
    const usedStock = getCumulativeQuantity(productId, currentItemId);
    return Math.max(0, availableStock - usedStock);
  };

  // Function to update product stock via API
  const updateProductStock = async (productId: string, quantityDelta: number) => {
    if (!productId || quantityDelta === 0) {
      console.log('[BonCommandeModule] Skipping stock update:', { productId, quantityDelta });
      return;
    }
    
    console.log('[BonCommandeModule] Updating product stock:', { productId, quantityDelta, storeId: adminSelectedMagasinId });
    
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/products/${productId}/stock`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            quantity_delta: quantityDelta,
            store_id: adminSelectedMagasinId || null,
          }),
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error('[BonCommandeModule] Failed to update product stock:', response.status, errorText);
        toast.error('Erreur lors de la mise à jour du stock');
      } else {
        const result = await response.json().catch(() => null);
        console.log('[BonCommandeModule] Stock updated successfully:', result);
      }
    } catch (error) {
      console.error('[BonCommandeModule] Error updating product stock:', error);
      toast.error('Erreur lors de la mise à jour du stock');
    }
  };

  const handleItemChange = (id: string, field: keyof OrderItem, value: string | number): void => {
    // If changing moyenne, validate against template sulphate (fallback product)
    if (field === 'moyenne') {
      const moyenneValue = parseFloat(String(value)) || 0;
      const item = orderData.items.find(i => i.id === id);

      if (item && item.description) {
        const product = products.find(p => p.name === item.description);
        const tpl = product ? getTemplateForProduct(product) : null;
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

    // Handle caisse changes - track original values for stock reconciliation on save
    // NOTE: Stock is NOT updated here. It is updated only when the sale is saved/confirmed
    // to avoid duplicate stock updates and incorrect stock deductions during editing.
    if (field === 'caisse') {
      // Track the new caisse value for this item (for stock reconciliation on save)
      setOriginalCaisseValues(prev => ({
        ...prev,
        [id]: typeof value === 'string'
          ? parseFloat(String(value).replace(',', '.'))
          : Number(value),
      }));
    }

    setOrderData({
      ...orderData,
      items: orderData.items.map((item) => {
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
    const newItem: OrderItem = {
      id: Date.now().toString(),
      description: '',
      caisse: '',
      quantity: 0,
      moyenne: '',
      unitPrice: 0,
      subtotal: 0,
    };
    setOrderData({
      ...orderData,
      items: [...orderData.items, newItem],
    });
    // Track original caisse for new item (starts at 0)
    setOriginalCaisseValues(prev => ({
      ...prev,
      [newItem.id]: 0,
    }));
  };

  const removeItem = (id: string): void => {
    // NOTE: Stock is NOT updated here. It is updated only when the sale is saved/confirmed
    // to avoid duplicate stock updates and incorrect stock deductions during editing.
    
    setOrderData({
      ...orderData,
      items: orderData.items.filter((item) => item.id !== id),
    });
    
    // Remove from originalCaisseValues tracking
    setOriginalCaisseValues(prev => {
      const newCaisseValues = { ...prev };
      delete newCaisseValues[id];
      return newCaisseValues;
    });
  };

  const calculateTotals = (): { subtotal: number; remise: number; total: number } => {
    const subtotal = orderData.items.reduce((sum, item) => sum + item.subtotal, 0);
    const remiseAmount = orderData.remiseAmount || 0;
    const total = subtotal - remiseAmount;
    return { subtotal, remise: remiseAmount, total };
  };

  // Auto-update amountPaid when total changes
  useEffect(() => {
    if (orderData.paymentMethod === 'cash' || orderData.paymentMethod === 'bank_transfer') {
      const totals = calculateTotals();
      if (totals.total > 0) {
        setOrderData(prevData => ({
          ...prevData,
          amountPaid: totals.total,
          status: 'Payée' as const,
        }));
      }
    }
  }, [orderData.items, orderData.remiseAmount, orderData.paymentMethod]);

  const validateBeforeSubmit = (): boolean => {
    const errors: string[] = [];

    // Client fields
    // Only client name is required (phone/address/ICE are optional as requested)
    if (!orderData.client.name?.trim()) {
      errors.push('Nom du Client');
    } else {
      // Check if the client exists in the database
      const clientExists = clients.some(
        (c: any) => c.name?.toLowerCase().trim() === orderData.client.name.toLowerCase().trim()
      );
      if (!clientExists) {
        errors.push(`Client "${orderData.client.name}" non trouvé dans la base de données`);
      }
    }

    // Dates (required)
    if (!orderData.invoiceDate?.trim()) errors.push('Date de Facture');
    if (!orderData.executionDate?.trim()) errors.push("Date d'Exécution");

    // Items (at least 1)
    if (!orderData.items || orderData.items.length === 0) {
      errors.push('Articles du Bon de Commande (au moins 1 article)');
    } else {
      orderData.items.forEach((item, idx) => {
        const prefix = `Article ${idx + 1}`;
        const caisseNum = parseFloat(String(item.caisse).replace(',', '.'));
        const qtyNum = Number(item.quantity);
        const moyenneNum = parseFloat(String(item.moyenne).replace(',', '.'));
        const unitNum = Number(item.unitPrice);
        const subNum = Number(item.subtotal);

        if (!item.description?.trim()) errors.push(`${prefix}: Description`);
        if (!item.caisse?.toString().trim() || !Number.isFinite(caisseNum) || caisseNum <= 0) errors.push(`${prefix}: Caisse`);
        if (!Number.isFinite(qtyNum) || qtyNum <= 0) errors.push(`${prefix}: Quantité`);
        if (!item.moyenne?.toString().trim() || !Number.isFinite(moyenneNum) || moyenneNum <= 0) errors.push(`${prefix}: Moyenne`);
        if (!Number.isFinite(unitNum) || unitNum < 0) errors.push(`${prefix}: Prix Unitaire`);
        // Subtotal is computed, but still validate it to avoid empty/0 lines
        if (!Number.isFinite(subNum) || subNum < 0) errors.push(`${prefix}: Sous-total`);
      });
    }

    // Payment validation:
    // - Non Payée: amountPaid must be 0 (or empty)
    // - Partiellement payée: amountPaid must be > 0 and < total
    // - Payée: amountPaid must be >= total
    // NOTE: We validate based on the selected status, not only on payment method.
    const totals = calculateTotals();
    const paid = Number(orderData.amountPaid ?? 0);

    if (orderData.status === 'Non Payée') {
      // Allow empty input; treat as 0
      if (Number.isFinite(paid) && paid > 0) {
        errors.push('Montant Payé');
      }
    } else if (orderData.status === 'Partiellement payée') {
      if (!Number.isFinite(paid) || paid < 0 || paid >= totals.total) {
        errors.push('Montant Payé');
      }
    } else if (orderData.status === 'Payée') {
      if (!Number.isFinite(paid) || paid < 0) {
        errors.push('Montant Payé');
      }
    }

    // Remise is intentionally NOT required.

    if (errors.length > 0) {
      toast.error(`Champs obligatoires manquants / invalides: ${errors.join(', ')}`);
      return false;
    }

    return true;
  };

  const handleGeneratePDF = async (uploadedProofUrl?: string): Promise<void> => {
    try {
      if (!validateBeforeSubmit()) return;

      const totals = calculateTotals();
      
      // Create document first
      // IMPORTANT: use the FINAL BL number (custom if provided) everywhere
      const finalBlNumber = customBlId.trim() || blId;

      const bonPayload = {
        type: 'BonCommande',
        clientName: orderData.client.name || 'Client',
        clientEmail: orderData.client.phone || '',
        clientAddress: orderData.client.address || 'Adresse non spécifiée',
        clientICE: orderData.client.ice || '',
        clientIF: orderData.client.if || '',
        clientRC: orderData.client.rc || '',
        clientPatente: orderData.client.patente || '',
        companyAddress: orderData.company.referenceNumero || '',
        companyPhone: orderData.company.palette || '',
        companyEmail: orderData.company.transporteur || '',
        companyICE: orderData.company.fraisMaritime || '',
        companyIF: orderData.company.fraisTransit || '',
        companyRC: orderData.company.onssa || '',
        companyPatente: orderData.company.fraisDivers || '',
        invoiceDate: orderData.invoiceDate,
        executionDate: orderData.executionDate,
        date: new Date().toISOString().split('T')[0],
        items: orderData.items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.subtotal,
        })),
        notes: '',
        paymentHeaderNote: `Statut: ${orderData.status}`,
        remise: 0,
        subtotal: totals.subtotal,
        totalRemise: 0,
        subtotalAfterRemise: totals.subtotal,
        tva: 0,
        totalWithTVA: totals.subtotal,
      };

      const bonResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/documents`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bonPayload),
        }
      );

      if (bonResponse.ok) {
        const bonData = await bonResponse.json();
        const documentId = bonData.id;

        // Prepare data to pass to PDF endpoint
        const pdfData = {
          clientName: orderData.client.name,
          clientPhone: orderData.client.phone,
          clientAddress: orderData.client.address,
          clientICE: orderData.client.ice,
          clientIF: orderData.client.if,
          clientRC: orderData.client.rc,
          clientPatente: orderData.client.patente,
          companyAddress: orderData.company.referenceNumero,
          companyPhone: orderData.company.palette,
          companyEmail: orderData.company.transporteur,
          companyICE: orderData.company.fraisMaritime,
          companyIF: orderData.company.fraisTransit,
          companyRC: orderData.company.onssa,
          companyPatente: orderData.company.fraisDivers,
          invoiceDate: orderData.invoiceDate,
          executionDate: orderData.executionDate,
          date: new Date().toISOString().split('T')[0],
          items: orderData.items.map(item => ({
            description: item.description,
            caisse: item.caisse,
            quantity: item.quantity,
            moyenne: item.moyenne,
            unitPrice: item.unitPrice,
            total: item.subtotal,
          })),
          paymentHeaderNote: `Statut: ${orderData.status}`,
          subtotal: totals.subtotal,
          remisePercentage: orderData.remisePercentage || 0,
          totalRemise: totals.remise,
          tva: 0,
          totalWithTVA: totals.total,
        };

        // Auto-download PDF with query parameters
        const queryParams = new URLSearchParams();
        queryParams.append('type', 'BonCommande');
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
        queryParams.append('companyICE', String(pdfData.companyICE ?? ''));

                // Some of these fields are numeric in the current data model.
                        // URLSearchParams requires strings, so stringify safely.
                                const companyIF = pdfData.companyIF === undefined || pdfData.companyIF === null ? '' : String(pdfData.companyIF);
                                        const companyRC = pdfData.companyRC === undefined || pdfData.companyRC === null ? '' : String(pdfData.companyRC);
        const companyPatente = pdfData.companyPatente === undefined || pdfData.companyPatente === null ? '' : String(pdfData.companyPatente);

        if (companyIF && companyIF !== 'XXXXXXXXXX') queryParams.append('companyIF', companyIF);
        if (companyRC && companyRC !== 'XXXXXXXXXX') queryParams.append('companyRC', companyRC);
        if (companyPatente && companyPatente !== 'XXXXXXXXXX') queryParams.append('companyPatente', companyPatente);

        if (pdfData.invoiceDate) queryParams.append('invoiceDate', pdfData.invoiceDate);
        if (pdfData.executionDate) queryParams.append('executionDate', pdfData.executionDate);
        queryParams.append('date', pdfData.date);
        queryParams.append('items', JSON.stringify(pdfData.items));
        queryParams.append('subtotal', pdfData.subtotal.toString());
        queryParams.append('remisePercentage', pdfData.remisePercentage.toString());
        queryParams.append('totalRemise', pdfData.totalRemise.toString());
        queryParams.append('tva', '0');
        queryParams.append('tvaPercentage', '0');
        queryParams.append('totalWithTVA', pdfData.totalWithTVA.toString());
        queryParams.append('paymentHeaderNote', pdfData.paymentHeaderNote);
        queryParams.append('blNumber', finalBlNumber);

        const pdfResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/documents/${documentId}/pdf?${queryParams.toString()}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/pdf',
            },
          }
        );

        if (pdfResponse.ok) {
          const blob = await pdfResponse.blob();
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${documentId}.pdf`;
          document.body.appendChild(link);
          link.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(link);

          // Save order to database
          try {
            // Transform items to match backend expectations
            const transformedItems = orderData.items.map(item => ({
              // Keep `id` as the client-side line id, but ALWAYS include a real product UUID.
              // If product_id is missing, use id as fallback
              id: item.id,
              product_id: item.product_id || item.id,
              productId: item.product_id || item.id,
              name: item.description,
              quantity: item.quantity,
              caisse: item.caisse,
              moyenne: item.moyenne,
              unit_price: item.unitPrice,
              total_price: item.subtotal,
              reference: item.reference,
              category: item.category,
              lot: item.lot,
              fourchette_min: item.fourchette_min,
              fourchette_max: item.fourchette_max,
            }));

            console.log('=== FRONTEND SALE CREATION ===');
            console.log('Transformed items:', JSON.stringify(transformedItems, null, 2));
            console.log('Items count:', transformedItems.length);
            console.log('Items array is valid:', Array.isArray(transformedItems));

            // Determine which BL to use:
            // - If user provided a custom one, use it.
            // - Otherwise use the preview BL (blId). We do NOT need to call /bl/next here because
            //   the backend will allocate a BL number if sale_number is missing.
            const finalBlId = customBlId.trim() || blId;

            // Keep UI consistent
            setBlId(finalBlId);

            const computedStatus = orderData.status === 'Payée'
              ? 'paid'
              : (orderData.status === 'Partiellement payée' ? 'partial' : 'unpaid');

            const paidAmount = Number(orderData.amountPaid ?? 0) || 0;

            const salePayload = {
            sale_number: finalBlId,
            // Stable client reference for safe balance reconciliation on edits.
            client_id: selectedClientId,
            // When admin is acting as a magasin, we MUST attach the sale to that magasin.
            // Otherwise the sale is saved with store_id = null and it will only show up
            // when filtering with "-- Sélectionner un magasin --".
            store_id: adminSelectedMagasinId || null,
            client_name: orderData.client.name,
            client_phone: orderData.client.phone,
            client_address: orderData.client.address,
            client_ice: orderData.client.ice,
            payment_method: orderData.paymentMethod,
            bank_transfer_proof_url: uploadedProofUrl || bankProofUrl || undefined,
            // Backend computes total_amount from items, so we send subtotal
            total_amount: totals.subtotal,
            // Persist remise amount on the sale so BL history & reports can show it.
            // Backend canonical field: total_remise
            total_remise: Math.max(0, Number(orderData.remiseAmount || 0) || 0),
            // Backward-compat alias (some code paths used camelCase previously)
            totalRemise: Math.max(0, Number(orderData.remiseAmount || 0) || 0),
            amount_paid: paidAmount,
            remaining_balance: Math.max(0, totals.total - paidAmount),
            tva_percentage: 0,
            // IMPORTANT: backend expects payment_status (not status) to drive stock deduction.
            payment_status: computedStatus,
            // Keep legacy field too (some code paths still read it)
            status: computedStatus,
            invoice_date: orderData.invoiceDate,
            execution_date: orderData.executionDate,
            items: transformedItems,
            notes: 'Bon de Commande',
            // delivery_status will be automatically set to 'delivered' by backend when store_id is null
            };

            console.log('Sale payload:', JSON.stringify(salePayload, null, 2));
            console.log('=== END FRONTEND SALE CREATION ===');

            // Frontend validation: block if any line doesn't have a selected product UUID.
            // Accept either product_id or id as the product identifier
            const missingProduct = (transformedItems || [])
              .map((it: any, idx: number) => ({ 
                idx, 
                product_id: String(it?.product_id || it?.id || '').trim(), 
                name: it?.name 
              }))
              .filter((x: any) => !x.product_id);
            if (missingProduct.length > 0) {
              console.error('[BonCommandeModule] Blocking sale: missing product_id on items', missingProduct);
              toast.error('Veuillez sélectionner un produit depuis la liste (produit_id manquant).');
              return;
            }

            const saveResponse = await fetch(
              sale?.id
                ? `https://${projectId}.supabase.co/functions/v1/super-handler/sales/${sale.id}`
                : `https://${projectId}.supabase.co/functions/v1/super-handler/sales`,
              {
                method: sale?.id ? 'PUT' : 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify(salePayload),
              }
            );

            if (saveResponse.ok) {
              const responseData = await saveResponse.json();
              console.log('Sale saved successfully:', JSON.stringify(responseData, null, 2));
              toast.success(`Bon de Commande généré et sauvegardé: ${documentId}`);
            } else {
              const errorText = await saveResponse.text();
              console.error('Could not save sale to database:', errorText);
              console.warn('Could not save sale to database');
              toast.success(`Bon de Commande généré: ${documentId}`);
            }
          } catch (saveError) {
            console.error('Error saving sale:', saveError);
            toast.success(`Bon de Commande généré: ${documentId}`);
          }

          // Reset form
          setOrderData({
            company: {
              referenceNumero: '',
              palette: '',
              transporteur: '',
              fraisMaritime: 0,
              fraisTransit: 0,
              onssa: 0,
              fraisDivers: 0,
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
            invoiceDate: new Date().toISOString().split('T')[0],
            executionDate: new Date().toISOString().split('T')[0],
          });
          setBankProofUrl('');
          setBankProofFile(null);
          setSelectedCheck(null);

          if (onBack) {
            onBack();
          }
        } else {
          toast.error('Erreur lors du téléchargement du PDF');
        }
      } else {
        toast.error('Erreur lors de la création du document');
      }
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const totals = calculateTotals();

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-row justify-between items-center mb-8 w-full gap-4">
        <h1 className="text-3xl font-bold text-gray-900 flex-1">Créer un Bon de Commande</h1>
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

      <div className="grid grid-cols-1 gap-6">
        {/* Client Information */}
        <Card>
          <CardHeader>
            <CardTitle>Informations Client</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-semibold text-gray-700 mb-2 block">N° Bon de Livraison</Label>
              <Input
                value={customBlId}
                onChange={(e) => setCustomBlId(e.target.value)}
                onBlur={() => {
                  // Ensure typed BL is captured even if user clicks Confirm quickly
                  setCustomBlId((v) => String(v || '').trim());
                }}
                placeholder={blId ? `Auto: ${blId}` : 'Auto: BL-XXXXX'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono font-semibold"
              />
              <p className="text-xs text-gray-500 mt-1">Laissez vide pour utiliser le numéro auto-généré</p>
            </div>
            <div className="relative">
              <Label>Nom du Client</Label>
              <Input
                value={orderData.client.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleClientChange('name', e.target.value)}
                onFocus={() => orderData.client.name && setShowClientSuggestions(true)}
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
                value={orderData.client.phone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleClientChange('phone', e.target.value)}
              />
            </div>
            <div>
              <Label>Adresse</Label>
              <Input
                value={orderData.client.address}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleClientChange('address', e.target.value)}
              />
            </div>
            <div>
              <Label>ICE</Label>
              <Input
                value={orderData.client.ice}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleClientChange('ice', e.target.value)}
              />
            </div>
                      </CardContent>
        </Card>
      </div>

      {/* Order Items */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Articles du Bon de Commande</CardTitle>
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
                  <th className="text-left py-2 px-2 text-xs">Stock Disp.</th>
                  <th className="text-center py-2 px-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {orderData.items.map((item, index) => (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-2">{index + 1}</td>
                    <td className="py-2 px-2 relative">
                      <Input
                        value={item.description}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          const searchValue = e.target.value;
                          // Update description directly
                          handleItemChange(item.id, 'description', searchValue);
                          // Use for search
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
                            <h3 className="font-semibold text-gray-900 text-sm">Produits disponibles</h3>
                            <p className="text-xs text-gray-600 mt-1">{filteredProducts.length} résultat{filteredProducts.length > 1 ? 's' : ''}</p>
                          </div>
                          
                          {/* Scrollable List */}
                          <div className="overflow-y-auto flex-1">
                            {filteredProducts.map((product) => {
                              // Prefer store-specific stock (store_stocks) / totals. quantity_available can be stale.
                              const stock =
                                Number(product?.total_store_stock ?? 0) > 0
                                  ? Number(product.total_store_stock)
                                  : product?.store_stocks && typeof product.store_stocks === 'object'
                                    ? Object.values(product.store_stocks).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0)
                                    : (Number(product?.quantity_available) || 0);

                              const tpl = getTemplateForProduct(product);
                              const tplRef = tpl?.reference_number ?? tpl?.reference ?? null;
                              const tplName = tpl?.name ?? null;
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

                                    // Import all product fields
                                    console.log('=== PRODUCT SELECTION ===');
                                    console.log('Selected product:', product.name);
                                    console.log('Product details:', product);
                                    
                                    // Update item with all product details
                                    setOrderData({
                                      ...orderData,
                                      items: orderData.items.map((i) => {
                                        if (i.id === item.id) {
                                          return {
                                            ...i,
                                            description: product.name,
                                            reference: (tplRef ?? product.reference) || i.reference,
                                            category: product.category || i.category,
                                            lot: product.lot || i.lot,
                                            fourchette_min: (tplMin ?? product.fourchette_min) || i.fourchette_min,
                                            fourchette_max: (tplMax ?? product.fourchette_max) || i.fourchette_max,
                                            product_id: product.id,
                                            // Store current stock so we can enforce caisse/quantite limits in inputs
                                            // (Bon de Commande should not allow selling more than available stock)
                                            __available_stock: stock,
                                          } as any;
                                        }
                                        return i;
                                      }),
                                    });
                                    
                                    console.log('=== END SELECTION ===');
                                    setShowProductSuggestions({ ...showProductSuggestions, [item.id]: false });
                                    toast.success(`${product.name} sélectionné avec tous les détails`);
                                  }}
                                  className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors group"
                                >
                                  <div className="flex justify-between items-start gap-3">
                                    <div className="flex-1">
                                      <div className="font-medium text-gray-900 text-sm group-hover:text-blue-600">{product.name}</div>
                                      <>
                                        <div className="text-xs text-gray-600 mt-1">
                                          Ref: <span className="font-mono text-gray-700">{(tplRef ?? product.reference) || '-'}</span>
                                        </div>
                                        {tplName && tplName !== product.name && (
                                          <div className="text-xs text-gray-600 mt-1">
                                            Modèle: <span className="font-medium text-gray-800">{tplName}</span>
                                          </div>
                                        )}
                                      </>
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
                          const n = parseFloat(String(v)) || 0;
                          
                          // Validate cumulative stock across all order lines for caisse
                          if (item.product_id) {
                            const availableStock = Number((item as any).__available_stock) || 0;
                            const cumulativeCaisse = getCumulativeCaisse(item.product_id, item.id);
                            const remainingStock = Math.max(0, availableStock - cumulativeCaisse);
                            
                            if (n > remainingStock) {
                              toast.error(`❌ Stock insuffisant: ${availableStock} unités disponibles. ${remainingStock} restantes pour ce produit.`);
                              handleItemChange(item.id, 'caisse', String(remainingStock));
                              return;
                            }
                          } else {
                            // Fallback to original behavior if no product_id
                            const available = Number((item as any).__available_stock);
                            if (Number.isFinite(available) && available >= 0 && n > available) {
                              toast.error(`❌ Stock insuffisant: max ${available}`);
                              handleItemChange(item.id, 'caisse', String(available));
                              return;
                            }
                          }
                          handleItemChange(item.id, 'caisse', v);
                        }}
                        onBlur={() => {
                          // Validate moyenne when leaving caisse field
                          const caisse = parseFloat(item.caisse) || 0;
                          const quantity = item.quantity || 0;
                          if (caisse > 0 && quantity > 0) {
                            const calculatedMoyenne = parseFloat((quantity / caisse).toFixed(2));

                            // Prefer the fourchette stored on the line item (set during product selection)
                            // which already uses template values when available.
                            const min = (item.fourchette_min ?? null) as any;
                            const max = (item.fourchette_max ?? null) as any;

                            if (min !== null && calculatedMoyenne < Number(min)) {
                              toast.error(`❌ Moyenne minimale requise: ${min} (calculée: ${calculatedMoyenne})`);
                            } else if (max !== null && calculatedMoyenne > Number(max)) {
                              toast.error(`❌ Moyenne maximale autorisée: ${max} (calculée: ${calculatedMoyenne})`);
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
                          // No validation for quantity field - allow any value
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
                    <td className="py-2 px-2 font-semibold">{item.subtotal.toFixed(2)} MAD</td>
                    <td className="py-2 px-2">
                      {item.product_id ? (
                        <span className={`text-xs font-semibold ${getRemainingStock(item.product_id, item.id) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {getRemainingStock(item.product_id, item.id)}
                      </span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
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

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Résumé</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-w-xs ml-auto">
            <div className="flex justify-between">
              <span>Sous-total HT:</span>
              <span className="font-semibold">{totals.subtotal.toFixed(2)} MAD</span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span>Remise:</span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={orderData.remiseAmount || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const value = parseFloat(e.target.value) || 0;
                    setOrderData({
                      ...orderData,
                      remiseAmount: Math.max(0, value),
                    });
                  }}
                  placeholder="0.00"
                  className="w-24 h-8 px-3 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm font-medium text-gray-900"
                />
                <span className="text-sm font-medium text-gray-700">MAD</span>
              </div>
            </div>
            <div className="border-t pt-3 flex justify-between text-lg font-bold text-orange-600">
              <span>Total:</span>
              <span>{totals.total.toFixed(2)} MAD</span>
            </div>

            <div className="space-y-4 border-t pt-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[180px]">
                  <Label className="text-sm font-semibold text-gray-700 mb-2 block">Date de Facture</Label>
                  <Input
                    type="date"
                    value={orderData.invoiceDate}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setOrderData({ ...orderData, invoiceDate: e.target.value })
                    }
                    className="bg-white"
                  />
                </div>

                <div className="flex-1 min-w-[180px]">
                  <Label className="text-sm font-semibold text-gray-700 mb-2 block">Date d'Exécution</Label>
                  <Input
                    type="date"
                    value={orderData.executionDate}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setOrderData({ ...orderData, executionDate: e.target.value })
                    }
                    className="bg-white"
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm font-semibold text-gray-700 mb-2 block">Statut de Paiement</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                  <Button
                    type="button"
                    onClick={() => {
                      setOrderData({
                        ...orderData,
                        status: 'Non Payée',
                        amountPaid: 0,
                      });
                      toast.success('Statut: Non Payée');
                    }}
                    className={`h-9 px-3 rounded-md text-sm font-semibold border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black ${
                      orderData.status === 'Non Payée'
                        ? '!bg-black !text-white !border-black'
                        : 'bg-white text-gray-700 border-gray-300'
                    }`}
                  >
                    Non Payée
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setOrderData({
                        ...orderData,
                        status: 'Partiellement payée',
                        amountPaid: 0,
                      });
                      toast.success('Statut: Partiellement Payée');
                    }}
                    className={`h-9 px-3 rounded-md text-sm font-semibold border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black ${
                      orderData.status === 'Partiellement payée'
                        ? '!bg-black !text-white !border-black'
                        : 'bg-white text-gray-700 border-gray-300'
                    }`}
                  >
                    Partiellement payée
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      const totals = calculateTotals();
                      setOrderData({
                        ...orderData,
                        status: 'Payée',
                        amountPaid: totals.total,
                      });
                      toast.success('Statut: Payée');
                    }}
                    className={`h-9 px-3 rounded-md text-sm font-semibold border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black ${
                      orderData.status === 'Payée'
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
                  value={orderData.paymentMethod}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setOrderData({
                      ...orderData,
                      paymentMethod: e.target.value as 'cash' | 'check' | 'bank_transfer',
                    })
                  }
                  className="w-full h-10 px-3 pr-10 border border-gray-300 rounded-md bg-white text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                >
                  <option value="cash">Espèces</option>
                  <option value="check">Chèque</option>
                  <option value="bank_transfer">Virement bancaire</option>
                </select>
              </div>

              {orderData.paymentMethod === 'cash' && (
                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                  <Label className="text-sm font-semibold text-gray-700 mb-2 block">Montant Payé</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      placeholder="Entrez le montant payé"
                      value={orderData.amountPaid || ''}
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

                        setOrderData({
                          ...orderData,
                          amountPaid: amountPaid,
                          status: newStatus,
                        });
                      }}
                      required
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                    <span className="font-semibold text-gray-700">MAD</span>
                  </div>
                  {orderData.amountPaid !== undefined && orderData.amountPaid > 0 && (
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total:</span>
                        <span className="font-semibold">{totals.total.toFixed(2)} MAD</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Payé:</span>
                        <span className="font-semibold text-green-600">{orderData.amountPaid.toFixed(2)} MAD</span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="text-gray-600">Reste:</span>
                        <span className={`font-semibold ${(totals.total - orderData.amountPaid) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {(totals.total - orderData.amountPaid).toFixed(2)} MAD
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {orderData.paymentMethod === 'bank_transfer' && (
                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200 space-y-3">
                  <Label className="text-sm font-semibold text-gray-700 mb-2 block">Montant Payé (Virement)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      placeholder="Entrez le montant payé"
                      value={orderData.amountPaid || ''}
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
                        setOrderData({
                          ...orderData,
                          amountPaid,
                          status: newStatus,
                        });
                      }}
                      required
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <span className="font-semibold text-gray-700">MAD</span>
                  </div>
                  {orderData.amountPaid !== undefined && (
                    <div className="mt-1 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total:</span>
                        <span className="font-semibold">{totals.total.toFixed(2)} MAD</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Payé:</span>
                        <span className="font-semibold text-indigo-600">{(orderData.amountPaid || 0).toFixed(2)} MAD</span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="text-gray-600">Reste:</span>
                        <span className={`font-semibold ${((totals.total - (orderData.amountPaid || 0)) > 0) ? 'text-orange-600' : 'text-green-600'}`}>
                          {(Math.max(0, totals.total - (orderData.amountPaid || 0))).toFixed(2)} MAD
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

              {orderData.paymentMethod === 'check' && (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <Label className="text-sm font-semibold text-gray-700 mb-2 block">Sélectionner un Chèque</Label>
                  <div className="flex gap-2 mb-3">
                    <Dialog open={checkDialogOpen} onOpenChange={setCheckDialogOpen}>
                      <DialogTrigger asChild>
                        <Button 
                          className="flex-1"
                          style={{ backgroundColor: '#3b82f6', color: 'white' }}
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
                        >
                          🏦 Choisir un Chèque
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
                        <DialogHeader>
                          <DialogTitle>Sélectionner un Chèque pour le Paiement</DialogTitle>
                        </DialogHeader>
                        {loadingChecks ? (
                          <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                          </div>
                        ) : checks.length === 0 ? (
                          <div className="text-center py-8">
                            <p className="text-gray-500">Aucun chèque disponible</p>
                          </div>
                        ) : (
                          <div className="overflow-y-auto flex-1">
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
                                {checks.filter((check) => check.status !== 'used' && check.status !== 'archived').map((check) => (
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
                                        size="sm"
                                        className="w-full h-10 rounded-md bg-emerald-600 text-white font-semibold text-sm hover:opacity-90"
                                        style={{ backgroundColor: '#10b981', color: 'white' }}
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
                      </DialogContent>
                    </Dialog>
                    <Dialog open={createCheckDialogOpen} onOpenChange={(open: boolean) => {
                      setCreateCheckDialogOpen(open);
                      if (open) {
                        setUploadCheckDate(getTodayDate());
                        setUploadExecutionDate(getTodayDate());
                      }
                    }}>
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
                        <span className="text-sm font-bold text-green-600">{(selectedCheck.remaining_balance || 0).toFixed(2)} MAD</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-gray-700">Total Bon:</span>
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

              {/* Additional Payment Methods Section */}
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

              {/* Confirm and Generate PDF Buttons */}
              <div className="border-t pt-4 space-y-3">
                {/* Confirm Button */}
                <Button 
                onClick={async () => {
                if (!validateBeforeSubmit()) return;
                
                // Validate all items have valid moyenne within fourchette
                const invalidItems: string[] = [];
                    
                    orderData.items.forEach((item, index) => {
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

                    if (orderData.items.length === 0) {
                      toast.error('Veuillez ajouter au moins un article');
                      return;
                    }

                    if (!orderData.client.name) {
                      toast.error('Veuillez entrer le nom du client');
                      return;
                    }

                    const totals = calculateTotals();
                    const amountPaid = (orderData.paymentMethod === 'cash' || orderData.paymentMethod === 'bank_transfer') 
                      ? (orderData.amountPaid || 0) 
                      : 0;

                    // Require > 0 only if status is Payée
                    if (orderData.status === 'Payée' && amountPaid <= 0) {
                      toast.error('Le montant payé doit être supérieur à 0 pour une vente marquée Payée');
                      return;
                    }

                    if (orderData.paymentMethod === 'check' && !selectedCheck) {
                      toast.error('Veuillez sélectionner un chèque');
                      return;
                    }

                    // Save order to database without generating PDF
                    setLoading(true);
                    try {
                      // Transform items to match backend expectations
                      const transformedItems = orderData.items.map(item => ({
                        // Keep `id` as the client-side line id. product_id must be a real product UUID.
                        // If product_id is missing, use id as fallback
                        id: item.id,
                        product_id: item.product_id || item.id,
                        productId: item.product_id || item.id,
                        name: item.description,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        subtotal: item.subtotal,
                        reference: item.reference,
                        category: item.category,
                        lot: item.lot,
                        caisse: item.caisse,
                        moyenne: item.moyenne,
                        fourchette_min: item.fourchette_min,
                        fourchette_max: item.fourchette_max,
                      }));

                      console.log('=== FRONTEND SALE CONFIRMATION (NO PDF) ===');
                      console.log('Transformed items:', JSON.stringify(transformedItems, null, 2));
                      console.log('Items count:', transformedItems.length);

                      // Frontend validation: block if any line doesn't have a selected product UUID.
                      // Accept either product_id or id as the product identifier
                      const missingProduct = (transformedItems || [])
                        .map((it: any, idx: number) => ({ 
                          idx, 
                          product_id: String(it?.product_id || it?.id || '').trim(), 
                          name: it?.name 
                        }))
                        .filter((x: any) => !x.product_id);
                      if (missingProduct.length > 0) {
                        console.error('[BonCommandeModule] Blocking sale confirmation: missing product_id on items', missingProduct);
                        toast.error('Veuillez sélectionner un produit depuis la liste (produit_id manquant).');
                        setLoading(false);
                        return;
                      }

                      // Consume BL only now (on actual save) so opening/canceling does not waste numbers.
                      let finalBlId = blId;
                      try {
                      const blRes = await fetch(
                      `https://${projectId}.supabase.co/functions/v1/super-handler/bl/next`,
                      {
                      method: 'POST',
                      headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${session?.access_token}`,
                      },
                      body: JSON.stringify({ counter_id: 'global' }),
                      }
                      );
                      
                      if (blRes.ok) {
                      const blPayload = await blRes.json();
                      // If user typed a custom BL, never overwrite it with an auto-consumed one.
                      if (customBlId.trim()) {
                        finalBlId = customBlId.trim();
                      } else {
                        finalBlId = blPayload?.bl_number || finalBlId;
                      }
                      setBlId(finalBlId);
                      } else {
                      const txt = await blRes.text().catch(() => '');
                      console.error('[BonCommandeModule] Failed to consume BL on save', blRes.status, txt);
                      }
                      } catch (e) {
                      console.error('[BonCommandeModule] Exception consuming BL on save', e);
                      }
                      
                      const salePayload = {
                      sale_number: finalBlId,
                      // When admin is acting as a magasin, attach the sale to that magasin.
                      // Otherwise store_id stays null and magasin filtering will show nothing.
                      store_id: adminSelectedMagasinId || null,
                      client_name: orderData.client.name,
                      client_phone: orderData.client.phone,
                      client_address: orderData.client.address,
                      client_ice: orderData.client.ice,
                      payment_method: orderData.paymentMethod,
                      bank_transfer_proof_url: bankProofUrl || undefined,
                      // Backend computes total_amount from items, so we send subtotal
                      total_amount: totals.subtotal,
                      // Persist remise amount on the sale so BL history & reports can show it.
                      // Backend canonical field: total_remise
                      total_remise: Math.max(0, Number(orderData.remiseAmount || 0) || 0),
                      // Backward-compat alias (some code paths used camelCase previously)
                      totalRemise: Math.max(0, Number(orderData.remiseAmount || 0) || 0),
                      amount_paid: (orderData.paymentMethod === 'cash' || orderData.paymentMethod === 'bank_transfer') ? (orderData.amountPaid || 0) : 0,
                      // remaining_balance is calculated from totals.total (after remise) on backend
                      remaining_balance: (orderData.paymentMethod === 'cash' || orderData.paymentMethod === 'bank_transfer') ? Math.max(0, totals.total - (orderData.amountPaid || 0)) : totals.total,
                      tva_percentage: 0,
                      status: orderData.status === 'Payée' ? 'paid' : 'pending',
                      invoice_date: orderData.invoiceDate,
                      execution_date: orderData.executionDate,
                      items: transformedItems,
                      notes: 'Bon de Commande',
                      };

                      console.log('Sale payload:', JSON.stringify(salePayload, null, 2));

                      // Determine if we're creating or updating
                      const isEditing = sale && sale.id;
                      const method = isEditing ? 'PUT' : 'POST';
                      const endpoint = isEditing 
                        ? `https://${projectId}.supabase.co/functions/v1/super-handler/sales/${sale.id}`
                        : `https://${projectId}.supabase.co/functions/v1/super-handler/sales`;

                      const saveResponse = await fetch(endpoint, {
                        method,
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${session?.access_token}`,
                        },
                        body: JSON.stringify(salePayload),
                      });

                      if (saveResponse.ok) {
                        const responseData = await saveResponse.json();
                        console.log('Sale saved successfully:', JSON.stringify(responseData, null, 2));
                        toast.success(`Bon de Commande confirmé: ${blId}`);
                        
                        // Reset form
                        setOrderData({
                          company: {
                            referenceNumero: '',
                            palette: '',
                            transporteur: '',
                            fraisMaritime: 0,
                            fraisTransit: 0,
                            onssa: 0,
                            fraisDivers: 0,
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
                          invoiceDate: new Date().toISOString().split('T')[0],
                          executionDate: new Date().toISOString().split('T')[0],
                        });
                        setBankProofUrl('');
                        setBankProofFile(null);
                        setSelectedCheck(null);

                        if (onBack) {
                          onBack();
                        }
                      } else {
                        const errorText = await saveResponse.text();
                        console.error('Could not save sale to database:', errorText);
                        toast.error('Erreur lors de la sauvegarde');
                      }
                    } catch (error: any) {
                      console.error('Error confirming sale:', error);
                      toast.error(`Erreur: ${error.message}`);
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="w-full"
                  style={{ backgroundColor: '#3b82f6', color: 'white' }}
                >
                  <Check className="w-4 h-4 mr-2" />
                  {loading ? 'Confirmation...' : 'Confirmer'}
                </Button>

                {/* Generate PDF Button */}
                <Button 
                onClick={() => {
                if (!validateBeforeSubmit()) return;
                
                // Validate all items have valid moyenne within fourchette
                const invalidItems: string[] = [];
                    
                    orderData.items.forEach((item, index) => {
                      if (item.description && item.moyenne) {
                        const product = products.find(p => p.name === item.description);
                        if (product && (product.fourchette_min !== null || product.fourchette_max !== null)) {
                          const moyenneValue = parseFloat(item.moyenne);
                          const min = product.fourchette_min;
                          const max = product.fourchette_max;
                          
                          if ((min !== null && moyenneValue < min) || (max !== null && moyenneValue > max)) {
                            invalidItems.push(
                              `Ligne ${index + 1} (${item.description}): Moyenne ${moyenneValue} - Fourchette requise: ${min || '∞'} à ${max || '∞'}`
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
                      if (orderData.paymentMethod === 'bank_transfer' && bankProofFile) {
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
                            setBankProofUrl(uploadedUrl || '');
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

                    if (orderData.items.length === 0) {
                      toast.error('Veuillez ajouter au moins un article');
                      return;
                    }

                    if (!orderData.client.name) {
                      toast.error('Veuillez entrer le nom du client');
                      return;
                    }

                    const totals = calculateTotals();
                    const amountPaid = (orderData.paymentMethod === 'cash' || orderData.paymentMethod === 'bank_transfer') 
                      ? (orderData.amountPaid || 0) 
                      : 0;

                    // Require > 0 only if status is Payée
                    if (orderData.status === 'Payée' && amountPaid <= 0) {
                      toast.error('Le montant payé doit être supérieur à 0 pour une vente marquée Payée');
                      return;
                    }

                    if (orderData.paymentMethod === 'check' && !selectedCheck) {
                      toast.error('Veuillez sélectionner un chèque');
                      return;
                    }

                    proceed();
                  }}
                  disabled={loading}
                  className="w-full"
                  style={{ backgroundColor: '#10b981', color: 'white' }}
                className="w-full h-10 rounded-md bg-emerald-600 text-white font-semibold text-sm hover:opacity-90"
              >
                  <Download className="w-4 h-4 mr-2" />
                  {loading ? 'Génération...' : 'Générer PDF'}
                </Button>
              </div>

              {Object.keys(additionalPayments).length < 3 && (
                <div className="border-t pt-4">
                  <Button
                    type="button"
                    onClick={() => setAdditionalPaymentDialogOpen(true)}
                    className="w-full"
                    style={{ backgroundColor: '#a855f7', color: 'white' }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter une méthode de paiement
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Payment Method Dialog */}
      <Dialog open={additionalPaymentDialogOpen} onOpenChange={setAdditionalPaymentDialogOpen}>
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
                        setAdditionalPaymentDialogOpen(false);
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
                      setAdditionalPaymentDialogOpen(false);
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
                      setAdditionalPaymentDialogOpen(false);
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
                      setAdditionalPaymentDialogOpen(false);
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
  );
}