#!/usr/bin/env node
/**
 * scripts/build-benchmarks.js — V7: genera config/benchmarks.json con
 * referencias SECTORIALES REALES del INE (una vez al año).
 *
 * Fuente: INE, Estadística Estructural de Empresas (sectores Servicios y
 * Comercio), tablas "Principales magnitudes según actividad principal y
 * tamaño (por personal ocupado)". API pública:
 *   https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/<id>?nult=1&tip=A
 * Los datos del INE se pueden reutilizar citando la fuente ("Fuente: INE").
 *
 * ⚠️ NO usar la base RSE del Banco de España: su aviso legal prohíbe la
 * redistribución de los datos, incluso gratuita (comprobado 2026-09-26).
 *
 * Uso:  node scripts/build-benchmarks.js   (actualizar cada año cuando el INE
 * publique el nuevo ejercicio; revisar que los nombres de actividad no cambien)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TABLES = { servicios: 76813, comercio: 76819 };

// Sectores del onboarding → actividad CNAE del INE (nombre exacto de la serie).
// null = la estadística no cubre ese sector (p.ej. Construcción).
const SECTOR_MAP = {
  'Comercio': { table: 'comercio', activity: 'Comercio al por menor, excepto de vehículos de motor y motocicletas', cnae: '47' },
  'Hostelería': { table: 'servicios', activity: 'Servicios de comidas y bebidas', cnae: '56' },
  'Salud': { table: 'servicios', activity: 'Actividades sanitarias', cnae: '86' },
  'Legal': { table: 'servicios', activity: 'Actividades jurídicas', cnae: '691' },
  'Tecnología': { table: 'servicios', activity: 'Programación, consultoría y otras actividades relacionadas con la informática', cnae: '62' },
  'Consultoría': { table: 'servicios', activity: 'Actividades de consultoría de gestión empresarial', cnae: '702' },
  'Diseño': { table: 'servicios', activity: 'Actividades de diseño especializado', cnae: '741' },
  'Educación': { table: 'servicios', activity: 'Educación', cnae: '85' },
  'Construcción': null,
  'Otro': null
};

// Tamaños de Nokfi → tramos de personal ocupado del INE (aproximación).
const SIZE_MAP = { solo: 'De 0 a 1', '2-5': 'De 2 a 9', '6-20': 'De 10 a 19', '20+': 'De 20 a 49' };

const VARS = {
  'Número de empresas': 'companies',
  'Cifra de negocios': 'revenue',
  'Excedente bruto de explotación': 'gross_operating_surplus',
  'Total de compras de bienes y servicios': 'purchases',
  'Gastos de personal': 'staff_costs',
  'Personal ocupado': 'employees'
};

async function fetchTable(id) {
  const res = await fetch(`https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/${id}?nult=1&tip=A`);
  if (!res.ok) throw new Error(`INE ${id}: HTTP ${res.status}`);
  return res.json();
}

const r1 = (n) => Math.round(n * 10) / 10;

(async () => {
  const raw = {};
  let year = null;
  for (const [key, id] of Object.entries(TABLES)) {
    for (const s of await fetchTable(id)) {
      const [, variable, activity, size] = s.Nombre.split('.').map(x => x.trim());
      const v = VARS[variable];
      const point = s.Data?.[0];
      if (!v || !point || point.Valor == null || point.Secreto) continue;
      year = year || point.Anyo;
      raw[key] ??= {};
      raw[key][activity] ??= {};
      raw[key][activity][size] ??= {};
      raw[key][activity][size][v] = Number(point.Valor);
    }
  }

  const sectors = {};
  for (const [sector, m] of Object.entries(SECTOR_MAP)) {
    if (!m) { sectors[sector] = null; continue; }
    const act = raw[m.table]?.[m.activity];
    if (!act) throw new Error(`Actividad no encontrada en el INE: ${m.activity}`);
    const bySize = {};
    for (const [nokfiSize, ineSize] of Object.entries({ ...SIZE_MAP, total: 'Total' })) {
      const x = act[ineSize];
      if (!x || !x.revenue) { bySize[nokfiSize] = null; continue; }
      bySize[nokfiSize] = {
        ine_size: ineSize,
        companies: x.companies ?? null,
        // Ratios sobre la cifra de negocios (%). Las magnitudes del INE van en miles de €.
        operating_margin_pct: x.gross_operating_surplus != null ? r1((x.gross_operating_surplus / x.revenue) * 100) : null,
        staff_costs_pct: x.staff_costs != null ? r1((x.staff_costs / x.revenue) * 100) : null,
        purchases_pct: x.purchases != null ? r1((x.purchases / x.revenue) * 100) : null,
        revenue_per_company_eur: x.companies ? Math.round((x.revenue * 1000) / x.companies) : null,
        revenue_per_employee_eur: x.employees ? Math.round((x.revenue * 1000) / x.employees) : null
      };
    }
    sectors[sector] = { activity: m.activity, cnae: m.cnae, by_size: bySize };
  }

  const out = {
    source: {
      name: 'INE — Estadística Estructural de Empresas (sectores Servicios y Comercio)',
      year,
      tables: Object.values(TABLES),
      url: 'https://www.ine.es/dyngs/INEbase/operacion.htm?c=Estadistica_C&cid=1254736176865',
      generated_at: new Date().toISOString().slice(0, 10)
    },
    sectors
  };
  const dest = path.join(__dirname, '../config/benchmarks.json');
  fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
  console.log(`✅ ${dest} (año ${year})`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
