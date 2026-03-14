import { useState, useEffect } from 'react';
import { projectId } from '../../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Plus, Search, DollarSign, TrendingDown, TrendingUp, AlertCircle, CheckCircle, Clock, Trash2, Eye } from 'lucide-react';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';

interface BorrowedMoneyModuleProps {
  session: any;
}

interface BorrowedMoney {
  id: string;
  borrower_name: string;
  borrower_phone?: string;
  borrower_email?: string;
  amount: number;
  loan_date: string;
  due_date?: string;
  status: string;
  notes?: string;
  created_at: string;
}

interface BorrowedMoneyPayment {
  id: string;
  borrowed_money_id: string;
  payment_amount: number;
  payment_method: string;
  payment_date: string;
  reference_number?: string;
  notes?: string;
}

interface BorrowedMoneyCheck {
  id: string;
  borrowed_money_payment_id: string;
  check_number: string;
  check_amount: number;
  check_date?: string;
  check_due_date?: string;
  bank_name?: string;
  check_status: string;
  inventory_name?: string;
}

export function BorrowedMoneyModule({ session }: BorrowedMoneyModuleProps) {
  const [borrowedMoneyList, setBorrowedMoneyList] = useState<BorrowedMoney[]>([]);
  const [payments, setPayments] = useState<BorrowedMoneyPayment[]>([]);
  const [checks, setChecks] = useState<BorrowedMoneyCheck[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string>('user');
  const [effectiveUserPermissions, setEffectiveUserPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedBorrowedMoney, setSelectedBorrowedMoney] = useState<BorrowedMoney | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // Form states
  const [formData, setFormData] = useState({
    lender_name: '',
    borrower_name: '',
    borrower_phone: '',
    borrower_email: '',
    amount: '',
    due_date: '',
    notes: '',
    payment_method: 'cash',
    reference_number: '',
    check_number: '',
    check_date: '',
    check_due_date: '',
    bank_name: '',
    inventory_name: '',
    transfer_file: null as File | null,
  });

  const [showCheckUploadDialogNew, setShowCheckUploadDialogNew] = useState(false);

  const [paymentFormData, setPaymentFormData] = useState({
    payment_amount: '',
    payment_method: 'cash',
    reference_number: '',
    notes: '',
    check_number: '',
    check_date: '',
    check_due_date: '',
    bank_name: '',
    inventory_name: '',
    transfer_file: null as File | null,
  });

  const [checkInventoryList, setCheckInventoryList] = useState<any[]>([]);
  const [showCheckUploadDialog, setShowCheckUploadDialog] = useState(false);

  // Coffer management state
  const [coffers, setCoffers] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedCofferId, setSelectedCofferId] = useState<string>('main');

  const hasPermission = (permission: string) => {
    if (currentUserRole === 'admin') return true;
    return effectiveUserPermissions.includes(permission);
  };

  const canViewBorrowedMoney = hasPermission('Voir les Prêts');
  const canAddBorrowedMoney = hasPermission('Ajouter un Prêt');
  const canAddBorrowedMoneyPayment = hasPermission('Enregistrer un Paiement de Prêt');
  const canDeleteBorrowedMoney = hasPermission('Supprimer un Prêt');
  const canViewBorrowedMoneyDetails = hasPermission("Voir le Détail d'un Prêt");

  // Fetch current user role + permissions
  useEffect(() => {
    const fetchCurrentUser = async () => {
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
          setCurrentUserRole(currentUser?.role || 'user');
          setEffectiveUserPermissions(Array.isArray(currentUser?.permissions) ? currentUser.permissions : []);
        }
      } catch (e) {
        console.warn('Error loading user permissions for borrowed money:', e);
      }
    };

    fetchCurrentUser();
  }, [session.access_token]);

  // Fetch borrowed money list
  const fetchBorrowedMoney = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/borrowed-money`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setBorrowedMoneyList(data.borrowed_money || []);
      }
    } catch (error) {
      console.error('Error fetching borrowed money:', error);
      toast.error('Erreur lors du chargement des prêts');
    }
  };

  // Fetch payments
  const fetchPayments = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/borrowed-money-payments`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setPayments(data.payments || []);
      }
    } catch (error) {
      console.error('Error fetching payments:', error);
    }
  };

  // Fetch checks
  const fetchChecks = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/borrowed-money-checks`,
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
    } finally {
      setLoading(false);
    }
  };

  // Load coffers from localStorage
  useEffect(() => {
    const storedCoffers = localStorage.getItem('coffers');
    if (storedCoffers) {
      try {
        const parsedCoffers = JSON.parse(storedCoffers);
        setCoffers(parsedCoffers);
      } catch (error) {
        console.error('Error parsing coffers from localStorage:', error);
        setCoffers([{ id: 'main', name: 'Coffre Principal' }]);
      }
    } else {
      setCoffers([{ id: 'main', name: 'Coffre Principal' }]);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      if (!canViewBorrowedMoney) {
        setLoading(false);
        return;
      }
      await Promise.all([fetchBorrowedMoney(), fetchPayments(), fetchChecks()]);
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewBorrowedMoney]);

  // Handle new borrowed money submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canAddBorrowedMoney) {
      toast.error("Vous n'avez pas la permission « Ajouter un Prêt »");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/borrowed-money`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            borrower_name: formData.borrower_name,
            borrower_phone: formData.borrower_phone || null,
            borrower_email: formData.borrower_email || null,
            amount: parseFloat(formData.amount),
            due_date: formData.due_date || null,
            notes: formData.notes || null,
          }),
        }
      );

      if (response.ok) {
        toast.success('Prêt enregistré avec succès');
        setDialogOpen(false);
        resetForm();
        fetchBorrowedMoney();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur lors de l\'enregistrement');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle payment submission
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canAddBorrowedMoneyPayment) {
      toast.error("Vous n'avez pas la permission « Enregistrer un Paiement de Prêt »");
      return;
    }

    if (!selectedBorrowedMoney) {
      toast.error('Veuillez sélectionner un prêt');
      return;
    }

    if (!paymentFormData.payment_amount || parseFloat(paymentFormData.payment_amount) <= 0) {
      toast.error('Veuillez entrer un montant de paiement valide');
      return;
    }

    const paymentAmount = parseFloat(paymentFormData.payment_amount);
    const remainingBalance = getRemainingBalance(selectedBorrowedMoney.id);

    if (paymentAmount > remainingBalance) {
      toast.error(`Le montant du paiement ne peut pas dépasser le solde restant (${remainingBalance.toFixed(2)} MAD)`);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/borrowed-money-payments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            borrowed_money_id: selectedBorrowedMoney.id,
            payment_amount: paymentAmount,
            payment_method: paymentFormData.payment_method,
            reference_number: paymentFormData.reference_number || null,
            notes: paymentFormData.notes || null,
            check_data: paymentFormData.payment_method === 'check' ? {
              check_number: paymentFormData.check_number,
              check_date: paymentFormData.check_date || null,
              check_due_date: paymentFormData.check_due_date || null,
              bank_name: paymentFormData.bank_name || null,
              inventory_name: paymentFormData.inventory_name || null,
              check_amount: paymentAmount,
            } : null,
          }),
        }
      );

      if (response.ok) {
        // Add payment to check_safe for all payment methods
        try {
          let checkSafeData: any = {
            amount: paymentAmount,
            status: 'pending',
            notes: `Payment from borrowed money - ${selectedBorrowedMoney.borrower_name}`,
          };

          if (paymentFormData.payment_method === 'check') {
            checkSafeData = {
              ...checkSafeData,
              check_number: paymentFormData.check_number,
              check_date: paymentFormData.check_date || null,
              check_due_date: paymentFormData.check_due_date || null,
              bank_name: paymentFormData.bank_name || null,
              inventory_name: paymentFormData.inventory_name || null,
              notes: `Check from borrowed money payment - ${selectedBorrowedMoney.borrower_name}`,
            };
          } else if (paymentFormData.payment_method === 'cash') {
            checkSafeData = {
              ...checkSafeData,
              check_number: `CASH-${Date.now()}`,
              inventory_name: `Cash payment from ${selectedBorrowedMoney.borrower_name}`,
              notes: `Cash payment from borrowed money - ${selectedBorrowedMoney.borrower_name}${paymentFormData.reference_number ? ` (Ref: ${paymentFormData.reference_number})` : ''}`,
            };
          } else if (paymentFormData.payment_method === 'bank_transfer') {
            checkSafeData = {
              ...checkSafeData,
              check_number: paymentFormData.reference_number || `TRANSFER-${Date.now()}`,
              inventory_name: `Bank transfer from ${selectedBorrowedMoney.borrower_name}`,
              notes: `Bank transfer from borrowed money - ${selectedBorrowedMoney.borrower_name}${paymentFormData.reference_number ? ` (Ref: ${paymentFormData.reference_number})` : ''}`,
            };
          }

          await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/check-safe`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify(checkSafeData),
            }
          );
        } catch (checkError) {
          console.error('Error adding payment to safe:', checkError);
          // Don't fail the payment if check safe addition fails
        }

        toast.success('Paiement enregistré avec succès');
        setPaymentDialogOpen(false);
        resetPaymentForm();
        setSelectedBorrowedMoney(null);
        fetchBorrowedMoney();
        fetchPayments();
        fetchChecks();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur lors de l\'enregistrement du paiement');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Delete borrowed money
  const deleteBorrowedMoney = async (id: string) => {
    if (!canDeleteBorrowedMoney) {
      toast.error("Vous n'avez pas la permission « Supprimer un Prêt »");
      return;
    }

    if (!confirm('Êtes-vous sûr de vouloir supprimer ce prêt?')) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/borrowed-money/${id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        toast.success('Prêt supprimé avec succès');
        fetchBorrowedMoney();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  // Calculate remaining balance
  const getRemainingBalance = (borrowedMoneyId: string): number => {
    const borrowedMoney = borrowedMoneyList.find(bm => bm.id === borrowedMoneyId);
    if (!borrowedMoney) return 0;

    const totalPaid = payments
      .filter(p => p.borrowed_money_id === borrowedMoneyId)
      .reduce((sum, p) => sum + (p.payment_amount || 0), 0);

    return borrowedMoney.amount - totalPaid;
  };

  // Get payment details for a borrowed money
  const getPaymentDetails = (borrowedMoneyId: string) => {
    const borrowedMoney = borrowedMoneyList.find(bm => bm.id === borrowedMoneyId);
    if (!borrowedMoney) return { totalPaid: 0, remainingBalance: 0, paymentCount: 0 };

    const borrowedMoneyPayments = payments.filter(p => p.borrowed_money_id === borrowedMoneyId);
    const totalPaid = borrowedMoneyPayments.reduce((sum, p) => sum + (p.payment_amount || 0), 0);
    const remainingBalance = borrowedMoney.amount - totalPaid;

    return {
      totalPaid,
      remainingBalance,
      paymentCount: borrowedMoneyPayments.length,
    };
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-blue-100 text-blue-800';
      case 'partially_paid':
        return 'bg-yellow-100 text-yellow-800';
      case 'fully_paid':
        return 'bg-green-100 text-green-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Get status label
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return 'Actif';
      case 'partially_paid':
        return 'Partiellement Payé';
      case 'fully_paid':
        return 'Entièrement Payé';
      case 'overdue':
        return 'En Retard';
      case 'cancelled':
        return 'Annulé';
      default:
        return status;
    }
  };

  // Get payment method icon and color
  const getPaymentMethodColor = (method: string) => {
    switch (method) {
      case 'cash':
        return 'bg-green-100 text-green-800';
      case 'check':
        return 'bg-blue-100 text-blue-800';
      case 'bank_transfer':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'cash':
        return 'Espèces';
      case 'check':
        return 'Chèque';
      case 'bank_transfer':
        return 'Virement Bancaire';
      default:
        return method;
    }
  };

  // Filter borrowed money
  const filteredBorrowedMoney = borrowedMoneyList.filter(bm => {
    const matchesSearch =
      bm.borrower_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bm.borrower_phone?.includes(searchTerm) ||
      bm.borrower_email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = filterStatus === 'all' || bm.status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  // Calculate statistics
  const totalBorrowed = filteredBorrowedMoney.reduce((sum, bm) => sum + (bm.amount || 0), 0);
  const totalPaidBack = filteredBorrowedMoney.reduce((sum, bm) => sum + getPaymentDetails(bm.id).totalPaid, 0);
  const totalRemaining = totalBorrowed - totalPaidBack;
  const activeBorrows = filteredBorrowedMoney.filter(bm => bm.status === 'active' || bm.status === 'partially_paid');
  const fullyPaidBorrows = filteredBorrowedMoney.filter(bm => bm.status === 'fully_paid');
  
  // Calculate total from all borrowed money (for header display)
  const allBorrowedMoney = borrowedMoneyList.reduce((sum, bm) => sum + (bm.amount || 0), 0);

  const resetForm = () => {
    setFormData({
      lender_name: '',
      borrower_name: '',
      borrower_phone: '',
      borrower_email: '',
      amount: '',
      due_date: '',
      notes: '',
      payment_method: 'cash',
      reference_number: '',
      check_number: '',
      check_date: '',
      check_due_date: '',
      bank_name: '',
      inventory_name: '',
      transfer_file: null,
    });
  };

  const resetPaymentForm = () => {
    setPaymentFormData({
      payment_amount: '',
      payment_method: 'cash',
      reference_number: '',
      notes: '',
      check_number: '',
      check_date: '',
      check_due_date: '',
      bank_name: '',
      inventory_name: '',
      transfer_file: null,
    });
  };

  if (!canViewBorrowedMoney) {
    return (
      <div className="space-y-6">
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
          <h1 className="text-xl font-bold text-red-700">Accès refusé</h1>
          <p className="text-sm text-red-600 mt-1">Vous n'avez pas la permission « Voir les Prêts ».</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="flex flex-wrap w-full bg-white p-1 h-auto gap-1 border-b border-gray-200 rounded-lg">
        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-blue-50 border-b-2 border-blue-500 text-blue-600 flex-1 min-w-max">
          <DollarSign className="w-5 h-5" />
          <span className="text-xs font-medium">Total Prêté</span>
          <span className="text-lg font-bold">{(totalBorrowed / 1000).toFixed(1)}K MAD</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-green-50 border-b-2 border-green-500 text-green-600 flex-1 min-w-max">
          <TrendingUp className="w-5 h-5" />
          <span className="text-xs font-medium">Remboursé</span>
          <span className="text-lg font-bold">{(totalPaidBack / 1000).toFixed(1)}K MAD</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-orange-50 border-b-2 border-orange-500 text-orange-600 flex-1 min-w-max">
          <TrendingDown className="w-5 h-5" />
          <span className="text-xs font-medium">Solde Restant</span>
          <span className="text-lg font-bold">{(totalRemaining / 1000).toFixed(1)}K MAD</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-purple-50 border-b-2 border-purple-500 text-purple-600 flex-1 min-w-max">
          <Clock className="w-5 h-5" />
          <span className="text-xs font-medium">Prêts Actifs</span>
          <span className="text-lg font-bold">{activeBorrows.length}</span>
        </div>

        <div className="flex flex-col items-center gap-1 py-2 px-6 rounded-lg transition-all bg-emerald-50 border-b-2 border-emerald-500 text-emerald-600 flex-1 min-w-max">
          <CheckCircle className="w-5 h-5" />
          <span className="text-xs font-medium">Remboursés</span>
          <span className="text-lg font-bold">{fullyPaidBorrows.length}</span>
        </div>
      </div>

      {/* Filters and Add Button */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Gestion des Prêts
            </CardTitle>
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              if (open && !canAddBorrowedMoney) {
                toast.error("Vous n'avez pas la permission « Ajouter un Prêt »");
                return;
              }
              setDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button disabled={!canAddBorrowedMoney} title={!canAddBorrowedMoney ? "Vous n'avez pas la permission « Ajouter un Prêt »" : undefined}>
                  <Plus className="w-4 h-4 mr-2" />
                  Nouveau Prêt
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Enregistrer un Nouveau Prêt</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Borrower Information */}
                  <div className="space-y-3">
                    <h3 className="font-semibold text-gray-700">Informations du Prêteur</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="borrower_name">Nom du Prêteur</Label>
                        <Input
                          id="borrower_name"
                          value={formData.borrower_name}
                          onChange={(e) => setFormData({ ...formData, borrower_name: e.target.value })}
                          placeholder="Ex: Ali Montaasion"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="amount">Montant (MAD)</Label>
                        <Input
                          id="amount"
                          type="number"
                          step="0.01"
                          value={formData.amount}
                          onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                          placeholder="10000000"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="borrower_phone">Téléphone</Label>
                        <Input
                          id="borrower_phone"
                          value={formData.borrower_phone}
                          onChange={(e) => setFormData({ ...formData, borrower_phone: e.target.value })}
                          placeholder="+212 6XX XXX XXX"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="borrower_email">Email</Label>
                        <Input
                          id="borrower_email"
                          type="email"
                          value={formData.borrower_email}
                          onChange={(e) => setFormData({ ...formData, borrower_email: e.target.value })}
                          placeholder="email@example.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="due_date">Date d'Échéance (optionnel)</Label>
                        <Input
                          id="due_date"
                          type="date"
                          value={formData.due_date}
                          onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label htmlFor="notes">Notes</Label>
                        <Input
                          id="notes"
                          value={formData.notes}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          placeholder="Détails supplémentaires..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Coffer Selection Section */}
                  <div className="space-y-3 border-t pt-4">
                    <h3 className="font-semibold text-gray-700">Sélectionner le Coffre</h3>
                    <div className="space-y-2">
                      <Label htmlFor="coffer_selection">Coffre-fort</Label>
                      <select
                        id="coffer_selection"
                        value={selectedCofferId}
                        onChange={(e) => setSelectedCofferId(e.target.value)}
                        className="w-full px-3 py-2 border rounded-md bg-white"
                      >
                        {coffers.map((coffer) => (
                          <option key={coffer.id} value={coffer.id}>
                            {coffer.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500">Sélectionnez le coffre-fort d'où provient ce prêt</p>
                    </div>
                  </div>

                  {/* Payment Method Section */}
                  <div className="space-y-3 border-t pt-4">
                    <h3 className="font-semibold text-gray-700">Méthode de Paiement (Optionnel)</h3>
                    <div className="space-y-2">
                      <Label htmlFor="payment_method">Sélectionner une méthode</Label>
                      <select
                        id="payment_method"
                        value={formData.payment_method}
                        onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md bg-white"
                      >
                        <option value="cash">Espèces (Cash)</option>
                        <option value="check">Chèque (Check)</option>
                        <option value="bank_transfer">Virement Bancaire (Bank Transfer)</option>
                      </select>
                    </div>

                    {/* Cash Payment Fields */}
                    {formData.payment_method === 'cash' && (
                      <div className="bg-green-50 p-4 rounded-lg border border-green-200 space-y-3">
                        <p className="text-sm font-semibold text-green-900">Détails du Paiement en Espèces</p>
                        <div className="space-y-2">
                          <Label htmlFor="cash_reference">Référence (optionnel)</Label>
                          <Input
                            id="cash_reference"
                            value={formData.reference_number}
                            onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                            placeholder="Ex: Reçu #123"
                          />
                        </div>
                      </div>
                    )}

                    {/* Check Payment Fields */}
                    {formData.payment_method === 'check' && (
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-blue-900">Détails du Chèque</p>
                          <Dialog open={showCheckUploadDialogNew} onOpenChange={setShowCheckUploadDialogNew}>
                            <DialogTrigger asChild>
                              <Button size="sm" style={{ backgroundColor: '#f59e0b' }} className="text-white hover:opacity-90">
                                + Ajouter Chèque
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-md">
                              <DialogHeader>
                                <DialogTitle>Uploader un Chèque à l'Inventaire</DialogTitle>
                              </DialogHeader>
                              <form onSubmit={async (e) => {
                                e.preventDefault();
                                // Upload check to inventory
                                setShowCheckUploadDialogNew(false);
                                toast.success('Chèque uploadé avec succès');
                              }} className="space-y-4">
                                <div className="space-y-2">
                                  <Label htmlFor="check_file_new">Fichier (Image ou PDF)</Label>
                                  <Input
                                    id="check_file_new"
                                    type="file"
                                    accept="image/*,.pdf"
                                  />
                                  <p className="text-xs text-gray-500">JPG, PNG ou PDF (Max 10MB)</p>
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor="check_id_new">ID du Chèque</Label>
                                  <Input
                                    id="check_id_new"
                                    placeholder="Ex: CHK-2024-001"
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor="check_amount_new">Montant (MAD)</Label>
                                  <Input
                                    id="check_amount_new"
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor="check_giver_new">Donneur du Chèque (Optionnel)</Label>
                                  <Input
                                    id="check_giver_new"
                                    placeholder="Tapez le nom d'un client..."
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor="check_date_new">Date du Chèque (Optionnel)</Label>
                                  <Input
                                    id="check_date_new"
                                    type="date"
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor="check_execution_date_new">Date d'Exécution (Optionnel)</Label>
                                  <Input
                                    id="check_execution_date_new"
                                    type="date"
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor="check_notes_new">Notes</Label>
                                  <Input
                                    id="check_notes_new"
                                    placeholder="Notes supplémentaires..."
                                  />
                                </div>

                                <div className="flex justify-end gap-2">
                                  <Button type="button" variant="outline" onClick={() => setShowCheckUploadDialogNew(false)}>
                                    Annuler
                                  </Button>
                                  <Button type="submit" style={{ backgroundColor: '#f59e0b' }} className="text-white hover:opacity-90">
                                    Uploader
                                  </Button>
                                </div>
                              </form>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    )}

                    {/* Bank Transfer Fields */}
                    {formData.payment_method === 'bank_transfer' && (
                      <div className="bg-purple-50 p-4 rounded-lg border border-purple-200 space-y-4">
                        <p className="text-sm font-semibold text-purple-900">Détails du Virement Bancaire</p>
                         <div className="space-y-2">
                          <Label htmlFor="transfer_file_new">Fichier de Preuve (Image ou PDF)</Label>
                          <Input
                            id="transfer_file_new"
                            type="file"
                            accept="image/*,.pdf"
                            onChange={(e) => setFormData({ ...formData, transfer_file: e.target.files?.[0] || null })}
                          />
                          <p className="text-xs text-purple-600">JPG, PNG ou PDF (Max 10MB)</p>
                          {formData.transfer_file && (
                            <p className="text-xs text-green-600 font-semibold">✓ Fichier sélectionné: {formData.transfer_file.name}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Annuler
                    </Button>
                    <Button type="submit" disabled={loading}>
                      {loading ? 'Enregistrement...' : 'Enregistrer le Prêt'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search">Recherche</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  id="search"
                  placeholder="Nom, téléphone, email..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
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
                <option value="active">Actif</option>
                <option value="partially_paid">Partiellement Payé</option>
                <option value="fully_paid">Entièrement Payé</option>
                <option value="overdue">En Retard</option>
                <option value="cancelled">Annulé</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button
                onClick={() => {
                  setSearchTerm('');
                  setFilterStatus('all');
                }}
                variant="outline"
                className="w-full text-gray-700"
              >
                Réinitialiser les filtres
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Borrowed Money Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Liste des Prêts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead>Prêteur</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Remboursé</TableHead>
                    <TableHead>Solde</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Date du Prêt</TableHead>
                    <TableHead>Échéance</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBorrowedMoney.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-gray-500 py-8">
                        Aucun prêt trouvé
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredBorrowedMoney.map((bm) => {
                      const paymentDetails = getPaymentDetails(bm.id);
                      return (
                        <TableRow key={bm.id} className="hover:bg-gray-50">
                          <TableCell className="font-medium">
                            <div>
                              <p className="font-semibold">{bm.borrower_name}</p>
                              {bm.borrower_phone && <p className="text-sm text-gray-600">{bm.borrower_phone}</p>}
                            </div>
                          </TableCell>
                          <TableCell className="font-semibold text-blue-600">
                            {bm.amount?.toFixed(2)} MAD
                          </TableCell>
                          <TableCell className="font-semibold text-green-600">
                            {paymentDetails.totalPaid?.toFixed(2)} MAD
                          </TableCell>
                          <TableCell className="font-semibold text-orange-600">
                            {paymentDetails.remainingBalance?.toFixed(2)} MAD
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(bm.status)}>
                              {getStatusLabel(bm.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {new Date(bm.loan_date).toLocaleDateString('fr-FR')}
                          </TableCell>
                          <TableCell className="text-sm">
                            {bm.due_date ? new Date(bm.due_date).toLocaleDateString('fr-FR') : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!canViewBorrowedMoneyDetails}
                                onClick={() => {
                                  if (!canViewBorrowedMoneyDetails) {
                                    toast.error("Vous n'avez pas la permission « Voir le Détail d'un Prêt »");
                                    return;
                                  }
                                  setSelectedBorrowedMoney(bm);
                                  setDetailsDialogOpen(true);
                                }}
                                title={!canViewBorrowedMoneyDetails ? "Vous n'avez pas la permission « Voir le Détail d'un Prêt »" : 'Voir les détails'}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>

                              {paymentDetails.remainingBalance > 0 && (
                                <Dialog open={paymentDialogOpen && selectedBorrowedMoney?.id === bm.id} onOpenChange={(open) => {
                                  setPaymentDialogOpen(open);
                                  if (!open) {
                                    resetPaymentForm();
                                    setSelectedBorrowedMoney(null);
                                  }
                                }}>
                                  <DialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      style={{ backgroundColor: '#16a34a' }}
                                      className="text-white hover:opacity-90"
                                      disabled={!canAddBorrowedMoneyPayment}
                                      onClick={() => {
                                        if (!canAddBorrowedMoneyPayment) {
                                          toast.error("Vous n'avez pas la permission « Enregistrer un Paiement de Prêt »");
                                          return;
                                        }
                                        setSelectedBorrowedMoney(bm);
                                        setPaymentDialogOpen(true);
                                      }}
                                      title={!canAddBorrowedMoneyPayment ? "Vous n'avez pas la permission « Enregistrer un Paiement de Prêt »" : undefined}
                                    >
                                      Paiement
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-2xl">
                                    <DialogHeader>
                                      <DialogTitle>Enregistrer un Paiement - {bm.borrower_name}</DialogTitle>
                                    </DialogHeader>
                                    <form onSubmit={handlePaymentSubmit} className="space-y-4">
                                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 space-y-2">
                                        <div className="flex justify-between">
                                          <span className="text-sm font-semibold text-blue-900">Montant Total du Prêt:</span>
                                          <span className="text-sm font-bold text-blue-600">{bm.amount?.toFixed(2)} MAD</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-sm font-semibold text-blue-900">Déjà Remboursé:</span>
                                          <span className="text-sm font-bold text-green-600">{paymentDetails.totalPaid?.toFixed(2)} MAD</span>
                                        </div>
                                        <div className="flex justify-between border-t border-blue-300 pt-2">
                                          <span className="text-sm font-semibold text-blue-900">Solde Restant:</span>
                                          <span className="text-sm font-bold text-orange-600">{paymentDetails.remainingBalance?.toFixed(2)} MAD</span>
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                          <Label htmlFor="payment_amount">Montant du Paiement (MAD) *</Label>
                                          <Input
                                            id="payment_amount"
                                            type="number"
                                            step="0.01"
                                            value={paymentFormData.payment_amount}
                                            onChange={(e) => setPaymentFormData({ ...paymentFormData, payment_amount: e.target.value })}
                                            placeholder="0.00"
                                            required
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label htmlFor="payment_method">Méthode de Paiement *</Label>
                                          <select
                                            id="payment_method"
                                            value={paymentFormData.payment_method}
                                            onChange={(e) => setPaymentFormData({ ...paymentFormData, payment_method: e.target.value })}
                                            className="w-full px-3 py-2 border rounded-md bg-white"
                                            required
                                          >
                                            <option value="cash">Espèces</option>
                                            <option value="check">Chèque</option>
                                            <option value="bank_transfer">Virement Bancaire</option>
                                          </select>
                                        </div>
                                      </div>

                                      {paymentFormData.payment_method === 'check' && (
                                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 space-y-4">
                                          <div className="flex items-center justify-between">
                                            <p className="text-sm font-semibold text-blue-900">Détails du Chèque</p>
                                            <Dialog open={showCheckUploadDialog} onOpenChange={setShowCheckUploadDialog}>
                                              <DialogTrigger asChild>
                                                <Button size="sm" style={{ backgroundColor: '#f59e0b' }} className="text-white hover:opacity-90">
                                                  + Ajouter Chèque
                                                </Button>
                                              </DialogTrigger>
                                              <DialogContent className="max-w-md">
                                                <DialogHeader>
                                                  <DialogTitle>Uploader un Chèque à l'Inventaire</DialogTitle>
                                                </DialogHeader>
                                                <form onSubmit={async (e) => {
                                                  e.preventDefault();
                                                  // This would open the check inventory upload dialog
                                                  setShowCheckUploadDialog(false);
                                                  toast.info('Veuillez utiliser le module Inventaire des Chèques pour uploader un chèque');
                                                }} className="space-y-4">
                                                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                                                    <p className="text-sm text-blue-700">Pour uploader un chèque à l'inventaire, veuillez:</p>
                                                    <ol className="list-decimal list-inside text-sm text-blue-700 mt-2 space-y-1">
                                                      <li>Aller au module "Inventaire des Chèques"</li>
                                                      <li>Cliquer sur "Uploader Chèque"</li>
                                                      <li>Remplir les détails du chèque</li>
                                                      <li>Revenir ici et sélectionner le chèque</li>
                                                    </ol>
                                                  </div>
                                                  <div className="flex justify-end gap-2">
                                                    <Button type="button" variant="outline" onClick={() => setShowCheckUploadDialog(false)}>
                                                      Fermer
                                                    </Button>
                                                  </div>
                                                </form>
                                              </DialogContent>
                                            </Dialog>
                                          </div>
                                          <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                              <Label htmlFor="check_number">Numéro de Chèque *</Label>
                                              <Input
                                                id="check_number"
                                                value={paymentFormData.check_number}
                                                onChange={(e) => setPaymentFormData({ ...paymentFormData, check_number: e.target.value })}
                                                placeholder="Ex: 123456"
                                                required
                                              />
                                            </div>
                                            <div className="space-y-2">
                                              <Label htmlFor="bank_name">Nom de la Banque</Label>
                                              <Input
                                                id="bank_name"
                                                value={paymentFormData.bank_name}
                                                onChange={(e) => setPaymentFormData({ ...paymentFormData, bank_name: e.target.value })}
                                                placeholder="Ex: Banque Marocaine"
                                              />
                                            </div>
                                            <div className="space-y-2">
                                              <Label htmlFor="check_date">Date du Chèque</Label>
                                              <Input
                                                id="check_date"
                                                type="date"
                                                value={paymentFormData.check_date}
                                                onChange={(e) => setPaymentFormData({ ...paymentFormData, check_date: e.target.value })}
                                              />
                                            </div>
                                            <div className="space-y-2">
                                              <Label htmlFor="check_due_date">Date d'Échéance du Chèque</Label>
                                              <Input
                                                id="check_due_date"
                                                type="date"
                                                value={paymentFormData.check_due_date}
                                                onChange={(e) => setPaymentFormData({ ...paymentFormData, check_due_date: e.target.value })}
                                              />
                                            </div>
                                            <div className="space-y-2 col-span-2">
                                              <Label htmlFor="inventory_name">Nom Spécial pour l'Inventaire *</Label>
                                              <Input
                                                id="inventory_name"
                                                value={paymentFormData.inventory_name}
                                                onChange={(e) => setPaymentFormData({ ...paymentFormData, inventory_name: e.target.value })}
                                                placeholder="Ex: Chèque de Ali Montaasion"
                                                required
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      {paymentFormData.payment_method === 'bank_transfer' && (
                                        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200 space-y-4">
                                          <p className="text-sm font-semibold text-purple-900">Détails du Virement Bancaire</p>
                                          <div className="space-y-2">
                                            <Label htmlFor="reference_number">Numéro de Référence de Virement</Label>
                                            <Input
                                              id="reference_number"
                                              value={paymentFormData.reference_number}
                                              onChange={(e) => setPaymentFormData({ ...paymentFormData, reference_number: e.target.value })}
                                              placeholder="Ex: REF-123456"
                                            />
                                          </div>
                                          <div className="space-y-2">
                                            <Label htmlFor="transfer_file">Fichier de Preuve (Image ou PDF)</Label>
                                            <Input
                                              id="transfer_file"
                                              type="file"
                                              accept="image/*,.pdf"
                                              onChange={(e) => setPaymentFormData({ ...paymentFormData, transfer_file: e.target.files?.[0] || null })}
                                            />
                                            <p className="text-xs text-purple-600">JPG, PNG ou PDF (Max 10MB)</p>
                                            {paymentFormData.transfer_file && (
                                              <p className="text-xs text-green-600 font-semibold">✓ Fichier sélectionné: {paymentFormData.transfer_file.name}</p>
                                            )}
                                          </div>
                                        </div>
                                      )}

                                      <div className="space-y-2">
                                        <Label htmlFor="payment_notes">Notes</Label>
                                        <Input
                                          id="payment_notes"
                                          value={paymentFormData.notes}
                                          onChange={(e) => setPaymentFormData({ ...paymentFormData, notes: e.target.value })}
                                          placeholder="Détails supplémentaires..."
                                        />
                                      </div>

                                      <div className="flex justify-end gap-2">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          onClick={() => {
                                            setPaymentDialogOpen(false);
                                            resetPaymentForm();
                                            setSelectedBorrowedMoney(null);
                                          }}
                                        >
                                          Annuler
                                        </Button>
                                        <Button type="submit" disabled={loading} style={{ backgroundColor: '#16a34a' }} className="text-white">
                                          {loading ? 'Enregistrement...' : 'Enregistrer le Paiement'}
                                        </Button>
                                      </div>
                                    </form>
                                  </DialogContent>
                                </Dialog>
                              )}

                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 hover:bg-red-50"
                                disabled={!canDeleteBorrowedMoney}
                                onClick={() => deleteBorrowedMoney(bm.id)}
                                title={!canDeleteBorrowedMoney ? "Vous n'avez pas la permission « Supprimer un Prêt »" : 'Supprimer'}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Détails du Prêt - {selectedBorrowedMoney?.borrower_name}</DialogTitle>
          </DialogHeader>
          {selectedBorrowedMoney && (() => {
            const paymentDetails = getPaymentDetails(selectedBorrowedMoney.id);
            const borrowedMoneyPayments = payments.filter(p => p.borrowed_money_id === selectedBorrowedMoney.id);
            const borrowedMoneyChecks = checks.filter(c => 
              borrowedMoneyPayments.some(p => p.id === c.borrowed_money_payment_id)
            );

            return (
              <div className="space-y-6">
                {/* Borrower Information */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <p className="text-xs text-blue-600 font-semibold mb-1">Nom du Prêteur</p>
                    <p className="text-lg font-bold text-blue-900">{selectedBorrowedMoney.borrower_name}</p>
                  </div>

                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <p className="text-xs text-green-600 font-semibold mb-1">Montant Total</p>
                    <p className="text-lg font-bold text-green-900">{selectedBorrowedMoney.amount?.toFixed(2)} MAD</p>
                  </div>

                  {selectedBorrowedMoney.borrower_phone && (
                    <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                      <p className="text-xs text-purple-600 font-semibold mb-1">Téléphone</p>
                      <p className="text-lg font-bold text-purple-900">{selectedBorrowedMoney.borrower_phone}</p>
                    </div>
                  )}

                  {selectedBorrowedMoney.borrower_email && (
                    <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                      <p className="text-xs text-indigo-600 font-semibold mb-1">Email</p>
                      <p className="text-lg font-bold text-indigo-900">{selectedBorrowedMoney.borrower_email}</p>
                    </div>
                  )}
                </div>

                {/* Payment Summary */}
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-3">
                  <p className="text-sm font-semibold text-gray-700">Résumé des Paiements</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white p-3 rounded border border-gray-300">
                      <p className="text-xs text-gray-600 font-semibold">Remboursé</p>
                      <p className="text-lg font-bold text-green-600">{paymentDetails.totalPaid?.toFixed(2)} MAD</p>
                    </div>
                    <div className="bg-white p-3 rounded border border-gray-300">
                      <p className="text-xs text-gray-600 font-semibold">Solde Restant</p>
                      <p className="text-lg font-bold text-orange-600">{paymentDetails.remainingBalance?.toFixed(2)} MAD</p>
                    </div>
                    <div className="bg-white p-3 rounded border border-gray-300">
                      <p className="text-xs text-gray-600 font-semibold">Nombre de Paiements</p>
                      <p className="text-lg font-bold text-blue-600">{paymentDetails.paymentCount}</p>
                    </div>
                  </div>
                </div>

                {/* Loan Details */}
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 space-y-2">
                  <p className="text-sm font-semibold text-blue-700">Détails du Prêt</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-900">Date du Prêt:</span>
                    <span className="font-mono">{new Date(selectedBorrowedMoney.loan_date).toLocaleString('fr-FR')}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-900">Statut:</span>
                    <Badge className={getStatusColor(selectedBorrowedMoney.status)}>
                      {getStatusLabel(selectedBorrowedMoney.status)}
                    </Badge>
                  </div>
                  {selectedBorrowedMoney.due_date && (
                    <div className="flex justify-between text-sm">
                      <span className="text-blue-900">Date d'Échéance:</span>
                      <span className="font-mono">{new Date(selectedBorrowedMoney.due_date).toLocaleDateString('fr-FR')}</span>
                    </div>
                  )}
                  {selectedBorrowedMoney.notes && (
                    <div className="mt-3 pt-3 border-t border-blue-300">
                      <p className="text-xs text-blue-600 font-semibold mb-1">Notes</p>
                      <p className="text-sm text-blue-800">{selectedBorrowedMoney.notes}</p>
                    </div>
                  )}
                </div>

                {/* Payments History */}
                {borrowedMoneyPayments.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-gray-700">Historique des Paiements</p>
                    <div className="border rounded-lg overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50">
                            <TableHead>Date</TableHead>
                            <TableHead>Montant</TableHead>
                            <TableHead>Méthode</TableHead>
                            <TableHead>Référence</TableHead>
                            <TableHead>Notes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {borrowedMoneyPayments.map((payment) => (
                            <TableRow key={payment.id}>
                              <TableCell className="text-sm">
                                {new Date(payment.payment_date).toLocaleDateString('fr-FR')}
                              </TableCell>
                              <TableCell className="font-semibold text-green-600">
                                {payment.payment_amount?.toFixed(2)} MAD
                              </TableCell>
                              <TableCell>
                                <Badge className={getPaymentMethodColor(payment.payment_method)}>
                                  {getPaymentMethodLabel(payment.payment_method)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">{payment.reference_number || '-'}</TableCell>
                              <TableCell className="text-sm">{payment.notes || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Checks Inventory */}
                {borrowedMoneyChecks.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-gray-700">Chèques en Inventaire</p>
                    <div className="border rounded-lg overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50">
                            <TableHead>Numéro de Chèque</TableHead>
                            <TableHead>Montant</TableHead>
                            <TableHead>Banque</TableHead>
                            <TableHead>Nom d'Inventaire</TableHead>
                            <TableHead>Statut</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {borrowedMoneyChecks.map((check) => (
                            <TableRow key={check.id}>
                              <TableCell className="font-mono font-semibold">{check.check_number}</TableCell>
                              <TableCell className="font-semibold text-blue-600">
                                {check.check_amount?.toFixed(2)} MAD
                              </TableCell>
                              <TableCell className="text-sm">{check.bank_name || '-'}</TableCell>
                              <TableCell className="text-sm font-medium">{check.inventory_name || '-'}</TableCell>
                              <TableCell>
                                <Badge className={getStatusColor(check.check_status)}>
                                  {check.check_status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button
                    onClick={() => setDetailsDialogOpen(false)}
                    style={{ backgroundColor: '#d1d5db' }}
                    className="text-gray-800 hover:opacity-90"
                  >
                    Fermer
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-800 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            À propos de la Gestion des Prêts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-blue-700 space-y-3">
            <p className="font-semibold">Fonctionnalités principales:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li><strong>Enregistrement des Prêts:</strong> Enregistrez les montants prêtés avec les détails du prêteur</li>
              <li><strong>Suivi des Remboursements:</strong> Enregistrez les paiements partiels ou complets</li>
              <li><strong>Méthodes de Paiement:</strong> Espèces, Chèques, ou Virements Bancaires</li>
              <li><strong>Gestion des Chèques:</strong> Sauvegardez les chèques reçus dans l'inventaire avec un nom spécial</li>
              <li><strong>Statuts Automatiques:</strong> Les statuts se mettent à jour automatiquement selon les paiements</li>
              <li><strong>Historique Complet:</strong> Consultez tous les paiements et détails de chaque prêt</li>
            </ul>
            <div className="mt-4 p-3 bg-blue-100 rounded-lg border border-blue-300">
              <p className="text-sm italic text-blue-800">
                💡 <strong>Conseil:</strong> Lorsque vous enregistrez un paiement par chèque, donnez-lui un nom spécial dans l'inventaire (ex: "Chèque de Ali Montaasion") pour une meilleure traçabilité.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
