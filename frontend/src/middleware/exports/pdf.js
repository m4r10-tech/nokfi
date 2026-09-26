import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * F5 — PDF maquetado con la estructura del informe (F1).
 *
 * Fuente: Noto Sans (subconjunto latín + latín extendido-A, ~21 KB por peso,
 * licencia OFL) en /fonts, descargada SOLO al exportar. Las fuentes estándar
 * de jsPDF no cubren ł, ż, ś, ć… del polaco (sesión 4, §5.1).
 */
const COLORS = {
  accent: [20, 86, 162], text: [20, 20, 20], muted: [110, 110, 110], line: [225, 225, 225],
  high: [220, 38, 38], medium: [217, 119, 6], low: [37, 99, 235], positive: [22, 163, 74]
};

let fontCache = null;
async function loadFonts() {
  if (fontCache) return fontCache;
  const toB64 = async (url) => {
    const buf = await (await fetch(url)).arrayBuffer();
    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  fontCache = { regular: await toB64('/fonts/NotoSans-Regular.ttf'), bold: await toB64('/fonts/NotoSans-Bold.ttf') };
  return fontCache;
}

export async function exportPdf(model, filename) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let family = 'helvetica';
  try {
    const f = await loadFonts();
    doc.addFileToVFS('NotoSans-Regular.ttf', f.regular);
    doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
    doc.addFileToVFS('NotoSans-Bold.ttf', f.bold);
    doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
    family = 'NotoSans';
  } catch { /* sin red → Helvetica (latín básico) */ }

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;
  const maxW = W - M * 2;
  let y = 18;

  const setFont = (style, size, color = COLORS.text) => { doc.setFont(family, style); doc.setFontSize(size); doc.setTextColor(...color); };
  const ensure = (h) => { if (y + h > H - 16) { doc.addPage(); y = 18; } };
  const para = (text, { size = 10, style = 'normal', color = COLORS.text, indent = 0, gap = 1.5 } = {}) => {
    setFont(style, size, color);
    const lines = doc.splitTextToSize(String(text || ''), maxW - indent);
    const lh = size * 0.45;
    for (const line of lines) { ensure(lh); doc.text(line, M + indent, y); y += lh; }
    y += gap;
  };
  const heading = (text) => {
    ensure(14);
    y += 3;
    setFont('bold', 12, COLORS.accent);
    doc.text(String(text).toUpperCase(), M, y);
    y += 2;
    doc.setDrawColor(...COLORS.line); doc.line(M, y, W - M, y);
    y += 5;
  };

  // Cabecera
  setFont('bold', 16, COLORS.accent); doc.text('Nokfi', M, y);
  y += 9;
  para(model.title, { size: 15, style: 'bold', gap: 1 });
  if (model.subtitle) para(model.subtitle, { size: 9, color: COLORS.muted, gap: 3 });

  for (const b of model.blocks) {
    heading(b.heading);
    if (b.type === 'text') para(b.text, { size: 10.5 });
    else if (b.type === 'figures') {
      autoTable(doc, {
        startY: y, margin: { left: M, right: M }, theme: 'plain',
        styles: { font: family, fontSize: 9.5, cellPadding: 2, textColor: COLORS.text },
        columnStyles: { 1: { fontStyle: 'bold', halign: 'right' } },
        body: b.items.map(k => [k.label + (k.note ? `\n${k.note}` : ''), k.value]),
        didDrawCell: (data) => { if (data.row.index > 0 && data.column.index === 0) { doc.setDrawColor(...COLORS.line); doc.line(M, data.cell.y, W - M, data.cell.y); } }
      });
      y = doc.lastAutoTable.finalY + 4;
    } else if (b.type === 'priorities') {
      for (const p of b.items) {
        ensure(12);
        const sc = COLORS[p.severity] || COLORS.medium;
        doc.setFillColor(...sc);
        doc.circle(M + 1.2, y - 1.1, 1.2, 'F');
        setFont('bold', 8, sc);
        doc.text(String(p.severityLabel).toUpperCase(), M + 4, y);
        y += 4.5;
        para(p.title, { size: 10.5, style: 'bold', gap: 0.5 });
        if (p.detail) para(p.detail, { size: 10, color: [60, 60, 60], gap: 3 });
      }
    } else if (b.type === 'list') {
      for (const s of b.items) para(b.plain ? s : `•  ${s}`, { size: 10, gap: 1.5 });
    } else if (b.type === 'actions') {
      b.items.forEach((a, i) => {
        ensure(10);
        doc.setDrawColor(...(a.done ? COLORS.positive : COLORS.muted));
        doc.rect(M, y - 3.2, 3.6, 3.6);
        if (a.done) {
          doc.setDrawColor(...COLORS.positive); doc.setLineWidth(0.6);
          doc.line(M + 0.7, y - 1.4, M + 1.6, y - 0.4); doc.line(M + 1.6, y - 0.4, M + 3.1, y - 2.6);
          doc.setLineWidth(0.2);
        }
        para(`${i + 1}. ${a.title}${a.timeframe ? `  ·  ${a.timeframe}` : ''}`, { size: 10.5, style: 'bold', indent: 6, gap: 0.5 });
        if (a.detail) para(a.detail, { size: 10, color: [60, 60, 60], indent: 6, gap: 2.5 });
      });
    } else if (b.type === 'glossary') {
      for (const g of b.items) {
        para(g.term, { size: 10, style: 'bold', gap: 0.3 });
        para(g.definition, { size: 10, color: [60, 60, 60], gap: 2.5 });
      }
    }
  }

  for (const table of model.tables) {
    heading(table.name);
    autoTable(doc, {
      startY: y, margin: { left: M, right: M },
      styles: { font: family, fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: COLORS.accent, font: family, fontStyle: 'bold' },
      head: [table.columns.map(c => c.label)],
      body: table.rows.slice(0, 500).map(r => table.columns.map(c => r[c.key] ?? ''))
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // Pie con numeración
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    setFont('normal', 8, COLORS.muted);
    doc.text(`nokfi.app · ${i}/${pages}`, W - M, H - 8, { align: 'right' });
  }
  doc.save(filename);
}
