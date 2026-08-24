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

export const AREAS = ['Production', 'Shipping', 'Quality', 'Money', 'Safety', 'People'];

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

  { key: 'otif', area: 'Shipping', name: 'On time, in full', hint: 'the shipping promise kept',
    table: 'daily_metrics', col: 'otif', agg: 'weighted', by: 'jobs_shipped', unit: '%', dp: 1, up: true,
    target: 'otif_target' },
  { key: 'otd', area: 'Shipping', name: 'On time', hint: 'delivered by the date promised',
    table: 'daily_metrics', col: 'otd', agg: 'weighted', by: 'jobs_shipped', unit: '%', dp: 1, up: true,
    target: 'otd_target' },
  { key: 'jobs', area: 'Shipping', name: 'Jobs shipped', hint: 'orders out the door',
    table: 'daily_metrics', col: 'jobs_shipped', agg: 'sum', unit: '', dp: 0, up: true },
  { key: 'late', area: 'Shipping', name: 'Late', hint: 'jobs that missed the date',
    table: 'daily_metrics', col: 'late', agg: 'sum', unit: '', dp: 0, up: false },
  { key: 'shorts', area: 'Shipping', name: 'Short', hint: 'jobs that went incomplete',
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
];

// A measure can be split by a dimension only if its own table carries that dimension.
export const BREAKDOWNS = [
  { key: 'none',  name: 'Nothing',    hint: 'one figure for the whole period' },
  { key: 'dept',  name: 'Department', hint: 'each department separately', needs: 'dept_key' },
  { key: 'day',   name: 'Day',        hint: 'each working day' },
  { key: 'month', name: 'Month',      hint: 'each month in the period' },
  { key: 'plant', name: 'Plant',      hint: 'compare the plants you can see' },
];

export const PERIODS = [
  { key: 'mtd',   name: 'This month' },
  { key: 'last',  name: 'Last month' },
  { key: 'd90',   name: 'Last 90 days' },
  { key: 'ytd',   name: 'This year' },
];

// The two dimensions nothing records. Shown in the picker, deliberately, because a greyed
// option with a reason is how somebody learns what to start collecting.
export const NOT_COLLECTED = [
  { name: 'Machine', why: 'Presses are configured with their own targets, but no fact table carries a machine — the reading arrives per department.' },
  { name: 'Shift',   why: 'No table records which shift a number belongs to.' },
];

export const measure = key => MEASURES.find(m => m.key === key);

export const areaOf = area => MEASURES.filter(m => m.area === area);

// Which breakdowns this measure can honestly offer.
export const breakdownsFor = m => BREAKDOWNS.filter(b =>
  !b.needs || m.table === 'daily_departments' || m.table === 'daily_labour');

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
export function windowFor(period, today) {
  const d = new Date(today + 'T00:00:00');
  const iso = x => x.toISOString().slice(0, 10);
  const y = d.getFullYear(), m = d.getMonth();
  if (period === 'mtd')  return [iso(new Date(Date.UTC(y, m, 1))), today];
  if (period === 'last') return [iso(new Date(Date.UTC(y, m - 1, 1))), iso(new Date(Date.UTC(y, m, 0)))];
  if (period === 'ytd')  return [iso(new Date(Date.UTC(y, 0, 1))), today];
  const back = new Date(d); back.setDate(back.getDate() - 89);
  return [iso(back), today];
}
