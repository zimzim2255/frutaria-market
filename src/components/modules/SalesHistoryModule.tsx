import { useState, useEffect } from 'react';
import { projectId } from '../../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { 
  Search, 
  Eye, 
  Download, 
  FileText, 
  Calendar, 
  MapPin, 
  User, 
  DollarSign,
  Truck,
  CheckCircle,
  Clock,
  AlertCircle,
  History,
  Filter,
  ShoppingCart,
  Package,
  XCircle
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { SalesDetailsPage } from '../SalesDetailsPage';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface SalesHistoryModuleProps {
  session: any;
}

interface SaleRecord {
  id: string;
  sale_number: string;
  stores?: { name: string; id: string };
  total_amount: number;
  amount_paid: number;
  remaining_balance: number;
  payment_status: string;
  delivery_status: string;
  created_at: string;
  received_date?: string;
  received_by?: string;
  notes?: string;
  sale_items?: any[];
  payment_notes?: string;
  // Remise fields can come in different shapes depending on DB/API version
  remise?: number | null;
  remise_amount?: number | null;
  discount_amount?: number | null;
  total_discount?: number | null;
  totalRemise?: number | null;
  total_remise?: number | null;
}

interface SaleHistory {
  id: string;
  sale_id: string;
  action: string;
  old_value?: string;
  new_value?: string;
  changed_by?: string;
  changed_at: string;
  notes?: string;
}

export function SalesHistoryModule({ session }: SalesHistoryModuleProps) {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [selectedMagasinForAdmin, setSelectedMagasinForAdmin] = useState<string>('');

  const getSaleRemise = (s: any) => {
    // Backend now persists the remise amount under `total_remise`.
    // Keep older fallbacks for backward compatibility.
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
  const [currentUserRole, setCurrentUserRole] = useState<string>('user');
  const [currentUserPermissions, setCurrentUserPermissions] = useState<string[]>([]);
  const isAdmin = currentUserRole === 'admin';
  const hasPermission = (perm: string) => {
    if (isAdmin) return true;
    return currentUserPermissions.includes(perm);
  };
  const [saleHistory, setSaleHistory] = useState<SaleHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);
  const [selectedSaleHistory, setSelectedSaleHistory] = useState<SaleHistory[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPayment, setFilterPayment] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showPdfExportDialog, setShowPdfExportDialog] = useState(false);

  // Table sorting (A→Z / Z→A + numeric)
  const [sortConfig, setSortConfig] = useState<{ key: 'sale_number' | 'store_name' | 'client_name' | 'total_amount' | 'amount_paid' | 'remaining_balance' | 'remise' | 'payment_status' | 'delivery_status' | 'created_at' | null; direction: 'asc' | 'desc' }>({
    key: null,
    direction: 'asc',
  });

  const exportToExcel = () => {
    try {
      const datePart = new Date().toISOString().split('T')[0];
      const rows = sortedSales;

      const money = (n: any) => `${(Number(n || 0) || 0).toFixed(2)} MAD`;
      const safe = (v: any) => String(v ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const totalAmountX = rows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
      const totalPaidX = rows.reduce((s, r) => s + (Number(r.amount_paid) || 0), 0);
      const totalRemainingX = rows.reduce((s, r) => s + (Number(r.remaining_balance) || 0), 0);
      const totalRemiseX = rows.reduce((s, r) => s + getSaleRemise(r), 0);

      const htmlContent = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body { font-family: Arial, sans-serif; margin: 18px; }
              .title { font-size: 20px; font-weight: bold; text-align: center; margin-bottom: 6px; text-transform: uppercase; }
              .sub { text-align: center; color: #374151; margin-bottom: 14px; font-size: 12px; }
              .stats { margin: 10px 0 16px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; background: #f8fafc; }
              .stats b { color: #111827; }
              table { width: 100%; border-collapse: collapse; }
              th { background: #2563eb; color: white; text-align: left; padding: 8px; font-size: 12px; }
              td { border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; vertical-align: top; }
              tr:nth-child(even) td { background: #f9fafb; }
            </style>
          </head>
          <body>
            <div class="title">RAPPORT - VENTES (BL)</div>
            <div class="sub">Date: ${new Date().toLocaleDateString('fr-FR')}</div>

            <div class="stats">
              <div><b>Nombre de ventes:</b> ${rows.length}</div>
              <div><b>Montant total:</b> ${money(totalAmountX)}</div>
              <div><b>Montant payé:</b> ${money(totalPaidX)}</div>
              <div><b>Solde restant:</b> ${money(totalRemainingX)}</div>
              <div><b>Remise total:</b> ${money(totalRemiseX)}</div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>N° Vente</th>
                  <th>Magasin</th>
                  <th>Client</th>
                  <th>Montant</th>
                  <th>Payé</th>
                  <th>Solde</th>
                  <th>Remise</th>
                  <th>Statut Paiement</th>
                  <th>Statut Livraison</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((s) => `
                  <tr>
                    <td>${safe(s.sale_number || '-')}</td>
                    <td>${safe(s.stores?.name || (s as any).store_name || (s as any).store?.name || '-')}</td>
                    <td>${safe((s as any).client_name || (s as any).client?.name || (s as any).clients?.name || '-')}</td>
                    <td>${money(s.total_amount)}</td>
                    <td>${money(s.amount_paid)}</td>
                    <td>${money(s.remaining_balance)}</td>
                    <td>${money(getSaleRemise(s))}</td>
                    <td>${safe(getPaymentStatusLabel(s.payment_status))}</td>
                    <td>${safe(getDeliveryStatusLabel(s.delivery_status))}</td>
                    <td>${safe(new Date(s.created_at).toLocaleDateString('fr-FR'))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </body>
        </html>
      `;

      const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Rapport_Ventes_BL_${datePart}.xls`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Rapport exporté avec succès');
    } catch (e) {
      console.error('Error exporting ventes BL Excel:', e);
      toast.error("Erreur lors de l'export Excel");
    }
  };

  const exportToPdf = () => {
    try {
      const doc = new jsPDF('l', 'mm', 'a4');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('RAPPORT - VENTES (BL)', 148.5, 14, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 148.5, 20, { align: 'center' });

      const rows = sortedSales.map((s) => [
        s.sale_number || '-',
        s.stores?.name || (s as any).store_name || (s as any).store?.name || '-',
        (s as any).client_name || (s as any).client?.name || (s as any).clients?.name || '-',
        `${(Number(s.total_amount || 0) || 0).toFixed(2)} MAD`,
        `${(Number(s.amount_paid || 0) || 0).toFixed(2)} MAD`,
        `${(Number(s.remaining_balance || 0) || 0).toFixed(2)} MAD`,
        `${getSaleRemise(s).toFixed(2)} MAD`,
        getPaymentStatusLabel(s.payment_status),
        getDeliveryStatusLabel(s.delivery_status),
        new Date(s.created_at).toLocaleDateString('fr-FR'),
      ]);

      autoTable(doc, {
        head: [[
          'N° Vente',
          'Magasin',
          'Client',
          'Montant',
          'Payé',
          'Solde',
          'Remise',
          'Paiement',
          'Livraison',
          'Date',
        ]],
        body: rows,
        startY: 28,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [37, 99, 235] },
      });

      const datePart = new Date().toISOString().split('T')[0];
      doc.save(`Rapport_Ventes_BL_${datePart}.pdf`);
      toast.success('PDF exporté avec succès');
      setShowPdfExportDialog(false);
    } catch (e) {
      console.error('Error exporting ventes BL PDF:', e);
      toast.error("Erreur lors de l'export PDF");
    }
  };

  const fetchStores = async () => {
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/stores`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );
      if (!res.ok) return;
      const json = await res.json();
      const sorted = (json.stores || []).sort((a: any, b: any) => String(a?.name || '').localeCompare(String(b?.name || '')));
      setStores(sorted);
    } catch (e) {
      console.warn('[SalesHistoryModule] could not load stores', e);
    }
  };

  const fetchSales = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/sales?user_id=${session.user.id}`,
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
      toast.error('Erreur lors du chargement des ventes');
    } finally {
      setLoading(false);
    }
  };

  const fetchSaleHistory = async (saleId: string) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/sales/${saleId}/history`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setSelectedSaleHistory(data.history || []);
      }
    } catch (error) {
      console.error('Error fetching sale history:', error);
      toast.error('Erreur lors du chargement de l\'historique');
    }
  };

  useEffect(() => {
    fetchSales();
    fetchStores();
  }, []);

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
        console.error('[SalesHistoryModule] failed to load permissions', e);
      }
    })();
  }, [session?.access_token, session?.user?.id]);

  const handleViewDetails = (sale: SaleRecord) => {
    setSelectedSale(sale);
    fetchSaleHistory(sale.id);
    setShowDetails(true);
  };

  const handleBackFromDetails = () => {
    setShowDetails(false);
    setSelectedSale(null);
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

  const getDeliveryStatusIcon = (status: string) => {
    switch (status) {
      case 'preparing':
        return <Clock className="w-4 h-4" />;
      case 'in_transit':
        return <Truck className="w-4 h-4" />;
      case 'delivered':
        return <CheckCircle className="w-4 h-4" />;
      case 'canceled':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const getPaymentStatusLabel = (status: string) => {
    switch (status) {
      case 'unpaid':
        return 'Non payée';
      case 'partial':
        return 'Partiellement payée';
      case 'paid':
        return 'Payée';
      default:
        return status;
    }
  };

  const getDeliveryStatusLabel = (status: string) => {
    switch (status) {
      case 'preparing':
        return 'Préparation';
      case 'in_transit':
        return 'En transit';
      case 'delivered':
        return 'Livrée';
      case 'canceled':
        return 'Annulée';
      default:
        return status;
    }
  };

  // Filter sales based on search and filters
  const filteredSales = sales.filter(sale => {
    const matchesSearch = 
      sale.sale_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.stores?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String((sale as any).store_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      String((sale as any).store?.name || '').toLowerCase().includes(searchTerm.toLowerCase());

    // Admin magasin selector filter: if admin picked a magasin, only show that magasin's sales.
    const matchesMagasin = isAdmin && selectedMagasinForAdmin
      ? String((sale as any)?.store_id || sale?.stores?.id || '') === String(selectedMagasinForAdmin)
      : true;
    
    const matchesDeliveryStatus = filterStatus === 'all' || sale.delivery_status === filterStatus;
    const matchesPaymentStatus = filterPayment === 'all' || sale.payment_status === filterPayment;
    
    let matchesDateRange = true;
    if (dateFrom || dateTo) {
      const saleDate = new Date(sale.created_at);
      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        matchesDateRange = matchesDateRange && saleDate >= fromDate;
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        matchesDateRange = matchesDateRange && saleDate <= toDate;
      }
    }

    return matchesSearch && matchesDeliveryStatus && matchesPaymentStatus && matchesDateRange && matchesMagasin;
  });

  const sortedSales = (() => {
    if (!sortConfig.key) return filteredSales;

    const dir = sortConfig.direction === 'asc' ? 1 : -1;

    const storeName = (s: any) => String(s.stores?.name || (s as any).store_name || (s as any).store?.name || '');
    const clientName = (s: any) => String((s as any).client_name || (s as any).client?.name || (s as any).clients?.name || '');

    // Numeric sorts
    if (sortConfig.key === 'total_amount') {
      return [...filteredSales].sort((a, b) => (Number(a.total_amount || 0) - Number(b.total_amount || 0)) * dir);
    }
    if (sortConfig.key === 'amount_paid') {
      return [...filteredSales].sort((a, b) => (Number(a.amount_paid || 0) - Number(b.amount_paid || 0)) * dir);
    }
    if (sortConfig.key === 'remaining_balance') {
      return [...filteredSales].sort((a, b) => (Number(a.remaining_balance || 0) - Number(b.remaining_balance || 0)) * dir);
    }
    if (sortConfig.key === 'remise') {
      return [...filteredSales].sort((a, b) => (Number(getSaleRemise(a) || 0) - Number(getSaleRemise(b) || 0)) * dir);
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
        case 'store_name':
          return storeName(s).toLowerCase();
        case 'client_name':
          return clientName(s).toLowerCase();
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

  // Statistics
  const totalSales = sortedSales.length;
  const totalAmount = sortedSales.reduce((sum, sale) => sum + (sale.total_amount || 0), 0);
  const totalPaid = sortedSales.reduce((sum, sale) => sum + (sale.amount_paid || 0), 0);
  const totalRemaining = sortedSales.reduce((sum, sale) => sum + (sale.remaining_balance || 0), 0);
  const deliveredCount = sortedSales.filter(s => s.delivery_status === 'delivered').length;

  // Generate BL document and download PDF using the same flow as Bon de Commande
  const downloadBL = async (sale: SaleRecord) => {
    try {
      console.log('=== BL DOWNLOAD DEBUG ===');
      console.log('Sale object:', JSON.stringify(sale, null, 2));
      console.log('Sale items from sale_items:', sale.sale_items);
      console.log('Sale items from items field:', (sale as any).items);
      
      // Try to get items from either sale_items or items field
      const itemsSource = (sale.sale_items && sale.sale_items.length > 0) ? sale.sale_items : ((sale as any).items || []);
      console.log('Using items source:', itemsSource);
      console.log('Items source length:', itemsSource.length);
      
      // Build items from sale
      const items = itemsSource.map((it: any) => {
        console.log('Processing item:', JSON.stringify(it, null, 2));

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
      console.log('Built items:', JSON.stringify(items, null, 2));
      const subtotal = items.reduce((s: number, it: any) => s + (it.total || 0), 0);
      console.log('Subtotal:', subtotal);
      console.log('=== END BL DOWNLOAD DEBUG ===');

      // Step 1: Create document
      const remiseDoc = getSaleRemise(sale);
      const blPayload = {
        // IMPORTANT: our PDF generation uses `type`/`documentType` to decide the header (FACTURE vs BL).
        // Force BL explicitly here.
        type: 'Bon Livraison',
        documentType: 'Bon Livraison',
        // Use the sale_number so the PDF shows BL-xxxx (and doesn't fallback to invoice numbering)
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
        // IMPORTANT: in documents/template, `remise` is treated as a PERCENTAGE.
        // We only have amount-based remises for sales, so we keep remisePercentage=0 and set totalRemise explicitly.
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
      // Include full items with all fields (caisse, moyenne, etc.)
      q.append('items', JSON.stringify(items.map((it: any) => ({ 
        name: it.name,
        description: it.description, 
        caisse: it.caisse,
        quantity: it.quantity, 
        moyenne: it.moyenne,
        unitPrice: it.unitPrice, 
        total: it.total 
      }))));
      const remiseAmount = Math.max(0, remiseDoc);
      const subtotalAfterRemise = Math.max(0, subtotal - remiseAmount);

      q.append('subtotal', String(subtotal));
      // Keep percentage at 0; we pass amount in totalRemise.
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

  // If showing details, display the full SalesDetailsPage
  if (showDetails && selectedSale) {
    return (
      <SalesDetailsPage
        sale={selectedSale}
        onBack={handleBackFromDetails}
      />
    );
  }

  const canViewSalesHistory = hasPermission("Voir l'Historique des Ventes") || hasPermission('Voir les Ventes');
  const canPrintSale = hasPermission('Imprimer une Vente') || canViewSalesHistory;

  if (!canViewSalesHistory) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 mx-auto text-red-500 mb-2" />
          <p className="text-lg font-semibold">Accès refusé</p>
          <p className="text-sm text-gray-600">Vous n'avez pas la permission de voir l'historique des ventes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Cards - Navbar Style */}
      <div className="flex flex-wrap w-full bg-white p-1 h-auto gap-1 border-b border-gray-200 rounded-lg">
        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-blue-50 border-b-2 border-blue-500 text-blue-600 flex-1 min-w-max">
          <ShoppingCart className="w-5 h-5" />
          <span className="text-xs font-medium">Total Ventes</span>
          <span className="text-lg font-bold">{totalSales}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-purple-50 border-b-2 border-purple-500 text-purple-600 flex-1 min-w-max">
          <DollarSign className="w-5 h-5" />
          <span className="text-xs font-medium">Montant Total</span>
          <span className="text-lg font-bold">{totalAmount.toFixed(2)} MAD</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-green-50 border-b-2 border-green-500 text-green-600 flex-1 min-w-max">
          <CheckCircle className="w-5 h-5" />
          <span className="text-xs font-medium">Montant Payé</span>
          <span className="text-lg font-bold">{totalPaid.toFixed(2)} MAD</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-orange-50 border-b-2 border-orange-500 text-orange-600 flex-1 min-w-max">
          <AlertCircle className="w-5 h-5" />
          <span className="text-xs font-medium">Solde Restant</span>
          <span className="text-lg font-bold">{totalRemaining.toFixed(2)} MAD</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-green-50 border-b-2 border-green-500 text-green-600 flex-1 min-w-max">
          <Package className="w-5 h-5" />
          <span className="text-xs font-medium">Livrées</span>
          <span className="text-lg font-bold">{deliveredCount}</span>
        </div>
      </div>

      {/* Filters (collapsible to save space) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filtres et Recherche
            </CardTitle>
            <Button
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label htmlFor="search">Rechercher</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="search"
                    placeholder="N° vente ou magasin..."
                    className="pl-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="delivery-status">Statut Livraison</Label>
                <select
                  id="delivery-status"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                >
                  <option value="all">Tous</option>
                  <option value="preparing">Préparation</option>
                  <option value="in_transit">En transit</option>
                  <option value="delivered">Livrée</option>
                  <option value="canceled">Annulée</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-status">Statut Paiement</Label>
                <select
                  id="payment-status"
                  value={filterPayment}
                  onChange={(e) => setFilterPayment(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                >
                  <option value="all">Tous</option>
                  <option value="unpaid">Non payée</option>
                  <option value="partial">Partiellement payée</option>
                  <option value="paid">Payée</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="date-from">Du</Label>
                <Input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="date-to">Au</Label>
                <Input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Sales Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Ventes avec Historique (BL)
            </CardTitle>

            <div className="flex gap-2 items-center flex-wrap">
              {isAdmin && (
                <div className="flex items-center gap-2 bg-purple-50 px-3 py-2 rounded-lg border border-purple-200">
                  <Label htmlFor="sales_history_magasin_selector" className="text-sm font-semibold text-purple-700 whitespace-nowrap">
                    Magasin (Admin):
                  </Label>
                  <select
                    id="sales_history_magasin_selector"
                    value={selectedMagasinForAdmin}
                    onChange={(e) => setSelectedMagasinForAdmin(e.target.value)}
                    className="px-3 py-1 border border-purple-300 rounded-md bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">-- Tous --</option>
                    {stores.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <Button onClick={exportToExcel} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Download className="w-4 h-4 mr-2" />
                Exporter Excel
              </Button>

              <Dialog open={showPdfExportDialog} onOpenChange={setShowPdfExportDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="border-blue-600 text-blue-700 hover:bg-blue-50">
                    <FileText className="w-4 h-4 mr-2" />
                    Exporter PDF
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Exporter le rapport (PDF)</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600">
                      Ce PDF exporte la liste des ventes filtrées (BL) en tableau.
                    </p>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setShowPdfExportDialog(false)}>Annuler</Button>
                      <Button onClick={exportToPdf} style={{ backgroundColor: '#ea580c', color: 'white' }}>Exporter</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
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
                            key: 'store_name',
                            direction: prev.key === 'store_name' && prev.direction === 'asc' ? 'desc' : 'asc',
                          }));
                        }}
                      >
                        Magasin
                        <span className="text-xs font-semibold text-blue-600">
                          {sortConfig.key === 'store_name' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
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
                    <TableHead>
                      <button
                        type="button"
                        className="flex items-center gap-2 select-none"
                        title="Trier 0→9 / 9→0"
                        onClick={() => {
                          setSortConfig((prev) => ({
                            key: 'amount_paid',
                            direction: prev.key === 'amount_paid' && prev.direction === 'asc' ? 'desc' : 'asc',
                          }));
                        }}
                      >
                        Payé
                        <span className="text-xs font-semibold text-blue-600">
                          {sortConfig.key === 'amount_paid' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
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
                        Solde
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
                            key: 'remise',
                            direction: prev.key === 'remise' && prev.direction === 'asc' ? 'desc' : 'asc',
                          }));
                        }}
                      >
                        Remise
                        <span className="text-xs font-semibold text-blue-600">
                          {sortConfig.key === 'remise' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
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
                        Livraison
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
                      <TableCell colSpan={11} className="text-center text-gray-500 py-8">
                        Aucune vente trouvée
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedSales.map((sale) => (
                      <TableRow key={sale.id} className="hover:bg-gray-50">
                        <TableCell className="font-medium">{sale.sale_number}</TableCell>
                        <TableCell>{sale.stores?.name || (sale as any).store_name || (sale as any).store?.name || '-'}</TableCell>
                        <TableCell>{(sale as any).client_name || (sale as any).client?.name || (sale as any).clients?.name || '-'}</TableCell>
                        <TableCell className="font-semibold">{sale.total_amount?.toFixed(2)} MAD</TableCell>
                        <TableCell className="text-green-600 font-medium">{sale.amount_paid?.toFixed(2)} MAD</TableCell>
                        <TableCell className="text-orange-600 font-medium">{sale.remaining_balance?.toFixed(2)} MAD</TableCell>
                        <TableCell className="text-blue-700 font-medium">{getSaleRemise(sale).toFixed(2)} MAD</TableCell>
                        <TableCell>
                          <Badge className={getPaymentStatusColor(sale.payment_status)}>
                            {getPaymentStatusLabel(sale.payment_status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getDeliveryStatusIcon(sale.delivery_status)}
                            <Badge className={getDeliveryStatusColor(sale.delivery_status)}>
                              {getDeliveryStatusLabel(sale.delivery_status)}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(sale.created_at).toLocaleDateString('fr-FR')}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewDetails(sale)}
                            title="Voir les détails et l'historique"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
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
                            title="Télécharger le Bon Livraison"
                            className={!canPrintSale ? 'opacity-50 cursor-not-allowed' : ''}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
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

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-800">
            <History className="w-5 h-5" />
            À propos des Ventes avec Historique
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-blue-700 space-y-2">
            <p>• <strong>BL (Bon Livraison)</strong>: Document de livraison pour chaque vente</p>
            <p>• <strong>Historique complet</strong>: Suivi de tous les changements de statut et paiements</p>
            <p>• <strong>Filtrage avancé</strong>: Recherchez par date, statut de livraison ou paiement</p>
            <p>• <strong>Téléchargement</strong>: Exportez les bons de livraison en PDF</p>
            <p>• <strong>Traçabilité</strong>: Chaque action est enregistrée avec date et heure</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
