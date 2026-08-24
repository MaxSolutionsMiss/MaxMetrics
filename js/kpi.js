// What can be asked, and how to add it up.
//
// One row per measure. The picker's menus are generated from this list, so adding a
// question is adding an entry here rather than writing a screen. Everything in it is a
// column somebody already fills in each morning — nothing is aspirational.
//
// `grain` is the honest part. A measure that arrives per department can be split by
// department; one that arrives per plant cannot, and the picker greys the option out
// rather than returning a confident wrong number. Machine and shift appear nowhere
// because no fact table carries either — see NOT_COLLECTED at the bottom.
//
// `scale` earns its place: the columns do not agree with each other. uptime and coq are
// stored as fractions (0.82) while otif and otd are stored as percentages (94.2), and both
// are shown with a % sign. Encoding that here once is the difference between a registry and
// a pile of special cases in the page.

// Nobody reads a list of two hundred measures. They know roughly what they are after —
// something about quality, something about getting it out the door — so the categories are
// the way in, and the measures live folded up inside them. A category that holds nothing
// connected yet still appears, because "we do not collect that" is an answer worth giving.
export const AREAS = [
  { key: 'Production',   name: 'Production',   hint: 'what came off the machines' },
  { key: 'Quality',      name: 'Quality',      hint: 'what it cost to get it wrong' },
  { key: 'Supply chain', name: 'Supply chain', hint: 'promises kept, orders out' },
  { key: 'Inventory',    name: 'Inventory',    hint: 'what is sitting in the building' },
  { key: 'Money',        name: 'Money',        hint: 'value shipped' },
  { key: 'Safety',       name: 'Safety',       hint: 'days without' },
  { key: 'People',       name: 'People',       hint: 'hours and overtime' },
];

// agg: how several rows become one figure.
//   sum      — add them (output, jobs, incidents)
//   weighted — a rate, weighted by hours, because a plain average of percentages
//              lets a department that ran two hours count as much as one that ran ten
//   last     — a running total that is already cumulative; take the newest row
export const MEASURES = [
  // Configure calls this one "Target / hr", and it means it: the column is a rate, not a
  // quantity. Adding it up over a month gives a number nothing was ever measured against.
  // `targetBy` says what to multiply it by to get the quantity the period should have made.
  // `perUnit` says the unit belongs to the department, not to the measure: Printing counts
  // sheets, Gluing counts cartons. Where the answer spans both, there is no total to give.
  { key: 'output', area: 'Production', name: 'Output', hint: 'sheets and cartons off the line',
    table: 'daily_departments', col: 'qty', agg: 'sum', unit: '', dp: 0, up: true,
    target: 'target', targetBy: 'hours', perUnit: true },
  { key: 'uptime', area: 'Production', name: 'Uptime', hint: 'share of the shift actually running',
    table: 'daily_departments', col: 'uptime', agg: 'weighted', by: 'hours', unit: '%', dp: 1, up: true,
    scale: 100, target: 'uptime_target' },
  { key: 'makeready', area: 'Production', name: 'Make-ready', hint: 'hours per changeover',
    table: 'daily_departments', col: 'make_ready', agg: 'avg', unit: ' hrs', dp: 2, up: false,
    target: 'mr_target' },
  { key: 'mrcount', area: 'Production', name: 'Make-readies', hint: 'how many changeovers',
    table: 'daily_departments', col: 'mr_count', agg: 'sum', unit: '', dp: 0, up: false },
  { key: 'hours', area: 'Production', name: 'Hours run', hint: 'time on the machines',
    table: 'daily_departments', col: 'hours', agg: 'sum', unit: ' hrs', dp: 1, up: true },

  { key: 'otif', area: 'Supply chain', name: 'On time, in full', hint: 'the shipping promise kept',
    table: 'daily_metrics', col: 'otif', agg: 'weighted', by: 'jobs_shipped', unit: '%', dp: 1, up: true,
    target: 'otif_target' },
  { key: 'otd', area: 'Supply chain', name: 'On time', hint: 'delivered by the date promised',
    table: 'daily_metrics', col: 'otd', agg: 'weighted', by: 'jobs_shipped', unit: '%', dp: 1, up: true,
    target: 'otd_target' },
  { key: 'jobs', area: 'Supply chain', name: 'Jobs shipped', hint: 'orders out the door',
    table: 'daily_metrics', col: 'jobs_shipped', agg: 'sum', unit: '', dp: 0, up: true },
  { key: 'late', area: 'Supply chain', name: 'Late', hint: 'jobs that missed the date',
    table: 'daily_metrics', col: 'late', agg: 'sum', unit: '', dp: 0, up: false },
  { key: 'shorts', area: 'Supply chain', name: 'Short', hint: 'jobs that went incomplete',
    table: 'daily_metrics', col: 'shorts', agg: 'sum', unit: '', dp: 0, up: false },

  { key: 'coq', area: 'Quality', name: 'Cost of quality', hint: 'share of sales lost to getting it wrong',
    table: 'daily_metrics', col: 'coq', agg: 'avg', unit: '%', dp: 2, up: false,
    scale: 100, target: 'coq_target' },
  { key: 'ncr', area: 'Quality', name: 'Non-conformances', hint: 'raised that day',
    table: 'daily_metrics', col: 'ncr_today', agg: 'sum', unit: '', dp: 0, up: false },
  { key: 'compint', area: 'Quality', name: 'Complaints, internal', hint: 'caught before the customer',
    table: 'daily_metrics', col: 'complaints_internal_today', agg: 'sum', unit: '', dp: 0, up: false },
  { key: 'compext', area: 'Quality', name: 'Complaints, external', hint: 'the customer found it',
    table: 'daily_metrics', col: 'complaints_external_today', agg: 'sum', unit: '', dp: 0, up: false },

  { key: 'shipped', area: 'Money', name: 'Shipped', hint: 'value out the door, month to date',
    table: 'daily_metrics', col: 'fin_actual_mtd', agg: 'last', unit: '', dp: 0, up: true, money: true },
  { key: 'shippedy', area: 'Money', name: 'Shipped, year to date', hint: 'value out the door this year',
    table: 'daily_metrics', col: 'fin_actual_ytd', agg: 'last', unit: '', dp: 0, up: true, money: true },

  { key: 'nearmiss', area: 'Safety', name: 'Near misses', hint: 'days since the last one',
    table: 'daily_metrics', col: 'near_miss_last', agg: 'last', unit: ' days', dp: 0, up: true },
  { key: 'injury', area: 'Safety', name: 'Days since injury', hint: 'the number nobody wants reset',
    table: 'daily_metrics', col: 'injury_last', agg: 'last', unit: ' days', dp: 0, up: true },

  { key: 'ot', area: 'People', name: 'Overtime shifts', hint: 'shifts worked over',
    table: 'daily_labour', col: 'ot_shifts', agg: 'sum', unit: '', dp: 0, up: false },

  // Asked for constantly and held by nothing. These are listed rather than left out: a
  // measure that is missing from the menu looks like an oversight, one that is present and
  // greyed with a reason is a request somebody can act on. `pending` is what makes it grey.
  { key: 'fg', area: 'Inventory', name: 'Finished goods', hint: 'made and waiting to ship',
    pending: 'No table in Metriq holds stock. This is not an empty column — there is no ' +
      'inventory table at all. It needs the MIS read before it can be asked about.' },
  { key: 'rm', area: 'Inventory', name: 'Raw material', hint: 'board and ink on hand',
    pending: 'Same source as finished goods: the MIS holds it, Metriq has no table for it yet.' },
  { key: 'wip', area: 'Inventory', name: 'Work in progress', hint: 'started, not finished',
    pending: 'Same source as finished goods: the MIS holds it, Metriq has no table for it yet.' },
  { key: 'doh', area: 'Inventory', name: 'Days on hand', hint: 'how long the stock would last',
    pending: 'Needs finished goods and a rate of despatch, so it arrives with the MIS read.' },
];

// Everything that can actually be answered today.
export const LIVE = MEASURES.filter(m => !m.pending);

// A measure can be split by a dimension only if its own table carries that dimension.
export const BREAKDOWNS = [
  { key: 'none',  name: 'Nothing',    hint: 'one figure for the whole period' },
  { key: 'dept',  name: 'Department', hint: 'each department separately', needs: 'dept_key' },
  { key: 'day',   name: 'Day',        hint: 'each working day' },
  { key: 'month', name: 'Month',      hint: 'each month in the period' },
  { key: 'plant', name: 'Plant',      hint: 'compare the plants you can see' },
];

export const PERIODS = [
  { key: 'mtd',    name: 'This month' },
  { key: 'last',   name: 'Last month' },
  { key: 'd90',    name: 'Last 90 days' },
  { key: 'ytd',    name: 'This year' },
  { key: 'custom', name: 'Pick the dates' },
];

// The two dimensions nothing records. Shown in the picker, deliberately, because a greyed
// option with a reason is how somebody learns what to start collecting.
export const NOT_COLLECTED = [
  { name: 'Machine', why: 'Presses are configured with their own targets, but no fact table carries a machine — the reading arrives per department.' },
  { name: 'Shift',   why: 'No table records which shift a number belongs to.' },
];

// What somebody would type looking for a measure, where that is not its name. "OTIF" and
// "on time in full" should both find the same row, and so should "scrap" and "rework"
// finding cost of quality. This is the difference between a category tree that works at
// twenty measures and one that still works at two hundred.
const ALSO = {
  output:   'cartons sheets produced volume made quantity units',
  uptime:   'availability running downtime utilisation utilization oee',
  makeready: 'changeover setup mr set-up',
  mrcount:  'changeovers setups',
  hours:    'runtime machine time',
  otif:     'otif on time in full fill rate service level',
  otd:      'otd on time delivery delivered punctual',
  jobs:     'orders shipped despatch dispatch shipments',
  late:     'overdue missed date backorder',
  shorts:   'short shipped incomplete partial',
  coq:      'coq scrap rework waste spoilage quality cost',
  ncr:      'ncr non conformance defect reject',
  compint:  'internal complaint concession',
  compext:  'customer complaint external return claim',
  shipped:  'sales revenue value invoiced billings',
  shippedy: 'sales revenue year annual ytd',
  nearmiss: 'near miss incident close call',
  injury:   'lti lost time accident recordable',
  ot:       'overtime labour labor shifts',
  fg:       'finished goods stock inventory fg warehouse',
  rm:       'raw material board ink stock inventory substrate',
  wip:      'work in progress wip',
  doh:      'days on hand cover turns inventory days',
};

export const measure = key => MEASURES.find(m => m.key === key);

export const areaOf = area => MEASURES.filter(m => m.area === area);

// A plain-language search across names, hints and the synonyms above.
export function findMeasures(q) {
  const t = String(q || '').trim().toLowerCase();
  if (!t) return [];
  const words = t.split(/\s+/);
  return MEASURES.filter(m => {
    const hay = `${m.name} ${m.hint} ${m.area} ${ALSO[m.key] || ''}`.toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

// Which breakdowns this measure can honestly offer.
export const breakdownsFor = m => BREAKDOWNS.filter(b =>
  !b.needs || m.table === 'daily_departments' || m.table === 'daily_labour');

// Whether a department can be named as a filter at all.
export const hasDepartments = m =>
  m.table === 'daily_departments' || m.table === 'daily_labour';

// ── Quick answers ───────────────────────────────────────────────────────────────
//
// The handful of questions that get asked most, ready-made, so the common case is one
// click and the ticket is only for everything else. These are the starters everybody
// gets; a person pins their own on top of them, which is why a supply chain manager and
// a quality manager end up with different front pages.
export const QUICK = [
  { key: 'q-otd',   label: 'On-time delivery',    sub: 'by location, this month',
    measure: 'otd',    breakdown: 'plant', period: 'mtd' },
  { key: 'q-otif',  label: 'On time, in full',    sub: 'by location, this month',
    measure: 'otif',   breakdown: 'plant', period: 'mtd' },
  { key: 'q-cartons', label: 'Cartons produced',  sub: 'gluing, by location, this month',
    measure: 'output', breakdown: 'plant', period: 'mtd', dept: 'gluing' },
  { key: 'q-uptime', label: 'Uptime',             sub: 'by department, this month',
    measure: 'uptime', breakdown: 'dept',  period: 'mtd' },
  { key: 'q-coq',   label: 'Cost of quality',     sub: 'by location, this year',
    measure: 'coq',    breakdown: 'plant', period: 'ytd' },
  { key: 'q-jobs',  label: 'Jobs shipped',        sub: 'by location, this month',
    measure: 'jobs',   breakdown: 'plant', period: 'mtd' },
];

// ── Turning rows into an answer ────────────────────────────────────────────────

const n = v => (v === null || v === undefined || v === '' ? null : Number(v));

// One group of rows, one figure. Returns null rather than 0 when there is nothing to
// add up — an absent reading is not a zero, and drawing it as one is how a chart lies.
export function reduceRows(m, rows) {
  const vals = rows.map(r => n(r[m.col])).filter(v => v !== null && !Number.isNaN(v));
  if (!vals.length) return null;
  const k = m.scale || 1;
  if (m.agg === 'sum')  return vals.reduce((s, v) => s + v, 0) * k;
  if (m.agg === 'avg')  return (vals.reduce((s, v) => s + v, 0) / vals.length) * k;
  if (m.agg === 'last') return vals[vals.length - 1] * k;
  if (m.agg === 'weighted') {
    const pairs = rows
      .map(r => [n(r[m.col]), n(r[m.by])])
      .filter(([v, w]) => v !== null && !Number.isNaN(v));
    const weight = pairs.reduce((s, [, w]) => s + (w && w > 0 ? w : 0), 0);
    // No weights recorded — fall back to a plain mean rather than refusing to answer,
    // and say so at the call site.
    if (!weight) return (pairs.reduce((s, [v]) => s + v, 0) / pairs.length) * k;
    return (pairs.reduce((s, [v, w]) => s + v * (w && w > 0 ? w : 0), 0) / weight) * k;
  }
  return null;
}

// The target for a group, reduced the same way the value was — which is the only way the
// two can be compared. Three shapes:
//
//   targetBy   a rate: worth rate × driver on each row, added up. A day that ran no hours
//              is owed nothing, which is why the weekend does not raise the bar.
//   weighted   weighted by the same column the value was, so the group's target is the
//              target of the hours that actually reported.
//   otherwise  the mean, because a target that holds every day holds for the period.
export function reduceTarget(m, rows) {
  if (!m.target) return null;
  const k = m.scale || 1;

  if (m.targetBy) {
    const pairs = rows
      .map(r => [n(r[m.target]), n(r[m.targetBy])])
      .filter(([t, d]) => t !== null && d !== null && !Number.isNaN(t) && !Number.isNaN(d));
    if (!pairs.length) return null;
    return pairs.reduce((s, [t, d]) => s + t * d, 0) * k;
  }

  if (m.agg === 'weighted') {
    const pairs = rows
      .map(r => [n(r[m.target]), n(r[m.by])])
      .filter(([t]) => t !== null && !Number.isNaN(t));
    if (!pairs.length) return null;
    const weight = pairs.reduce((s, [, w]) => s + (w && w > 0 ? w : 0), 0);
    if (!weight) return (pairs.reduce((s, [t]) => s + t, 0) / pairs.length) * k;
    return (pairs.reduce((s, [t, w]) => s + t * (w && w > 0 ? w : 0), 0) / weight) * k;
  }

  const vals = rows.map(r => n(r[m.target])).filter(v => v !== null && !Number.isNaN(v));
  if (!vals.length) return null;
  return (vals.reduce((s, v) => s + v, 0) / vals.length) * k;
}

export function formatValue(m, v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (m.money) return '$' + Math.round(v).toLocaleString();
  return v.toLocaleString(undefined, { minimumFractionDigits: m.dp, maximumFractionDigits: m.dp }) + m.unit;
}

// Better or worse, in the measure's own direction. Returns null when there is no target.
export function verdictOf(m, value, target) {
  if (value === null || target === null || target === undefined) return null;
  const diff = value - target;
  const good = m.up ? diff >= 0 : diff <= 0;
  return { good, diff, pct: target ? (diff / target) * 100 : null };
}

// How far off is too far — one rule, used by the headline and by every bar, so the same
// miss cannot be amber in one place and red in the other. Within a tenth of target is a
// warning; past that it is a miss. Returns '' when there is no target to judge against.
export function toneOf(m, value, target) {
  const v = verdictOf(m, value, target);
  if (!v) return '';
  if (v.good) return 'ok';
  return Math.abs(v.pct ?? 100) <= 10 ? 'warn' : 'off';
}

// The window a period means, as two dates. Today is passed in rather than read, so the
// same question asked twice in a session cannot drift across midnight.
export function windowFor(period, today, custom) {
  if (period === 'custom') {
    const from = custom?.from || today, to = custom?.to || today;
    return from <= to ? [from, to] : [to, from];   // typed backwards is still a window
  }
  const d = new Date(today + 'T00:00:00');
  const iso = x => x.toISOString().slice(0, 10);
  const y = d.getFullYear(), m = d.getMonth();
  if (period === 'mtd')  return [iso(new Date(Date.UTC(y, m, 1))), today];
  if (period === 'last') return [iso(new Date(Date.UTC(y, m - 1, 1))), iso(new Date(Date.UTC(y, m, 0)))];
  if (period === 'ytd')  return [iso(new Date(Date.UTC(y, 0, 1))), today];
  const back = new Date(d); back.setDate(back.getDate() - 89);
  return [iso(back), today];
}
