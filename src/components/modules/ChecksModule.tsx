import { useState, useEffect } from 'react';
import { projectId } from '../../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Plus, Edit, Search, CreditCard, AlertTriangle, CheckCircle, MessageSquare, Clock } from 'lucide-react';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';

interface ChecksModuleProps {
  session: any;
}

export function ChecksModule({ session }: ChecksModuleProps) {
  const [checks, setChecks] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [partialPayments, setPartialPayments] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [selectedSaleForNotes, setSelectedSaleForNotes] = useState<any>(null);
  const [paymentNotes, setPaymentNotes] = useState('');
  const [editingCheck, setEditingCheck] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterName, setFilterName] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterAmountFrom, setFilterAmountFrom] = useState('');
  const [filterAmountTo, setFilterAmountTo] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [formData, setFormData] = useState({
    check_number: '',
    amount: '',
    issuer_name: '',
    bank_name: '',
    due_date: '',
    store_id: '',
    notes: '',
  });

  const fetchChecks = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/checks`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setChecks(data.checks || []);
      }
    } catch (error) {
      console.error('Error fetching checks:', error);
      toast.error('Erreur lors du chargement des chèques');
    }
  };

  const fetchSales = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/sales`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setSales(data.sales || []);
      }
    } catch (error) {
      console.error('Error fetching sales:', error);
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
      }
    } catch (error) {
      console.error('Error fetching partial payments:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchChecks(), fetchSales(), fetchStores(), fetchPartialPayments()]);
      setLoading(false);
    };
    loadData();
    
    // Refresh partial payments every 5 seconds
    const interval = setInterval(() => {
      fetchPartialPayments();
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url = editingCheck
        ? `https://${projectId}.supabase.co/functions/v1/super-handler/checks/${editingCheck.id}`
        : `https://${projectId}.supabase.co/functions/v1/super-handler/checks`;

      const response = await fetch(url, {
        method: editingCheck ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          check_number: formData.check_number,
          amount: parseFloat(formData.amount),
          issuer_name: formData.issuer_name,
          bank_name: formData.bank_name,
          due_date: formData.due_date,
          store_id: formData.store_id || null,
          notes: formData.notes,
        }),
      });

      if (response.ok) {
        toast.success(editingCheck ? 'Chèque modifié' : 'Chèque enregistré');
        setDialogOpen(false);
        resetForm();
        fetchChecks();
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

  const updateCheckStatus = async (checkId: string, newStatus: string) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/checks/${checkId}`,
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
        fetchChecks();
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
      check_number: '',
      amount: '',
      issuer_name: '',
      bank_name: '',
      due_date: '',
      store_id: '',
      notes: '',
    });
    setEditingCheck(null);
  };

  const handleEdit = (check: any) => {
    setEditingCheck(check);
    setFormData({
      check_number: check.check_number,
      amount: check.amount.toString(),
      issuer_name: check.issuer_name || '',
      bank_name: check.bank_name || '',
      due_date: check.due_date || '',
      store_id: check.store_id || '',
      notes: check.notes || '',
    });
    setDialogOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'deposited':
        return 'bg-blue-100 text-blue-800';
      case 'cleared':
        return 'bg-green-100 text-green-800';
      case 'bounced':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
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

  const filteredChecks = checks.filter(check => {
    // Search filter
    const matchesSearch = 
      check.check_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      check.issuer_name?.toLowerCase().includes(searchTerm.toLowerCase());

    // Name filter
    const matchesName = 
      !filterName || 
      check.issuer_name?.toLowerCase().includes(filterName.toLowerCase());

    // Date range filter
    const checkDate = new Date(check.due_date);
    const fromDate = filterDateFrom ? new Date(filterDateFrom) : null;
    const toDate = filterDateTo ? new Date(filterDateTo) : null;
    const matchesDateRange = 
      (!fromDate || checkDate >= fromDate) &&
      (!toDate || checkDate <= toDate);

    // Amount range filter
    const checkAmount = check.amount || 0;
    const amountFrom = filterAmountFrom ? parseFloat(filterAmountFrom) : null;
    const amountTo = filterAmountTo ? parseFloat(filterAmountTo) : null;
    const matchesAmountRange = 
      (!amountFrom || checkAmount >= amountFrom) &&
      (!amountTo || checkAmount <= amountTo);

    // Status filter
    const matchesStatus = 
      filterStatus === 'all' || check.status === filterStatus;

    return matchesSearch && matchesName && matchesDateRange && matchesAmountRange && matchesStatus;
  });

  const totalCheckValue = filteredChecks.reduce((sum, check) => sum + (check.amount || 0), 0);
  const pendingChecks = filteredChecks.filter(c => c.status === 'pending');
  const clearedChecks = filteredChecks.filter(c => c.status === 'cleared');
  const receivedChecks = filteredChecks.filter(c => c.status === 'deposited');
  const usedChecks = filteredChecks.filter(c => c.status === 'cleared' || c.status === 'bounced');

  return (
    <div className="space-y-6">
      {/* Checks Overview Cards - Navbar Style */}
      <div className="flex flex-wrap w-full bg-white p-1 h-auto gap-1 border-b border-gray-200 rounded-lg">
        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-blue-50 border-b-2 border-blue-500 text-blue-600 flex-1 min-w-max">
          <CreditCard className="w-5 h-5" />
          <span className="text-xs font-medium">Total Chèques</span>
          <span className="text-lg font-bold">{filteredChecks.length}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-yellow-50 border-b-2 border-yellow-500 text-yellow-600 flex-1 min-w-max">
          <AlertTriangle className="w-5 h-5" />
          <span className="text-xs font-medium">En attente</span>
          <span className="text-lg font-bold">{pendingChecks.length}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-green-50 border-b-2 border-green-500 text-green-600 flex-1 min-w-max">
          <CheckCircle className="w-5 h-5" />
          <span className="text-xs font-medium">Encaissés</span>
          <span className="text-lg font-bold">{clearedChecks.length}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-purple-50 border-b-2 border-purple-500 text-purple-600 flex-1 min-w-max">
          <CreditCard className="w-5 h-5" />
          <span className="text-xs font-medium">Valeur Totale</span>
          <span className="text-lg font-bold">{totalCheckValue.toFixed(0)}K MAD</span>
        </div>
      </div>

      
      {/* Pending Partial Payments Alert - COMMENTED OUT */}
      {/* {partialPayments.filter(p => p.confirmation_status === 'pending').length > 0 && (
        <Card className="bg-orange-50 border-2 border-orange-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-800">
              <Clock className="w-5 h-5" />
              Paiements Partiels en Attente de Confirmation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-orange-700">
                {partialPayments.filter(p => p.confirmation_status === 'pending').length} vente(s) avec paiement partiel en attente de confirmation de remise.
              </p>
              <div className="border-t border-orange-200 pt-3">
                <div className="space-y-2">
                  {partialPayments
                    .filter(p => p.confirmation_status === 'pending')
                    .slice(0, 5)
                    .map((payment) => (
                      <div key={payment.id} className="flex justify-between items-center p-3 bg-white rounded border border-orange-200">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">{payment.sales?.sale_number || 'N/A'}</p>
                          <p className="text-sm text-gray-600">Montant total: {payment.sales?.total_amount?.toFixed(2)} MAD</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-red-600">{payment.pending_discount?.toFixed(2)} MAD</p>
                          <p className="text-xs text-gray-600">Remise</p>
                        </div>
                      </div>
                    ))}
                  {partialPayments.filter(p => p.confirmation_status === 'pending').length > 5 && (
                    <p className="text-sm text-orange-700 font-semibold text-center pt-2">
                      +{partialPayments.filter(p => p.confirmation_status === 'pending').length - 5} autre(s) en attente
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )} */}

      {/* Filters Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Filtres Avancés
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="space-y-2">
              <Label htmlFor="filter-name">Nom du Bénéficiaire</Label>
              <Input
                id="filter-name"
                placeholder="Filtrer par nom..."
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-date-from">Date d'Exécution (De)</Label>
              <Input
                id="filter-date-from"
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-date-to">Date d'Exécution (À)</Label>
              <Input
                id="filter-date-to"
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-amount-from">Montant (De)</Label>
              <Input
                id="filter-amount-from"
                type="number"
                placeholder="Min..."
                value={filterAmountFrom}
                onChange={(e) => setFilterAmountFrom(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-amount-to">Montant (À)</Label>
              <Input
                id="filter-amount-to"
                type="number"
                placeholder="Max..."
                value={filterAmountTo}
                onChange={(e) => setFilterAmountTo(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-status">Statut</Label>
              <select
                id="filter-status"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-white"
              >
                <option value="all">Tous les statuts</option>
                <option value="pending">En attente</option>
                <option value="deposited">Reçus</option>
                <option value="cleared">Utilisés</option>
                <option value="bounced">Rejetés</option>
                <option value="cancelled">Annulés</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button
              onClick={() => {
                setFilterName('');
                setFilterDateFrom('');
                setFilterDateTo('');
                setFilterAmountFrom('');
                setFilterAmountTo('');
                setFilterStatus('all');
              }}
              variant="outline"
              className="text-gray-700"
            >
              Réinitialiser les filtres
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sales with Check Payment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Ventes par Chèque (Stock Partagé)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : sales.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <CreditCard className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Aucune vente enregistrée</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° Vente</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Statut Paiement</TableHead>
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
                          <TableCell className="font-medium">{sale.sale_number}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{customerInfo.Customer || 'Client Direct'}</p>
                              <p className="text-xs text-gray-600">{customerInfo.Phone || 'N/A'}</p>
                            </div>
                          </TableCell>
                          <TableCell className="font-semibold">{sale.total_amount?.toFixed(2)} MAD</TableCell>
                          <TableCell>
                            <Badge className={getPaymentStatusColor(sale.payment_status)}>
                              {sale.payment_status === 'paid' ? 'Payé' : sale.payment_status === 'partial' ? 'Partiellement payée' : 'Non payé'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(sale.delivery_status)}>
                              {sale.delivery_status === 'pending' ? 'En attente' :
                               sale.delivery_status === 'preparing' ? 'Préparation' :
                               sale.delivery_status === 'in_transit' ? 'En transit' :
                               sale.delivery_status === 'delivered' ? 'Livrée' :
                               sale.delivery_status === 'confirmed' ? 'Confirmée' : sale.delivery_status}
                            </Badge>
                          </TableCell>
                          <TableCell>{new Date(sale.created_at).toLocaleDateString('fr-FR')}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <select
                                value={sale.payment_status}
                                onChange={async (e) => {
                                  const newStatus = e.target.value;
                                  
                                  // Update local state immediately
                                  setSales(sales.map(s => 
                                    s.id === sale.id ? { ...s, payment_status: newStatus } : s
                                  ));

                                  try {
                                    const response = await fetch(
                                      `https://${projectId}.supabase.co/functions/v1/super-handler/sales/${sale.id}`,
                                      {
                                        method: 'PUT',
                                        headers: {
                                          'Content-Type': 'application/json',
                                          'Authorization': `Bearer ${session.access_token}`,
                                        },
                                        body: JSON.stringify({ payment_status: newStatus }),
                                      }
                                    );

                                    if (response.ok) {
                                      const statusLabels: { [key: string]: string } = {
                                        'paid': 'Payé',
                                        'partial': 'Partiellement payée',
                                        'unpaid': 'Non payé'
                                      };
                                      toast.success(`Paiement marqué comme: ${statusLabels[newStatus]}`);
                                      fetchSales();
                                    } else {
                                      const error = await response.json();
                                      toast.error(error.error || 'Erreur');
                                      // Revert on error
                                      setSales(sales.map(s => 
                                        s.id === sale.id ? { ...s, payment_status: sale.payment_status } : s
                                      ));
                                    }
                                  } catch (error: any) {
                                    toast.error(`Erreur: ${error.message}`);
                                    // Revert on error
                                    setSales(sales.map(s => 
                                      s.id === sale.id ? { ...s, payment_status: sale.payment_status } : s
                                    ));
                                  }
                                }}
                                className="px-2 py-1 border rounded text-sm"
                              >
                                <option value="unpaid">Non payé</option>
                                <option value="partial">Partiellement payée</option>
                                <option value="paid">Payé</option>
                              </select>
                              <Dialog open={notesDialogOpen && selectedSaleForNotes?.id === sale.id} onOpenChange={setNotesDialogOpen}>
                                <DialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant={sale.payment_notes ? "default" : "outline"}
                                    className={sale.payment_notes ? "bg-blue-500 hover:bg-blue-600 text-white" : ""}
                                    title={sale.payment_notes ? "Notes présentes" : "Ajouter une note"}
                                    onClick={() => {
                                      setSelectedSaleForNotes(sale);
                                      setPaymentNotes(sale.payment_notes || '');
                                    }}
                                  >
                                    <MessageSquare className="w-4 h-4" />
                                    {sale.payment_notes && <span className="ml-1 text-xs">✓</span>}
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-md">
                                  <DialogHeader>
                                    <DialogTitle>Notes de Paiement - {sale.sale_number}</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <div className="space-y-2">
                                      <Label htmlFor="payment_notes">Notes</Label>
                                      <textarea
                                        id="payment_notes"
                                        value={paymentNotes}
                                        onChange={(e) => setPaymentNotes(e.target.value)}
                                        placeholder="Ajouter des notes sur ce paiement..."
                                        className="w-full px-3 py-2 border rounded-md min-h-24"
                                      />
                                    </div>
                                    <div className="flex justify-end gap-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setNotesDialogOpen(false)}
                                      >
                                        Annuler
                                      </Button>
                                      <Button
                                        type="button"
                                        onClick={async () => {
                                          try {
                                            const response = await fetch(
                                              `https://${projectId}.supabase.co/functions/v1/super-handler/sales/${selectedSaleForNotes.id}`,
                                              {
                                                method: 'PUT',
                                                headers: {
                                                  'Content-Type': 'application/json',
                                                  'Authorization': `Bearer ${session.access_token}`,
                                                },
                                                body: JSON.stringify({ payment_notes: paymentNotes }),
                                              }
                                            );

                                            if (response.ok) {
                                              toast.success('Notes sauvegardées');
                                              setNotesDialogOpen(false);
                                              fetchSales();
                                            } else {
                                              const error = await response.json();
                                              toast.error(error.error || 'Erreur');
                                            }
                                          } catch (error: any) {
                                            toast.error(`Erreur: ${error.message}`);
                                          }
                                        }}
                                      >
                                        Sauvegarder
                                      </Button>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-green-50 border-green-200">
        <CardHeader>
          <CardTitle className="text-green-800">À propos des Chèques</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-green-700 space-y-2">
            <p>• Moyen de paiement privilégié pour les échanges inter-magasins</p>
            <p>• Lier chaque chèque à une commande spécifique pour traçabilité</p>
            <p>• Suivre l'encaissement et éviter les impayés</p>
            <p>• Important pour la gestion du cash-flow entre magasins</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
