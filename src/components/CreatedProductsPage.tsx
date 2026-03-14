import { useState, useEffect } from 'react';
import { projectId } from '../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Plus, Search, Download, Eye, Trash2, Edit, Package, TrendingUp, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { ProductDetailsPage } from './ProductDetailsPage';

interface CreatedProductsPageProps {
  session: any;
}

export function CreatedProductsPage({ session }: CreatedProductsPageProps) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [showDetailsPage, setShowDetailsPage] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [filterCategory, setFilterCategory] = useState('all');
  const [categories, setCategories] = useState<string[]>([]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
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
        
        // Extract unique categories
        const uniqueCategories = [...new Set(data.products?.map((p: any) => p.category).filter(Boolean))];
        setCategories(uniqueCategories as string[]);
      } else {
        toast.error('Erreur lors du chargement des produits');
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Erreur lors du chargement des produits');
    } finally {
      setLoading(false);
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

  useEffect(() => {
    fetchProducts();
    fetchSuppliers();
    fetchStores();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce produit?')) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/products/${id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        toast.success('Produit supprimé');
        fetchProducts();
      } else {
        toast.error('Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleViewDetails = (product: any) => {
    setSelectedProduct(product);
    setShowDetailsPage(true);
  };

  const getSupplierName = (supplierId: string | null) => {
    if (!supplierId) return 'Non spécifié';
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier?.name || supplierId;
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = 
      !searchTerm || 
      product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.category?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = 
      filterCategory === 'all' || 
      product.category === filterCategory;

    return matchesSearch && matchesCategory;
  });

  const stats = {
    totalProducts: products.length,
    totalValue: products.reduce((sum, p) => sum + (p.quantity_available * p.purchase_price), 0),
    lowStock: products.filter(p => p.quantity_available < 10).length,
    totalQuantity: products.reduce((sum, p) => sum + p.quantity_available, 0),
  };

  if (showDetailsPage && selectedProduct) {
    return (
      <ProductDetailsPage
        product={selectedProduct}
        suppliers={suppliers}
        stores={stores}
        session={session}
        onBack={() => {
          setShowDetailsPage(false);
          setSelectedProduct(null);
        }}
        onBuy={() => {}}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Catalogue de Produits</h1>
          <p className="text-gray-600 mt-1">Tous les produits créés via le système de facturation</p>
        </div>
      </div>

      {/* Stats Cards - Navbar Style */}
      <div className="flex flex-wrap w-full bg-white p-1 h-auto gap-1 border-b border-gray-200 rounded-lg">
        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-blue-50 border-b-2 border-blue-500 text-blue-600 flex-1 min-w-max">
          <Package className="w-5 h-5" />
          <span className="text-xs font-medium">Total Produits</span>
          <span className="text-lg font-bold">{stats.totalProducts}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-green-50 border-b-2 border-green-500 text-green-600 flex-1 min-w-max">
          <Package className="w-5 h-5" />
          <span className="text-xs font-medium">Articles en Stock</span>
          <span className="text-lg font-bold">{stats.totalQuantity}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-purple-50 border-b-2 border-purple-500 text-purple-600 flex-1 min-w-max">
          <TrendingUp className="w-5 h-5" />
          <span className="text-xs font-medium">Valeur Totale</span>
          <span className="text-lg font-bold">{(stats.totalValue / 1000).toFixed(1)}K MAD</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-red-50 border-b-2 border-red-500 text-red-600 flex-1 min-w-max">
          <AlertTriangle className="w-5 h-5" />
          <span className="text-xs font-medium">Stock Faible</span>
          <span className="text-lg font-bold">{stats.lowStock}</span>
        </div>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle>Filtres et Recherche</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Rechercher</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Nom, référence, catégorie..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label>Catégorie</Label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Toutes les catégories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Produits ({filteredProducts.length})</CardTitle>
          <Button
            onClick={() => {
              const csv = generateCSV(filteredProducts, suppliers);
              downloadCSV(csv, 'products.csv');
            }}
            variant="outline"
            size="sm"
          >
            <Download className="w-4 h-4 mr-2" />
            Exporter CSV
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Chargement...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Aucun produit trouvé</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Référence</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>Quantité</TableHead>
                    <TableHead>Prix Achat</TableHead>
                    <TableHead>Prix Vente</TableHead>
                    <TableHead>Fournisseur</TableHead>
                    <TableHead>Valeur</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id} className="hover:bg-gray-50">
                      <TableCell className="font-mono text-sm">{product.reference}</TableCell>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>
                        <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
                          {product.category || 'N/A'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {product.lot ? (
                          <span className="inline-block bg-purple-100 text-purple-800 px-2 py-1 rounded text-sm">
                            {product.lot}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={product.quantity_available < 10 ? 'text-red-600 font-semibold' : ''}>
                          {product.quantity_available}
                        </span>
                      </TableCell>
                      <TableCell>{product.purchase_price?.toFixed(2)} MAD</TableCell>
                      <TableCell>{product.sale_price?.toFixed(2)} MAD</TableCell>
                      <TableCell className="text-sm">{getSupplierName(product.supplier_id)}</TableCell>
                      <TableCell className="font-semibold">
                        {(product.quantity_available * product.purchase_price).toFixed(2)} MAD
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            onClick={() => handleViewDetails(product)}
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0"
                            title="Voir détails"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={() => handleDelete(product.id)}
                            size="sm"
                            variant="destructive"
                            className="h-8 w-8 p-0"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Helper function to generate CSV
function generateCSV(products: any[], suppliers: any[]): string {
  const headers = ['Référence', 'Nom', 'Catégorie', 'Lot', 'Quantité', 'Prix Achat', 'Prix Vente', 'Fournisseur', 'Valeur'];
  
  const rows = products.map(p => {
    const supplier = suppliers.find(s => s.id === p.supplier_id);
    return [
      p.reference,
      p.name,
      p.category || '',
      p.lot || '',
      p.quantity_available,
      p.purchase_price?.toFixed(2) || '',
      p.sale_price?.toFixed(2) || '',
      supplier?.name || 'N/A',
      (p.quantity_available * p.purchase_price).toFixed(2),
    ];
  });

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  return csvContent;
}

// Helper function to download CSV
function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
