  import React from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { exportToExcelHtml, exportToPdfTable, type TableColumn } from '../../utils/export/exportUtils';

export type StockReferenceExportRow = {
  reference?: string | null;
  name?: string | null;
  category?: string | null;
  lot?: string | null;
  number_of_boxes?: number | string | null;
  purchase_price?: number | string | null;
  created_at?: string | null;
  caisse?: number | string | null;
};

function asNumber(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function safeFilePart(value: string) {
  return String(value || '')
    .replace(/[^a-z0-9-_ ]/gi, '')
    .trim()
    .replace(/\s+/g, '_');
}

export function StockReferenceExportButtons(props: {
  stockReference: string;
  rows: StockReferenceExportRow[];
  supplierName?: string | null;
}) {
  const { stockReference, rows, supplierName } = props;

  const ref = String(stockReference || '').trim();
  const safeRef = safeFilePart(ref) || 'stock_reference';
  const datePart = new Date().toISOString().split('T')[0];

  const totalQty = (rows || []).reduce((s, r) => s + asNumber((r as any)?.number_of_boxes ?? 0), 0);
  const totalValue = (rows || []).reduce((s, r) => s + (asNumber((r as any)?.number_of_boxes ?? 0) * asNumber((r as any)?.purchase_price ?? 0)), 0);

  const columns: TableColumn<StockReferenceExportRow>[] = [
    { header: 'Référence', accessor: (r) => String(r?.reference || '-') },
    { header: 'Produit', accessor: (r) => String(r?.name || '-') },
    { header: 'Catégorie', accessor: (r) => String(r?.category || '-') },
    { header: 'Caisse', accessor: (r) => String((r as any)?.caisse ?? '-') , align: 'right', cellWidth: 14 },
    { header: 'Quantité', accessor: (r) => asNumber((r as any)?.number_of_boxes ?? 0).toFixed(1), align: 'right', cellWidth: 16 },
    { header: 'Prix Achat\n(MAD)', accessor: (r) => asNumber((r as any)?.purchase_price ?? 0).toFixed(2), align: 'right', cellWidth: 18 },
    {
      header: 'Valeur\n(MAD)',
      accessor: (r) => (asNumber((r as any)?.number_of_boxes ?? 0) * asNumber((r as any)?.purchase_price ?? 0)).toFixed(2),
      align: 'right',
      cellWidth: 18,
    },
    { header: 'Lot', accessor: (r) => String(r?.lot || '-') },
    { header: 'Date', accessor: (r) => (r?.created_at ? new Date(String(r.created_at)).toLocaleDateString('fr-FR') : '-'), cellWidth: 16 },
  ];

  const exportPdf = () => {
    try {
      if (!ref) return;
      exportToPdfTable({
        title: 'RAPPORT - Référence de Stock',
        subtitle: `Référence: ${ref}${supplierName ? ` | Fournisseur: ${supplierName}` : ''}`,
        filename: `Rapport_Reference_Stock_${safeRef}_${datePart}.pdf`,
        headerStats: [
          { label: 'PRODUITS', value: String((rows || []).length) },
          { label: 'QUANTITÉ', value: totalQty.toFixed(1) },
          { label: 'VALEUR', value: `${totalValue.toFixed(2)} MAD` },
        ],
        rows: rows || [],
        columns,
        orientation: 'landscape',
      });
      toast.success('PDF exporté');
    } catch (e) {
      console.error('[StockReferenceExportButtons] exportPdf error', e);
      toast.error("Erreur lors de l'export PDF");
    }
  };

  const exportExcel = () => {
    try {
      if (!ref) return;
      exportToExcelHtml(rows || [], columns, `Rapport_Reference_Stock_${safeRef}_${datePart}.xls`);
      toast.success('Excel exporté');
    } catch (e) {
      console.error('[StockReferenceExportButtons] exportExcel error', e);
      toast.error("Erreur lors de l'export Excel");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={exportPdf} title="Exporter PDF">
        <Download className="w-4 h-4 mr-2" />
        PDF
      </Button>
      <Button variant="outline" onClick={exportExcel} title="Exporter Excel">
        <Download className="w-4 h-4 mr-2" />
        Excel
      </Button>
    </div>
  );
}
