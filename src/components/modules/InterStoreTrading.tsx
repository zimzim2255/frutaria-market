import { useState, useEffect } from 'react';
import { projectId } from '../../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Plus, Eye, Search, ArrowLeftRight, Package } from 'lucide-react';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';

interface InterStoreTradingProps {
  session: any;
}

export function InterStoreTrading({ session }: InterStoreTradingProps) {
  const [trades, setTrades] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<any>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    from_store_id: '',
    to_store_id: '',
    product_id: '',
    quantity: '',
    notes: '',
  });

  const fetchTrades = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/trades`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setTrades(data.trades || []);
      }
    } catch (error) {
      console.error('Error fetching trades:', error);
      toast.error('Erreur lors du chargement des échanges');
    }
  };

  const fetchStores = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/stores`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setStores(data.stores || []);
      }
    } catch (error) {
      console.error('Error fetching stores:', error);
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrades();
    fetchStores();
    fetchProducts();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/trades`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            from_store_id: formData.from_store_id,
            to_store_id: formData.to_store_id,
            product_id: formData.product_id,
            quantity: parseInt(formData.quantity),
            notes: formData.notes,
          }),
        }
      );

      if (response.ok) {
        toast.success('Échange enregistré');
        setDialogOpen(false);
        resetForm();
        fetchTrades();
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

  const updateTradeStatus = async (tradeId: string, newStatus: string) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/trades/${tradeId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (response.ok) {
        toast.success(`Statut mis à jour: ${newStatus}`);
        fetchTrades();
        if (selectedTrade?.id === tradeId) {
          setSelectedTrade({ ...selectedTrade, status: newStatus });
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const resetForm = () => {
    setFormData({
      from_store_id: '',
      to_store_id: '',
      product_id: '',
      quantity: '',
      notes: '',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredTrades = trades.filter(trade =>
    trade.trade_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    trade.from_store?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    trade.to_store?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalTrades = filteredTrades.length;
  const completedTrades = filteredTrades.filter(t => t.status === 'completed').length;
  const pendingTrades = filteredTrades.filter(t => t.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Trading Overview Cards - Navbar Style */}
      <div className="flex flex-wrap w-full bg-white p-1 h-auto gap-1 border-b border-gray-200 rounded-lg">
        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-blue-50 border-b-2 border-blue-500 text-blue-600 flex-1 min-w-max">
          <ArrowLeftRight className="w-5 h-5" />
          <span className="text-xs font-medium">Total Échanges</span>
          <span className="text-lg font-bold">{totalTrades}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-green-50 border-b-2 border-green-500 text-green-600 flex-1 min-w-max">
          <Package className="w-5 h-5" />
          <span className="text-xs font-medium">Complétés</span>
          <span className="text-lg font-bold">{completedTrades}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-yellow-50 border-b-2 border-yellow-500 text-yellow-600 flex-1 min-w-max">
          <ArrowLeftRight className="w-5 h-5" />
          <span className="text-xs font-medium">En Attente</span>
          <span className="text-lg font-bold">{pendingTrades}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-purple-50 border-b-2 border-purple-500 text-purple-600 flex-1 min-w-max">
          <ArrowLeftRight className="w-5 h-5" />
          <span className="text-xs font-medium">Taux Complétion</span>
          <span className="text-lg font-bold">{totalTrades > 0 ? ((completedTrades / totalTrades) * 100).toFixed(0) : 0}%</span>
        </div>
      </div>

      {/* Main Trading Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5" />
              Échanges Inter-Magasins
            </CardTitle>
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Nouvel Échange
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Enregistrer un échange inter-magasins</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="from_store_id">Magasin Expéditeur *</Label>
                      <select
                        id="from_store_id"
                        value={formData.from_store_id}
                        onChange={(e) => setFormData({ ...formData, from_store_id: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md"
                        required
                      >
                        <option value="">Sélectionner un magasin</option>
                        {stores.map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="to_store_id">Magasin Destinataire *</Label>
                      <select
                        id="to_store_id"
                        value={formData.to_store_id}
                        onChange={(e) => setFormData({ ...formData, to_store_id: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md"
                        required
                      >
                        <option value="">Sélectionner un magasin</option>
                        {stores.map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="product_id">Produit *</Label>
                      <select
                        id="product_id"
                        value={formData.product_id}
                        onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md"
                        required
                      >
                        <option value="">Sélectionner un produit</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="quantity">Quantité *</Label>
                      <Input
                        id="quantity"
                        type="number"
                        min="1"
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Input
                        id="notes"
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Raison de l'échange, détails..."
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Annuler
                    </Button>
                    <Button type="submit" disabled={loading}>
                      {loading ? 'Enregistrement...' : 'Enregistrer l\'Échange'}
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
                placeholder="Rechercher un échange..."
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
                      <TableHead>N° Échange</TableHead>
                      <TableHead>De</TableHead>
                      <TableHead>Vers</TableHead>
                      <TableHead>Produit</TableHead>
                      <TableHead>Quantité</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTrades.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-gray-500 py-8">
                          Aucun échange trouvé
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredTrades.map((trade) => (
                        <TableRow key={trade.id}>
                          <TableCell className="font-medium">{trade.trade_number}</TableCell>
                          <TableCell>{trade.from_store?.name || '-'}</TableCell>
                          <TableCell>{trade.to_store?.name || '-'}</TableCell>
                          <TableCell>{trade.products?.name || '-'}</TableCell>
                          <TableCell>{trade.quantity}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded text-sm ${getStatusColor(trade.status)}`}>
                              {trade.status}
                            </span>
                          </TableCell>
                          <TableCell>{new Date(trade.created_at).toLocaleDateString('fr-FR')}</TableCell>
                          <TableCell className="text-right">
                            <Dialog open={detailsOpen && selectedTrade?.id === trade.id} onOpenChange={setDetailsOpen}>
                              <DialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setSelectedTrade(trade)}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Détails de l'échange {selectedTrade?.trade_number}</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <Label className="text-sm font-semibold">Magasin Expéditeur</Label>
                                      <p>{selectedTrade?.from_store?.name}</p>
                                    </div>
                                    <div>
                                      <Label className="text-sm font-semibold">Magasin Destinataire</Label>
                                      <p>{selectedTrade?.to_store?.name}</p>
                                    </div>
                                    <div>
                                      <Label className="text-sm font-semibold">Produit</Label>
                                      <p>{selectedTrade?.products?.name}</p>
                                    </div>
                                    <div>
                                      <Label className="text-sm font-semibold">Quantité</Label>
                                      <p>{selectedTrade?.quantity}</p>
                                    </div>
                                    <div>
                                      <Label className="text-sm font-semibold">Statut</Label>
                                      <p className={`px-2 py-1 rounded text-sm w-fit ${getStatusColor(selectedTrade?.status)}`}>
                                        {selectedTrade?.status}
                                      </p>
                                    </div>
                                    <div>
                                      <Label className="text-sm font-semibold">Date</Label>
                                      <p>{new Date(selectedTrade?.created_at).toLocaleDateString('fr-FR')}</p>
                                    </div>
                                  </div>

                                  {selectedTrade?.notes && (
                                    <div>
                                      <Label className="text-sm font-semibold">Notes</Label>
                                      <p>{selectedTrade.notes}</p>
                                    </div>
                                  )}

                                  <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Changer le statut</Label>
                                    <select
                                      value={selectedTrade?.status}
                                      onChange={(e) => updateTradeStatus(selectedTrade.id, e.target.value)}
                                      className="w-full px-3 py-2 border rounded-md"
                                    >
                                      <option value="pending">En attente</option>
                                      <option value="completed">Complété</option>
                                      <option value="cancelled">Annulé</option>
                                    </select>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
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
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-800">À propos des Échanges Inter-Magasins</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-blue-700 space-y-2">
            <p>• Les échanges inter-magasins permettent de transférer des produits entre vos magasins</p>
            <p>• Utile pour équilibrer les stocks entre différentes succursales</p>
            <p>• Chaque échange peut être suivi et son statut mis à jour</p>
            <p>• Les statuts disponibles: En attente, Complété, Annulé</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
