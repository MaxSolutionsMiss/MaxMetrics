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

import { openWorkbook, serialToISO } from './xlsx.js?v=e1d5261000a4';

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
    // Uptime, make-ready and the make-ready count are computed but NOT imported, because
    // these formulas are demonstrably not the plant's. Rolling 4 August the way the DOR's
    // own columns suggest gives printing 68.2% uptime, 1.03 h make-ready and 9 make-readies;
    // the figures the plant stored for that day are 100%, 0.95 h and 5. Output and crewed
    // hours reproduce exactly, so the sheet is being read correctly — these three are
    // derived somewhere else, from a definition nobody has written down yet.
    //
    // Writing them anyway would put three wrong numbers on a dashboard beside two right
    // ones, which is worse than leaving them to be typed: a wrong number that arrived by
    // itself is one nobody thinks to check.
    uptime: d.hours && d.runHours ? d.runHours / d.hours : null,
    make_ready: d.mrCount ? d.mrHours / d.mrCount : null,
    mr_count: d.mrCount || null,
    derivedUnverified: true,
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

// Every file dropped at once, sorted out by what is inside it rather than by its name —
// people rename these. Nothing is written: this returns what *would* be written, for a
// person to look at first.
export async function readFiles(files, { date, reported = [], operators = [] } = {}) {
  const matchName = nameMatcher(operators);
  const notes = [];
  let shifts = [], shipping = null, sources = [];

  for (const file of files) {
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
    date, span, sources, departments, shipping: ship,
    covering: daysBetweenInclusive(span.from, span.to),
    unknownNames: unknownNamesIn(shifts, span.from, span.to),
    notes,
    shiftCount: shifts.filter(s => s.date >= span.from && s.date <= span.to).length,
  };
}
