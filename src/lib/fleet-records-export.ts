import JSZip from 'jszip';

export type ReportCell = string | number;
// XML 1.0 forbids these control characters in workbook cells.
// eslint-disable-next-line no-control-regex
export const escapeReportText = (value: ReportCell) => String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);

// Inline strings preserve identifiers and prevent cell contents from becoming formulas.
export async function createFleetWorkbook(sheets: Array<{ name: string; rows: ReportCell[][] }>) {
  const zip = new JSZip();
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const columnName = (index: number) => {
    let name = '';
    for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + (value - 1) % 26) + name;
    return name;
  };
  zip.file('[Content_Types].xml', `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  zip.file('_rels/.rels', `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `${xml}<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets>${sheets.map((sheet, index) => `<sheet name="${escapeReportText(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`);
  sheets.forEach((sheet, index) => {
    const width = Math.max(1, ...sheet.rows.map((row) => row.length));
    zip.file(`xl/worksheets/sheet${index + 1}.xml`, `${xml}<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="${width}" width="22" customWidth="1"/></cols><sheetData>${sheet.rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => { const reference = `${columnName(columnIndex)}${rowIndex + 1}`; return typeof cell === 'number' && Number.isFinite(cell) ? `<c r="${reference}"><v>${cell}</v></c>` : `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeReportText(cell)}</t></is></c>`; }).join('')}</row>`).join('')}</sheetData></worksheet>`);
  });
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
}

export function fleetPrintHtml(headers: string[], rows: ReportCell[][], summary: Array<[string, number]>, scope: string) {
  const escape = escapeReportText;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Vehicle Fleet Records</title><style>@page{size:A4 landscape;margin:10mm}body{font:11px Arial,sans-serif;color:#17251c}h1{font-size:20px;margin-bottom:4px}p{margin:6px 0}.summary{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.summary span{border:1px solid #bbcebf;padding:6px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #aaa;padding:6px;text-align:left;overflow-wrap:anywhere}th{background:#e6f0e8}thead{display:table-header-group}tr{break-inside:avoid}button{margin-bottom:12px;padding:8px 16px}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print</button><h1>BENECO · Vehicle Fleet Records</h1><p>${escape(scope)}</p><p>${rows.length} matching records · Generated ${escape(new Date().toLocaleString())}</p><div class="summary">${summary.map(([type, count]) => `<span>${escape(type)}: <b>${count}</b></span>`).join('')}</div><table><thead><tr>${headers.map((header) => `<th>${escape(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`;
}
