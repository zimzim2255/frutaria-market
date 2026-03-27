import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { LogOut, LayoutDashboard, Package, ShoppingCart, Users, Truck, FileCheck, ClipboardList, Search, X, FileText, AlertCircle, Image, Receipt, History, Percent, Lock, DollarSign, Wallet, Building2 } from 'lucide-react';
import { DashboardOverview } from './modules/DashboardOverview';
import { ProductsModule } from './modules/ProductsModule';
import { ProductTemplatesModule } from './modules/ProductTemplatesModule';
import { SalesModule } from './modules/SalesModule';
import { SalesHistoryModule } from './modules/SalesHistoryModule';
import { ClientsModule } from './modules/ClientsModule';
import { MagasinsModule } from './modules/MagasinsModule';
import { SuppliersModule } from './modules/SuppliersModule';
import { CheckInventoryModule } from './modules/CheckInventoryModule';
import { CheckSafeModule } from './modules/CheckSafeModule';
import { OrdersModule } from './modules/OrdersModule';
import { UsersModule } from './modules/UsersModule';
import FactureModule from './modules/FactureModule';
import InvoicesModule from './modules/InvoicesModule';
import { DiscountManagementModule } from './modules/DiscountManagementModule';
import ProductAdditionHistoryModule from './modules/ProductAdditionHistoryModule';
import StockReferenceHistoryModule from './modules/StockReferenceHistoryModule';
import SalesProductHistoryModule from './modules/SalesProductHistoryModule';
import { CreatedProductsPage } from './CreatedProductsPage';
import { CashManagementPage } from './CashManagementPage';
import { CashSpacePage } from './CashSpacePage';
import { LeChargePage } from './LeChargePage';
import { ChargeCategoriesModule } from './modules/ChargeCategoriesModule';
import { BorrowedMoneyModule } from './modules/BorrowedMoneyModule';
import { PurchaseModule } from './modules/PurchaseModule';
import { FournisseurAdminModule } from './modules/FournisseurAdminModule';
import { ClientMagasinModule } from './modules/ClientMagasinModule';
import { LoginScreen } from './LoginScreen';
import { toast } from 'sonner@2.0.3';

interface AdminDashboardProps {
  session: any;
  supabase: any;
}

export function AdminDashboard({ session, supabase }: AdminDashboardProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // User role/permissions (loaded async)
  const [userRole, setUserRole] = useState<string>('user');
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [loadingUser, setLoadingUser] = useState(true);

  // Extract tab from URL path
  // IMPORTANT: initial value must NOT depend on async-loaded role (prevents crash)
  const getTabFromPath = () => {
    const path = location.pathname.replace(/^\//, '');
    return path || 'dashboard';
  };

  const [activeTab, setActiveTab] = useState(getTabFromPath());
  const [stats, setStats] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [cachedData, setCachedData] = useState<any>({});
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [activityCounts, setActivityCounts] = useState({
    products: 0,
    sales: 0,
    orders: 0,
    checks: 0,
    suppliers: 0,
  });
  
  // If no session, show login screen
  if (!session) {
    return <LoginScreen supabase={supabase} />;
  }

  // Fetch user role and permissions
  useEffect(() => {
    if (!session) {
      setLoadingUser(false);
      return;
    }

    const fetchUserData = async () => {
      try {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/users`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const currentUser = data.users?.find((u: any) => u.email === session.user?.email);

          if (currentUser) {
            // IMPORTANT: never default to admin.
            // If role is missing, treat as "user" so permissions are not bypassed.
            const role = currentUser.role || 'user';
            setUserRole(role);
            setUserPermissions(currentUser.permissions || []);
            try { localStorage.setItem('userRole', String(role)); } catch (_e) {}
            console.log('User found:', currentUser.email, 'Role:', role);
          } else {
            // If still not found after the call, wait a moment and try again
            console.warn('User not found on first attempt, retrying...');
            await new Promise(resolve => setTimeout(resolve, 500));

            const retryResponse = await fetch(
              `https://${projectId}.supabase.co/functions/v1/super-handler/users`,
              {
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                },
              }
            );

            if (retryResponse.ok) {
              const retryData = await retryResponse.json();
              const retryUser = retryData.users?.find((u: any) => u.email === session.user?.email);

              if (retryUser) {
                const role = retryUser.role || 'user';
                setUserRole(role);
                setUserPermissions(retryUser.permissions || []);
                try { localStorage.setItem('userRole', String(role)); } catch (_e) {}
                console.log('User found on retry:', retryUser.email, 'Role:', role);
              } else {
                // Still not found -> safest default: user with no permissions
                console.warn('User not found after retry, defaulting to user (no permissions)');
                setUserRole('user');
                setUserPermissions([]);
                try { localStorage.setItem('userRole', 'user'); } catch (_e) {}
              }
            } else {
              setUserRole('user');
              setUserPermissions([]);
              try { localStorage.setItem('userRole', 'user'); } catch (_e) {}
            }
          }
        } else {
          setUserRole('user');
          setUserPermissions([]);
          try { localStorage.setItem('userRole', 'user'); } catch (_e) {}
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        // On error, safest default: user with no permissions
        setUserRole('user');
        setUserPermissions([]);
        try { localStorage.setItem('userRole', 'user'); } catch (_e) {}
      } finally {
        setLoadingUser(false);
      }
    };

    fetchUserData();

    // Refresh permissions when another tab updates them (Users page saves into localStorage)
    const onPermissionsUpdated = () => {
      fetchUserData();
    };
    window.addEventListener('permissions-updated', onPermissionsUpdated as any);
    return () => window.removeEventListener('permissions-updated', onPermissionsUpdated as any);
  }, [session?.user?.email, session?.access_token]);

  const isMagasinManager = userRole === 'magasin_manager' || userRole === 'manager';

  // Check if user has permission to view a module
  const hasPermission = (permission: string): boolean => {
    if (userRole === 'admin') return true;
    return userPermissions.includes(permission);
  };

  // Map some routes/tabs to permissions (for newer pages)
  const canViewCashManagement = hasPermission('Voir la Caisse');
  const canViewCashSpace = hasPermission("Voir l'Espace Caisse") || hasPermission('Voir Espace Caisse');
  const canViewCharges = hasPermission('Voir les Charges');
  const canViewCoffre = hasPermission('Voir le Coffre');

  const handleLogout = async () => {
    try {
      // Clear local storage and session storage
      localStorage.clear();
      sessionStorage.clear();
      
      // Sign out from Supabase
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      
      if (error && error.message !== 'Auth session missing') {
        console.error('Logout error:', error);
        toast.error(`Erreur de déconnexion: ${error.message}`);
      } else {
        toast.success('Déconnexion réussie');
        // The onAuthStateChange listener in App.tsx will handle the redirect
      }
    } catch (error: any) {
      console.error('Logout exception:', error);
      // Even if there's an error, clear the session and redirect
      toast.success('Déconnexion réussie');
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/stats`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  // Sync URL with active tab
  useEffect(() => {
    navigate(`/${activeTab}`, { replace: true });
  }, [activeTab, navigate]);

  // Sync active tab with URL on mount and when URL changes
  useEffect(() => {
    const tabFromPath = getTabFromPath();
    if (tabFromPath !== activeTab) {
      setActiveTab(tabFromPath);
    }
  }, [location.pathname, userRole]);

  // NOTE: Fournisseur Admin (Total Facture) is hidden.
  // Keep normal landing behaviour for all roles.

  useEffect(() => {
    if (session?.access_token) {
      fetchStats();
      const interval = setInterval(fetchStats, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [session?.access_token]);

  const performGlobalSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    try {
      setSearchLoading(true);
      const results: any[] = [];
      const searchLower = query.toLowerCase();

      // Fetch all data in parallel with caching
      const fetchData = async (endpoint: string) => {
        if (cachedData[endpoint]) {
          return cachedData[endpoint];
        }
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/${endpoint}`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );
        if (res.ok) {
          const data = await res.json();
          setCachedData((prev: any) => ({ ...prev, [endpoint]: data }));
          return data;
        }
        return null;
      };

      // Fetch all data in parallel
      const [productsData, salesData, ordersData, suppliersData, clientsData] = await Promise.all([
        fetchData('products'),
        fetchData('sales'),
        fetchData('orders'),
        fetchData('suppliers'),
        fetchData('clients'),
      ]);

      // Search products
      if (productsData?.products) {
        productsData.products.forEach((p: any) => {
          if (p.name?.toLowerCase().includes(searchLower) || p.sku?.toLowerCase().includes(searchLower)) {
            results.push({
              type: 'product',
              id: p.id,
              title: p.name,
              subtitle: `SKU: ${p.sku}`,
              icon: '📦',
            });
          }
        });
      }

      // Search sales
      if (salesData?.sales) {
        salesData.sales.forEach((s: any) => {
          if (s.sale_number?.toLowerCase().includes(searchLower)) {
            results.push({
              type: 'sales',
              id: s.id,
              title: `Sale #${s.sale_number}`,
              subtitle: `${s.total_amount?.toFixed(2)} MAD`,
              icon: '🛒',
            });
          }
        });
      }

      // Search orders
      if (ordersData?.orders) {
        ordersData.orders.forEach((o: any) => {
          if (o.order_number?.toLowerCase().includes(searchLower)) {
            results.push({
              type: 'orders',
              id: o.id,
              title: `Order #${o.order_number}`,
              subtitle: `${o.total_amount?.toFixed(2)} MAD`,
              icon: '📋',
            });
          }
        });
      }

      // Search suppliers
      if (suppliersData?.suppliers) {
        suppliersData.suppliers.forEach((s: any) => {
          if (s.name?.toLowerCase().includes(searchLower) || s.email?.toLowerCase().includes(searchLower)) {
            results.push({
              type: 'suppliers',
              id: s.id,
              title: s.name,
              subtitle: s.email,
              icon: '🚚',
            });
          }
        });
      }

      // Search clients/stores
      if (clientsData?.clients) {
        clientsData.clients.forEach((c: any) => {
          if (c.name?.toLowerCase().includes(searchLower) || c.email?.toLowerCase().includes(searchLower)) {
            results.push({
              type: 'stores',
              id: c.id,
              title: c.name,
              subtitle: c.email,
              icon: '🏪',
            });
          }
        });
      }

      setSearchResults(results.slice(0, 10));
      setShowSearchResults(true);
      setSearchLoading(false);
    } catch (error) {
      console.error('Search error:', error);
      setSearchLoading(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (value.length > 0) {
      // Debounce search by 300ms
      searchTimeoutRef.current = setTimeout(() => {
        performGlobalSearch(value);
      }, 300);
    } else {
      setSearchResults([]);
      setShowSearchResults(false);
    }
  };

  const handleResultClick = (result: any) => {
    setActiveTab(result.type);
    setShowSearchResults(false);
    setSearchQuery('');
    toast.success(`Navigating to ${result.type}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-[60] shadow-sm">
        <div className="px-4 md:px-6 py-3 md:py-4">
          {/* Top Row - Logo and User Info */}
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-lg md:text-xl font-bold text-gray-900">Frutaria Market</h1>
              <p className="text-xs md:text-sm text-gray-600 mt-0.5">Inter-Store Trading System</p>
            </div>
            <div className="flex items-center gap-4 md:gap-6 flex-shrink-0">
              <div className="text-right hidden sm:block border-r border-gray-200 pr-4 md:pr-6">
                <p className="text-xs md:text-sm font-medium text-gray-900">{session?.user?.email}</p>
                <p className="text-xs text-gray-600 capitalize mt-0.5">{loadingUser ? 'Chargement...' : userRole}</p>
              </div>
              <button 
                onClick={handleLogout}
                style={{
                  backgroundColor: '#dc2626',
                  color: 'white',
                  padding: '0.5rem 0.75rem',
                  height: '2.25rem',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  borderRadius: '0.5rem',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  transition: 'background-color 0.2s',
                  flexShrink: 0
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#b91c1c'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
              >
                <LogOut className="w-4 h-4" />
                <span style={{ display: 'none' }} className="hidden sm:inline">Déconnexion</span>
                <span className="sm:hidden">Sortir</span>
              </button>
            </div>
          </div>

          {/* Global Search Bar */}
          <div className="relative w-full md:max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Rechercher produits, ventes, clients..."
                className="pl-10 py-2 text-sm h-9 rounded-lg border-gray-300"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => searchQuery && setShowSearchResults(true)}
              />
            </div>

            {/* Search Results Dropdown */}
            {showSearchResults && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <div className="max-h-64 md:max-h-96 overflow-y-auto">
                  {searchResults.map((result, index) => (
                    <button
                      key={index}
                      onClick={() => handleResultClick(result)}
                      className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg flex-shrink-0">{result.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate text-sm">{result.title}</p>
                          <p className="text-xs text-gray-600 truncate">{result.subtitle}</p>
                        </div>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded whitespace-nowrap flex-shrink-0">
                          {result.type}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* No Results Message */}
            {showSearchResults && searchResults.length === 0 && searchQuery && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-center text-gray-500 z-50 text-sm">
                Aucun résultat pour "{searchQuery}"
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="p-3 md:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 md:space-y-6">
          <TabsList className="flex flex-wrap w-full bg-white p-0.5 md:p-1 h-auto gap-0.5 md:gap-1 border-b border-gray-200 overflow-x-auto" style={{ fontSize: '12px' }}>
            {/* Dashboard - Always visible */}
            <TabsTrigger 
              value="dashboard" 
              className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                activeTab === 'dashboard' 
                  ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
              style={{ fontSize: '12px' }}
            >
              <LayoutDashboard className="w-3 h-3 md:w-3.5 md:h-3.5" />
              <span className="font-medium">Tab.</span>
            </TabsTrigger>

            {/* Products */}
            {hasPermission('Voir les Produits') && (
              <TabsTrigger 
                value="products" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'products' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <Package className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Stock</span>
              </TabsTrigger>
            )}

            {/* Stores */}
            {hasPermission('Voir les Magasins') && (
              <TabsTrigger 
                value="stores" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'stores' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <Users className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Mag.</span>
              </TabsTrigger>
            )}

            {/* Clients */}
            {hasPermission('Voir les Clients') && (
              <TabsTrigger 
                value="clients" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'clients' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <Users className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Clients</span>
              </TabsTrigger>
            )}

            {/* Sales */}
            {hasPermission('Voir les Ventes') && (
              <TabsTrigger 
                value="sales" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'sales' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <ShoppingCart className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Ventes</span>
              </TabsTrigger>
            )}

            {/* Sales History (BL) */}
            {hasPermission('Voir l\'Historique des Ventes') && (
              <TabsTrigger 
                value="sales-history" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'sales-history' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <History className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Ven. (BL)</span>
              </TabsTrigger>
            )}

            {/* Purchases */}
            {hasPermission('Voir Achats/Transferts') && (
              <TabsTrigger 
                value="purchases" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'purchases' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <ShoppingCart className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Achats</span>
              </TabsTrigger>
            )}

            {/* Suppliers */}
            {hasPermission('Voir les Fournisseurs') && (
              <TabsTrigger 
                value="suppliers" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'suppliers' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <Truck className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Fournisseurs</span>
              </TabsTrigger>
            )}

            {/* Product Templates */}
            {hasPermission('Voir les Modèles de Produits') && (
              <TabsTrigger 
                value="product-templates" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'product-templates' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <Package className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Mod. Pr.</span>
              </TabsTrigger>
            )}

            {/* Check Inventory */}
            {hasPermission('Voir l\'Inventaire des Chèques') && (
              <TabsTrigger 
                value="check-inventory" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'check-inventory' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <Image className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Inv. Chq.</span>
              </TabsTrigger>
            )}

            {/* Check Safe (Coffre) */}
            {canViewCoffre && (
              <TabsTrigger 
                value="check-safe" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'check-safe' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <Lock className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Coffre</span>
              </TabsTrigger>
            )}

            {/* Orders */}
            {hasPermission('Voir les Commandes') && (
              <TabsTrigger 
                value="orders" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'orders' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <ClipboardList className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Commandes</span>
              </TabsTrigger>
            )}

            {/* Users - Only for admins */}
            {hasPermission('Gérer les Utilisateurs') && (
              <TabsTrigger 
                value="users" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'users' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <Users className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Utilisateurs</span>
              </TabsTrigger>
            )}

            {/* Facture */}
            {hasPermission('Voir les Factures') && (
              <TabsTrigger 
                value="facture" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'facture' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <FileText className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Facture</span>
              </TabsTrigger>
            )}

            {/* Invoices */}
            {hasPermission('Voir les Factures') && (
              <TabsTrigger 
                value="invoices" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'invoices' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <Receipt className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Invoices</span>
              </TabsTrigger>
            )}

            {/* Discount Management */}
            {hasPermission('Voir les Remises') && (
              <TabsTrigger 
                value="discounts" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'discounts' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <Percent className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Remises</span>
              </TabsTrigger>
            )}

            {/* Created Products Catalog */}
            {hasPermission('Voir les Produits') && (
              <TabsTrigger 
                value="created-products" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'created-products' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <Package className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Catalogue</span>
              </TabsTrigger>
            )}

            {/* Product Addition History */}
            {hasPermission('Voir les Produits') && (
              <TabsTrigger 
                value="product-additions" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'product-additions' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <History className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Hist. Ajouts</span>
              </TabsTrigger>
            )}

            {/* Sales Products History */}
            {hasPermission('Voir les Ventes') && (
              <TabsTrigger 
                value="sales-products-history" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'sales-products-history' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <History className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Hist. Ventes</span>
              </TabsTrigger>
            )}

            {/* Stock Reference History */}
            {hasPermission('Voir les Produits') && (
              <TabsTrigger 
                value="stock-reference-history" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'stock-reference-history' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <Package className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Hist. Ref</span>
              </TabsTrigger>
            )}

            {/* Cash Management */}
            {canViewCashManagement && (
              <TabsTrigger 
                value="cash-management" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'cash-management' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <FileText className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Caisse</span>
              </TabsTrigger>
            )}

            {/* Le Charge (Expenses) */}
            {canViewCharges && (
              <TabsTrigger 
                value="le-charge" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'le-charge' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <FileText className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Charges</span>
              </TabsTrigger>
            )}

            {/* Cash Space (Espace Caisse) */}
            {canViewCashSpace && (
              <TabsTrigger 
                value="cash-space" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'cash-space' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <Wallet className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Esp. Cai.</span>
              </TabsTrigger>
            )}

            {/* Charge Categories - Admin Only */}
            {hasPermission('Gérer les Utilisateurs') && (
              <TabsTrigger 
                value="charge-categories" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'charge-categories' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <Package className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Cat. Char.</span>
              </TabsTrigger>
            )}

            {/* Fournisseur Admin (Total Facture) */}
            <TabsTrigger 
              value="fournisseur-admin" 
              className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                activeTab === 'fournisseur-admin' 
                  ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
              style={{ fontSize: '11px' }}
            >
              <Building2 className="w-3 h-3 md:w-3.5 md:h-3.5" />
              <span className="font-medium">Four. Adm</span>
            </TabsTrigger>

            {/* Client Magasin Page */}
            {userRole === 'admin' && (
              <TabsTrigger 
                value="client-magasin" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'client-magasin' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <Users className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Cl. Mag</span>
              </TabsTrigger>
            )}

            {/* Borrowed Money - Admin Only */}
            {hasPermission('Gérer les Utilisateurs') && (
              <TabsTrigger 
                value="borrowed-money" 
                className={`flex flex-col items-center gap-0.5 py-1 md:py-1.5 px-1 md:px-1.5 rounded-t-lg transition-all flex-shrink-0 ${
                  activeTab === 'borrowed-money' 
                    ? 'bg-blue-50 border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: '11px' }}
              >
                <DollarSign className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="font-medium">Prêts</span>
              </TabsTrigger>
            )}

                      </TabsList>

          <TabsContent value="dashboard">
            <DashboardOverview session={session} userRole={userRole} />
          </TabsContent>

          <TabsContent value="products">
            <ProductsModule session={session} />
          </TabsContent>

          <TabsContent value="stores">
            <MagasinsModule session={session} />
          </TabsContent>

          <TabsContent value="clients">
            <ClientsModule session={session} />
          </TabsContent>

          <TabsContent value="sales">
            <SalesModule session={session} />
          </TabsContent>

          <TabsContent value="sales-history">
            <SalesHistoryModule session={session} />
          </TabsContent>

          <TabsContent value="purchases">
            <PurchaseModule session={session} />
          </TabsContent>

          <TabsContent value="suppliers">
            <SuppliersModule session={session} />
          </TabsContent>

          <TabsContent value="product-templates">
            <ProductTemplatesModule session={session} />
          </TabsContent>

          <TabsContent value="check-inventory">
            <CheckInventoryModule session={session} />
          </TabsContent>

          <TabsContent value="check-safe">
            <CheckSafeModule session={session} />
          </TabsContent>

          <TabsContent value="orders">
            <OrdersModule session={session} />
          </TabsContent>

          <TabsContent value="users">
            <UsersModule session={session} />
          </TabsContent>

          <TabsContent value="facture">
            <FactureModule session={session} setActiveTab={setActiveTab} />
          </TabsContent>

          <TabsContent value="invoices">
            <InvoicesModule session={session} />
          </TabsContent>

          <TabsContent value="discounts">
            <DiscountManagementModule session={session} />
          </TabsContent>

          <TabsContent value="created-products">
            <CreatedProductsPage session={session} />
          </TabsContent>

          <TabsContent value="product-additions">
            <ProductAdditionHistoryModule session={session} />
          </TabsContent>

          <TabsContent value="sales-products-history">
            <SalesProductHistoryModule session={session} />
          </TabsContent>

          <TabsContent value="stock-reference-history">
            <StockReferenceHistoryModule session={session} />
          </TabsContent>

          <TabsContent value="cash-management">
            <CashManagementPage session={session} />
          </TabsContent>

          <TabsContent value="le-charge">
            <LeChargePage session={session} />
          </TabsContent>

          <TabsContent value="cash-space">
            <CashSpacePage session={session} />
          </TabsContent>

          <TabsContent value="charge-categories">
            <ChargeCategoriesModule session={session} />
          </TabsContent>

          <TabsContent value="fournisseur-admin">
            <FournisseurAdminModule session={session} />
          </TabsContent>

          <TabsContent value="client-magasin">
            <ClientMagasinModule session={session} />
          </TabsContent>

          <TabsContent value="borrowed-money">
            <BorrowedMoneyModule session={session} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
