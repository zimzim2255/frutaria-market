import { useState, useEffect } from 'react';
import { projectId } from '../../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Plus, Edit, Trash2, Search, Truck, Package, X, ShoppingCart, Minus, ArrowLeft, Eye, Download, DollarSign } from 'lucide-react';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { SupplierDetailsPage } from '../SupplierDetailsPage';

interface SuppliersModuleProps {
  session: any;
}

export function SuppliersModule({ session }: SuppliersModuleProps) {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Resolve role/store/permissions from DB (not user_metadata).
  const [currentUserRole, setCurrentUserRole] = useState<string>('user');
  const [currentUserStoreId, setCurrentUserStoreId] = useState<string | null>(null);
  const [currentUserPermissions, setCurrentUserPermissions] = useState<string[]>([]);

  const isAdmin = currentUserRole === 'admin';
  const hasPermission = (permission: string): boolean => {
    if (isAdmin) return true;
    return currentUserPermissions.includes(permission);
  };

  const canViewSuppliers = hasPermission('Voir les Fournisseurs');
  const canAddSupplier = isAdmin;
  const canEditSupplier = hasPermission('Modifier un Fournisseur');
  const canDeleteSupplier = hasPermission('Supprimer un Fournisseur');

  // Admin filter by store (magasin)
  const [adminSelectedStoreId, setAdminSelectedStoreId] = useState<string>('');
  const [stores, setStores] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [fullBuyDialogOpen, setFullBuyDialogOpen] = useState(false);
  const [showBuyPage, setShowBuyPage] = useState(false);
  const [cartViewOpen, setCartViewOpen] = useState(false);
  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [manageMode, setManageMode] = useState<'add' | 'buy'>('buy'); // 'add' for adding to supplier, 'buy' for purchasing
  const [supplierProducts, setSupplierProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [buyQuantity, setBuyQuantity] = useState(1);
  const [selectedProductForBuy, setSelectedProductForBuy] = useState<any>(null);
  const [showFacturePage, setShowFacturePage] = useState(false);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
  const [filteredProductsForDescription, setFilteredProductsForDescription] = useState<any[]>([]);
  const [showProductSuggestions, setShowProductSuggestions] = useState<{ [key: string]: boolean }>({});
  const [hasUserTyped, setHasUserTyped] = useState<{ [key: string]: boolean }>({});
  const [productDialogOpen, setProductDialogOpen] = useState<string | null>(null);
  const [invoiceData, setInvoiceData] = useState({
    client: {
      name: '',
      phone: '',
      address: '',
      ice: '',
      if: '',
      rc: '',
      patente: '',
    },
    items: [] as any[],
    status: 'Non Payée',
    paymentMethod: 'cash',
    tvaPercentage: 20,
  });
  const [customerData, setCustomerData] = useState({
    name: '',
    phone: '',
    payment_method: 'cash',
    notes: '',
  });
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    contact_person: '',
    payment_terms: '',
    is_passage: false,
  });

  const [payments, setPayments] = useState<any[]>([]);
  const [supplierAdvances, setSupplierAdvances] = useState<any[]>([]);
  const [supplierPassages, setSupplierPassages] = useState<any[]>([]);
  const [discounts, setDiscounts] = useState<any[]>([]);
  const [globalPaymentDialogOpen, setGlobalPaymentDialogOpen] = useState(false);
  const [paymentSupplierSearch, setPaymentSupplierSearch] = useState('');
  const [selectedPaymentSupplier, setSelectedPaymentSupplier] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentRemiseAmount, setPaymentRemiseAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'check' | 'bank_transfer'>('cash');

  const [passagePaymentDialogOpen, setPassagePaymentDialogOpen] = useState(false);
  const [passageSupplierSearch, setPassageSupplierSearch] = useState('');
  const [selectedPassageSupplier, setSelectedPassageSupplier] = useState<any>(null);
  const [passageAmount, setPassageAmount] = useState('');
  const [passageDate, setPassageDate] = useState('');
  const [passageMethod, setPassageMethod] = useState<'cash' | 'check' | 'bank_transfer'>('cash');
  const [passageReference, setPassageReference] = useState('');
  const [passageNotes, setPassageNotes] = useState('');
  const [creatingPassage, setCreatingPassage] = useState(false);
  const [passageAdminStoreId, setPassageAdminStoreId] = useState<string>('');
  const [checks, setChecks] = useState<any[]>([]);
  const [selectedCheck, setSelectedCheck] = useState<any>(null);
  const [bankProofFile, setBankProofFile] = useState<File | null>(null);
  const [bankProofUploading, setBankProofUploading] = useState(false);
  const [loadingChecks, setLoadingChecks] = useState(false);
  const [checkDialogOpen, setCheckDialogOpen] = useState(false);
  const [checkSearchTerm, setCheckSearchTerm] = useState('');
  const [createCheckDialogOpen, setCreateCheckDialogOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCheckId, setUploadCheckId] = useState('');
  const [uploadAmount, setUploadAmount] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadGiverName, setUploadGiverName] = useState('');
  const [uploadCheckDate, setUploadCheckDate] = useState('');
  const [uploadExecutionDate, setUploadExecutionDate] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);

  // Passage cheque workflow: choose existing from inventory OR create one here.
  const [passageCheckChoice, setPassageCheckChoice] = useState<'none' | 'select' | 'create'>('none');
  const [showDetailsPage, setShowDetailsPage] = useState(false);
  const [detailsSupplier, setDetailsSupplier] = useState<any>(null);
  const [sortOrder, setSortOrder] = useState<'high-to-low' | 'low-to-high'>('high-to-low');
  const [showZeroBalanceOnly, setShowZeroBalanceOnly] = useState(false);
  const [showNonZeroBalanceOnly, setShowNonZeroBalanceOnly] = useState(false);

  // Table sorting (A→Z / Z→A + numeric)
  const [sortConfig, setSortConfig] = useState<{
    key:
      | 'name'
      | 'phone'
      | 'city'
      | 'total_invoiced'
      | 'total_paid'
      | 'remaining_balance'
      | 'discount_given'
      | null;
    direction: 'asc' | 'desc';
  }>({
    key: null,
    direction: 'asc',
  });

  // Export to PDF function
  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Title
    doc.setFontSize(16);
    doc.text('Rapport des Fournisseurs', pageWidth / 2, 15, { align: 'center' });
    
    // Date
    doc.setFontSize(10);
    doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, pageWidth / 2, 22, { align: 'center' });
    
    // Filter info
    doc.setFontSize(9);
    const filterInfo = showZeroBalanceOnly ? 'Filtre: Solde = 0 MAD' : `Tri: ${sortOrder === 'high-to-low' ? 'Élevé à Bas' : 'Bas à Élevé'}`;
    doc.text(filterInfo, 14, 30);
    
    // Prepare table data
    const tableData = filteredSuppliersForExport.map(supplier => {
      const supplierPayments = payments.filter(p => p.supplier_id === supplier.id);
      const supplierAdvanceRows = supplierAdvances.filter((a: any) => String(a?.supplier_id || '') === String(supplier.id));
      const totalPaidPayments = supplierPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const totalPaidAdvances = supplierAdvanceRows.reduce((sum: number, a: any) => sum + (Number(a?.amount || 0) || 0), 0);
      const totalPaid = totalPaidPayments + totalPaidAdvances;
      const supplierDiscounts = discounts.filter(d => d.supplier_id === supplier.id);
      const discountGiven = supplierDiscounts.reduce((sum, d) => sum + (d.amount || 0), 0);
      const totalInvoiced = supplier.balance || 0;
      const remainingBalance = totalInvoiced - totalPaid;
      // IMPORTANT: allow negative (supplier credit) to be displayed in PDF.
      const balanceAfterDiscount = (remainingBalance - discountGiven);
      
      return [
        supplier.name,
        supplier.phone || '-',
        supplier.city || '-',
        totalInvoiced.toFixed(2),
        totalPaid.toFixed(2),
        balanceAfterDiscount.toFixed(2),
        discountGiven > 0 ? discountGiven.toFixed(2) : '-',
        'ACTIF'
      ];
    });
    
    // Add table
    (doc as any).autoTable({
      head: [['Nom du Fournisseur', 'Téléphone', 'Ville', 'Total Facturé', 'Total Payé', 'Solde Restant', 'Remise Donnée', 'Statut']],
      body: tableData,
      startY: 35,
      margin: { left: 10, right: 10 },
      styles: {
        fontSize: 8,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
    });
    
    // Add summary
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.text(`Total Fournisseurs: ${filteredSuppliersForExport.length}`, 14, finalY);
    
    const totalInvoiced = filteredSuppliersForExport.reduce((sum, s) => sum + (s.balance || 0), 0);
    const totalPaid = filteredSuppliersForExport.reduce((sum, s) => {
      const supplierPayments = payments.filter(p => p.supplier_id === s.id);
      const supplierAdvanceRows = supplierAdvances.filter((a: any) => String(a?.supplier_id || '') === String(s.id));
      const paidPayments = supplierPayments.reduce((pSum, p) => pSum + (p.amount || 0), 0);
      const paidAdvances = supplierAdvanceRows.reduce((aSum: number, a: any) => aSum + (Number(a?.amount || 0) || 0), 0);
      return sum + paidPayments + paidAdvances;
    }, 0);
    // Include negative balances in summary (credit reduces total remaining)
    const totalRemaining = filteredSuppliersForExport.reduce((sum, s) => {
      const supplierPayments = payments.filter(p => p.supplier_id === s.id);
      const supplierAdvanceRows = supplierAdvances.filter((a: any) => String(a?.supplier_id || '') === String(s.id));

      const paidPayments = supplierPayments.reduce((pSum, p) => pSum + (p.amount || 0), 0);
      const paidAdvances = supplierAdvanceRows.reduce((aSum: number, a: any) => aSum + (Number(a?.amount || 0) || 0), 0);

      const supplierDiscounts = discounts.filter(d => d.supplier_id === s.id);
      const discountGiven = supplierDiscounts.reduce((dSum, d) => dSum + (d.amount || 0), 0);

      const totalInv = Number(s.balance || 0) || 0;
      const totalPd = paidPayments + paidAdvances;
      return sum + (totalInv - totalPd - discountGiven);
    }, 0);
    
    // Keep only the remaining balance summary (hide total invoiced/paid as requested)
    doc.text(`Total Solde Restant: ${totalRemaining.toFixed(2)} MAD`, 14, finalY + 6);
    
    // Save PDF
    doc.save(`fournisseurs_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('PDF exporté avec succès');
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
        const sorted = (data.stores || []).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
        setStores(sorted);
      }
    } catch (e) {
      console.error('[SuppliersModule] Error fetching stores:', e);
    }
  };

  const fetchSuppliers = async () => {
    try {
      console.log('🔄 [SuppliersModule] Fetching suppliers...');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/suppliers`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      console.log('📡 [SuppliersModule] Response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ [SuppliersModule] Suppliers fetched:', data.suppliers?.length || 0, 'suppliers');
        
        // Log each supplier's balance
        if (data.suppliers && data.suppliers.length > 0) {
          data.suppliers.forEach((supplier: any, index: number) => {
            console.log(`  [${index}] ${supplier.name}: balance=${supplier.balance}, id=${supplier.id}`);
          });
        }
        
        // Hide Fournisseur Admin (Total Facture) suppliers from the normal suppliers page.
        // Those are admin-linked suppliers created for the Fournisseur Admin flow.
        const list = data.suppliers || [];
        const filtered = (list || []).filter((s: any) => !s?.admin_user_id);
        setSuppliers(filtered);
      } else {
        console.error('❌ [SuppliersModule] Response not OK:', response.status);
        const errorText = await response.text();
        console.error('Error response:', errorText);
      }
    } catch (error) {
      console.error('❌ [SuppliersModule] Error fetching suppliers:', error);
      toast.error('Erreur lors du chargement des fournisseurs');
    } finally {
      setLoading(false);
    }
  };

  const fetchPayments = async () => {
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
        setPayments(data.payments || []);
      }
    } catch (error) {
      console.error('Error fetching payments:', error);
    }
  };

  const fetchSupplierAdvances = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/supplier-advances`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        setSupplierAdvances(Array.isArray(data?.advances) ? data.advances : []);
      } else {
        setSupplierAdvances([]);
      }
    } catch (error) {
      console.error('Error fetching supplier advances:', error);
      setSupplierAdvances([]);
    }
  };

  const fetchSupplierPassages = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/supplier-passages`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        setSupplierPassages(Array.isArray(data?.passages) ? data.passages : []);
      } else {
        setSupplierPassages([]);
      }
    } catch (error) {
      console.error('Error fetching supplier passages:', error);
      setSupplierPassages([]);
    }
  };

  const fetchDiscounts = async () => {
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

  const fetchCurrentUserFromDb = async () => {
    try {
      if (!session?.access_token || !session?.user?.id) return;
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
        const current = data.users?.find((u: any) => u.id === session.user.id);
        if (current?.role) setCurrentUserRole(String(current.role));
        if (current?.store_id) setCurrentUserStoreId(String(current.store_id));
        setCurrentUserPermissions(Array.isArray(current?.permissions) ? current.permissions : []);

        console.log('[SuppliersModule] /users resolved current:', {
          id: current?.id,
          email: current?.email,
          role: current?.role,
          store_id: current?.store_id,
          permissionsCount: Array.isArray(current?.permissions) ? current.permissions.length : 0,
        });
      }
    } catch (e) {
      console.error('[SuppliersModule] Error fetching current user from DB:', e);
    }
  };

  useEffect(() => {
    fetchCurrentUserFromDb();
    fetchStores();
    fetchSuppliers();
    fetchPayments();
    fetchSupplierAdvances();
    fetchSupplierPassages();
    fetchDiscounts();
    fetchProducts();
  }, []);

  // For admin store filter: if empty, default to current user's store when available
  useEffect(() => {
    if (!isAdmin) return;
    if (adminSelectedStoreId) return;
    if (currentUserStoreId) setAdminSelectedStoreId(String(currentUserStoreId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, currentUserStoreId]);

  // Fetch products when details page is opened
  useEffect(() => {
    if (showDetailsPage && products.length === 0) {
      fetchProducts();
    }
  }, [showDetailsPage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingSupplier && !canAddSupplier) {
      toast.error("Vous n'avez pas la permission « Ajouter un Fournisseur »");
      return;
    }

    if (editingSupplier && !canEditSupplier) {
      toast.error("Vous n'avez pas la permission « Modifier un Fournisseur »");
      return;
    }

    setLoading(true);

    try {
      const url = editingSupplier
        ? `https://${projectId}.supabase.co/functions/v1/super-handler/suppliers/${editingSupplier.id}`
        : `https://${projectId}.supabase.co/functions/v1/super-handler/suppliers`;

      // Backend requires admins to pass store_id when creating a supplier.
      const payload: any = { ...formData };
      if (!editingSupplier && currentUserRole === 'admin') {
        if (!adminSelectedStoreId) {
          toast.error('Veuillez sélectionner un magasin');
          setLoading(false);
          return;
        }
        payload.store_id = adminSelectedStoreId;
      }

      const response = await fetch(url, {
        method: editingSupplier ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        toast.success(editingSupplier ? 'Fournisseur modifié' : 'Fournisseur ajouté');
        setDialogOpen(false);
        resetForm();
        fetchSuppliers();
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

  const handleDelete = async (id: string) => {
    if (!canDeleteSupplier) {
      toast.error("Vous n'avez pas la permission « Supprimer un Fournisseur »");
      return;
    }

    if (!confirm('Êtes-vous sûr de vouloir supprimer ce fournisseur?')) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/suppliers/${id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        toast.success('Fournisseur supprimé');
        fetchSuppliers();
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      contact_person: '',
      payment_terms: '',
      is_passage: false,
    });
    setAdminSelectedStoreId('');
    setEditingSupplier(null);
  };

  const handleEdit = (supplier: any) => {
    if (!canEditSupplier) {
      toast.error("Vous n'avez pas la permission « Modifier un Fournisseur »");
      return;
    }

    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      city: supplier.city || '',
      contact_person: supplier.contact_person || '',
      payment_terms: supplier.payment_terms || '',
      is_passage: !!supplier.is_passage,
    });
    setDialogOpen(true);
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

  const handleOpenManageDialog = (supplier: any, mode: 'add' | 'buy') => {
    setSelectedSupplier(supplier);
    setManageMode(mode);
    setProductSearchTerm('');
    setSupplierProducts([]);
    setCart([]);
    setBuyQuantity(1);
    fetchProducts();
    // Open full-size buy page with invoice-like table
    setShowBuyPage(true);
  };

  const handleAddProductToSupplier = (product: any) => {
    if (manageMode === 'add') {
      const isAlreadyAdded = supplierProducts.some(p => p.id === product.id);
      
      if (isAlreadyAdded) {
        setSupplierProducts(supplierProducts.filter(p => p.id !== product.id));
        toast.info(`${product.name} retiré`);
      } else {
        setSupplierProducts([...supplierProducts, product]);
        toast.success(`${product.name} ajouté`);
      }
    } else {
      setSelectedProductForBuy(product);
      setBuyQuantity(1);
    }
  };

  const handleSaveSupplierProducts = async () => {
    if (manageMode === 'add') {
      if (supplierProducts.length === 0) {
        toast.error('Veuillez sélectionner au moins un produit');
        return;
      }

      setLoading(true);

      try {
        // Update each product with the supplier_id
        for (const product of supplierProducts) {
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/products/${product.id}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                ...product,
                supplier_id: selectedSupplier.id,
              }),
            }
          );

          if (!response.ok) {
            throw new Error(`Erreur lors de la mise à jour du produit ${product.name}`);
          }
        }

        toast.success(`${supplierProducts.length} produit(s) ajouté(s) au fournisseur`);
        setManageDialogOpen(false);
        setSupplierProducts([]);
        setProductSearchTerm('');
      } catch (error: any) {
        toast.error(`Erreur: ${error.message}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleBuyClick = (product: any) => {
    setSelectedProductForBuy(product);
    setBuyQuantity(1);
  };

  const handleAddToBuy = () => {
    if (!selectedProductForBuy) return;

    if (buyQuantity > selectedProductForBuy.quantity_available) {
      toast.error('Quantité insuffisante en stock');
      return;
    }

    const existingItem = cart.find(item => item.id === selectedProductForBuy.id);
    
    if (existingItem) {
      if (existingItem.quantity + buyQuantity > selectedProductForBuy.quantity_available) {
        toast.error('Quantité insuffisante en stock');
        return;
      }
      setCart(cart.map(item =>
        item.id === selectedProductForBuy.id
          ? { ...item, quantity: item.quantity + buyQuantity }
          : item
      ));
    } else {
      setCart([...cart, { ...selectedProductForBuy, quantity: buyQuantity }]);
    }

    toast.success(`${buyQuantity}x ${selectedProductForBuy.name} ajouté au panier`);
    setSelectedProductForBuy(null);
    setBuyQuantity(1);
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(productId);
      return;
    }

    const product = products.find(p => p.id === productId);
    if (newQuantity > (product?.quantity_available || 0)) {
      toast.error('Quantité insuffisante en stock');
      return;
    }

    setCart(cart.map(item =>
      item.id === productId
        ? { ...item, quantity: newQuantity }
        : item
    ));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.quantity * item.sale_price), 0);
  const cartItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleGlobalPayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPaymentSupplier) {
      toast.error('Veuillez sélectionner un fournisseur');
      return;
    }

    const amount = parseFloat(paymentAmount) || 0;
    const remiseAmount = parseFloat(paymentRemiseAmount) || 0;

    // Check that at least one amount is provided
    if (amount <= 0 && remiseAmount <= 0) {
      toast.error('Veuillez entrer un montant de paiement ou une remise');
      return;
    }

    const supplierPayments = payments.filter(p => p.supplier_id === selectedPaymentSupplier.id);
    const supplierAdvanceRows = supplierAdvances.filter((a: any) => String(a?.supplier_id || '') === String(selectedPaymentSupplier.id));
    const currentTotalPaid =
      supplierPayments.reduce((sum, p) => sum + (p.amount || 0), 0) +
      supplierAdvanceRows.reduce((sum: number, a: any) => sum + (Number(a?.amount || 0) || 0), 0);
    const totalInvoiced = selectedPaymentSupplier.balance || 0;
    const remainingBalance = totalInvoiced - currentTotalPaid;
    const totalToApply = amount + remiseAmount;

    if (totalToApply > remainingBalance) {
      toast.error(`Le montant total (paiement + remise) ne peut pas dépasser le solde restant (${remainingBalance.toFixed(2)} MAD)`);
      return;
    }

    setLoading(true);

    try {
      // First, apply remise if it exists
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

      // Then, apply the payment if amount > 0
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
              payment_method: 'cash',
              reference_number: `PAY-${Date.now()}`,
              notes: `Paiement global pour ${selectedPaymentSupplier.name}`,
            }),
          }
        );

        if (!paymentResponse.ok) {
          throw new Error('Erreur lors de l\'enregistrement du paiement');
        }
      }

      // Build success message
      let successMessage = '';
      if (amount > 0 && remiseAmount > 0) {
        successMessage = `Paiement de ${amount.toFixed(2)} MAD + Remise de ${remiseAmount.toFixed(2)} MAD enregistrés pour ${selectedPaymentSupplier.name}`;
      } else if (amount > 0) {
        successMessage = `Paiement de ${amount.toFixed(2)} MAD enregistré pour ${selectedPaymentSupplier.name}`;
      } else if (remiseAmount > 0) {
        successMessage = `Remise de ${remiseAmount.toFixed(2)} MAD enregistrée pour ${selectedPaymentSupplier.name}`;
      }
      
      toast.success(successMessage);
      setGlobalPaymentDialogOpen(false);
      setPaymentSupplierSearch('');
      setSelectedPaymentSupplier(null);
      setPaymentAmount('');
      setPaymentRemiseAmount('');
      fetchPayments();
      fetchSupplierAdvances();
      fetchDiscounts();
      fetchSuppliers();
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();

    if (cart.length === 0) {
      toast.error('Le panier est vide');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/purchases`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            items: cart.map(item => ({
              product_id: item.id,
              quantity: item.quantity,
              unit_price: item.sale_price,
              total_price: item.quantity * item.sale_price,
            })),
            total_amount: cartTotal,
            payment_method: customerData.payment_method,
            customer_name: customerData.name,
            customer_phone: customerData.phone,
            notes: customerData.notes,
            supplier_id: selectedSupplier?.id,
          }),
        }
      );

      if (response.ok) {
        toast.success('Achat enregistré avec succès!');
        setCheckoutDialogOpen(false);
        setManageDialogOpen(false);
        setCart([]);
        setCustomerData({
          name: '',
          phone: '',
          payment_method: 'cash',
          notes: '',
        });
        fetchProducts();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur lors de l\'enregistrement');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const filteredSuppliers = suppliers.filter(supplier => {
    // Admin magasin filter
    if (isAdmin) {
      const sid = String(adminSelectedStoreId || '').trim();
      if (sid) {
        const supplierStoreId = String((supplier as any)?.store_id || '').trim();
        if (supplierStoreId !== sid) return false;
      }
    }

    const matchesSearch = 
      supplier.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.city?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const supplierPayments = payments.filter(p => p.supplier_id === supplier.id);
    const supplierAdvanceRows = supplierAdvances.filter((a: any) => String(a?.supplier_id || '') === String(supplier.id));
    const supplierPassageRows = supplierPassages.filter((p: any) => String(p?.supplier_id || '') === String(supplier.id));

    // IMPORTANT:
    // supplier_passages are mirrored into `payments` by the backend.
    // If we sum both payments + passages here, we double-count.
    // Therefore Total Payé must be: payments + advances (no passages).
    const totalPaid =
      supplierPayments.reduce((sum, p) => sum + (p.amount || 0), 0) +
      supplierAdvanceRows.reduce((sum: number, a: any) => sum + (Number(a?.amount || 0) || 0), 0);
    const supplierDiscounts = discounts.filter(d => d.supplier_id === supplier.id);
    const discountGiven = supplierDiscounts.reduce((sum, d) => sum + (d.amount || 0), 0);
    const totalInvoiced = supplier.balance || 0;

    // IMPORTANT (Supplier credit handling):
    // If supplier is overpaid (payments+advances+passages > total invoiced),
    // we must NOT inflate "Total Payé" in UI expectations.
    // Instead, show the overpaid amount as a NEGATIVE "Solde Restant" (credit).
    const rawRemaining = totalInvoiced - totalPaid;
    const adjustedBalance = rawRemaining - discountGiven;
    
    // Apply zero balance filter if enabled
    // Filters
    // If both are checked, do not filter (show all)
    if (showZeroBalanceOnly && !showNonZeroBalanceOnly && adjustedBalance !== 0) {
      return false;
    }
    if (showNonZeroBalanceOnly && !showZeroBalanceOnly && adjustedBalance === 0) {
      return false;
    }
    
    return matchesSearch;
  }).sort((a, b) => {
    const getBalance = (supplier: any) => {
      const supplierPayments = payments.filter(p => p.supplier_id === supplier.id);
      const supplierAdvanceRows = supplierAdvances.filter((a: any) => String(a?.supplier_id || '') === String(supplier.id));
      const supplierPassageRows = supplierPassages.filter((p: any) => String(p?.supplier_id || '') === String(supplier.id));

      // IMPORTANT:
      // supplier_passages are mirrored into `payments` by the backend.
      // If we sum both payments + passages here, we double-count.
      // Therefore Total Payé must be: payments + advances (no passages).
      const totalPaid =
        supplierPayments.reduce((sum, p) => sum + (p.amount || 0), 0) +
        supplierAdvanceRows.reduce((sum: number, a: any) => sum + (Number(a?.amount || 0) || 0), 0);

      const supplierDiscounts = discounts.filter(d => d.supplier_id === supplier.id);
      const discountGiven = supplierDiscounts.reduce((sum, d) => sum + (d.amount || 0), 0);
      const totalInvoiced = supplier.balance || 0;
      const rawRemaining = totalInvoiced - totalPaid;
      return rawRemaining - discountGiven;
    };
    
    const balanceA = getBalance(a);
    const balanceB = getBalance(b);
    
    if (sortOrder === 'high-to-low') {
      return balanceB - balanceA;
    } else {
      return balanceA - balanceB;
    }
  });

  const filteredSuppliersForExport = filteredSuppliers;

  const filteredProducts = products.filter(product =>
    product.name?.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
    product.reference?.toLowerCase().includes(productSearchTerm.toLowerCase())
  );

  const activeSuppliers = filteredSuppliers.filter(s => s.status === 'active');
  const totalBalance = filteredSuppliers.reduce((sum, s) => sum + (s.balance || 0), 0);

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const openPassagePaymentDialog = (supplier: any) => {
    setSelectedPassageSupplier(supplier);
    setPassageSupplierSearch('');
    setPassageAmount('');
    setPassageReference('');
    setPassageNotes('');
    setPassageMethod('cash');
    setPassageDate(getTodayDate());

    // reset cheque selection
    setSelectedCheck(null);
    setPassageCheckChoice('none');

    // reset bank proof
    setBankProofFile(null);

    // Admin must explicitly choose a magasin for this operation
    setPassageAdminStoreId('');

    setPassagePaymentDialogOpen(true);
  };

  const handleCreatePassagePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPassageSupplier?.id) {
      toast.error('Veuillez sélectionner un fournisseur');
      return;
    }

    if (!selectedPassageSupplier?.id) {
      toast.error('Veuillez sélectionner un fournisseur PASSAGE');
      return;
    }

    const amount = Number(String(passageAmount || '').replace(',', '.')) || 0;
    if (amount <= 0) {
      toast.error('Veuillez entrer un montant valide');
      return;
    }

    // If payment method is check, user must either select an existing check or create one here.
    if (passageMethod === 'check') {
      if (passageCheckChoice === 'none') {
        toast.error('Veuillez choisir: sélectionner un chèque existant ou créer un chèque');
        return;
      }
      if (passageCheckChoice === 'select' && !selectedCheck?.id) {
        toast.error('Veuillez sélectionner un chèque');
        return;
      }
      if (passageCheckChoice === 'create' && !selectedCheck?.id) {
        toast.error('Veuillez créer un chèque (ou sélectionner un chèque)');
        return;
      }
    }

    // If payment method is bank transfer, proof attachment is optional.

    setCreatingPassage(true);
    try {
      const payload: any = {
        supplier_id: selectedPassageSupplier.id,
        amount,
        payment_method: passageMethod,
        // IMPORTANT: backend deduplicates mirrored `payments` by reference_number.
        // Ensure we always send a stable reference so retries won't double count.
        reference: (passageReference || `PASSAGE-${selectedPassageSupplier.id}-${Date.now()}`),
        notes: passageNotes || null,
        passage_date: passageDate || null,
      };

      // Upload bank transfer proof if needed
      if (passageMethod === 'bank_transfer' && bankProofFile) {
        try {
          setBankProofUploading(true);
          const fd = new FormData();
          fd.append('file', bankProofFile);
          fd.append('entity_type', 'supplier_passage');
          fd.append('supplier_id', selectedPassageSupplier.id);
          fd.append('amount', String(amount));
          fd.append('reference', String(passageReference || ''));
          fd.append('notes', String(passageNotes || ''));

          const up = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/uploads`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: fd,
            }
          );

          if (up.ok) {
            const upData = await up.json().catch(() => ({}));
            // store returned url/path if backend provides it
            if (upData?.url) payload.proof_url = upData.url;
            if (upData?.path) payload.proof_path = upData.path;
          } else {
            const txt = await up.text();
            throw new Error(txt || 'Upload failed');
          }
        } finally {
          setBankProofUploading(false);
        }
      }

      if (passageMethod === 'check' && selectedCheck?.id) {
        payload.check_id = selectedCheck.id;
        if (!payload.reference) payload.reference = selectedCheck.check_id_number || null;
      }

      // Admin: MUST choose store_id (backend requires it for admin)
      if (currentUserRole === 'admin') {
        const sid = String(passageAdminStoreId || '').trim();
        if (!sid) {
          toast.error('Veuillez choisir le magasin (admin)');
          return;
        }
        payload.store_id = sid;
      }

      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/supplier-passages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error || 'Erreur lors de la création du paiement passage');
        return;
      }

      toast.success('Paiement Passage enregistré');
      setPassagePaymentDialogOpen(false);
      setSelectedPassageSupplier(null);
      setPassageSupplierSearch('');
      setSelectedCheck(null);
      setPassageCheckChoice('none');
      fetchSuppliers();
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setCreatingPassage(false);
    }
  };

  // Load check inventory (for selecting an existing check)
  const fetchChecks = async () => {
    setLoadingChecks(true);
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
      }
    } catch (error) {
      console.error('Error loading checks:', error);
    } finally {
      setLoadingChecks(false);
    }
  };

  // Handle upload check
  const handleUploadCheck = async (e: React.FormEvent) => {
    e.preventDefault();

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
      // If file is provided, use the upload endpoint
      if (uploadFile) {
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
          const responseData = await response.json();
          const newCheck = responseData.check;
          
          toast.success('Chèque uploadé avec succès');
          setCreateCheckDialogOpen(false);
          setUploadFile(null);
          setUploadCheckId('');
          setUploadAmount('');
          setUploadNotes('');
          setUploadGiverName('');
          setUploadCheckDate('');
          setUploadExecutionDate('');
          
          // Auto-populate the passage amount with the check amount (Passage workflow)
          if (newCheck && newCheck.amount_value) {
            setPassageAmount(String(newCheck.amount_value));
            setSelectedCheck(newCheck);
            setPassageCheckChoice('create');
            toast.success(`Chèque ${newCheck.check_id_number} créé et montant auto-rempli`);
          }
          
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
              amount_value: amountValue,
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
          const responseData = await response.json();
          const newCheck = responseData.check;
          
          toast.success('Chèque créé avec succès');
          setCreateCheckDialogOpen(false);
          setUploadFile(null);
          setUploadCheckId('');
          setUploadAmount('');
          setUploadNotes('');
          setUploadGiverName('');
          setUploadCheckDate(getTodayDate());
          setUploadExecutionDate(getTodayDate());
          
          // Auto-populate the passage amount with the check amount (Passage workflow)
          if (newCheck && newCheck.amount_value) {
            setPassageAmount(String(newCheck.amount_value));
            setSelectedCheck(newCheck);
            setPassageCheckChoice('create');
            toast.success(`Chèque ${newCheck.check_id_number} créé et montant auto-rempli`);
          }
          
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
            }
          } catch (error) {
            console.error('Error reloading checks:', error);
          }
        } else {
          const error = await response.json();
          toast.error(error.error || 'Erreur lors de la création du chèque');
        }
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setUploadLoading(false);
    }
  };

  if (!canViewSuppliers) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Accès refusé</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">Vous n'avez pas la permission « Voir les Fournisseurs ».</p>
        </CardContent>
      </Card>
    );
  }

  // Full-page Buy view
  if (showBuyPage) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold text-gray-900">Acheter chez {selectedSupplier?.name}</h1>
          <Button
            onClick={() => {
              setShowBuyPage(false);
              setInvoiceData({
                client: { name: '', phone: '', address: '', ice: '', if: '', rc: '', patente: '' },
                items: [],
                status: 'Non Payée',
                paymentMethod: 'cash',
                tvaPercentage: 20,
              });
            }}
            variant="outline"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
        </div>

        {/* Informations (Nom, Adresse, Téléphone) */}
        <Card>
          <CardHeader>
            <CardTitle>Informations</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Nom</Label>
              <Input value={invoiceData.client.name} onChange={(e) => setInvoiceData({ ...invoiceData, client: { ...invoiceData.client, name: e.target.value } })} placeholder="Nom" />
            </div>
            <div>
              <Label>Adresse</Label>
              <Input value={invoiceData.client.address} onChange={(e) => setInvoiceData({ ...invoiceData, client: { ...invoiceData.client, address: e.target.value } })} placeholder="Adresse" />
            </div>
            <div>
              <Label>Téléphone</Label>
              <Input value={invoiceData.client.phone} onChange={(e) => setInvoiceData({ ...invoiceData, client: { ...invoiceData.client, phone: e.target.value } })} placeholder="Téléphone" />
            </div>
          </CardContent>
        </Card>

        {/* Articles de la Facture */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Articles de la Facture</CardTitle>
              <Button 
                onClick={() => {
                  const newItem = { id: `item-${Date.now()}`, description: '', caisse: '', quantity: 1, moyenne: '', unitPrice: 0, subtotal: 0 };
                  setInvoiceData({ ...invoiceData, items: [...invoiceData.items, newItem] });
                }}
                size="sm"
                className="gap-2"
                style={{ backgroundColor: '#1f2937', color: 'white' }}
              >
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
                          onChange={(e) => {
                            const newItems = [...invoiceData.items];
                            newItems[index].description = e.target.value;
                            setInvoiceData({ ...invoiceData, items: newItems });
                            if (e.target.value.trim() === '') {
                              setProductDialogOpen(null);
                              setHasUserTyped({ ...hasUserTyped, [item.id]: false });
                            } else {
                              setHasUserTyped({ ...hasUserTyped, [item.id]: true });
                              const filtered = products.filter(product =>
                                product.name?.toLowerCase().includes(e.target.value.toLowerCase()) ||
                                product.reference?.toLowerCase().includes(e.target.value.toLowerCase())
                              );
                              setFilteredProductsForDescription(filtered.slice(0, 10));
                              if (filtered.length > 0) setProductDialogOpen(item.id); else setProductDialogOpen(null);
                            }
                          }}
                          className="h-8"
                          placeholder="Tapez le nom du produit..."
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          value={item.caisse}
                          onChange={(e) => {
                            const newItems = [...invoiceData.items];
                            newItems[index].caisse = e.target.value;
                            const caisse = parseFloat(e.target.value) || 0;
                            const quantity = newItems[index].quantity;
                            newItems[index].moyenne = caisse > 0 && quantity > 0 ? (quantity / caisse).toFixed(2) : '';
                            setInvoiceData({ ...invoiceData, items: newItems });
                          }}
                          className="h-8 w-24"
                          placeholder="Caisse"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => {
                            const newItems = [...invoiceData.items];
                            newItems[index].quantity = parseFloat(e.target.value) || 0;
                            newItems[index].subtotal = newItems[index].quantity * newItems[index].unitPrice;
                            const caisse = parseFloat(newItems[index].caisse) || 0;
                            const quantity = newItems[index].quantity;
                            newItems[index].moyenne = caisse > 0 && quantity > 0 ? (quantity / caisse).toFixed(2) : '';
                            setInvoiceData({ ...invoiceData, items: newItems });
                          }}
                          className="h-8 w-24"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input value={item.moyenne} readOnly className="h-8 w-24 bg-gray-100" />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) => {
                            const newItems = [...invoiceData.items];
                            newItems[index].unitPrice = parseFloat(e.target.value) || 0;
                            newItems[index].subtotal = newItems[index].quantity * newItems[index].unitPrice;
                            setInvoiceData({ ...invoiceData, items: newItems });
                          }}
                          className="h-8 w-28"
                        />
                      </td>
                      <td className="py-2 px-2 font-semibold">{(item.subtotal || 0).toFixed(2)} MAD</td>
                      <td className="py-2 px-2 text-center">
                        <Button size="sm" variant="destructive" className="h-8 w-8 p-0" onClick={() => {
                          setInvoiceData({ ...invoiceData, items: invoiceData.items.filter((_, i) => i !== index) });
                        }}>
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

        {/* Résumé + Actions */}
        <div className="flex flex-col md:flex-row gap-4 md:items-start md:justify-between">
        <Card className="md:w-1/2">
        <CardHeader>
        <CardTitle>Résumé</CardTitle>
        </CardHeader>
        <CardContent>
        {(() => {
        const subTotal = invoiceData.items.reduce((sum, it) => sum + (it.subtotal || 0), 0);
        return (
        <div className="space-y-2">
        <div className="flex justify-between"><span>Sous-total HT:</span><span className="font-semibold">{subTotal.toFixed(2)} MAD</span></div>
        </div>
        );
        })()}
        </CardContent>
        </Card>

          <div className="flex-1 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowBuyPage(false)}>Annuler</Button>
            <Button
              style={{ backgroundColor: '#16a34a' }}
              className="text-white"
              onClick={async () => {
                if (invoiceData.items.length === 0) { toast.error('Veuillez ajouter au moins un article'); return; }
                const itemsPayload: any[] = [];
                for (const it of invoiceData.items) {
                  const match = products.find(p => p.name === it.description || p.reference === it.description);
                  if (!match) { toast.error(`Produit introuvable: ${it.description}`); return; }
                  itemsPayload.push({
                    product_id: match.id,
                    quantity: Math.round(it.quantity || 0),
                    unit_price: it.unitPrice || 0,
                    total_price: (it.quantity || 0) * (it.unitPrice || 0),
                  });
                }
                const subTotal = invoiceData.items.reduce((sum, it) => sum + (it.subtotal || 0), 0);
                setLoading(true);
                try {
                  const response = await fetch(
                    `https://${projectId}.supabase.co/functions/v1/super-handler/purchases`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                      body: JSON.stringify({
                        items: itemsPayload,
                        total_amount: subTotal,
                        payment_method: 'cash',
                        customer_name: invoiceData.client.name,
                        customer_phone: invoiceData.client.phone,
                        notes: invoiceData.client.address,
                        supplier_id: selectedSupplier?.id,
                      }),
                    }
                  );
                  if (response.ok) {
                    toast.success('Achat enregistré avec succès!');
                    setShowBuyPage(false);
                    fetchProducts();
                  } else {
                    const error = await response.json();
                    toast.error(error.error || 'Erreur lors de l\'enregistrement');
                  }
                } catch (err: any) {
                  toast.error(err.message || 'Erreur');
                } finally {
                  setLoading(false);
                }
              }}
            >
              Confirmer l'achat
            </Button>
          </div>
        </div>

        {/* Product Suggestions Dialog */}
        <Dialog open={productDialogOpen !== null && filteredProductsForDescription.length > 0 && hasUserTyped[productDialogOpen || '']} onOpenChange={(open) => { if (!open) { setProductDialogOpen(null); setFilteredProductsForDescription([]); } }}>
          <DialogContent className="max-w-md max-h-96">
            <DialogHeader>
              <DialogTitle className="text-sm">Produits disponibles ({filteredProductsForDescription.length})</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 overflow-y-auto max-h-64">
              {filteredProductsForDescription.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => {
                    if (productDialogOpen) {
                      const index = invoiceData.items.findIndex(item => item.id === productDialogOpen);
                      if (index !== -1) {
                        const newItems = [...invoiceData.items];
                        newItems[index].description = product.name;
                        newItems[index].unitPrice = product.purchase_price || product.sale_price || 0;
                        newItems[index].subtotal = newItems[index].quantity * newItems[index].unitPrice;
                        setInvoiceData({ ...invoiceData, items: newItems });
                      }
                      setProductDialogOpen(null);
                      setHasUserTyped({ ...hasUserTyped, [productDialogOpen]: false });
                    }
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 border border-gray-200 rounded transition-colors group text-xs"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate group-hover:text-blue-600">{product.name}</div>
                      <div className="text-xs text-gray-600 truncate">Ref: {product.reference}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`inline-block px-1 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${product.max_purchase_limit ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>
                        {product.max_purchase_limit ? `Max: ${product.max_purchase_limit}` : 'Illimité'}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Full-page Details view
  if (showDetailsPage && detailsSupplier) {
    return (
      <SupplierDetailsPage
        supplier={detailsSupplier}
        session={session}
        onSupplierUpdate={(updatedSupplier) => {
          // Update details page state with fresh data from corrections
          setDetailsSupplier(updatedSupplier);
          // Also update main suppliers list to ensure FR table shows consistent values
          setSuppliers((prev: any[]) => 
            prev.map(s => s.id === updatedSupplier.id ? updatedSupplier : s)
          );
        }}
        onBack={() => {
          setShowDetailsPage(false);
          setDetailsSupplier(null);
          // Refresh suppliers data when returning from details page to ensure sync
          fetchSuppliers();
          fetchPayments();
          fetchDiscounts();
        }}
      />
    );
  }

  // Old details page code (kept for reference, can be removed)
  if (false && showDetailsPage && detailsSupplier) {
    const supplierPayments = payments.filter(p => p.supplier_id === detailsSupplier.id);
    const totalPaid = supplierPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const supplierDiscounts = discounts.filter(d => d.supplier_id === detailsSupplier.id);
    const discountGiven = supplierDiscounts.reduce((sum, d) => sum + (d.amount || 0), 0);
    const totalInvoiced = detailsSupplier.balance || 0;
    // IMPORTANT: allow negative remaining (supplier credit / overpayment)
    const remainingBalance = totalInvoiced - totalPaid;
    const balanceAfterDiscount = remainingBalance - discountGiven;
    
    // Get products for this supplier
    const supplierProducts = products.filter(p => p.supplier_id === detailsSupplier.id);

    return (
      <div className="space-y-6 p-6 bg-gray-50 min-h-screen">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-4xl font-bold text-gray-900">Détails du Fournisseur</h1>
          <Button
            onClick={() => {
              setShowDetailsPage(false);
              setDetailsSupplier(null);
            }}
            variant="outline"
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour
          </Button>
        </div>

        {/* Header Info Card */}
        <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-3xl text-purple-900">{detailsSupplier.name}</CardTitle>
                <p className="text-sm text-purple-700 mt-2">Fournisseur ID: {detailsSupplier.id}</p>
              </div>
              <Badge className={detailsSupplier.status === 'active' ? 'bg-green-100 text-green-800 text-lg px-4 py-2' : 'bg-gray-100 text-gray-800 text-lg px-4 py-2'}>
                {detailsSupplier.status === 'active' ? '✓ ACTIF' : '✗ INACTIF'}
              </Badge>
            </div>
          </CardHeader>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Informations de Contact
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-gray-600">Téléphone</Label>
              <p className="text-lg font-semibold text-gray-900">{detailsSupplier.phone || 'Non renseigné'}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-600">Email</Label>
              <p className="text-lg font-semibold text-gray-900">{detailsSupplier.email || 'Non renseigné'}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-600">Adresse</Label>
              <p className="text-lg font-semibold text-gray-900">{detailsSupplier.address || 'Non renseignée'}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-600">Ville</Label>
              <p className="text-lg font-semibold text-gray-900">{detailsSupplier.city || 'Non renseignée'}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-600">Personne de Contact</Label>
              <p className="text-lg font-semibold text-gray-900">{detailsSupplier.contact_person || 'Non renseignée'}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-600">Conditions de Paiement</Label>
              <p className="text-lg font-semibold text-gray-900">{detailsSupplier.payment_terms || 'Non renseignées'}</p>
            </div>
          </CardContent>
        </Card>

        {/* Financial Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-blue-900">Total Facturé</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-blue-600">{totalInvoiced.toFixed(2)}</p>
              <p className="text-xs text-blue-700 mt-1">MAD</p>
            </CardContent>
          </Card>

          <Card className="bg-green-50 border-green-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-green-900">Total Payé</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600">{totalPaid.toFixed(2)}</p>
              <p className="text-xs text-green-700 mt-1">MAD</p>
            </CardContent>
          </Card>

          <Card className="bg-orange-50 border-orange-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-orange-900">Solde Restant</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-orange-600">{remainingBalance.toFixed(2)}</p>
              <p className="text-xs text-orange-700 mt-1">MAD</p>
            </CardContent>
          </Card>

          <Card className={balanceAfterDiscount > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">{balanceAfterDiscount > 0 ? 'À Payer' : 'Crédit'}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold ${balanceAfterDiscount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {balanceAfterDiscount.toFixed(2)}
              </p>
              <p className="text-xs mt-1">{balanceAfterDiscount > 0 ? 'MAD' : 'MAD'}</p>
            </CardContent>
          </Card>
        </div>

        {/* Creator Information */}
        <Card className="bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Informations du Créateur
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-gray-600">Email du Créateur</Label>
              <p className="text-lg font-semibold text-blue-900 break-all">
                {detailsSupplier.created_by_email ? detailsSupplier.created_by_email : 'Non disponible'}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-600">Date de Création</Label>
              <p className="text-lg font-semibold text-blue-900">
                {detailsSupplier.created_at ? new Date(detailsSupplier.created_at).toLocaleDateString('fr-FR', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                }) : 'Non disponible'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Remise Donnée */}
        <Card>
          <CardHeader>
            <CardTitle>Remise Donnée</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-lg text-gray-700">Montant Total de Remise:</span>
              <span className={`text-3xl font-bold ${discountGiven > 0 ? 'text-green-600' : 'text-gray-600'}`}>
                {discountGiven > 0 ? `${discountGiven.toFixed(2)} MAD` : '0.00 MAD'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Products Associated with Supplier */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Produits du Fournisseur ({products.filter(p => p.supplier_id === detailsSupplier.id).length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {products.filter(p => p.supplier_id === detailsSupplier.id).length === 0 ? (
              <p className="text-gray-500 text-center py-8">Aucun produit associé à ce fournisseur</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left py-3 px-4 font-semibold">Nom du Produit</th>
                      <th className="text-left py-3 px-4 font-semibold">Référence</th>
                      <th className="text-left py-3 px-4 font-semibold">Prix d'Achat</th>
                      <th className="text-left py-3 px-4 font-semibold">Prix de Vente</th>
                      <th className="text-left py-3 px-4 font-semibold">Quantité en Stock</th>
                      <th className="text-left py-3 px-4 font-semibold">Catégorie</th>
                      <th className="text-left py-3 px-4 font-semibold">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.filter(p => p.supplier_id === detailsSupplier.id).map((product, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium text-gray-900">{product.name}</td>
                        <td className="py-3 px-4 text-gray-600">{product.reference || '-'}</td>
                        <td className="py-3 px-4 font-semibold text-blue-600">{product.purchase_price?.toFixed(2) || '0.00'} MAD</td>
                        <td className="py-3 px-4 font-semibold text-green-600">{product.sale_price?.toFixed(2) || '0.00'} MAD</td>
                        <td className="py-3 px-4">
                          <Badge className={product.quantity_available > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                            {product.quantity_available || 0} unités
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-gray-600">{product.category || '-'}</td>
                        <td className="py-3 px-4">
                          <Badge className={product.status === 'active' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}>
                            {product.status === 'active' ? 'Actif' : 'Inactif'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payments History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Historique des Paiements ({supplierPayments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {supplierPayments.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Aucun paiement enregistré</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left py-3 px-4 font-semibold">Date</th>
                      <th className="text-left py-3 px-4 font-semibold">Montant</th>
                      <th className="text-left py-3 px-4 font-semibold">Méthode</th>
                      <th className="text-left py-3 px-4 font-semibold">Référence</th>
                      <th className="text-left py-3 px-4 font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierPayments.map((payment, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4">{payment.payment_date || payment.created_at ? new Date(payment.payment_date || payment.created_at).toLocaleDateString('fr-FR') : '-'}</td>
                        <td className="py-3 px-4 font-semibold text-green-600">{payment.amount?.toFixed(2)} MAD</td>
                        <td className="py-3 px-4">
                          <Badge className="bg-blue-100 text-blue-800">{payment.payment_method || 'N/A'}</Badge>
                        </td>
                        <td className="py-3 px-4 text-gray-600">{payment.reference_number || '-'}</td>
                        <td className="py-3 px-4 text-gray-600">{payment.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Discounts History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Historique des Remises ({supplierDiscounts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {supplierDiscounts.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Aucune remise enregistrée</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left py-3 px-4 font-semibold">Date</th>
                      <th className="text-left py-3 px-4 font-semibold">Montant</th>
                      <th className="text-left py-3 px-4 font-semibold">Type</th>
                      <th className="text-left py-3 px-4 font-semibold">Raison</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierDiscounts.map((discount, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4">{new Date(discount.created_at).toLocaleDateString('fr-FR')}</td>
                        <td className="py-3 px-4 font-semibold text-green-600">-{discount.amount?.toFixed(2)} MAD</td>
                        <td className="py-3 px-4">
                          <Badge className="bg-purple-100 text-purple-800">{discount.discount_type || 'N/A'}</Badge>
                        </td>
                        <td className="py-3 px-4 text-gray-600">{discount.reason || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-6">
          <Button
            variant="outline"
            onClick={() => {
              setShowDetailsPage(false);
              setDetailsSupplier(null);
            }}
          >
            Fermer
          </Button>
          <Button
            style={{ backgroundColor: '#16a34a' }}
            className="text-white"
            onClick={() => {
              setShowDetailsPage(false);
              setDetailsSupplier(null);
              handleOpenManageDialog(detailsSupplier, 'buy');
            }}
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            Acheter chez ce Fournisseur
          </Button>
        </div>
      </div>
    );
  }

  // If showing facture page, render it instead
  if (showFacturePage) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Créer une Facture - {selectedSupplier?.name}</h1>
          <Button
            onClick={() => {
              setShowFacturePage(false);
              setInvoiceData({
                client: { name: '', phone: '', address: '', ice: '', if: '', rc: '', patente: '' },
                items: [],
                status: 'Non Payée',
                paymentMethod: 'cash',
                tvaPercentage: 20,
              });
            }}
            variant="outline"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Informations Client</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nom du Client</Label>
              <Input
                value={invoiceData.client.name}
                onChange={(e) => setInvoiceData({
                  ...invoiceData,
                  client: { ...invoiceData.client, name: e.target.value }
                })}
                placeholder="Nom du client"
              />
            </div>
            <div className="space-y-2">
              <Label>Téléphone</Label>
              <Input
                value={invoiceData.client.phone}
                onChange={(e) => setInvoiceData({
                  ...invoiceData,
                  client: { ...invoiceData.client, phone: e.target.value }
                })}
                placeholder="Téléphone"
              />
            </div>
            <div className="space-y-2">
              <Label>Adresse</Label>
              <Input
                value={invoiceData.client.address}
                onChange={(e) => setInvoiceData({
                  ...invoiceData,
                  client: { ...invoiceData.client, address: e.target.value }
                })}
                placeholder="Adresse"
              />
            </div>
            <div className="space-y-2">
              <Label>ICE</Label>
              <Input
                value={invoiceData.client.ice}
                onChange={(e) => setInvoiceData({
                  ...invoiceData,
                  client: { ...invoiceData.client, ice: e.target.value }
                })}
                placeholder="ICE"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label>IF</Label>
                <Input
                  value={invoiceData.client.if}
                  onChange={(e) => setInvoiceData({
                    ...invoiceData,
                    client: { ...invoiceData.client, if: e.target.value }
                  })}
                  placeholder="IF"
                />
              </div>
              <div className="space-y-2">
                <Label>RC</Label>
                <Input
                  value={invoiceData.client.rc}
                  onChange={(e) => setInvoiceData({
                    ...invoiceData,
                    client: { ...invoiceData.client, rc: e.target.value }
                  })}
                  placeholder="RC"
                />
              </div>
              <div className="space-y-2">
                <Label>Patente</Label>
                <Input
                  value={invoiceData.client.patente}
                  onChange={(e) => setInvoiceData({
                    ...invoiceData,
                    client: { ...invoiceData.client, patente: e.target.value }
                  })}
                  placeholder="Patente"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Articles de la Facture</CardTitle>
              <Button 
                onClick={() => {
                  const newItem = {
                    id: `item-${Date.now()}`,
                    description: '',
                    caisse: '',
                    quantity: 1,
                    moyenne: '',
                    unitPrice: 0,
                    subtotal: 0,
                  };
                  setInvoiceData({
                    ...invoiceData,
                    items: [...invoiceData.items, newItem]
                  });
                }}
                size="sm" 
                className="gap-2"
              >
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
                      <td className="py-2 px-2">
                        <Input
                          value={item.description}
                          onChange={(e) => {
                            const newItems = [...invoiceData.items];
                            newItems[index].description = e.target.value;
                            setInvoiceData({ ...invoiceData, items: newItems });
                            
                            // Show suggestions only when user starts typing
                            if (e.target.value.trim() === '') {
                              setProductDialogOpen(null);
                              setHasUserTyped({ ...hasUserTyped, [item.id]: false });
                            } else {
                              setHasUserTyped({ ...hasUserTyped, [item.id]: true });
                              const filtered = products.filter(product =>
                                product.name?.toLowerCase().includes(e.target.value.toLowerCase()) ||
                                product.reference?.toLowerCase().includes(e.target.value.toLowerCase())
                              );
                              setFilteredProductsForDescription(filtered.slice(0, 10));
                              if (filtered.length > 0) {
                                setProductDialogOpen(item.id);
                              } else {
                                setProductDialogOpen(null);
                              }
                            }
                          }}
                          className="h-8"
                          placeholder="Tapez le nom du produit..."
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          value={item.caisse}
                          onChange={(e) => {
                            const newItems = [...invoiceData.items];
                            newItems[index].caisse = e.target.value;
                            // Auto-calculate moyenne when caisse or quantity changes
                            const caisse = parseFloat(e.target.value) || 0;
                            const quantity = newItems[index].quantity;
                            if (caisse > 0 && quantity > 0) {
                              newItems[index].moyenne = (quantity / caisse).toFixed(2);
                            } else {
                              newItems[index].moyenne = '';
                            }
                            setInvoiceData({ ...invoiceData, items: newItems });
                          }}
                          className="h-8 w-16"
                          placeholder="Caisse"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => {
                            const newItems = [...invoiceData.items];
                            newItems[index].quantity = parseFloat(e.target.value) || 0;
                            newItems[index].subtotal = newItems[index].quantity * newItems[index].unitPrice;
                            // Auto-calculate moyenne when quantity or caisse changes
                            const caisse = parseFloat(newItems[index].caisse) || 0;
                            const quantity = newItems[index].quantity;
                            if (caisse > 0 && quantity > 0) {
                              newItems[index].moyenne = (quantity / caisse).toFixed(2);
                            } else {
                              newItems[index].moyenne = '';
                            }
                            setInvoiceData({ ...invoiceData, items: newItems });
                          }}
                          className="h-8 w-20"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          value={item.moyenne}
                          onChange={(e) => {
                            const newItems = [...invoiceData.items];
                            newItems[index].moyenne = e.target.value;
                            setInvoiceData({ ...invoiceData, items: newItems });
                          }}
                          className="h-8 w-16"
                          placeholder="Moyenne"
                          readOnly
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) => {
                            const newItems = [...invoiceData.items];
                            newItems[index].unitPrice = parseFloat(e.target.value) || 0;
                            newItems[index].subtotal = newItems[index].quantity * newItems[index].unitPrice;
                            setInvoiceData({ ...invoiceData, items: newItems });
                          }}
                          className="h-8 w-24"
                        />
                      </td>
                      <td className="py-2 px-2 font-semibold">{item.subtotal.toFixed(2)} MAD</td>
                      <td className="py-2 px-2 text-center">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setInvoiceData({
                              ...invoiceData,
                              items: invoiceData.items.filter((_, i) => i !== index)
                            });
                          }}
                          className="h-6 w-6 p-0"
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

        <Card>
          <CardHeader>
            <CardTitle>Résumé</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-w-xs ml-auto">
              <div className="flex justify-between">
                <span>Sous-total HT:</span>
                <span className="font-semibold">
                  {invoiceData.items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2)} MAD
                </span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span>TVA ({invoiceData.tvaPercentage}%):</span>
                <span className="font-semibold">
                  {(invoiceData.items.reduce((sum, item) => sum + item.subtotal, 0) * invoiceData.tvaPercentage / 100).toFixed(2)} MAD
                </span>
              </div>
              <div className="border-t pt-3 flex justify-between text-lg font-bold text-orange-600">
                <span>Total TTC:</span>
                <span>
                  {(invoiceData.items.reduce((sum, item) => sum + item.subtotal, 0) * (1 + invoiceData.tvaPercentage / 100)).toFixed(2)} MAD
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setShowFacturePage(false);
              setInvoiceData({
                client: { name: '', phone: '', address: '', ice: '', if: '', rc: '', patente: '' },
                items: [],
                status: 'Non Payée',
                paymentMethod: 'cash',
                tvaPercentage: 20,
              });
            }}
          >
            Annuler
          </Button>
          <Button
            style={{ backgroundColor: '#ea580c' }}
            className="text-white hover:opacity-90"
            onClick={() => {
              if (invoiceData.items.length === 0) {
                toast.error('Veuillez ajouter au moins un article');
                return;
              }
              toast.success('Facture créée avec succès');
              setShowFacturePage(false);
            }}
          >
            Générer Facture
          </Button>
        </div>

        {/* Product Suggestions Dialog - Rendered at top level */}
        <Dialog open={productDialogOpen !== null && filteredProductsForDescription.length > 0 && hasUserTyped[productDialogOpen || '']} onOpenChange={(open) => {
          if (!open) {
            setProductDialogOpen(null);
            setFilteredProductsForDescription([]);
          }
        }}>
          <DialogContent className="max-w-md max-h-96">
            <DialogHeader>
              <DialogTitle className="text-sm">Produits disponibles ({filteredProductsForDescription.length})</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 overflow-y-auto max-h-64">
              {filteredProductsForDescription.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => {
                    if (productDialogOpen) {
                      const index = invoiceData.items.findIndex(item => item.id === productDialogOpen);
                      if (index !== -1) {
                        const newItems = [...invoiceData.items];
                        newItems[index].description = product.name;
                        newItems[index].unitPrice = product.sale_price || 0;
                        newItems[index].subtotal = newItems[index].quantity * newItems[index].unitPrice;
                        setInvoiceData({ ...invoiceData, items: newItems });
                      }
                      setProductDialogOpen(null);
                      setHasUserTyped({ ...hasUserTyped, [productDialogOpen]: false });
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
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Dialog open={passagePaymentDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setSelectedPassageSupplier(null);
          setPassageSupplierSearch('');
        }
        setPassagePaymentDialogOpen(open);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Paiement Fournisseur Passage</DialogTitle>
          </DialogHeader>

          {/* Select existing check (inventory) */}
          <Dialog open={checkDialogOpen} onOpenChange={(o) => setCheckDialogOpen(o)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Sélectionner un chèque (Inventaire)</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={checkSearchTerm}
                    onChange={(e) => setCheckSearchTerm(e.target.value)}
                    placeholder="Rechercher par ID, notes, montant..."
                  />
                  <Button type="button" variant="outline" onClick={fetchChecks} disabled={loadingChecks}>
                    {loadingChecks ? 'Chargement...' : 'Rafraîchir'}
                  </Button>
                </div>

                <div className="border rounded-md max-h-80 overflow-y-auto bg-white">
                  {(checks || [])
                    .filter((c: any) => {
                      const q = String(checkSearchTerm || '').trim().toLowerCase();
                      if (!q) return true;
                      const idn = String(c?.check_id_number || '').toLowerCase();
                      const notes = String(c?.notes || '').toLowerCase();
                      const amt = String(c?.amount_value ?? '').toLowerCase();
                      return idn.includes(q) || notes.includes(q) || amt.includes(q);
                    })
                    .slice(0, 200)
                    .map((c: any) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-orange-50 ${selectedCheck?.id === c.id ? 'bg-orange-100' : ''}`}
                        onClick={() => {
                          setSelectedCheck(c);
                          setPassageCheckChoice('select');
                          if (c?.amount_value) setPassageAmount(String(c.amount_value));
                          setCheckDialogOpen(false);
                        }}
                      >
                        <div className="flex justify-between gap-2">
                          <div>
                            <div className="font-medium text-gray-900">{c.check_id_number || c.id}</div>
                            <div className="text-xs text-gray-600">{c.notes || '-'}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold">{Number(c.amount_value || 0).toFixed(2)} MAD</div>
                            <div className="text-xs text-gray-600">{c.status || '-'}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setCheckDialogOpen(false)}>
                    Fermer
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Create check here (reuse same fields as inventory create) */}
          <Dialog open={createCheckDialogOpen} onOpenChange={(o) => setCreateCheckDialogOpen(o)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Créer un chèque</DialogTitle>
              </DialogHeader>

              <form onSubmit={handleUploadCheck} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>ID du chèque</Label>
                    <Input value={uploadCheckId} onChange={(e) => setUploadCheckId(e.target.value)} placeholder="Ex: CHK-0001" />
                  </div>
                  <div className="space-y-2">
                    <Label>Montant</Label>
                    <Input value={uploadAmount} onChange={(e) => setUploadAmount(e.target.value)} placeholder="0.00" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nom du donneur (optionnel)</Label>
                    <Input value={uploadGiverName} onChange={(e) => setUploadGiverName(e.target.value)} placeholder="Nom..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Date du chèque (optionnel)</Label>
                    <Input type="date" value={uploadCheckDate} onChange={(e) => setUploadCheckDate(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date d'exécution (optionnel)</Label>
                    <Input type="date" value={uploadExecutionDate} onChange={(e) => setUploadExecutionDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Fichier (optionnel)</Label>
                    <Input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Notes (optionnel)</Label>
                  <Input value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} placeholder="Notes..." />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setCreateCheckDialogOpen(false)}>
                    Annuler
                  </Button>
                  <Button type="submit" disabled={uploadLoading} className="bg-orange-600 hover:bg-orange-700 text-white">
                    {uploadLoading ? 'Enregistrement...' : 'Créer'}
                  </Button>
                </div>

                <p className="text-xs text-gray-500">
                  Après création, le chèque sera sélectionné automatiquement pour ce paiement Passage.
                </p>
              </form>
            </DialogContent>
          </Dialog>
          {currentUserRole === 'admin' && (
                <div className="space-y-1">
                  <Label>Magasin (Admin)</Label>
                  <select
                    className="w-full h-10 border border-gray-300 rounded-md px-3 text-sm"
                    value={passageAdminStoreId}
                    onChange={(e) => setPassageAdminStoreId(e.target.value)}
                  >
                    <option value="">-- Choisir un magasin --</option>
                    {(stores || []).map((st: any) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500">Obligatoire pour l'admin (agir comme un magasin).</p>
                </div>
              )}

          <form onSubmit={handleCreatePassagePayment} className="space-y-4">
            <div className="space-y-2">
              <Label>Rechercher un Fournisseur Passage</Label>
              <Input
                value={passageSupplierSearch}
                onChange={(e) => {
                  setPassageSupplierSearch(e.target.value);
                  // If user types again, we don't lock the selection.
                  if (e.target.value.trim() === '') {
                    setSelectedPassageSupplier(null);
                  }
                }}
                placeholder="Tapez le nom du fournisseur..."
              />

              

              {passageSupplierSearch.trim() !== '' && (
                <div className="border rounded-md max-h-48 overflow-y-auto bg-white">
                  {(suppliers || [])
                    .filter((s: any) => !!s?.is_passage)
                    // Admin: only show PASSAGE suppliers for the selected magasin
                    .filter((s: any) => {
                      if (currentUserRole !== 'admin') return true;
                      const sid = String(passageAdminStoreId || '').trim();
                      if (!sid) return false;
                      return String(s?.store_id || '') === sid;
                    })
                    .filter((s: any) => String(s?.name || '').toLowerCase().includes(passageSupplierSearch.trim().toLowerCase()))
                    .slice(0, 20)
                    .map((s: any) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-orange-50 ${selectedPassageSupplier?.id === s.id ? 'bg-orange-100' : ''}`}
                        onClick={() => {
                          setSelectedPassageSupplier(s);
                          setPassageSupplierSearch(s.name || '');
                        }}
                      >
                        <span className="font-medium">{s.name}</span>
                        <span className="ml-2 text-xs text-orange-700">PASSAGE</span>
                      </button>
                    ))}
                </div>
              )}

              <p className="text-xs text-gray-500">
                Sélectionnez un fournisseur marqué <strong>PASSAGE</strong>.
              </p>

              <div className="text-sm font-semibold text-gray-900">
                Fournisseur sélectionné: {selectedPassageSupplier?.name || '-'}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Montant (MAD)</Label>
                <Input
                  value={passageAmount}
                  onChange={(e) => setPassageAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={passageDate}
                  onChange={(e) => setPassageDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Méthode</Label>
                <select
                  className="w-full h-10 border border-gray-300 rounded-md px-3 text-sm"
                  value={passageMethod}
                  onChange={(e) => {
                    const next = e.target.value as any;
                    setPassageMethod(next);

                    if (next !== 'check') {
                      setPassageCheckChoice('none');
                      setSelectedCheck(null);
                    }

                    if (next !== 'bank_transfer') {
                      setBankProofFile(null);
                    }
                  }}
                >
                  <option value="cash">Cash</option>
                  <option value="check">Chèque</option>
                  <option value="bank_transfer">Virement</option>
                </select>

                {passageMethod === 'check' && (
                  <div className="mt-3 space-y-3 rounded-md border border-gray-200 p-3 bg-gray-50">
                    <div className="text-xs font-semibold text-gray-700">Chèque (obligatoire)</div>

                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="passageCheckChoice"
                          checked={passageCheckChoice === 'select'}
                          onChange={() => {
                            setPassageCheckChoice('select');
                            setCreateCheckDialogOpen(false);
                            setCheckDialogOpen(true);
                            fetchChecks();
                          }}
                        />
                        Sélectionner un chèque depuis l'inventaire
                      </label>

                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="passageCheckChoice"
                          checked={passageCheckChoice === 'create'}
                          onChange={() => {
                            setPassageCheckChoice('create');
                            setCheckDialogOpen(false);
                            setCreateCheckDialogOpen(true);
                          }}
                        />
                        Créer un chèque ici
                      </label>
                    </div>

                    <div className="text-xs text-gray-700">
                      Chèque sélectionné: <span className="font-semibold">{selectedCheck?.check_id_number || selectedCheck?.id || '-'}</span>
                    </div>
                  </div>
                )}

                {passageMethod === 'bank_transfer' && (
                  <div className="mt-3 space-y-2 rounded-md border border-gray-200 p-3 bg-gray-50">
                    <div className="text-xs font-semibold text-gray-700">Preuve de virement (optionnel)</div>
                    <Input
                      type="file"
                      onChange={(e) => setBankProofFile(e.target.files?.[0] || null)}
                    />
                    <div className="text-xs text-gray-600">
                      Fichier sélectionné: <span className="font-semibold">{bankProofFile?.name || '-'}</span>
                    </div>
                    <p className="text-xs text-gray-500">Si vous ajoutez une pièce jointe, elle sera sauvegardée pour consultation ultérieure.</p>
                  </div>
                )}
              </div>
              {/* Référence removed from UI (kept internally for cheque auto-fill / backend audit) */}
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={passageNotes}
                onChange={(e) => setPassageNotes(e.target.value)}
                placeholder="Notes..."
              />
            </div>

            <div className="flex justify-end gap-2 sticky bottom-0 bg-white pt-4 pb-2 border-t mt-4" style={{ zIndex: 50 }}>
              <Button type="button" variant="outline" onClick={() => setPassagePaymentDialogOpen(false)}>
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={creatingPassage || bankProofUploading}
                style={{ backgroundColor: '#ea580c' }}
                className="hover:opacity-90 text-white font-semibold"
              >
                {creatingPassage || bankProofUploading ? 'Enregistrement...' : 'Confirmer'}
              </Button>
            </div>

            <p className="text-xs text-gray-500">
              Ce paiement sera enregistré dans "Fournisseur Passage" et sera automatiquement déduit dans la Caisse.
            </p>
          </form>
        </DialogContent>
      </Dialog>

      {/* Suppliers Overview Cards - Navbar Style */}
      <div className="flex flex-wrap w-full bg-white p-1 h-auto gap-1 border-b border-gray-200 rounded-lg">
        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-blue-50 border-b-2 border-blue-500 text-blue-600 flex-1 min-w-max">
          <Truck className="w-5 h-5" />
          <span className="text-xs font-medium">Fournisseurs Actifs</span>
          <span className="text-lg font-bold">{activeSuppliers.length}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-purple-50 border-b-2 border-purple-500 text-purple-600 flex-1 min-w-max">
          <Truck className="w-5 h-5" />
          <span className="text-xs font-medium">Sources</span>
          <span className="text-lg font-bold">{filteredSuppliers.length}</span>
        </div>
      </div>

      {/* Main Suppliers Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
          <Truck className="w-5 h-5" />
          Fournisseurs - Sources du Stock Partagé
          </CardTitle>
          <div className="flex gap-2">
          <Button
          onClick={exportToPDF}
          style={{ backgroundColor: '#dc2626', color: 'white' }}
          title="Exporter en PDF"
          >
          <Download className="w-4 h-4 mr-2" />
          Exporter PDF
          </Button>

          <Button
            onClick={() => {
              const isPassageSupplier = (s: any) => {
                const flag = !!s?.is_passage;
                const type = String(s?.type || '').trim().toLowerCase();
                return flag || type === 'passage';
              };

              const firstPassage =
                (filteredSuppliers || []).find((s: any) => isPassageSupplier(s)) ||
                (suppliers || []).find((s: any) => isPassageSupplier(s));

              if (!firstPassage) {
                toast.error('Aucun fournisseur PASSAGE trouvé');
                return;
              }
              openPassagePaymentDialog(firstPassage);
            }}
            style={{ backgroundColor: '#ea580c', color: '#ffffff', border: '1px solid #9a3412' }}
            className="hover:opacity-90"
            title="Paiement Fournisseur Passage"
          >
            <DollarSign className="w-4 h-4 mr-2" />
            Paiement Passage
          </Button>
              {/* Global Payment Dialog - Moved to CashManagementPage */}
              <Dialog open={globalPaymentDialogOpen} onOpenChange={(open) => {
                setGlobalPaymentDialogOpen(open);
                if (!open) {
                  setPaymentSupplierSearch('');
                  setSelectedPaymentSupplier(null);
                  setPaymentAmount('');
                }
              }}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Enregistrer un Paiement Fournisseur</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleGlobalPayment} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="supplier_search">Rechercher un fournisseur</Label>
                      <Input
                        id="supplier_search"
                        placeholder="Tapez le nom du fournisseur..."
                        value={paymentSupplierSearch}
                        onChange={(e) => setPaymentSupplierSearch(e.target.value)}
                      />
                    </div>

                    {paymentSupplierSearch && suppliers.filter(s => 
                      s.name?.toLowerCase().includes(paymentSupplierSearch.toLowerCase())
                    ).length > 0 && (
                      <div className="border rounded-lg max-h-48 overflow-y-auto">
                        {suppliers.filter(s => 
                          s.name?.toLowerCase().includes(paymentSupplierSearch.toLowerCase())
                        ).map((supplier) => (
                          <button
                            key={supplier.id}
                            type="button"
                            onClick={() => {
                              setSelectedPaymentSupplier(supplier);
                              setPaymentSupplierSearch(supplier.name);
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 border-b last:border-b-0 transition-colors"
                          >
                            <div className="font-medium">{supplier.name}</div>
                            <div className="text-sm text-gray-600">{supplier.phone || '-'}</div>
                          </button>
                        ))}
                      </div>
                    )}

                    {selectedPaymentSupplier && (
                      <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                        <p className="text-sm font-semibold text-blue-900">Fournisseur sélectionné:</p>
                        <p className="text-lg font-bold text-blue-600">{selectedPaymentSupplier.name}</p>
                        {(() => {
                          const supplierPayments = payments.filter(p => p.supplier_id === selectedPaymentSupplier.id);
                          const currentTotalPaid = supplierPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
                          const totalInvoiced = selectedPaymentSupplier.balance || 0;
                          const remainingBalance = totalInvoiced - currentTotalPaid;
                          return (
                            <div className="text-sm mt-2 space-y-1">
                              <p>Total Facturé: <span className="font-semibold">{totalInvoiced.toFixed(2)} MAD</span></p>
                              <p>Total Payé: <span className="font-semibold">{currentTotalPaid.toFixed(2)} MAD</span></p>
                              <p className="text-orange-600">Solde Restant: <span className="font-semibold">{remainingBalance.toFixed(2)} MAD</span></p>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="payment_amount">Montant à payer (MAD)</Label>
                      <Input
                        id="payment_amount"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="payment_remise">Remise Faild (MAD)</Label>
                      <Input
                        id="payment_remise"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={paymentRemiseAmount}
                        onChange={(e) => setPaymentRemiseAmount(e.target.value)}
                      />
                      <p className="text-xs text-gray-600">
                        Remise supplémentaire à appliquer au fournisseur
                      </p>
                    </div>

                    {/* Payment Method */}
                    <div className="space-y-2">
                      <Label htmlFor="payment_method">Méthode de Paiement</Label>
                      <select
                        id="payment_method"
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'check' | 'bank_transfer')}
                        className="w-full px-3 py-2 border rounded-md"
                      >
                        <option value="cash">Espèces</option>
                        <option value="check">Chèque</option>
                        <option value="bank_transfer">Virement Bancaire</option>
                      </select>
                    </div>

                    {/* Check Selection */}
                    {paymentMethod === 'check' && (
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 space-y-3">
                        <Button
                          type="button"
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
                            } finally {
                              setLoadingChecks(false);
                            }
                          }}
                          className="w-full"
                          disabled={loadingChecks}
                        >
                          {loadingChecks ? 'Chargement...' : 'Choisir un Chèque'}
                        </Button>

                        {checkDialogOpen && (
                          <Card className="mt-4 w-full">
                            <CardContent className="pt-4">
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

                                {checks.length === 0 ? (
                                  <div className="text-center py-4 text-gray-500">
                                    Aucun chèque disponible
                                  </div>
                                ) : (
                                  <div className="max-h-48 overflow-y-auto border rounded-lg">
                                    {checks.filter((check) => {
                                      if (check.status === 'used' || check.status === 'archived') return false;
                                      if (!checkSearchTerm.trim()) return true;
                                      const term = checkSearchTerm.toLowerCase();
                                      return (
                                        check.check_id_number?.toLowerCase().includes(term) ||
                                        check.given_to?.toLowerCase().includes(term) ||
                                        check.amount_value?.toString().includes(term)
                                      );
                                    }).map((check) => (
                                      <button
                                        key={check.id}
                                        type="button"
                                        onClick={() => {
                                          setSelectedCheck(check);
                                          setCheckDialogOpen(false);
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
                            </CardContent>
                          </Card>
                        )}

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
                          </div>
                        )}

                        <Dialog open={createCheckDialogOpen} onOpenChange={(open: boolean) => {
                          setCreateCheckDialogOpen(open);
                          if (open) {
                            setUploadCheckDate(getTodayDate());
                            setUploadExecutionDate(getTodayDate());
                          }
                        }}>
                          <DialogTrigger asChild>
                            <Button 
                              className="w-full"
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
                                <Label htmlFor="upload_file">Fichier (Image ou PDF) (Optionnel)</Label>
                                <Input
                                  id="upload_file"
                                  type="file"
                                  accept="image/*,.pdf"
                                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
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
                                  placeholder="Tapez le nom d'un fournisseur..."
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
                    )}

                    {/* Bank Transfer Proof */}
                    {paymentMethod === 'bank_transfer' && (
                      <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200 space-y-3">
                        <Label htmlFor="bank_proof">Preuve de Virement (Image ou PDF)</Label>
                        <Input
                          id="bank_proof"
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => setBankProofFile(e.target.files?.[0] || null)}
                          className="cursor-pointer"
                        />
                        {bankProofFile && (
                          <p className="text-xs text-gray-600">Fichier sélectionné: {bankProofFile.name}</p>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setGlobalPaymentDialogOpen(false);
                          setPaymentSupplierSearch('');
                          setSelectedPaymentSupplier(null);
                          setPaymentAmount('');
                          setPaymentRemiseAmount('');
                        }}
                      >
                        Annuler
                      </Button>
                      <Button
                        type="submit"
                        disabled={loading || !selectedPaymentSupplier || (parseFloat(paymentAmount) <= 0 && parseFloat(paymentRemiseAmount) <= 0)}
                        style={{ backgroundColor: '#16a34a' }}
                        className="text-white"
                      >
                        {loading ? 'Enregistrement...' : 'Enregistrer le Paiement'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={dialogOpen} onOpenChange={(open) => {
                // Block opening the create dialog if user lacks permission.
                // (Without this, the dialog can still pop up even if submit is blocked.)
                if (open && !editingSupplier && !canAddSupplier) {
                  toast.error("Vous n'avez pas la permission « Ajouter un Fournisseur »");
                  return;
                }

                setDialogOpen(open);
                if (!open) resetForm();
              }}>
                <DialogTrigger asChild>
                  <Button
                    disabled={!canAddSupplier}
                    title={!canAddSupplier ? "Vous n'avez pas la permission « Ajouter un Fournisseur »" : undefined}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Nouveau Fournisseur
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>
                      {editingSupplier ? 'Modifier le fournisseur' : 'Ajouter un fournisseur'}
                    </DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {(!editingSupplier && currentUserRole === 'admin') && (
                      <div className="space-y-2">
                        <Label>Magasin (obligatoire)</Label>
                        <select
                          className="w-full border border-gray-300 rounded-md px-3 py-2"
                          value={adminSelectedStoreId}
                          onChange={(e) => setAdminSelectedStoreId(e.target.value)}
                          required
                        >
                          <option value="">-- Sélectionner un magasin --</option>
                          {stores.map((s: any) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500">
                          En tant qu’admin, vous devez choisir le magasin auquel ce fournisseur appartient.
                        </p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Nom du fournisseur *</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          required
                        />
                      </div>

                      <div className="flex items-center justify-between rounded-lg border p-3 bg-orange-50 border-orange-200">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-orange-900">Fournisseur Passage (Temporaire)</p>
                          <p className="text-xs text-orange-700">
                            Marquer ce fournisseur comme <strong>Passage</strong> (exceptionnel / temporaire)
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={!!formData.is_passage}
                          onChange={(e) => setFormData({ ...formData, is_passage: e.target.checked })}
                          className="h-5 w-5"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Téléphone</Label>
                        <Input
                          id="phone"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contact_person">Personne de contact</Label>
                        <Input
                          id="contact_person"
                          value={formData.contact_person}
                          onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label htmlFor="address">Adresse</Label>
                        <Input
                          id="address"
                          value={formData.address}
                          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="city">Ville</Label>
                        <Input
                          id="city"
                          value={formData.city}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label htmlFor="payment_terms">Conditions de paiement</Label>
                        <Input
                          id="payment_terms"
                          value={formData.payment_terms}
                          onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                          placeholder="Ex: Net 30, 50% à la commande"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                        Annuler
                      </Button>
                      <Button type="submit" disabled={loading}>
                        {loading ? 'Enregistrement...' : 'Enregistrer'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-gray-600">Magasin</Label>
                  <select
                    value={adminSelectedStoreId}
                    onChange={(e) => setAdminSelectedStoreId(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Tous les magasins</option>
                    {(stores || []).map((st: any) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <Input
                placeholder="Rechercher un fournisseur..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Filter and Sort Controls */}
          <div className="flex items-center justify-between gap-4 p-3 bg-gray-100 rounded-lg border border-gray-300">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium text-gray-700">Tri Solde:</Label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'high-to-low' | 'low-to-high')}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm bg-white"
              >
                <option value="high-to-low">Élevé à Bas</option>
                <option value="low-to-high">Bas à Élevé</option>
              </select>
            </div>
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="zeroBalance"
                checked={showZeroBalanceOnly}
                onChange={(e) => setShowZeroBalanceOnly(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300"
              />
              <Label htmlFor="zeroBalance" className="text-sm font-medium text-gray-700 cursor-pointer">
                Afficher Solde = 0
              </Label>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showNonZeroBalanceOnly}
                  onChange={(e) => setShowNonZeroBalanceOnly(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <Label>
                  Afficher Solde ≠ 0
                </Label>
              </div>
            </div>
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
                            key: 'name',
                            direction: prev.key === 'name' && prev.direction === 'asc' ? 'desc' : 'asc',
                          }));
                        }}
                      >
                        Nom du Fournisseur
                        <span className="text-xs font-semibold text-blue-600">
                          {sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="flex items-center gap-2 select-none"
                        title="Trier A→Z / Z→A"
                        onClick={() => {
                          setSortConfig((prev) => ({
                            key: 'phone',
                            direction: prev.key === 'phone' && prev.direction === 'asc' ? 'desc' : 'asc',
                          }));
                        }}
                      >
                        Téléphone
                        <span className="text-xs font-semibold text-blue-600">
                          {sortConfig.key === 'phone' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead>Adresse</TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="flex items-center gap-2 select-none"
                        title="Trier 0→9 / 9→0"
                        onClick={() => {
                          setSortConfig((prev) => ({
                            key: 'total_invoiced',
                            direction: prev.key === 'total_invoiced' && prev.direction === 'asc' ? 'desc' : 'asc',
                          }));
                        }}
                      >
                        Total Facturé
                        <span className="text-xs font-semibold text-blue-600">
                          {sortConfig.key === 'total_invoiced' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
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
                            key: 'total_paid',
                            direction: prev.key === 'total_paid' && prev.direction === 'asc' ? 'desc' : 'asc',
                          }));
                        }}
                      >
                        Total Payé
                        <span className="text-xs font-semibold text-blue-600">
                          {sortConfig.key === 'total_paid' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
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
                            key: 'remaining_balance',
                            direction: prev.key === 'remaining_balance' && prev.direction === 'asc' ? 'desc' : 'asc',
                          }));
                        }}
                      >
                        Solde Restant
                        <span className="text-xs font-semibold text-blue-600">
                          {sortConfig.key === 'remaining_balance' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
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
                            key: 'discount_given',
                            direction: prev.key === 'discount_given' && prev.direction === 'asc' ? 'desc' : 'asc',
                          }));
                        }}
                      >
                        Remise Donnée
                        <span className="text-xs font-semibold text-blue-600">
                          {sortConfig.key === 'discount_given' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSuppliers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-gray-500 py-8">
                        Aucun fournisseur trouvé
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSuppliers.map((supplier) => {
                    // IMPORTANT: Must match SupplierDetailsPage
                    // Total Payé = payments + supplier_advances + supplier_passages
                    const supplierPayments = payments.filter(p => p.supplier_id === supplier.id);
                    const supplierAdvanceRows = supplierAdvances.filter((a: any) => String(a?.supplier_id || '') === String(supplier.id));
                    const supplierPassageRows = supplierPassages.filter((p: any) => String(p?.supplier_id || '') === String(supplier.id));
                    
                    const totalPaid =
                    supplierPayments.reduce((sum, p) => sum + (p.amount || 0), 0) +
                    // supplier_passages are mirrored into `payments` by the backend, so do not add them here.
                    supplierAdvanceRows.reduce((sum: number, a: any) => sum + (Number(a?.amount || 0) || 0), 0);
                    
                    // Calculate Discount Given from discounts table
                    const supplierDiscounts = discounts.filter(d => d.supplier_id === supplier.id);
                    const discountGiven = supplierDiscounts.reduce((sum, d) => sum + (d.amount || 0), 0);
                    
                    // Total Invoiced comes from supplier balance
                    const totalInvoiced = supplier.balance || 0;
                    
                    // Calculate remaining balance
                    const remainingBalance = totalInvoiced - totalPaid;
                    
                    // Solde restant (après remise)
                    // IMPORTANT: allow negative remaining (supplier credit / overpayment)
                    const remainingAfterDiscount = remainingBalance - discountGiven;
                      
                      return (
                        <TableRow key={supplier.id}>
                          <TableCell className="font-medium">{supplier.name}</TableCell>
                          <TableCell>
                            {supplier.is_passage ? (
                              <Badge className="bg-orange-100 text-orange-800">PASSAGE</Badge>
                            ) : (
                              <Badge className="bg-gray-100 text-gray-700">Normal</Badge>
                            )}
                          </TableCell>
                          <TableCell>{supplier.phone || '-'}</TableCell>
                          <TableCell>{supplier.address || '-'}</TableCell>
                          <TableCell className="font-semibold text-blue-600">{totalInvoiced.toFixed(2)} MAD</TableCell>
                          <TableCell className="font-semibold text-green-600">{totalPaid.toFixed(2)} MAD</TableCell>
                          <TableCell className="font-semibold text-orange-600">{remainingAfterDiscount.toFixed(2)} MAD</TableCell>
                          <TableCell className={`font-semibold ${discountGiven > 0 ? 'text-green-600' : 'text-gray-600'}`}>
                            {discountGiven > 0 ? `${discountGiven.toFixed(2)} MAD` : '0.00 MAD'}
                          </TableCell>
                          <TableCell>
                            <Badge className={supplier.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                              ✓ {supplier.status === 'active' ? 'ACTIF' : 'INACTIF'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {supplier?.is_passage ? (
                                <Button
                                  size="sm"
                                  className="bg-orange-600 hover:bg-orange-700 text-white"
                                  onClick={() => openPassagePaymentDialog(supplier)}
                                  title="Paiement Fournisseur Passage"
                                >
                                  <DollarSign className="w-4 h-4" style={{ color: '#f97316' }} />
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                style={{ backgroundColor: '#8b5cf6' }}
                                className="text-white hover:opacity-90"
                                onClick={() => {
                                  setDetailsSupplier(supplier);
                                  setShowDetailsPage(true);
                                }}
                                title="View Details"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                style={{ backgroundColor: '#2563eb' }}
                                className="text-white hover:opacity-90"
                                onClick={() => handleOpenManageDialog(supplier, 'buy')}
                                title="Buy from Supplier"
                              >
                                <ShoppingCart className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEdit(supplier)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDelete(supplier.id)}
                              >
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        </CardContent>
      </Card>

      {/* Full-screen Buy Dialog with invoice-like table */}
      <Dialog open={fullBuyDialogOpen && manageMode === 'buy'} onOpenChange={(open) => {
        setFullBuyDialogOpen(open);
        if (!open) {
          setSelectedSupplier(null);
          setProductSearchTerm('');
          setInvoiceData({
            client: { name: '', phone: '', address: '', ice: '', if: '', rc: '', patente: '' },
            items: [],
            status: 'Non Payée',
            paymentMethod: 'cash',
            tvaPercentage: 20,
          });
        }
      }}>
        <DialogContent className="w-screen h-screen max-w-none max-h-none overflow-hidden flex flex-col p-6">
          <DialogHeader className="flex-shrink-0 mb-4">
            <div className="flex justify-between items-center">
              <DialogTitle className="text-2xl font-bold">Acheter chez {selectedSupplier?.name}</DialogTitle>
              <Button onClick={() => setFullBuyDialogOpen(false)} className="bg-gray-200 text-gray-800">Fermer</Button>
            </div>
          </DialogHeader>
          <div className="space-y-6 flex-1 overflow-y-auto pr-2">
            {/* Client Info */}
            <Card>
              <CardHeader>
                <CardTitle>Informations</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Nom</Label>
                  <Input value={invoiceData.client.name} onChange={(e) => setInvoiceData({ ...invoiceData, client: { ...invoiceData.client, name: e.target.value } })} placeholder="Nom" />
                </div>
                <div>
                  <Label>Adresse</Label>
                  <Input value={invoiceData.client.address} onChange={(e) => setInvoiceData({ ...invoiceData, client: { ...invoiceData.client, address: e.target.value } })} placeholder="Adresse" />
                </div>
                <div>
                  <Label>Téléphone</Label>
                  <Input value={invoiceData.client.phone} onChange={(e) => setInvoiceData({ ...invoiceData, client: { ...invoiceData.client, phone: e.target.value } })} placeholder="Téléphone" />
                </div>
              </CardContent>
            </Card>

            {/* Items Table */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Articles de la Facture</CardTitle>
                  <Button 
                    onClick={() => {
                      const newItem = { id: `item-${Date.now()}`, description: '', caisse: '', quantity: 1, moyenne: '', unitPrice: 0, subtotal: 0 };
                      setInvoiceData({ ...invoiceData, items: [...invoiceData.items, newItem] });
                    }}
                    size="sm"
                    className="gap-2"
                    style={{ backgroundColor: '#1f2937', color: 'white' }}
                  >
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
                              onChange={(e) => {
                                const newItems = [...invoiceData.items];
                                newItems[index].description = e.target.value;
                                setInvoiceData({ ...invoiceData, items: newItems });
                                // suggestions
                                if (e.target.value.trim() === '') {
                                  setProductDialogOpen(null);
                                  setHasUserTyped({ ...hasUserTyped, [item.id]: false });
                                } else {
                                  setHasUserTyped({ ...hasUserTyped, [item.id]: true });
                                  const filtered = products.filter(product =>
                                    product.name?.toLowerCase().includes(e.target.value.toLowerCase()) ||
                                    product.reference?.toLowerCase().includes(e.target.value.toLowerCase())
                                  );
                                  setFilteredProductsForDescription(filtered.slice(0, 10));
                                  if (filtered.length > 0) setProductDialogOpen(item.id); else setProductDialogOpen(null);
                                }
                              }}
                              className="h-8"
                              placeholder="Tapez le nom du produit..."
                            />
                          </td>
                          <td className="py-2 px-2">
                            <Input
                              value={item.caisse}
                              onChange={(e) => {
                                const newItems = [...invoiceData.items];
                                newItems[index].caisse = e.target.value;
                                const caisse = parseFloat(e.target.value) || 0;
                                const quantity = newItems[index].quantity;
                                newItems[index].moyenne = caisse > 0 && quantity > 0 ? (quantity / caisse).toFixed(2) : '';
                                setInvoiceData({ ...invoiceData, items: newItems });
                              }}
                              className="h-8 w-24"
                              placeholder="Caisse"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => {
                                const newItems = [...invoiceData.items];
                                newItems[index].quantity = parseFloat(e.target.value) || 0;
                                newItems[index].subtotal = newItems[index].quantity * newItems[index].unitPrice;
                                const caisse = parseFloat(newItems[index].caisse) || 0;
                                const quantity = newItems[index].quantity;
                                newItems[index].moyenne = caisse > 0 && quantity > 0 ? (quantity / caisse).toFixed(2) : '';
                                setInvoiceData({ ...invoiceData, items: newItems });
                              }}
                              className="h-8 w-24"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <Input value={item.moyenne} readOnly className="h-8 w-24 bg-gray-100" />
                          </td>
                          <td className="py-2 px-2">
                            <Input
                              type="number"
                              value={item.unitPrice}
                              onChange={(e) => {
                                const newItems = [...invoiceData.items];
                                newItems[index].unitPrice = parseFloat(e.target.value) || 0;
                                newItems[index].subtotal = newItems[index].quantity * newItems[index].unitPrice;
                                setInvoiceData({ ...invoiceData, items: newItems });
                              }}
                              className="h-8 w-28"
                            />
                          </td>
                          <td className="py-2 px-2 font-semibold">{(item.subtotal || 0).toFixed(2)} MAD</td>
                          <td className="py-2 px-2 text-center">
                            <Button size="sm" variant="destructive" className="h-8 w-8 p-0" onClick={() => {
                              setInvoiceData({ ...invoiceData, items: invoiceData.items.filter((_, i) => i !== index) });
                            }}>
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

            {/* Summary and Actions */}
            <div className="flex flex-col md:flex-row gap-4 md:items-start md:justify-between">
              <Card className="md:w-1/2">
                <CardHeader>
                  <CardTitle>Résumé</CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const subTotal = invoiceData.items.reduce((sum, it) => sum + (it.subtotal || 0), 0);
                    return (
                      <div className="space-y-2">
                        <div className="flex justify-between"><span>Sous-total HT:</span><span className="font-semibold">{subTotal.toFixed(2)} MAD</span></div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              <div className="flex-1 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setFullBuyDialogOpen(false)}>Annuler</Button>
                <Button
                  style={{ backgroundColor: '#16a34a' }}
                  className="text-white"
                  onClick={async () => {
                    if (invoiceData.items.length === 0) { toast.error('Veuillez ajouter au moins un article'); return; }
                    // Map items to purchases payload: we need product_id from description. We'll try to resolve by name/reference.
                    const itemsPayload: any[] = [];
                    for (const it of invoiceData.items) {
                      const match = products.find(p => p.name === it.description || p.reference === it.description);
                      if (!match) { toast.error(`Produit introuvable: ${it.description}`); return; }
                      itemsPayload.push({
                        product_id: match.id,
                        quantity: Math.round(it.quantity || 0),
                        unit_price: it.unitPrice || 0,
                        total_price: (it.quantity || 0) * (it.unitPrice || 0),
                      });
                    }
                    const subTotal = invoiceData.items.reduce((sum, it) => sum + (it.subtotal || 0), 0);
                    setLoading(true);
                    try {
                      const response = await fetch(
                        `https://${projectId}.supabase.co/functions/v1/super-handler/purchases`,
                        {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                          body: JSON.stringify({
                            items: itemsPayload,
                            total_amount: subTotal,
                            payment_method: 'cash',
                            customer_name: invoiceData.client.name,
                            customer_phone: invoiceData.client.phone,
                            notes: invoiceData.client.address,
                            supplier_id: selectedSupplier?.id,
                          }),
                        }
                      );
                      if (response.ok) {
                        toast.success('Achat enregistré avec succès!');
                        setFullBuyDialogOpen(false);
                        fetchProducts();
                      } else {
                        const error = await response.json();
                        toast.error(error.error || 'Erreur lors de l\'enregistrement');
                      }
                    } catch (err: any) {
                      toast.error(err.message || 'Erreur');
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  Confirmer l'achat
                </Button>
              </div>
            </div>
          </div>

          {/* Suggestions Dialog reused */}
          <Dialog open={productDialogOpen !== null && filteredProductsForDescription.length > 0 && hasUserTyped[productDialogOpen || '']} onOpenChange={(open) => { if (!open) { setProductDialogOpen(null); setFilteredProductsForDescription([]); } }}>
            <DialogContent className="max-w-md max-h-96">
              <DialogHeader>
                <DialogTitle className="text-sm">Produits disponibles ({filteredProductsForDescription.length})</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 overflow-y-auto max-h-64">
                {filteredProductsForDescription.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => {
                      if (productDialogOpen) {
                        const index = invoiceData.items.findIndex(item => item.id === productDialogOpen);
                        if (index !== -1) {
                          const newItems = [...invoiceData.items];
                          newItems[index].description = product.name;
                          newItems[index].unitPrice = product.purchase_price || product.sale_price || 0;
                          newItems[index].subtotal = newItems[index].quantity * newItems[index].unitPrice;
                          setInvoiceData({ ...invoiceData, items: newItems });
                        }
                        setProductDialogOpen(null);
                        setHasUserTyped({ ...hasUserTyped, [productDialogOpen]: false });
                      }
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 border border-gray-200 rounded transition-colors group text-xs"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate group-hover:text-blue-600">{product.name}</div>
                        <div className="text-xs text-gray-600 truncate">Ref: {product.reference}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className={`inline-block px-1 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${product.max_purchase_limit ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>
                          {product.max_purchase_limit ? `Max: ${product.max_purchase_limit}` : 'Illimité'}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>

      
      {/* Product Selection Dialog */}
      {selectedProductForBuy && (
        <Dialog open={!!selectedProductForBuy} onOpenChange={(open) => {
          if (!open) setSelectedProductForBuy(null);
        }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Acheter {selectedProductForBuy?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  <span className="font-semibold">Prix:</span> {selectedProductForBuy?.sale_price?.toFixed(2)} MAD
                </p>
                <p className="text-sm text-blue-800">
                  <span className="font-semibold">Stock:</span> {selectedProductForBuy?.quantity_available}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="buy_qty">Quantité</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBuyQuantity(Math.max(1, buyQuantity - 1))}
                    className="bg-gray-200 text-gray-800 hover:bg-gray-300"
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Input
                    id="buy_qty"
                    type="number"
                    min="1"
                    max={selectedProductForBuy?.quantity_available}
                    value={buyQuantity}
                    onChange={(e) => setBuyQuantity(Math.max(1, Number(e.target.value)))}
                    className="text-center"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBuyQuantity(Math.min(selectedProductForBuy?.quantity_available, buyQuantity + 1))}
                    className="bg-gray-200 text-gray-800 hover:bg-gray-300"
                  >
                    +
                  </Button>
                </div>
              </div>

              <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                <p className="text-lg font-bold text-green-800">
                  Total: {(buyQuantity * (selectedProductForBuy?.sale_price || 0)).toFixed(2)} MAD
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => setSelectedProductForBuy(null)}
                  style={{ backgroundColor: '#d1d5db' }}
                  className="text-gray-800 hover:opacity-90"
                >
                  Annuler
                </Button>
                <Button
                  style={{ backgroundColor: '#16a34a' }}
                  className="text-white hover:opacity-90"
                  onClick={handleAddToBuy}
                >
                  Ajouter au panier
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Checkout Dialog */}
      <Dialog open={checkoutDialogOpen} onOpenChange={(open) => setCheckoutDialogOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Finaliser l'achat</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCheckout} className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-800">
                <span className="font-semibold">Articles:</span> {cartItemsCount}
              </p>
              <p className="text-lg font-bold text-blue-800">
                Total: {cartTotal.toFixed(2)} MAD
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="checkout_phone">Téléphone</Label>
              <Input
                id="checkout_phone"
                value={customerData.phone}
                onChange={(e) => setCustomerData({ ...customerData, phone: e.target.value })}
                placeholder="+212 6XX XXX XXX"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="checkout_method">Méthode de paiement *</Label>
              <select
                id="checkout_method"
                value={customerData.payment_method}
                onChange={(e) => setCustomerData({ ...customerData, payment_method: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
                required
              >
                <option value="cash">Espèces</option>
                <option value="check">Chèque</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="checkout_notes">Notes</Label>
              <Input
                id="checkout_notes"
                value={customerData.notes}
                onChange={(e) => setCustomerData({ ...customerData, notes: e.target.value })}
                placeholder="Informations supplémentaires..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => setCheckoutDialogOpen(false)}
                style={{ backgroundColor: '#d1d5db' }}
                className="text-gray-800 hover:opacity-90"
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={loading}
                style={{ backgroundColor: '#16a34a' }}
                className="text-white hover:opacity-90"
              >
                {loading ? 'Traitement...' : 'Confirmer l\'achat'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Cart View Dialog */}
      <Dialog open={cartViewOpen} onOpenChange={(open) => setCartViewOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Panier ({cartItemsCount} articles)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {cart.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Panier vide</p>
              </div>
            ) : (
              <>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {cart.map((item) => (
                    <div key={item.id} className="border rounded-lg p-3 space-y-2 bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-sm">{item.name}</p>
                          <p className="text-xs text-gray-600">{item.sale_price?.toFixed(2)} MAD/unité</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFromCart(item.id)}
                          className="text-red-600 hover:text-red-700 h-6 w-6 p-0"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="h-6 w-6 p-0 bg-gray-200 text-gray-800 hover:bg-gray-300"
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="h-6 w-6 p-0 bg-gray-200 text-gray-800 hover:bg-gray-300"
                          >
                            +
                          </Button>
                        </div>
                        <p className="font-semibold text-sm">
                          {(item.quantity * item.sale_price).toFixed(2)} MAD
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t pt-3 space-y-2">
                  <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-green-800">Total:</span>
                      <span className="text-xl font-bold text-green-600">
                        {cartTotal.toFixed(2)} MAD
                      </span>
                    </div>
                  </div>

                  <Button
                    onClick={() => {
                      setCartViewOpen(false);
                      setCheckoutDialogOpen(true);
                    }}
                    style={{ backgroundColor: '#16a34a' }}
                    className="w-full text-white hover:opacity-90"
                  >
                    Procéder au paiement
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-800">À propos des Fournisseurs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-blue-700 space-y-2">
            <p>• Les fournisseurs approvisionnent le stock partagé utilisé par tous les magasins</p>
            <p>• Leurs produits deviennent disponibles pour l'échange inter-magasins</p>
            <p>• Gérer les conditions de paiement et les relations commerciales</p>
            <p>• Suivre les soldes et les performances des fournisseurs</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}