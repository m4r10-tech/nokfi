import { modelToRows, neutralize, saveBlob } from './model';

/**
 * F5 — Word (.docx), hojas (.xlsx / .ods), CSV, OpenDocument texto (.odt),
 * PowerPoint (.pptx) y JSON. Las librerías (docx, pptxgenjs, jszip, xlsx)
 * se importan dinámicamente: solo se descargan al exportar.
 */

/* ── Word (.docx) ── */
export async function exportDocx(model, filename) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle } = await import('docx');
  const children = [
    new Paragraph({ children: [new TextRun({ text: 'Nokfi', bold: true, color: '1456A2', size: 28 })] }),
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: model.title })] }),
  ];
  if (model.subtitle) children.push(new Paragraph({ children: [new TextRun({ text: model.subtitle, color: '6B7280', size: 18 })] }));

  const sevColor = { high: 'DC2626', medium: 'D97706', low: '2563EB' };
  const cellBorders = { top: { style: BorderStyle.SINGLE, size: 2, color: 'E5E5E5' }, bottom: { style: BorderStyle.SINGLE, size: 2, color: 'E5E5E5' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } };
  const table = (rows) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((cells, ri) => new TableRow({
      children: cells.map(c => new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun({ text: String(c ?? ''), bold: ri === 0 && rows.header })] })] }))
    }))
  });

  for (const b of model.blocks) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280 }, children: [new TextRun({ text: b.heading })] }));
    if (b.type === 'text') children.push(new Paragraph({ children: [new TextRun(b.text)] }));
    else if (b.type === 'figures') children.push(table(b.items.map(k => [k.label, k.value, k.note || ''])));
    else if (b.type === 'priorities') {
      for (const p of b.items) {
        children.push(new Paragraph({ spacing: { before: 120 }, children: [
          new TextRun({ text: `${p.severityLabel.toUpperCase()}  `, bold: true, color: sevColor[p.severity] || 'D97706', size: 18 }),
          new TextRun({ text: p.title, bold: true })
        ] }));
        if (p.detail) children.push(new Paragraph({ children: [new TextRun(p.detail)] }));
      }
    } else if (b.type === 'list') {
      for (const s of b.items) children.push(new Paragraph({ bullet: b.plain ? undefined : { level: 0 }, children: [new TextRun(s)] }));
    } else if (b.type === 'actions') {
      b.items.forEach((a, i) => {
        children.push(new Paragraph({ spacing: { before: 100 }, children: [
          new TextRun({ text: `${a.done ? '☑' : '☐'} ${i + 1}. ${a.title}`, bold: true }),
          ...(a.timeframe ? [new TextRun({ text: `  ·  ${a.timeframe}`, color: '6B7280' })] : [])
        ] }));
        if (a.detail) children.push(new Paragraph({ indent: { left: 360 }, children: [new TextRun(a.detail)] }));
      });
    } else if (b.type === 'glossary') {
      for (const g of b.items) children.push(new Paragraph({ children: [new TextRun({ text: `${g.term}: `, bold: true }), new TextRun(g.definition)] }));
    }
  }
  for (const tb of model.tables) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280 }, children: [new TextRun(tb.name)] }));
    const rows = [tb.columns.map(c => c.label), ...tb.rows.slice(0, 300).map(r => tb.columns.map(c => r[c.key]))];
    rows.header = true;
    children.push(table(rows));
  }
  const doc = new Document({ creator: 'Nokfi', title: model.title, sections: [{ children }] });
  saveBlob(await Packer.toBlob(doc), filename);
}

/* ── Hojas de cálculo: .xlsx y .ods (misma librería, distinto bookType) ── */
export async function exportSheet(model, filename, bookType, labels) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const reportRows = modelToRows(model);
  if (reportRows.length) {
    const aoa = [[model.title], [model.subtitle], [], [labels.section, labels.item, labels.detail, labels.extra], ...reportRows]
      .map(r => r.map(neutralize));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 22 }, { wch: 45 }, { wch: 70 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, labels.sheet.slice(0, 31));
  }
  model.tables.forEach((tb, i) => {
    const aoa = [tb.columns.map(c => c.label), ...tb.rows.map(r => tb.columns.map(c => neutralize(r[c.key] ?? '')))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, (tb.name || `Datos_${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  });
  if (!wb.SheetNames.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[model.title]]), 'Nokfi');
  XLSX.writeFile(wb, filename, { bookType });
}

/* ── CSV (lo que importan A3, Sage, Holded, ContaSol… y las gestorías) ── */
export function toCsv(rows, sep = ';') {
  const esc = (v) => {
    // Con ';' como separador (convención española) los decimales van con coma.
    if (typeof v === 'number' && Number.isFinite(v)) return sep === ';' ? String(v).replace('.', ',') : String(v);
    const s = String(neutralize(v ?? ''));
    return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM → Excel abre el UTF-8 con tildes correctas. ';' = separador habitual en España.
  return '﻿' + rows.map(r => r.map(esc).join(sep)).join('\r\n');
}

export function exportCsv(model, filename, labels) {
  let rows;
  if (model.blocks.length) rows = [[labels.section, labels.item, labels.detail, labels.extra], ...modelToRows(model)];
  else {
    const tb = model.tables[0] || { columns: [], rows: [] };
    rows = [tb.columns.map(c => c.label), ...tb.rows.map(r => tb.columns.map(c => r[c.key]))];
  }
  saveBlob(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }), filename);
}

/* ── OpenDocument texto (.odt) — ZIP con content.xml (LibreOffice) ── */
const xmlEsc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function exportOdt(model, filename) {
  const { default: JSZip } = await import('jszip');
  const p = (text, style = 'Standard') => `<text:p text:style-name="${style}">${xmlEsc(text)}</text:p>`;
  const h = (text, level = 2) => `<text:h text:style-name="Heading_20_${level}" text:outline-level="${level}">${xmlEsc(text)}</text:h>`;
  let body = p('Nokfi', 'Brand') + h(model.title, 1) + (model.subtitle ? p(model.subtitle, 'Muted') : '');
  for (const b of model.blocks) {
    body += h(b.heading);
    if (b.type === 'text') body += p(b.text);
    else if (b.type === 'figures') b.items.forEach(k => { body += p(`${k.label}: ${k.value}${k.note ? ` (${k.note})` : ''}`); });
    else if (b.type === 'priorities') b.items.forEach(x => { body += p(`[${x.severityLabel}] ${x.title}`, 'Strong') + (x.detail ? p(x.detail) : ''); });
    else if (b.type === 'list') b.items.forEach(s => { body += p(b.plain ? s : `• ${s}`); });
    else if (b.type === 'actions') b.items.forEach((a, i) => { body += p(`${a.done ? '☑' : '☐'} ${i + 1}. ${a.title}${a.timeframe ? ` · ${a.timeframe}` : ''}`, 'Strong') + (a.detail ? p(a.detail) : ''); });
    else if (b.type === 'glossary') b.items.forEach(g => { body += p(`${g.term}: ${g.definition}`); });
  }
  for (const tb of model.tables) {
    body += h(tb.name);
    const cols = tb.columns.length;
    body += `<table:table table:name="${xmlEsc(tb.name).slice(0, 30)}"><table:table-column table:number-columns-repeated="${cols}"/>`;
    const row = (cells) => `<table:table-row>${cells.map(c => `<table:table-cell office:value-type="string">${p(c)}</table:table-cell>`).join('')}</table:table-row>`;
    body += row(tb.columns.map(c => c.label));
    tb.rows.slice(0, 300).forEach(r => { body += row(tb.columns.map(c => r[c.key])); });
    body += '</table:table>';
  }
  const ns = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"';
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${ns} office:version="1.3">
<office:automatic-styles>
<style:style style:name="Brand" style:family="paragraph"><style:text-properties fo:color="#1456A2" fo:font-weight="bold" fo:font-size="14pt"/></style:style>
<style:style style:name="Muted" style:family="paragraph"><style:text-properties fo:color="#6B7280" fo:font-size="9pt"/></style:style>
<style:style style:name="Strong" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.15cm"/><style:text-properties fo:font-weight="bold"/></style:style>
</office:automatic-styles>
<office:body><office:text>${body}</office:text></office:body></office:document-content>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${ns} office:version="1.3"><office:styles>
<style:style style:name="Standard" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.15cm"/><style:text-properties fo:font-size="10.5pt"/></style:style>
<style:style style:name="Heading_20_1" style:display-name="Heading 1" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.3cm" fo:margin-bottom="0.2cm"/><style:text-properties fo:font-size="18pt" fo:font-weight="bold"/></style:style>
<style:style style:name="Heading_20_2" style:display-name="Heading 2" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.45cm" fo:margin-bottom="0.15cm"/><style:text-properties fo:font-size="13pt" fo:font-weight="bold" fo:color="#1456A2"/></style:style>
</office:styles></office:document-styles>`;
  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`;
  const zip = new JSZip();
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });
  zip.file('content.xml', content);
  zip.file('styles.xml', styles);
  zip.folder('META-INF').file('manifest.xml', manifest);
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.oasis.opendocument.text' });
  saveBlob(blob, filename);
}

/* ── PowerPoint (.pptx) — resumen para socio, banco o inversor ── */
export async function exportPptx(model, filename) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  const ACCENT = '1456A2';
  const title = pptx.addSlide();
  title.background = { color: '0F172A' };
  title.addText('Nokfi', { x: 0.6, y: 0.5, fontSize: 20, bold: true, color: '5B9BE6' });
  title.addText(model.title, { x: 0.6, y: 2.4, w: 12, fontSize: 36, bold: true, color: 'FFFFFF' });
  if (model.subtitle) title.addText(model.subtitle, { x: 0.6, y: 3.6, w: 12, fontSize: 16, color: 'A3A3A3' });

  const addBlockSlide = (heading, lines) => {
    // Máx. 7 puntos por diapositiva; el resto pasa a la siguiente.
    for (let i = 0; i < lines.length; i += 7) {
      const s = pptx.addSlide();
      s.addText(heading + (i ? ' (cont.)' : ''), { x: 0.6, y: 0.4, w: 12, fontSize: 26, bold: true, color: ACCENT });
      s.addText(lines.slice(i, i + 7).map(l => ({ text: l.text, options: { bullet: l.bullet !== false, bold: !!l.bold, color: l.color || '1F2937', breakLine: true, paraSpaceAfter: 8 } })),
        { x: 0.6, y: 1.3, w: 12, h: 5.6, fontSize: 16, valign: 'top' });
    }
  };
  const sev = { high: 'DC2626', medium: 'D97706', low: '2563EB' };
  for (const b of model.blocks) {
    if (b.type === 'text') addBlockSlide(b.heading, [{ text: b.text, bullet: false }]);
    else if (b.type === 'figures') {
      const s = pptx.addSlide();
      s.addText(b.heading, { x: 0.6, y: 0.4, w: 12, fontSize: 26, bold: true, color: ACCENT });
      b.items.slice(0, 6).forEach((k, i) => {
        const x = 0.6 + (i % 3) * 4.1, y = 1.5 + Math.floor(i / 3) * 2.6;
        s.addShape(pptx.ShapeType.roundRect, { x, y, w: 3.8, h: 2.2, fill: { color: 'F1F5F9' }, line: { color: 'E2E8F0' }, rectRadius: 0.1 });
        s.addText(k.label, { x: x + 0.2, y: y + 0.2, w: 3.4, fontSize: 13, color: '64748B' });
        s.addText(k.value, { x: x + 0.2, y: y + 0.8, w: 3.4, fontSize: 26, bold: true, color: '0F172A' });
      });
    } else if (b.type === 'priorities') addBlockSlide(b.heading, b.items.map(p => ({ text: `${p.severityLabel}: ${p.title}`, color: sev[p.severity] })));
    else if (b.type === 'list') addBlockSlide(b.heading, b.items.map(s => ({ text: s })));
    else if (b.type === 'actions') addBlockSlide(b.heading, b.items.map((a, i) => ({ text: `${i + 1}. ${a.title}${a.timeframe ? ` · ${a.timeframe}` : ''}`, bullet: false })));
    else if (b.type === 'glossary') addBlockSlide(b.heading, b.items.map(g => ({ text: `${g.term}: ${g.definition}` })));
  }
  await pptx.writeFile({ fileName: filename });
}

/* ── JSON (automatizaciones; misma forma que la API v1) ── */
export function exportJson(doc, filename) {
  const payload = { title: doc.title, generated_at: new Date().toISOString(), report: doc.report || null, health: doc.health || null, tables: doc.tables || undefined };
  saveBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), filename);
}
