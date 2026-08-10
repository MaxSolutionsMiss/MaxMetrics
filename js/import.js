// Turning the plant's spreadsheets into a morning.
//
// Three rules run through everything here.
//
// **A column is found by name, never by position.** The same field sits in a different
// letter in each of the three DOR tabs, and the files are made by people who add and
// remove columns. Headers are normalised and matched against a list of spellings that
// includes the misspellings already in the files.
//
// **The leftmost match wins.** `Die Cutting Data` and `Gluing Data` head seven consecutive
// columns `Crewed Hours` — over crewed hours, maintenance hours, man hours, and three
// targets — because the label was dragged across a row nobody retyped. Only the first is
// what it says. A reader that took the last match, or summed them, would add a speed
// target of 30,000 to a crew's eight hours.
//
// **Absence is an answer.** Weekends may or may not run and a shift may be cancelled. A
// missing row means that machine did not run; a blank make-ready means there was nothing
// to record. Neither is a warning, and neither holds up an import. An alarm that fires
// every Monday about a Sunday nobody worked is one people learn to close without reading.

import { openWorkbook, serialToISO } from './xlsx.js?v=3586911c2e6f';

// ── Matching a column ───────────────────────────────────────────────────────────

export const normalise = text => String(text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Each field lists every spelling seen in the plant's files, most specific first. `# of
// Shipped Job` and `Numebr of Trucks` are theirs, typo included — matching loosely is
// exactly why they cost nothing.
export const FIELDS = {
  date:        ['date'],
  weekEnding:  ['weekending'],
  day:         ['day'],
  team:        ['team', 'operator', 'crewleader'],
  shift:       ['shift'],
  machine:     ['machine', 'press'],
  qty:         ['netimps', 'netcartons', 'netimpressions', 'netoutput', 'qty', 'volume'],
  hours:       ['crewedhours', 'crewedhrs', 'crewhrs', 'crewhours'],
  runHours:    ['runhrs', 'runhours'],
  mrCount:     ['ofmrs', 'numberofmrs', 'mrcount', 'makereadies'],
  mrHours:     ['mrhrs', 'mrhours', 'makereadyhrs'],
  // `# of Shipped Job` and `# of Shipped Jobs` are both in use — the same sheet has been
  // typed both ways across years — which is the whole argument for listing spellings
  // rather than trusting one.
  jobs:        ['ofshippedjobs', 'ofshippedjob', 'shippedjobs', 'jobsshipped', 'jobs'],
  trucks:      ['numebroftrucks', 'numberoftrucks', 'trucks'],
  late:        ['late', 'lateshipments'],
  short:       ['short', 'shorts', 'shortshipments'],
};

// The first row that carries several known columns. These exports put a title block above
// the header, so row 1 is a guess that happens to be wrong.
export function findHeaderRow(rows, wanted, limit = 12) {
  let best = { at: -1, hits: 0 };
  for (let at = 0; at < Math.min(limit, rows.length); at++) {
    const cells = (rows[at] || []).map(normalise);
    const hits = wanted.filter(field => FIELDS[field].some(spelling => cells.includes(spelling))).length;
    if (hits > best.hits) best = { at, hits };
  }
  return best.hits >= 2 ? best : null;
}

export function mapColumns(headerRow) {
  const cells = (headerRow || []).map(normalise);
  const found = {};
  for (const [field, spellings] of Object.entries(FIELDS)) {
    for (const spelling of spellings) {
      const at = cells.indexOf(spelling);          // leftmost, deliberately
      if (at !== -1) { found[field] = at; break; }
    }
  }
  return found;
}

// ── Names ───────────────────────────────────────────────────────────────────────

// The DOR types its Team column freely, so one person becomes several — Anton appears
// three ways. Incoming names are trimmed, collapsed and matched case-insensitively against
// the operators already on file, including their known aliases. A name that matches nobody
// is kept as typed and reported, never silently invented or dropped.
const tidy = raw => String(raw ?? '').replace(/\s+/g, ' ').trim();

export function nameMatcher(operators = []) {
  const known = new Map();
  for (const person of operators) {
    known.set(normalise(person.name), person.name);
    for (const alias of person.aliases || []) known.set(normalise(alias), person.name);
  }
  return raw => {
    const typed = tidy(raw);
    if (!typed) return { name: '', known: true };
    const match = known.get(normalise(typed));
    return match ? { name: match, known: true } : { name: typed, known: false };
  };
}

// ── The window a morning reports on ─────────────────────────────────────────────

const iso = date => date.toISOString().slice(0, 10);
const addDays = (value, n) => {
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const weekday = value => new Date(`${value}T00:00:00Z`).getUTCDay();

// A morning reviews everything since the last morning. On Tuesday to Friday that is
// yesterday; on Monday it is Friday, Saturday and Sunday together, because Friday's
// production was never reported — Friday's meeting was about Thursday.
//
// Checked against the plant's own dashboards: of 72 department-days, none matches the
// figures dated that same day and 50 match the previous day exactly. Storing production
// against the dashboard date would have put every imported row a day out.
//
// `reported` is the dates that already have a morning, which makes a long weekend or a
// shutdown fall out of the same rule instead of needing its own.
export function windowFor(date, reported = []) {
  const earlier = [...reported].filter(d => d < date).sort();
  const previous = earlier.length ? earlier[earlier.length - 1]
                 : weekday(date) === 1 ? addDays(date, -3) : addDays(date, -1);
  return { from: previous, to: addDays(date, -1) };
}

export const daysBetweenInclusive = (from, to) => {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};

// ── The DOR ─────────────────────────────────────────────────────────────────────

export const DOR_SHEETS = [
  { sheet: 'Printing Data',    dept: 'printing',   unit: 'sheets' },
  { sheet: 'Die Cutting Data', dept: 'diecutting', unit: 'sheets' },
  { sheet: 'Gluing Data',      dept: 'gluing',     unit: 'cartons' },
];

const number = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

// One row per machine per shift, exactly as the sheet holds it. Rolling straight to a
// department day would throw away the three dimensions — machine, shift and team — that
// every question beyond the morning meeting is asked along.
export async function readDor(workbook, { matchName = raw => ({ name: tidy(raw), known: true }) } = {}) {
  const shifts = [], notes = [];

  for (const { sheet, dept, unit } of DOR_SHEETS) {
    const rows = await workbook.rows(sheet);
    if (!rows) { notes.push(`${sheet} is not in this workbook.`); continue; }

    const header = findHeaderRow(rows, ['date', 'machine', 'hours', 'qty']);
    if (!header) { notes.push(`${sheet} has no header row this can recognise.`); continue; }
    const at = mapColumns(rows[header.at]);
    if (at.qty == null || at.hours == null || at.date == null) {
      notes.push(`${sheet} is missing a date, output or crewed-hours column.`);
      continue;
    }

    for (const row of rows.slice(header.at + 1)) {
      const date = serialToISO(row?.[at.date]);
      if (!date) continue;                                   // blank or a stray label
      const matched = matchName(row[at.team]);
      shifts.push({
        dept, unit, date,
        machine: tidy(row[at.machine]),
        shift: tidy(row[at.shift]).toUpperCase(),
        team: matched.name,
        teamKnown: matched.known,
        qty: number(row[at.qty]),
        hours: number(row[at.hours]),
        runHours: number(row[at.runHours]),
        mrCount: number(row[at.mrCount]),
        mrHours: number(row[at.mrHours]),
      });
    }
  }
  return { shifts, notes };
}

// Only the days being imported. The workbook holds years of history and half its names
// left the plant before the operator list existed; counting all of them would put a dozen
// strangers in front of someone importing one Tuesday, and a warning nobody can act on is
// one they learn to scroll past.
export function unknownNamesIn(shifts, from, to) {
  const tally = new Map();
  for (const row of shifts) {
    if (row.date < from || row.date > to) continue;
    if (row.teamKnown || !row.team) continue;
    tally.set(row.team, (tally.get(row.team) || 0) + 1);
  }
  return [...tally.entries()].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// A department's morning figure is the sum over its machines and shifts in the window.
// Uptime is running hours over crewed hours across the whole window rather than an average
// of per-shift ratios: a machine crewed for eight hours and run for one, beside one crewed
// for one and run for one, is 56% uptime, not 100%.
export function rollup(shifts, from, to) {
  const byDept = new Map();
  for (const row of shifts) {
    if (row.date < from || row.date > to) continue;
    const held = byDept.get(row.dept) ?? {
      dept_key: row.dept, unit: row.unit, qty: 0, hours: 0,
      runHours: 0, mrCount: 0, mrHours: 0, machines: new Set(), teams: new Set(), rows: 0,
    };
    held.qty += row.qty; held.hours += row.hours; held.runHours += row.runHours;
    held.mrCount += row.mrCount; held.mrHours += row.mrHours; held.rows += 1;
    if (row.machine) held.machines.add(row.machine);
    if (row.team) held.teams.add(row.team);
    byDept.set(row.dept, held);
  }
  return [...byDept.values()].map(d => ({
    dept_key: d.dept_key,
    unit: d.unit,
    qty: d.qty,
    hours: d.hours,
    rate: d.hours ? d.qty / d.hours : null,
    // Uptime is (make-ready + run) over crewed, not run over crewed.
    //
    // These three were computed and deliberately not imported, because run-over-crewed gave
    // printing 68% on a day the plant recorded near a hundred, and a wrong number that
    // arrived by itself is one nobody thinks to check. The definition was in the workbook
    // the whole time: DOR V9 carries a `Formulas` tab, and it says
    //
    //     Uptime      = (MR Hrs + Run Hrs) / Crewed Hours
    //     Avg MR Time = MR Hrs / # of MR's
    //
    // Setting up a machine is not downtime — it is the machine being worked on by the crew
    // it is crewed for, which is the whole reason make-ready has a target of its own. With
    // the make-ready hours counted, the three departments land between 75% and 95% on every
    // day in the file, and 5 August prints 0.95 h over 5 make-readies, which is the plant's
    // own stored figure to the digit.
    //
    // Clamped at 100. A shift that logs more make-ready and run than it was crewed for is a
    // timesheet to fix, not a machine that ran 124% of the time.
    uptime: d.hours ? Math.min(1, (d.mrHours + d.runHours) / d.hours) : null,
    make_ready: d.mrCount ? d.mrHours / d.mrCount : null,
    mr_count: d.mrCount || null,
    machines: [...d.machines].sort(),
    teams: [...d.teams].sort(),
    shifts: d.rows,
  }));
}

// ── Shipping ────────────────────────────────────────────────────────────────────

// OTD and OTIF are not read even though the sheet holds them. They follow from the three
// counts, and the sheet has at least one row where they disagree — 29 July records 100%
// against 5 jobs with 1 late. Deriving them means the percentages can never contradict the
// counts printed beside them.
export async function readShipping(workbook) {
  const sheet = workbook.sheetNames.find(n => /otd/i.test(n)) ?? workbook.sheetNames[0];
  const rows = await workbook.rows(sheet);
  if (!rows) return { days: [], notes: [`No shipping sheet found.`] };

  const header = findHeaderRow(rows, ['date', 'jobs', 'late']);
  if (!header) return { days: [], notes: [`${sheet} has no header row this can recognise.`] };
  const at = mapColumns(rows[header.at]);
  if (at.date == null || at.jobs == null) return { days: [], notes: [`${sheet} has no date or job count.`] };

  const days = [];
  for (const row of rows.slice(header.at + 1)) {
    const date = serialToISO(row?.[at.date]);
    if (!date) continue;
    const jobs = number(row[at.jobs]);
    if (!jobs) continue;
    const late = number(row[at.late]), short = number(row[at.short]);
    days.push({ date, jobs_shipped: jobs, late, shorts: short,
                jobs_on_time: jobs - late,
                otd: Math.round((jobs - late) / jobs * 10000) / 100,
                otif: Math.round((jobs - late - short) / jobs * 10000) / 100 });
  }
  return { days, notes: [], sheet };
}

// ── What the page hands the reader ──────────────────────────────────────────────

const looksLikeDor = names => names.some(n => /data$/i.test(n) && /print|die|glu/i.test(n));
const looksLikeShipping = names => names.some(n => /otd/i.test(n));

// ── The monthly KPI workbook ────────────────────────────────────────────────────
//
// Quality is not counted every morning. NCRs, customer complaints and the cost of poor
// quality are closed off month by month, in one sheet the quality manager keeps — the row
// per month with the plant's own arithmetic already done. So this is the source for the
// Quality cards and, because the same row carries shipped dollars and OTIF, for the
// Financials and the two OTIF cards as well. It writes to the morning it is imported for:
// a month-to-date figure is true of the morning you read it on.
//
// Its month column is written by hand, so it says JAN and Jan and March and Mar in the same
// column. Three letters, lowercased, is all that survives that.
const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const monthIndex = value => MONTH_KEYS.indexOf(String(value ?? '').trim().slice(0, 3).toLowerCase());

const looksLikeKpi = names => names.some(n => /plz do not touch/i.test(n))
  || names.some(n => /coq/i.test(n)) && names.some(n => /complaint/i.test(n));

// Headers in this sheet carry line breaks, double spaces and trailing blanks, and the
// wording moves between plants. Matching on the letters alone is what survives that.
const bare = text => String(text ?? '').toLowerCase().replace(/[^a-z0-9%$]/g, '');

export async function readKpi(workbook, { date }) {
  const notes = [];
  const sheet = workbook.sheetNames.find(n => /plz do not touch/i.test(n))
    ?? workbook.sheetNames[0];
  const rows = await workbook.rows(sheet);
  const head = (rows[0] || []).map(bare);
  // `find` rather than an index, because a column added to the left of the sheet must not
  // silently shift every reading one place.
  const at = (...wanted) => head.findIndex(h => h && wanted.some(w => h.includes(bare(w))));
  const col = {
    year: at('year'), month: at('month'), plant: at('plant'),
    sales: at('shipped$', 'sales($)', 'sales$'),
    ncrInternal: at('ncrinternal'), ncrSupplier: at('ncrsupplier'),
    complaints: at('totalcc#', 'totalcomplaint'),
    coqDollars: at('totalcoq'), coqPercent: at('copq%'), coqTarget: at('targetcoq%'),
    otif: at('otif'), otifPercent: at('otif%'), deliveries: at('deliveries'),
  };
  if (col.year === -1 || col.month === -1) {
    return { metrics: {}, notes: [`${sheet}: no year and month columns, so no month could be read.`] };
  }

  const want = { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) - 1 };
  const all = rows.slice(1)
    .filter(r => r && Number(r[col.year]) === want.year && monthIndex(r[col.month]) >= 0)
    .map(r => ({ month: monthIndex(r[col.month]), row: r }));
  if (!all.length) {
    return { metrics: {}, notes: [`${sheet}: nothing for ${want.year}.`] };
  }

  // The month being imported for, or the last one the sheet has if it has not been closed
  // off yet. Silently reading a different month than the one asked for is not on.
  const toDate = all.filter(m => m.month <= want.month);
  const latest = (toDate.length ? toDate : all).reduce((a, b) => a.month > b.month ? a : b);
  if (latest.month !== want.month) {
    notes.push(`${sheet}: no row for ${MONTH_KEYS[want.month].toUpperCase()} yet — read `
      + `${MONTH_KEYS[latest.month].toUpperCase()} instead.`);
  }

  const num = (row, index) => index >= 0 && row[index] != null && row[index] !== ''
    ? Number(row[index]) : null;
  const sum = (index) => index < 0 ? null : (toDate.length ? toDate : [latest])
    .reduce((total, m) => total + (Number(m.row[index]) || 0), 0);
  // The sheet keeps its percentages as fractions — 0.0038 is COQ at 0.38% of sales.
  const asPercent = value => value == null ? null : Number((value * 100).toFixed(4));

  const metrics = {};
  const put = (field, value) => { if (value != null && Number.isFinite(value)) metrics[field] = value; };

  put('coq', asPercent(num(latest.row, col.coqPercent)));
  put('coq_target', asPercent(num(latest.row, col.coqTarget)));
  const coqYear = sum(col.coqDollars), salesYear = sum(col.sales);
  if (coqYear != null && salesYear) put('coq_ytd', Number((coqYear / salesYear * 100).toFixed(4)));
  put('coq_ytd_target', asPercent(num(latest.row, col.coqTarget)));
  // Every non-conformance raised this year, whoever raised it.
  const internal = sum(col.ncrInternal), supplier = sum(col.ncrSupplier);
  put('ncr_ytd', (internal || 0) + (supplier || 0));
  put('complaints_internal', internal);
  put('complaints_external', sum(col.complaints));
  put('mtd_otif', asPercent(num(latest.row, col.otifPercent)));
  const otifYear = sum(col.otif), deliveriesYear = sum(col.deliveries);
  if (otifYear != null && deliveriesYear) {
    put('ytd_otif', Number((otifYear / deliveriesYear * 100).toFixed(4)));
  }
  put('fin_actual_mtd', num(latest.row, col.sales));
  put('fin_actual_ytd', salesYear);

  // ── Today, from the raw log rather than the monthly roll-up ──────────────────
  //
  // A year-to-date count answers "how are we doing"; the morning asks "what happened
  // yesterday", and the roll-up sheets cannot say. The raw logs can: one row per NCR and
  // one per customer complaint, each with the date it was raised. Counting rows is the
  // whole of it, and it gives the month to date for free — which is the figure between the
  // two the meeting actually moves on.
  for (const [wanted, fields] of [
    [/ncr.*raw|rerun|shortage.*raw/i, ['ncr_today', 'ncr_mtd']],
    [/cc.*raw|rejection|complaint.*raw/i,
     ['complaints_external_today', 'complaints_external_mtd']],
  ]) {
    const raw = workbook.sheetNames.find(n => wanted.test(n));
    if (!raw) continue;
    const log = await workbook.rows(raw);
    const dateAt = (log[0] || []).findIndex(h => bare(h).startsWith('date'));
    if (dateAt < 0) { notes.push(`${raw}: no date column, so no daily count.`); continue; }
    let today = 0, month = 0;
    for (const row of log.slice(1)) {
      const on = serialToISO(row?.[dateAt]);
      if (!on) continue;
      if (on === date) today += 1;
      if (on.slice(0, 7) === date.slice(0, 7)) month += 1;
    }
    // Nought is a reading. A morning with no NCR raised is the morning worth showing a
    // zero on, and leaving the field empty would carry yesterday's count forward instead.
    metrics[fields[0]] = today;
    metrics[fields[1]] = month;
    notes.push(`${raw}: ${today} on ${date}, ${month} this month.`);
  }
  // Internal non-conformances are the NCR log; the sheet does not split them by origin at
  // the daily level, so the internal count follows the NCR count rather than inventing a
  // split the file cannot support.
  if (metrics.ncr_today != null) metrics.complaints_internal_today = metrics.ncr_today;
  if (metrics.ncr_mtd != null) metrics.complaints_internal_mtd = metrics.ncr_mtd;
  // The month-to-date NCR figure the roll-up gives is the closed month's; the raw log's is
  // the real one for a month still running.
  if (metrics.ncr_mtd == null) put('ncr_mtd', num(latest.row, col.ncrInternal));

  notes.push(`${sheet}: ${MONTH_KEYS[latest.month].toUpperCase()} ${want.year}, `
    + `with the year to date from ${(toDate.length ? toDate : [latest]).length} month(s).`);
  return { metrics, notes, month: latest.month, sheet };
}

// Every file dropped at once, sorted out by what is inside it rather than by its name —
// people rename these. Nothing is written: this returns what *would* be written, for a
// person to look at first.
// ── The old dashboard's own JSON ────────────────────────────────────────────────
//
// `Daily_Morning_Dashboard_Vr 22.html` kept a day in one localStorage blob and could write
// it out as JSON. Those files are the plant's own history and there is no reason they
// should stop being readable, so this takes them.
//
// It is deliberately loose about shape and strict about reporting. The blob may be one day
// or many, the day may be at the top level or under a date key, and the field names are
// whatever that file happened to call them. So: flatten whatever arrives into date-keyed
// objects, match each key against every spelling worth guessing, and — this is the part
// that matters — hand back the list of keys that matched *and* the list that did not.
//
// An importer that silently drops what it does not understand is one nobody can trust with
// a year of history. The preview names every unrecognised key, so a file that half-works
// says exactly which spellings to add rather than leaving somebody to diff two screens.

// Every daily_metrics column, with the spellings the old file is likely to have used.
// Nothing here is confirmed against a real export — there was none to read — so the list
// is a starting point that the preview's "not recognised" column is designed to correct.
export const JSON_FIELDS = {
  injury_last:      ['injurylast', 'lastinjury', 'lastinjurydate', 'injurydate', 'daysinceinjurydate'],
  injury_record:    ['injuryrecord', 'recordinjury', 'injurybest', 'bestinjury', 'recorddays'],
  near_miss_last:   ['nearmisslast', 'lastnearmiss', 'nearmissdate', 'lastnearmissdate'],
  near_miss_record: ['nearmissrecord', 'recordnearmiss', 'nearmissbest'],
  shortages:        ['shortages', 'shortagecount', 'shortage', 'jobsshort'],
  coq:              ['coq', 'costofquality', 'coqmonth', 'coqpercent', 'cop'],
  coq_target:       ['coqtarget', 'costofqualitytarget'],
  coq_ytd:          ['coqytd', 'costofqualityytd', 'coqyeartodate'],
  coq_ytd_target:   ['coqytdtarget'],
  jobs_shipped:     ['jobsshipped', 'shippedjobs', 'ofshippedjobs', 'jobs', 'totaljobs'],
  jobs_on_time:     ['jobsontime', 'ontime', 'ontimejobs'],
  cartons:          ['cartons', 'cartonsshipped', 'totalcartons'],
  late:             ['late', 'lateshipments', 'latejobs'],
  shorts:           ['shorts', 'short', 'shortshipments', 'shortjobs'],
  otd:              ['otd', 'ontimedelivery', 'otdpercent'],
  otif:             ['otif', 'ontimeinfull', 'otifpercent'],
  mtd_otif:         ['mtdotif', 'otifmtd', 'monthtodateotif'],
  ytd_otif:         ['ytdotif', 'otifytd', 'yeartodateotif'],
  ncr_ytd:          ['ncr', 'ncrytd', 'ncrs', 'ncrsreceived', 'ncrreceived', 'ncrcount'],
  complaints_internal: ['complaintsinternal', 'internalcomplaints', 'internal'],
  complaints_external: ['complaintsexternal', 'externalcomplaints', 'customercomplaints', 'external'],
  maintenance_note: ['maintenancenote', 'maintenancenotes', 'maintnote', 'maintenance'],
  staffing_note:    ['staffingnote', 'staffingnotes', 'staffing', 'labournote'],
  fin_actual_mtd:   ['finactualmtd', 'actualmtd', 'salesmtd', 'mtdsales', 'monthtodatesales',
                     'mtdactual', 'mtdrevenue', 'revenuemtd', 'salesmonthtodate', 'invoicedmtd',
                     'mtdinvoiced', 'billedmtd', 'mtdbilled', 'monthtodate'],
  fin_actual_ytd:   ['finactualytd', 'actualytd', 'salesytd', 'ytdsales', 'yeartodatesales',
                     'ytdactual', 'ytdrevenue', 'revenueytd', 'salesyeartodate', 'invoicedytd',
                     'ytdinvoiced', 'billedytd', 'ytdbilled', 'yeartodate'],
};

// Department volume and hours, per department key. The old file named its three by hand.
const JSON_DEPT_FIELDS = {
  qty:        ['qty', 'volume', 'output', 'netimps', 'netcartons', 'sheets', 'cartons', 'impressions',
               'quantity', 'produced', 'units', 'pieces', 'panes', 'imps', 'totalimps', 'grossimps',
               'netsheets', 'totalsheets', 'totalcartons', 'actual', 'actualqty', 'runqty'],
  hours:      ['hours', 'crewhours', 'crewedhours', 'crewhrs', 'hrs', 'manhours', 'labourhours',
               'laborhours', 'workedhours', 'hoursworked', 'totalhours', 'machinehours', 'runhours'],
  target:     ['target', 'targetperhour', 'targethr'],
  pw_qty:     ['pwqty', 'previousweekqty', 'lastweekqty', 'previousvolume'],
  pw_hours:   ['pwhours', 'previousweekhours', 'lastweekhours'],
  uptime:     ['uptime'],
  make_ready: ['makeready', 'mr', 'mrtime', 'avgmrtime', 'makereadytime'],
};

// A streak written as a count, in the spellings the old dashboard used for it.
const STREAK_COUNTS = {
  injury:   ['dayssinceinjury', 'dayssincelastinjury', 'daysinjuryfree', 'injurydays', 'injuryfreedays'],
  nearMiss: ['dayssincenearmiss', 'dayssincelastnearmiss', 'nearmissdays', 'nearmissfreedays'],
};

const DEPT_NAMES = {
  printing:   ['printing', 'print', 'press', 'presses', 'offset', 'printingdept', 'printdept'],
  diecutting: ['diecutting', 'diecut', 'cutting', 'die', 'dies', 'diecutter', 'diecutters'],
  gluing:     ['gluing', 'glue', 'folder', 'foldergluer', 'gluer', 'gluers', 'folding',
               'foldergluing', 'foldinggluing'],
  windowing:  ['windowing', 'window', 'windower', 'windowmachine'],
  shipping:   ['shipping', 'ship'],
};

const matchField = (key, table) => {
  const want = normalise(key);
  for (const [field, spellings] of Object.entries(table)) {
    if (spellings.includes(want)) return field;
  }
  return null;
};

const looksLikeDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '').slice(0, 10))
  && !Number.isNaN(Date.parse(String(value).slice(0, 10)));

const asDate = value => String(value).slice(0, 10);

// The blob may be a day, a list of days, or an object keyed by date — and the old file
// nested things under `days`, `data` or `dashboard` depending on which version wrote it.
// Anything that turns out to carry a date is a day.
function daysIn(parsed) {
  const out = [];
  const consider = (value, keyedDate) => {
    if (!value || typeof value !== 'object') return;
    // A date found higher up belongs to everything under it. It used not to be passed down,
    // so a record dated at the top with sections nested inside it kept only whichever
    // sections carried a date of their own.
    if (Array.isArray(value)) { value.forEach(v => consider(v, keyedDate)); return; }
    const own = Object.entries(value).find(([k]) => matchField(k, { date: ['date', 'metricdate', 'day', 'reportdate'] }));
    const date = keyedDate || (own && looksLikeDate(own[1]) ? asDate(own[1]) : null);
    if (date) { out.push({ date, body: value }); return; }
    for (const [k, v] of Object.entries(value)) {
      if (looksLikeDate(k)) consider(v, asDate(k));
      else if (v && typeof v === 'object') consider(v, keyedDate);
    }
  };
  consider(parsed);

  // A file about one morning is one record, whatever shape it is in.
  //
  // This is the fix for the silent half-import. The walk above stops at the first object
  // carrying a date and treats *that* as the record — so an export laid out as
  // `{safety: {date, …}, shipping: {date, …}, quality: {…}}` kept safety and shipping,
  // because they were dated, and dropped quality on the floor, because it was not. It
  // imported cleanly and reported nothing missing, which is the worst way for an importer
  // to be wrong.
  //
  // When every date in the file is the same date, the question of which object is "the
  // record" does not arise: the whole file is. Reading it from the root picks up the
  // sections that carry a date and the ones that do not, together.
  const dates = [...new Set(out.map(day => day.date))];
  if (dates.length === 1 && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return [{ date: dates[0], body: parsed }];
  }
  // Two records for one morning are one morning. An export that dates each section
  // separately produces one per section, and they are the same day's readings.
  const merged = [];
  for (const day of out) {
    const already = merged.find(m => m.date === day.date);
    if (already) already.bodies.push(day.body);
    else merged.push({ date: day.date, bodies: [day.body] });
  }
  return merged.map(m => ({ date: m.date, body: m.bodies.length === 1 ? m.bodies[0] : m.bodies }));
}

export function readDashboardJson(text, fileName = 'file.json') {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    return { days: [], recognised: [], unknown: [], notes: [`${fileName}: not valid JSON — ${cause.message}`] };
  }

  const days = [], recognised = new Set(), unknown = new Set(), notes = [];

  for (const { date, body } of daysIn(parsed)) {
    const metrics = {}, departments = {};
    const counts = {};
    const walk = (object, path = '') => {
      for (const [key, value] of Object.entries(object || {})) {
        // A list of rows, which is how most exports write "the departments".
        //
        // This was the other half of the silent import. An array fell straight through to
        // the scalar branch and was filed as one unreadable key, so `departments: [{name:
        // "Printing", qty: …, hours: …}, …]` lost every department in the plant and said
        // "departments" once in the not-recognised list. A row that names its department is
        // that department's numbers; a row that does not is walked like any other object.
        if (Array.isArray(value)) {
          for (const item of value) {
            if (!item || typeof item !== 'object') continue;
            const named = Object.entries(item)
              .find(([k]) => ['name', 'department', 'dept', 'machine', 'area', 'line', 'section']
                .includes(normalise(k)));
            const dept = named ? matchField(String(named[1]), DEPT_NAMES) : null;
            if (dept) {
              for (const [k, v] of Object.entries(item)) {
                const inner = matchField(k, JSON_DEPT_FIELDS);
                if (inner) { (departments[dept] ??= {})[inner] = v; recognised.add(`${key}[].${k}`); }
              }
              continue;
            }
            walk(item, path ? `${path}.${key}` : key);
          }
          continue;
        }
        if (value && typeof value === 'object') {
          // A nested object named after a department is that department's numbers — but
          // only if it holds any. "shipping" is both a department and a section of the
          // morning, and an export that groups late, shorts and OTIF under `shipping`
          // was having all four swallowed as unreadable department fields. If nothing
          // inside looks like output or hours, it is a section and gets walked as one.
          const dept = matchField(key, DEPT_NAMES);
          const inner = dept ? Object.entries(value)
            .map(([k, v]) => [matchField(k, JSON_DEPT_FIELDS), k, v])
            .filter(([field]) => field) : [];
          // Half its keys have to be department fields. One out of seven is a section that
          // happens to mention cartons; two out of two is a department.
          if (dept && inner.length && inner.length * 2 >= Object.keys(value).length) {
            for (const [field, k, v] of inner) {
              (departments[dept] ??= {})[field] = v;
              recognised.add(`${key}.${k}`);
            }
            for (const k of Object.keys(value)) {
              if (!inner.some(([, name]) => name === k)) unknown.add(`${key}.${k}`);
            }
            continue;
          }
          walk(value, path ? `${path}.${key}` : key);
          continue;
        }
        const field = matchField(key, JSON_FIELDS);
        if (field) { metrics[field] = value; recognised.add(key); continue; }
        // `printingQty` and `gluing_hours` are the flat form of the same thing.
        const flat = Object.entries(DEPT_NAMES).find(([, spellings]) =>
          spellings.some(s => normalise(key).startsWith(s) && normalise(key) !== s));
        if (flat) {
          const rest = normalise(key).slice(flat[1].find(s => normalise(key).startsWith(s)).length);
          const field2 = matchField(rest, JSON_DEPT_FIELDS);
          if (field2) { (departments[flat[0]] ??= {})[field2] = value; recognised.add(key); continue; }
        }
        const streak = Object.keys(STREAK_COUNTS)
          .find(name => matchField(key, { [name]: STREAK_COUNTS[name] }));
        if (streak) { counts[streak] = value; recognised.add(key); continue; }
        if (!looksLikeDate(value) || !/date/i.test(key)) unknown.add(path ? `${path}.${key}` : key);
      }
    };
    walk(body);

    // A streak written as "412 days" rather than as the date it started.
    //
    // The dashboard stores the date and counts forward from it, because a count is only
    // true on the morning it was written and a date is true forever. An export that carries
    // the count and not the date was losing the reading entirely — but the count and the
    // record's own date are enough to work the date out, so it is worked out rather than
    // dropped. The date already in the file always wins.
    const fromCount = (countKey, dateField) => {
      const days = Number(counts[countKey]);
      if (metrics[dateField] || !Number.isFinite(days)) return;
      const d = new Date(`${date}T00:00:00`);
      d.setDate(d.getDate() - days);
      metrics[dateField] = d.toISOString().slice(0, 10);
    };
    fromCount('injury', 'injury_last');
    fromCount('nearMiss', 'near_miss_last');

    if (Object.keys(metrics).length || Object.keys(departments).length) {
      days.push({ date, metrics, departments });
    }
  }

  if (!days.length) {
    notes.push(`${fileName}: no dated readings found. The importer looks for a date on each `
      + `record, or an object keyed by date.`);
  }
  return {
    days: days.sort((a, b) => a.date.localeCompare(b.date)),
    recognised: [...recognised].sort(),
    unknown: [...unknown].sort(),
    notes,
  };
}

export async function readFiles(files, { date, reported = [], operators = [] } = {}) {
  const matchName = nameMatcher(operators);
  const notes = [];
  let shifts = [], shipping = null, sources = [];

  let json = null;

  for (const file of files) {
    // The old dashboard's exports are JSON, not a workbook, and handing one to the XLSX
    // reader produced "nothing recognisable" — which is true and useless.
    if (/\.json$/i.test(file.name)) {
      const read = readDashboardJson(await file.text(), file.name);
      notes.push(...read.notes);
      if (read.days.length) {
        json = json
          ? { days: json.days.concat(read.days),
              recognised: [...new Set(json.recognised.concat(read.recognised))].sort(),
              unknown: [...new Set(json.unknown.concat(read.unknown))].sort() }
          : read;
        sources.push({ file: file.name, kind: 'history', rows: read.days.length });
      }
      continue;
    }
    let workbook;
    try {
      workbook = await openWorkbook(await file.arrayBuffer());
    } catch (cause) {
      notes.push(`${file.name}: ${cause.message}`);
      continue;
    }
    const names = workbook.sheetNames;
    if (looksLikeDor(names)) {
      const read = await readDor(workbook, { matchName });
      shifts = shifts.concat(read.shifts);
      notes.push(...read.notes.map(n => `${file.name}: ${n}`));
      sources.push({ file: file.name, kind: 'production', rows: read.shifts.length });
    } else if (looksLikeKpi(names)) {
      // Monthly quality, and the sales and OTIF that sit on the same row. It goes through
      // the same door as an old-dashboard export — one dated record of readings — so the
      // preview, the coverage strip and the never-overwrite rule all apply unchanged.
      const read = await readKpi(workbook, { date });
      notes.push(...read.notes.map(n => `${file.name}: ${n}`));
      if (Object.keys(read.metrics).length) {
        const day = { date, metrics: read.metrics, departments: {} };
        json = json
          ? { days: json.days.concat([day]),
              recognised: [...new Set(json.recognised.concat(Object.keys(read.metrics)))].sort(),
              unknown: json.unknown }
          : { days: [day], recognised: Object.keys(read.metrics).sort(), unknown: [] };
        sources.push({ file: file.name, kind: 'quality', rows: Object.keys(read.metrics).length });
      }
    } else if (looksLikeShipping(names)) {
      const read = await readShipping(workbook);
      shipping = read.days;
      notes.push(...read.notes.map(n => `${file.name}: ${n}`));
      sources.push({ file: file.name, kind: 'shipping', rows: read.days.length });
    } else {
      notes.push(`${file.name}: nothing recognisable — sheets are ${names.slice(0, 4).join(', ')}.`);
    }
  }

  const span = windowFor(date, reported);
  const departments = rollup(shifts, span.from, span.to);
  // Shipping is counted on the day it is entered, not shifted: a truck that left yesterday
  // is recorded against yesterday and the morning reads that row directly.
  const ship = (shipping || []).find(d => d.date === span.to) ?? null;

  return {
    date, span, sources, departments, shipping: ship, json,
    covering: daysBetweenInclusive(span.from, span.to),
    unknownNames: unknownNamesIn(shifts, span.from, span.to),
    notes,
    shiftCount: shifts.filter(s => s.date >= span.from && s.date <= span.to).length,
  };
}
