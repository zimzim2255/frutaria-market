import React, { useRef } from 'react';
import { Button } from './ui/button';
import { Download, Printer } from 'lucide-react';
import { InvoiceData } from '../utils/invoiceGenerator';

interface InvoiceTemplateProps {
  invoice: InvoiceData;
  onClose?: () => void;
}

export function InvoiceTemplate({ invoice, onClose }: InvoiceTemplateProps): React.ReactElement {
  const invoiceRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    console.log('Invoice data:', invoice);
  }, [invoice]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    try {
      // Create HTML with logo background and invoice data overlay
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Facture ${invoice.invoiceNumber}</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: 'Helvetica Neue', Arial, sans-serif;
              background: white;
            }
            .page {
              width: 210mm;
              height: 297mm;
              margin: 0;
              padding: 0;
              position: relative;
              background-image: url('https://fjvmssmimoujxzqketsx.supabase.co/storage/v1/object/public/logo/Entete%20DA-2.pdf.png');
              background-size: cover;
              background-position: top center;
              background-repeat: no-repeat;
              page-break-after: always;
            }
            .content {
              position: relative;
              width: 100%;
              height: 100%;
              padding: 40px;
              box-sizing: border-box;
              font-size: 11px;
              color: #000;
            }
            .header {
              position: absolute;
              top: 40px;
              right: 40px;
              text-align: right;
              font-size: 11px;
              background: rgba(255,255,255,0.95);
              padding: 10px 15px;
              border-radius: 4px;
            }
            .header div {
              margin-bottom: 5px;
              font-weight: 600;
            }
            .client-info {
              position: absolute;
              top: 160px;
              left: 40px;
              width: 350px;
              font-size: 10px;
              background: rgba(255,255,255,0.95);
              padding: 12px;
              border-radius: 4px;
            }
            .client-info-title {
              font-weight: bold;
              margin-bottom: 8px;
              font-size: 11px;
              border-bottom: 1px solid #ddd;
              padding-bottom: 5px;
            }
            .client-info div {
              margin-bottom: 4px;
            }
            .products {
              position: absolute;
              top: 320px;
              left: 40px;
              right: 40px;
              width: calc(100% - 80px);
              background: rgba(255,255,255,0.97);
              padding: 12px;
              border-radius: 4px;
            }
            .products-title {
              font-weight: bold;
              margin-bottom: 10px;
              font-size: 11px;
              border-bottom: 2px solid #333;
              padding-bottom: 5px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 9px;
              margin-bottom: 8px;
            }
            th {
              text-align: left;
              padding: 6px 4px;
              border-bottom: 1px solid #999;
              font-weight: bold;
              background: #f5f5f5;
            }
            td {
              padding: 5px 4px;
              border-bottom: 1px solid #eee;
            }
            .totals {
              position: absolute;
              bottom: 120px;
              right: 40px;
              width: 220px;
              text-align: right;
              font-size: 10px;
              background: rgba(255,255,255,0.95);
              padding: 12px;
              border-radius: 4px;
            }
            .totals div {
              margin-bottom: 6px;
            }
            .total-ttc {
              font-weight: bold;
              font-size: 12px;
              color: #d32f2f;
              border-top: 2px solid #333;
              padding-top: 6px;
              margin-top: 6px;
            }
            .amount-letters {
              position: absolute;
              bottom: 60px;
              left: 40px;
              font-size: 10px;
              background: rgba(255,255,255,0.95);
              padding: 10px 12px;
              border-radius: 4px;
              max-width: 400px;
            }
            @media print {
              body { margin: 0; padding: 0; }
              .page { margin: 0; padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="content">
              <div class="header">
                <div>N° Facture: ${invoice.invoiceNumber}</div>
                <div>Date: ${invoice.date}</div>
                <div style="color: #2e7d32;">Statut: ${invoice.status}</div>
              </div>
              
              <div class="client-info">
                <div class="client-info-title">INFORMATIONS CLIENT</div>
                <div><strong>Nom:</strong> ${invoice.clientName}</div>
                <div><strong>Téléphone:</strong> ${invoice.clientPhone}</div>
                <div><strong>Adresse:</strong> ${invoice.clientAddress}</div>
                <div><strong>ICE:</strong> ${invoice.clientICE || '-'}</div>
              </div>
              
              <div class="products">
                <div class="products-title">TABLEAU DES ARTICLES</div>
                <table>
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Description</th>
                      <th style="text-align: center;">Quantité</th>
                      <th style="text-align: right;">Prix Unitaire</th>
                      <th style="text-align: right;">Sous-total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${invoice.items.map(item => `
                      <tr>
                        <td>${item.no}</td>
                        <td>${item.description}</td>
                        <td style="text-align: center;">${item.quantity}</td>
                        <td style="text-align: right;">${item.unitPrice.toFixed(2)} DH</td>
                        <td style="text-align: right;">${item.subtotal.toFixed(2)} DH</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
              
              <div class="totals">
                <div><strong>Total HT:</strong> ${invoice.totalHT.toFixed(2)} DH</div>
                <div><strong>TVA (20%):</strong> ${invoice.tva.toFixed(2)} DH</div>
                <div class="total-ttc"><strong>Total TTC:</strong> ${invoice.totalTTC.toFixed(2)} DH</div>
              </div>
              
              <div class="amount-letters">
                <strong>Montant en Lettres:</strong> ${invoice.amountInLetters}
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      // Create blob and download
      const blob = new Blob([htmlContent], { type: 'text/html; charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoice.invoiceNumber}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating invoice:', error);
      alert('Erreur lors de la génération de la facture. Veuillez réessayer.');
    }
  };

  if (!invoice) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
          <p className="text-red-600 font-semibold">Erreur: Données de facture manquantes</p>
          {onClose && (
            <Button onClick={onClose} className="mt-4 w-full">
              Fermer
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      {/* Minimal Card for Download */}
      <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6 flex flex-col gap-4">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">✓ Facture Générée</h2>
          <p className="text-gray-600">Facture #{invoice?.invoiceNumber || 'N/A'}</p>
        </div>

        {/* Message */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-800">
            Votre facture a été générée avec succès. Vous pouvez la télécharger ou l'imprimer.
          </p>
        </div>

        {/* Invoice Details Summary */}
        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Total TTC:</span>
            <span className="font-bold text-gray-900">{(invoice?.totalTTC || 0).toFixed(2)} DH</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Date:</span>
            <span className="text-gray-900">{invoice?.date || 'N/A'}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleDownloadPDF}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            Télécharger PDF
          </Button>
          <Button
            onClick={handlePrint}
            variant="outline"
            className="flex-1 flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Imprimer
          </Button>
        </div>

        {/* Close Button */}
        {onClose && (
          <Button
            onClick={onClose}
            variant="ghost"
            className="w-full text-gray-600 hover:text-gray-900"
          >
            Fermer
          </Button>
        )}
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body {
            margin: 0;
            padding: 0;
          }
          .fixed {
            position: static;
          }
          .bg-black {
            background: none;
          }
        }
      `}</style>
    </div>
  );
}
