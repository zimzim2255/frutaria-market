import React from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { exportToExcelHtml, exportToPdfTable, type TableColumn } from '../../utils/export/exportUtils';

export type StockReferenceGroupExportRow = {
  stock_reference: string;
  supplier_name: string;
  product_count: number;
  total_quantity: number;
  total_value: number;
  date_operation: string;
};

function safeFilePart(value: string) {
  return String(value || '')
    .replace(/[^a-z0-9-_ ]/gi, '')
    .trim()
    .replace(/\s+/g, '_');
}

export function StockReferenceGroupsExportButtons(props: {
  groups: StockReferenceGroupExportRow[];
  filters?: {
    searchTerm?: string;
    startDate?: string;
    endDate?: string;
    filterSupplier?: string;
    filterCategory?: string;
    filterStore?: string;
  };
}) {
  const { groups, filters } = props;

  const datePart = new Date().toISOString().split('T')[0];

  // Build filter description for subtitle
  const filterParts: string[] = [];
  if (filters?.searchTerm) filterParts.push(`Recherche: ${filters.searchTerm}`);
  if (filters?.startDate) filterParts.push(`Du: ${filters.startDate}`);
  if (filters?.endDate) filterParts.push(`Au: ${filters.endDate}`);
  if (filters?.filterSupplier && filters.filterSupplier !== 'all') filterParts.push(`Fournisseur: ${filters.filterSupplier}`);
  if (filters?.filterCategory && filters.filterCategory !== 'all') filterParts.push(`Catégorie: ${filters.filterCategory}`);
  if (filters?.filterStore && filters.filterStore !== 'all') filterParts.push(`Magasin: ${filters.filterStore}`);
  const filterSubtitle = filterParts.length > 0 ? `Filtres: ${filterParts.join(' | ')}` : '';

  const totalGroups = groups.length;
  const totalProducts = groups.reduce((s, g) => s + g.product_count, 0);
  const totalQuantity = groups.reduce((s, g) => s + g.total_quantity, 0);
  const totalValue = groups.reduce((s, g) => s + g.total_value, 0);

  const columns: TableColumn<StockReferenceGroupExportRow>[] = [
    { header: 'Référence de Stock', accessor: (r) => String(r?.stock_reference || '-'), cellWidth: 30 },
    { header: 'Fournisseur', accessor: (r) => String(r?.supplier_name || '-'), cellWidth: 30 },
    { header: 'Nombre de Produits', accessor: (r) => r?.product_count ?? 0, align: 'right', cellWidth: 20 },
    { header: 'Quantité Totale', accessor: (r) => (r?.total_quantity ?? 0).toFixed(1), align: 'right', cellWidth: 20 },
    { header: 'Valeur Totale\n(MAD)', accessor: (r) => (r?.total_value ?? 0).toFixed(2), align: 'right', cellWidth: 20 },
    { header: 'Date de l\'Opération', accessor: (r) => String(r?.date_operation || '-'), cellWidth: 20 },
  ];

  const exportPdf = () => {
    try {
      if (groups.length === 0) {
        toast.error('Aucune donnée à exporter');
        return;
      }

      exportToPdfTable({
        title: '📦 Groupes par Référence de Stock',
        subtitle: filterSubtitle || undefined,
        filename: `Groupes_Reference_Stock_${datePart}.pdf`,
        headerStats: [
          { label: 'GROUPES', value: String(totalGroups) },
          { label: 'PRODUITS', value: String(totalProducts) },
          { label: 'QUANTITÉ', value: totalQuantity.toFixed(1) },
          { label: 'VALEUR', value: `${totalValue.toFixed(2)} MAD` },
        ],
        rows: groups,
        columns,
        orientation: 'landscape',
      });
      toast.success('PDF exporté');
    } catch (e) {
      console.error('[StockReferenceGroupsExportButtons] exportPdf error', e);
      toast.error("Erreur lors de l'export PDF");
    }
  };

  const exportExcel = () => {
    try {
      if (groups.length === 0) {
        toast.error('Aucune donnée à exporter');
        return;
      }

      // Add total row at the end for Excel export
      const rowsWithTotal = [
        ...groups,
        {
          stock_reference: 'TOTAL',
          supplier_name: '',
          product_count: totalProducts,
          total_quantity: totalQuantity,
          total_value: totalValue,
          date_operation: '',
        } as StockReferenceGroupExportRow,
      ];

      exportToExcelHtml(rowsWithTotal, columns, `Groupes_Reference_Stock_${datePart}.xls`);
      toast.success('Excel exporté');
    } catch (e) {
      console.error('[StockReferenceGroupsExportButtons] exportExcel error', e);
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
