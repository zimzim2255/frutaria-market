import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Plus, Trash2, Download, Eye } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { projectId } from '../utils/supabase/info';

interface DocumentItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface DocumentFormData {
  type: 'Facture' | 'Devis' | 'Bon Commande' | 'Bon Livraison';
  clientName: string;
  clientEmail: string;
  clientAddress: string;
  clientICE: string;
  date: string;
  items: DocumentItem[];
  notes: string;
  paymentHeaderNote: string;
  remise: number;
}

interface DocumentFormDialogProps {
  session: any;
  onDocumentCreated?: (documentId: string) => void;
}

export function DocumentFormDialog({ session, onDocumentCreated }: DocumentFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<DocumentFormData>({
    type: 'Facture',
    clientName: '',
    clientEmail: '',
    clientAddress: '',
    clientICE: '',
    date: new Date().toISOString().split('T')[0],
    items: [],
    notes: '',
    paymentHeaderNote: '',
    remise: 0,
  });
  const [newItem, setNewItem] = useState<DocumentItem>({
    description: '',
    quantity: 1,
    unitPrice: 0,
    total: 0,
  });

  // Calculate totals
  const subtotal = formData.items.reduce((sum, item) => sum + item.total, 0);
  const remiseAmount = subtotal * (formData.remise / 100);
  const subtotalAfterRemise = subtotal - remiseAmount;
  const tva = subtotalAfterRemise * 0.20;
  const totalWithTVA = subtotalAfterRemise + tva;

  const handleAddItem = () => {
    if (!newItem.description || newItem.quantity <= 0 || newItem.unitPrice <= 0) {
      toast.error('Veuillez remplir tous les champs de l\'article');
      return;
    }

    const itemWithTotal = {
      ...newItem,
      total: newItem.quantity * newItem.unitPrice,
    };

    setFormData({
      ...formData,
      items: [...formData.items, itemWithTotal],
    });

    setNewItem({
      description: '',
      quantity: 1,
      unitPrice: 0,
      total: 0,
    });

    toast.success('Article ajouté');
  };

  const handleRemoveItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    });
  };

  const handleGeneratePreview = () => {
    if (!formData.clientName || formData.items.length === 0) {
      toast.error('Veuillez remplir les informations client et ajouter des articles');
      return;
    }

    const htmlContent = generatePDFContent();
    const newWindow = window.open('', '_blank');
    if (newWindow) {
      newWindow.document.write(htmlContent);
      newWindow.document.close();
    }
  };

  const generatePDFContent = (): string => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${formData.type} - ${formData.clientName}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'Helvetica Neue', Arial, sans-serif;
            background: white;
            color: #333;
          }
          .page {
            width: 210mm;
            height: 297mm;
            margin: 0;
            padding: 40px;
            page-break-after: always;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 40px;
            border-bottom: 2px solid #ff9900;
            padding-bottom: 20px;
          }
          .company-info h1 {
            color: #ff9900;
            font-size: 24px;
            margin-bottom: 10px;
          }
          .document-title {
            text-align: right;
          }
          .document-title h2 {
            color: #ff9900;
            font-size: 20px;
            margin-bottom: 5px;
          }
          .document-title p {
            font-size: 12px;
            color: #666;
          }
          .content {
            margin-bottom: 30px;
          }
          .section {
            margin-bottom: 30px;
          }
          .section-title {
            color: #ff9900;
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 10px;
            border-bottom: 1px solid #ff9900;
            padding-bottom: 5px;
          }
          .client-info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            font-size: 12px;
            line-height: 1.8;
          }
          .client-info p {
            margin-bottom: 5px;
          }
          .client-info strong {
            display: inline-block;
            width: 80px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            font-size: 11px;
          }
          table thead {
            background-color: #f5f5f5;
            border-bottom: 2px solid #ff9900;
          }
          table th {
            padding: 10px;
            text-align: left;
            font-weight: bold;
            color: #333;
          }
          table td {
            padding: 8px 10px;
            border-bottom: 1px solid #eee;
          }
          table tr:hover {
            background-color: #fafafa;
          }
          .text-right {
            text-align: right;
          }
          .totals {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 30px;
          }
          .totals-box {
            width: 300px;
            font-size: 12px;
          }
          .totals-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #eee;
          }
          .totals-row.total {
            border-top: 2px solid #ff9900;
            border-bottom: 2px solid #ff9900;
            font-weight: bold;
            font-size: 14px;
            color: #ff9900;
            padding: 12px 0;
            margin-top: 10px;
          }
          .notes {
            background-color: #f9f9f9;
            padding: 15px;
            border-left: 3px solid #ff9900;
            font-size: 11px;
            line-height: 1.6;
          }
          .notes-title {
            font-weight: bold;
            color: #ff9900;
            margin-bottom: 5px;
          }
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            text-align: center;
            font-size: 10px;
            color: #999;
          }
          @media print {
            body { margin: 0; padding: 0; }
            .page { margin: 0; padding: 40px; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="company-info">
              <h1>Frutaria Market</h1>
              <p style="font-size: 12px; color: #666;">Maroc</p>
            </div>
            <div class="document-title">
              <h2>${formData.type}</h2>
              <p>Date: ${new Date(formData.date).toLocaleDateString('fr-FR')}</p>
            </div>
          </div>

          <div class="content">
            <div class="section">
              <div class="section-title">Informations Client</div>
              <div class="client-info">
                <div>
                  <p><strong>Client:</strong> ${formData.clientName}</p>
                  <p><strong>Email:</strong> ${formData.clientEmail}</p>
                  <p><strong>Adresse:</strong> ${formData.clientAddress}</p>
                  <p><strong>ICE:</strong> ${formData.clientICE || 'N/A'}</p>
                </div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Articles</div>
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th class="text-right">Quantité</th>
                    <th class="text-right">Prix Unitaire</th>
                    <th class="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${formData.items.map(item => `
                    <tr>
                      <td>${item.description}</td>
                      <td class="text-right">${item.quantity}</td>
                      <td class="text-right">${item.unitPrice.toFixed(2)} MAD</td>
                      <td class="text-right">${item.total.toFixed(2)} MAD</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div class="totals">
              <div class="totals-box">
                <div class="totals-row">
                  <span>Sous-total HT:</span>
                  <span>${subtotal.toFixed(2)} MAD</span>
                </div>
                ${formData.remise > 0 ? `
                  <div class="totals-row">
                    <span>Remise (${formData.remise}%):</span>
                    <span>-${remiseAmount.toFixed(2)} MAD</span>
                  </div>
                ` : ''}
                <div class="totals-row">
                  <span>TVA (20%):</span>
                  <span>${tva.toFixed(2)} MAD</span>
                </div>
                <div class="totals-row total">
                  <span>Total TTC:</span>
                  <span>${totalWithTVA.toFixed(2)} MAD</span>
                </div>
              </div>
            </div>

            ${formData.notes ? `
              <div class="notes">
                <div class="notes-title">Notes:</div>
                <div>${formData.notes.replace(/\n/g, '<br>')}</div>
              </div>
            ` : ''}
          </div>

          <div class="footer">
            <p>© Frutaria Market — Tous droits réservés</p>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.clientName || formData.items.length === 0) {
      toast.error('Veuillez remplir les informations client et ajouter des articles');
      return;
    }

    setLoading(true);

    try {
      const documentPayload = {
        type: formData.type,
        clientName: formData.clientName,
        clientEmail: formData.clientEmail,
        clientAddress: formData.clientAddress,
        clientICE: formData.clientICE,
        date: formData.date,
        items: formData.items,
        notes: formData.notes,
        paymentHeaderNote: formData.paymentHeaderNote,
        remise: formData.remise,
        subtotal,
        totalRemise: remiseAmount,
        subtotalAfterRemise,
        tva,
        totalWithTVA,
      };

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/super-handler/documents`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(documentPayload),
        }
      );

      if (!response.ok) {
        throw new Error('Erreur lors de la création du document');
      }

      const data = await response.json();
      const documentId = data.id;

      toast.success(`${formData.type} créée avec succès: ${documentId}`);
      
      // Reset form
      setFormData({
        type: 'Facture',
        clientName: '',
        clientEmail: '',
        clientAddress: '',
        clientICE: '',
        date: new Date().toISOString().split('T')[0],
        items: [],
        notes: '',
        paymentHeaderNote: '',
        remise: 0,
      });

      setOpen(false);

      if (onDocumentCreated) {
        onDocumentCreated(documentId);
      }
    } catch (error: any) {
      console.error('Error creating document:', error);
      toast.error(error.message || 'Erreur lors de la création du document');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Créer une Facture
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Créer une {formData.type}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Document Type and Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="type">Type de Document</Label>
              <select
                id="type"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="Facture">Facture</option>
                <option value="Devis">Devis</option>
                <option value="Bon Commande">Bon de Commande</option>
                <option value="Bon Livraison">Bon de Livraison</option>
              </select>
            </div>
            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
          </div>

          {/* Client Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Informations Client</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="clientName">Nom du Client *</Label>
                <Input
                  id="clientName"
                  value={formData.clientName}
                  onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="clientEmail">Email</Label>
                <Input
                  id="clientEmail"
                  type="email"
                  value={formData.clientEmail}
                  onChange={(e) => setFormData({ ...formData, clientEmail: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="clientAddress">Adresse</Label>
                <Input
                  id="clientAddress"
                  value={formData.clientAddress}
                  onChange={(e) => setFormData({ ...formData, clientAddress: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="clientICE">ICE</Label>
                <Input
                  id="clientICE"
                  value={formData.clientICE}
                  onChange={(e) => setFormData({ ...formData, clientICE: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Articles</h3>
            
            {/* Add Item Form */}
            <div className="bg-gray-50 p-4 rounded-lg space-y-3">
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={newItem.description}
                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                    placeholder="Nom du produit"
                  />
                </div>
                <div>
                  <Label htmlFor="quantity">Quantité</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="1"
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({ ...newItem, quantity: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="unitPrice">Prix Unitaire</Label>
                  <Input
                    id="unitPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    value={newItem.unitPrice}
                    onChange={(e) => setNewItem({ ...newItem, unitPrice: Number(e.target.value) })}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    onClick={handleAddItem}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Items List */}
            {formData.items.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-2 text-left">Description</th>
                      <th className="px-4 py-2 text-right">Quantité</th>
                      <th className="px-4 py-2 text-right">Prix Unitaire</th>
                      <th className="px-4 py-2 text-right">Total</th>
                      <th className="px-4 py-2 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.items.map((item, index) => (
                      <tr key={index} className="border-t">
                        <td className="px-4 py-2">{item.description}</td>
                        <td className="px-4 py-2 text-right">{item.quantity}</td>
                        <td className="px-4 py-2 text-right">{item.unitPrice.toFixed(2)} MAD</td>
                        <td className="px-4 py-2 text-right font-semibold">{item.total.toFixed(2)} MAD</td>
                        <td className="px-4 py-2 text-center">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveItem(index)}
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
          </div>

          {/* Discount and Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="remise">Remise (%)</Label>
              <Input
                id="remise"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={formData.remise}
                onChange={(e) => setFormData({ ...formData, remise: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="paymentHeaderNote">Conditions de Paiement</Label>
              <Input
                id="paymentHeaderNote"
                value={formData.paymentHeaderNote}
                onChange={(e) => setFormData({ ...formData, paymentHeaderNote: e.target.value })}
                placeholder="Ex: 30 jours net"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notes supplémentaires..."
              className="w-full px-3 py-2 border rounded-md"
              rows={3}
            />
          </div>

          {/* Totals Summary */}
          <div className="bg-blue-50 p-4 rounded-lg space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Sous-total HT:</span>
              <span className="font-semibold">{subtotal.toFixed(2)} MAD</span>
            </div>
            {formData.remise > 0 && (
              <div className="flex justify-between text-orange-600">
                <span>Remise ({formData.remise}%):</span>
                <span>-{remiseAmount.toFixed(2)} MAD</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>TVA (20%):</span>
              <span className="font-semibold">{tva.toFixed(2)} MAD</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-blue-600 border-t pt-2">
              <span>Total TTC:</span>
              <span>{totalWithTVA.toFixed(2)} MAD</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleGeneratePreview}
              disabled={formData.items.length === 0}
            >
              <Eye className="w-4 h-4 mr-2" />
              Aperçu
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={loading || formData.items.length === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? 'Création...' : 'Créer et Télécharger PDF'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
