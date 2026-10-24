import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export type ExportFormat = 'csv' | 'excel' | 'pdf' | 'print';

interface ExportOptions {
  filename: string;
  title?: string;
  subtitle?: string;
  restaurantName?: string;
}

// ─── CSV Export ────────────────────────────────────────────────────────────────
export function exportToCSV(data: any[], opts: ExportOptions | string) {
  const options = typeof opts === 'string' ? { filename: opts } : opts;
  if (!data || !data.length) return;

  const headers = Object.keys(data[0]);
  const csvRows = data.map(row =>
    headers.map(header => {
      let value = row[header] ?? '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  );
  csvRows.unshift(headers.join(','));

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${options.filename}-${dateStr()}.csv`);
}

// ─── Excel Export ──────────────────────────────────────────────────────────────
export function exportToExcel(data: any[], opts: ExportOptions | string) {
  const options = typeof opts === 'string' ? { filename: opts } : opts;
  if (!data || !data.length) return;

  const ws = XLSX.utils.json_to_sheet(data);

  // Auto column widths
  const colWidths = Object.keys(data[0]).map(key => ({
    wch: Math.max(key.length, ...data.map(row => String(row[key] ?? '').length)) + 2
  }));
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, options.title || 'Report');

  XLSX.writeFile(wb, `${options.filename}-${dateStr()}.xlsx`);
}

// ─── PDF Export ────────────────────────────────────────────────────────────────
export function exportToPDF(data: any[], opts: ExportOptions | string) {
  const options = typeof opts === 'string' ? { filename: opts, title: opts } : opts;
  if (!data || !data.length) return;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const companyName = options.restaurantName || 'SMARTGONEXT Restaurant';

  // Company / Restaurant Header
  doc.setFontSize(16);
  doc.setTextColor(37, 99, 235); // Blue Accent
  doc.setFont('helvetica', 'bold');
  doc.text(companyName.toUpperCase(), 40, 36);

  // Title
  doc.setFontSize(14);
  doc.setTextColor(30, 30, 50);
  doc.setFont('helvetica', 'bold');
  doc.text(options.title || options.filename, 40, 54);

  if (options.subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(130, 130, 150);
    doc.setFont('helvetica', 'normal');
    doc.text(options.subtitle, 40, 68);
  }

  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => String(row[h] ?? '')));

  autoTable(doc, {
    head: [headers.map(h => h.toUpperCase().replace(/_/g, ' '))],
    body: rows,
    startY: options.subtitle ? 80 : 66,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 255] },
    didDrawPage: (pageData: any) => {
      // Footer
      doc.setFontSize(8);
      doc.setTextColor(160, 160, 180);
      doc.text(
        `${companyName} | Generated: ${new Date().toLocaleString()} | Page ${pageData.pageNumber}`,
        40,
        (doc as any).internal.pageSize.height - 20
      );
    },
  });

  doc.save(`${options.filename}-${dateStr()}.pdf`);
}

// ─── Print Export ──────────────────────────────────────────────────────────────
export function exportToPrint(data: any[], opts: ExportOptions | string) {
  const options = typeof opts === 'string' ? { filename: opts, title: opts } : opts;
  if (!data || !data.length) return;

  const companyName = options.restaurantName || 'SMARTGONEXT Restaurant';
  const headers = Object.keys(data[0]);

  const tableRows = data.map(row =>
    `<tr>${headers.map(h => `<td>${String(row[h] ?? '')}</td>`).join('')}</tr>`
  ).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${options.title || options.filename}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; color: #1e1e2e; margin: 20px; }
        .company { font-size: 16px; font-weight: bold; color: #2563eb; text-transform: uppercase; margin-bottom: 2px; }
        h1 { font-size: 14px; margin-bottom: 4px; color: #111; }
        p.subtitle { font-size: 10px; color: #888; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #2563eb; color: white; padding: 6px 10px; text-align: left; font-size: 10px; text-transform: uppercase; }
        td { padding: 5px 10px; border-bottom: 1px solid #eee; }
        tr:nth-child(even) td { background: #f8faff; }
        .footer { margin-top: 20px; font-size: 9px; color: #aaa; }
      </style>
    </head>
    <body>
      <div class="company">${companyName}</div>
      <h1>${options.title || options.filename}</h1>
      ${options.subtitle ? `<p class="subtitle">${options.subtitle}</p>` : ''}
      <table>
        <thead><tr>${headers.map(h => `<th>${h.replace(/_/g, ' ').toUpperCase()}</th>`).join('')}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div class="footer">${companyName} · Generated: ${new Date().toLocaleString()}</div>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 500);
  }
}

// ─── Non-KOT Inventory Excel Export ──────────────────────────────────────────
export function exportNonKOTInventoryToExcel(items: any[], filename = 'non_kot_inventory') {
  if (!items || !items.length) return;

  const data = items.map((item) => {
    const packVariantsStr = Array.isArray(item.packOptions) && item.packOptions.length > 0
      ? item.packOptions.map((p: any) => 
          `${p.label || ''}|${p.quantity || 1}|${p.unitLabel || ''}|${p.productQR || ''}|${p.mrp || 0}|${p.purchaseRate || 0}|${p.profitPercent || 0}|${p.sellingPrice || p.price || 0}|${p.stockWarningThreshold || 0}`
        ).join(';')
      : '';

    return {
      ProductQR: item.productQR || '',
      SignatureName: item.name || '',
      MRP: item.mrp ?? (item.inventoryItem?.inventoryMRPs?.[0]?.mrp ?? 0),
      PurchaseRate: item.purchaseRate ?? (item.inventoryItem?.inventoryMRPs?.[0]?.purchaseRate ?? 0),
      ProfitPercent: item.profitPercent ?? (item.inventoryItem?.inventoryMRPs?.[0]?.profitPercent ?? 0),
      SellingPrice: Number(item.price || 0),
      SalesUnit: item.salesUnit || '',
      Category: item.category?.name || '',
      Group: item.category?.group?.name || 'Non KOT',
      AssignedMenu: item.menu?.name || '',
      StockWarn: item.stockWarningThreshold ?? '',
      ExpiryDate: item.expiryDate ? item.expiryDate.split('T')[0] : '',
      TaxType: item.taxType || 'external',
      TaxPercent: item.taxPercent ?? 5,
      EnablePackOptions: item.enablePackOptions ? 'true' : 'false',
      PackVariants: packVariantsStr,
      ImageMode: item.isAutoImage ? 'ai' : (item.image ? 'lib' : 'auto'),
    };
  });

  exportToExcel(data, { filename, title: 'Non-KOT Inventory' });
}

// ─── Master Export Function ────────────────────────────────────────────────────
export function exportData(format: ExportFormat, data: any[], opts: ExportOptions | string) {
  switch (format) {
    case 'csv': return exportToCSV(data, opts);
    case 'excel': return exportToExcel(data, opts);
    case 'pdf': return exportToPDF(data, opts);
    case 'print': return exportToPrint(data, opts);
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function dateStr() {
  return new Date().toISOString().split('T')[0];
}

function triggerDownload(blob: Blob, filename: string) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

