import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Export helpers used across modules.
 *
 * NOTE: We keep this utility dependency-free (no xlsx library) and generate
 * an Excel-compatible .xls by emitting an HTML table (works in Excel/LibreOffice).
 */

export type TableColumn<T> = {
  /**
   * Header text.
   * Tip: use \n to break the header into multiple lines for better PDF rendering.
   */
  header: string;
  /**
   * Raw value to export.
   * Strings/numbers/booleans/dates are supported.
   */
  accessor: (row: T) => unknown;
  /** Optional text alignment for PDF table cells */
  align?: 'left' | 'center' | 'right';
  /** Optional PDF column width (autoTable) */
  cellWidth?: number | 'auto' | 'wrap';
};

const sanitizeFilePart = (value: string) =>
  String(value || '')
    .replace(/[^a-z0-9-_ ]/gi, '')
    .trim()
    .replace(/\s+/g, '_');

const formatCell = (v: unknown) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
};

const escapeCsvCell = (value: string) => {
  // Quote cells and escape internal quotes
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
};

export const exportToCsv = <T,>(
  rows: T[],
  columns: TableColumn<T>[],
  filename: string
) => {
  const headerLine = columns.map((c) => escapeCsvCell(c.header)).join(',');
  const bodyLines = rows.map((r) =>
    columns
      .map((c) => escapeCsvCell(formatCell(c.accessor(r))))
      .join(',')
  );

  const csv = [headerLine, ...bodyLines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportToExcelHtml = <T,>(
  rows: T[],
  columns: TableColumn<T>[],
  filename: string
) => {
  // Excel opens HTML files fine (xls extension). This avoids adding heavy deps.
  const title = sanitizeFilePart(filename.replace(/\.(xls|xlsx)$/i, '')) || 'Export';

  const thead = `<tr>${columns
    .map((c) => `<th style="border:1px solid #ccc;padding:6px;background:#f3f4f6;text-align:left;">${c.header}</th>`)
    .join('')}</tr>`;

  const tbody = rows
    .map((r) => {
      const tds = columns
        .map((c) => {
          const val = formatCell(c.accessor(r));
          // Avoid Excel formula injection (values starting with =, +, -, @)
          const safeVal = /^[=+\-@]/.test(val) ? `'${val}` : val;
          return `<td style="border:1px solid #ccc;padding:6px;">${safeVal.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`;
        })
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${title}</title>
</head>
<body>
<table style="border-collapse:collapse;font-family:Arial, sans-serif;font-size:12px;">
<thead>${thead}</thead>
<tbody>${tbody}</tbody>
</table>
</body>
</html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.toLowerCase().endsWith('.xls') ? filename : `${filename}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export type PdfHeaderStat = { label: string; value: string };

export const exportToPdfTable = <T,>(params: {
  title: string;
  subtitle?: string;
  filename: string;
  headerStats?: PdfHeaderStat[];
  rows: T[];
  columns: TableColumn<T>[];
  orientation?: 'portrait' | 'landscape';
}) => {
  const {
    title,
    subtitle,
    filename,
    headerStats,
    rows,
    columns,
    orientation = 'landscape',
  } = params;

  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, 14, 14);

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text(subtitle, 14, 20);
    doc.setTextColor(0);
  }

  // Header stats (small cards like the reference screenshot)
  let startY = subtitle ? 26 : 22;
  if (headerStats && headerStats.length > 0) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 14;
    const gap = 3;
    const cardH = 10;
    const cols = Math.min(4, headerStats.length);
    const cardW = (pageWidth - marginX * 2 - gap * (cols - 1)) / cols;

    doc.setFontSize(9);
    headerStats.slice(0, cols).forEach((s, idx) => {
      const x = marginX + idx * (cardW + gap);
      doc.setFillColor(234, 242, 255);
      doc.setDrawColor(160, 190, 240);
      doc.roundedRect(x, startY, cardW, cardH, 1.5, 1.5, 'FD');

      doc.setTextColor(30, 64, 175);
      doc.setFont('helvetica', 'bold');
      doc.text(s.label, x + 3, startY + 4);

      doc.setTextColor(17, 24, 39);
      doc.setFont('helvetica', 'normal');
      doc.text(s.value, x + 3, startY + 8);
    });
    doc.setTextColor(0);
    startY += cardH + 6;
  }

  const head = [columns.map((c) => c.header)];
  const body = rows.map((r) => columns.map((c) => formatCell(c.accessor(r))));

  // Use the full page width (minimal margins) for a professional report layout.
  // We keep a tiny margin to avoid printer clipping.
  const marginX = 4;

  autoTable(doc, {
    startY,
    head,
    body,
    styles: {
      fontSize: 8,
      cellPadding: 2,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [30, 64, 175],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
    },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: columns.reduce((acc: any, col, index) => {
      acc[index] = {
        halign: col.align || 'left',
        cellWidth: col.cellWidth || 'auto',
      };
      return acc;
    }, {}),
    margin: { left: marginX, right: marginX },
    didParseCell: (data) => {
      // Improve header readability and prevent aggressive word breaking.
      if (data.section === 'head') {
        const manyCols = columns.length >= 10;
        data.cell.styles.fontSize = manyCols ? 7 : 8;
        data.cell.styles.cellPadding = manyCols ? 1.5 : 2;
        data.cell.styles.overflow = 'linebreak';
      }

      if (data.section === 'body') {
        // Avoid breaking words mid-letter; allow wrapping only at spaces.
        data.cell.styles.overflow = 'linebreak';
        data.cell.styles.cellWidth = 'wrap';
      }
    },
    didDrawPage: () => {
      const pageCount = doc.getNumberOfPages();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(
        `Généré le ${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR')}`,
        marginX,
        pageHeight - 6
      );
      doc.text(`Page ${doc.getCurrentPageInfo().pageNumber}/${pageCount}`, pageWidth - marginX, pageHeight - 6, {
        align: 'right',
      });
      doc.setTextColor(0);
    },
  });

  const safe = sanitizeFilePart(filename) || 'export';
  doc.save(safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`);
};
