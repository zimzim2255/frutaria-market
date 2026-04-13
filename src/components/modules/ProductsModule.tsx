import { useState, useEffect } from 'react';
import { projectId } from '../../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Plus, Edit, Trash2, Search, AlertTriangle, Package, TrendingDown, Eye, FileText, Upload, Download, CheckSquare, Square, X } from 'lucide-react';
import { DialogDescription } from '../ui/dialog';
import { toast } from 'sonner';
import { ProductDetailsPage } from '../ProductDetailsPage';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { exportToExcelHtml, type TableColumn } from '../../utils/export/exportUtils';

interface ProductsModuleProps {
  session: any;
}

type PermissionString = string;

export function ProductsModule({ session }: ProductsModuleProps) {
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [currentUserStoreId, setCurrentUserStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // NOTE: session.user.user_metadata is not reliable in this app for role/store.
  // We fetch the effective role/store_id from backend (/users) instead.
  const [effectiveUserRole, setEffectiveUserRole] = useState<string>('user');
  const [effectiveUserStoreId, setEffectiveUserStoreId] = useState<string | null>(null);
  const [effectiveUserPermissions, setEffectiveUserPermissions] = useState<PermissionString[]>([]);
  const [showAddProductPage, setShowAddProductPage] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  // When editing from the grouped table, we must update a specific underlying DB row.
  // This stores that concrete row id.
  const [editingProductRowId, setEditingProductRowId] = useState<string | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedProductForDetails, setSelectedProductForDetails] = useState<any>(null);
  const [showDetailsPage, setShowDetailsPage] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  // Admin-only store filter (magasin)
  const [storeFilter, setStoreFilter] = useState<string>('all');

  const [createdByFilter, setCreatedByFilter] = useState('all');

  // Stock Partagé - Échange Inter-Magasins filters
  const [sharedStockOnlyZero, setSharedStockOnlyZero] = useState(false);
  const [sharedStockOnlyNonZero, setSharedStockOnlyNonZero] = useState(false);

  // Sorting (A→Z / Z→A) per column
  const [sortConfig, setSortConfig] = useState<{ key: 'stock_reference' | 'reference' | 'name' | 'total_sales' | null; direction: 'asc' | 'desc' }>({
    key: null,
    direction: 'asc',
  });

  // Pagination state
  const [displayLimit, setDisplayLimit] = useState(100);

  // Reset pagination when filters change
  useEffect(() => {
    setDisplayLimit(100);
  }, [searchTerm, storeFilter, createdByFilter, sharedStockOnlyZero, sharedStockOnlyNonZero]);
  const [formData, setFormData] = useState({
    name: '',
    reference: '',
    quantity_available: '' as string | number,
    purchase_price: '' as string | number,
    sale_price: '' as string | number,
    supplier_id: '',
    category: '',
    number_of_boxes: '' as string | number,
    total_net_weight: '' as string | number,
    avg_net_weight_per_box: '' as string | number,
    max_purchase_limit: '' as string | number,
    van_delivery_attachment_url: '',
    van_delivery_attachment_type: '',
    van_delivery_notes: '',
    entrepot: '',
  });

  // Stock reference (company/header) details to persist into stock_reference_details
  const [stockRefCompany, setStockRefCompany] = useState({
    palette_category: '',
    entrepot: '',
    matricule: '',
    date_chargement: '',
    date_dechargement: '',
    frais_maritime: '' as string | number,
    frais_transit: '' as string | number,
    onssa: '' as string | number,
    frais_divers: '' as string | number,
    frais_transport: '' as string | number,
    magasinage: '' as string | number,
    taxe: '' as string | number,
  });
  const [vanDeliveryFile, setVanDeliveryFile] = useState<File | null>(null);
  const [referenceSearch, setReferenceSearch] = useState('');
  const [referenceSuggestions, setReferenceSuggestions] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [articles, setArticles] = useState<any[]>([
    {
      id: 1,
      reference: '',
      name: '',
      category: '',
      product_category: '',
      number_of_boxes: '',
      avg_net_weight_per_box: '',
      purchase_price: '',
      max_purchase_limit: '',
      lot: '',
      fourchette_min: '',
      fourchette_max: '',
    }
  ]);
  const [productTemplates, setProductTemplates] = useState<any[]>([]);
  const [templateSuggestions, setTemplateSuggestions] = useState<{ [key: string]: any[] }>({});
  const [categorySuggestions, setCategorySuggestions] = useState<string[]>([]);
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [activeArticleId, setActiveArticleId] = useState<number | null>(null);
  const [showTemplatePageDialog, setShowTemplatePageDialog] = useState(false);
  const [newTemplateData, setNewTemplateData] = useState({ 
    name: '', 
    category: '', 
    description: '',
    reference_number: '',
    date_fin: '',
    fourchette_min: '',
    fourchette_max: '',
    entrepot: '',
    fournisseur: '',
  });
  const [templatePhotoFile, setTemplatePhotoFile] = useState<File | null>(null);
  const [templatePhotoPreview, setTemplatePhotoPreview] = useState<string>('');
  const [allInvoices, setAllInvoices] = useState<any[]>([]);
  const [allSales, setAllSales] = useState<any[]>([]);
  const [nextStockReference, setNextStockReference] = useState<string>('000001');
  const [customStockReference, setCustomStockReference] = useState<string>('');
  // Custom operation date for product additions (optional, falls back to created_at if not set)
  const [operationDate, setOperationDate] = useState<string>('');
  const [selectedEntrepotStoreId, setSelectedEntrepotStoreId] = useState<string | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [showPdfExportDialog, setShowPdfExportDialog] = useState(false);
  const [showExcelExportDialog, setShowExcelExportDialog] = useState(false);
  const [pdfExportOptions, setPdfExportOptions] = useState({
    includeNames: true,
    includeQuantities: false,
  });
  const [productDuplicateReference, setProductDuplicateReference] = useState(false);
  const [templateReferenceDuplicate, setTemplateReferenceDuplicate] = useState(false);

  // Preview next reference (does NOT consume/reserve)
  const previewNextStockReference = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/stock-reference-details/next`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const nextRef = data.stock_reference;
        if (nextRef) {
          setNextStockReference(nextRef);
          return nextRef;
        }
      } else {
        const errorText = await response.text();
        console.error('Error previewing next stock reference:', errorText);
      }
    } catch (error) {
      console.error('Error previewing next stock reference:', error);
    }
    return '';
  };

  // Allocate next reference (CONSUMES/RESERVES) - should be called only on save
  const allocateNextStockReference = async () => {
    try {
      // Ask the backend to allocate the next stock reference atomically.
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/stock-reference-details/next`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const nextRef = data.stock_reference;
        if (nextRef) {
          setNextStockReference(nextRef);
          return nextRef;
        }
      } else {
        const errorText = await response.text();
        console.error('Error allocating next stock reference:', errorText);
      }
    } catch (error) {
      console.error('Error allocating next stock reference:', error);
    }
    return '000001';
  };

  // Check if a stock reference already exists in the database
  const checkStockReferenceExists = async (stockRef: string): Promise<boolean> => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/stock-reference-details?stock_reference=${encodeURIComponent(stockRef)}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        // If details exist, the stock reference is already in use
        return !!data.details;
      }
      // If 404 or other error, assume it doesn't exist
      return false;
    } catch (error) {
      console.error('Error checking stock reference existence:', error);
      // On error, allow the operation to proceed (backend will catch duplicates)
      return false;
    }
  };

  const fetchInvoices = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/invoices`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setAllInvoices(data.invoices || []);
      }
    } catch (error) {
      console.error('Error fetching invoices:', error);
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
        setAllSales(data.sales || []);
      }
    } catch (error) {
      console.error('Error fetching sales:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      console.log('[ProductsModule] Fetching products...', {
        userId: session?.user?.id,
        email: session?.user?.email,
        roleMeta: session?.user?.user_metadata?.role,
        storeIdMeta: session?.user?.user_metadata?.store_id,
      });

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/products`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      console.log('Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[ProductsModule] /products response:', {
          storesCount: data.stores?.length,
          storeNames: (data.stores || []).map((s: any) => s.name),
          productsCount: data.products?.length,
          firstProductStoreStocksKeys: Object.keys((data.products?.[0]?.store_stocks) || {}),
        });
        console.log('Products data:', data);
        console.log('Current user ID:', session?.user?.id);
        console.log('Number of products:', data.products?.length);
        data.products?.forEach((p: any) => {
          console.log(`[ProductsModule] Product ID: ${p.id}, Reference: ${p.reference}, Name: ${p.name}, Created by: ${p.created_by}, Store stocks:`, p.store_stocks, 'Quantity available:', p.quantity_available, 'Total store stock:', p.total_store_stock);
        });
        setProducts(data.products || []);
        
        // Extract current user's store ID from their products
        const userProduct = data.products?.find((p: any) => p.created_by === session?.user?.id);
        if (userProduct?.store_stocks) {
          const storeId = Object.keys(userProduct.store_stocks)[0];
          setCurrentUserStoreId(storeId);
          console.log('Current user store ID:', storeId);
        }
      } else {
        const errorData = await response.text();
        console.error('Error response:', errorData);
        toast.error('Erreur lors du chargement des produits');
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Erreur lors du chargement des produits');
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    const normalizeSuppliers = (list: any[]) => {
      const normalized = (list || []).map((s: any) => {
        const isAdminSupplier = !!s?.admin_user_id;
        const safeName = String(s?.name || '').trim();
        const safeEmail = String(s?.email || s?.admin_email || '').trim();

        const display = isAdminSupplier
          ? `Fournisseur Admin: ${safeName || safeEmail || s?.id}`
          : (safeName || safeEmail || s?.id);

        return {
          ...s,
          name: safeName || safeEmail || s?.id,
          email: safeEmail || s?.email || null,
          __isAdminSupplier: isAdminSupplier,
          __displayName: display,
        };
      });

      console.log('[ProductsModule] suppliers loaded:', {
        count: normalized.length,
        sample: normalized.slice(0, 5),
      });

      return normalized;
    };

    try {
      // 1) Try edge function (preferred)
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
        const list = Array.isArray(data.suppliers) ? data.suppliers : [];
        const normalized = normalizeSuppliers(list);

        // If we got data, use it.
        if (normalized.length > 0) {
          setSuppliers(normalized);
          return;
        }

        // Otherwise fallback to direct DB query (helps when edge function is out-of-sync)
        console.warn('[ProductsModule] /suppliers returned 0 rows. Falling back to direct DB query.');
      } else {
        const txt = await response.text();
        console.warn('[ProductsModule] /suppliers not ok:', response.status, txt);
      }

      // 2) Fallback: direct PostgREST query to suppliers table
      const dbRes = await fetch(
        `https://${projectId}.supabase.co/rest/v1/suppliers?select=*&admin_user_id=not.is.null&order=name.asc`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': session?.supabaseKey || '',
          },
        }
      );

      if (dbRes.ok) {
        const list = await dbRes.json();
        setSuppliers(normalizeSuppliers(Array.isArray(list) ? list : []));
        return;
      }

      const txt = await dbRes.text();
      console.warn('[ProductsModule] direct suppliers query not ok:', dbRes.status, txt);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    }
  };

  const fetchStores = async () => {
    try {
      console.log('[ProductsModule] Fetching stores...');
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
        console.log('[ProductsModule] /stores response:', {
          storesCount: data.stores?.length,
          storeNames: (data.stores || []).map((s: any) => s.name),
        });
        const normalizeStoreName = (name: any) => {
          const raw = String(name || '').trim();
          if (!raw) return '';

          // Goal: avoid showing multiple stores as identical "Admin".
          // We normalize "Caisse Admin - ..." into a stable, distinguishable label:
          // - If suffix is a non-email string (ex: "Admin 2", "Admin1") => keep it
          // - If suffix is an email => derive "AdminN" from the order found in the stores list
          // - If no suffix => fallback to "Admin"
          const lowered = raw.toLowerCase();
          if (lowered.startsWith('caisse admin')) {
            const parts = raw.split('-').map((p) => p.trim()).filter(Boolean);
            const suffix = parts.length > 1 ? parts[parts.length - 1] : '';

            const looksLikeEmail = /@/.test(suffix);
            if (suffix && !looksLikeEmail) {
              // If user already named it Admin1/Admin2/etc, keep it.
              return suffix;
            }

            // If suffix is an email (or missing), assign Admin1/Admin2/... deterministically
            // based on the order in the stores array.
            // We use the index of this raw name among "caisse admin" stores.
            const adminStores = (data.stores || []).filter((s: any) => String(s?.name || '').trim().toLowerCase().startsWith('caisse admin'));
            const idx = adminStores.findIndex((s: any) => String(s?.name || '').trim() === raw);
            const n = idx >= 0 ? idx + 1 : null;
            return n ? `Admin${n}` : 'Admin';
          }

          return raw;
        };

        const sortedStores = (data.stores || [])
          .map((s: any) => ({ ...s, name: normalizeStoreName(s?.name) }))
          .sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')));

        setStores(sortedStores);
      }
    } catch (error) {
      console.error('Error fetching stores:', error);
    }
  };

  const fetchProductTemplates = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/product-templates`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setProductTemplates(data.templates || []);
      }
    } catch (error) {
      console.error('Error fetching product templates:', error);
    }
  };

  const createProductTemplate = async (name: string, category: string, description: string = '', photoUrl: string = '', reference_number: string = '', entrepot: string = '', date_fin: string = '', fournisseur: string = '', fourchette_min: string | number = '', fourchette_max: string | number = '', articleIdToFill?: number | null) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/product-templates`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            name,
            category,
            photo_url: photoUrl,
            description,
            reference_number,
            entrepot,
            date_fin,
            fournisseur,
            fourchette_min: fourchette_min ? parseFloat(String(fourchette_min)) : null,
            fourchette_max: fourchette_max ? parseFloat(String(fourchette_max)) : null,
          }),
        }
      );

      if (response.ok) {
        toast.success('Modèle de produit créé');
        fetchProductTemplates();
        
        // If we have an article ID to fill, populate it with the template data
        if (articleIdToFill !== null && articleIdToFill !== undefined) {
          const updated = articles.map(a => 
            a.id === Number(articleIdToFill) ? {
              ...a,
              name: name,
              product_category: category,
              reference: reference_number,
              fourchette_min: fourchette_min,
              fourchette_max: fourchette_max,
            } : a
          );
          setArticles(updated);
        } else {
          // If no specific article ID, fill the first article with the template data
          const updated = articles.map((a, index) => 
            index === 0 ? {
              ...a,
              name: name,
              product_category: category,
              reference: reference_number,
              fourchette_min: fourchette_min,
              fourchette_max: fourchette_max,
            } : a
          );
          setArticles(updated);
        }
        
        setShowTemplateDialog(false);
        setShowTemplatePageDialog(false);
        setNewTemplateData({ name: '', category: '', description: '', reference_number: '', entrepot: '', date_fin: '', fournisseur: '', fourchette_min: '', fourchette_max: '' });
        setTemplatePhotoFile(null);
        setTemplatePhotoPreview('');
        return true;
      } else {
        toast.error('Erreur lors de la création du modèle');
        return false;
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
      return false;
    }
  };

  // Fetch current user role/store from backend
  const fetchEffectiveUser = async () => {
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
        // Expected shapes in this project vary; handle common ones.
        const userRow = data?.user || data?.currentUser || data?.users?.find?.((u: any) => String(u.id) === String(session?.user?.id));
        const role = userRow?.role || 'user';
        const storeId = userRow?.store_id || null;
        const permissions: PermissionString[] = Array.isArray(userRow?.permissions) ? userRow.permissions : [];

        setEffectiveUserRole(role);
        setEffectiveUserStoreId(storeId);
        setEffectiveUserPermissions(permissions);

        console.log('[ProductsModule] /users effective user:', { role, storeId, permissionsCount: permissions.length });
      } else {
        const txt = await response.text();
        console.warn('[ProductsModule] /users not ok:', response.status, txt);
      }
    } catch (err) {
      console.warn('[ProductsModule] /users fetch failed:', err);
    }
  };

  useEffect(() => {
    fetchEffectiveUser();
    fetchProducts();
    fetchSuppliers();
    fetchStores();
    fetchProductTemplates();
    fetchInvoices();
    fetchSales();

    // Show the user the next reference, but do not consume it.
    if (showAddProductPage && !editingProduct) {
      previewNextStockReference();
    }

    // Listen for invoice creation events from FactureModule
    // When an invoice is created, refresh sales/invoices data so "Ventes Totales" updates
    const handleInvoiceCreated = () => {
      console.log('[ProductsModule] Invoice created event received, refreshing sales/invoices data');
      fetchInvoices();
      fetchSales();
    };

    window.addEventListener('invoiceCreated', handleInvoiceCreated);
    return () => {
      window.removeEventListener('invoiceCreated', handleInvoiceCreated);
    };
  }, [showAddProductPage]);

  // Default "Entrepôt (Magasin)" selection for non-admin users (manager/user).
  // Admin keeps manual selection.
  useEffect(() => {
    if (!showAddProductPage) return;

    const role = String(effectiveUserRole || 'user').toLowerCase();
    if (role === 'admin') return;

    if (!effectiveUserStoreId) return;

    // If already selected, don't override user actions.
    if (selectedEntrepotStoreId) return;

    const store = stores.find((s: any) => String(s.id) === String(effectiveUserStoreId));
    if (!store) return;

    setSelectedEntrepotStoreId(String(store.id));
    const entrepotName = String(store.name || '').trim();
    setFormData((prev) => ({ ...prev, entrepot: entrepotName }));
    setStockRefCompany((prev) => ({ ...prev, entrepot: entrepotName }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddProductPage, effectiveUserRole, effectiveUserStoreId, stores.length, selectedEntrepotStoreId]);

  // Ensure we always start from a clean state when opening the Add Product page in "create" mode.
  // (The page stays mounted, so without this, old state can persist.)
  useEffect(() => {
    if (showAddProductPage && !editingProduct) {
      resetForm();
      // Show a preview value (does not reserve). Real allocation happens on save.
      setNextStockReference('');
      setCustomStockReference('');
      // resetForm clears editingProduct; keep it explicit for readability
      setEditingProduct(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddProductPage, editingProduct]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check for duplicate reference in products
    const refValue = String(formData.reference || '').trim();
    if (refValue && !editingProduct) {
      const productExists = products.some(p => 
        p.reference?.toLowerCase() === refValue.toLowerCase()
      );
      if (productExists) {
        toast.error('Cette référence existe déjà dans la base de produits. Veuillez utiliser une autre référence.');
        setProductDuplicateReference(true);
        setLoading(false);
        return;
      }
    }

    setLoading(true);

    try {
      // For single product creation (dialog form): validate against product templates
      if (!showAddProductPage && !editingProduct) {
        // Check if product exists in productTemplates by reference or name
        const templateExists = productTemplates.some(
          t => t.reference?.toLowerCase() === formData.reference?.toLowerCase() ||
               t.name?.toLowerCase() === formData.name?.toLowerCase()
        );
        
        if (!templateExists) {
          toast.error(
            `Produit non trouvé dans les modèles: "${formData.name || formData.reference}". Créez d'abord le produit dans Product Templates `
          );
          setLoading(false);
          return;
        }
      }

      // For Add Stock page: process ALL articles, not just the first one
      if (showAddProductPage && !editingProduct) {
        // Filter articles that have at least a reference or name
        const validArticles = articles.filter(a => a.reference?.trim() || a.name?.trim());
        
        if (validArticles.length === 0) {
          toast.error('Veuillez ajouter au moins un article avec une référence ou un nom');
          setLoading(false);
          return;
        }

        // Convert van delivery file to base64 if selected (only once)
        let vanDeliveryBase64 = '';
        if (vanDeliveryFile) {
          try {
            vanDeliveryBase64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                resolve(reader.result as string);
              };
              reader.onerror = () => {
                reject(new Error('Failed to read file'));
              };
              reader.readAsDataURL(vanDeliveryFile);
            });
            console.log('File converted to base64 successfully');
          } catch (fileError) {
            console.warn('File conversion error:', fileError);
            // Continue without the file
          }
        }

        // Create a product for EACH article
        let successCount = 0;
        let totalAmount = 0;

        // Validate: Product must exist in product templates before allowing creation
        for (let i = 0; i < validArticles.length; i++) {
          const a = validArticles[i];
          const refOrName = a.reference || a.name || `ligne ${i + 1}`;
          
          // Check if product exists in productTemplates
          const templateExists = productTemplates.some(
            t => t.reference?.toLowerCase() === a.reference?.toLowerCase() ||
                 t.name?.toLowerCase() === a.name?.toLowerCase()
          );
          
          if (!templateExists) {
            toast.error(
              `Produit non trouvé dans les modèles: "${refOrName}". Créez d'abord le produit dans Product Templates `
            );
            setLoading(false);
            return;
          }
        }

        // Validate: Moyenne must be between Fourchette Min/Max (when provided)
        // Moyenne in this table is calculated as: Quantité / Caisse
        for (let i = 0; i < validArticles.length; i++) {
          const a = validArticles[i];

          const caisse = Number(a.category);
          const quantite = Number(a.number_of_boxes);
          const moyenne = (caisse > 0 && quantite > 0) ? (quantite / caisse) : null;

          const hasMin = a.fourchette_min !== '' && a.fourchette_min !== null && a.fourchette_min !== undefined;
          const hasMax = a.fourchette_max !== '' && a.fourchette_max !== null && a.fourchette_max !== undefined;

          // Only validate if we have a calculable moyenne AND at least one bound is provided
          if (moyenne !== null && (hasMin || hasMax)) {
            const min = hasMin ? Number(a.fourchette_min) : null;
            const max = hasMax ? Number(a.fourchette_max) : null;

            if ((min !== null && !isNaN(min) && moyenne < min) || (max !== null && !isNaN(max) && moyenne > max)) {
              const refOrName = a.reference || a.name || `ligne ${i + 1}`;
              toast.error(
                `Erreur Fourchette: la moyenne (${moyenne.toFixed(2)}) doit être entre ${hasMin ? min : '-'} et ${hasMax ? max : '-'} (Article: ${refOrName})`
              );
              setLoading(false);
              return;
            }
          }
        }

        // Allocate stock reference ONLY at save time (prevents consuming numbers on open/close)
        const allocatedStockReference = customStockReference.trim()
          ? customStockReference.trim()
          : await allocateNextStockReference();

        // MANDATORY CHECK: Verify that the stock reference doesn't already exist in the database
        // This prevents duplication at the point of entry
        if (allocatedStockReference) {
          const exists = await checkStockReferenceExists(allocatedStockReference);
          if (exists) {
            toast.error(`La référence de stock "${allocatedStockReference}" existe déjà. Veuillez utiliser une référence différente.`);
            setLoading(false);
            return;
          }
        }

        // Persist company/header details for this stock reference (so SupplierDetails modal can display it)
        try {
          const numOrNull = (v: any) => {
            if (v === '' || v === null || v === undefined) return null;
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
          };

          const strOrNull = (v: any) => {
            const s = String(v ?? '').trim();
            return s ? s : null;
          };

          const detailsPayload: any = {
            supplier_id: formData.supplier_id ? String(formData.supplier_id) : null,
            palette_category: strOrNull(stockRefCompany.palette_category || formData.category),
            // Prefer selected magasin name stored in formData.entrepot; fall back to stockRefCompany
            entrepot: strOrNull(formData.entrepot || stockRefCompany.entrepot),
            matricule: strOrNull(stockRefCompany.matricule),
            // Ensure we always send ISO date only (YYYY-MM-DD) so DB parses consistently
            date_chargement: stockRefCompany.date_chargement ? String(stockRefCompany.date_chargement).slice(0, 10) : null,
            date_dechargement: stockRefCompany.date_dechargement ? String(stockRefCompany.date_dechargement).slice(0, 10) : null,
            frais_maritime: numOrNull(stockRefCompany.frais_maritime || formData.purchase_price),
            frais_transit: numOrNull(stockRefCompany.frais_transit || formData.sale_price),
            onssa: numOrNull(stockRefCompany.onssa),
            frais_divers: numOrNull(stockRefCompany.frais_divers),
            frais_transport: numOrNull(stockRefCompany.frais_transport),
            magasinage: numOrNull(stockRefCompany.magasinage),
            taxe: numOrNull(stockRefCompany.taxe),
          };

          const detailsResp = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/stock-reference-details/${encodeURIComponent(allocatedStockReference)}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify(detailsPayload),
            }
          );

          if (!detailsResp.ok) {
            const txt = await detailsResp.text().catch(() => '');
            console.warn('[ProductsModule] stock-reference-details PUT not ok:', detailsResp.status, txt);
          } else {
            const saved = await detailsResp.json().catch(() => ({}));
            console.log('[ProductsModule] stock-reference-details saved:', saved?.details || saved);
          }
        } catch (e) {
          console.warn('[ProductsModule] Could not upsert stock reference details:', e);
          // Do not block stock creation if details fail to save.
        }

        // Admin can optionally select a magasin (entrepot) to add stock on its behalf.
        // Non-admin must always add stock to their own magasin.
        const targetStoreId = (effectiveUserRole === 'admin')
          ? (selectedEntrepotStoreId || null)
          : (effectiveUserStoreId || null);

        if (effectiveUserRole === 'admin' && !targetStoreId) {
          toast.error('Veuillez sélectionner un magasin (Entrepôt)');
          setLoading(false);
          return;
        }

        for (const article of validArticles) {
          const payload: any = { ...formData };
          
          // Add stock reference to payload
          payload.stock_reference = allocatedStockReference;
          
          // Add custom operation date if provided
          if (operationDate) {
            payload.operation_date = operationDate;
          }
          
          if (article.reference) payload.reference = article.reference;
          if (article.name) payload.name = article.name;
          // IMPORTANT:
          // - article.category is used as "Caisse" (stock) in the facture table (numeric)
          // - product category text is stored in article.product_category
          if (!payload.category && article.product_category) payload.category = article.product_category;
          if (!payload.purchase_price && article.purchase_price) {
            const pp = Number(article.purchase_price);
            if (!isNaN(pp)) payload.purchase_price = pp;
          }
          
          // UI column order was confusing. We use:
          // - `article.category` = Caisse (stock)
          // - `article.number_of_boxes` = Quantité
          // Stock must always come from Caisse.
          // IMPORTANT: preserve decimals for Caisse/Quantité.
          // These fields are stored as numeric in DB.
          const caisse = Number(String(article.category ?? '').replace(',', '.'));
          if (!isNaN(caisse) && caisse > 0) {
            payload.quantity_available = caisse;
          }

          const nb = Number(String(article.number_of_boxes ?? '').replace(',', '.'));
          if (!isNaN(nb)) payload.number_of_boxes = nb;

          // Do NOT write avg_net_weight_per_box from these columns.
          
          // Persist lot field from the table
          if (article.lot) payload.lot = article.lot;
          
          // Persist fourchette min and max from the table (keep as decimal)
          if (article.fourchette_min !== '' && article.fourchette_min !== undefined) {
            const min = parseFloat(String(article.fourchette_min));
            if (!isNaN(min)) payload.fourchette_min = min;
          }
          if (article.fourchette_max !== '' && article.fourchette_max !== undefined) {
            const max = parseFloat(String(article.fourchette_max));
            if (!isNaN(max)) payload.fourchette_max = max;
          }

          // Add van delivery attachment only to the first product
          if (successCount === 0 && vanDeliveryBase64) {
            payload.van_delivery_attachment_url = vanDeliveryBase64;
            payload.van_delivery_attachment_type = formData.van_delivery_attachment_type;
            payload.van_delivery_notes = formData.van_delivery_notes;
          }

          // CHECK IF PRODUCT WITH SAME REFERENCE ALREADY EXISTS (same magasin)
          // IMPORTANT: products are store-specific in DB (unique per store + reference).
          // When adding a product that already exists for the same magasin, we must UPDATE that row,
          // not create a duplicate. `products` rows can have reference values with different casing/spaces,
          // so normalize before matching.
          const norm = (v: any) => String(v ?? '').trim().toLowerCase();
          const existingProduct = products.find(p =>
            norm(p.reference) === norm(article.reference) &&
            (!targetStoreId || String(p.store_id) === String(targetStoreId))
          );
          
          if (existingProduct) {
            // UPDATE existing product - ADD to quantity instead of replacing
            // FIX: existingProduct.quantity_available can be a grouped/merged total.
            // Use the store-specific quantity from store_stocks[targetStoreId].
            // IMPORTANT: existingProduct comes from `products` (raw rows), not from groupedProducts.
            // `products` rows do NOT have store_stocks populated reliably.
            // Therefore, read the store-specific qty from the already-grouped row.
            const groupedExisting: any = groupedProducts.find((p: any) => norm(p.reference) === norm(article.reference));

            const storeQty = (groupedExisting?.store_stocks && targetStoreId)
              ? (Number(groupedExisting.store_stocks[String(targetStoreId)]) || 0)
              : 0;

            const addCaisse = caisse;
            // Backend treats `quantity_available` as DELTA to add (CAISSE), not an absolute set.
            const newQuantity = storeQty + addCaisse;

            console.log(
              `Product with reference ${article.reference} already exists. Store qty: ${storeQty}, Adding: ${addCaisse}, New total: ${newQuantity}`
            );

            // Resolve supplier_id for this stock_reference so the PUT request includes it.
            // This keeps product_additions_history attribution correct even if product.supplier_id is stale.
            let resolvedSupplierId: string | null = null;
            try {
              const sr = String(allocatedStockReference || '').trim();
              if (sr) {
                const detailsResp = await fetch(
                  `https://${projectId}.supabase.co/functions/v1/super-handler/stock-reference-details?stock_reference=${encodeURIComponent(sr)}`,
                  {
                    method: 'GET',
                    headers: {
                      'Authorization': `Bearer ${session.access_token}`,
                    },
                  }
                );

                if (detailsResp.ok) {
                  const detailsJson = await detailsResp.json().catch(() => ({}));
                  const sid = detailsJson?.details?.supplier_id;
                  if (sid) resolvedSupplierId = String(sid).trim();
                }
              }
            } catch (e) {
              console.warn('[ProductsModule] Failed to resolve supplier_id for PUT from stock-reference-details:', e);
            }

            const updateResponse = await fetch(
              `https://${projectId}.supabase.co/functions/v1/super-handler/products/${existingProduct.id}`,
              {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                  // In this app, "stock" is the CAISSE amount.
                  // Backend treats quantity_available as DELTA to add.
                  quantity_available: addCaisse,

                  // Quantité (UI column) must also accumulate when adding stock to an existing product.
                  // Backend now treats this as a DELTA to add to products.number_of_boxes.
                  number_of_boxes: payload.number_of_boxes,

                  // IMPORTANT: when restocking an existing product from "➕ Ajouter un produit",
                  // we must also update the purchase_price if the user entered a new unit price.
                  // Otherwise the backend keeps the original purchase_price.
                  purchase_price: payload.purchase_price,

                  // Keep lot reference visible when restocking an existing product.
                  // Without this, older backend versions could overwrite it with null.
                  stock_reference: allocatedStockReference,

                  // Backend needs store_id to update the correct store_stocks row
                  store_id: targetStoreId,

                  // Include supplier_id when possible (resolved from stock_reference_details)
                  ...(resolvedSupplierId ? { supplier_id: resolvedSupplierId } : {}),

                  // Include custom operation date if provided (for product_additions_history)
                  ...(operationDate ? { operation_date: operationDate } : {}),
                }),
              }
            );

            if (updateResponse.ok) {
              successCount++;
              const quantity = Number(article.number_of_boxes) || 0;
              const price = Number(article.purchase_price) || 0;
              totalAmount += (quantity * price);
              console.log(`Article ${article.name || article.reference} updated with new quantity: ${newQuantity}`);
              toast.success(`✓ ${article.name || article.reference}: Stock (Caisse) +${addCaisse}`);
            } else {
              const error = await updateResponse.json();
              console.error(`Erreur pour l'article ${article.name || article.reference}:`, error);
              toast.error(`Erreur pour ${article.name || article.reference}: ${error.error || 'Erreur inconnue'}`);
            }
          } else {
            // CREATE new product only if it doesn't exist for this magasin.
            // Send store_id so backend can create store_stocks for the selected magasin.
            if (targetStoreId) payload.store_id = targetStoreId;

            // Safety: prevent accidental duplicates created by mismatched client-side matching.
            // If backend enforces uniqueness, it will error; if not, this client-side guard still helps.
            // (We already checked `existingProduct`, but keep this here as a readable invariant.)
            if (!payload.reference || !String(payload.reference).trim()) {
              toast.error(`Référence manquante pour ${article.name || 'article'}`);
              continue;
            }

            const response = await fetch(
              `https://${projectId}.supabase.co/functions/v1/super-handler/products`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify(payload),
              }
            );

            if (response.ok) {
              successCount++;
              const quantity = Number(article.number_of_boxes) || 0;
              const price = Number(article.purchase_price) || 0;
              totalAmount += (quantity * price);
              console.log(`Article ${successCount}: ${article.name || article.reference} créé avec succès`);
              toast.success(`✓ ${article.name || article.reference}: Produit créé avec quantité ${caisse}`);
            } else {
              const error = await response.json();
              console.error(`Erreur pour l'article ${article.name || article.reference}:`, error);
              toast.error(`Erreur pour ${article.name || article.reference}: ${error.error || 'Erreur inconnue'}`);
            }
          }
        }

        // Include company-level fees in total for supplier balance
        const fraisMaritime = Number(formData.purchase_price) || 0;
        const fraisTransit = Number(formData.sale_price) || 0;
        totalAmount += fraisMaritime + fraisTransit;

        // Update supplier balance / admin supplier ledger
        if (successCount > 0 && formData.supplier_id && totalAmount > 0) {
          const currentSupplier = suppliers.find(s => s.id === formData.supplier_id);
          const isAdminSupplier = !!currentSupplier?.admin_user_id || !!currentSupplier?.__isAdminSupplier;

          if (isAdminSupplier) {
            // For "Fournisseur Admin": do NOT update suppliers.balance.
            // Instead create an accrual event that Fournisseur Admin (Total Facture) reads (TRANSFER-ADMIN-* sales)
            // via the backend endpoint that creates both the sales row and metadata.

            // Determine target store (magasin that owes):
            // - admin user can pick selectedEntrepotStoreId
            // - manager uses their own store
            const targetStoreId = (effectiveUserRole === 'admin')
              ? (selectedEntrepotStoreId || null)
              : (effectiveUserStoreId || null);

            if (!targetStoreId) {
              toast.warning(`${successCount} produit(s) ajouté(s) mais aucun magasin cible pour la facture admin.`);
            } else {
              const adminUserId = String(currentSupplier.admin_user_id || '').trim();
              if (!adminUserId) {
                toast.warning(`${successCount} produit(s) ajouté(s) mais admin_user_id manquant sur le fournisseur admin.`);
              } else {
                const invResp = await fetch(
                  `https://${projectId}.supabase.co/functions/v1/super-handler/admin-supplier-invoices`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                      admin_user_id: adminUserId,
                      store_id: targetStoreId,
                      stock_reference: allocatedStockReference,
                      total_amount: totalAmount,
                      notes: `Auto from ➕ Ajouter un produit (${allocatedStockReference})`,
                    }),
                  }
                );

                if (invResp.ok) {
                  toast.success(`${successCount} produit(s) ajouté(s) et Total Facturé (Fournisseur Admin) mis à jour (+${totalAmount.toFixed(2)} MAD)`);
                } else {
                  const errTxt = await invResp.text();
                  console.warn('admin-supplier-invoices not ok:', invResp.status, errTxt);
                  toast.warning(`${successCount} produit(s) ajouté(s) mais erreur lors de la mise à jour (Fournisseur Admin)`);
                }
              }
            }
          } else {
            // Normal supplier => update suppliers.balance
            const newBalance = (currentSupplier?.balance || 0) + totalAmount;

            const updateSupplierResponse = await fetch(
              `https://${projectId}.supabase.co/functions/v1/super-handler/suppliers/${formData.supplier_id}`,
              {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                  balance: newBalance,
                }),
              }
            );

            if (updateSupplierResponse.ok) {
              toast.success(`${successCount} produit(s) ajouté(s) et Total Facturé du fournisseur mis à jour (+${totalAmount.toFixed(2)} MAD)`);
              fetchSuppliers();
            } else {
              toast.warning(`${successCount} produit(s) ajouté(s) mais erreur lors de la mise à jour du solde fournisseur`);
            }
          }
        } else if (successCount > 0) {
          toast.success(`${successCount} produit(s) ajouté(s) avec succès`);
        }

        if (successCount > 0) {
          setDialogOpen(false);
          setShowAddProductPage(false);
          resetForm();
          fetchProducts();
          fetchSuppliers();
        }
      } else {
        // Editing a single product (ADMIN ONLY)
        // IMPORTANT: the table is grouped by reference, so `editingProduct.id` may not be a real row.
        // We compute and store the concrete row id in `editingProductRowId`.
        if (!editingProductRowId) {
          throw new Error('Impossible de modifier: ligne produit introuvable (id manquant).');
        }

        const url = `https://${projectId}.supabase.co/functions/v1/super-handler/products/${editingProductRowId}`;

        // Send a full update payload.
        // IMPORTANT: backend update logic is coupled to stock updates too.
        // The simplest reliable behaviour is: send all editable fields including stock numbers.
        // (If later we want "metadata-only" edits, the backend needs a dedicated endpoint.)
        const payload: any = {
          name: formData.name,
          reference: formData.reference,
          supplier_id: formData.supplier_id || null,
          category: formData.category,

          // STOCK / QUANTITIES
          // In this UI:
          //  - quantity_available = Caisse
          //  - number_of_boxes    = Quantité
          quantity_available: formData.quantity_available === '' ? 0 : Number(String(formData.quantity_available).replace(',', '.')),
          number_of_boxes: formData.number_of_boxes === '' ? 0 : Number(String(formData.number_of_boxes).replace(',', '.')),

          // PRICES
          purchase_price: formData.purchase_price === '' ? 0 : Number(String(formData.purchase_price).replace(',', '.')),
          sale_price: formData.sale_price === '' ? 0 : Number(String(formData.sale_price).replace(',', '.')),

          // OTHER FIELDS
          total_net_weight: formData.total_net_weight === '' ? 0 : Number(String(formData.total_net_weight).replace(',', '.')),
          avg_net_weight_per_box: formData.avg_net_weight_per_box === '' ? 0 : Number(String(formData.avg_net_weight_per_box).replace(',', '.')),
          max_purchase_limit: formData.max_purchase_limit === '' ? null : Number(String(formData.max_purchase_limit).replace(',', '.')),

          van_delivery_attachment_type: formData.van_delivery_attachment_type || null,
          van_delivery_notes: formData.van_delivery_notes || null,
          entrepot: formData.entrepot || null,

          // Needed so backend can also SET the correct store_stocks row (stock in UI comes from store_stocks).
          // Prefer: admin-selected magasin filter. Fallback: resolved row store_id.
          store_id: (String(effectiveUserRole || '').toLowerCase() === 'admin' && storeFilter !== 'all')
            ? String(storeFilter)
            : (products.find((p: any) => String(p.id) === String(editingProductRowId))?.store_id || null),
        };

        // Convert van delivery file to base64 if selected
        if (vanDeliveryFile) {
          try {
            const base64String = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                resolve(reader.result as string);
              };
              reader.onerror = () => {
                reject(new Error('Failed to read file'));
              };
              reader.readAsDataURL(vanDeliveryFile);
            });
            
            payload.van_delivery_attachment_url = base64String;
            console.log('File converted to base64 successfully');
          } catch (fileError) {
            console.warn('File conversion error:', fileError);
          }
        }

        // IMPORTANT: In the current UI, the admin edits "Caisse/Quantité/Prix" inside the facture-like table
        // (articles state). That data is not automatically mirrored into formData.
        // To avoid sending wrong values (e.g., user types 333 but API receives 21), we override the payload
        // from the first article row when in edit mode.
        const firstArticle = articles?.[0];
        if (editingProduct && firstArticle) {
          const caisse = Number(String(firstArticle.category ?? '').replace(',', '.'));
          if (Number.isFinite(caisse)) payload.quantity_available = caisse;

          const nb = Number(String(firstArticle.number_of_boxes ?? '').replace(',', '.'));
          if (Number.isFinite(nb)) payload.number_of_boxes = nb;

          const pp = Number(String(firstArticle.purchase_price ?? '').replace(',', '.'));
          if (Number.isFinite(pp)) payload.purchase_price = pp;
        }

        if (!payload.name) {
          delete payload.name;
        }

        const response = await fetch(url, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          toast.success(editingProduct ? 'Produit modifié' : 'Produit ajouté');
          setDialogOpen(false);
          setShowAddProductPage(false);
          resetForm();
          fetchProducts();
          fetchSuppliers();
        } else {
          const error = await response.json();
          toast.error(error.error || 'Erreur');
        }
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    // UI hard guard (backend/RLS must also enforce). Only admin can delete.
    if (!canDeleteProduct) {
      toast.error("Accès refusé: seuls les administrateurs peuvent supprimer un produit");
      return;
    }

    if (!confirm('Êtes-vous sûr de vouloir supprimer ce produit?')) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/products/${id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        toast.success('Produit supprimé');
        fetchProducts();
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      reference: '',
      quantity_available: '' as string | number,
      purchase_price: '' as string | number,
      sale_price: '' as string | number,
      supplier_id: '',
      category: '',
      number_of_boxes: '' as string | number,
      total_net_weight: '' as string | number,
      avg_net_weight_per_box: '' as string | number,
      max_purchase_limit: '' as string | number,
      van_delivery_attachment_url: '',
      van_delivery_attachment_type: '',
      van_delivery_notes: '',
      entrepot: '',
    });

    setStockRefCompany({
      palette_category: '',
      entrepot: '',
      matricule: '',
      date_chargement: '',
      date_dechargement: '',
      frais_maritime: '' as string | number,
      frais_transit: '' as string | number,
      onssa: '' as string | number,
      frais_divers: '' as string | number,
      frais_transport: '' as string | number,
      magasinage: '' as string | number,
      taxe: '' as string | number,
    });

    // Clear facture table rows
    setArticles([
      {
        id: 1,
        reference: '',
        name: '',
        category: '', // Caisse
        product_category: '', // Product category text
        number_of_boxes: '', // Quantité
        avg_net_weight_per_box: '',
        purchase_price: '',
        max_purchase_limit: '',
        lot: '',
        fourchette_min: '',
        fourchette_max: '',
      },
    ]);

    // Clear supplier selection/search input
    setSupplierSearch('');

    // Clear other transient UI state that can keep old values visible
    setVanDeliveryFile(null);
    setReferenceSearch('');
    setReferenceSuggestions([]);
    setTemplateSuggestions({});
    setActiveArticleId(null);
    setProductDuplicateReference(false);

    setEditingProduct(null);
    setEditingProductRowId(null);
    setSelectedEntrepotStoreId(null);
    setOperationDate('');
  };

  const handleEdit = (product: any) => {
    if (!canEditProduct) {
      toast.error("Vous n'avez pas la permission « Modifier un Produit »");
      return;
    }

    // We show a grouped row in the table. Resolve it to a concrete DB row id:
    // - Prefer the row that matches the currently filtered magasin when admin is filtering.
    // - Otherwise take the first matching reference.
    const ref = String(product?.reference ?? '').trim();
    const targetStoreId = (String(effectiveUserRole || '').toLowerCase() === 'admin' && storeFilter !== 'all')
      ? String(storeFilter)
      : null;

    const row = products.find((p: any) => {
      if (String(p.reference ?? '').trim() !== ref) return false;
      if (targetStoreId) return String(p.store_id ?? '') === targetStoreId;
      return true;
    });

    if (!row?.id) {
      toast.error('Impossible de modifier: produit source introuvable (ligne DB manquante).');
      return;
    }

    setEditingProduct(product);
    setEditingProductRowId(String(row.id));
    setFormData({
      name: product.name || '',
      reference: product.reference || '',
      quantity_available: (product.quantity_available || '') as string | number,
      purchase_price: (product.purchase_price || '') as string | number,
      sale_price: (product.sale_price || '') as string | number,
      supplier_id: product.supplier_id || '',
      category: product.category || '',
      number_of_boxes: (product.number_of_boxes || '') as string | number,
      total_net_weight: (product.total_net_weight || '') as string | number,
      avg_net_weight_per_box: (product.avg_net_weight_per_box || '') as string | number,
      max_purchase_limit: (product.max_purchase_limit || '') as string | number,
      van_delivery_attachment_url: product.van_delivery_attachment_url || '',
      van_delivery_attachment_type: product.van_delivery_attachment_type || '',
      van_delivery_notes: product.van_delivery_notes || '',
      entrepot: product.entrepot || '',
    });
    
    // Set supplier search to show the current supplier name
    if (product.supplier_id) {
      const supplier = suppliers.find(s => s.id === product.supplier_id);
      setSupplierSearch(supplier?.name || '');
    } else {
      setSupplierSearch('');
    }
    
    // Editing should not reuse the "facture/articles" table (it mixes category/caisse and breaks updates).
    // Keep a minimal single-row display but do NOT map product.category into the numeric caisse column.
    setArticles([
      {
        id: 1,
        reference: product.reference || '',
        name: product.name || '',
        category: '',
        product_category: product.category || '',
        number_of_boxes: '',
        avg_net_weight_per_box: '',
        purchase_price: '',
        max_purchase_limit: '',
        lot: product.lot || '',
        fourchette_min: product.fourchette_min || '',
        fourchette_max: product.fourchette_max || '',
      }
    ]);
    setShowAddProductPage(true);
  };

  const calculateAverageWeight = (boxes: number | string, totalWeight: number | string) => {
    const boxesNum = typeof boxes === 'string' ? (boxes ? Number(boxes) : 0) : boxes;
    const weightNum = typeof totalWeight === 'string' ? (totalWeight ? Number(totalWeight) : 0) : totalWeight;
    if (boxesNum > 0 && weightNum > 0) {
      return Number((weightNum / boxesNum).toFixed(2));
    }
    return '';
  };

  const handleWeightChange = (field: 'number_of_boxes' | 'total_net_weight', value: number | string) => {
    const updated = { ...formData, [field]: value };
    updated.avg_net_weight_per_box = calculateAverageWeight(updated.number_of_boxes, updated.total_net_weight);
    setFormData(updated);
  };

  // View Details function
  const handleViewDetails = (product: any) => {
    setSelectedProductForDetails(product);
    setShowDetailsPage(true);
  };

  // Get supplier name from supplier_id
  const getSupplierName = (supplierId: string | null) => {
    if (!supplierId) return 'Non spécifié';
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier?.name || supplierId;
  };

  // Get supplier details
  const getSupplierDetails = (supplierId: string | null) => {
    if (!supplierId) return null;
    return suppliers.find(s => s.id === supplierId);
  };

  // Group products by reference - merge same references into one row
  const groupedProducts = products.reduce((acc: any[], product: any) => {
    const existing = acc.find((p: any) => p.reference === product.reference);

    if (existing) {
      // Merge store_stocks from both products
      const mergedStocks = { ...existing.store_stocks };
      if (product.store_stocks) {
        Object.entries(product.store_stocks).forEach(([storeId, quantity]: [string, any]) => {
          mergedStocks[storeId] = (mergedStocks[storeId] || 0) + quantity;
        });
      }
      existing.store_stocks = mergedStocks;

      // Keep the *latest* stock_reference visible in the grouped row.
      // When adding new stock for the same reference, we want the new stock_reference
      // to be shown instead of disappearing (showing '-').
      if (product.stock_reference) {
        existing.stock_reference = product.stock_reference;
      }

      // Recalculate total - DO NOT use quantity_available, only use store_stocks
      existing.total_store_stock = Object.values(mergedStocks).reduce((sum: number, qty: any) => sum + qty, 0);
      // Update quantity_available to match the total available stock
      existing.quantity_available = existing.total_store_stock;
    } else {
      // First product with this reference
      acc.push({
        ...product,
        total_store_stock: product.total_store_stock || 0,
        // Prefer store_stocks total if present; otherwise use quantity_available.
        quantity_available: (product.total_store_stock ?? 0) > 0 ? product.total_store_stock : product.quantity_available,
      });
    }
    return acc;
  }, []);

  const filteredProducts = groupedProducts.filter(product => {
    // Search filter
    const searchLower = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !searchLower || // If no search term, match all
      product.name?.toLowerCase().includes(searchLower) ||
      product.reference?.toLowerCase().includes(searchLower) ||
      product.stock_reference?.toLowerCase().includes(searchLower) ||
      product.sku?.toLowerCase().includes(searchLower) ||
      product.lot?.toLowerCase().includes(searchLower) ||
      product.category?.toLowerCase().includes(searchLower);

    // Store visibility:
    // - Admin: see all magasins (no filter)
    // - Non-admin with assigned store_id: see only their magasin stock
    // - Non-admin without store_id: fallback to old behavior (no extra filter)
    // IMPORTANT: Check both store_stocks AND product.store_id for reliability.
    // Some products may have store_id set but missing store_stocks entry due to race conditions.
    const matchesStoreVisibility =
      effectiveUserRole === 'admin'
        ? true
        : effectiveUserStoreId
          ? (!!product?.store_stocks && Object.prototype.hasOwnProperty.call(product.store_stocks, String(effectiveUserStoreId))) ||
            String(product?.store_id) === String(effectiveUserStoreId)
          : true;

    // Admin-only store filter (magasin)
    // IMPORTANT: Must check BOTH store_id AND store_stocks because:
    // 1. Products are grouped by reference, and store_id keeps the first product's value
    // 2. But store_stocks is merged, so a product might have stock in the filtered store
    //    even if store_id doesn't match
    const matchesStoreFilter =
      effectiveUserRole !== 'admin'
        ? true
        : (storeFilter === 'all'
            ? true
            : (String(product?.store_id) === String(storeFilter) ||
               (product?.store_stocks && Object.prototype.hasOwnProperty.call(product.store_stocks, String(storeFilter)))));

    // Creator filter - if created_by is null/undefined, show it for all users
    const matchesCreator =
      createdByFilter === 'all' ||
      product.created_by === createdByFilter ||
      !product.created_by; // Show products without creator info to all users

    // Stock Partagé - Échange Inter-Magasins (store-specific stock == 0 / != 0)
    // This filter is meant to apply to the per-magasin stock columns.
    // Determine the effective qty for the current view (user store or admin-selected store).
    const roleLower = String(effectiveUserRole || 'user').toLowerCase();
    const isAdminRole = roleLower === 'admin';
    const qty = (() => {
      if (product?.store_stocks) {
        if (!isAdminRole && effectiveUserStoreId) {
          return Number(product.store_stocks[String(effectiveUserStoreId)] ?? 0) || 0;
        }
        if (isAdminRole && storeFilter !== 'all') {
          return Number(product.store_stocks[String(storeFilter)] ?? 0) || 0;
        }
        if (isAdminRole && storeFilter === 'all') {
          // When viewing all stores, use the sum of all store stocks
          const sum = Object.values(product.store_stocks).reduce((acc: number, val: any) => {
            return acc + (Number(val) || 0);
          }, 0);
          return sum;
        }
      }
      return Number(product.quantity_available ?? 0) || 0;
    })();

    // If both are checked, show all.
    const matchesZeroToggle =
      sharedStockOnlyZero && !sharedStockOnlyNonZero ? qty === 0 :
      sharedStockOnlyNonZero && !sharedStockOnlyZero ? qty !== 0 :
      true;

    return matchesSearch && matchesCreator && matchesStoreVisibility && matchesStoreFilter && matchesZeroToggle;
  });

  // Total movements for each product from:
  // - Factures (invoices)
  // - Ventes (sales)
  // - Transferts & Achats (stored as sales records with sale_number prefix)
  // NOTE: CreatePurchaseModule writes transfers/purchases into `sales` + `sale_items`.
  const calculateProductStats = (productId: string, productName: string) => {
    let totalSales = 0;

    const normalize = (v: any) => String(v ?? '').trim().toLowerCase();

    const productRef = (groupedProducts.find(p => p.id === productId)?.reference) || '';

    // Sales visibility rule (requested):
    // - Admin: sees sum across ALL sales (all accounts)
    // - Manager/User: sees ONLY their own sales for their store
    // - If admin acted as a store ("pretending"), those sales must count for that store (handled by store_id check).
    const roleLower = String(effectiveUserRole || 'user').toLowerCase();
    const canSeeAllSales = roleLower === 'admin';
    const myStoreId = effectiveUserStoreId ? String(effectiveUserStoreId) : null;

    const saleIsVisible = (sale: any) => {
      if (canSeeAllSales) return true;
      if (!myStoreId) return false;

      const storeId = sale?.store_id ? String(sale.store_id) : null;
      const actedAsStoreId = sale?.acted_as_store_id ? String(sale.acted_as_store_id) : null;

      // Count sales that belong to my store, including "admin acted as" rows.
      return storeId === myStoreId || actedAsStoreId === myStoreId;
    };

    const itemMatchesProduct = (item: any) => {
      if (!item) return false;

      // Prefer matching by product_id
      if (item.product_id && item.product_id === productId) return true;

      // Fallback matching by reference/name-like fields (legacy data)
      const candidates = [
        item.reference,
        item.description,
        item.name,
        item.product_name,
      ].filter(Boolean).map(normalize);

      if (productName && candidates.includes(normalize(productName))) return true;
      if (productRef && candidates.includes(normalize(productRef))) return true;

      return false;
    };

    const sumItems = (items: any[]) => {
      items.forEach((item: any) => {
        if (!itemMatchesProduct(item)) return;

        // Use `quantity` for Ventes Totales, NOT `caisse`.
        // `caisse` represents stock being moved and should NOT affect Ventes Totales.
        // `quantity` represents the actual quantity sold.
        const qty = Number(item.quantity ?? 0);
        if (!qty) return;

        totalSales += qty;
      });
    };

    // Factures
    if (allInvoices && allInvoices.length > 0) {
      allInvoices.forEach((invoice: any) => {
        // Invoice visibility should follow the same rule.
        if (!saleIsVisible(invoice)) return;

        const invoiceItems = (invoice.items && Array.isArray(invoice.items)) ? invoice.items : [];
        if (invoiceItems.length > 0) sumItems(invoiceItems);
      });
    }

    // Ventes + Achats + Transferts (all come from /sales endpoint)
    if (allSales && allSales.length > 0) {
      allSales.forEach((sale: any) => {
        if (!saleIsVisible(sale)) return;

        // Sales can come with either sale_items (normalized) OR items (JSONB)
        const itemsSource = (sale.sale_items && Array.isArray(sale.sale_items) && sale.sale_items.length > 0)
          ? sale.sale_items
          : ((sale.items && Array.isArray(sale.items)) ? sale.items : []);

        if (itemsSource.length > 0) sumItems(itemsSource);
      });
    }

    return {
      totalSales,
    };
  };

  const visibleProducts = (effectiveUserRole !== 'admin' && effectiveUserStoreId)
    ? filteredProducts.map((p: any) => {
        // Priority for quantity:
        // 1. store_stocks[user's store] if it exists and has a value
        // 2. product.quantity_available if store_stocks is empty or zero (fallback for reliability)
        // 3. 0 as last resort
        const storeStockQty = p?.store_stocks ? (p.store_stocks[String(effectiveUserStoreId)] ?? null) : null;
        const productQty = p?.quantity_available ?? 0;
        
        // Use store_stocks if it has a valid entry, otherwise fall back to product.quantity_available
        const qty = (storeStockQty !== null && storeStockQty !== undefined && storeStockQty > 0)
          ? storeStockQty
          : productQty;
        
        return {
          ...p,
          // For magasin views, treat quantity_available as the store-specific quantity
          quantity_available: qty,
          total_store_stock: qty,
        };
      })
    : (effectiveUserRole === 'admin' && storeFilter !== 'all')
      ? filteredProducts.map((p: any) => {
          // When admin filters by magasin, the export/summary must use that magasin quantity,
          // NOT the global total across all magasins.
          // Priority: store_stocks > quantity_available
          const storeStockQty = p?.store_stocks ? (p.store_stocks[String(storeFilter)] ?? null) : null;
          const productQty = p?.quantity_available ?? 0;
          const qty = (storeStockQty !== null && storeStockQty !== undefined && storeStockQty > 0)
            ? storeStockQty
            : productQty;
          return {
            ...p,
            quantity_available: qty,
            total_store_stock: qty,
          };
        })
      : filteredProducts;

  const sortedProducts = (() => {
    if (!sortConfig.key) return visibleProducts;

    const dir = sortConfig.direction === 'asc' ? 1 : -1;

    // Numeric sort for Ventes Totales
    if (sortConfig.key === 'total_sales') {
      return [...visibleProducts].sort((a: any, b: any) => {
        const aSales = Number(calculateProductStats(a.id, a.name).totalSales ?? 0);
        const bSales = Number(calculateProductStats(b.id, b.name).totalSales ?? 0);
        return (aSales - bSales) * dir;
      });
    }

    // String sort for other columns
    const getVal = (p: any) => {
      if (sortConfig.key === 'stock_reference') return String(p?.stock_reference ?? '');
      if (sortConfig.key === 'reference') return String(p?.reference ?? '');
      if (sortConfig.key === 'name') return String(p?.name ?? '');
      return '';
    };

    return [...visibleProducts].sort((a: any, b: any) => {
      const av = getVal(a).toLowerCase();
      const bv = getVal(b).toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  })();

  // Paginated products (display only first `displayLimit` items)
  const paginatedProducts = sortedProducts.slice(0, displayLimit);

  // Columns to render for per-magasin stock.
  // - Admin: show all magasins from the stores list
  // - Non-admin with assigned store: show only that magasin
  const stockStores = (effectiveUserRole !== 'admin' && effectiveUserStoreId)
    ? stores.filter((s: any) => String(s.id) === String(effectiveUserStoreId))
    : (effectiveUserRole === 'admin' && storeFilter !== 'all')
      ? stores.filter((s: any) => String(s.id) === String(storeFilter))
      : stores;

  // DEBUG: inspect what columns will render
  useEffect(() => {
    console.log('[ProductsModule] computed stockStores:', {
      effectiveUserRole,
      effectiveUserStoreId,
      storesCount: stores.length,
      allStoreNames: stores.map((s: any) => s.name),
      stockStoresCount: stockStores.length,
      stockStoreNames: stockStores.map((s: any) => s.name),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserRole, effectiveUserStoreId, stores.length]);

  const lowStockProducts = sortedProducts.filter((p: any) => p.quantity_available < 10);
  const totalValue = sortedProducts.reduce((sum: number, p: any) => sum + (p.quantity_available * p.purchase_price), 0);
  const totalItems = sortedProducts.reduce((sum: number, p: any) => sum + p.quantity_available, 0);

  // Helper function to get the correct quantity for export (store-specific or global)
  const getExportQuantity = (product: any): number => {
    // Determine the effective store context for the export
    const isAdminRole = String(effectiveUserRole || 'user').toLowerCase() === 'admin';
    
    // If admin with a specific store filtered
    if (isAdminRole && storeFilter !== 'all' && product.store_stocks) {
      const storeSpecificQty = product.store_stocks[String(storeFilter)];
      if (storeSpecificQty !== undefined && storeSpecificQty !== null) {
        return Number(storeSpecificQty);
      }
    }
    
    // If admin viewing all stores, sum all store stocks
    if (isAdminRole && storeFilter === 'all' && product.store_stocks) {
      const sum = Object.values(product.store_stocks).reduce((acc: number, val: any) => {
        return acc + (Number(val) || 0);
      }, 0);
      return sum;
    }
    
    // If non-admin with a store assigned, use store-specific quantity
    if (!isAdminRole && effectiveUserStoreId && product.store_stocks) {
      const storeSpecificQty = product.store_stocks[String(effectiveUserStoreId)];
      if (storeSpecificQty !== undefined && storeSpecificQty !== null) {
        return Number(storeSpecificQty);
      }
    }
    
    // Fallback to global quantity
    return Number(product.quantity_available ?? 0);
  };

  const handleExportExcel = () => {
    try {
      if (selectedProducts.size === 0) {
        toast.error('Veuillez sélectionner au moins un produit');
        return;
      }

      const selectedProductsList = sortedProducts.filter((p) => selectedProducts.has(p.id));

      // Match the PDF layout: 2 products per row, each cell contains name/ref + optional quantity line
      const excelRows: { produit1: string; produit2: string }[] = [];

      for (let i = 0; i < selectedProductsList.length; i += 2) {
        const p1 = selectedProductsList[i];
        const p2 = selectedProductsList[i + 1];

        const formatCell = (p: any) => {
          if (!p) return '';

          const label = pdfExportOptions.includeNames
            ? (p.name || p.reference || 'N/A')
            : (p.reference || p.name || 'N/A');

          const base = String(label);

          // Get the correct quantity (store-specific or global)
          const qty = getExportQuantity(p);

          // If name/ref is disabled, allow "quantity only" export
          if (!pdfExportOptions.includeNames) {
            return pdfExportOptions.includeQuantities ? `Qté: ${qty}` : '';
          }

          // Name/ref enabled
          if (!pdfExportOptions.includeQuantities) return base;
          return `${base}\nQté: ${qty}`;
        };

        excelRows.push({
          produit1: formatCell(p1),
          produit2: formatCell(p2),
        });
      }

      const storeLabel = (effectiveUserRole === 'admin')
        ? (storeFilter === 'all' ? 'tous-magasins' : (stores.find((s: any) => String(s.id) === String(storeFilter))?.name || String(storeFilter)))
        : (stores.find((s: any) => String(s.id) === String(effectiveUserStoreId))?.name || 'magasin');

      const safeStoreLabel = String(storeLabel)
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-]/g, '')
        .slice(0, 40);

      const datePart = new Date().toISOString().split('T')[0];

      const columns: TableColumn<{ produit1: string; produit2: string }>[] = [
        { header: 'Produit 1', accessor: (r) => r.produit1 },
        { header: 'Produit 2', accessor: (r) => r.produit2 },
      ];

      exportToExcelHtml(excelRows, columns, `produits_${safeStoreLabel}_${datePart}.xls`);
      toast.success(`Excel exporté avec ${selectedProductsList.length} produit(s)`);
    } catch (error) {
      console.error('Error exporting Excel:', error);
      toast.error("Erreur lors de l'export Excel");
    }
  };

  // PDF Export function
  const handleExportPDF = () => {
    try {
      if (selectedProducts.size === 0) {
        toast.error('Veuillez sélectionner au moins un produit');
        return;
      }

      const doc = new jsPDF();
      const selectedProductsList = sortedProducts.filter(p => selectedProducts.has(p.id));
      
      // Add title
      doc.setFontSize(16);
      doc.text('Liste des Produits', 14, 15);
      
      // Add date
      doc.setFontSize(10);
      doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 14, 25);
      
      // Prepare table data - 4 columns layout
      const tableData: any[] = [];
      
      for (let i = 0; i < selectedProductsList.length; i += 2) {
        const row: any[] = [];
        
        // First product in row
        const product1 = selectedProductsList[i];
        let cell1 = product1.name || product1.reference || 'N/A';
        if (pdfExportOptions.includeQuantities) {
          const qty1 = getExportQuantity(product1);
          cell1 += `\nQté: ${qty1}`;
        }
        row.push(cell1);
        
        // Second product in row (if exists)
        if (i + 1 < selectedProductsList.length) {
          const product2 = selectedProductsList[i + 1];
          let cell2 = product2.name || product2.reference || 'N/A';
          if (pdfExportOptions.includeQuantities) {
            const qty2 = getExportQuantity(product2);
            cell2 += `\nQté: ${qty2}`;
          }
          row.push(cell2);
        } else {
          row.push('');
        }
        
        tableData.push(row);
      }
      
      // Add table with 2 columns (will display as 4 columns with proper width)
      if ((doc as any).autoTable) {
        (doc as any).autoTable({
          head: [['Produit 1', 'Produit 2']],
          body: tableData,
          startY: 35,
          margin: { left: 10, right: 10 },
          columnStyles: {
            0: { cellWidth: 90 },
            1: { cellWidth: 90 }
          },
          bodyStyles: {
            fontSize: 11,
            cellPadding: 8,
            lineColor: [200, 200, 200],
            lineWidth: 0.5
          },
          headStyles: {
            fillColor: [41, 128, 185],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 12
          }
        });
      } else {
        // Fallback if autoTable is not available
        console.warn('autoTable not available, using basic table');
        let yPosition = 35;
        
        // Draw header
        doc.setFillColor(41, 128, 185);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12);
        doc.rect(10, yPosition, 90, 10, 'F');
        doc.text('Produit 1', 15, yPosition + 7);
        doc.rect(100, yPosition, 90, 10, 'F');
        doc.text('Produit 2', 105, yPosition + 7);
        yPosition += 10;
        
        // Draw rows
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(11);
        tableData.forEach((row) => {
          const maxHeight = 20;
          doc.rect(10, yPosition, 90, maxHeight);
          doc.rect(100, yPosition, 90, maxHeight);
          doc.text(row[0] || '', 15, yPosition + 5, { maxWidth: 80 });
          doc.text(row[1] || '', 105, yPosition + 5, { maxWidth: 80 });
          yPosition += maxHeight;
        });
      }
      
      // Save PDF
      // Include magasin context in filename (helps to distinguish admin exports)
      const storeLabel = (effectiveUserRole === 'admin')
        ? (storeFilter === 'all' ? 'tous-magasins' : (stores.find((s: any) => String(s.id) === String(storeFilter))?.name || String(storeFilter)))
        : (stores.find((s: any) => String(s.id) === String(effectiveUserStoreId))?.name || 'magasin');

      const safeStoreLabel = String(storeLabel)
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-]/g, '')
        .slice(0, 40);

      doc.save(`produits_${safeStoreLabel}_${new Date().getTime()}.pdf`);
      toast.success(`PDF exporté avec ${selectedProductsList.length} produit(s)`);
      setShowPdfExportDialog(false);
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Erreur lors de l\'export du PDF');
    }
  };

  // If showing product details page, render full-page details
  if (showDetailsPage && selectedProductForDetails) {
    return (
      <ProductDetailsPage
        product={selectedProductForDetails}
        suppliers={suppliers}
        stores={stores}
        session={session}
        onBack={() => {
          setShowDetailsPage(false);
          setSelectedProductForDetails(null);
        }}
      />
    );
  }

  // Permission helpers
  const roleLower = String(effectiveUserRole || 'user').toLowerCase();
  const isAdmin = roleLower === 'admin';

  // Restrict edit/delete for manager/user.
  // Only admin can modify or delete products.
  const canAddProduct = true;
  const canEditProduct = isAdmin;
  const canDeleteProduct = isAdmin;

  // Product template creation should be admin-only
  const canCreateProductTemplate = isAdmin;

  // If showing add product page, render FactureModule layout
  if (showAddProductPage) {
    // Hard block access even if user somehow triggers the state
    if (!editingProduct && !canAddProduct) {
      return (
        <div className="space-y-6 p-6">
          <Card>
            <CardHeader>
              <CardTitle>Accès refusé</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">Vous n'avez pas la permission « Ajouter un Produit ».</p>
              <div className="mt-4">
                <Button
                  onClick={() => {
                    setShowAddProductPage(false);
                    resetForm();
                  }}
                  style={{ backgroundColor: '#ea580c', color: 'white' }}
                >
                  Retour
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (editingProduct && !canEditProduct) {
      return (
        <div className="space-y-6 p-6">
          <Card>
            <CardHeader>
              <CardTitle>Accès refusé</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">Vous n'avez pas la permission « Modifier un Produit ».</p>
              <div className="mt-4">
                <Button
                  onClick={() => {
                    setShowAddProductPage(false);
                    resetForm();
                  }}
                  style={{ backgroundColor: '#ea580c', color: 'white' }}
                >
                  Retour
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="space-y-6 p-6">
        {/* Header with Buttons - Exact FactureModule Style */}
        <div className="flex flex-row justify-between items-center mb-8 w-full gap-4">
          <h1 className="text-3xl font-bold text-gray-900 flex-1">{editingProduct ? '✏️ Modifier un produit' : '➕ Ajouter un produit'}</h1>
          <div className="flex gap-2">
            <Button 
              onClick={() => {
                setShowAddProductPage(false);
                resetForm();
              }}
              size="lg"
              style={{ backgroundColor: '#ea580c', color: 'white' }}
            >
              Fermer
            </Button>
          </div>
        </div>

        {/* Stock Reference Input */}
        <Card>
          <CardHeader>
            <CardTitle>📦 Référence de Stock</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label>Numéro de Référence de Stock</Label>
            <div className="space-y-2">
              <Input
                type="text"
                value={customStockReference}
                onChange={(e) => setCustomStockReference(e.target.value)}
                placeholder={nextStockReference ? `Auto: ${nextStockReference}` : '(auto)'}
                className="flex-1"
              />
              <p className="text-xs text-gray-500">
                Laissez vide pour utiliser la référence auto-générée.
              </p>
            </div>
            <p className="text-xs text-gray-500">
              {editingProduct 
                ? 'La référence de stock ne peut pas être modifiée après création'
                : 'Prévisualisation: la référence affichée peut changer si un autre utilisateur enregistre avant vous. La référence finale est réservée au moment de l\'enregistrement et sera attribuée à tous les produits de ce lot'}
            </p>
          </CardContent>
        </Card>

        {/* Custom Operation Date Input */}
        <Card>
          <CardHeader>
            <CardTitle>📅 Date de l'Opération</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label>Date personnalisée (optionnel)</Label>
            <div className="space-y-2">
              <Input
                type="date"
                value={operationDate}
                onChange={(e) => setOperationDate(e.target.value)}
                className="flex-1"
              />
              <p className="text-xs text-gray-500">
                Laissez vide pour utiliser la date actuelle. Cette date sera affichée dans l'historique des ajouts de produits.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Full Width - Supplier Information - MOVED TO TOP */}
        <Card>
          <CardHeader>
            <CardTitle>Fournisseur</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label>Sélectionner un fournisseur</Label>
            <div className="flex items-center gap-3">
              <Search className="text-gray-400 w-5 h-5" />
              <div className="relative flex-1">
                <Input
                  type="text"
                  placeholder="Tapez le nom du fournisseur..."
                  value={supplierSearch}
                  onChange={(e) => {
                    setSupplierSearch(e.target.value);
                    if (formData.supplier_id) {
                      setFormData({ ...formData, supplier_id: '' });
                    }
                  }}
                  className={`transition ${formData.supplier_id ? 'border-green-300 bg-green-50' : 'border-gray-300'}`}
                />
                {(() => {
                  const q = supplierSearch.trim().toLowerCase();
                  const matches = !q
                    ? []
                    : suppliers.filter((s) => {
                        const hay = [
                          s.__displayName,
                          s.name,
                          s.admin_email,
                          s.email,
                          s.created_by_email,
                          s.id,
                        ]
                          .filter(Boolean)
                          .map((v: any) => String(v).toLowerCase());

                        return hay.some((v: string) => v.includes(q));
                      });

                  if (matches.length === 0 || formData.supplier_id) return null;

                  return (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                      {matches.map((supplier) => (
                        <button
                          key={supplier.id}
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, supplier_id: supplier.id });
                            setSupplierSearch(
                              supplier.__displayName || supplier.name || supplier.admin_email || supplier.email || supplier.id
                            );
                          }}
                          className="w-full text-left px-4 py-3 border-b last:border-b-0 transition hover:bg-purple-50"
                        >
                          <p className="font-medium text-gray-900">
                            {supplier.__displayName || supplier.name || supplier.admin_email || supplier.email || supplier.id}
                          </p>
                          <p className="text-xs text-gray-500">
                            {supplier.__isAdminSupplier
                              ? `Fournisseur Admin${supplier.admin_email ? ` • ${supplier.admin_email}` : ''}`
                              : (supplier.email || supplier.created_by_email || "Pas d'email")}
                          </p>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
            {formData.supplier_id && (
              <div className="mt-3 p-3 bg-green-50 border border-green-300 rounded-lg flex items-center gap-3">
                <span className="text-green-600 text-lg">✓</span>
                <div>
                  <p className="text-xs text-green-700 font-semibold">Fournisseur sélectionné</p>
                  <p className="text-sm text-green-900 font-medium">{supplierSearch}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Full Width - Company Information */}
        <Card>
          <CardHeader>
            <CardTitle>Informations Entreprise</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Palette/Catégorie</Label>
              <Input
                value={stockRefCompany.palette_category}
                onChange={(e) => setStockRefCompany({ ...stockRefCompany, palette_category: e.target.value })}
                placeholder="Ex: Fruits"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Frais Maritime (MAD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={stockRefCompany.frais_maritime as string | number}
                  onChange={(e) => setStockRefCompany({ ...stockRefCompany, frais_maritime: e.target.value ? Number(e.target.value) : '' })}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Frais Transit (MAD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={stockRefCompany.frais_transit as string | number}
                  onChange={(e) => setStockRefCompany({ ...stockRefCompany, frais_transit: e.target.value ? Number(e.target.value) : '' })}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>ONSSA (MAD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={stockRefCompany.onssa as string | number}
                  onChange={(e) => setStockRefCompany({ ...stockRefCompany, onssa: e.target.value ? Number(e.target.value) : '' })}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Frais Divers (MAD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={stockRefCompany.frais_divers as string | number}
                  onChange={(e) => setStockRefCompany({ ...stockRefCompany, frais_divers: e.target.value ? Number(e.target.value) : '' })}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Frais Transport (MAD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={stockRefCompany.frais_transport as string | number}
                  onChange={(e) => setStockRefCompany({ ...stockRefCompany, frais_transport: e.target.value ? Number(e.target.value) : '' })}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Date Déchargement</Label>
                <Input
                  type="date"
                  value={stockRefCompany.date_dechargement}
                  onChange={(e) => setStockRefCompany({ ...stockRefCompany, date_dechargement: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Entrepôt (Magasin)</Label>
              <select
                value={selectedEntrepotStoreId || ''}
                onChange={(e) => {
                const storeId = e.target.value;
                const store = stores.find(s => s.id === storeId);
                setSelectedEntrepotStoreId(storeId || null);
                const entrepotName = store ? store.name : '';
                setFormData({ ...formData, entrepot: entrepotName });
                setStockRefCompany({ ...stockRefCompany, entrepot: entrepotName });
                
                // ADMIN EDIT MODE:
                // When admin changes the selected magasin while editing, we must also switch
                // the underlying DB row id we are editing (products are per-store rows).
                if (editingProduct) {
                const ref = String(formData.reference || editingProduct?.reference || '').trim();
                if (!ref) return;
                
                const row = products.find((p: any) => {
                if (String(p.reference ?? '').trim() !== ref) return false;
                return String(p.store_id ?? '') === String(storeId);
                });
                
                if (row?.id) {
                setEditingProductRowId(String(row.id));
                } else {
                // Safest behaviour: do not create missing rows implicitly.
                // Force the admin to add/create stock for that magasin first.
                toast.error('Aucun produit avec cette référence dans ce magasin. Créez-le d\'abord (Ajouter un produit).');
                setEditingProductRowId(null);
                }
                }
                }}
                disabled={String(effectiveUserRole || '').toLowerCase() !== 'admin'}
                className={`w-full px-3 py-2 border border-gray-300 rounded-lg bg-white ${String(effectiveUserRole || '').toLowerCase() !== 'admin' ? 'opacity-75 cursor-not-allowed' : ''}`}
              >
                {(() => {
                const role = String(effectiveUserRole || 'user').toLowerCase();
                const isAdmin = role === 'admin';
                
                // Non-admin: do NOT show a "Sélectionner..." placeholder.
                // Show the assigned store as the only choice.
                if (!isAdmin) {
                // If stores are not loaded yet, still show something meaningful.
                const s = stores.find((st: any) => String(st.id) === String(effectiveUserStoreId));
                const label = s?.name || formData.entrepot || 'Votre magasin';
                return (
                <>
                <option value={effectiveUserStoreId || ''}>{label}</option>
                </>
                );
                }
                
                // Admin:
                // - In CREATE mode: allow selecting any magasin
                // - In EDIT mode: restrict to magasins where this product reference exists
                const ref = String(formData.reference || editingProduct?.reference || '').trim();
                
                const allowedStoreIds = editingProduct && ref
                ? Array.from(new Set(
                products
                .filter((p: any) => String(p.reference ?? '').trim() === ref)
                .map((p: any) => String(p.store_id ?? ''))
                .filter(Boolean)
                ))
                : null;
                
                const allowedStores = allowedStoreIds
                ? stores.filter((s: any) => allowedStoreIds.includes(String(s.id)))
                : stores;
                
                return (
                <>
                <option value="">Sélectionner un magasin...</option>
                {allowedStores.map((store: any) => (
                <option key={store.id} value={store.id}>
                {store.name}
                </option>
                ))}
                </>
                );
                })()}
              </select>
              {selectedEntrepotStoreId && (
                <p className="text-xs text-gray-500 mt-1">Magasin sélectionné</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Date Chargement</Label>
                <Input
                  type="date"
                  value={stockRefCompany.date_chargement}
                  onChange={(e) => setStockRefCompany({ ...stockRefCompany, date_chargement: e.target.value })}
                />
              </div>
              <div>
                <Label>Matricule</Label>
                <Input
                  value={stockRefCompany.matricule}
                  onChange={(e) => setStockRefCompany({ ...stockRefCompany, matricule: e.target.value })}
                  placeholder="Matricule"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Magasinage (MAD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={stockRefCompany.magasinage as string | number}
                  onChange={(e) => setStockRefCompany({ ...stockRefCompany, magasinage: e.target.value ? Number(e.target.value) : '' })}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Taxe (MAD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={stockRefCompany.taxe as string | number}
                  onChange={(e) => setStockRefCompany({ ...stockRefCompany, taxe: e.target.value ? Number(e.target.value) : '' })}
                  placeholder="0"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Full Width - Van Delivery Attachment */}
        <Card>
          <CardHeader>
            <CardTitle>🚚 Pièce Jointe Livraison Van</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Télécharger une image ou PDF du van</Label>
              <p className="text-xs text-gray-500 mb-2">Joignez une photo ou un PDF du van qui a livré la commande</p>
              <Input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setVanDeliveryFile(file);
                    const fileType = file.type.startsWith('image') ? 'image' : 'pdf';
                    setFormData({
                      ...formData,
                      van_delivery_attachment_type: fileType,
                    });
                  }
                }}
                className="mb-2"
              />
              {vanDeliveryFile && (
                <div className="p-3 bg-green-50 border border-green-300 rounded-lg">
                  <p className="text-sm font-semibold text-green-800">✓ Fichier sélectionné</p>
                  <p className="text-xs text-green-700 mt-1">{vanDeliveryFile.name}</p>
                </div>
              )}
            </div>
            <div>
              <Label>Notes sur la livraison</Label>
              <Input
                type="text"
                placeholder="Ex: Livré par le van rouge, plaque XYZ123"
                value={formData.van_delivery_notes}
                onChange={(e) => setFormData({ ...formData, van_delivery_notes: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Full Width - Articles de la Facture */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Articles de la Facture</CardTitle>
              <div className="flex gap-2">
                <Button 
                  onClick={() => {
                    const newArticle = {
                      id: Math.max(...articles.map(a => a.id), 0) + 1,
                      reference: '',
                      name: '',
                      category: '',
                      number_of_boxes: '',
                      avg_net_weight_per_box: '',
                      purchase_price: '',
                      max_purchase_limit: '',
                      lot: '',
                      fourchette_min: '',
                      fourchette_max: '',
                      product_category: '',
                    };
                    setArticles([...articles, newArticle]);
                  }} 
                  size="sm" 
                  className="gap-2" 
                  style={{ backgroundColor: '#1f2937', color: 'white' }}
                >
                  <Plus className="w-4 h-4" />
                  Ajouter Article
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-visible">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">No</th>
                    <th className="text-left py-2 px-2">Référence</th>
                    <th className="text-left py-2 px-2">Nom du Produit</th>
                    <th className="text-left py-2 px-2">Catégorie</th>
                    <th className="text-left py-2 px-2">Lot</th>
                    <th className="text-left py-2 px-2">Caisse</th>
                    <th className="text-left py-2 px-2">Quantité</th>
                    <th className="text-left py-2 px-2">Moyenne</th>
                    <th className="text-left py-2 px-2">Prix Unitaire</th>
                    <th className="text-left py-2 px-2" style={{ display: 'none' }}>Fourchette Min</th>
                    <th className="text-left py-2 px-2" style={{ display: 'none' }}>Fourchette Max</th>
                    <th className="text-left py-2 px-2">Sous-total</th>
                    <th className="text-center py-2 px-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map((article, index) => {
                    const quantity = Number(article.number_of_boxes) || 0;
                    const price = Number(article.purchase_price) || 0;
                    const subtotal = quantity * price;
                    
                    return (
                      <tr key={article.id} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-2">{index + 1}</td>
                        <td className="py-2 px-2 relative">
                          <div className="relative flex items-center gap-1">
                            <Input
                            value={article.reference}
                            onChange={(e) => {
                            const isLocked = !!String(article.reference || '').trim();
                            if (isLocked) return;
                            
                            const newValue = e.target.value;
                            
                            // If user picked/imported an existing product reference, lock it.
                            // (Still allows typing while it's NOT an existing reference.)
                            const isExistingRef = (newValue || '').trim() && products.some(p => String(p.reference || '').trim() === String(newValue || '').trim());
                            if (isExistingRef) {
                            return;
                            }
                            
                            const updated = articles.map(a => 
                            a.id === article.id ? { ...a, reference: newValue } : a
                            );
                            setArticles(updated);
                            if (newValue.length > 0) {
                            const suggestions = products.filter(p =>
                            p.reference?.toLowerCase().includes(newValue.toLowerCase())
                            );
                            setReferenceSuggestions(suggestions);
                            } else {
                            setReferenceSuggestions([]);
                            }
                            }}
                            placeholder="PROD-20240115-47392"
                            className="h-8 flex-1"
                            readOnly={
                            // Editable only when blank; once a reference is set (typically via suggestion/template), lock it.
                            String(effectiveUserRole || '').toLowerCase() === 'manager' ||
                            !!String(article.reference || '').trim()
                            }
                            disabled={
                            String(effectiveUserRole || '').toLowerCase() === 'manager' ||
                            !!String(article.reference || '').trim()
                            }
                            title={
                            String(effectiveUserRole || '').toLowerCase() === 'manager'
                            ? 'Désactivé pour votre compte'
                            : (String(article.reference || '').trim() ? 'Référence définie: non modifiable' : undefined)
                            }
                            />
                            <Button
                            type="button"
                            onClick={(e) => {
                            const role = String(effectiveUserRole || '').toLowerCase();
                            const isAdminRole = role === 'admin';
                            if (!isAdminRole) {
                            e.preventDefault();
                            e.stopPropagation();
                            return;
                            }
                            
                            // Lock rule: once a reference is set, it must not be changed.
                            if (String(article.reference || '').trim()) {
                            e.preventDefault();
                            e.stopPropagation();
                            return;
                            }
                            
                            const timestamp = Date.now().toString().slice(-6);
                            const randomNum = Math.floor(Math.random() * 1000);
                            const newRef = `P${timestamp}${randomNum}`;
                            const updated = articles.map(a => 
                            a.id === article.id ? { ...a, reference: newRef } : a
                            );
                            setArticles(updated);
                            }}
                            size="sm"
                            className={`h-8 px-2 py-0 ${String(effectiveUserRole || '').toLowerCase() === 'admin'
                            ? ''
                            : 'cursor-not-allowed opacity-60'}`}
                            style={String(effectiveUserRole || '').toLowerCase() === 'admin'
                            ? { backgroundColor: '#6366f1', color: 'white' }
                            : { backgroundColor: '#9ca3af', color: 'white', pointerEvents: 'none' }}
                            title={(() => {
                            const role = String(effectiveUserRole || '').toLowerCase();
                            if (role === 'manager') return 'Désactivé pour votre compte';
                            if (role !== 'admin') return 'Désactivé pour votre compte';
                            if (String(article.reference || '').trim()) return 'Référence définie: non modifiable';
                            return 'Générer une référence automatique';
                            })()}
                            disabled={
                            String(effectiveUserRole || '').toLowerCase() !== 'admin' ||
                            String(effectiveUserRole || '').toLowerCase() === 'manager' ||
                            !!String(article.reference || '').trim()
                            }
                            >
                            🔄
                            </Button>
                            {article.reference && referenceSuggestions.length > 0 && (
                              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-40 overflow-y-auto w-full">
                                {referenceSuggestions.map((product) => (
                                  <button
                                  key={product.id}
                                  type="button"
                                  onClick={() => {
                                  const stock = product.quantity_available || product.total_store_stock || 0;
                                  const updated = articles.map(a => 
                                  a.id === article.id ? {
                                  ...a,
                                  name: product.name,
                                  reference: product.reference,
                                  category: product.category,
                                  purchase_price: product.purchase_price,
                                  number_of_boxes: '',
                                  avg_net_weight_per_box: stock.toString(),
                                  max_purchase_limit: product.max_purchase_limit || '',
                                  lot: product.lot || '',
                                  fourchette_min: product.fourchette_min || '',
                                  fourchette_max: product.fourchette_max || ''
                                  } : a
                                  );
                                  setArticles(updated);
                                  setReferenceSuggestions([]);
                                  }}
                                  className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b last:border-b-0 transition text-xs"
                                  >
                                  <div className="font-medium text-gray-900">{product.reference}</div>
                                  <div className="text-xs text-gray-600">{product.name}</div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2 relative">
                          <div className="relative flex items-center gap-1">
                            <Input
                              value={article.name}
                              onChange={(e) => {
                                const updated = articles.map(a => 
                                  a.id === article.id ? { ...a, name: e.target.value } : a
                                );
                                setArticles(updated);
                                setActiveArticleId(article.id);
                                if (e.target.value.length > 0) {
                                  const suggestions = productTemplates.filter(t =>
                                    t.name?.toLowerCase().includes(e.target.value.toLowerCase())
                                  );
                                  setTemplateSuggestions({ ...templateSuggestions, [article.id]: suggestions });
                                } else {
                                  const newSuggestions = { ...templateSuggestions };
                                  delete newSuggestions[article.id];
                                  setTemplateSuggestions(newSuggestions);
                                }
                              }}
                              placeholder="Tapez le nom du produit..."
                              className="h-8 flex-1"
                            />
                            <Button
                              type="button"
                              onClick={() => {
                                setActiveArticleId(article.id);
                                setNewTemplateData({ name: article.name, category: '', description: '' });
                                setShowTemplatePageDialog(true);
                              }}
                              size="sm"
                              className="h-8 px-2 py-0"
                              style={{ backgroundColor: '#16a34a', color: 'white' }}
                              disabled={!canCreateProductTemplate}
                              title={!canCreateProductTemplate ? "Accès refusé: seuls les administrateurs peuvent créer des modèles" : "Ajouter un nouveau modèle"}
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                            {article.name && templateSuggestions[article.id] && templateSuggestions[article.id].length > 0 && (
                              <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
                                <div className="bg-white border-2 border-blue-300 rounded-xl shadow-2xl w-full max-w-2xl max-h-96 overflow-hidden flex flex-col">
                                  <div className="sticky top-0 px-6 py-4 border-b-2 border-blue-300 flex justify-between items-center" style={{ backgroundColor: '#000000' }}>
                                    <p className="text-sm font-bold text-white">🔍 Produits disponibles</p>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newSuggestions = { ...templateSuggestions };
                                        delete newSuggestions[article.id];
                                        setTemplateSuggestions(newSuggestions);
                                      }}
                                      className="text-white hover:text-gray-200 text-2xl font-bold"
                                    >
                                      ×
                                    </button>
                                  </div>
                                  <div className="overflow-y-auto flex-1">
                                    {templateSuggestions[article.id].map((template) => (
                                      <button
                                      key={template.id}
                                      type="button"
                                      onClick={() => {
                                      console.log('Template selected:', template);
                                      console.log('Template reference:', template.reference);
                                      console.log('Template reference_number:', template.reference_number);
                                      console.log('Fourchette min:', template.fourchette_min, 'Fourchette max:', template.fourchette_max);
                                      const referenceValue = template.reference || template.reference_number || '';
                                      console.log('Final reference value:', referenceValue);
                                      const updated = articles.map(a => 
                                      a.id === article.id ? {
                                      ...a,
                                      name: template.name,
                                      reference: referenceValue,
                                      product_category: template.category,
                                      fourchette_min: template.fourchette_min !== null && template.fourchette_min !== undefined ? template.fourchette_min : '',
                                      fourchette_max: template.fourchette_max !== null && template.fourchette_max !== undefined ? template.fourchette_max : '',
                                      } : a
                                      );
                                      console.log('Updated article:', updated);
                                      setArticles(updated);
                                      const newSuggestions = { ...templateSuggestions };
                                      delete newSuggestions[article.id];
                                      setTemplateSuggestions(newSuggestions);
                                      }}
                                      className="w-full text-left px-6 py-4 border-b border-gray-200 last:border-b-0 transition hover:bg-blue-50 active:bg-blue-100"
                                      >
                                      <div className="font-bold text-gray-900 text-base">{template.name}</div>
                                      <div className="text-sm text-gray-600 mt-2">{template.category}</div>
                                      {(template.fourchette_min || template.fourchette_max) && (
                                        <div className="text-xs text-gray-500 mt-1">
                                          Fourchette: {template.fourchette_min || '-'} à {template.fourchette_max || '-'}
                                        </div>
                                      )}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          <Input
                            value={article.product_category}
                            onChange={(e) => {
                              const updated = articles.map(a => 
                                a.id === article.id ? { ...a, product_category: e.target.value } : a
                              );
                              setArticles(updated);
                            }}
                            placeholder="Ex: Fruits"
                            className="h-8"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Input
                            value={article.lot}
                            onChange={(e) => {
                              const updated = articles.map(a => 
                                a.id === article.id ? { ...a, lot: e.target.value } : a
                              );
                              setArticles(updated);
                            }}
                            placeholder="Ex: LOT-001"
                            className="h-8"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            step="0.01"
                            value={article.category}
                            onChange={(e) => {
                              const updated = articles.map(a => 
                                a.id === article.id ? { ...a, category: e.target.value } : a
                              );
                              setArticles(updated);
                            }}
                            placeholder="Caisse (ex: 10.5)"
                            className="h-8"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            value={article.number_of_boxes as string | number}
                            onChange={(e) => {
                              const updated = articles.map(a => {
                                if (a.id === article.id) {
                                  const newBoxes = e.target.value ? Number(e.target.value) : 0;
                                  const caisse = Number(a.category) || 0;
                                  let moyenne = a.avg_net_weight_per_box;
                                  if (caisse > 0 && newBoxes > 0) {
                                    moyenne = (newBoxes / caisse).toFixed(2);
                                  }
                                  return { ...a, number_of_boxes: e.target.value, avg_net_weight_per_box: moyenne };
                                }
                                return a;
                              });
                              setArticles(updated);
                            }}
                            placeholder="Quantité"
                            className="h-8"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            value={article.avg_net_weight_per_box as string | number}
                            disabled
                            className="h-8 bg-gray-100"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            step="0.01"
                            value={article.purchase_price as string | number}
                            onChange={(e) => {
                              const updated = articles.map(a => 
                                a.id === article.id ? { ...a, purchase_price: e.target.value } : a
                              );
                              setArticles(updated);
                            }}
                            className="h-8"
                          />
                        </td>
                        <td className="py-2 px-2" style={{ display: 'none' }}>
                        <Input
                        type="number"
                        value={article.fourchette_min as string | number}
                        onChange={(e) => {
                        const isExistingRef = (article.reference || '').trim() && products.some(p => String(p.reference || '').trim() === String(article.reference || '').trim());
                        if (isExistingRef) return;
                        
                        const updated = articles.map(a =>
                        a.id === article.id ? { ...a, fourchette_min: e.target.value } : a
                        );
                        setArticles(updated);
                        }}
                        placeholder="Min"
                        className="h-8"
                        readOnly={(article.reference || '').trim() && products.some(p => String(p.reference || '').trim() === String(article.reference || '').trim())}
                        disabled={(article.reference || '').trim() && products.some(p => String(p.reference || '').trim() === String(article.reference || '').trim())}
                        title={(article.reference || '').trim() && products.some(p => String(p.reference || '').trim() === String(article.reference || '').trim())
                        ? 'Référence existante: non modifiable'
                        : undefined}
                        />
                        </td>
                        <td className="py-2 px-2" style={{ display: 'none' }}>
                        <Input
                        type="number"
                        value={article.fourchette_max as string | number}
                        onChange={(e) => {
                        const isExistingRef = (article.reference || '').trim() && products.some(p => String(p.reference || '').trim() === String(article.reference || '').trim());
                        if (isExistingRef) return;
                        
                        const updated = articles.map(a =>
                        a.id === article.id ? { ...a, fourchette_max: e.target.value } : a
                        );
                        setArticles(updated);
                        }}
                        placeholder="Max"
                        className="h-8"
                        readOnly={(article.reference || '').trim() && products.some(p => String(p.reference || '').trim() === String(article.reference || '').trim())}
                        disabled={(article.reference || '').trim() && products.some(p => String(p.reference || '').trim() === String(article.reference || '').trim())}
                        title={(article.reference || '').trim() && products.some(p => String(p.reference || '').trim() === String(article.reference || '').trim())
                        ? 'Référence existante: non modifiable'
                        : undefined}
                        />
                        </td>
                        <td className="py-2 px-2 font-semibold">{subtotal.toFixed(2)} MAD</td>
                        <td className="py-2 px-2 text-center">
                          <Button
                            onClick={() => {
                              setArticles(articles.filter(a => a.id !== article.id));
                            }}
                            size="sm"
                            variant="destructive"
                            className="h-8 w-8 p-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {/* Total */}
                  <tr className="bg-amber-50 border-t-2 border-amber-300">
                    <td colSpan={7} className="py-3 px-2 text-right font-bold text-amber-800">
                      TOTAL GÉNÉRAL:
                    </td>
                    <td className="py-3 px-2 font-bold text-lg text-amber-600">
                      {(
                        articles.reduce((sum, article) => {
                          const quantity = Number(article.number_of_boxes) || 0;
                          const price = Number(article.purchase_price) || 0;
                          return sum + (quantity * price);
                        }, 0) +
                        (Number(stockRefCompany.frais_maritime) || 0) +
                        (Number(stockRefCompany.frais_transit) || 0) +
                        (Number(stockRefCompany.onssa) || 0) +
                        (Number(stockRefCompany.frais_divers) || 0) +
                        (Number(stockRefCompany.frais_transport) || 0) +
                        (Number(stockRefCompany.magasinage) || 0) +
                        (Number(stockRefCompany.taxe) || 0)
                      ).toFixed(2)} MAD
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons - Bottom */}
        <div className="flex justify-end gap-2">
          <Button
            onClick={() => {
              const firstRef = (articles[0]?.reference || '').trim();
              if (!firstRef) {
                toast.error('Veuillez sélectionner une référence dans le tableau');
                return;
              }
              const firstCaisse = Number(articles[0]?.category || 0);
              if (!firstCaisse || firstCaisse <= 0) {
                toast.error('Veuillez renseigner la Caisse (> 0) dans le tableau');
                return;
              }
              // All other fields are optional
              handleSubmit({ preventDefault: () => {} } as React.FormEvent);
            }}
            disabled={loading}
            size="lg"
            style={{ backgroundColor: '#10b981', color: 'white' }}
          >
            {loading ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
          <Button 
            onClick={() => {
              setShowAddProductPage(false);
              resetForm();
            }}
            size="lg"
            variant="outline"
            className="border-gray-300"
          >
            Annuler
          </Button>
        </div>

        {/* Template Creation Dialog - Popup for adding product templates */}
        <Dialog open={showTemplatePageDialog} onOpenChange={(open: boolean) => {
          setShowTemplatePageDialog(open);
          if (!open) {
            setNewTemplateData({ name: '', category: '', description: '', reference_number: '', entrepot: '', date_fin: '', fournisseur: '', fourchette_min: '', fourchette_max: '' });
            setTemplatePhotoFile(null);
            setTemplatePhotoPreview('');
            setTemplateReferenceDuplicate(false);
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                <Plus className="w-6 h-6" />
                ➕ Ajouter un modèle de produit
              </DialogTitle>
              <DialogDescription className="text-sm mt-2">
                Créez un modèle de produit qui pourra être utilisé comme suggestion lors de l'ajout de produits
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={async (e) => {
            e.preventDefault();
            
            const ref = String(newTemplateData.reference_number || '').trim();
            if (!ref) {
            toast.error('La référence est obligatoire');
            return;
            }
            
            // Check for duplicate reference
            const templateExists = productTemplates.some(
              t => t.reference?.toLowerCase() === ref.toLowerCase()
            );
            if (templateExists) {
              setTemplateReferenceDuplicate(true);
              toast.error(`La référence "${ref}" existe déjà dans les modèles. Veuillez utiliser une autre référence.`);
              return;
            }
            
            if (newTemplateData.name.trim()) {
            await createProductTemplate(newTemplateData.name, newTemplateData.category, newTemplateData.description, templatePhotoPreview, ref, newTemplateData.entrepot, newTemplateData.date_fin, newTemplateData.fournisseur, newTemplateData.fourchette_min, newTemplateData.fourchette_max, activeArticleId);
            }
            }} className="space-y-4">
              {/* Nom du produit */}
              <div>
                <Label className="font-semibold text-gray-900">Nom du produit</Label>
                <Input
                  value={newTemplateData.name}
                  onChange={(e) => {
                    setNewTemplateData({ ...newTemplateData, name: e.target.value });
                    if (e.target.value.length > 0) {
                      const uniqueNames = [...new Set(productTemplates.map(t => t.name).filter(Boolean))];
                      const filtered = uniqueNames.filter(name =>
                        name.toLowerCase().includes(e.target.value.toLowerCase())
                      );
                      setNameSuggestions(filtered);
                    } else {
                      setNameSuggestions([]);
                    }
                  }}
                  placeholder="Ex: Tomate, Pomme, Banane..."
                  className="mt-1 bg-gray-50 border-gray-300"
                />
              </div>

              {/* Catégorie */}
              <div>
                <Label className="font-semibold text-gray-900">Catégorie</Label>
                <Input
                  value={newTemplateData.category}
                  onChange={(e) => {
                    setNewTemplateData({ ...newTemplateData, category: e.target.value });
                    if (e.target.value.length > 0) {
                      const uniqueCategories: string[] = [...new Set(productTemplates.map(t => t.category).filter(Boolean))];
                      const filtered = uniqueCategories.filter(cat =>
                        cat.toLowerCase().includes(e.target.value.toLowerCase())
                      );
                      setCategorySuggestions(filtered);
                    } else {
                      setCategorySuggestions([]);
                    }
                  }}
                  placeholder="Ex: Fruits, Légumes, Épices..."
                  className="mt-1 bg-gray-50 border-gray-300"
                />
              </div>

              {/* Photo du produit */}
              <div>
                <Label className="font-semibold text-gray-900">Photo du produit</Label>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (e: any) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (!file.type.startsWith('image/')) {
                            toast.error('Veuillez sélectionner une image valide');
                            return;
                          }
                          if (file.size > 5 * 1024 * 1024) {
                            toast.error('La taille de l\'image ne doit pas dépasser 5MB');
                            return;
                          }
                          setTemplatePhotoFile(file);
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setTemplatePhotoPreview(reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      };
                      input.click();
                    }}
                    className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition flex items-center justify-center gap-2 text-gray-600 hover:text-blue-600"
                  >
                    <Upload className="w-5 h-5" />
                    <span>Cliquez pour télécharger une image</span>
                  </button>
                  <p className="text-xs text-gray-500 mt-2">PNG, JPG, GIF jusqu'à 5MB</p>
                </div>

                {/* Photo Preview */}
                {templatePhotoPreview && (
                  <div className="mt-3 p-3 border rounded-lg bg-gray-50">
                    <p className="text-xs font-semibold text-gray-600 mb-2">Aperçu:</p>
                    <img 
                      src={templatePhotoPreview} 
                      alt="Preview" 
                      className="max-h-40 max-w-full rounded"
                    />
                    {templatePhotoFile && (
                      <p className="text-xs text-gray-600 mt-2">
                        Fichier: {templatePhotoFile.name}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <Label className="font-semibold text-gray-900">Description</Label>
                <textarea
                  value={newTemplateData.description}
                  onChange={(e) => setNewTemplateData({ ...newTemplateData, description: e.target.value })}
                  placeholder="Description optionnelle du produit..."
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  rows={3}
                />
              </div>

              {/* Numéro de Référence */}
              <div>
              <Label className="font-semibold text-gray-900">Numéro de Référence *</Label>
              <div className="relative mt-1">
              <Input
                value={newTemplateData.reference_number}
                onChange={(e) => {
                  const refValue = e.target.value.trim();
                  setNewTemplateData({ ...newTemplateData, reference_number: e.target.value });
                  
                  // Real-time duplicate check
                  if (refValue) {
                    const exists = productTemplates.some(
                      t => t.reference?.toLowerCase() === refValue.toLowerCase()
                    );
                    setTemplateReferenceDuplicate(exists);
                  } else {
                    setTemplateReferenceDuplicate(false);
                  }
                }}
                placeholder="Ex: REF-001, SKU-12345..."
                className={`bg-gray-50 border-gray-300 pr-10 text-sm ${templateReferenceDuplicate ? 'border-red-500 focus:border-red-500' : ''}`}
                required
              />
              <button
                type="button"
                onClick={() => {
                  const timestamp = Date.now().toString().slice(-6);
                  const randomNum = Math.floor(Math.random() * 1000);
                  const newRef = `P${timestamp}${randomNum}`;
                  setNewTemplateData({ ...newTemplateData, reference_number: newRef });
                  
                  // Also check for duplicate when auto-generating
                  const exists = productTemplates.some(
                    t => t.reference?.toLowerCase() === newRef.toLowerCase()
                  );
                  setTemplateReferenceDuplicate(exists);
                }}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-indigo-500 hover:text-indigo-700 text-lg cursor-pointer"
                title="Générer une référence automatique"
              >
                🔄
              </button>
              </div>
              {templateReferenceDuplicate && (
                <p className="text-xs text-red-500 mt-1">
                  ⚠️ Cette référence existe déjà dans la base de données
                </p>
              )}
              </div>

              {/* Date de Fin */}
              <div>
                <Label className="font-semibold text-gray-900">Date de Fin</Label>
                <Input
                  type="date"
                  value={newTemplateData.date_fin}
                  onChange={(e) => setNewTemplateData({ ...newTemplateData, date_fin: e.target.value })}
                  className="mt-1 bg-gray-50 border-gray-300"
                />
              </div>

              {/* Fourchette Min and Max - HIDDEN */}
              <div className="grid grid-cols-2 gap-4 hidden">
                <div>
                  <Label className="font-semibold text-gray-900">Fourchette Min</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newTemplateData.fourchette_min}
                    onChange={(e) => setNewTemplateData({ ...newTemplateData, fourchette_min: e.target.value })}
                    placeholder="Ex: 10.5"
                    className="mt-1 bg-gray-50 border-gray-300"
                  />
                </div>
                <div>
                  <Label className="font-semibold text-gray-900">Fourchette Max</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newTemplateData.fourchette_max}
                    onChange={(e) => setNewTemplateData({ ...newTemplateData, fourchette_max: e.target.value })}
                    placeholder="Ex: 20.5"
                    className="mt-1 bg-gray-50 border-gray-300"
                  />
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  type="button"
                  onClick={() => {
                    setShowTemplatePageDialog(false);
                    setNewTemplateData({ name: '', category: '', description: '', reference_number: '', entrepot: '', date_fin: '', fournisseur: '', fourchette_min: '', fourchette_max: '' });
                    setTemplatePhotoFile(null);
                    setTemplatePhotoPreview('');
                  }}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold px-6 py-2 rounded-lg"
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={loading || templateReferenceDuplicate}
                  className={`bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded-lg flex items-center gap-2 ${templateReferenceDuplicate ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span>✓</span>
                  <span>Enregistrer</span>
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stock Overview Cards - Navbar Style */}
      <div className="flex flex-wrap w-full bg-white p-1 h-auto gap-1 border-b border-gray-200 rounded-lg">
        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-blue-50 border-b-2 border-blue-500 text-blue-600 flex-1 min-w-max">
          <Package className="w-5 h-5" />
          <span className="text-xs font-medium">Total Produits</span>
          <span className="text-lg font-bold">{sortedProducts.length}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-green-50 border-b-2 border-green-500 text-green-600 flex-1 min-w-max">
          <Package className="w-5 h-5" />
          <span className="text-xs font-medium">Articles en Stock</span>
          <span className="text-lg font-bold">{totalItems}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-purple-50 border-b-2 border-purple-500 text-purple-600 flex-1 min-w-max">
          <Package className="w-5 h-5" />
          <span className="text-xs font-medium">Valeur Totale</span>
          <span className="text-lg font-bold">{totalValue.toFixed(0)}K MAD</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-red-50 border-b-2 border-red-500 text-red-600 flex-1 min-w-max">
          <AlertTriangle className="w-5 h-5" />
          <span className="text-xs font-medium">Stock Faible</span>
          <span className="text-lg font-bold">{lowStockProducts.length}</span>
        </div>
      </div>

      {/* Main Products Table */}
      <Card className="bg-white">
        <CardHeader className="bg-white">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>Stock Partagé - Échange Inter-Magasins</CardTitle>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <div className="flex gap-4 items-center flex-wrap">
                <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
                  <input
                    type="checkbox"
                    checked={sharedStockOnlyZero}
                    onChange={(e) => setSharedStockOnlyZero(e.target.checked)}
                  />
                  Stock = 0
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
                  <input
                    type="checkbox"
                    checked={sharedStockOnlyNonZero}
                    onChange={(e) => setSharedStockOnlyNonZero(e.target.checked)}
                  />
                  Stock ≠ 0
                </label>
              </div>
              </div>
              </div>
              
              <div className="flex gap-2">
              <Button 
                onClick={() => setShowAddProductPage(true)}
                style={{ backgroundColor: '#16a34a' }} 
                className="text-white font-semibold hover:opacity-90"
              >
                <Plus className="w-4 h-4 mr-2" />
                Ajouter un produit
              </Button>
              <Dialog open={dialogOpen} onOpenChange={(open: boolean) => {
                setDialogOpen(open);
                if (!open) resetForm();
              }}>
                <DialogTrigger asChild style={{ display: 'none' }}>
                  <Button>Hidden</Button>
                </DialogTrigger>
                <DialogContent className="w-screen h-screen max-w-none max-h-none overflow-hidden flex flex-col p-6">
                  <DialogHeader className="flex-shrink-0 mb-4">
                    <div className="flex justify-between items-center">
                      <DialogTitle className="text-3xl font-bold">
                        {editingProduct ? '✏️ Modifier le produit' : '➕ Ajouter un produit'}
                      </DialogTitle>
                      <Button
                        onClick={() => setDialogOpen(false)}
                        className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-6 py-2 rounded-lg transition"
                      >
                        <X className="w-5 h-5 mr-2" />
                        Fermer
                      </Button>
                    </div>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-6 flex-1 overflow-y-auto pr-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Section 1: Informations Principales */}
                      <Card>
                        <CardHeader className="bg-gradient-to-r from-blue-500 to-blue-600">
                          <CardTitle className="text-white">Informations Principales</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                          <div>
                            <Label>Nom du produit</Label>
                            <Input
                              value={formData.name}
                              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                              placeholder="Ex: Tomate"
                            />
                          </div>
                            <div>
                            <Label>Référence</Label>
                            <div className="relative">
                              <Input
                                value={referenceSearch}
                                onChange={(e) => {
                                  const refVal = e.target.value;
                                  setReferenceSearch(refVal);
                                  if (refVal.length > 0) {
                                    const suggestions = products.filter(p =>
                                      p.reference?.toLowerCase().startsWith(refVal.toLowerCase())
                                    );
                                    setReferenceSuggestions(suggestions);
                                    
                                    // Check for duplicate
                                    const isDuplicate = products.some(p => 
                                      p.reference?.toLowerCase() === refVal.toLowerCase()
                                    );
                                    setProductDuplicateReference(isDuplicate);
                                  } else {
                                    setReferenceSuggestions([]);
                                    setProductDuplicateReference(false);
                                  }
                                  setFormData({ ...formData, reference: refVal });
                                }}
                                placeholder="PROD-20240115-47392"
                              />
                              {productDuplicateReference && (
                                <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                                  ⚠️ Cette référence existe déjà dans la base de produits
                                </p>
                              )}
                              {referenceSearch && referenceSuggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg z-10 max-h-56 overflow-y-auto">
                                  <div className="sticky top-0 bg-gray-50 px-4 py-3 border-b border-gray-200">
                                    <p className="text-xs font-semibold text-gray-600">Produits existants</p>
                                  </div>
                                  {referenceSuggestions.map((product) => (
                                    <button
                                      key={product.id}
                                      type="button"
                                      onClick={() => {
                                        setFormData({
                                          name: product.name || '',
                                          reference: product.reference || '',
                                          quantity_available: '',
                                          purchase_price: product.purchase_price || '',
                                          sale_price: product.sale_price || '',
                                          supplier_id: product.supplier_id || '',
                                          category: product.category || '',
                                          number_of_boxes: product.number_of_boxes || 0,
                                          total_net_weight: product.total_net_weight || 0,
                                          avg_net_weight_per_box: product.avg_net_weight_per_box || 0,
                                          max_purchase_limit: product.max_purchase_limit || '',
                                          van_delivery_attachment_url: product.van_delivery_attachment_url || '',
                                          van_delivery_attachment_type: product.van_delivery_attachment_type || '',
                                          van_delivery_notes: product.van_delivery_notes || '',
                                          entrepot: product.entrepot || '',
                                        });
                                        setReferenceSearch(product.reference);
                                        setReferenceSuggestions([]);
                                        setSupplierSearch(product.supplier_id ? suppliers.find(s => s.id === product.supplier_id)?.name || '' : '');
                                      }}
                                      className="w-full text-left px-4 py-3 border-b last:border-b-0 transition hover:bg-blue-50"
                                    >
                                      <p className="font-medium text-gray-900">{product.name}</p>
                                      <p className="text-xs text-gray-500">Ref: {product.reference}</p>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <div>
                            <Label>Catégorie</Label>
                            <Input
                              value={formData.category}
                              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                              placeholder="Ex: Fruits"
                            />
                          </div>
                        </CardContent>
                      </Card>

                      {/* Section 2: Tarification */}
                      <Card>
                        <CardHeader className="bg-gradient-to-r from-green-500 to-green-600">
                          <CardTitle className="text-white">Tarification</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                          <div>
                            <Label>Prix d'achat (MAD)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={formData.purchase_price as string | number}
                              onChange={(e) => setFormData({ ...formData, purchase_price: e.target.value ? Number(e.target.value) : '' })}
                              placeholder="0.00"
                              required={false}
                            />
                          </div>
                          <div>
                            <Label>Prix de vente (MAD)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={formData.sale_price as string | number}
                              onChange={(e) => setFormData({ ...formData, sale_price: e.target.value ? Number(e.target.value) : '' })}
                              placeholder="0.00"
                              required={false}
                            />
                          </div>
                          <div>
                            <Label>Quantité disponible</Label>
                            <Input
                              type="number"
                              value={formData.quantity_available as string | number}
                              onChange={(e) => setFormData({ ...formData, quantity_available: e.target.value ? Number(e.target.value) : '' })}
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <Label>Limite d'achat (Max par client)</Label>
                            <Input
                              type="number"
                              value={formData.max_purchase_limit as string | number}
                              onChange={(e) => setFormData({ ...formData, max_purchase_limit: e.target.value ? Number(e.target.value) : '' })}
                              placeholder="Laisser vide pour illimité"
                            />
                            <p className="text-xs text-gray-500 mt-1">Quantité maximale qu'un client peut acheter</p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Section 3: Fournisseur */}
                    <Card>
                      <CardHeader className="bg-gradient-to-r from-purple-500 to-purple-600">
                        <CardTitle className="text-white">Fournisseur</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 pt-4">
                        <Label>Sélectionner un fournisseur</Label>
                        <div className="flex items-center gap-3">
                          <Search className="text-gray-400 w-5 h-5" />
                          <div className="relative flex-1">
                            <Input
                              type="text"
                              placeholder="Tapez le nom du fournisseur..."
                              value={supplierSearch}
                              onChange={(e) => {
                                setSupplierSearch(e.target.value);
                                if (formData.supplier_id) {
                                  setFormData({ ...formData, supplier_id: '' });
                                }
                              }}
                              className={`transition ${formData.supplier_id ? 'border-green-300 bg-green-50' : 'border-gray-300'}`}
                            />
                            {supplierSearch && suppliers.filter(s => 
                              s.name?.toLowerCase().includes(supplierSearch.toLowerCase())
                            ).length > 0 && !formData.supplier_id && (
                              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                                {suppliers
                                  .filter(s => s.name?.toLowerCase().includes(supplierSearch.toLowerCase()))
                                  .map((supplier) => (
                                    <button
                                      key={supplier.id}
                                      type="button"
                                      onClick={() => {
                                        setFormData({ ...formData, supplier_id: supplier.id });
                                        setSupplierSearch(supplier.name);
                                      }}
                                      className="w-full text-left px-4 py-3 border-b last:border-b-0 transition hover:bg-purple-50"
                                    >
                                      <p className="font-medium text-gray-900">{supplier.name}</p>
                                      <p className="text-xs text-gray-500">{supplier.email || 'Pas d\'email'}</p>
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>
                        </div>
                        {formData.supplier_id && (
                          <div className="mt-3 p-3 bg-green-50 border border-green-300 rounded-lg flex items-center gap-3">
                            <span className="text-green-600 text-lg">✓</span>
                            <div>
                              <p className="text-xs text-green-700 font-semibold">Fournisseur sélectionné</p>
                              <p className="text-sm text-green-900 font-medium">{supplierSearch}</p>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Section 4: Dimensions et Poids */}
                    <Card>
                      <CardHeader className="bg-gradient-to-r from-orange-500 to-orange-600">
                        <CardTitle className="text-white">Dimensions et Poids</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div>
                            <Label>Nombre de caisses</Label>
                            <Input
                              type="number"
                              value={formData.number_of_boxes as string | number}
                              onChange={(e) => handleWeightChange('number_of_boxes', e.target.value ? Number(e.target.value) : '')}
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <Label>Poids net total (kg)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={formData.total_net_weight as string | number}
                              onChange={(e) => handleWeightChange('total_net_weight', e.target.value ? Number(e.target.value) : '')}
                              placeholder="0.00"
                            />
                          </div>
                          <div>
                            <Label>Poids moyen/caisse (kg)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={formData.avg_net_weight_per_box as string | number}
                              disabled
                              placeholder="Auto"
                              className="bg-gray-100"
                            />
                            <p className="text-xs text-gray-500 mt-1">Calculé automatiquement</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Section 5: Van Delivery Attachment */}
                    <Card>
                      <CardHeader className="bg-gradient-to-r from-red-500 to-red-600">
                        <CardTitle className="text-white">🚚 Pièce Jointe Livraison Van</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-4">
                        <div>
                          <Label>Télécharger une image ou PDF du van</Label>
                          <p className="text-xs text-gray-500 mb-2">Joignez une photo ou un PDF du van qui a livré la commande</p>
                          <Input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setVanDeliveryFile(file);
                                const fileType = file.type.startsWith('image') ? 'image' : 'pdf';
                                setFormData({
                                  ...formData,
                                  van_delivery_attachment_type: fileType,
                                });
                              }
                            }}
                            className="mb-2"
                          />
                          {vanDeliveryFile && (
                            <div className="p-3 bg-green-50 border border-green-300 rounded-lg">
                              <p className="text-sm font-semibold text-green-800">✓ Fichier sélectionné</p>
                              <p className="text-xs text-green-700 mt-1">{vanDeliveryFile.name}</p>
                            </div>
                          )}
                        </div>
                        <div>
                          <Label>Notes sur la livraison</Label>
                          <Input
                            type="text"
                            placeholder="Ex: Livré par le van rouge, plaque XYZ123"
                            value={formData.van_delivery_notes}
                            onChange={(e) => setFormData({ ...formData, van_delivery_notes: e.target.value })}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    {/* Form Actions */}
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        onClick={() => {
                          setDialogOpen(false);
                          resetForm();
                        }}
                        className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold px-8 py-3 rounded-lg"
                      >
                        Annuler
                      </Button>
                      <Button
                        type="submit"
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg disabled:opacity-50"
                      >
                        {loading ? '⏳ Enregistrement...' : '✓ Enregistrer le produit'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Rechercher un produit..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {/* Admin-only magasin filter */}
              {effectiveUserRole === 'admin' && (
                <select
                  value={storeFilter}
                  onChange={(e) => setStoreFilter(e.target.value)}
                  className="px-4 py-2 border rounded-md bg-white"
                >
                  <option value="all">Tous les magasins</option>
                  {stores.map((store: any) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              )}

              <select
                value={createdByFilter}
                onChange={(e) => setCreatedByFilter(e.target.value)}
                className="px-4 py-2 border rounded-md bg-white"
              >
                <option value="all">Tous les créateurs</option>
                <option value={session?.user?.id}>Mes produits</option>
              </select>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <div className="mb-4 flex gap-2 items-center">
                  <Button
                    onClick={() => {
                      if (selectedProducts.size === sortedProducts.length) {
                        setSelectedProducts(new Set());
                      } else {
                        setSelectedProducts(new Set(sortedProducts.map(p => p.id)));
                      }
                    }}
                    size="sm"
                    variant="outline"
                    className="gap-2"
                  >
                    {selectedProducts.size === sortedProducts.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    {selectedProducts.size === 0 ? 'Sélectionner tout' : `${selectedProducts.size} sélectionné(s)`}
                  </Button>
                  {selectedProducts.size > 0 && (
                  <div className="flex gap-2 flex-wrap">
                  <Dialog open={showExcelExportDialog} onOpenChange={setShowExcelExportDialog}>
                  <DialogTrigger asChild>
                  <Button
                  size="sm"
                  className="gap-2"
                  style={{ backgroundColor: '#2563eb', color: 'white' }}
                  >
                  <Download className="w-4 h-4" />
                  Exporter Excel
                  </Button>
                  </DialogTrigger>
                  <DialogContent>
                  <DialogHeader>
                  <DialogTitle>Options d'export Excel</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                  <div className="flex items-center gap-2">
                  <input
                  type="checkbox"
                  id="includeNamesExcel"
                  checked={pdfExportOptions.includeNames}
                  onChange={(e) => setPdfExportOptions({ ...pdfExportOptions, includeNames: e.target.checked })}
                  className="w-4 h-4"
                  />
                  <label htmlFor="includeNamesExcel" className="text-sm font-medium">Inclure les noms des produits</label>
                  </div>
                  <div className="flex items-center gap-2">
                  <input
                  type="checkbox"
                  id="includeQuantitiesExcel"
                  checked={pdfExportOptions.includeQuantities}
                  onChange={(e) => setPdfExportOptions({ ...pdfExportOptions, includeQuantities: e.target.checked })}
                  className="w-4 h-4"
                  />
                  <label htmlFor="includeQuantitiesExcel" className="text-sm font-medium">Inclure les quantités</label>
                  </div>
                  <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setShowExcelExportDialog(false)}>Annuler</Button>
                  <Button
                  onClick={() => {
                  handleExportExcel();
                  setShowExcelExportDialog(false);
                  }}
                  style={{ backgroundColor: '#2563eb', color: 'white' }}
                  >
                  Exporter
                  </Button>
                  </div>
                  </div>
                  </DialogContent>
                  </Dialog>
                  
                  <Dialog open={showPdfExportDialog} onOpenChange={setShowPdfExportDialog}>
                  <DialogTrigger asChild>
                  <Button size="sm" style={{ backgroundColor: '#ea580c', color: 'white' }} className="gap-2">
                  <Download className="w-4 h-4" />
                  Exporter en PDF
                  </Button>
                  </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Options d'export PDF</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="includeNames"
                              checked={pdfExportOptions.includeNames}
                              onChange={(e) => setPdfExportOptions({ ...pdfExportOptions, includeNames: e.target.checked })}
                              className="w-4 h-4"
                            />
                            <label htmlFor="includeNames" className="text-sm font-medium">Inclure les noms des produits</label>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="includeQuantities"
                              checked={pdfExportOptions.includeQuantities}
                              onChange={(e) => setPdfExportOptions({ ...pdfExportOptions, includeQuantities: e.target.checked })}
                              className="w-4 h-4"
                            />
                            <label htmlFor="includeQuantities" className="text-sm font-medium">Inclure les quantités</label>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button variant="outline" onClick={() => setShowPdfExportDialog(false)}>Annuler</Button>
                            <Button onClick={handleExportPDF} style={{ backgroundColor: '#ea580c', color: 'white' }}>Exporter</Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    </div>
                    )}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <input
                          type="checkbox"
                          checked={selectedProducts.size === sortedProducts.length && sortedProducts.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedProducts(new Set(sortedProducts.map(p => p.id)));
                            } else {
                              setSelectedProducts(new Set());
                            }
                          }}
                          className="w-4 h-4"
                        />
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="flex items-center gap-2 select-none"
                          title="Trier A→Z / Z→A"
                          onClick={() => {
                            setSortConfig((prev) => ({
                              key: 'stock_reference',
                              direction: prev.key === 'stock_reference' && prev.direction === 'asc' ? 'desc' : 'asc',
                            }));
                          }}
                        >
                          Réf. Stock
                          <span className="text-xs font-semibold text-blue-600">
                            {sortConfig.key === 'stock_reference' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
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
                              key: 'reference',
                              direction: prev.key === 'reference' && prev.direction === 'asc' ? 'desc' : 'asc',
                            }));
                          }}
                        >
                          No Référence
                          <span className="text-xs font-semibold text-blue-600">
                            {sortConfig.key === 'reference' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
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
                              key: 'name',
                              direction: prev.key === 'name' && prev.direction === 'asc' ? 'desc' : 'asc',
                            }));
                          }}
                        >
                          Nom
                          <span className="text-xs font-semibold text-blue-600">
                            {sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        </button>
                      </TableHead>
                      <TableHead className="border-r border-black">
                      <div className="flex items-stretch" style={{ minWidth: '420px' }}>
                      <span className="font-semibold" style={{ minWidth: '80px' }}>Stock:</span>
                      
                      <div
                      className="ml-2 grid rounded-md border-2 border-black bg-white overflow-hidden"
                      style={{
                      gridTemplateColumns: `repeat(${stockStores.length + (effectiveUserRole === 'admin' ? 1 : 0)}, minmax(90px, 110px))`,
                      }}
                      >
                      {stockStores.map((store, idx) => (
                      <div
                      key={store.id}
                      className="px-2 py-1 text-[11px] font-semibold text-gray-700 text-center leading-tight flex items-center justify-center"
                      style={{
                      minHeight: '34px',
                      borderRight: idx === stockStores.length - 1 && effectiveUserRole !== 'admin'
                      ? 'none'
                      : '2px solid #000',
                      }}
                      >
                      {store.name}
                      </div>
                      ))}
                      
                      {effectiveUserRole === 'admin' && (
                      <div className="px-2 py-1 text-[11px] font-semibold text-gray-700 text-center leading-tight flex items-center justify-center" style={{ minHeight: '34px' }}>
                      Total
                      </div>
                      )}
                      </div>
                      </div>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="flex items-center gap-2 select-none"
                          title="Trier 0→9 / 9→0"
                          onClick={() => {
                            setSortConfig((prev) => ({
                              key: 'total_sales',
                              direction: prev.key === 'total_sales' && prev.direction === 'asc' ? 'desc' : 'asc',
                            }));
                          }}
                        >
                          Ventes Totales
                          <span className="text-xs font-semibold text-blue-600">
                            {sortConfig.key === 'total_sales' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        </button>
                      </TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-gray-500 py-8">
                          Aucun produit trouvé
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedProducts.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell className="w-12">
                            <input
                              type="checkbox"
                              checked={selectedProducts.has(product.id)}
                              onChange={(e) => {
                                const newSelected = new Set(selectedProducts);
                                if (e.target.checked) {
                                  newSelected.add(product.id);
                                } else {
                                  newSelected.delete(product.id);
                                }
                                setSelectedProducts(newSelected);
                              }}
                              className="w-4 h-4"
                            />
                          </TableCell>
                          <TableCell className="font-medium text-blue-600 font-bold">
                            {product.stock_reference || '-'}
                          </TableCell>
                          <TableCell className="text-gray-900">{product.reference || '-'}</TableCell>
                          <TableCell className="text-gray-900">{product.name}</TableCell>
                          <TableCell className="border-r border-black">
                          <div className="flex items-center" style={{ minWidth: '420px', paddingLeft: '80px' }}>
                          {stores.length > 0 ? (
                          <div
                          className="grid border-2 border-black bg-white overflow-hidden"
                          style={{
                          gridTemplateColumns: `repeat(${stockStores.length + (effectiveUserRole === 'admin' ? 1 : 0)}, minmax(90px, 110px))`,
                          }}
                          >
                          {stockStores.map((store, idx) => {
                          // Get stock from store_stocks first, fallback to quantity_available if store_id matches
                          const stockFromTable = product.store_stocks?.[store.id];
                          const matchesStoreId = String(product.store_id) === String(store.id);
                          const stock = stockFromTable !== undefined && stockFromTable !== null
                            ? stockFromTable
                            : (matchesStoreId ? product.quantity_available : undefined);
                          const isCurrentUserStore = store.id === currentUserStoreId;
                          const colorClass = stock !== undefined && stock !== null
                            ? (isCurrentUserStore ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800')
                            : 'bg-white text-gray-300';
                          
                          return (
                          <div
                          key={store.id}
                          className={`px-2 py-1 text-xs font-semibold text-center flex items-center justify-center ${colorClass}`}
                          style={{
                          minHeight: '34px',
                          borderRight: idx === stockStores.length - 1 && effectiveUserRole !== 'admin'
                          ? 'none'
                          : '2px solid #000',
                          }}
                          >
                          {stock !== undefined && stock !== null ? stock : ''}
                          </div>
                          );
                          })}
                          
                          {effectiveUserRole === 'admin' && (() => {
                          const totalCaisse = Object.values(product.store_stocks || {}).reduce((sum: number, qty: any) => sum + qty, 0);
                          return (
                          <div className="px-2 py-1 text-xs font-bold text-center bg-green-200 text-green-800 flex items-center justify-center" style={{ minHeight: '34px' }}>
                          {totalCaisse}
                          </div>
                          );
                          })()}
                          </div>
                          ) : (
                          <span className="text-gray-500 text-sm">{product.quantity_available}</span>
                          )}
                          
                          {product.quantity_available < 10 && (
                          <TrendingDown className="w-4 h-4 text-red-500 ml-2" />
                          )}
                          </div>
                          </TableCell>
                          <TableCell>
                            <span className="inline-block px-2 py-1 rounded text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-300">
                              {calculateProductStats(product.id, product.name).totalSales}
                            </span>
                          </TableCell>
                          {/* Removed old "Restant" / stock badge cell to keep columns aligned */}
                          {/* Prix de vente column hidden from UI (keep data/functions intact) */}
                                                    <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                style={{ backgroundColor: '#8b5cf6' }}
                                className="text-white hover:opacity-90"
                                onClick={() => handleViewDetails(product)}
                                title="View Details"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                style={{ backgroundColor: '#2563eb' }}
                                className="text-white hover:opacity-90"
                                onClick={() => handleEdit(product)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                style={{ backgroundColor: '#dc2626' }}
                                className="text-white hover:opacity-90"
                                onClick={() => handleDelete(product.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                {/* Voir plus button */}
                {sortedProducts.length > displayLimit && (
                  <div className="flex justify-center mt-4">
                    <Button
                      onClick={() => setDisplayLimit((prev) => prev + 100)}
                      variant="outline"
                      className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-300"
                    >
                      Voir plus ({sortedProducts.length - displayLimit} restants)
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Template Creation Dialog */}
      <Dialog
        open={showTemplateDialog}
        onOpenChange={(open: boolean) => {
          // Block opening the dialog for non-admin
          if (open && !canCreateProductTemplate) {
            toast.error('Accès refusé: seuls les administrateurs peuvent créer des modèles');
            return;
          }
          setShowTemplateDialog(open);
          if (!open) {
            setNewTemplateData({
              name: '',
              category: '',
              description: '',
              reference_number: '',
              date_fin: '',
              fourchette_min: '',
              fourchette_max: '',
              entrepot: '',
              fournisseur: '',
            });
            setTemplateReferenceDuplicate(false);
          }
        }}
      >
        <DialogContent className="max-w-md z-[100000]">
          <DialogHeader>
            <DialogTitle>➕ Ajouter un modèle de produit</DialogTitle>
            <DialogDescription>
              Créez un nouveau modèle de produit pour l'utiliser comme suggestion
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={async (e) => {
            e.preventDefault();
            
            // Check if reference_number already exists in product templates
            const refValue = String(newTemplateData.reference_number || '').trim();
            if (refValue) {
              const templateExists = productTemplates.some(
                t => t.reference?.toLowerCase() === refValue.toLowerCase()
              );
              if (templateExists) {
                setTemplateReferenceDuplicate(true);
                toast.error(`La référence "${refValue}" existe déjà dans les modèles. Veuillez utiliser une autre référence.`);
                return;
              }
            }
            
            if (newTemplateData.name.trim()) {
              await createProductTemplate(newTemplateData.name, newTemplateData.category);
            }
          }} className="space-y-4">
            <div>
              <Label>Nom du produit *</Label>
              <Input
                value={newTemplateData.name}
                onChange={(e) => setNewTemplateData({ ...newTemplateData, name: e.target.value })}
                placeholder="Ex: Tomate, Pomme..."
                required
              />
            </div>
            <div>
              <Label>Catégorie</Label>
              <Input
                value={newTemplateData.category}
                onChange={(e) => setNewTemplateData({ ...newTemplateData, category: e.target.value })}
                placeholder="Ex: Fruits, Légumes..."
              />
            </div>
            <div>
              <Label>Référence</Label>
              <Input
                value={newTemplateData.reference_number}
                onChange={(e) => {
                  const refValue = e.target.value.trim();
                  setNewTemplateData({ ...newTemplateData, reference_number: e.target.value });
                  
                  // Real-time duplicate check
                  if (refValue) {
                    const exists = productTemplates.some(
                      t => t.reference?.toLowerCase() === refValue.toLowerCase()
                    );
                    setTemplateReferenceDuplicate(exists);
                  } else {
                    setTemplateReferenceDuplicate(false);
                  }
                }}
                placeholder="Ex: REF001..."
                className={templateReferenceDuplicate ? 'border-red-500 focus:border-red-500' : ''}
              />
              {templateReferenceDuplicate && (
                <p className="text-xs text-red-500 mt-1">
                  ⚠️ Cette référence existe déjà dans la base de données
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => {
                  setShowTemplateDialog(false);
                  setNewTemplateData({
                    name: '',
                    category: '',
                    description: '',
                    reference_number: '',
                    date_fin: '',
                    fourchette_min: '',
                    fourchette_max: '',
                    entrepot: '',
                    fournisseur: '',
                  });
                }}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold px-6 py-2 rounded-lg"
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={templateReferenceDuplicate}
                className={`bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-2 rounded-lg ${templateReferenceDuplicate ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                ✓ Créer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Product Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-2xl">Détails du Produit</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-4 space-y-4">
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 rounded-lg border-2 border-blue-300">
              <p className="text-xs text-blue-600 font-semibold mb-1">Nom du Produit</p>
              <p className="text-2xl font-bold text-blue-900">{selectedProductForDetails?.name}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-600 font-semibold mb-1">Référence</p>
                <p className="text-lg font-bold text-slate-900">{selectedProductForDetails?.reference}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-600 font-semibold mb-1">ID Produit</p>
                <p className="text-sm font-mono text-slate-900">{selectedProductForDetails?.id}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className={`p-4 rounded-lg border-2 ${
                selectedProductForDetails?.quantity_available < 5 ? 'bg-red-50 border-red-300' :
                selectedProductForDetails?.quantity_available < 10 ? 'bg-orange-50 border-orange-300' :
                'bg-green-50 border-green-300'
              }`}>
                <p className={`text-xs font-semibold mb-1 ${
                  selectedProductForDetails?.quantity_available < 5 ? 'text-red-600' :
                  selectedProductForDetails?.quantity_available < 10 ? 'text-orange-600' :
                  'text-green-600'
                }`}>
                  Quantité en Stock
                </p>
                <p className={`text-3xl font-bold ${
                  selectedProductForDetails?.quantity_available < 5 ? 'text-red-600' :
                  selectedProductForDetails?.quantity_available < 10 ? 'text-orange-600' :
                  'text-green-600'
                }`}>
                  {selectedProductForDetails?.quantity_available}
                </p>
                <p className={`text-xs mt-1 ${
                  selectedProductForDetails?.quantity_available < 5 ? 'text-red-600' :
                  selectedProductForDetails?.quantity_available < 10 ? 'text-orange-600' :
                  'text-green-600'
                }`}>
                  unités disponibles
                </p>
              </div>
              <div className="bg-emerald-50 p-4 rounded-lg border-2 border-emerald-300">
                <p className="text-xs text-emerald-600 font-semibold mb-1">Prix de Vente</p>
                <p className="text-3xl font-bold text-emerald-900">{selectedProductForDetails?.sale_price?.toFixed(2)}</p>
                <p className="text-xs text-emerald-600 mt-1">MAD / unité</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                <p className="text-xs text-orange-600 font-semibold mb-1">Prix d'Achat</p>
                <p className="text-lg font-bold text-orange-900">{selectedProductForDetails?.purchase_price?.toFixed(2)} MAD</p>
              </div>
              <div className="bg-cyan-50 p-4 rounded-lg border border-cyan-200">
                <p className="text-xs text-cyan-600 font-semibold mb-1">Marge Bénéficiaire</p>
                <p className="text-lg font-bold text-cyan-900">
                  {((selectedProductForDetails?.sale_price - selectedProductForDetails?.purchase_price) / selectedProductForDetails?.purchase_price * 100).toFixed(1)}%
                </p>
              </div>
              <div className="bg-rose-50 p-4 rounded-lg border border-rose-200">
                <p className="text-xs text-rose-600 font-semibold mb-1">Valeur Stock</p>
                <p className="text-lg font-bold text-rose-900">
                  {(selectedProductForDetails?.quantity_available * selectedProductForDetails?.purchase_price).toFixed(2)} MAD
                </p>
              </div>
            </div>

            {getSupplierDetails(selectedProductForDetails?.supplier_id) ? (
              <div className="bg-purple-50 p-4 rounded-lg border-2 border-purple-300 space-y-3">
                <div>
                  <p className="text-xs text-purple-600 font-semibold mb-1">Fournisseur</p>
                  <p className="text-lg font-bold text-purple-900">{getSupplierDetails(selectedProductForDetails?.supplier_id)?.name}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {getSupplierDetails(selectedProductForDetails?.supplier_id)?.email && (
                    <div>
                      <p className="text-xs text-purple-600 font-semibold">Email</p>
                      <p className="text-purple-900">{getSupplierDetails(selectedProductForDetails?.supplier_id)?.email}</p>
                    </div>
                  )}
                  {getSupplierDetails(selectedProductForDetails?.supplier_id)?.phone && (
                    <div>
                      <p className="text-xs text-purple-600 font-semibold">Téléphone</p>
                      <p className="text-purple-900">{getSupplierDetails(selectedProductForDetails?.supplier_id)?.phone}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
