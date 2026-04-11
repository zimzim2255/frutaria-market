import { useState, useEffect, useRef } from 'react';
import { projectId } from '../../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Plus, Edit, Trash2, Search, X, Image as ImageIcon, Upload, Eye } from 'lucide-react';
import { DialogDescription } from '../ui/dialog';
import { toast } from 'sonner';

interface ProductTemplatesModuleProps {
  session: any;
}

export function ProductTemplatesModule({ session }: ProductTemplatesModuleProps) {
  const [templates, setTemplates] = useState<any[]>([]);

  // Resolve role from DB (legacy permissions are no longer used for templates CRUD rules)
  const [currentUserRole, setCurrentUserRole] = useState<string>('user');
  const [currentUserPermissions, setCurrentUserPermissions] = useState<string[]>([]);

  const roleLower = String(currentUserRole || 'user').toLowerCase();
  const isAdmin = roleLower === 'admin';

  // Rules:
  // - Everyone can SEE templates
  // - Only admin can CREATE / EDIT / DELETE templates
  const canViewTemplates = true;
  const canAddTemplate = isAdmin;
  const canEditTemplate = isAdmin;
  const canDeleteTemplate = isAdmin;
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [displayLimit, setDisplayLimit] = useState(100);
  const [categories, setCategories] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    photo_url: '',
    description: '',
    reference: '',
    date_fin: '',
    fourchette_min: '',
    fourchette_max: '',
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);
  const [categorySuggestions, setCategorySuggestions] = useState<string[]>([]);
  const [fournisseurSuggestions, setFournisseurSuggestions] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null);
  const [duplicateReference, setDuplicateReference] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Veuillez sélectionner une image valide');
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('La taille de l\'image ne doit pas dépasser 5MB');
        return;
      }

      setPhotoFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadPhotoToStorage = async (): Promise<string | null> => {
    if (!photoFile) return formData.photo_url;

    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', photoFile);
      formDataUpload.append('folder', 'product-templates');

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/uploads/product-template`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: formDataUpload,
        }
      );

      if (response.ok) {
        const data = await response.json();
        return data.url;
      } else {
        toast.error('Erreur lors du téléchargement de l\'image');
        return null;
      }
    } catch (error: any) {
      console.error('Error uploading photo:', error);
      toast.error(`Erreur: ${error.message}`);
      return null;
    }
  };

  const checkDuplicateReference = async (reference: string): Promise<boolean> => {
    const exists = templates.some(t => 
      t.reference_number?.toLowerCase() === reference.toLowerCase() ||
      t.reference?.toLowerCase() === reference.toLowerCase()
    );
    return exists;
  };

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/product-templates`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
        
        // Extract unique categories
        const uniqueCategories = [...new Set((data.templates || []).map((t: any) => t.category))];
        setCategories(uniqueCategories.sort());
      } else {
        toast.error('Erreur lors du chargement des modèles');
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('Erreur lors du chargement des modèles');
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
      } else {
        console.error('Error fetching suppliers');
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    }
  };

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/users`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        if (!res.ok) return;
        const data = await res.json();
        const me = data.users?.find((u: any) => u.id === session.user.id);
        if (me) {
          setCurrentUserRole(String(me.role || 'user'));
          setCurrentUserPermissions(Array.isArray(me.permissions) ? me.permissions : []);
        }
      } catch (e) {
        console.warn('[ProductTemplatesModule] Could not resolve current user:', e);
      }
    };

    fetchMe();
    fetchTemplates();
    fetchSuppliers();
  }, []);

  // Reset pagination when filters change
  useEffect(() => {
    setDisplayLimit(100);
  }, [searchTerm, categoryFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingTemplate && !canAddTemplate) {
      toast.error("Vous n'avez pas la permission « Ajouter un Modèle de Produit »");
      return;
    }

    if (editingTemplate && !canEditTemplate) {
      toast.error("Vous n'avez pas la permission « Modifier un Modèle de Produit »");
      return;
    }

    const reference = String(formData.reference || '').trim();
    if (!reference) {
      toast.error('La référence est obligatoire');
      return;
    }

    const isDuplicate = await checkDuplicateReference(reference);
    if (isDuplicate && !editingTemplate) {
      toast.error('Cette référence existe déjà. Veuillez utiliser une autre référence.');
      setDuplicateReference(true);
      return;
    }

    setLoading(true);

    try {

      // Upload photo if a new file was selected
      let photoUrl = formData.photo_url;
      if (photoFile) {
        const uploadedUrl = await uploadPhotoToStorage();
        if (!uploadedUrl) {
          setLoading(false);
          return;
        }
        photoUrl = uploadedUrl;
      }

      const url = editingTemplate
        ? `https://${projectId}.supabase.co/functions/v1/super-handler/product-templates/${editingTemplate.id}`
        : `https://${projectId}.supabase.co/functions/v1/super-handler/product-templates`;

      const response = await fetch(url, {
        method: editingTemplate ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          ...formData,
          reference,
          photo_url: photoUrl,
        }),
      });

      if (response.ok) {
        toast.success(editingTemplate ? 'Modèle modifié' : 'Modèle ajouté');
        setDialogOpen(false);
        resetForm();
        setPhotoFile(null);
        setPhotoPreview('');
        fetchTemplates();
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

  const handleDelete = async (id: string) => {
    if (!canDeleteTemplate) {
      toast.error("Vous n'avez pas la permission « Supprimer un Modèle de Produit »");
      return;
    }

    if (!confirm('Êtes-vous sûr de vouloir supprimer ce modèle?')) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/product-templates/${id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        toast.success('Modèle supprimé');
        fetchTemplates();
      } else {
        toast.error('Erreur lors de la suppression');
      }
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      category: '',
      photo_url: '',
      description: '',
      reference: '',
      date_fin: '',
      fourchette_min: '',
      fourchette_max: '',
    });
    setEditingTemplate(null);
    setDuplicateReference(false);
  };

  const handleEdit = (template: any) => {
    if (!canEditTemplate) {
      // Silent no-op when button is disabled, but keep a safeguard.
      toast.error("Accès refusé: seuls les administrateurs peuvent modifier les modèles");
      return;
    }

    setEditingTemplate(template);
    setFormData({
      name: template.name,
      category: template.category,
      photo_url: template.photo_url || '',
      description: template.description || '',
      reference: template.reference || '',
      date_fin: template.date_fin || '',
      fourchette_min: template.fourchette_min || '',
      fourchette_max: template.fourchette_max || '',
    });
    setDialogOpen(true);
  };

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = 
      !searchTerm ||
      template.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.category?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = 
      categoryFilter === 'all' || 
      template.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  // Paginated templates (display only first `displayLimit` items)
  const paginatedTemplates = filteredTemplates.slice(0, displayLimit);

  if (!canViewTemplates) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Accès refusé</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">Vous n'avez pas la permission « Voir les Modèles de Produits ».</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-row justify-between items-center mb-8 w-full gap-4">
        <h1 className="text-3xl font-bold text-gray-900 flex-1">Modèles de Produits</h1>
          <Dialog open={dialogOpen} onOpenChange={(open: boolean) => {
            if (!open) {
              resetForm();
              setNameSuggestions([]);
              setCategorySuggestions([]);
            }
            setDialogOpen(open);
          }}>
          <DialogTrigger asChild>
            <Button 
              style={{ backgroundColor: '#16a34a' }} 
              className="text-white font-semibold hover:opacity-90"
              disabled={!canAddTemplate}
              title={!canAddTemplate ? "Accès refusé: seuls les administrateurs peuvent ajouter des modèles" : undefined}
            >
              <Plus className="w-4 h-4 mr-2" />
              Ajouter un modèle
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold">
                {editingTemplate ? '✏️ Modifier le modèle' : '➕ Ajouter un modèle'}
              </DialogTitle>
              <DialogDescription>
                Créez un modèle de produit qui pourra être utilisé comme suggestion lors de l'ajout de produits
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                {/* Name */}
                <div>
                  <Label htmlFor="name">Nom du produit</Label>
                  <div className="relative">
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => {
                        setFormData({ ...formData, name: e.target.value });
                        if (e.target.value.length > 0) {
                          const uniqueNames = [...new Set(templates.map(t => t.name).filter(Boolean))];
                          const filtered = uniqueNames.filter(name =>
                            name.toLowerCase().includes(e.target.value.toLowerCase())
                          );
                          setNameSuggestions(filtered);
                        } else {
                          setNameSuggestions([]);
                        }
                      }}
                      placeholder="Ex: Tomate, Pomme, Banane..."
                    />
                    {formData.name && nameSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-40 overflow-y-auto">
                        {nameSuggestions.map((name, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, name });
                              setNameSuggestions([]);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b last:border-b-0 transition text-sm"
                          >
                            <div className="font-medium text-gray-900">{name}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Category */}
                <div>
                  <Label htmlFor="category">Catégorie</Label>
                  <div className="relative">
                    <Input
                      id="category"
                      value={formData.category}
                      onChange={(e) => {
                        setFormData({ ...formData, category: e.target.value });
                        if (e.target.value.length > 0) {
                          const uniqueCategories: string[] = [...new Set(templates.map(t => t.category).filter(Boolean))];
                          const filtered = uniqueCategories.filter(cat =>
                            cat.toLowerCase().includes(e.target.value.toLowerCase())
                          );
                          setCategorySuggestions(filtered);
                        } else {
                          setCategorySuggestions([]);
                        }
                      }}
                      placeholder="Ex: Fruits, Légumes, Épices..."
                    />
                    {formData.category && categorySuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-40 overflow-y-auto">
                        {categorySuggestions.map((category, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, category });
                              setCategorySuggestions([]);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b last:border-b-0 transition text-sm"
                          >
                            <div className="font-medium text-gray-900">{category}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Photo Upload */}
                <div>
                  <Label htmlFor="photo">Photo du produit</Label>
                  <div className="mt-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoChange}
                      className="hidden"
                      id="photo"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition flex items-center justify-center gap-2 text-gray-600 hover:text-blue-600"
                    >
                      <Upload className="w-5 h-5" />
                      <span>Cliquez pour télécharger une image</span>
                    </button>
                    <p className="text-xs text-gray-500 mt-2">PNG, JPG, GIF jusqu'à 5MB</p>
                  </div>

                  {/* Photo Preview */}
                  {(photoPreview || formData.photo_url) && (
                    <div className="mt-4 p-3 border rounded-lg bg-gray-50">
                      <p className="text-xs font-semibold text-gray-600">Lien de la photo:</p>
                      <div className="text-xs text-gray-600 mt-2 truncate overflow-hidden" title={photoPreview || formData.photo_url}>
                        {(photoPreview || formData.photo_url).substring(0, 80)}...
                      </div>
                      {photoFile && (
                        <p className="text-xs text-gray-600 mt-2">
                          Fichier: {photoFile.name} ({(photoFile.size / 1024).toFixed(2)} KB)
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Description */}
                <div>
                  <Label htmlFor="description">Description</Label>
                  <textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Description optionnelle du produit..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                  />
                </div>

                {/* Reference */}
                <div>
                  <Label htmlFor="reference">Référence *</Label>
                  <div className="relative flex items-center gap-1">
                    <Input
                      id="reference"
                      value={formData.reference}
                      onChange={async (e) => {
                        const refValue = e.target.value;
                        setFormData({ ...formData, reference: refValue });
                        if (refValue.trim()) {
                          const isDuplicate = await checkDuplicateReference(refValue);
                          setDuplicateReference(isDuplicate);
                        } else {
                          setDuplicateReference(false);
                        }
                      }}
                      placeholder="Ex: PROD-001, SKU-ABC123..."
                      className="flex-1"
                      required
                      disabled={!!editingTemplate}
                      readOnly={!!editingTemplate}
                    />
                    {!editingTemplate && (
                      <button
                        type="button"
                        onClick={async () => {
                          const timestamp = Date.now().toString().slice(-6);
                          const randomNum = Math.floor(Math.random() * 1000);
                          const newRef = `P${timestamp}${randomNum}`;
                          setFormData({ ...formData, reference: newRef });
                          const isDuplicate = await checkDuplicateReference(newRef);
                          setDuplicateReference(isDuplicate);
                        }}
                        className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md font-semibold text-sm whitespace-nowrap transition"
                        title="Générer une référence"
                      >
                        🔄 Auto génèré
                      </button>
                    )}
                  </div>
                  {duplicateReference && (
                    <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                      ⚠️ Cette référence existe déjà dans la base de données
                    </p>
                  )}
                </div>

                {/* Fourchette Min and Max */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="fourchette_min">Fourchette Min</Label>
                    <Input
                      id="fourchette_min"
                      type="number"
                      step="0.01"
                      value={formData.fourchette_min}
                      onChange={(e) => setFormData({ ...formData, fourchette_min: e.target.value })}
                      placeholder="Ex: 10.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="fourchette_max">Fourchette Max</Label>
                    <Input
                      id="fourchette_max"
                      type="number"
                      step="0.01"
                      value={formData.fourchette_max}
                      onChange={(e) => setFormData({ ...formData, fourchette_max: e.target.value })}
                      placeholder="Ex: 20.5"
                    />
                  </div>
                </div>

                </div>

              {/* Form Actions */}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    setDialogOpen(false);
                    resetForm();
                  }}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold px-6 py-2 rounded-lg"
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={loading || duplicateReference}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded-lg disabled:opacity-50"
                >
                  {loading ? '⏳ Enregistrement...' : '✓ Enregistrer'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Rechercher un modèle..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 border rounded-md bg-white"
            >
              <option value="all">Toutes les catégories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Templates Table */}
      <Card>
        <CardHeader>
          <CardTitle>Liste des modèles ({filteredTemplates.length})</CardTitle>
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
                  <TableRow>
                    <TableHead>Photo</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Référence</TableHead>
                    <TableHead>Fourchette Min</TableHead>
                    <TableHead>Fourchette Max</TableHead>
                    <TableHead>Date Fin</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTemplates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-gray-500 py-8">
                        Aucun modèle trouvé
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedTemplates.map((template) => (
                      <TableRow key={template.id}>
                        <TableCell>
                          {template.photo_url ? (
                            <img 
                              src={template.photo_url} 
                              alt={template.name}
                              className="h-12 w-12 object-cover rounded"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="h-12 w-12 bg-gray-200 rounded flex items-center justify-center">
                              <ImageIcon className="w-6 h-6 text-gray-400" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-gray-900">{template.name}</TableCell>
                        <TableCell>
                          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
                            {template.category}
                          </span>
                        </TableCell>
                        <TableCell className="text-gray-600 text-sm max-w-xs truncate">
                          {template.description || '-'}
                        </TableCell>
                        <TableCell className="text-gray-600 text-sm">
                          {template.reference_number || '-'}
                        </TableCell>
                        <TableCell className="text-gray-600 text-sm">
                          {template.fourchette_min || '-'}
                        </TableCell>
                        <TableCell className="text-gray-600 text-sm">
                          {template.fourchette_max || '-'}
                        </TableCell>
                        <TableCell className="text-gray-600 text-sm">
                          {template.date_fin ? new Date(template.date_fin).toLocaleDateString('fr-FR') : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {template.photo_url && (
                              <Button
                                size="sm"
                                style={{ backgroundColor: '#8b5cf6' }}
                                className="text-white hover:opacity-90"
                                onClick={() => setViewingPhotoUrl(template.photo_url)}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              style={{ backgroundColor: '#2563eb' }}
                              className="text-white hover:opacity-90"
                              onClick={() => handleEdit(template)}
                              disabled={!canEditTemplate}
                              title={!canEditTemplate ? "Accès refusé: seuls les administrateurs peuvent modifier les modèles" : undefined}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              style={{ backgroundColor: '#dc2626' }}
                              className="text-white hover:opacity-90"
                              onClick={() => handleDelete(template.id)}
                              disabled={!canDeleteTemplate}
                              title={!canDeleteTemplate ? "Accès refusé: seuls les administrateurs peuvent supprimer les modèles" : undefined}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              
              {/* Voir plus button */}
              {filteredTemplates.length > displayLimit && (
                <div className="flex justify-center mt-4">
                  <Button
                    onClick={() => setDisplayLimit((prev) => prev + 100)}
                    variant="outline"
                    className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-300"
                  >
                    Voir plus ({filteredTemplates.length - displayLimit} restants)
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Photo Viewer Modal */}
      <Dialog open={!!viewingPhotoUrl} onOpenChange={(open) => {
        if (!open) setViewingPhotoUrl(null);
      }}>
        <DialogContent className="max-w-4xl w-full">
          <DialogHeader>
            <DialogTitle>Aperçu de la photo</DialogTitle>
            <button
              onClick={() => setViewingPhotoUrl(null)}
              className="absolute right-4 top-4 p-1 hover:bg-gray-200 rounded-full transition"
            >
              <X className="w-5 h-5" />
            </button>
          </DialogHeader>
          <div className="flex justify-center items-center bg-gray-100 rounded-lg p-8 max-h-96">
            {viewingPhotoUrl && (
              <img
                src={viewingPhotoUrl}
                alt="Product Photo"
                className="max-w-full max-h-full object-contain rounded-lg"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  const parent = (e.target as HTMLImageElement).parentElement;
                  if (parent) {
                    parent.innerHTML = '<div class="text-gray-500 text-center py-8">Impossible de charger l\'image</div>';
                  }
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
