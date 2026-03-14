import { useEffect, useMemo, useState } from 'react';
import { projectId } from '../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { ArrowLeft, Package, TrendingDown, ShoppingCart, Minus, Plus } from 'lucide-react';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { toast } from 'sonner';

interface ProductDetailsPageProps {
  product: any;
  suppliers: any[];
  stores: any[];
  onBack: () => void;
  onBuy?: (product: any, quantity: number) => void;
  session?: any;
}

export function ProductDetailsPage({
  product,
  suppliers,
  stores,
  onBack,
  onBuy,
  session,
}: ProductDetailsPageProps) {
  const [quantity, setQuantity] = useState(1);
  const [creatorEmail, setCreatorEmail] = useState<string | null>(null);

  const creatorUserId = useMemo(() => {
    const v = (product as any)?.created_by;
    return v ? String(v) : null;
  }, [product]);

  useEffect(() => {
    // Prefer backend-provided field if present
    const embedded = (product as any)?.created_by_email || (product as any)?.creator_email || (product as any)?.created_by_user?.email;
    if (embedded) {
      setCreatorEmail(String(embedded));
      return;
    }

    if (!creatorUserId || !session?.access_token) {
      setCreatorEmail(null);
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/users`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        if (!res.ok) {
          setCreatorEmail(null);
          return;
        }

        const data = await res.json();
        const users = data?.users || [];
        const userRow = users.find((u: any) => String(u?.id) === String(creatorUserId));
        const email = userRow?.email || userRow?.user_email || userRow?.username || null;
        setCreatorEmail(email ? String(email) : null);
      } catch {
        setCreatorEmail(null);
      }
    })();
  }, [creatorUserId, session?.access_token, product]);

  const getSupplierName = (supplierId: string | null) => {
    if (!supplierId) return 'Non spécifié';
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier?.name || supplierId;
  };

  const getSupplierDetails = (supplierId: string | null) => {
    if (!supplierId) return null;
    return suppliers.find(s => s.id === supplierId);
  };

  const supplierDetails = getSupplierDetails(product.supplier_id);

  const handleAddToBuy = () => {
    if (quantity > product.quantity_available) {
      toast.error('Quantité insuffisante en stock');
      return;
    }
    if (onBuy) {
      onBuy(product, quantity);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{product.name}</h1>
          <p className="text-gray-600">Référence: {product.reference}</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Prix de Vente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{product.sale_price?.toFixed(2)} MAD</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Prix d'Achat</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{product.purchase_price?.toFixed(2)} MAD</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Stock Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold text-purple-600">{product.quantity_available}</p>
              {product.quantity_available < 10 && (
                <TrendingDown className="w-5 h-5 text-red-500" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Catégorie</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className="bg-blue-100 text-blue-800">{product.category || 'Non spécifié'}</Badge>
          </CardContent>
        </Card>
      </div>

      {/* Main Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Product Details */}
        <Card>
          <CardHeader>
            <CardTitle>Informations du Produit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs font-semibold text-gray-600 uppercase">Référence</Label>
              <p className="font-medium text-gray-900 mt-1">{product.reference}</p>
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-600 uppercase">Nom</Label>
              <p className="font-medium text-gray-900 mt-1">{product.name}</p>
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-600 uppercase">Créé par (Email)</Label>
              <p className="font-medium text-gray-900 mt-1">{creatorEmail || 'Non spécifié'}</p>
              {creatorUserId && (
                <p className="text-xs text-gray-500 mt-1 break-all">ID: {creatorUserId}</p>
              )}
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-600 uppercase">Lot</Label>
              <p className="font-medium text-gray-900 mt-1">{product.lot || 'Non spécifié'}</p>
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-600 uppercase">Catégorie</Label>
              <p className="font-medium text-gray-900 mt-1">{product.category || 'Non spécifié'}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold text-gray-600 uppercase">Prix d'Achat</Label>
                <p className="font-medium text-gray-900 mt-1">{product.purchase_price?.toFixed(2)} MAD</p>
              </div>
              <div>
                <Label className="text-xs font-semibold text-gray-600 uppercase">Prix de Vente</Label>
                <p className="font-medium text-gray-900 mt-1">{product.sale_price?.toFixed(2)} MAD</p>
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-600 uppercase">Marge Bénéficiaire</Label>
              <p className="font-medium text-green-600 mt-1">
                {((product.sale_price - product.purchase_price) / product.purchase_price * 100).toFixed(2)}%
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Right Column - Supplier & Dimensions */}
        <Card>
          <CardHeader>
            <CardTitle>Fournisseur & Dimensions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs font-semibold text-gray-600 uppercase">Fournisseur</Label>
              <p className="font-medium text-gray-900 mt-1">{getSupplierName(product.supplier_id)}</p>
              {supplierDetails && (
                <div className="mt-2 p-2 bg-gray-50 rounded text-sm space-y-1">
                  <p className="text-gray-600"><span className="font-semibold">Email:</span> {supplierDetails.email}</p>
                  <p className="text-gray-600"><span className="font-semibold">Téléphone:</span> {supplierDetails.phone}</p>
                  <p className="text-gray-600"><span className="font-semibold">Adresse:</span> {supplierDetails.address}</p>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold text-gray-600 uppercase">Nombre de Caisses</Label>
                <p className="font-medium text-gray-900 mt-1">{product.number_of_boxes || 0}</p>
              </div>
              <div>
                <Label className="text-xs font-semibold text-gray-600 uppercase">Poids Total (kg)</Label>
                <p className="font-medium text-gray-900 mt-1">{product.total_net_weight?.toFixed(2) || 0}</p>
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-600 uppercase">Poids Moyen/Caisse (kg)</Label>
              <p className="font-medium text-gray-900 mt-1">{product.avg_net_weight_per_box?.toFixed(2) || 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stock by Store */}
      {stores && stores.length > 0 && product.store_stocks && (
        <Card>
          <CardHeader>
            <CardTitle>Stock par Magasin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Magasin</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                    <TableHead className="text-right">Pourcentage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stores.map((store) => {
                    const storeStock = product.store_stocks[store.id] || 0;
                    const percentage = product.quantity_available > 0 
                      ? ((storeStock / product.quantity_available) * 100).toFixed(1)
                      : 0;
                    return (
                      <TableRow key={store.id}>
                        <TableCell className="font-medium">{store.name}</TableCell>
                        <TableCell className="text-right">
                          <Badge className="bg-blue-100 text-blue-800">{storeStock}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{percentage}%</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-gray-50 font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">
                      <Badge className="bg-green-100 text-green-800">{product.quantity_available}</Badge>
                    </TableCell>
                    <TableCell className="text-right">100%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Enterprise Information */}
      <Card>
        <CardHeader>
          <CardTitle>Informations Entreprise</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Palette/Catégorie */}
          <div>
            <Label className="text-xs font-semibold text-gray-600 uppercase">Palette/Catégorie</Label>
            <p className="font-medium text-gray-900 mt-2">{product.category || 'Non spécifié'}</p>
          </div>

          {/* Frais Section - 2 columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label className="text-xs font-semibold text-gray-600 uppercase">Frais Maritime (MAD)</Label>
              <p className="font-medium text-gray-900 mt-2">0</p>
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-600 uppercase">Frais Transit (MAD)</Label>
              <p className="font-medium text-gray-900 mt-2">0</p>
            </div>
          </div>

          {/* ONSSA and Frais Divers - 2 columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label className="text-xs font-semibold text-gray-600 uppercase">ONSSA (MAD)</Label>
              <p className="font-medium text-gray-900 mt-2">0</p>
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-600 uppercase">Frais Divers (MAD)</Label>
              <p className="font-medium text-gray-900 mt-2">0</p>
            </div>
          </div>

          {/* Frais Transport and Date Déchargement - 2 columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label className="text-xs font-semibold text-gray-600 uppercase">Frais Transport (MAD)</Label>
              <p className="font-medium text-gray-900 mt-2">0</p>
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-600 uppercase">Date Déchargement</Label>
              <p className="font-medium text-gray-900 mt-2">-</p>
            </div>
          </div>

          {/* Entrepôt */}
          <div>
            <Label className="text-xs font-semibold text-gray-600 uppercase">Entrepôt</Label>
            <p className="font-medium text-gray-900 mt-2">-</p>
          </div>

          {/* Date Chargement and Matricule - 2 columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label className="text-xs font-semibold text-gray-600 uppercase">Date Chargement</Label>
              <p className="font-medium text-gray-900 mt-2">-</p>
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-600 uppercase">Matricule</Label>
              <p className="font-medium text-gray-900 mt-2">-</p>
            </div>
          </div>

          {/* Magasinage and Taxe - 2 columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label className="text-xs font-semibold text-gray-600 uppercase">Magasinage (MAD)</Label>
              <p className="font-medium text-gray-900 mt-2">0</p>
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-600 uppercase">Taxe (MAD)</Label>
              <p className="font-medium text-gray-900 mt-2">0</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Van Delivery Attachment */}
      <Card className="border-2 border-red-300 bg-red-50">
        <CardHeader>
          <CardTitle className="text-red-800">🚚 Pièce Jointe Livraison Van</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {product.van_delivery_attachment_url ? (
            <>
              <div>
                <Label className="text-xs font-semibold text-red-700 uppercase">Type de Fichier</Label>
                <p className="font-medium text-gray-900 mt-2">
                  {product.van_delivery_attachment_type === 'image' ? '📷 Image' : '📄 PDF'}
                </p>
              </div>
              <div>
                <Label className="text-xs font-semibold text-red-700 uppercase">Aperçu</Label>
                <div className="mt-2 p-3 bg-white rounded-lg border border-red-200">
                  {product.van_delivery_attachment_type === 'image' ? (
                    <img 
                      src={product.van_delivery_attachment_url} 
                      alt="Van Delivery" 
                      className="max-w-full h-auto rounded-lg max-h-64 object-cover"
                    />
                  ) : (
                    <a 
                      href={product.van_delivery_attachment_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-2"
                    >
                      📄 Voir le PDF
                    </a>
                  )}
                </div>
              </div>
              {product.van_delivery_notes && (
                <div>
                  <Label className="text-xs font-semibold text-red-700 uppercase">Notes</Label>
                  <p className="font-medium text-gray-900 mt-2">{product.van_delivery_notes}</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-6">
              <p className="text-red-700 font-semibold">Aucune pièce jointe de livraison van</p>
              <p className="text-sm text-red-600 mt-1">Aucun fichier n'a été ajouté pour ce produit</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
