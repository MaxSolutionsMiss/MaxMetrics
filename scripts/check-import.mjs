// The shapes the old dashboard's exports come in, and what each one has to yield.
//
// Every case here is one that silently half-worked. An importer that reads a file, writes
// six of its fourteen readings and reports success is worse than one that refuses the file,
// because nobody goes looking for the eight. `node --check` cannot see that and neither can
// the conformance rules, so the shapes are run.

import { readDashboardJson } from '../js/import.js';

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

if (failures) {
  console.error(`\nImport shapes: ${failures} problem(s)\n`);
  process.exit(1);
}
console.log(`Import shapes: all ${CASES.length} read in full.`);
