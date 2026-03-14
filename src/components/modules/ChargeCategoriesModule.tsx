import { useState, useEffect } from 'react';
import { projectId } from '../../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Plus, Edit, Trash2, Search, AlertCircle } from 'lucide-react';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';

interface ChargeCategoriesModuleProps {
  session: any;
}

export function ChargeCategoriesModule({ session }: ChargeCategoriesModuleProps) {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#3b82f6',
    status: 'active',
  });

  // Check if user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      try {
        if (session?.user?.user_metadata?.role === 'admin') {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      }
    };

    checkAdmin();
  }, [session]);

  // Fetch categories
  const fetchCategories = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/charge-categories`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      } else {
        toast.error('Erreur lors du chargement des catégories');
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error('Erreur lors du chargement des catégories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);

    try {
      const url = editingCategory
        ? `https://${projectId}.supabase.co/functions/v1/super-handler/charge-categories/${editingCategory.id}`
        : `https://${projectId}.supabase.co/functions/v1/super-handler/charge-categories`;

      const response = await fetch(url, {
        method: editingCategory ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast.success(
          editingCategory
            ? 'Catégorie modifiée avec succès'
            : 'Catégorie créée avec succès'
        );
        setDialogOpen(false);
        resetForm();
        fetchCategories();
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

  // Handle delete
  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette catégorie?')) return;

    try {
      setLoading(true);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/charge-categories/${id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        toast.success('Catégorie supprimée avec succès');
        fetchCategories();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur lors de la suppression');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      color: '#3b82f6',
      status: 'active',
    });
    setEditingCategory(null);
  };

  // Handle edit
  const handleEdit = (category: any) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || '',
      color: category.color || '#3b82f6',
      status: category.status || 'active',
    });
    setDialogOpen(true);
  };

  // Filter categories
  const filteredCategories = categories.filter((category) =>
    category.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    category.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Admin check UI
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="max-w-md border-red-200 bg-red-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-6 h-6 text-red-600" />
              <CardTitle className="text-red-600">Accès Refusé</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">
              Seuls les administrateurs peuvent accéder à cette page. Veuillez contacter un administrateur si vous pensez que c'est une erreur.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Catégories de Charges</h1>
          <p className="text-gray-600 mt-1">Gérez les catégories de charges (électricité, eau, etc.)</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: '#16a34a' }} className="text-white">
              <Plus className="w-4 h-4 mr-2" />
              Nouvelle Catégorie
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? 'Modifier la Catégorie' : 'Créer une Nouvelle Catégorie'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nom de la Catégorie</Label>
                <Input
                  id="name"
                  placeholder="Ex: Électricité, Eau, Gaz..."
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="Description de la catégorie"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="color">Couleur</Label>
                <div className="flex gap-2">
                  <Input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-16 h-10 cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    placeholder="#3b82f6"
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Statut</Label>
                <select
                  id="status"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="active">Actif</option>
                  <option value="inactive">Inactif</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDialogOpen(false);
                    resetForm();
                  }}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  style={{ backgroundColor: '#16a34a' }}
                  className="text-white"
                >
                  {loading ? 'Enregistrement...' : editingCategory ? 'Modifier' : 'Créer'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-gray-400" />
            <Input
              placeholder="Rechercher une catégorie..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border-0 focus-visible:ring-0"
            />
          </div>
        </CardHeader>
      </Card>

      {/* Categories Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Catégories ({filteredCategories.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">
              Chargement...
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Aucune catégorie trouvée
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Couleur</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Créé par</TableHead>
                    <TableHead>Date de Création</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCategories.map((category) => (
                    <TableRow key={category.id}>
                      <TableCell className="font-semibold">
                        {category.name}
                      </TableCell>
                      <TableCell className="text-gray-600 max-w-xs truncate">
                        {category.description || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded border"
                            style={{ backgroundColor: category.color || '#3b82f6' }}
                          />
                          <span className="text-sm text-gray-600">
                            {category.color || '#3b82f6'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            category.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }
                        >
                          {category.status === 'active' ? 'Actif' : 'Inactif'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {category.created_by_email || '-'}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {category.created_at
                          ? new Date(category.created_at).toLocaleDateString('fr-FR')
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(category)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(category.id)}
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

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">ℹ️ Information</CardTitle>
        </CardHeader>
        <CardContent className="text-blue-800 space-y-2">
          <p>
            • Les catégories créées ici seront utilisées pour classer les charges (électricité, eau, gaz, etc.)
          </p>
          <p>
            • Seuls les administrateurs peuvent créer, modifier ou supprimer des catégories
          </p>
          <p>
            • Les catégories inactives ne seront pas visibles aux utilisateurs normaux
          </p>
          <p>
            • Vous pouvez utiliser des emojis pour les icônes (⚡, 💧, 🔥, 📱, etc.)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
