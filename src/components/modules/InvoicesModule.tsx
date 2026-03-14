import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Eye, Download, Trash2, Search, FileText, Edit, CheckCircle2, Checkbox } from 'lucide-react';
import { projectId } from '../../utils/supabase/info';
import { toast } from 'sonner';
import { InvoiceDetailsPage } from '../InvoiceDetailsPage';
import { InvoiceEditPage } from '../InvoiceEditPage';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Label } from '../ui/label';

interface SavedInvoice {
  id: string;
  invoice_number: string;
  display_number?: string | null;
  client_name: string;
  client_phone?: string;
  client_address?: string;
  client_ice?: string;
  total_amount: number;
  amount_paid: number;
  remaining_balance: number;
  payment_method: 'cash' | 'check';
  status: 'pending' | 'paid' | 'partial' | 'cancelled';
  created_at: string;
  items: any[];
}

interface InvoiceStats {
  totalInvoices: number;
  totalAmount: number;
  totalPaid: number;
  pendingAmount: number;
  paidCount: number;
  partialCount: number;
  pendingCount: number;
}

export default function InvoicesModule({ session }: { session: any }) {
  // Resolve role+permissions from DB (not user_metadata)
  const [currentUserRole, setCurrentUserRole] = useState<string>('user');
  const [currentUserPermissions, setCurrentUserPermissions] = useState<string[]>([]);

  const isAdmin = currentUserRole === 'admin';
  const hasPermission = (permission: string): boolean => {
    if (isAdmin) return true;
    return currentUserPermissions.includes(permission);
  };

  // Historique des Factures permissions
  const canViewInvoicesHistory = hasPermission("Voir l'Historique des Factures");
  const canEditInvoice = hasPermission('Modifier une Facture');
  const canDeleteInvoice = hasPermission('Supprimer une Facture');

  const [invoices, setInvoices] = useState<SavedInvoice[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<InvoiceStats>({
    totalInvoices: 0,
    totalAmount: 0,
    totalPaid: 0,
    pendingAmount: 0,
    paidCount: 0,
    partialCount: 0,
    pendingCount: 0,
  });
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'partially_paid' | 'unpaid' | 'cancelled'>('all');
  const [filterMethod, setFilterMethod] = useState<'all' | 'cash' | 'check' | 'bank_transfer'>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showDetails, setShowDetails] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<SavedInvoice | null>(null);
  
  // Global payment reconciliation state
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [showBulkPaymentDialog, setShowBulkPaymentDialog] = useState(false);
  const [bulkPaymentLoading, setBulkPaymentLoading] = useState(false);
  const [bulkPaymentNotes, setBulkPaymentNotes] = useState('');

  // Fetch invoices from API
  const fetchInvoices = async () => {
    setLoading(true);
    try {
      console.log('=== FETCHING INVOICES ===');
      console.log('Project ID:', projectId);
      console.log('Access Token:', session?.access_token ? 'EXISTS' : 'MISSING');
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/invoices`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('Response Status:', response.status);
      console.log('Response OK:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error Response:', errorText);
        throw new Error(`Failed to fetch invoices: ${response.status}`);
      }

      const data = await response.json();
      console.log('Response Data:', data);
      
      const invoicesList = data.invoices || [];
      console.log('Invoices List:', invoicesList);
      console.log('Total Invoices:', invoicesList.length);
      
      setInvoices(invoicesList);

      // Calculate stats
      calculateStats(invoicesList);
      console.log('=== END FETCH ===');
    } catch (error: any) {
      console.error('Error fetching invoices:', error);
      console.log('=== END FETCH (ERROR) ===');
      toast.error('Erreur lors du chargement des factures');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (invoicesList: SavedInvoice[]) => {
    const stats: InvoiceStats = {
      totalInvoices: invoicesList.length,
      totalAmount: 0,
      totalPaid: 0,
      pendingAmount: 0,
      paidCount: 0,
      partialCount: 0,
      pendingCount: 0,
    };

    invoicesList.forEach((invoice) => {
      stats.totalAmount += invoice.total_amount;
      stats.totalPaid += invoice.amount_paid;
      stats.pendingAmount += invoice.remaining_balance;

      if (invoice.status === 'paid') stats.paidCount++;
      else if (invoice.status === 'partial') stats.partialCount++;
      else if (invoice.status === 'pending') stats.pendingCount++;
    });

    setStats(stats);
  };

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
        console.warn('[InvoicesModule] Could not resolve current user:', e);
      }
    };

    fetchMe();
  }, [session?.access_token, session?.user?.id]);

  useEffect(() => {
    if (session?.access_token && canViewInvoicesHistory) {
      fetchInvoices();
    }
  }, [session?.access_token, canViewInvoicesHistory]);

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!canDeleteInvoice) {
      toast.error("Vous n'avez pas la permission « Supprimer une Facture »");
      return;
    }
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette facture?')) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/invoices/${invoiceId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete invoice');
      }

      setInvoices(invoices.filter(inv => inv.id !== invoiceId));
      toast.success('Facture supprimée avec succès');
    } catch (error: any) {
      console.error('Error deleting invoice:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleDownloadPDF = async (invoice: SavedInvoice) => {
    try {
      // The PDF template expects invoice math split into:
      // subtotal (HT), totalRemise, subtotalAfterRemise, tva, totalWithTVA.
      // When downloading from history we only have total_amount, so we reconstruct
      // best-effort values from invoice.items.
      const safeNum = (v: any) => {
        const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
        return Number.isFinite(n) ? n : 0;
      };

      const items = Array.isArray(invoice.items) ? invoice.items : [];

      // Support multiple item shapes: {subtotal}, {total}, or compute qty*unit
      const subtotalHT = items.reduce((sum: number, it: any) => {
        const rowSubtotal =
          it?.subtotal != null ? safeNum(it.subtotal)
          : it?.total != null ? safeNum(it.total)
          : safeNum(it.quantity) * safeNum(it.unitPrice || it.unit_price || it.price);
        return sum + rowSubtotal;
      }, 0);

      // Try to read remise from invoice payload (if present) otherwise estimate it.
      const storedRemise = safeNum(
        (invoice as any)?.totalRemise ??
        (invoice as any)?.total_remise ??
        (invoice as any)?.remise_amount ??
        (invoice as any)?.discount_amount ??
        0
      );

      const storedTotal = safeNum((invoice as any)?.total_amount);

      // TVA %: prefer stored. If missing, try to infer from subtotalHT vs total_amount.
      let tvaPercentage = safeNum((invoice as any)?.tva_percentage ?? (invoice as any)?.tvaPercentage ?? 0);

      // Infer TVA% / Remise from the relationship between:
      // - subtotalHT (computed from items)
      // - storedTotal (invoice.total_amount)
      // - storedRemise (if present)
      // We assume: total_amount = (subtotalHT - remise) + tva

      // If TVA% not stored, infer TVA amount as: total - (subtotal - remise)
      // First compute a candidate subtotalAfterRemise using storedRemise only.
      const subtotalAfterRemiseCandidate = Math.max(0, subtotalHT - storedRemise);

      // Infer TVA amount if total is present
      const inferredTvaAmount = storedTotal > 0
        ? Math.max(0, storedTotal - subtotalAfterRemiseCandidate)
        : 0;

      // If TVA% is missing and subtotalHT exists, infer percentage from inferred TVA amount
      if (tvaPercentage <= 0 && subtotalAfterRemiseCandidate > 0 && inferredTvaAmount > 0) {
        tvaPercentage = Math.round(((inferredTvaAmount / subtotalAfterRemiseCandidate) * 100) * 100) / 100;
      }

      // If remise is missing, infer it when total is less than subtotal and TVA is 0 (or cannot be inferred)
      const inferredRemiseAmount = (storedRemise > 0)
        ? storedRemise
        : (storedTotal > 0 && subtotalHT > 0 && storedTotal <= subtotalHT)
          ? Math.round((subtotalHT - storedTotal) * 100) / 100
          : 0;

      const totalRemise = Math.max(0, inferredRemiseAmount);
      const subtotalAfterRemise = Math.max(0, subtotalHT - totalRemise);

      // TVA amount: prefer inferred amount from storedTotal; else compute from %
      const tva = storedTotal > 0
        ? Math.max(0, storedTotal - subtotalAfterRemise)
        : Math.max(0, subtotalAfterRemise * (tvaPercentage / 100));

      // Final total
      const totalWithTVA = storedTotal > 0 ? storedTotal : (subtotalAfterRemise + tva);

      // Build query parameters for PDF generation
      const queryParams = new URLSearchParams();
      queryParams.append('type', 'Facture');
      queryParams.append('clientName', invoice.client_name);
      queryParams.append('clientPhone', invoice.client_phone || '');
      queryParams.append('clientAddress', invoice.client_address || '');
      queryParams.append('clientICE', invoice.client_ice || '');
      queryParams.append('date', new Date(invoice.created_at).toISOString().split('T')[0]);
      // Normalize items so the PDF template always gets a usable row total.
      const pdfItems = items.map((it: any) => {
        const unitPrice = it?.unitPrice ?? it?.unit_price ?? it?.price ?? 0;
        const quantity = it?.quantity ?? 0;
        const total = it?.total != null ? safeNum(it.total) : (it?.subtotal != null ? safeNum(it.subtotal) : safeNum(quantity) * safeNum(unitPrice));
        return {
          ...it,
          unitPrice,
          quantity,
          total,
        };
      });

      queryParams.append('items', JSON.stringify(pdfItems));

      queryParams.append('subtotal', String(subtotalHT));
      queryParams.append('remise', '0');
      queryParams.append('remisePercentage', '0');
      queryParams.append('totalRemise', String(totalRemise));
      queryParams.append('subtotalAfterRemise', String(subtotalAfterRemise));
      queryParams.append('tva', String(tva));
      queryParams.append('tvaPercentage', String(tvaPercentage));
      queryParams.append('totalWithTVA', String(totalWithTVA));

      // Some templates read these legacy names
      queryParams.append('total_remise', String(totalRemise));
      queryParams.append('subtotal_after_remise', String(subtotalAfterRemise));
      queryParams.append('tva_amount', String(tva));
      queryParams.append('tva_percent', String(tvaPercentage));

      queryParams.append('paymentHeaderNote', `Statut: ${invoice.status}`);

      // Use display_number if present so PDF header matches UI
      queryParams.append('invoiceNumber', String(invoice.display_number || invoice.invoice_number));

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/documents/${invoice.invoice_number}/pdf?${queryParams.toString()}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to download PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(invoice.display_number || invoice.invoice_number)}.pdf`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);

      toast.success('PDF téléchargé avec succès');
    } catch (error: any) {
      console.error('Error downloading PDF:', error);
      toast.error('Erreur lors du téléchargement du PDF');
    }
  };

  // Filter invoices
  const filteredInvoices = invoices.filter((invoice) => {
    const matchesSearch =
      invoice.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (invoice.display_number || invoice.invoice_number).toLowerCase().includes(searchTerm.toLowerCase());

    // Status filter - handle case-insensitive matching
    let matchesStatus = true;
    if (filterStatus !== 'all') {
      const invoiceStatus = (invoice.status || '').toLowerCase().trim();
      const filterStatusLower = filterStatus.toLowerCase().trim();
      matchesStatus = invoiceStatus === filterStatusLower;
    }

    // Method filter - handle case-insensitive matching
    let matchesMethod = true;
    if (filterMethod !== 'all') {
      const invoiceMethod = (invoice.payment_method || '').toLowerCase().trim();
      const filterMethodLower = filterMethod.toLowerCase().trim();
      matchesMethod = invoiceMethod === filterMethodLower;
    }

    const invDate = new Date(invoice.created_at);
    const afterStart = !startDate || invDate >= new Date(startDate + 'T00:00:00');
    const beforeEnd = !endDate || invDate <= new Date(endDate + 'T23:59:59.999');
    const matchesDate = afterStart && beforeEnd;

    return matchesSearch && matchesStatus && matchesMethod && matchesDate;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800';
      case 'pending':
        return 'bg-gray-100 text-gray-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'paid':
        return 'Payée';
      case 'partial':
        return 'Partielle';
      case 'pending':
        return 'En attente';
      case 'cancelled':
        return 'Annulée';
      default:
        return status;
    }
  };

  const getMethodColor = (method: string) => {
    if (method === 'cash') return 'bg-green-100 text-green-800';
    if (method === 'check') return 'bg-blue-100 text-blue-800';
    if (method === 'bank_transfer') return 'bg-indigo-100 text-indigo-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getMethodLabel = (method: string) => {
    if (method === 'cash') return 'Espèces';
    if (method === 'check') return 'Chèque';
    if (method === 'bank_transfer') return 'Virement';
    return method;
  };

  // Handle bulk payment for multiple invoices
  const handleBulkPayment = async () => {
    if (!canEditInvoice) {
      toast.error("Vous n'avez pas la permission « Modifier une Facture »");
      return;
    }
    if (selectedInvoiceIds.size === 0) {
      toast.error('Veuillez sélectionner au moins une facture');
      return;
    }

    setBulkPaymentLoading(true);
    try {
      const selectedInvoices = Array.from(selectedInvoiceIds)
        .map(id => invoices.find(inv => inv.id === id))
        .filter(Boolean) as SavedInvoice[];

      // Update each invoice to mark as paid using its own payment method
      for (const invoice of selectedInvoices) {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/invoices/${invoice.id}`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${session?.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              amount_paid: invoice.total_amount,
              remaining_balance: 0,
              status: 'paid',
              payment_method: invoice.payment_method,
              notes: bulkPaymentNotes || `Paiement global - ${new Date().toLocaleDateString('fr-FR')}`,
            }),
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Erreur pour facture ${invoice.invoice_number}: ${error.error || 'Erreur inconnue'}`);
        }
      }

      // Success
      toast.success(`${selectedInvoices.length} facture(s) marquée(s) comme payée(s)`);
      
      // Reset state
      setSelectedInvoiceIds(new Set());
      setShowBulkPaymentDialog(false);
      setBulkPaymentNotes('');
      
      // Refresh invoices
      await fetchInvoices();
    } catch (error: any) {
      console.error('Error in bulk payment:', error);
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setBulkPaymentLoading(false);
    }
  };

  // Show edit page if selected
  if (showEdit && selectedInvoice) {
    return (
      <InvoiceEditPage
        invoice={selectedInvoice}
        onBack={() => {
          setShowEdit(false);
          setSelectedInvoice(null);
          fetchInvoices();
        }}
        session={session}
        onStatusUpdate={fetchInvoices}
      />
    );
  }

  // Show full-page details view if selected
  if (showDetails && selectedInvoice) {
    return (
      <InvoiceDetailsPage
        invoice={selectedInvoice}
        onBack={() => {
          setShowDetails(false);
          setSelectedInvoice(null);
        }}
        onDownloadPDF={handleDownloadPDF}
        onDelete={handleDeleteInvoice}
        session={session}
        onStatusUpdate={fetchInvoices}
      />
    );
  }

  if (!canViewInvoicesHistory) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Accès refusé</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">Vous n'avez pas la permission « Voir l'Historique des Factures ».</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Historique des Factures</h1>
          <p className="text-gray-600 mt-1">Gérez et consultez toutes vos factures</p>
        </div>
        <Button
          onClick={() => {
            if (!canViewInvoicesHistory) {
              toast.error("Vous n'avez pas la permission « Voir l'Historique des Factures »");
              return;
            }
            fetchInvoices();
          }}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {loading ? 'Chargement...' : 'Actualiser'}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-gray-600 text-sm">Total Factures</p>
              <p className="text-3xl font-bold text-gray-900">{stats.totalInvoices}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-gray-600 text-sm">Montant Total</p>
              <p className="text-3xl font-bold text-blue-600">{stats.totalAmount.toFixed(2)} MAD</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-gray-600 text-sm">Montant Payé</p>
              <p className="text-3xl font-bold text-green-600">{stats.totalPaid.toFixed(2)} MAD</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-gray-600 text-sm">Montant En Attente</p>
              <p className="text-3xl font-bold text-orange-600">{stats.pendingAmount.toFixed(2)} MAD</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search (collapsible) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Filtres et Recherche
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
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Rechercher par client ou numéro..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="px-3 py-2 border rounded-md"
              >
                <option value="all">Tous les statuts</option>
                <option value="paid">Payée</option>
                <option value="partially_paid">Partielle</option>
                <option value="unpaid">En attente</option>
                <option value="cancelled">Annulée</option>
              </select>

              <select
                value={filterMethod}
                onChange={(e) => setFilterMethod(e.target.value as any)}
                className="px-3 py-2 border rounded-md"
              >
                <option value="all">Toutes les méthodes</option>
                <option value="cash">Espèces</option>
                <option value="check">Chèque</option>
                <option value="bank_transfer">Virement</option>
              </select>

              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 border rounded-md"
              />

              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 border rounded-md"
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Factures ({filteredInvoices.length})</CardTitle>
            {selectedInvoiceIds.size > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-foreground">
                  {selectedInvoiceIds.size} facture(s) sélectionnée(s)
                </span>
                <Dialog
                    open={showBulkPaymentDialog}
                    onOpenChange={(open) => {
                      if (open && !canEditInvoice) {
                        toast.error("Vous n'avez pas la permission « Modifier une Facture »");
                        return;
                      }
                      setShowBulkPaymentDialog(open);
                    }}
                  >
                  <DialogTrigger asChild>
                    <Button variant="default" size="default" disabled={!canEditInvoice}>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Marquer comme Payée
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Réconciliation Globale des Paiements</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-2">
                          Factures à marquer comme payées:
                        </p>
                        <div className="bg-gray-50 p-3 rounded-md max-h-40 overflow-y-auto">
                          {Array.from(selectedInvoiceIds).map((id) => {
                            const inv = invoices.find(i => i.id === id);
                            return inv ? (
                              <div key={id} className="text-sm text-gray-600 py-1">
                                {(inv.display_number || inv.invoice_number)} - {inv.client_name} ({inv.remaining_balance.toFixed(2)} MAD)
                              </div>
                            ) : null;
                          })}
                        </div>
                      </div>

                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-2">
                          Montant Total à Payer: <span className="text-green-600 font-bold">
                            {Array.from(selectedInvoiceIds)
                              .reduce((sum, id) => {
                                const inv = invoices.find(i => i.id === id);
                                return sum + (inv?.remaining_balance || 0);
                              }, 0)
                              .toFixed(2)} MAD
                          </span>
                        </p>
                      </div>

                      <div>
                        <Label className="text-sm font-semibold">Notes (optionnel)</Label>
                        <Input
                          placeholder="Ajouter des notes sur ce paiement..."
                          value={bulkPaymentNotes}
                          onChange={(e) => setBulkPaymentNotes(e.target.value)}
                          className="mt-1"
                        />
                      </div>

                      <div className="flex gap-2 pt-4">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setShowBulkPaymentDialog(false);
                            setBulkPaymentNotes('');
                          }}
                          className="flex-1"
                        >
                          Annuler
                        </Button>
                        <Button
                          variant="default"
                          onClick={() => handleBulkPayment()}
                          disabled={bulkPaymentLoading || !canEditInvoice}
                          className="flex-1"
                        >
                          {bulkPaymentLoading ? 'Traitement...' : 'Confirmer le Paiement'}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {filteredInvoices.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">Aucune facture trouvée</p>
              <p className="text-sm text-gray-500 mt-1">Créez votre première facture pour commencer</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 w-10">
                      <input
                        type="checkbox"
                        checked={selectedInvoiceIds.size === filteredInvoices.length && filteredInvoices.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedInvoiceIds(new Set(filteredInvoices.map(inv => inv.id)));
                          } else {
                            setSelectedInvoiceIds(new Set());
                          }
                        }}
                        className="w-4 h-4 cursor-pointer"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Numéro</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Client</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Méthode</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Montant Total</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Montant Payé</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Solde</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Statut</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Date</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredInvoices.map((invoice) => (
                    <tr key={invoice.id} className={`hover:bg-gray-50 ${selectedInvoiceIds.has(invoice.id) ? 'bg-blue-50' : ''}`}>
                      <td className="px-4 py-4 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedInvoiceIds.has(invoice.id)}
                          onChange={(e) => {
                            const newSelected = new Set(selectedInvoiceIds);
                            if (e.target.checked) {
                              newSelected.add(invoice.id);
                            } else {
                              newSelected.delete(invoice.id);
                            }
                            setSelectedInvoiceIds(newSelected);
                          }}
                          className="w-4 h-4 cursor-pointer"
                        />
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{invoice.display_number || invoice.invoice_number}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{invoice.client_name}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getMethodColor(invoice.payment_method)}`}>
                          {getMethodLabel(invoice.payment_method)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">
                        {invoice.total_amount.toFixed(2)} MAD
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 text-right">
                        {invoice.amount_paid.toFixed(2)} MAD
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-right">
                        <span className={invoice.remaining_balance > 0 ? 'text-orange-600' : 'text-green-600'}>
                          {invoice.remaining_balance.toFixed(2)} MAD
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}>
                          {getStatusLabel(invoice.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(invoice.created_at).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-6 py-4 text-sm text-right space-x-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-blue-600 hover:text-blue-700"
                          title={!canEditInvoice ? "Vous n'avez pas la permission « Modifier une Facture »" : 'Éditer'}
                          disabled={!canEditInvoice}
                          onClick={() => {
                            if (!canEditInvoice) {
                              toast.error("Vous n'avez pas la permission « Modifier une Facture »");
                              return;
                            }
                            setSelectedInvoice(invoice);
                            setShowEdit(true);
                          }}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-blue-600 hover:text-blue-700"
                          title="Voir les détails"
                          onClick={() => {
                            setSelectedInvoice(invoice);
                            setShowDetails(true);
                          }}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDownloadPDF(invoice)}
                          className="text-green-600 hover:text-green-700"
                          title="Télécharger PDF"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteInvoice(invoice.id)}
                          className="text-red-600 hover:text-red-700"
                          title={!canDeleteInvoice ? "Vous n'avez pas la permission « Supprimer une Facture »" : 'Supprimer'}
                          disabled={!canDeleteInvoice}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      </div>
  );
}
