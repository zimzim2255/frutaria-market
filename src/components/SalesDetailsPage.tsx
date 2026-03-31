import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { ArrowLeft, Package, Truck, CheckCircle, XCircle } from 'lucide-react';
import { Label } from './ui/label';
import { projectId } from '../utils/supabase/info';

interface SalesDetailsPageProps {
  sale: any;
  accessToken?: string;
  onBack: () => void;
  onUpdateStatus?: (saleId: string, newStatus: string) => Promise<void>;
}

export function SalesDetailsPage({
  sale,
  accessToken,
  onBack,
  onUpdateStatus,
}: SalesDetailsPageProps) {
  const [loading, setLoading] = useState(false);
  const [storeName, setStoreName] = useState<string>('');
  const [creatorEmail, setCreatorEmail] = useState<string>('');

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

  const getDeliveryStatusColor = (status: string) => {
    switch (status) {
      case 'preparing':
        return 'bg-yellow-100 text-yellow-800';
      case 'in_transit':
        return 'bg-blue-100 text-blue-800';
      case 'delivered':
        return 'bg-green-100 text-green-800';
      case 'canceled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleStatusUpdate = async (newStatus: string) => {
    if (onUpdateStatus) {
      setLoading(true);
      try {
        await onUpdateStatus(sale.id, newStatus);
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    // Resolve store name and creator email without relying on joined fields.
    // This keeps the page working even when /sales GET returns `select('*')` only.
    const token = accessToken; // explicit token passed from parent

    const resolveStoreName = async () => {
      const storeId = sale?.store_id || sale?.created_for_store_id;
      if (!storeId) {
        setStoreName('');
        return;
      }

      try {
        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/stores`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (!res.ok) return;
        const payload = await res.json();
        const found = (payload?.stores || []).find((s: any) => String(s.id) === String(storeId));
        setStoreName(found?.name || '');
      } catch {
        // ignore
      }
    };

    const resolveCreatorEmail = async () => {
      const createdBy = sale?.created_by;
      if (!createdBy) {
        setCreatorEmail('');
        return;
      }

      try {
        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/super-handler/users`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (!res.ok) return;
        const payload = await res.json();
        const user = (payload?.users || []).find((u: any) => String(u.id) === String(createdBy));
        setCreatorEmail(user?.email || '');
      } catch {
        // ignore
      }
    };

    resolveStoreName();
    resolveCreatorEmail();
  }, [sale?.store_id, sale?.created_for_store_id, sale?.created_by]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Vente {String(sale.sale_number || '')
              .replace(/^PURCHASE-/, 'ACHAT-')
              .replace(/^TRANSFER-/, 'TRANSFERT-')}
          </h1>
          <p className="text-gray-600">Détails de la vente</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">Montant Total</CardTitle>
          </CardHeader>
          <CardContent>
          <p className="text-2xl font-bold text-blue-600">{sale.total_amount?.toFixed(2)} MAD</p>
          {Number(sale.other_charges || 0) > 0 && (
          <p className="text-xs text-gray-500 mt-1">
          Autres charges: {Number(sale.other_charges || 0).toFixed(2)} MAD
          </p>
          )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Statut Paiement</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={getPaymentStatusColor(sale.payment_status)}>
              {sale.payment_status === 'paid' ? 'Payé' : sale.payment_status === 'partial' ? 'Partiellement payée' : 'Non payé'}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Statut Livraison</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={getDeliveryStatusColor(sale.delivery_status)}>
              {sale.delivery_status}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Information Section */}
      <Card>
        <CardHeader>
          <CardTitle>Informations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {Number(sale.other_charges || 0) > 0 && (
              <div className="bg-gray-50 p-3 rounded border">
                <Label className="text-xs font-semibold text-gray-600 uppercase">Autres charges</Label>
                <p className="font-medium text-gray-900 mt-1">{Number(sale.other_charges || 0).toFixed(2)} MAD</p>
              </div>
            )}
            <div className="bg-gray-50 p-3 rounded border">
              <Label className="text-xs font-semibold text-gray-600 uppercase">Boutique</Label>
              <p className="font-medium text-gray-900 mt-1">{storeName || sale.stores?.name || '-'}</p>
            </div>
            <div className="bg-gray-50 p-3 rounded border">
              <Label className="text-xs font-semibold text-gray-600 uppercase">Date</Label>
              <p className="font-medium text-gray-900 mt-1">{(sale as any).execution_date ? new Date((sale as any).execution_date).toLocaleDateString('fr-FR') : new Date(sale.created_at).toLocaleDateString('fr-FR')}</p>
            </div>
            <div className="bg-gray-50 p-3 rounded border">
              <Label className="text-xs font-semibold text-gray-600 uppercase">Méthode de paiement</Label>
              <p className="font-medium text-gray-900 mt-1">
                {(() => {
                  const pm = String(sale?.payment_method || '').toLowerCase();
                  if (pm === 'cash') return '💵 Espèces';
                  if (pm === 'check') return '🏦 Chèque';
                  if (pm === 'bank_transfer') return '🏧 Virement';
                  if (pm === 'card') return '💳 Carte';

                  if (sale.payment_methods && Array.isArray(sale.payment_methods) && sale.payment_methods.length > 0) {
                    return sale.payment_methods
                      .map((m: any) => {
                        const t = String(m?.type || '').toLowerCase();
                        if (t === 'cash') return '💵 Espèces';
                        if (t === 'check') return '🏦 Chèque';
                        if (t === 'bank_transfer') return '🏧 Virement';
                        if (t === 'card') return '💳 Carte';
                        return m?.type || '-';
                      })
                      .join(', ');
                  }

                  const notes = String(sale?.notes || '');
                  if (notes.includes('Payment: check')) return '🏦 Chèque';
                  if (notes.includes('Payment: cash')) return '💵 Espèces';
                  if (notes.includes('Payment: card')) return '💳 Carte';

                  return '❓ Non spécifié';
                })()}
              </p>
            </div>
            <div className="bg-gray-50 p-3 rounded border">
              <Label className="text-xs font-semibold text-gray-600 uppercase">Numéro de vente</Label>
              <p className="font-medium text-gray-900 mt-1">
                {String(sale.sale_number || '')
                  .replace(/^PURCHASE-/, 'ACHAT-')
                  .replace(/^TRANSFER-/, 'TRANSFERT-')}
              </p>
            </div>
            <div className="bg-gray-50 p-3 rounded border">
              <Label className="text-xs font-semibold text-gray-600 uppercase">Créé par</Label>
              <p className="font-medium text-gray-900 mt-1">
                {creatorEmail || sale.creator_email || sale.created_by_user?.email || sale.created_by || 'Non spécifié'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Articles Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            articles ventes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            // Check multiple possible locations for sale items
            // Priority: sale_items table first, then items JSONB column
            let itemsArray = [];
            
            console.log('DEBUG: Raw sale object:', JSON.stringify(sale, null, 2));
            console.log('DEBUG: sale.sale_items type:', typeof sale.sale_items, 'value:', sale.sale_items);
            console.log('DEBUG: sale.items type:', typeof sale.items, 'value:', sale.items);
            
            // Try sale_items table first (normalized structure)
            if (sale.sale_items && Array.isArray(sale.sale_items) && sale.sale_items.length > 0) {
              itemsArray = sale.sale_items;
              console.log('DEBUG: ✓ Using sale_items from table:', itemsArray);
            } 
            // Fall back to items JSONB column - check if it's an array
            else if (sale.items) {
              console.log('DEBUG: sale.items exists, checking format...');
              console.log('DEBUG: sale.items is array?', Array.isArray(sale.items));
              console.log('DEBUG: sale.items length:', sale.items?.length);
              
              if (Array.isArray(sale.items) && sale.items.length > 0) {
                itemsArray = sale.items;
                console.log('DEBUG: ✓ Using items from JSONB (array):', itemsArray);
              }
              // Try parsing items if it's a string
              else if (typeof sale.items === 'string' && sale.items.length > 0) {
                try {
                  const parsed = JSON.parse(sale.items);
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    itemsArray = parsed;
                    console.log('DEBUG: ✓ Parsed items from JSON string:', itemsArray);
                  }
                } catch (e) {
                  console.warn('DEBUG: Could not parse items JSON string:', e);
                }
              }
              // If items is an object with array-like properties
              else if (typeof sale.items === 'object' && !Array.isArray(sale.items)) {
                console.log('DEBUG: sale.items is object, converting to array...');
                const converted = Object.values(sale.items);
                if (converted.length > 0) {
                  itemsArray = converted;
                  console.log('DEBUG: ✓ Converted items object to array:', itemsArray);
                }
              }
            }
            
            console.log('DEBUG: Final Sale items check:', {
              sale_items: sale.sale_items,
              items: sale.items,
              itemsArray: itemsArray,
              length: itemsArray.length,
              isArray: Array.isArray(itemsArray)
            });
            
            return itemsArray && itemsArray.length > 0 ? (
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N°</TableHead>
                      <TableHead>Référence</TableHead>
                      <TableHead>Nom du Produit</TableHead>
                      <TableHead>Catégorie</TableHead>
                      <TableHead>Lot</TableHead>
                      <TableHead>Quantité</TableHead>
                      <TableHead>Caisse</TableHead>
                      <TableHead>Moyenne</TableHead>
                      <TableHead>Prix Unitaire</TableHead>
                      <TableHead>Fourchette Min</TableHead>
                      <TableHead>Fourchette Max</TableHead>
                      <TableHead>Sous-total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemsArray.map((item: any, index: number) => {
                      // Log ALL fields in the item to see what we have
                      console.log(`DEBUG Item ${index} - ALL FIELDS:`, Object.keys(item));
                      console.log(`DEBUG Item ${index} - FULL DATA:`, item);
                      
                      // Handle multiple possible field names for the same data
                      const caisse = item.caisse !== undefined ? item.caisse : (item.number_of_boxes || item.quantity || 0);
                      const moyenne = item.moyenne !== undefined ? item.moyenne : (item.avg_net_weight_per_box || item.average_weight || '-');
                      const unitPrice = item.unitPrice || item.unit_price || item.sale_price || item.price || 0;
                      const subtotal = item.subtotal || item.total_price || (item.quantity * unitPrice) || 0;
                      
                      console.log(`DEBUG Item ${index} - MAPPED VALUES:`, {
                        caisse,
                        moyenne,
                        unitPrice,
                        subtotal,
                        allItemKeys: Object.keys(item)
                      });
                      
                      return (
                        <TableRow key={item.id || index}>
                          <TableCell className="text-sm">{index + 1}</TableCell>
                          <TableCell className="text-sm">{item.reference || '-'}</TableCell>
                          <TableCell className="font-medium text-sm">{item.name || 'Produit inconnu'}</TableCell>
                          <TableCell className="text-sm">{item.category || '-'}</TableCell>
                          <TableCell className="text-sm">{item.lot || '-'}</TableCell>
                          <TableCell className="text-sm">{item.quantity || 0}</TableCell>
                          <TableCell className="text-sm">{caisse}</TableCell>
                          <TableCell className="text-sm">
                            {moyenne && moyenne !== '-' && moyenne !== '0.00' && moyenne !== 0
                              ? parseFloat(String(moyenne)).toFixed(2) 
                              : moyenne === '0.00' || moyenne === 0 
                                ? '0.00'
                                : '-'}
                          </TableCell>
                          <TableCell className="text-sm">{(parseFloat(String(unitPrice)) || 0).toFixed(2)} MAD</TableCell>
                          <TableCell className="text-sm">{item.fourchette_min ? parseFloat(String(item.fourchette_min)).toFixed(2) : '-'}</TableCell>
                          <TableCell className="text-sm">{item.fourchette_max ? parseFloat(String(item.fourchette_max)).toFixed(2) : '-'}</TableCell>
                          <TableCell className="font-semibold text-sm">{(parseFloat(String(subtotal)) || 0).toFixed(2)} MAD</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-2">Aucun article</p>
                <p className="text-xs text-gray-400">Les articles de cette vente n'ont pas pu être chargés</p>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Notes Section */}
      {sale.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Informations Supplémentaires</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {(() => {
                const notes = sale.notes;
                const parts = notes.split(', ');
                const info: { [key: string]: string } = {};
                
                parts.forEach((part: string) => {
                  const [key, value] = part.split(': ');
                  if (key && value) {
                    info[key.trim()] = value.trim();
                  }
                });

                const filteredInfo = Object.entries(info).filter(([key, value]) => {
                  if (key === 'Customer' && value === 'Unknown') return false;
                  if (key === 'Phone' && value === 'N/A') return false;
                  if (key === 'Payment') return false;
                  return true;
                });

                return filteredInfo.length > 0 ? (
                  filteredInfo.map(([key, value]) => (
                    <div key={key} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <Label className="text-xs font-semibold text-amber-700 uppercase">{key}</Label>
                      <p className="font-medium text-gray-900 mt-1">{value}</p>
                    </div>
                  ))
                ) : null;
              })()}
            </div>
          </CardContent>
        </Card>
      )}

          </div>
  );
}
