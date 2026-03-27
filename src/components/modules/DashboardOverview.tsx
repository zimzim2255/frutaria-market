import { useState, useEffect } from 'react';
import { projectId } from '../../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Package, Store, Truck, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

interface DashboardOverviewProps {
  session: any;
  userRole?: string;
}

export function DashboardOverview({ session, userRole: userRoleProp }: DashboardOverviewProps) {
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalStores: 0,
    totalSuppliers: 0,
    pendingOrders: 0,
    pendingTransfers: 0,
    pendingChecks: 0,
  });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>(userRoleProp || 'user');
  const [userStoreId, setUserStoreId] = useState<string | null>(null);

  // Update role when prop changes
  useEffect(() => {
    if (userRoleProp) {
      setUserRole(userRoleProp);
    }
  }, [userRoleProp]);

  // Fetch user role and store info from user metadata
  useEffect(() => {
    try {
      // Get user role and store from session metadata
      const userMetadata = session?.user?.user_metadata || {};
      const role = userRoleProp || userMetadata.role || 'user';
      setUserRole(role);
      
      // For non-admin users, try to get store_id from metadata or default to null
      if (role !== 'admin') {
        const storeId = userMetadata.store_id || null;
        setUserStoreId(storeId);
      }
      // Admin users see all data, so no store filter
    } catch (error) {
      console.error('Error reading user info:', error);
      // Default to user role if error
      setUserRole(userRoleProp || 'user');
    }
  }, [session, userRoleProp]);

  const fetchStats = async () => {
    try {
      // Fetch all necessary data to calculate stats
      const params = new URLSearchParams();
      params.append('user_id', session.user.id);
      
      if (userRole !== 'admin' && userStoreId) {
        params.append('store_id', userStoreId);
      }

      // Fetch products
      const productsResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/products?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      // Fetch sales/orders
      const salesResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/sales?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      // Fetch checks
      const checksResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/check-inventory?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      // Fetch stores
      const storesResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/stores`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      // Fetch suppliers
      const suppliersResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/suppliers`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      let totalProducts = 0;
      let totalStores = 0;
      let totalSuppliers = 0;
      let pendingOrders = 0;
      let pendingTransfers = 0;
      let pendingChecks = 0;

      if (productsResponse.ok) {
        const data = await productsResponse.json();
        totalProducts = (data.products || []).length;
      }

      if (storesResponse.ok) {
        const data = await storesResponse.json();
        totalStores = (data.stores || []).length;
      }

      if (suppliersResponse.ok) {
        const data = await suppliersResponse.json();
        totalSuppliers = (data.suppliers || []).length;
      }

      if (salesResponse.ok) {
        const data = await salesResponse.json();
        // Count pending and preparing orders
        pendingOrders = (data.sales || []).filter((s: any) => 
          s.delivery_status === 'pending' || s.delivery_status === 'preparing'
        ).length;
      }

      if (checksResponse.ok) {
        const data = await checksResponse.json();
        // Count pending and partly_used checks
        pendingChecks = (data.check_inventory || []).filter((c: any) => 
          c.status === 'pending' || c.status === 'partly_used'
        ).length;
      }

      setStats({
        totalProducts,
        totalStores,
        totalSuppliers,
        pendingOrders,
        pendingTransfers,
        pendingChecks,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      toast.error('Erreur lors du chargement des statistiques');
    }
  };

  const fetchRecentOrders = async () => {
    try {
      const params = new URLSearchParams();
      params.append('user_id', session.user.id);
      
      if (userRole !== 'admin' && userStoreId) {
        params.append('store_id', userStoreId);
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/sales?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setRecentOrders((data.sales || []).slice(0, 5));
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  };

  const fetchLowStockProducts = async () => {
    try {
      const params = new URLSearchParams();
      params.append('user_id', session.user.id);
      
      if (userRole !== 'admin' && userStoreId) {
        params.append('store_id', userStoreId);
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/products?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const lowStock = (data.products || [])
          .filter((p: any) => p.quantity_available < 10)
          .slice(0, 5);
        setLowStockProducts(lowStock);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userRole && (userRole === 'admin' || userStoreId)) {
      fetchStats();
      fetchRecentOrders();
      fetchLowStockProducts();
    }
  }, [userRole, userStoreId]);

  const StatCard = ({ icon: Icon, title, value, color }: any) => (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">{title}</p>
            <p className="text-3xl font-bold mt-2">{value}</p>
          </div>
          <div className={`p-3 rounded-lg ${color}`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Statistics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          icon={Package}
          title="Produits en stock"
          value={stats.totalProducts}
          color="bg-blue-500"
        />
        <StatCard
          icon={Store}
          title="Boutiques"
          value={stats.totalStores}
          color="bg-green-500"
        />
        <StatCard
          icon={Truck}
          title="Fournisseurs"
          value={stats.totalSuppliers}
          color="bg-purple-500"
        />
        <StatCard
          icon={Clock}
          title="Commandes en attente"
          value={stats.pendingOrders}
          color="bg-yellow-500"
        />
        <StatCard
          icon={Truck}
          title="Transferts en attente"
          value={stats.pendingTransfers}
          color="bg-orange-500"
        />
        <StatCard
          icon={AlertCircle}
          title="Chèques en attente"
          value={stats.pendingChecks}
          color="bg-red-500"
        />
      </div>

      {/* Recent Orders and Low Stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <Card>
          <CardHeader>
            <CardTitle>Commandes récentes</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : recentOrders.length > 0 ? (
              <div className="space-y-3">
                {recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-sm">{order.order_number}</p>
                      <p className="text-xs text-gray-600">{order.stores?.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-sm">{order.total_amount?.toFixed(2)} MAD</p>
                      <span className={`text-xs px-2 py-1 rounded ${
                        order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        order.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-8">Aucune commande</p>
            )}
          </CardContent>
        </Card>

        {/* Low Stock Alert */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              Stock faible
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : lowStockProducts.length > 0 ? (
              <div className="space-y-3">
                {lowStockProducts.map((product) => {
                  // Use category as stock quantity (Caisse)
                  const stockQuantity = Number(product.category) || 0;
                  return (
                    <div key={product.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{product.name}</p>
                        <p className="text-xs text-gray-600">{product.reference}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-sm text-red-600">{stockQuantity} unités</p>
                        <p className="text-xs text-gray-600">{product.product_category || 'N/A'}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-8">Aucun produit en stock faible</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Résumé des activités</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-blue-600" />
                <p className="font-semibold text-blue-900">À faire</p>
              </div>
              <p className="text-2xl font-bold text-blue-600">
                {stats.pendingOrders + stats.pendingTransfers + stats.pendingChecks}
              </p>
              <p className="text-sm text-blue-700 mt-1">Tâches en attente</p>
            </div>

            <div className="p-4 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <p className="font-semibold text-green-900">Actif</p>
              </div>
              <p className="text-2xl font-bold text-green-600">{stats.totalStores}</p>
              <p className="text-sm text-green-700 mt-1">Boutiques actives</p>
            </div>

            <div className="p-4 bg-purple-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-5 h-5 text-purple-600" />
                <p className="font-semibold text-purple-900">Inventaire</p>
              </div>
              <p className="text-2xl font-bold text-purple-600">{stats.totalProducts}</p>
              <p className="text-sm text-purple-700 mt-1">Produits en stock</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
