import { useState, useEffect } from 'react';
import { projectId } from '../../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Plus, Edit, Trash2, Search, Users, TrendingUp, TrendingDown, Eye, DollarSign, Download } from 'lucide-react';
import { Badge } from '../ui/badge';
import { toast } from 'sonner@2.0.3';
import { ClientDetailsPage } from '../ClientDetailsPage';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { exportToExcel } from '../../utils/export/excelExport';

interface ClientsModuleProps {
  session: any;
}

export function ClientsModule({ session }: ClientsModuleProps) {
  // Mixed entities table: clients + magasins (stores)
  // We keep the state name `clients` for minimal refactor, but rows may include:
  // - __entityType: 'client' | 'store'
  // - __isStore: boolean
  const [clients, setClients] = useState<any[]>([]);
  const [currentStore, setCurrentStore] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState<number>(0);
  const [isButtonDisabled, setIsButtonDisabled] = useState<boolean>(false);
  
  // Countdown effect while loading
  useEffect(() => {
    if (loading) {
      setCountdown(3);
      const countdownInterval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(countdownInterval);
    } else {
      setCountdown(0);
      setIsButtonDisabled(false);
    }
  }, [loading]);

  const [currentUserRole, setCurrentUserRole] = useState<string>('user');
  const [currentUserPermissions, setCurrentUserPermissions] = useState<string[]>([]);

  const isAdmin = currentUserRole === 'admin';
  const hasPermission = (permission: string): boolean => {
    if (isAdmin) return true;
    return currentUserPermissions.includes(permission);
  };

  const canViewClients = hasPermission('Voir les Clients');
  const canAddClient = isAdmin;
  const canEditClient = hasPermission('Modifier un Client');
  const canDeleteClient = hasPermission('Supprimer un Client');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [clientCounters, setClientCounters] = useState<{ [key: string]: number }>({});
  const [clientFinancials, setClientFinancials] = useState<{ [key: string]: any }>({});
  const [clientDiscounts, setClientDiscounts] = useState<{ [key: string]: number }>({});
  const [globalPaymentDialogOpen, setGlobalPaymentDialogOpen] = useState(false);
  const [globalPaymentClientSearch, setGlobalPaymentClientSearch] = useState('');
  const [globalPaymentSelectedClient, setGlobalPaymentSelectedClient] = useState<any>(null);
  const [globalPaymentAmount, setGlobalPaymentAmount] = useState('');
  const [globalPaymentRemiseAmount, setGlobalPaymentRemiseAmount] = useState('');
  const [globalPaymentReference, setGlobalPaymentReference] = useState('');
  const [globalPaymentLoading, setGlobalPaymentLoading] = useState(false);
  const [globalPaymentMethod, setGlobalPaymentMethod] = useState<'cash' | 'check' | 'bank_transfer'>('cash');
  const [globalPaymentDate, setGlobalPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [checks, setChecks] = useState<any[]>([]);
  const [selectedCheck, setSelectedCheck] = useState<any>(null);
  const [bankProofFile, setBankProofFile] = useState<File | null>(null);
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
  // Multi-payment method support
  const [additionalPaymentMethod, setAdditionalPaymentMethod] = useState<'cash' | 'check' | 'bank_transfer' | null>(null);
  const [additionalPaymentAmount, setAdditionalPaymentAmount] = useState('');
  const [selectedAdditionalCheck, setSelectedAdditionalCheck] = useState<any>(null);
  const [checkDialogOpenAdditional, setCheckDialogOpenAdditional] = useState(false);
  const [checkSearchTermAdditional, setCheckSearchTermAdditional] = useState('');
  const [additionalBankProofFile, setAdditionalBankProofFile] = useState<File | null>(null);
  const [createAdditionalCheckDialogOpen, setCreateAdditionalCheckDialogOpen] = useState(false);
  const [uploadAdditionalFile, setUploadAdditionalFile] = useState<File | null>(null);
  const [uploadAdditionalCheckId, setUploadAdditionalCheckId] = useState('');
  const [uploadAdditionalAmount, setUploadAdditionalAmount] = useState('');
  const [uploadAdditionalNotes, setUploadAdditionalNotes] = useState('');
  const [uploadAdditionalGiverName, setUploadAdditionalGiverName] = useState('');
  const [uploadAdditionalCheckDate, setUploadAdditionalCheckDate] = useState('');
  const [uploadAdditionalExecutionDate, setUploadAdditionalExecutionDate] = useState('');
  const [uploadAdditionalLoading, setUploadAdditionalLoading] = useState(false);

  // Check inventory selection rules for Paiement Global Client
  // Business rule:
  // - Must NOT show checks with status: received / used / utilised / encashed / cashed / archived
  // - Must show checks with status: pending / partial / partly_used (depending on deployment)
  // - For partial/partly_used: use remaining_balance only
  const getCheckAvailableAmount = (check: any): number => {
    const status = String(check?.status || '').toLowerCase().trim();

    // Support multiple status spellings used across deployments
    if (status === 'partial' || status === 'partly_used' || status === 'partially_used') {
      return Number(check?.remaining_balance ?? 0) || 0;
    }

    // pending
    return Number(check?.amount_value ?? check?.remaining_balance ?? 0) || 0;
  };

  const isCheckSelectable = (check: any): boolean => {
    const status = String(check?.status || '').toLowerCase().trim();

    // Hide finalized states
    const blockedStatuses = new Set([
      'received',
      'recived',
      'used',
      'utilise',
      'utilisé',
      'encashed',
      'cashed',
      'paid',
      'archived',
    ]);

    if (blockedStatuses.has(status)) return false;

    // Allow only selectable states
    const allowedStatuses = new Set(['pending', 'partial', 'partly_used', 'partially_used']);
    if (!allowedStatuses.has(status)) return false;

    return getCheckAvailableAmount(check) > 0;
  };

  const [sortOrder, setSortOrder] = useState<'high-to-low' | 'low-to-high'>('high-to-low');
  const [showZeroBalanceOnly, setShowZeroBalanceOnly] = useState(false);
  const [showNonZeroBalanceOnly, setShowNonZeroBalanceOnly] = useState(false);
  const [userRole, setUserRole] = useState<string>('user');
  const [displayLimit, setDisplayLimit] = useState<number>(100);

  // Table sorting (A→Z / Z→A)
  const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'phone' | 'total_invoiced' | 'total_paid' | 'total_remaining' | null; direction: 'asc' | 'desc' }>({
    key: null,
    direction: 'asc',
  });
  const [allStores, setAllStores] = useState<any[]>([]);
  const [globalPaymentSelectedEntrepot, setGlobalPaymentSelectedEntrepot] = useState<any>(null);
  // Admin must choose store BEFORE doing any admin action (global payment / create client)
  const [adminSelectedStoreId, setAdminSelectedStoreId] = useState<string>('');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    ice: '',
    if_number: '',
    rc: '',
    patente: '',
    is_passage: false,
  });

  // Export to PDF function
  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Title
    doc.setFontSize(16);
    doc.text('Rapport des Clients', pageWidth / 2, 15, { align: 'center' });
    
    // Date
    doc.setFontSize(10);
    doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, pageWidth / 2, 22, { align: 'center' });
    
    // Filter info
    doc.setFontSize(9);
    const filterInfo = showZeroBalanceOnly ? 'Filtre: Solde = 0 MAD' : `Tri: ${sortOrder === 'high-to-low' ? 'Élevé à Bas' : 'Bas à Élevé'}`;
    doc.text(filterInfo, 14, 30);
    
    // Prepare table data
    const tableData = filteredClientsForExport.map(client => {
      const financials = clientFinancials[client.id] || { totalInvoiced: 0, totalPaid: 0, totalRemaining: 0 };
      const discountAmount = Number(clientDiscounts[client.id] || 0) || 0;

      // IMPORTANT:
      // - UI Solde Restant is (totalInvoiced - totalPaid - remise)
      // - It can be NEGATIVE (client credit). PDF must show the negative value too.
      const soldRestantApresRemise =
        (Number(financials.totalInvoiced) || 0) - (Number(financials.totalPaid) || 0) - discountAmount;

      // Client credit (positive number) when paid > invoiced (or soldRestantApresRemise < 0)
      const credit = Math.max(0, -soldRestantApresRemise);

      return [
        client.name,
        client.phone || '-',
        client.address || '-',
        (Number(financials.totalInvoiced) || 0).toFixed(2),
        (Number(financials.totalPaid) || 0).toFixed(2),
        discountAmount.toFixed(2),
        soldRestantApresRemise.toFixed(2),
        'ACTIF'
      ];
    });
    
    // Add table
    (doc as any).autoTable({
      head: [['Nom du Client', 'Téléphone', 'Adresse', 'Total Facturé', 'Total Payé', 'Remise', 'Solde Restant (après remise)', 'Statut']],
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
    doc.text(`Total Clients: ${filteredClientsForExport.length}`, 14, finalY);
    
    const totalInvoiced = filteredClientsForExport.reduce((sum, c) => sum + (clientFinancials[c.id]?.totalInvoiced || 0), 0);
    const totalPaid = filteredClientsForExport.reduce((sum, c) => sum + (clientFinancials[c.id]?.totalPaid || 0), 0);
    // Include negative balances in summary (credit reduces total remaining)
    const totalRemaining = filteredClientsForExport.reduce((sum, c) => {
      const f = clientFinancials[c.id] || { totalRemaining: 0, totalInvoiced: 0, totalPaid: 0 };
      const discount = Number(clientDiscounts[c.id] || 0) || 0;
      return sum + ((Number(f.totalInvoiced) || 0) - (Number(f.totalPaid) || 0) - discount);
    }, 0);
    
    doc.text(`Total Solde Restant: ${totalRemaining.toFixed(2)} MAD`, 14, finalY + 6);
    
    // Save PDF
    doc.save(`clients_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('PDF exporté avec succès');
  };

  // Export to Excel function
  const exportToExcelFile = () => {
    // Prepare table data
    const tableData = filteredClientsForExport.map(client => {
      const financials = clientFinancials[client.id] || { totalInvoiced: 0, totalPaid: 0, totalRemaining: 0 };
      const discountAmount = Number(clientDiscounts[client.id] || 0) || 0;

      // IMPORTANT:
      // - UI Solde Restant is (totalInvoiced - totalPaid - remise)
      // - It can be NEGATIVE (client credit). Excel must show the negative value too.
      const soldRestantApresRemise =
        (Number(financials.totalInvoiced) || 0) - (Number(financials.totalPaid) || 0) - discountAmount;

      return {
        name: client.name,
        phone: client.phone || '-',
        address: client.address || '-',
        totalInvoiced: (Number(financials.totalInvoiced) || 0).toFixed(2),
        totalPaid: (Number(financials.totalPaid) || 0).toFixed(2),
        discount: discountAmount.toFixed(2),
        remainingBalance: soldRestantApresRemise.toFixed(2),
        status: 'ACTIF'
      };
    });

    // Define columns for Excel export
    const columns = [
      { header: 'Nom du Client', accessor: (row: any) => row.name },
      { header: 'Téléphone', accessor: (row: any) => row.phone },
      { header: 'Adresse', accessor: (row: any) => row.address },
      { header: 'Total Facturé (MAD)', accessor: (row: any) => row.totalInvoiced },
      { header: 'Total Payé (MAD)', accessor: (row: any) => row.totalPaid },
      { header: 'Remise (MAD)', accessor: (row: any) => row.discount },
      { header: 'Solde Restant (MAD)', accessor: (row: any) => row.remainingBalance },
      { header: 'Statut', accessor: (row: any) => row.status }
    ];

    // Export to Excel
    exportToExcel(tableData, columns, `clients_${new Date().toISOString().split('T')[0]}`);
    toast.success('Excel exporté avec succès');
  };

  // Fetch current store and clients
  const fetchClientsData = async () => {
    try {
      setLoading(true);

      // First, get the current user's store
      const userResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/users`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      // IMPORTANT: we need the resolved user role inside this function synchronously.
      // Do not rely on React state updates.
      let currentUser: any = null;

      if (userResponse.ok) {
        const userData = await userResponse.json();
        currentUser = userData.users?.find((u: any) => u.email === session.user?.email) || null;
      
      if (currentUser) {
      setCurrentUserRole(currentUser.role || 'user');
      setCurrentUserPermissions(Array.isArray(currentUser.permissions) ? currentUser.permissions : []);

      console.log('[ClientsModule] resolved current user permissions:', {
        id: currentUser.id,
        email: currentUser.email,
        role: currentUser.role,
        permissionsCount: Array.isArray(currentUser.permissions) ? currentUser.permissions.length : 0,
      });
      }
      
      if (currentUser?.store_id) {
          try {
            // Fetch the store details
            const storeResponse = await fetch(
              `https://${projectId}.supabase.co/functions/v1/super-handler/stores/${currentUser.store_id}`,
              {
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                },
              }
            );

            if (storeResponse.ok) {
              const storeData = await storeResponse.json();
              setCurrentStore(storeData.store);
            }
            // Silently fail if store endpoint doesn't exist or returns error
          } catch (storeError) {
            console.warn('Could not fetch store details:', storeError);
          }
        }
      }

      // Fetch clients AND magasins (stores) so they can be displayed together
      const [clientsResponse, storesResponse] = await Promise.all([
        fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/clients`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/stores`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }),
      ]);

      const clientsPayload = clientsResponse.ok ? await clientsResponse.json() : { clients: [] };
      const storesPayload = storesResponse.ok ? await storesResponse.json() : { stores: [] };

      // Resolve current store + populate admin stores dropdown from the /stores list
      // NOTE: currentStore can be resolved later once DB user/store linking is available.

      // IMPORTANT: don't rely on React state `currentUserRole` here because it may still be the default
      // value due to async setState. Use the fetched `currentUser` role (or auth metadata) instead.
      const resolvedRole = String(currentUser?.role || session?.user?.user_metadata?.role || '').toLowerCase();

      if (resolvedRole === 'admin') {
        const sortedStores = (storesPayload.stores || [])
          .slice()
          .sort((a: any, b: any) => String(a?.name || '').localeCompare(String(b?.name || '')));
        setAllStores(sortedStores);
      }

      const realClients = (clientsPayload.clients || []).map((c: any) => ({
        ...c,
        __entityType: 'client',
        __isStore: false,
      }));

      // Only admins should see magasins (stores) inside the Clients table.
      // For manager/user accounts, the Clients page must show ONLY real clients.
      // IMPORTANT: use resolvedRole (not currentUserRole state) to prevent intermittent empty dropdown/table.
      const magasinsAsClients = (resolvedRole === 'admin')
        ? (storesPayload.stores || []).map((s: any) => ({
            ...s,
            // normalize fields for table
            phone: s.phone || '',
            address: s.address || '',
            ice: '',
            if_number: '',
            rc: '',
            patente: '',
            // for filtering by adminSelectedStoreId
            store_id: s.id,
            __entityType: 'store',
            __isStore: true,
          }))
        : [];

      setClients([...(realClients || []), ...(magasinsAsClients || [])]);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  // Fetch user role and stores
  useEffect(() => {
    const fetchUserRoleAndStores = async () => {
      try {
        const userResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/users`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        if (userResponse.ok) {
          const userData = await userResponse.json();
          const currentUser = userData.users?.find((u: any) => u.email === session.user?.email);
          
          if (currentUser) {
            setUserRole(currentUser.role || 'user');
          }
        }

        // Fetch all stores for admin
        if (session?.user?.user_metadata?.role === 'admin') {
          const storesResponse = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/stores`,
            {
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
              },
            }
          );

          if (storesResponse.ok) {
            const storesData = await storesResponse.json();
            const sortedStores = (storesData.stores || []).sort((a: any, b: any) => 
              a.name.localeCompare(b.name)
            );
            setAllStores(sortedStores);
          }
        }
      } catch (error) {
        console.error('Error fetching user role and stores:', error);
      }
    };

    fetchUserRoleAndStores();
  }, [session.access_token]);

  useEffect(() => {
    fetchClientsData();
  }, []);

  // Fetch financial data for all clients
  // IMPORTANT: UI "Solde Restant" is based on financials, not clients.balance.
  // So we compute it from:
  // - invoices remaining_balance
  // - PLUS sales that are unpaid/partial (amount we owe client per your rule)
  useEffect(() => {
    const computeSaleRemainingForClient = (sale: any) => {
      const status = String(sale?.payment_status || 'unpaid').toLowerCase();
      const total = Number(sale?.total_amount || 0) || 0;
      const paid = Number(sale?.amount_paid || 0) || 0;

      const remaining = sale?.remaining_balance !== undefined && sale?.remaining_balance !== null
        ? (Number(sale.remaining_balance) || 0)
        : Math.max(0, total - paid);

      if (status === 'paid') return 0;
      if (status === 'partial') return Math.max(0, remaining);
      // unpaid
      return Math.max(0, remaining > 0 ? remaining : total);
    };

    const doesSaleMatchClient = (sale: any, client: any) => {
      const saleName = String(sale?.client_name || '').trim().toLowerCase();
      const salePhone = String(sale?.client_phone || '').trim();
      const saleIce = String(sale?.client_ice || '').trim();

      const clientName = String(client?.name || '').trim().toLowerCase();
      const clientPhone = String(client?.phone || '').trim();
      const clientIce = String(client?.ice || '').trim();

      // Prefer strong keys
      if (clientIce && saleIce && clientIce === saleIce) return true;
      if (clientPhone && salePhone && clientPhone === salePhone) return true;

      // Fallback
      if (clientName && saleName && clientName === saleName) return true;

      return false;
    };

    const fetchFinancialData = async () => {
      try {
        const [invoicesResponse, salesResponse, gpResponse, storeGpResponse] = await Promise.all([
          fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/invoices`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` },
          }),
          fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/sales?user_id=${session.user.id}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` },
          }),
          fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/client-global-payments`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` },
          }),
          fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/store-global-payments`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` },
          }),
        ]);

        const invoicesPayload = invoicesResponse.ok ? await invoicesResponse.json() : { invoices: [] };
        const salesPayload = salesResponse.ok ? await salesResponse.json() : { sales: [] };
        const gpPayload = gpResponse.ok ? await gpResponse.json() : { client_global_payments: [] };
        const storeGpPayload = storeGpResponse.ok ? await storeGpResponse.json() : { store_global_payments: [] };

        const invoices = invoicesPayload.invoices || [];
        const sales = salesPayload.sales || [];
        const globalPayments = gpPayload.client_global_payments || [];
        const storeGlobalPayments = storeGpPayload.store_global_payments || [];

        const financials: { [key: string]: any } = {};

        clients.forEach(client => {
          const isStoreEntity = Boolean((client as any).__isStore);

          const clientInvoices = invoices.filter((inv: any) => {
            if (isStoreEntity) {
              return String(inv.store_id || '') === String(client.id) || String(inv.client_name || '') === String(client.name || '');
            }
            return inv.client_ice === client.ice || inv.client_name === client.name;
          });

          const totalInvoicedInvoices = clientInvoices.reduce((sum: number, inv: any) => sum + (inv.total_amount || 0), 0);
          const totalPaid = clientInvoices.reduce((sum: number, inv: any) => sum + (inv.amount_paid || 0), 0);
          const totalRemainingInvoices = clientInvoices.reduce((sum: number, inv: any) => sum + (inv.remaining_balance || 0), 0);

          // Add SALES amounts to totals
          const clientSales = sales.filter((s: any) => {
            const sn = String(s?.sale_number || '');

            if (isStoreEntity) {
              // For magasin entity, count only PURCHASE/TRANSFER rows related to that store.
              if (!sn.startsWith('PURCHASE-') && !sn.startsWith('TRANSFER-')) return false;
              const sid = String(client.id);
              const src = s?.source_store_id ? String(s.source_store_id) : '';
              const dst = s?.store_id ? String(s.store_id) : '';
              return src === sid || dst === sid;
            }

            // For real clients: ignore system purchase/transfer rows
            if (sn.startsWith('PURCHASE-') || sn.startsWith('TRANSFER-')) return false;
            return doesSaleMatchClient(s, client);
          });

          // Total Facturé should include ALL sales totals
          const totalInvoicedSales = clientSales.reduce((sum: number, s: any) => sum + (Number(s?.total_amount || 0) || 0), 0);

          const totalRemainingSales = clientSales.reduce((sum: number, s: any) => sum + computeSaleRemainingForClient(s), 0);

          const totalPaidSales = clientSales.reduce((sum: number, s: any) => {
            const status = String(s?.payment_status || 'unpaid').toLowerCase();
            const total = Number(s?.total_amount || 0) || 0;
            const paid = Number(s?.amount_paid || 0) || 0;

            if (status === 'paid') return sum + total;
            if (status === 'partial') return sum + Math.max(0, paid);
            return sum;
          }, 0);

          // IMPORTANT:
          // client_global_payments may be either:
          // 1) Applied: invoices/sales already updated => adding it again would double-count
          // 2) History-only: no invoice/sale updated (client balance was 0 or unmatched) => must count it here
          //
          // To avoid double-counting, only count HISTORY-ONLY payments (those that didn't apply to any item).
          // We detect that from the standard note pattern: "history-only".
          // NOTE: Avoid double payment/double counting.
          // A client_global_payment can be:
          // - applied (it already updated invoices/sales.amount_paid)
          // - history-only (no invoice/sale updated)
          // We must count only history-only payments here.
          // Robust detection: accept both legacy strings.
          const globalPaymentsHistoryOnlySum = (globalPayments || [])
            .filter((p: any) => {
              const notes = String(p?.notes || '').toLowerCase();
              const clientIdMatch = String(p?.client_id || '') === String(client?.id || '');
              return clientIdMatch && (notes.includes('history-only') || notes.includes('historique uniquement'));
            })
            .reduce((sum: number, p: any) => sum + (Number(p?.amount || 0) || 0), 0);

          const totalInvoicedAmount = (totalInvoicedInvoices || 0) + (totalInvoicedSales || 0);
          const totalPaidAmount = (totalPaid || 0) + (totalPaidSales || 0) + globalPaymentsHistoryOnlySum;

          financials[client.id] = {
            totalInvoiced: totalInvoicedAmount,
            totalPaid: totalPaidAmount,
            // IMPORTANT: allow negative remaining balance (client credit) when overpaid.
            // UI must display it instead of clamping to 0.
            totalRemaining: (Number(totalInvoicedAmount) || 0) - (Number(totalPaidAmount) || 0),
          };
        });

        setClientFinancials(financials);
      } catch (error) {
        console.error('Error fetching financial data:', error);
      }
    };

    if (clients.length > 0) {
      fetchFinancialData();
    }
  }, [clients, session.access_token, session.user.id]);

  // Fetch discount data for all clients
  // IMPORTANT: "Remise Donnée" in /clients must include remises coming from:
  // - discounts table (global payment remises, manual remises, etc.)
  // - sales table (BL / ventes) => total_remise
  // - invoices table (factures) => total_remise
  // Because the app stores remise in multiple places, we aggregate from all sources.
  // We must also avoid double-counting when a discount row links to a sale/invoice.
  useEffect(() => {
    const fetchDiscountData = async () => {
      try {
        const [discountsResponse, salesResponse, invoicesResponse] = await Promise.all([
          fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/discounts`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` },
          }),
          fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/sales?user_id=${session.user.id}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` },
          }),
          fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/invoices`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` },
          }),
        ]);

        const discountsPayload = discountsResponse.ok ? await discountsResponse.json() : { discounts: [] };
        const salesPayload = salesResponse.ok ? await salesResponse.json() : { sales: [] };
        const invoicesPayload = invoicesResponse.ok ? await invoicesResponse.json() : { invoices: [] };

        const discounts = discountsPayload.discounts || [];
        const sales = salesPayload.sales || [];
        const invoices = invoicesPayload.invoices || [];

        const getSaleRemise = (s: any): number => {
          const v =
            s?.total_remise ??
            s?.totalRemise ??
            s?.remise_amount ??
            s?.discount_amount ??
            s?.total_discount ??
            s?.remise ??
            0;
          const n = typeof v === 'string' ? Number(String(v).replace(',', '.')) : Number(v);
          return Number.isFinite(n) ? Math.max(0, Math.abs(n)) : 0;
        };

        const getInvoiceRemise = (inv: any): number => {
          const v =
            (inv as any)?.pending_discount ??
            (inv as any)?.pendingDiscount ??
            (inv as any)?.total_remise ??
            (inv as any)?.totalRemise ??
            (inv as any)?.remise_amount ??
            (inv as any)?.discount_amount ??
            (inv as any)?.total_discount ??
            (inv as any)?.remise ??
            0;
          const n = typeof v === 'string' ? Number(String(v).replace(',', '.')) : Number(v);
          return Number.isFinite(n) ? Math.max(0, Math.abs(n)) : 0;
        };

        // Match logic copied from financial computation (same file)
        const doesSaleMatchClient = (sale: any, client: any) => {
          const saleName = String(sale?.client_name || '').trim().toLowerCase();
          const salePhone = String(sale?.client_phone || '').trim();
          const saleIce = String(sale?.client_ice || '').trim();

          const clientName = String(client?.name || '').trim().toLowerCase();
          const clientPhone = String(client?.phone || '').trim();
          const clientIce = String(client?.ice || '').trim();

          if (clientIce && saleIce && clientIce === saleIce) return true;
          if (clientPhone && salePhone && clientPhone === salePhone) return true;
          if (clientName && saleName && clientName === saleName) return true;
          return false;
        };

        const discountsByClient: { [key: string]: number } = {};

        clients.forEach((client) => {
          const clientId = String(client?.id || '').trim();

          // For this client, collect linked docs to avoid double counting
          const linkedSaleIds = new Set<string>();
          const linkedInvoiceIds = new Set<string>();

          const clientDiscountRows = (discounts || []).filter((disc: any) => {
            if (String(disc?.status || '').toLowerCase() !== 'active') return false;
            if (String(disc?.entity_type || '').toLowerCase() !== 'customer') return false;

            const discEntityId = String(disc?.entity_id || '').trim();
            if (discEntityId && clientId && discEntityId === clientId) return true;

            const en = String(disc?.entity_name || '').trim();
            return (en && en === String(client?.name || '').trim()) || (en && en === String(client?.ice || '').trim());
          });

          clientDiscountRows.forEach((d: any) => {
            const rt = String(d?.ref_table || '').toLowerCase().trim();
            const rid = d?.ref_id !== undefined && d?.ref_id !== null ? String(d.ref_id).trim() : '';
            if (!rid) return;
            if (rt === 'sales' || rt === 'sale') linkedSaleIds.add(rid);
            if (rt === 'invoices' || rt === 'invoice') linkedInvoiceIds.add(rid);
          });

          // 1) discounts table
          const discountsSum = clientDiscountRows.reduce(
            (sum: number, disc: any) => sum + (Math.max(0, Math.abs(Number(disc?.discount_amount || 0) || 0))),
            0
          );

          // 2) sales table remises (skip linked sales)
          const salesSum = (sales || [])
            .filter((s: any) => {
              const sn = String(s?.sale_number || '');

              // For real clients: ignore system purchase/transfer rows
              if (!Boolean((client as any).__isStore) && (sn.startsWith('PURCHASE-') || sn.startsWith('TRANSFER-'))) {
                return false;
              }

              if (!doesSaleMatchClient(s, client)) return false;

              const sid = s?.id !== undefined && s?.id !== null ? String(s.id) : '';
              if (sid && linkedSaleIds.has(sid)) return false;

              return true;
            })
            .reduce((sum: number, s: any) => sum + getSaleRemise(s), 0);

          // 3) invoices table remises (skip linked invoices)
          const invoicesSum = (invoices || [])
            .filter((inv: any) => {
              const isStoreEntity = Boolean((client as any).__isStore);
              const matches = isStoreEntity
                ? (String(inv.store_id || '') === String(client.id) || String(inv.client_name || '') === String(client.name || ''))
                : (inv.client_ice === client.ice || inv.client_name === client.name);

              if (!matches) return false;

              const iid = inv?.id !== undefined && inv?.id !== null ? String(inv.id) : '';
              if (iid && linkedInvoiceIds.has(iid)) return false;

              return true;
            })
            .reduce((sum: number, inv: any) => sum + getInvoiceRemise(inv), 0);

          discountsByClient[client.id] = Math.max(0, discountsSum + salesSum + invoicesSum);
        });

        setClientDiscounts(discountsByClient);
      } catch (error) {
        console.error('Error fetching discount data:', error);
      }
    };

    if (clients.length > 0) {
      fetchDiscountData();
    }
  }, [clients, session.access_token, session.user.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Immediately disable button on first click to prevent multiple clicks
    if (isButtonDisabled || loading) return;
    setIsButtonDisabled(true);

    if (!editingClient && !canAddClient) {
      toast.error("Vous n'avez pas la permission « Ajouter un Client »");
      return;
    }

    if (editingClient && !canEditClient) {
      toast.error("Vous n'avez pas la permission « Modifier un Client »");
      return;
    }

    // Duplicate client check (only for new clients, not editing)
    if (!editingClient) {
      const isAdmin = currentUserRole === 'admin';
      const newName = formData.name.trim().toLowerCase().replace(/\s+/g, ' ');
      const newPhone = formData.phone.trim();
      const newIce = formData.ice.trim();
      // For admin, the name will be prefixed with "Admin (client) - "
      const adminPrefixedName = isAdmin ? `admin (client) - ${newName}` : newName;

      // Fetch ALL clients from server to check for duplicates across all stores
      let allClients: any[] = [];
      try {
        const allClientsResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/clients`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );
        if (allClientsResponse.ok) {
          const allClientsData = await allClientsResponse.json();
          allClients = allClientsData.clients || [];
        }
      } catch (error) {
        console.error('Error fetching all clients for duplicate check:', error);
      }

      const duplicate = allClients.find((c: any) => {
        const existingName = String(c.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const existingPhone = String(c.phone || '').trim();
        const existingIce = String(c.ice || '').trim();

        // Check for duplicate by name - handle all cases:
        // 1. Exact name match (non-admin to non-admin)
        // 2. Admin prefix match (admin to admin)
        // 3. Name without prefix matches existing name with prefix (admin creating same as existing admin client)
        // 4. Name with prefix matches existing name without prefix (edge case)
        if (newName && existingName) {
          if (newName === existingName) return true;
          if (adminPrefixedName === existingName) return true;
          if (existingName === `admin (client) - ${newName}`) return true;
          // Also check if existing name starts with admin prefix and matches
          if (existingName.startsWith('admin (client) - ') && existingName.replace('admin (client) - ', '') === newName) return true;
        }

        // Check for duplicate by phone
        if (newPhone && existingPhone && newPhone === existingPhone) return true;

        // Check for duplicate by ICE
        if (newIce && existingIce && newIce === existingIce) return true;

        return false;
      });

      if (duplicate) {
        toast.error('Un client avec ce nom, téléphone ou ICE existe déjà');
        setLoading(false);
        return;
      }
    }

    setLoading(true);

    try {
      const url = editingClient
        ? `https://${projectId}.supabase.co/functions/v1/super-handler/clients/${editingClient.id}`
        : `https://${projectId}.supabase.co/functions/v1/super-handler/clients`;

      // IMPORTANT: permission checks must use DB role (currentUserRole), not session.user_metadata.
      const isAdmin = currentUserRole === 'admin';

      const payload: any = {
        ...formData,
      };

      // Admin must choose which magasin they are creating the client for
      if (!editingClient && isAdmin) {
        if (!adminSelectedStoreId) {
          toast.error('Veuillez sélectionner un magasin pour ce client');
          setLoading(false);
          return;
        }
        payload.store_id = adminSelectedStoreId;
        // Small UI-level audit marker (does not require DB schema changes)
        payload.name = `Admin (client) - ${payload.name}`;
      }

      const response = await fetch(url, {
        method: editingClient ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        toast.success(editingClient ? 'Client modifié' : 'Client ajouté');
        setDialogOpen(false);
        resetForm();
        setAdminSelectedStoreId('');
        fetchClientsData();
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
    // Prevent deleting magasins from Clients table
    const row = clients.find((c: any) => String(c.id) === String(id));
    if (row && (row as any).__isStore) {
      toast.error('Suppression magasin: utilisez la page Magasins');
      return;
    }

    if (!canDeleteClient) {
      toast.error("Vous n'avez pas la permission « Supprimer un Client »");
      return;
    }

    if (!confirm('Êtes-vous sûr de vouloir supprimer ce client?')) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/clients/${id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        toast.success('Client supprimé');
        fetchClientsData();
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      address: '',
      ice: '',
      if_number: '',
      rc: '',
      patente: '',
      is_passage: false,
    });
    setEditingClient(null);
    setAdminSelectedStoreId('');
  };

  const handleEdit = (client: any) => {
    if ((client as any).__isStore) {
      toast.error('Modification magasin: utilisez la page Magasins');
      return;
    }
    if (!canEditClient) {
      toast.error("Vous n'avez pas la permission « Modifier un Client »");
      return;
    }

    setEditingClient(client);
    setFormData({
      name: client.name,
      phone: client.phone,
      address: client.address,
      ice: client.ice || '',
      if_number: client.if_number || '',
      rc: client.rc || '',
      patente: client.patente || '',
      is_passage: !!(client as any).is_passage,
    });
    setDialogOpen(true);
  };

  // Format counter to DD:HH:MM:SS format
  const formatCounter = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${String(days).padStart(2, '0')}:${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Get counter color based on remaining time
  const getCounterColor = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    if (days <= 7) {
      return '#ea580c'; // Orange warning
    }
    return '#3b82f6'; // Blue normal
  };

  // Calculate inactive status for each client (1 month without activity)
  const getClientInactiveStatus = (clientName: string) => {
    // This would need invoice data to calculate properly
    // For now, we'll mark as inactive if no recent activity
    return false; // Placeholder - will be calculated in details page
  };

  const filteredClientsBase = clients.filter(client => {
    // Admin: show all clients when no magasin selected, otherwise filter by selected magasin
    if ((currentUserRole === 'admin' || session?.user?.user_metadata?.role === 'admin') && adminSelectedStoreId) {
      const isStoreEntity = Boolean((client as any).__isStore);
      const rowStoreId = isStoreEntity ? String(client?.id || '') : String(client?.store_id || '');
      if (rowStoreId !== String(adminSelectedStoreId)) return false;
    }
    const matchesSearch = 
      client.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.phone?.includes(searchTerm) ||
      client.ice?.includes(searchTerm) ||
      client.address?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const financials = clientFinancials[client.id] || { totalRemaining: 0 };
    const discountAmount = clientDiscounts[client.id] || 0;
    const adjustedBalance = financials.totalInvoiced - financials.totalPaid - discountAmount;
    
    // Apply balance filters
    // If both are checked, do not filter by balance.
    if (showZeroBalanceOnly && !showNonZeroBalanceOnly && adjustedBalance !== 0) {
      return false;
    }
    if (showNonZeroBalanceOnly && !showZeroBalanceOnly && adjustedBalance === 0) {
      return false;
    }

    return matchesSearch;
  }).sort((a, b) => {
    // Primary sort: adjusted balance (Solde Après Remise)
    const financialsA = clientFinancials[a.id] || { totalRemaining: 0 };
    const discountAmountA = clientDiscounts[a.id] || 0;
    const balanceA = (Number(financialsA.totalInvoiced) || 0) - (Number(financialsA.totalPaid) || 0) - (Number(discountAmountA) || 0);

    const financialsB = clientFinancials[b.id] || { totalRemaining: 0 };
    const discountAmountB = clientDiscounts[b.id] || 0;
    const balanceB = (Number(financialsB.totalInvoiced) || 0) - (Number(financialsB.totalPaid) || 0) - (Number(discountAmountB) || 0);

    const balanceDiff = sortOrder === 'high-to-low' ? (balanceB - balanceA) : (balanceA - balanceB);
    if (balanceDiff !== 0) return balanceDiff;

    // Secondary sort: most recently created first
    const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (aCreated !== bCreated) return bCreated - aCreated;

    // Tertiary sort: stable by name
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  // Clients for PDF export
  // Admin can only export after selecting magasin; non-admin exports current filtered list.
  const filteredClients = filteredClientsBase.sort((a, b) => {
    // Primary sort: adjusted balance (Solde Après Remise)
    const financialsA = clientFinancials[a.id] || { totalRemaining: 0 };
    const discountAmountA = clientDiscounts[a.id] || 0;
    const balanceA = (Number(financialsA.totalInvoiced) || 0) - (Number(financialsA.totalPaid) || 0) - (Number(discountAmountA) || 0);

    const financialsB = clientFinancials[b.id] || { totalRemaining: 0 };
    const discountAmountB = clientDiscounts[b.id] || 0;
    const balanceB = (Number(financialsB.totalInvoiced) || 0) - (Number(financialsB.totalPaid) || 0) - (Number(discountAmountB) || 0);

    const balanceDiff = sortOrder === 'high-to-low' ? (balanceB - balanceA) : (balanceA - balanceB);
    if (balanceDiff !== 0) return balanceDiff;

    // Secondary sort: most recently created first
    const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (aCreated !== bCreated) return bCreated - aCreated;

    // Tertiary sort: stable by name
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  const sortedClients = (() => {
    if (!sortConfig.key) return filteredClients;

    const dir = sortConfig.direction === 'asc' ? 1 : -1;

    const numVal = (c: any, field: 'totalInvoiced' | 'totalPaid' | 'totalRemaining') => {
      const f = clientFinancials[c.id] || { totalInvoiced: 0, totalPaid: 0, totalRemaining: 0 };
      const discount = Number(clientDiscounts[c.id] || 0) || 0;
      if (field === 'totalRemaining') {
        // match UI "Solde restant (après remise)"
        return Math.max(0, (Number(f.totalRemaining) || 0) - discount);
      }
      return Number(f[field] || 0) || 0;
    };

    if (sortConfig.key === 'total_invoiced') {
      return [...filteredClients].sort((a, b) => (numVal(a, 'totalInvoiced') - numVal(b, 'totalInvoiced')) * dir);
    }
    if (sortConfig.key === 'total_paid') {
      return [...filteredClients].sort((a, b) => (numVal(a, 'totalPaid') - numVal(b, 'totalPaid')) * dir);
    }
    if (sortConfig.key === 'total_remaining') {
      return [...filteredClients].sort((a, b) => (numVal(a, 'totalRemaining') - numVal(b, 'totalRemaining')) * dir);
    }

    const strVal = (c: any) => {
      if (sortConfig.key === 'name') return String(c?.name ?? '').toLowerCase();
      if (sortConfig.key === 'phone') return String(c?.phone ?? '').toLowerCase();
      return '';
    };

    return [...filteredClients].sort((a, b) => {
      const av = strVal(a);
      const bv = strVal(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  })();

  // Pagination: display only first `displayLimit` clients
  const displayedClients = sortedClients.slice(0, displayLimit);

  // For export:
  // - Non-admin: export current filtered list
  // - Admin:
  //   - If a magasin is selected: export that magasin's filtered list
  //   - If no magasin is selected: export ALL clients (across all magasins)
  const filteredClientsForExport = (currentUserRole === 'admin' || session?.user?.user_metadata?.role === 'admin')
    ? (adminSelectedStoreId
      ? sortedClients
      : filteredClientsBase)
    : sortedClients;

  // Initialize counters for clients
  useEffect(() => {
    const newCounters: { [key: string]: number } = {};
    filteredClients.forEach(client => {
      if (!clientCounters[client.id]) {
        newCounters[client.id] = 30 * 86400; // 30 days in seconds
      }
    });
    if (Object.keys(newCounters).length > 0) {
      setClientCounters(prev => ({ ...prev, ...newCounters }));
    }
  }, [filteredClients, clientCounters]);

  // Countdown timer effect
  useEffect(() => {
    const interval = setInterval(() => {
      setClientCounters(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(clientId => {
          if (updated[clientId] > 0) {
            updated[clientId] -= 1;
          }
        });
        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const activeClients = sortedClients.filter(c => c.status === 'active');

  // Header "Solde Total" must match the same rows currently displayed by the table
  // (including filters like Solde = 0 / Solde ≠ 0 and search).
  // Also: this page's displayed balance is based on computed financials (invoices/sales/payments) minus remises,
  // not on clients.balance.
  const totalBalance = sortedClients.reduce((sum, c) => {
    const f = clientFinancials[c.id] || { totalInvoiced: 0, totalPaid: 0 };
    const discount = Number(clientDiscounts[c.id] || 0) || 0;
    const adjusted = (Number(f.totalInvoiced) || 0) - (Number(f.totalPaid) || 0) - discount;
    return sum + adjusted;
  }, 0);

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Handle upload check
  const handleUploadCheck = async (e: React.FormEvent) => {
    e.preventDefault();

    // Ensure we're in check mode and auto-apply the created check amount
    if (globalPaymentMethod !== 'check') {
      setGlobalPaymentMethod('check');
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
          
          // Auto-populate the payment amount with the check amount
          if (newCheck && newCheck.amount_value) {
            setGlobalPaymentAmount(newCheck.amount_value.toString());
            setSelectedCheck(newCheck);
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
          
          // Auto-populate the payment amount with the check amount
          if (newCheck && newCheck.amount_value) {
            setGlobalPaymentAmount(newCheck.amount_value.toString());
            setSelectedCheck(newCheck);
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

  // Handle global payment - DEDUCT FROM TOTAL OWED (invoices + sales)
  const handleGlobalPayment = async (e: React.FormEvent) => {
    e.preventDefault();

    // Admin must pick magasin first
    if ((currentUserRole === 'admin' || session?.user?.user_metadata?.role === 'admin') && !adminSelectedStoreId) {
      toast.error('Veuillez sélectionner un magasin avant de continuer');
      return;
    }
    
    if (!globalPaymentSelectedClient) {
      toast.error('Veuillez sélectionner un client');
      return;
    }

    // If a magasin (store) was selected from the mixed list, handle STORE global payment.
    if ((globalPaymentSelectedClient as any).__isStore) {
      const storeId = String(globalPaymentSelectedClient.id);
      const amount = parseFloat(globalPaymentAmount) || 0;

      if (amount <= 0) {
        toast.error('Veuillez entrer un montant de paiement');
        return;
      }

      setGlobalPaymentLoading(true);

      try {
        const paidByStoreId =
          (session?.user?.user_metadata?.role === 'admin'
            ? (adminSelectedStoreId || null)
            : (currentStore?.id || null));

        const paidByStoreName =
          (session?.user?.user_metadata?.role === 'admin'
            ? (allStores.find(s => s.id === adminSelectedStoreId)?.name || null)
            : (currentStore?.name || null));

        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/store-global-payments`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              store_id: storeId,
              amount,
              payment_method: globalPaymentMethod,
              payment_date: globalPaymentDate ? new Date(globalPaymentDate + 'T12:00:00').toISOString() : new Date().toISOString(),
              paid_by_store_id: paidByStoreId,
              paid_by_store_name: paidByStoreName,
              reference_number: String(globalPaymentReference || '').trim() || null,
              notes: 'Paiement global magasin (depuis page Clients)',
            }),
          }
        );

        if (!res.ok) {
          const t = await res.text().catch(() => '');
          toast.error(`Erreur paiement magasin: ${res.status} ${t}`.slice(0, 180));
          return;
        }

        toast.success(`✅ Paiement Magasin enregistré: ${globalPaymentSelectedClient.name}`);

        // Reset form
        setGlobalPaymentDialogOpen(false);
        setGlobalPaymentSelectedClient(null);
        setGlobalPaymentAmount('');
        setGlobalPaymentRemiseAmount('');
        setGlobalPaymentReference('');
        setGlobalPaymentClientSearch('');
        setGlobalPaymentMethod('cash');
        setGlobalPaymentDate(new Date().toISOString().split('T')[0]);
        setAdditionalPaymentMethod(null);
        setAdditionalPaymentAmount('');
        setGlobalPaymentSelectedEntrepot(null);
        setAdminSelectedStoreId('');

        setTimeout(() => {
          fetchClientsData();
        }, 500);

        return;
      } catch (error: any) {
        console.error('Store payment error:', error);
        toast.error(`Erreur: ${error.message}`);
        return;
      } finally {
        setGlobalPaymentLoading(false);
      }
    }

    const amount = parseFloat(globalPaymentAmount) || 0;
    const remiseAmount = parseFloat(globalPaymentRemiseAmount) || 0;

    // Check that at least one amount is provided
    if (amount <= 0 && remiseAmount <= 0) {
      toast.error('Veuillez entrer un montant de paiement ou une remise');
      return;
    }

    const financials = clientFinancials[globalPaymentSelectedClient.id] || { totalRemaining: 0, totalInvoiced: 0 };

    // IMPORTANT BUSINESS RULE:
    // - PAYMENT can exceed remaining debt -> excess becomes client credit.
    // - REMISE must NEVER create credit.
    //   We still SAVE the remise even if current debt is 0, so it can be applied later.
    const debt = Number(financials.totalRemaining || 0) || 0;
    const appliedRemiseNow = Math.min(Math.max(0, remiseAmount), debt);
    const totalToApply = amount + appliedRemiseNow;

    // Allow recording a global payment even if the client's remaining balance is 0.
    // In that case, we will only create a client_global_payments record (audit/history)
    // and we will NOT attempt to update invoices/sales.
    // Allow overpayment for PAYMENT ONLY.

    setGlobalPaymentLoading(true);

    try {
      const totalPaymentRecorded = (Number(amount) || 0) + (Number(remiseAmount) || 0);

      // Load invoices and sales (needed to compute real debt/credit and to apply payments when allowed)
      const [invoicesResponse, salesResponse] = await Promise.all([
        fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/invoices`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/sales?user_id=${session.user.id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
      ]);

      if (!invoicesResponse.ok || !salesResponse.ok) {
        throw new Error('Erreur lors du chargement des données');
      }

      const invoicesData = await invoicesResponse.json();
      const salesData = await salesResponse.json();
      const allInvoices = invoicesData.invoices || [];
      const allSales = salesData.sales || [];

      // Helper to match client
      const matchesClient = (item: any) => {
        const itemIce = String(item.client_ice || '').trim();
        const itemName = String(item.client_name || '').trim().toLowerCase();
        const selectedIce = String(globalPaymentSelectedClient.ice || '').trim();
        const selectedName = String(globalPaymentSelectedClient.name || '').trim().toLowerCase();

        return (itemIce && selectedIce && itemIce === selectedIce) ||
          (itemName && selectedName && itemName === selectedName);
      };

      // Determine REAL debt/credit from documents.
      // Credit exists when total paid across documents is greater than total invoiced.
      const docsInvoiced = [
        ...allInvoices.filter(matchesClient).map((inv: any) => Number(inv?.total_amount || 0) || 0),
        ...allSales
          .filter((s: any) => {
            const sn = String(s?.sale_number || '');
            if (sn.startsWith('PURCHASE-') || sn.startsWith('TRANSFER-')) return false;
            return matchesClient(s);
          })
          .map((s: any) => Number(s?.total_amount || 0) || 0),
      ].reduce((a, b) => a + b, 0);

      const docsPaid = [
        ...allInvoices.filter(matchesClient).map((inv: any) => Number(inv?.amount_paid || 0) || 0),
        ...allSales
          .filter((s: any) => {
            const sn = String(s?.sale_number || '');
            if (sn.startsWith('PURCHASE-') || sn.startsWith('TRANSFER-')) return false;
            return matchesClient(s);
          })
          .map((s: any) => {
            const status = String(s?.payment_status || 'unpaid').toLowerCase();
            const total = Number(s?.total_amount || 0) || 0;
            const paid = Number(s?.amount_paid || 0) || 0;
            if (status === 'paid') return total;
            if (status === 'partial') return Math.max(0, paid);
            return 0;
          }),
      ].reduce((a, b) => a + b, 0);

      const realDebt = Math.max(0, docsInvoiced - docsPaid);
      const realCredit = Math.max(0, docsPaid - docsInvoiced);

      // Only apply to documents if there is a positive REAL debt and NO credit.
      const currentDebtForApply = realDebt;
      const hasDebt = currentDebtForApply > 0 && realCredit <= 0;

      // Get client's invoices
      const clientInvoices = allInvoices.filter(matchesClient);

      // Get client's sales (unpaid/partial only)
      const clientSales = allSales.filter((sale: any) => {
        const sn = String(sale.sale_number || '');
        if (sn.startsWith('PURCHASE-') || sn.startsWith('TRANSFER-')) return false;
        const status = String(sale.payment_status || 'unpaid').toLowerCase();
        return matchesClient(sale) && (status === 'unpaid' || status === 'partial');
      });

      // If client is currently in CREDIT, NEVER update documents.
      // (We still record the global payment as history.)
      // We also force hasDebt=false to guarantee updateCount stays 0.
      // (Some legacy docs may have remaining_balance > 0 while client is still in net credit.)
      if (realCredit > 0) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _forceNoApply = true;
      }

      // Combine all items that need payment (invoices + sales)
      const allItems = [
        ...clientInvoices.map((inv: any) => ({
          type: 'invoice',
          id: inv.id,
          remaining_balance: inv.remaining_balance || 0,
          amount_paid: inv.amount_paid || 0,
          total_amount: inv.total_amount || 0,
        })),
        ...clientSales.map((sale: any) => ({
          type: 'sale',
          id: sale.id,
          remaining_balance: sale.remaining_balance || 0,
          amount_paid: sale.amount_paid || 0,
          total_amount: sale.total_amount || 0,
        })),
      ];

      // Sort by remaining balance (highest first)
      const sortedItems = allItems.sort((a: any, b: any) => 
        (b.remaining_balance || 0) - (a.remaining_balance || 0)
      );

      // Ledger-only mode (CRITICAL BUSINESS RULE)
      // Global client payments must NEVER update individual invoices/BL/sales.
      // They are recorded in client_global_payments and shown in caisse, but do not change document statuses.
      const updateCount = 0;

      // Create a separate audit record for this global payment (client_global_payments)
      // This does NOT affect client debt calculation; it's a payment history/log.
      // IMPORTANT: create the GP row first, so we can link the remise to this payment.
      let createdGlobalPaymentId: string | null = null;
      try {
        // IMPORTANT: determine admin status using DB-driven role state (currentUserRole),
        // not auth metadata (which can be missing/stale).
        const paidByStoreId =
          (currentUserRole === 'admin'
            ? (adminSelectedStoreId || null)
            : (currentStore?.id || null));

        const paidByStoreName =
          (currentUserRole === 'admin'
            ? (allStores.find(s => s.id === adminSelectedStoreId)?.name || null)
            : (currentStore?.name || null));

        // Only record CASH/CHECK/BANK payment as "amount".
        // Remise is stored separately in discounts.
        const paymentOnlyRecorded = Number(amount) || 0;

        // IMPORTANT:
        // Do NOT consume/update cheque remaining_balance from the frontend.
        // Cheque consumption is handled server-side by POST /client-global-payments.
        // Otherwise we double-consume (frontend PUT + backend consume) and backend rejects with remaining=0.

        // Always create a client_global_payments row when there is a payment OR a remise.
        // This gives us a stable ID to link the remise to (even when client debt is 0).
        if (paymentOnlyRecorded > 0 || remiseAmount > 0) {
          // If the payment method is CHECK, we must link the selected check(s) so they appear
          // in the ClientDetails -> Chèques tab.
          const checkId = globalPaymentMethod === 'check' ? (selectedCheck?.id || null) : null;
          const checkIdsMarker =
            globalPaymentMethod === 'check'
              ? `check_inventory_ids=${[selectedCheck?.id, selectedAdditionalCheck?.id].filter(Boolean).join(',')}`
              : '';

          const gpRes = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/client-global-payments`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                client_id: globalPaymentSelectedClient.id,
                amount: paymentOnlyRecorded,
                payment_method: globalPaymentMethod,
                payment_date: globalPaymentDate ? new Date(globalPaymentDate + 'T12:00:00').toISOString() : new Date().toISOString(),
                paid_by_store_id: paidByStoreId,
                paid_by_store_name: paidByStoreName,
                reference_number: String(globalPaymentReference || '').trim() || null,
                check_inventory_id: checkId,
                // Actor audit fields
                created_by_email: session?.user?.email || null,
                is_admin_payment: session?.user?.user_metadata?.role === 'admin',
                acted_as_store_id: session?.user?.user_metadata?.role === 'admin' ? (globalPaymentSelectedEntrepot?.id || null) : null,
                // Always ledger-only to prevent any BL/Facture status change.
                // For method=other, explicitly tag it for clarity.
                notes: `Global payment - ledger-only (historique uniquement)${globalPaymentMethod === 'other' ? ' | methode=autre' : ''}${checkIdsMarker ? ` | ${checkIdsMarker}` : ''}`,
              }),
            }
          );

          if (!gpRes.ok) {
            const errText = await gpRes.text();
            console.warn('Failed to save client global payment record:', errText);
          } else {
            const gpPayload = await gpRes.json().catch(() => null);
            createdGlobalPaymentId =
              gpPayload?.client_global_payment?.id ||
              gpPayload?.client_global_payments?.id ||
              gpPayload?.data?.id ||
              gpPayload?.payment?.id ||
              gpPayload?.id ||
              null;
          }
        }
      } catch (e) {
        console.warn('Failed to save client global payment record:', e);
      }

      // If user provided a REMISE, always record it as a discount entity.
      // IMPORTANT:
      // - We SAVE the full remiseAmount (even if current debt is 0) so it can be applied later.
      // - Remise must NEVER create credit.
      try {
        const remiseValueToSave = Math.max(0, Number(remiseAmount) || 0);
        if (remiseValueToSave > 0) {
          // We SHOULD have an ID, but if not, still save the remise without link (do not lose it).
          const discountBody: any = {
            entity_type: 'customer',
            entity_name: globalPaymentSelectedClient.ice || globalPaymentSelectedClient.name,
            entity_id: globalPaymentSelectedClient.id,
            discount_amount: remiseValueToSave,
            status: 'active',
            reason: `Remise via Paiement Global Client${globalPaymentReference ? ` (ref: ${String(globalPaymentReference).trim()})` : ''}`,
          };

          if (createdGlobalPaymentId) {
            discountBody.ref_table = 'client_global_payments';
            discountBody.ref_id = createdGlobalPaymentId;
          }

          const discountRes = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/discounts`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify(discountBody),
            }
          );

          if (!discountRes.ok) {
            const t = await discountRes.text().catch(() => '');
            console.warn('Failed to record remise as discount:', {
              status: discountRes.status,
              body: t,
              discountBody,
            });
            toast.error(`Erreur remise (discounts): ${discountRes.status} ${t || ''}`.slice(0, 180));
          } else {
            const saved = await discountRes.json().catch(() => null);
            console.log('[GlobalPayment] discount saved:', saved);
          }
        }
      } catch (e) {
        console.warn('Failed to record remise as discount:', e);
      }

      // Ledger-only: always show history-only message. Never mention updated documents.
      let successMessage = `✅ Paiement de ${amount.toFixed(2)} MAD enregistré`;
      if ((Number(remiseAmount) || 0) > 0) {
        const applied = Math.min(Math.max(0, Number(remiseAmount) || 0), Number(financials.totalRemaining || 0) || 0);
        const saved = Math.max(0, Number(remiseAmount) || 0);
        successMessage += applied > 0
          ? ` + Remise de ${applied.toFixed(2)} MAD`
          : ` + Remise enregistrée: ${saved.toFixed(2)} MAD (sera appliquée quand il y aura un solde)`;
      }
      successMessage += ` pour ${globalPaymentSelectedClient.name} (historique uniquement)`;
      toast.success(successMessage);

      // If paid by CHECK, persist the client name on the check record so it can be found
      // by any future operation that searches checks by client name/phone/ICE.
      // (This is especially important for history-only global payments.)
      try {
        if (globalPaymentMethod === 'check') {
          const clientName = String(globalPaymentSelectedClient?.name || '').trim();
          const clientPhone = String(globalPaymentSelectedClient?.phone || '').trim();
          const clientIce = String(globalPaymentSelectedClient?.ice || '').trim();

          const idsToUpdate = [selectedCheck?.id, selectedAdditionalCheck?.id].filter(Boolean);

          for (const checkId of idsToUpdate) {
            await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory/${checkId}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                given_to: clientName || null,
                // keep type/id consistent if schema supports it
                given_to_type: 'client',
                given_to_id: globalPaymentSelectedClient?.id || null,
                notes: `Lien client: ${clientName}${clientPhone ? ` | Tel:${clientPhone}` : ''}${clientIce ? ` | ICE:${clientIce}` : ''}`,
              }),
            });
          }
        }
      } catch (e) {
        console.warn('Failed to link check to client after global payment:', e);
      }

      // Reset form (always)
      // Requirement: next time the dialog opens, it must be completely fresh/empty.
      setGlobalPaymentDialogOpen(false);
      setGlobalPaymentSelectedClient(null);
      setGlobalPaymentAmount('');
      setGlobalPaymentRemiseAmount('');
      setGlobalPaymentReference('');
      setGlobalPaymentClientSearch('');
      setGlobalPaymentMethod('cash');
      setGlobalPaymentDate(new Date().toISOString().split('T')[0]);
      setAdditionalPaymentMethod(null);
      setAdditionalPaymentAmount('');
      setSelectedCheck(null);
      setSelectedAdditionalCheck(null);
      setCheckSearchTerm('');
      setCheckSearchTermAdditional('');
      setCheckDialogOpen(false);
      setCheckDialogOpenAdditional(false);
      setBankProofFile(null);
      setAdditionalBankProofFile(null);
      setCreateCheckDialogOpen(false);
      setCreateAdditionalCheckDialogOpen(false);
      setUploadFile(null);
      setUploadCheckId('');
      setUploadAmount('');
      setUploadNotes('');
      setUploadGiverName('');
      setUploadCheckDate('');
      setUploadExecutionDate('');
      setUploadAdditionalFile(null);
      setUploadAdditionalCheckId('');
      setUploadAdditionalAmount('');
      setUploadAdditionalNotes('');
      setUploadAdditionalGiverName('');
      setUploadAdditionalCheckDate('');
      setUploadAdditionalExecutionDate('');
      setGlobalPaymentSelectedEntrepot(null);
      setAdminSelectedStoreId('');

      // Refresh data after a short delay
      setTimeout(() => {
        fetchClientsData();
      }, 500);
    } catch (error: any) {
      console.error('Payment error:', error);
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setGlobalPaymentLoading(false);
    }
  };

  if (!canViewClients) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Accès refusé</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">Vous n'avez pas la permission « Voir les Clients ».</p>
        </CardContent>
      </Card>
    );
  }

  if (showDetails && selectedClient) {
    return (
      <ClientDetailsPage
        client={selectedClient}
        session={session}
        onBack={() => {
          setShowDetails(false);
          setSelectedClient(null);
        }}
      />
    );
  }

  
  return (
    <div className="space-y-6">
      {/* Clients Overview Cards */}
      <div className="flex flex-wrap w-full bg-white p-1 h-auto gap-1 border-b border-gray-200 rounded-lg">
        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-blue-50 border-b-2 border-blue-500 text-blue-600 flex-1 min-w-max">
          <Users className="w-5 h-5" />
          <span className="text-xs font-medium">Clients Actifs</span>
          <span className="text-lg font-bold">{activeClients.length}</span>
        </div>

        <div className={`flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all ${totalBalance >= 0 ? 'bg-green-50 border-b-2 border-green-500 text-green-600' : 'bg-red-50 border-b-2 border-red-500 text-red-600'} flex-1 min-w-max`}>
          {totalBalance >= 0 ? (
            <TrendingUp className="w-5 h-5" />
          ) : (
            <TrendingDown className="w-5 h-5" />
          )}
          <span className="text-xs font-medium">Solde Total</span>
          <span className="text-lg font-bold">{totalBalance.toFixed(2)} MAD</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-purple-50 border-b-2 border-purple-500 text-purple-600 flex-1 min-w-max">
          <Users className="w-5 h-5" />
          <span className="text-xs font-medium">Total Clients</span>
          <span className="text-lg font-bold">{sortedClients.length}</span>
        </div>
      </div>

      {/* Current Store Info */}
      {currentStore && (
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Magasin</p>
                <p className="text-lg font-semibold text-gray-900">{currentStore.name}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">Téléphone</p>
                <p className="text-lg font-semibold text-gray-900">{currentStore.phone}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Clients Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>Mes Clients</CardTitle>
            <div className="flex gap-2">
              {/* Admin: must select magasin before actions */}
              {(currentUserRole === 'admin' || session?.user?.user_metadata?.role === 'admin') && (
                <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                  <Label htmlFor="admin_store_selector_outside" className="text-xs text-purple-900 whitespace-nowrap">
                    Magasin:
                  </Label>
                  <select
                    id="admin_store_selector_outside"
                    value={adminSelectedStoreId}
                    onChange={(e) => setAdminSelectedStoreId(e.target.value)}
                    className="px-3 py-2 border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white min-w-[240px]"
                  >
                    <option value="">-- Choisir magasin --</option>
                    {allStores.map(store => (
                      <option key={store.id} value={store.id}>{store.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <Button
                onClick={() => {
                  // Admin may export ALL if no magasin is selected.
                  exportToPDF();
                }}
                style={{ backgroundColor: '#dc2626', color: 'white' }}
                title={(currentUserRole === 'admin' || session?.user?.user_metadata?.role === 'admin')
                  ? (adminSelectedStoreId ? 'Exporter ce magasin en PDF' : 'Exporter tous les clients en PDF')
                  : 'Exporter en PDF'}
              >
                <Download className="w-4 h-4 mr-2" />
                Exporter PDF
              </Button>
              <Button
                onClick={() => {
                  // Admin may export ALL if no magasin is selected.
                  exportToExcelFile();
                }}
                style={{ backgroundColor: '#10b981', color: 'white' }}
                title={(currentUserRole === 'admin' || session?.user?.user_metadata?.role === 'admin')
                  ? (adminSelectedStoreId ? 'Exporter ce magasin en Excel' : 'Exporter tous les clients en Excel')
                  : 'Exporter en Excel'}
              >
                <Download className="w-4 h-4 mr-2" />
                Exporter Excel
              </Button>
              <Button 
                onClick={() => {
                  if ((currentUserRole === 'admin' || session?.user?.user_metadata?.role === 'admin') && !adminSelectedStoreId) {
                    toast.error('Veuillez sélectionner un magasin avant de continuer');
                    return;
                  }
                  setGlobalPaymentDialogOpen(true);
                }}
                disabled={(currentUserRole === 'admin' || session?.user?.user_metadata?.role === 'admin') && !adminSelectedStoreId}
                style={{ backgroundColor: '#10b981', color: 'white' }}
                title="Paiement Global"
              >
                <DollarSign className="w-4 h-4 mr-2" />
                Paiement Global
              </Button>
              <Dialog open={globalPaymentDialogOpen} onOpenChange={(open) => {
                // Prevent opening dialog when admin didn't pick magasin
                if (open && (currentUserRole === 'admin' || session?.user?.user_metadata?.role === 'admin') && !adminSelectedStoreId) {
                  toast.error('Veuillez sélectionner un magasin avant de continuer');
                  return;
                }
                setGlobalPaymentDialogOpen(open);
              }}>
                <DialogTrigger asChild>
                  <div style={{ display: 'none' }} />
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader className="sticky top-0 bg-white z-10 pb-4">
                    <DialogTitle>Paiement Global Client</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleGlobalPayment} className="space-y-4 pb-4">
                    {/* Client Search */}
                    <div className="space-y-2">
                      <Label>Rechercher un Client</Label>
                      <Input
                        placeholder="Tapez le nom du client..."
                        value={globalPaymentClientSearch}
                        onChange={(e) => {
                          setGlobalPaymentClientSearch(e.target.value);
                          if (e.target.value.trim() === '') {
                            setGlobalPaymentSelectedClient(null);
                          }
                        }}
                        disabled={false}
                      />
                      
                      {/* Client Suggestions */}
                      {globalPaymentClientSearch.trim() !== '' && !globalPaymentSelectedClient && (
                        <div className="border rounded-lg max-h-48 overflow-y-auto">
                          {clients
                            .filter((c: any) => {
                              const q = globalPaymentClientSearch.toLowerCase();

                              const matchesText =
                                c.name?.toLowerCase().includes(q) ||
                                c.phone?.includes(globalPaymentClientSearch) ||
                                c.ice?.includes(globalPaymentClientSearch);

                              if (!matchesText) return false;

                              // Admin acting as magasin: restrict suggestions to that magasin's clients only.
                              // (Stores are also included in the mixed list; keep them visible only if they match magasin filter.)
                              const isAdminUser = (currentUserRole === 'admin' || session?.user?.user_metadata?.role === 'admin');
                              if (isAdminUser && adminSelectedStoreId) {
                                const isStoreEntity = Boolean((c as any).__isStore);
                                const rowStoreId = isStoreEntity ? String(c?.id || '') : String(c?.store_id || '');
                                return rowStoreId === String(adminSelectedStoreId);
                              }

                              return true;
                            })
                            .map((client: any) => {
                              const financials = clientFinancials[client.id] || { totalRemaining: 0 };
                              return (
                                <button
                                  key={client.id}
                                  type="button"
                                  onClick={() => {
                                    setGlobalPaymentSelectedClient(client);
                                    setGlobalPaymentClientSearch('');
                                  }}
                                  className="w-full text-left p-3 border-b hover:bg-blue-50 transition"
                                >
                                  <div className="font-semibold text-sm">{client.name}</div>
                                  <div className="text-xs text-gray-600">
                                    Solde Restant: {(() => {
                                      const f = clientFinancials[client.id] || { totalInvoiced: 0, totalPaid: 0 };
                                      const disc = Number(clientDiscounts[client.id] || 0) || 0;
                                      const adjusted = (Number(f.totalInvoiced) || 0) - (Number(f.totalPaid) || 0) - disc;
                                      return adjusted.toFixed(2);
                                    })()} MAD
                                  </div>
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>

                    {/* Selected Client Display */}
                    {globalPaymentSelectedClient && (
                      <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-semibold text-gray-700">Client:</span>
                          <span className="text-sm font-bold text-blue-600">{globalPaymentSelectedClient.name}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-semibold text-gray-700">Solde Restant:</span>
                          <span className="text-sm font-bold text-red-600">
                          {(() => {
                          const f = clientFinancials[globalPaymentSelectedClient.id] || { totalInvoiced: 0, totalPaid: 0 };
                          const disc = Number(clientDiscounts[globalPaymentSelectedClient.id] || 0) || 0;
                          const adjusted = (Number(f.totalInvoiced) || 0) - (Number(f.totalPaid) || 0) - disc;
                          return adjusted.toFixed(2);
                          })()} MAD
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setGlobalPaymentSelectedClient(null);
                            setGlobalPaymentAmount('');
                            setGlobalPaymentRemiseAmount('');
                            setSelectedCheck(null);
                            setCheckDialogOpen(false);
                            setCheckSearchTerm('');
                            setGlobalPaymentMethod('cash');
                            setAdditionalPaymentMethod(null);
                            setAdditionalPaymentAmount('');
                            setSelectedAdditionalCheck(null);
                            setCheckDialogOpenAdditional(false);
                            setCheckSearchTermAdditional('');
                            setAdditionalBankProofFile(null);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 font-semibold mt-2"
                        >
                          Changer de client
                        </button>
                      </div>
                    )}

                    {/* Admin Entrepot Selector */}
                    {/* Removed: duplicated selector. Admin now selects magasin once at the top of the form. */}

                    {/* Payment Amount */}
                    <div className="space-y-2">
                      <Label>Montant à Payer</Label>
                      <Input
                        type="number"
                        placeholder="Montant en MAD"
                        value={globalPaymentAmount}
                        onChange={(e) => setGlobalPaymentAmount(e.target.value)}
                        step="0.01"
                        disabled={!globalPaymentSelectedClient || ((currentUserRole === 'admin' || session?.user?.user_metadata?.role === 'admin') && !adminSelectedStoreId)}
                      />
                      {globalPaymentSelectedClient && (
                        <p className="text-xs text-gray-600">
                          Vous pouvez payer plus que le solde restant. L'excédent sera crédité au client.
                        </p>
                      )}
                      {globalPaymentSelectedClient && (
                        <div className="mt-2 p-3 rounded-lg border bg-gray-50 space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Solde actuel (nous doit):</span>
                            <span className="font-semibold">
                              {(clientFinancials[globalPaymentSelectedClient.id]?.totalRemaining || 0).toFixed(2)} MAD
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Paiement:</span>
                            <span className="font-semibold">
                              {(Number(globalPaymentAmount || 0) || 0).toFixed(2)} MAD
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Remise:</span>
                            <span className="font-semibold">
                              {(Number(globalPaymentRemiseAmount || 0) || 0).toFixed(2)} MAD
                            </span>
                          </div>
                          {(() => {
                            const totalRemaining = Number(clientFinancials[globalPaymentSelectedClient.id]?.totalRemaining || 0) || 0;
                            const payment = Number(globalPaymentAmount || 0) || 0;
                            const remise = Number(globalPaymentRemiseAmount || 0) || 0;

                            // Remise must NEVER create credit.
                            // We show two numbers:
                            // - appliedRemiseNow: can reduce current debt up to totalRemaining
                            // - savedRemise: full remise amount stored for later (if debt is 0 or smaller)
                            const appliedRemiseNow = Math.min(Math.max(0, remise), Math.max(0, totalRemaining));
                            const savedRemise = Math.max(0, remise);

                            const appliedTotal = payment + appliedRemiseNow;
                            const remainingAfter = Math.max(0, totalRemaining - appliedTotal);

                            // Only PAYMENT can create credit
                            const credit = Math.max(0, payment - totalRemaining);

                            return (
                              <>
                                <div className="flex justify-between border-t pt-2 mt-2">
                                  <span className="text-gray-800 font-semibold">Reste après paiement:</span>
                                  <span className={`font-bold ${remainingAfter > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {remainingAfter.toFixed(2)} MAD
                                  </span>
                                </div>

                                {savedRemise > 0 && appliedRemiseNow === 0 && totalRemaining === 0 ? (
                                  <div className="flex justify-between border-t pt-2 mt-2 bg-blue-50 p-2 rounded">
                                    <span className="text-blue-800 font-semibold">Remise enregistrée:</span>
                                    <span className="font-bold text-blue-700">{savedRemise.toFixed(2)} MAD</span>
                                  </div>
                                ) : null}

                                {credit > 0 ? (
                                  <div className="flex justify-between border-t pt-2 mt-2 bg-green-50 p-2 rounded">
                                    <span className="text-green-800 font-semibold">Crédit client (nous doit):</span>
                                    <span className="font-bold text-green-700">{credit.toFixed(2)} MAD</span>
                                  </div>
                                ) : null}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Ref paiement */}
                    <div className="space-y-2">
                      <Label>Réf de Paiement (optionnel)</Label>
                      <Input
                        placeholder="Ex: REF-2026-001"
                        value={globalPaymentReference}
                        onChange={(e) => setGlobalPaymentReference(e.target.value)}
                        disabled={!globalPaymentSelectedClient || ((currentUserRole === 'admin' || session?.user?.user_metadata?.role === 'admin') && !adminSelectedStoreId)}
                      />
                      <p className="text-xs text-gray-600">Référence interne / banque / reçu.</p>
                    </div>

                    {/* Remise Faild Input */}
                    <div className="space-y-2">
                      <Label>Remise Faild (MAD)</Label>
                      <Input
                        type="number"
                        placeholder="Montant de remise en MAD"
                        value={globalPaymentRemiseAmount}
                        onChange={(e) => setGlobalPaymentRemiseAmount(e.target.value)}
                        step="0.01"
                        disabled={!globalPaymentSelectedClient || ((currentUserRole === 'admin' || session?.user?.user_metadata?.role === 'admin') && !adminSelectedStoreId)}
                      />
                      <p className="text-xs text-gray-600">
                        Remise supplémentaire à appliquer au client
                      </p>
                    </div>

                    {/* Payment Method */}
                    <div className="space-y-2">
                      <Label htmlFor="payment_method">Méthode de Paiement</Label>
                      <select
                        id="payment_method"
                        value={globalPaymentMethod}
                        onChange={(e) => setGlobalPaymentMethod(e.target.value as 'cash' | 'check' | 'bank_transfer')}
                        className="w-full px-3 py-2 border rounded-md"
                        disabled={(currentUserRole === 'admin' || session?.user?.user_metadata?.role === 'admin') && !adminSelectedStoreId}
                      >
                        <option value="cash">Espèces</option>
                        <option value="check">Chèque</option>
                        <option value="bank_transfer">Virement Bancaire</option>
                                              </select>
                    </div>

                    {/* Payment Date Picker */}
                    <div className="space-y-2">
                      <Label htmlFor="payment_date">Date du Paiement</Label>
                      <Input
                        type="date"
                        id="payment_date"
                        value={globalPaymentDate}
                        onChange={(e) => setGlobalPaymentDate(e.target.value)}
                        disabled={!globalPaymentSelectedClient || ((currentUserRole === 'admin' || session?.user?.user_metadata?.role === 'admin') && !adminSelectedStoreId)}
                      />
                      <p className="text-xs text-gray-600">
                        Sélectionnez la date à laquelle le paiement sera enregistré
                      </p>
                    </div>

                    {/* Add Another Payment Method Button */}
                    {!additionalPaymentMethod && (
                      <Button
                        type="button"
                        onClick={() => setAdditionalPaymentMethod('cash')}
                        variant="outline"
                        className="w-full border-dashed border-2 border-blue-400 text-blue-600 hover:bg-blue-50"
                        disabled={(currentUserRole === 'admin' || session?.user?.user_metadata?.role === 'admin') ? !adminSelectedStoreId : !globalPaymentSelectedClient}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Ajouter une autre méthode de paiement
                      </Button>
                    )}

                    {/* Additional Payment Method */}
                    {additionalPaymentMethod && (
                      <div className="space-y-3 bg-blue-50 p-3 rounded-lg border border-blue-200">
                        <div className="flex justify-between items-center">
                          <Label className="font-semibold text-blue-900">Deuxième Méthode de Paiement</Label>
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

                        <div className="space-y-2">
                          <Label htmlFor="additional_payment_method">Type de Paiement</Label>
                          <select
                            id="additional_payment_method"
                            value={additionalPaymentMethod}
                            onChange={(e) => setAdditionalPaymentMethod(e.target.value as 'cash' | 'check' | 'bank_transfer')}
                            className="w-full px-3 py-2 border rounded-md"
                          >
                            <option value="cash">Espèces</option>
                            <option value="check">Chèque</option>
                            <option value="bank_transfer">Virement Bancaire</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="additional_payment_amount">Montant (MAD)</Label>
                          <Input
                            id="additional_payment_amount"
                            type="number"
                            placeholder="0.00"
                            value={additionalPaymentAmount}
                            onChange={(e) => setAdditionalPaymentAmount(e.target.value)}
                            step="0.01"
                            min="0"
                            disabled={!globalPaymentSelectedClient || ((currentUserRole === 'admin' || session?.user?.user_metadata?.role === 'admin') && !adminSelectedStoreId)}
                          />
                        </div>

                        {additionalPaymentMethod === 'check' && (
                          <div className="space-y-2">
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
                                    setChecks((data.check_inventory || []).filter(isCheckSelectable));
                                    setCheckDialogOpenAdditional(true);
                                  }
                                } finally {
                                  setLoadingChecks(false);
                                }
                              }}
                              className="w-full"
                              disabled={loadingChecks}
                              size="sm"
                            >
                              {loadingChecks ? 'Chargement...' : 'Sélectionner Chèque'}
                            </Button>
                            {selectedAdditionalCheck && (
                              <div className="p-2 bg-white rounded border border-blue-300 text-xs">
                                <p className="font-semibold text-blue-700">{selectedAdditionalCheck.check_id_number}</p>
                                <p className="text-gray-600">Disponible: {(selectedAdditionalCheck.remaining_balance || 0).toFixed(2)} MAD</p>
                              </div>
                            )}

                            {checkDialogOpenAdditional && (
                              <Card className="mt-2 w-full">
                                <CardContent className="pt-4">
                                  <div className="space-y-3">
                                    <div className="relative">
                                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                      <Input
                                        placeholder="Rechercher un chèque..."
                                        className="pl-10"
                                        value={checkSearchTermAdditional}
                                        onChange={(e) => setCheckSearchTermAdditional(e.target.value)}
                                      />
                                    </div>

                                    {checks.length === 0 ? (
                                      <div className="text-center py-4 text-gray-500">
                                        Aucun chèque disponible
                                      </div>
                                    ) : !checkSearchTermAdditional.trim() ? (
                                      <div className="text-center py-4 text-gray-500">
                                        Tapez pour rechercher un chèque...
                                      </div>
                                    ) : (
                                      <div className="max-h-40 overflow-y-auto border rounded-lg">
                                        {checks.filter((check) => {
                                          // Only allow pending/partial checks to be selected
                                          if (!isCheckSelectable(check)) return false;
                                          const term = checkSearchTermAdditional.toLowerCase();
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
                                          const available = getCheckAvailableAmount(check);
                                          if (!Number.isFinite(available) || available <= 0) {
                                          toast.error("Ce chèque n'a plus de solde disponible");
                                          return;
                                          }
                                          
                                          setSelectedAdditionalCheck(check);
                                          setCheckDialogOpenAdditional(false);
                                          setAdditionalPaymentAmount(String(available));
                                          toast.success(`Chèque ${check.check_id_number} sélectionné (${available.toFixed(2)} MAD disponible)`);
                                          }}
                                          className="w-full text-left p-3 border-b hover:bg-blue-50 transition"
                                          >
                                            <div className="font-semibold text-sm">{check.check_id_number}</div>
                                            <div className="text-xs text-gray-600 space-y-0.5">
                                            <div>
                                            Original: {(Number(check.amount_value || 0) || 0).toFixed(2)} MAD
                                            </div>
                                            <div>
                                            Restant: {(Number(check.remaining_balance ?? check.amount_value ?? 0) || 0).toFixed(2)} MAD
                                            </div>
                                            </div>
                                          </button>
                                        ))}
                                      </div>
                                    )}

                                    <Button
                                      type="button"
                                      onClick={() => setCheckDialogOpenAdditional(false)}
                                      variant="outline"
                                      className="w-full"
                                      size="sm"
                                    >
                                      Fermer
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            )}

                            <Dialog open={createAdditionalCheckDialogOpen} onOpenChange={(open: boolean) => {
                              setCreateAdditionalCheckDialogOpen(open);
                              if (open) {
                                setUploadCheckDate(getTodayDate());
                                setUploadExecutionDate(getTodayDate());
                              }
                            }}>
                              <DialogTrigger asChild>
                                <Button 
                                  className="w-full"
                                  style={{ backgroundColor: '#8b5cf6', color: 'white' }}
                                  size="sm"
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
                                      onClick={() => setCreateAdditionalCheckDialogOpen(false)}
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

                        {additionalPaymentMethod === 'bank_transfer' && (
                          <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-200 space-y-3">
                            <Label htmlFor="additional_bank_proof">Preuve de Virement (Image ou PDF)</Label>
                            <Input
                              id="additional_bank_proof"
                              type="file"
                              accept="image/*,.pdf"
                              onChange={(e) => setAdditionalBankProofFile(e.target.files?.[0] || null)}
                              className="cursor-pointer"
                            />
                            {additionalBankProofFile && (
                              <p className="text-xs text-gray-600">Fichier sélectionné: {additionalBankProofFile.name}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Total Summary */}
                    {additionalPaymentMethod && (
                      <div className="bg-green-50 p-3 rounded-lg border border-green-200 space-y-2">
                        <div className="flex justify-between items-center text-sm font-semibold">
                          <span>Total Paiement:</span>
                          <span className="text-green-700">
                            {(parseFloat(globalPaymentAmount || '0') + parseFloat(additionalPaymentAmount || '0')).toFixed(2)} MAD
                          </span>
                        </div>
                        {globalPaymentSelectedClient && (
                          <div className="flex justify-between items-center text-xs text-gray-600">
                            <span>Solde Restant:</span>
                            <span>{(() => {
                              const f = clientFinancials[globalPaymentSelectedClient.id] || { totalInvoiced: 0, totalPaid: 0 };
                              const disc = Number(clientDiscounts[globalPaymentSelectedClient.id] || 0) || 0;
                              const adjusted = (Number(f.totalInvoiced) || 0) - (Number(f.totalPaid) || 0) - disc;
                              return adjusted.toFixed(2);
                            })()} MAD</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Check Selection */}
                    {globalPaymentMethod === 'check' && (
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
                                setChecks((data.check_inventory || []).filter(isCheckSelectable));
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
                                ) : !checkSearchTerm.trim() ? (
                                <div className="text-center py-4 text-gray-500">
                                Tapez pour rechercher un chèque...
                                </div>
                                ) : (
                                <div className="max-h-48 overflow-y-auto border rounded-lg">
                                {checks.filter((check) => {
                                // Only allow pending/partial checks to be selected
                                if (!isCheckSelectable(check)) return false;
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
                                      const available = getCheckAvailableAmount(check);
                                      if (!Number.isFinite(available) || available <= 0) {
                                      toast.error("Ce chèque n'a plus de solde disponible");
                                      return;
                                      }
                                      
                                      setSelectedCheck(check);
                                      setCheckDialogOpen(false);
                                      
                                      // Auto-fill payment amount with selected check available balance
                                      setGlobalPaymentAmount(String(available));
                                      
                                      toast.success(
                                      `Chèque ${check.check_id_number} sélectionné (${available.toFixed(2)} MAD disponible)`
                                      );
                                      }}
                                      className="w-full text-left p-3 border-b hover:bg-blue-50 transition"
                                      >
                                        <div className="font-semibold text-sm">{check.check_id_number}</div>
                                        <div className="text-xs text-gray-600 space-y-0.5">
                                        <div>
                                        Original: {(Number(check.amount_value || 0) || 0).toFixed(2)} MAD
                                        </div>
                                        <div>
                                        Restant: {(Number(check.remaining_balance ?? check.amount_value ?? 0) || 0).toFixed(2)} MAD
                                        </div>
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
                              <span className="text-sm font-bold text-green-600">{(getCheckAvailableAmount(selectedCheck) || 0).toFixed(2)} MAD</span>
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
                    )}

                    {/* Bank Transfer Proof */}
                    {globalPaymentMethod === 'bank_transfer' && (
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

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-2 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setGlobalPaymentDialogOpen(false);
                          setGlobalPaymentSelectedClient(null);
                          setGlobalPaymentAmount('');
                          setGlobalPaymentClientSearch('');
                        }}
                      >
                        Annuler
                      </Button>
                      <Button
                        type="submit"
                        disabled={globalPaymentLoading || !globalPaymentSelectedClient}
                        style={{ backgroundColor: '#10b981', color: 'white' }}
                      >
                        {globalPaymentLoading ? 'Enregistrement...' : 'Enregistrer le Paiement'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
              <Dialog open={dialogOpen} onOpenChange={(open) => {
              // Prevent opening dialog when admin didn't pick magasin
              if (open && (currentUserRole === 'admin' || session?.user?.user_metadata?.role === 'admin') && !adminSelectedStoreId) {
              toast.error('Veuillez sélectionner un magasin avant de continuer');
              return;
              }
              setDialogOpen(open);
              if (!open) resetForm();
              }}>
                <DialogTrigger asChild>
                  <Button
                    disabled={!canAddClient || ((currentUserRole === 'admin' || session?.user?.user_metadata?.role === 'admin') && !adminSelectedStoreId)}
                    title={!canAddClient ? "Vous n'avez pas la permission « Ajouter un Client »" : ((currentUserRole === 'admin' || session?.user?.user_metadata?.role === 'admin') && !adminSelectedStoreId) ? 'Veuillez sélectionner un magasin avant de continuer' : undefined}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter un client
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingClient ? 'Modifier les informations du client' : 'Informations Client'}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Admin: select magasin */}
                  {session?.user?.user_metadata?.role === 'admin' && (
                    <div className="space-y-2">
                      <Label htmlFor="admin_store_selector">Magasin (Admin)</Label>
                      <select
                        id="admin_store_selector"
                        value={adminSelectedStoreId}
                        onChange={(e) => setAdminSelectedStoreId(e.target.value)}
                        className="w-full px-3 py-2 border rounded-md"
                      >
                        <option value="">-- Sélectionner un magasin --</option>
                        {allStores.map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.name}
                          </option>
                        ))}
                      </select>
                      {adminSelectedStoreId && (
                        <p className="text-xs text-gray-600">
                          Magasin sélectionné: {allStores.find((s) => s.id === adminSelectedStoreId)?.name || '-'}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Nom du Client */}
                  <div className="space-y-2">
                    <Label htmlFor="name">Nom du Client</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Client Name"
                    />
                  </div>

                  {/* Téléphone */}
                  <div className="space-y-2">
                    <Label htmlFor="phone">Téléphone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+212 XXX XXX XXX"
                    />
                  </div>

                  {/* Adresse */}
                  <div className="space-y-2">
                    <Label htmlFor="address">Adresse</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Client Address"
                    />
                  </div>

                  {/* ICE */}
                  <div className="space-y-2">
                    <Label htmlFor="ice">ICE</Label>
                    <Input
                      id="ice"
                      value={formData.ice}
                      onChange={(e) => setFormData({ ...formData, ice: e.target.value })}
                      placeholder="XXXXXXXXXX"
                    />
                  </div>

                  {/* IF, RC, Patente */}
                  <div className="flex items-center justify-between rounded-lg border p-3 bg-orange-50 border-orange-200">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-orange-900">Client Passage (Temporaire)</p>
                      <p className="text-xs text-orange-700">
                        Marquer ce client comme <strong>Passage</strong> (exceptionnel / temporaire)
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={!!formData.is_passage}
                      onChange={(e) => setFormData({ ...formData, is_passage: e.target.checked })}
                      className="h-5 w-5"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="if_number">IF</Label>
                      <Input
                        id="if_number"
                        value={formData.if_number}
                        onChange={(e) => setFormData({ ...formData, if_number: e.target.value })}
                        placeholder="XXXXXXXXXX"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rc">RC</Label>
                      <Input
                        id="rc"
                        value={formData.rc}
                        onChange={(e) => setFormData({ ...formData, rc: e.target.value })}
                        placeholder="XXXXXXXXXX"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="patente">Patente</Label>
                      <Input
                        id="patente"
                        value={formData.patente}
                        onChange={(e) => setFormData({ ...formData, patente: e.target.value })}
                        placeholder="XXXXXXXXXX"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Annuler
                    </Button>
                    <Button type="submit" disabled={isButtonDisabled || loading}>
                      {loading ? `Enregistrement ${countdown}...` : isButtonDisabled ? 'Enregistrement...' : 'Enregistrer'}
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
              <Input
                placeholder="Rechercher un client..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Sorting and Filter Controls */}
            <div className="flex items-center gap-4 bg-gray-50 p-3 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2">
                <Label className="font-semibold text-gray-700 whitespace-nowrap">Tri Solde:</Label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'high-to-low' | 'low-to-high')}
                  className="px-3 py-2 border rounded-md text-sm bg-white"
                >
                  <option value="high-to-low">Élevé à Bas</option>
                  <option value="low-to-high">Bas à Élevé</option>
                </select>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <input
                  type="checkbox"
                  id="zero_balance_filter"
                  checked={showZeroBalanceOnly}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setShowZeroBalanceOnly(checked);
                    if (checked) setShowNonZeroBalanceOnly(false);
                  }}
                  className="w-4 h-4 cursor-pointer"
                />
                <Label htmlFor="zero_balance_filter" className="font-semibold text-gray-700 cursor-pointer">
                  Afficher Solde = 0
                </Label>

                <div className="flex items-center gap-2">
                  <input
                    id="nonzero_balance_filter"
                    type="checkbox"
                    checked={showNonZeroBalanceOnly}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setShowNonZeroBalanceOnly(checked);
                      if (checked) setShowZeroBalanceOnly(false);
                    }}
                    className="w-4 h-4 cursor-pointer"
                  />
                  <Label htmlFor="nonzero_balance_filter" className="text-sm cursor-pointer">
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
                          Nom (Client/Magasin)
                          <span className="text-xs font-semibold text-blue-600">
                            {sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
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
                              key: 'total_remaining',
                              direction: prev.key === 'total_remaining' && prev.direction === 'asc' ? 'desc' : 'asc',
                            }));
                          }}
                        >
                          Solde Restant
                          <span className="text-xs font-semibold text-blue-600">
                            {sortConfig.key === 'total_remaining' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        </button>
                      </TableHead>
                      <TableHead className="text-center">Remise Donnée</TableHead>
                      <TableHead className="text-center">Crédit Client</TableHead>
                      <TableHead className="text-center" style={{ verticalAlign: 'bottom', paddingBottom: '0.5rem' }}>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClients.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center text-gray-500 py-8">
                          Aucun client trouvé
                        </TableCell>
                      </TableRow>
                    ) : (
                      displayedClients.map((client) => {
                        const financials = clientFinancials[client.id] || { totalInvoiced: 0, totalPaid: 0, totalRemaining: 0 };
                        const discountAmount = clientDiscounts[client.id] || 0;
                        const adjustedBalance = financials.totalInvoiced - financials.totalPaid - discountAmount;
                        return (
                          <TableRow key={client.id}>
                            <TableCell>
                              <p className="font-medium">{client.name}</p>
                            </TableCell>
                            <TableCell>{client.phone}</TableCell>
                            <TableCell className="max-w-xs truncate">{client.address}</TableCell>
                            <TableCell className="font-mono text-sm">{financials.totalInvoiced.toFixed(2)} MAD</TableCell>
                            <TableCell className="font-mono text-sm">{financials.totalPaid.toFixed(2)} MAD</TableCell>
                            <TableCell className="font-mono text-sm">{(financials.totalInvoiced - financials.totalPaid - discountAmount).toFixed(2)} MAD</TableCell>
                            <TableCell className="font-mono text-sm text-center">
                              {discountAmount > 0 ? (
                                <span className="text-green-600 font-semibold">{discountAmount.toFixed(2)} MAD</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm text-center">
                              {(() => {
                                // Calculate credit: if client has overpaid (paid more than invoiced)
                                const totalInvoiced = financials.totalInvoiced || 0;
                                const totalPaid = financials.totalPaid || 0;
                                const credit = Math.max(0, totalPaid - totalInvoiced);
                                return credit > 0 ? (
                                  <span className="text-green-600 font-semibold">{credit.toFixed(2)} MAD</span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                );
                              })()}
                            </TableCell>
                            <TableCell style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '0.375rem',
                                paddingLeft: '0.75rem',
                                paddingRight: '0.75rem',
                                paddingTop: '0.25rem',
                                paddingBottom: '0.25rem',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                backgroundColor: '#16a34a',
                                color: '#ffffff',
                                cursor: 'pointer'
                              }}>
                                ✓ ACTIF
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedClient(client);
                                    setShowDetails(true);
                                  }}
                                  title="Voir les détails"
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                {isAdmin && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleEdit(client)}
                                    disabled={!canEditClient}
                                    title={!canEditClient ? "Vous n'avez pas la permission de modifier les clients" : "Modifier"}
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                )}
                                {isAdmin && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDelete(client.id)}
                                    disabled={!canDeleteClient}
                                    title={!canDeleteClient ? "Vous n'avez pas la permission de supprimer les clients" : "Supprimer"}
                                  >
                                    <Trash2 className="w-4 h-4 text-red-600" />
                                  </Button>
                                )}
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

            {/* Voir Plus Button */}
            {displayLimit < sortedClients.length && (
              <div className="flex justify-center mt-4">
                <Button
                  onClick={() => setDisplayLimit(prev => prev + 100)}
                  variant="outline"
                  className="px-6 py-2"
                >
                  Voir Plus ({sortedClients.length - displayLimit} restants)
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      
      {/* Clients Info */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-800">À propos de vos Clients</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-blue-700 space-y-2">
            <p>• Gérez tous vos clients et leurs informations</p>
            <p>• Suivez les soldes et les transactions avec chaque client</p>
            <p>• Créez des factures et des commandes pour vos clients</p>
            <p>• Conservez les informations fiscales (ICE, IF, RC, Patente)</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
