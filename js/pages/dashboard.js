// The daily dashboard.
//
// Three people work a morning at once, so nothing here claims the day. "Enter data" shows
// the input fields and is a preference belonging to the person who pressed it; two people
// can have it on together. Each field saves itself as it is typed, and every save is a
// write to one column, so two people filling in two readings never overwrite each other.

import {
  currentSession, signOut, myProfile, myLocations, savePreference, savePlant,
  openDay, loadDay, loadHistory, loadBudgets, loadYearCounts, loadMachines,
  loadUpcoming, addMaintenance, saveMaintenance, removeMaintenance,
  saveField, saveDepartment, saveReview,
  saveBudget, saveLabour, publish, recordEdit, joinDay, loadOperators, loadReportedDates,
  pullSources, resetMorning,
  importHistory,
} from '../db.js?v=7797614a895f';
import { assess, attention, settled, absent, counts, isComplete, verdicts } from '../assess.js?v=7797614a895f';
import {
  esc, band, MONTHS, DAYS, dateOf, daysBetween, num, shortDate, money, trend,
  metricCard, listCard, noteCard, footLine, drawReading, showsHeroNumber, iconFor, hideCards,
  spark, bullet, chip, cardTrack, readingOf, derivedShipping, otifTarget, otdTarget,
  isNa, isMissing,
  varianceChip, varianceTone, variancePct,
  volumeLabel, rateLabel, hoursLabel, CARD_CATALOGUE,
} from '../readings.js?v=7797614a895f';

const $ = selector => document.querySelector(selector);

const session = await currentSession();
if (!session) location.replace('../index.html');

const today = () => new Date().toISOString().slice(0, 10);

// A date, n days off. This was being called here and only ever declared inside import.js,
// where it is not exported — so every file drop and every history write threw a
// ReferenceError before it reached the network. Both callers are in click handlers, where a
// throw is silent, which is why it went unnoticed through a release.
const addDays = (value, n) => {
  const d = dateOf(value);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const state = {
  me: null, locations: [], canEdit: true,
  location: null, date: today(), active: 'overview',
  metrics: null, departments: [], review: [], maintenance: [], labour: [], config: [], budgets: [],
  machines: [], upcoming: [],
  history: { metrics: [], departments: [] }, year: [], findings: [], verdicts: {}, plant: null,
  team: [], live: null, wallStep: 0, wallMode: 'walk', rotating: false,
  // Whether a section screen is showing its cards or asking for its readings. One answer for
  // all of them, because the work it exists for is going down the rail filling each in.
  filling: false,
};

// ── Reading the loaded morning ──────────────────────────────────────────────────

const metric = field => readingOf(state.metrics, field);
const dept = key => state.departments.find(d => d.dept_key === key) || {};
const rateOf = row => Number(row?.hours) ? Number(row.qty) / Number(row.hours) : 0;
const configured = () => state.config.filter(c => c.on_metrics);
const budgetFor = month => Number(state.budgets.find(b => b.month === month + 1)?.amount || 0);

// The dot beside a section in the rail and the line at the top of that section are the
// same verdict, printed twice. It used to be worked out twice as well, from two different
// sets of thresholds, which is precisely the disagreement `band()` exists to prevent.
const sectionTone = key => state.verdicts[key]?.tone || 'ok';

// The seven days behind a metric, for the trend line under its card.
// A day with nought jobs shipped has no OTIF, and a line drawn through it would either
// break or invent a nought. It is left out of the seven days, the same way a day nobody
// entered is.
const metricSeries = field => (state.history?.metrics || [])
  .map(row => readingOf(row, field))
  .filter(value => !isMissing(value) && !isNa(value))
  .map(Number);
// Twelve slots, one per month, filled with the largest month-to-date count written in each.
// Months the year has not reached are left out by the caller rather than zeroed here.
const monthSeries = field => {
  const months = Array(12).fill(null);
  for (const row of state.year || []) {
    const value = row?.[field];
    if (value == null || value === '') continue;
    const m = Number(String(row.metric_date).slice(5, 7)) - 1;
    if (m < 0 || m > 11) continue;
    months[m] = Math.max(months[m] ?? 0, Number(value));
  }
  return months;
};

const deptSeries = (key, field) => (state.history?.departments || [])
  .filter(row => row.dept_key === key)
  .map(row => field ? Number(row[field]) : (Number(row.hours) ? Number(row.qty) / Number(row.hours) : null))
  .filter(value => Number.isFinite(value));

// ── Sections ────────────────────────────────────────────────────────────────────

const ICONS = {
  overview:    'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  safety:      'M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z',
  quality:     'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.9z',
  production:  'M4 20V9l5 3V9l5 3V4l6 4v12z',
  shipping:    'M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19a1.6 1.6 0 100-3.2A1.6 1.6 0 007 19zM17.5 19a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2z',
  maintenance: 'M14.5 6.5a3.5 3.5 0 01-4.6 4.6L5 16l3 3 4.9-4.9a3.5 3.5 0 004.6-4.6l-2.4 2.4-2.1-2.1z',
  labour:      'M12 12a3.6 3.6 0 100-7.2 3.6 3.6 0 000 7.2M4.5 20a7.5 7.5 0 0115 0',
  financials:  'M12 3v18M8.5 7.5h6M8.5 7.5a2.6 2.6 0 000 5.2h3a2.6 2.6 0 010 5.2h-6',
  configure:   'M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1v.3a2 2 0 11-4 0v-.2a1.6 1.6 0 00-2.8-1.1l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 004 15H3.7a2 2 0 110-4h.2A1.6 1.6 0 005 8.6L4.9 8.5a2 2 0 112.8-2.8l.1.1A1.6 1.6 0 0010.6 4.7V4.4a2 2 0 114 0v.2a1.6 1.6 0 002.7 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 001.1 2.7h.3a2 2 0 110 4h-.2a1.6 1.6 0 00-1.4 1z',
};
// Two surfaces over the whole morning, then the sections for when someone asks a question
// they do not answer. Enter is where a morning is typed; Today is the fastest possible
// read, which is the one that says what needs deciding.
//
// There were three. The Board was a third arrangement of the same readings — one lane per
// area, one owner per lane — and it was the one nobody opened: it answered "who owns this"
// on a product where the rail already says so, and it was a fourth card shape to keep in
// step with the other three. A surface that has to be maintained and is never read is a
// cost with no reader, so it is gone rather than tidied.
const VIEWS = ['fill', 'line'];
// The order the meeting actually walks: what happened to people, what the plant made,
// what left the building, what it earned, and what needs fixing.
// Safety and quality were one section because the old dashboard drew them in one row.
// They are two subjects with two owners, and on a wall each deserves its own screen — six
// quality readings do not fit under two safety ones.
const ORDER = ['safety', 'quality', 'production', 'shipping', 'financials', 'maintenance', 'labour'];
// Labour and maintenance are one screen for most plants and two for some, so it is the
// plant's own answer rather than a rule. Together is the default.
const order = () => ORDER.filter(key => key !== 'maintenance' || state.plant?.split_upkeep);
const TITLES = {
  safety: 'Safety', quality: 'Quality', production: 'Production', shipping: 'Shipping',
  maintenance: 'Upcoming maintenance', labour: 'Labour & Overtime', financials: 'Financials',
};
const NAV = { labour: 'Labour', line: 'Summary', fill: 'Enter' };
Object.assign(TITLES, { line: 'Morning summary', fill: 'Enter the morning' });
Object.assign(ICONS, {
  line:  'M4 6h16M4 12h10M4 18h6',
  fill:  'M4 20h16M6 15.5L15.5 6l2.5 2.5L8.5 18H6z',
});

// A reading, drawn the way the room reads it: what it is, how big, against what, and
// which way it has been going.
function readingBody(r, { showSpark = true } = {}) {
  const line = showSpark && r.series?.length > 1 ? spark(r.series, r.tone) : '';
  const bar = r.target
    ? bullet({ actual: Number(String(r.value).replace(/[^0-9.-]/g, '')) || r.raw || 0,
               target: r.target, tone: r.tone, floor: r.floor || 0, ceiling: r.ceiling || 0,
               lowerIsBetter: !!r.lowerIsBetter })
    : '';
  return { line, bar };
}

// The caption and the box are two elements, so the caption is repeated as the box's own
// name — a `<label>` that does not wrap and has no `for` labels nothing.
const field = (label, name, attrs = '') =>
  `<div class="er"><label>${esc(label)}</label>
   <input class="inp" aria-label="${esc(label)}" data-field="${name}" ${attrs}></div>`;

function streakCard(kind, label, lastField, recordField, word) {
  const last = metric(lastField), record = Number(metric(recordField) || 0);
  const days = last ? daysBetween(last, state.date) : null;
  const beaten = days != null && record > 0 && days >= record;
  const tone = days == null ? '' : band.streak(days);
  return metricCard({
    // Always the number, whatever the reader picked. A bar, a ring and a gauge all draw a
    // reading against something it is measured by, and a streak is measured against
    // nothing — the record is a target to beat, not a denominator. Drawn as a bar it
    // filled a little further every morning and said the same thing every morning.
    chart: 'number', pkey: kind, label, tone,
    // The unit goes under the number rather than beside it, the way a rate sets
    // "sheets / hr" under its figure. Inline, it competed with the reading for the same
    // line and made a two-character number look like part of a phrase.
    value: days == null ? '\u2014' : days, sub: 'days',
    flag: beaten ? `<div class="flag flag--ok">Record broken · +${days - record} days</div>` : '',
    // No bar. Two drafts drew the streak against the record, first as a target to reach and
    // then as a marker to run past, and both were wrong for the same reason: the plant is
    // not trying to beat this record. Safety has one target and it is zero — zero injuries,
    // zero near-misses — and a bar filling a little further every morning turns "eighty-nine
    // days clean" into a race against a number the room would rather never think about
    // again. The record belongs where it is: a fact under the rule, not a finish line.
    foot: footLine([
      ['Record', record ? `${record} days` : null,
        { field: recordField, attrs: `type="number" min="0" value="${record || ''}"` }],
      [`Last ${word}`, shortDate(last),
        { field: lastField, attrs: `type="date" value="${last || ''}"` }],
    ]),
  });
}

function coqCard(kind, label, valueField, targetField) {
  const value = metric(valueField), target = Number(metric(targetField) || 0.85);
  const has = value != null && value !== '';
  const tone = has ? band.coq(Number(value), target) : '';
  const variance = has ? varianceChip(Number(value), target, { lowerIsBetter: true }) : null;
  return metricCard({
    chart: 'number', pkey: kind, label, tone,
    value: has ? Number(value).toFixed(2) : '\u2014', unit: '%', sub: 'of sales',
    percent: has ? Number(value) / (target * 1.6) * 100 : 0,
    markPercent: 100 / 1.6, markLabel: 'target',
    // The bar against target, and the line under it.
    //
    // The line was dropped once, on the argument that cost of quality is a month-long figure
    // and seven mornings of it is the same number seven times. That is true of a month that
    // has closed and false of the one running: a month-to-date figure moves every time a
    // claim lands, and its shape — creeping up all week, or flat since Monday — is the
    // only warning the room gets before the month closes on the wrong side of target.
    track: has ? cardTrack({
      chart: 'number', actual: Number(value), target, tone, lowerIsBetter: true,
      targetText: `Against \u2264 ${target.toFixed(2)}%`, series: metricSeries(valueField),
    }) : '',
    heroEdit: { field: valueField, attrs: `type="number" step="0.01" value="${value ?? ''}"` },
    foot: footLine([
      ['Target', `\u2264 ${target.toFixed(2)}%`,
        { field: targetField, attrs: `type="number" step="0.01" value="${target}"` }],
      ['Variance', variance],
    ]),
  });
}

// A note is a list of things, so it is drawn as one.
//
// Whoever writes the day's review types one thing per line — "Die 4 slow on nights",
// "waiting on a plate" — and it came out as a paragraph with the line breaks collapsed, so
// three problems read as one long sentence. Every line is a bullet; a single line is left
// as a sentence, because one bullet is not a list.
function bullets(text) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.replace(/^[-*\u2022]\s*/, '').trim())
    .filter(Boolean);
  if (!lines.length) return `<div class="rev__note rev__note--none">No issues reported.</div>`;
  if (lines.length === 1) return `<div class="rev__note">${esc(lines[0])}</div>`;
  return `<ul class="rev__note rev__note--list">${
    lines.map(line => `<li>${esc(line)}</li>`).join('')}</ul>`;
}

// ── Entering a number where the number is ───────────────────────────────────────
//
// The fields used to hang under whatever they belonged to: a table of four departments, and
// then four more rows of labelled inputs beneath it saying the same four names again. Twice
// the height for the same information, and the person filling it in has to look up the row,
// look down at the form, and keep their place.
//
// A cell shows its value and holds its field. In edit mode the value steps aside and the
// input takes the same square of the table, so the form is the table and nothing moves.
// Nothing needs more than seven digits, so nothing is wider than seven digits either.
// The four answers a department can give about its last twenty-four hours, and the first of
// them is that it has not answered. It used to default to "No issue", so the morning opened
// with every department already reporting itself clear — a statement nobody had made, on a
// screen twenty people read. Blank is now a real option and it is where a morning starts.
const REVIEW_ANSWERS = [['', 'Not confirmed'], ['ok', 'No issue'], ['warn', 'Warning'],
                        ['stop', 'Issue']];
const reviewOptions = chosen => REVIEW_ANSWERS.map(([value, text]) =>
  `<option value="${value}"${(chosen || '') === value ? ' selected' : ''}>${text}</option>`).join('');

// Every field on the product carries its own name. Thirty-two of the sixty-six controls on
// Enter had no label, no `aria-label` and no id — the maintenance table and the notes rows
// use a `<span>` where a `<label>` belongs — which breaks a screen reader, and also breaks
// voice control and the browser's own autofill for everybody else. A cell is told what it
// is by its caller, because only the caller knows whether this box is Printing's hours or
// Gluing's.
const cell = (shown, name, attrs = '', klass = '') =>
  `<span class="view-only">${shown ?? '—'}</span>` +
  `<input class="inp inp--cell edit-only${klass ? ` ${klass}` : ''}" data-field="${name}" ${attrs}>`;

const mergedUpkeep = () => !state.plant?.split_upkeep;

// ── Maintenance ─────────────────────────────────────────────────────────────────

const MAINT_STATUS = ['Scheduled', 'Due Today', 'Overdue', 'Complete'];

// Everything with a date from this morning on, and anything not dated yet.
const upcomingItems = () => (state.upcoming || []).length
  ? state.upcoming
  : state.maintenance.filter(m => !m.scheduled_on || m.scheduled_on >= state.date);

const whenText = (row, brief) => {
  if (!row.scheduled_on) return row.scheduled || '—';
  if (row.scheduled_on === state.date) return 'Today';
  const d = dateOf(row.scheduled_on);
  // The year is noise on a list that never runs more than a few weeks out, and on the
  // snapshot the column is a fifth of a block.
  return brief || d.getFullYear() === dateOf(state.date).getFullYear()
    ? `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`
    : shortDate(row.scheduled_on);
};

// What the morning implies somebody should do.
//
// Every other card on the product answers "what happened". This one answers the question the
// room asks straight afterwards and then writes on a whiteboard: what are we lining up. It
// is not a forecast and it is not a language model — it is the readings already on the page,
// sorted by how soon they bite and said as an instruction rather than as a number.
//
// The rules are the plant's own, in the order the room would say them: something breaking
// today, then a machine that is going to be down, then the departments that missed target,
// then the overtime that is already booked, then what a department manager flagged in the
// last twenty-four hours. Six lines, because a list nobody can read across a room is a list
// nobody reads.
//
// It is a card, so it can be switched off in Configure like any other, and it is worked out
// on the client from state the page already holds — nothing is stored, so it cannot go stale
// against the readings it is drawn from.
function planRows() {
  const rows = [];
  const soon = new Date(dateOf(state.date)); soon.setDate(soon.getDate() + 1);
  const tomorrow = soon.toISOString().slice(0, 10);
  for (const m of upcomingItems()) {
    const due = !m.scheduled_on || m.scheduled_on <= tomorrow;
    if (!due && m.status !== 'Overdue') continue;
    rows.push([m.machine || m.dept || 'Maintenance',
               m.hours ? `${m.hours} h` : whenText(m, true),
               m.status === 'Overdue' ? 'stop' : 'warn',
               [m.dept, m.note || m.item_type, whenText(m, true)].filter(Boolean).join(' · ')]);
  }
  for (const config of state.config.filter(c => c.active !== false)) {
    const row = dept(config.key), rate = rateOf(row);
    const target = Number(row.target ?? config.target);
    if (!rate || !target || rate >= target) continue;
    rows.push([config.name, `${(100 * (rate - target) / target).toFixed(1)}%`,
               band.rate(rate, target) || 'warn',
               `${num(Math.round(rate))} against ${num(Math.round(target))} ${rateLabel(config)}`]);
  }
  for (const config of state.config.filter(c => otShifts(c.key) > 0)) {
    rows.push([config.name, `${otShifts(config.key)} shifts`, 'warn',
               otMachines(config.key).map(m => m.name).join(', ') || 'overtime booked']);
  }
  for (const row of state.review.filter(r => r.status === 'stop' || r.status === 'warn')) {
    const config = state.config.find(c => c.key === row.dept_key);
    const first = String(row.note || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)[0];
    if (!first) continue;
    rows.push([config?.name || row.dept_key, row.status === 'stop' ? 'Issue' : 'Watch',
               row.status, first]);
  }
  return rows;
}

// A screen is one grid of cards. The key is what an arrangement the plant drags into is
// stored against, so it has to name the screen rather than the group of cards — two grids on
// one screen is two arrangements and a row that ends early.
const cardGrid = (key, cards) =>
  `<div class="grid grid--cards" data-grid="${esc(key)}">${cards}</div>`;

function maintenanceCards() {
  const items = upcomingItems();
  const today = state.maintenance;
  const overdue = today.filter(m => m.status === 'Overdue').length;
  const open = today.filter(m => m.status !== 'Complete').length;
  const done = today.filter(m => m.status === 'Complete').length;
  const any = today.length;
  return `${metricCard({
      chart: 'number', pkey: 'maint-overdue', label: 'Overdue items',
      tone: any ? band.maint(overdue ? 'Overdue' : 'Complete') : '',
      value: any ? String(overdue) : '—',
      sub: any ? 'past their scheduled date' : 'Nothing scheduled today',
      foot: footLine([['Target', '0']]),
    })}
    ${metricCard({
      chart: 'number', pkey: 'maint-open', label: 'Open work', tone: '',
      value: any ? String(open) : '—',
      sub: any ? `of ${any} scheduled today` : 'Nothing scheduled today',
      foot: footLine([['Completed', any ? `${done} of ${any}` : null]]),
    })}
    ${listCard({
      pkey: 'maint-list', label: 'Today’s schedule',
      rows: today.map(m => [m.dept || '—', esc(m.status), band.maint(m.status),
                            m.machine || m.item_type || null]),
      empty: 'Nothing scheduled for today.',
    })}
    ${listCard({
      pkey: 'maint-upcoming', label: 'Upcoming maintenance',
      rows: items.map(m => [m.dept || '—', esc(whenText(m)), band.maint(m.status),
        [m.machine, m.hours ? `${m.hours} h` : '', m.note].filter(Boolean).join(' · ') || null]),
      empty: 'Nothing booked in.',
      cap: 6,
    })}
    ${noteCard({
      pkey: 'maint-note', label: 'Maintenance notes',
      text: metric('maintenance_note'),
      prompt: 'No notes entered.',
      edit: `<div class="er"><label>Notes</label><textarea class="inp"
        aria-label="Maintenance notes"
        data-field="maintenance_note">${esc(metric('maintenance_note') || '')}</textarea></div>`,
    })}
  `;
}

// The plant names a department "Die Cutting" and the machine list keys it "diecutting".
const deptKeyOf = name => (state.config.find(c => c.name === name) || {}).key
  || String(name ?? '').toLowerCase().replace(/[^a-z]/g, '');

// ── Labour ──────────────────────────────────────────────────────────────────────

function labourCards() {
  const list = state.config.filter(c => c.active !== false);
  const running = list.filter(c => otShifts(c.key) > 0);
  const total = list.reduce((sum, c) => sum + otShifts(c.key), 0);
  const entered = state.labour.some(l => l.ot_shifts != null);
  const onOt = list.reduce((sum, c) => sum + otMachines(c.key).length, 0);
  const floor = list.reduce((n, c) => n + machinesIn(c.key).length, 0);
  const busiest = running.length
    ? [...running].sort((a, b) => otShifts(b.key) - otShifts(a.key))[0] : null;

  const headline = !entered
    ? ['—', 'Nothing entered yet']
    : total === 0
      ? ['0', 'No overtime this morning']
      : [String(total), `${running.length} department${running.length === 1 ? '' : 's'} on overtime`];

  return `${metricCard({
      chart: 'number', pkey: 'ot-total', label: 'Overtime shifts',
      tone: total > 0 ? 'warn' : entered ? 'ok' : '',
      value: headline[0], sub: `shifts · ${headline[1]}`,
      foot: footLine([['Target', '0 shifts']]),
    })}
    ${metricCard({
      chart: 'number', pkey: 'ot-depts', label: 'Machines on OT',
      tone: onOt > 0 ? 'warn' : entered ? 'ok' : '',
      value: entered ? String(onOt) : '—',
      sub: entered ? `of ${floor} on the floor` : 'Nothing entered yet',
      foot: footLine([['Most shifts', busiest ? esc(busiest.name) : null]]),
    })}
    ${listCard({
      pkey: 'ot-list', label: 'Overtime by department',
      // "Three shifts, Heidelberg and Omega" is the whole of what the room says about a
      // department's overtime, so it is the whole of what the card prints — the count
      // against the name, and the machines on the quieter line under it.
      rows: list.map(c => [c.name,
        otShifts(c.key) ? `${otShifts(c.key)} shift${otShifts(c.key) === 1 ? '' : 's'}` : '—',
        otShifts(c.key) > 0 ? 'warn' : '', machineNames(c.key) || null]),
      empty: 'No departments configured.',
    })}
    ${listCard({
      pkey: 'plan', label: 'What to line up', icon: iconFor('week'),
      tone: (rows => rows.some(r => r[2] === 'stop') ? 'stop'
        : rows.length ? 'warn' : 'ok')(planRows()),
      rows: planRows().map(([left, right, tone, sub]) =>
        [left, right, tone === 'ok' ? '' : tone, sub]),
      empty: 'Nothing outstanding from this morning.',
      cap: 6,
    })}
    ${noteCard({
      pkey: 'staffing', label: 'Staffing notes',
      text: metric('staffing_note'),
      prompt: 'Call-ins, vacation, training — nothing entered.',
      edit: `<div class="er"><label>Staffing</label><textarea class="inp"
        aria-label="Staffing notes"
        data-field="staffing_note">${esc(metric('staffing_note') || '')}</textarea></div>`,
    })}
  `;
}

const labourRow = key => state.labour.find(l => l.dept_key === key);
const otShifts = key => Number(labourRow(key)?.ot_shifts ?? 0);
const machinesIn = key => (state.machines || [])
  .filter(m => m.dept_key === key && m.active !== false);
const otMachines = key => {
  const chosen = new Set(labourRow(key)?.machines || []);
  return machinesIn(key).filter(m => chosen.has(m.code));
};
const machineNames = key => otMachines(key).map(m => m.name).join(', ');

// ── Entering the morning ────────────────────────────────────────────────────────
//
// One screen, no charts, no colour except where something is wrong.
//
// The dashboard was one page doing three jobs — filling it in, reading it, and showing it on
// a wall — and each wants a different density. Filling it in was losing: you scrolled past a
// graph to reach a box, and the box was on a card sized for a room ten metres away.
//
// The number this screen is measured against is how many boxes a person has to touch. Of the
// values on a Mississauga morning, most already exist in a file — the DOR carries production,
// the KPI workbook carries quality and the money. Those are shown, quietly, with the file
// that filled them named beside them; they can be corrected but nobody has to visit them. The
// ones nobody can know from a file — whether somebody got hurt, how many jobs went short,
// who is on overtime, what went wrong overnight — are the ones this counts and chases.
//
// Nothing else changed. The cards, the graphs and the walk are exactly where they were: this
// is a fourth door into the same morning, not a replacement for the room's.

// Which fields arrive in a file, and which file. Static, because the mapping is a property of
// the parsers rather than of a morning — and a field nobody has to fill is a field this
// screen must not nag about.
const FROM_FILE = {
  DOR: ['qty', 'hours', 'uptime', 'make_ready', 'pw_qty', 'pw_hours'],
  KPI: ['coq', 'coq_ytd', 'coq_target', 'coq_ytd_target', 'ncr_today', 'ncr_mtd', 'ncr_ytd',
        'complaints_internal_today', 'complaints_internal_mtd', 'complaints_internal',
        'complaints_external_today', 'complaints_external_mtd', 'complaints_external',
        'mtd_otif', 'ytd_otif', 'mtd_otd', 'ytd_otd', 'fin_actual_mtd', 'fin_actual_ytd'],
  OTIF: ['jobs_shipped', 'jobs_on_time', 'late', 'shorts'],
};
const sourceOf = name => Object.keys(FROM_FILE).find(file => FROM_FILE[file].includes(name)) || '';

// When each file last arrived, said out loud.
//
// A figure that came out of the DOR six days ago and a figure entered this morning look
// exactly the same on a card, and that is the whole of how a stale number sits on a screen
// for a week without anybody noticing. The importer stamps `source_seen` per file; this
// reads it back. A file that has not been seen since before this morning is amber, and one
// that has never been seen says so rather than pretending.
const SOURCE_NAMES = { DOR: 'DOR', OTIF: 'OTIF sheet', KPI: 'KPI workbook' };

// The clock a person actually reads off a wall: half past seven, not 07:30:00.000Z.
const clockAt = when =>
  when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
const dayAt = when => `${when.getDate()} ${MONTHS[when.getMonth()].slice(0, 3)}`;

function sourceStrip() {
  const seen = state.metrics?.source_seen || {};
  // A mark and a time, because that is the question being asked: did it come in, and when.
  // "DOR — not seen" reads like a fault report for the ordinary case of a morning nobody
  // has pulled yet; a grey dot and "no pull yet" says the same thing without the alarm, and
  // a tick with a time answers it outright.
  const items = Object.keys(FROM_FILE).map(key => {
    const stamp = seen[key.toLowerCase()] || seen[key];
    const when = stamp ? new Date(stamp) : null;
    if (!when || Number.isNaN(+when)) return [key, '·', 'no pull yet', 'gap'];
    const days = daysBetween(when.toISOString().slice(0, 10), state.date);
    if (days <= 0) return [key, '✓', clockAt(when), 'ok'];
    if (days === 1) return [key, '✓', `yesterday ${clockAt(when)}`, ''];
    return [key, '!', `${dayAt(when)} · ${days} days ago`, 'warn'];
  });
  return `<div class="fsrc">${items.map(([key, mark, said, tone]) =>
    `<span class="fsrc__i${tone ? ` fsrc__i--${tone}` : ''}">
       <span class="fsrc__m" aria-hidden="true">${mark}</span
       ><b>${esc(SOURCE_NAMES[key] || key)}</b><i>${esc(said)}</i></span>`).join('')}</div>`;
}

// A row: what it is, the box, and what the box does to the morning. The third column is the
// point of the screen — you watch the rate move as you type the hours.
let toGo = 0;
function frow(label, name, attrs, { echo = '', source = '', chase = true, wide = false } = {}) {
  const file = source || sourceOf(String(name).split(':').pop());
  const blank = / value=""/.test(attrs) || !/ value="/.test(attrs);
  if (blank && chase && !file) toGo += 1;
  return `<label class="fr${wide ? ' fr--money' : ''}${file ? ' fr--file' : ''}${
    blank && chase && !file ? ' fr--todo' : ''}">
    <span class="fr__l">${esc(label)}</span>
    <input class="inp fr__i" data-field="${esc(name)}" ${attrs}>
    <span class="fr__x">${echo || (file ? `<em>${file}</em>` : '')}</span>
  </label>`;
}

const fgroupWide = (title, rows, note) =>
  fgroup(title, rows, note).replace('class="fg"', 'class="fg fg--wide fg--across"');

const fgroup = (title, rows, note) => {
  const before = toGo;
  const body = rows();
  const left = toGo - before;
  return `<section class="fg">
    <h3 class="fg__h">${esc(title)}${left ? `<span class="fg__n">${left} to go</span>` : ''}</h3>
    <div class="fg__rows">${body}</div>
    ${note ? `<p class="fg__note">${note}</p>` : ''}
  </section>`;
};

function fillSafety() {
  return fgroup('Safety', () => {
    const out = [];
    for (const [word, lastField, recordField] of [
      ['injury', 'injury_last', 'injury_record'],
      ['near-miss', 'near_miss_last', 'near_miss_record'],
    ]) {
      const last = metric(lastField), record = metric(recordField);
      const days = last ? daysBetween(last, state.date) : null;
      out.push(frow(`Last ${word}`, lastField, `type="date" value="${last || ''}"`,
        { echo: days == null ? '' : `<b>${days}</b> days` }));
      out.push(frow('Record', recordField, `type="number" min="0" value="${record ?? ''}"`,
        { echo: days != null && record && days >= record ? '<b class="tone--ok">Broken</b>' : '',
          chase: false }));
    }
    return out.join('');
  });
}

function fillQuality() {
  return fgroup('Quality', () => {
    const shortages = metric('shortages');
    const rows = [frow('Jobs short', 'shortages',
      `type="number" min="0" value="${shortages ?? ''}"`,
      { echo: shortages == null ? '' : Number(shortages) === 0
          ? '<b class="tone--ok">None</b>' : '<b class="tone--stop">Chase it</b>' })];
    for (const [label, name, step] of [
      ['COQ month', 'coq', '0.01'], ['COQ year', 'coq_ytd', '0.01'],
    ]) {
      const value = metric(name), target = Number(metric(`${name}_target`) || 0.85);
      rows.push(frow(label, name, `type="number" step="${step}" value="${value ?? ''}"`,
        { echo: value == null ? '' : `target ${target.toFixed(2)}%` }));
    }
    for (const [label, base] of [
      ['NCRs', 'ncr'], ['Internal', 'complaints_internal'],
      ['Customer', 'complaints_external'],
    ]) {
      const today = metric(`${base}_today`), mtd = metric(`${base}_mtd`);
      rows.push(frow(label, `${base}_today`, `type="number" min="0" value="${today ?? ''}"`,
        { echo: mtd == null ? '' : `<b>${num(mtd)}</b> this month` }));
    }
    return rows.join('');
  }, 'Counts are for the last twenty-four hours. Cost of quality and the counts come from '
   + 'the monthly KPI workbook.');
}

function fillProduction() {
  const list = configured();
  return fgroup('Production', () => list.map(config => {
    const row = dept(config.key), rate = rateOf(row);
    const target = Number(row.target ?? config.target);
    return `<div class="fr__pair">
      ${frow(config.name, `dept:${config.key}:qty`,
        `type="number" value="${row.qty ?? ''}" placeholder="${volumeLabel(config)}"`,
        { echo: rate ? `<b class="tone--${band.rate(rate, target) || 'none'}">${
            num(Math.round(rate))}</b> ${rateLabel(config)}` : '' })}
      ${frow('Hours', `dept:${config.key}:hours`,
        `type="number" step="0.1" value="${row.hours ?? ''}" placeholder="crewed"`,
        { echo: row.uptime ? `${Math.round(row.uptime * 100)}% uptime` : '' })}
    </div>`;
  }).join(''), 'Output, hours, uptime and make-ready all come from the DOR.');
}

function fillShipping() {
  return fgroup('Shipping', () => {
    const jobs = metric('jobs_shipped'), onTime = state.metrics?.jobs_on_time;
    const derived = derivedShipping(state.metrics);
    return [
      frow('Jobs shipped', 'jobs_shipped', `type="number" min="0" value="${
        state.metrics?.jobs_shipped ?? ''}"`,
        { echo: derived ? `<b>${derived.otd.toFixed(2)}%</b> OTD` : '' }),
      frow('On time', 'jobs_on_time', `type="number" min="0" value="${onTime ?? ''}"`),
      frow('Late', 'late', `type="number" min="0" value="${state.metrics?.late ?? ''}"`,
        { echo: derived ? `<b>${derived.otif.toFixed(2)}%</b> OTIF` : '' }),
      frow('Short', 'shorts', `type="number" min="0" value="${state.metrics?.shorts ?? ''}"`),
      frow('Cartons', 'cartons', `type="number" min="0" value="${state.metrics?.cartons ?? ''}"`,
        { echo: jobs && metric('cartons') ? `${num(Math.round(metric('cartons') / jobs))} per job` : '' }),
      frow('OTD month', 'mtd_otd',
        `type="number" step="0.01" value="${state.metrics?.mtd_otd ?? ''}"`),
      frow('OTD year', 'ytd_otd',
        `type="number" step="0.01" value="${state.metrics?.ytd_otd ?? ''}"`),
      frow('OTIF month', 'mtd_otif',
        `type="number" step="0.01" value="${state.metrics?.mtd_otif ?? ''}"`),
      frow('OTIF year', 'ytd_otif',
        `type="number" step="0.01" value="${state.metrics?.ytd_otif ?? ''}"`),
    ].join('');
  }, 'OTD and OTIF for today are worked out from jobs, late and short.');
}

function fillMoney() {
  return fgroup('Sales', () => [
    frow('Month to date', 'fin_actual_mtd',
      `type="number" step="0.01" value="${metric('fin_actual_mtd') ?? ''}"`,
      // The plan it is measured against is on the card; here it was "of $484K" and it was
      // the one echo on the screen that never fitted its column.
      { wide: true,
        echo: metric('fin_actual_mtd') ? `<b>${money(metric('fin_actual_mtd'))}</b>` : '' }),
    frow('Year to date', 'fin_actual_ytd',
      `type="number" step="0.01" value="${metric('fin_actual_ytd') ?? ''}"`,
      { wide: true,
        echo: metric('fin_actual_ytd') ? `<b>${money(metric('fin_actual_ytd'))}</b>` : '' }),
  ].join(''), 'Both come from the monthly KPI workbook.');
}

function fillOvertime() {
  const list = state.config.filter(c => c.active !== false);
  return fgroup('Overtime', () => list.map(c => {
    const chosen = new Set(labourRow(c.key)?.machines || []);
    const machines = machinesIn(c.key);
    return `<div class="fr fr--ot">
      <span class="fr__l">${esc(c.name)}</span>
      <input class="inp fr__i fr__i--n" data-field="labour:${esc(c.key)}:ot_shifts"
        type="number" step="0.5" min="0" placeholder="shifts"
        aria-label="${esc(c.name)} overtime shifts"
        value="${labourRow(c.key)?.ot_shifts ?? ''}">
      <span class="fr__x">${machines.length ? `<span class="ticks">${machines.map(m =>
        `<label class="tick2"><input type="checkbox" data-field="labour:${esc(c.key)}:machines"
          data-machine="${esc(m.code)}"${chosen.has(m.code) ? ' checked' : ''}>
          <span>${esc(m.name)}</span></label>`).join('')}</span>` : ''}</span>
    </div>`;
  }).join(''), 'Leave a department blank if it is not running overtime.');
}

// Maintenance is a group like every other group here. It was the section's own panel dropped
// at the foot of the page, which made it the one thing on the screen that looked like it came
// from somewhere else — and it is six columns wide, so it takes the full row rather than a
// third of one.
function fillMaintenance() {
  const items = upcomingItems();
  const depts = state.config.filter(c => c.active !== false);
  // Six boxes on a row with the headings above them, which reads perfectly and tells a
  // screen reader nothing: the heading is in a different element and there is no `for` to
  // tie them. Each box says what it is and which item it belongs to.
  const pick = (name, list, chosen, blank, said) =>
    `<select class="inp fr__i fr__i--s" data-field="${name}" aria-label="${esc(said)}">
      <option value="">${blank}</option>${list.map(o =>
        `<option value="${esc(o)}"${o === chosen ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  const rows = items.map((m, n) => {
    const machines = machinesIn(deptKeyOf(m.dept)).map(x => x.name);
    const its = what => `${what}, item ${n + 1}`;
    return `<div class="fr fr--maint" data-pkey="maint-${esc(m.id)}">
      ${pick(`maint:${esc(m.id)}:dept`, depts.map(d => d.name), m.dept, 'Department', its('Department'))}
      ${pick(`maint:${esc(m.id)}:machine`, machines, m.machine, 'Machine', its('Machine'))}
      <input class="inp fr__i fr__i--h" type="number" step="0.5" min="0" placeholder="hrs"
        aria-label="${esc(its('Hours'))}"
        data-field="maint:${esc(m.id)}:hours" value="${m.hours ?? ''}">
      <input class="inp fr__i" type="text" placeholder="what for"
        aria-label="${esc(its('What for'))}"
        data-field="maint:${esc(m.id)}:note" value="${esc(m.note || m.item_type || '')}">
      <input class="inp fr__i fr__i--d" type="date" aria-label="${esc(its('When'))}"
        data-field="maint:${esc(m.id)}:scheduled_on" value="${m.scheduled_on || ''}">
      ${pick(`maint:${esc(m.id)}:status`, MAINT_STATUS, m.status, m.status, its('Status'))}
      <button class="lnk" data-drop-maint="${esc(m.id)}"
        aria-label="${esc(`Remove item ${n + 1}`)}">×</button>
    </div>`;
  });
  return `<section class="fg fg--wide">
    <h3 class="fg__h">Upcoming maintenance
      <button class="btn btn--ghost fg__add" id="maint-add">Add an item</button></h3>
    <div class="fg__rows">
      <div class="fr fr--maint fr--head"><span>Department</span><span>Machine</span>
        <span>Hours</span><span>What for</span><span>When</span><span>Status</span><span></span></div>
      ${rows.join('') || '<p class="fg__note">Nothing booked in.</p>'}
    </div>
  </section>`;
}

function fillNotes() {
  const list = configured();
  return fgroup('The last 24 hours', () => {
    const rows = list.map(config => {
      const row = state.review.find(r => r.dept_key === config.key) || {};
      return `<div class="fr fr--note">
        <span class="fr__l">${esc(config.name)}</span>
        <select class="inp fr__i fr__i--s" aria-label="${esc(config.name)} status"
          data-field="review:${esc(config.key)}:status">${reviewOptions(row.status)}</select>
        <textarea class="inp fr__t" rows="1" placeholder="what happened \u2014 one per line"
          aria-label="${esc(config.name)} \u2014 what happened"
          data-field="review:${esc(config.key)}:note">${esc(row.note || '')}</textarea>
      </div>`;
    });
    rows.push(`<div class="fr fr--note fr--wide">
      <span class="fr__l">Staffing</span>
      <textarea class="inp fr__t" rows="1" placeholder="call-ins, vacation, training"
        aria-label="Staffing notes"
        data-field="staffing_note">${esc(metric('staffing_note') || '')}</textarea></div>`);
    rows.push(`<div class="fr fr--note fr--wide">
      <span class="fr__l">Maintenance</span>
      <textarea class="inp fr__t" rows="1" placeholder="anything the room should know"
        aria-label="Maintenance notes"
        data-field="maintenance_note">${esc(metric('maintenance_note') || '')}</textarea></div>`);
    return rows.join('');
  }, 'Each line becomes a bullet on the card.');
}

const SECTIONS = {
  // The entry screen. See the block above it for why this is its own surface.
  fill: () => {
    toGo = 0;
    // What is outstanding is the assessment's answer, not this screen's. Counting blank
    // boxes made a morning look incomplete because somebody had not retyped a figure the
    // DOR had already supplied, and complete because every box had something in it even
    // when four departments had never confirmed their last twenty-four hours.
    const gaps = absent(state.findings);
    // Three columns of numbers, then the two things that are sentences and take the width.
    // Assigned rather than flowed: masonry put Sales under Shipping one morning and under
    // Safety the next, so nobody could learn where anything was.
    const groups = `<div class="fill__col">${fillSafety()}${fillQuality()}</div>
      <div class="fill__col">${fillProduction()}${fillMoney()}</div>
      <div class="fill__col">${fillShipping()}${fillOvertime()}</div>
      <div class="fill__col">${fillNotes()}</div>
      ${fillMaintenance()}`;
    const published = state.metrics?.status === 'published';
    // Two shapes, because two states. Outstanding readings get the big count and the list
    // of them; a morning with nothing outstanding does not need a banner the height of a
    // card to say so \u2014 it needs one line, with the sentence that explains why the rest of
    // the screen is already filled in sitting on the same line as the tick.
    return `<div class="fill">
      <div class="fill__top${gaps.length ? '' : ' fill__top--done'}">
        <div class="fill__count">
          <b class="${gaps.length ? 'tone--warn' : 'tone--ok'}">${gaps.length || '\u2713'}</b>
          <span>${gaps.length ? 'still to fill in' : 'nothing left to fill in'}</span>
        </div>
        ${gaps.length
          ? `<div class="fill__gaps">${gaps.slice(0, 8).map(r =>
              `<button class="gap gap--sm" data-goto="${esc(r.field || '')}">${
                esc(r.title)}</button>`).join('')}${
              gaps.length > 8 ? `<span class="fill__more">and ${gaps.length - 8} more</span>` : ''}</div>`
          : `<p class="fill__say">Everything else arrives from the DOR, the OTIF sheet and the
              monthly KPI workbook, and is shown here so it can be corrected \u2014 not so it
              has to be typed.</p>`}
        ${sourceStrip()}
        <details class="resets">
          <summary>What starts blank each morning</summary>
          <div class="resets__b">
            ${state.canEdit ? `<p class="resets__do"><button class="btn btn--quiet btn--sm"
              id="reset-day">Start
              this morning again</button> Puts this date back to the state it opens in: everything
              below that is blank every morning goes blank, everything carried comes back.
              Nothing that happened on another date is touched.</p>` : ''}
            <p><b>Blank every morning.</b> The last twenty-four hours \u2014 both the status and
              the note \u2014 jobs short, today's NCRs and complaints, the whole of shipping,
              sales, and overtime. A count of what happened yesterday carried into today is a
              stale incident reported as a fresh one, which is worse than reporting none.</p>
            <p><b>Carried.</b> Days since the last injury and near-miss and both records; the
              cost-of-quality targets; the month-to-date counts, but only within a month; the
              year-to-date counts, but only within a year. On the first of the month the
              month-to-date figures start again rather than standing in for the last one.</p>
            <p><b>Pulled from the DOR.</b> Every production figure, by <b>Pull data</b>, and
              correctable afterwards \u2014 typing over an imported number always wins.</p>
            <p><b>Kept until closed.</b> Maintenance, because a booking belongs to a date
              rather than to a morning. One whose date has gone by turns Overdue by itself; it
              is never marked complete on the plant's behalf.</p>
          </div>
        </details>
      </div>
      <div class="fill__grid">${groups}</div>
      <div class="fill__end">
        <p>${gaps.length ? `<b>${gaps.length}</b> still to fill in. A morning can be published
              incomplete, but somebody has to say why \u2014 every screen will carry the note.`
          : published ? 'Published. Every screen is showing this morning.'
          : 'Nothing left to fill in.'}</p>
        <div class="fill__go">
          <button class="btn" data-nav="overview">See the cards</button>
          ${state.canEdit ? `<button class="btn ${gaps.length ? '' : 'btn--go'}" id="fill-publish">${
            gaps.length ? `Publish anyway \u2014 ${gaps.length} missing`
              : published ? 'Publish again' : 'Publish this morning'}</button>` : ''}
        </div>
      </div>
    </div>`;
  },

  // ── The morning summary ──
  //
  // The first thing on the screen is how complete the morning is, because until this release
  // the screen could say "Everything is on target · All 9 readings within target" on a
  // morning where eleven readings had not been entered. Four counts, side by side: what is
  // critical, what is warning, what nobody has entered, and what is genuinely fine. Missing
  // sits beside the other three rather than under them, because on most mornings before
  // seven o'clock it is the largest of the four and the only one anybody can act on.
  //
  // "Everything is on target" is now a sentence with a precondition. It may be printed only
  // when the missing count is nought.
  line: () => {
    const flags = attention(state.findings);
    const fine = settled(state.findings);
    const gaps = absent(state.findings);
    const worst = flags.some(f => f.tone === 'stop') ? 'stop'
      : gaps.length ? 'warn' : flags.length ? 'warn' : 'ok';
    const headline = !state.findings.length
      ? ['Nothing entered yet', 'Open Enter and fill in this morning.']
      : gaps.length
        ? [`${gaps.length} reading${gaps.length === 1 ? ' is' : 's are'} missing`,
           flags.length
             ? `${flags.length} thing${flags.length === 1 ? '' : 's'} here need${
                 flags.length === 1 ? 's' : ''} the room. This morning is not complete.`
             : 'Everything entered so far is on target. This morning is not complete.']
        : flags.length
          ? [`${flags.length} thing${flags.length > 1 ? 's need' : ' needs'} the room today`,
             `${fine.length} other reading${fine.length === 1 ? ' is' : 's are'} on target.`]
          : ['Everything is on target',
             `All ${fine.length} readings entered, current and within target.`];

    const tally = (n, label, tone) => `<div class="tally tally--${tone}${n ? '' : ' tally--none'}">
      <b>${n}</b><span>${esc(label)}</span></div>`;

    // The manager's own words, which are the only part of the morning a number cannot
    // carry. They were on four cards two sections away; on the screen the meeting opens
    // with, they are the agenda.
    const points = state.review
      .filter(row => row.note && String(row.note).trim())
      .flatMap(row => {
        const config = state.config.find(c => c.key === row.dept_key);
        return String(row.note).split(/\r?\n/).map(line => line.trim()).filter(Boolean)
          .map(line => [config?.name || row.dept_key, line, row.status]);
      });
    for (const [field, who] of [['maintenance_note', 'Maintenance'], ['staffing_note', 'Staffing']]) {
      const text = metric(field);
      if (text && String(text).trim()) {
        for (const line of String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean)) {
          points.push([who, line, '']);
        }
      }
    }

    return `<div class="today today--${worst}">
      <div class="today__t"><h2>${esc(headline[0])}</h2><p>${esc(headline[1])}</p></div>
      <div class="tallies">
        ${tally(flags.filter(f => f.tone === 'stop').length, 'critical', 'stop')}
        ${tally(flags.filter(f => f.tone === 'warn').length, 'warning', 'warn')}
        ${tally(gaps.length, 'missing', 'gap')}
        ${tally(fine.length, 'on target', 'ok')}
      </div>
    </div>

    ${flags.length ? `<div class="grid g3 flags">${flags.map(r => {
      const { line, bar } = readingBody(r);
      return `<div class="flagcard flagcard--${r.tone}" data-pkey="${esc(r.key)}">
        <div class="flagcard__top">
          <span class="flagcard__who">${esc(r.area)}${r.owner ? ` · ${esc(r.owner)}` : ''}</span>
          ${r.target && r.targetLabel ? chip(r.tone, r.targetLabel) : ''}
        </div>
        <div class="flagcard__n">${esc(r.value)}<small> ${esc(r.unit || '')}</small></div>
        ${bar}${line}
        ${r.note ? `<p class="flagcard__say">${esc(r.note)}</p>` : ''}
        ${r.also?.length ? `<div class="flagcard__also">${r.also.map(o =>
          `<div class="flagcard__row"><span>${esc(o.title)}</span>
           <b class="tone--${o.tone}">${esc(o.value)}${o.unit === '%' ? '%' : ''}</b></div>`).join('')}</div>` : ''}
        ${r.shortfall ? `<div class="flagcard__meta">
          <div><div class="a-meta__l">Shortfall</div><div class="a-meta__v">${num(r.shortfall)} ${esc(r.unitWord || '')}</div></div>
        </div>` : ''}
      </div>`;
    }).join('')}</div>` : ''}

    ${gaps.length ? `<div class="settled">
      <div class="sec__head"><span class="eyebrow">Not entered yet</span><div class="sec__rule"></div></div>
      <div class="gaps">${gaps.map(r =>
        `<button class="gap" data-goto="${esc(r.field || '')}">
           <span class="gap__t">${esc(r.title)}</span>
           <span class="gap__a">${esc(r.area)}</span></button>`).join('')}</div>
    </div>` : ''}

    ${points.length ? `<div class="settled">
      <div class="sec__head"><span class="eyebrow">Talking points \u00b7 last 24 hours</span>
        <div class="sec__rule"></div></div>
      <ul class="points">${points.slice(0, 10).map(([who, line, tone]) =>
        `<li class="points__i${tone && tone !== 'ok' ? ` points__i--${tone}` : ''}">
           <b>${esc(who)}</b><span>${esc(line)}</span></li>`).join('')}</ul>
    </div>` : ''}

    ${fine.length ? `<div class="settled">
      <div class="sec__head"><span class="eyebrow">On target</span><div class="sec__rule"></div></div>
      <div class="settled__chips">${fine.map(r =>
        `<span class="tick"><span class="tick__n">${esc(r.value)}</span>
         <span class="tick__l">${esc(r.title.toLowerCase())}</span></span>`).join('')}</div>
    </div>` : ''}`;
  },

  safety: () => `<div class="grid grid--cards" data-grid="safety">
      ${streakCard('injury', 'Days since last injury', 'injury_last', 'injury_record', 'injury')}
      ${streakCard('nearmiss', 'Days since near-miss', 'near_miss_last', 'near_miss_record', 'near-miss')}
    </div>`,

  // Six readings, which is what fills a screen at three across and two down. The three
  // added here are the ones a quality manager is asked for and the dashboard never held:
  // NCRs for the year, and complaints split by who raised them — internal is the floor
  // catching its own work, external has already reached a customer, and one number over
  // both hides the only distinction that matters.
  quality: () => {
    const shortages = metric('shortages');
    const shortTone = shortages == null ? '' : band.shortage(Number(shortages));
    // Which cards a plant carries is one list in Configure now, checked by metricCard
    // itself, rather than three columns that only ever covered these three readings.
    // `name`, not `field` — the parameter was called `field` and shadowed the helper of
    // the same name two scopes up, so every quality card threw on its edit row.
    // Today, with the month and the year underneath it.
    //
    // These three were year-to-date counts and nothing else, which answers "how are we
    // doing" and not the question a morning meeting asks — what happened since yesterday.
    // A count of 94 does not change between Tuesday and Wednesday, so the card said the
    // same thing every morning and the room stopped looking at it. The reading is the last
    // twenty-four hours now; the month and the year are the context under the rule, the
    // same shape Safety uses for its record and its last incident.
    //
    // Nought is a reading, not a blank. A morning with no NCR raised is exactly the morning
    // worth printing a zero on.
    const counter = (key, label, base) => {
      const today = metric(`${base}_today`), mtd = metric(`${base}_mtd`), ytd = metric(base === 'ncr' ? 'ncr_ytd' : base);
      const has = today != null && today !== '';
      return metricCard({
        chart: 'number', pkey: key, label,
        tone: has ? band.count(Number(today)) : '',
        value: has ? num(today) : '—',
        // A blank says which kind of blank it is. "In the last 24 hours" over a dash reads
        // as a number that failed to arrive; the log simply has not been written that far
        // yet, and saying so is the difference between a fault and a Tuesday.
        sub: has ? 'in the last 24 hours' : 'not logged this far yet',
        // A year of months, not seven mornings.
        //
        // These are closed off monthly, and a week of them is four zeroes and a one drawn as
        // a spike — a picture of nothing, on a card that then had nothing along its bottom
        // while every card beside it carried a bar and a line. Twelve columns answer the
        // question actually asked of these three, which is whether this is a bad month or a
        // bad year, and give the card the same footprint as the rest of the screen.
        track: cardTrack({ chart: 'number', actual: 0, target: 0,
          tone: has ? band.count(Number(today)) : '', lowerIsBetter: true,
          months: monthSeries(`${base}_mtd`),
          monthsThrough: dateOf(state.date).getMonth(),
          monthsLabel: `${dateOf(state.date).getFullYear()} by month` }),
        heroEdit: { field: `${base}_today`, attrs: `type="number" min="0" value="${today ?? ''}"` },
        foot: footLine([
          ['Month to date', mtd == null ? null : num(mtd),
            { field: `${base}_mtd`, attrs: `type="number" min="0" value="${mtd ?? ''}"` }],
          ['Year to date', ytd == null ? null : num(ytd),
            { field: base === 'ncr' ? 'ncr_ytd' : base,
              attrs: `type="number" min="0" value="${ytd ?? ''}"` }],
        ]),
      });
    };
    return `<div class="grid grid--cards" data-grid="quality">
      ${metricCard({
        chart: 'number', pkey: 'shortages', label: 'Shortage count', tone: shortTone,
        value: shortages ?? '\u2014', sub: 'jobs short today',
        // A count has no denominator, so there is no bar to draw — but this one is counted
        // fresh every morning, and a week of it says whether two is a bad Tuesday or the
        // fourth bad Tuesday running. That is the question a bare number leaves open.
        track: cardTrack({ chart: 'number', actual: 0, target: 0, tone: shortTone,
          lowerIsBetter: true, series: metricSeries('shortages') }),
        heroEdit: { field: 'shortages', attrs: `type="number" min="0" value="${shortages ?? ''}"` },
        foot: footLine([['Target', '0']]),
      })}
      ${coqCard('coq', 'COQ \u2014 month to date', 'coq', 'coq_target')}
      ${coqCard('coqytd', 'COQ \u2014 year to date', 'coq_ytd', 'coq_ytd_target')}
      ${counter('ncr', 'NCRs received', 'ncr')}
      ${counter('cint', 'Internal complaints', 'complaints_internal')}
      ${counter('cext', 'Customer complaints', 'complaints_external')}
    </div>`;
  },

  production: () => {
    const list = configured();
    if (!list.length) return `<div class="panel"><div class="panel__body">
      No departments are configured for this plant yet.</div></div>`;

    const cards = list.map(config => {
      const row = dept(config.key), rate = rateOf(row);
      const target = Number(row.target ?? config.target);
      const tone = band.rate(rate, target);
      return metricCard({
        chart: 'number', pkey: config.key, label: config.name, medium: true,
        // A drawn mark where there is one for this department, and the plant's own choice
        // only where there is not — a printing card should look like the rest of the set
        // rather than like whichever emoji somebody picked in Configure.
        icon: iconFor(config.key, config.icon), tone,
        value: rate ? num(Math.round(rate)) : '—', sub: rateLabel(config),
        percent: target ? rate / (target * 1.25) * 100 : 0,
        markPercent: 100 / 1.25, markLabel: 'target',
        // The bar and the line answer the two questions the foot does not: how this rate
        // sits against its target as a shape, and which way the week has gone.
        track: cardTrack({
          chart: 'number', actual: rate, target, tone,
          targetText: `Against ${num(Math.round(target))} ${rateLabel(config)}`,
          // The same chip the money and the shipping percentages carry. It printed a bare
          // "\u221250" before, which is fifty of something the label above it names and the
          // reader has to go and find \u2014 and fifty off three thousand and fifty off two
          // thousand are not the same miss.
          deltaHtml: rate && target ? varianceChip(rate, target) : '',
          series: deptSeries(config.key), seriesTrend: false,
        }),
        // Target, what was made, and the hours it took — the three things asked after the
        // rate itself, on one line. "vs target" is not among them any more: the bar above
        // is that number drawn, and printing it twice on the same card was half the reason
        // the card felt crowded.
        // Three facts, one row: what the target was, what was made against it, and the
        // hours it took. They were two rows, which spent a whole line on the hours.
        // Three facts, three fields, and they are the same three squares of the card.
        //
        // Uptime and make-ready are gone from here. They were two more inputs on a card that
        // prints neither, entered by hand for a figure the DOR has always carried — and the
        // DOR's own Formulas tab settled how to read them, so they arrive with the morning
        // now. Two fewer rows on every department card is most of why Production used to be
        // a page and a half in edit mode.
        foot: footLine([
          ['Target', num(Math.round(target)),
            { field: `dept:${config.key}:target`,
              attrs: `type="number" value="${row.target ?? config.target}"` }],
          [volumeLabel(config), row.qty ? num(row.qty) : null,
            { field: `dept:${config.key}:qty`, attrs: `type="number" value="${row.qty ?? ''}"` }],
          [hoursLabel(config), row.hours ? `${row.hours} h` : null,
            { field: `dept:${config.key}:hours`,
              attrs: `type="number" step="0.1" value="${row.hours ?? ''}"` }],
        ]),
      });
    }).join('');

    // Last week's productivity, on a card in the row with the departments.
    //
    // It was a nine-column table across the full width under the cards, which is how it
    // arrived from the old dashboard and it never belonged there: on a Production screen of
    // three cards it took more height than all three together, and the room's word for it
    // was the right one — it goes in front of Printing, Die Cutting and Gluing, not
    // underneath them. Four of the nine columns were already on the cards above it and two
    // more were targets that never change.
    //
    // What is left is the thing the cards cannot say, which is one line per department: what
    // the same weekday produced, and how that sat against the target. That is a list, and a
    // list is a card. Volume and hours are still typed where they are read, in the card's
    // own edit zone, for the mornings the DOR has not been imported.
    const weekCard = () => listCard({
      pkey: 'pw-week', icon: iconFor('week'), label: "Last week's productivity",
      // `band.worst([])` is 'ok', which would put a green border on a card that has nothing
      // in it — a verdict on a week nobody has logged.
      tone: (tones => tones.length ? band.worst(tones) : '')(list.map(config => {
        const row = dept(config.key);
        const rate = Number(row.pw_hours) ? Number(row.pw_qty) / Number(row.pw_hours) : 0;
        return rate ? band.rate(rate, Number(row.target ?? config.target)) : '';
      }).filter(Boolean)),
      empty: 'Nothing logged for the same weekday last week.',
      rows: list.map(config => {
        const row = dept(config.key);
        const rate = Number(row.pw_hours) ? Number(row.pw_qty) / Number(row.pw_hours) : 0;
        const target = Number(row.target ?? config.target);
        return [config.name,
          rate ? `${num(Math.round(rate))} ${rate && target ? trend(rate, target) : ''}` : '\u2014',
          rate ? band.rate(rate, target) : '',
          rate ? `against ${num(Math.round(target))} ${rateLabel(config)}` : 'not logged'];
      }).filter(row => row),
      edit: list.map(config => {
        const row = dept(config.key);
        return `<div class="er er--pair"><label>${esc(config.name)}</label>
          <input class="inp" type="number" data-field="dept:${config.key}:pw_qty"
            aria-label="${esc(config.name)} \u2014 last week's ${esc(volumeLabel(config))}"
            placeholder="${esc(volumeLabel(config))}" value="${row.pw_qty ?? ''}">
          <input class="inp" type="number" step="0.1" data-field="dept:${config.key}:pw_hours"
            aria-label="${esc(config.name)} \u2014 last week's hours"
            placeholder="hours" value="${row.pw_hours ?? ''}"></div>`;
      }).join(''),
    });

    // The review notes are cards now, drawn by the same function every other note on the
    // product is drawn by. They were a fourth card shape — their own head, their own dot,
    // their own border colour — sitting in a `grid--cards` beside real cards, which is most
    // of what made this screen look, in the room's word, unorganised. One shape, one bar,
    // one line for the title, and the status is the border and the flag exactly as it is
    // everywhere else.
    const review = state.review.map(row => {
      const config = state.config.find(c => c.key === row.dept_key);
      // Three states, not two. A department that answered "no issue" has said something and
      // the card says it back; a department nobody has asked yet has said nothing, and the
      // card has to say *that* rather than putting words in its mouth.
      const answered = !!row.status;
      return noteCard({
        pkey: `rev-${row.dept_key}`, label: config?.name || row.dept_key,
        icon: iconFor(row.dept_key, config?.icon),
        tone: !answered ? 'gap' : row.status === 'ok' ? '' : row.status,
        html: row.note ? bullets(row.note) : '',
        blank: answered && !row.note,
        prompt: answered ? 'No issues reported.' : 'Not confirmed yet.',
        edit: `<div class="er"><label>Status</label>
            <select class="inp" data-field="review:${esc(row.dept_key)}:status"
              aria-label="Status">${reviewOptions(row.status)}</select></div>
          <div class="er"><label>Note</label>
            <textarea class="inp" aria-label="What happened"
              data-field="review:${esc(row.dept_key)}:note">${esc(row.note)}</textarea></div>`,
      });
    }).join('');

    // One grid, and the departments and the week they just had are in it together. A plant
    // that adds a fourth and a fifth department wraps onto a second row and the week card
    // wraps with them, which is what the full-width table could never do.
    return `<div class="grid grid--cards" data-grid="production">${weekCard()}${cards}</div>
    ${review ? `<div class="sec__head" style="margin-top:var(--s3)">
      <h3 class="sec__title" style="font-size:var(--t-lead)">Review \u2014 last 24 hours</h3>
      <div class="sec__rule"></div></div>
    <div class="grid grid--cards" data-grid="review">${review}</div>` : ''}`;
  },

  shipping: () => {
    const read = name => metric(name);
    // Eight cards in two rows of four, drawn by the same function every other section uses.
    // This was a joined strip with the cells sharing borders and two of them washed violet,
    // which made shipping look like a different product bolted to the page. Nothing about
    // these readings is special enough to earn its own component.
    const ship = (name, label, { value, unit = '', sub = '', tone = '', target = 0,
                                       floor = 0, ceiling = 0, series = null, medium = false,
                                       lowerIsBetter = false, deltaHtml = null, foot = [],
                                       heroEdit = null }) => metricCard({
      chart: 'number', pkey: name, label, tone, medium, heroEdit,
      value, unit, sub,
      percent: target ? Number(value || 0) / target * 100 : 0,
      markPercent: target ? 100 : null, markLabel: 'target',
      track: series ? cardTrack({
        chart: 'number',
        actual: Number(value || 0), target, tone, floor, ceiling, lowerIsBetter,
        targetText: target ? `Against ${target}%` : '', deltaHtml, series,
      }) : '',
      foot: footLine(foot),
    });

    // The four percentages, and the one sentence they all say: how far off target, as a
    // share of it, in the same chip the money uses. It used to read "\u22120.13 pts", which
    // is a unit the room does not think in \u2014 asked what it meant, nobody was sure
    // whether it was a percentage of the target or a percentage of a percentage.
    // The target comes off the morning, not out of this file — see `otifTarget`. A morning
    // published in January against 98 keeps being judged against 98 when the plant moves to
    // 97 in the spring.
    const goals = { otif: otifTarget(state.metrics), otd: otdTarget(state.metrics) };
    const pct = (name, label, sub) => {
      const goal = /otd/.test(name) ? goals.otd : goals.otif;
      const value = read(name);
      // Nought jobs shipped has no on-time percentage — there is no denominator. It is not
      // nought per cent, and printing a dash would say "nobody entered it", which is a
      // different morning and a different job for somebody.
      if (isNa(value)) {
        return ship(name, label, {
          value: 'N/A', unit: '', sub: 'no jobs shipped', tone: '',
          foot: [['Target', `\u2265 ${goal}%`]],
        });
      }
      const tone = value == null ? '' : band.pct(Number(value), goal);
      const variance = value == null ? null : varianceChip(Number(value), goal, { digits: 2 });
      // OTD and OTIF follow from jobs, late and short, so they have no field. The two
      // roll-ups do, because nothing on this morning can work them out.
      const typed = ['mtd_otif', 'ytd_otif', 'mtd_otd', 'ytd_otd'].includes(name);
      return ship(name, label, {
        heroEdit: typed
          ? { field: name, attrs: `type="number" step="0.01" value="${state.metrics?.[name] ?? ''}"` }
          : null,
        value: value == null ? '\u2014' : Number(value).toFixed(2), unit: value == null ? '' : '%',
        sub, tone, target: goal, floor: 90, ceiling: 100, series: metricSeries(name),
        foot: [['Target', `\u2265 ${goal}%`], ['Variance', variance]],
      });
    };
    const count = (name, label, sub) => {
      const value = read(name);
      const tone = value == null ? '' : band.count(Number(value));
      return ship(name, label, {
        value: value ?? '\u2014', sub, tone,
        heroEdit: { field: name, attrs: `type="number" min="0" value="${value ?? ''}"` },
        // No bar — a bar against a target of zero is a bar that is always full — but the
        // week behind it is the difference between one late truck and a pattern.
        series: metricSeries(name), lowerIsBetter: true,
        foot: [['Target', '0']],
      });
    };

    return `<div class="grid grid--cards" data-grid="shipping">
      ${/* No `medium` on these two. It was here because four and five figures at full size
            ran the width of the card — which the length cap already prevents — and all it
            achieved was four shipping cards drawn at one size and four at another. The room
            asked for the eight to match, and they match by all being the same card. */''}
      ${ship('jobs_shipped', 'Jobs shipped', {
        series: metricSeries('jobs_shipped'),
        value: read('jobs_shipped') == null ? '\u2014' : num(read('jobs_shipped')), sub: 'today',
        heroEdit: { field: 'jobs_shipped',
                    attrs: `type="number" min="0" value="${state.metrics?.jobs_shipped ?? ''}"` },
        foot: [['On time', read('jobs_on_time') ?? null,
                 { field: 'jobs_on_time',
                   attrs: `type="number" min="0" value="${state.metrics?.jobs_on_time ?? ''}"` }],
               ['Of', read('jobs_shipped') ?? null]] })}
      ${ship('cartons', 'Cartons', {
        series: metricSeries('cartons'),
        value: read('cartons') == null ? '\u2014' : num(read('cartons')), sub: 'shipped today',
        heroEdit: { field: 'cartons',
                    attrs: `type="number" min="0" value="${state.metrics?.cartons ?? ''}"` },
        foot: [['Per job', read('cartons') && read('jobs_shipped')
          ? num(Math.round(read('cartons') / read('jobs_shipped'))) : null]] })}
      ${count('late', 'Late', 'shipments')}
      ${count('shorts', 'Shorts', 'shipments')}
      ${pct('otd', 'OTD', 'on-time delivery')}
      ${pct('otif', 'OTIF', 'on time, in full')}
      ${pct('mtd_otd', 'MTD OTD', 'month to date')}
      ${pct('ytd_otd', 'YTD OTD', 'year to date')}
      ${pct('mtd_otif', 'MTD OTIF', 'month to date')}
      ${pct('ytd_otif', 'YTD OTIF', 'year to date')}
    </div>
    <p class="note-derived edit-only">OTD and OTIF are worked out from jobs, late and short.</p>`;
  },

  // ── Maintenance ──
  //
  // What is coming, not what happened to today's list. The three cards this led with —
  // overdue items, open work, today's schedule — answer a question the morning meeting does
  // not ask, so they are off unless a plant turns them on in Configure. What is left is one
  // list: which department, which machine, how many hours, and what for.
  maintenance: () => cardGrid('maintenance', maintenanceCards()),

  // ── Labour & overtime ──
  //
  // Which departments are running overtime, how many shifts, and on which machines — and,
  // for most plants, maintenance on the same screen. Four overtime cards and two
  // maintenance ones is a screen; each on its own is half of one. A plant that wants them
  // apart says so once, in Configure.
  // Maintenance leads. It is the part of this screen the room acts on — somebody has to be
  // told a machine is down on Friday — and overtime is the part it reports.
  // No tables. "Which departments" and the maintenance list were both entry forms living on
  // a reading screen, and both are groups on Enter now — the same fields, in the place a
  // person goes to fill them in. What is left is what the room reads.
  // One grid, not two. Merged, Maintenance and Labour used to render a grid each, so
  // Upcoming Maintenance sat alone on a row of four with three empty cells beside it and the
  // labour cards started a new row underneath — which is the staircase the room kept
  // calling Tetris, in the one place it survived.
  labour: () => cardGrid('labour', (mergedUpkeep() ? maintenanceCards() : '') + labourCards()),

  financials: () => {
    // Billing is reviewed the next morning, so the financial picture reports through the
    // day before the dashboard date. A dashboard dated July 1 reports through June 30.
    const reportDate = dateOf(state.date);
    reportDate.setDate(reportDate.getDate() - 1);
    const month = reportDate.getMonth();
    const inMonth = new Date(reportDate.getFullYear(), month + 1, 0).getDate();
    const elapsed = Math.max(1, reportDate.getDate());

    const monthBudget = budgetFor(month);
    const yearBudget = Array.from({ length: 12 }, (_, i) => budgetFor(i)).reduce((a, b) => a + b, 0);
    const actualMtd = Number(metric('fin_actual_mtd') || 0);
    const actualYtd = Number(metric('fin_actual_ytd') || 0);
    const planMtd = monthBudget * (elapsed / inMonth);
    const varianceMtd = actualMtd - planMtd;
    const percentMtd = planMtd ? varianceMtd / planMtd * 100 : 0;
    const planYtd = Array.from({ length: month }, (_, i) => budgetFor(i)).reduce((a, b) => a + b, 0) + planMtd;
    const varianceYtd = actualYtd - planYtd;
    const percentYtd = planYtd ? varianceYtd / planYtd * 100 : 0;
    const toneMtd = band.money(percentMtd), toneYtd = band.money(percentYtd);

    // Two cards, the same card as everywhere else.
    //
    // Money used to be one wide panel holding two panes — the only thing on the whole
    // product that was not a card. On the page it was three times the width of its
    // neighbours; on the wall it was the width of the screen, sitting between a Shipping
    // screen of eight cards and a Maintenance screen of two. A reader walking the five
    // screens saw the design change under them at slide four. Month to date and year to
    // date are two readings against two targets, which is exactly what a card is for.
    //
    // "Budget", not "plan". The plant writes a budget; prorating it by elapsed days does
    // not make it a different thing, and two words for one number is one word too many.
    const pane = (key, title, actual, budget, tone, variance, percent, budgetRow, whenRow,
                  seriesField) => {
      const pace = budget ? Math.round(actual / budget * 100) : 0;
      return metricCard({
        chart: 'number', pkey: key, label: title, tone, medium: true,
        // The figure is the reading and the pace is what it means — the two things the
        // room asks for, on the two lines a card already has for them.
        // Medium, like the other five-figure readings on the product. "$21.11M" at the size
        // that suits "98" is the widest thing on any card, and the width it took came out of
        // the graph underneath.
        value: money(actual), sub: `${pace}% of budget`,
        heroEdit: { field: key === 'fin-mtd' ? 'fin_actual_mtd' : 'fin_actual_ytd',
                    attrs: `type="number" step="0.01" value="${
                      metric(key === 'fin-mtd' ? 'fin_actual_mtd' : 'fin_actual_ytd') ?? ''}"` },
        // The chart choice reaches the money too. A page where five readings are rings and
        // the sales figure is bare reads as two designs rather than one.
        // `chart:'number'`, not the reader's choice: the reading itself is the money, so
        // the card's body is a hero rather than a drawing, and cardTrack only draws its
        // bullet when the body did not already draw one. Passing 'bar' here got neither.
        track: cardTrack({
          chart: 'number', actual, target: budget, tone,
          targetText: `Against ${money(budget)} expected`,
          deltaText: `${variance >= 0 ? '+' : '−'}${money(Math.abs(variance))}`,
          // The month's own shape. Sales against budget is a race the plant runs once a
          // month, and the line says whether it is being won steadily or was won on one
          // good Thursday — which is the difference between a forecast and a relief.
          deltaTone: tone, series: metricSeries(seriesField),
        }),
        foot: footLine([
          budgetRow,
          whenRow,
          ['Variance', chip(varianceTone(percent), variancePct(percent))],
        ]),
      });
    };

    return `<div class="grid grid--cards" data-grid="financials">
      ${pane('fin-mtd', 'Month to date', actualMtd, planMtd, toneMtd,
        varianceMtd, percentMtd, [`${MONTHS[month]} budget`, money(monthBudget)],
        // How far into the month the plant is, which is the whole reason the budget is
        // prorated — and one fact on a foot rather than a full-width panel with a
        // progress bar the width of the screen saying "day 9 of 31".
        ['Elapsed', `day ${elapsed} of ${inMonth}`], 'fin_actual_mtd')}
      ${pane('fin-ytd', 'Year to date', actualYtd, planYtd, toneYtd,
        varianceYtd, percentYtd, ['Year budget', money(yearBudget)],
        ['Through', shortDate(reportDate.toISOString().slice(0, 10))], 'fin_actual_ytd')}
    </div>`;
  },
};

// ── Drawing the page ────────────────────────────────────────────────────────────

function renderNav() {
  const link = (key, label, icon, dot) => `<button class="rail__link" data-nav="${key}"
    aria-current="${state.active === key}" title="${esc(label)}">
    <svg class="rail__ico" viewBox="0 0 24 24"><path d="${icon}"/></svg>
    <span class="rail__txt">${esc(label)}</span>
    <span class="rail__dot rail__dot--${dot}"></span></button>`;
  const worstOfAll = band.worst(attention(state.findings).map(f => f.tone));
  $('#nav').innerHTML =
    VIEWS.map(key => link(key, NAV[key], ICONS[key],
      key === 'line' ? (attention(state.findings).length ? worstOfAll : 'ok') : 'none')).join('')
    + `<div class="rail__split"></div>`
    + link('overview', 'Everything', ICONS.overview, 'none')
    + order().map(key => link(key, NAV[key] || TITLES[key], ICONS[key], sectionTone(key))).join('')
    // Configure is a different page, not a section of this one — the plant's shape is not
    // a reading of a morning. Only somebody who can edit the plant is offered it; the
    // policies would refuse anyone else, and offering a door that does not open is worse
    // than not offering it.
    + (state.canEdit ? `<div class="rail__split"></div>
      <a class="rail__link" href="departments.html?loc=${encodeURIComponent(state.location || '')}"
         title="Configure departments">
        <svg class="rail__ico" viewBox="0 0 24 24"><path d="${ICONS.configure}"/></svg>
        <span class="rail__txt">Configure</span>
        <span class="rail__dot rail__dot--none"></span></a>` : '');
}

function renderHeader() {
  const d = dateOf(state.date);
  $('#date-long').textContent = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const difference = daysBetween(state.date, today());
  $('#date-rel').textContent = difference === 0 ? 'Today' : difference === 1 ? 'Yesterday'
    : difference > 0 ? `${difference} days ago` : 'Upcoming';
  $('#date').value = state.date;
  // When data was last pulled, next to the button that pulls it. The coordinator's question
  // at ten to eight is "has this already been done this morning" — usually because somebody
  // else may have done it — and the answer has to be beside the button, not three screens
  // away in Configure. The latest of the files is the honest reading of it: a pull fetches
  // all of them, so the newest stamp is when the last pull ran.
  const stamps = Object.values(state.metrics?.source_seen || {})
    .map(v => new Date(v)).filter(d => !Number.isNaN(+d)).sort((a, b) => b - a);
  const last = stamps[0];
  $('#pull-when').textContent = !last ? 'Not pulled today'
    : daysBetween(last.toISOString().slice(0, 10), state.date) <= 0 ? `Pulled ${clockAt(last)}`
    : `Last pulled ${dayAt(last)}`;
  $('#pull-when').className = `pullw${last
    && daysBetween(last.toISOString().slice(0, 10), state.date) <= 0 ? ' pullw--ok' : ''}`;
  $('#loc').value = state.location || '';
  $('#foot-loc').textContent = state.locations.find(l => l.id === state.location)?.name || '—';
  $('#foot-user').textContent = [state.me?.full_name, state.me?.job_title].filter(Boolean).join(' · ');
  const published = state.metrics?.status === 'published';
  $('#status').textContent = published ? 'Published' : 'Draft';
  $('#status').className = `chip ${published ? 'chip--pub' : 'chip--draft'}`;
}

function renderWho() {
  $('#who').innerHTML = state.team.map(person => `<span
    class="who__a${person.id === state.me?.id ? ' who__a--me' : ''}"
    style="background:${esc(person.colour || '#5B46D9')}"
    title="${esc(person.name || '')}${person.id === state.me?.id ? ' (you)' : ''}">${esc(person.initials || '')}</span>`).join('');
}

// Presence is painted onto the page that is already there. Rebuilding the DOM when a
// colleague moves would take the caret out of whatever someone is typing into.
function paintPresence() {
  for (const element of document.querySelectorAll('[data-pkey].is-live')) {
    element.classList.remove('is-live');
    element.style.removeProperty('--pres');
    element.querySelector(':scope > .pres')?.remove();
  }
  for (const person of state.team) {
    if (person.id === state.me?.id || !person.at) continue;
    const element = document.querySelector(`[data-pkey="${CSS.escape(person.at)}"]`);
    if (!element) continue;
    element.classList.add('is-live');
    element.style.setProperty('--pres', person.colour || '#5B46D9');
    element.insertAdjacentHTML('afterbegin',
      `<span class="pres">${esc((person.name || '').split(' ')[0])}</span>`);
  }
}

// The section verdict is gone.
//
// It summarised the section under its heading, and the room does not want a summary: they
// read the cards. On a wall it was a sentence in body type above numbers set at two
// hundred pixels, which is the wrong thing to put at the top of a screen somebody glances
// at. `verdicts()` still runs — the rail's status dots are its tones, and that is the one
// place a one-word summary earns its space.
// ── Filling one section in, on that section's own screen ────────────────────────
//
// Enter was a single screen holding every group of every section at once, which is a lot of
// boxes to hand somebody at ten past seven — and it sat oddly beside a rail whose whole job
// is to say "one subject at a time". So each section can be filled in where it lives:
// Safety's own screen either shows Safety's cards or asks for Safety's readings, and the
// switch stays put as you move down the rail. Click Safety, type, click Quality, type.
//
// Enter has not gone anywhere. Somebody who wants the whole morning on one page still has
// it, and it is still what a new plant should be shown first; this is the same fields,
// arranged the way the rail already arranges everything else.
const FILL_FOR = {
  safety:      () => fillSafety(),
  // The review is per department, and the departments are Production's — so the last
  // twenty-four hours belongs on the screen whose cards it draws, not on a screen of its own.
  production:  () => fillProduction() + fillNotes(),
  quality:     () => fillQuality(),
  shipping:    () => fillShipping(),
  financials:  () => fillMoney(),
  labour:      () => fillOvertime() + (mergedUpkeep() ? fillMaintenance() : ''),
  maintenance: () => fillMaintenance(),
};

// The next screen down the rail, so Save can be Save-and-carry-on rather than Save-and-stop.
const nextToFill = key => {
  const list = order().filter(k => FILL_FOR[k]);
  return list[list.indexOf(key) + 1] || null;
};

const modeSwitch = () => `<div class="segs" role="group" aria-label="What this screen shows">
  <button class="segs__b" data-mode="cards" aria-current="${!state.filling}">Cards</button>
  <button class="segs__b" data-mode="fill" aria-current="${!!state.filling}">Fill in</button>
</div>`;

function sectionFill(key) {
  toGo = 0;
  const body = FILL_FOR[key]();
  const left = toGo;
  const next = nextToFill(key);
  return `<div class="fill fill--one">
    <div class="fill__top fill__top--done">
      <div class="fill__count">
        <b class="${left ? 'tone--warn' : 'tone--ok'}">${left || '✓'}</b>
        <span>${left ? `to fill in on ${TITLES[key].toLowerCase()}`
          : `nothing to fill in on ${TITLES[key].toLowerCase()}`}</span>
      </div>
      ${sourceStrip()}
    </div>
    <div class="fill__grid fill__grid--one">${body}</div>
    <div class="fill__end">
      <p>Every box writes as you leave it — Save is here because a screen that saves
        invisibly gives nobody a reason to believe it did.</p>
      <div class="fill__go">
        <button class="btn" data-mode="cards">See the cards</button>
        ${state.canEdit ? `<button class="btn btn--go" data-save-section="${esc(key)}">${
          next ? `Save — on to ${TITLES[next]}` : 'Save'}</button>` : ''}
      </div>
    </div>
  </div>`;
}

const one = (key, solo = false) => {
  // Only on its own screen. The overview stacks every section, and a page of seven entry
  // forms one under another is the screen this splits up rather than a second copy of it.
  const fillable = solo && state.canEdit && !!FILL_FOR[key];
  return `<section class="sec"><div class="sec__head">
    <h2 class="sec__title">${TITLES[key]}</h2>
    ${fillable ? modeSwitch() : ''}<div class="sec__rule"></div></div>
    ${state.filling && fillable ? sectionFill(key) : SECTIONS[key]()}</section>`;
};

function renderContent() {
  if (document.body.classList.contains('tv')) return renderWall();
  if (VIEWS.includes(state.active)) {
    $('#content').className = 'content content--view';
    $('#content').innerHTML = `<section class="sec">${SECTIONS[state.active]()}</section>`;
    return;
  }
  const solo = state.active !== 'overview';
  const content = $('#content');
  content.className = `content${solo && !document.body.classList.contains('tv') ? ' content--solo' : ''}`;
  content.innerHTML = solo ? one(state.active, true) : order().map(key => one(key)).join('');
}

function render() {
  hideCards(state.plant?.hidden_cards);
  // One section or two, and the heading says which.
  TITLES.labour = state.plant?.split_upkeep ? 'Labour & Overtime' : 'Maintenance & Labour';
  state.findings = assess(state);
  state.verdicts = verdicts(state, state.findings);
  document.body.dataset.view = state.active;
  renderHeader(); renderNav(); renderContent(); renderWho(); paintPresence();
  // The plant's own arrangement, put back before anything is measured — a card moved into a
  // different row is a different shape of screen, and `fitCards()` has to see the screen
  // that is going to be looked at.
  applyCardOrder();
  fitCards();
}

// Fill the card.
//
// Every length on a card is a share of the card, which is what keeps a card one object at
// any size — but a share cannot know how much a particular card is carrying. Safety holds a
// number and a foot; Production holds a bar and a trend line as well. Sized by width alone,
// Safety's contents came to 410px inside a 930px card and sat marooned in the middle of five
// hundred pixels of nothing, with the title stuck at 30px because one line of "Days since
// last injury" is as wide as it is allowed to get.
//
// So the proportions are measured rather than assumed. Everything scales off `--u`, so
// scaling `--u` scales the card's whole contents together, and the only question is by how
// much. One factor per screen rather than per card: cards side by side that had grown to
// different type sizes would be two designs again, which is the thing this has spent three
// rounds getting rid of.
//
// It climbs rather than solving for the answer, because the answer is not linear — a title
// that wraps to a second line at 41px takes less width and more height than the same title
// at 40. Coarse steps first, then finer ones, and it never leaves a size that does not fit:
// a bisection on a predicate this lumpy converged a tenth low, which is a tenth of the card
// thrown away.
const FIT_MAX = 2.6;
const FIT_MIN = 0.7;
const FIT_STEPS = [0.32, 0.16, 0.08, 0.04, 0.02];

// ── Rearranging the cards ───────────────────────────────────────────────────────
//
// Which reading matters most is a plant's opinion, not the product's. Mississauga wants
// Printing first because Printing is where its mornings go wrong; another plant runs on its
// gluers and reads that row first. Until now the order was whatever the code emitted, and
// the only way to change it was to change the code.
//
// So a card can be picked up and put down somewhere else, in the row or along the page, and
// the plant's arrangement is remembered for everybody rather than for the browser that did
// it — the whole point of this screen is that the room is looking at the same thing.
//
// The order is stored as a list of card keys per grid. A key the list does not name keeps
// its place at the end, which is what makes a card added in a later release appear rather
// than vanish, and a key naming a card that is now switched off is simply skipped.
const orderFor = key => state.plant?.card_order?.[key] || [];

function applyCardOrder(root = document) {
  for (const grid of root.querySelectorAll('.grid--cards[data-grid]')) {
    const list = orderFor(grid.dataset.grid);
    if (!list.length) continue;
    const cards = [...grid.children].filter(card => card.classList.contains('card'));
    const rank = card => {
      const at = list.indexOf(card.dataset.pkey);
      return at === -1 ? list.length : at;
    };
    // Stable: two cards the list does not name stay in the order the section built them.
    const sorted = cards.map((card, i) => ({ card, i }))
      .sort((a, b) => rank(a.card) - rank(b.card) || a.i - b.i);
    for (const { card } of sorted) grid.append(card);
  }
}

// Native drag rather than a pointer-driven one, because a card is full of inputs and a
// pointer handler that starts a drag on mousedown makes it impossible to select the text in
// any of them. `draggable` is switched on only for the press that is about to become a drag,
// and off again the moment the mouse comes up — so a card behaves like a card until somebody
// takes hold of it.
let dragCard = null;

const canReorder = () => state.canEdit;

// The card the dragged one should land in front of: the first one whose left half the
// pointer has not yet passed, reading the grid the way the eye does.
function landsBefore(grid, x, y) {
  for (const card of grid.children) {
    if (!card.classList.contains('card') || card === dragCard) continue;
    const box = card.getBoundingClientRect();
    if (y < box.bottom && x < box.left + box.width / 2) return card;
  }
  return null;
}

document.addEventListener('pointerdown', event => {
  if (!canReorder() || event.button) return;
  const card = event.target.closest('.grid--cards[data-grid] > .card');
  if (!card || event.target.closest('input,select,textarea,button,a,label')) return;
  card.draggable = true;
});

const dropDrag = () => {
  for (const card of document.querySelectorAll('.card[draggable="true"]')) card.draggable = false;
};
document.addEventListener('pointerup', () => { if (!dragCard) dropDrag(); });

document.addEventListener('dragstart', event => {
  const card = event.target.closest?.('.card[draggable="true"]');
  if (!card) return;
  dragCard = card;
  card.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  // Firefox refuses to start a drag with nothing on the clipboard.
  event.dataTransfer.setData('text/plain', card.dataset.pkey || '');
});

document.addEventListener('dragover', event => {
  if (!dragCard) return;
  const grid = event.target.closest?.('.grid--cards[data-grid]');
  // Within its own grid only. Dragging Safety's streak into Shipping would ask the section
  // to draw a card it does not build, and it would be gone again on the next render.
  if (grid !== dragCard.parentElement) return;
  event.preventDefault();
  const before = landsBefore(grid, event.clientX, event.clientY);
  if (before !== dragCard.nextElementSibling) grid.insertBefore(dragCard, before);
});

document.addEventListener('drop', event => { if (dragCard) event.preventDefault(); });

document.addEventListener('dragend', () => {
  if (!dragCard) return;
  const grid = dragCard.parentElement;
  dragCard.classList.remove('is-dragging');
  dragCard = null;
  dropDrag();
  const keys = [...grid.children].filter(card => card.classList.contains('card'))
    .map(card => card.dataset.pkey).filter(Boolean);
  const order = { ...(state.plant?.card_order || {}), [grid.dataset.grid]: keys };
  state.plant = { ...(state.plant || {}), card_order: order };
  savePlant(state.location, { card_order: order }).then(noteSaved)
    .catch(error => toast(error.message));
});

// Measured before Barlow Condensed arrived, every title is measured in Arial, which is much
// wider — so the first paint of the morning settled on a bar a third shorter than the one
// every re-render afterwards produced. Nobody could see it in a screenshot of one screen;
// what they saw was that clicking from Everything into a section moved the titles. The fit
// is asked again once the faces are in.
if (document.fonts?.ready) document.fonts.ready.then(() => fitCards());

// What a card is actually using, top of its first row to bottom of its last. `scrollHeight`
// cannot answer this: the contents are centred, so a card with room to spare reports its own
// height and looks full.
//
// The title bar is not part of it. The bar is fixed to the top and sizes itself; what has to
// fit is everything under it, in what the bar leaves behind.
const bodyOf = card => card.querySelector('.card__body') || card;

function usedBy(card) {
  const rows = [...bodyOf(card).children].filter(row => row.getClientRects().length);
  if (!rows.length) return 0;
  return rows[rows.length - 1].getBoundingClientRect().bottom
       - rows[0].getBoundingClientRect().top;
}

function roomIn(card) {
  const body = bodyOf(card), style = getComputedStyle(body);
  return body.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
}

// Anything that has run out of room: the card itself, a title past its second line, or a
// number, label or date wider than the space it was given.
//
// The vertical test is the title's alone. A hero is set at .95 line-height on purpose, so
// its glyphs are always a little taller than its line box and `scrollHeight` always exceeds
// `clientHeight` — which read as "this card is full" on every card at every size and pinned
// the whole thing at 1. Height that genuinely overruns shows up in the card's own total.
function overflows(card) {
  if (usedBy(card) > roomIn(card) + 1) return true;
  for (const part of card.querySelectorAll(
    '.card__label,.flag,.hero,.unit,.fs__l,.fs__v,.ctrack__l,.ctrack__d')) {
    if (part.scrollWidth > part.clientWidth + 1) return true;
  }
  return false;
}

// Every title the product can draw, whether or not it is on the screen being measured.
//
// The bar is sized by the longest title that has to fit in it, and until now "the longest
// title" meant the longest one in front of you. On the Everything page that is the whole
// catalogue and the bar came out at 32px; on the Production section on its own the longest
// title is "Die Cutting" and the same bar came out at 45. Two screens of the same product,
// two bar heights — which is exactly what the room reported, and it is the one thing the
// bar was introduced to stop.
//
// So the cap is settled against every title at once. A screen showing two short-titled
// cards draws the bar it would draw if "Upcoming maintenance" were beside them, which is
// the point: walking from Safety to Production must not move the titles.
const allTitles = () => [
  ...CARD_CATALOGUE.map(card => card.name),
  ...(state.config || []).map(config => config.name),
  ...(state.review || []).map(row =>
    (state.config || []).find(c => c.key === row.dept_key)?.name || row.dept_key),
];

// A card with nothing in it but a title bar, off the side of the screen, at the width the
// real cards are. Measured rather than calculated: how wide a title needs to be depends on
// which letters are in it, and a formula from the character count put "COQ — month to
// date" two pixels over.
function titleProbe(width, height) {
  const probe = document.createElement('div');
  probe.className = 'tprobe';
  probe.innerHTML = allTitles().map(name =>
    `<div class="card" style="width:${width}px;--card-h:${height}px">
       <div class="card__head"><span class="card__ico" aria-hidden="true">${iconFor('none')}</span>
         <span class="card__label">${esc(name)}</span></div></div>`).join('');
  document.body.append(probe);
  return probe;
}

function fitCards() {
  // On the wall each screen is measured on its own, because each screen has its own card
  // size. On the page every card is 318 by 360 whatever section it is in, so the whole page
  // is measured together — otherwise Safety's two cards would grow to a larger title than
  // Production's four on the same screen, which is the same "two designs" fault in a new
  // place.
  const grids = [...document.querySelectorAll('.grid--cards')];
  const groups = document.body.classList.contains('tv') ? grids.map(g => [g]) : [grids];
  for (const group of groups) {
    const cards = group.flatMap(grid => [...grid.children].filter(c => c.classList.contains('card')));
    if (!cards.length) continue;
    // Measured with the zones switched off.
    //
    // A card body is three zones now — reading, drawings, foot — and the middle one takes
    // whatever height is left over. That is the point of it, and it makes the card
    // unmeasurable while it is on: every card fills its own height exactly, so `usedBy`
    // equals `roomIn` on all of them, nothing ever looks full, and the climb below has
    // nothing to push against. `measuring` puts the parts back in a plain stack for the
    // duration, which is what has to fit; the stretch is only ever what to do with what is
    // left after it does.
    group.forEach(grid => grid.classList.add('measuring'));
    const set = value => group.forEach(grid => grid.style.setProperty('--fit', String(value)));
    // The title first, because the bar it sits in is what is left of the card for
    // everything else. One size for the whole screen — two titles of different lengths would
    // draw two bar heights and put their readings on two different lines, which is the fault
    // the bar exists to remove — and it is found by measuring rather than by counting
    // characters, because the width a title needs depends on which letters are in it.
    // The flag line is reserved across the whole group, not per grid.
    //
    // Per grid, a Safety section carrying "Record broken" reserved the row and every other
    // section on the page did not — so Safety's number started twenty pixels below every
    // other number on the page, which is the same complaint as a rule that does not line up.
    // The group is one screen on the wall and the whole page on the page, which is exactly
    // the set of cards a reader sees at once. A section that never flags still costs nothing
    // on a morning when nothing anywhere is flagged.
    const flagged = group.some(grid => grid.querySelector('.card .flag'));
    for (const grid of group) grid.classList.toggle('flagged', flagged);
    const box = cards[0].getBoundingClientRect();
    const probe = titleProbe(box.width || 300, box.height || 340);
    const titles = [...cards, ...probe.children]
      .map(card => card.querySelector('.card__label')).filter(Boolean);
    const capTitle = value => {
      const px = `${value.toFixed(2)}px`;
      probe.style.setProperty('--tcap', px);
      group.forEach(grid => grid.style.setProperty('--tcap', px));
    };
    const ceilingPx = 0.09 * (cards[0].clientWidth || 300);
    let cap = ceilingPx;
    capTitle(cap);
    for (let i = 0; i < 24 && cap > ceilingPx * 0.28; i++) {
      if (!titles.some(title => title.scrollWidth > title.clientWidth + 1)) break;
      cap *= 0.94;
      capTitle(cap);
    }
    probe.remove();
    set(1);
    // The fullest card sets the ceiling. Reading each card's own headroom first means one
    // measurement pass rather than one per step of the climb.
    let fit = FIT_MAX;
    for (const card of cards) {
      const used = usedBy(card);
      if (used > 0) fit = Math.min(fit, roomIn(card) / used);
    }
    // Below 1 as well as above it. The proportions are set by the fullest card there is, and
    // on a small laptop a screen of eight came out two pixels over — which under
    // `overflow:hidden` is a foot with its descenders shaved off, and nothing to say so.
    const ceiling = fit;
    fit = Math.min(1, ceiling);
    set(fit);
    while (fit > FIT_MIN && cards.some(overflows)) { fit -= 0.02; set(fit); }
    for (const step of FIT_STEPS) {
      while (fit + step <= ceiling) {
        set(fit + step);
        if (cards.some(overflows)) break;
        fit += step;
      }
      set(fit);
    }
    group.forEach(grid => grid.classList.remove('measuring'));
  }
}

// ── The wall ──
//
// Present mode walks the meeting: Safety & Quality, Production, Shipping, Financials,
// Maintenance, in that order, one section per screen, and back to the top.
//
// It used to choose by alarm level — the worst reading first, then the rest — which meant
// the screen showed a different thing every morning and nobody could tell where they were
// in the round. A plant walking past a screen learns nothing from a card it cannot place.
// A fixed order is learnable: after a week you know Shipping follows Production, and you
// look up at the right moment for the number you came for.
//
// The sections are the ones already on the page, rendered by the same code, so the wall
// cannot drift from what the room saw on the laptop five minutes earlier.
// How a section is dealt out on the wall.
//
// The group stays together — Shipping is one screen, not two — so the only question is how
// to arrange it, and the answer is not "as many as fit". `auto-fit` dealt eight shipping
// cards as five and three on a wide screen, and a row of five above a row of three is the
// first thing anybody notices about a slide.
//
// So the arrangement is chosen rather than fallen into. Every column count is costed at the
// size it would actually produce, and the one that puts the most card on the screen wins —
// with a squared penalty for cells left empty in the last row, because a ragged last row is
// the same fault the room already caught once. Eight comes out four and four. Six comes out
// three and three. Four comes out four across, because one row of four is half again as
// much card as two rows of two.
//
// It has to be arithmetic and not a rule of thumb, because the answer moves with the screen:
// the same eight cards want four columns on a 1920 wall and would want three on a tall one.
const cssNum = name => parseFloat(
  getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;

// `share` is how much of the screen's height the cards get. It is one on every screen but
// the one that also carries a table, where the cards take the top half and the table the
// rest — and the arrangement has to be chosen for the height the cards will actually have,
// not for the screen.
function bestGrid(count, share = 1) {
  const gap = cssNum('--s4'), pad = cssNum('--s6');
  // The ratio at which a card's contents exactly fill it, and the tallest it may be drawn
  // before it stops reading as a card. Both live in the stylesheet — this reads them rather
  // than holding a second copy that would drift the first time either is tuned.
  const min = cssNum('--card-r') || 1.13, max = cssNum('--card-r-max') || 1.6;
  const room = { w: window.innerWidth - pad * 2,
                 h: (window.innerHeight - cssNum('--wall-chrome')) * share,
                 cap: window.innerWidth * cssNum('--wall-cap') / 100 };
  let best = { cols: count, rows: 1, score: -1 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const cell = { w: (room.w - (cols - 1) * gap) / cols,
                   h: (room.h - (rows - 1) * gap) / rows };
    const w = Math.min(cell.w, room.cap);
    const h = Math.min(cell.h, w * max);
    if (w <= 0 || h <= 0) continue;
    // What is being maximised is how big the *reading* comes out, not how much card there
    // is. They are not the same: two rows of three and three rows of two both cover most of
    // the screen, and one of them draws the number at half the size. This is the same
    // `min(width, height ÷ ratio)` the stylesheet uses to size the contents, so the
    // arrangement is chosen for the card that will actually be drawn.
    const reading = Math.min(w, h / min);
    // Squared, because a ragged last row is the fault the room already caught once — five
    // shipping cards above three — and it has to cost more than a few pixels of type.
    const filled = count / (cols * rows);
    const score = reading * filled * filled;
    if (score > best.score) best = { cols, rows, score };
  }
  return best;
}

// What present mode leaves out.
//
// A dashboard and a broadcast are not the same audience. The office reads sales on the
// screen it opened; the corridor TV the floor walks past is a different room, and a plant
// is entitled to say so without taking the card off the dashboard. The list holds section
// keys and card keys alike, so it is "not the money" or "not that one card", whichever the
// plant meant.
const wallHidden = () => new Set(state.plant?.wall_hidden || []);

function wallPages() {
  const pages = [];
  const off = wallHidden();
  // The sections render themselves, once, and their cards are read back out. Doing it this
  // way rather than keeping a parallel list of readings is what stops the wall drifting
  // from the page: there is one definition of a Shipping card and this is reading it.
  const holder = document.createElement('div');
  for (const key of order()) {
    if (off.has(key)) continue;
    holder.innerHTML = SECTIONS[key]();
    // The plant's arrangement applies to the wall too. A room that put Gluing first on the
    // page and second on the screen is looking at two dashboards.
    applyCardOrder(holder);
    const cards = [...holder.querySelectorAll('.grid--cards > .card')]
      .filter(card => !off.has(card.dataset.pkey) && card.dataset.empty !== '1');
    // Which section a card belongs to, carried on the card. The collage has no headings —
    // the bar's colour is the heading — so this is the only thing that groups them.
    for (const card of cards) card.dataset.fam = key;
    // Nothing but cards goes on the wall now. Two tables used to be allowed up — the
    // maintenance schedule and last week's productivity — each on the argument that what the
    // room needed off it was five columns wide. Both are cards, so the exception has nothing
    // left to except, and a screen is one grid again.
    if (!cards.length) continue;
    const deal = state.wallMode === 'all' ? { cols: 1, rows: 1 } : bestGrid(cards.length);
    pages.push({ key, ...deal, html: cards.map(card => card.outerHTML).join('') });
  }
  return pages;
}

// Two shapes, because two rooms want two different things.
//
// The walk is a meeting: one section at a screen, driven by a person, each card as large as
// the screen allows. One page is a corridor TV and a screenshot — it cannot be scrolled and
// it cannot be paged, so it has one job, which is to fit.
//
// It is one grid of identical cards. Two earlier attempts gave each section its own block
// with its own arrangement, and both produced a page where Safety's cards were twice the size
// of Shipping's and every block set its type at a different scale. On a collage that reads as
// six dashboards photographed together. Same card, same size, same type, everywhere — and the
// sections are told apart by the colour of the bar across the top rather than by being drawn
// bigger, which is what the bar was always for.
const FAMILY = ['safety', 'quality', 'production', 'shipping', 'financials',
                'maintenance', 'labour'];

// How many columns put the whole set closest to the shape a card wants to be. Same question
// `bestGrid()` answers for a section, asked of every card at once.
function snapCols(count, box) {
  const want = cssNum('--card-r') || 1.132;
  let best = { cols: count, off: Infinity };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    // A ragged last row costs enough that seven across and one underneath never wins — the
    // same lesson the walk learned about five shipping cards above three.
    const off = Math.abs((box.h / rows) / (box.w / cols) - want)
              + (1 - count / (cols * rows)) * 1.6;
    if (off < best.off) best = { cols, off };
  }
  return best.cols;
}

function renderWallPage(pages) {
  const content = $('#content');
  content.className = 'content wall wall--snap';
  const shown = pages.filter(p => p.html);
  content.innerHTML = `
    <div class="wall__top">
      <h2>${esc(state.locations.find(l => l.id === state.location)?.name || '')}</h2>
      <div class="legend">${shown.map(p =>
        `<span class="legend__i" data-fam="${esc(p.key)}">${esc(TITLES[p.key])}</span>`).join('')}</div>
      <span class="wall__date">${$('#date-long').textContent}</span>
    </div>
    <div class="grid grid--cards grid--snap" data-grid="wall">${shown.map(p => p.html).join('')}</div>`;
  const grid = content.querySelector('.grid--snap');
  const count = grid.querySelectorAll(':scope > .card').length;
  if (!count) return;
  const box = grid.getBoundingClientRect();
  grid.style.setProperty('--snap-cols', String(snapCols(count, { w: box.width, h: box.height })));
}

// ── The overview ────────────────────────────────────────────────────────────────
//
// Six numbers, one per family, and nothing else. It is the third shape because it answers a
// third question: not "walk me through the morning" and not "show me everything at once",
// but "is the plant all right" — asked by somebody who is thirty feet away and walking.
//
// The number a family gets is the one that would be said out loud if you had one sentence
// for that family. It is chosen rather than derived: the assessment's worst reading in a
// family is the right answer on a bad morning and the wrong one on a good one, where it
// picks whatever happens to be nearest a threshold and the screen changes shape daily. A
// fixed choice is learnable, which is the whole point of a screen you glance at.
const BRIEF = [
  { fam: 'safety',      label: 'Days injury-free',  key: 'injury' },
  { fam: 'quality',     label: 'Cost of quality',   key: 'coq' },
  { fam: 'production',  label: 'Against target',    key: 'production' },
  { fam: 'shipping',    label: 'OTIF today',        key: 'otif' },
  { fam: 'labour',      label: 'Overtime shifts',   key: 'overtime' },
  { fam: 'financials',  label: 'Month to date',     key: 'fin' },
];

// Production has no single reading — it has one per department — so its tile is the whole
// floor against target, weighted by the hours each department actually ran. A plant that
// ran one press for two hours and its gluers all day is not half a per cent under.
function floorAgainstTarget() {
  let hours = 0, weighted = 0;
  for (const config of state.config.filter(c => c.on_metrics)) {
    const row = dept(config.key), rate = rateOf(row);
    const target = Number(row.target ?? config.target);
    if (!rate || !target || !Number(row.hours)) continue;
    hours += Number(row.hours);
    weighted += Number(row.hours) * ((rate - target) / target * 100);
  }
  return hours ? weighted / hours : null;
}

function briefTiles() {
  const off = wallHidden();
  const find = key => state.findings.find(r => r.key === key);
  const out = [];
  for (const tile of BRIEF) {
    if (off.has(tile.fam)) continue;
    if (tile.key === 'production') {
      const pct = floorAgainstTarget();
      out.push({ ...tile,
        value: pct == null ? '\u2014' : `${pct >= 0 ? '+' : '\u2212'}${Math.abs(pct).toFixed(1)}%`,
        tone: pct == null ? '' : pct >= 0 ? 'ok' : pct > -10 ? 'warn' : 'stop' });
      continue;
    }
    const found = find(tile.key);
    if (!found) { out.push({ ...tile, value: '\u2014', tone: '', state: 'missing' }); continue; }
    out.push({ ...tile, value: `${found.value}${found.unit === '%' ? '%' : ''}`,
               tone: found.tone || '', state: found.state });
  }
  return out;
}

// One line of what is wrong, under the tiles. Three at most, because a fourth is not read
// from thirty feet and a screen with a list on it has stopped being a glance.
function briefWorst() {
  return attention(state.findings).slice(0, 3).map(r =>
    `<span class="brief__w brief__w--${r.tone}">${esc(r.area)} \u00b7 ${esc(r.value)}${
      r.unit === '%' ? '%' : ''}</span>`).join('');
}

function renderBrief() {
  const content = $('#content');
  content.className = 'content wall wall--brief';
  const tiles = briefTiles();
  const gaps = absent(state.findings).length;
  content.innerHTML = `
    <div class="wall__top">
      <h2>${esc(state.locations.find(l => l.id === state.location)?.name || '')}</h2>
      ${gaps ? `<span class="brief__gap">${gaps} reading${gaps === 1 ? '' : 's'} not entered</span>` : ''}
      <span class="wall__date">${$('#date-long').textContent}</span>
    </div>
    <div class="brief">${tiles.map(t => `<div class="brief__t" data-fam="${esc(t.fam)}">
      <div class="brief__n tone--${t.tone || 'none'}">${esc(t.value)}</div>
      <div class="brief__l">${esc(t.label)}</div></div>`).join('')}</div>
    <div class="brief__bar">${briefWorst() || '<span class="brief__w">Nothing outstanding</span>'}</div>`;
}

function renderWall() {
  const pages = wallPages();
  if (!pages.length) return;
  if (state.wallMode === 'brief') return renderBrief();
  if (state.wallMode === 'all') return renderWallPage(pages);   // one fixed screen
  const at = ((state.wallStep % pages.length) + pages.length) % pages.length;
  const page = pages[at];
  const content = $('#content');
  content.className = 'content wall';
  content.innerHTML = `
    <div class="wall__top">
      <h2>${esc(TITLES[page.key])} · ${esc(state.locations.find(l => l.id === state.location)?.name || '')}</h2>
      <span class="wall__date">${$('#date-long').textContent}</span>
    </div>
    <section class="sec">
      <div class="grid grid--cards" data-grid="${esc(page.key)}"
           style="--wall-cols:${page.cols};--wall-rows:${page.rows}">${page.html}</div>
    </section>
    <div class="wall__dots">${pages.map((p, i) =>
      `<span class="wall__dot${i === at ? ' wall__dot--on' : ''}"
             title="${esc(TITLES[p.key])}"></span>`).join('')}</div>`;
}

// The arrangement is worked out against the screen it is going on, so a screen that changes
// size has to be asked again. Moving a browser window between a laptop and a meeting-room
// display is exactly this, and it is the moment somebody is watching.
let wallResize;
addEventListener('resize', () => {
  if (!document.body.classList.contains('tv')) return;
  clearTimeout(wallResize);
  wallResize = setTimeout(() => { renderWall(); applyCardOrder(); fitCards(); }, 120);
});

// ── Saving ──────────────────────────────────────────────────────────────────────

const saved = message => { $('#saved').textContent = message; };
let savedTimer;
function noteSaved() {
  saved('Saving…');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => saved('All changes saved'), 700);
}

const parse = (element, raw) => {
  if (element.type !== 'number') return raw === '' ? null : raw;
  return raw === '' ? null : Number(raw);
};

// One write per field. `budget:` and `dept:` and `review:` name the table the value
// belongs to, so a field knows where it lives without the page keeping a map.
async function persist(name, value) {
  const [kind, first, second] = name.split(':');
  try {
    if (kind === 'maint') await saveMaintenance(first, { [second]: value });
    else if (kind === 'dept') await saveDepartment(state.location, state.date, first, { [second]: value });
    else if (kind === 'labour') await saveLabour(state.location, state.date, first, { [second]: value });
    else if (kind === 'review') await saveReview(state.location, state.date, first, { [second]: value });
    else if (kind === 'budget') await saveBudget(state.location, dateOf(state.date).getFullYear(), Number(first), value ?? 0);
    else await saveField(state.location, state.date, name, value);
    if (['jobs_shipped', 'late', 'shorts'].includes(name)) {
      const derived = derivedShipping(state.metrics);
      // A morning with nought jobs shipped has no percentage to store. The columns are
      // numeric, so the only honest thing to put in them is nothing — the card works out
      // "N/A" from the jobs figure itself and does not need a sentinel in the database.
      const write = derived?.na ? { otd: null, otif: null } : derived;
      if (write) {
        state.metrics.otd = write.otd;
        state.metrics.otif = write.otif;
        await saveField(state.location, state.date, 'otd', write.otd);
        await saveField(state.location, state.date, 'otif', write.otif);
      }
    }
    noteSaved();
    recordEdit(state.location, state.date, name, value);
  } catch (error) {
    saved(error.message);
  }
}

// The value is put into local state immediately and sent shortly after. The number a
// person just typed is theirs; it must not wait on the network to appear.
function applyLocally(name, value) {
  const [kind, first, second] = name.split(':');
  if (kind === 'maint') {
    for (const list of [state.upcoming, state.maintenance]) {
      const row = (list || []).find(m => m.id === first);
      if (row) row[second] = value;
    }
  } else if (kind === 'dept') {
    const row = state.departments.find(d => d.dept_key === first);
    if (row) row[second] = value;
  } else if (kind === 'labour') {
    const row = state.labour.find(l => l.dept_key === first);
    if (row) row[second] = value;
    else state.labour.push({ dept_key: first, [second]: value });
  } else if (kind === 'review') {
    const row = state.review.find(r => r.dept_key === first);
    if (row) row[second] = value;
  } else if (kind === 'budget') {
    const month = Number(first);
    const existing = state.budgets.find(b => b.month === month);
    if (existing) existing.amount = value ?? 0;
    else state.budgets.push({ month, amount: value ?? 0 });
  } else if (state.metrics) {
    state.metrics[name] = value;
  }
}

let redrawTimer, sendTimer;
// The one write that has not gone yet. A field writes 450ms after the last keystroke, so at
// the instant somebody presses Save the box they are still in is the one thing not saved —
// which is the only box Save has any business worrying about.
let waiting = null;
async function flushWrites() {
  clearTimeout(sendTimer);
  const now = waiting;
  waiting = null;
  if (now) await persist(now.name, now.value);
}
document.addEventListener('input', event => {
  const name = event.target.dataset?.field;
  if (!name) return;
  const value = parse(event.target, event.target.value);
  applyLocally(name, value);

  clearTimeout(sendTimer);
  waiting = { name, value };
  sendTimer = setTimeout(() => { waiting = null; persist(name, value); }, 450);

  // Redrawing recalculates every rate and colour, so it waits until typing pauses and
  // then puts the caret back where it was.
  clearTimeout(redrawTimer);
  redrawTimer = setTimeout(() => {
    const focused = document.activeElement?.dataset?.field;
    render();
    if (focused) document.querySelector(`[data-field="${CSS.escape(focused)}"]`)?.focus();
  }, 900);
});

document.addEventListener('change', event => {
  const name = event.target.dataset?.field;
  if (!name) return;
  // A tick is one of a set, so what is written is the whole set. Reading the boxes back off
  // the page rather than keeping a list beside them means the ticks and the row can never
  // disagree about which machines are running.
  if (event.target.type === 'checkbox') {
    const chosen = [...document.querySelectorAll(`input[type="checkbox"][data-field="${
      CSS.escape(name)}"]`)].filter(box => box.checked).map(box => box.dataset.machine);
    applyLocally(name, chosen);
    persist(name, chosen);
    render();
    return;
  }
  if (event.target.tagName !== 'SELECT') return;
  applyLocally(name, event.target.value);
  persist(name, event.target.value);
  render();
});

// Announcing where you are is a presence write only — it never touches the database.
document.addEventListener('focusin', event => {
  const card = event.target.closest?.('[data-pkey]');
  state.live?.focus(card?.dataset.pkey ?? null);
});
document.addEventListener('focusout', event => {
  if (!event.relatedTarget?.closest?.('[data-pkey]')) state.live?.focus(null);
});

// ── Loading a morning ───────────────────────────────────────────────────────────

async function open(location, date) {
  state.live?.leave();
  state.location = location; state.date = date;
  // A grant is per plant. Somebody who may edit Mississauga and only read Guelph must not
  // be offered Configure on Guelph, and switching plants used to leave the first plant's
  // answer standing.
  state.canEdit = state.locations.find(l => l.id === location)?.canEdit ?? false;
  $('#content').innerHTML = '<div class="loading">Loading the morning…</div>';
  try {
    if (state.canEdit) await openDay(location, date);
    const from = new Date(dateOf(date)); from.setDate(from.getDate() - 6);
    const [day, budgets, history, months, machines, upcoming] = await Promise.all([
      loadDay(location, date),
      loadBudgets(location, dateOf(date).getFullYear()),
      loadHistory(location, from.toISOString().slice(0, 10), date),
      loadYearCounts(location, dateOf(date).getFullYear()),
      loadMachines(location),
      loadUpcoming(location, date),
    ]);
    Object.assign(state, day, { budgets: budgets || [], history, year: months || [],
                                machines: machines || [], upcoming: upcoming || [] });
    saved('All changes saved');
  } catch (error) {
    $('#content').innerHTML = `<div class="loading">${esc(error.message)}</div>`;
    return;
  }
  render();

  state.live = joinDay(location, date, {
    me: { id: state.me.id, name: state.me.full_name, initials: state.me.initials, colour: state.me.colour },
    onPresence: people => { state.team = people; renderWho(); paintPresence(); },
    // Somebody else's number arriving must not disturb the field this person is in, so
    // the row is merged and only the parts that can change are redrawn.
    onChange: (table, row) => {
      if (table === 'daily_metrics') Object.assign(state.metrics ?? (state.metrics = {}), row);
      if (table === 'daily_departments') {
        const existing = state.departments.find(d => d.dept_key === row.dept_key);
        existing ? Object.assign(existing, row) : state.departments.push(row);
      }
      if (table === 'daily_labour') {
        const existing = state.labour.find(l => l.dept_key === row.dept_key);
        existing ? Object.assign(existing, row) : state.labour.push(row);
      }
      if (table === 'daily_review') {
        const existing = state.review.find(r => r.dept_key === row.dept_key);
        existing ? Object.assign(existing, row) : state.review.push(row);
      }
      if (document.activeElement?.dataset?.field) { renderNav(); return; }
      render();
    },
  });
}

// ── Controls ────────────────────────────────────────────────────────────────────

$('#nav').addEventListener('click', event => {
  const button = event.target.closest('[data-nav]');
  if (!button) return;
  state.active = button.dataset.nav;
  render();
  scrollTo({ top: 0, behavior: 'smooth' });
});

$('#rail-btn').addEventListener('click', () => {
  const mini = document.documentElement.dataset.rail === 'mini';
  document.documentElement.dataset.rail = mini ? '' : 'mini';
  $('#rail-btn').setAttribute('aria-label', mini ? 'Collapse menu' : 'Expand menu');
  $('#rail-btn').querySelector('path').setAttribute('d', mini ? 'M15 5 L8 12 L15 19' : 'M9 5 L16 12 L9 19');
  savePreference(state.me.id, { rail_collapsed: !mini }).catch(() => {});
});

// Adding and dropping a maintenance item. Both are a write and a redraw, and both are only
// reachable in edit mode.
document.addEventListener('click', async event => {
  const add = event.target.closest('#maint-add');
  if (add) {
    try {
      const row = await addMaintenance(state.location, state.date);
      if (row) { state.upcoming = [...(state.upcoming || []), row]; render(); }
    } catch (error) { toast(error.message); }
    return;
  }
  const drop = event.target.closest('[data-drop-maint]');
  if (!drop) return;
  const id = drop.dataset.dropMaint;
  try {
    await removeMaintenance(id);
    state.upcoming = (state.upcoming || []).filter(m => m.id !== id);
    state.maintenance = state.maintenance.filter(m => m.id !== id);
    render();
  } catch (error) { toast(error.message); }
});

$('#edit-btn').addEventListener('click', () => {
  // Showing the fields is a personal view. It claims nothing and blocks nobody.
  const on = document.body.classList.toggle('editing');
  $('#edit-btn').textContent = on ? 'Done editing' : 'Edit mode';
  $('#publish-btn').classList.toggle('hide', !on);
  paintPresence();
});

// The entry screen finishes with Publish, because that is where a person finishes.
document.addEventListener('click', event => {
  const go = event.target.closest('.fill [data-nav]');
  if (go) { state.active = go.dataset.nav; render(); window.scrollTo(0, 0); return; }
  if (event.target.closest('#fill-publish')) $('#publish-btn').click();
  if (event.target.closest('#reset-day')) startAgain();
});

// Cards or fill-in, and the answer sticks. Somebody working down the rail filling sections
// in should not have to say so again on every screen.
document.addEventListener('click', event => {
  const mode = event.target.closest('[data-mode]');
  if (!mode) return;
  state.filling = mode.dataset.mode === 'fill';
  render();
  window.scrollTo(0, 0);
});

// Save, and carry on down the rail.
document.addEventListener('click', async event => {
  const done = event.target.closest('[data-save-section]');
  if (!done) return;
  document.activeElement?.blur();
  await flushWrites();
  const next = nextToFill(done.dataset.saveSection);
  toast(next ? `Saved. ${TITLES[next]} next.` : 'Saved.');
  if (next) { state.active = next; render(); window.scrollTo(0, 0); }
});

// Start this morning again.
//
// The daily reset is automatic — a morning opens with the last twenty-four hours blank, the
// counts blank and the streaks carried — but automatic is not the same as recoverable. A
// pull that read the wrong file, or an hour of typing into yesterday's date, leaves a
// morning that has to be put back by hand, box by box, and there was no way to do it. This
// is that way: one date, the same rules the morning opened under, and nothing outside it.
//
// It asks, because it throws work away. It asks with the date in the question, because the
// mistake this exists to undo is having been on the wrong date.
async function startAgain() {
  if (!state.canEdit) return toast('Your account cannot change this plant.');
  const d = dateOf(state.date);
  const said = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  if (!confirm(`Start ${said} again?\n\nEverything entered for this date is cleared and the `
    + `morning reopens the way it would have this morning. Other dates are untouched.`)) return;
  const button = $('#reset-day');
  if (button) { button.disabled = true; button.textContent = 'Starting again…'; }
  try {
    await resetMorning(state.location, state.date);
    await open(state.location, state.date);
    toast(`${said} has been started again.`);
  } catch (error) {
    toast(error.message);
    if (button) { button.disabled = false; button.textContent = 'Start this morning again'; }
  }
}

// A missing reading names the field that fills it, so the way to fix it is one click rather
// than a hunt. From the summary it crosses to Enter first; from Enter it just goes there.
document.addEventListener('click', event => {
  const jump = event.target.closest('[data-goto]');
  if (!jump) return;
  const field = jump.dataset.goto;
  const land = () => {
    const box = document.querySelector(`.fill [data-field="${CSS.escape(field)}"]`);
    if (!box) return;
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    box.focus({ preventScroll: true });
    const row = box.closest('.fr') || box;
    row.classList.add('fr--found');
    setTimeout(() => row.classList.remove('fr--found'), 1600);
  };
  if (state.active !== 'fill') { state.active = 'fill'; render(); requestAnimationFrame(land); }
  else land();
});

// Publishing an incomplete morning takes a deliberate act and a reason.
//
// It used to take one click whatever the morning contained, which is how a screen twenty
// people read could go up with four departments never asked and nobody the wiser. The guard
// is not a refusal — a plant that has to start the meeting at eight is going to publish what
// it has, and it is right to — it is that the room is told what is missing, and that the
// person who decided to go anyway says why. The note travels with the publication.
$('#publish-btn').addEventListener('click', async () => {
  const gaps = absent(state.findings);
  let note = null;
  if (gaps.length) {
    const names = gaps.slice(0, 4).map(r => r.title).join(', ');
    note = prompt(
      `${gaps.length} reading${gaps.length === 1 ? ' has' : 's have'} not been entered — ${
        names}${gaps.length > 4 ? `, and ${gaps.length - 4} more` : ''}.\n\n` +
      'Publishing now is allowed. Say briefly why, and the note goes up with the morning.');
    // Cancel means cancel. An empty box means somebody pressed OK without reading it.
    if (note === null) return;
    if (!note.trim()) { toast('A reason is needed to publish an incomplete morning'); return; }
  }
  try {
    await publish(state.location, state.date, { incomplete: gaps.length > 0, note });
    if (state.metrics) state.metrics.status = 'published';
    document.body.classList.remove('editing');
    $('#edit-btn').textContent = 'Edit mode';
    $('#publish-btn').classList.add('hide');
    toast(gaps.length
      ? `Published with ${gaps.length} missing — the note is on the record`
      : 'Published — every screen shows this now');
    render();
  } catch (error) { toast(error.message); }
});

$('#loc').addEventListener('change', event => open(event.target.value, state.date));
$('#date').addEventListener('change', event => { if (event.target.value) open(state.location, event.target.value); });

$('#signout-btn').addEventListener('click', async () => {
  state.live?.leave();
  await signOut();
  location.replace('../index.html');
});

let toastTimer;
function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('on'), 2400);
}

// Present mode is driven by whoever is presenting, and by nobody else.
//
// It used to rotate on a nine-second timer with a play button. A timer moves the screen
// while somebody is mid-sentence about the thing that was on it, and the room spends the
// meeting waiting for the page to come back round. Arrows, space and the two buttons —
// that is the whole control surface.
const step = direction => {
  if (state.wallMode !== 'walk') return;
  const total = wallPages().length || 1;
  state.wallStep = ((state.wallStep + direction) % total + total) % total;
  renderWall();
  fitCards();
};
// Three shapes, in the order a room grows into them: the walk, the collage, the glance.
//
// The walk is the meeting, one section at a screen, driven by a person. The collage is the
// snapshot — everything at once, for a screenshot or a wall somebody passes twice a day.
// The overview is the glance: six numbers, one per family, large enough to read from ten
// metres, for a screen nobody is standing at.
//
// The button names the shape you are *going* to, because a button that names where you are
// is a label rather than a control.
const WALL_MODES = ['walk', 'all', 'brief'];
const MODE_NAMES = { walk: 'One at a time', all: 'One page', brief: 'Overview' };
const nextMode = mode => WALL_MODES[(WALL_MODES.indexOf(mode) + 1) % WALL_MODES.length];

function paintMode() {
  document.body.classList.toggle('tv-all', state.wallMode === 'all');
  document.body.classList.toggle('tv-brief', state.wallMode === 'brief');
  $('#tv-mode').textContent = MODE_NAMES[nextMode(state.wallMode)];
  // Only the walk has anywhere to step. The collage and the overview are each one screen.
  const walking = state.wallMode === 'walk';
  $('#tv-next').classList.toggle('hide', !walking);
  $('#tv-prev').classList.toggle('hide', !walking);
  $('#tv-play').classList.toggle('hide', !walking);
}

// Rotation, off until somebody asks for it.
//
// The walk had a timer once and it was removed for a good reason: a screen that moves while
// somebody is mid-sentence about what was on it makes a meeting wait for the page to come
// back round. That reason holds for the meeting and not for the corridor, where there is
// nobody to press anything and a screen that never changes is a poster. So the timer is
// still not the default — it is a button, it lives only on the walk, which is the only
// shape with anywhere to go, and pause stops it dead.
const ROTATE_SECONDS = 18;
let rotateTimer = null;
function rotate(on) {
  clearInterval(rotateTimer);
  rotateTimer = null;
  state.rotating = on;
  if (on) rotateTimer = setInterval(() => step(1), ROTATE_SECONDS * 1000);
  $('#tv-play').textContent = on ? '\u23f8' : '\u25b6';
  $('#tv-play').setAttribute('aria-label', on ? 'Pause rotation' : 'Rotate every 18 seconds');
}

$('#tv-btn').addEventListener('click', () => {
  document.body.classList.add('tv');
  state.wallStep = 0;
  paintMode();
  render();
});
$('#tv-exit').addEventListener('click', () => {
  rotate(false);
  document.body.classList.remove('tv');
  render();
});
$('#tv-next').addEventListener('click', () => step(1));
$('#tv-prev').addEventListener('click', () => step(-1));
$('#tv-play').addEventListener('click', () => rotate(!state.rotating));
$('#tv-mode').addEventListener('click', () => {
  state.wallMode = nextMode(state.wallMode);
  if (state.wallMode !== 'walk') rotate(false);
  state.wallStep = 0;
  paintMode();
  renderWall();
  fitCards();
});

document.addEventListener('keydown', event => {
  if (!document.body.classList.contains('tv')) return;
  if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'PageDown') { event.preventDefault(); step(1); }
  if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); step(-1); }
  if (event.key === 'Escape') { document.body.classList.remove('tv'); render(); }
});

addEventListener('maxmetrics:connection', event => {
  document.body.dataset.connection = event.detail.state;
});

// Configure's Data pane links here rather than carrying a second copy of the importer,
// because importing writes into the morning being looked at and Configure has no morning.
// The action runs once the day is loaded and the query is cleared, so a refresh does not
// re-open the sheet.
function runRequestedAction() {
  const action = new URLSearchParams(location.search).get('do');
  if (!action) return;
  history.replaceState(null, '', location.pathname);
  if (action === 'import') {
    if (!state.canEdit) return toast('Your account cannot change this plant.');
    drawImport();
    $('#import-sheet').showModal();
  }
  if (action === 'export') exportMorning();
  if (action === 'print') window.print();
}

// ── Start ───────────────────────────────────────────────────────────────────────

const [profile, grants] = await Promise.all([myProfile(), myLocations()]);
if (!profile) { location.replace('../index.html'); }

state.me = profile;
// Light, always. The theme was a button in the utility bar and a column on the profile;
// a dashboard that half the plant reads dark and half reads light is two dashboards, and
// the one on the wall has to be the one on the desk.
document.documentElement.dataset.theme = 'light';
if (profile.rail_collapsed) {
  document.documentElement.dataset.rail = 'mini';
  $('#rail-btn').querySelector('path').setAttribute('d', 'M9 5 L16 12 L9 19');
}

state.locations = (grants || []).map(g => ({
  id: g.location_id, name: g.locations?.name || g.location_id,
  sort: g.locations?.sort_order ?? 0, canEdit: g.can_edit,
})).sort((a, b) => a.sort - b.sort);

if (!state.locations.length) {
  // Nothing to choose a plant from, no day to load, no sections to draw. Leaving the
  // chrome on screen would surround the explanation with an empty menu, an empty
  // location list and a blank date — which reads as a broken page rather than as an
  // account waiting on access.
  document.body.classList.add('no-access');
  $('#content').innerHTML = `<div class="state">
    <div class="state__inner">
      <h1 class="state__title">Waiting on access</h1>
      <p class="state__body">Your account is signed in, but it has not been assigned to a
      plant yet, so there is nothing to show. A MaxMetrics administrator can add you.</p>
      <p class="state__who">Signed in as ${esc(state.me.full_name || session.user.email)}</p>
      <button class="btn" id="state-signout">Sign out</button>
    </div></div>`;
  $('#state-signout').addEventListener('click', async () => {
    await signOut();
    location.replace('../index.html');
  });
} else {
  $('#loc').innerHTML = state.locations.map(l =>
    `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('');
  await open(state.locations[0].id, state.date);
}

// ── Import ──────────────────────────────────────────────────────────────────────
//
// The plant collects its numbers in spreadsheets kept in several places, and someone
// retypes them into the dashboard every morning. This reads them instead — but it reads
// them into a preview, not into the day. Nothing is written until a person has looked at
// what the files say and pressed the button, because an importer that writes on drop is
// one nobody can safely try.
//
// What it does write, it writes through `persist`, the same path a typed field takes. So
// an imported figure gets the same one-column update, the same attribution in the edit
// trail, and the same broadcast to the other two people working the morning.

const importState = { reading: false, preview: null, error: null };

function importPanel() {
  const p = importState.preview;
  if (importState.reading) return `<p class="drop__wait">Reading the files…</p>`;

  const drop = `<div class="drop" id="drop">
    <p class="drop__lead">Drop this morning\'s workbooks, or a year of exports</p>
    <p class="drop__note">DOR_V9.xlsx and OTDOTIF.xlsx for the open morning, or any number of
      <b>.json</b> files from the old dashboard for their own dates. Whole folders are
      accepted, and folders inside them. Files are read in this browser and nothing leaves
      it until you accept.</p>
    <div class="drop__pick">
      <label class="btn btn--primary">Choose files
        <input type="file" id="drop-input" multiple accept=".xlsx,.json" hidden></label>
      <label class="btn">Choose a folder
        <input type="file" id="drop-dir" webkitdirectory directory multiple hidden></label>
    </div>
  </div>`;

  if (importState.error) {
    return drop + `<p class="drop__bad">${esc(importState.error)}</p>`;
  }
  if (!p) return drop;

  // What arrived, what it will fill, and what it cannot.
  //
  // This panel was the weakest thing on the product and it failed in the way that is hardest
  // to spot: it was correct and useless. Drop a DOR on a Tuesday whose Monday shifts have
  // not been keyed yet and the screen said "0 shifts across 0 departments", greyed out
  // Apply, and left somebody to conclude the importer does not work. The file had thirteen
  // years of production in it.
  //
  // Three questions, answered in order: what are these files, what does this morning get
  // from them, and what else is in them that MaxMetrics has never been told.
  const SECTION_FIELDS = {
    Safety: ['injury_last', 'injury_record', 'near_miss_last', 'near_miss_record'],
    Quality: ['shortages', 'coq', 'coq_target', 'coq_ytd', 'coq_ytd_target', 'ncr_ytd',
              'ncr_today', 'ncr_mtd', 'complaints_internal', 'complaints_external'],
    Shipping: ['jobs_shipped', 'jobs_on_time', 'cartons', 'late', 'shorts',
               'mtd_otif', 'ytd_otif', 'mtd_otd', 'ytd_otd'],
    Financials: ['fin_actual_mtd', 'fin_actual_ytd'],
    Notes: ['maintenance_note', 'staffing_note'],
  };
  const KIND_NAMES = { production: 'DOR', quality: 'KPI workbook', shipping: 'OTIF sheet',
                       history: 'old dashboard export', unknown: 'not recognised',
                       unreadable: 'could not be opened' };

  // Which file each section's readings come from, so a section with nothing coming can say
  // whether that is because no file carries it or because the files that do are not here.
  const fromFile = () => {
    const seen = new Map();
    const note = (field, kind) => { if (!seen.has(field)) seen.set(field, kind); };
    for (const day of p.json?.days || []) {
      const kind = p.sources.find(x => x.kind === 'quality') ? 'quality' : 'history';
      for (const field of Object.keys(day.metrics)) note(field, kind);
    }
    // The OTIF sheet counts as covering Shipping whether or not it happens to carry a row
    // for the day this morning reports. Saying "not in these files" about a file that is
    // sitting right there, named on the line above, is the panel arguing with itself.
    if (p.sources.some(x => x.kind === 'shipping')) {
      for (const field of ['jobs_shipped', 'jobs_on_time', 'late', 'shorts']) note(field, 'shipping');
    }
    const out = Object.entries(SECTION_FIELDS).map(([name, fields]) => {
      const hits = fields.filter(field => seen.has(field));
      return { name, got: hits.length, of: fields.length,
               kind: hits.length ? seen.get(hits[0]) : null };
    });
    const depts = p.departments.length || (p.catchup || []).length
      || (p.json?.days || []).some(day => Object.keys(day.departments).length);
    out.splice(2, 0, { name: 'Production', got: depts ? 1 : 0, of: 1,
                       kind: depts ? 'production' : null });
    return out;
  };
  const cover = fromFile();

  // One line per file: what it was taken for, and what is in it. A file the reader did not
  // recognise says so here rather than in a note at the bottom nobody scrolls to.
  const filePanel = `<div class="sheet__sub">What arrived</div>
    <table class="tbl tbl--tight"><tbody>${p.sources.map(source => `<tr>
      <td class="dept">${esc(source.file)}</td>
      <td><span class="pill pill--${
        source.kind === 'unknown' || source.kind === 'unreadable' ? 'stop' : 'info'}">${
        esc(KIND_NAMES[source.kind] || source.kind)}</span></td>
      <td class="num">${source.kind === 'unreadable' ? '\u2014'
        : source.kind === 'unknown' ? `${source.rows} sheets`
        : `${num(source.rows)} ${source.kind === 'history' ? 'mornings' : 'rows'}`}</td>
      <td class="soft">${
        source.kind === 'production' && p.production
          ? `${shortDate(p.production.from)} \u2013 ${shortDate(p.production.to)}`
        : source.kind === 'shipping' && p.delivery
          ? `${shortDate(p.delivery.from)} \u2013 ${shortDate(p.delivery.to)}`
        : source.kind === 'quality' ? 'monthly'
        : source.kind === 'unknown' ? esc((source.sheets || []).join(', '))
        : source.kind === 'unreadable' ? esc(source.why || '')
        : ''}</td></tr>`).join('')}
    </tbody></table>
    <div class="cover">${cover.map(row =>
      `<span class="cover__s cover__s--${row.got ? 'on' : 'off'}">${esc(row.name)}
        <b>${row.got ? esc(KIND_NAMES[row.kind] || 'yes') : 'not in these files'}</b></span>`).join('')}</div>
    <p class="drop__note">A section marked <b>not in these files</b> is not a fault \u2014 a
      quality workbook does not carry safety, and never did. It is a reminder of what still
      has to come from somewhere else before this morning is complete.</p>`;

  // ── This morning ──
  const covering = p.covering.length === 1
    ? shortDate(p.covering[0])
    : `${shortDate(p.covering[0])} \u2013 ${shortDate(p.covering[p.covering.length - 1])}`;

  const rows = p.departments.map(d => {
    const config = state.config.find(c => c.key === d.dept_key);
    const current = dept(d.dept_key);
    const changed = Number(current.qty) !== d.qty || Number(current.hours) !== d.hours;
    return `<tr>
      <td class="dept">${esc(config?.name || d.dept_key)}</td>
      <td class="num big">${num(d.qty)}</td>
      <td class="num">${d.hours}<em> h</em></td>
      <td class="num big">${d.rate ? num(Math.round(d.rate)) : '\u2014'}</td>
      <td class="num soft">${d.uptime == null ? '\u2014' : (d.uptime * 100).toFixed(1) + '%'}</td>
      <td class="num soft">${d.make_ready == null ? '\u2014' : d.make_ready.toFixed(2) + ' h'}</td>
      <td>${esc(d.machines.join(', '))} \u00b7 ${d.shifts} shift${d.shifts === 1 ? '' : 's'}</td>
      <td>${changed ? '<span class="pill pill--warn">changes</span>'
                    : '<span class="pill pill--ok">same</span>'}</td></tr>`;
  }).join('');

  // Why this morning got nothing, said in dates rather than in silence. Both reasons are
  // ordinary and neither means the importer is broken: either the file stops before the day
  // this morning reports, or the plant did not run that day.
  const stops = [p.production && ['production', p.production.to],
                 p.delivery && ['shipping', p.delivery.to]].filter(Boolean);
  const gap = !p.departments.length && !p.shipping && stops.length ? `
    <p class="drop__bad">This morning reports <b>${esc(covering)}</b>, and ${
      stops.map(([what, when]) => `the ${what} in these files stops at <b>${
        esc(shortDate(when))}</b>`).join(', ')}. Nothing here belongs to the open morning
      \u2014 either ${esc(covering)} has not been keyed into the files yet, or the plant did
      not run. Everything the files <em>do</em> cover is below.</p>` : '';

  const ship = p.shipping ? `<table class="tbl"><thead><tr>
      <th>Jobs shipped</th><th class="num">Late</th><th class="num">Short</th>
      <th class="num">OTD</th><th class="num">OTIF</th></tr></thead>
    <tbody><tr><td class="big">${p.shipping.jobs_shipped}</td>
      <td class="num">${p.shipping.late}</td><td class="num">${p.shipping.shorts}</td>
      <td class="num">${p.shipping.otd.toFixed(1)}%</td>
      <td class="num">${p.shipping.otif.toFixed(2)}%</td></tr></tbody></table>`
    : `<p class="drop__note">No shipping row for ${shortDate(p.span.to)}.</p>`;

  const morningPanel = !p.production && !p.delivery ? '' : `
    <div class="sheet__sub">This morning \u00b7 ${esc(shortDate(state.date))}</div>
    ${gap}
    <p class="drop__note">A morning reports the production since the last one. On Tuesday to
      Friday that is yesterday; on Monday it is Friday, Saturday and Sunday together.</p>
    ${p.departments.length ? `<table class="tbl"><thead><tr><th>Department</th>
      <th class="num">Output</th><th class="num">Crew hrs</th><th class="num">Per hr</th>
      <th class="num soft">Uptime</th><th class="num soft">Make-ready</th>
      <th>From</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <p class="drop__note">Uptime is (make-ready + run) \u00f7 crewed and make-ready is
        MR hours \u00f7 number of make-readies, which is what the DOR\u2019s own Formulas tab
        says. Both are imported.</p>` : ''}
    ${p.shipping || p.departments.length ? `<div class="sheet__sub">Shipping</div>${ship}` : ''}`;

  // ── Everything else in the file ──
  const catchup = p.catchup || [];
  const catchupPanel = !catchup.length ? '' : `
    <div class="sheet__sub">Mornings this plant has never recorded</div>
    <p class="drop__note">These files also cover <b>${catchup.length}</b>
      morning${catchup.length === 1 ? '' : 's'} between
      <b>${esc(shortDate(catchup[0].date))}</b> and
      <b>${esc(shortDate(catchup[catchup.length - 1].date))}</b> that MaxMetrics has no
      reading for. Writing them fills the seven-day lines, last week\u2019s productivity and
      the year behind every card. Nothing already entered is replaced, on any of them.</p>
    <label class="tog"><input type="checkbox" id="import-catchup" checked>
      <span>Write these ${catchup.length} morning${catchup.length === 1 ? '' : 's'} as well</span></label>`;

  const jsonPanel = !p.json?.days.length ? '' : `
    <div class="sheet__sub">Dated readings</div>
    <p class="drop__note">${p.json.days.length} ${p.json.days.length === 1 ? 'morning' : 'mornings'},
      ${shortDate(p.json.days[0].date)} to ${shortDate(p.json.days[p.json.days.length - 1].date)}.
      Only mornings this plant has no reading for are written; anything already entered stays.</p>
    <table class="tbl"><thead><tr><th>Date</th><th class="num">Readings</th>
      <th class="num">Departments</th></tr></thead><tbody>${
      p.json.days.slice(0, 12).map(d => `<tr><td>${shortDate(d.date)}</td>
        <td class="num">${Object.keys(d.metrics).length}</td>
        <td class="num">${Object.keys(d.departments).length}</td></tr>`).join('')}
      ${p.json.days.length > 12 ? `<tr><td colspan="3" class="soft">\u2026and ${p.json.days.length - 12} more</td></tr>` : ''}
    </tbody></table>
    ${p.json.unknown.length ? `<div class="keys"><div>
      <div class="keys__l keys__l--bad">Not recognised \u2014 tell me these and I will add them</div>
      <div class="keys__v">${p.json.unknown.map(k => `<code>${esc(k)}</code>`).join(' ')}</div>
    </div></div>` : ''}`;

  const willWrite = p.departments.length + (p.shipping ? 1 : 0)
    + (p.json?.days.length || 0) + catchup.length;

  return `
    ${filePanel}
    ${morningPanel}
    ${catchupPanel}
    ${jsonPanel}
    ${p.unknownNames.length ? `<div class="sheet__sub">Names not on the operator list</div>
      <p class="drop__note">Imported as typed. Nothing is dropped and nothing is invented \u2014
      add them to the operator list if they belong there.</p>
      <p class="drop__names">${p.unknownNames.slice(0, 12).map(n =>
        `<span class="pill pill--info">${esc(n.name)} \u00b7 ${n.count}</span>`).join(' ')}</p>` : ''}
    ${p.notes.length ? `<div class="sheet__sub">Notes</div>
      <ul class="drop__notes">${p.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    <div class="sheet__foot">
      <span class="drop__note" id="import-say"></span>
      <button class="btn" id="import-again">Choose different files</button>
      <button class="btn btn--go" id="import-apply"${willWrite ? '' : ' disabled'}>${
        willWrite ? 'Write what these files say' : 'Nothing to write'}</button>
    </div>`;
}

// A folder dropped on the zone arrives as a directory entry rather than as its files, so
// it is walked. Depth is not limited on purpose: the plant keeps a year of exports in a
// folder per month, and asking somebody to open twelve of them is asking them not to.
async function filesUnder(entries, out = []) {
  for (const entry of entries) {
    if (entry.isFile) {
      if (!/\.(xlsx|json)$/i.test(entry.name)) continue;
      out.push(await new Promise((resolve, reject) => entry.file(resolve, reject)));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      for (;;) {
        const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        await filesUnder(batch, out);
      }
    }
  }
  return out;
}

async function readDropped(files) {
  if (!files?.length) return;
  importState.reading = true; importState.error = null;
  drawImport();
  try {
    const { readFiles } = await import('../import.js');
    const [operators, reported] = await Promise.all([
      loadOperators(state.location).catch(() => []),
      loadReportedDates(state.location, addDays(state.date, -21), state.date).catch(() => []),
    ]);
    importState.preview = await readFiles([...files], {
      date: state.date, reported: reported.filter(d => d < state.date), operators: operators || [],
    });
  } catch (error) {
    importState.error = error.message || 'Those files could not be read.';
    importState.preview = null;
  } finally {
    importState.reading = false;
    drawImport();
  }
}

// Applying is a batch of ordinary field writes. Uptime, make-ready and the make-ready
// count only overwrite when the files actually carry them: a blank in the workbook means
// nothing was recorded, and writing null over a figure somebody typed would be the import
// deciding it knows better.
// Draw the sheet's body and re-bind it. The panel is rebuilt from scratch on every state
// change, so the listeners have to be attached to whatever it just produced.
//
// This function went missing in a refactor and took Import and Export with it: every
// caller threw on the first line, and a throw inside a click handler is silent. That is the
// argument for the conformance check growing a rule about calling something that is never
// declared — a page that half-loads tells nobody.
function drawImport() {
  $('#import-body').innerHTML = importPanel();
  const zone = $('#drop');
  if (zone) {
    $('#drop-input')?.addEventListener('change', e => readDropped(e.target.files));
    // A folder picker hands over everything under it, including whatever else lives there,
    // so the ones this can read are kept and the rest are ignored rather than reported as
    // failures — nobody wants a list of every .png in a year of folders.
    $('#drop-dir')?.addEventListener('change', e => readDropped(
      [...e.target.files].filter(f => /\.(xlsx|json)$/i.test(f.name))));
    for (const type of ['dragenter', 'dragover']) {
      zone.addEventListener(type, e => { e.preventDefault(); zone.classList.add('drop--over'); });
    }
    for (const type of ['dragleave', 'drop']) {
      zone.addEventListener(type, () => zone.classList.remove('drop--over'));
    }
    zone.addEventListener('drop', async e => {
      e.preventDefault();
      const items = [...(e.dataTransfer?.items || [])]
        .map(i => i.webkitGetAsEntry?.()).filter(Boolean);
      readDropped(items.length ? await filesUnder(items) : e.dataTransfer?.files);
    });
  }
  $('#import-again')?.addEventListener('click', () => { importState.preview = null; drawImport(); });
  $('#import-apply')?.addEventListener('click', applyImport);
}

// `quiet` is the pull's way in. It is the same write, without the sheet to close, without
// the "choose different files" affordance, and without a toast that talks about a preview
// nobody looked at.
async function applyImport({ quiet = false } = {}) {
  const p = importState.preview;
  if (!p) return;
  const writes = [];
  for (const d of p.departments) {
    writes.push([`dept:${d.dept_key}:qty`, d.qty], [`dept:${d.dept_key}:hours`, d.hours]);
    // Uptime and make-ready come from the DOR's own Formulas tab now, so they are written
    // with the rest rather than left to be typed.
    if (d.uptime != null) writes.push([`dept:${d.dept_key}:uptime`, Number(d.uptime.toFixed(4))]);
    if (d.make_ready != null) writes.push([`dept:${d.dept_key}:make_ready`, Number(d.make_ready.toFixed(3))]);
    // And the same weekday a week ago, which is the whole of the productivity table.
    if (d.pw_qty != null) writes.push([`dept:${d.dept_key}:pw_qty`, d.pw_qty]);
    if (d.pw_hours != null) writes.push([`dept:${d.dept_key}:pw_hours`, d.pw_hours]);
  }
  if (p.shipping) {
    writes.push(['jobs_shipped', p.shipping.jobs_shipped], ['jobs_on_time', p.shipping.jobs_on_time],
                ['late', p.shipping.late], ['shorts', p.shipping.shorts]);
  }
  // The open morning is written over, not coalesced.
  //
  // `import_morning` never replaces a value, which is right for a year of history and wrong
  // for today: the month-to-date NCR count is carried forward from yesterday when the day is
  // opened, so a coalesced import found something already sitting there and left it alone.
  // The card then read yesterday's figure, and the plant quite reasonably said the numbers
  // were not pulling. For the day being pulled, the file is the fresher source and wins.
  const history = [];
  for (const day of p.json?.days || []) {
    if (day.date === state.date) {
      for (const [name, value] of Object.entries(day.metrics)) writes.push([name, value]);
    } else {
      history.push({ date: day.date, metrics: day.metrics, departments: day.departments });
    }
  }
  for (const [name, value] of writes) {
    applyLocally(name, value);
    await persist(name, value);
  }

  // Which files this morning has actually seen, and when.
  //
  // A figure that came out of the DOR six days ago and a figure typed this morning look
  // identical on a card, and that is how a stale number sits on a screen for a week without
  // anybody noticing. Enter says so along the top; this is what it reads.
  const stamps = { ...(state.metrics?.source_seen || {}) };
  const now = new Date().toISOString();
  const kinds = new Set((p.sources || []).map(source => source.kind));
  if (kinds.has('production')) stamps.dor = now;
  if (kinds.has('shipping')) stamps.otif = now;
  if (kinds.has('quality')) stamps.kpi = now;
  if (Object.keys(stamps).length) {
    applyLocally('source_seen', stamps);
    await persist('source_seen', stamps);
  }

  // History goes to the dates it is dated, not to the open morning, and it never overwrites
  // a reading somebody has already entered. A year of exports arriving on top of this week's
  // numbers would be the opposite of a favour.
  //
  // Two sources feed it. A JSON export carries its own dates. A workbook carries shifts, and
  // every day of shifts belongs to the morning that reports it — which is what turns a DOR
  // from a one-day file into the plant's whole history. Both go through the same door.
  const say = message => { const box = $('#import-say'); if (box) box.textContent = message; };
  const wanted = [...history];
  if (p.catchup?.length && (quiet || $('#import-catchup')?.checked !== false)) {
    for (const day of p.catchup) {
      const departments = {};
      for (const d of day.departments) {
        departments[d.dept_key] = {
          qty: d.qty, hours: d.hours,
          uptime: d.uptime == null ? null : Number(d.uptime.toFixed(4)),
          make_ready: d.make_ready == null ? null : Number(d.make_ready.toFixed(3)),
          mr_count: d.mr_count, pw_qty: d.pw_qty, pw_hours: d.pw_hours,
        };
      }
      const metrics = day.shipping ? {
        jobs_shipped: day.shipping.jobs_shipped, jobs_on_time: day.shipping.jobs_on_time,
        late: day.shipping.late, shorts: day.shipping.shorts,
      } : {};
      wanted.push({ date: day.date, metrics, departments });
    }
  }

  let mornings = 0;
  for (const day of wanted) {
    try {
      await importHistory(state.location, day.date, day.metrics, day.departments);
      mornings += 1;
      if (mornings % 10 === 0) say(`${mornings} of ${wanted.length} mornings written…`);
    } catch (error) {
      toast(`${shortDate(day.date)}: ${error.message}`);
      break;
    }
  }

  importState.preview = null;
  if (!quiet) $('#import-sheet').close();
  if (mornings) {
    const [day, history, months] = await Promise.all([
      loadDay(state.location, state.date),
      loadHistory(state.location, addDays(state.date, -6), state.date),
      loadYearCounts(state.location, dateOf(state.date).getFullYear()),
    ]);
    Object.assign(state, day, { history, year: months || [] });
  }
  render();
  if (!quiet) {
    toast([writes.length ? `${writes.length} readings imported` : '',
           mornings ? `${mornings} morning${mornings === 1 ? '' : 's'} of history written` : '']
      .filter(Boolean).join(' · ') + '.');
  }
}

// Pull data.
//
// The production coordinator keys the MIS timesheets into the DOR between half past seven
// and eight, and then wants MaxMetrics to have them. That was three clicks into a
// configuration screen she has no other reason to open, so it is one button on the bar she
// is already looking at — and it opens the file chooser rather than a panel about opening
// the file chooser.
$('#pull-btn')?.addEventListener('click', pullNow);

// The whole of it, in one press.
//
// The first version of this button opened a file chooser, which is not what pulling data
// means: the coordinator has just finished keying the timesheets into the DOR and wants the
// dashboard to go and get it. So the server fetches the plant's linked files — the browser
// cannot, because SharePoint sends no CORS headers — and hands back short-lived links; the
// page reads them with the same parser the drag-and-drop importer uses and writes the
// morning without asking anything.
//
// No preview. A preview is right for a file somebody chose and wrong for a file the plant
// has already told MaxMetrics to trust: what it needs to say is what changed, afterwards,
// and it does that in the toast and on the source strip.
async function pullNow() {
  if (!state.canEdit) return toast('Your account cannot change this plant.');
  const button = $('#pull-btn');
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = 'Pulling…';
  try {
    const pulled = await pullSources(state.location, state.date);
    const got = (pulled.sources || []).filter(s => s.ok && s.url);
    const failed = (pulled.sources || []).filter(s => !s.ok);
    if (!got.length) {
      toast(failed[0] ? `${failed[0].name}: ${failed[0].note}` : 'Nothing could be fetched.');
      return;
    }
    button.textContent = 'Reading…';
    const files = await Promise.all(got.map(async source => {
      const blob = await (await fetch(source.url)).blob();
      return new File([blob], `${source.kind}.xlsx`);
    }));
    const { readFiles } = await import('../import.js');
    const [operators, reported] = await Promise.all([
      loadOperators(state.location).catch(() => []),
      loadReportedDates(state.location, addDays(state.date, -400), state.date).catch(() => []),
    ]);
    importState.preview = await readFiles(files, {
      date: state.date, reported: reported.filter(d => d < state.date), operators: operators || [],
    });
    button.textContent = 'Writing…';
    await applyImport({ quiet: true });
    const said = [
      failed.length ? `${failed.length} source${failed.length === 1 ? '' : 's'} failed` : '',
      `pulled ${got.map(s => s.name).join(', ')}`,
    ].filter(Boolean).join(' · ');
    toast(said);
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Pull data';
  }
}

$('#import-btn')?.addEventListener('click', () => {
  if (!state.canEdit) return toast('Your account cannot change this plant.');
  drawImport();
  $('#import-sheet').showModal();
});

// ── Export and print ────────────────────────────────────────────────────────────

// A morning leaves the building in two ways: as a row somebody opens in Excel, and as a
// sheet somebody carries into a meeting. Both take what is on screen — the same numbers
// the room just read — rather than re-querying, so an export can never disagree with the
// dashboard it came from.

const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const toCsv = rows => rows.map(r => r.map(csvCell).join(',')).join('\r\n');

function downloadFile(name, text, type = 'text/csv;charset=utf-8') {
  const link = document.createElement('a');
  // The BOM is what makes Excel open a UTF-8 CSV as UTF-8 rather than as the system code
  // page — the difference between "Mississauga" and mojibake.
  link.href = URL.createObjectURL(new Blob([type.startsWith('text/csv') ? '﻿' : '', text], { type }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportMorning() {
  const plant = state.locations.find(l => l.id === state.location)?.name || state.location;
  const rows = [['MaxMetrics', plant, state.date], []];

  rows.push(['Safety & Quality', 'Value', 'Target / record']);
  const injury = metric('injury_last'), miss = metric('near_miss_last');
  rows.push(['Days since last injury', injury ? daysBetween(injury, state.date) : '',
             `record ${metric('injury_record') || ''} (last ${injury || ''})`]);
  rows.push(['Days since near-miss', miss ? daysBetween(miss, state.date) : '',
             `record ${metric('near_miss_record') || ''} (last ${miss || ''})`]);
  rows.push(['Shortage count', metric('shortages') ?? '', 'target 0']);
  rows.push(['COQ month', metric('coq') ?? '', `target ${metric('coq_target') ?? 0.85}`]);
  rows.push(['COQ year to date', metric('coq_ytd') ?? '', '']);
  rows.push([]);

  rows.push(['Production', 'Output', 'Crew hrs', 'Per hr', 'Target / hr', 'Uptime', 'Make-ready']);
  for (const c of configured()) {
    const row = dept(c.key), rate = rateOf(row);
    rows.push([c.name, row.qty ?? '', row.hours ?? '', rate ? Math.round(rate) : '',
               Math.round(Number(c.target) || 0),
               row.uptime == null ? '' : `${(Number(row.uptime) * 100).toFixed(1)}%`,
               row.make_ready == null ? '' : Number(row.make_ready).toFixed(2)]);
  }
  rows.push([]);

  rows.push(['Shipping', 'Value']);
  for (const [label, name] of [['Jobs shipped', 'jobs_shipped'], ['Late', 'late'],
                               ['Short', 'shorts'], ['OTD %', 'otd'], ['OTIF %', 'otif']]) {
    rows.push([label, metric(name) ?? '']);
  }
  rows.push([]);

  rows.push(['Financials', 'Actual', 'Budget']);
  rows.push(['Month to date', metric('fin_actual_mtd') ?? '', budgetFor(dateOf(state.date).getMonth())]);
  rows.push(['Year to date', metric('fin_actual_ytd') ?? '',
             state.budgets.reduce((sum, b) => sum + Number(b.amount || 0), 0)]);

  downloadFile(`maxmetrics-${state.location}-${state.date}.csv`, toCsv(rows));
  toast('Exported.');
}

$('#export-btn')?.addEventListener('click', exportMorning);
// Print and Save-as-PDF are the same browser dialogue, so one button serves both — the
// print stylesheet drops the rail, the top bar and every control, and lays the sections
// out down the page.
$('#print-btn')?.addEventListener('click', () => window.print());

// Last line on purpose.
//
// Configure's Data pane arrives here as `?do=import`, and the action needs two things that
// are declared in different halves of this file: a loaded morning, which the Start block
// above awaits, and the import sheet's state, which is a `const` below it. Calling it from
// Start satisfied the first and broke the second — the module body pauses at that `await`,
// so `importState` had not been created yet and every arrival threw a dead-zone error
// before the sheet could open. At the foot of the file both are true.
runRequestedAction();
