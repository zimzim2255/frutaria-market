import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { ArrowLeft, Package, Store, User, CheckCircle, Truck, AlertCircle } from 'lucide-react';

interface OrderDetailsPageProps {
  order: any;
  session: any;
  onBack: () => void;
  products?: any[];
  clients?: any[];
  checkInventory?: any[];
  partialPayments?: any[];
  userRole?: 'buyer' | 'seller' | 'admin';
  currentUserStoreId?: string | null;
  onUpdateStatus?: (orderId: string, newStatus: string) => Promise<void>;
  onConfirmDelivery?: (orderId: string, buyerStoreId?: string) => Promise<void>;
}

export function OrderDetailsPage({
  order,
  session,
  onBack,
  products = [],
  clients = [],
  checkInventory = [],
  partialPayments = [],
  userRole = 'buyer',
  currentUserStoreId = null,
  onUpdateStatus,
  onConfirmDelivery,
}: OrderDetailsPageProps) {
  const [loading, setLoading] = useState(false);

  // Payment computations
  const paymentMethodsTotalPaid = Array.isArray(order?.payment_methods)
    ? order.payment_methods.reduce((sum: number, p: any) => sum + (Number(p?.amount) || 0), 0)
    : 0;

  // Fallback for legacy partial payment records when payment_methods are not present
  const legacyPartialPayment = Array.isArray(partialPayments)
    ? partialPayments.find((p: any) => p?.reference_number === order?.sale_number)
    : undefined;

  const totalAmount = Number(order?.total_amount) || 0;

  const computedPaidAmount =
    paymentMethodsTotalPaid > 0
      ? paymentMethodsTotalPaid
      : order?.payment_status === 'paid'
        ? totalAmount
        : legacyPartialPayment && legacyPartialPayment.pending_discount != null
          ? Math.max(0, totalAmount - (Number(legacyPartialPayment.pending_discount) || 0))
          : 0;

  const computedRemainingAmount = Math.max(0, totalAmount - computedPaidAmount);

  // Seller store details (avoid using clients[0])
  const pickNonEmptyScalar = (...vals: any[]) => {
    for (const v of vals) {
      if (v === null || v === undefined) continue;
      if (typeof v === 'string') {
        const t = v.trim();
        if (t.length === 0) continue;
        return t;
      }
      return v;
    }
    return undefined;
  };

  // try multiple possible shapes
  const sellerStore =
    (order as any)?.seller_store ||
    (order as any)?.sellerStore ||
    (order as any)?.store ||
    (order as any)?.seller ||
    (order as any)?.seller_info ||
    (order as any)?.sellerInfo;

  // also try to resolve store info from provided collections
  const sellerStoreId = pickNonEmptyScalar(
    (order as any)?.seller_store_id,
    (order as any)?.sellerStoreId,
    (order as any)?.store_id,
    (order as any)?.storeId,
    (order as any)?.seller_id,
    (order as any)?.sellerId,
  );

  const sellerFromClients = sellerStoreId ? (clients || []).find((c: any) => String(c?.id) === String(sellerStoreId)) : undefined;

  const sellerStoreName = pickNonEmptyScalar(
    sellerStore?.name,
    sellerStore?.store_name,
    sellerStore?.storeName,
    sellerFromClients?.name,
    sellerFromClients?.store_name,
    (order as any)?.seller_store_name,
    (order as any)?.store_name,
    (order as any)?.seller_name,
    'Seller Store',
  );

  const actorEmail = pickNonEmptyScalar(
    (order as any)?.created_by_email,
    (order as any)?.createdByEmail,
    (order as any)?.actor_email,
    (order as any)?.actorEmail,
    (order as any)?.admin_email,
    (order as any)?.adminEmail,
    (order as any)?.created_by?.email,
    (order as any)?.createdBy?.email,
    (order as any)?.actor?.email,
    (order as any)?.admin?.email,
    session?.user?.email,
  );

  const sellerStoreEmail = pickNonEmptyScalar(
    sellerStore?.email,
    sellerStore?.store_email,
    sellerStore?.storeEmail,
    sellerFromClients?.email,
    (order as any)?.seller_store_email,
    (order as any)?.store_email,
    (order as any)?.seller_email,
    // fallback: show who performed the operation if store email is missing
    actorEmail,
    '—',
  );

  const sellerStorePhone = pickNonEmptyScalar(
    sellerStore?.phone,
    sellerStore?.telephone,
    sellerStore?.tel,
    sellerStore?.store_phone,
    sellerStore?.storePhone,
    sellerFromClients?.phone,
    sellerFromClients?.telephone,
    sellerFromClients?.tel,
    (order as any)?.seller_store_phone,
    (order as any)?.store_phone,
    (order as any)?.seller_phone,
    '—',
  );

  const sellerStoreAddress = pickNonEmptyScalar(
    sellerStore?.address,
    sellerStore?.adresse,
    sellerStore?.store_address,
    sellerStore?.storeAddress,
    sellerFromClients?.address,
    sellerFromClients?.adresse,
    (order as any)?.seller_store_address,
    (order as any)?.store_address,
    (order as any)?.seller_address,
    '—',
  );

  // Items can come from different sources/pages (sales, purchases, invoices/facture)
  const rawItems =
    (order as any)?.sale_items ||
    (order as any)?.items ||
    (order as any)?.invoice_items ||
    (order as any)?.facture_items ||
    (order as any)?.purchase_items ||
    (order as any)?.purchaseItems ||
    [];

  const orderItems: any[] = Array.isArray(rawItems) ? rawItems : [];

  // If products are not provided (or IDs mismatch), build a lightweight index by id/sku/name to improve matching
  const productsIndex = new Map<string, any>();
  for (const p of products || []) {
    if (!p) continue;
    if (p.id != null) productsIndex.set(String(p.id), p);
    if (p.sku) productsIndex.set(String(p.sku), p);
    if (p.name) productsIndex.set(String(p.name).toLowerCase(), p);
  }

  const findProduct = (productId: any, sku: any, name: any) => {
    if (productId != null && productsIndex.has(String(productId))) return productsIndex.get(String(productId));
    if (sku != null && productsIndex.has(String(sku))) return productsIndex.get(String(sku));
    if (name && productsIndex.has(String(name).toLowerCase())) return productsIndex.get(String(name).toLowerCase());
    return undefined;
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

  const handleStatusUpdate = async (newStatus: string) => {
    if (onUpdateStatus) {
      setLoading(true);
      try {
        await onUpdateStatus(order.id, newStatus);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleConfirmDelivery = async () => {
    if (onConfirmDelivery) {
      setLoading(true);
      try {
        await onConfirmDelivery(order.id, currentUserStoreId || undefined);
      } finally {
        setLoading(false);
      }
    }
  };

  const canBuyerChangeStatus = userRole === 'buyer' && order.delivery_status === 'in_transit';
  const canSellerChangeStatus = userRole === 'seller' && ['pending', 'preparing'].includes(order.delivery_status);
  const canDeliveryChangeStatus = userRole === 'admin' && order.delivery_status === 'preparing';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Commande {order.sale_number}</h1>
          <p className="text-gray-600">Détails de la commande</p>
        </div>
      </div>

      {/* Order Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Montant Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{order.total_amount?.toFixed(2)} MAD</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Statut Livraison</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={getStatusColor(order.delivery_status)}>
              {getStatusLabel(order.delivery_status)}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Statut Paiement</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={getPaymentStatusColor(order.payment_status)}>
              {order.payment_status === 'paid' ? 'Payé' : order.payment_status === 'partial' ? 'Partiellement payée' : 'Non payé'}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Date</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">{new Date(order.created_at).toLocaleDateString('fr-FR')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Payment Status Details */}
      <Card className="bg-gradient-to-r from-orange-50 to-yellow-50 border-2 border-orange-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-900">
            <AlertCircle className="w-5 h-5" />
            Statut de Paiement
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-4 border border-orange-200">
              <p className="text-xs text-gray-600 font-semibold mb-2">Total</p>
              <p className="text-3xl font-bold text-gray-900">{totalAmount.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">MAD</p>
            </div>

            <div className="bg-white rounded-lg p-4 border border-green-200">
              <p className="text-xs text-gray-600 font-semibold mb-2">Payé</p>
              <p className="text-3xl font-bold text-green-600">{computedPaidAmount.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">MAD</p>
            </div>

            <div className="bg-white rounded-lg p-4 border border-red-200">
              <p className="text-xs text-gray-600 font-semibold mb-2">Reste</p>
              <p className="text-3xl font-bold text-red-600">{computedRemainingAmount.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">MAD</p>
            </div>
          </div>

          {order.payment_status === 'partial' && (
            <div className="bg-white rounded-lg p-3 border border-orange-200 mt-4">
              <p className="text-sm font-semibold text-orange-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                À payer en espèces ou par chèque
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Methods */}
      {order.payment_methods && Array.isArray(order.payment_methods) && order.payment_methods.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Méthodes de Paiement</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {order.payment_methods.map((payment: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex-1">
                    <p className="font-semibold text-sm">
                      {payment.type === 'cash' && '💵 Espèces'}
                      {payment.type === 'check' && `🏦 Chèque ${payment.checkData?.check_id_number || payment.check_id_number || ''}`}
                      {payment.type === 'bank_transfer' && '🏧 Virement Bancaire'}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">{(Number(payment.amount) || 0).toFixed(2)} MAD</p>
                  </div>
                </div>
              ))}
              <div className="border-t pt-3 mt-3">
                <div className="flex justify-between">
                  <span className="font-semibold">Total Payé:</span>
                  <span className="font-bold text-green-600">{paymentMethodsTotalPaid.toFixed(2)} MAD</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Customer Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Informations du Client
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 p-4 rounded border border-gray-200">
            <p className="text-sm whitespace-pre-wrap">{order.notes || 'Aucune information'}</p>
          </div>
        </CardContent>
      </Card>

      {/* Products Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Articles Achetés
          </CardTitle>
        </CardHeader>
        <CardContent>
          {orderItems.length > 0 ? (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produit</TableHead>
                    <TableHead>Caisse</TableHead>
                    <TableHead>Quantité</TableHead>
                    <TableHead>Moyenne</TableHead>
                    <TableHead>Fourchette Min</TableHead>
                    <TableHead>Fourchette Max</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderItems.map((item: any, idx: number) => {
                    const productId =
                      item.product_id ??
                      item.productId ??
                      item.product?.id ??
                      item.product?.product_id ??
                      item.product?.productId;

                    const itemName =
                      item.product_name ??
                      item.productName ??
                      item.name ??
                      item.libelle ??
                      item.designation ??
                      item.product?.name ??
                      item.product?.product_name ??
                      item.product?.productName;

                    const itemSku = item.sku ?? item.SKU ?? item.product?.sku ?? item.product?.SKU;

                    const product = findProduct(productId, itemSku, itemName);

                    const caisse =
                      (item.caisse ?? item.box ?? item.carton ?? item.case ?? item.cases ?? item.unite_par_caisse ?? item.units_per_case) ??
                      (product?.caisse ?? product?.box ?? product?.carton ?? product?.case ?? product?.unite_par_caisse ?? product?.units_per_case);

                    const moyenne =
                      (item.moyenne ?? item.avg ?? item.average) ??
                      (product?.moyenne ?? product?.avg ?? product?.average);

                    const pickNonEmpty = (...vals: any[]) => {
                      for (const v of vals) {
                        if (v === null || v === undefined) continue;
                        if (typeof v === 'string') {
                          const t = v.trim();
                          if (t.length === 0) continue;
                          return t;
                        }
                        return v;
                      }
                      return undefined;
                    };

                    const fourchetteMin = pickNonEmpty(
                      item.fourchette_min,
                      item.fourchetteMin,
                      item.fourchette_minimum,
                      item.fourchetteMinimum,
                      item.min,
                      item.min_value,
                      item.minValue,
                      item.min_price,
                      item.minPrice,
                      product?.fourchette_min,
                      product?.fourchetteMin,
                      product?.fourchette_minimum,
                      product?.fourchetteMinimum,
                      product?.min,
                      product?.min_value,
                      product?.minValue,
                      product?.min_price,
                      product?.minPrice,
                    );

                    const fourchetteMax = pickNonEmpty(
                      item.fourchette_max,
                      item.fourchetteMax,
                      item.fourchette_maximum,
                      item.fourchetteMaximum,
                      item.max,
                      item.max_value,
                      item.maxValue,
                      item.max_price,
                      item.maxPrice,
                      product?.fourchette_max,
                      product?.fourchetteMax,
                      product?.fourchette_maximum,
                      product?.fourchetteMaximum,
                      product?.max,
                      product?.max_value,
                      product?.maxValue,
                      product?.max_price,
                      product?.maxPrice,
                    );

                    const name =
                      product?.name ||
                      itemName ||
                      // sometimes product_id is actually the name
                      (typeof productId === 'string' && productId.length > 0 ? productId : undefined) ||
                      // last resort: show any non-empty string-ish field that could be a name
                      (typeof item.article === 'string' && item.article.length > 0 ? item.article : undefined) ||
                      (typeof item.label === 'string' && item.label.length > 0 ? item.label : undefined) ||
                      '—';

                    const sku = product?.sku || itemSku || (typeof productId === 'string' ? productId : undefined) || 'N/A';

                    const qty = Number(item.quantity ?? item.qty ?? item.amount ?? item.qte ?? item.quantite) || 0;

                    const lineTotalRaw = item.total_price ?? item.totalPrice ?? item.line_total ?? item.lineTotal ?? item.total;
                    const unitPriceRaw = item.unit_price ?? item.unitPrice ?? item.price ?? item.prix;

                    const lineTotal =
                      Number(lineTotalRaw) ||
                      (qty > 0 ? qty * (Number(unitPriceRaw) || 0) : 0);

                    const unitPrice = Number(unitPriceRaw) || (qty > 0 ? lineTotal / qty : 0);

                    return (
                      <TableRow key={item.id ?? `${productId ?? 'item'}-${idx}`}>
                        <TableCell className="font-medium">{name}</TableCell>
                        <TableCell>{caisse ?? '—'}</TableCell>
                        <TableCell>{qty || '—'}</TableCell>
                        <TableCell>{moyenne ?? '—'}</TableCell>
                        <TableCell>{fourchetteMin ?? '—'}</TableCell>
                        <TableCell>{fourchetteMax ?? '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">Aucun article</p>
          )}
        </CardContent>
      </Card>

      {/* Store Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="w-5 h-5" />
            Magasin Vendeur
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-600 font-semibold">Nom du magasin</p>
                <p className="font-medium">{sellerStoreName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 font-semibold">Email</p>
                <p className="font-medium text-sm">{sellerStoreEmail}</p>
                {actorEmail && actorEmail !== sellerStoreEmail && (
                  <p className="text-[11px] text-gray-500 mt-1">Opération par: {actorEmail}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-600 font-semibold">Téléphone</p>
                <p className="font-medium">{sellerStorePhone}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 font-semibold">Adresse</p>
                <p className="font-medium text-sm">{sellerStoreAddress}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {/* Seller can start preparation */}
            {userRole === 'seller' && order.delivery_status === 'pending' && (
              <Button
                onClick={() => handleStatusUpdate('preparing')}
                disabled={loading}
                className="bg-blue-500 hover:bg-blue-600 text-white font-semibold"
              >
                <Package className="w-4 h-4 mr-2" />
                Commencer Préparation
              </Button>
            )}

            {/* Seller can mark as in transit */}
            {userRole === 'seller' && order.delivery_status === 'preparing' && (
              <Button
                onClick={() => handleStatusUpdate('in_transit')}
                disabled={loading}
                className="bg-purple-500 hover:bg-purple-600 text-white font-semibold"
              >
                <Truck className="w-4 h-4 mr-2" />
                Marquer en Transit
              </Button>
            )}

            {/* Delivery person can mark as in transit */}
            {canDeliveryChangeStatus && (
              <Button
                onClick={() => handleStatusUpdate('in_transit')}
                disabled={loading}
                className="bg-purple-500 hover:bg-purple-600 text-white font-semibold"
              >
                <Truck className="w-4 h-4 mr-2" />
                Prendre en Charge
              </Button>
            )}

            {/* Show status message */}
            {order.delivery_status === 'in_transit' && (
              <div className="text-purple-600 font-medium flex items-center gap-2">
                <Truck className="w-4 h-4" />
                Commande en transit - Confirmez la réception dans le tableau
              </div>
            )}

            {order.delivery_status === 'delivered' && (
              <div className="text-orange-600 font-medium flex items-center gap-2">
                <Store className="w-4 h-4" />
                Paquet livré - Confirmez la réception dans le tableau
              </div>
            )}

            {order.delivery_status === 'confirmed' && (
              <div className="text-green-600 font-medium flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Commande confirmée - Stock mis à jour
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
