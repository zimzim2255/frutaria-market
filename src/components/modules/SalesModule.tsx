import { useState, useEffect } from 'react';
import { projectId } from '../../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Plus, Eye, Search, ShoppingCart, Users, Truck, Package, CheckCircle, XCircle, AlertTriangle, Clock, Trash2, ArrowLeft, Download, Edit, FileText } from 'lucide-react';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { SalesDetailsPage } from '../SalesDetailsPage';
import BonCommandeModule from './BonCommandeModule';
import { exportToExcelHtml, exportToPdfTable, type TableColumn } from '../../utils/export/exportUtils';

interface SalesModuleProps {
  session: any;
}

export function SalesModule({ session }: SalesModuleProps) {
  const [sales, setSales] = useState<any[]>([]);
  const [partialPayments, setPartialPayments] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewSaleForm, setShowNewSaleForm] = useState(false);
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [userRole, setUserRole] = useState<string>('user');
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [selectedMagasinForAdmin, setSelectedMagasinForAdmin] = useState<string>('');

  // Table sorting (A→Z / Z→A + numeric)
  const [sortConfig, setSortConfig] = useState<{ key: 'sale_number' | 'client_name' | 'store_name' | 'total_amount' | 'payment_status' | 'delivery_status' | 'created_at' | null; direction: 'asc' | 'desc' }>({
    key: null,
    direction: 'asc',
  });

  const isAdmin = userRole === 'admin';
  const adminHasSelectedStore = Boolean(selectedMagasinForAdmin);

  // Permission helper
  const hasPermission = (perm: string) => {
    if (isAdmin) return true;
    return userPermissions.includes(perm);
  };

  const [saleItems, setSaleItems] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [productQuantity, setProductQuantity] = useState(1);
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [formData, setFormData] = useState({
    store_id: '',
    client_id: '',
    total_amount: '',
    amount_paid: '',
    payment_status: 'unpaid',
    payment_method: 'cash',
    client_name: '',
    client_phone: '',
    client_address: '',
    client_ice: '',
    client_if: '',
    client_rc: '',
    client_patente: '',
    notes: '',
  });
  const [clients, setClients] = useState<any[]>([]);
  const [filteredClients, setFilteredClients] = useState<any[]>([]);
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  const [clientSearchInput, setClientSearchInput] = useState('');
  const [usersById, setUsersById] = useState<Record<string, any>>({});

  const fetchSales = async () => {
    try {
      console.log('[SalesModule] fetchSales -> start', {
        userId: session?.user?.id,
        hasToken: Boolean(session?.access_token),
      });

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/sales?user_id=${session.user.id}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      console.log('[SalesModule] fetchSales -> response', {
        status: response.status,
        ok: response.ok,
      });

      if (response.ok) {
        const data = await response.json();
        // Ensure each sale has sale_items array
        const salesWithItems = (data.sales || []).map((sale: any) => ({
          ...sale,
          sale_items: sale.sale_items || [],
        }));
        console.log('[SalesModule] fetchSales -> received', {
          count: salesWithItems.length,
          first: salesWithItems[0] || null,
        });
        setSales(salesWithItems);
      } else {
        let errText = '';
        try {
          errText = await response.text();
        } catch {}
        console.error('[SalesModule] fetchSales failed', {
          status: response.status,
          statusText: response.statusText,
          body: errText,
        });
      }
    } catch (error) {
      console.error('Error fetching sales:', error);
      toast.error('Erreur lors du chargement des ventes');
    }
  };

  const fetchPartialPayments = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/partial-payments`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setPartialPayments(data.partial_payments || []);
      }
    } catch (error) {
      console.error('Error fetching partial payments:', error);
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
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/products`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setProducts(data.products || []);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchClients = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/clients`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setClients(data.clients || []);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const fetchUsersMap = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/users`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.ok) {
        const txt = await response.text();
        console.error('[SalesModule] fetchUsersMap failed', response.status, txt);
        return;
      }

      const payload = await response.json();
      const map: Record<string, any> = {};
      (payload?.users || []).forEach((u: any) => {
        if (u?.id) map[String(u.id)] = u;
      });
      setUsersById(map);
    } catch (error) {
      console.error('[SalesModule] Error fetching users map:', error);
    }
  };

  useEffect(() => {
    // Fetch user role.
    // session.user.user_metadata.role is often missing; the real role lives in the `users` table.
    // We already have a backend endpoint that reads from `users`, so use it.
    const fetchRoleFromDb = async () => {
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/users`,
          {
            headers: {
              'Authorization': `Bearer ${session?.access_token}`,
            },
          }
        );

        if (!res.ok) {
          const txt = await res.text();
          console.error('[SalesModule] failed to fetch /users for role', res.status, txt);
          return;
        }

        const payload = await res.json();
        const me = (payload?.users || []).find((u: any) => u.id === session?.user?.id);
        if (me?.role) {
          setUserRole(me.role);
        } else if (session?.user?.user_metadata?.role) {
          // fallback
          setUserRole(session.user.user_metadata.role);
        }
        if (Array.isArray(me?.permissions)) {
          setUserPermissions(me.permissions);
        } else {
          setUserPermissions([]);
        }
      } catch (error) {
        console.error('Error fetching user role:', error);
      }
    };

    if (session?.access_token && session?.user?.id) {
      fetchRoleFromDb();
    }
  }, [session?.access_token, session?.user?.id]);

  useEffect(() => {
    fetchSales();
    fetchStores();
    fetchProducts();
    fetchClients();
    fetchUsersMap();
    fetchPartialPayments();

    // Refresh partial payments every 5 seconds
    const interval = setInterval(() => {
      fetchPartialPayments();
    }, 5000);

    return () => clearInterval(interval);
  }, [session?.access_token, session?.user?.id]);

  // Debug: prove SalesModule is mounted and what role/store selection it thinks it has.
  useEffect(() => {
    console.log('[SalesModule] mounted', {
      userEmail: session?.user?.email,
      userId: session?.user?.id,
      userRole,
      selectedMagasinForAdmin,
    });
  }, []);

  // Resolve key permissions for Sales
  const canViewSales = hasPermission('Voir les Ventes') || hasPermission('Voir l\'Historique des Ventes');
  // Export permission: we reuse any existing "Exporter" sales permissions (if present) and also allow admins.
  const canExportSales = isAdmin || hasPermission('Exporter Ventes (CSV)') || hasPermission('Exporter Ventes') || hasPermission('Exporter');
  const canExportSalesPdf = canExportSales;
  const canExportSalesExcel = canExportSales;

  const canCreateSale = hasPermission('Créer une Vente');

  // IMPORTANT: Account Manager and normal user must NOT be able to modify/edit sales.
  // Only admins can edit.
  const canEditSale = isAdmin;

  // Only admins can cancel/delete sales.
  // Manager/user must not see the delete button.
  const canCancelOrDeleteSale = isAdmin;
  const canPrintSale = hasPermission('Imprimer une Vente') || canViewSales;

  useEffect(() => {
    console.log('[SalesModule] state', {
      userRole,
      selectedMagasinForAdmin,
      salesCount: sales.length,
      searchTerm,
    });
  }, [userRole, selectedMagasinForAdmin, sales.length, searchTerm]);

  const addProductToSale = () => {
    if (!selectedProduct) {
      toast.error('Veuillez sélectionner un produit');
      return;
    }

    if (productQuantity <= 0) {
      toast.error('La quantité doit être supérieure à 0');
      return;
    }

    if (productQuantity > selectedProduct.quantity_available) {
      toast.error(`Stock insuffisant! Disponible: ${selectedProduct.quantity_available}`);
      return;
    }

    const existingItem = saleItems.find(item => item.id === selectedProduct.id);
    
    // Create item with all product details
    const newItem = {
      id: selectedProduct.id,
      product_id: selectedProduct.id,
      name: selectedProduct.name,
      reference: selectedProduct.reference || null,
      category: selectedProduct.category || null,
      lot: selectedProduct.lot || null,
      number_of_boxes: selectedProduct.number_of_boxes || 0,
      avg_net_weight_per_box: selectedProduct.avg_net_weight_per_box || null,
      fourchette_min: selectedProduct.fourchette_min || null,
      fourchette_max: selectedProduct.fourchette_max || null,
      sale_price: selectedProduct.sale_price,
      unitPrice: selectedProduct.sale_price,
      quantity: productQuantity,
      total_price: productQuantity * selectedProduct.sale_price,
      subtotal: productQuantity * selectedProduct.sale_price,
    };
    
    if (existingItem) {
      setSaleItems(saleItems.map(item =>
        item.id === selectedProduct.id
          ? { 
              ...item, 
              quantity: item.quantity + productQuantity, 
              total_price: (item.quantity + productQuantity) * selectedProduct.sale_price,
              subtotal: (item.quantity + productQuantity) * selectedProduct.sale_price,
            }
          : item
      ));
    } else {
      setSaleItems([...saleItems, newItem]);
    }

    setSelectedProduct(null);
    setProductQuantity(1);
    toast.success(`${selectedProduct.name} ajouté à la vente`);
  };

  const removeProductFromSale = (productId: string) => {
    setSaleItems(saleItems.filter(item => item.id !== productId));
  };

  const calculateSaleTotal = () => {
    return saleItems.reduce((sum, item) => sum + item.total_price, 0);
  };

  const handlePaymentStatusChange = (status: string) => {
    const actualTotal = formData.total_amount ? parseFloat(formData.total_amount) : calculateSaleTotal();
    
    if (status === 'unpaid') {
      // Non Payée: montant payé = 0
      setFormData({ ...formData, payment_status: 'unpaid', amount_paid: '0' });
    } else if (status === 'paid') {
      // Payée: montant payé = total
      setFormData({ ...formData, payment_status: 'paid', amount_paid: actualTotal.toString() });
    } else if (status === 'partial') {
      // Partiellement Payée: montant payé = 0
      setFormData({ ...formData, payment_status: 'partial', amount_paid: '0' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Determine totals and validate payment
      const actualTotal = formData.total_amount ? parseFloat(formData.total_amount) : calculateSaleTotal();
      const amountPaid = formData.amount_paid ? parseFloat(formData.amount_paid) : 0;

      if (isNaN(actualTotal)) {
        toast.error('Montant total invalide');
        setLoading(false);
        return;
      }

      if (amountPaid < 0) {
        toast.error('Le montant du paiement ne peut pas être négatif');
        setLoading(false);
        return;
      }

      // Enforce minimum paid amount only when status is paid
      // Allow 0 when status is unpaid or partial
      const computedStatus = formData.payment_status;
      if (computedStatus === 'paid' && amountPaid <= 0) {
        toast.error('Le montant payé doit être supérieur à 0 pour une vente marquée Payée');
        setLoading(false);
        return;
      }

      if (amountPaid > actualTotal) {
        toast.error(`Le montant du paiement ne peut pas dépasser le total (${actualTotal.toFixed(2)} MAD)`);
        setLoading(false);
        return;
      }

      // Use the payment_status from formData (set by buttons)

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/sales`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            store_id: formData.store_id,
            total_amount: actualTotal,
            amount_paid: amountPaid,
            payment_status: computedStatus,
            notes: formData.notes,
            client_name: formData.client_name,
            client_phone: formData.client_phone,
            client_address: formData.client_address,
            client_ice: formData.client_ice,
            client_if_number: formData.client_if,
            client_rc: formData.client_rc,
            client_patente: formData.client_patente,
            items: saleItems,
          }),
        }
      );

      if (response.ok) {
        const saleData = await response.json();
        const saleId = saleData.sale?.id;

        // If partial payment, create a partial payment record
        if (computedStatus === 'partial' && saleId) {
          const remainingBalance = actualTotal - amountPaid;
          const pendingDiscount = remainingBalance;

          await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/partial-payments`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                sale_id: saleId,
                amount_paid: amountPaid,
                remaining_balance: remainingBalance,
                pending_discount: pendingDiscount,
                confirmation_status: 'pending',
                payment_method: 'cash',
                notes: formData.notes,
              }),
            }
          );
        }

        toast.success('Vente enregistrée');
        setShowNewSaleForm(false);
        resetForm();
        fetchSales();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const updateSaleStatus = async (saleId: string, newStatus: string) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/sales/${saleId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ delivery_status: newStatus }),
        }
      );

      if (response.ok) {
        toast.success(`Statut mis à jour: ${newStatus}`);
        fetchSales();
        if (selectedSale?.id === saleId) {
          setSelectedSale({ ...selectedSale, delivery_status: newStatus });
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const deleteSale = async (sale: any) => {
    try {
      const saleId = sale?.id;
      if (!saleId) {
        toast.error('ID vente manquant');
        return;
      }

      // Basic safety confirmation (prevents accidental deletion)
      const saleNumber = String(sale?.sale_number || '').trim() || String(saleId);
      const ok = window.confirm(`Supprimer définitivement la vente ${saleNumber} ?\n\nCette action supprime les données de la base.`);
      if (!ok) return;

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/sales/${encodeURIComponent(String(saleId))}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        let msg = 'Erreur lors de la suppression';
        try {
          const j = txt ? JSON.parse(txt) : null;
          msg = j?.error || j?.message || msg;
        } catch {
          // ignore JSON parse
        }
        toast.error(msg);
        return;
      }

      toast.success('Vente supprimée');

      // Refresh list + close details if it was open for this sale
      if (selectedSale?.id === saleId) {
        setShowDetails(false);
        setSelectedSale(null);
      }

      fetchSales();
    } catch (e: any) {
      toast.error(`Erreur: ${e?.message || 'suppression'}`);
    }
  };

  const resetForm = () => {
    setFormData({
      store_id: '',
      client_id: '',
      total_amount: '',
      amount_paid: '',
      payment_status: 'unpaid',
      payment_method: 'cash',
      client_name: '',
      client_phone: '',
      client_address: '',
      client_ice: '',
      client_if: '',
      client_rc: '',
      client_patente: '',
      notes: '',
    });
    setSaleItems([]);
    setSelectedProduct(null);
    setProductQuantity(1);
  };

  // Download BL (Bon de Livraison) PDF
  // Keep this flow identical to SalesHistoryModule so the output PDF matches exactly.
  const downloadBL = async (sale: any) => {
    try {
      // Try to get items from either sale_items or items field
      const itemsSource = (sale.sale_items && sale.sale_items.length > 0)
        ? sale.sale_items
        : ((sale as any).items || []);

      // Build items from sale
      const items = itemsSource.map((it: any) => {
        const resolvedName =
          it?.name ||
          it?.products?.name ||
          it?.description ||
          it?.product_name ||
          'Produit';

        const resolvedUnitPrice =
          it?.unitPrice ??
          it?.unit_price ??
          it?.sale_price ??
          it?.products?.sale_price ??
          0;

        const resolvedTotal =
          it?.total ??
          it?.total_price ??
          it?.subtotal ??
          it?.total_price ??
          ((Number(it?.quantity || 1) || 1) * (Number(resolvedUnitPrice) || 0));

        return {
          name: String(resolvedName),
          description: String(resolvedName),
          caisse: String(it?.caisse ?? ''),
          quantity: Number(it?.quantity || 1) || 1,
          moyenne: it?.moyenne || '',
          unitPrice: Number(resolvedUnitPrice) || 0,
          total: Number(resolvedTotal) || 0,
        };
      });

      const subtotal = items.reduce((s: number, it: any) => s + (it.total || 0), 0);

      const getPaymentStatusLabel = (status: string) => {
        if (status === 'paid') return 'Payée';
        if (status === 'partial') return 'Partiellement payée';
        return 'Non payée';
      };

      const getSaleRemise = (s: any) => {
        const v =
          s?.total_remise ??
          s?.totalRemise ??
          s?.remise_amount ??
          s?.discount_amount ??
          s?.total_discount ??
          s?.remise ??
          0;
        const n = typeof v === 'string' ? Number(String(v).replace(',', '.')) : Number(v);
        return Number.isFinite(n) ? n : 0;
      };

      // Step 1: Create document
      const remiseDoc = getSaleRemise(sale);
      const blPayload = {
        // Force BL explicitly (same as SalesHistoryModule)
        type: 'Bon Livraison',
        documentType: 'Bon Livraison',
        invoiceNumber: sale.sale_number,

        clientName: (sale as any).client_name || sale.stores?.name || 'Client',
        clientEmail: (sale as any).client_phone || '',
        clientAddress: (sale as any).client_address || '',
        clientICE: (sale as any).client_ice || '',
        invoiceDate: new Date(sale.created_at).toISOString().split('T')[0],
        executionDate: new Date(sale.created_at).toISOString().split('T')[0],
        date: new Date(sale.created_at).toISOString().split('T')[0],
        items: items.map((it: any) => ({ name: it.name, description: it.description, quantity: it.quantity, unitPrice: it.unitPrice, total: it.total })),
        notes: '',
        paymentHeaderNote: `Statut: ${getPaymentStatusLabel(sale.payment_status)}`,
        // IMPORTANT: documents/template treats `remise` as percentage.
        remise: 0,
        remisePercentage: 0,
        subtotal,
        totalRemise: Math.max(0, remiseDoc),
        subtotalAfterRemise: Math.max(0, subtotal - Math.max(0, remiseDoc)),
        tva: 0,
        totalWithTVA: Math.max(0, subtotal - Math.max(0, remiseDoc)),
      } as any;

      const createRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/documents`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(blPayload),
        }
      );

      if (!createRes.ok) {
        toast.error('Erreur lors de la création du BL');
        return;
      }
      const createData = await createRes.json();
      const documentId = createData.id || sale.sale_number || `BL-${sale.id}`;

      // Step 2: Build query params and download PDF
      const q = new URLSearchParams();
      q.append('type', 'Bon Livraison');
      q.append('documentType', 'Bon Livraison');
      q.append('invoiceNumber', String(sale.sale_number || ''));
      q.append('saleNumber', String(sale.sale_number || ''));

      q.append('clientName', blPayload.clientName);
      q.append('clientPhone', (sale as any).client_phone || '');
      q.append('clientAddress', blPayload.clientAddress);
      q.append('clientICE', blPayload.clientICE || '');
      q.append('invoiceDate', blPayload.invoiceDate);
      q.append('executionDate', blPayload.executionDate);
      q.append('date', blPayload.date);

      q.append('items', JSON.stringify(items.map((it: any) => ({
        name: it.name,
        description: it.description,
        caisse: it.caisse,
        quantity: it.quantity,
        moyenne: it.moyenne,
        unitPrice: it.unitPrice,
        total: it.total,
      }))));

      const remiseAmount = Math.max(0, remiseDoc);
      const subtotalAfterRemise = Math.max(0, subtotal - remiseAmount);

      q.append('subtotal', String(subtotal));
      q.append('remise', '0');
      q.append('remisePercentage', '0');
      q.append('totalRemise', String(remiseAmount));
      q.append('tva', '0');
      q.append('tvaPercentage', '0');
      q.append('totalWithTVA', String(subtotalAfterRemise));
      q.append('paymentHeaderNote', blPayload.paymentHeaderNote);

      const pdfRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/documents/${encodeURIComponent(documentId)}/pdf?${q.toString()}`,
        { method: 'GET', headers: { 'Content-Type': 'application/pdf' } }
      );

      if (!pdfRes.ok) {
        toast.error('Erreur lors du téléchargement du PDF');
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

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'unpaid':
        return 'bg-red-100 text-red-800';
      case 'partial':
        return 'bg-orange-100 text-orange-800';
      case 'paid':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getDeliveryStatusColor = (status: string) => {
    switch (status) {
      case 'preparing':
        return 'bg-yellow-100 text-yellow-800';
      case 'in_transit':
        return 'bg-blue-100 text-blue-800';
      case 'delivered':
        return 'bg-green-100 text-green-800';
      case 'canceled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredSalesBase = sales.filter(sale => {
    const matchesSearch =
      sale.sale_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.stores?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.client_name?.toLowerCase().includes(searchTerm.toLowerCase());

    // If admin selected a magasin, show ALL sales attached to that magasin.
    // NOTE: `store_id` can come back as uuid (string) or number/string depending on adapters;
    // normalize to string to make filtering reliable.
    if (userRole === 'admin' && selectedMagasinForAdmin) {
      const selectedId = String(selectedMagasinForAdmin);
      const saleStoreId = sale?.store_id != null ? String(sale.store_id) : '';
      const relatedStoreId = sale?.stores?.id != null ? String(sale.stores.id) : '';

      const matchesSelectedStore = saleStoreId === selectedId || relatedStoreId === selectedId;

      // Debug admin filtering issues (log once per selectedId+saleId to avoid console spam)
      if (!matchesSelectedStore) {
        try {
          const key = `[SalesModule] Filter mismatch|${selectedId}|${String(sale?.id || '')}`;
          const w: any = (window as any);
          w.__salesFilterMismatchLogged = w.__salesFilterMismatchLogged || new Set();
          if (!w.__salesFilterMismatchLogged.has(key)) {
            w.__salesFilterMismatchLogged.add(key);
            console.log('[SalesModule] Filter mismatch', {
              selectedId,
              saleId: sale?.id,
              sale_number: sale?.sale_number,
              saleStoreId,
              relatedStoreId,
              rawStoreId: sale?.store_id,
              rawRelatedStoreId: sale?.stores?.id,
            });
          }
        } catch {
          // ignore
        }
      }

      return matchesSelectedStore && matchesSearch;
    }

    // Otherwise show all sales matching search term
    return matchesSearch;
  });

  const filteredSales = filteredSalesBase;

  const sortedSales = (() => {
    if (!sortConfig.key) return filteredSales;

    const dir = sortConfig.direction === 'asc' ? 1 : -1;

    const saleStoreName = (s: any) =>
      (s.sale_number?.startsWith('TRANSFER-') || s.sale_number?.startsWith('PURCHASE-'))
        ? (s.client_name || '')
        : (s.stores?.name || '');

    // Numeric sorts
    if (sortConfig.key === 'total_amount') {
      return [...filteredSales].sort((a, b) => ((Number(a.total_amount || 0) - Number(b.total_amount || 0)) * dir));
    }
    if (sortConfig.key === 'created_at') {
      return [...filteredSales].sort((a, b) => {
        const at = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const bt = b?.created_at ? new Date(b.created_at).getTime() : 0;
        return (at - bt) * dir;
      });
    }

    // String sorts
    const strVal = (s: any) => {
      switch (sortConfig.key) {
        case 'sale_number':
          return String(s?.sale_number || '').toLowerCase();
        case 'client_name':
          return String(s?.client_name || '').toLowerCase();
        case 'store_name':
          return String(saleStoreName(s) || '').toLowerCase();
        case 'payment_status':
          return String(s?.payment_status || '').toLowerCase();
        case 'delivery_status':
          return String(s?.delivery_status || '').toLowerCase();
        default:
          return '';
      }
    };

    return [...filteredSales].sort((a, b) => {
      const av = strVal(a);
      const bv = strVal(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  })();

  const totalSales = sortedSales.reduce((sum, sale) => sum + (sale.total_amount || 0), 0);

  const getSalesExportColumns = (): TableColumn<any>[] => [
    // Let the table auto-distribute width across the full page.
    // Only lock a couple of narrow numeric/date columns.
    { header: 'N° Vente', accessor: (s) => s.sale_number || '-', cellWidth: 26 },
    { header: 'Client', accessor: (s) => s.client_name || '-' },
    {
      header: 'Boutique',
      accessor: (s) =>
        (s.sale_number?.startsWith('TRANSFER-') || s.sale_number?.startsWith('PURCHASE-'))
          ? (s.client_name || '-')
          : (s.stores?.name || '-'),
    },
    {
      header: 'Montant\n(MAD)',
      accessor: (s) => (typeof s.total_amount === 'number' ? s.total_amount.toFixed(2) : Number(s.total_amount || 0).toFixed(2)),
      align: 'right',
      cellWidth: 20,
    },
    {
      header: 'Paiement',
      accessor: (s) => (s.payment_status === 'paid' ? 'Payée' : s.payment_status === 'partial' ? 'Partielle' : 'Non payée'),
    },
    {
      header: 'Méthode',
      accessor: (s) => {
        const pm = String(s?.payment_method || '').toLowerCase();
        if (pm === 'check') return 'Chèque';
        if (pm === 'cash') return 'Espèce';
        if (pm === 'card') return 'Carte';
        if (pm === 'bank_transfer') return 'Virement';

        // Backward compatibility for old records
        const notes = String(s?.notes || '');
        if (notes.includes('Payment: check')) return 'Chèque';
        if (notes.includes('Payment: cash')) return 'Espèce';
        if (notes.includes('Payment: card')) return 'Carte';
        return '-';
      },
    },
    { header: 'Livraison', accessor: (s) => s.delivery_status || '-' },
    { header: 'Date', accessor: (s) => new Date(s.created_at).toLocaleDateString('fr-FR'), cellWidth: 18 },
    {
      header: 'Créé\npar',
      accessor: (s) => {
        const creator = s?.created_by ? usersById[String(s.created_by)] : null;
        return creator?.email || '-';
      },
    },
  ];

  const ensureCanExportSales = () => {
    if (!canExportSales) {
      toast.error("Vous n'avez pas la permission d'exporter les ventes");
      return false;
    }
    if (!filteredSales || filteredSales.length === 0) {
      toast.error('Aucune donnée à exporter');
      return false;
    }
    return true;
  };

  const handleExportSalesExcel = () => {
    if (!ensureCanExportSales()) return;
    const datePart = new Date().toISOString().split('T')[0];
    exportToExcelHtml(sortedSales, getSalesExportColumns(), `rapport_ventes_${datePart}.xls`);
    toast.success('Fichier Excel exporté avec succès');
  };

  const handleExportSalesPdf = () => {
    if (!ensureCanExportSales()) return;
    const datePart = new Date().toISOString().split('T')[0];

    exportToPdfTable({
      title: 'RAPPORT - Ventes',
      subtitle: isAdmin && selectedMagasinForAdmin
        ? `Magasin: ${stores.find((st: any) => String(st.id) === String(selectedMagasinForAdmin))?.name || selectedMagasinForAdmin}`
        : undefined,
      filename: `Rapport_Ventes_${datePart}.pdf`,
      headerStats: [
        { label: 'TOTAL VENTES', value: String(sortedSales.length) },
        { label: 'MONTANT TOTAL', value: `${totalSales.toFixed(2)} MAD` },
        { label: 'PAYÉES', value: String(paymentPaid) },
        { label: 'NON PAYÉES', value: String(paymentUnpaid) },
      ],
      rows: sortedSales,
      columns: getSalesExportColumns(),
      orientation: 'landscape',
    });

    toast.success('PDF exporté avec succès');
  };

  const preparingSales = sortedSales.filter(s => s.delivery_status === 'preparing').length;
  const inTransitSales = sortedSales.filter(s => s.delivery_status === 'in_transit').length;
  const deliveredSales = sortedSales.filter(s => s.delivery_status === 'delivered').length;

  // Payment status counts
  const paymentUnpaid = sortedSales.filter(s => s.payment_status === 'unpaid').length;
  const paymentPartial = sortedSales.filter(s => s.payment_status === 'partial').length;
  const paymentPaid = sortedSales.filter(s => s.payment_status === 'paid').length;

  // Count pending partial payments from the partial_payments table
  const pendingPartialPayments = partialPayments.filter(p => p.confirmation_status === 'pending').length;

  // Show full-page details view if selected
  if (showDetails && selectedSale) {
    return (
      <SalesDetailsPage
        sale={selectedSale}
        accessToken={session?.access_token}
        onBack={() => {
          setShowDetails(false);
          setSelectedSale(null);
        }}
        onUpdateStatus={updateSaleStatus}
      />
    );
  }

  // Show full-page new sale form
  if (showNewSaleForm) {
    // Permission: creating/editing requires proper permission
    if (!canCreateSale && !isAdmin) {
      toast.error('Vous n\'avez pas la permission de créer une vente');
      setShowNewSaleForm(false);
      return null;
    }
    // Admin must choose a magasin before creating/editing a sale
    if (isAdmin && !adminHasSelectedStore) {
      toast.error('Veuillez sélectionner un magasin (Admin) avant de créer une vente.');
      setShowNewSaleForm(false);
      return null;
    }

    return (
      <div className="min-h-screen bg-gray-50">
        <BonCommandeModule 
          session={session}
          sale={selectedSale}
          adminSelectedMagasinId={isAdmin ? selectedMagasinForAdmin : null}
          onBack={() => {
            setShowNewSaleForm(false);
            setSelectedSale(null);
            fetchSales();
          }}
        />
      </div>
    );
  }

  // Page-level access control
  if (!canViewSales) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-10 h-10 mx-auto text-red-500 mb-2" />
          <p className="text-lg font-semibold">Accès refusé</p>
          <p className="text-sm text-gray-600">Vous n'avez pas la permission de voir les ventes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pending Partial Payments Alert - COMMENTED OUT */}
      {/* {pendingPartialPayments > 0 && (
        <Card className="bg-orange-50 border-2 border-orange-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-800">
              <Clock className="w-5 h-5" />
              Paiements Partiels en Attente de Confirmation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-orange-700">
                {pendingPartialPayments} vente(s) avec paiement partiel en attente de confirmation de remise.
              </p>
              <div className="border-t border-orange-200 pt-3">
                <div className="space-y-2">
                  {partialPayments
                    .filter(p => p.confirmation_status === 'pending')
                    .slice(0, 5)
                    .map((payment) => (
                      <div key={payment.id} className="flex justify-between items-center p-3 bg-white rounded border border-orange-200">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">{payment.reference_number || 'N/A'}</p>
                          <p className="text-sm text-gray-600">Montant total: {payment.total_amount?.toFixed(2)} MAD</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-red-600">{payment.pending_discount?.toFixed(2)} MAD</p>
                          <p className="text-xs text-gray-600">Remise</p>
                        </div>
                      </div>
                    ))}
                  {pendingPartialPayments > 5 && (
                    <p className="text-sm text-orange-700 font-semibold text-center pt-2">
                      +{pendingPartialPayments - 5} autre(s) en attente
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )} */}

      {/* Sales Overview Cards - Navbar Style */}
      <div className="flex flex-wrap w-full bg-white p-1 h-auto gap-1 border-b border-gray-200 rounded-lg">
        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-blue-50 border-b-2 border-blue-500 text-blue-600 flex-1 min-w-max">
          <ShoppingCart className="w-5 h-5" />
          <span className="text-xs font-medium">Total Ventes</span>
          <span className="text-lg font-bold">{sortedSales.length}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-yellow-50 border-b-2 border-yellow-500 text-yellow-600 flex-1 min-w-max">
          <Package className="w-5 h-5" />
          <span className="text-xs font-medium">Préparation</span>
          <span className="text-lg font-bold">{preparingSales}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-purple-50 border-b-2 border-purple-500 text-purple-600 flex-1 min-w-max">
          <Truck className="w-5 h-5" />
          <span className="text-xs font-medium">En Transit</span>
          <span className="text-lg font-bold">{inTransitSales}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-green-50 border-b-2 border-green-500 text-green-600 flex-1 min-w-max">
          <CheckCircle className="w-5 h-5" />
          <span className="text-xs font-medium">Livrée</span>
          <span className="text-lg font-bold">{deliveredSales}</span>
        </div>

              </div>

      {/* Payment Status Overview */}
      <div className="flex flex-wrap w-full bg-white p-1 h-auto gap-1 border-b border-gray-200 rounded-lg">
        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-red-50 border-b-2 border-red-500 text-red-600 flex-1 min-w-max">
          <XCircle className="w-5 h-5" />
          <span className="text-xs font-medium">Non payée</span>
          <span className="text-lg font-bold">{paymentUnpaid}</span>
        </div>
        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-orange-50 border-b-2 border-orange-500 text-orange-600 flex-1 min-w-max">
          <Clock className="w-5 h-5" />
          <span className="text-xs font-medium">Partiellement payée</span>
          <span className="text-lg font-bold">{paymentPartial}</span>
        </div>
        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-green-50 border-b-2 border-green-500 text-green-600 flex-1 min-w-max">
          <CheckCircle className="w-5 h-5" />
          <span className="text-xs font-medium">Payée</span>
          <span className="text-lg font-bold">{paymentPaid}</span>
        </div>
      </div>

      {/* Main Sales Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Ventes aux Clients Externes
            </CardTitle>
            <div className="flex items-center gap-3 flex-wrap justify-end">
              <Button
                onClick={handleExportSalesExcel}
                disabled={!canExportSalesExcel}
                title={!canExportSalesExcel ? "Vous n'avez pas la permission d'exporter les ventes" : undefined}
                variant="outline"
                size="sm"
                className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
              >
                <Download className="w-4 h-4 mr-2" />
                Excel
              </Button>

              <Button
                onClick={handleExportSalesPdf}
                disabled={!canExportSalesPdf}
                title={!canExportSalesPdf ? "Vous n'avez pas la permission d'exporter les ventes" : undefined}
                variant="outline"
                size="sm"
                className="border-red-600 text-red-700 hover:bg-red-50"
              >
                <FileText className="w-4 h-4 mr-2" />
                PDF
              </Button>

              {/* Admin Magasin Selector */}
              {userRole === 'admin' && (
                <div className="flex items-center gap-2 bg-purple-50 px-4 py-2 rounded-lg border border-purple-200">
                  <Label htmlFor="magasin_selector" className="text-sm font-semibold text-purple-700 whitespace-nowrap">
                    Magasin (Admin):
                  </Label>
                  <select
                    id="magasin_selector"
                    value={selectedMagasinForAdmin}
                    onChange={(e) => {
                      setSelectedMagasinForAdmin(e.target.value);
                      if (e.target.value) {
                        toast.success(`Vous êtes maintenant: ${stores.find(s => s.id === e.target.value)?.name || 'Magasin'}`);
                      }
                    }}
                    className="px-3 py-1 border border-purple-300 rounded-md bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">-- Sélectionner un magasin --</option>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <Button
                onClick={() => {
                  if (!canCreateSale) {
                    toast.error('Permission insuffisante: Créer une Vente');
                    return;
                  }
                  if (isAdmin && !adminHasSelectedStore) {
                    toast.error('Veuillez sélectionner un magasin (Admin) avant de créer une vente.');
                    return;
                  }
                  setShowNewSaleForm(true);
                }}
                disabled={(isAdmin && !adminHasSelectedStore) || !canCreateSale}
                className={(isAdmin && !adminHasSelectedStore) || !canCreateSale ? 'opacity-50 cursor-not-allowed' : ''}
              >
                <Plus className="w-4 h-4 mr-2" />
                Nouvelle Vente
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Rechercher une vente..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button
                        type="button"
                        className="flex items-center gap-2 select-none"
                        title="Trier A→Z / Z→A"
                        onClick={() => {
                          setSortConfig((prev) => ({
                            key: 'sale_number',
                            direction: prev.key === 'sale_number' && prev.direction === 'asc' ? 'desc' : 'asc',
                          }));
                        }}
                      >
                        N° Vente
                        <span className="text-xs font-semibold text-blue-600">
                          {sortConfig.key === 'sale_number' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="flex items-center gap-2 select-none"
                        title="Trier A→Z / Z→A"
                        onClick={() => {
                          setSortConfig((prev) => ({
                            key: 'client_name',
                            direction: prev.key === 'client_name' && prev.direction === 'asc' ? 'desc' : 'asc',
                          }));
                        }}
                      >
                        Client
                        <span className="text-xs font-semibold text-blue-600">
                          {sortConfig.key === 'client_name' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="flex items-center gap-2 select-none"
                        title="Trier A→Z / Z→A"
                        onClick={() => {
                          setSortConfig((prev) => ({
                            key: 'store_name',
                            direction: prev.key === 'store_name' && prev.direction === 'asc' ? 'desc' : 'asc',
                          }));
                        }}
                      >
                        Boutique
                        <span className="text-xs font-semibold text-blue-600">
                          {sortConfig.key === 'store_name' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="flex items-center gap-2 select-none"
                        title="Trier 0→9 / 9→0"
                        onClick={() => {
                          setSortConfig((prev) => ({
                            key: 'total_amount',
                            direction: prev.key === 'total_amount' && prev.direction === 'asc' ? 'desc' : 'asc',
                          }));
                        }}
                      >
                        Montant
                        <span className="text-xs font-semibold text-blue-600">
                          {sortConfig.key === 'total_amount' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead>Remise</TableHead>
                    <TableHead>Montant Total après remise</TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="flex items-center gap-2 select-none"
                        title="Trier A→Z / Z→A"
                        onClick={() => {
                          setSortConfig((prev) => ({
                            key: 'payment_status',
                            direction: prev.key === 'payment_status' && prev.direction === 'asc' ? 'desc' : 'asc',
                          }));
                        }}
                      >
                        Paiement
                        <span className="text-xs font-semibold text-blue-600">
                          {sortConfig.key === 'payment_status' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead>Methode</TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="flex items-center gap-2 select-none"
                        title="Trier A→Z / Z→A"
                        onClick={() => {
                          setSortConfig((prev) => ({
                            key: 'delivery_status',
                            direction: prev.key === 'delivery_status' && prev.direction === 'asc' ? 'desc' : 'asc',
                          }));
                        }}
                      >
                        Statut de Livraison
                        <span className="text-xs font-semibold text-blue-600">
                          {sortConfig.key === 'delivery_status' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="flex items-center gap-2 select-none"
                        title="Trier date"
                        onClick={() => {
                          setSortConfig((prev) => ({
                            key: 'created_at',
                            direction: prev.key === 'created_at' && prev.direction === 'asc' ? 'desc' : 'asc',
                          }));
                        }}
                      >
                        Date
                        <span className="text-xs font-semibold text-blue-600">
                          {sortConfig.key === 'created_at' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-gray-500 py-8">
                        Aucune vente trouvée
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedSales.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span>{sale.sale_number}</span>
                            {String(sale?.created_by_role || '').toLowerCase() === 'admin' && (
                              <Badge
                                variant="secondary"
                                className="bg-purple-100 text-purple-800 border border-purple-200"
                                title={
                                  sale?.created_for_store_id
                                    ? `Créé par Admin pour magasin: ${sale.created_for_store_id}`
                                    : 'Créé par Admin'
                                }
                              >
                                Admin
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{sale.client_name || '-'}</TableCell>
                        <TableCell>
                          {sale.sale_number?.startsWith('TRANSFER-') || sale.sale_number?.startsWith('PURCHASE-') 
                            ? (sale.client_name || '-')
                            : (sale.stores?.name || '-')
                          }
                        </TableCell>
                        <TableCell>{sale.total_amount?.toFixed(2)} MAD</TableCell>
                        <TableCell className="text-amber-700">
                          {(Number((sale as any).total_remise ?? (sale as any).totalRemise ?? 0) || 0).toFixed(2)} MAD
                        </TableCell>
                        <TableCell>
                          {(
                            Math.max(
                              0,
                              (Number(sale.total_amount || 0) || 0) -
                                (Number((sale as any).total_remise ?? (sale as any).totalRemise ?? 0) || 0)
                            )
                          ).toFixed(2)}{' '}
                          MAD
                        </TableCell>
                        <TableCell>
                          <Badge className={getPaymentStatusColor(sale.payment_status)}>
                            {sale.payment_status === 'paid' ? 'Payé' : sale.payment_status === 'partial' ? 'Partiellement payée' : 'Non payé'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {sale.notes?.includes('Payment: check') ? 'Chèque' : 
                             sale.notes?.includes('Payment: cash') ? 'Espèce' : 
                             sale.notes?.includes('Payment: card') ? 'Carte' : '-'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-sm ${getDeliveryStatusColor(sale.delivery_status)}`}>
                            {sale.delivery_status}
                          </span>
                        </TableCell>
                        <TableCell>{new Date(sale.created_at).toLocaleDateString('fr-FR')}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end items-center">
                            {sale.delivery_status === 'preparing' && canEditSale && (
                              <Button
                                size="sm"
                                style={{ backgroundColor: '#3b82f6', color: 'white' }}
                                onClick={() => {
                                  updateSaleStatus(sale.id, 'in_transit');
                                }}
                                title="Confirmer que c'est en route"
                              >
                                <Truck className="w-4 h-4" />
                              </Button>
                            )}
                            {canEditSale && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedSale(sale);
                                  setShowNewSaleForm(true);
                                }}
                                title="Éditer la vente"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (!canPrintSale) {
                                  toast.error('Permission insuffisante: Imprimer/Télécharger une Vente');
                                  return;
                                }
                                downloadBL(sale)
                              }}
                              disabled={!canPrintSale}
                              title="Télécharger le Bon de Livraison"
                              className={!canPrintSale ? 'opacity-50 cursor-not-allowed' : ''}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedSale(sale);
                                setShowDetails(true);
                              }}
                              title="Voir les détails"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>

                            {canCancelOrDeleteSale && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  deleteSale(sale);
                                }}
                                title="Supprimer la vente"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                          {/* Old Dialog - Keeping for reference but not used */}
                          <Dialog open={false} onOpenChange={() => {}}>
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                style={{ display: 'none' }}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-3xl flex flex-col max-h-[90vh]">
                              <DialogHeader className="flex-shrink-0">
                                <DialogTitle className="text-lg">Détails de la vente {selectedSale?.sale_number}</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 pr-4 flex-1 overflow-y-auto">
                                {/* Summary Section */}
                                <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
                                  <div className="grid grid-cols-3 gap-4">
                                    <div>
                                      <p className="text-xs text-gray-600 font-semibold">MONTANT TOTAL</p>
                                      <p className="text-2xl font-bold text-blue-600">{selectedSale?.total_amount?.toFixed(2)} MAD</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-gray-600 font-semibold">STATUT PAIEMENT</p>
                                      <Badge className={`${getPaymentStatusColor(selectedSale?.payment_status)} text-sm mt-1`}>
                                        {selectedSale?.payment_status === 'paid' ? 'Payé' : selectedSale?.payment_status === 'partial' ? 'Partiellement payée' : 'Non payé'}
                                      </Badge>
                                    </div>
                                    <div>
                                      <p className="text-xs text-gray-600 font-semibold">STATUT LIVRAISON</p>
                                      <Badge className={`${getDeliveryStatusColor(selectedSale?.delivery_status)} text-sm mt-1`}>
                                        {selectedSale?.delivery_status}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>

                                {/* Information Section */}
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="bg-gray-50 p-3 rounded border">
                                    <Label className="text-xs font-semibold text-gray-600 uppercase">Boutique</Label>
                                    <p className="font-medium text-gray-900">
                                      {(() => {
                                        const storeId = selectedSale?.store_id || selectedSale?.created_for_store_id;
                                        return stores.find((s: any) => String(s.id) === String(storeId))?.name || selectedSale?.stores?.name || '-';
                                      })()}
                                    </p>
                                  </div>
                                  <div className="bg-gray-50 p-3 rounded border">
                                    <Label className="text-xs font-semibold text-gray-600 uppercase">Date</Label>
                                    <p className="font-medium text-gray-900">{new Date(selectedSale?.created_at).toLocaleDateString('fr-FR')}</p>
                                  </div>
                                  <div className="bg-gray-50 p-3 rounded border">
                                    <Label className="text-xs font-semibold text-gray-600 uppercase">Méthode de paiement</Label>
                                    <p className="font-medium text-gray-900">
                                      {(() => {
                                        // Prefer real DB column.
                                        const pm = String(selectedSale?.payment_method || '').toLowerCase();
                                        if (pm === 'check') return '💳 Chèque';
                                        if (pm === 'cash') return '💵 Espèce';
                                        if (pm === 'card') return '💰 Carte';
                                        if (pm === 'bank_transfer') return '🏦 Virement bancaire';
                                        if (pm) return selectedSale.payment_method;

                                        // Backward compatibility for old records only.
                                        const notes = String(selectedSale?.notes || '');
                                        if (notes.includes('Payment: check')) return '💳 Chèque';
                                        if (notes.includes('Payment: cash')) return '💵 Espèce';
                                        if (notes.includes('Payment: card')) return '💰 Carte';

                                        return '❓ Non spécifié';
                                      })()}
                                    </p>
                                  </div>
                                  <div className="bg-gray-50 p-3 rounded border">
                                    <Label className="text-xs font-semibold text-gray-600 uppercase">Créé par</Label>
                                    <p className="font-medium text-gray-900">
                                      {(() => {
                                        const creator = selectedSale?.created_by ? usersById[String(selectedSale.created_by)] : null;
                                        if (creator?.email) return creator.email;
                                        if (selectedSale?.created_by) return 'Utilisateur';
                                        return 'Non spécifié';
                                      })()}
                                    </p>
                                  </div>
                                  <div className="bg-gray-50 p-3 rounded border">
                                    <Label className="text-xs font-semibold text-gray-600 uppercase">Numéro de vente</Label>
                                    <p className="font-medium text-gray-900">{selectedSale?.sale_number}</p>
                                  </div>
                                </div>

                                {/* Articles Section */}
                                <div>
                                  <Label className="text-sm font-semibold mb-2 block">Articles achetés</Label>
                                  <div className="border rounded-lg overflow-hidden">
                                    {selectedSale?.sale_items?.length > 0 ? (
                                      <div className="divide-y">
                                        {selectedSale.sale_items.map((item: any) => (
                                          <div key={item.id} className="flex justify-between items-center p-3 hover:bg-gray-50">
                                            <div>
                                              <p className="font-medium text-gray-900">{item.products?.name || 'Produit'}</p>
                                              <p className="text-sm text-gray-600">Quantité: {item.quantity}</p>
                                            </div>
                                            <p className="font-semibold text-gray-900">{item.total_price?.toFixed(2)} MAD</p>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-gray-500 text-sm p-3">Aucun article</p>
                                    )}
                                  </div>
                                </div>

                                {/* Notes Section */}
                                {selectedSale?.notes && (
                                  <div>
                                    <Label className="text-sm font-semibold mb-2 block">Informations supplémentaires</Label>
                                    <div className="grid grid-cols-2 gap-3">
                                      {(() => {
                                        const notes = selectedSale.notes;
                                        const parts = notes.split(', ');
                                        const info: { [key: string]: string } = {};
                                        
                                        parts.forEach((part: string) => {
                                          const [key, value] = part.split(': ');
                                          if (key && value) {
                                            info[key.trim()] = value.trim();
                                          }
                                        });

                                        const filteredInfo = Object.entries(info).filter(([key, value]) => {
                                          // Hide Customer only if it's "Unknown"
                                          if (key === 'Customer' && value === 'Unknown') return false;
                                          // Hide Phone only if it's "N/A"
                                          if (key === 'Phone' && value === 'N/A') return false;
                                          // Hide Payment field (it's already shown in the method section above)
                                          if (key === 'Payment') return false;
                                          return true;
                                        });

                                        return filteredInfo.length > 0 ? (
                                          filteredInfo.map(([key, value]) => (
                                            <div key={key} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                              <Label className="text-xs font-semibold text-amber-700 uppercase">{key}</Label>
                                              <p className="font-medium text-gray-900 mt-1">{value}</p>
                                            </div>
                                          ))
                                        ) : null;
                                      })()}
                                    </div>
                                  </div>
                                )}

                                {/* Actions Section */}
                                <div className="border-t pt-4">
                                  <Label className="text-sm font-semibold mb-3 block">Actions</Label>
                                  <div className="flex gap-2 flex-wrap">
                                    {selectedSale?.delivery_status === 'preparing' && (
                                      <Button
                                        size="sm"
                                        onClick={() => updateSaleStatus(selectedSale.id, 'in_transit')}
                                        className="bg-blue-500 hover:bg-blue-600"
                                      >
                                        <Truck className="w-4 h-4 mr-2" />
                                        Marquer en Transit
                                      </Button>
                                    )}
                                    {selectedSale?.delivery_status === 'in_transit' && (
                                      <Button
                                        size="sm"
                                        onClick={() => updateSaleStatus(selectedSale.id, 'delivered')}
                                        className="bg-green-500 hover:bg-green-600"
                                      >
                                        <Package className="w-4 h-4 mr-2" />
                                        Marquer Livrée
                                      </Button>
                                    )}
                                    {selectedSale?.delivery_status === 'delivered' && (
                                      <div className="bg-orange-50 border border-orange-200 rounded p-3 w-full">
                                        <p className="text-sm text-orange-800 font-semibold">
                                          ✓ Vente marquée comme livrée
                                        </p>
                                        <p className="text-xs text-orange-700 mt-1">
                                          En attente de confirmation du destinataire dans la page Commandes
                                        </p>
                                      </div>
                                    )}
                                    {selectedSale?.delivery_status === 'canceled' && (
                                      <div className="text-red-600 font-medium flex items-center gap-2">
                                        <XCircle className="w-4 h-4" />
                                        Vente annulée
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-green-50 border-green-200">
        <CardHeader>
          <CardTitle className="text-green-800">À propos des Ventes Externes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-green-700 space-y-2">
            <p>• Ces ventes concernent les clients externes qui achètent dans vos magasins</p>
            <p>• Différent de l'échange inter-magasins (voir onglet "Trading")</p>
            <p>• Le stock n'est pas automatiquement mis à jour - il faut le faire manuellement</p>
            <p>• Utile pour suivre les ventes aux particuliers et entreprises externes</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}