/**
 * Excel Export Utility
 * 
 * Provides Excel export functionality for table data.
 * Uses HTML table format which is compatible with Excel/LibreOffice.
 */

export type ExcelColumn<T> = {
  /** Header text for the column */
  header: string;
  /** Function to extract the value from a row */
  accessor: (row: T) => unknown;
};

/**
 * Formats a cell value for Excel export
 */
const formatCell = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
};

/**
 * Sanitizes a filename by removing special characters
 */
const sanitizeFilename = (value: string): string =>
  String(value || '')
    .replace(/[^a-z0-9-_ ]/gi, '')
    .trim()
    .replace(/\s+/g, '_');

/**
 * Exports table data to Excel format (.xls)
 * 
 * @param rows - Array of data rows to export
 * @param columns - Column definitions with headers and accessors
 * @param filename - Name of the output file (without extension)
 * 
 * @example
 * ```ts
 * exportToExcel(
 *   clients,
 *   [
 *     { header: 'Name', accessor: (c) => c.name },
 *     { header: 'Email', accessor: (c) => c.email }
 *   ],
 *   'clients_export'
 * );
 * ```
 */
export const exportToExcel = <T,>(
  rows: T[],
  columns: ExcelColumn<T>[],
  filename: string
): void => {
  const title = sanitizeFilename(filename.replace(/\.(xls|xlsx)$/i, '')) || 'Export';

  // Build table header
  const thead = `<tr>${columns
    .map((c) => `<th style="border:1px solid #ccc;padding:6px;background:#f3f4f6;text-align:left;font-weight:bold;">${c.header}</th>`)
    .join('')}</tr>`;

  // Build table body
  const tbody = rows
    .map((r) => {
      const tds = columns
        .map((c) => {
          const val = formatCell(c.accessor(r));
          // Prevent Excel formula injection (values starting with =, +, -, @)
          const safeVal = /^[=+\-@]/.test(val) ? `'${val}` : val;
          return `<td style="border:1px solid #ccc;padding:6px;">${safeVal.replace(/</g, '<').replace(/>/g, '>')}</td>`;
        })
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');

  // Create HTML document with Excel-compatible formatting
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

  // Create blob and download
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

/**
 * Exports table data to Excel format with custom styling
 * 
 * @param rows - Array of data rows to export
 * @param columns - Column definitions with headers and accessors
 * @param filename - Name of the output file (without extension)
 * @param options - Optional styling options
 * 
 * @example
 * ```ts
 * exportToExcelStyled(
 *   clients,
 *   [
 *     { header: 'Name', accessor: (c) => c.name },
 *     { header: 'Email', accessor: (c) => c.email }
 *   ],
 *   'clients_export',
 *   { headerBgColor: '#1e40af', headerTextColor: '#ffffff' }
 * );
 * ```
 */
export const exportToExcelStyled = <T,>(
  rows: T[],
  columns: ExcelColumn<T>[],
  filename: string,
  options: {
    headerBgColor?: string;
    headerTextColor?: string;
    fontSize?: number;
    fontFamily?: string;
  } = {}
): void => {
  const {
    headerBgColor = '#1e40af',
    headerTextColor = '#ffffff',
    fontSize = 12,
    fontFamily = 'Arial, sans-serif'
  } = options;

  const title = sanitizeFilename(filename.replace(/\.(xls|xlsx)$/i, '')) || 'Export';

  // Build table header with custom styling
  const thead = `<tr>${columns
    .map((c) => `<th style="border:1px solid #ccc;padding:6px;background:${headerBgColor};color:${headerTextColor};text-align:left;font-weight:bold;">${c.header}</th>`)
    .join('')}</tr>`;

  // Build table body with alternating row colors
  const tbody = rows
    .map((r, index) => {
      const bgColor = index % 2 === 0 ? '#ffffff' : '#f9fafb';
      const tds = columns
        .map((c) => {
          const val = formatCell(c.accessor(r));
          // Prevent Excel formula injection
          const safeVal = /^[=+\-@]/.test(val) ? `'${val}` : val;
          return `<td style="border:1px solid #ccc;padding:6px;background:${bgColor};">${safeVal.replace(/</g, '<').replace(/>/g, '>')}</td>`;
        })
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');

  // Create HTML document with custom styling
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${title}</title>
</head>
<body>
<table style="border-collapse:collapse;font-family:${fontFamily};font-size:${fontSize}px;">
<thead>${thead}</thead>
<tbody>${tbody}</tbody>
</table>
</body>
</html>`;

  // Create blob and download
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
