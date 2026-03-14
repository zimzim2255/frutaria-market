import React, { useState, useEffect } from 'react';
import { ArrowLeft, FileText, Calendar, User, DollarSign, Image, RotateCcw, Mail, Briefcase, FileCheck } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { toast } from 'sonner@2.0.3';
import { projectId } from '../utils/supabase/info';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

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
  giver_id?: string;
  receiver_id?: string;
  usage_percentage?: number;
  remaining_balance?: number;
  created_by?: string;
  created_by_user?: {
    id: string;
    email: string;
    full_name?: string;
    role?: string;
  };
  created_by_store?: {
    id: string;
    name: string;
  };
}

interface CheckInventoryDetailsPageProps {
  inventory: CheckInventoryItem;
  onBack: () => void;
  session?: any;
  onStatusUpdate?: () => void;
}

export function CheckInventoryDetailsPage({ inventory, onBack, session, onStatusUpdate }: CheckInventoryDetailsPageProps) {
  const [loading, setLoading] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnAmount, setReturnAmount] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [executionData, setExecutionData] = useState<any>(null);
  const [invoicesPaid, setInvoicesPaid] = useState<any[]>([]);
  const [checkUsageOperations, setCheckUsageOperations] = useState<any[]>([]);
  const [loadingExecution, setLoadingExecution] = useState(false);

  const normalizeForMatch = (v: any): string =>
    String(v || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[_]/g, '-')
      .trim();

  const normalizeCheckTokens = (raw: any): string[] => {
    const s = String(raw || '').trim();
    if (!s) return [];

    // Normalize: remove spaces and common separators so matching is tolerant.
    const compact = s.replace(/\s+/g, '').replace(/[_]/g, '-');

    // Common variants in the app:
    // - CHK-123
    // - CHK123
    // - 123
    // - check_id_number can already include CHK-
    const tokens = new Set<string>();

    const base = compact;
    tokens.add(base);

    const digitsOnly = base.replace(/[^0-9]/g, '');
    if (digitsOnly) tokens.add(digitsOnly);

    // Add CHK- variants
    if (!base.toUpperCase().startsWith('CHK')) {
      tokens.add(`CHK-${base}`);
      tokens.add(`CHK${base}`);
      if (digitsOnly) {
        tokens.add(`CHK-${digitsOnly}`);
        tokens.add(`CHK${digitsOnly}`);
      }
    } else {
      // If already has CHK prefix, also add without it
      const withoutPrefix = base.replace(/^CHK-?/i, '');
      if (withoutPrefix) {
        tokens.add(withoutPrefix);
        const withoutDigits = withoutPrefix.replace(/[^0-9]/g, '');
        if (withoutDigits) tokens.add(withoutDigits);
      }
      // Ensure CHK-123 and CHK123 both exist
      const normalizedChk = base.replace(/^CHK/i, 'CHK');
      tokens.add(normalizedChk.replace(/^CHK-?/i, 'CHK-'));
      tokens.add(normalizedChk.replace(/^CHK-?/i, 'CHK'));
    }

    return Array.from(tokens).filter(Boolean);
  };

  useEffect(() => {
    // Fetch execution tracking data for this check
    const fetchExecutionData = async () => {
      if (!inventory.id || !session?.access_token) return;
      
      setLoadingExecution(true);
      try {
        console.log('Fetching execution data for check:', inventory.id);
        console.log('Check details:', {
          id: inventory.id,
          check_id_number: inventory.check_id_number,
          status: inventory.status,
          created_by_user: inventory.created_by_user,
          amount_value: inventory.amount_value,
          remaining_balance: inventory.remaining_balance
        });

        const operations: any[] = [];

        // 1) Pull check_safe row(s) for this inventory check (transfer to coffre)
        // This is the reliable source for "transferred to safe" events.
        try {
          const safeRes = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/check-safe`,
            {
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
              },
            }
          );

          if (safeRes.ok) {
            const safeJson = await safeRes.json().catch(() => ({}));
            const safeRows = safeJson.check_safe || [];

            const invId = String(inventory.id || '').trim();
            const chkNumNorm = normalizeForMatch(inventory.check_id_number);

            const safeMatches = (safeRows || []).filter((cs: any) => {
              const invMatch = invId && String(cs.check_inventory_id || '').trim() === invId;
              const numMatch = chkNumNorm && normalizeForMatch(cs.check_number) === chkNumNorm;
              return invMatch || numMatch;
            });

            safeMatches.forEach((cs: any) => {
              const amt = Number(cs.amount || 0) || 0;
              operations.push({
                type: 'coffer_transfer',
                operation: 'Transfert Coffre',
                description: `Transféré au coffre (${String(cs.coffer_id || 'main')})`,
                amount: amt,
                date: cs.created_at || cs.placed_in_safe_at || cs.updated_at,
                status: String(cs.status || 'confirmed').toLowerCase(),
                details: `Coffre: ${String(cs.coffer_id || 'main')}`,
              });
            });

            // 2) Pull usages (partial consumption) from check_safe_usages
            // to show where the cheque was consumed.
            const safeIds = safeMatches.map((r: any) => String(r.id)).filter(Boolean);
            if (safeIds.length > 0) {
              const usagesRes = await fetch(
                `https://${projectId}.supabase.co/functions/v1/super-handler/check-safe-usages?coffer_id=${encodeURIComponent(String(safeMatches?.[0]?.coffer_id || 'main'))}`,
                {
                  headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                  },
                }
              );

              if (usagesRes.ok) {
                const usagesJson = await usagesRes.json().catch(() => ({}));
                const rows = usagesJson.check_safe_usages || [];

                // The endpoint returns aggregated totals per check_safe_id.
                rows
                  .filter((u: any) => safeIds.includes(String(u.check_safe_id)))
                  .forEach((u: any) => {
                    const used = Number(u.total_used ?? 0) || 0;
                    if (used <= 0) return;
                    operations.push({
                      type: 'coffer_usage',
                      operation: 'Utilisation Coffre',
                      description: `Utilisé depuis le coffre (${String((safeMatches?.[0]?.coffer_id || 'main'))})`,
                      amount: used,
                      date: inventory.updated_at || inventory.created_at,
                      status: 'used',
                      details: 'Consommation enregistrée via check_safe_usages',
                    });
                  });
              }
            }
          }
        } catch (e) {
          console.warn('Could not fetch check_safe/check_safe_usages:', e);
        }

        const checkTokens = normalizeCheckTokens(inventory.check_id_number);
        const checkIdToken = String(inventory.id || '').trim();

        const matchesCheckReference = (row: any): boolean => {
          const hay = `${row?.reference_number || ''} ${row?.reference || ''} ${row?.check_reference || ''} ${row?.check_number || ''} ${row?.notes || ''} ${row?.payment_notes || ''} ${row?.payment_notes_admin || ''}`
            .toLowerCase();
          const tokenMatch = checkTokens.some((t) => t && hay.includes(String(t).toLowerCase()));
          const idMatch = checkIdToken ? hay.includes(checkIdToken.toLowerCase()) : false;
          return tokenMatch || idMatch;
        };

        // 3) Client global payments (Paiement Global Client)
        try {
          const cgpRes = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/client-global-payments`,
            {
              headers: { 'Authorization': `Bearer ${session.access_token}` },
            }
          );
          if (cgpRes.ok) {
            const cgpJson = await cgpRes.json().catch(() => ({}));
            const rows = cgpJson.client_global_payments || [];
            rows
              .filter((r: any) => String(r.payment_method || '').toLowerCase() === 'check')
              .filter((r: any) => matchesCheckReference(r))
              .forEach((r: any) => {
                const amt = Number(r.amount || 0) || 0;
                if (amt <= 0) return;
                operations.push({
                  type: 'client_global_payment',
                  operation: 'Paiement Global Client',
                  description: `Paiement global client ${r.client_name || r.client || r.client_id || ''}`.trim(),
                  client_name: r.client_name || r.client || null,
                  amount: amt,
                  date: r.payment_date || r.created_at,
                  status: 'paid',
                  details: r.notes || r.reference_number || 'Paiement global (chèque)',
                });
              });
          }
        } catch (e) {
          console.warn('Could not fetch client-global-payments:', e);
        }

        // 4) Store global payments (Paiement Global Magasin)
        try {
          const sgpRes = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/store-global-payments`,
            {
              headers: { 'Authorization': `Bearer ${session.access_token}` },
            }
          );
          if (sgpRes.ok) {
            const sgpJson = await sgpRes.json().catch(() => ({}));
            const rows = sgpJson.store_global_payments || [];
            rows
              .filter((r: any) => String(r.payment_method || '').toLowerCase() === 'check')
              .filter((r: any) => matchesCheckReference(r))
              .forEach((r: any) => {
                const amt = Number(r.amount || 0) || 0;
                if (amt <= 0) return;
                operations.push({
                  type: 'store_global_payment',
                  operation: 'Paiement Global Magasin',
                  description: `Paiement global magasin ${r.store_name || r.paid_by_store_name || r.paid_by_store_id || ''}`.trim(),
                  amount: amt,
                  date: r.payment_date || r.created_at,
                  status: 'paid',
                  details: r.notes || r.reference_number || 'Paiement global (chèque)',
                });
              });
          }
        } catch (e) {
          console.warn('Could not fetch store-global-payments:', e);
        }

        // 5) Invoices (best-effort linkage)
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

          const relatedInvoices = invoices.filter((inv: any) => matchesCheckReference(inv));

          setInvoicesPaid(relatedInvoices);

          relatedInvoices.forEach((inv: any) => {
            const amountUsed = Number(inv.amount_paid_by_checks ?? inv.amount_paid ?? 0) || 0;
            if (amountUsed > 0) {
              operations.push({
                type: 'client_payment',
                operation: 'Paiement Client',
                description: `Paiement de facture ${inv.invoice_number}`,
                client_name: inv.client_name,
                amount: amountUsed,
                date: inv.updated_at || inv.created_at,
                status: inv.status,
                details: inv.payment_notes_admin || inv.payment_notes || 'Paiement par chèque',
              });
            }
          });
        }

        // Finalize
        setCheckUsageOperations(operations);
      } catch (error) {
        console.error('Error fetching execution data:', error);
      } finally {
        setLoadingExecution(false);
      }
    };

    fetchExecutionData();
  }, [inventory.id, inventory.check_id_number, session?.access_token]);
  
  if (!inventory) return null;

  const handleStatusUpdate = async (newStatus: string) => {
    try {
      setLoading(true);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory/${inventory.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (response.ok) {
        toast.success('Statut mis à jour avec succès');
        if (onStatusUpdate) {
          onStatusUpdate();
        }
      } else {
        toast.error('Erreur lors de la mise à jour du statut');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string | undefined): string => {
    switch (status?.toLowerCase()) {
      case 'active':
      case 'available':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'used':
      case 'inactive':
        return 'bg-slate-50 text-slate-700 border-slate-200';
      case 'damaged':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'pending':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'received':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'partly_used':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'archived':
        return 'bg-slate-50 text-slate-700 border-slate-200';
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  const getStatusLabel = (status: string | undefined): string => {
    switch (status?.toLowerCase()) {
      case 'pending':
        return 'En Attente';
      case 'received':
        return 'Reçu';
      case 'used':
        return 'Utilisé';
      case 'partly_used':
        return 'Partiellement Utilisé';
      case 'archived':
        return 'Archivé';
      case 'active':
      case 'available':
        return 'Actif';
      case 'inactive':
        return 'Inactif';
      case 'damaged':
        return 'Endommagé';
      default:
        return status || 'N/A';
    }
  };

  const handleReturnToInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!returnAmount || parseFloat(returnAmount) <= 0) {
      toast.error('Veuillez entrer un montant valide');
      return;
    }

    const returnAmountNum = parseFloat(returnAmount);
    const maxReturnAmount = (inventory.amount_value || 0) - (inventory.remaining_balance || 0);

    if (returnAmountNum > maxReturnAmount) {
      toast.error(`Le montant à retourner ne peut pas dépasser ${maxReturnAmount.toFixed(2)} MAD (montant utilisé)`);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory/${inventory.id}/return`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            return_amount: returnAmountNum,
            reason: returnReason || 'Retour à l\'inventaire',
          }),
        }
      );

      if (response.ok) {
        toast.success(`${returnAmountNum.toFixed(2)} MAD retourné à l'inventaire avec succès`);
        setReturnDialogOpen(false);
        setReturnAmount('');
        setReturnReason('');
        if (onStatusUpdate) {
          onStatusUpdate();
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur lors du retour du chèque');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="hover:bg-slate-200"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Détails du Chèque</h1>
              <p className="text-sm text-slate-500 mt-1">ID: {inventory.id}</p>
            </div>
          </div>
          <Badge className={`border ${getStatusColor(inventory.status)} text-sm px-3 py-1`}>
            {getStatusLabel(inventory.status)}
          </Badge>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Left Column - Key Information */}
          <div className="lg:col-span-2 space-y-6">
            {/* Check Information Card */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-6">Informations du Chèque</h2>
              
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Numéro du Chèque</p>
                  <p className="text-xl font-semibold text-slate-900">{inventory.check_id_number || 'N/A'}</p>
                </div>
                
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Montant</p>
                  <p className="text-xl font-semibold text-slate-900">{(inventory.amount_value || 0).toFixed(2)} MAD</p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Donné à</p>
                  <p className="text-base text-slate-700">{inventory.given_to || 'N/A'}</p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Type</p>
                  <Badge variant="outline" className="capitalize text-slate-700">
                    {inventory.given_to_type || 'N/A'}
                  </Badge>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Date de Création</p>
                  <p className="text-base text-slate-700">
                    {inventory.created_at ? new Date(inventory.created_at).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Mise à Jour</p>
                  <p className="text-base text-slate-700">
                    {inventory.updated_at ? new Date(inventory.updated_at).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Créé par</p>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-500" />
                    <p className="text-base text-slate-700">
                      {inventory.created_by_user?.full_name || inventory.created_by_user?.email || 'N/A'}
                    </p>
                  </div>
                </div>

                {inventory.created_by_store && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Magasin</p>
                    <Badge variant="outline" className="text-slate-700">
                      {inventory.created_by_store.name}
                    </Badge>
                  </div>
                )}
              </div>

              {inventory.notes && (
                <div className="mt-6 pt-6 border-t border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Notes</p>
                  <p className="text-slate-700">{inventory.notes}</p>
                </div>
              )}
            </div>

            {/* Amount Breakdown Card */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-6">Détail du Montant</h2>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-sm font-medium text-slate-600">Montant Original</span>
                  <span className="text-lg font-semibold text-slate-900">{(inventory.amount_value || 0).toFixed(2)} MAD</span>
                </div>

                <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-200">
                  <span className="text-sm font-medium text-red-700">Montant Utilisé</span>
                  <span className="text-lg font-semibold text-red-900">
                    {((inventory.amount_value || 0) - (inventory.remaining_balance || 0)).toFixed(2)} MAD
                  </span>
                </div>

                <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                  <span className="text-sm font-medium text-emerald-700">Solde Restant</span>
                  <span className="text-lg font-semibold text-emerald-900">{(inventory.remaining_balance || 0).toFixed(2)} MAD</span>
                </div>
              </div>
            </div>

            {/* Execution Tracking Card */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-6">
                <Briefcase className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-slate-900">Suivi d'Exécution</h2>
              </div>
              
              <div className="space-y-4">
                {/* Executor Information */}
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <div className="flex items-start gap-3">
                    <Mail className="w-5 h-5 text-blue-600 mt-1 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Email de l'Exécuteur</p>
                      <p className="text-sm font-medium text-slate-900">
                        {inventory.created_by_user?.email || 'Non disponible'}
                      </p>
                      {inventory.created_by_user?.full_name && (
                        <p className="text-xs text-slate-600 mt-1">
                          Nom: {inventory.created_by_user.full_name}
                        </p>
                      )}
                      {inventory.created_by_user?.role && (
                        <p className="text-xs text-slate-600">
                          Rôle: {inventory.created_by_user.role}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                              </div>
            </div>

            {/* Check Usage Operations Tracking */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-6">
                <Briefcase className="w-5 h-5 text-purple-600" />
                <h2 className="text-lg font-semibold text-slate-900">Où le Chèque a été Utilisé ({checkUsageOperations.length})</h2>
              </div>
              
              {checkUsageOperations.length > 0 ? (
                <>
                  <div className="space-y-3">
                    {checkUsageOperations.map((operation: any, index: number) => (
                      <div key={index} className="bg-gradient-to-r from-purple-50 to-blue-50 p-4 rounded-lg border border-purple-200">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className="bg-purple-600 text-white">
                                {operation.type === 'client_payment' ? '👤 Paiement Client' :
                                 operation.type === 'supplier_payment' ? '📦 Paiement Fournisseur' :
                                 operation.type === 'coffer_transfer' ? '🔒 Transfert Coffre' :
                                 operation.type === 'coffer_usage' ? '🧾 Utilisation Coffre' :
                                 operation.type === 'client_global_payment' ? '🌍 Paiement Global Client' :
                                 operation.type === 'store_global_payment' ? '🌍 Paiement Global Magasin' :
                                 operation.type === 'store_payment' ? '🏪 Paiement Magasin' :
                                 'Autre Opération'}
                              </Badge>
                            </div>
                            
                            <p className="text-sm font-semibold text-slate-900 mb-1">
                              {operation.description}
                            </p>
                            
                            {operation.client_name && (
                              <p className="text-xs text-slate-600 mb-1">
                                <span className="font-medium">Client:</span> {operation.client_name}
                              </p>
                            )}
                            
                            <p className="text-xs text-slate-600 mb-2">
                              <span className="font-medium">Détails:</span> {operation.details}
                            </p>
                            
                            <p className="text-xs text-slate-500">
                              <span className="font-medium">Date:</span> {new Date(operation.date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          
                          <div className="text-right flex-shrink-0">
                            <p className="text-lg font-bold text-purple-600 mb-1">
                              {operation.amount.toFixed(2)} MAD
                            </p>
                            <Badge variant={
                              operation.status === 'paid' ? 'default' :
                              operation.status === 'partial' ? 'secondary' :
                              'outline'
                            }>
                              {operation.status === 'paid' ? 'Payée' :
                               operation.status === 'partial' ? 'Partielle' :
                               'En attente'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Summary of Usage */}
                  <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">Résumé d'Utilisation</p>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-700">Nombre d'opérations:</span>
                        <span className="font-bold text-slate-900">{checkUsageOperations.length}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-700">Montant total utilisé:</span>
                        <span className="font-bold text-purple-600">
                          {checkUsageOperations.reduce((sum: number, op: any) => sum + op.amount, 0).toFixed(2)} MAD
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-6 rounded-lg border border-purple-200 text-center">
                  <Briefcase className="w-12 h-12 text-purple-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-600 mb-2">
                    Aucune opération enregistrée pour ce chèque
                  </p>
                  <p className="text-xs text-slate-500">
                    Les opérations apparaîtront ici une fois que le chèque sera utilisé pour payer des clients, fournisseurs ou transféré au coffre.
                  </p>
                </div>
              )}
            </div>

            {/* Invoices Paid with This Check */}
            {invoicesPaid.length > 0 && (
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <div className="flex items-center gap-2 mb-6">
                  <FileCheck className="w-5 h-5 text-green-600" />
                  <h2 className="text-lg font-semibold text-slate-900">Factures Payées ({invoicesPaid.length})</h2>
                </div>
                
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="text-xs font-semibold">N° Facture</TableHead>
                        <TableHead className="text-xs font-semibold">Client</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Montant Payé</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Solde Restant</TableHead>
                        <TableHead className="text-xs font-semibold">Statut</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoicesPaid.map((invoice: any) => (
                        <TableRow key={invoice.id} className="hover:bg-slate-50">
                          <TableCell className="text-sm font-mono">{invoice.invoice_number}</TableCell>
                          <TableCell className="text-sm">{invoice.client_name}</TableCell>
                          <TableCell className="text-sm text-right font-semibold text-green-600">
                            {(invoice.amount_paid || 0).toFixed(2)} MAD
                          </TableCell>
                          <TableCell className="text-sm text-right font-semibold text-orange-600">
                            {(invoice.remaining_balance || 0).toFixed(2)} MAD
                          </TableCell>
                          <TableCell className="text-sm">
                            <Badge variant={
                              invoice.status === 'paid' ? 'default' :
                              invoice.status === 'partial' ? 'secondary' :
                              'outline'
                            }>
                              {invoice.status === 'paid' ? 'Payée' :
                               invoice.status === 'partial' ? 'Partielle' :
                               'En attente'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Payment Notes */}
                {invoicesPaid.some((inv: any) => inv.payment_notes_admin) && (
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Notes de Paiement</p>
                    <div className="space-y-2">
                      {invoicesPaid.filter((inv: any) => inv.payment_notes_admin).map((invoice: any) => (
                        <div key={invoice.id} className="text-sm text-slate-700">
                          <span className="font-semibold">{invoice.invoice_number}:</span> {invoice.payment_notes_admin}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Check Image Section */}
            {inventory.image_url && (
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Image du Chèque</h2>
                <div className="flex justify-center bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <img 
                    src={inventory.image_url} 
                    alt="Check" 
                    className="max-w-full h-auto max-h-96 rounded"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Actions */}
          <div className="space-y-6">
            {/* Status Update Card */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Changer le Statut</h2>
              <div className="space-y-4">
                {inventory.status !== 'pending' && (
                  <Button
                    onClick={() => handleStatusUpdate('pending')}
                    disabled={loading}
                    style={{ backgroundColor: '#f59e0b', color: 'white' }}
                    className="w-full hover:opacity-90 text-sm py-2"
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-300 mr-2 inline-block"></span>
                    En Attente
                  </Button>
                )}
                {inventory.status !== 'received' && (
                  <Button
                    onClick={() => handleStatusUpdate('received')}
                    disabled={loading}
                    style={{ backgroundColor: '#3b82f6', color: 'white' }}
                    className="w-full hover:opacity-90 text-sm py-2"
                  >
                    <span className="w-2 h-2 rounded-full bg-blue-300 mr-2 inline-block"></span>
                    Reçu
                  </Button>
                )}
                {inventory.status !== 'partly_used' && (
                  <Button
                    onClick={() => handleStatusUpdate('partly_used')}
                    disabled={loading}
                    style={{ backgroundColor: '#f97316', color: 'white' }}
                    className="w-full hover:opacity-90 text-sm py-2"
                  >
                    <span className="w-2 h-2 rounded-full bg-orange-300 mr-2 inline-block"></span>
                    Partiellement Utilisé
                  </Button>
                )}
                {inventory.status !== 'used' && (
                  <Button
                    onClick={() => handleStatusUpdate('used')}
                    disabled={loading}
                    style={{ backgroundColor: '#10b981', color: 'white' }}
                    className="w-full hover:opacity-90 text-sm py-2"
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-300 mr-2 inline-block"></span>
                    Utilisé
                  </Button>
                )}
              </div>
            </div>

            {/* Return to Inventory Card */}
            {((inventory.amount_value || 0) - (inventory.remaining_balance || 0)) > 0 && (
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Retour</h2>
                <p className="text-sm text-slate-600 mb-4">
                  Montant utilisé: <span className="font-semibold text-slate-900">{((inventory.amount_value || 0) - (inventory.remaining_balance || 0)).toFixed(2)} MAD</span>
                </p>
                <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Retourner à l'Inventaire
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Retourner le Chèque à l'Inventaire</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleReturnToInventory} className="space-y-4">
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Montant Original:</span>
                          <span className="font-semibold text-slate-900">{(inventory.amount_value || 0).toFixed(2)} MAD</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Montant Utilisé:</span>
                          <span className="font-semibold text-red-700">{((inventory.amount_value || 0) - (inventory.remaining_balance || 0)).toFixed(2)} MAD</span>
                        </div>
                        <div className="flex justify-between text-sm border-t border-slate-200 pt-2">
                          <span className="text-slate-600">Solde Restant:</span>
                          <span className="font-semibold text-emerald-700">{(inventory.remaining_balance || 0).toFixed(2)} MAD</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="return_amount">Montant à Retourner (MAD) *</Label>
                        <Input
                          id="return_amount"
                          type="number"
                          step="0.01"
                          value={returnAmount}
                          onChange={(e) => setReturnAmount(e.target.value)}
                          placeholder="0.00"
                          max={((inventory.amount_value || 0) - (inventory.remaining_balance || 0)).toFixed(2)}
                          required
                        />
                        <p className="text-xs text-slate-500">
                          Maximum: {((inventory.amount_value || 0) - (inventory.remaining_balance || 0)).toFixed(2)} MAD
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="return_reason">Raison du Retour (Optionnel)</Label>
                        <Input
                          id="return_reason"
                          value={returnReason}
                          onChange={(e) => setReturnReason(e.target.value)}
                          placeholder="Ex: Retour partiel, Erreur de calcul..."
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setReturnDialogOpen(false)}
                        >
                          Annuler
                        </Button>
                        <Button
                          type="submit"
                          disabled={loading}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          {loading ? 'Traitement...' : 'Confirmer'}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            )}

            {/* Back Button */}
            <Button
              variant="outline"
              onClick={onBack}
              className="w-full"
            >
              Retour à la Liste
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
