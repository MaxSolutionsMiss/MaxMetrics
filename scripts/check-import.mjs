// The shapes the old dashboard's exports come in, and what each one has to yield.
//
// Every case here is one that silently half-worked. An importer that reads a file, writes
// six of its fourteen readings and reports success is worse than one that refuses the file,
// because nobody goes looking for the eight. `node --check` cannot see that and neither can
// the conformance rules, so the shapes are run.

import { readDashboardJson, readKpi } from '../js/import.js';

const CASES = [
  {
    name: 'sections, only some of them dated',
    // The one that broke. The walk stopped at the first object carrying a date, so safety
    // and shipping came in and quality, financials and production were dropped in silence.
    blob: {
      safety:     { date: '2026-08-10', daysSinceInjury: 6, injuryRecord: 255 },
      shipping:   { date: '2026-08-10', jobsShipped: 17, late: 0, shorts: 0, cartons: 453925,
                    mtdOtif: 98.44, ytdOtif: 94 },
      quality:    { shortages: 3, coq: 0.23, coqYtd: 0.29, ncrYtd: 12 },
      financials: { salesMtd: 253754.2, salesYtd: 21310771.2 },
      printing:   { netImps: 198329, crewHours: 33.5 },
      gluing:     { cartons: 676677, hours: 60 },
    },
    days: 1,
    metrics: ['injury_last', 'injury_record', 'jobs_shipped', 'late', 'shorts', 'cartons',
              'mtd_otif', 'ytd_otif', 'shortages', 'coq', 'coq_ytd', 'ncr_ytd',
              'fin_actual_mtd', 'fin_actual_ytd'],
    departments: ['printing', 'gluing'],
  },
  {
    name: 'one record, dated at the root',
    blob: { date: '2026-08-10', lastInjury: '2026-08-04', jobsShipped: 17, coq: 0.23,
            printing: { netImps: 198329, crewHours: 33.5 } },
    days: 1,
    metrics: ['injury_last', 'jobs_shipped', 'coq'],
    departments: ['printing'],
  },
  {
    name: 'a month, keyed by date',
    blob: { '2026-08-09': { jobsShipped: 12, coq: 0.3 },
            '2026-08-10': { jobsShipped: 17, coq: 0.23 } },
    days: 2,
    metrics: ['jobs_shipped', 'coq'],
    departments: [],
  },
  {
    name: 'a list of dated records',
    blob: { days: [{ date: '2026-08-09', jobsShipped: 12 }, { date: '2026-08-10', jobsShipped: 17 }] },
    days: 2,
    metrics: ['jobs_shipped'],
    departments: [],
  },
  {
    name: 'departments written as a list of rows',
    // The other half of the silent import: an array fell through to the scalar branch and
    // was filed as one unreadable key, so every department in the plant went missing and the
    // file reported one unrecognised name.
    blob: { date: '2026-08-10', salesMonthToDate: 253754.2,
            departments: [
              { name: 'Printing',   quantity: 198329, manHours: 33.5 },
              { name: 'Die Cutting', quantity: 86727, manHours: 29 },
              { name: 'Gluing',     quantity: 676677, manHours: 60 },
            ] },
    days: 1,
    metrics: ['fin_actual_mtd'],
    departments: ['printing', 'diecutting', 'gluing'],
    expect: day => day.departments.printing.qty === 198329
      || `printing qty came out ${day.departments.printing.qty}, expected 198329`,
  },
  {
    name: 'a streak given as a count rather than a date',
    // 6 days before the 10th is the 4th. The dashboard stores the date because a count is
    // only true on the morning it was written.
    blob: { date: '2026-08-10', daysSinceLastInjury: 6, daysSinceNearMiss: 10 },
    days: 1,
    metrics: ['injury_last', 'near_miss_last'],
    departments: [],
    expect: day => day.metrics.injury_last === '2026-08-04'
      || `injury_last came out ${day.metrics.injury_last}, expected 2026-08-04`,
  },
];

// ── The monthly KPI workbook ────────────────────────────────────────────────────
// A stand-in for the plant's sheet, with its real headers — line breaks, double spaces and
// all — because matching those is the part that breaks when somebody widens a column.
const KPI = {
  sheetNames: ['PLZ DO NOT TOUCH'],
  rows: () => [
    ['Year', 'Month', 'PLANT', 'Shipped Cartons #', 'Deliveries', ' Shipped $',
     'NCR Internal', 'NCR Supplier', 'Total CC  #',
     'TOTAL COQ (Internal NCR+ CC Cost of Poor Quality) $', 'COPQ %', 'Target COQ%',
     'OTIF', 'OTIF %'],
    [2026, 'JAN',   'Mississauga', 1, 200, 1000000, 15, 0, 2, 10000, 0.01,   0.01, 180, 0.9],
    [2026, 'FEB',   'Mississauga', 1, 200, 1000000,  7, 8, 4,  5000, 0.005,  0.01, 190, 0.95],
    [2026, 'March', 'Mississauga', 1, 200, 2000000, 16, 0, 6,  5000, 0.0025, 0.01, 196, 0.98],
    [2026, 'Apr',   'Mississauga', 1, 200, 1000000, 12, 1, 3,  1000, 0.001,  0.01, 198, 0.99],
  ],
};

async function checkKpi() {
  const bad = [];
  const march = await readKpi(KPI, { date: '2026-03-18' });
  const m = march.metrics;
  // COPQ 0.25% of sales for the month; year to date is 20,000 on 4,000,000 = 0.5%.
  if (m.coq !== 0.25) bad.push(`coq ${m.coq}, expected 0.25`);
  if (m.coq_target !== 1) bad.push(`coq_target ${m.coq_target}, expected 1`);
  if (m.coq_ytd !== 0.5) bad.push(`coq_ytd ${m.coq_ytd}, expected 0.5`);
  // 38 internal + 8 supplier over three months.
  if (m.ncr_ytd !== 46) bad.push(`ncr_ytd ${m.ncr_ytd}, expected 46`);
  if (m.complaints_internal !== 38) bad.push(`complaints_internal ${m.complaints_internal}, expected 38`);
  if (m.complaints_external !== 12) bad.push(`complaints_external ${m.complaints_external}, expected 12`);
  if (m.mtd_otif !== 98) bad.push(`mtd_otif ${m.mtd_otif}, expected 98`);
  // 566 OTIF deliveries of 600.
  if (Math.abs(m.ytd_otif - 94.3333) > 0.001) bad.push(`ytd_otif ${m.ytd_otif}, expected 94.3333`);
  if (m.fin_actual_mtd !== 2000000) bad.push(`fin_actual_mtd ${m.fin_actual_mtd}`);
  if (m.fin_actual_ytd !== 4000000) bad.push(`fin_actual_ytd ${m.fin_actual_ytd}`);

  // A month the sheet has not been closed off for yet reads the last one it has, and says so.
  const august = await readKpi(KPI, { date: '2026-08-10' });
  if (august.metrics.fin_actual_mtd !== 1000000) bad.push('August did not fall back to April');
  if (!august.notes.some(n => /no row for AUG/.test(n))) bad.push('August fell back without saying so');
  return bad;
}

let failures = 0;
const fail = (name, detail) => { failures += 1; console.error(`  \u2717 ${name}\n      ${detail}`); };

for (const test of CASES) {
  const read = readDashboardJson(JSON.stringify(test.blob), 'export.json');
  if (read.days.length !== test.days) {
    fail(test.name, `${read.days.length} day(s), expected ${test.days}`);
    continue;
  }
  const day = read.days[read.days.length - 1];
  const missing = test.metrics.filter(field => !(field in day.metrics));
  if (missing.length) fail(test.name, `readings dropped: ${missing.join(', ')}`);
  const noDept = test.departments.filter(key => !(key in day.departments));
  if (noDept.length) fail(test.name, `departments dropped: ${noDept.join(', ')}`);
  const verdict = test.expect ? test.expect(day) : true;
  if (verdict !== true) fail(test.name, verdict);
}

for (const detail of await checkKpi()) fail('the monthly KPI workbook', detail);

if (failures) {
  console.error(`\nImport shapes: ${failures} problem(s)\n`);
  process.exit(1);
}
console.log(`Import shapes: all ${CASES.length + 1} read in full.`);
