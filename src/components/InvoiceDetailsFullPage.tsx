import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ArrowLeft, Download } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { projectId } from '../utils/supabase/info';

interface InvoiceDetailsFullPageProps {
  invoice: any;
  session: any;
  onBack: () => void;
}

export function InvoiceDetailsFullPage({ invoice, session, onBack }: InvoiceDetailsFullPageProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all products from database
  useEffect(() => {
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
      } finally {
        setLoading(false);
      }
    };

    if (session?.access_token) {
      fetchProducts();
    }
  }, [session?.access_token]);

  // Helper function to find product details by name or reference
  const getProductDetails = (itemName: string, itemReference?: string) => {
    if (!products.length) return null;
    
    // Try to find by exact name match first
    let product = products.find(p => p.name === itemName);
    
    // If not found, try by reference
    if (!product && itemReference) {
      product = products.find(p => p.reference === itemReference);
    }
    
    // If still not found, try partial name match
    if (!product) {
      product = products.find(p => p.name?.toLowerCase().includes(itemName.toLowerCase()));
    }
    
    return product;
  };

  const handleDownloadInvoicePDF = async () => {
    try {
      setIsDownloading(true);
      const queryParams = new URLSearchParams();
      queryParams.append('type', 'Facture');
      queryParams.append('clientName', invoice.client_name);
      queryParams.append('clientPhone', invoice.client_phone || '');
      queryParams.append('clientAddress', invoice.client_address || '');
      queryParams.append('clientICE', invoice.client_ice || '');
      queryParams.append('date', new Date(invoice.created_at).toISOString().split('T')[0]);

      // Ensure items shape matches what the PDF generator expects (description/unitPrice/subtotal)
      const normalizedItems = (Array.isArray(invoice.items) ? invoice.items : []).map((it: any) => {
        const description = it?.description || it?.name || it?.product_name || '';
        const quantity = Number(it?.quantity ?? it?.qty ?? 0) || 0;

        // For Facture, unit price must come from purchase_price when available
        const unitPrice =
          Number(it?.unitPrice ?? it?.unit_price ?? it?.price ?? it?.purchase_price ?? it?.purchasePrice ?? 0) || 0;

        const subtotal = Number(it?.subtotal ?? it?.total_price ?? it?.total ?? (quantity * unitPrice) ?? 0) || 0;

        return {
          description,
          quantity,
          unitPrice,
          subtotal,
          caisse: it?.caisse ?? '',
          moyenne: it?.moyenne ?? '',
        };
      });

      queryParams.append('items', JSON.stringify(normalizedItems));
      queryParams.append('subtotal', invoice.total_amount.toString());
      queryParams.append('totalWithTVA', invoice.total_amount.toString());
      queryParams.append('paymentHeaderNote', `Statut: ${invoice.status}`);
      queryParams.append('invoiceNumber', String(invoice.invoice_number || ''));

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/documents/${invoice.id}/pdf?${queryParams.toString()}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
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
      link.download = `${invoice.invoice_number}.pdf`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);

      toast.success('PDF téléchargé avec succès');
    } catch (error: any) {
      console.error('Error downloading PDF:', error);
      toast.error('Erreur lors du téléchargement du PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-8">
        <Button 
          variant="outline" 
          onClick={onBack}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Détails de la Facture</h1>
            <p className="text-gray-600 mt-2">Facture #{invoice.invoice_number}</p>
          </div>
          <Button
            onClick={handleDownloadInvoicePDF}
            disabled={isDownloading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Download className="w-4 h-4 mr-2" />
            {isDownloading ? 'Téléchargement...' : 'Télécharger PDF'}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Invoice Header Card */}
          <Card>
            <CardHeader>
              <CardTitle>Informations de la Facture</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-600">N° Facture</p>
                  <p className="text-lg font-mono font-semibold text-gray-900 mt-1">
                    {invoice.invoice_number}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Date</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {new Date(invoice.created_at).toLocaleDateString('fr-FR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Client Information Card */}
          <Card>
            <CardHeader>
              <CardTitle>Informations du Client</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm font-medium text-gray-600">Nom du Client</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {invoice.client_name}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">ICE</p>
                  <p className="text-lg font-mono font-semibold text-gray-900 mt-1">
                    {invoice.client_ice || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Téléphone</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {invoice.client_phone || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Adresse</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {invoice.client_address || '-'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items Card */}
          {invoice.items && invoice.items.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Articles</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-gray-300 bg-gray-50">
                        <th className="px-3 py-3 text-left font-semibold text-gray-900">N°</th>
                        <th className="px-3 py-3 text-left font-semibold text-gray-900">Référence</th>
                        <th className="px-3 py-3 text-left font-semibold text-gray-900">Nom du Produit</th>
                        <th className="px-3 py-3 text-left font-semibold text-gray-900">Catégorie</th>
                        <th className="px-3 py-3 text-left font-semibold text-gray-900">Lot</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900">Quantité</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900">Caisse</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900">Moyenne</th>
                                                <th className="px-3 py-3 text-right font-semibold text-gray-900">Prix Unitaire</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900">Fourchette Min</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900">Fourchette Max</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900">Sous-total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {invoice.items.map((item: any, idx: number) => {
                        // Extract all available fields from the item object
                        const itemNumber = idx + 1;
                        const productName = item.description || item.name || item.product_name || '-';
                        const itemReference = item.reference || item.ref || '';
                        
                        // Fetch product details from database
                        const productDetails = getProductDetails(productName, itemReference);
                        
                        // Use product details if available, otherwise fall back to item data
                        const reference = productDetails?.reference || item.reference || item.ref || '-';
                        const category = productDetails?.category || item.product_category || item.category || item.cat || '-';
                        // Prefer lot from the product table (invoices often don't store it)
                        const lot =
                          productDetails?.lot ||
                          (item.lot && String(item.lot).trim() !== '' ? item.lot : null) ||
                          '-';

                        const quantity = Number(item.quantity || item.qty || 0) || 0;

                        // These fields are usually NOT stored on invoice items, so default to product table
                        const caisseRaw =
                          item.caisse ??
                          item.box ??
                          item.boxes ??
                          productDetails?.number_of_boxes ??
                          productDetails?.boxes ??
                          '-';

                        const caisseNum = Number(caisseRaw);
                        const caisse = Number.isFinite(caisseNum) && caisseNum > 0 ? caisseNum : caisseRaw;

                        // Compute moyenne if missing: moyenne = quantity / caisse
                        const moyenneFromItem = item.moyenne ?? item.average;
                        const moyenneComputed =
                          Number.isFinite(caisseNum) && caisseNum > 0 && quantity > 0
                            ? (quantity / caisseNum)
                            : null;

                        const moyenne =
                          (moyenneFromItem !== null && moyenneFromItem !== undefined && String(moyenneFromItem).trim() !== '')
                            ? moyenneFromItem
                            : (moyenneComputed !== null
                                ? moyenneComputed.toFixed(2)
                                : '-');
                        // For Facture we use purchase_price as unit price (fallback to item fields)
                        const unitPrice =
                          Number(
                            item.purchase_price ??
                            item.purchasePrice ??
                            item.unitPrice ??
                            item.unit_price ??
                            item.price ??
                            productDetails?.purchase_price ??
                            0
                          ) || 0;

                        const fourchettMin = (item.fourchette_min !== null && item.fourchette_min !== undefined && item.fourchette_min !== '') ? item.fourchette_min : (productDetails?.fourchette_min || '-');
                        const fourchettMax = (item.fourchette_max !== null && item.fourchette_max !== undefined && item.fourchette_max !== '') ? item.fourchette_max : (productDetails?.fourchette_max || '-');

                        const subtotal = Number(item.subtotal ?? item.total_price ?? item.total ?? (quantity * unitPrice) ?? 0) || 0;

                        return (
                          <tr key={idx} className="hover:bg-gray-50 transition-colors">
                            <td className="px-3 py-3 text-gray-900 font-semibold">{itemNumber}</td>
                            <td className="px-3 py-3 text-gray-900 font-mono text-xs">{reference}</td>
                            <td className="px-3 py-3 text-gray-900">{productName}</td>
                            <td className="px-3 py-3 text-gray-900">{category}</td>
                            <td className="px-3 py-3 text-gray-900">{lot}</td>
                            <td className="px-3 py-3 text-right text-gray-900">{quantity}</td>
                            <td className="px-3 py-3 text-right text-gray-900">{caisse}</td>
                            <td className="px-3 py-3 text-right text-gray-900">{moyenne}</td>
                                                        <td className="px-3 py-3 text-right text-gray-900 font-semibold">
                              {unitPrice.toFixed(2)} MAD
                            </td>
                            <td className="px-3 py-3 text-right text-gray-900">
                              {typeof fourchettMin === 'number' ? fourchettMin.toFixed(2) : fourchettMin}
                            </td>
                            <td className="px-3 py-3 text-right text-gray-900">
                              {typeof fourchettMax === 'number' ? fourchettMax.toFixed(2) : fourchettMax}
                            </td>
                            <td className="px-3 py-3 text-right font-bold text-blue-600">
                              {subtotal.toFixed(2)} MAD
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Summary */}
        <div className="space-y-6">
          {/* Financial Summary Card */}
          <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200">
            <CardHeader>
              <CardTitle className="text-blue-900">Résumé Financier</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center pb-3 border-b border-blue-200">
                  <span className="text-gray-700">Montant Total:</span>
                  <span className="text-xl font-bold text-blue-600">
                    {invoice.total_amount?.toFixed(2)} MAD
                  </span>
                </div>
                <div className="flex justify-between items-center pb-3 border-b border-blue-200">
                  <span className="text-gray-700">Montant Payé:</span>
                  <span className="text-xl font-bold text-green-600">
                    {invoice.amount_paid?.toFixed(2)} MAD
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <span className="text-gray-700 font-medium">Solde Restant:</span>
                  <span className="text-2xl font-bold text-orange-600">
                    {invoice.remaining_balance?.toFixed(2)} MAD
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Status Card */}
          <Card>
            <CardHeader>
              <CardTitle>Statut</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-2">État de la Facture</p>
                <Badge className="text-base py-2 px-3">
                  {invoice.status === 'paid' ? '✓ Payée' :
                   invoice.status === 'partial' ? '⚠ Partielle' :
                   '⏳ En attente'}
                </Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 mb-2">Méthode de Paiement</p>
                <p className="text-gray-900 font-medium">
                  {invoice.payment_method === 'cash' ? 'Espèces' :
                   invoice.payment_method === 'check' ? 'Chèque' :
                   invoice.payment_method === 'bank_transfer' ? 'Virement Bancaire' :
                   invoice.payment_method || '-'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Additional Information */}
          {invoice.payment_notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-900 text-sm leading-relaxed">
                  {invoice.payment_notes}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
