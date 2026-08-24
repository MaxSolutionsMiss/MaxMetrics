// KPIs on demand.
//
// This is a request, not a menu. The page opens blank and asks four things in order —
// where, what, when, and how you want it cut — and nothing below a step appears until the
// step above it is answered. That is deliberate: a screen that lists every measure it
// knows is readable at twenty and useless at two hundred, so the categories are the way
// in and the measures stay folded up inside them until somebody opens one.
//
// Two ways past the ticket, because most days nobody needs it. The starters answer the
// handful of questions that get asked constantly in one click, and anything you build can
// be pinned beside them — which is how a supply chain manager and a quality manager end up
// with different front pages without either of them configuring anything.
//
// The page never invents a number: where a reading is absent it says so rather than
// drawing a zero, because a zero is a claim and an absence is not.

import {
  currentSession, signOut, myProfile, myLocations, savePreference,
  kpiRows, kpiDepartments,
} from '../db.js?v=9113db7bfac5';
import {
  AREAS, MEASURES, BREAKDOWNS, PERIODS, NOT_COLLECTED, QUICK,
  measure, areaOf, breakdownsFor, hasDepartments, findMeasures,
  reduceRows, reduceTarget, formatValue, verdictOf, toneOf, windowFor,
} from '../kpi.js?v=9113db7bfac5';
import { esc, shortDate } from '../readings.js?v=9113db7bfac5';

const $ = s => document.querySelector(s);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};

const state = {
  plants: [],            // [{id, name}] — only the ones this person may see
  depts: new Map(),      // location_id -> [{key, name, unit}]
  me: null,              // profile id, so a pin can be saved
  pins: [],              // this person's own quick answers

  // The request. Everything starts empty on purpose.
  scope: [],             // location ids; [] means nothing picked yet
  measure: null,
  period: null,
  from: '', to: '',      // only when period === 'custom'
  dept: 'all',
  breakdown: 'none',

  open: null,            // which category is expanded
  search: '',
  asked: false,          // has this request been run
  today: new Date().toISOString().slice(0, 10),
};

// ── Quick answers, in the rail ──────────────────────────────────────────────────

const allQuick = () => [...QUICK, ...state.pins];

function drawQuick() {
  const wrap = $('#areas');
  wrap.innerHTML = '';

  const fresh = el('button', 'rail__new', 'Start a request');
  fresh.type = 'button';
  fresh.onclick = () => { reset(); draw(); };
  wrap.append(fresh);

  const add = (label, list, empty) => {
    wrap.append(el('div', 'rail__sub', esc(label)));
    if (!list.length) { wrap.append(el('p', 'rail__none', esc(empty))); return; }
    for (const q of list) {
      const b = el('button', 'rail__link rail__link--q',
        `${esc(q.label)}<span class="rail__q">${esc(q.sub || '')}</span>`);
      b.type = 'button';
      b.onclick = () => runQuick(q);
      wrap.append(b);
    }
  };
  add('Quick answers', QUICK, '');
  add('Yours', state.pins, 'Build a request and pin it here.');
}

// A quick answer is just a filled-in request, so running one fills the ticket and asks.
function runQuick(q) {
  state.scope = state.plants.map(p => p.id);
  state.measure = q.measure;
  state.period = q.period || 'mtd';
  state.dept = q.dept || 'all';
  state.breakdown = q.breakdown || 'none';
  state.asked = true;
  draw();
  answer();
}

function reset() {
  Object.assign(state, { scope: [], measure: null, period: null, from: '', to: '',
    dept: 'all', breakdown: 'none', open: null, search: '', asked: false });
  $('#content').innerHTML = '';
}

// ── The request ─────────────────────────────────────────────────────────────────

const chip = (label, on, onclick, extra = '') => {
  const b = el('button', 'chip' + (on ? ' is-on' : '') + (extra ? ' ' + extra : ''), esc(label));
  b.type = 'button';
  b.onclick = onclick;
  return b;
};

function step(n, title, done, body, note) {
  const s = el('section', 'step' + (body ? '' : ' is-locked') + (done ? ' is-done' : ''));
  s.append(el('div', 'step__h',
    `<span class="step__n">${n}</span><span class="step__t">${esc(title)}</span>` +
    (note ? `<span class="step__note">${esc(note)}</span>` : '')));
  if (body) s.append(body); else s.append(el('p', 'step__wait', 'Answer the step above first.'));
  return s;
}

function draw() {
  drawQuick();
  const form = $('#ask');
  form.innerHTML = '';
  form.append(el('b', 'ask__title', state.asked ? 'Your request' : 'What do you want to know?'));
  form.append(el('span', 'ask__gap'));
  if (state.scope.length || state.measure) {
    const over = el('button', 'btn', 'Start over');
    over.type = 'button';
    over.onclick = () => { reset(); draw(); };
    form.append(over);
  }

  const box = $('#ticket');
  box.innerHTML = '';
  const card = el('div', 'card ticket');
  box.append(card);

  // stepNarrow returns null where the measure has no departments to narrow by, and
  // append(null) writes the word "null" into the page.
  for (const s of [stepWhere(), stepWhat(), stepWhen(), stepNarrow(), stepCut(), stepGo()]) {
    if (s) card.append(s);
  }
}

// 1 — Where.
function stepWhere() {
  const body = el('div', 'step__b');
  const all = state.plants.map(p => p.id);
  if (state.plants.length > 1) {
    body.append(chip('All ' + state.plants.length + ' locations',
      state.scope.length === state.plants.length,
      () => { state.scope = state.scope.length === all.length ? [] : all; draw(); }));
  }
  for (const p of state.plants) {
    body.append(chip(p.name, state.scope.includes(p.id), () => {
      state.scope = state.scope.includes(p.id)
        ? state.scope.filter(x => x !== p.id) : [...state.scope, p.id];
      draw();
    }));
  }
  const picked = state.scope.length;
  return step(1, 'Which locations?', picked > 0, body,
    picked ? `${picked} chosen` : 'Pick one or more');
}

// 2 — What. The categories are folded until opened; search cuts across all of them.
function stepWhat() {
  if (!state.scope.length) return step(2, 'What are you after?', false, null);

  // Once something is chosen the whole tree folds back to the one line that matters.
  // Leaving it open pushed the dates and the button two screens down, which turns a
  // four-step form into a scroll.
  const already = state.measure ? measure(state.measure) : null;
  if (already && state.open === null && !state.search.trim()) {
    const shut = el('div', 'step__b');
    shut.append(el('div', 'picked',
      `<span class="picked__n">${esc(already.name)}</span>
       <span class="picked__h">${esc(already.area)} &middot; ${esc(already.hint)}</span>`));
    const change = el('button', 'btn', 'Change');
    change.type = 'button';
    change.onclick = () => { state.open = already.area; draw(); };
    shut.append(change);
    return step(2, 'What are you after?', true, shut);
  }

  const body = el('div', 'step__b step__b--col');
  const find = el('input', 'step__find');
  find.type = 'search';
  find.placeholder = 'Search — try "otif", "scrap", "inventory"';
  find.value = state.search;
  find.oninput = e => {
    state.search = e.target.value;
    const at = e.target.selectionStart;
    draw();
    const f = $('.step__find'); if (f) { f.focus(); f.setSelectionRange(at, at); }
  };
  body.append(find);

  if (state.search.trim()) {
    const hits = findMeasures(state.search);
    if (!hits.length) {
      body.append(el('p', 'step__wait', `Nothing matches “${esc(state.search)}”.`));
    } else {
      const list = el('div', 'mlist');
      for (const m of hits) list.append(measureRow(m, true));
      body.append(list);
    }
  } else {
    for (const a of AREAS) {
      const inside = areaOf(a.key);
      if (!inside.length) continue;
      const open = state.open === a.key;
      const head = el('button', 'cat' + (open ? ' is-open' : ''), `
        <span class="cat__x" aria-hidden="true"></span>
        <span class="cat__n">${esc(a.name)}</span>
        <span class="cat__h">${esc(a.hint)}</span>
        <span class="cat__c">${inside.length}</span>`);
      head.type = 'button';
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
      head.onclick = () => { state.open = open ? null : a.key; draw(); };
      body.append(head);
      if (open) {
        const list = el('div', 'mlist');
        for (const m of inside) list.append(measureRow(m));
        body.append(list);
      }
    }
  }

  const chosen = state.measure ? measure(state.measure) : null;
  return step(2, 'What are you after?', !!chosen, body,
    chosen ? chosen.name : `${MEASURES.length} to choose from`);
}

function measureRow(m, withArea = false) {
  if (m.pending) {
    const row = el('div', 'mrow is-pending', `
      <span class="mrow__n">${esc(m.name)}<span class="mrow__tag">not connected</span></span>
      <span class="mrow__h">${esc(m.pending)}</span>`);
    return row;
  }
  const row = el('button', 'mrow' + (state.measure === m.key ? ' is-on' : ''), `
    <span class="mrow__n">${esc(m.name)}</span>
    <span class="mrow__h">${withArea ? esc(m.area) + ' &middot; ' : ''}${esc(m.hint)}</span>`);
  row.type = 'button';
  row.onclick = () => {
    state.measure = m.key;
    state.open = null;      // fold the tree back up; the choice is the answer to step 2
    state.search = '';
    const bs = breakdownsFor(m);
    if (!bs.some(b => b.key === state.breakdown)) state.breakdown = 'none';
    if (!hasDepartments(m)) state.dept = 'all';
    draw();
  };
  return row;
}

// 3 — When.
function stepWhen() {
  if (!state.measure) return step(3, 'Over what dates?', false, null);
  const body = el('div', 'step__b step__b--col');
  const row = el('div', 'step__b');
  for (const p of PERIODS) {
    row.append(chip(p.name, state.period === p.key, () => {
      state.period = p.key;
      if (p.key === 'custom' && !state.from) {
        state.to = state.today;
        state.from = state.today.slice(0, 8) + '01';
      }
      draw();
    }));
  }
  body.append(row);

  if (state.period === 'custom') {
    const pair = el('div', 'step__dates');
    for (const [k, label] of [['from', 'From'], ['to', 'To']]) {
      const wrap = el('label', 'step__date', `<span>${label}</span>`);
      const i = el('input');
      i.type = 'date'; i.value = state[k]; i.max = state.today;
      i.onchange = e => { state[k] = e.target.value; draw(); };
      wrap.append(i);
      pair.append(wrap);
    }
    body.append(pair);
  }

  const [f, t] = state.period ? windowFor(state.period, state.today, state) : [];
  return step(3, 'Over what dates?', !!state.period, body,
    state.period ? `${shortDate(f)} to ${shortDate(t)}` : 'Pick a period');
}

// 4 — Narrow it down. Only offered where the data carries a department.
function stepNarrow() {
  if (!state.measure || !state.period) return null;
  const m = measure(state.measure);
  if (!hasDepartments(m)) return null;

  const seen = new Map();
  for (const list of state.depts.values()) {
    for (const d of list) if (state.scope.includes(d.location_id)) seen.set(d.key, d);
  }
  if (!seen.size) return null;

  const body = el('div', 'step__b');
  body.append(chip('Every department', state.dept === 'all',
    () => { state.dept = 'all'; draw(); }));
  for (const d of seen.values()) {
    body.append(chip(d.name + (d.unit ? ` (${d.unit})` : ''), state.dept === d.key,
      () => { state.dept = state.dept === d.key ? 'all' : d.key; draw(); }));
  }

  // The nudge that makes the mixed-unit rule teachable rather than just enforced.
  const note = m.perUnit && state.dept === 'all'
    ? 'Departments count different things — pick one to get a single total'
    : (state.dept === 'all' ? 'Optional' : seen.get(state.dept)?.name || '');
  return step(4, 'Narrow it down', state.dept !== 'all', body, note);
}

// 5 — How to cut it.
function stepCut() {
  const n = stepNumber();
  if (!state.measure || !state.period) return step(n, 'How do you want it broken out?', false, null);
  const m = measure(state.measure);
  const body = el('div', 'step__b');
  for (const b of breakdownsFor(m)) {
    body.append(chip(b.name, state.breakdown === b.key,
      () => { state.breakdown = b.key; draw(); }));
  }
  return step(n, 'How do you want it broken out?', true, body,
    BREAKDOWNS.find(b => b.key === state.breakdown)?.hint || '');
}

const stepNumber = () => {
  if (!state.measure) return 4;
  return hasDepartments(measure(state.measure)) ? 5 : 4;
};

function stepGo() {
  const bar = el('div', 'ticket__go');
  const ready = state.scope.length && state.measure && state.period;
  const go = el('button', 'btn btn--primary', state.asked ? 'Ask again' : 'Get the numbers');
  go.type = 'button';
  go.disabled = !ready;
  go.onclick = () => { state.asked = true; draw(); answer(); };
  bar.append(go);

  if (state.asked && ready) {
    const pin = el('button', 'btn', 'Pin this to Quick answers');
    pin.type = 'button';
    pin.onclick = pinCurrent;
    bar.append(pin);
  }
  if (!ready) bar.append(el('span', 'ticket__hint', 'Answer the steps above.'));
  // Data Bank is no longer a module of its own — it is the footnote to every answer, so
  // this is where it belongs: one link, from the place where somebody wonders.
  bar.append(el('span', 'ask__gap'));
  const src = el('a', 'ticket__src', 'Where these numbers come from');
  src.href = './bank.html';
  bar.append(src);
  return bar;
}

// ── Pinning ─────────────────────────────────────────────────────────────────────

function describe() {
  const m = measure(state.measure);
  const bits = [];
  if (state.dept !== 'all') {
    for (const list of state.depts.values()) {
      const d = list.find(x => x.key === state.dept);
      if (d) { bits.push(d.name.toLowerCase()); break; }
    }
  }
  const b = BREAKDOWNS.find(x => x.key === state.breakdown);
  if (b && b.key !== 'none') bits.push('by ' + b.name.toLowerCase());
  bits.push((PERIODS.find(p => p.key === state.period)?.name || '').toLowerCase());
  return { label: m.name, sub: bits.filter(Boolean).join(', ') };
}

async function pinCurrent() {
  const { label, sub } = describe();
  const pin = {
    key: 'p-' + Date.now().toString(36),
    label, sub,
    measure: state.measure, period: state.period,
    dept: state.dept, breakdown: state.breakdown,
  };
  // Same request twice is one pin.
  const same = p => p.measure === pin.measure && p.period === pin.period
    && p.dept === pin.dept && p.breakdown === pin.breakdown;
  if (state.pins.some(same)) { drawQuick(); return; }

  state.pins = [...state.pins, pin];
  drawQuick();
  try {
    await savePreference(state.me, { pinned_kpis: state.pins });
  } catch (err) {
    state.pins = state.pins.filter(p => p.key !== pin.key);
    drawQuick();
    $('#content').prepend(el('div', 'card',
      `<p class="kpinote">That pin did not save. ${esc(err.message || '')}</p>`));
  }
}

// ── The answer ──────────────────────────────────────────────────────────────────

// Which side of the target, said the way the measure means it. Make-ready of 1.75 hours
// against a target of 1.25 is half an hour OVER, not half an hour short — "short of" on a
// measure where less is better reads as praise for a miss.
const gapWord = (m, v) => m.up
  ? (v.good ? 'above' : 'short of')
  : (v.good ? 'under' : 'over');

const andList = xs => xs.length < 3
  ? xs.join(' and ')
  : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];

const groupKey = (row, breakdown, names) => {
  if (breakdown === 'dept')  return names.dept.get(row.dept_key) || row.dept_key || '—';
  if (breakdown === 'plant') return names.plant.get(row.location_id) || '—';
  if (breakdown === 'day')   return row.metric_date;
  if (breakdown === 'month') return row.metric_date.slice(0, 7);
  return 'All';
};

async function answer() {
  const m = measure(state.measure);
  const [from, to] = windowFor(state.period, state.today, state);
  const locs = state.scope;
  const box = $('#content');
  box.innerHTML = `<p class="cfg__none">Reading…</p>`;

  let rows = [];
  try {
    rows = await kpiRows(m.table, locs, from, to) || [];
  } catch (err) {
    box.innerHTML = `<p class="cfg__none">That read did not come back. ${esc(err.message || '')}</p>`;
    return;
  }

  // Step 4, applied. Filtering here rather than in the query keeps js/db.js to one shape
  // of read and means the department chips can change without a round trip.
  if (state.dept !== 'all') rows = rows.filter(r => r.dept_key === state.dept);

  const names = {
    plant: new Map(state.plants.map(p => [p.id, p.name])),
    dept: new Map(),
    unit: new Map(),
  };
  for (const list of state.depts.values()) for (const d of list) {
    names.dept.set(d.key, d.name);
    if (d.unit) names.unit.set(d.key, d.unit);
  }

  // What this answer is counted in. Output is sheets in one department and cartons in the
  // next, so an answer that spans both has no single total — see the hero below.
  // Only from rows that actually carry a figure: Windowing has rows every day and an
  // output in none of them, and listing "panes" would name a unit nothing was counted in.
  const units = m.perUnit
    ? [...new Set(rows
        .filter(r => r[m.col] !== null && r[m.col] !== undefined && r[m.col] !== '')
        .map(r => names.unit.get(r.dept_key)).filter(Boolean))]
    : [];
  const mixed = units.length > 1;
  const suffix = g => (m.perUnit && g?.unit ? ' ' + g.unit : (units.length === 1 ? ' ' + units[0] : ''));

  // Group, reduce, and keep the groups that had nothing so the answer can say so.
  const buckets = new Map();
  for (const r of rows) {
    const k = groupKey(r, state.breakdown, names);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(r);
  }
  let groups = [...buckets.entries()].map(([name, rs]) => ({
    name, rows: rs.length,
    value: reduceRows(m, rs),
    target: reduceTarget(m, rs),
    // A group only has a unit of its own when it is one department's worth of rows.
    unit: m.perUnit
      ? (new Set(rs.map(r => names.unit.get(r.dept_key))).size === 1
          ? names.unit.get(rs[0].dept_key) : null)
      : null,
  }));
  const withData = groups.filter(g => g.value !== null);
  const empty = groups.filter(g => g.value === null);

  // Time reads in order; everything else reads worst-first, because the one to look at
  // should not be somewhere in the middle of an alphabetical list.
  if (state.breakdown === 'day' || state.breakdown === 'month') {
    withData.sort((a, b) => a.name < b.name ? -1 : 1);
  } else if (mixed && withData.every(g => g.target)) {
    // Ranking by raw size across different units just ranks cartons above sheets. Rank by
    // how close each came to its own target — the same thing the bars are drawn against.
    const share = g => Math.abs(g.value) / Math.abs(g.target);
    withData.sort((a, b) => m.up ? share(b) - share(a) : share(a) - share(b));
  } else {
    withData.sort((a, b) => m.up ? b.value - a.value : a.value - b.value);
  }

  const overall = reduceRows(m, rows);
  const overallTarget = reduceTarget(m, rows);
  const v = verdictOf(m, overall, overallTarget);

  box.innerHTML = '';

  if (!rows.length) {
    box.append(el('div', 'card', `
      <p class="cfg__none" style="font-style:normal">
        Nothing recorded for that question between ${esc(shortDate(from))} and ${esc(shortDate(to))}.
        ${state.scope.length > 1
          ? 'Not every location reports yet — try one of them, or a longer period.'
          : 'Try a longer period, or another location.'}
      </p>`));
    return;
  }

  // The headline.
  const hero = el('div', 'card kpihero');
  hero.innerHTML =
    `<div class="kpihero__l">
       <span class="ct">${esc(m.name)} · ${esc(scopeName())} · ${esc(PERIODS.find(p => p.key === state.period).name)}</span>
       <span class="kpihero__v${mixed ? ' kpihero__v--none' : ''}">${mixed ? 'No single total'
         : esc(formatValue(m, overall) + (units.length === 1 ? ' ' + units[0] : ''))}</span>
     </div>
     <div class="kpihero__r">
       ${mixed
         ? `<span class="kpihero__verdict">These departments count
              ${esc(andList(units))} &mdash; read them separately below</span>`
         : v ? `<span class="kpihero__verdict is-${toneOf(m, overall, overallTarget)}">
                ${esc(formatValue(m, Math.abs(v.diff)))} ${esc(gapWord(m, v))} target
                ${esc(formatValue(m, overallTarget))}</span>`
           : `<span class="kpihero__verdict">No target set for this measure</span>`}
       <span class="kpihero__note">${rows.length} row${rows.length === 1 ? '' : 's'} read${
         m.agg === 'weighted' ? `, weighted by ${esc(m.by.replace('_', ' '))}` : ''}.
         ${esc(shortDate(from))} to ${esc(shortDate(to))}.</span>
     </div>`;
  box.append(hero);

  // The breakdown, when there is one.
  if (state.breakdown !== 'none' && withData.length) {
    // The scale has to hold the targets too. Gluing shipped 5.7m against 6.9m owed: scaled
    // to the values alone the tick clamps to 100% and lands exactly where the full bar ends,
    // drawing the month's biggest miss as a bar that just reached its mark.
    const max = Math.max(
      ...withData.map(g => Math.abs(g.value)),
      ...withData.map(g => (g.target === null ? 0 : Math.abs(g.target))), 0) || 1;

    // A shared length scale compares sheets with cartons the moment the groups count
    // different things. Where they do — and every group has a target to be judged by —
    // each bar is drawn against its own target instead, and the ticks line up at the
    // same place. Length then means "how close to what this department was asked for",
    // which is the one thing sheets and cartons have in common.
    const relative = mixed && withData.every(g => g.target);
    const TICK = 72;  // where 100% of target sits, leaving room to overshoot
    const fillPct = g => relative
      ? Math.max(1, Math.min(100, (Math.abs(g.value) / Math.abs(g.target)) * TICK))
      : Math.max(1, Math.min(100, (Math.abs(g.value) / max) * 100));
    const tickPct = g => relative
      ? TICK
      : Math.max(0, Math.min(100, (Math.abs(g.target) / max) * 100));

    const card = el('div', 'card');
    card.append(el('div', 'ct', `By ${esc(BREAKDOWNS.find(b => b.key === state.breakdown).name.toLowerCase())}`));
    const list = el('div', 'kpilist');
    for (const g of withData) {
      const tone = toneOf(m, g.value, g.target);
      const miss = tone === 'warn' || tone === 'off' ? ' is-' + tone : '';
      const row = el('div', 'kpirow');
      row.innerHTML =
        `<span class="kpirow__n">${esc(state.breakdown === 'day' ? shortDate(g.name) : g.name)}</span>
         <span class="kpitrack">
           <span class="kpifill${miss}" style="width:${fillPct(g).toFixed(1)}%"></span>
           ${g.target !== null ? `<span class="kpitick" style="left:${tickPct(g).toFixed(1)}%"></span>` : ''}
         </span>
         <span class="kpirow__v${miss}">${esc(formatValue(m, g.value) + suffix(g))}</span>`;
      list.append(row);
    }
    card.append(list);
    if (m.target) card.append(el('p', 'kpinote', relative
      ? 'These departments count different things, so each bar is drawn against its own ' +
        'target rather than against the others. The line is that target; past it is over.'
      : 'The line on each bar is that group&rsquo;s target.'));
    box.append(card);
  }

  // What was asked for and had nothing. Naming them is the point — a silent gap looks
  // like a gap in the plant rather than a gap in the reporting.
  if (empty.length) {
    box.append(el('div', 'card', `
      <div class="ct">Nothing recorded</div>
      <p class="kpinote">${esc(empty.map(g => g.name).join(', '))} —
        ${empty.length === 1 ? 'this group has' : 'these groups have'} rows in the period but no
        ${esc(m.name.toLowerCase())} figure in them.</p>`));
  }

  if (state.scope.length > 1) {
    const reporting = new Set(rows.map(r => r.location_id));
    const silent = state.plants.filter(p => state.scope.includes(p.id) && !reporting.has(p.id));
    if (silent.length) {
      box.append(el('div', 'card', `
        <div class="ct">Plants that sent nothing</div>
        <p class="kpinote">${esc(silent.map(p => p.name).join(', '))}.
          They are not zero — they have not reported. Drawing them as bars would say otherwise.</p>`));
    }
  }

  // What cannot be asked, and why. Kept on the answer rather than hidden in a help page.
  box.append(el('div', 'card kpigap', `
    <div class="ct">Not available to split by</div>
    ${NOT_COLLECTED.map(x =>
      `<p class="kpinote"><b>${esc(x.name)}</b> — ${esc(x.why)}</p>`).join('')}`));

  // The table underneath. Every answer has one.
  if (withData.length) {
    const t = el('div', 'card');
    t.append(el('div', 'ct', 'The numbers'));
    t.innerHTML += `<table class="kpitable"><thead><tr>
        <th>${esc(BREAKDOWNS.find(b => b.key === state.breakdown).name)}</th>
        <th>${esc(m.name)}</th><th>Target</th><th>Rows</th></tr></thead><tbody>` +
      withData.map(g => `<tr>
        <td>${esc(state.breakdown === 'day' ? shortDate(g.name) : g.name)}</td>
        <td>${esc(formatValue(m, g.value) + suffix(g))}</td>
        <td>${g.target === null ? '—' : esc(formatValue(m, g.target) + suffix(g))}</td>
        <td>${g.rows}</td></tr>`).join('') + `</tbody></table>`;
    box.append(t);
  }
}

// What the answer says it covers. Naming one or two locations beats "2 locations", and
// past that the count is the only thing that fits.
const scopeName = () => {
  const picked = state.plants.filter(p => state.scope.includes(p.id));
  if (!picked.length) return '';
  if (picked.length === state.plants.length && picked.length > 1)
    return `all ${picked.length} locations`;
  if (picked.length <= 2) return picked.map(p => p.name).join(' and ');
  return `${picked.length} locations`;
};

// ── Boot ────────────────────────────────────────────────────────────────────────

async function boot() {
  const session = await currentSession();
  if (!session) { location.replace('../index.html'); return; }

  const [profile, grants] = await Promise.all([myProfile(), myLocations()]);
  state.me = profile?.id || session.user.id;
  // A pin written by a newer build, or by hand, should not take the page down with it.
  state.pins = Array.isArray(profile?.pinned_kpis)
    ? profile.pinned_kpis.filter(p => p && p.measure && measure(p.measure))
    : [];
  state.plants = (grants || [])
    .map(g => g.locations)
    .filter(Boolean)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
    .map(l => ({ id: l.id, name: l.name }));

  $('#foot-user').textContent = profile?.full_name || session.user.email || '';
  // This page says "locations" throughout, so the footer does too.
  $('#foot-loc').textContent = state.plants.length > 1
    ? `${state.plants.length} locations` : (state.plants[0]?.name ?? 'No location');
  $('#signout-btn').onclick = async () => { await signOut(); location.replace('../index.html'); };

  if (!state.plants.length) {
    $('#content').innerHTML =
      `<p class="cfg__none">No plant has been granted to this account yet. An administrator can add one.</p>`;
    return;
  }

  const depts = await kpiDepartments(state.plants.map(p => p.id)) || [];
  for (const d of depts) {
    if (!state.depts.has(d.location_id)) state.depts.set(d.location_id, []);
    state.depts.get(d.location_id).push(d);
  }

  draw();
}

boot();
