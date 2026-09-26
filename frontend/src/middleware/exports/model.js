import { localeOf } from '../../utils/dates';

/**
 * F5 — modelo de documento COMÚN a todos los formatos de exportación.
 *
 * Cada exportador (pdf, docx, xlsx/ods, csv, odt, pptx, json) recibe el mismo
 * modelo → mismo contenido y orden en todos los formatos. Se construye desde
 * el informe estructurado (F1) o, para análisis antiguos, desde su HTML.
 *
 *   { title, subtitle, blocks: [...], tables: [{ name, columns:[{key,label}], rows }] }
 *   block: { type: 'text'|'figures'|'priorities'|'list'|'actions'|'glossary', heading, ... }
 */
export function buildModel(doc, t, lang) {
  const date = new Date().toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'long', year: 'numeric' });
  const model = {
    title: doc.title || 'Nokfi',
    subtitle: [doc.companyName, date].filter(Boolean).join(' · '),
    blocks: [],
    tables: [...(doc.tables || [])]
  };

  const r = doc.report;
  if (r) {
    if (r.summary) model.blocks.push({ type: 'text', heading: t('report.summary'), text: r.summary });
    if (doc.health) {
      model.blocks.push({
        type: 'figures', heading: t('report.healthTitle'),
        items: [
          { label: t('report.healthScoreLabel'), value: `${doc.health.score}/100` },
          ...Object.entries(doc.health.sections || {}).map(([k, v]) => ({ label: t(`questionnaire.sections.${k}`), value: `${v}%` }))
        ]
      });
    }
    if (r.key_figures?.length) model.blocks.push({ type: 'figures', heading: t('report.keyFigures'), items: r.key_figures });
    if (r.priorities?.length) {
      model.blocks.push({
        type: 'priorities', heading: t('report.priorities'),
        items: r.priorities.map(p => ({ ...p, severityLabel: t(`report.severity_${p.severity}`) }))
      });
    }
    if (r.strengths?.length) model.blocks.push({ type: 'list', heading: t('report.strengths'), items: r.strengths });
    if (r.action_plan?.length) {
      const doneById = new Map((doc.actions || []).map((a, i) => [i, !!a.done]));
      model.blocks.push({
        type: 'actions', heading: t('report.actionPlan'),
        items: r.action_plan.map((a, i) => ({ ...a, done: doneById.get(i) || false }))
      });
    }
    if (r.glossary?.length) model.blocks.push({ type: 'glossary', heading: t('report.glossary'), items: r.glossary });
  } else if (doc.html) {
    const paragraphs = htmlToParagraphs(doc.html);
    model.blocks.push({ type: 'list', heading: t('report.summary'), items: paragraphs, plain: true });
  }

  for (const [i, f] of (doc.files || []).entries()) {
    if (f.type === 'excel' && f.rows?.length) {
      const cols = Object.keys(f.rows[0]);
      model.tables.push({ name: `${t('report.dataSheet')} ${i + 1}`, columns: cols.map(c => ({ key: c, label: c })), rows: f.rows });
    }
  }
  return model;
}

export function htmlToParagraphs(html) {
  const div = document.createElement('div');
  div.innerHTML = String(html || '').replace(/<\/(p|li|h3|h4|div)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n');
  return (div.textContent || '').split('\n').map(s => s.trim()).filter(Boolean);
}

/** Texto plano (copiar al portapapeles / CSV). */
export function reportToPlainText(report, t) {
  const out = [report.summary, ''];
  if (report.key_figures?.length) {
    out.push(t('report.keyFigures').toUpperCase());
    report.key_figures.forEach(k => out.push(`• ${k.label}: ${k.value}${k.note ? ` (${k.note})` : ''}`));
    out.push('');
  }
  if (report.priorities?.length) {
    out.push(t('report.priorities').toUpperCase());
    report.priorities.forEach(p => out.push(`• [${t(`report.severity_${p.severity}`)}] ${p.title}: ${p.detail}`));
    out.push('');
  }
  if (report.strengths?.length) {
    out.push(t('report.strengths').toUpperCase());
    report.strengths.forEach(s => out.push(`• ${s}`));
    out.push('');
  }
  if (report.action_plan?.length) {
    out.push(t('report.actionPlan').toUpperCase());
    report.action_plan.forEach((a, i) => out.push(`${i + 1}. ${a.title}${a.detail ? ` — ${a.detail}` : ''}${a.timeframe ? ` (${a.timeframe})` : ''}`));
    out.push('');
  }
  if (report.glossary?.length) {
    out.push(t('report.glossary').toUpperCase());
    report.glossary.forEach(g => out.push(`• ${g.term}: ${g.definition}`));
  }
  return out.join('\n').trim();
}

/** Filas planas (sección · elemento · detalle · extra) para CSV/hojas. */
export function modelToRows(model) {
  const rows = [];
  for (const b of model.blocks) {
    switch (b.type) {
      case 'text': rows.push([b.heading, b.text, '', '']); break;
      case 'figures': b.items.forEach(k => rows.push([b.heading, k.label, k.value, k.note || ''])); break;
      case 'priorities': b.items.forEach(p => rows.push([b.heading, p.title, p.detail, p.severityLabel])); break;
      case 'list': b.items.forEach(s => rows.push([b.heading, s, '', ''])); break;
      case 'actions': b.items.forEach(a => rows.push([b.heading, a.title, a.detail || '', a.timeframe || ''])); break;
      case 'glossary': b.items.forEach(g => rows.push([b.heading, g.term, g.definition, ''])); break;
      default: break;
    }
  }
  return rows;
}

/**
 * ⚠️ AUDITORÍA DE SEGURIDAD — Formula/CSV Injection (OWASP). Una celda que
 * empieza por = + - @ (o tab/CR) se abre como FÓRMULA en Excel/LibreOffice.
 * Se antepone un apóstrofe para forzar texto (mitigación estándar OWASP).
 */
export function neutralize(value) {
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function slug(str) {
  return String(str || 'nokfi').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'nokfi';
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
