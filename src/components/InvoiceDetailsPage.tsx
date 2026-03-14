import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { ArrowLeft, Download, Trash2, DollarSign, Eye } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { projectId } from '../utils/supabase/info';

type ProductRow = {
  id: string;
  name?: string;
  reference?: string;
  category?: string;
  lot?: string;
  purchase_price?: number;
  number_of_boxes?: number;
  fourchette_min?: number;
  fourchette_max?: number;
};

interface InvoiceDetailsPageProps {
  invoice: any;
  onBack: () => void;
  onDownloadPDF?: (invoice: any) => Promise<void>;
  onDelete?: (invoiceId: string) => Promise<void>;
  session?: any;
  onStatusUpdate?: () => void;
}

export function InvoiceDetailsPage({
  invoice,
  onBack,
  onDownloadPDF,
  onDelete,
  session,
  onStatusUpdate,
}: InvoiceDetailsPageProps) {
  const [loading, setLoading] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentType, setPaymentType] = useState<'full' | 'partial'>('full');
  const [discount, setDiscount] = useState('0');
  const [proofUrl, setProofUrl] = useState<string | null>(invoice.bank_transfer_proof_url || null);
  const [creatorEmail, setCreatorEmail] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);

  useEffect(() => {
    // If the proof url is not present, fetch the latest invoices and update it
    if (!proofUrl && session?.access_token && invoice?.id) {
      (async () => {
        try {
          const res = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/invoices`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          });
          if (res.ok) {
            const data = await res.json();
            const found = (data.invoices || []).find((i: any) => i.id === invoice.id);
            if (found?.bank_transfer_proof_url) {
              setProofUrl(found.bank_transfer_proof_url);
            }
          }
        } catch {}
      })();
    }
  }, [invoice?.id, proofUrl, session?.access_token]);

  useEffect(() => {
    const fetchCreator = async () => {
      try {
        if (!session?.access_token || !invoice?.created_by) return;
        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/users`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (res.ok) {
          const data = await res.json();
          const found = (data.users || []).find((u: any) => u.id === invoice.created_by);
          if (found?.email) setCreatorEmail(found.email);
        }
      } catch {}
    };
    fetchCreator();
  }, [invoice?.created_by, session?.access_token]);

  // Fetch products so we can enrich invoice items (lot/category/reference/purchase_price)
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        if (!session?.access_token) return;
        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/products`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          setProducts((data?.products || []) as ProductRow[]);
        }
      } catch {
        // ignore
      }
    };
    fetchProducts();
  }, [session?.access_token]);

  const getProductForItem = (item: any): ProductRow | null => {
    const productId = item?.productId || item?.product_id || null;
    if (productId) {
      const byId = products.find(p => String(p.id) === String(productId));
      if (byId) return byId;
    }

    const ref = item?.reference || item?.ref || null;
    if (ref) {
      const byRef = products.find(p => String(p.reference) === String(ref));
      if (byRef) return byRef;
    }

    const name = item?.description || item?.name || item?.product_name || '';
    if (name) {
      const byName = products.find(p => p.name === name);
      if (byName) return byName;
      const lowered = String(name).toLowerCase();
      const byPartial = products.find(p => String(p.name || '').toLowerCase().includes(lowered));
      if (byPartial) return byPartial;
    }

    return null;
  };

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

  const getMethodLabel = (method: string) => {
    if (method === 'cash') return 'Espèces';
    if (method === 'check') return 'Chèque';
    if (method === 'bank_transfer') return 'Virement';
    return method;
  };

  const handlePaymentUpdate = async () => {
    try {
      setLoading(true);

      let newStatus = 'pending';
      let newAmountPaid = invoice.amount_paid || 0;
      let newRemainingBalance = invoice.remaining_balance || 0;

      if (paymentType === 'full') {
        newStatus = 'paid';
        newAmountPaid = invoice.total_amount;
        newRemainingBalance = 0;
      } else if (paymentType === 'partial') {
        const paidAmount = parseFloat(paymentAmount || '0');
        const discountAmount = parseFloat(discount || '0');

        if (paidAmount <= 0) {
          toast.error('Le montant à payer doit être supérieur à 0');
          return;
        }

        if (paidAmount + discountAmount > (invoice.remaining_balance || 0)) {
          toast.error('Le montant dépasse le solde restant');
          return;
        }

        newAmountPaid = (invoice.amount_paid || 0) + paidAmount;
        newRemainingBalance = (invoice.remaining_balance || 0) - paidAmount - discountAmount;
        newStatus = newRemainingBalance <= 0 ? 'paid' : 'partial';
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/invoices/${invoice.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            status: newStatus,
            amount_paid: newAmountPaid,
            remaining_balance: newRemainingBalance,
          }),
        }
      );

      if (response.ok) {
        toast.success('Statut de paiement mis à jour avec succès');
        setShowPaymentDialog(false);
        setPaymentAmount('');
        setDiscount('0');
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

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Facture {invoice.invoice_number}</h1>
          <p className="text-gray-600">Détails de la facture</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Montant Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{invoice.total_amount?.toFixed(2)} MAD</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Montant Payé</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{invoice.amount_paid?.toFixed(2)} MAD</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Solde Restant</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-600">{invoice.remaining_balance?.toFixed(2)} MAD</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Statut</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={getStatusColor(invoice.status)}>
              {getStatusLabel(invoice.status)}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Client Information */}
      <Card>
        <CardHeader>
          <CardTitle>Informations Client</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-600 font-semibold">Nom</p>
              <p className="text-lg font-medium text-gray-900">{invoice.client_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 font-semibold">Téléphone</p>
              <p className="text-lg font-medium text-gray-900">{invoice.client_phone || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 font-semibold">Adresse</p>
              <p className="text-lg font-medium text-gray-900">{invoice.client_address || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 font-semibold">ICE</p>
              <p className="text-lg font-medium text-gray-900">{invoice.client_ice || '-'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Details */}
      <Card>
        <CardHeader>
          <CardTitle>Détails de la Facture</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-600 font-semibold">Numéro de Facture</p>
              <p className="text-lg font-mono font-medium text-gray-900">{invoice.invoice_number}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 font-semibold">Date</p>
              <p className="text-lg font-medium text-gray-900">
                {new Date(invoice.created_at).toLocaleDateString('fr-FR')}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 font-semibold">Méthode de Paiement</p>
              <p className="text-lg font-medium text-gray-900">{getMethodLabel(invoice.payment_method)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 font-semibold">Créée par</p>
              <p className="text-lg font-medium text-gray-900">{creatorEmail || invoice.created_by || '-'}</p>
            </div>
            {proofUrl && (
              <div className="col-span-2">
                <p className="text-sm text-gray-600 font-semibold mb-2">Preuve de Virement</p>
                <div className="flex flex-col gap-2 items-start">
                  {/\.(png|jpg|jpeg|gif|webp)$/i.test(proofUrl) ? (
                    <a href={proofUrl} target="_blank" rel="noreferrer">
                      <img src={proofUrl} alt="Preuve de virement" className="h-32 w-auto rounded border" />
                    </a>
                  ) : (
                    <a
                      href={proofUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 underline"
                    >
                      Voir la preuve (PDF)
                    </a>
                  )}
                  <div className="flex items-center gap-2">
                    <Button asChild className="bg-blue-600 hover:bg-blue-700 text-white">
                      <a href={proofUrl} target="_blank" rel="noreferrer">
                        <Eye className="w-4 h-4 mr-2" /> Ouvrir la preuve
                      </a>
                    </Button>
                    <Button asChild>
                      <a href={proofUrl} download>
                        <Download className="w-4 h-4 mr-2" /> Télécharger la preuve
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      {invoice.items && invoice.items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Articles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Référence</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead className="text-right">Caisse</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                    <TableHead className="text-right">Moyenne</TableHead>
                    <TableHead className="text-right">Fourchette Min</TableHead>
                    <TableHead className="text-right">Fourchette Max</TableHead>
                    <TableHead className="text-right">Prix Unitaire</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.items.map((item: any, index: number) => {
                    const p = getProductForItem(item);

                    const description = item.description || item.name || item.product_name || 'Article';
                    const quantity = Number(item.quantity ?? item.qty ?? 0) || 0;

                    // For Facture: prefer purchase_price (product table), then item fields
                    const unitPrice =
                      Number(
                        item.unitPrice ??
                        item.unit_price ??
                        item.unitPrice ??
                        item.price ??
                        item.purchase_price ??
                        item.purchasePrice ??
                        p?.purchase_price ??
                        0
                      ) || 0;

                    const total =
                      Number(item.subtotal ?? item.total_price ?? item.total ?? (quantity * unitPrice) ?? 0) || 0;

                    const caisseRaw = item.caisse ?? item.box ?? item.boxes ?? p?.number_of_boxes ?? null;
                    const caisseNum = Number(caisseRaw);
                    const caisse = Number.isFinite(caisseNum) && caisseNum > 0 ? caisseNum : null;

                    const moyenneRaw = item.moyenne ?? item.average ?? null;
                    const moyenneNum = Number(moyenneRaw);
                    const moyenne =
                      (Number.isFinite(moyenneNum) && moyenneRaw !== '' && moyenneRaw !== null && moyenneRaw !== undefined)
                        ? moyenneNum
                        : (caisse && quantity > 0 ? (quantity / caisse) : null);

                    const fMinRaw = item.fourchette_min ?? p?.fourchette_min ?? null;
                    const fMaxRaw = item.fourchette_max ?? p?.fourchette_max ?? null;
                    const fMin = Number(fMinRaw);
                    const fMax = Number(fMaxRaw);

                    return (
                      <TableRow key={index}>
                        <TableCell className="font-mono text-xs">{p?.reference || item.reference || item.ref || '-'}</TableCell>
                        <TableCell>{description}</TableCell>
                        <TableCell>{p?.category || item.category || item.product_category || '-'}</TableCell>
                        <TableCell>{p?.lot || item.lot || '-'}</TableCell>
                        <TableCell className="text-right">{caisse ?? '-'}</TableCell>
                        <TableCell className="text-right">{quantity || '-'}</TableCell>
                        <TableCell className="text-right">{moyenne !== null ? moyenne.toFixed(2) : '-'}</TableCell>
                        <TableCell className="text-right">{Number.isFinite(fMin) ? fMin.toFixed(2) : '-'}</TableCell>
                        <TableCell className="text-right">{Number.isFinite(fMax) ? fMax.toFixed(2) : '-'}</TableCell>
                        <TableCell className="text-right">{unitPrice.toFixed(2)} MAD</TableCell>
                        <TableCell className="text-right font-semibold">{total.toFixed(2)} MAD</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Status Update Section */}
      <Card>
        <CardHeader>
          <CardTitle>Mettre à Jour le Statut de Paiement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {invoice.status !== 'paid' && (
              <Button
                onClick={() => {
                  setPaymentType('full');
                  setPaymentAmount(invoice.remaining_balance?.toString() || '0');
                  setDiscount('0');
                  setShowPaymentDialog(true);
                }}
                disabled={loading}
                style={{ backgroundColor: '#10b981' }}
                className="text-white hover:opacity-90"
              >
                Marquer comme Payée
              </Button>
            )}
            {invoice.status !== 'partial' && invoice.remaining_balance > 0 && (
              <Button
                onClick={() => {
                  setPaymentType('partial');
                  setPaymentAmount('');
                  setDiscount('0');
                  setShowPaymentDialog(true);
                }}
                disabled={loading}
                style={{ backgroundColor: '#f59e0b' }}
                className="text-white hover:opacity-90"
              >
                Paiement Partiel
              </Button>
            )}
            {invoice.status !== 'pending' && (
              <Button
                onClick={() => {
                  setPaymentType('full');
                  setPaymentAmount('0');
                  setDiscount('0');
                  setShowPaymentDialog(true);
                }}
                disabled={loading}
                style={{ backgroundColor: '#6b7280' }}
                className="text-white hover:opacity-90"
              >
                Réinitialiser à En Attente
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {paymentType === 'full' ? 'Marquer comme Payée' : 'Paiement Partiel'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {paymentType === 'partial' && (
              <>
                <div>
                  <label className="text-sm font-semibold text-gray-700">Montant à Payer (MAD) *</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="0.00"
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">Solde restant: {invoice.remaining_balance?.toFixed(2)} MAD</p>
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700">Remise (MAD)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder="0.00"
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">Remise à appliquer sur le montant restant</p>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-semibold text-gray-700">Montant à Payer:</span>
                    <span className="text-sm font-bold text-blue-600">{parseFloat(paymentAmount || '0').toFixed(2)} MAD</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-semibold text-gray-700">Remise:</span>
                    <span className="text-sm font-bold text-red-600">-{parseFloat(discount || '0').toFixed(2)} MAD</span>
                  </div>
                  <div className="border-t border-blue-200 pt-2 flex justify-between">
                    <span className="text-sm font-semibold text-gray-700">Nouveau Solde Restant:</span>
                    <span className="text-sm font-bold text-orange-600">
                      {Math.max(0, (invoice.remaining_balance || 0) - (parseFloat(paymentAmount || '0') + parseFloat(discount || '0'))).toFixed(2)} MAD
                    </span>
                  </div>
                </div>
              </>
            )}

            {paymentType === 'full' && (
              <div className="bg-green-50 p-4 rounded-lg border border-green-200 space-y-2">
                <p className="text-sm text-gray-700">La facture sera marquée comme <strong>Payée</strong></p>
                <div className="flex justify-between">
                  <span className="text-sm font-semibold text-gray-700">Montant Total:</span>
                  <span className="text-sm font-bold text-green-600">{invoice.total_amount?.toFixed(2)} MAD</span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => setShowPaymentDialog(false)}
                variant="outline"
              >
                Annuler
              </Button>
              <Button
                onClick={() => handlePaymentUpdate()}
                disabled={loading || (paymentType === 'partial' && !paymentAmount)}
                style={{ backgroundColor: '#3b82f6' }}
                className="text-white hover:opacity-90"
              >
                {loading ? 'Mise à jour...' : 'Confirmer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {onDownloadPDF && (
              <Button
                onClick={() => onDownloadPDF(invoice)}
                className="bg-green-500 hover:bg-green-600 text-white font-semibold"
              >
                <Download className="w-4 h-4 mr-2" />
                Télécharger PDF
              </Button>
            )}
            {onDelete && (
              <Button
                onClick={() => {
                  if (confirm('Êtes-vous sûr de vouloir supprimer cette facture?')) {
                    onDelete(invoice.id);
                  }
                }}
                variant="destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Supprimer
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
