import { useState, useEffect } from 'react';
import { projectId } from '../../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Plus, Search, CreditCard, DollarSign, FileCheck, Banknote } from 'lucide-react';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';

interface PaymentsModuleProps {
  session: any;
}

export function PaymentsModule({ session }: PaymentsModuleProps) {
  const [payments, setPayments] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    order_id: '',
    store_id: '',
    supplier_id: '',
    amount: '',
    payment_method: 'cash',
    reference_number: '',
    notes: '',
  });

  const fetchData = async () => {
    try {
      setLoading(true);

      const [paymentsRes, ordersRes, storesRes, suppliersRes] = await Promise.all([
        fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/payments`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/orders`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/stores`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/suppliers`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        }),
      ]);

      if (paymentsRes.ok) {
        const data = await paymentsRes.json();
        setPayments(data.payments || []);
      }

      if (ordersRes.ok) {
        const data = await ordersRes.json();
        setOrders(data.orders || []);
      }

      if (storesRes.ok) {
        const data = await storesRes.json();
        setStores(data.stores || []);
      }

      if (suppliersRes.ok) {
        const data = await suppliersRes.json();
        setSuppliers(data.suppliers || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/payments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            order_id: formData.order_id || null,
            store_id: formData.store_id || null,
            supplier_id: formData.supplier_id || null,
            amount: parseFloat(formData.amount),
            payment_method: formData.payment_method,
            reference_number: formData.reference_number,
            notes: formData.notes,
          }),
        }
      );

      if (response.ok) {
        toast.success('Paiement enregistré');
        setDialogOpen(false);
        resetForm();
        fetchData();
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

  const resetForm = () => {
    setFormData({
      order_id: '',
      store_id: '',
      supplier_id: '',
      amount: '',
      payment_method: 'cash',
      reference_number: '',
      notes: '',
    });
  };

  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case 'cash':
        return <Banknote className="w-4 h-4" />;
      case 'check':
        return <FileCheck className="w-4 h-4" />;
      case 'transfer':
        return <CreditCard className="w-4 h-4" />;
      default:
        return <DollarSign className="w-4 h-4" />;
    }
  };

  const getPaymentMethodColor = (method: string) => {
    switch (method) {
      case 'cash':
        return 'bg-green-100 text-green-800';
      case 'check':
        return 'bg-blue-100 text-blue-800';
      case 'transfer':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getOrderInfo = (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (order) {
      return `${order.order_number} - ${order.warehouse?.name} → ${order.customer?.name}`;
    }
    return 'Commande inconnue';
  };

  const getStoreInfo = (storeId: string) => {
    const store = stores.find(s => s.id === storeId);
    return store?.name || 'Magasin inconnu';
  };

  const getSupplierInfo = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier?.name || 'Fournisseur inconnu';
  };

  const filteredPayments = payments.filter(payment =>
    payment.reference_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    payment.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    getOrderInfo(payment.order_id)?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    getStoreInfo(payment.store_id)?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    getSupplierInfo(payment.supplier_id)?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPayments = filteredPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const cashPayments = filteredPayments.filter(p => p.payment_method === 'cash');
  const checkPayments = filteredPayments.filter(p => p.payment_method === 'check');
  const transferPayments = filteredPayments.filter(p => p.payment_method === 'transfer');

  return (
    <div className="space-y-6">
      {/* Payments Overview Cards - Navbar Style */}
      <div className="flex flex-wrap w-full bg-white p-1 h-auto gap-1 border-b border-gray-200 rounded-lg">
        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-blue-50 border-b-2 border-blue-500 text-blue-600 flex-1 min-w-max">
          <DollarSign className="w-5 h-5" />
          <span className="text-xs font-medium">Total Paiements</span>
          <span className="text-lg font-bold">{filteredPayments.length}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-green-50 border-b-2 border-green-500 text-green-600 flex-1 min-w-max">
          <Banknote className="w-5 h-5" />
          <span className="text-xs font-medium">Espèces</span>
          <span className="text-lg font-bold">{cashPayments.length}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-orange-50 border-b-2 border-orange-500 text-orange-600 flex-1 min-w-max">
          <FileCheck className="w-5 h-5" />
          <span className="text-xs font-medium">Chèques</span>
          <span className="text-lg font-bold">{checkPayments.length}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-purple-50 border-b-2 border-purple-500 text-purple-600 flex-1 min-w-max">
          <CreditCard className="w-5 h-5" />
          <span className="text-xs font-medium">Montant Total</span>
          <span className="text-lg font-bold">{totalPayments.toFixed(0)}K MAD</span>
        </div>
      </div>

      {/* Main Payments Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Suivi des Paiements
            </CardTitle>
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Nouveau Paiement
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Enregistrer un paiement</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="amount">Montant (MAD) *</Label>
                      <Input
                        id="amount"
                        type="number"
                        step="0.01"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="payment_method">Méthode de paiement *</Label>
                      <select
                        id="payment_method"
                        value={formData.payment_method}
                        onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md"
                        required
                      >
                        <option value="cash">Espèces</option>
                        <option value="check">Chèque</option>
                        <option value="transfer">Virement</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="order_id">Commande liée (optionnel)</Label>
                      <select
                        id="order_id"
                        value={formData.order_id}
                        onChange={(e) => setFormData({ ...formData, order_id: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md"
                      >
                        <option value="">Aucune commande</option>
                        {orders.map((order) => (
                          <option key={order.id} value={order.id}>
                            {order.order_number} - {order.warehouse?.name} → {order.customer?.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="store_id">Magasin (optionnel)</Label>
                      <select
                        id="store_id"
                        value={formData.store_id}
                        onChange={(e) => setFormData({ ...formData, store_id: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md"
                      >
                        <option value="">Aucun magasin</option>
                        {stores.map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="supplier_id">Fournisseur (optionnel)</Label>
                      <select
                        id="supplier_id"
                        value={formData.supplier_id}
                        onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md"
                      >
                        <option value="">Aucun fournisseur</option>
                        {suppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reference_number">Numéro de référence</Label>
                      <Input
                        id="reference_number"
                        value={formData.reference_number}
                        onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                        placeholder="Numéro de chèque, référence..."
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Input
                        id="notes"
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Détails supplémentaires du paiement"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Annuler
                    </Button>
                    <Button type="submit" disabled={loading}>
                      {loading ? 'Enregistrement...' : 'Enregistrer le Paiement'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Rechercher un paiement..."
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
                      <TableHead>Date</TableHead>
                      <TableHead>Montant</TableHead>
                      <TableHead>Méthode</TableHead>
                      <TableHead>Référence</TableHead>
                      <TableHead>Destinataire</TableHead>
                      <TableHead>Commande liée</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                          Aucun paiement trouvé
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPayments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>{new Date(payment.created_at).toLocaleDateString('fr-FR')}</TableCell>
                          <TableCell className="font-medium">{payment.amount?.toFixed(2)} MAD</TableCell>
                          <TableCell>
                            <Badge className={getPaymentMethodColor(payment.payment_method)}>
                              <div className="flex items-center gap-1">
                                {getPaymentMethodIcon(payment.payment_method)}
                                {payment.payment_method}
                              </div>
                            </Badge>
                          </TableCell>
                          <TableCell>{payment.reference_number || '-'}</TableCell>
                          <TableCell>
                            {payment.store_id && (
                              <div className="text-sm">
                                <p className="font-medium">{getStoreInfo(payment.store_id)}</p>
                                <p className="text-gray-500">Magasin</p>
                              </div>
                            )}
                            {payment.supplier_id && (
                              <div className="text-sm">
                                <p className="font-medium">{getSupplierInfo(payment.supplier_id)}</p>
                                <p className="text-gray-500">Fournisseur</p>
                              </div>
                            )}
                            {!payment.store_id && !payment.supplier_id && '-'}
                          </TableCell>
                          <TableCell>
                            {payment.order_id ? (
                              <div className="text-sm">
                                <p className="font-medium">{getOrderInfo(payment.order_id)}</p>
                              </div>
                            ) : (
                              '-'
                            )}
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
          <CardTitle className="text-green-800">À propos du Suivi des Paiements</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-green-700 space-y-2">
            <p>• Suivi de tous les paiements entre magasins et fournisseurs</p>
            <p>• Liaison possible avec les commandes inter-magasins</p>
            <p>• Support des méthodes : Espèces, Chèque, Virement</p>
            <p>• Références et notes pour traçabilité complète</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
