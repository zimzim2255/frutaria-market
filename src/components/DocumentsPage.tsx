import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Download, Eye, Trash2, Search, FileText } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { DocumentFormDialog } from './DocumentFormDialog';
import { projectId } from '../utils/supabase/info';

interface Document {
  id: string;
  type: string;
  clientName: string;
  clientEmail: string;
  date: string;
  totalWithTVA: number;
  created_at: string;
}

interface DocumentsPageProps {
  session: any;
}

export function DocumentsPage({ session }: DocumentsPageProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Filter documents based on search
  const filteredDocuments = documents.filter(doc =>
    doc.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDownloadPDF = async (documentId: string) => {
    try {
      setLoading(true);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/documents/${documentId}/pdf`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Erreur lors du téléchargement du PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${documentId}.pdf`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);

      toast.success('PDF téléchargé avec succès');
    } catch (error: any) {
      console.error('Error downloading PDF:', error);
      toast.error(error.message || 'Erreur lors du téléchargement');
    } finally {
      setLoading(false);
    }
  };

  const handleViewPreview = (document: Document) => {
    setSelectedDocument(document);
    setPreviewOpen(true);
  };

  const handleDeleteDocument = (documentId: string) => {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce document?')) {
      setDocuments(documents.filter(doc => doc.id !== documentId));
      toast.success('Document supprimé');
    }
  };

  const handleDocumentCreated = (documentId: string) => {
    // In a real app, you would fetch the document details from the backend
    // For now, we'll just show a success message
    toast.success(`Document créé: ${documentId}`);
  };

  const getDocumentTypeColor = (type: string) => {
    switch (type) {
      case 'Facture':
        return 'bg-blue-100 text-blue-800';
      case 'Devis':
        return 'bg-green-100 text-green-800';
      case 'Bon Commande':
        return 'bg-purple-100 text-purple-800';
      case 'Bon Livraison':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Documents</h1>
          <p className="text-gray-600 mt-1">Gérez vos factures, devis et bons de commande</p>
        </div>
        <DocumentFormDialog session={session} onDocumentCreated={handleDocumentCreated} />
      </div>

      {/* Search Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Rechercher par client ou numéro de document..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Documents List */}
      <Card>
        <CardHeader>
          <CardTitle>Tous les Documents ({filteredDocuments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredDocuments.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">Aucun document trouvé</p>
              <p className="text-sm text-gray-500 mt-1">Cr��ez votre premier document pour commencer</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Numéro</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Type</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Client</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Date</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Montant</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredDocuments.map((doc) => (
                    <tr key={doc.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{doc.id}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getDocumentTypeColor(doc.type)}`}>
                          {doc.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{doc.clientName}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{formatDate(doc.date)}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">
                        {doc.totalWithTVA.toFixed(2)} MAD
                      </td>
                      <td className="px-6 py-4 text-sm text-right space-x-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleViewPreview(doc)}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDownloadPDF(doc.id)}
                          disabled={loading}
                          className="text-green-600 hover:text-green-700"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Aperçu du Document - {selectedDocument?.id}</DialogTitle>
          </DialogHeader>
          {selectedDocument && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Type</p>
                  <p className="font-semibold">{selectedDocument.type}</p>
                </div>
                <div>
                  <p className="text-gray-600">Date</p>
                  <p className="font-semibold">{formatDate(selectedDocument.date)}</p>
                </div>
                <div>
                  <p className="text-gray-600">Client</p>
                  <p className="font-semibold">{selectedDocument.clientName}</p>
                </div>
                <div>
                  <p className="text-gray-600">Email</p>
                  <p className="font-semibold">{selectedDocument.clientEmail}</p>
                </div>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Montant Total TTC</p>
                <p className="text-2xl font-bold text-blue-600">{selectedDocument.totalWithTVA.toFixed(2)} MAD</p>
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={() => handleDownloadPDF(selectedDocument.id)}
                  disabled={loading}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Télécharger PDF
                </Button>
                <Button
                  onClick={() => setPreviewOpen(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Fermer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
