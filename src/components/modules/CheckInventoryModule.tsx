import { useState, useEffect } from 'react';
import { projectId } from '../../utils/supabase/info';

type SortDirection = 'asc' | 'desc';

type CheckSortKey =
  | 'check_id_number'
  | 'magasin'
  | 'check_date'
  | 'due_date'
  | 'amount_original'
  | 'amount_used'
  | 'amount_available'
  | 'given_to'
  | 'given_to_type'
  | 'status'
  | 'created_at';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Plus, Edit, Trash2, Search, Upload, Eye, Download, FileText, AlertTriangle, CheckCircle, Clock, Archive, DollarSign, Lock } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { CheckInventoryDetailsPage } from '../CheckInventoryDetailsPage';
import { Checkbox } from '../ui/checkbox';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface CheckInventoryItem {
  id: string;
  check_id_number: string;
  amount_value: number;
  given_to: string;
  given_to_type: 'client' | 'store' | 'supplier' | 'other';
  given_to_id: string;
  image_url: string;
  pdf_url: string;
  file_type: 'image' | 'pdf';
  status: 'pending' | 'received' | 'used' | 'partly_used' | 'archived';
  notes: string;
  created_at: string;
  updated_at: string;

  // Dates (depending on schema)
  check_date?: string | null;
  due_date?: string | null;
  execution_date?: string | null;
  giver_id?: string;
  receiver_id?: string;
  usage_percentage?: number;
  remaining_balance?: number;

  // UI-enriched fields (computed client-side)
  created_by?: string;
  created_by_user?: {
    id: string;
    email?: string;
    full_name?: string;
    role?: string;
  };
  created_by_store?: {
    id: string;
    name?: string;
  };
}

export function CheckInventoryModule({ session }: { session: any }) {
  const [checkInventory, setCheckInventory] = useState<CheckInventoryItem[]>([]);

  // Resolve role+permissions from DB
  const [currentUserRole, setCurrentUserRole] = useState<string>('user');
  const [currentUserPermissions, setCurrentUserPermissions] = useState<string[]>([]);

  const isAdmin = currentUserRole === 'admin';
  const hasPermission = (permission: string): boolean => {
    if (isAdmin) return true;
    return currentUserPermissions.includes(permission);
  };

  // Check Inventory permissions
  const canViewCheckInventory = hasPermission("Voir l'Inventaire des Chèques");
  const canAddCheckInventory = hasPermission('Ajouter un Chèque');
  const canEditCheckInventory = hasPermission('Modifier un Chèque');
  const canDeleteCheckInventory = hasPermission('Supprimer un Chèque');
  const canTransferCheckToCoffre = hasPermission('Transférer un Chèque au Coffre');
  const canPaySupplierByCheck = hasPermission('Payer un Fournisseur par Chèque');
  const canPayClientByCheck = hasPermission('Payer un Client par Chèque');
  const [stores, setStores] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CheckInventoryItem | null>(null);

  // Edit fields
  const [editCheckIdNumber, setEditCheckIdNumber] = useState('');
  const [editAmountValue, setEditAmountValue] = useState('');
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editGivenTo, setEditGivenTo] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editCheckDate, setEditCheckDate] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedCheck, setSelectedCheck] = useState<CheckInventoryItem | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [filterName, setFilterName] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterExecutionDateFrom, setFilterExecutionDateFrom] = useState('');
  const [filterExecutionDateTo, setFilterExecutionDateTo] = useState('');
  const [filterAmountFrom, setFilterAmountFrom] = useState('');
  const [filterAmountTo, setFilterAmountTo] = useState('');

  // Store (magasin) filter (based on creator user's store)
  const [filterStoreId, setFilterStoreId] = useState<string>('all');

  // Classic filters requested by client (circled columns)
  // Date Chèque / Date Échéance / Utilisé / Disponible
  const [filterCheckDateFrom, setFilterCheckDateFrom] = useState('');
  const [filterCheckDateTo, setFilterCheckDateTo] = useState('');
  const [filterDueDateFrom, setFilterDueDateFrom] = useState('');
  const [filterDueDateTo, setFilterDueDateTo] = useState('');
  const [filterUsedFrom, setFilterUsedFrom] = useState('');
  const [filterUsedTo, setFilterUsedTo] = useState('');
  const [filterAvailableFrom, setFilterAvailableFrom] = useState('');
  const [filterAvailableTo, setFilterAvailableTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showPdfExportDialog, setShowPdfExportDialog] = useState(false);

  // Table sorting (same pattern as Products/Clients/Sales)
  const [sortConfig, setSortConfig] = useState<{ key: CheckSortKey; direction: SortDirection } | null>(null);

  const getSortableString = (v: any) => String(v ?? '').trim().toLowerCase();
  const getSortableNumber = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const getCheckMagasinName = (c: any) => String(c?.created_by_store?.name ?? '').trim();

  const getCheckUsedAvailable = (c: any) => {
    const original = getSortableNumber(c?.amount_value ?? 0);
    const remaining = c?.remaining_balance === null
      ? 0
      : getSortableNumber(c?.remaining_balance ?? original);
    const used = Math.max(0, original - remaining);
    return { original, used, remaining };
  };

  // NOTE: `sortedChecks` is declared later, after `filteredChecks`, to avoid TS "used before declaration".

  const toggleSort = (key: CheckSortKey) => {
    setSortConfig((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  const getSortIndicator = (key: CheckSortKey) => {
    if (!sortConfig || sortConfig.key !== key) return '↕';
    return sortConfig.direction === 'asc' ? '▲' : '▼';
  };

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCheckId, setUploadCheckId] = useState('');
  const [uploadAmount, setUploadAmount] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadGiverName, setUploadGiverName] = useState('');
  const [uploadCheckDate, setUploadCheckDate] = useState('');
  const [uploadExecutionDate, setUploadExecutionDate] = useState('');
  const [showGiverSuggestions, setShowGiverSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<any[]>([]);

  const [selectedChecks, setSelectedChecks] = useState<Map<string, boolean>>(new Map());

  // Client payment states
  const [clientPaymentDialogOpen, setClientPaymentDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [transferToSafeDialogOpen, setTransferToSafeDialogOpen] = useState(false);
  const [individualTransferDialogOpen, setIndividualTransferDialogOpen] = useState(false);
  const [bulkTransferDialogOpen, setBulkTransferDialogOpen] = useState(false);
  const [selectedCheckForTransfer, setSelectedCheckForTransfer] = useState<CheckInventoryItem | null>(null);
  const [transferAdminId, setTransferAdminId] = useState('');
  const [transferSaleId, setTransferSaleId] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [transferCofferId, setTransferCofferId] = useState('main');
  const [coffers, setCoffers] = useState<Array<{ id: string; name: string }>>([]);
  // Individual transfer dialog states
  const [individualTransferStoreId, setIndividualTransferStoreId] = useState('');
  const [individualTransferSaleId, setIndividualTransferSaleId] = useState('');
  const [individualTransferNotes, setIndividualTransferNotes] = useState('');

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const fetchCheckInventory = async () => {
    try {
      console.log('\n=== FETCH CHECK INVENTORY - START ===');
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
        console.log('✓ Response received successfully');
        console.log(`Total checks fetched: ${data.check_inventory?.length || 0}`);

        // Debug: ensure backend is returning date columns.
        try {
          const sample = data.check_inventory?.[0];
          console.log('[CheckInventory] sample keys:', sample ? Object.keys(sample) : 'no rows');
          if (sample) {
            console.log('[CheckInventory] sample check_date:', sample.check_date);
            console.log('[CheckInventory] sample due_date:', sample.due_date);
            console.log('[CheckInventory] sample execution_date:', sample.execution_date);
          }
        } catch (e) {
          // ignore
        }

        // Enrich check data with user and store information
        // NOTE: created_by/store enrichment requires users+stores to already be loaded.
        const enrichedChecks = data.check_inventory?.map((check: any) => {
          // Find the user who created this check
          const createdByUser = users.find((u) => u.id === check.created_by);

          // Find the store associated with the creator
          let createdByStore = null;
          if (createdByUser?.store_id) {
            createdByStore = stores.find((s) => s.id === createdByUser.store_id);
          }

          // Normalize date fields so the table can always show them.
          // Your API response shows it returns `due_date` (but not always `check_date`).
          // So we fallback `check_date` to `created_at` to always show a meaningful date.
          const normalizedCheckDate =
            check.check_date ??
            check.date_emission ??
            check.check_emission_date ??
            check.created_at ??
            null;

          const normalizedDueDate =
            check.due_date ??
            check.execution_date ??
            check.date_echeance ??
            null;

          return {
            ...check,
            check_date: normalizedCheckDate,
            due_date: normalizedDueDate,
            created_by_user: createdByUser
              ? {
                  id: createdByUser.id,
                  email: createdByUser.email,
                  full_name: createdByUser.full_name || createdByUser.name,
                  role: createdByUser.role,
                }
              : undefined,
            created_by_store: createdByStore
              ? {
                  id: createdByStore.id,
                  name: createdByStore.name,
                }
              : undefined,
          };
        }) || [];
        
        // Detailed logging for each check
        enrichedChecks.forEach((check: any, index: number) => {
          console.log(`\n--- Check #${index + 1}: ${check.check_id_number} ---`);
          console.log(`  ID: ${check.id}`);
          console.log(`  Status: ${check.status}`);
          console.log(`  Amount Value: ${check.amount_value} MAD`);
          console.log(`  Original Amount: ${check.original_amount} MAD`);
          console.log(`  Remaining Balance: ${check.remaining_balance} MAD`);
          console.log(`  Usage Percentage: ${check.usage_percentage}%`);
          console.log(`  Given To: ${check.given_to}`);
          console.log(`  Giver ID: ${check.giver_id}`);
          console.log(`  Receiver ID: ${check.receiver_id}`);
          console.log(`  Created: ${new Date(check.created_at).toLocaleString('fr-FR')}`);
          console.log(`  Updated: ${new Date(check.updated_at).toLocaleString('fr-FR')}`);
          console.log(`  Created By: ${check.created_by_user?.full_name || check.created_by_user?.email || 'N/A'}`);
          console.log(`  Store: ${check.created_by_store?.name || 'N/A'}`);
          
          // Calculate used amount
          const original = check.amount_value ?? 0;
          const remaining = check.remaining_balance === null ? 0 : (check.remaining_balance ?? original);
          const used = Math.max(0, original - remaining);
          console.log(`  Calculated Used: ${used} MAD`);
          console.log(`  Status should be: ${remaining <= 0 ? 'USED ✓' : 'PARTLY_USED'}`);
        });
        
        console.log('\n=== FETCH CHECK INVENTORY - END ===\n');
        setCheckInventory(enrichedChecks);
      } else {
        console.error('✗ Response not OK:', response.status);
        toast.error('Erreur lors du chargement de l\'inventaire des chèques');
      }
    } catch (error) {
      console.error('✗ Error fetching check inventory:', error);
      toast.error('Erreur lors du chargement de l\'inventaire des chèques');
    } finally {
      setLoading(false);
    }
  };

  const fetchStoresAndSuppliers = async () => {
    try {
      const [storesRes, suppliersRes, clientsRes, salesRes, usersRes] = await Promise.all([
        fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/stores`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/suppliers`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/clients`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/sales`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/users`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        }),
      ]);

      if (storesRes.ok) {
        const data = await storesRes.json();
        setStores(data.stores || []);
      }

      if (suppliersRes.ok) {
        const data = await suppliersRes.json();
        setSuppliers(data.suppliers || []);
      }

      if (clientsRes.ok) {
        const data = await clientsRes.json();
        setClients(data.clients || []);
      }

      if (salesRes.ok) {
        const data = await salesRes.json();
        setSales(data.sales || []);
      }

      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data.users || []);
        console.log('Users fetched:', data.users);
      } else {
        console.error('Failed to fetch users:', usersRes.status);
      }
    } catch (error) {
      console.error('Error fetching stores/suppliers/clients/sales/users:', error);
    }
  };

  const handleGiverNameChange = (value: string) => {
    setUploadGiverName(value);
    
    if (value.trim() === '') {
      setFilteredSuggestions([]);
      setShowGiverSuggestions(false);
    } else {
      // Show only clients
      const filtered = clients.filter(client =>
        client.name?.toLowerCase().includes(value.toLowerCase())
      );
      
      setFilteredSuggestions(filtered.map(c => ({ ...c, type: 'client', displayName: c.name })));
      setShowGiverSuggestions(filtered.length > 0);
    }
  };

  const selectSuggestion = (suggestion: any) => {
    setUploadGiverName(suggestion.displayName);
    setShowGiverSuggestions(false);
  };

  useEffect(() => {
    // Load coffers from localStorage
    const storedCoffers = localStorage.getItem('coffers');
    if (storedCoffers) {
      try {
        const parsedCoffers = JSON.parse(storedCoffers);
        setCoffers(parsedCoffers);
      } catch (error) {
        console.error('Error parsing coffers from localStorage:', error);
        // Initialize with main coffer if parsing fails
        setCoffers([{ id: 'main', name: 'Coffre Principal' }]);
      }
    } else {
      // Initialize with main coffer if no coffers exist
      setCoffers([{ id: 'main', name: 'Coffre Principal' }]);
    }
  }, []);

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/users`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        if (!res.ok) return;
        const data = await res.json();
        const me = data.users?.find((u: any) => u.id === session.user.id);
        if (me) {
          setCurrentUserRole(String(me.role || 'user'));
          setCurrentUserPermissions(Array.isArray(me.permissions) ? me.permissions : []);
        }
      } catch (e) {
        console.warn('[CheckInventoryModule] Could not resolve current user:', e);
      }
    };

    // Order matters: inventory enrichment depends on users+stores.
    fetchMe();
    fetchStoresAndSuppliers();
  }, []);

  useEffect(() => {
    // Once stores/users are loaded, load (or reload) inventory so dates/magasin/creator resolve.
    // Require USERS specifically because magasin+admin detection depends on creator user.
    if (users.length === 0) return;
    fetchCheckInventory();
  }, [users, stores]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canAddCheckInventory) {
      toast.error("Vous n'avez pas la permission « Ajouter un Chèque »");
      return;
    }

    // All fields are now optional - no validation required
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
        // Backend expects yyyy-mm-dd for check_date (DATE column).
        // Ensure we always send it as yyyy-mm-dd (not locale dd/mm/yyyy).
        const normalizedCheckDateToSend = uploadCheckDate
          ? new Date(`${uploadCheckDate}T00:00:00`).toISOString().slice(0, 10)
          : '';

        formDataUpload.append('check_date', normalizedCheckDateToSend);
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
          setUploadDialogOpen(false);
          setUploadFile(null);
          setUploadCheckId('');
          setUploadAmount('');
          setUploadNotes('');
          fetchCheckInventory();
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
              given_to: uploadGiverName || session?.user?.email || 'unknown',
              given_to_type: uploadGiverName ? 'client' : 'user',
              given_to_id: null,
              status: 'pending',
              notes: uploadNotes || null,
              check_date: uploadCheckDate || null,
              due_date: uploadExecutionDate || null,
            }),
          }
        );

        if (response.ok) {
          toast.success('Chèque créé avec succès');
          setUploadDialogOpen(false);
          setUploadFile(null);
          setUploadCheckId('');
          setUploadAmount('');
          setUploadNotes('');
          setUploadGiverName('');
          setUploadCheckDate(getTodayDate());
          setUploadExecutionDate(getTodayDate());
          fetchCheckInventory();
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
  };

  const handleDelete = async (id: string) => {
    if (!canDeleteCheckInventory) {
      toast.error("Vous n'avez pas la permission « Supprimer un Chèque »");
      return;
    }

    if (!confirm('Êtes-vous sûr de vouloir supprimer ce chèque?')) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory/${id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        toast.success('Chèque supprimé');
        fetchCheckInventory();
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    if (!canEditCheckInventory) {
      toast.error("Vous n'avez pas la permission « Modifier un Chèque »");
      return;
    }

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory/${id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (response.ok) {
        toast.success('Statut mis à jour');
        fetchCheckInventory();
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const openEditDialog = (check: CheckInventoryItem) => {
    if (!canEditCheckInventory) {
      toast.error("Vous n'avez pas la permission « Modifier un Chèque »");
      return;
    }

    setEditTarget(check);
    setEditCheckIdNumber(String(check.check_id_number || ''));
    setEditAmountValue(String(check.amount_value ?? ''));
    setEditFile(null);
    setEditGivenTo(String(check.given_to || ''));
    setEditNotes(String(check.notes || ''));

    const cd = (check as any).check_date ? new Date(String((check as any).check_date)) : null;
    const dd = ((check as any).due_date || (check as any).execution_date)
      ? new Date(String((check as any).due_date || (check as any).execution_date))
      : null;

    setEditCheckDate(cd && !Number.isNaN(cd.getTime()) ? cd.toISOString().slice(0, 10) : '');
    setEditDueDate(dd && !Number.isNaN(dd.getTime()) ? dd.toISOString().slice(0, 10) : '');

    setEditDialogOpen(true);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editTarget) return;
    if (!canEditCheckInventory) {
      toast.error("Vous n'avez pas la permission « Modifier un Chèque »");
      return;
    }

    setLoading(true);
    try {
      // If a file is selected, use multipart upload-edit endpoint.
      // Otherwise do a JSON edit.
      const url = editFile
        ? `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory/${editTarget.id}/edit-upload`
        : `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory/${editTarget.id}`;

      const res = await (async () => {
        if (editFile) {
          const fd = new FormData();
          fd.append('file', editFile);
          fd.append('check_id_number', editCheckIdNumber);
          fd.append('given_to', editGivenTo);
          fd.append('notes', editNotes || '');
          fd.append('check_date', editCheckDate || '');
          fd.append('due_date', editDueDate || '');

          return fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: fd,
          });
        }

        const payload: any = {
          check_id_number: editCheckIdNumber,
          given_to: editGivenTo,
          notes: editNotes || null,
          check_date: editCheckDate || null,
          due_date: editDueDate || null,
        };

        return fetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        });
      })();

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Erreur lors de la modification');
        return;
      }

      toast.success('Chèque modifié avec succès');
      setEditDialogOpen(false);
      setEditTarget(null);
      await fetchCheckInventory();
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'received':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'used':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'partly_used':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'archived':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return 'En attente';
      case 'received':
        return 'Reçu';
      case 'used':
        return 'Utilisé';
      case 'partly_used':
        return 'Partiellement utilisé';
      case 'archived':
        return 'Archivé';
      default:
        return status;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4" />;
      case 'received':
        return <CheckCircle className="w-4 h-4" />;
      case 'used':
        return <CheckCircle className="w-4 h-4" />;
      case 'archived':
        return <Archive className="w-4 h-4" />;
      default:
        return null;
    }
  };

  // Determine if current user is giver or receiver
  const isGiver = (check: CheckInventoryItem) => check.giver_id === session?.user?.id;
  const isReceiver = (check: CheckInventoryItem) => check.receiver_id === session?.user?.id;

  // Get check color based on role and status
  const getCheckColor = (check: CheckInventoryItem) => {
    // Pending status gets neutral white/light gray for both giver and receiver
    if (check.status === 'pending') {
      return 'rgb(243, 244, 246)'; // Very light white/gray for pending
    }
    
    // Received status (assigned to admin) gets blue
    if (check.status === 'received') {
      return 'rgb(59, 130, 246)'; // Blue for assigned to admin
    }
    
    // Used status gets red
    if (check.status === 'used') {
      return 'rgb(220, 38, 38)'; // Red for used
    }
    
    if (isGiver(check)) {
      return 'rgb(220, 38, 38)'; // Red for giver
    } else if (isReceiver(check)) {
      return 'rgb(16, 185, 129)'; // Brighter green for receiver
    }
    return 'rgb(156, 163, 175)'; // Gray default
  };

  const filteredChecks = checkInventory.filter(check => {
    // Search filter
    const matchesSearch =
      !searchTerm ||
      check.check_id_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      check.given_to.toLowerCase().includes(searchTerm.toLowerCase());

    // Name filter
    const matchesName =
      !filterName ||
      check.given_to.toLowerCase().includes(filterName.toLowerCase());

    // Date range filter (creation date)
    const checkDate = new Date(check.created_at);
    const fromDate = filterDateFrom ? new Date(filterDateFrom) : null;
    const toDate = filterDateTo ? new Date(filterDateTo) : null;
    const matchesDateRange =
      (!fromDate || checkDate >= fromDate) &&
      (!toDate || checkDate <= toDate);

    // Legacy "execution date" range filter (kept for backward compatibility)
    const executionDateFrom = filterExecutionDateFrom ? new Date(filterExecutionDateFrom) : null;
    const executionDateTo = filterExecutionDateTo ? new Date(filterExecutionDateTo) : null;
    const checkExecutionDate = check.updated_at ? new Date(check.updated_at) : null;
    const matchesExecutionDateRange =
      (!executionDateFrom || (checkExecutionDate && checkExecutionDate >= executionDateFrom)) &&
      (!executionDateTo || (checkExecutionDate && checkExecutionDate <= executionDateTo));

    // Classic filters: Date Chèque
    const rawCheckDate: any = (check as any).check_date;
    const parsedCheckDate = rawCheckDate ? new Date(rawCheckDate) : null;
    const checkDateFrom = filterCheckDateFrom ? new Date(filterCheckDateFrom) : null;
    const checkDateTo = filterCheckDateTo ? new Date(filterCheckDateTo) : null;
    const matchesCheckDateRange =
      (!checkDateFrom || (parsedCheckDate && parsedCheckDate >= checkDateFrom)) &&
      (!checkDateTo || (parsedCheckDate && parsedCheckDate <= checkDateTo));

    // Classic filters: Date Échéance
    const rawDueDate: any = (check as any).due_date || (check as any).execution_date;
    const parsedDueDate = rawDueDate ? new Date(rawDueDate) : null;
    const dueDateFrom = filterDueDateFrom ? new Date(filterDueDateFrom) : null;
    const dueDateTo = filterDueDateTo ? new Date(filterDueDateTo) : null;
    const matchesDueDateRange =
      (!dueDateFrom || (parsedDueDate && parsedDueDate >= dueDateFrom)) &&
      (!dueDateTo || (parsedDueDate && parsedDueDate <= dueDateTo));

    // Amount range filter (Original)
    const checkAmount = check.amount_value || 0;
    const amountFrom = filterAmountFrom ? parseFloat(filterAmountFrom) : null;
    const amountTo = filterAmountTo ? parseFloat(filterAmountTo) : null;
    const matchesAmountRange =
      (!amountFrom || checkAmount >= amountFrom) &&
      (!amountTo || checkAmount <= amountTo);

    // Classic filters: Utilisé / Disponible
    const original = check.amount_value ?? 0;
    const remaining = check.remaining_balance === null ? 0 : (check.remaining_balance ?? original);
    const used = Math.max(0, original - remaining);

    const usedFrom = filterUsedFrom ? parseFloat(filterUsedFrom) : null;
    const usedTo = filterUsedTo ? parseFloat(filterUsedTo) : null;
    const matchesUsedRange =
      (!usedFrom || used >= usedFrom) &&
      (!usedTo || used <= usedTo);

    const availableFrom = filterAvailableFrom ? parseFloat(filterAvailableFrom) : null;
    const availableTo = filterAvailableTo ? parseFloat(filterAvailableTo) : null;
    const matchesAvailableRange =
      (!availableFrom || remaining >= availableFrom) &&
      (!availableTo || remaining <= availableTo);

    // Status filter
    const matchesStatus = statusFilter === 'all' || check.status === statusFilter;

    // Store filter (magasin) derived from creator user store
    const createdStoreId = String((check as any).created_by_store?.id || '');
    const matchesStore = filterStoreId === 'all' || createdStoreId === String(filterStoreId);

    return (
      matchesSearch &&
      matchesName &&
      matchesDateRange &&
      matchesExecutionDateRange &&
      matchesCheckDateRange &&
      matchesDueDateRange &&
      matchesAmountRange &&
      matchesUsedRange &&
      matchesAvailableRange &&
      matchesStatus &&
      matchesStore
    );
  });

  const sortedChecks = (() => {
    const list = filteredChecks.slice();
    if (!sortConfig) return list;

    const { key, direction } = sortConfig;
    const factor = direction === 'asc' ? 1 : -1;

    const getValue = (c: any) => {
      switch (key) {
        case 'check_id_number':
          return getSortableString(c?.check_id_number);
        case 'magasin':
          return getSortableString(getCheckMagasinName(c) || getReportMagasinLabel(c));
        case 'check_date':
          return new Date(String(c?.check_date ?? '')).getTime() || 0;
        case 'due_date':
          return new Date(String(c?.due_date || c?.execution_date || '')).getTime() || 0;
        case 'amount_original':
          return getCheckUsedAvailable(c).original;
        case 'amount_used':
          return getCheckUsedAvailable(c).used;
        case 'amount_available':
          return getCheckUsedAvailable(c).remaining;
        case 'given_to':
          return getSortableString(c?.given_to);
        case 'given_to_type':
          return getSortableString(c?.given_to_type);
        case 'status':
          return getSortableString(getStatusLabel(c?.status));
        case 'created_at':
          return new Date(String(c?.created_at ?? '')).getTime() || 0;
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

  const stats = {
    total: filteredChecks.length,
    pending: filteredChecks.filter(c => c.status === 'pending').length,
    received: filteredChecks.filter(c => c.status === 'received').length,
    used: filteredChecks.filter(c => c.status === 'used').length,
    partlyUsed: filteredChecks.filter(c => c.status === 'partly_used').length,
    totalAmount: filteredChecks.reduce((sum, c) => sum + (c.amount_value || 0), 0),
    pendingAmount: filteredChecks
      .filter(c => c.status === 'pending')
      .reduce((sum, c) => sum + (c.amount_value || 0), 0),
    usedAmount: filteredChecks
      .filter(c => c.status === 'used')
      .reduce((sum, c) => sum + (c.amount_value || 0), 0),
    partlyUsedAmount: filteredChecks
      .filter(c => c.status === 'partly_used')
      .reduce((sum, c) => sum + (c.amount_value || 0), 0),
    receivedAmount: filteredChecks
      .filter(c => c.status === 'received')
      .reduce((sum, c) => sum + (c.amount_value || 0), 0),
  };

  const getReportMagasinLabel = (c: any) => {
    const storeName = c.created_by_store?.name;
    if (storeName && String(storeName).trim()) return String(storeName);

    // Prefer creator user info if available
    const email = c.created_by_user?.email;
    const fullName = c.created_by_user?.full_name;

    // Prevent leaking UUIDs in the report if we only have created_by id
    const createdBy = String(c.created_by ?? '');
    const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(createdBy);

    const label = (email && String(email).trim())
      ? `Admin (${email})`
      : (fullName && String(fullName).trim())
        ? `Admin (${fullName})`
        : (!looksLikeUuid && createdBy.trim())
          ? createdBy
          : '-';

    return label;
  };

  const exportToExcel = () => {
    try {
      const datePart = new Date().toISOString().split('T')[0];
      const rows = sortedChecks;

      const safe = (v: any) => String(v ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const money = (n: any) => `${(Number(n || 0) || 0).toFixed(2)} MAD`;

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
            <div class="title">RAPPORT - INVENTAIRE DES CHÈQUES</div>
            <div class="sub">Date: ${new Date().toLocaleDateString('fr-FR')}</div>

            <div class="stats">
              <div><b>Total chèques:</b> ${stats.total}</div>
              <div><b>En attente:</b> ${stats.pending} (${money(stats.pendingAmount)})</div>
              <div><b>Reçus:</b> ${stats.received} (${money(stats.receivedAmount)})</div>
              <div><b>Utilisés:</b> ${stats.used} (${money(stats.usedAmount)})</div>
              <div><b>Partiellement utilisés:</b> ${stats.partlyUsed} (${money(stats.partlyUsedAmount)})</div>
              <div><b>Montant total:</b> ${money(stats.totalAmount)}</div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>ID Chèque</th>
                  <th>Donneur</th>
                  <th>Magasin</th>
                  <th>Montant</th>
                  <th>Utilisé</th>
                  <th>Disponible</th>
                  <th>Statut</th>
                  <th>Date Chèque</th>
                  <th>Date Échéance</th>
                  <th>Date Création</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((c: any) => {
                  const original = c.amount_value ?? 0;
                  const remaining = c.remaining_balance === null ? 0 : (c.remaining_balance ?? original);
                  const used = Math.max(0, original - remaining);

                  const checkDate = c.check_date ? new Date(c.check_date).toLocaleDateString('fr-FR') : '-';
                  const dueDate = (c.due_date || c.execution_date) ? new Date(c.due_date || c.execution_date).toLocaleDateString('fr-FR') : '-';
                  const created = c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : '-';

                  return `
                    <tr>
                      <td>${safe(c.check_id_number || '-')}</td>
                      <td>${safe(c.given_to || '-')}</td>
                      <td>${safe(getReportMagasinLabel(c))}</td>
                      <td>${money(original)}</td>
                      <td>${money(used)}</td>
                      <td>${money(remaining)}</td>
                      <td>${safe(getStatusLabel(c.status))}</td>
                      <td>${safe(checkDate)}</td>
                      <td>${safe(dueDate)}</td>
                      <td>${safe(created)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </body>
        </html>
      `;

      const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Rapport_Inventaire_Cheques_${datePart}.xls`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Rapport exporté avec succès');
    } catch (e) {
      console.error('Error exporting check inventory Excel:', e);
      toast.error("Erreur lors de l'export Excel");
    }
  };

  const exportToPdf = () => {
    try {
      const doc = new jsPDF('l', 'mm', 'a4');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('RAPPORT - INVENTAIRE DES CHÈQUES', 148.5, 14, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 148.5, 20, { align: 'center' });

      const body = sortedChecks.map((c: any) => {
        const original = c.amount_value ?? 0;
        const remaining = c.remaining_balance === null ? 0 : (c.remaining_balance ?? original);
        const used = Math.max(0, original - remaining);

        const checkDate = c.check_date ? new Date(c.check_date).toLocaleDateString('fr-FR') : '-';
        const dueDate = (c.due_date || c.execution_date) ? new Date(c.due_date || c.execution_date).toLocaleDateString('fr-FR') : '-';
        const created = c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : '-';

        return [
          c.check_id_number || '-',
          c.given_to || '-',
          getReportMagasinLabel(c),
          `${(Number(original) || 0).toFixed(2)} MAD`,
          `${(Number(used) || 0).toFixed(2)} MAD`,
          `${(Number(remaining) || 0).toFixed(2)} MAD`,
          getStatusLabel(c.status),
          checkDate,
          dueDate,
          created,
        ];
      });

      autoTable(doc, {
        head: [[
          'ID Chèque',
          'Donneur',
          'Magasin',
          'Montant',
          'Utilisé',
          'Disponible',
          'Statut',
          'Date Chèque',
          'Date Échéance',
          'Date Création',
        ]],
        body,
        startY: 28,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [37, 99, 235] },
      });

      const datePart = new Date().toISOString().split('T')[0];
      doc.save(`Rapport_Inventaire_Cheques_${datePart}.pdf`);
      toast.success('PDF exporté avec succès');
      setShowPdfExportDialog(false);
    } catch (e) {
      console.error('Error exporting check inventory PDF:', e);
      toast.error("Erreur lors de l'export PDF");
    }
  };

  // Calculate selected checks total
  const selectedChecksList = Array.from(selectedChecks.keys()).map(id => 
    checkInventory.find(c => c.id === id)
  ).filter(Boolean) as CheckInventoryItem[];
  const selectedTotal = selectedChecksList.reduce((sum, c) => sum + (c.amount_value || 0), 0);

  if (showDetails && selectedCheck) {
    return (
      <CheckInventoryDetailsPage
        inventory={selectedCheck}
        onBack={() => setShowDetails(false)}
        session={session}
        onStatusUpdate={fetchCheckInventory}
      />
    );
  }

  if (!canViewCheckInventory) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Accès refusé</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">Vous n'avez pas la permission « Voir l'Inventaire des Chèques ».</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Check Inventory Overview Cards - Navbar Style */}
      <div className="flex flex-wrap w-full bg-white p-1 h-auto gap-1 border-b border-gray-200 rounded-lg">
        <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 rounded-lg border border-blue-200 flex-1 min-w-fit">
          <div>
            <p className="text-xs text-blue-600 font-semibold">Total Chèques</p>
            <p className="text-2xl font-bold text-blue-900">{stats.total}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 bg-yellow-50 rounded-lg border border-yellow-200 flex-1 min-w-fit">
          <div>
            <p className="text-xs text-yellow-600 font-semibold">En Attente</p>
            <p className="text-2xl font-bold text-yellow-900">{stats.pending}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 rounded-lg border border-blue-200 flex-1 min-w-fit">
          <div>
            <p className="text-xs text-blue-600 font-semibold">Reçus</p>
            <p className="text-2xl font-bold text-blue-900">{stats.received}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 bg-green-50 rounded-lg border border-green-200 flex-1 min-w-fit">
          <div>
            <p className="text-xs text-green-600 font-semibold">Utilisés</p>
            <p className="text-2xl font-bold text-green-900">{stats.used}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 bg-purple-50 rounded-lg border border-purple-200 flex-1 min-w-fit">
          <div>
            <p className="text-xs text-purple-600 font-semibold">Montant Total</p>
            <p className="text-2xl font-bold text-purple-900">{stats.totalAmount.toFixed(0)} MAD</p>
          </div>
        </div>
      </div>

      {/* Detailed Summary Cards - Status Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pending Checks */}
        <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <p className="text-xs text-yellow-700 font-semibold uppercase tracking-wide">En Attente</p>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold text-yellow-900">{stats.pending}</p>
                <p className="text-sm text-yellow-700">chèques</p>
              </div>
              <div className="pt-2 border-t border-yellow-200">
                <p className="text-sm font-semibold text-yellow-900">
                  {stats.pendingAmount.toFixed(2)} MAD
                </p>
                <p className="text-xs text-yellow-700">Montant total</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Partly Used Checks */}
        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <p className="text-xs text-orange-700 font-semibold uppercase tracking-wide">Partiellement Utilisés</p>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold text-orange-900">{stats.partlyUsed}</p>
                <p className="text-sm text-orange-700">chèques</p>
              </div>
              <div className="pt-2 border-t border-orange-200">
                <p className="text-sm font-semibold text-orange-900">
                  {stats.partlyUsedAmount.toFixed(2)} MAD
                </p>
                <p className="text-xs text-orange-700">Montant total</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Used Checks */}
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <p className="text-xs text-green-700 font-semibold uppercase tracking-wide">Complètement Utilisés</p>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold text-green-900">{stats.used}</p>
                <p className="text-sm text-green-700">chèques</p>
              </div>
              <div className="pt-2 border-t border-green-200">
                <p className="text-sm font-semibold text-green-900">
                  {stats.usedAmount.toFixed(2)} MAD
                </p>
                <p className="text-xs text-green-700">Montant total</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Summary */}
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <p className="text-xs text-purple-700 font-semibold uppercase tracking-wide">Résumé Global</p>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold text-purple-900">{stats.total}</p>
                <p className="text-sm text-purple-700">chèques</p>
              </div>
              <div className="pt-2 border-t border-purple-200">
                <p className="text-sm font-semibold text-purple-900">
                  {stats.totalAmount.toFixed(2)} MAD
                </p>
                <p className="text-xs text-purple-700">Montant total</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Check Inventory Table */}
      <Card className="bg-white">
        <CardHeader className="bg-white">
          <div className="flex items-center justify-between">
            <CardTitle>Inventaire des Chèques Reçus</CardTitle>
            <div className="flex gap-2 flex-wrap">
              <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Modifier un Chèque</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleEditSave} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit_check_id">ID du Chèque</Label>
                      <Input
                        id="edit_check_id"
                        value={editCheckIdNumber}
                        onChange={(e) => setEditCheckIdNumber(e.target.value)}
                        placeholder="Ex: CHK-2024-001"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Montant (MAD)</Label>
                      <Input
                        value={editAmountValue}
                        readOnly
                        disabled
                      />
                      <p className="text-xs text-gray-500">Le montant n'est pas modifiable.</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit_file">Pièce jointe (Image ou PDF)</Label>
                      <Input
                        id="edit_file"
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => setEditFile(e.target.files?.[0] || null)}
                      />
                      <p className="text-xs text-gray-500">Optionnel. JPG, PNG ou PDF.</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit_given_to">Donné par</Label>
                      <Input
                        id="edit_given_to"
                        value={editGivenTo}
                        onChange={(e) => setEditGivenTo(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit_check_date">Date Chèque</Label>
                      <Input
                        id="edit_check_date"
                        type="date"
                        value={editCheckDate}
                        onChange={(e) => setEditCheckDate(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit_due_date">Date Échéance</Label>
                      <Input
                        id="edit_due_date"
                        type="date"
                        value={editDueDate}
                        onChange={(e) => setEditDueDate(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit_notes">Notes</Label>
                      <textarea
                        id="edit_notes"
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        className="w-full px-3 py-2 border rounded-md text-sm min-h-20"
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setEditDialogOpen(false);
                          setEditTarget(null);
                        }}
                      >
                        Annuler
                      </Button>
                      <Button type="submit" disabled={loading}>
                        {loading ? 'Enregistrement...' : 'Enregistrer'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>

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
                      Ce PDF exporte la liste des chèques filtrés en tableau.
                    </p>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setShowPdfExportDialog(false)}>Annuler</Button>
                      <Button onClick={exportToPdf} style={{ backgroundColor: '#ea580c', color: 'white' }}>Exporter</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {selectedChecks.size > 0 && (
                <>
                  <Dialog open={transferToSafeDialogOpen} onOpenChange={setTransferToSafeDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        style={{ backgroundColor: '#7c3aed' }}
                        className="text-white font-semibold hover:opacity-90"
                        disabled={!canTransferCheckToCoffre}
                        title={!canTransferCheckToCoffre ? "Vous n'avez pas la permission « Transférer un Chèque au Coffre »" : undefined}
                      >
                        <Lock className="w-4 h-4 mr-2" />
                        Transférer au Coffre ({selectedChecks.size})
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Transférer au Coffre-fort</DialogTitle>
                      </DialogHeader>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();

                          if (!canTransferCheckToCoffre) {
                            toast.error("Vous n'avez pas la permission « Transférer un Chèque au Coffre »");
                            return;
                          }

                          setLoading(true);
                          try {
                            // Get all selected check IDs
                            const checkIds = Array.from(selectedChecks.keys());

                            // Compute total amount for caisse history logging
                            const selectedChecksRows = checkIds
                              .map((id) => checkInventory.find((c) => c.id === id))
                              .filter(Boolean) as CheckInventoryItem[];

                            const transferTotal = selectedChecksRows.reduce((sum, c) => sum + (Number(c.amount_value || 0) || 0), 0);

                            // Transfer each check to safe
                            for (const checkId of checkIds) {
                              const response = await fetch(
                                `https://${projectId}.supabase.co/functions/v1/super-handler/check-safe/transfer`,
                                {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${session.access_token}`,
                                  },
                                  body: JSON.stringify({
                                    check_inventory_id: checkId,
                                    admin_id: transferAdminId,
                                    sale_id: transferSaleId || null,
                                    coffer_id: transferCofferId,
                                    verification_notes: transferNotes,
                                  }),
                                }
                              );

                              if (!response.ok) {
                                const error = await response.json();
                                toast.error(error.error || 'Erreur lors du transfert');
                                setLoading(false);
                                return;
                              }
                            }

                            // GUARANTEE caisse audit trail:
                            // 1) Try to create a caisse-expenses movement (preferred, server-side).
                            // 2) If it fails (permissions/RLS), save a local audit event as a fallback.
                            try {
                              const cofferLabel = transferCofferId === 'main' ? 'Coffre Principal' : `Coffre ${transferCofferId}`;
                              const idsLabel = selectedChecksRows
                                .map((c) => String(c.check_id_number || c.id))
                                .slice(0, 8)
                                .join(', ');
                              const suffix = selectedChecksRows.length > 8 ? ` …(+${selectedChecksRows.length - 8})` : '';

                              const reason = `Transformation: Chèque → ${cofferLabel} • ${selectedChecksRows.length} chèque(s) • ${idsLabel}${suffix}`;

                              // Find admin store_id to correctly scope the caisse
                              const adminStoreId = (() => {
                                const adminUser = users.find((u) => u.id === transferAdminId);
                                return adminUser?.store_id || null;
                              })();

                              const payload = {
                                expense_type: 'caisse_out_check',
                                amount: -Math.abs(Number(transferTotal || 0) || 0),
                                reason,
                                category: 'Versement au Coffre',
                                store_id: adminStoreId,
                              };

                              const res = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/caisse-expenses`, {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  'Authorization': `Bearer ${session.access_token}`,
                                },
                                body: JSON.stringify(payload),
                              });

                              if (!res.ok) {
                                // Fallback: local audit event that the Caisse page reads.
                                const CAISSE_AUDIT_EVENTS_KEY = 'caisse_audit_events_v1';
                                const nowIso = new Date().toISOString();
                                const evt = {
                                  id: `caisse-out-local-${nowIso}-${Math.random().toString(16).slice(2)}`,
                                  date: nowIso,
                                  store_id: adminStoreId,
                                  amount: payload.amount,
                                  reason: payload.reason,
                                  payment_method: 'check',
                                  reference: idsLabel || nowIso,
                                  client_name: cofferLabel,
                                  source_id: `transfer:${nowIso}`,
                                };

                                try {
                                  const raw = localStorage.getItem(CAISSE_AUDIT_EVENTS_KEY);
                                  const list = raw ? JSON.parse(raw) : [];
                                  const arr = Array.isArray(list) ? list : [];
                                  arr.push(evt);
                                  localStorage.setItem(CAISSE_AUDIT_EVENTS_KEY, JSON.stringify(arr));
                                } catch {
                                  // ignore
                                }
                              }
                            } catch (e) {
                              console.warn('[CheckInventory] Could not create caisse_out_check history row:', e);
                            }

                            toast.success(`${checkIds.length} chèque(s) transféré(s) au coffre-fort avec succès`);
                            setTransferToSafeDialogOpen(false);
                            setSelectedChecks(new Map());
                            setTransferAdminId('');
                            setTransferSaleId('');
                            setTransferNotes('');
                            fetchCheckInventory();
                          } catch (error: any) {
                            toast.error(`Erreur: ${error.message}`);
                          } finally {
                            setLoading(false);
                          }
                        }}
                        className="space-y-4"
                      >
                        {/* Summary */}
                        <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
                          <p className="text-xs text-purple-600 font-semibold">Résumé</p>
                          <p className="text-sm font-bold text-purple-900">{selectedChecks.size} chèque(s) sélectionné(s)</p>
                          <p className="text-xs text-purple-600 mt-1">
                            Montant total: {selectedTotal.toFixed(2)} MAD
                          </p>
                        </div>

                        {/* Admin Selection */}
                        <div className="space-y-2">
                          <Label htmlFor="transfer_admin_bulk">Administrateur *</Label>
                          <select
                            id="transfer_admin_bulk"
                            value={transferAdminId}
                            onChange={(e) => setTransferAdminId(e.target.value)}
                            className="w-full px-3 py-2 border rounded-md bg-white text-sm"
                            required
                          >
                            <option value="">Sélectionner un administrateur</option>
                            {users.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.name || user.email}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Coffer Selection */}
                        <div className="space-y-2">
                          <Label htmlFor="transfer_coffer_bulk">Coffre-fort *</Label>
                          <select
                            id="transfer_coffer_bulk"
                            value={transferCofferId}
                            onChange={(e) => setTransferCofferId(e.target.value)}
                            className="w-full px-3 py-2 border rounded-md bg-white text-sm"
                            required
                          >
                            <option value="main">Coffre Principal</option>
                            {coffers.filter(c => c.id !== 'main').map((coffer) => (
                              <option key={coffer.id} value={coffer.id}>
                                {coffer.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Sale Selection (Optional) */}
                        <div className="space-y-2">
                          <Label htmlFor="transfer_sale_bulk">Vente liée (optionnel)</Label>
                          <select
                            id="transfer_sale_bulk"
                            value={transferSaleId}
                            onChange={(e) => setTransferSaleId(e.target.value)}
                            className="w-full px-3 py-2 border rounded-md bg-white text-sm"
                          >
                            <option value="">Aucune vente</option>
                            {sales.map((sale) => (
                              <option key={sale.id} value={sale.id}>
                                {sale.sale_number} - {sale.total_amount} MAD
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Verification Notes */}
                        <div className="space-y-2">
                          <Label htmlFor="transfer_notes_bulk">Notes de vérification</Label>
                          <textarea
                            id="transfer_notes_bulk"
                            value={transferNotes}
                            onChange={(e) => setTransferNotes(e.target.value)}
                            placeholder="Notes sur la vérification des chèques..."
                            className="w-full px-3 py-2 border rounded-md text-sm min-h-20"
                          />
                        </div>

                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setTransferToSafeDialogOpen(false)}
                          >
                            Annuler
                          </Button>
                          <Button
                            type="submit"
                            disabled={loading || !transferAdminId}
                            style={{ backgroundColor: '#7c3aed' }}
                            className="text-white hover:opacity-90"
                          >
                            {loading ? 'Transfert...' : 'Transférer au Coffre'}
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={clientPaymentDialogOpen} onOpenChange={setClientPaymentDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                          style={{ backgroundColor: '#0891b2' }}
                          className="text-white font-semibold hover:opacity-90"
                          disabled={!canPayClientByCheck}
                          title={!canPayClientByCheck ? "Vous n'avez pas la permission « Payer un Client par Chèque »" : undefined}
                        >
                        <DollarSign className="w-4 h-4 mr-2" />
                        Payer Client ({selectedChecks.size})
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Sélectionner le Client</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="bg-cyan-50 p-4 rounded-lg border border-cyan-200">
                          <p className="text-sm text-cyan-600 font-semibold mb-2">Résumé</p>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span>Chèques sélectionnés:</span>
                              <span className="font-semibold">{selectedChecks.size}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Montant total:</span>
                              <span className="font-bold text-cyan-600">{selectedTotal.toFixed(2)} MAD</span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">Choisir un Client</Label>
                          <Input
                            placeholder="Rechercher un client..."
                            value={clientSearchTerm}
                            onChange={(e) => setClientSearchTerm(e.target.value)}
                            className="text-sm"
                          />
                          <div className="border rounded-lg max-h-64 overflow-y-auto space-y-2 p-2">
                            {clientSearchTerm.trim() === '' ? (
                              <p className="text-sm text-gray-500 text-center py-4">
                                Tapez pour rechercher un client...
                              </p>
                            ) : clients.filter(c => 
                              c.name?.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
                              c.phone?.toLowerCase().includes(clientSearchTerm.toLowerCase())
                            ).length === 0 ? (
                              <p className="text-sm text-gray-500 text-center py-4">
                                Aucun résultat
                              </p>
                            ) : (
                              clients
                                .filter(c => 
                                  c.name?.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
                                  c.phone?.toLowerCase().includes(clientSearchTerm.toLowerCase())
                                )
                                .map((client) => {
                                  return (
                                    <button
                                      key={client.id}
                                      onClick={() => {
                                        setSelectedClient(client);
                                        setClientSearchTerm('');
                                      }}
                                      className={`w-full text-left px-3 py-2 rounded-lg border-2 transition-all text-sm ${
                                        selectedClient?.id === client.id
                                          ? 'border-cyan-500 bg-cyan-50'
                                          : 'border-gray-200 hover:border-gray-300'
                                      }`}
                                    >
                                      <div className="flex justify-between items-center">
                                        <div>
                                          <p className="font-semibold text-gray-900">{client.name}</p>
                                          <p className="text-xs text-gray-600">{client.phone || 'N/A'}</p>
                                        </div>
                                      </div>
                                    </button>
                                  );
                                })
                            )}
                          </div>
                        </div>

                        {selectedClient && (
                          <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-300 space-y-3">
                            <p className="text-sm font-bold text-blue-900">📊 Détails du Paiement</p>
                            
                            <div className="space-y-2">
                              <div className="flex justify-between items-center p-2 bg-white rounded border border-blue-200">
                                <span className="text-sm text-gray-700">Client:</span>
                                <span className="font-bold text-gray-900">{selectedClient.name}</span>
                              </div>
                              
                              <div className="flex justify-between items-center p-2 bg-white rounded border border-cyan-200">
                                <span className="text-sm text-gray-700">Sera payé:</span>
                                <span className="font-bold text-cyan-600">{selectedTotal.toFixed(2)} MAD</span>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setClientPaymentDialogOpen(false);
                              setSelectedClient(null);
                            }}
                          >
                            Annuler
                          </Button>
                          <Button
                            type="button"
                            style={{ backgroundColor: '#0891b2' }}
                            className="text-white hover:opacity-90"
                            disabled={!selectedClient}
                            onClick={async () => {
                              if (!canPayClientByCheck) {
                                toast.error("Vous n'avez pas la permission « Payer un Client par Chèque »");
                                return;
                              }

                              setLoading(true);
                              try {
                                // Get the actual check objects
                                const checkIds = Array.from(selectedChecks.keys());
                                const checksToProcess = checkIds.map(id => 
                                  checkInventory.find(c => c.id === id)
                                ).filter(Boolean) as CheckInventoryItem[];

                                // Get all invoices for this client
                                const invoicesResponse = await fetch(
                                  `https://${projectId}.supabase.co/functions/v1/super-handler/invoices`,
                                  {
                                    headers: {
                                      'Authorization': `Bearer ${session.access_token}`,
                                    },
                                  }
                                );

                                if (invoicesResponse.ok) {
                                  const data = await invoicesResponse.json();
                                  const invoices = data.invoices || [];
                                  
                                  // Find invoices for this client
                                  const clientInvoices = invoices.filter(
                                    (inv: any) => inv.client_ice === selectedClient.ice || inv.client_name === selectedClient.name
                                  );

                                  // Calculate how much of each check will be used
                                  let remainingPayment = selectedTotal;
                                  const checkUpdates: Array<{
                                    id: string;
                                    status: string;
                                    remaining_balance: number;
                                    usage_percentage: number;
                                  }> = [];

                                  for (const check of checksToProcess) {
                                    const checkAvailable = check.remaining_balance ?? check.amount_value ?? 0;
                                    
                                    if (remainingPayment <= 0) break;

                                    const amountToUseFromCheck = Math.min(remainingPayment, checkAvailable);
                                    const newRemaining = Math.max(0, checkAvailable - amountToUseFromCheck);
                                    const usagePercentage = checkAvailable > 0 ? (amountToUseFromCheck / checkAvailable) * 100 : 0;
                                    const newStatus = newRemaining > 0 ? 'partly_used' : 'used';
                                    
                                    checkUpdates.push({
                                      id: check.id,
                                      status: newStatus,
                                      remaining_balance: newRemaining,
                                      usage_percentage: usagePercentage
                                    });
                                    
                                    remainingPayment -= amountToUseFromCheck;
                                  }

                                  // Sort invoices by remaining balance (highest first)
                                  const sortedInvoices = clientInvoices.sort((a: any, b: any) => 
                                    (b.remaining_balance || 0) - (a.remaining_balance || 0)
                                  );

                                  let remainingPaymentForInvoices = selectedTotal;
                                  let updatedInvoices = [];

                                  // Apply payment to invoices
                                  for (const invoice of sortedInvoices) {
                                    if (remainingPaymentForInvoices <= 0) break;

                                    const invoiceRemaining = invoice.remaining_balance || 0;
                                    const paymentForThisInvoice = Math.min(remainingPaymentForInvoices, invoiceRemaining);
                                    
                                    const newAmountPaid = (invoice.amount_paid || 0) + paymentForThisInvoice;
                                    const newRemainingBalance = invoiceRemaining - paymentForThisInvoice;

                                    updatedInvoices.push({
                                      id: invoice.id,
                                      amount_paid: newAmountPaid,
                                      remaining_balance: newRemainingBalance,
                                      status: newRemainingBalance <= 0 ? 'paid' : 'partial'
                                    });

                                    remainingPaymentForInvoices -= paymentForThisInvoice;
                                  }

                                  // Update all invoices
                                  for (const updatedInvoice of updatedInvoices) {
                                    await fetch(
                                      `https://${projectId}.supabase.co/functions/v1/super-handler/invoices/${updatedInvoice.id}`,
                                      {
                                        method: 'PUT',
                                        headers: {
                                          'Content-Type': 'application/json',
                                          'Authorization': `Bearer ${session.access_token}`,
                                        },
                                        body: JSON.stringify({
                                          amount_paid: updatedInvoice.amount_paid,
                                          remaining_balance: updatedInvoice.remaining_balance,
                                          status: updatedInvoice.status,
                                          paid_by_checks: true,
                                          checks_count: selectedChecks.size,
                                          amount_paid_by_checks: selectedTotal
                                        }),
                                      }
                                    );
                                  }

                                  // Update all selected checks
                                  for (const checkUpdate of checkUpdates) {
                                    await fetch(
                                      `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory/${checkUpdate.id}`,
                                      {
                                        method: 'PUT',
                                        headers: {
                                          'Content-Type': 'application/json',
                                          'Authorization': `Bearer ${session.access_token}`,
                                        },
                                        body: JSON.stringify({ 
                                          status: checkUpdate.status,
                                          remaining_balance: checkUpdate.remaining_balance,
                                          usage_percentage: checkUpdate.usage_percentage
                                        }),
                                      }
                                    );
                                  }

                                  toast.success(
                                    `Paiement de ${selectedTotal.toFixed(2)} MAD enregistré pour ${selectedClient.name}`
                                  );
                                  
                                  setClientPaymentDialogOpen(false);
                                  setSelectedChecks(new Map());
                                  setSelectedClient(null);
                                  setClientSearchTerm('');
                                  
                                  await fetchCheckInventory();
                                  await fetchStoresAndSuppliers();
                                }
                              } catch (error: any) {
                                toast.error(`Erreur: ${error.message}`);
                              } finally {
                                setLoading(false);
                              }
                            }}
                          >
                            Confirmer le Paiement
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                                  </>
              )}
              <Dialog open={uploadDialogOpen} onOpenChange={(open: boolean) => {
                setUploadDialogOpen(open);
                if (open) {
                  // Set default dates when dialog opens
                  setUploadCheckDate(getTodayDate());
                  setUploadExecutionDate(getTodayDate());
                }
              }}>
                <DialogTrigger asChild>
                  <Button
                    style={{ backgroundColor: '#f59e0b' }}
                    className="text-white font-semibold hover:opacity-90"
                    disabled={!canAddCheckInventory}
                    title={!canAddCheckInventory ? "Vous n'avez pas la permission « Ajouter un Chèque »" : undefined}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Uploader Chèque
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Uploader un Chèque à l'Inventaire</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleUpload} className="space-y-4">
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
                        onChange={(e) => handleGiverNameChange(e.target.value)}
                        onFocus={() => uploadGiverName && setShowGiverSuggestions(true)}
                        placeholder="Tapez le nom d'un client..."
                      />
                      
                      {/* Suggestions Dropdown */}
                      {showGiverSuggestions && filteredSuggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                          {filteredSuggestions.map((suggestion, index) => (
                            <button
                              key={`${suggestion.type}-${suggestion.id}-${index}`}
                              type="button"
                              onClick={() => selectSuggestion(suggestion)}
                              className="w-full text-left px-4 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors"
                            >
                              <div className="font-medium text-gray-900">{suggestion.displayName}</div>
                              <div className="text-xs text-gray-500 capitalize">
                                {suggestion.type === 'client' && '👤 Client'}
                                {suggestion.type === 'store' && '🏪 Magasin'}
                                {suggestion.type === 'supplier' && '📦 Fournisseur'}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
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
                        onClick={() => setUploadDialogOpen(false)}
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
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Filters Section (collapsible) */}
            <Card className="bg-gray-50 border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Search className="w-4 h-4" />
                    Filtres Avancés
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-5">
                  {/* Name */}
                  <div className="space-y-2.5">
                    <Label htmlFor="filter-name" className="text-xs font-semibold">Nom du Bénéficiaire</Label>
                    <Input
                      id="filter-name"
                      placeholder="Filtrer par nom..."
                      value={filterName}
                      onChange={(e) => setFilterName(e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  {/* Magasin filter (creator's store) - only show to admins */}
                  {isAdmin && (
                    <div className="space-y-2.5">
                      <Label htmlFor="filter-store" className="text-xs font-semibold">Magasin</Label>
                      <select
                        id="filter-store"
                        value={filterStoreId}
                        onChange={(e) => setFilterStoreId(e.target.value)}
                        className="w-full px-3 py-2 border rounded-md bg-white text-sm"
                      >
                        <option value="all">Tous</option>
                        {stores.map((s: any) => (
                          <option key={s.id} value={s.id}>
                            {s.name || s.id}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Date From */}
                  <div className="space-y-2.5">
                    <Label htmlFor="filter-date-from" className="text-xs font-semibold">Date création (De)</Label>
                    <Input
                      id="filter-date-from"
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  {/* Date To */}
                  <div className="space-y-2.5">
                    <Label htmlFor="filter-date-to" className="text-xs font-semibold">Date création (À)</Label>
                    <Input
                      id="filter-date-to"
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  {/* Classic: Date Chèque */}
                  <div className="space-y-2.5">
                    <Label htmlFor="filter-check-date-from" className="text-xs font-semibold">Date chèque (De)</Label>
                    <Input
                      id="filter-check-date-from"
                      type="date"
                      value={filterCheckDateFrom}
                      onChange={(e) => setFilterCheckDateFrom(e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  <div className="space-y-2.5">
                    <Label htmlFor="filter-check-date-to" className="text-xs font-semibold">Date chèque (À)</Label>
                    <Input
                      id="filter-check-date-to"
                      type="date"
                      value={filterCheckDateTo}
                      onChange={(e) => setFilterCheckDateTo(e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  {/* Classic: Date Échéance */}
                  <div className="space-y-2.5">
                    <Label htmlFor="filter-due-date-from" className="text-xs font-semibold">Date échéance (De)</Label>
                    <Input
                      id="filter-due-date-from"
                      type="date"
                      value={filterDueDateFrom}
                      onChange={(e) => setFilterDueDateFrom(e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  <div className="space-y-2.5">
                    <Label htmlFor="filter-due-date-to" className="text-xs font-semibold">Date échéance (À)</Label>
                    <Input
                      id="filter-due-date-to"
                      type="date"
                      value={filterDueDateTo}
                      onChange={(e) => setFilterDueDateTo(e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  {/* Execution Date From */}
                  <div className="space-y-2.5">
                    <Label htmlFor="filter-execution-date-from" className="text-xs font-semibold">Date d'Exécution (De)</Label>
                    <Input
                      id="filter-execution-date-from"
                      type="date"
                      value={filterExecutionDateFrom}
                      onChange={(e) => setFilterExecutionDateFrom(e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  {/* Execution Date To */}
                  <div className="space-y-2.5">
                    <Label htmlFor="filter-execution-date-to" className="text-xs font-semibold">Date d'Exécution (À)</Label>
                    <Input
                      id="filter-execution-date-to"
                      type="date"
                      value={filterExecutionDateTo}
                      onChange={(e) => setFilterExecutionDateTo(e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  {/* Amount From */}
                  <div className="space-y-2.5">
                    <Label htmlFor="filter-amount-from" className="text-xs font-semibold">Original (De)</Label>
                    <Input
                      id="filter-amount-from"
                      type="number"
                      placeholder="Min..."
                      value={filterAmountFrom}
                      onChange={(e) => setFilterAmountFrom(e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  {/* Amount To */}
                  <div className="space-y-2.5">
                    <Label htmlFor="filter-amount-to" className="text-xs font-semibold">Original (À)</Label>
                    <Input
                      id="filter-amount-to"
                      type="number"
                      placeholder="Max..."
                      value={filterAmountTo}
                      onChange={(e) => setFilterAmountTo(e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  {/* Classic: Utilisé */}
                  <div className="space-y-2.5">
                    <Label htmlFor="filter-used-from" className="text-xs font-semibold">Utilisé (De)</Label>
                    <Input
                      id="filter-used-from"
                      type="number"
                      placeholder="Min..."
                      value={filterUsedFrom}
                      onChange={(e) => setFilterUsedFrom(e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  <div className="space-y-2.5">
                    <Label htmlFor="filter-used-to" className="text-xs font-semibold">Utilisé (À)</Label>
                    <Input
                      id="filter-used-to"
                      type="number"
                      placeholder="Max..."
                      value={filterUsedTo}
                      onChange={(e) => setFilterUsedTo(e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  {/* Classic: Disponible */}
                  <div className="space-y-2.5">
                    <Label htmlFor="filter-available-from" className="text-xs font-semibold">Disponible (De)</Label>
                    <Input
                      id="filter-available-from"
                      type="number"
                      placeholder="Min..."
                      value={filterAvailableFrom}
                      onChange={(e) => setFilterAvailableFrom(e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  <div className="space-y-2.5">
                    <Label htmlFor="filter-available-to" className="text-xs font-semibold">Disponible (À)</Label>
                    <Input
                      id="filter-available-to"
                      type="number"
                      placeholder="Max..."
                      value={filterAvailableTo}
                      onChange={(e) => setFilterAvailableTo(e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  {/* Status */}
                  <div className="space-y-2.5">
                    <Label htmlFor="filter-status" className="text-xs font-semibold">Statut</Label>
                    <select
                      id="filter-status"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md bg-white text-sm"
                    >
                      <option value="all">Tous les statuts</option>
                      <option value="pending">En attente</option>
                      <option value="received">Reçus</option>
                      <option value="partly_used">Partiellement utilisés</option>
                      <option value="used">Utilisés</option>
                    </select>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Button
                    onClick={() => {
                      setFilterName('');
                      setFilterDateFrom('');
                      setFilterDateTo('');
                      setFilterExecutionDateFrom('');
                      setFilterExecutionDateTo('');
                      setFilterAmountFrom('');
                      setFilterAmountTo('');

                      setFilterCheckDateFrom('');
                      setFilterCheckDateTo('');
                      setFilterDueDateFrom('');
                      setFilterDueDateTo('');
                      setFilterUsedFrom('');
                      setFilterUsedTo('');
                      setFilterAvailableFrom('');
                      setFilterAvailableTo('');

                      setStatusFilter('all');
                    }}
                    variant="outline"
                    className="text-xs"
                  >
                    Réinitialiser les filtres
                  </Button>
                </div>
              </CardContent>
              )}
            </Card>

            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Rechercher un chèque..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
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
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedChecks.size === filteredChecks.length && filteredChecks.length > 0}
                          onCheckedChange={() => {
                            const newSelected = new Map(selectedChecks);
                            if (newSelected.size === filteredChecks.length) {
                              newSelected.clear();
                            } else {
                              filteredChecks.forEach(check => {
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
                          onClick={() => toggleSort('check_id_number')}
                          className="inline-flex items-center gap-2 font-semibold hover:underline"
                          title="Trier"
                        >
                          ID Chèque <span className="text-xs opacity-70">{getSortIndicator('check_id_number')}</span>
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          onClick={() => toggleSort('magasin')}
                          className="inline-flex items-center gap-2 font-semibold hover:underline"
                          title="Trier"
                        >
                          Magasin <span className="text-xs opacity-70">{getSortIndicator('magasin')}</span>
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          onClick={() => toggleSort('check_date')}
                          className="inline-flex items-center gap-2 font-semibold hover:underline"
                          title="Trier"
                        >
                          Date Chèque <span className="text-xs opacity-70">{getSortIndicator('check_date')}</span>
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          onClick={() => toggleSort('due_date')}
                          className="inline-flex items-center gap-2 font-semibold hover:underline"
                          title="Trier"
                        >
                          Date Échéance <span className="text-xs opacity-70">{getSortIndicator('due_date')}</span>
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          onClick={() => toggleSort('amount_original')}
                          className="inline-flex items-center gap-2 font-semibold hover:underline"
                          title="Trier"
                        >
                          Original <span className="text-xs opacity-70">{getSortIndicator('amount_original')}</span>
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          onClick={() => toggleSort('amount_used')}
                          className="inline-flex items-center gap-2 font-semibold hover:underline"
                          title="Trier"
                        >
                          Utilisé <span className="text-xs opacity-70">{getSortIndicator('amount_used')}</span>
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          onClick={() => toggleSort('amount_available')}
                          className="inline-flex items-center gap-2 font-semibold hover:underline"
                          title="Trier"
                        >
                          Disponible <span className="text-xs opacity-70">{getSortIndicator('amount_available')}</span>
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          onClick={() => toggleSort('given_to')}
                          className="inline-flex items-center gap-2 font-semibold hover:underline"
                          title="Trier"
                        >
                          Donné par <span className="text-xs opacity-70">{getSortIndicator('given_to')}</span>
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          onClick={() => toggleSort('given_to_type')}
                          className="inline-flex items-center gap-2 font-semibold hover:underline"
                          title="Trier"
                        >
                          Type <span className="text-xs opacity-70">{getSortIndicator('given_to_type')}</span>
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          onClick={() => toggleSort('status')}
                          className="inline-flex items-center gap-2 font-semibold hover:underline"
                          title="Trier"
                        >
                          Statut <span className="text-xs opacity-70">{getSortIndicator('status')}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredChecks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center text-gray-500 py-8">
                          Aucun chèque trouvé
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedChecks.map((check) => {
                        const color = getCheckColor(check);
                        const rgbaColor = color.replace('rgb(', 'rgba(').replace(')', ', 0.6)');
                        const rgbaTransparent = color.replace('rgb(', 'rgba(').replace(')', ', 0.1)');
                        
                        // Use actual usage_percentage if available, otherwise calculate from remaining_balance
                        let displayUsage = 0;
                        if (check.status === 'used') {
                          displayUsage = 100;
                        } else if (check.status === 'partly_used') {
                          // Use the actual usage_percentage from the database
                          displayUsage = check.usage_percentage || 50;
                        } else {
                          displayUsage = check.usage_percentage || 0;
                        }

                        const isSelected = selectedChecks.get(check.id);

                        return (
                          <TableRow 
                            key={check.id}
                            style={{
                              backgroundImage: `linear-gradient(90deg, ${rgbaColor} 0%, ${rgbaColor} ${displayUsage}%, ${rgbaTransparent} ${displayUsage}%, ${rgbaTransparent} 100%)`,
                              backgroundSize: '100% 100%',
                              backgroundRepeat: 'no-repeat',
                              backgroundPosition: '0 0',
                            }}
                            className={isSelected ? 'ring-2 ring-green-500' : ''}
                          >
                            <TableCell>
                              <Checkbox
                                checked={isSelected || false}
                                onCheckedChange={() => {
                                  const newSelected = new Map(selectedChecks);
                                  if (newSelected.get(check.id)) {
                                    newSelected.delete(check.id);
                                  } else {
                                    newSelected.set(check.id, true);
                                  }
                                  setSelectedChecks(newSelected);
                                }}
                              />
                            </TableCell>
                            <TableCell className="font-medium text-gray-900">{check.check_id_number}</TableCell>
                            <TableCell className="text-sm text-gray-800">
                              {(() => {
                                const u: any = (check as any).created_by_user;
                                const st: any = (check as any).created_by_store;
                                if (u?.role === 'admin') {
                                  return `Admin (${u?.email || u?.full_name || 'N/A'})`;
                                }
                                return st?.name || '-';
                              })()}
                            </TableCell>
                            <TableCell className="text-sm text-gray-800">
                              {(() => {
                                const raw = (check as any).check_date || null;
                                if (!raw) return '-';
                                const d = new Date(raw);
                                if (Number.isNaN(d.getTime())) return String(raw);
                                return d.toLocaleDateString('fr-FR');
                              })()}
                            </TableCell>
                            <TableCell className="text-sm text-gray-800">
                              {(() => {
                                const raw = (check as any).due_date || (check as any).execution_date || null;
                                if (!raw) return '-';
                                const d = new Date(raw);
                                if (Number.isNaN(d.getTime())) return String(raw);
                                return d.toLocaleDateString('fr-FR');
                              })()}
                            </TableCell>
                            <TableCell className="font-semibold text-blue-600">
                              {((check.amount_value ?? 0) || 0).toFixed(2)} MAD
                            </TableCell>
                            <TableCell className="font-semibold text-red-600">
                              {(() => {
                                const original = check.amount_value ?? 0;
                                const remaining = check.remaining_balance === null ? 0 : (check.remaining_balance ?? original);
                                const used = Math.max(0, original - remaining);
                                return used.toFixed(2);
                              })()} MAD
                            </TableCell>
                            <TableCell className="font-semibold text-green-600">
                              {(() => {
                                const original = check.amount_value ?? 0;
                                const remaining = check.remaining_balance === null ? 0 : (check.remaining_balance ?? original);
                                return remaining.toFixed(2);
                              })()} MAD
                            </TableCell>
                            <TableCell className="text-gray-700">{check.given_to}</TableCell>
                            <TableCell className="text-gray-700 capitalize">{check.given_to_type}</TableCell>
                            <TableCell>
                              <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${getStatusColor(check.status)} w-fit`}>
                                {getStatusIcon(check.status)}
                                <span className="text-xs font-semibold">{getStatusLabel(check.status)}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openEditDialog(check)}
                                  disabled={!canEditCheckInventory}
                                  title={!canEditCheckInventory ? "Vous n'avez pas la permission « Modifier un Chèque »" : undefined}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                {check.image_url && (
                                  <Button
                                    size="sm"
                                    style={{ backgroundColor: '#8b5cf6' }}
                                    className="text-white hover:opacity-90"
                                    onClick={() => window.open(check.image_url, '_blank')}
                                    title="Voir l'image"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                )}
                                {check.pdf_url && (
                                  <Button
                                    size="sm"
                                    style={{ backgroundColor: '#dc2626' }}
                                    className="text-white hover:opacity-90"
                                    onClick={() => window.open(check.pdf_url, '_blank')}
                                    title="Télécharger PDF"
                                  >
                                    <Download className="w-4 h-4" />
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  style={{ backgroundColor: '#2563eb' }}
                                  className="text-white hover:opacity-90"
                                  onClick={() => {
                                    setSelectedCheck(check);
                                    setShowDetails(true);
                                  }}
                                  title="Détails"
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  style={{ backgroundColor: '#dc2626' }}
                                  className="text-white hover:opacity-90"
                                  onClick={() => handleDelete(check.id)}
                                >
                                  <Trash2 className="w-4 h-4" />
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

      {/* Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Détails du Chèque</DialogTitle>
          </DialogHeader>
          {selectedCheck && (
            <div className="space-y-6 overflow-y-auto flex-1 pr-4">
              {/* Check Image/PDF Preview */}
              {selectedCheck.image_url && (
                <div className="border rounded-lg p-4 bg-gray-50">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Image du Chèque</p>
                  <img
                    src={selectedCheck.image_url}
                    alt="Check"
                    className="max-w-full h-auto rounded-lg border"
                  />
                </div>
              )}

              {/* Check Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <p className="text-xs text-blue-600 font-semibold mb-1">ID du Chèque</p>
                  <p className="text-lg font-bold text-blue-900">{selectedCheck.check_id_number}</p>
                </div>

                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                  <p className="text-xs text-purple-600 font-semibold mb-1">Donné par</p>
                  <p className="text-lg font-bold text-purple-900">{selectedCheck.given_to}</p>
                </div>

                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                  <p className="text-xs text-indigo-600 font-semibold mb-1">Type</p>
                  <p className="text-lg font-bold text-indigo-900 capitalize">{selectedCheck.given_to_type}</p>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-600 font-semibold mb-1">Type de Fichier</p>
                  <p className="text-lg font-bold text-gray-900 capitalize">{selectedCheck.file_type}</p>
                </div>
              </div>

              {/* Check Amount Breakdown */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-gray-700">Détails du Montant</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <p className="text-xs text-blue-600 font-semibold mb-2">Original</p>
                    <p className="text-2xl font-bold text-blue-900">
                      {(selectedCheck.amount_value || 0).toFixed(2)}
                    </p>
                    <p className="text-xs text-blue-600 mt-1">MAD</p>
                  </div>

                  {selectedCheck.remaining_balance !== undefined && selectedCheck.remaining_balance !== (selectedCheck.amount_value || 0) && (
                    <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                      <p className="text-xs text-red-600 font-semibold mb-2">Utilisé</p>
                      <p className="text-2xl font-bold text-red-900">
                        {((selectedCheck.amount_value || 0) - (selectedCheck.remaining_balance || 0)).toFixed(2)}
                      </p>
                      <p className="text-xs text-red-600 mt-1">MAD</p>
                    </div>
                  )}

                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <p className="text-xs text-green-600 font-semibold mb-2">Disponible</p>
                    <p className="text-2xl font-bold text-green-900">
                      {(selectedCheck.remaining_balance || selectedCheck.amount_value || 0).toFixed(2)}
                    </p>
                    <p className="text-xs text-green-600 mt-1">MAD</p>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className={`p-4 rounded-lg border ${getStatusColor(selectedCheck.status)}`}>
                <p className="text-xs font-semibold mb-2">Statut</p>
                <div className="flex items-center gap-2">
                  {getStatusIcon(selectedCheck.status)}
                  <p className="text-lg font-bold">{getStatusLabel(selectedCheck.status)}</p>
                </div>
              </div>

              {/* Status Update Buttons */}
              <div className="flex gap-2 flex-wrap">
                {selectedCheck.status !== 'received' && (
                  <Button
                    onClick={() => handleStatusUpdate(selectedCheck.id, 'received')}
                    style={{ backgroundColor: '#3b82f6' }}
                    className="text-white hover:opacity-90"
                  >
                    Marquer comme Reçu
                  </Button>
                )}
                {selectedCheck.status !== 'used' && (
                  <Button
                    onClick={() => handleStatusUpdate(selectedCheck.id, 'used')}
                    style={{ backgroundColor: '#10b981' }}
                    className="text-white hover:opacity-90"
                  >
                    Marquer comme Utilis��
                  </Button>
                )}
                {selectedCheck.status !== 'archived' && (
                  <Button
                    onClick={() => handleStatusUpdate(selectedCheck.id, 'archived')}
                    style={{ backgroundColor: '#6b7280' }}
                    className="text-white hover:opacity-90"
                  >
                    Archiver
                  </Button>
                )}
              </div>

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

          </div>
  );
}
