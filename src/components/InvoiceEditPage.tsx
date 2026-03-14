import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { ArrowLeft, Trash2, Plus, Download, Search, Check } from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '../utils/supabase/info';

interface InvoiceEditPageProps {
  invoice: any;
  onBack: () => void;
  session?: any;
  onStatusUpdate?: () => void;
}

export function InvoiceEditPage({
  invoice,
  onBack,
  session,
  onStatusUpdate,
}: InvoiceEditPageProps) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>(() => {
    const raw = Array.isArray(invoice.items) ? invoice.items : [];
    return raw.map((it: any) => {
      // normalize incoming item shape so edit fields (caisse/moyenne/unitPrice) show correctly
      const quantity = Number(it.quantity || it.qty || 0) || 0;
      const unitPrice = Number(it.unitPrice ?? it.unit_price ?? it.price ?? 0) || 0;
      const caisse = it.caisse ?? it.box ?? it.boxes ?? it.number_of_boxes ?? it.numberOfBoxes ?? '';

      // If moyenne isn't stored, compute it from quantity/caisse when possible
      const caisseNum = Number(caisse);
      const moyenne =
        it.moyenne ??
        it.average ??
        ((Number.isFinite(caisseNum) && caisseNum > 0 && quantity > 0) ? (quantity / caisseNum).toFixed(2) : '');

      const subtotal = Number(it.subtotal ?? it.total_price ?? it.total ?? (quantity * unitPrice) ?? 0) || 0;

      return {
        ...it,
        quantity,
        unitPrice,
        caisse,
        moyenne,
        subtotal,
        productId: it.productId ?? it.product_id ?? it.id ?? null,
        description: it.description ?? it.name ?? it.product_name ?? '',
      };
    });
  });
  const [clientName, setClientName] = useState(invoice.client_name || '');
  const [clientPhone, setClientPhone] = useState(invoice.client_phone || '');
  const [clientAddress, setClientAddress] = useState(invoice.client_address || '');
  const [clientICE, setClientICE] = useState(invoice.client_ice || '');
  const [paymentMethod, setPaymentMethod] = useState(invoice.payment_method || 'cash');
  // Discount is now an absolute amount in MAD (not a percentage)
  const [discount, setDiscount] = useState('0');
  const [tva, setTva] = useState('0');
  const [amountPaid, setAmountPaid] = useState(invoice.amount_paid || 0);

  // Check payment states
  const [checks, setChecks] = useState<any[]>([]);
  const [loadingChecks, setLoadingChecks] = useState(false);
  const [checkDialogOpen, setCheckDialogOpen] = useState(false);
  const [selectedCheck, setSelectedCheck] = useState<any | null>(null);
  const [checkSearchTerm, setCheckSearchTerm] = useState('');
  const [createCheckDialogOpen, setCreateCheckDialogOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCheckId, setUploadCheckId] = useState('');
  const [uploadAmount, setUploadAmount] = useState('');
  const [uploadGiverName, setUploadGiverName] = useState('');
  const [uploadCheckDate, setUploadCheckDate] = useState('');
  const [uploadExecutionDate, setUploadExecutionDate] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [bankTransferProof, setBankTransferProof] = useState<File | null>(null);
  
  // Multiple payment methods
  const [additionalPayments, setAdditionalPayments] = useState<{ [key: string]: number }>({});
  const [showAddPaymentDialog, setShowAddPaymentDialog] = useState(false);
  const [currentAdditionalPaymentType, setCurrentAdditionalPaymentType] = useState<'cash' | 'check' | 'bank_transfer' | null>(null);
  const [additionalSelectedCheck, setAdditionalSelectedCheck] = useState<any | null>(null);
  const [additionalBankProofFile, setAdditionalBankProofFile] = useState<File | null>(null);
  const [additionalCheckSearchTerm, setAdditionalCheckSearchTerm] = useState('');

  // Auto-calculate total amount paid from all payment methods
  useEffect(() => {
    const mainAmount = amountPaid || 0;
    const additionalAmount = Object.values(additionalPayments).reduce((sum, amount) => sum + (amount || 0), 0);
    const totalPaid = mainAmount + additionalAmount;
    
    // Update amountPaid to show total of all payment methods
    if (Object.keys(additionalPayments).length > 0) {
      setAmountPaid(totalPaid);
    }
  }, [additionalPayments]);

  const calculateSubtotal = () => {
    return items.reduce((sum, item) => {
      const qty = Number(item.quantity || 0) || 0;
      const price = Number(item.unitPrice ?? item.unit_price ?? 0) || 0;
      return sum + (qty * price);
    }, 0);
  };

  const subtotal = calculateSubtotal();
  const discountAmount = Math.max(0, Number(discount || 0) || 0);
  const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);
  const tvaAmount = (subtotalAfterDiscount * parseFloat(tva || '0')) / 100;
  const total = subtotalAfterDiscount + tvaAmount;

  const handleAddItem = () => {
    setItems([...items, { description: '', quantity: 1, unitPrice: 0, caisse: '', moyenne: '', productId: undefined, subtotal: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index][field] = value;

    // Keep a normalized view for computations
    const qty = Number(newItems[index].quantity || 0) || 0;
    const price = Number(newItems[index].unitPrice ?? newItems[index].unit_price ?? 0) || 0;
    newItems[index].unitPrice = price;

    // Auto-calc moyenne if caisse/quantity changed
    if (field === 'caisse' || field === 'quantity') {
      const caisseNum = Number(newItems[index].caisse);
      if (Number.isFinite(caisseNum) && caisseNum > 0 && qty > 0) {
        newItems[index].moyenne = (qty / caisseNum).toFixed(2);
      } else {
        newItems[index].moyenne = '';
      }
    }

    // Always store subtotal
    newItems[index].subtotal = qty * price;

    setItems(newItems);
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
      formDataUpload.append('notes', '');
      formDataUpload.append('giver_name', uploadGiverName);
      formDataUpload.append('check_date', uploadCheckDate);
      formDataUpload.append('execution_date', uploadExecutionDate);

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory/upload`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
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
        setUploadGiverName('');
        setUploadCheckDate('');
        setUploadExecutionDate('');
        
        try {
          const checksResponse = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory`,
            {
              headers: {
                'Authorization': `Bearer ${session?.access_token}`,
              },
            }
          );
          if (checksResponse.ok) {
            const data = await checksResponse.json();
            const checkInventory = data.check_inventory || [];
            setChecks(checkInventory);
            
            if (checkInventory.length > 0) {
              const newCheck = checkInventory[0];
              // Automatically select the newly created check
              setSelectedCheck(newCheck);
              // Use only the amount needed to pay the invoice
              const amountToUse = Math.min(newCheck.remaining_balance, total);
              setAmountPaid(amountToUse);
              toast.success(`Chèque ${newCheck.check_id_number} créé et sélectionné - ${amountToUse.toFixed(2)} MAD utilisé`);
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

  const handleSaveChanges = async () => {
    try {
      setLoading(true);

      // Normalize items schema before saving
      const normalizedItems = (items || []).map((it: any) => {
        const quantity = Number(it.quantity || 0) || 0;
        const unitPrice = Number(it.unitPrice ?? it.unit_price ?? 0) || 0;
        const caisse = it.caisse ?? '';
        const moyenne = it.moyenne ?? '';

        return {
          description: it.description ?? it.name ?? '',
          productId: it.productId ?? it.product_id ?? it.id ?? null,
          quantity,
          unitPrice,
          caisse,
          moyenne,
          subtotal: Number(it.subtotal ?? (quantity * unitPrice) ?? 0) || 0,
        };
      });

      // Calculate stock adjustments (use productId)
      const stockAdjustments: { [key: string]: number } = {};

      // Step 1: Reverse all original stock deductions
      (invoice.items || []).forEach((originalItem: any) => {
        const pid = originalItem.productId || originalItem.product_id || originalItem.id;
        if (!pid) return;
        stockAdjustments[pid] = (stockAdjustments[pid] || 0) + (Number(originalItem.quantity || 0) || 0);
      });

      // Step 2: Deduct new quantities
      normalizedItems.forEach((editedItem: any) => {
        const pid = editedItem.productId;
        if (!pid) return;
        stockAdjustments[pid] = (stockAdjustments[pid] || 0) - (Number(editedItem.quantity || 0) || 0);
      });

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/invoices/${invoice.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            items: normalizedItems,
            client_name: clientName,
            client_phone: clientPhone,
            client_address: clientAddress,
            client_ice: clientICE,
            payment_method: paymentMethod,
            total_amount: total,
            remaining_balance: Math.max(0, total - (invoice.amount_paid || 0)),
            stock_adjustments: stockAdjustments,
          }),
        }
      );

      if (response.ok) {
        toast.success('Facture mise à jour avec succès. Stock ajusté automatiquement.');
        if (onStatusUpdate) {
          onStatusUpdate();
        }
        onBack();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur lors de la mise à jour');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800';
      case 'pending':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPaymentStatusLabel = (status: string) => {
    switch (status) {
      case 'paid':
        return '✓ Payée';
      case 'partial':
        return '◐ Partiellement Payée';
      case 'pending':
        return '✗ Non Payée';
      default:
        return status;
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Éditer Facture {invoice.invoice_number}</h1>
            <p className="text-gray-600">Modifiez les informations et articles de la facture</p>
          </div>
        </div>
        <Button
          onClick={handleSaveChanges}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
        >
          {loading ? 'Sauvegarde...' : 'Sauvegarder les modifications'}
        </Button>
      </div>

      {/* Company Information */}
      <Card>
        <CardHeader>
          <CardTitle>Informations Entreprise</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-semibold">Nom Entreprise</Label>
              <Input value="Frutaria Market" disabled className="mt-1" />
            </div>
            <div>
              <Label className="text-sm font-semibold">Email</Label>
              <Input value="contact@frutaria.com" disabled className="mt-1" />
            </div>
            <div>
              <Label className="text-sm font-semibold">Téléphone</Label>
              <Input value="+212 5XX XXX XXX" disabled className="mt-1" />
            </div>
            <div>
              <Label className="text-sm font-semibold">Adresse</Label>
              <Input value="Rue Principale, Ville" disabled className="mt-1" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Client Information */}
      <Card>
        <CardHeader>
          <CardTitle>Informations Client</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-semibold">Nom Client *</Label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Nom du client"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold">Téléphone</Label>
              <Input
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="Téléphone"
                className="mt-1"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-sm font-semibold">Adresse</Label>
              <Input
                value={clientAddress}
                onChange={(e) => setClientAddress(e.target.value)}
                placeholder="Adresse"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold">ICE</Label>
              <Input
                value={clientICE}
                onChange={(e) => setClientICE(e.target.value)}
                placeholder="Numéro ICE"
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Items */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Articles de la Facture</CardTitle>
            <Button
              onClick={handleAddItem}
              size="sm"
              className="bg-blue-500 hover:bg-blue-600 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
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
                {items.map((item, index) => (
                  <tr key={index} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-2">{index + 1}</td>
                    <td className="py-2 px-2">
                      <Input
                        value={item.description || ''}
                        onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                        placeholder="Description"
                        className="h-8"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Input
                        value={item.caisse || ''}
                        onChange={(e) => {
                          const caisse = parseFloat(e.target.value) || 0;
                          const quantity = item.quantity || 0;
                          handleItemChange(index, 'caisse', e.target.value);
                          // Auto-calculate moyenne when caisse changes
                          if (caisse > 0 && quantity > 0) {
                            handleItemChange(index, 'moyenne', (quantity / caisse).toFixed(2));
                          } else {
                            handleItemChange(index, 'moyenne', '');
                          }
                        }}
                        className="h-8"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Input
                        type="number"
                        value={item.quantity || 0}
                        onChange={(e) => {
                          const quantity = parseFloat(e.target.value) || 0;
                          const caisse = parseFloat(item.caisse) || 0;
                          handleItemChange(index, 'quantity', quantity);
                          // Auto-calculate moyenne when quantity changes
                          if (caisse > 0 && quantity > 0) {
                            handleItemChange(index, 'moyenne', (quantity / caisse).toFixed(2));
                          } else {
                            handleItemChange(index, 'moyenne', '');
                          }
                        }}
                        className="h-8"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Input
                        value={item.moyenne || ''}
                        onChange={(e) => handleItemChange(index, 'moyenne', e.target.value)}
                        className="h-8"
                        disabled
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Input
                        type="number"
                        value={item.unitPrice ?? item.unit_price ?? 0}
                        onChange={(e) => handleItemChange(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                        className="h-8"
                      />
                    </td>
                    <td className="py-2 px-2 font-semibold">
                      {(
                        Number(
                          item.subtotal ??
                          ((Number(item.quantity || 0) || 0) * (Number(item.unitPrice ?? item.unit_price ?? 0) || 0))
                        ) || 0
                      ).toFixed(2)}{' '}
                      MAD
                    </td>
                    <td className="py-2 px-2 text-center">
                      <Button
                        onClick={() => handleRemoveItem(index)}
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
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between mb-3">
                  <span className="text-gray-600">Sous-total HT:</span>
                  <span className="font-bold text-lg">{subtotal.toFixed(2)} MAD</span>
                </div>
                <div className="flex justify-between mb-3">
                  <span className="text-gray-600">Remise ({discountAmount.toFixed(2)} MAD):</span>
                  <span className="font-bold text-lg">-{discountAmount.toFixed(2)} MAD</span>
                </div>
                <div className="flex justify-between mb-3">
                  <span className="text-gray-600">TVA ({tva}%):</span>
                  <span className="font-bold text-lg">{tvaAmount.toFixed(2)} MAD</span>
                </div>
                <div className="border-t pt-3 flex justify-between">
                  <span className="text-gray-900 font-bold">Total TTC:</span>
                  <span className="font-bold text-2xl text-blue-600">{total.toFixed(2)} MAD</span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-semibold">Remise (MAD)</Label>
                  <Input
                    type="number"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder="0"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm font-semibold">TVA (%)</Label>
                  <Input
                    type="number"
                    value={tva}
                    onChange={(e) => setTva(e.target.value)}
                    placeholder="0"
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Payment Status */}
            <div className="border-t pt-4">
              <div className="mb-4">
                <Badge className={getPaymentStatusColor(invoice.status)}>
                  {getPaymentStatusLabel(invoice.status)}
                </Badge>
              </div>

              {/* Payment Method Selection */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Méthode de Paiement</Label>
                <div className="flex flex-col gap-3">
                  <Button
                    onClick={() => setPaymentMethod('cash')}
                    variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                    className="w-full justify-start"
                  >
                    Espèces
                  </Button>
                  <Button
                    onClick={() => setPaymentMethod('check')}
                    variant={paymentMethod === 'check' ? 'default' : 'outline'}
                    className="w-full justify-start"
                  >
                    Chèque
                  </Button>
                  <Button
                    onClick={() => setPaymentMethod('bank_transfer')}
                    variant={paymentMethod === 'bank_transfer' ? 'default' : 'outline'}
                    className="w-full justify-start"
                  >
                    Virement bancaire
                  </Button>
                </div>

                {paymentMethod === 'check' && (
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <Label className="text-sm font-semibold text-gray-700 mb-2 block">Sélectionner un Chèque</Label>
                    
                    {checkDialogOpen && (
                      <Card className="mt-4 w-full">
                        <CardHeader>
                          <CardTitle>Sélectionner un Chèque pour le Paiement</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                              placeholder="Rechercher par ID, montant ou donneur..."
                              className="pl-10"
                              value={checkSearchTerm}
                              onChange={(e) => setCheckSearchTerm(e.target.value)}
                            />
                          </div>
                          {loadingChecks ? (
                            <div className="flex justify-center py-12">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                            </div>
                          ) : checks.length === 0 ? (
                            <div className="text-center py-12">
                              <p className="text-gray-500">Aucun chèque disponible</p>
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
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
                                  {checks.filter((check) => {
                                    if (check.status === 'used' || check.status === 'archived') return false;
                                    if (!checkSearchTerm.trim()) return true;
                                    const term = checkSearchTerm.toLowerCase();
                                    return (
                                      check.check_id_number?.toLowerCase().includes(term) ||
                                      check.given_to?.toLowerCase().includes(term) ||
                                      check.amount_value?.toString().includes(term) ||
                                      check.remaining_balance?.toString().includes(term)
                                    );
                                  }).map((check) => (
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
                                          size="lg"
                                          className="text-white hover:opacity-90"
                                          style={{ backgroundColor: '#10b981' }}
                                          onClick={() => {
                                            // Use only the amount needed to pay the invoice
                                            const amountToUse = Math.min(check.remaining_balance, total);
                                            setSelectedCheck(check);
                                            setAmountPaid(amountToUse);
                                            setCheckDialogOpen(false);
                                            toast.success(`Chèque ${check.check_id_number} sélectionné - ${amountToUse.toFixed(2)} MAD utilisé`);
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
                          <div className="mt-4 flex gap-4">
                            <Button
                              onClick={() => setCheckDialogOpen(false)}
                              size="lg"
                              className="flex-1 bg-white text-black border-2 border-gray-300 hover:bg-gray-100"
                            >
                              Fermer
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    <div className="flex gap-4">
                      <Button
                        className="flex-1 text-white hover:opacity-90"
                        style={{ backgroundColor: '#000000ff' }}
                        size="lg"
                        onClick={async () => {
                          setLoadingChecks(true);
                          try {
                            const response = await fetch(
                              `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory`,
                              {
                                headers: {
                                  'Authorization': `Bearer ${session?.access_token}`,
                                },
                              }
                            );
                            if (response.ok) {
                              const data = await response.json();
                              setChecks(data.check_inventory || []);
                              setCheckDialogOpen(true);
                            }
                          } catch (error) {
                            toast.error('Erreur lors du chargement des chèques');
                          } finally {
                            setLoadingChecks(false);
                          }
                        }}
                      >
                        Choisir un Chèque
                      </Button>
                      <Button
                        className="flex-1 bg-white text-black border-2 border-gray-300 hover:bg-gray-100"
                        size="lg"
                        onClick={() => {
                          setCreateCheckDialogOpen(true);
                          const today = new Date();
                          const year = today.getFullYear();
                          const month = String(today.getMonth() + 1).padStart(2, '0');
                          const day = String(today.getDate()).padStart(2, '0');
                          const dateStr = `${year}-${month}-${day}`;
                          setUploadCheckDate(dateStr);
                          setUploadExecutionDate(dateStr);
                        }}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Créer Chèque
                      </Button>
                    </div>

                    <Dialog open={createCheckDialogOpen} onOpenChange={setCreateCheckDialogOpen}>
                      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Uploader un Chèque à l'Inventaire</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleUploadCheck} className="space-y-4">
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
                              min="0.01"
                              max="999999999.99"
                              value={uploadAmount}
                              onChange={(e) => setUploadAmount(e.target.value)}
                              placeholder="0.00"
                            />
                            <p className="text-xs text-gray-500">Max: 999,999,999.99 MAD</p>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="upload_giver_name">Donneur du Chèque</Label>
                            <Input
                              id="upload_giver_name"
                              value={uploadGiverName}
                              onChange={(e) => setUploadGiverName(e.target.value)}
                              placeholder="Tapez le nom d'un client..."
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="upload_check_date">Date du Chèque</Label>
                            <Input
                              id="upload_check_date"
                              type="date"
                              value={uploadCheckDate}
                              onChange={(e) => setUploadCheckDate(e.target.value)}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="upload_execution_date">Date d'Exécution</Label>
                            <Input
                              id="upload_execution_date"
                              type="date"
                              value={uploadExecutionDate}
                              onChange={(e) => setUploadExecutionDate(e.target.value)}
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

                {paymentMethod === 'bank_transfer' && (
                  <div className="mt-3 space-y-2 rounded-md border p-3">
                    <Label className="text-sm font-semibold">Justificatif de virement (optionnel)</Label>
                    <Input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => setBankTransferProof(e.target.files?.[0] ?? null)}
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-500">
                      Vous pouvez ajouter une photo / PDF comme preuve (facultatif).
                    </p>
                  </div>
                )}
              </div>

              {/* Amount Paid */}
              <div className="mt-4">
                <Label className="text-sm font-semibold">Montant Payé (MAD)</Label>
                <Input
                  type="number"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(parseFloat(e.target.value) || 0)}
                  className="mt-1"
                />
                {selectedCheck && (
                  <p className="text-xs text-green-600 mt-2">
                    ✓ Chèque {selectedCheck.check_id_number} sélectionné - Montant utilisé: {amountPaid.toFixed(2)} MAD
                  </p>
                )}
              </div>

              {/* Display Additional Payment Methods */}
              {Object.keys(additionalPayments).length > 0 && (
                <div className="border-t pt-4 mt-4">
                  <Label className="text-sm font-semibold text-gray-700 mb-3 block">Méthodes de Paiement Supplémentaires</Label>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(additionalPayments).map(([method, amount]) => (
                      <div key={method} className="flex items-center gap-2 bg-purple-100 text-purple-800 px-3 py-2 rounded-lg border border-purple-300">
                        <span className="text-sm font-semibold">
                          {method === 'cash' ? ' Espèces' : method === 'check' ? '🏦 Chèque' : '🏦 Virement'}
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

              {Object.keys(additionalPayments).length < 3 && (
                <Button
                  type="button"
                  onClick={() => setShowAddPaymentDialog(true)}
                  className="w-full mt-4"
                  style={{ backgroundColor: '#000000ff', color: 'white' }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  + Ajouter une Méthode de Paiement
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Additional Payment Method Dialog */}
      <Dialog open={showAddPaymentDialog} onOpenChange={setShowAddPaymentDialog}>
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
                  style={{ backgroundColor: '#070707ff', color: 'white' }}
                >
                   Espèces
                </Button>
                <Button
                  onClick={() => setCurrentAdditionalPaymentType('check')}
                  className="w-full justify-start h-14 text-base font-semibold"
                  style={{ backgroundColor: '#050505ff', color: 'white' }}
                >
                   Chèque
                </Button>
                <Button
                  onClick={() => setCurrentAdditionalPaymentType('bank_transfer')}
                  className="w-full justify-start h-14 text-base font-semibold"
                  style={{ backgroundColor: '#000000ff', color: 'white' }}
                >
                   Virement Bancaire
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
                      setShowAddPaymentDialog(false);
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
                            'Authorization': `Bearer ${session?.access_token}`,
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
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Rechercher par ID, montant ou donneur..."
                      className="pl-10"
                      value={additionalCheckSearchTerm}
                      onChange={(e) => setAdditionalCheckSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto border rounded-lg">
                    {checks.filter((check) => {
                      if (check.status === 'used' || check.status === 'archived') return false;
                      if (!additionalCheckSearchTerm.trim()) return true;
                      const term = additionalCheckSearchTerm.toLowerCase();
                      return (
                        check.check_id_number?.toLowerCase().includes(term) ||
                        check.given_to?.toLowerCase().includes(term) ||
                        check.amount_value?.toString().includes(term) ||
                        check.remaining_balance?.toString().includes(term)
                      );
                    }).map((check) => (
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
                        <div className="text-xs text-gray-600">Montant: {(check.amount_value || 0).toFixed(2)} MAD | Disponible: {(check.remaining_balance || 0).toFixed(2)} MAD | {check.given_to}</div>
                      </button>
                    ))}
                  </div>
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
                      setShowAddPaymentDialog(false);
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
                      setShowAddPaymentDialog(false);
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

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          onClick={onBack}
          variant="outline"
          className="flex-1"
        >
          Annuler
        </Button>
        <Button
          onClick={handleSaveChanges}
          disabled={loading}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
        >
          {loading ? 'Sauvegarde...' : 'Sauvegarder les modifications'}
        </Button>
      </div>
    </div>
  );
}
