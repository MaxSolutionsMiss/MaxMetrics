// The daily dashboard.
//
// Three people work a morning at once, so nothing here claims the day. "Enter data" shows
// the input fields and is a preference belonging to the person who pressed it; two people
// can have it on together. Each field saves itself as it is typed, and every save is a
// write to one column, so two people filling in two readings never overwrite each other.

import {
  currentSession, signOut, myProfile, myLocations, savePreference, savePlant,
  openDay, loadDay, loadHistory, loadWeeks, loadBudgets, loadYearCounts, loadMachines,
  tidyText,
  loadUpcoming, addMaintenance, saveMaintenance, removeMaintenance,
  saveField, saveDepartment, saveReview,
  saveBudget, saveLabour, publish, recordEdit, joinDay, loadOperators, loadReportedDates,
  pullSources, resetMorning,
  importHistory,
} from '../db.js';
import { assess, attention, settled, absent, counts, isComplete, verdicts } from '../assess.js';
import {
  esc, band, MONTHS, DAYS, dateOf, daysBetween, num, shortDate, money, trend,
  metricCard, listCard, noteCard, pairCard, footLine, drawReading, showsHeroNumber, iconFor,
  hideCards,
  spark, bullet, chip, cardTrack, readingOf, derivedShipping, otifTarget, otdTarget, cardOn,
  isNa, isMissing,
  varianceChip, varianceTone, variancePct, VERDICT, verdictMark,
  FROM_FILE, SOURCE_NAMES, sourceOf,
  volumeLabel, rateLabel, hoursLabel, CARD_CATALOGUE, WALK, morningToday,
} from '../readings.js';

const $ = selector => document.querySelector(selector);

const session = await currentSession();
if (!session) location.replace('../index.html');

const today = () => morningToday();

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
  machines: [], upcoming: [], jotEdit: null,
  history: { metrics: [], departments: [] }, weeks: [], year: [], findings: [],
  verdicts: {}, plant: null,
  team: [], live: null, wallStep: 0, wallMode: 'walk', zoom: null, rotating: false,
  // Whether a section screen is showing its cards or asking for its readings. One answer for
  // all of them, because the work it exists for is going down the rail filling each in.
  filling: false,
  // Which of the front-of-house departments the comment box is currently on.
  staffAt: null, attentionAt: null,
  // Set once, when the tidy function reports that this plant has no key configured. It is
  // not persisted: a plant that adds a key gets the buttons back on the next page load
  // rather than needing anything cleared.
  tidyOff: false,
  // Which screen the entry rail is on.
  fillAt: 'safety',
};

// ── Reading the loaded morning ──────────────────────────────────────────────────

const metric = field => readingOf(state.metrics, field);

// Jobs short today, from the one column that holds it.
//
// This number was on the morning twice. Quality drew "Shortage count" from `shortages`, a
// column nothing ever filled but a person; Shipping drew "Short" from `shorts`, which the
// OTD sheet has carried in column E all along and the pull has always written. Two cards,
// one fact, and only one of them arrived by itself — so the plant typed a figure into
// Quality every morning that was already sitting in Shipping, and on the mornings nobody
// typed, the two disagreed in public.
//
// One column now: `shorts`, the pulled one. `shortages` is read only as the fallback for the
// mornings that were typed before this, so no history changes and nothing that was entered
// by hand is lost.
const shortJobs = () => {
  const pulled = metric('shorts');
  return pulled == null || pulled === '' ? metric('shortages') : pulled;
};
const dept = key => state.departments.find(d => d.dept_key === key) || {};
const rateOf = row => Number(row?.hours) ? Number(row.qty) / Number(row.hours) : 0;
const configured = () => state.config.filter(c => c.on_metrics);

// ── The departments that do not make anything ───────────────────────────────────
//
// Front of house has no output, no hours and no rate, so its four are not departments in the
// sense the Departments screen means — a plant that added them there would get four
// production cards asking for sheets per hour. What they have is
// something to say, occasionally: a job held for a plate, a customer chasing, a die on
// order. One card, one comment at a time, and whoever is speaking picks which of the three
// they are. That is the whole of it, because that is the whole of what they asked for.
//
// They ride in `daily_review` alongside the production departments — same shape, a note per
// key per morning — under keys no plant can configure. Everywhere that walks the review
// rows has to know the difference, which is what `isSupport` is for: these are notes, never
// readings, so nothing counts them as missing and nothing flags them.
const SUPPORT = [
  // In the order an order meets them. A job is taken, priced, made ready, tooled and
  // supplied before a press ever turns, and reading them in that order is how somebody
  // following a late job down the list finds where it stopped.
  ['customer_service', 'Customer service'],
  ['estimating', 'Estimating'],
  ['prepress', 'Prepress'],
  ['die_shop', 'Die shop'],
  // Supply chain belongs here rather than among the departments for the same reason the
  // other three do: it has no machine, no output and no hours, and what it has to say about
  // a morning is a sentence. A late board delivery is the front of the building telling the
  // floor what its day is going to look like.
  ['supply_chain', 'Supply chain'],
];
// Everyone who can put something on the board for the day ahead.
//
// Not the department list: half of these have no machine and never appear on a production
// card — estimating, scheduling, the CSRs. That is the point of the card. The morning's other
// twenty readings are what happened; this is the one place the building says what is about
// to matter, and the people who know that are spread across it.
//
// Kept as a list here rather than as rows in Configure because it is the same ten at every
// plant Max Solutions runs, and a screen for editing a list nobody edits is a screen.
const ATTENTION = [
  ['next_customer_service', 'Customer service'],
  ['next_estimating',       'Estimating'],
  ['next_scheduling',       'Scheduling'],
  ['next_supply_chain',     'Supply chain'],
  ['next_prepress',         'Prepress'],
  ['next_die_shop',         'Die shop'],
  ['next_printing',         'Printing'],
  ['next_diecutting',       'Die cutting'],
  ['next_finishing',        'Finishing'],
  ['next_packsize',         'PackSize'],
  ['next_shipping',         'Shipping'],
];
const ATTENTION_KEYS = new Set(ATTENTION.map(([key]) => key));
const isAttention = key => ATTENTION_KEYS.has(key);
const attentionRows = () => (state.review || []).filter(r => isAttention(r.dept_key));

const SUPPORT_KEYS = new Set(SUPPORT.map(([key]) => key));
const isSupport = key => SUPPORT_KEYS.has(key);
const supportRows = () => (state.review || []).filter(r => isSupport(r.dept_key));
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
  // A pin. The one section that is about what is coming rather than what happened.
  attention:   'M9 3.5h6l-1 5 3.5 3.5H6.5L10 8.5zM12 12.5V21',
  // A calendar, because the section is a date range rather than a subject.
  week:        'M4.6 6.6h14.8v12.8H4.6zM4.6 10.4h14.8M8.6 4.2v3.4M15.4 4.2v3.4',
  // A speech bubble. The only section on the product that is nothing but what people said.
  support:     'M4 5.5h16v10H9.5L5.5 19v-3.5H4z',
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
const ORDER = WALK.map(([key]) => key);
// Labour and maintenance are one screen for most plants and two for some, so it is the
// plant's own answer rather than a rule. Together is the default.
// Maintenance and Labour are separate screens unless a plant says otherwise. They were
// merged by default, which put a booking list and a shift count under one heading and
// made the tallest screen on the product out of two short ones. `merge_upkeep` is the
// plant's own answer and it is off until somebody turns it on.
// Last week is a Monday section. The rule is about the meeting rather than the data — the
// week that finished is equally finished on Thursday — so it is read off the calendar rather
// than stored, and `week_daily` is the plant's way of overruling it when the review slips or
// when a shutdown means everyone wants the week in front of them every morning.
//
// The day is the morning's own date, not the wall clock, so reopening last Monday to correct
// it shows the same screen the meeting saw.
const order = () => ORDER
  .filter(key => key !== 'maintenance' || !state.plant?.merge_upkeep);
const TITLES = {
  safety: 'Safety', quality: 'Quality', production: 'Production', shipping: 'Shipping',
  maintenance: 'Maintenance', labour: 'Labour & Overtime', financials: 'Financials',
  attention: 'Watch list', week: 'Last week',
  // Pre-production: customer service, prepress, the die shop and supply chain — everything
  // an order passes through before it reaches a press. "Front of house" named the counter
  // rather than the subject, and "Customer service" named one of the four for all of them.
  // Support is an entry screen rather than a dashboard section, so it never needed a title
  // here - until Save-and-next started naming the screen it was about to move to, and found
  // nothing. The button read "Next next" and the toast said "Saved. undefined next."
  support: 'Pre-production',
};
const NAV = { labour: 'Labour', line: 'Summary', fill: 'Enter',
              maintenance: 'Maintenance', attention: 'Watch list', week: 'Last week',
              support: 'Pre-production' };
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

// Which month a cost-of-quality figure is for, named.
//
// Cost of quality is never a reading about today and never a reading about this month. The
// claims, reruns, scrap and credits behind it are totted up after a month ends, so the
// figure on the card every morning of August is July's — closed, final, and not moving
// again until September. The card said "month to date", which told the room the opposite:
// that it was August's, running, and would still change. Two cards, a printed report and a
// trend line were all built on that reading of it.
//
// `coq_month` is the first of the month the figure covers, and it comes out of the workbook
// with the figure because the page cannot work it out. A plant whose accounts close late
// spends the first week of September still showing July, and no rule about "last month"
// survives that. Where it is absent — a morning carried forward from before the column
// existed — the card names no month rather than guessing at one, which would be the
// same mistake in a smaller font.
const coqMonth = () => {
  const said = String(metric('coq_month') ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(said)) return null;
  const year = Number(said.slice(0, 4)), month = Number(said.slice(5, 7)) - 1;
  if (month < 0 || month > 11) return null;
  return {
    // The year is said only when it is not the year on the screen: "COQ — July" in
    // August, "COQ — December 2025" in January, which is how the room says it out loud.
    label: year === Number(state.date.slice(0, 4)) ? MONTHS[month] : `${MONTHS[month]} ${year}`,
    // The day the month shut, for the line under the number.
    closed: `${new Date(Date.UTC(year, month + 1, 0)).getUTCDate()} ${MONTHS[month]}`,
  };
};

// One point per month, not one per morning.
//
// The seven-day line under this card drew the same number seven times, and the comment that
// defended it argued that "a month-to-date figure moves every time a claim lands" — a
// shape this reading cannot have, because the month it reports is shut. The line worth
// drawing is the year: each closed month once, in order. It is built from `coq_month` rather
// than from the date of the morning, so a month that took a fortnight to close still lands
// on its own month, and lands there once.
const coqSeries = field => {
  const seen = new Map();
  for (const row of state.year || []) {
    const value = row?.[field], month = row?.coq_month;
    if (value == null || value === '' || !month) continue;
    seen.set(String(month).slice(0, 7), Number(value));
  }
  return [...seen.keys()].sort().map(key => seen.get(key));
};

function coqCard(kind, label, valueField, targetField, lead = []) {
  const value = metric(valueField), target = Number(metric(targetField) || 0.85);
  const has = value != null && value !== '';
  const tone = has ? band.coq(Number(value), target) : '';
  const variance = has ? varianceChip(Number(value), target, { lowerIsBetter: true }) : null;
  // Two points are not a line, and one closed month repeated is what the old series drew.
  // Until three months have been read the card carries the bar against target and nothing
  // else, which is the whole of what is known.
  const series = coqSeries(valueField);
  return metricCard({
    chart: 'number', pkey: kind, label, tone,
    value: has ? Number(value).toFixed(2) : '\u2014', unit: '%', sub: 'of sales',
    percent: has ? Number(value) / (target * 1.6) * 100 : 0,
    markPercent: 100 / 1.6, markLabel: 'target',
    track: has ? cardTrack({
      chart: 'number', actual: Number(value), target, tone, lowerIsBetter: true,
      targetText: `Against \u2264 ${target.toFixed(2)}%`,
      series: series.length > 2 ? series : [],
    }) : '',
    heroEdit: { field: valueField, attrs: `type="number" step="0.01" value="${value ?? ''}"` },
    foot: footLine([
      ...lead,
      ['Target', `\u2264 ${target.toFixed(2)}%`,
        { field: targetField, attrs: `type="number" step="0.01" value="${target}"` }],
      ['Variance', variance],
    ]),
  });
}

// ── Who said it, and when ───────────────────────────────────────────────────────
//
// Every comment on this product was anonymous and undated. That is fine in the meeting,
// where the person is standing there, and useless everywhere else the note goes: the printed
// morning, the weekly summary, the card somebody opens in October to find out why the die
// shop lost a day in August. "Waiting on a plate" is a fact with no owner and no clock on it.
//
// So a line is stamped as it is added: initials, a short date, the words. `FC 28 Aug — die 4
// slow on nights`. It is written into the text of the note rather than into columns of its
// own, and that is a deliberate choice rather than a shortcut. These lines are read in eight
// places — three tables, a CSV export, a printed report, the weekly card, the old dashboard's
// JSON — and a note whose attribution lives in a second table is a note that loses it at
// every one of those doors. Stored in the line, it survives being copied into an email.
//
// Read back with `SIGNED`, so the page can draw the initials as a chip rather than as three
// letters at the front of a sentence. A line that does not match — everything written before
// today, and anything pasted in from elsewhere — is shown exactly as it always was.
const SIGNED = /^([A-Z][A-Z]?[A-Z]?) (\d{1,2} [A-Z][a-z]{2}) \u2014 (.+)$/;

// Two letters, from the profile if it has them and from the name if it does not.
//
// `profiles.initials` is set when an account is made and is editable, so it is the answer
// wherever it exists. Deriving from the name is the fallback for the accounts that predate
// it — "Andrew Orwood" gives AW the same way the People screen's avatars do, which is the
// point: the letters beside a comment are the letters on that person's badge.
const myInitials = () => {
  const set = String(state.me?.initials ?? '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
  if (set) return set;
  return String(state.me?.full_name ?? '').split(/[\s.@_-]+/).filter(Boolean).slice(0, 2)
    .map(word => word[0].toUpperCase()).join('');
};

// The day it was written, not the morning it is about.
//
// These are almost always the same day and the difference is the whole reason to record it:
// a line added to Tuesday's card on Friday is a line somebody remembered late, and the card
// should say so rather than quietly presenting it as having been said on Tuesday.
const signLine = text => {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  const who = myInitials();
  // Nobody's initials, or a line that already carries somebody's: left alone. Signing a
  // signed line twice is how "FC 28 Aug — AW 27 Aug — ..." happens.
  if (!clean || !who || SIGNED.test(clean)) return clean;
  return `${who} ${dayAt(new Date())} \u2014 ${clean}`;
};

// One line, drawn. The words are the words and the signature trails them.
//
// It used to lead: bold initials and a date in front of every sentence, so a column of six
// notes began with six pieces of book-keeping and the reader had to step over each one to
// reach what was said. The attribution is not the news — it is what you look for *after*
// reading something, when you want to know who to ask about it. So it goes where a
// signature goes, after the sentence, small and pale enough that the eye skips it until it
// is wanted.
//
// One element around both, because the line is drawn inside a flex row: text and signature
// as two flex items would set the signature beside a wrapped paragraph rather than after
// its last word.
const jotHtml = line => {
  const said = SIGNED.exec(String(line));
  const words = esc(said ? said[3] : String(line));
  if (!said) return `<span class="jot__t">${words}</span>`;
  return `<span class="jot__t">${words}<i class="sig" title="${
    esc(said[1])} on ${esc(said[2])}">${esc(said[1])} ${esc(said[2])}</i></span>`;
};

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
  if (lines.length === 1) return `<div class="rev__note">${jotHtml(lines[0])}</div>`;
  return `<ul class="rev__note rev__note--list">${
    lines.map(line => `<li>${jotHtml(line)}</li>`).join('')}</ul>`;
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

const mergedUpkeep = () => !!state.plant?.merge_upkeep;

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
      // As many as the room it is being drawn in can hold.
      //
      // Eight on a slide of its own and on the page, because the card is twice as wide and
      // has the height for them. Three on the one page, where the same card is one tile
      // among forty and eight bookings burst it — and where the reader is glancing at the
      // whole plant rather than reading the schedule. "and 5 more" is the honest thing to
      // say to somebody who is looking at forty cards at once.
      cap: onePage() ? 3 : 8,
      // Twice the width, and the bookings go back to one line each.
      //
      // A booking is six things — department, machine, hours, what for, when and what state —
      // and at one card's width they folded to three short lines apiece, so five bookings was
      // fifteen rows of boxes to read down and fill in. Six across is how the entry screen has
      // always drawn them and it is the shape the work has: one row is one booking, and the
      // column a box is in tells you what it is without a caption. The card was the only place
      // that could not have it, for want of the width.
      wide: true,
      edit: `${maintRows()}
        <button class="btn btn--ghost ez__add" id="maint-add">Add an item</button>`,
    })}
    ${noteCard({
      pkey: 'maint-note', label: 'Maintenance notes',
      text: metric('maintenance_note'),
      prompt: 'No notes entered.',
      edit: jotLines('maintenance_note', 'maint', 'Notes'),
    })}
  `;
}

// ── Front of house ──────────────────────────────────────────────────────────────
//
// One card for all three, with whoever has said something named on their own line. Three
// cards would be three empty cards most mornings, which is a section of the screen spent
// saying nothing happened.
//
// Nothing here is a reading, so nothing is ever "missing": a morning where prepress had
// nothing to report is a complete morning. The card says so plainly rather than showing a
// gap, because a gap is a demand and this is an invitation.
function supportCard() {
  const said = SUPPORT.map(([key, name]) => {
    const row = supportRows().find(r => r.dept_key === key);
    const lines = String(row?.note || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    return lines.length ? { name, lines } : null;
  }).filter(Boolean);

  return `${confirmCard()}${ordersCard()}${noteCard({
    // "Customer service", not the four names spelled out.
    //
    // It was "Customer service, die shop & prepress" while there were three of them, and a
    // fourth makes it a sentence rather than a title — forty-eight characters in a bar that
    // caps every title on the product to fit the shortest card on the screen, which would
    // shrink every other title beside it. The rail has called this section Front of house
    // since it was promoted to one, so the card now agrees with the rail. Who is in it is
    // said where it belongs: in the picker, on each line, and in the prompt when it is empty.
    pkey: 'support', label: 'Pre-production notes',
    // Twice the width, like the board. A section holding one card should not draw it at the
    // width of one of four, with three empty cells beside it — and what is in it is
    // sentences, which want the width more than any reading on the product does.
    icon: '\u{1F4AC}', wide: true,
    html: said.length ? `<ul class="rev__note rev__note--list sup__l">${said.map(s =>
      s.lines.map(line =>
        `<li><b class="sup__w">${esc(s.name)}</b>${jotHtml(line)}</li>`).join('')).join('')}</ul>` : '',
    blank: !said.length,
    prompt: 'Nothing from customer service, estimating, prepress, the die shop or supply chain.',
    edit: supportEditor(),
  })}`;
}

// How long a confirmation takes, and how the booking is keeping up.
//
// Front of house has been a card of sentences since it was added — what the CSRs, the die
// shop, prepress and supply chain want the floor to know — and it is the one section with
// nothing measured on it. These are the two things the plant does measure about it, and both
// have lived in a workbook nobody at the meeting opens.
//
// Both are pairs rather than four cards. "Month to date 2.8 days, year to date 2.9" is one
// fact said over two windows, and "42 logged, 38 booked" is one fact whose whole meaning is
// the gap between its halves. Split across four cards a reader has to hold the first while
// finding the second, which is exactly the arithmetic a card exists to save them.
const CONFIRM_TARGET = 3;

function confirmCard() {
  const mtd = metric('csr_confirm_mtd'), ytd = metric('csr_confirm_ytd');
  const days = value => value == null || value === '' ? null : Number(value);
  const shown = value => days(value) == null ? '\u2014' : days(value).toFixed(1);
  // Lower is better here, which is the only reading on the product where three is a ceiling
  // rather than a floor. The verdict is the month's, because the month is the one anybody can
  // still do something about.
  const tone = days(mtd) == null ? '' : band.lower(days(mtd), CONFIRM_TARGET);
  return pairCard({
    pkey: 'csr-confirm', label: 'Order confirmation', tone,
    each: [['Month to date', shown(mtd), 'days'], ['Year to date', shown(ytd), 'days']],
    foot: footLine([['Target', `\u2264 ${CONFIRM_TARGET} days`],
                    ['Against', 'the PO date']]),
  });
}

function ordersCard() {
  const count = key => {
    const value = metric(key);
    return value == null || value === '' ? null : Number(value);
  };
  const shown = key => count(key) == null ? '\u2014' : num(count(key));
  const monthLine = key => count(key) == null ? '' : `${num(count(key))} month to date`;
  // No verdict. The plant has not set a target for either count, and inventing one would put
  // a colour on a card that means nothing.
  //
  // "Still to book" has gone. It was the gap between the two, offered as the backlog, and it
  // was wrong twice over: it printed minus forty-six thousand when a year of bookings met a
  // week of orders, and even with both figures right it is not a number anybody here manages
  // against. A reading nobody acts on is a reading taking up room.
  //
  // Last week is the headline because pre-production reports on a Monday about the week that
  // finished — that is the pair the meeting opens on. Month to date sits under each as the
  // pace the month is setting, and the year is at the foot, where the size of the thing
  // belongs: read once, not compared.
  return pairCard({
    pkey: 'csr-orders', label: 'Orders booked vs logged in GT', tone: '',
    each: [
      ['Logged last week', shown('csr_orders_logged_wk'), '', monthLine('csr_orders_logged_mtd')],
      ['Booked in GT last week', shown('csr_orders_booked_wk'), '',
       monthLine('csr_orders_booked_mtd')],
    ],
    foot: footLine([['Logged this year', shown('csr_orders_logged')],
                    ['Booked this year', shown('csr_orders_booked')]]),
  });
}

// What the building wants watched today.
//
// Every other reading on the morning is a fact about yesterday. This is the one that faces
// the other way, and it is the only card anybody in the building writes on: the CSR who knows
// a spec is late, the scheduler who knows Thursday is tight, the printer who knows there is a
// press approval standing between a job and the floor. Five people put five lines on it and
// the meeting reads them out.
//
// It is stored in `daily_review`, on keys prefixed `next_`. That table is already the place
// for a dated note against a name that is not always a configured department — customer
// service, the die shop, prepress and supply chain have lived in it since the support card —
// so this adds a naming convention rather than a table, and inherits the writes, the edit trail and the
// live updates that come with it. The prefix is what keeps the two apart, and both readers
// filter on it rather than assuming.
//
// Twice the width of a card and exactly the height of one. A sentence needs the width; a row
// of cards needs the height, and the room has been clear about the height.
function attentionCard() {
  const said = ATTENTION.map(([key, name]) => {
    const lines = String(attentionRows().find(r => r.dept_key === key)?.note || '')
      .split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    return lines.length ? { name, lines } : null;
  }).filter(Boolean);
  const count = said.reduce((total, entry) => total + entry.lines.length, 0);

  return noteCard({
    pkey: 'attention', label: 'Watch list', icon: iconFor('attention'), wide: true,
    // No verdict tone. Green, amber and red mean "against target" everywhere else on the
    // product, and there is no target here — a morning with five things to watch is not a
    // worse morning than one with two, it is a busier one. The card is violet instead, the
    // one place the identity colour is used as anything but chrome, which is what makes it
    // the thing your eye finds on a page of green and red without shouting at anybody.
    tone: '',
    html: count ? `<ul class="rev__note rev__note--list sup__l">${said.map(entry =>
      entry.lines.map(line =>
        `<li><b class="sup__w">${esc(entry.name)}</b>${jotHtml(line)}</li>`).join('')).join('')}</ul>`
      : '',
    blank: !count,
    prompt: 'Nothing flagged for the day ahead. Anyone in the building can add a line.',
    edit: attentionEditor(),
  });
}

// ── Last week ───────────────────────────────────────────────────────────────────
//
// The seven days that finished, one row per department, four columns.
//
// Monday morning the room stops reporting the night and reports the week, and it has been
// doing it off a spreadsheet somebody rebuilds by hand. Every figure in it is already on the
// product — `daily_departments` carries output, hours, uptime and make-ready for every
// department for every morning — so the card is arithmetic over rows that are already there
// rather than anything new to type.

// Monday to Sunday, the last one that is over.
//
// Anchored to the Monday of the morning's own week rather than to "seven days ago", so the
// card says the same thing all week: a review that slips to Wednesday still reviews the week
// that finished, not Tuesday-to-Monday. The fortnight is loaded because the volume column is
// read against the week before it — see below for why that, and not a target.
const weekSpan = (date = state.date) => {
  const monday = addDays(date, -((dateOf(date).getDay() + 6) % 7));
  return { from: addDays(monday, -7), to: addDays(monday, -1),
           priorFrom: addDays(monday, -14), priorTo: addDays(monday, -8) };
};

// What a department did over a span, added up the way each figure is actually made.
//
// The three ratios are weighted, and this is the whole reason the card is worth building
// rather than eyeballing seven mornings. A week's rate is its total output over its total
// hours — the mean of seven daily rates gives a two-hour Saturday the same say as a
// twelve-hour Tuesday and comes out wrong every time a short shift runs badly. Uptime is
// weighted by crewed hours for the same reason, and make-ready by the number of changeovers,
// because a day with one changeover is not evidence the way a day with nine is.
//
// A department with no rows in the span has not been quiet — it has not been logged, and the
// card says so rather than drawing a nought.
function weekTotals(rows, key) {
  const mine = rows.filter(row => row.dept_key === key);
  const sum = (field, over) => mine.reduce((total, row) => {
    const value = Number(row[field]), weight = over ? Number(row[over]) : 1;
    return Number.isFinite(value) && Number.isFinite(weight) && (!over || weight > 0)
      ? total + value * weight : total;
  }, 0);
  const weight = field => mine.reduce((total, row) => {
    const value = Number(row[field.value]), w = Number(row[field.by]);
    return Number.isFinite(value) && Number.isFinite(w) && w > 0 ? total + w : total;
  }, 0);
  const qty = sum('qty'), hours = sum('hours');
  const upHours = weight({ value: 'uptime', by: 'hours' });
  const mrCount = weight({ value: 'make_ready', by: 'mr_count' });
  // Where the DOR never wrote a changeover count, an unweighted mean is the best that can be
  // said, and saying it is better than saying nothing about make-ready for the whole week.
  const mrPlain = mine.map(row => Number(row.make_ready)).filter(Number.isFinite);
  return {
    days: mine.length, qty, hours,
    rate: hours > 0 ? qty / hours : null,
    uptime: upHours > 0 ? sum('uptime', 'hours') / upHours : null,
    makeReady: mrCount > 0 ? sum('make_ready', 'mr_count') / mrCount
      : mrPlain.length ? mrPlain.reduce((a, b) => a + b, 0) / mrPlain.length : null,
  };
}

// One figure, what it is measured against, and how far off it landed.
//
// The bar is the same `bullet` the rest of the product draws its targets with, so a week read
// off this card and a morning read off the card above it say "target" in the same shape. The
// chip is `varianceChip` for the same reason: four sections were each inventing their own
// way to print a variance and they were unified for one screen, not for six.
// The verdict is the caller's, because each of these four readings is judged by its own
// rule — a rate is amber at nine tenths of target, make-ready is amber at a fifth over, and
// a week's volume against the week before it is not judged against a target at all.
const weekCell = (text, actual, target, { tone = '', lowerIsBetter = false, digits = 1,
                                          floor = 0, ceiling = 0, note = '' } = {}) => {
  if (text == null) return '<td class="wkt__x">—</td>';
  const against = Number.isFinite(Number(actual))
    && Number.isFinite(Number(target)) && Number(target);
  return `<td>
    <span class="wkt__v">${text}</span>
    ${against ? bullet({ actual, target, tone, floor, ceiling, lowerIsBetter }) : ''}
    ${against ? varianceChip(actual, target, { digits, lowerIsBetter }) || '' : ''}
    ${note ? `<span class="wkt__n">${esc(note)}</span>` : ''}</td>`;
};

// "3–9 August", and "27 July – 2 August" when the week straddles two of them. The year
// is left off: a card headed "last week" is not ambiguous about which year it means, and
// `shortDate` twice over spends a third of the title bar saying 2026 to nobody.
const weekLabel = (from, to) => {
  const a = dateOf(from), b = dateOf(to);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}`
    : `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
};

function lastWeekCard() {
  const list = configured();
  const span = weekSpan();
  const rows = state.weeks || [];
  const inSpan = (from, to) => rows.filter(row =>
    String(row.metric_date) >= from && String(row.metric_date) <= to);
  const week = inSpan(span.from, span.to), prior = inSpan(span.priorFrom, span.priorTo);
  const logged = list.map(config => weekTotals(week, config.key)).some(t => t.days);

  const body = list.map(config => {
    const now = weekTotals(week, config.key);
    const was = weekTotals(prior, config.key);
    const target = Number(config.target) || null;
    const uptimeTarget = Number(config.uptime_target) || null;
    const mrTarget = Number(config.mr_target) || null;
    if (!now.days) return `<tr><th>${esc(config.name)}</th>
      <td class="wkt__x" colspan="4">Nothing logged for the week</td></tr>`;
    return `<tr><th>${esc(config.name)}<span class="wkt__d">${now.days} day${
      now.days === 1 ? '' : 's'} · ${Math.round(now.hours)} h</span></th>
      ${weekCell(num(Math.round(now.qty)), now.qty, was.qty || null, {
        // Volume is the one column with no target of its own. A week's output is hours times
        // rate, and the hours are a schedule rather than a promise — a department that ran
        // four days because that is all there was to run has not missed anything. So it is
        // read against the week before it, which is the comparison the room makes anyway,
        // and the rate column beside it carries the argument about speed.
        tone: varianceTone(was.qty ? (now.qty - was.qty) / Math.abs(was.qty) * 100 : NaN),
      })}
      ${weekCell(now.rate ? num(Math.round(now.rate)) : null, now.rate, target,
                 { tone: band.rate(now.rate, target) })}
      ${weekCell(now.uptime == null ? null : `${(now.uptime * 100).toFixed(1)}%`,
                 now.uptime == null ? null : now.uptime * 100,
                 uptimeTarget ? uptimeTarget * 100 : null,
                 { tone: band.rate(now.uptime * 100, uptimeTarget * 100),
                   floor: 60, ceiling: 100 })}
      ${weekCell(now.makeReady == null ? null : `${now.makeReady.toFixed(2)} h`,
                 now.makeReady, mrTarget,
                 { tone: band.lower(now.makeReady, mrTarget), lowerIsBetter: true })}
    </tr>`;
  }).join('');

  return noteCard({
    pkey: 'week', wide: true, icon: iconFor('week'),
    label: `Last week · ${weekLabel(span.from, span.to)}`,
    // No verdict colour on the head. Four readings across three departments do not add up to
    // one tone, and picking the worst of twelve would paint the card red every week that one
    // press had one bad changeover.
    tone: '',
    blank: !logged,
    prompt: 'No mornings were logged for the week. Import the DOR for those days and the '
      + 'week fills itself in.',
    html: logged ? `<table class="wkt">
      <thead><tr><th></th>
        ${[['Volume', 'vs week before'], ['Per hour', 'vs target'],
           ['Uptime', 'vs target'], ['Make-ready', 'vs target']]
          .map(([name, against]) => `<th>${name}<span class="wkt__a">${against}</span></th>`)
          .join('')}</tr></thead>
      <tbody>${body}</tbody></table>` : '',
  });
}

// A name and a line, the same two controls as the support and staffing editors. Ten
// permanent boxes would be nine empty ones on any given morning.
function attentionEditor() {
  const at = state.attentionAt || ATTENTION[0][0];
  return jotEditor({ id: 'att', label: 'Who', options: ATTENTION, at,
                     field: `review:${at}:note`, sign: false });
}

// Staffing, said by whoever it is about.
//
// It was one box for the whole plant, so "Printing two on vacation, Gluing one call-in"
// arrived as a paragraph somebody had to parse in a meeting. Who it is about is the first
// thing the room needs and it was buried in the sentence. Now it is a department and a line,
// the same shape as the support card beside it — and the same storage that has been sitting
// unused on `daily_labour` since labour was added.
//
// The plant-wide note stays and leads, because some of it genuinely is not about one
// department: a shutdown, a training day, the whole floor down to one shift.
function staffingCard() {
  const said = (state.config || []).map(config => {
    const lines = String(labourRow(config.key)?.note || '')
      .split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    return lines.length ? { name: config.name, lines } : null;
  }).filter(Boolean);
  const plant = String(metric('staffing_note') || '')
    .split(/\r?\n/).map(line => line.trim()).filter(Boolean);

  return noteCard({
    pkey: 'staffing', label: 'Staffing notes',
    html: plant.length || said.length
      ? `<ul class="rev__note rev__note--list sup__l">${
          plant.map(line => `<li>${jotHtml(line)}</li>`).join('')}${
          said.map(entry => entry.lines.map(line =>
            `<li><b class="sup__w">${esc(entry.name)}</b>${jotHtml(line)}</li>`).join('')).join('')
        }</ul>` : '',
    blank: !plant.length && !said.length,
    prompt: 'Call-ins, vacation, training — nothing entered.',
    edit: staffingEditor(),
  });
}

// A department and a box, and the plant-wide line underneath it. Same argument as the
// support editor: a permanent box per department is four empty ones on most mornings.
function staffingEditor() {
  const list = (state.config || []).map(config => [config.key, config.name]);
  const at = state.staffAt || list[0]?.[0] || '';
  return jotEditor({ id: 'staff', label: 'Department', options: list, at,
                     field: `labour:${at}:note` })
    + jotLines('staffing_note', 'staff-all', 'Whole plant');
}

// Where a note actually lives, given the name of its field. Three different tables behind
// three fields that all hold the same thing: lines somebody typed.
function noteOf(field) {
  const [kind, first, second] = String(field).split(':');
  if (kind === 'review') return (state.review || []).find(r => r.dept_key === first)?.[second] || '';
  if (kind === 'labour') return (state.labour || []).find(l => l.dept_key === first)?.[second] || '';
  return metric(field) || '';
}

// A picker, the lines already on the card, and a box with an Add button.
//
// The three comment cards were a dropdown and a textarea that saved themselves half a second
// after you stopped typing. Correct, invisible, and the room's verdict was the right one:
// nothing on the screen ever said the comment had been taken, so people typed, waited, and
// went looking for a button that was not there. Worse, the box held the whole of that
// department's note, so adding a second line meant knowing to press Return first.
//
// Add is what was asked for and it is also the better model. The box is one comment. Pressing
// Add puts it on the end of that name's list, empties the box and says so, which leaves the
// person exactly where they need to be to pick the next department. The lines already there
// are listed above it, each with a cross, because the second thing anybody wants after adding
// a line by mistake is to take it off.
// The lines and the Add box on their own, for a card that already knows whose note it is —
// a review card is headed with the department's name, so a picker above it would be asking a
// question the card has already answered.
// Spelling and grammar, on the line you just typed, before it is saved.
//
// The people who write on these cards are standing at a press with a phone in one hand, and
// what they write is worth reading and is often spelled the way it sounds. The meeting reads
// it perfectly; the report that goes out of the building, and the person reading it in three
// months, do not.
//
// So: a control beside Add, which does something to the box and shows an Undo. The writer
// sees the result in their own box and can put their own words back with one click. Nothing
// is changed behind anybody, and nothing already saved is touched.
//
// It is gone entirely when the plant has no key configured, rather than being a control that
// fails in somebody's hand.
//
// Two controls, not three.
//
// It was Clean up, Rewrite and Add. Clean up did one narrow thing — spelling, grammar and
// punctuation, nothing else — and it earned its own button while it was the only thing here.
// Beside a menu of five rewrites it is the sixth entry in that menu wearing a button, and
// three controls in a column beside a comment box is a toolbar taller than the box it acts
// on. So spelling is the first thing in the menu, where a reader looking for "make this
// read better" finds it, and the box gets the width the buttons were taking.
//
// Spelling is first because it is the one that changes least, and the only one anybody
// reaches for without thinking about it.
// Three, because a menu is a decision and six of them is a decision nobody standing at a
// press wants to make. These are the three a morning report actually needs: correct it, make
// it readable, make it brief. "Fuller sentences", "More formal" and "Warmer" were the ones
// that served a reader somewhere else — head office, a customer — and the box this sits on is
// read by the room that wrote it.
//
// Spelling is first because it is the one that changes least and the only one anybody reaches
// for without thinking about it.
const TONES = [
  ['',       'Fix spelling'],
  ['plain',  'Plain English'],
  ['short',  'Shorter'],
];

// Every box on the product that takes a sentence gets this, which is what was asked for and
// is also the only defensible rule: a person who has learned that a comment box can rewrite
// itself should not have to remember which four boxes can.
//
// The Undo sits in the same slot and is hidden until there is something to undo, so the row
// is two controls wide whatever state it is in.
const writeAids = field =>
  `<span class="aid">
     <button type="button" class="btn jot__tidy hide" data-undo="${esc(field)}">Undo</button>
     <select class="inp aid__tone" data-tone="${esc(field)}"${state.tidyOff ? ' disabled' : ''}
       aria-label="Rewrite what you have typed"
       title="Rewrite what you have typed">
       <option value="\u2014">${state.tidyOff ? 'Rewrite \u2014 not set up' : 'Rewrite\u2026'}</option>
       ${TONES.map(([key, name]) =>
         `<option value="${key}">${esc(name)}</option>`).join('')}
     </select>
   </span>`;

// A line that is written can be rewritten.
//
// Until now a comment could be added and removed and nothing else, so correcting a typo in
// something said an hour ago meant reading it, deleting it, and typing the whole sentence
// again from memory — with the second version losing the first one's initials and date,
// because a retyped line is a new line. People did the arithmetic and left the typo.
//
// The pencil puts the line back in the box you wrote it in. Saving replaces it in place and
// keeps the signature it already had: whoever wrote it still wrote it, and the date is still
// the day it was said. Correcting your own sentence is not a new statement by somebody else.
const editingLine = field => state.jotEdit?.field === field ? state.jotEdit : null;

// `sign` is off for the board.
//
// A comment on a review card is a statement by a department about its own last twenty-four
// hours, and whose it is matters. The board is a shared list of what the day turns on — five
// people put five lines on it and the meeting reads them out — and the name that belongs to
// each is the department it is filed under, which is already printed in front of it. A second
// attribution there is initials next to a name, twice, on the one card the whole building
// writes on.
function jotLines(field, id, label = 'Comment', sign = true) {
  const lines = String(noteOf(field)).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const open = editingLine(field);
  // The words on their own. The signature is held back and put on again when it is saved.
  const words = open ? (SIGNED.exec(lines[open.line] || '')?.[3] ?? lines[open.line] ?? '') : '';
  return `${lines.length ? `<ul class="jot">${lines.map((line, at) =>
      `<li${open?.line === at ? ' class="jot--open"' : ''}><span>${jotHtml(line)}</span>
         <button type="button" class="jot__b" data-edit-line="${esc(field)}" data-line="${at}"
           aria-label="Change this line" title="Change this line">
           <svg viewBox="0 0 24 24" aria-hidden="true"><path
             d="M4 20h4L19.5 8.5a2.1 2.1 0 10-3-3L5 17z"/></svg></button>
         <button type="button" class="jot__b jot__x"
         data-drop="${esc(field)}" data-line="${at}"
         aria-label="Remove this line">×</button></li>`).join('')}</ul>` : ''}
    <div class="er er--jot"><label for="${esc(id)}-note">${
        open ? 'Change this line' : esc(label)}</label>
      <textarea class="inp" id="${esc(id)}-note" rows="2" data-jot="${esc(field)}"
        placeholder="one line, then Add" aria-label="${esc(label)}">${esc(words)}</textarea>
      <span class="jot__do">${open
        ? `<button type="button" class="btn jot__tidy" data-jot-cancel="1">Cancel</button>`
        : writeAids(field)}<button type="button"
        class="btn btn--go jot__add" data-add="${esc(field)}">${open ? 'Save' : 'Add'}</button></span>
    </div>`;
}

// A picker for adding, and every line on the card for removing.
//
// The picker used to be the whole of it: choose a name, and the list under it was that name's
// lines. Which meant the board — where ten departments can each have said something — showed
// the die shop's line on the card and, in the editor below it, customer service's empty list,
// because customer service is first in the list and the picker has to start somewhere. The
// room's report was that lines could not be deleted. They could; they were three clicks away
// behind a dropdown nobody had a reason to open.
//
// So the picker still chooses where a *new* line goes, and every line already on the card is
// listed under it with its own cross and pencil, under the name of whoever said it. What can
// be seen can be removed, which is the only rule this needed.
function jotEditor({ id, label, options, at, field, sign = true }) {
  const said = options.map(([key, name]) => {
    const lines = String(noteOf(`review:${key}:note`)).split(/\r?\n/)
      .map(line => line.trim()).filter(Boolean);
    return lines.length ? { key, name, lines } : null;
  }).filter(Boolean);
  // The chosen name's own lines are drawn by `jotLines` below, so they are not drawn twice.
  const others = said.filter(entry => entry.key !== at);
  return `<div class="er"><label for="${id}-who">${esc(label)}</label>
      <select class="inp" id="${id}-who" aria-label="${esc(label)}">
        ${options.map(([key, name]) =>
          `<option value="${esc(key)}"${key === at ? ' selected' : ''}>${esc(name)}</option>`).join('')}
      </select></div>
    ${jotLines(field, id, 'Comment', sign)}
    ${others.length ? `<ul class="jot jot--rest">${others.flatMap(entry =>
      entry.lines.map((line, index) =>
        `<li><b class="sup__w">${esc(entry.name)}</b><span>${jotHtml(line)}</span>
           <button type="button" class="jot__b" data-edit-line="review:${esc(entry.key)}:note"
             data-line="${index}" aria-label="Change this line"
             title="Change this line"><svg viewBox="0 0 24 24"><path
               d="M4 20h4L19.5 8.5a2.1 2.1 0 10-3-3L5 17z"/></svg></button>
           <button type="button" class="jot__b jot__x" data-drop="review:${esc(entry.key)}:note"
             data-line="${index}" aria-label="Remove this line">×</button></li>`)).join('')}</ul>` : ''}`;
}

// The editor, used on the card in Edit mode and on the entry screen alike.
//
// A dropdown and one box, because that is what was asked for and it is right: these three
// speak occasionally, not daily, and three permanent boxes would be two empty ones every
// morning. Choosing a department loads what that department has already said today, so it
// is also how yesterday's sentence gets corrected.
function supportEditor() {
  // A labelled box each, not one box behind a picker.
  //
  // The picker was compact and it hid three of the four. Somebody opening this section saw
  // "Who: Customer service" over a comment box and had no way of knowing the die shop,
  // prepress and supply chain were in there too without opening a dropdown to find out —
  // which is how the plant came to report that die shop and prepress were missing from the
  // section altogether. They were not missing. They were one click further away than anybody
  // thought to click, which for a box nobody knows to look in is the same thing.
  //
  // Four boxes cost three more rows on the widest card on the product. Each keeps its own
  // lines, its own Add and its own signature, so nothing is shared between them and nobody
  // has to remember to put the picker back where they found it.
  return SUPPORT.map(([key, name]) =>
    jotLines(`review:${key}:note`, `sup-${key}`, name)).join('');
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

  // Staffing first, then the overtime.
  //
  // Who is in is the question the room asks before any other: who called in, who is on
  // vacation, who is training. The overtime follows from it — a department books a Saturday
  // *because* two people are off — so reading them the other way round is reading the answer
  // before the question. They were in the order the code happened to build them.
  return `${staffingCard()}
    ${metricCard({
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
      // Three on the one page, for the same reason the bookings are three there: a tile among
      // forty holds a fraction of what a slide does, and "and 1 more" is the honest thing to
      // say to somebody glancing at the whole plant.
      cap: onePage() ? 3 : 8,
      edit: otRows(),
      // "Three shifts, Heidelberg and Omega" is the whole of what the room says about a
      // department's overtime, so it is the whole of what the card prints — the count
      // against the name, and the machines on the quieter line under it.
      // The quieter line under the name says when and on what — "Weekend · Heidelberg, Bobst"
      // — because a reader who has just seen "3 shifts" asks both in that order.
      rows: list.map(c => [c.name,
        otShifts(c.key) ? `${otShifts(c.key)} shift${otShifts(c.key) === 1 ? '' : 's'}` : '—',
        otShifts(c.key) > 0 ? 'warn' : '',
        [otShifts(c.key) ? otWhenName(c.key) : '', machineNames(c.key)]
          .filter(Boolean).join(' \u00b7 ') || null]),
      empty: 'No departments configured.',
    })}
    ${/* "What to line up" was here and is gone.
          It listed the departments under target, the overtime booked and the review lines
          flagged — every one of them a figure already on a card in the same morning, most of
          them on a card in the same row. A reader who saw Die Cutting at −34% on the
          production slide met it again three slides later with the same number beside it,
          and the second showing added nothing except the chance of the two disagreeing. A
          summary of a page the reader has just walked is not a summary, it is a repeat. */''}
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
// `FROM_FILE`, `SOURCE_NAMES` and `sourceOf` moved to readings.js, where the cards can
// reach them too. Which workbook a reading arrives in is a fact about the reading, not
// about the screen that happens to be showing it.

// When each file last arrived, said out loud.
//
// A figure that came out of the DOR six days ago and a figure entered this morning look
// exactly the same on a card, and that is the whole of how a stale number sits on a screen
// for a week without anybody noticing. The importer stamps `source_seen` per file; this
// reads it back. A file that has not been seen since before this morning is amber, and one
// that has never been seen says so rather than pretending.


// The clock a person actually reads off a wall: half past seven, not 07:30:00.000Z.
const clockAt = when =>
  when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
const dayAt = when => `${when.getDate()} ${MONTHS[when.getMonth()].slice(0, 3)}`;

// How old a file is, once, so nothing on the product can disagree about it.
//
// `sourceStrip` had this arithmetic inside it and rendered on the two entry screens and
// nowhere else — so the freshness of the morning was visible only to the person filling it
// in, and never to the fifteen people reading it off a wall. That is the wrong way round:
// the coordinator knows when they pulled, and the room does not.
function sourceAge(key) {
  const seen = state.metrics?.source_seen || {};
  const stamp = seen[key.toLowerCase()] || seen[key];
  const when = stamp ? new Date(stamp) : null;
  if (!when || Number.isNaN(+when)) return { mark: '·', said: 'no pull yet', tone: 'gap' };
  const days = daysBetween(when.toISOString().slice(0, 10), state.date);
  if (days <= 0) return { mark: '✓', said: clockAt(when), tone: 'ok', when };
  if (days === 1) return { mark: '✓', said: `yesterday ${clockAt(when)}`, tone: '', when };
  return { mark: '!', said: `${dayAt(when)} · ${days} days ago`, tone: 'warn', when, stale: true };
}

// Which file a section's readings come from. Safety, Labour and the comment sections are not
// here because nothing fetches them — they are typed, and "no file" is the true answer
// rather than a gap.
const SECTION_SOURCE = {
  quality: 'KPI', production: 'DOR', week: 'DOR', shipping: 'OTIF', financials: 'KPI',
};

// Said on the section's own heading, and on the wall above it.
function freshLine(key) {
  const file = SECTION_SOURCE[key];
  if (!file) return '';
  const age = sourceAge(file);
  return `<span class="fresh fresh--${age.tone || 'old'}" title="${
    esc(SOURCE_NAMES[file] || file)} last arrived ${esc(age.said)}"><b>${
    esc(SOURCE_NAMES[file] || file)}</b> ${esc(age.said)}</span>`;
}

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
    const shortages = shortJobs();
    const rows = [frow('Jobs short', 'shorts',
      `type="number" min="0" value="${shortages ?? ''}"`,
      { echo: shortages == null ? '' : Number(shortages) === 0
          ? '<b class="tone--ok">None</b>' : '<b class="tone--stop">Chase it</b>' })];
    // "COQ month" invited somebody to type this month's figure into last month's reading.
    const month = coqMonth();
    for (const [label, name, step] of [
      [month ? `COQ ${month.label}` : 'COQ last month', 'coq', '0.01'],
      ['COQ year', 'coq_ytd', '0.01'],
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
  }, 'Counts are for the last twenty-four hours. Cost of quality is the last month closed '
   + 'off, not this one \u2014 it and the counts come from the monthly KPI workbook.');
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
      // The two for today take a row like everything else. They are worked out from the
      // three counts above and written over whenever those move; this is where a person
      // corrects them against the sheet in their hand.
      frow('OTD today', 'otd',
        `type="number" step="0.01" value="${state.metrics?.otd ?? ''}"`,
        { echo: derived ? `worked out: <b>${derived.otd.toFixed(2)}%</b>` : '' }),
      frow('OTIF today', 'otif',
        `type="number" step="0.01" value="${state.metrics?.otif ?? ''}"`,
        { echo: derived ? `worked out: <b>${derived.otif.toFixed(2)}%</b>` : '' }),
      // The month and year rollups are read off the OTIF sheet and shown on four cards, and
      // a plant that has switched a card off has said it does not report that figure. The
      // row goes with it: Shipping's cards showed four percentages while this screen asked
      // for six, and the two extra were asking for numbers with nowhere to appear.
      //
      // Only these four follow their cards. The counts above them do not, because OTD and
      // OTIF for today are worked out from jobs, late and short — hiding one of those cards
      // would stop the morning being able to work out the two that are showing.
      ...[['OTD month', 'mtd_otd'], ['OTD year', 'ytd_otd'],
          ['OTIF month', 'mtd_otif'], ['OTIF year', 'ytd_otif']]
        .filter(([, field]) => cardOn(field))
        .map(([said, field]) => frow(said, field,
          `type="number" step="0.01" value="${state.metrics?.[field] ?? ''}"`)),
    ].join('');
  }, 'OTD and OTIF for today are worked out from jobs, late and short \u2014 change any of '
   + 'those three and both are worked out again.');
}

function fillMoney() {
  const said = String(metric('fin_month') ?? '').slice(0, 10);
  const named = /^\d{4}-\d{2}-\d{2}$/.test(said)
    ? MONTHS[Number(said.slice(5, 7)) - 1] : '';
  return fgroup('Sales', () => [
    frow(named ? `Sales \u2014 ${named}` : 'Month to date', 'fin_actual_mtd',
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

// The overtime rows, which the entry screen and the card both draw.
//
// The card used to be read-only, and Maintenance & Labour was the one section on the product
// where the answer to "change this" was "go to the entry screen". Every other card carries
// its own edit zone; these two were left behind because their contents are rows rather than
// a figure, which is a fact about how they are drawn and not a reason.
// Weekday or weekend, beside the count.
//
// "Gluing, three shifts" is two different facts depending which. Three on a Tuesday is a
// plant catching up inside its own week, on crews who are already in; three on a Saturday is
// a day the plant does not normally have, at a rate that is not time and a half, from people
// who had made other plans. The meeting treats the two completely differently and has been
// asking which out loud every morning because the card printed one number for both.
//
// Blank is a real answer and stays first: on most mornings nobody has said, and "weekday" is
// not the same claim as silence.
const OT_WHEN = [['', 'When'], ['weekday', 'Weekday'], ['weekend', 'Weekend']];
const otWhen = key => String(labourRow(key)?.ot_when || '');
// The blank option is labelled for the box it sits in — an unfilled select reading "When"
// asks the question — and that label is not a reading. A row nobody has answered says nothing
// on the card rather than saying "When".
const otWhenName = key => (OT_WHEN.find(([v]) => v && v === otWhen(key)) || [, ''])[1];

function otRows() {
  const list = state.config.filter(c => c.active !== false);
  return list.map(c => {
    const chosen = new Set(labourRow(c.key)?.machines || []);
    const machines = machinesIn(c.key);
    return `<div class="fr fr--ot">
      <span class="fr__l">${esc(c.name)}</span>
      <input class="inp fr__i fr__i--n" data-field="labour:${esc(c.key)}:ot_shifts"
        type="number" step="0.5" min="0" placeholder="shifts"
        aria-label="${esc(c.name)} overtime shifts"
        value="${labourRow(c.key)?.ot_shifts ?? ''}">
      <select class="inp fr__i fr__i--s fr__i--w" data-field="labour:${esc(c.key)}:ot_when"
        aria-label="${esc(c.name)} \u2014 weekday or weekend">${OT_WHEN.map(([value, name]) =>
        `<option value="${value}"${value === otWhen(c.key) ? ' selected' : ''}>${
          esc(name)}</option>`).join('')}</select>
      <span class="fr__x">${machines.length ? `<span class="ticks">${machines.map(m =>
        `<label class="tick2"><input type="checkbox" data-field="labour:${esc(c.key)}:machines"
          data-machine="${esc(m.code)}"${chosen.has(m.code) ? ' checked' : ''}>
          <span>${esc(m.name)}</span></label>`).join('')}</span>` : ''}</span>
    </div>`;
  }).join('');
}

const fillOvertime = () => fgroup('Overtime', () => otRows(),
  'Leave a department blank if it is not running overtime.');

// Maintenance is a group like every other group here. It was the section's own panel dropped
// at the foot of the page, which made it the one thing on the screen that looked like it came
// from somewhere else — and it is six columns wide, so it takes the full row rather than a
// third of one.
// `tight` is the version that lives in a column rather than across the page.
//
// Six boxes on a line needs the width of the screen, and on the one-page entry view it took
// it — leaving Quality and Sales ending a third of the way down with nothing under them and
// the whole block ragged along the bottom. Narrow, the same six wrap to three short lines
// per booking and the group drops into a column beside the others.
function maintRows({ tight = false } = {}) {
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
    return `<div class="fr fr--maint${tight ? ' fr--maint2' : ''}" data-pkey="maint-${esc(m.id)}">
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
  // The column headings are what makes six unlabelled boxes readable in a row. Wrapped to
  // three lines they label nothing, so narrow drops them — every box carries its own
  // placeholder and `aria-label` regardless.
  return `${tight ? '' : `<div class="fr fr--maint fr--head"><span>Department</span><span>Machine</span>
      <span>Hours</span><span>What for</span><span>When</span><span>Status</span><span></span></div>`}
    ${rows.join('') || '<p class="fg__note">Nothing booked in.</p>'}`;
}

const fillMaintenance = ({ tight = false } = {}) =>
  `<section class="fg${tight ? ' fg--maint2' : ' fg--wide'}">
    <h3 class="fg__h">Upcoming maintenance
      <button class="btn btn--ghost fg__add" id="maint-add">Add an item</button></h3>
    <div class="fg__rows">${maintRows({ tight })}</div>
  </section>`;


// The four figures behind customer service's two cards.
//
// Typed here whether or not the docket-flow workbook is being read, for the same reason every
// other reading on this screen can be: a morning is not held up by a file that did not arrive.
const fillCsr = () => fgroup('Orders and confirmations', () => [
  frow('Confirmation \u2014 month', 'csr_confirm_mtd',
    `type="number" step="0.1" min="0" value="${metric('csr_confirm_mtd') ?? ''}"`,
    { echo: 'days from the PO date' }),
  frow('Confirmation \u2014 year', 'csr_confirm_ytd',
    `type="number" step="0.1" min="0" value="${metric('csr_confirm_ytd') ?? ''}"`,
    { echo: `target \u2264 ${CONFIRM_TARGET} days` }),
  frow('Logged \u2014 last week', 'csr_orders_logged_wk',
    `type="number" min="0" step="1" value="${metric('csr_orders_logged_wk') ?? ''}"`,
    { echo: 'Monday to Sunday, the week that finished' }),
  frow('Booked in GT \u2014 last week', 'csr_orders_booked_wk',
    `type="number" min="0" step="1" value="${metric('csr_orders_booked_wk') ?? ''}"`),
  frow('Logged \u2014 month', 'csr_orders_logged_mtd',
    `type="number" min="0" step="1" value="${metric('csr_orders_logged_mtd') ?? ''}"`),
  frow('Booked in GT \u2014 month', 'csr_orders_booked_mtd',
    `type="number" min="0" step="1" value="${metric('csr_orders_booked_mtd') ?? ''}"`),
  frow('Logged \u2014 year', 'csr_orders_logged',
    `type="number" min="0" step="1" value="${metric('csr_orders_logged') ?? ''}"`),
  frow('Booked in GT \u2014 year', 'csr_orders_booked',
    `type="number" min="0" step="1" value="${metric('csr_orders_booked') ?? ''}"`),
].join(''), 'From the docket-flow tracker \u2014 how long a confirmation takes, and how the '
 + 'booking is keeping up with what came in.');

function fillSupport() {
  // The same four boxes the card carries.
  //
  // Enter used to draw the picker and then a quiet row apiece underneath showing what the
  // *other* three had said, because with a picker you could only ever see one at a time and
  // somebody typing into prepress still needs to know the die shop has covered it. With all
  // four boxes on screen that row repeats the box above it.
  return fillCsr() + fgroup('Notes', () => supportEditor(),
    'Whoever has something to say — none of it is required.');
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
        ${jotLines(`review:${config.key}:note`, `fn-${config.key}`, 'What happened')}
      </div>`;
    });
    return rows.join('');
  }, 'Each line becomes a bullet on the card.');
}

// Staffing and the maintenance note used to ride at the foot of the last twenty-four hours,
// which made that group two subjects: what each production department reported, and two
// sentences belonging to neither. They are one box each and they belong on the screen they
// are about \u2014 staffing with the labour it describes, the maintenance note with the
// bookings it comments on.
// No visible label: the group's own heading is the label, and printing it twice was two
// lines to say one word.
const noteRow = (field, placeholder, said) => `<div class="fr fr--note fr--wide fr--bare">
  ${jotLines(field, `nr-${field.replace(/[^a-z_]/g, '')}`, said)}</div>`;

const fillAttention = () => fgroup('Watch list', () => attentionEditor(),
  'Anyone in the building can add a line — pick who it is from and type it. Each line '
  + 'becomes a bullet on the card the meeting reads.');

const fillStaffing = () => fgroup('Staffing', () => staffingEditor(),
  'Pick a department and type a line, or use the whole-plant box. Each line becomes a '
  + 'bullet on the card.');

const fillMaintNote = () => fgroup('Maintenance notes', () =>
  noteRow('maintenance_note', 'anything the room should know', 'Maintenance notes'),
  'Each line becomes a bullet on the card.');

const SECTIONS = {
  // The entry screen. See the block above it for why this is its own surface.
  fill: () => {
    toGo = 0;
    // What is outstanding is the assessment's answer, not this screen's. Counting blank
    // boxes made a morning look incomplete because somebody had not retyped a figure the
    // DOR had already supplied, and complete because every box had something in it even
    // when four departments had never confirmed their last twenty-four hours.
    const gaps = absent(state.findings);
    // One section at a time, down a rail.
    //
    // Every group of every section on one page was the screen this replaces — four columns
    // of boxes with no order to them, in the room's word a collage, and the answer to "where
    // do I put safety" was to hunt. The subject splits down the left exactly the way the
    // dashboard's own rail splits it, so entering a morning is: click Safety, type, click
    // Quality, type. The counts ride on the rail, so you can see which sections still want
    // something without opening any of them.
    //
    // All of it is still there, last on the rail, because a plant that has learnt the collage
    // should not have it taken away and there are mornings where one page is the faster read.
    // Every finding already knows which section it belongs to, so the rail's counts are the
    // assessment's own answer rather than a second opinion about it.
    // `order()` already decides whether maintenance is its own screen or part of labour;
    // asking it again here is how the two would come to disagree.
    const tabs = fillTabs().map(t => {
      const left = t.key === '_all' ? gaps.length
        : gaps.filter(g => g.section === t.key).length;
      return { ...t, name: t.name || TITLES[t.key], tag: left ? String(left) : '✓' };
    });
    const at = tabs.find(t => t.key === state.fillAt) ? state.fillAt : tabs[0].key;

    const groups = at === '_all'
      // Three columns, assigned rather than flowed, and balanced by eye against what each
      // group actually costs in height. It was four, from when Enter was the whole width;
      // beside the rail four columns leave 270px each and every label comes out as
      // "Las…". Three is what fits, so three is what it is — and the groups are dealt out
      // so the columns finish together rather than as a staircase.
      ? `<div class="fill__col">${fillSafety()}${fillQuality()}${fillMoney()}${fillSupport()}</div>
         <div class="fill__col">${fillProduction()}${fillNotes()}${fillStaffing()}${fillMaintNote()}</div>
         <div class="fill__col">${fillShipping()}${fillOvertime()}${fillAttention()}${
           fillMaintenance({ tight: true })}</div>`
      : FILL_FOR[at]();
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
              `<button class="gap gap--sm" data-goto="${esc(r.field || '')}"
                 data-goto-at="${esc(r.section || '')}">${esc(r.title)}</button>`).join('')}${
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
      <div class="sub">
        <nav class="sub__rail" aria-label="What to fill in">
          ${tabs.map(t => `<button class="sub__b" data-filltab="${esc(t.key)}"
            aria-current="${t.key === at}">
            <b>${esc(t.name)}<i class="sub__t${t.tag === '\u2713' ? ' sub__t--ok' : ' sub__t--todo'}"
              >${t.tag}</i></b>
            <span>${esc(t.sub)}</span></button>`).join('')}
        </nav>
        <div class="sub__body">
          <div class="fill__grid${at === '_all' ? '' : ' fill__grid--one'}">${groups}
          <!-- Inside the grid, spanning it, so the buttons finish where the last column
               finishes. Outside it they sat against the right edge of the pane, which on a
               screen whose columns pack left is a foot belonging to nothing above it. -->
          <div class="fill__end">
            <p>${gaps.length ? `<b>${gaps.length}</b> left across the morning`
              : published ? 'Published' : 'Nothing left to fill in'}</p>
            <div class="fill__go">
              ${at === '_all' || !nextFillTab(at) ? '<button class="btn" data-nav="overview">See the cards</button>'
                : `<button class="btn" data-filltab="${esc(nextFillTab(at))}">${
                    esc(TITLES[nextFillTab(at)] || 'Next')} next</button>`}
              ${/* No Publish button. Saving a section is finishing it, and finishing is what
                    puts the morning up — see `goUp()`. */''}
            </div>
          </div></div>
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
      .filter(row => !isAttention(row.dept_key))
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
        `<button class="gap" data-goto="${esc(r.field || '')}"
            data-goto-at="${esc(r.section || '')}">
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
    const shortages = shortJobs();
    const shortTone = shortages == null ? '' : band.shortage(Number(shortages));
    // Both cost-of-quality cards report the same closed month, so they are named from one
    // reading of it. If they were worked out separately they could disagree, and two cards
    // side by side naming different months is worse than neither naming one.
    const month = coqMonth();
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
          lowerIsBetter: true, series: metricSeries('shorts') }),
        heroEdit: { field: 'shorts', attrs: `type="number" min="0" value="${shortages ?? ''}"` },
        // Where it comes from is on the title bar as a mark, on every card, in one place.
        // Saying it again in words on this card alone made the one card whose foot is a
        // single fact into the one card with a sentence in it.
        foot: footLine([['Target', '0']]),
      })}
      ${coqCard('coq', month ? `COQ \u2014 ${month.label}` : 'COQ \u2014 last closed month',
                'coq', 'coq_target',
                month ? [['Closed', month.closed]] : [])}
      ${coqCard('coqytd', 'COQ \u2014 year to date', 'coq_ytd', 'coq_ytd_target',
                month ? [['Through', month.label]] : [])}
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
          // Nothing under the bar. Against target has moved below the rule into the foot,
          // where Shipping has always kept it — see the note on the foot below.
          series: deptSeries(config.key), seriesTrend: false,
        }),
        // The volume, directly under the rate it was made out of.
        //
        // It used to be a third of the foot, level with the target and the hours and no
        // louder than either — which puts "206,166 cartons" and "11,933" on the same line at
        // the same weight, two numbers about different things pretending to be a set. A
        // speed on its own answers nothing: eight and a half thousand cartons an hour over
        // one hour and over twenty-four are different mornings, and the second figure the
        // room reads is always how many. So it sits under the number it explains, at about
        // half the size, which is where the plant's own dashboard has always had it.
        // No "total". The figure above it is a rate and this one is the quantity — the word
        // was doing no work that "85,287 sheets" under "3,218 sheets/hr" does not already do,
        // and it was the busiest line on the card.
        total: { text: row.qty ? `${num(row.qty)} ${volumeLabel(config).toLowerCase()}` : '',
                 label: volumeLabel(config),
                 edit: { field: `dept:${config.key}:qty`,
                         attrs: `type="number" value="${row.qty ?? ''}"` } },
        // Target, against target, and the hours — and against target in the middle, which
        // is where Shipping has printed its variance since the beginning.
        //
        // It was above the rule, directly under the bar. Moving it below buys two things
        // the room asked for and one it did not: the bar drops to sit on the rule where it
        // works as the divider, the reading zone loses a line so the figure is drawn larger,
        // and a department card's foot is finally the same three-part row as every other
        // card's. The cost is honest — it is a foot-sized figure now rather than a large
        // one — and it is the trade that makes the number above it bigger.
        foot: footLine([
          ['Target/hr', num(Math.round(target)),
            { field: `dept:${config.key}:target`,
              attrs: `type="number" value="${row.target ?? config.target}"` }],
          ['Variance', rate && target
            ? `<span class="tone--${tone || 'none'}">${
                esc(variancePct((rate - target) / Math.abs(target) * 100, 1))}</span>`
            : null],
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
    // Three readings a department is judged on, for the same weekday a week ago.
    //
    // It was one line per department carrying only what was made, because that is all the
    // importer kept. It keeps all three now, so the card can be what the room asked for: a
    // block per department — output, make-ready, uptime — divided from the next, at twice
    // the height so it stands beside two rows of department cards rather than one.
    //
    // Each figure is judged the way its own card judges it: output against the department's
    // rate target, make-ready against the make-ready target where lower is better, uptime
    // against the uptime target. A reading the week did not produce is a dash rather than a
    // nought, because a machine that did not run last Tuesday did not run at 0% uptime.
    const weekCard = () => {
      // The same seven days the wide card rolled up, not the same weekday a week ago.
      //
      // This card was built on `pw_*` — what this department made on the matching weekday of
      // the previous week — and those fields are only ever filled by hand. Nobody filled
      // them, so it printed "Not logged" against all three departments while a second card
      // underneath, on the same screen, showed the week in full off the DOR. The plant had
      // two cards about last week and only one of them knew anything.
      //
      // The layout here is the one the room asked for and keeps: a block per department,
      // standing full height beside two rows of department cards. Only where the figures
      // come from has changed.
      const span = weekSpan();
      const week = (state.weeks || []).filter(row =>
        String(row.metric_date) >= span.from && String(row.metric_date) <= span.to);
      // A reading, and under it how far off target it was. The arrow is the direction the
      // number moved against what it should have been, and the colour is whether that was
      // good — which for make-ready is the opposite way round, because an hour saved setting
      // up is an hour running.
      // A row per reading, not a column per reading.
      //
      // Three readings side by side is the shape a wide card wants, and this card is the one
      // on the product that is deliberately narrow and two rows tall — it stands beside a
      // column of department cards. Side by side in that shape gave each figure a third of
      // 300 pixels and left two thirds of the height empty, which is what the room saw: type
      // smaller than everything around it in a card three-quarters blank.
      //
      // Down the card, each reading gets the full width and the card gets used. It is also
      // the arrangement the overtime list already uses two cards to the left — a name on the
      // left, its figure on the right — so the section reads as one design.
      //
      // Four facts to a row, which is what every other card's foot carries and what this one
      // was missing: the caption, the reading, how far off target it was, and the target.
      // The target came out once on the argument that the department's own card carries it.
      // That was true of throughput and never true of the other two, and it is the wrong
      // argument anyway — "89.7%, down 1.5%" is a sentence you cannot finish without knowing
      // what it was aiming at, and nobody should have to hold a number from another card to
      // finish it.
      const cell = (label, text, tone, actual, target, lowerIsBetter, aim) => {
        const off = actual != null && target
          ? (actual - target) / target * 100 * (lowerIsBetter ? -1 : 1) : null;
        // The caption carries its own length, so it can be capped by how much of the card it
        // has rather than by a flat ceiling. A clipped caption is the card hiding the word
        // that says what the number beside it is.
        return `<div class="wkb__m">
           <span class="wkb__c"><span class="wkb__l" style="--wl:${
             String(label).length}">${esc(label)}</span>
             <span class="wkb__t" style="--tl:${
             String(aim || '').length || 1}">${aim ? esc(aim) : ''}</span></span>
           <b class="wkb__v${tone ? ` tone--${tone}` : ''}">${text}</b>
           ${off == null ? '<i class="wkb__d"></i>'
             : `<i class="wkb__d tone--${off >= 0 ? 'ok' : 'stop'}">${
                 off >= 0 ? '▲' : '▼'} ${Math.abs(off).toFixed(1)}%</i>`}</div>`;
      };

      const blocks = list.map(config => {
        const row = dept(config.key);
        const now = weekTotals(week, config.key);
        const qty = Number(now.qty) || 0;
        const hours = Number(now.hours) || 0;
        const rate = Number(now.rate) || (hours ? qty / hours : 0);
        const target = Number(row.target ?? config.target);
        const mr = now.makeReady == null ? null : Number(now.makeReady);
        const mrTarget = Number(row.mr_target ?? config.mr_target ?? 0);
        const up = now.uptime == null ? null : Number(now.uptime);
        const upTarget = Number(row.uptime_target ?? config.uptime_target ?? 0);
        if (!rate && mr == null && up == null) {
          return `<div class="wkb"><div class="wkb__n">${esc(config.name)}</div>
            <div class="wkb__r"><span class="wkb__none">Not logged</span></div></div>`;
        }
        // No target line beside the name — each of the three readings carries its own,
        // underneath itself, where the number it belongs to is.
        // What it made and how long it ran, beside the name. Both were already read to work
        // the rate out and then thrown away, and they are the two facts a reader asks for
        // the moment a rate surprises them: 5,920 an hour is a different week at 26 hours
        // than at 40.
        const made = [
          qty ? `${num(Math.round(qty))} ${esc(config.unit || 'units')}` : '',
          hours ? `${num(hours)} h` : '',
        ].filter(Boolean).join(' \u00b7 ');
        return `<div class="wkb">
          <div class="wkb__n">${esc(config.name)}${made ? `<em>${made}</em>` : ''}</div>
          <div class="wkb__r">
            ${cell(rateLabel(config), rate ? num(Math.round(rate)) : '—',
                   rate ? band.rate(rate, target) : '', rate || null, target, false,
                   target ? `Target ${num(Math.round(target))}` : '')}
            ${cell('Make-ready', mr == null ? '—' : `${mr.toFixed(2)} h`,
                   mr == null || !mrTarget ? '' : band.lower(mr, mrTarget), mr, mrTarget, true,
                   mrTarget ? `Target ${mrTarget.toFixed(2)} h` : '')}
            ${cell('Uptime', up == null ? '—' : `${(up * 100).toFixed(1)}%`,
                   up == null || !upTarget ? '' : band.rate(up, upTarget), up, upTarget, false,
                   upTarget ? `Target ${(upTarget * 100).toFixed(0)}%` : '')}
          </div></div>`;
      }).join('');

      return noteCard({
        pkey: 'pw-week', icon: iconFor('week'),
        label: `Last week's productivity \u00b7 ${weekLabel(span.from, span.to)}`, tall: true,
        // `band.worst([])` is 'ok', which would put a green border on a card that has
        // nothing in it — a verdict on a week nobody has logged.
        tone: (tones => tones.length ? band.worst(tones) : '')(list.map(config => {
          const row = dept(config.key);
          const rate = Number(row.pw_hours) ? Number(row.pw_qty) / Number(row.pw_hours) : 0;
          return rate ? band.rate(rate, Number(row.target ?? config.target)) : '';
        }).filter(Boolean)),
        html: blocks ? `<div class="wkb__all">${blocks}</div>` : '',
        blank: !blocks,
        prompt: 'Nothing logged for the same weekday last week.',
        edit: list.map(config => {
          const row = dept(config.key);
          return `<div class="er er--pair"><label>${esc(config.name)}</label>
            <input class="inp" type="number" data-field="dept:${config.key}:pw_qty"
              aria-label="${esc(config.name)} — last week's ${esc(volumeLabel(config))}"
              placeholder="${esc(volumeLabel(config))}" value="${row.pw_qty ?? ''}">
            <input class="inp" type="number" step="0.1" data-field="dept:${config.key}:pw_hours"
              aria-label="${esc(config.name)} — last week's hours"
              placeholder="hours" value="${row.pw_hours ?? ''}"></div>`;
        }).join(''),
      });
    };

    // The review notes are cards now, drawn by the same function every other note on the
    // product is drawn by. They were a fourth card shape — their own head, their own dot,
    // their own border colour — sitting in a `grid--cards` beside real cards, which is most
    // of what made this screen look, in the room's word, unorganised. One shape, one bar,
    // one line for the title, and the status is the border and the flag exactly as it is
    // everywhere else.
    // Support has its own card and must not turn up here as well: a card headed "Prepress"
    // in a grid of departments reads as a department, and the next question is why it has
    // no rate.
    // And the plant's own switch is read. Configure has offered "A card in the 24-hour
    // review" per department since departments were configurable, and this row was ignoring
    // it — every department got a card whatever the tick said, so turning Shipping off did
    // nothing and there was no way to find out why.
    const onReview = key => state.config.find(c => c.key === key)?.on_review !== false;
    const review = state.review
      .filter(row => !isSupport(row.dept_key) && !isAttention(row.dept_key)
        && onReview(row.dept_key)).map(row => {
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
        // The same Add box as every other card somebody writes sentences on. A department
        // reporting two things overnight is two lines, and typing them into one box with a
        // Return between was the thing nobody could tell had saved.
        edit: `<div class="er"><label>Status</label>
            <select class="inp" data-field="review:${esc(row.dept_key)}:status"
              aria-label="Status">${reviewOptions(row.status)}</select></div>
          ${jotLines(`review:${row.dept_key}:note`, `rev-${row.dept_key}`, 'What happened')}`,
      });
    }).join('');

    // One grid: the departments, the week they just had, and what each of them said about
    // the last twenty-four hours.
    //
    // The review used to be a second grid under a second heading, which meant the page and
    // the wall drew the same section two different ways — present mode has always put them
    // together, and the room's verdict on the two is that the wall's is the right one. Three
    // departments across, their three review cards directly underneath, and the week
    // standing full height down the right-hand side. A department and what its manager said
    // about it are one column, which is how the meeting reads them: nobody looks at die
    // cutting's rate and then goes hunting two headings away for die cutting's sentence.
    //
    // The week card is written last and placed first by the grid, so the departments fill
    // the row from the left and it takes the column at the end.
    //
    return `<div class="grid grid--cards grid--prod" data-grid="production"
      style="--prod-cols:${list.length}">${cards}${review}${weekCard()}</div>`;
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
      // Every reading on this screen takes a field, including the two that are worked out.
      //
      // OTD and OTIF follow from jobs, late and short, so they had none — the argument being
      // that a derived figure with its own box can be typed into until it disagrees with the
      // counts printed beside it. That argument is right about the arithmetic and wrong about
      // the room: the OTD sheet carries both percentages, the plant reads them off it, and a
      // card that is the only one on the screen a person cannot correct reads as broken
      // rather than as principled.
      //
      // So they are editable like the rest. The derivation stays the default and stays in
      // charge: change jobs, late or short and both are worked out again and written over,
      // which is what stops the two from drifting apart. Typing one is a correction that
      // holds until the counts underneath it move.
      return ship(name, label, {
        heroEdit: { field: name,
                    attrs: `type="number" step="0.01" value="${state.metrics?.[name] ?? ''}"` },
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
        //
        // And no foot. "Target 0" under a count of late shipments is a line that says the
        // same thing every morning of the plant's life, and the four counting cards were
        // carrying one each — four rows of furniture holding the number away from the middle
        // of its own card for no reading anybody takes.
        series: metricSeries(name), lowerIsBetter: true,
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
        // On time and Of were a foot restating the number above them, and a field that has
        // its own row on the entry screen. The count is the card.
      })}
      ${ship('cartons', 'Cartons', {
        series: metricSeries('cartons'),
        value: read('cartons') == null ? '\u2014' : num(read('cartons')), sub: 'shipped today',
        heroEdit: { field: 'cartons',
                    attrs: `type="number" min="0" value="${state.metrics?.cartons ?? ''}"` } })}
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
  // The board goes last, on the last section, which makes it the last slide of the walk —
  // the morning ends on the day ahead rather than on overtime.
  labour: () => cardGrid('labour',
    (mergedUpkeep() ? maintenanceCards() : '') + labourCards()),

  attention: () => cardGrid('attention', attentionCard()),

  // One card, its own screen. The same shape as the board, for the same reason.
  support: () => cardGrid('support', supportCard()),

  // One card, and it is the width of two. The same shape as the board: a section that
  // holds a single wide card rather than a row of narrow ones.
  week: () => cardGrid('week', lastWeekCard()),

  financials: () => {
    // Billing is reviewed the next morning, so the financial picture reports through the
    // day before the dashboard date. A dashboard dated July 1 reports through June 30.
    const reportDate = dateOf(state.date);
    reportDate.setDate(reportDate.getDate() - 1);

    // Which month the sales figure is actually for, and how much of it has happened.
    //
    // The KPI workbook is closed off monthly. `readKpi` takes the newest month row at or
    // before this morning's, so until somebody fills in August's row the figure is July's —
    // and July's is a *whole month*. This card was measuring it against August's budget
    // prorated to the twelfth day, which is where "251% of budget" came from on a Thursday
    // when nothing unusual had happened. The database shows it plainly: August the fourth
    // read $0, the fifth read $254K climbing normally, and from the tenth it has read
    // $2,944,740.01 every morning without moving — July's closed month, wearing August's
    // label.
    //
    // So the month comes from the figure rather than from the calendar. Its own month means
    // a live month-to-date figure and a budget prorated by the days elapsed; an earlier
    // month means a closed month, measured against the whole of that month's budget. A
    // morning with no month recorded — anything imported before the column existed — is
    // treated as this month, which is what the card assumed before and no worse.
    const said = String(metric('fin_month') ?? '').slice(0, 10);
    const stated = /^\d{4}-\d{2}-\d{2}$/.test(said)
      ? { year: Number(said.slice(0, 4)), month: Number(said.slice(5, 7)) - 1 } : null;
    const onNow = { year: reportDate.getFullYear(), month: reportDate.getMonth() };
    const closed = !!stated && (stated.year !== onNow.year || stated.month !== onNow.month);
    const year = stated?.year ?? onNow.year;
    const month = stated?.month ?? onNow.month;
    const inMonth = new Date(year, month + 1, 0).getDate();
    // A closed month has all of its days; a running one has the days up to yesterday.
    const elapsed = closed ? inMonth : Math.max(1, reportDate.getDate());

    const monthBudget = budgetFor(month);
    // Named, so nobody has to work out which month a figure belongs to from its size.
    const monthName = `${MONTHS[month]}${year === onNow.year ? '' : ` ${year}`}`;
    const mtdTitle = closed ? monthName : `${monthName} to date`;
    const yearBudget = Array.from({ length: 12 }, (_, i) => budgetFor(i)).reduce((a, b) => a + b, 0);
    const actualMtd = Number(metric('fin_actual_mtd') || 0);
    const actualYtd = Number(metric('fin_actual_ytd') || 0);
    // A closed month is measured against the whole of its budget; a running one against the
    // share of it that has elapsed. `elapsed` is already the month's own length when the
    // month is closed, so this is one expression rather than two.
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
    const pane = (key, title, actual, budget, tone, variance, percent, budgetRow,
                  seriesField, expected) => {
      return metricCard({
        chart: 'number', pkey: key, label: title, tone, medium: true,
        // The figure is the reading and the pace is what it means — the two things the
        // room asks for, on the two lines a card already has for them.
        // Medium, like the other five-figure readings on the product. "$21.11M" at the size
        // that suits "98" is the widest thing on any card, and the width it took came out of
        // the graph underneath.
        //
        // The pace is an arrow and a percentage now, not a sentence.
        //
        // "95% of expected" is a number you have to do arithmetic on before it means
        // anything: ninety-five per cent of what was expected is five per cent short, and
        // every reader was working that out for themselves in the one second a card gets.
        // "▼ 5.4%" is the answer, in the form the rest of the product already uses for a
        // variance, and it carries to the back of a room because an arrow does and a
        // sentence does not. No sign in front of the number — the arrow is the sign, and
        // printing both is saying it twice.
        value: money(actual), sub: `${percent >= 0 ? '▲' : '▼'} ${Math.abs(percent).toFixed(1)}%`,
        subTone: tone || 'none',
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
          // The money moved is in the foot now, in the middle, where "Through Aug 11" and
          // "day 11 of 31" used to be. Neither of those was news: one is a date printed on
          // the top bar of the page and the other is a calendar. The figure that says how
          // far ahead of budget the plant is deserved the slot, and the bar keeps the floor
          // to itself so the money above it can be drawn at the size Shipping draws its
          // percentages.
          deltaText: '',
          // The month's own shape. Sales against budget is a race the plant runs once a
          // month, and the line says whether it is being won steadily or was won on one
          // good Thursday — which is the difference between a forecast and a relief.
          deltaTone: tone, series: metricSeries(seriesField),
        }),
        // Budget, what was expected by today, and how far off that we are — three cells,
        // which is what the plant's own dashboard has carried for months and what this card
        // was missing: it showed the budget and the variance and left the reader to work out
        // the number in between. "We are $63K behind" is not a sentence anybody can say from
        // "$3.03M" and "5.4%" — the expected figure is the one that makes the other two mean
        // something.
        //
        // The variance says itself three ways at once, in the order the eye takes them: the
        // arrow, which is the only part of a card that carries to the back of a room; the
        // percentage, which says how big a miss it is; and the money in brackets, which is
        // the figure that gets repeated out loud. A percentage alone cannot be acted on and
        // an amount alone cannot be sized, so both, on the one line, in the corner the
        // variance already had. A fourth cell would have taken a fifth off the size of all
        // of them.
        foot: footLine([
          budgetRow,
          ['Expected', money(expected)],
          ['Variance', `<span class="tone--${tone || 'none'}">${
            esc(`${variancePct(percent)} (${
              variance >= 0 ? '+' : '\u2212'}${money(Math.abs(variance))})`)}</span>`],
        ]),
      });
    };

    return `<div class="grid grid--cards" data-grid="financials">
      ${/* "Budget", not "August budget" — and the short label is not tidiness, it is the
            reason the money screen was drawing small on the wall.
            `fitCards` shrinks a screen while anything on it overflows, and a foot label that
            has been clipped to an ellipsis reports itself as overflowing. Split three ways, a
            wall card gives each foot label about a third of its width; "AUGUST BUDGET" does
            not fit that at any size the label is allowed to take, so the fit went down and
            down against a truncation no amount of shrinking could cure, and took the figure
            with it. The card's own title already says which month it is. */''}
      ${pane('fin-mtd', mtdTitle, actualMtd, planMtd, toneMtd,
        varianceMtd, percentMtd, ['Budget', money(monthBudget)], 'fin_actual_mtd', planMtd)}
      ${pane('fin-ytd', 'Year to date', actualYtd, planYtd, toneYtd,
        varianceYtd, percentYtd, ['Budget', money(yearBudget)], 'fin_actual_ytd', planYtd)}
    </div>`;
  },
};

// ── Drawing the page ────────────────────────────────────────────────────────────

function renderNav() {
  // The dot in the rail is the same verdict as the card, and it was the same colour and
  // nothing else. It carries the mark now, so the rail reads at a glance without relying on
  // anybody being able to separate green from amber at nine pixels.
  const link = (key, label, icon, dot) => `<button class="rail__link" data-nav="${key}"
    aria-current="${state.active === key}"
    title="${esc(label)}${VERDICT[dot] ? ` \u2014 ${VERDICT[dot].word}` : ''}">
    <svg class="rail__ico" viewBox="0 0 24 24"><path d="${icon}"/></svg>
    <span class="rail__txt">${esc(label)}</span>
    <span class="rail__dot rail__dot--${dot}">${VERDICT[dot]?.mark ?? ''}</span></button>`;
  const worstOfAll = band.worst(attention(state.findings).map(f => f.tone));
  $('#nav').innerHTML =
    VIEWS.map(key => link(key, NAV[key], ICONS[key],
      key === 'line' ? (attention(state.findings).length ? worstOfAll : 'ok') : 'none')).join('')
    + `<div class="rail__split"></div>`
    + link('overview', 'Everything', ICONS.overview, 'none')
    + order().map(key => link(key, NAV[key] || TITLES[key], ICONS[key], sectionTone(key))).join('')
    // Configure is a different page, not a section of this one — the plant's shape is not
    // a reading of a morning, and changing it is not the same act as filling one in.
    //
    // It was offered to anyone who could edit the morning, which is nearly everybody: the
    // coordinator who keys the timesheets, the supervisor who writes the review. Those people
    // have every right to the morning and no business renaming a department or taking a card
    // off the wall for the whole plant. Administrators only, which is what `profiles.is_admin`
    // has meant since it was added.
    + (state.me?.is_admin ? `<div class="rail__split"></div>
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
    style="background:${esc(person.colour || '#6C4BB6')}"
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
    element.style.setProperty('--pres', person.colour || '#6C4BB6');
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
  quality:     () => fillQuality(),
  // Front of house gets its own screen rather than a group at the foot of Production. They are not production, they answer to nobody on that screen,
  // and buried under four departments and their last twenty-four hours the invitation went
  // unseen — which for a box nobody is required to fill in means never filled in.
  support:     () => fillSupport(),
  // The review is per department, and the departments are Production's — so the last
  // twenty-four hours belongs on the screen whose cards it draws.
  production:  () => fillProduction() + fillNotes(),
  shipping:    () => fillShipping(),
  financials:  () => fillMoney(),
  attention:   () => fillAttention(),
  // Staffing before overtime, the same way the cards read. Who is in is the question the
  // room asks first and the overtime is what follows from the answer.
  labour:      () => fillStaffing() + fillOvertime()
                   + (mergedUpkeep() ? fillMaintenance({ tight: true }) + fillMaintNote() : ''),
  maintenance: () => fillMaintenance({ tight: true }) + fillMaintNote(),
};

// The next screen down the rail, so Save can be Save-and-carry-on rather than Save-and-stop.
const nextToFill = key => {
  const list = order().filter(k => FILL_FOR[k]);
  return list[list.indexOf(key) + 1] || null;
};

// The order Enter walks, which is the order the meeting walks — what happened to people,
// what the plant made, what left the building, what it earned, what needs fixing. The
// sub-headings are what somebody scanning the rail needs in order to pick, not a description
// of the section: "jobs, cartons, late, short" beats "shipping figures".
const FILL_TABS = [
  { key: 'safety',      sub: 'Injuries and near-misses' },
  { key: 'quality',     sub: 'Shortages, NCRs, complaints, COQ' },
  { key: 'support',     name: 'Pre-production',
    sub: 'Confirmation times, orders booked, and whatever the front of the building wants said' },
  { key: 'production',  sub: 'Output and hours, and the last 24 hours' },
  { key: 'shipping',    sub: 'Jobs, cartons, late, short' },
  { key: 'financials',  sub: "Yesterday's sales" },
  { key: 'labour',      sub: 'Staffing and overtime' },
  { key: 'maintenance', name: 'Maintenance', sub: 'What is booked in, and notes' },
  { key: 'attention',   name: 'Watch list',
    sub: 'What the day ahead turns on \u2014 anyone can add a line' },
  { key: '_all', name: 'All of it', sub: 'The whole morning on one page' },
];

// Support is not one of the dashboard's sections — it is one card inside Production's —
// so it is named here rather than looked up in `order()`, which decides screens and knows
// nothing about it.
// Support is a card rather than a section, so `order()` — which decides screens and knows
// nothing about it — cannot vouch for it. It is named here instead. The board no longer needs
// to be: it is a section, and `order()` carries it like any other.
const fillTabs = () => FILL_TABS.filter(t =>
  t.key === '_all' || t.key === 'support' || order().includes(t.key));

const nextFillTab = key => {
  const list = fillTabs().map(t => t.key);
  const next = list[list.indexOf(key) + 1];
  return next && next !== '_all' ? next : null;
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
    <div class="fill__grid fill__grid--one">${body}
    <div class="fill__end">
      <p>Every box writes as you leave it — Save is here because a screen that saves
        invisibly gives nobody a reason to believe it did.</p>
      <div class="fill__go">
        <button class="btn" data-mode="cards">See the cards</button>
        ${state.canEdit ? `<button class="btn btn--go" data-save-section="${esc(key)}">${
          next ? `Save — on to ${TITLES[next]}` : 'Save'}</button>` : ''}
      </div>
    </div></div>
  </div>`;
}

const one = (key, solo = false) => {
  // Only on its own screen. The overview stacks every section, and a page of seven entry
  // forms one under another is the screen this splits up rather than a second copy of it.
  const fillable = solo && state.canEdit && !!FILL_FOR[key];
  return `<section class="sec"><div class="sec__head">
    <h2 class="sec__title">${TITLES[key]}</h2>
    ${freshLine(key)}
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
  // The plant's own answer about trend lines, on the body so present mode and the page get
  // it from one place.
  document.body.classList.toggle('no-trends', !!state.plant?.hide_trends);
  // One section or two, and the heading says which.
  // Merged, Labour's screen carries the bookings as well and its title has to say so. Split,
  // the two are separate sections with separate names — and Maintenance is then the section
  // rather than the card, so it is not called "Upcoming maintenance" twice down one screen.
  TITLES.labour = state.plant?.merge_upkeep ? 'Maintenance & Labour' : 'Labour & Overtime';
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
//
// Two things that are *meant* to truncate are deliberately not in this list, and leaving them
// in was costing whole screens.
//
// The card title has a cap of its own, `--tcap`, settled in its own loop before the fit is
// touched — and it is settled against every title the product can draw, so a screen showing
// "Days since near-miss" ends up with that title clipped on purpose rather than with a bar
// twice the height of every other screen's. Counting the clip as an overflow sent `--fit`
// down to the floor chasing it, which is why Safety drew a two-digit streak the size of a
// caption on the wall.
//
// A foot label is the same story with `--lc`. Split three ways a wall card gives each label
// about a third of its width, "AUGUST BUDGET" does not fit that at any size the label is
// allowed to take, and the money screen shrank and shrank against a truncation no amount of
// shrinking could cure. Both degrade gracefully by design; neither should be allowed to
// govern how large the figure beside it is drawn.
function overflows(card) {
  if (usedBy(card) > roomIn(card) + 1) return true;
  // A list that has outgrown the box it is in.
  //
  // `usedBy` measures the body's rows by their layout boxes, and a box whose contents overrun
  // it reports its own height, not its contents'. That is the right answer for a hero, which
  // overruns its line box by design; it is the wrong answer for the three things on this
  // product that are lists — last week's departments, the overtime rows, and a note read back
  // as bullets. Those grow with the morning, and when they outgrow the card the card is full
  // whatever its layout box says. Last week's three departments overran their card by twenty
  // pixels on a magnified section and the fit went on climbing past it.
  // `usedBy` measures the body's rows by their layout boxes, and a box whose contents overrun
  // it reports its own height, not its contents'. That is the right answer for a hero, which
  // overruns its line box by design; it is the wrong answer for the middle zone, which is the
  // one that takes whatever height is left over and is therefore the one a list grows out of.
  // Last week's three departments overran it by twenty pixels on a magnified section and the
  // climb went straight past, because every layout box it measured still reported the size it
  // had been given.
  //
  // Three pixels of tolerance, not one: a hero at .95 line-height leaves a glyph or two
  // hanging past the zone on some faces, and that is not a card running out of room.
  for (const zone of card.querySelectorAll('.card__mid')) {
    if (zone.scrollHeight > zone.clientHeight + 3) return true;
  }
  for (const part of card.querySelectorAll(
    '.flag,.hero,.unit,.total,.fs__v,.ctrack__l,.ctrack__d')) {
    // Half a pixel, not one.
    //
    // A pixel of tolerance sounds like rounding and is not: these are integers, so a part
    // that fits reports the two exactly equal and a part that has been clipped reports one
    // more. "One more" was the case the tolerance was swallowing — "▼ −34.0%" wanted 256 in
    // 255 and drew as "▼ −34.0…" while the fit went on climbing, which is the one thing this
    // loop exists to notice.
    if (part.scrollWidth > part.clientWidth + 0.5) return true;
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
  // Whatever levelling the last render left behind comes off before anything is measured.
  // A row floor set by the previous pass would be read back as room the cards have, and the
  // type would climb a step every time the page redrew.
  $('#content')?.style.removeProperty('--row-h');
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

    // One figure size for the whole screen.
    //
    // Every card carried its own digit count and shrank its own number to fit it, so
    // "3,000" was drawn at one size and "11,917" beside it at another - two cards of the
    // same design showing the same kind of reading at two type sizes, which reads as two
    // kinds of card. The longest number on the screen decides, and every card is drawn to
    // it. The count travels as `--hchars` on each figure and the answer as `--chars` on the
    // grid, so the cascade does the sharing rather than a second loop.
    const widest = Math.max(3, ...group.flatMap(grid =>
      [...grid.querySelectorAll('.hero')]
        .map(h => Number(h.style.getPropertyValue('--hchars')) || 3)));
    for (const grid of group) grid.style.setProperty('--chars', String(widest));
    // The same measurement for the foot's captions, which never had one.
    //
    // `.fs__l` is capped by "how many characters it holds" over "how wide its column is" —
    // and the character count was a CSS default that nothing ever set. So the cap never
    // bound: what actually decided the foot's size was a share of the card *before*
    // `fitCards()` has had its say. The consequence is the one the room reported. On a sparse
    // wall slide the fit runs the card's contents up by more than two, the figure goes from
    // 66px to 281 — and the foot, which is not multiplied by the fit, stays where it was. A
    // card whose parts stop growing together is a card that looks like two designs at the
    // size it is read from.
    //
    // Measured, the cap becomes true, and the foot can be sized off `--u` like everything
    // else above it without "LAST NEAR-MISS" running off the side of the card. The longest
    // caption on the whole screen decides, for the same reason `--chars` does: two cards in a
    // row drawing their feet at two sizes is the thing being fixed. The values are settled
    // per row rather than per screen — `footLine` counts what its own row holds — because a
    // row's three columns are `auto` and a row is the width the values have to share.
    const longest = (selector, floor) => Math.max(floor, ...group.flatMap(grid =>
      [...grid.querySelectorAll(selector)].map(part => (part.textContent || '').trim().length)));
    const lc = longest('.fs__l', 4);
    for (const grid of group) grid.style.setProperty('--lc', String(lc));
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
    // One last look with the zones switched back on.
    //
    // Everything above is measured in `measuring`, which stacks a card's three zones so they
    // each take their content height — that is what has to fit, and it is the only state in
    // which the climb can push against anything. It is also a state in which nothing can
    // overflow: the middle zone is `flex:0 0 auto` there and grows to whatever is in it. So a
    // card can pass every check in the loop and still, once the zones go back on and the
    // middle one is clamped to what is left, have a list hanging twenty pixels past the
    // bottom of it. Last week's three departments did exactly that on a magnified section.
    //
    // This is the same question asked of the finished card. Bounded, because it is a safety
    // net rather than a search: a dozen steps takes a fifth off the size, and anything that
    // still does not fit at that point is not going to.
    const spilling = () => cards.some(card =>
      [...card.querySelectorAll('.card__mid')].some(zone =>
        zone.scrollHeight > zone.clientHeight + 3));
    for (let guard = 0; guard < 12 && fit > FIT_MIN && spilling(); guard++) {
      fit -= 0.02;
      set(fit);
    }
  }
  levelRows();
}

// Every card on the page as tall as a department card — and not one pixel taller.
//
// This runs *after* `fitCards`, and the order is the whole of it. `fitCards` settles one type
// size for the page by dividing the room in each card by what that card is using, so anything
// that makes cards taller before it measures hands it more room and it draws every figure
// larger. Declaring the row height in the stylesheet did exactly that: the department cards
// were asked to be the yardstick and were the first thing to move.
//
// So the grid stays content-sized while the fit is worked out, Production comes out exactly
// as it always did, and only then is the rest of the page pushed up to meet it. Nothing
// measured here can feed back: `--cu` is derived from the card's width and the constant
// `--card-h`, never from the height a row happens to be, so a taller card is a taller card
// and the type on it does not move.
//
// Production is the yardstick because the room said so — it is the fullest card the product
// has, so matching it never has to shrink anything. With no Production on screen the tallest
// card there is stands in, which is the same rule over a smaller set.
function levelRows() {
  if (document.body.classList.contains('tv')) return;
  const content = $('#content');
  if (!content) return;
  content.style.removeProperty('--row-h');
  const from = content.querySelector('.grid--cards[data-grid="production"]') ?? content;
  // A card that is deliberately two rows tall is not a candidate for the row height.
  // Measuring it would set every card on the screen to twice the height it needs, and the
  // tall card is sized off `--row-h` in turn — so the two would climb each other.
  const cards = [...from.querySelectorAll('.card:not(.card--tall)')];
  if (!cards.length) return;
  const tallest = Math.max(...cards.map(card => card.getBoundingClientRect().height));
  if (tallest > 0) content.style.setProperty('--row-h', `${Math.round(tallest)}px`);
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
// The cards that go up whether or not anything has been written on them.
//
// A blank note card is dropped from the wall — four cards reading "No issues reported" on a
// screen the floor walks past is four cards of nothing. These three are the exception, and
// they are the exception for one reason: they are the parts of the morning the meeting *does*
// rather than reads. "Die Cutting — not confirmed yet" is not an empty card, it is the
// question being asked of the room; an empty board is the meeting being asked what today
// needs; an empty front-of-house card is the same question put to the people who take the
// calls; and staffing is the question the room asks before any other — who is off, who is on,
// who is on vacation — which is why the overtime beside it is read second. Dropping them
// showed each one only once it had already been answered, which is the one moment nobody
// needs to see it.
const ALWAYS_UP = /^(rev-|attention$|support$|staffing$)/;
// The collage, as opposed to the walk or the page. A card that is drawn in all three has to
// be able to ask, because a tile among forty holds a fraction of what a slide does.
const onePage = () => document.body.classList.contains('tv') && state.wallMode === 'all';
const wallHidden = () => new Set(state.plant?.wall_hidden || []);
// The one page is a different room from the walk and now keeps a different list. A plant that
// wants its sales out of the corridor but still in the meeting says so once, here.
const pageHidden = () => new Set(state.plant?.page_hidden || []);
const soloSections = () => new Set(state.plant?.solo_sections || []);

function wallPages() {
  const pages = [];
  const off = state.wallMode === 'all' ? pageHidden() : wallHidden();
  const solo = soloSections();
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
      .filter(card => !off.has(card.dataset.pkey)
        // A blank note card is dropped from the wall — four cards reading "No issues
        // reported" on a screen the floor walks past is four cards of nothing. The review
        // is the exception, and it is the exception because it is the only part of the
        // morning the meeting *does* rather than reads: "Die Cutting — not confirmed yet"
        // is not an empty card, it is the question being asked of the room. Dropping them
        // meant the wall showed the review only once every department had already answered,
        // which is the one moment nobody needs to see it.
        //
        // Named by their own keys, not by which grid they are in. The test used to be
        // `parentElement.dataset.grid === 'review'`, which was true while the review had a
        // grid of its own and stopped being true the day Production became one arrangement —
        // a department's rate above its own review card. Nothing failed loudly; the review
        // simply went missing from the wall on every morning nobody had written on it yet,
        // which is every morning at the moment the meeting starts.
        && (card.dataset.empty !== '1' || ALWAYS_UP.test(card.dataset.pkey || '')));
    // Which section a card belongs to, carried on the card. The collage has no headings —
    // the bar's colour is the heading — so this is the only thing that groups them.
    for (const card of cards) card.dataset.fam = key;
    // Nothing but cards goes on the wall now. Two tables used to be allowed up — the
    // maintenance schedule and last week's productivity — each on the argument that what the
    // room needed off it was five columns wide. Both are cards, so the exception has nothing
    // left to except, and a screen is one grid again.
    if (!cards.length) continue;
    // Production is arranged rather than dealt, because it is the one section whose cards
    // are not interchangeable.
    //
    // Three departments across the top, what each of them reported in the last twenty-four
    // hours directly underneath its own department, and last week's productivity down the
    // right across both rows. That is what the page draws and what the room reads it as: a
    // column is a department. `bestGrid` knows none of that — it sees seven cards, deals
    // them four and three, and the tall card that is two rows high on the page tore the
    // arrangement open and ran off the bottom of the slide.
    //
    // Its column count is the departments plus one for the tall card, and it is two rows
    // deep, which comes out at the same card size `bestGrid` was choosing anyway. The
    // stylesheet does the placing, from the same two rules the page uses.
    const tall = cards.filter(card => card.classList.contains('card--tall')).length;
    const prod = key === 'production' && tall === 1 && cards.length > 2;
    const across = prod ? Math.max(1, Math.round((cards.length - tall) / 2)) : 0;
    const deal = prod ? { cols: across + 1, rows: 2, prod: across } : bestGrid(cards.length);
    // A section of sentences never shares a slide. Everything else may be packed.
    pages.push({ key, ...deal, solo: solo.has(key) || key === 'attention', count: cards.length,
                 html: cards.map(card => card.outerHTML).join('') });
  }
  if (state.wallMode === 'all') return pages;

  // Sections that did not ask for a screen of their own share one when they are small.
  //
  // Every section used to get a slide whatever was on it, and the only thing that ever put
  // two together was `merge_upkeep` — one boolean for one pair, which is what a setting looks
  // like when it is written for the first plant that asks. Two cards on a screen the size of
  // a wall is a screen of margins, and a walk that spends a slide on it is a walk people stop
  // watching. A section ticked "own slide" always gets one; the rest are packed with their
  // neighbours up to six cards, which is the point where `bestGrid` stops drawing a card
  // large enough to read from the back of the room.
  const packed = [];
  for (const page of pages) {
    const last = packed[packed.length - 1];
    if (!page.solo && !page.prod && last && !last.solo && !last.prod
        && last.count + page.count <= 6) {
      last.count += page.count;
      last.html += page.html;
      last.keys = [...(last.keys || [last.key]), page.key];
      Object.assign(last, bestGrid(last.count));
      continue;
    }
    packed.push({ ...page });
  }
  return packed;
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

// The chip row fits the width it has, whatever that is.
//
// It wrapped before — two lines on a laptop, three on a narrow one — which pushed the cards
// down the screen and gave the header a different height on every machine the plant owns. A
// row of controls that reflows is a row whose buttons move every time you look at it.
//
// Measured rather than guessed, for the same reason the card titles are: how wide "CUSTOMER
// SERVICE, DIE SHOP & PREPRESS" comes out depends on which letters are in it. The row is
// asked whether it overflows, and the multiplier comes down in eighths until it does not.
// Eighteen steps reaches a third of full size, which is past the point where the ellipsis on
// the longest name is the better answer — and the stylesheet leaves it that ellipsis rather
// than a second line.
function fitLegend(legend) {
  if (!legend) return;
  legend.style.removeProperty('--chip');
  legend.classList.remove('legend--tight');
  let chip = 1;
  for (let step = 0; step < 15 && legend.scrollWidth > legend.clientWidth + 1; step++) {
    chip -= 0.04;
    legend.style.setProperty('--chip', String(chip));
  }
  // Still too wide at 40% of full size, which is a phone. The names give way rather than the
  // row: the chips are allowed to shrink and ellipsise from here, longest first.
  if (legend.scrollWidth > legend.clientWidth + 1) legend.classList.add('legend--tight');
}

function renderWallPage(pages) {
  const content = $('#content');
  const shown = pages.filter(p => p.html);
  // The names across the top are buttons, and pressing one brings that section forward.
  //
  // One page is forty cards at the size forty cards can be, which answers "is the plant all
  // right" and cannot answer "what does Quality say" — for that the room had to leave the
  // page, walk the slides to the right one, and walk back. The chips were already there,
  // already the colour of the section, already the thing an eye goes to. Pressing one deals
  // that section at the size the walk deals it, in the middle of the screen; pressing another
  // swaps; pressing the lit one puts the whole morning back. It is present mode on demand,
  // driven by a person rather than by a step counter.
  //
  // The bar itself does not move between the two. That is the point of doing it here rather
  // than by jumping into the walk: what you pressed stays where you pressed it, lit, with
  // everything else still beside it.
  const up = shown.find(p => p.key === state.zoom) || null;
  content.className = `content wall${up ? ' wall--up' : ' wall--snap'}`;
  content.innerHTML = `
    <div class="wall__top">
      <h2>${esc(state.locations.find(l => l.id === state.location)?.name || '')}</h2>
      <div class="legend">
        ${/* All, first, because "show me everything again" is the thing a person wants most
              often and it was only reachable by remembering which chip was lit and pressing
              that one. It is a chip like the others rather than a back arrow: the row is a
              set of views and this is one of them, so it lights the same way and sits where
              a reader's eye starts. */''}
        <button type="button" class="legend__i legend__i--all${up ? '' : ' legend__i--on'}"
          data-zoom="" aria-pressed="${!up}">All</button>
        ${shown.map(p =>
        `<button type="button" class="legend__i${p === up ? ' legend__i--on' : ''}"
           data-zoom="${esc(p.key)}" data-fam="${esc(p.key)}"
           aria-pressed="${p === up}">${esc(TITLES[p.key])}</button>`).join('')}</div>
      <span class="wall__date">${$('#date-long').textContent}</span>
    </div>
    ${up
      ? `<div class="grid grid--cards${up.prod ? ' grid--prod' : ''}" data-grid="${esc(up.key)}"
             style="--wall-cols:${up.cols};--wall-rows:${up.rows}${
               up.prod ? `;--prod-cols:${up.prod}` : ''}">${up.html}</div>`
      : `<div class="grid grid--cards grid--snap" data-grid="wall">${
          shown.map(p => p.html).join('')}</div>`}`;
  fitLegend(content.querySelector('.legend'));
  // A magnified section is measured against the room it has rather than against the screen.
  //
  // `--wall-h` on the walk is the screen less a fixed allowance for the chrome, which is right
  // there because the chrome is one line. Here the chip bar wraps to two lines on a narrow
  // screen and three on a phone, so the allowance is whatever is left after it — which the
  // browser has just worked out, and which is exactly what this reads back.
  const front = content.querySelector('.grid--cards:not(.grid--snap)');
  if (front) {
    front.style.setProperty('--wall-h', `${Math.round(front.getBoundingClientRect().height)}px`);
    return;
  }
  const grid = content.querySelector('.grid--snap');
  if (!grid) return;
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
      <h2>${esc((page.keys || [page.key]).map(k => TITLES[k] || k).join(' · '))} · ${
        esc(state.locations.find(l => l.id === state.location)?.name || '')}</h2>
      ${(page.keys || [page.key]).map(freshLine).filter(Boolean).join('')}
      <span class="wall__date">${$('#date-long').textContent}</span>
    </div>
    <section class="sec">
      <div class="grid grid--cards${page.prod ? ' grid--prod' : ''}"
           data-grid="${esc(page.key)}"
           style="--wall-cols:${page.cols};--wall-rows:${page.rows}${
             page.prod ? `;--prod-cols:${page.prod}` : ''}">${page.html}</div>
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
  savedTimer = setTimeout(() => saved(unsent.size ? holdingText() : 'All changes saved'), 700);
}

// ── Writes that did not land ────────────────────────────────────────────────────
//
// A save used to fail like this: the error was caught, its message was put into the small
// grey line at the top of the page, and that was the whole of it. The value stayed in local
// state, so the person who typed it went on seeing their own number; the amber bar had
// already come off the box when they left it; and the wall — reading from the database —
// went on showing the old one. Two screens, two numbers, and the only notice was a line of
// text next to the date that nobody looks at twice.
//
// That is the most dangerous shape a bug can take on this product. Everything else here is
// about a number being wrong; this is about a number being wrong *and looking right to the
// person who would have caught it*.
//
// So a write that fails is held, not dropped. It keeps its field marked, it is retried, and
// while anything is outstanding the page says so in a place that cannot be scrolled past and
// Present will not open. The morning cannot be published either — publishing a morning with
// an unsent write in it is publishing a screen that does not match its own database.
const unsent = new Map();
const holdingText = () => `${unsent.size} change${unsent.size === 1 ? '' : 's'} not saved`;

function markUnsent(name, value, why) {
  unsent.set(name, { name, value, why });
  paintUnsent();
}
function clearUnsent(name) {
  if (unsent.delete(name)) paintUnsent();
}

// The banner, the marks on the fields, and the two doors that stay shut.
function paintUnsent() {
  const bar = $('#unsent');
  if (bar) {
    bar.classList.toggle('hide', unsent.size === 0);
    const one = [...unsent.values()][0];
    bar.querySelector('.unsent__t').textContent = unsent.size === 1
      ? `1 change has not been saved — ${one.why}`
      : `${unsent.size} changes have not been saved — ${one.why}`;
  }
  saved(unsent.size ? holdingText() : 'All changes saved');
  $('#saved').classList.toggle('saved--bad', unsent.size > 0);
  // A field that did not save keeps its mark until it does. `.inp--held` is the amber bar a
  // box wears while it is being typed in; this is the red one it wears when the write failed,
  // and unlike the amber one nothing takes it off but a successful write.
  for (const box of document.querySelectorAll('[data-field]')) {
    box.classList.toggle('inp--lost', unsent.has(box.dataset.field));
  }
  // Present mode and publishing are both statements that the morning is ready to be believed.
  $('#tv-btn')?.toggleAttribute('disabled', unsent.size > 0);
}

// Try again, quietly, and keep trying. A dropped connection at half past seven comes back;
// what must not happen is the coordinator having to notice and retype.
let retryTimer;
function retrySoon() {
  clearTimeout(retryTimer);
  if (!unsent.size) return;
  retryTimer = setTimeout(async () => {
    for (const held of [...unsent.values()]) await persist(held.name, held.value);
    retrySoon();
  }, 6000);
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
    else await saveField(state.location, state.date, name, value, beganAt(name));
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
    clearUnsent(name);
    startedFrom.delete(name);
    noteSaved();
    recordEdit(state.location, state.date, name, value);
  } catch (error) {
    // Somebody else moved this reading while it was being typed.
    //
    // Asked rather than resolved, because there is no rule that gets this right: the
    // coordinator reading the DOR and the manager reading the sheet in their hand are both
    // entitled to the number, and which is correct is a fact about the plant that the page
    // does not have. Both values are put in the question, because "there is a conflict" is
    // not a thing anybody can answer.
    const clash = error.cause?.conflict ?? error.conflict;
    if (clash) {
      // The field's own name, said the way the screen says it, and a blank said as blank.
      const label = String(name).replace(/_/g, ' ').replace(/\bmtd\b/, 'month to date')
        .replace(/\bytd\b/, 'year to date').replace(/^./, c => c.toUpperCase());
      const shown = value => (value === null || value === '' ? 'nothing'
        : Number.isFinite(Number(value)) ? num(value) : String(value));
      const keepMine = confirm(
        `${label} \u2014 somebody else saved ${shown(clash.theirs)} while you were editing.`
        + `\n\nYours is ${shown(clash.mine)}.`
        + `\n\nOK replaces theirs with yours. Cancel keeps theirs.`);
      startedFrom.delete(name);
      if (keepMine) {
        // Written without a guard this time: the question has been asked and answered.
        try {
          await saveField(state.location, state.date, name, value);
          clearUnsent(name);
          noteSaved();
          recordEdit(state.location, state.date, name, value);
        } catch (again) { markUnsent(name, value, again.message); retrySoon(); }
      } else {
        applyLocally(name, clash.theirs);
        clearUnsent(name);
        render();
      }
      return;
    }
    // Held rather than lost. The number stays on the screen — it is the person's own and
    // they are right about it — and the page stops claiming it has been written down.
    markUnsent(name, value, error.message || 'the network did not answer');
    retrySoon();
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
    // A row that is not there yet is made, the way labour's is. Opening a morning seeds a
    // review row for every configured department, so this never came up — until customer
    // service, the die shop and prepress, which are not configured departments and have no
    // row until somebody types. Without this the write reached the database and the card
    // went on saying nobody had spoken until the page was reloaded.
    if (row) row[second] = value;
    else state.review.push({ dept_key: first, status: null, note: '', [second]: value });
  } else if (kind === 'budget') {
    const month = Number(first);
    const existing = state.budgets.find(b => b.month === month);
    if (existing) existing.amount = value ?? 0;
    else state.budgets.push({ month, amount: value ?? 0 });
  } else if (state.metrics) {
    state.metrics[name] = value;
  }
}

// Typing does not save, and typing does not redraw.
//
// It used to do both. A field wrote 450ms after the last keystroke and the whole page
// redrew 900ms after it, putting the caret back afterwards. On paper that is a page that
// keeps up with you. In a plant it is this: somebody types the "1" and the "5" of
// 1,500,000, pauses to look at the sheet in their other hand, and the page rebuilds itself
// underneath them, drops the caret at the front of the box, and the next digit lands in the
// wrong place. Every number long enough to need a glance away was at risk, which is every
// number that matters.
//
// Putting the caret "back where it was" was never possible either: `focus()` on a freshly
// built `<input type="number">` cannot be given a caret position at all — the browser will
// not accept a selection range on one — so the best the old code could do was land at one
// end of the text. There is no version of redraw-while-typing that is safe here.
//
// So a box now behaves the way a box in a spreadsheet behaves. What you type changes only
// what is on the screen. It is written when you leave the field, or press Enter, or press
// Save — which is what `change` means on an input, and what the room asked for in the same
// words: don't save it until I say I'm done.
//
// `waiting` is still the one write that has not gone. Save flushes it, because the box
// somebody is still standing in is the only box Save has any business worrying about.
let waiting = null;
async function flushWrites() {
  const now = waiting;
  waiting = null;
  if (now) await persist(now.name, now.value);
}

// A redraw recalculates every rate, every colour and every verdict, so it rebuilds the
// fields as well. Where the page still has to redraw with somebody in a box — leaving one
// field for the next lands `change` on the first while the caret is already in the second —
// this puts them back in it, with the caret where they left it wherever the browser allows.
function redrawKeepingCaret() {
  const at = document.activeElement;
  const name = at?.dataset?.field;
  const from = at?.selectionStart, to = at?.selectionEnd;
  render();
  if (!name) return;
  const back = document.querySelector(`[data-field="${CSS.escape(name)}"]`);
  if (!back) return;
  back.focus();
  // Number, date and colour inputs reject a selection range outright. Nothing to do for
  // them but leave the caret where focus put it.
  try { if (from != null) back.setSelectionRange(from, to); } catch { /* not a text box */ }
}

document.addEventListener('input', event => {
  const box = event.target;
  const name = box.dataset?.field;
  if (!name) return;
  // A dropdown and a tick have no half-typed state, so they are written by `change` below
  // the instant they are touched rather than being held here.
  if (box.tagName === 'SELECT' || box.type === 'checkbox') return;
  const value = parse(box, box.value);
  // The screen keeps up — the card behind the entry screen reads `state`, not the box — but
  // nothing is written and nothing is rebuilt.
  applyLocally(name, value);
  waiting = { name, value };
  box.classList.add('inp--held');
});

document.addEventListener('change', event => {
  const box = event.target;
  const name = box.dataset?.field;
  if (!name) return;
  // A tick is one of a set, so what is written is the whole set. Reading the boxes back off
  // the page rather than keeping a list beside them means the ticks and the row can never
  // disagree about which machines are running.
  if (box.type === 'checkbox') {
    const chosen = [...document.querySelectorAll(`input[type="checkbox"][data-field="${
      CSS.escape(name)}"]`)].filter(tick => tick.checked).map(tick => tick.dataset.machine);
    applyLocally(name, chosen);
    persist(name, chosen);
    render();
    return;
  }
  if (box.tagName === 'SELECT') {
    applyLocally(name, box.value);
    persist(name, box.value);
    render();
    return;
  }
  // Everything else — a number, a date, a line of text, a note. `change` on an input fires
  // when the box is left or Enter is pressed and not before, which is exactly the moment
  // the value is finished with.
  const value = parse(box, box.value);
  waiting = null;
  box.classList.remove('inp--held');
  applyLocally(name, value);
  persist(name, value);
  redrawKeepingCaret();
});

// What a field held when somebody started changing it.
//
// Recorded on focus, before the first keystroke, because that is the value the person is
// deciding against — "it says 13,500 and it should be 53,460". It is what the write is
// matched on, so a reading somebody else moved in the meantime is caught rather than
// silently replaced. Cleared as soon as the write lands.
const startedFrom = new Map();
const beganAt = name => startedFrom.has(name) ? startedFrom.get(name) : undefined;

document.addEventListener('focusin', event => {
  const name = event.target?.dataset?.field;
  if (name && !startedFrom.has(name)) startedFrom.set(name, readingOf(state.metrics, name) ?? null);
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
    const fortnight = weekSpan(date);
    const [day, budgets, history, months, machines, upcoming, weeks] = await Promise.all([
      loadDay(location, date),
      loadBudgets(location, dateOf(date).getFullYear()),
      loadHistory(location, from.toISOString().slice(0, 10), date),
      loadYearCounts(location, dateOf(date).getFullYear()),
      loadMachines(location),
      loadUpcoming(location, date),
      loadWeeks(location, fortnight.priorFrom, fortnight.to),
    ]);
    Object.assign(state, day, { budgets: budgets || [], history, year: months || [],
                                machines: machines || [], upcoming: upcoming || [],
                                weeks: weeks || [] });
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
  // Leaving edit mode is a person saying they have finished. See `goUp()`.
  if (!on) goUp({ finished: true });
  paintPresence();
});

// The entry screen finishes with Publish, because that is where a person finishes.
document.addEventListener('click', event => {
  const go = event.target.closest('.fill [data-nav]');
  if (go) { state.active = go.dataset.nav; render(); window.scrollTo(0, 0); return; }
  if (event.target.closest('#reset-day')) startAgain();
});

// Moving between the screens of Enter. The box being typed in is flushed on the way out —
// clicking a rail item is leaving a field, and a field that is left has been finished with.
document.addEventListener('click', async event => {
  const tab = event.target.closest('[data-filltab]');
  if (!tab) return;
  await flushWrites();
  state.fillAt = tab.dataset.filltab;
  render();
  window.scrollTo(0, 0);
});

// Switching which department a comment is about — the three support ones, or a production
// department on the staffing note. It only changes which note is in the box; nothing is
// written, because nothing has been typed yet.
document.addEventListener('change', event => {
  if (event.target.id === 'att-who') {
    state.attentionAt = event.target.value;
    render();
    document.querySelector('#att-note')?.focus?.();
    return;
  }
  if (event.target.id !== 'staff-who') return;
  state.staffAt = event.target.value;
  render();
  document.querySelector('#staff-note')?.focus?.();
});

// Add, and take one off again.
//
// Both write the whole of that name's note, because a note is lines and this is editing the
// list of them. Both go straight to `persist` rather than through the typing path — there is
// nothing to debounce about a button, and the point of the button is that the person knows
// it happened the moment they press it.
// Clean up and Rewrite, and the one Undo they share.
//
// Neither re-renders. Everything else on this page redraws from state after a change, and a
// redraw here would throw away whatever else the person has typed — the box is not saved yet,
// and on a jotted card that is the whole point of cleaning a line up before Add. So this
// edits the two elements it is about and nothing else.
//
// The Clean up button becomes Undo and carries the original wording, which is the smallest
// form of "you can put yours back" that does not need a second control or a dialogue.
//
// Which box a control belongs to is answered by where it is, not by a lookup.
//
// It used to be `[data-jot="<field>"]`, which was fine while the only boxes with a Clean up
// were the ones `jotLines` builds. They are on every field that takes a sentence now — the
// maintenance note, the whole-plant staffing box, each department's last twenty-four hours —
// and those carry `data-field`, not `data-jot`. Worse, the entry screen draws several at
// once, so a lookup by name is a lookup that can find somebody else's box. Climbing out from
// the control until a box appears finds the one it was drawn beside, every time.
const aidBox = control => {
  const takes = 'textarea[data-jot],textarea[data-field],input[data-jot],input[data-field]';
  for (let node = control.parentElement; node; node = node.parentElement) {
    const found = node.querySelector(takes);
    if (found) return found;
  }
  return null;
};

// A box that saves itself is told it changed.
//
// `data-jot` boxes are staging: nothing is written until Add, so replacing the value is the
// whole of the job. A `data-field` box is the reading itself, saved by the typing path — and
// a value set from script fires no event, so the maintenance note would have been cleaned up
// on screen and left unsaved. These are the two events a person typing would have raised.
const aidSaved = box => {
  if (!box.dataset.field) return;
  box.dispatchEvent(new Event('input', { bubbles: true }));
  box.dispatchEvent(new Event('change', { bubbles: true }));
};

// No key at this plant. Say so on the control rather than taking it off the screen.
//
// It used to remove itself — the argument being that a control which cannot work is worse
// than no control. That argument was wrong in the one way that matters: a control that
// vanishes when you press it looks exactly like a control that is broken, and the person who
// pressed it is left with a box, no button and no idea what happened. The room reported it as
// "nothing happened" and then as "the rewrite button is gone".
//
// So it stays where it is, disabled, saying what is wrong. No render, so nobody loses what
// they were typing, and one line of the menu carries the reason.
const aidsOff = said => {
  state.tidyOff = true;
  for (const menu of document.querySelectorAll('[data-tone]')) {
    menu.disabled = true;
    const first = menu.querySelector('option');
    if (first) first.textContent = 'Rewrite \u2014 not set up';
    menu.title = said || 'Rewriting needs an API key in this plant\u2019s settings.';
  }
  toast(said || 'Rewriting is not set up for this plant. It needs an API key in settings.');
};

// One call for every one of them, because from the writer's side they are one act: something
// happens to the box, you look at it, and you keep it or you put yours back.
//
// The Undo lives beside the menu and is hidden until there is something to undo, so what is
// on screen is always "Rewrite, Add" or "Undo, Add" and never three things at once.
async function runAid(control, box, tone, done) {
  const group = control.closest('.aid');
  const undo = group?.querySelector('[data-undo]');
  const said = String(box.value || '').trim();
  if (!said) { box.focus(); return; }
  control.disabled = true;
  // The menu says what it is doing where it normally says what it can do, so the person who
  // pressed it is not watching a control that looks idle.
  const holding = control.querySelector('option');
  const wasLabel = holding?.textContent;
  if (holding) holding.textContent = 'Working\u2026';
  try {
    const answer = await tidyText(said, state.location, tone);
    if (answer.unavailable) { aidsOff(answer.error); return; }
    if (answer.error) { toast(answer.error); return; }
    if (answer.text === said) { toast('Nothing to change \u2014 it already reads that way.'); return; }
    // The words the writer typed. One box, one way back, whichever entry did the work.
    if (undo && undo.dataset.was == null) undo.dataset.was = said;
    box.value = answer.text;
    aidSaved(box);
    undo?.classList.remove('hide');
    control.classList.add('hide');
    toast(`${done} \u2014 or Undo for your own words.`);
  } catch (error) {
    toast(error.message);
  } finally {
    control.disabled = false;
    if (holding) holding.textContent = wasLabel;
  }
}

// Rewrite is a menu of verbs, so it acts on being chosen and then forgets what was chosen.
// Leaving "Shorter" showing would make it look like a setting the box is now under, when what
// happened is that the box was made shorter once.
//
// The resting entry carries an em dash rather than an empty string, because "Fix spelling" is
// the empty tone — no register change, just the spelling — and the two have to be told apart.
document.addEventListener('change', async event => {
  const tone = event.target.closest?.('[data-tone]');
  if (!tone || tone.value === '\u2014') return;
  const asked = tone.value;
  tone.value = '\u2014';
  const box = aidBox(tone);
  if (!box) return;
  const named = (TONES.find(([key]) => key === asked) || [, asked])[1];
  await runAid(tone, box, asked, `Rewritten \u2014 ${named.toLowerCase()}`);
});

document.addEventListener('click', async event => {
  const undo = event.target.closest?.('[data-undo]');
  if (undo) {
    const box = aidBox(undo);
    if (!box) return;
    if (undo.dataset.was != null) {
      box.value = undo.dataset.was;
      delete undo.dataset.was;
      aidSaved(box);
    }
    undo.classList.add('hide');
    undo.closest('.aid')?.querySelector('[data-tone]')?.classList.remove('hide');
    box.focus();
    return;
  }

  const add = event.target.closest?.('[data-add]');
  if (add) {
    const field = add.dataset.add;
    const box = document.querySelector(`[data-jot="${CSS.escape(field)}"]`);
    const lines = String(noteOf(field)).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const open = editingLine(field);
    const typed = String(box?.value || '').replace(/\s+/g, ' ').trim();
    if (!typed) { box?.focus(); return; }
    // Changing a line keeps the signature the line already had — the words are being
    // corrected, not re-said by whoever happens to be at the screen. A line written before
    // signatures existed stays unsigned rather than acquiring somebody else's initials.
    // Signing happens here rather than in the box, so what somebody types is what they see
    // while they are typing it, and Clean up never has a signature in front of it to correct.
    const said = open
      ? (SIGNED.exec(lines[open.line] || '')
          ? `${SIGNED.exec(lines[open.line])[1]} ${SIGNED.exec(lines[open.line])[2]} — ${typed}`
          : typed)
      : (isAttention(String(field).split(':')[1]) ? typed : signLine(typed));
    if (!said) { box?.focus(); return; }
    if (open) lines[open.line] = said; else lines.push(said);
    state.jotEdit = null;
    const next = lines.join('\n');
    applyLocally(field, next);
    if (box) box.value = '';
    render();
    toast(open ? 'Changed' : 'Added');
    try { await persist(field, next); } catch (error) { toast(error.message); }
    return;
  }
  const pencil = event.target.closest?.('[data-edit-line]');
  if (pencil) {
    state.jotEdit = { field: pencil.dataset.editLine, line: Number(pencil.dataset.line) };
    render();
    document.querySelector(`[data-jot="${CSS.escape(state.jotEdit.field)}"]`)?.focus();
    return;
  }
  if (event.target.closest?.('[data-jot-cancel]')) { state.jotEdit = null; render(); return; }
  const drop = event.target.closest?.('[data-drop]');
  if (!drop) return;
  const field = drop.dataset.drop;
  const lines = String(noteOf(field)).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  lines.splice(Number(drop.dataset.line), 1);
  state.jotEdit = null;
  const next = lines.join('\n');
  applyLocally(field, next);
  render();
  try { await persist(field, next); } catch (error) { toast(error.message); }
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
  await goUp();
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
  // Enter is one section at a screen now, so a missing reading has to say which screen it
  // is on as well as which box — otherwise the jump lands on Enter and the field is not
  // there, which reads as the button being broken.
  const at = jump.dataset.gotoAt;
  const moved = at && order().includes(at) && state.fillAt !== at;
  if (moved) state.fillAt = at;
  if (state.active !== 'fill' || moved) {
    state.active = 'fill'; render(); requestAnimationFrame(land);
  } else land();
});

// A morning goes up when it is finished, and finishing is the only act there is.
//
// There was a Publish button. It sat on the top bar beside Present, it appeared only in edit
// mode, and pressing it did three things nobody had asked to be separate: it wrote a
// publication row, it took the page out of edit mode, and it turned the chip from Draft to
// Published. Which meant the person filling the morning in had two endings to choose
// between — Save, and then Publish — and the second one was the one that mattered and the
// one people forgot. A morning sitting in Draft at ten past eight is not a decision anybody
// made; it is a button somebody did not know about.
//
// So there is no button. Saving a section publishes, and pressing Done editing publishes,
// because both of those are somebody saying they have finished. It happens once — the
// revision is cut the first time a morning is finished, and later corrections update the
// readings without cutting another, which is what "Published" already meant.
//
// The guard that used to ask for a written reason before publishing an incomplete morning is
// gone with the button, and deliberately. It was asked at the wrong moment: the first save of
// the day is always incomplete, so the prompt would fire on a morning nobody had claimed was
// finished. What was outstanding is still recorded against the publication, and the summary
// screen has said how many readings are missing all along.
async function goUp({ finished = false } = {}) {
  if (!state.canEdit || !state.location) return;
  // Publishing a morning that has a write still in the air puts a screen up that does not
  // match its own database.
  if (unsent.size) { toast(`${holdingText()}. The morning is not published yet.`); return; }

  const gaps = absent(state.findings).length;
  const already = state.metrics?.status === 'published';

  // When the revision is cut, and why it is not cut on the first Save.
  //
  // Removing the Publish button was right and the first version of it published on the first
  // section save, which was not. Somebody opens Enter at twenty past seven, fills in Safety,
  // presses Save — and that became the permanent record of the morning: two safety readings
  // and eight empty sections, stamped 07:21, with everything typed afterwards changing the
  // live screen and none of it changing the thing in the publications table. The snapshot was
  // of the moment the work started rather than the moment it finished.
  //
  // Three things count as finishing, and nothing else publishes:
  //
  //   · saving a section when there is nothing left to fill in anywhere;
  //   · pressing Done editing, which is a person saying so in as many words;
  //   · opening Present, because putting it on the wall is the strongest claim there is.
  //
  // Saving a half-filled morning simply saves it. The readings are in the database either
  // way — publishing is not what makes them safe, it is what says the morning is finished —
  // and the summary screen has always shown how many are still missing.
  if (!already && !finished && gaps) return;

  // A correction after the morning went up cuts a new revision rather than editing the old
  // one. `publish_morning` numbers them, so the record is "this is what the room saw, and
  // this is what we knew by nine" rather than one row quietly rewritten.
  if (already && !finished) return;

  try {
    await publish(state.location, state.date, { incomplete: gaps > 0 });
    const first = !already;
    if (state.metrics) state.metrics.status = 'published';
    renderHeader();
    if (first) {
      toast(gaps ? `Published with ${gaps} still to fill in.` : 'Published — every screen shows this now.');
    } else {
      toast('Correction published.');
    }
  } catch (error) { toast(error.message); }
}

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

$('#unsent-retry').addEventListener('click', async () => {
  saved('Saving…');
  for (const held of [...unsent.values()]) await persist(held.name, held.value);
});

// A dropped connection usually comes back before anybody notices. When the browser says the
// network is here again, the held writes go without waiting for the six-second timer.
globalThis.addEventListener('online', () => {
  if (unsent.size) $('#unsent-retry').click();
});

$('#tv-btn').addEventListener('click', () => {
  // Present is a statement that the morning is ready to be believed by twenty people at
  // once. It is not, while something on it has not reached the database.
  if (unsent.size) {
    toast(`${holdingText()}. Save them before presenting.`);
    return;
  }
  // Putting the morning on the wall is the strongest claim anybody makes about it, so it is
  // also the last moment it can be recorded as what the room was shown.
  goUp({ finished: true });
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
  // Leaving the page leaves whatever it had brought forward. Coming back to a screen still
  // holding one section from four minutes ago is a screen that has not been put away.
  state.zoom = null;
  paintMode();
  renderWall();
  fitCards();
});

// Bringing a section forward on the one page, and putting it back.
//
// The same chip does both, which is what makes it a control rather than a menu: pressing an
// unlit one swaps to that section, pressing the lit one restores the whole morning. There is
// nothing else to learn and nothing to go back through.
document.addEventListener('click', event => {
  const chip = event.target.closest?.('[data-zoom]');
  if (!chip) return;
  // All carries no key, and pressing the lit one puts the morning back the same way.
  const key = chip.dataset.zoom;
  state.zoom = !key || key === state.zoom ? null : key;
  renderWall();
  applyCardOrder();
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

// `applied` turns the preview into a report. Pull data writes without asking — that is what
// pulling means — and when a file it fetched turns out to hold nothing for this morning, the
// same panel is the honest place to say so, after the fact rather than before it.
const importState = { reading: false, preview: null, error: null, applied: false, failed: [] };

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
    Quality: ['shorts', 'coq', 'coq_target', 'coq_ytd', 'coq_ytd_target', 'ncr_ytd',
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
  // A linked file the server could not fetch never reaches the reader, so it would be absent
  // from a list headed "What arrived" — which reads as though it arrived and was fine.
  const missed = !importState.applied ? '' : (importState.failed || []).map(source =>
    `<tr><td class="dept">${esc(source.name)}</td>
      <td><span class="pill pill--stop">did not arrive</span></td>
      <td class="num">—</td><td class="soft">${esc(source.note || '')}</td></tr>`).join('');

  const filePanel = `<div class="sheet__sub">What arrived</div>
    <table class="tbl tbl--tight"><tbody>${missed}${p.sources.map(source => `<tr>
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
    ${p.sources.filter(s => s.peek?.length).map(source => `
      <div class="keys"><div>
        <div class="keys__l keys__l--bad">What is inside ${esc(source.file)} — send me this
          and the reader will be taught it</div>
        ${source.peek.map(sheet => `<div class="keys__v"><b>${esc(sheet.sheet)}</b>
          ${sheet.head.length ? sheet.head.map(h => `<code>${esc(h)}</code>`).join(' ')
            : '<i>no header row</i>'}</div>`).join('')}
      </div></div>`).join('')}
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
      <td>${esc(d.machines.join(', '))} \u00b7 ${d.shifts} shift${d.shifts === 1 ? '' : 's'}${
        d.crews?.length ? ` \u00b7 ${esc(d.crews.join(' '))}` : ''}</td>
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

  // A day that is only half keyed in, said out loud.
  //
  // The DOR is filled in as the shifts end, so a workbook read in the morning can hold a
  // complete day or it can hold the day shift on its own — and in a total the two look
  // exactly alike. On 13 August the pull read die cutting as 13,500 sheets over 16 hours
  // five times running, which was the truth about the file and a quarter of the truth about
  // the plant; by lunchtime the same reader on the same file gave 53,460 over 40. Nothing on
  // the screen distinguished those, so the reader took the blame for the workbook.
  //
  // The crews in the figure are the whole of the fix. A department showing one crew where
  // its neighbours show three is not a rule anybody has to be taught.
  const crewSets = p.departments.map(d => (d.crews || []).length).filter(Boolean);
  const thin = crewSets.length
    ? p.departments.filter(d => (d.crews || []).length && (d.crews || []).length < Math.max(...crewSets))
    : [];
  const crewGap = thin.length ? `<p class="drop__bad">${
      thin.map(d => `<b>${esc(state.config.find(c => c.key === d.dept_key)?.name || d.dept_key)}</b>
        has only ${esc(d.crews.join(' and '))}`).join('; ')} in these files, where other
      departments have ${Math.max(...crewSets)}. If the crews that follow have not keyed
      their hours in yet, this is a part-day \u2014 pull again once they have.</p>` : '';

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
        says. Both are imported.</p>
      ${crewGap}` : ''}
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
    ${importState.applied ? '' : catchupPanel}
    ${jsonPanel}
    ${p.unknownNames.length ? `<div class="sheet__sub">Names not on the operator list</div>
      <p class="drop__note">Imported as typed. Nothing is dropped and nothing is invented \u2014
      add them to the operator list if they belong there.</p>
      <p class="drop__names">${p.unknownNames.slice(0, 12).map(n =>
        `<span class="pill pill--info">${esc(n.name)} \u00b7 ${n.count}</span>`).join(' ')}</p>` : ''}
    ${p.notes.length ? `<div class="sheet__sub">Notes</div>
      <ul class="drop__notes">${p.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    <div class="sheet__foot">
      <span class="drop__note" id="import-say">${importState.applied
        ? 'Written. This is what the pull found — nothing here is waiting on you.' : ''}</span>
      ${importState.applied ? `<button class="btn btn--primary" id="import-done">Close</button>`
        : `<button class="btn" id="import-again">Choose different files</button>
      <button class="btn btn--go" id="import-apply"${willWrite ? '' : ' disabled'}>${
        willWrite ? 'Write what these files say' : 'Nothing to write'}</button>`}
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
  importState.reading = true; importState.error = null; importState.applied = false;
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
  const title = $('#import-sheet .sheet__title');
  if (title) title.textContent = importState.applied ? 'What the pull found' : 'Import a morning';
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
  $('#import-done')?.addEventListener('click', () => {
    importState.preview = null; importState.applied = false;
    $('#import-sheet').close();
  });
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
    // The count of changeovers behind that average, which was computed, stored on the
    // department row and never written by the pull.
    //
    // It went unnoticed because nothing read it until the week card, and the week card is
    // the one thing that cannot do without it: a week's average make-ready is the week's
    // make-ready hours over the week's changeovers, so a day contributes in proportion to
    // how many it had. With the column left at whatever an old import happened to put
    // there, Wednesday's four changeovers were weighted as two and the week's average came
    // out wrong in a way no single day's card would ever show.
    if (d.mr_count != null) writes.push([`dept:${d.dept_key}:mr_count`, d.mr_count]);
    // And the same weekday a week ago — all three readings, which is the whole of the
    // productivity card.
    if (d.pw_qty != null) writes.push([`dept:${d.dept_key}:pw_qty`, d.pw_qty]);
    if (d.pw_hours != null) writes.push([`dept:${d.dept_key}:pw_hours`, d.pw_hours]);
    if (d.pw_uptime != null) {
      writes.push([`dept:${d.dept_key}:pw_uptime`, Number(d.pw_uptime.toFixed(4))]);
    }
    if (d.pw_make_ready != null) {
      writes.push([`dept:${d.dept_key}:pw_make_ready`, Number(d.pw_make_ready.toFixed(3))]);
    }
    if (d.pw_mr_count != null) writes.push([`dept:${d.dept_key}:pw_mr_count`, d.pw_mr_count]);
  }
  if (p.shipping) {
    writes.push(['jobs_shipped', p.shipping.jobs_shipped], ['jobs_on_time', p.shipping.jobs_on_time],
                ['late', p.shipping.late], ['shorts', p.shipping.shorts]);
  }
  // The month and the year behind the day, added up from the same sheet. These go in before
  // the KPI workbook's own figures below, so where both files speak the workbook wins: its
  // OTIF is counted over deliveries and closed off by the quality manager, and that is the
  // number the plant reports. OTD it does not carry at all, which is why these two columns
  // were blank on every morning until now.
  for (const [name, value] of Object.entries(p.period || {})) writes.push([name, value]);
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
  // The last twenty-four hours, worked out from the month rather than counted again.
  //
  // The raw logs give a count per day, and they are right when somebody has written in them
  // that morning and silent when nobody has. Silence was being written down as "unknown",
  // which is honest and useless: these three read a dash three hundred days a year, and a
  // card that says nothing that often is one people stop looking at.
  //
  // The month-to-date count is the signal the plant actually maintains. If it stood at
  // fifteen yesterday and reads sixteen today, one was raised in the last twenty-four hours;
  // if it has not moved, none were. On the first of a month there is no yesterday to
  // subtract, and the month-to-date figure *is* the day's. Anybody can type over the answer
  // on the entry screen, which is what makes a derived number safe to show.
  for (const [today, month] of [['ncr_today', 'ncr_mtd'],
                                ['complaints_internal_today', 'complaints_internal_mtd'],
                                ['complaints_external_today', 'complaints_external_mtd']]) {
    const now = writes.find(([name]) => name === month)?.[1] ?? metric(month);
    if (now == null || now === '' || !Number.isFinite(Number(now))) continue;
    // The most recent morning *this month* that actually carries a figure for this count.
    //
    // The first version took the last morning before today and read the column off it, and
    // an absent column came through as nought. Every August morning before the twelfth had
    // no month-to-date reading at all — the workbook had never been read — so the first pull
    // of the month measured eleven against nothing and reported eleven NCRs in the last
    // twenty-four hours. Eleven for the month and eleven for the day, on the same card,
    // which is the plant's own arithmetic contradicting itself in public.
    //
    // A movement can only be measured against a reading. Where there is no earlier reading
    // to subtract, nothing is known about the day and it stays at nought — which is the rule
    // the room asked for and the honest answer besides: what a count did in one day cannot
    // be recovered from the first time anybody wrote the month down.
    const before = (state.year || [])
      .filter(row => String(row.metric_date) < state.date
        && String(row.metric_date).slice(0, 7) === state.date.slice(0, 7)
        && Number.isFinite(Number(row[month])) && row[month] !== null && row[month] !== '')
      .sort((a, b) => String(a.metric_date).localeCompare(String(b.metric_date))).pop();
    writes.push([today, before ? Math.max(0, Number(now) - Number(before[month])) : 0]);
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
      const metrics = {
        ...(day.period || {}),
        ...(day.shipping ? {
          jobs_shipped: day.shipping.jobs_shipped, jobs_on_time: day.shipping.jobs_on_time,
          late: day.shipping.late, shorts: day.shipping.shorts,
        } : {}),
      };
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
    const fortnight = weekSpan();
    const [day, history, months, weeks] = await Promise.all([
      loadDay(state.location, state.date),
      loadHistory(state.location, addDays(state.date, -6), state.date),
      loadYearCounts(state.location, dateOf(state.date).getFullYear()),
      loadWeeks(state.location, fortnight.priorFrom, fortnight.to),
    ]);
    Object.assign(state, day, { history, year: months || [], weeks: weeks || [] });
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
    // A workbook that was delivered for some other morning is a failure with a date on it,
    // and it is said out loud rather than folded into "nothing could be fetched". The flow
    // that stopped running last Friday is exactly the thing this sentence has to name.
    const stale = failed.filter(s => s.stale);
    if (stale.length) {
      toast(`${stale.map(s => s.name).join(', ')}: not delivered for this morning \u2014 `
        + `${stale[0].note.replace(/^stale \u2014 /, '')}`);
    }
    if (!got.length) {
      toast(failed[0] ? `${failed[0].name}: ${failed[0].note}` : 'Nothing could be fetched.');
      return;
    }
    button.textContent = 'Reading…';
    // Named after the linked file rather than after its kind, because the name is what the
    // report below prints and "kpi.xlsx" is not a thing anybody at the plant has heard of.
    const files = await Promise.all(got.map(async source => {
      const blob = await (await fetch(source.url)).blob();
      return new File([blob], `${source.name}.xlsx`);
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
    // Kept, because applying clears it and the report is built out of it.
    const read = importState.preview;
    await applyImport({ quiet: true });

    // A file that arrived and said nothing is the whole of the question people ask about a
    // pull, and this button used to answer it with "pulled DOR, OTD / OTIF sheet, Monthly KPI
    // workbook" — three files named, three ticks implied, and quality still blank. The
    // importer knew why the whole time: it had the file down as not recognised, or with no
    // row for the month being asked for, and put it in a note nobody was shown.
    //
    // So a pull where every file gave something stays silent, and one where a file gave
    // nothing opens the same panel the drag-and-drop importer uses, after the writing, with
    // that file's line and that file's note on it.
    const quiet = (read?.sources || []).filter(source =>
      source.kind === 'unknown' || source.kind === 'unreadable' || !source.rows);
    const said = [
      failed.length ? `${failed.length} source${failed.length === 1 ? '' : 's'} failed` : '',
      `pulled ${got.map(s => s.name).join(', ')}`,
      quiet.length ? `${quiet.map(s => s.file).join(', ')} read nothing` : '',
    ].filter(Boolean).join(' · ');
    toast(said);
    if (read && (quiet.length || failed.length)) {
      importState.preview = read;
      importState.failed = failed;
      importState.applied = true;
      drawImport();
      $('#import-sheet').showModal();
    }
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Pull data';
  }
}

$('#import-btn')?.addEventListener('click', () => {
  if (!state.canEdit) return toast('Your account cannot change this plant.');
  importState.applied = false;
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
  rows.push(['Shortage count', shortJobs() ?? '', 'target 0']);
  // Named, so a spreadsheet of these does not read as a month-by-month series of the month
  // it was exported in.
  const coqFor = coqMonth();
  rows.push([`COQ ${coqFor ? coqFor.label : 'last closed month'}`, metric('coq') ?? '',
             `target ${metric('coq_target') ?? 0.85}`]);
  rows.push([`COQ year to date${coqFor ? ` through ${coqFor.label}` : ''}`,
             metric('coq_ytd') ?? '', '']);
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
