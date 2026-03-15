import { useState, useEffect } from 'react';
import { projectId } from '../../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Plus, Eye, Search, ShoppingCart, Package, Truck, CheckCircle, ArrowRight, Download, FileText } from 'lucide-react';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import CreatePurchaseModule from './CreatePurchaseModule';
import { SalesDetailsPage } from '../SalesDetailsPage';

interface PurchaseModuleProps {
  session: any;
}

export function PurchaseModule({ session }: PurchaseModuleProps) {
  const [sales, setSales] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('user');
  const [selectedMagasinForAdmin, setSelectedMagasinForAdmin] = useState<string>('');
  const isAdmin = userRole === 'admin';
  const selectedMagasinNameForAdmin = isAdmin
    ? (stores.find((s: any) => String(s.id) === String(selectedMagasinForAdmin))?.name || '')
    : '';
  const [searchTermTable, setSearchTermTable] = useState('');
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [createFormType, setCreateFormType] = useState<'purchase' | 'transfer'>('purchase');
  const [showPdfExportDialog, setShowPdfExportDialog] = useState(false);

  // Table sorting (A→Z / Z→A + numeric)
  const [sortConfig, setSortConfig] = useState<{ key: 'operation_number' | 'type' | 'store_name' | 'created_by' | 'total_amount' | 'payment_status' | 'delivery_status' | 'created_at' | null; direction: 'asc' | 'desc' }>({
    key: null,
    direction: 'asc',
  });

  const fetchSales = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/sales?user_id=${session.user.id}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();

        // Filter for transfers and purchases only
        const transfersAndPurchases = (data.sales || []).filter((sale: any) =>
          sale.sale_number?.includes('TRANSFER-') || sale.sale_number?.includes('PURCHASE-')
        );

        // Match SalesDetailsPage approach: resolve magasin name on the frontend.
        // Backend /sales endpoint intentionally returns only sales rows.
        // We fetch stores once and map store_id -> store name.
        let storesMap = new Map<string, string>();
        try {
          const storesRes = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/stores`,
            {
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
              },
            }
          );

          if (storesRes.ok) {
            const storesJson = await storesRes.json();
            (storesJson.stores || []).forEach((s: any) => {
              if (s?.id) storesMap.set(String(s.id), String(s.name || ''));
            });
          }
        } catch (e) {
          // ignore mapping errors; fallback to '-'
        }

        const enriched = transfersAndPurchases.map((sale: any) => {
          const storeId = sale.store_id || sale.created_for_store_id;
          const storeName = storeId ? storesMap.get(String(storeId)) : null;
          return {
            ...sale,
            // mimic supabase join shape used elsewhere in UI
            stores: sale.stores || (storeName ? { id: storeId, name: storeName } : null),
          };
        });

        setSales(enriched);
      }
    } catch (error) {
      console.error('Error fetching sales:', error);
      toast.error('Erreur lors du chargement des transferts/achats');
    } finally {
      setLoading(false);
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
        const sortedStores = (data.stores || []).sort((a: any, b: any) => a.name.localeCompare(b.name));
        setStores(sortedStores);
      }
    } catch (error) {
      console.error('Error fetching stores:', error);
    }
  };

  useEffect(() => {
    // Resolve user role from DB (super-handler /users) instead of auth metadata.
    // Auth metadata can be stale/missing and causes admin-only UI (magasin selector) to disappear.
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

        if (res.ok) {
          const data = await res.json().catch(() => null);
          const me = (data?.users || []).find((u: any) => String(u?.id || '') === String(session?.user?.id || ''))
            || (data?.users || []).find((u: any) => String(u?.email || '') === String(session?.user?.email || ''))
            || null;

          const role = String(me?.role || '').toLowerCase();
          if (role) {
            setUserRole(role);
            return;
          }
        }

        // Fallback to auth metadata if DB lookup fails
        const metaRole = String(session?.user?.user_metadata?.role || '').toLowerCase();
        if (metaRole) setUserRole(metaRole);
      } catch (error) {
        console.error('Error fetching user role:', error);
        const metaRole = String(session?.user?.user_metadata?.role || '').toLowerCase();
        if (metaRole) setUserRole(metaRole);
      }
    })();
  }, [session?.access_token, session?.user?.id, session?.user?.email]);

  useEffect(() => {
    fetchSales();
    fetchStores();
  }, []);

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
        toast.success(`Statut mis à jour: ${newStatus}`);
        fetchSales();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
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

  const formatDeliveryStatus = (status: string) => {
    switch (status) {
      case 'preparing':
        return 'Préparation';
      case 'in_transit':
        return 'En transit';
      case 'delivered':
        return 'Livrée';
      case 'canceled':
        return 'Annulée';
      default:
        return status || '-';
    }
  };

  const filteredSalesBase = sales.filter(sale => {
    const matchesSearch =
      sale.sale_number?.toLowerCase().includes(searchTermTable.toLowerCase()) ||
      sale.stores?.name?.toLowerCase().includes(searchTermTable.toLowerCase());

    // Admin magasin selector should act as a filter.
    // If a magasin is selected, show operations where that magasin is either:
    // - the destination (sale.store_id)
    // - OR the source (sale.source_store_id)
    // This fixes transfers visibility: both Magasin A and Magasin B should see the TRANSFER.
    const selected = String(selectedMagasinForAdmin || '');
    const dst = String(sale.store_id || sale.stores?.id || '');
    const src = String((sale as any).source_store_id || '');

    const matchesMagasin = selected
      ? (dst === selected || src === selected)
      : true;

    return matchesSearch && matchesMagasin;
  });

  const filteredSales = filteredSalesBase;

  const sortedSales = (() => {
    if (!sortConfig.key) return filteredSales;

    const dir = sortConfig.direction === 'asc' ? 1 : -1;

    const operationNumber = (s: any) => String(s?.sale_number || '').replace(/^PURCHASE-/, 'ACHAT-').replace(/^TRANSFER-/, 'TRANSFERT-');
    const opType = (s: any) => (String(s?.sale_number || '').includes('TRANSFER-') ? 'Transfert' : 'Achat');
    const createdBy = (s: any) => {
      const isAdminX = String(s?.created_by_role || '').toLowerCase() === 'admin';
      if (!isAdminX) return 'Utilisateur';
      const isAchat = String(s?.sale_number || '').includes('PURCHASE-');
      return `Admin${isAchat ? ' (achat)' : ' (transfert)'}`;
    };

    // Numeric sorts
    if (sortConfig.key === 'total_amount') {
      return [...filteredSales].sort((a, b) => (Number(a.total_amount || 0) - Number(b.total_amount || 0)) * dir);
    }
    if (sortConfig.key === 'created_at') {
      return [...filteredSales].sort((a, b) => {
        const at = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const bt = b?.created_at ? new Date(b.created_at).getTime() : 0;
        return (at - bt) * dir;
      });
    }

    // String sorts
    const strVal = (s: any) => {
      switch (sortConfig.key) {
        case 'operation_number':
          return operationNumber(s).toLowerCase();
        case 'type':
          return opType(s).toLowerCase();
        case 'store_name':
          return String(s?.stores?.name || '').toLowerCase();
        case 'created_by':
          return createdBy(s).toLowerCase();
        case 'payment_status':
          return String(s?.payment_status || '').toLowerCase();
        case 'delivery_status':
          return String(s?.delivery_status || '').toLowerCase();
        default:
          return '';
      }
    };

    return [...filteredSales].sort((a, b) => {
      const av = strVal(a);
      const bv = strVal(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  })();

  const exportToExcel = () => {
    try {
      const datePart = new Date().toISOString().split('T')[0];
      const rows = sortedSales;

      const safe = (v: any) => String(v ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const money = (n: any) => `${(Number(n || 0) || 0).toFixed(2)} MAD`;

      const totalOps = rows.length;
      const totalTransfersX = rows.filter((s: any) => String(s.sale_number || '').includes('TRANSFER-')).length;
      const totalPurchasesX = rows.filter((s: any) => String(s.sale_number || '').includes('PURCHASE-')).length;
      const totalAmountX = rows.reduce((sum: number, s: any) => sum + (Number(s.total_amount) || 0), 0);

      const htmlContent = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body { font-family: Arial, sans-serif; margin: 18px; }
              .title { font-size: 20px; font-weight: bold; text-align: center; margin-bottom: 6px; text-transform: uppercase; }
              .sub { text-align: center; color: #374151; margin-bottom: 14px; font-size: 12px; }
              .stats { margin: 10px 0 16px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; background: #f8fafc; }
              .stats b { color: #111827; }
              table { width: 100%; border-collapse: collapse; }
              th { background: #2563eb; color: white; text-align: left; padding: 8px; font-size: 12px; }
              td { border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; vertical-align: top; }
              tr:nth-child(even) td { background: #f9fafb; }
            </style>
          </head>
          <body>
            <div class="title">RAPPORT - TRANSFERTS & ACHATS</div>
            <div class="sub">Date: ${new Date().toLocaleDateString('fr-FR')}</div>

            <div class="stats">
              <div><b>Total opérations:</b> ${totalOps}</div>
              <div><b>Transferts:</b> ${totalTransfersX}</div>
              <div><b>Achats:</b> ${totalPurchasesX}</div>
              <div><b>Montant total:</b> ${money(totalAmountX)}</div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>N° Opération</th>
                  <th>Type</th>
                  <th>Magasin</th>
                  <th>Créé par</th>
                  <th>Montant</th>
                  <th>Paiement</th>
                  <th>Statut Livraison</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((s: any) => {
                  const type = String(s.sale_number || '').includes('TRANSFER-') ? 'Transfert' : 'Achat';
                  const num = String(s.sale_number || '').replace(/^PURCHASE-/, 'ACHAT-').replace(/^TRANSFER-/, 'TRANSFERT-');
                  const createdBy = (() => {
                    const isAdminX = String(s?.created_by_role || '').toLowerCase() === 'admin';
                    if (!isAdminX) return 'Utilisateur';
                    const isAchat = String(s?.sale_number || '').includes('PURCHASE-');
                    return `Admin${isAchat ? ' (achat)' : ' (transfert)'}`;
                  })();

                  const pay = s.payment_status === 'paid' ? 'Payé' : s.payment_status === 'partial' ? 'Partiellement payée' : 'Non payé';
                  const liv = s.delivery_status === 'preparing' ? 'Préparation' : s.delivery_status === 'in_transit' ? 'En transit' : s.delivery_status === 'delivered' ? 'Livrée' : s.delivery_status === 'canceled' ? 'Annulée' : (s.delivery_status || '-');

                  return `
                    <tr>
                      <td>${safe(num)}</td>
                      <td>${safe(type)}</td>
                      <td>${safe(s.stores?.name || '-')}</td>
                      <td>${safe(createdBy)}</td>
                      <td>${money(s.total_amount)}</td>
                      <td>${safe(pay)}</td>
                      <td>${safe(liv)}</td>
                      <td>${safe(new Date(s.created_at).toLocaleDateString('fr-FR'))}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </body>
        </html>
      `;

      const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Rapport_Transferts_Achats_${datePart}.xls`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Rapport exporté avec succès');
    } catch (e) {
      console.error('Error exporting transferts/achats Excel:', e);
      toast.error("Erreur lors de l'export Excel");
    }
  };

  const exportToPdf = () => {
    try {
      const doc = new jsPDF('l', 'mm', 'a4');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('RAPPORT - TRANSFERTS & ACHATS', 148.5, 14, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 148.5, 20, { align: 'center' });

      const rows = sortedSales.map((s: any) => {
        const type = String(s.sale_number || '').includes('TRANSFER-') ? 'Transfert' : 'Achat';
        const num = String(s.sale_number || '').replace(/^PURCHASE-/, 'ACHAT-').replace(/^TRANSFER-/, 'TRANSFERT-');
        const createdBy = (() => {
          const isAdminX = String(s?.created_by_role || '').toLowerCase() === 'admin';
          if (!isAdminX) return 'Utilisateur';
          const isAchat = String(s?.sale_number || '').includes('PURCHASE-');
          return `Admin${isAchat ? ' (achat)' : ' (transfert)'}`;
        })();

        const pay = s.payment_status === 'paid' ? 'Payé' : s.payment_status === 'partial' ? 'Partiellement payée' : 'Non payé';
        const liv = s.delivery_status === 'preparing' ? 'Préparation' : s.delivery_status === 'in_transit' ? 'En transit' : s.delivery_status === 'delivered' ? 'Livrée' : s.delivery_status === 'canceled' ? 'Annulée' : (s.delivery_status || '-');

        return [
          num,
          type,
          s.stores?.name || '-',
          createdBy,
          `${(Number(s.total_amount || 0) || 0).toFixed(2)} MAD`,
          pay,
          liv,
          new Date(s.created_at).toLocaleDateString('fr-FR'),
        ];
      });

      autoTable(doc, {
        head: [[
          'N° Opération',
          'Type',
          'Magasin',
          'Créé par',
          'Montant',
          'Paiement',
          'Statut Livraison',
          'Date',
        ]],
        body: rows,
        startY: 28,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [37, 99, 235] },
      });

      const datePart = new Date().toISOString().split('T')[0];
      doc.save(`Rapport_Transferts_Achats_${datePart}.pdf`);
      toast.success('PDF exporté avec succès');
      setShowPdfExportDialog(false);
    } catch (e) {
      console.error('Error exporting transferts/achats PDF:', e);
      toast.error("Erreur lors de l'export PDF");
    }
  };

  const totalTransfers = sortedSales.filter(s => s.sale_number?.includes('TRANSFER-')).length;
  const totalPurchases = sortedSales.filter(s => s.sale_number?.includes('PURCHASE-')).length;
  const preparingSales = sortedSales.filter(s => s.delivery_status === 'preparing').length;
  const inTransitSales = sortedSales.filter(s => s.delivery_status === 'in_transit').length;
  const deliveredSales = sortedSales.filter(s => s.delivery_status === 'delivered').length;

  // Show CreatePurchaseModule form if requested
  if (showCreateForm) {
    return (
      <div className="min-h-screen bg-gray-50">
        <CreatePurchaseModule 
          session={session}
          purchaseType={createFormType}
          adminSelectedMagasinId={userRole === 'admin' ? selectedMagasinForAdmin : null}
          onBack={() => {
            setShowCreateForm(false);
            setSelectedSale(null);
            fetchSales();
          }}
        />
      </div>
    );
  }

  // Show details page if requested
  if (showDetails && selectedSale) {
    return (
      <SalesDetailsPage
        sale={selectedSale}
        onBack={() => {
          setShowDetails(false);
          setSelectedSale(null);
        }}
        onUpdateStatus={updateSaleStatus}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="flex flex-wrap w-full bg-white p-1 h-auto gap-1 border-b border-gray-200 rounded-lg">
        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-blue-50 border-b-2 border-blue-500 text-blue-600 flex-1 min-w-max">
          <ShoppingCart className="w-5 h-5" />
          <span className="text-xs font-medium">Total</span>
          <span className="text-lg font-bold">{sortedSales.length}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-purple-50 border-b-2 border-purple-500 text-purple-600 flex-1 min-w-max">
          <ArrowRight className="w-5 h-5" />
          <span className="text-xs font-medium">Transferts</span>
          <span className="text-lg font-bold">{totalTransfers}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-green-50 border-b-2 border-green-500 text-green-600 flex-1 min-w-max">
          <Package className="w-5 h-5" />
          <span className="text-xs font-medium">Achats</span>
          <span className="text-lg font-bold">{totalPurchases}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-yellow-50 border-b-2 border-yellow-500 text-yellow-600 flex-1 min-w-max">
          <Package className="w-5 h-5" />
          <span className="text-xs font-medium">Préparation</span>
          <span className="text-lg font-bold">{preparingSales}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-blue-50 border-b-2 border-blue-500 text-blue-600 flex-1 min-w-max">
          <Truck className="w-5 h-5" />
          <span className="text-xs font-medium">En Transit</span>
          <span className="text-lg font-bold">{inTransitSales}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-green-50 border-b-2 border-green-500 text-green-600 flex-1 min-w-max">
          <CheckCircle className="w-5 h-5" />
          <span className="text-xs font-medium">Livrée</span>
          <span className="text-lg font-bold">{deliveredSales}</span>
        </div>
      </div>

      {/* Main Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Transferts & Achats de Produits
            </CardTitle>
            <div className="flex items-center gap-3">
              {userRole === 'admin' && (
                <div className="flex items-center gap-2 bg-purple-50 px-4 py-2 rounded-lg border border-purple-200">
                  <Label htmlFor="magasin_selector" className="text-sm font-semibold text-purple-700 whitespace-nowrap">
                    Magasin (Admin):
                  </Label>
                  <select
                    id="magasin_selector"
                    value={selectedMagasinForAdmin}
                    onChange={(e) => {
                      setSelectedMagasinForAdmin(e.target.value);
                      if (e.target.value) {
                        toast.success(`Vous êtes maintenant: ${stores.find(s => s.id === e.target.value)?.name || 'Magasin'}`);
                      }
                    }}
                    className="px-3 py-1 border border-purple-300 rounded-md bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">-- Sélectionner un magasin --</option>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name} (Magasin)
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                {userRole === 'admin' && selectedMagasinForAdmin && (
                  <div className="flex items-center bg-purple-100 border border-purple-200 text-purple-800 rounded-lg px-3 py-2 text-sm font-semibold">
                    Admin magasin sélectionné: <span className="ml-2 font-bold">{selectedMagasinNameForAdmin || '—'}</span>
                  </div>
                )}
                <Button onClick={exportToExcel} className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Download className="w-4 h-4 mr-2" />
                  Exporter Excel
                </Button>

                <Dialog open={showPdfExportDialog} onOpenChange={setShowPdfExportDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="border-blue-600 text-blue-700 hover:bg-blue-50">
                      <FileText className="w-4 h-4 mr-2" />
                      Exporter PDF
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Exporter le rapport (PDF)</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <p className="text-sm text-gray-600">
                        Ce PDF exporte la liste des transferts/achats filtrés en tableau.
                      </p>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setShowPdfExportDialog(false)}>Annuler</Button>
                        <Button onClick={exportToPdf} style={{ backgroundColor: '#ea580c', color: 'white' }}>Exporter</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <Button 
                  onClick={() => {
                    if (userRole === 'admin' && !selectedMagasinForAdmin) {
                      toast.error('Veuillez sélectionner un magasin (Admin) avant de créer un transfert');
                      return;
                    }
                    setCreateFormType('transfer');
                    setShowCreateForm(true);
                  }}
                  size="lg"
                  style={{ backgroundColor: '#f59e0b', color: 'white' }}
                >
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Créer un Transfert
                </Button>
                <Button 
                  onClick={() => {
                    if (userRole === 'admin' && !selectedMagasinForAdmin) {
                      toast.error('Veuillez sélectionner un magasin (Admin) avant de créer un achat');
                      return;
                    }
                    setCreateFormType('purchase');
                    setShowCreateForm(true);
                  }}
                  size="lg"
                  style={{ backgroundColor: '#16a34a', color: 'white' }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Créer un Achat
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Rechercher un transfert ou achat..."
                className="pl-10"
                value={searchTermTable}
                onChange={(e) => setSearchTermTable(e.target.value)}
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
                      <TableHead>
                        <button
                          type="button"
                          className="flex items-center gap-2 select-none"
                          title="Trier A→Z / Z→A"
                          onClick={() => {
                            setSortConfig((prev) => ({
                              key: 'operation_number',
                              direction: prev.key === 'operation_number' && prev.direction === 'asc' ? 'desc' : 'asc',
                            }));
                          }}
                        >
                          N° Opération
                          <span className="text-xs font-semibold text-blue-600">
                            {sortConfig.key === 'operation_number' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="flex items-center gap-2 select-none"
                          title="Trier A→Z / Z→A"
                          onClick={() => {
                            setSortConfig((prev) => ({
                              key: 'type',
                              direction: prev.key === 'type' && prev.direction === 'asc' ? 'desc' : 'asc',
                            }));
                          }}
                        >
                          Type
                          <span className="text-xs font-semibold text-blue-600">
                            {sortConfig.key === 'type' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="flex items-center gap-2 select-none"
                          title="Trier A→Z / Z→A"
                          onClick={() => {
                            setSortConfig((prev) => ({
                              key: 'store_name',
                              direction: prev.key === 'store_name' && prev.direction === 'asc' ? 'desc' : 'asc',
                            }));
                          }}
                        >
                          Magasin
                          <span className="text-xs font-semibold text-blue-600">
                            {sortConfig.key === 'store_name' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="flex items-center gap-2 select-none"
                          title="Trier A→Z / Z→A"
                          onClick={() => {
                            setSortConfig((prev) => ({
                              key: 'created_by',
                              direction: prev.key === 'created_by' && prev.direction === 'asc' ? 'desc' : 'asc',
                            }));
                          }}
                        >
                          Créé par
                          <span className="text-xs font-semibold text-blue-600">
                            {sortConfig.key === 'created_by' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="flex items-center gap-2 select-none"
                          title="Trier 0→9 / 9→0"
                          onClick={() => {
                            setSortConfig((prev) => ({
                              key: 'total_amount',
                              direction: prev.key === 'total_amount' && prev.direction === 'asc' ? 'desc' : 'asc',
                            }));
                          }}
                        >
                          Montant
                          <span className="text-xs font-semibold text-blue-600">
                            {sortConfig.key === 'total_amount' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="flex items-center gap-2 select-none"
                          title="Trier A→Z / Z→A"
                          onClick={() => {
                            setSortConfig((prev) => ({
                              key: 'payment_status',
                              direction: prev.key === 'payment_status' && prev.direction === 'asc' ? 'desc' : 'asc',
                            }));
                          }}
                        >
                          Paiement
                          <span className="text-xs font-semibold text-blue-600">
                            {sortConfig.key === 'payment_status' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="flex items-center gap-2 select-none"
                          title="Trier A→Z / Z→A"
                          onClick={() => {
                            setSortConfig((prev) => ({
                              key: 'delivery_status',
                              direction: prev.key === 'delivery_status' && prev.direction === 'asc' ? 'desc' : 'asc',
                            }));
                          }}
                        >
                          Statut de Livraison
                          <span className="text-xs font-semibold text-blue-600">
                            {sortConfig.key === 'delivery_status' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="flex items-center gap-2 select-none"
                          title="Trier date"
                          onClick={() => {
                            setSortConfig((prev) => ({
                              key: 'created_at',
                              direction: prev.key === 'created_at' && prev.direction === 'asc' ? 'desc' : 'asc',
                            }));
                          }}
                        >
                          Date
                          <span className="text-xs font-semibold text-blue-600">
                            {sortConfig.key === 'created_at' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        </button>
                      </TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedSales.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-gray-500 py-8">
                          Aucun transfert ou achat trouvé
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedSales.map((sale) => (
                        <TableRow key={sale.id}>
                          <TableCell className="font-medium">
                            {String(sale.sale_number || '')
                              .replace(/^PURCHASE-/, 'ACHAT-')
                              .replace(/^TRANSFER-/, 'TRANSFERT-')}
                          </TableCell>
                          <TableCell>
                            <Badge className={sale.sale_number?.includes('TRANSFER-') ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}>
                              {sale.sale_number?.includes('TRANSFER-') ? 'Transfert' : 'Achat'}
                            </Badge>
                          </TableCell>
                          <TableCell>{sale.stores?.name || '-'}</TableCell>
                      <TableCell>
                        {(() => {
                          const isAdmin = String(sale?.created_by_role || '').toLowerCase() === 'admin';
                          if (!isAdmin) return 'Utilisateur';

                          const isAchat = String(sale?.sale_number || '').includes('PURCHASE-');
                          const suffix = isAchat ? ' (achat)' : ' (transfert)';
                          return `Admin${suffix}`;
                        })()}
                      </TableCell>
                          <TableCell>
                            {(() => {
                              // Prevent double-counting bugs by preferring the persisted sale.total_amount.
                              // Some purchase/transfer payloads carry both `quantity` and `caisse`, which must NOT be added together.
                              const direct = Number((sale as any)?.total_amount);
                              if (Number.isFinite(direct)) return `${direct.toFixed(2)} MAD`;

                              // Fallback: compute from items using caisse ?? quantity
                              const items = Array.isArray((sale as any)?.sale_items)
                                ? (sale as any).sale_items
                                : (Array.isArray((sale as any)?.items) ? (sale as any).items : []);

                              const total = (items || []).reduce((sum: number, it: any) => {
                                const rawQty = it?.caisse ?? it?.quantity ?? 0;
                                const qty = typeof rawQty === 'string' ? Number(String(rawQty).replace(',', '.')) : Number(rawQty);

                                const rawUnit = it?.unit_price ?? it?.unitPrice ?? it?.purchase_price ?? it?.price ?? 0;
                                const unit = typeof rawUnit === 'string' ? Number(String(rawUnit).replace(',', '.')) : Number(rawUnit);

                                const q = Number.isFinite(qty) ? qty : 0;
                                const u = Number.isFinite(unit) ? unit : 0;
                                return sum + (q * u);
                              }, 0);

                              return `${(Number.isFinite(total) ? total : 0).toFixed(2)} MAD`;
                            })()}
                          </TableCell>
                          <TableCell>
                            <Badge className={getPaymentStatusColor(sale.payment_status)}>
                              {sale.payment_status === 'paid' ? 'Payé' : sale.payment_status === 'partial' ? 'Partiellement payée' : 'Non payé'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded text-sm ${getDeliveryStatusColor(sale.delivery_status)}`}>
                              {formatDeliveryStatus(sale.delivery_status)}
                            </span>
                          </TableCell>
                          <TableCell>{new Date(sale.created_at).toLocaleDateString('fr-FR')}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-2 justify-end items-center">
                              {sale.delivery_status === 'preparing' && (
                                <Button
                                  size="sm"
                                  style={{ backgroundColor: '#3b82f6', color: 'white' }}
                                  onClick={() => updateSaleStatus(sale.id, 'in_transit')}
                                  title="Confirmer que c'est en route"
                                >
                                  <Truck className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedSale(sale);
                                  setShowDetails(true);
                                }}
                                title="Voir les détails"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </div>
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
          <CardTitle className="text-blue-800">À propos des Transferts & Achats</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-blue-700 space-y-2">
            <p>• <strong>Transferts:</strong> Déplacez des produits entre vos magasins</p>
            <p>• <strong>Achats:</strong> Achetez des produits d'autres magasins</p>
            <p>• Remplissez le formulaire avec tous les détails et articles</p>
            <p>• Les articles sont sauvegardés avec référence de stock</p>
            <p>• Suivez l'état de chaque opération (Préparation, En transit, Livrée)</p>
            <p>• Tous les transferts et achats sont enregistrés dans l'historique</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
