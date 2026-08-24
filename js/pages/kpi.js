// KPIs on demand.
//
// The question is a sentence with four holes in it, and every hole is a menu built from
// what the data actually carries. Nobody types SQL, nobody picks a chart type, and the
// page never invents a number: where a reading is absent it says so rather than drawing
// a zero, because a zero is a claim and an absence is not.

import {
  currentSession, signOut, myProfile, myLocations,
  kpiRows, kpiDepartments,
} from '../db.js?v=f1be04ff73f1';
import {
  AREAS, MEASURES, BREAKDOWNS, PERIODS, NOT_COLLECTED,
  measure, areaOf, breakdownsFor,
  reduceRows, reduceTarget, formatValue, verdictOf, toneOf, windowFor,
} from '../kpi.js?v=f1be04ff73f1';
import { esc, shortDate } from '../readings.js?v=f1be04ff73f1';

const $ = s => document.querySelector(s);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};

const state = {
  plants: [],            // [{id, name}] — only the ones this person may see
  depts: new Map(),      // location_id -> [{key, name}]
  area: 'Production',
  measure: 'uptime',
  scope: 'all',          // 'all' or a location id
  breakdown: 'dept',
  period: 'mtd',
  today: new Date().toISOString().slice(0, 10),
};

// ── The sentence ────────────────────────────────────────────────────────────────

function drawAsk() {
  const m = measure(state.measure);
  const bs = breakdownsFor(m);
  if (!bs.some(b => b.key === state.breakdown)) state.breakdown = 'none';

  const sel = (id, options, value) =>
    `<select class="ask__sel" id="${id}">` + options.map(o =>
      `<option value="${esc(o.v)}"${o.v === value ? ' selected' : ''}>${esc(o.n)}</option>`
    ).join('') + `</select>`;

  $('#ask').innerHTML =
    `<span class="ask__w">Show me</span>` +
    sel('m-measure', MEASURES.map(x => ({ v: x.key, n: x.name })), state.measure) +
    `<span class="ask__w">at</span>` +
    sel('m-scope', [{ v: 'all', n: state.plants.length > 1 ? `All ${state.plants.length} plants` : 'My plant' }]
      .concat(state.plants.map(p => ({ v: p.id, n: p.name }))), state.scope) +
    `<span class="ask__w">broken down by</span>` +
    sel('m-break', bs.map(b => ({ v: b.key, n: b.name })), state.breakdown) +
    `<span class="ask__w">for</span>` +
    sel('m-period', PERIODS.map(p => ({ v: p.key, n: p.name })), state.period) +
    `<span class="ask__gap"></span>` +
    `<button class="btn btn--primary" id="m-go">Answer</button>`;

  $('#m-measure').onchange = e => { state.measure = e.target.value;
    state.area = measure(state.measure).area; drawAreas(); drawAsk(); answer(); };
  $('#m-scope').onchange = e => { state.scope = e.target.value; answer(); };
  $('#m-break').onchange = e => { state.breakdown = e.target.value; answer(); };
  $('#m-period').onchange = e => { state.period = e.target.value; answer(); };
  $('#m-go').onclick = answer;
}

function drawAreas() {
  const wrap = $('#areas');
  wrap.innerHTML = '';
  for (const area of AREAS) {
    const list = areaOf(area);
    if (!list.length) continue;
    wrap.append(el('div', 'rail__sub', esc(area)));
    for (const m of list) {
      const b = el('button', 'rail__link', esc(m.name));
      b.type = 'button';
      if (m.key === state.measure) b.setAttribute('aria-current', 'true');
      b.onclick = () => { state.measure = m.key; state.area = m.area; drawAreas(); drawAsk(); answer(); };
      wrap.append(b);
    }
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
  const [from, to] = windowFor(state.period, state.today);
  const locs = state.scope === 'all' ? state.plants.map(p => p.id) : [state.scope];
  const box = $('#content');
  box.innerHTML = `<p class="cfg__none">Reading…</p>`;

  let rows = [];
  try {
    rows = await kpiRows(m.table, locs, from, to) || [];
  } catch (err) {
    box.innerHTML = `<p class="cfg__none">That read did not come back. ${esc(err.message || '')}</p>`;
    return;
  }

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
        ${state.scope === 'all' && state.plants.length > 1
          ? 'Not every plant reports yet — try a single plant, or a longer period.'
          : 'Try a longer period.'}
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

  if (state.scope === 'all' && state.plants.length > 1) {
    const reporting = new Set(rows.map(r => r.location_id));
    const silent = state.plants.filter(p => !reporting.has(p.id));
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

const scopeName = () => state.scope === 'all'
  ? (state.plants.length > 1 ? `all ${state.plants.length} plants` : (state.plants[0]?.name ?? 'your plant'))
  : (state.plants.find(p => p.id === state.scope)?.name ?? '');

// ── Boot ────────────────────────────────────────────────────────────────────────

async function boot() {
  const session = await currentSession();
  if (!session) { location.replace('../index.html'); return; }

  const [profile, grants] = await Promise.all([myProfile(), myLocations()]);
  state.plants = (grants || [])
    .map(g => g.locations)
    .filter(Boolean)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
    .map(l => ({ id: l.id, name: l.name }));

  $('#foot-user').textContent = profile?.full_name || session.user.email || '';
  $('#foot-loc').textContent = state.plants.length > 1
    ? `${state.plants.length} plants` : (state.plants[0]?.name ?? 'No plant');
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

  drawAreas();
  drawAsk();
  answer();
}

boot();
