import { useState, useEffect } from 'react';
import { projectId } from '../../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Search, Eye, CheckCircle, Truck, Clock, Package, ArrowRightLeft, Store, User, MapPin, Phone, Mail, AlertCircle, Checkbox } from 'lucide-react';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { OrderDetailsPage } from '../OrderDetailsPage';

interface OrdersModuleProps {
  session: any;
}

export function OrdersModule({ session }: OrdersModuleProps) {
  const [orders, setOrders] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [partialPayments, setPartialPayments] = useState<any[]>([]);
  const [checks, setChecks] = useState<any[]>([]);
  const [checkInventory, setCheckInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [userRole, setUserRole] = useState<'buyer' | 'seller' | 'admin'>('buyer');
  const [currentUserStoreId, setCurrentUserStoreId] = useState<string | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  const fetchOrders = async () => {
    try {
      const [ordersResponse, salesResponse] = await Promise.all([
        fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/orders`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        ),
        fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/sales`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        ),
      ]);

      if (ordersResponse.ok) {
        const data = await ordersResponse.json();
        setOrders(data.orders || []);
      } else {
        console.error('Orders response error:', ordersResponse.status);
      }

      if (salesResponse.ok) {
        const data = await salesResponse.json();
        setSales(data.sales || []);
      } else {
        console.error('Sales response error:', salesResponse.status);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Erreur lors du chargement des commandes');
    } finally {
      setLoading(false);
    }
  };

  const fetchPartialPayments = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/partial-payments`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setPartialPayments(data.partial_payments || []);
      } else {
        console.error('Partial payments endpoint error:', response.status);
      }
    } catch (error) {
      console.error('Error fetching partial payments:', error);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchProducts();
    fetchSuppliers();
    fetchClients();
    fetchPartialPayments();
    fetchCheckInventory();
    fetchCurrentUserStore();
    
    // Refresh partial payments every 5 seconds
    const interval = setInterval(() => {
      fetchPartialPayments();
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchCurrentUserStore = async () => {
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
        // Extract current user's store ID from their products
        const userProduct = data.products?.find((p: any) => p.created_by === session?.user?.id);
        if (userProduct?.store_stocks) {
          const storeId = Object.keys(userProduct.store_stocks)[0];
          setCurrentUserStoreId(storeId);
          console.log('Current user store ID:', storeId);
        }
      }
    } catch (error) {
      console.error('Error fetching current user store:', error);
    }
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

  const fetchSuppliers = async () => {
    try {
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
        setSuppliers(data.suppliers || []);
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    }
  };

  const fetchClients = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/clients`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setClients(data.clients || []);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const fetchCheckInventory = async () => {
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
        setCheckInventory(data.check_inventory || []);
      }
    } catch (error) {
      console.error('Error fetching check inventory:', error);
    }
  };

  const updateDeliveryStatus = async (orderId: string, newStatus: string) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/orders/${orderId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ delivery_status: newStatus }),
        }
      );

      if (response.ok) {
        toast.success(`Statut de livraison mis à jour: ${getStatusLabel(newStatus)}`);
        fetchOrders();
        if (selectedOrder?.id === orderId) {
          setSelectedOrder({ ...selectedOrder, delivery_status: newStatus });
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const confirmDelivery = async (orderId: string, buyerStoreId?: string) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/orders/${orderId}/confirm-delivery`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            buyer_store_id: buyerStoreId || null,
          }),
        }
      );

      if (response.ok) {
        toast.success('Livraison confirmée! Stock automatiquement mis à jour.');
        fetchOrders();
        if (selectedOrder?.id === orderId) {
          setSelectedOrder({ ...selectedOrder, delivery_status: 'confirmed' });
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'preparing':
        return 'bg-blue-100 text-blue-800';
      case 'in_transit':
        return 'bg-purple-100 text-purple-800';
      case 'delivered':
        return 'bg-orange-100 text-orange-800';
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: { [key: string]: string } = {
      pending: 'En attente',
      preparing: 'Préparation',
      in_transit: 'En transit',
      delivered: 'Livrée',
      confirmed: 'Confirmée',
    };
    return labels[status] || status;
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

  const filteredOrders = orders.filter(order => {
    const matchesSearch =
      order.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.warehouse?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || order.delivery_status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const pendingOrders = filteredOrders.filter(o => o.delivery_status === 'pending');
  const preparingOrders = filteredOrders.filter(o => o.delivery_status === 'preparing');
  const inTransitOrders = filteredOrders.filter(o => o.delivery_status === 'in_transit');
  const deliveredOrders = filteredOrders.filter(o => o.delivery_status === 'delivered');
  const confirmedOrders = filteredOrders.filter(o => o.delivery_status === 'confirmed');

  // Filter sales based on user role
  const filteredSales = sales.filter(sale => {
    const customerInfo = sale.notes ? sale.notes.split(', ').reduce((acc: any, part: string) => {
      const [key, value] = part.split(': ');
      acc[key] = value;
      return acc;
    }, {}) : {};

    // Buyer sees only their own purchases
    if (userRole === 'buyer') {
      return customerInfo.Customer === session?.user?.email;
    }
    // Seller and admin see all
    return true;
  });

  // Function to update sale status
  const updateSaleStatus = async (saleId: string, newStatus: string) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/sales/${saleId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ delivery_status: newStatus }),
        }
      );

      if (response.ok) {
        toast.success(`Statut mis à jour: ${getStatusLabel(newStatus)}`);
        fetchOrders();
        if (selectedOrder?.id === saleId) {
          setSelectedOrder({ ...selectedOrder, delivery_status: newStatus });
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  // Check if user can perform action
  const canBuyerChangeStatus = (sale: any) => userRole === 'buyer' && sale.delivery_status === 'in_transit';
  const canSellerChangeStatus = (sale: any) => userRole === 'seller' && ['pending', 'preparing'].includes(sale.delivery_status);
  const canDeliveryChangeStatus = (sale: any) => userRole === 'admin' && sale.delivery_status === 'preparing';

  // Show full-page details view if selected
  if (showDetails && selectedOrder) {
    return (
      <OrderDetailsPage
        order={selectedOrder}
        session={session}
        onBack={() => {
          setShowDetails(false);
          setSelectedOrder(null);
        }}
        products={products}
        clients={clients}
        checkInventory={checkInventory}
        partialPayments={partialPayments}
        userRole={userRole}
        currentUserStoreId={currentUserStoreId}
        onUpdateStatus={updateSaleStatus}
        onConfirmDelivery={confirmDelivery}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Order Status Overview - Navbar Style */}
      <div className="flex flex-wrap w-full bg-white p-1 h-auto gap-1 border-b border-gray-200 rounded-lg">
        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-yellow-50 border-b-2 border-yellow-500 text-yellow-600 flex-1 min-w-max">
          <Clock className="w-5 h-5" />
          <span className="text-xs font-medium">En attente</span>
          <span className="text-lg font-bold">{pendingOrders.length}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-blue-50 border-b-2 border-blue-500 text-blue-600 flex-1 min-w-max">
          <Package className="w-5 h-5" />
          <span className="text-xs font-medium">Préparation</span>
          <span className="text-lg font-bold">{preparingOrders.length}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-purple-50 border-b-2 border-purple-500 text-purple-600 flex-1 min-w-max">
          <Truck className="w-5 h-5" />
          <span className="text-xs font-medium">En transit</span>
          <span className="text-lg font-bold">{inTransitOrders.length}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-orange-50 border-b-2 border-orange-500 text-orange-600 flex-1 min-w-max">
          <Store className="w-5 h-5" />
          <span className="text-xs font-medium">Livrée</span>
          <span className="text-lg font-bold">{deliveredOrders.length}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-green-50 border-b-2 border-green-500 text-green-600 flex-1 min-w-max">
          <CheckCircle className="w-5 h-5" />
          <span className="text-xs font-medium">Confirmée</span>
          <span className="text-lg font-bold">{confirmedOrders.length}</span>
        </div>
      </div>

      {/* Partial Payments Stat Card - COMMENTED OUT */}
      {/* <Card className="border-2 border-red-500 bg-red-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <AlertCircle className="w-10 h-10 text-red-700" />
            </div>
            <div className="flex-1">
              <p className="text-lg font-bold text-red-900 mb-4">
                {partialPayments && partialPayments.filter(p => p.confirmation_status === 'pending').length > 0 
                  ? `${partialPayments.filter(p => p.confirmation_status === 'pending').length} vente(s) avec paiement partiel en attente de confirmation de remise.`
                  : 'Aucun paiement partiel en attente de confirmation'}
              </p>
              {partialPayments && partialPayments.filter(p => p.confirmation_status === 'pending').length > 0 && (
                <div className="space-y-3">
                  {partialPayments.filter(p => p.confirmation_status === 'pending').slice(0, 5).map((payment) => (
                    <div key={payment.id} className="bg-white rounded-lg p-3 border border-red-200 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">{payment.reference_number || 'N/A'}</p>
                        <p className="text-xs text-gray-600 mt-1">Montant total: {payment.total_amount?.toFixed(2)} MAD</p>
                      </div>
                      <div className="text-right">
                        <p className="text-red-700 font-bold text-xl">{payment.pending_discount?.toFixed(2)} MAD</p>
                        <p className="text-xs text-gray-600 mt-1">Remise</p>
                      </div>
                    </div>
                  ))}
                  {partialPayments.filter(p => p.confirmation_status === 'pending').length > 5 && (
                    <p className="text-sm text-red-700 font-semibold text-center pt-2">
                      +{partialPayments.filter(p => p.confirmation_status === 'pending').length - 5} autre(s) en attente
                    </p>
                  )}
                </div>
              )}
              <div className="mt-4 pt-4 border-t border-red-200 text-xs text-red-700">
                <p>Debug: Total payments: {partialPayments?.length || 0} | Pending: {partialPayments?.filter(p => p.confirmation_status === 'pending').length || 0}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card> */}

      
      {/* Purchases from Products Page */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Achats Directs (Stock Partagé)
            </CardTitle>
            {selectedOrders.size > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-600">
                  {selectedOrders.size} sélectionné(s)
                </span>
                <Button
                  onClick={async () => {
                    const orderIds = Array.from(selectedOrders);
                    for (const orderId of orderIds) {
                      await updateSaleStatus(orderId, 'delivered');
                    }
                    setSelectedOrders(new Set());
                  }}
                  className="bg-green-500 hover:bg-green-600 text-white font-semibold"
                >
                  <Truck className="w-4 h-4 mr-2" />
                  Livrer
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : sales.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Aucun achat direct enregistré</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <input
                  type="checkbox"
                  checked={selectedOrders.size === sales.length && sales.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedOrders(new Set(sales.map(s => s.id)));
                    } else {
                      setSelectedOrders(new Set());
                    }
                  }}
                  className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                />
                <label className="text-sm font-medium text-gray-700 cursor-pointer">
                  Sélectionner tout
                </label>
              </div>
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <input
                          type="checkbox"
                          checked={selectedOrders.size === sales.length && sales.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedOrders(new Set(sales.map(s => s.id)));
                            } else {
                              setSelectedOrders(new Set());
                            }
                          }}
                          className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                        />
                      </TableHead>
                      <TableHead>N° Vente</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Par</TableHead>
                      <TableHead>Montant</TableHead>
                      <TableHead>Paiement</TableHead>
                      <TableHead>Statut Livraison</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.map((sale) => {
                      const customerInfo = sale.notes ? sale.notes.split(', ').reduce((acc: any, part: string) => {
                        const [key, value] = part.split(': ');
                        acc[key] = value;
                        return acc;
                      }, {}) : {};

                      return (
                        <TableRow key={sale.id}>
                          <TableCell className="w-12">
                            <input
                              type="checkbox"
                              checked={selectedOrders.has(sale.id)}
                              onChange={(e) => {
                                const newSelected = new Set(selectedOrders);
                                if (e.target.checked) {
                                  newSelected.add(sale.id);
                                } else {
                                  newSelected.delete(sale.id);
                                }
                                setSelectedOrders(newSelected);
                              }}
                              className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                            />
                          </TableCell>
                          <TableCell className="font-medium">{sale.sale_number}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {sale.doc_type || (String(sale.sale_number || '').includes('TRANSFER-')
                                ? 'TRANSFER'
                                : String(sale.sale_number || '').includes('PURCHASE-')
                                  ? 'ACHAT'
                                  : String(sale.sale_number || '').startsWith('BL')
                                    ? 'BL'
                                    : 'VENTE')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">
                                {(() => {
                                  const name =
                                    customerInfo.Name ||
                                    customerInfo.Client ||
                                    // Notes often contain an email in Customer
                                    customerInfo.Customer ||
                                    sale.customer?.name ||
                                    sale.client?.name ||
                                    sale.client_name ||
                                    sale.customer_name ||
                                    // common store fields
                                    sale.store?.name ||
                                    sale.buyer_store?.name ||
                                    sale.seller_store?.name ||
                                    sale.store_name ||
                                    sale.buyer_store_name ||
                                    sale.seller_store_name ||
                                    sale.created_for_store_name;

                                  if (name && String(name).trim().length > 0) return name;

                                  const fallbackId =
                                    sale.client_id ||
                                    sale.customer_id ||
                                    sale.store_id ||
                                    sale.buyer_store_id ||
                                    sale.seller_store_id ||
                                    sale.created_for_store_id;

                                  return fallbackId ? `Client ${fallbackId}` : 'Client';
                                })()}
                              </p>
                              {(customerInfo.Phone || sale.customer?.phone || sale.client?.phone) && (
                                <p className="text-xs text-gray-600">{customerInfo.Phone || sale.customer?.phone || sale.client?.phone}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium">{sale.created_by_email || '—'}</p>
                              {sale.created_by_role && (
                                <p className="text-xs text-gray-500">{String(sale.created_by_role).toUpperCase()}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-semibold">{sale.total_amount?.toFixed(2)} MAD</TableCell>
                          <TableCell>
                            <Badge className={getPaymentStatusColor(sale.payment_status)}>
                              Paiement : {sale.payment_status === 'paid' ? 'Payé' : sale.payment_status === 'partial' ? 'Partiellement payée' : 'Non payé'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(sale.delivery_status)}>
                              {getStatusLabel(sale.delivery_status)}
                            </Badge>
                          </TableCell>
                          <TableCell>{new Date(sale.created_at).toLocaleDateString('fr-FR')}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-2 justify-end items-center">
                              {sale.delivery_status === 'in_transit' && (
                                <Button
                                  size="sm"
                                  style={{ backgroundColor: '#10b981', color: 'white' }}
                                  onClick={() => updateSaleStatus(sale.id, 'delivered')}
                                  title="Marquer comme livrée"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedOrder(sale);
                                  setShowDetails(true);
                                }}
                                title="Voir les détails"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-800">Workflow des Commandes Inter-Magasins</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-blue-700 space-y-2">
            <p><strong>1. En attente:</strong> Commande créée, magasin fournisseur doit commencer la préparation</p>
            <p><strong>2. Préparation:</strong> Magasin fournisseur prépare la commande</p>
            <p><strong>3. En transit:</strong> Commande en cours de livraison</p>
            <p><strong>4. Livrée:</strong> Commande arrivée chez le client, en attente de confirmation</p>
            <p><strong>5. Confirmée:</strong> Client a confirmé réception, stock automatiquement mis à jour</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
