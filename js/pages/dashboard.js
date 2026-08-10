// The daily dashboard.
//
// Three people work a morning at once, so nothing here claims the day. "Enter data" shows
// the input fields and is a preference belonging to the person who pressed it; two people
// can have it on together. Each field saves itself as it is typed, and every save is a
// write to one column, so two people filling in two readings never overwrite each other.

import {
  currentSession, signOut, myProfile, myLocations, savePreference,
  openDay, loadDay, loadHistory, loadBudgets, saveField, saveDepartment, saveReview,
  saveBudget, saveLabour, publish, recordEdit, joinDay, loadOperators, loadReportedDates,
  importHistory,
} from '../db.js?v=9dd18e47b6ea';
import { assess, attention, settled, verdicts } from '../assess.js?v=9dd18e47b6ea';
import {
  esc, band, MONTHS, DAYS, dateOf, daysBetween, num, shortDate, money, trend,
  metricCard, footLine, drawReading, showsHeroNumber, CHART_ICONS, CHART_NAMES, iconFor,
  spark, bullet, chip, cardTrack, readingOf, derivedShipping, SHIPPING_TARGET,
  volumeLabel, rateLabel, hoursLabel,
} from '../readings.js?v=9dd18e47b6ea';

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
  history: { metrics: [], departments: [] }, findings: [], verdicts: {}, plant: null,
  chart: 'bar', team: [], live: null, wallStep: 0,
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
const metricSeries = field => (state.history?.metrics || [])
  .map(row => readingOf(row, field))
  .filter(value => value !== null && value !== undefined && value !== '')
  .map(Number);
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
// Two views over the whole morning, then the five sections for when someone asks a
// question the views do not answer. Today is first because the meeting is two minutes
// long and the fastest possible read is the one that says what needs deciding.
const VIEWS = ['line', 'board'];
// The order the meeting actually walks: what happened to people, what the plant made,
// what left the building, what it earned, and what needs fixing.
// Safety and quality were one section because the old dashboard drew them in one row.
// They are two subjects with two owners, and on a wall each deserves its own screen — six
// quality readings do not fit under two safety ones.
const ORDER = ['safety', 'quality', 'production', 'shipping', 'financials', 'maintenance', 'labour'];
const TITLES = {
  safety: 'Safety', quality: 'Quality', production: 'Production', shipping: 'Shipping',
  maintenance: 'Maintenance', labour: 'Labour & Overtime', financials: 'Financials',
};
const NAV = { labour: 'Labour', line: 'Today', board: 'Board' };
Object.assign(TITLES, { line: 'Today', board: 'The board' });
Object.assign(ICONS, {
  line:  'M4 6h16M4 12h10M4 18h6',
  board: 'M4 4h4v16H4zM10 4h4v16h-4zM16 4h4v16h-4z',
});

// A reading, drawn the way the room reads it: what it is, how big, against what, and
// which way it has been going. Used by both Today and the Board so the two cannot drift.
function readingBody(r, { showSpark = true } = {}) {
  const line = showSpark && r.series?.length > 1 ? spark(r.series, r.tone) : '';
  const bar = r.target
    ? bullet({ actual: Number(String(r.value).replace(/[^0-9.-]/g, '')) || r.raw || 0,
               target: r.target, tone: r.tone, floor: r.floor || 0, ceiling: r.ceiling || 0,
               lowerIsBetter: !!r.lowerIsBetter })
    : '';
  return { line, bar };
}

const capitalised = text => text ? text[0].toUpperCase() + text.slice(1) : '';

const field = (label, name, attrs = '') =>
  `<div class="er"><label>${esc(label)}</label>
   <input class="inp" data-field="${name}" ${attrs}></div>`;

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
    // No bar and no line. A streak is chased, not met, so a bar against the record fills a
    // little further every morning and tells the room nothing it did not know yesterday —
    // and the one morning it does matter, the flag above says so in words. The record and
    // the date it was set are the context, and they fit on the line under the rule.
    foot: footLine([
      ['Record', record ? `${record} days` : null],
      [`Last ${word}`, shortDate(last)],
    ]),
    edit: field('Last', lastField, `type="date" value="${last || ''}"`)
        + field('Record', recordField, `type="number" value="${record || ''}"`),
  });
}

function coqCard(kind, label, valueField, targetField) {
  const value = metric(valueField), target = Number(metric(targetField) || 0.85);
  const has = value != null && value !== '';
  const tone = has ? band.coq(Number(value), target) : '';
  const off = has ? Number(value) - target : 0;
  return metricCard({
    chart: state.chart, pkey: kind, label, tone,
    value: has ? Number(value).toFixed(2) : '\u2014', unit: '%', sub: 'of sales',
    percent: has ? Number(value) / (target * 1.6) * 100 : 0,
    markPercent: 100 / 1.6, markLabel: 'target',
    // The bar against target, and no line. Cost of quality is a month-long figure — seven
    // mornings of it is seven readings of the same number, drawn as a slope that means
    // nothing, and it was the widest thing on the card.
    track: has ? cardTrack({
      chart: state.chart, actual: Number(value), target, tone, lowerIsBetter: true,
      targetText: `Against \u2264 ${target.toFixed(2)}%`, deltaTone: tone,
      deltaText: `${off <= 0 ? '\u2212' : '+'}${Math.abs(off).toFixed(2)} pts`,
    }) : '',
    foot: footLine([
      ['Target', `\u2264 ${target.toFixed(2)}%`],
      ['Variance', has ? `${off <= 0 ? '\u2212' : '+'}${Math.abs(off).toFixed(2)} pts` : null],
    ]),
    edit: field('Actual %', valueField, `type="number" step="0.01" value="${value ?? ''}"`)
        + field('Target %', targetField, `type="number" step="0.01" value="${target}"`),
  });
}

const SECTIONS = {
  // ── Today ──
  // Leads with what is not ok and counts the rest. Two minutes is the whole meeting, so
  // a reading that needs no decision is a tick, not a paragraph.
  line: () => {
    const flags = attention(state.findings), fine = settled(state.findings);
    const worst = flags.some(f => f.tone === 'stop') ? 'stop' : flags.length ? 'warn' : 'ok';
    const headline = !state.findings.length
      ? ['Nothing entered yet', 'Open Enter data and fill in this morning.']
      : flags.length
        ? [`${flags.length} thing${flags.length > 1 ? 's need' : ' needs'} the room today`,
           `${fine.length} other reading${fine.length === 1 ? ' is' : 's are'} on target.`]
        : ['Everything is on target', `All ${fine.length} readings within target this morning.`];

    return `<div class="today today--${worst}">
      <span class="today__n">${flags.length}</span>
      <div class="today__t"><h2>${esc(headline[0])}</h2><p>${esc(headline[1])}</p></div>
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

    ${fine.length ? `<div class="settled">
      <div class="sec__head"><span class="eyebrow">On target</span><div class="sec__rule"></div></div>
      <div class="settled__chips">${fine.map(r =>
        `<span class="tick"><span class="tick__n">${esc(r.value)}</span>
         <span class="tick__l">${esc(r.title.toLowerCase())}</span></span>`).join('')}</div>
    </div>` : ''}`;
  },

  // ── The board ──
  // One lane per area, one owner per lane, in the order the meeting walks them.
  board: () => {
    if (!state.findings.length) return `<div class="panel"><div class="panel__body">
      Nothing entered for this morning yet.</div></div>`;
    const areas = [];
    for (const r of state.findings) {
      let lane = areas.find(a => a.name === r.area);
      if (!lane) areas.push(lane = { name: r.area, owner: r.owner, readings: [] });
      lane.readings.push(r);
    }
    return `<div class="lanes">${areas.map(lane => {
      const head = lane.readings[0];
      const tone = band.worst(lane.readings.filter(r => !r.quiet && r.tone).map(r => r.tone));
      const { line, bar } = readingBody(head);
      const rest = lane.readings.slice(1);
      const note = lane.readings.map(r => r.note).find(Boolean);
      return `<div class="lane lane--${tone}" data-pkey="${esc(head.key)}">
        <div class="lane__head"><h3>${esc(lane.name)}</h3>
          <span class="lane__owner">${esc(lane.owner || '')}</span></div>
        <div class="lane__body">
          <div class="lane__n">${esc(head.value)}<small> ${esc(head.unit || '')}</small></div>
          <div class="lane__sub">${esc(head.targetLabel || '')}${
            head.delta ? ` · ${chip(head.deltaTone || tone, head.delta)}` : ''}</div>
          ${bar}${line}
          ${rest.length ? `<div class="lane__rest">${rest.map(r =>
            `<div class="lane__row"><span>${esc(r.title)}</span>
             <b class="tone--${r.tone || 'none'}">${esc(r.value)}</b></div>`).join('')}</div>` : ''}
        </div>
        <div class="lane__foot">${note ? esc(note) : '<span class="lane__quiet">Nothing reported.</span>'}</div>
      </div>`;
    }).join('')}</div>`;
  },

  safety: () => `<div class="grid grid--cards">
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
    // Not every plant raises NCRs or splits its complaints, and a card that reads a
    // permanent dash teaches the room that a blank is normal. Which of the three appear is
    // a switch on the plant, set in Configure.
    const on = key => state.plant?.[key] !== false;
    // `name`, not `field` — the parameter was called `field` and shadowed the helper of
    // the same name two scopes up, so every quality card threw on its edit row.
    const counter = (key, label, icon, name, sub) => {
      const value = metric(name);
      return metricCard({
        chart: 'number', pkey: key, label, icon, tone: '',
        value: value == null ? '\u2014' : num(value), sub,
        // No foot. The only thing worth saying about a year-to-date count is the count,
        // and it is already the largest thing on the card — repeating it under a rule
        // labelled "year to date" says it three times.
        edit: field(label, name, `type="number" min="0" value="${value ?? ''}"`),
      });
    };
    return `<div class="grid grid--cards">
      ${metricCard({
        chart: 'number', pkey: 'shortages', label: 'Shortage count', tone: shortTone,
        value: shortages ?? '\u2014', sub: 'jobs short today',
        foot: footLine([['Target', '0']]),
        edit: field('Count', 'shortages', `type="number" min="0" value="${shortages ?? ''}"`),
      })}
      ${coqCard('coq', 'COQ \u2014 month to date', 'coq', 'coq_target')}
      ${coqCard('coqytd', 'COQ \u2014 year to date', 'coq_ytd', 'coq_ytd_target')}
      ${on('show_ncr') ? counter('ncr', 'NCRs received', '\u{1F4CB}', 'ncr_ytd', 'year to date') : ''}
      ${on('show_internal') ? counter('cint', 'Internal complaints', '\u{1F3ED}', 'complaints_internal', 'year to date') : ''}
      ${on('show_external') ? counter('cext', 'Customer complaints', '\u{1F4E3}', 'complaints_external', 'year to date') : ''}
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
        chart: state.chart, pkey: config.key, label: config.name, medium: true,
        icon: config.icon || iconFor(config.key), tone,
        value: rate ? num(Math.round(rate)) : '—', sub: rateLabel(config),
        percent: target ? rate / (target * 1.25) * 100 : 0,
        markPercent: 100 / 1.25, markLabel: 'target',
        // The bar and the line answer the two questions the foot does not: how this rate
        // sits against its target as a shape, and which way the week has gone.
        track: cardTrack({
          chart: state.chart, actual: rate, target, tone,
          targetText: `Against ${num(Math.round(target))} ${rateLabel(config)}`,
          deltaText: rate && target
            ? `${rate >= target ? '+' : '\u2212'}${num(Math.round(Math.abs(rate - target)))}` : '',
          deltaTone: tone, series: deptSeries(config.key),
        }),
        // Target, what was made, and the hours it took — the three things asked after the
        // rate itself, on one line. "vs target" is not among them any more: the bar above
        // is that number drawn, and printing it twice on the same card was half the reason
        // the card felt crowded.
        // Three facts, one row: what the target was, what was made against it, and the
        // hours it took. They were two rows, which spent a whole line on the hours.
        foot: footLine([
          ['Target', num(Math.round(target))],
          [volumeLabel(config), row.qty ? num(row.qty) : null],
          [hoursLabel(config), row.hours ? `${row.hours} h` : null],
        ]),
        edit: field(volumeLabel(config), `dept:${config.key}:qty`, `type="number" value="${row.qty ?? ''}"`)
            + field(hoursLabel(config), `dept:${config.key}:hours`, `type="number" step="0.1" value="${row.hours ?? ''}"`)
            + field('Target', `dept:${config.key}:target`, `type="number" value="${row.target ?? config.target}"`)
            + field('Uptime', `dept:${config.key}:uptime`, `type="number" step="0.001" placeholder="0.88" value="${row.uptime ?? ''}"`)
            + field('Make-ready', `dept:${config.key}:make_ready`, `type="number" step="0.01" placeholder="hours" value="${row.make_ready ?? ''}"`),
      });
    }).join('');

    const unitsInPlay = [...new Set(list.map(c => volumeLabel(c)))];

    // Last week's productivity, against the targets the plant set — not against today.
    //
    // The table used to run today's rate, today's uptime and today's make-ready beside the
    // previous week's, each with a seven-day movement. That is four comparisons per
    // department on a table nobody reads mid-sentence, and three of them are already on
    // the card above it. What is left is the thing the card cannot say: what the same
    // weekday produced, and how that sat against target.
    const weekRow = config => {
      const row = dept(config.key);
      const rate = Number(row.pw_hours) ? Number(row.pw_qty) / Number(row.pw_hours) : 0;
      const target = Number(row.target ?? config.target);
      const upTarget = Number(config.uptime_target || 0) * 100;
      const mrTarget = Number(config.mr_target || 0);
      return `<tr><td class="dept">${esc(config.name)}</td>
        <td class="num">${row.pw_qty ? num(row.pw_qty) : '—'}</td>
        <td class="num">${row.pw_hours ? `${row.pw_hours} h` : '—'}</td>
        <td class="num big tone--${band.rate(rate, target) || 'none'}">${
          rate ? num(Math.round(rate)) : '—'}</td>
        <td class="num">${num(Math.round(target))}</td>
        <td class="num">${rate && target ? trend(rate, target) : '—'}</td>
        <td class="num">${upTarget ? `${upTarget.toFixed(0)}%` : '—'}</td>
        <td class="num">${mrTarget ? `${mrTarget.toFixed(2)} h` : '—'}</td>
      </tr>`;
    };

    const weekEdit = list.map(config => {
      const row = dept(config.key);
      return `<div class="er"><label>${esc(config.name)}</label>
        <input class="inp" data-field="dept:${config.key}:pw_qty" type="number"
          value="${row.pw_qty ?? ''}" aria-label="${esc(config.name)} previous week volume">
        <input class="inp" data-field="dept:${config.key}:pw_hours" type="number" step="0.1"
          value="${row.pw_hours ?? ''}" aria-label="${esc(config.name)} previous week hours"></div>`;
    }).join('');

    // The cards used to share a row with this table, sized by counting the departments.
    // That worked while there were three and stopped the moment a plant could add its own.
    // The cards wrap on their own now and the table takes the full width underneath.
    return `<div class="grid grid--cards">${cards}</div>
    <div class="panel" style="margin-top:var(--s3)">
      <div class="panel__head"><span class="card__ico" aria-hidden="true">📅</span>
        <h3 class="panel__title">Last week&rsquo;s productivity</h3>
        <span class="panel__actions chip">Same weekday</span></div>
      <div class="panel__body">
        <table class="tbl tbl--week"><thead><tr>
          <th>Department</th>
          <th class="num">${esc(unitsInPlay.length === 1 ? capitalised(unitsInPlay[0]) : 'Volume')}</th>
          <th class="num">Hours</th>
          <th class="num">Per hour</th>
          <th class="num">Target</th>
          <th class="num">vs target</th>
          <th class="num">Uptime target</th>
          <th class="num">Make-ready target</th>
        </tr></thead><tbody>${list.map(weekRow).join('')}</tbody></table>
        <div class="ez">${weekEdit}</div>
      </div>
    </div>
    <div class="sec__head" style="margin-top:var(--s3)">
      <h3 class="sec__title" style="font-size:var(--t-lead)">Review — last 24 hours</h3>
      <div class="sec__rule"></div></div>
    <div class="grid grid--cards">
      ${state.review.map(row => {
        const config = state.config.find(c => c.key === row.dept_key);
        const name = config?.name || row.dept_key;
        return `<div class="revcard revcard--${row.status}" data-pkey="rev-${esc(row.dept_key)}">
          <div class="revcard__head"><span class="rev__dot rev__dot--${row.status}"></span>
            <span class="card__ico" aria-hidden="true">${config?.icon || iconFor(row.dept_key)}</span>
            <h4>${esc(name)}</h4></div>
          <div class="rev__note${row.note ? '' : ' rev__note--none'}">${esc(row.note || 'No issues reported.')}</div>
          <div class="ez">
            <div class="er"><label>Status</label>
              <select class="inp" data-field="review:${esc(row.dept_key)}:status">
                ${[['ok','No issue'],['warn','Warning'],['stop','Issue']].map(([v, t]) =>
                  `<option value="${v}"${row.status === v ? ' selected' : ''}>${t}</option>`).join('')}
              </select></div>
            <div class="er"><label>Note</label>
              <textarea class="inp" data-field="review:${esc(row.dept_key)}:note">${esc(row.note)}</textarea></div>
          </div></div>`;
      }).join('')}
    </div>`;
  },

  shipping: () => {
    const read = name => metric(name);
    // Eight cards in two rows of four, drawn by the same function every other section uses.
    // This was a joined strip with the cells sharing borders and two of them washed violet,
    // which made shipping look like a different product bolted to the page. Nothing about
    // these readings is special enough to earn its own component.
    const ship = (name, label, icon, { value, unit = '', sub = '', tone = '', target = 0,
                                       floor = 0, ceiling = 0, series = null,
                                       lowerIsBetter = false, foot = [] }) => metricCard({
      chart: target ? state.chart : 'number', pkey: name, label, icon, tone,
      value, unit, sub,
      percent: target ? Number(value || 0) / target * 100 : 0,
      markPercent: target ? 100 : null, markLabel: 'target',
      track: series ? cardTrack({
        chart: target ? state.chart : 'number',
        actual: Number(value || 0), target, tone, floor, ceiling, lowerIsBetter,
        targetText: target ? `Against ${target}%` : '', seriesLabel: 'Last 7 mornings', series,
      }) : '',
      foot: footLine(foot),
    });

    const pct = (name, label, icon, sub) => {
      const value = read(name);
      const tone = value == null ? '' : band.pct(Number(value), SHIPPING_TARGET);
      return ship(name, label, icon, {
        value: value == null ? '\u2014' : Number(value).toFixed(2), unit: value == null ? '' : '%',
        sub, tone, target: SHIPPING_TARGET, floor: 90, ceiling: 100, series: metricSeries(name),
        foot: [['Target', `\u2265 ${SHIPPING_TARGET}%`],
               ['Variance', value == null ? null : (() => {
                 const off = Number(value) - SHIPPING_TARGET;
                 return `${off >= 0 ? '+' : '\u2212'}${Math.abs(off).toFixed(2)} pts`;
               })()]],
      });
    };
    const count = (name, label, icon, sub) => {
      const value = read(name);
      const tone = value == null ? '' : band.count(Number(value));
      return ship(name, label, icon, {
        value: value ?? '\u2014', sub, tone,
        foot: [['Target', '0']],
      });
    };

    return `<div class="grid grid--cards">
      ${ship('jobs_shipped', 'Jobs shipped', '\u{1F69A}', {
        value: read('jobs_shipped') == null ? '\u2014' : num(read('jobs_shipped')), sub: 'today',
        foot: [['On time', read('jobs_on_time') ?? null],
               ['Of', read('jobs_shipped') ?? null]] })}
      ${ship('cartons', 'Cartons', '\u{1F4E6}', {
        value: read('cartons') == null ? '\u2014' : num(read('cartons')), sub: 'shipped today',
        foot: [['Per job', read('cartons') && read('jobs_shipped')
          ? num(Math.round(read('cartons') / read('jobs_shipped'))) : null]] })}
      ${count('late', 'Late', '\u23F0', 'shipments')}
      ${count('shorts', 'Shorts', '\u{1F6AB}', 'shipments')}
      ${pct('otd', 'OTD', '\u{1F3AF}', 'on-time delivery')}
      ${pct('otif', 'OTIF', '\u{1F3AF}', 'on time, in full')}
      ${pct('mtd_otif', 'MTD OTIF', '\u{1F4C5}', 'month to date')}
      ${pct('ytd_otif', 'YTD OTIF', '\u{1F4C5}', 'year to date')}
    </div>
    <div class="panel edit-only" style="margin-top:var(--s3)"><div class="panel__body"><div class="grid g4">
      ${[['Jobs shipped','jobs_shipped'],['On time','jobs_on_time'],['Cartons','cartons'],
         ['Late','late'],['Shorts','shorts'],['MTD OTIF %','mtd_otif'],['YTD OTIF %','ytd_otif']]
        .map(([label, name]) => field(label, name, `type="number" step="0.01" value="${state.metrics?.[name] ?? ''}"`)).join('')}
      <p class="note-derived">OTD and OTIF are worked out from jobs, late and short.</p>
    </div></div></div>`;
  },

  maintenance: () => {
    const overdue = state.maintenance.filter(m => m.status === 'Overdue').length;
    const open = state.maintenance.filter(m => m.status !== 'Complete').length;
    const rows = state.maintenance.length
      ? state.maintenance.map(m => `<tr><td class="dept">${esc(m.dept)}</td>
          <td>${esc(m.item_type)}</td><td>${esc(m.frequency)}</td><td>${esc(m.scheduled)}</td>
          <td><span class="pill pill--${band.maint(m.status)}">${esc(m.status)}</span></td></tr>`).join('')
      : `<tr><td colspan="5" style="color:var(--ink-faint)">Nothing scheduled for today.</td></tr>`;
    // Maintenance reached the wall as a blank screen. Only cards go up there — a five-row
    // schedule is a thing you lean in for, not a thing a room reads across ten metres —
    // and this section had none, so the walk had a slide with nothing on it. The two
    // counts the schedule is checked for are the two the room actually asks about, and
    // they are the same card as every other section's.
    const done = state.maintenance.filter(m => m.status === 'Complete').length;
    const any = state.maintenance.length;
    return `<div class="grid grid--cards">
      ${metricCard({
        chart: 'number', pkey: 'maint-overdue', icon: '\u{1F527}', label: 'Overdue items',
        tone: any ? band.maint(overdue ? 'Overdue' : 'Complete') : '',
        value: any ? String(overdue) : '—',
        sub: any ? 'past their scheduled date' : 'Nothing scheduled today',
        foot: footLine([['Target', '0']]),
      })}
      ${metricCard({
        chart: 'number', pkey: 'maint-open', icon: '\u{1F4C5}', label: 'Open work',
        tone: '',
        value: any ? String(open) : '—',
        sub: any ? `of ${any} scheduled today` : 'Nothing scheduled today',
        foot: footLine([['Completed', any ? `${done} of ${any}` : null]]),
      })}
    </div>
    <div class="panel" style="margin-top:var(--s3)">
      <div class="panel__head"><span class="card__ico" aria-hidden="true">🔧</span>
        <h3 class="panel__title">Today&rsquo;s schedule</h3>
        <div class="panel__actions">
          <span class="pill pill--${overdue ? 'stop' : 'ok'}">${overdue} overdue</span>
          <span class="pill pill--info">${open} open</span></div></div>
      <div class="panel__body"><table class="tbl"><thead><tr><th>Department</th><th>Type</th>
        <th>Frequency</th><th>Scheduled</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>
      <!-- The note belongs to the schedule, so it sits under it rather than in a panel of
           its own beside it. Two panels at 1.7fr and 1fr put a five-row table next to three
           words and made the page look like two pages. -->
      <div class="panel__note" data-pkey="notes">
        <span class="panel__notel">Notes</span>
        <span class="rev__note${metric('maintenance_note') ? '' : ' rev__note--none'}">${
          esc(metric('maintenance_note') || 'No notes entered.')}</span>
      </div>
      <div class="ez">
        <div class="er"><label>Notes</label><textarea class="inp"
          data-field="maintenance_note">${esc(metric('maintenance_note') || '')}</textarea></div>
      </div>
    </div>`;
  },

  // ── Labour & overtime ──
  //
  // Split out of Maintenance, because they were one section only in the sense that both
  // were a note. Maintenance is a schedule with a status. Overtime is a cost the plant is
  // choosing to spend this morning, and the meeting's question about it is always the same
  // two-part one: which departments, and how many shifts.
  //
  // Shifts rather than hours. It is the unit the floor talks in and the one a supervisor
  // can answer without a timesheet — the hours turn up in the pay period two weeks later,
  // and the shift count is the thing nobody writes down.
  labour: () => {
    const list = state.config.filter(c => c.active !== false);
    const shiftsFor = key => Number(state.labour.find(l => l.dept_key === key)?.ot_shifts ?? 0);
    const noteFor = key => state.labour.find(l => l.dept_key === key)?.note || '';
    const running = list.filter(c => shiftsFor(c.key) > 0);
    const total = list.reduce((sum, c) => sum + shiftsFor(c.key), 0);
    const entered = state.labour.some(l => l.ot_shifts != null);

    const headline = !entered
      ? ['—', 'Nothing entered yet']
      : total === 0
        ? ['0', 'No overtime this morning']
        : [String(total), `${running.length} department${running.length === 1 ? '' : 's'} on overtime`];

    // Two cards, because one card in a bespoke two-column grid is what pinned a single
    // narrow card to the left edge of the wall with two thirds of the screen empty beside
    // it. The second card is not padding: how many shifts and how many departments are the
    // two halves of the question the meeting actually asks, and the table underneath —
    // which does not reach the wall — is that answer in detail.
    const busiest = running.length
      ? [...running].sort((a, b) => shiftsFor(b.key) - shiftsFor(a.key))[0] : null;

    return `<div class="grid grid--cards">
      ${metricCard({
        chart: 'number', pkey: 'ot-total', icon: '\u{23F1}\u{FE0F}', label: 'Overtime shifts',
        tone: total > 0 ? 'warn' : entered ? 'ok' : '',
        value: headline[0], sub: `shifts \u00b7 ${headline[1]}`,
        foot: footLine([['Target', '0 shifts']]),
      })}
      ${metricCard({
        chart: 'number', pkey: 'ot-depts', icon: '\u{1F477}', label: 'Departments on OT',
        tone: running.length > 0 ? 'warn' : entered ? 'ok' : '',
        value: entered ? String(running.length) : '\u2014',
        sub: entered ? `of ${list.length} running` : 'Nothing entered yet',
        foot: footLine([['Most shifts', busiest ? esc(busiest.name) : null]]),
      })}
    </div>
    <div class="grid" style="grid-template-columns:1fr;margin-top:var(--s3)">
      <div class="panel">
        <div class="panel__head"><span class="card__ico" aria-hidden="true">👷</span>
          <h3 class="panel__title">Which departments</h3>
          <div class="panel__actions">
            <span class="pill pill--${total > 0 ? 'warn' : 'ok'}">${total} shift${total === 1 ? '' : 's'}</span>
          </div></div>
        <div class="panel__body">
          <table class="tbl"><thead><tr><th>Department</th>
            <th class="num">OT shifts</th><th>Why</th></tr></thead>
            <tbody>${list.map(c => {
              const shifts = shiftsFor(c.key), note = noteFor(c.key);
              return `<tr data-pkey="ot-${esc(c.key)}">
                <td class="dept"><span class="card__ico" aria-hidden="true"
                  style="font-size:1em">${c.icon || iconFor(c.key)}</span> ${esc(c.name)}</td>
                <td class="num big${shifts > 0 ? ' tone--warn' : ''}">${shifts > 0 ? shifts : '—'}</td>
                <td>${note ? esc(note) : '<span class="lane__quiet">—</span>'}</td></tr>`;
            }).join('')}</tbody></table>
          <div class="ez">${list.map(c => `<div class="er">
            <label>${esc(c.name)}</label>
            <input class="inp" data-field="labour:${esc(c.key)}:ot_shifts" type="number"
              step="0.5" min="0" value="${state.labour.find(l => l.dept_key === c.key)?.ot_shifts ?? ''}"
              aria-label="${esc(c.name)} overtime shifts">
            <input class="inp" data-field="labour:${esc(c.key)}:note" type="text"
              placeholder="why" value="${esc(noteFor(c.key))}"
              aria-label="${esc(c.name)} overtime reason"></div>`).join('')}
          </div>
        </div>
      </div>
      <div class="panel" style="grid-column:1/-1">
        <div class="panel__head"><span class="card__ico" aria-hidden="true">🧑‍🏭</span>
          <h3 class="panel__title">Staffing notes</h3></div>
        <div class="panel__body" data-pkey="staffing">
          <div class="rev__note${metric('staffing_note') ? '' : ' rev__note--none'}">${
            esc(metric('staffing_note') || 'No notes entered.')}</div>
          <div class="ez"><div class="er"><label>Staffing</label><textarea class="inp"
            data-field="staffing_note">${esc(metric('staffing_note') || '')}</textarea></div></div>
        </div>
      </div>
    </div>`;
  },

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
    const pane = (key, title, icon, actual, budget, tone, variance, percent, budgetRow, whenRow) => {
      const pace = budget ? Math.round(actual / budget * 100) : 0;
      return metricCard({
        chart: 'number', pkey: key, label: title, icon, tone,
        // The figure is the reading and the pace is what it means — the two things the
        // room asks for, on the two lines a card already has for them.
        value: money(actual), sub: `${pace}% of budget`,
        // The chart choice reaches the money too. A page where five readings are rings and
        // the sales figure is bare reads as two designs rather than one.
        // `chart:'number'`, not the reader's choice: the reading itself is the money, so
        // the card's body is a hero rather than a drawing, and cardTrack only draws its
        // bullet when the body did not already draw one. Passing 'bar' here got neither.
        track: cardTrack({
          chart: 'number', actual, target: budget, tone,
          targetText: `Against ${money(budget)} expected`,
          deltaText: `${variance >= 0 ? '+' : '−'}${money(Math.abs(variance))}`,
          deltaTone: tone,
        }),
        foot: footLine([
          budgetRow,
          whenRow,
          ['Variance', `${variance >= 0 ? '▲' : '▼'} ${Math.abs(percent).toFixed(1)}%`],
        ]),
        edit: field(`Actual ${key === 'fin-mtd' ? 'MTD' : 'YTD'}`,
          key === 'fin-mtd' ? 'fin_actual_mtd' : 'fin_actual_ytd',
          `type="number" value="${metric(key === 'fin-mtd' ? 'fin_actual_mtd' : 'fin_actual_ytd') ?? ''}"`),
      });
    };

    return `<div class="grid grid--cards">
      ${pane('fin-mtd', 'Month to date', '\u{1F4B0}', actualMtd, planMtd, toneMtd,
        varianceMtd, percentMtd, [`${MONTHS[month]} budget`, money(monthBudget)],
        // How far into the month the plant is, which is the whole reason the budget is
        // prorated — and one fact on a foot rather than a full-width panel with a
        // progress bar the width of the screen saying "day 9 of 31".
        ['Elapsed', `day ${elapsed} of ${inMonth}`])}
      ${pane('fin-ytd', 'Year to date', '\u{1F4B0}', actualYtd, planYtd, toneYtd,
        varianceYtd, percentYtd, ['Year budget', money(yearBudget)],
        ['Through', shortDate(reportDate.toISOString().slice(0, 10))])}
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
    + ORDER.map(key => link(key, NAV[key] || TITLES[key], ICONS[key], sectionTone(key))).join('')
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

function renderChartPicker() {
  $('#chartpick').innerHTML = ['number', 'bar', 'donut', 'gauge'].map(kind =>
    `<button type="button" data-kind="${kind}" aria-pressed="${state.chart === kind}"
      title="${CHART_NAMES[kind]}" aria-label="${CHART_NAMES[kind]}">${CHART_ICONS[kind]}</button>`).join('');
}

function renderHeader() {
  const d = dateOf(state.date);
  $('#date-long').textContent = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const difference = daysBetween(state.date, today());
  $('#date-rel').textContent = difference === 0 ? 'Today' : difference === 1 ? 'Yesterday'
    : difference > 0 ? `${difference} days ago` : 'Upcoming';
  $('#date').value = state.date;
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
const one = key => `<section class="sec"><div class="sec__head">
  <h2 class="sec__title">${TITLES[key]}</h2><div class="sec__rule"></div></div>
  ${SECTIONS[key]()}</section>`;

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
  content.innerHTML = solo ? one(state.active) : ORDER.map(one).join('');
}

function render() {
  state.findings = assess(state);
  state.verdicts = verdicts(state, state.findings);
  document.body.dataset.view = state.active;
  renderHeader(); renderChartPicker(); renderNav(); renderContent(); renderWho(); paintPresence();
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

// What a card is actually using, top of its first row to bottom of its last. `scrollHeight`
// cannot answer this: the contents are centred, so a card with room to spare reports its own
// height and looks full.
function usedBy(card) {
  const rows = [...card.children].filter(row => row.getClientRects().length);
  if (!rows.length) return 0;
  return rows[rows.length - 1].getBoundingClientRect().bottom
       - rows[0].getBoundingClientRect().top;
}

// Anything that has run out of room: the card itself, a title past its second line, or a
// number, label or date wider than the space it was given.
//
// The vertical test is the title's alone. A hero is set at .95 line-height on purpose, so
// its glyphs are always a little taller than its line box and `scrollHeight` always exceeds
// `clientHeight` — which read as "this card is full" on every card at every size and pinned
// the whole thing at 1. Height that genuinely overruns shows up in the card's own total.
function overflows(card) {
  const style = getComputedStyle(card);
  const room = card.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  if (usedBy(card) > room + 1) return true;
  const title = card.querySelector('.card__label');
  if (title && title.scrollHeight > title.clientHeight + 1) return true;
  for (const part of card.querySelectorAll('.card__label,.hero,.unit,.fs__l,.fs__v,.ctrack__l,.ctrack__d')) {
    if (part.scrollWidth > part.clientWidth + 1) return true;
  }
  return false;
}

function fitCards() {
  for (const grid of document.querySelectorAll('.grid--cards')) {
    const cards = [...grid.children].filter(card => card.classList.contains('card'));
    if (!cards.length) continue;
    grid.style.setProperty('--fit', 1);
    // The fullest card in the screen sets the ceiling. Reading each card's own headroom
    // first means one measurement pass rather than one per step of the search.
    let fit = FIT_MAX;
    for (const card of cards) {
      const style = getComputedStyle(card);
      const room = card.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const used = usedBy(card);
      if (used > 0) fit = Math.min(fit, room / used);
    }
    // Below 1 as well as above it. The proportions are set by the fullest card there is, and
    // on a small laptop a screen of eight came out two pixels over — which under
    // `overflow:hidden` is a foot with its descenders shaved off, and nothing to say so.
    const ceiling = fit;
    fit = Math.min(1, ceiling);
    grid.style.setProperty('--fit', String(fit));
    while (fit > FIT_MIN && cards.some(overflows)) {
      fit -= 0.02;
      grid.style.setProperty('--fit', String(fit));
    }
    for (const step of FIT_STEPS) {
      while (fit + step <= ceiling) {
        grid.style.setProperty('--fit', String(fit + step));
        if (cards.some(overflows)) break;
        fit += step;
      }
      grid.style.setProperty('--fit', String(fit));
    }
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

function bestGrid(count) {
  const gap = cssNum('--s4'), pad = cssNum('--s6');
  // The ratio at which a card's contents exactly fill it, and the tallest it may be drawn
  // before it stops reading as a card. Both live in the stylesheet — this reads them rather
  // than holding a second copy that would drift the first time either is tuned.
  const min = cssNum('--card-r') || 1.13, max = cssNum('--card-r-max') || 1.6;
  const room = { w: window.innerWidth - pad * 2,
                 h: window.innerHeight - cssNum('--wall-chrome'),
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

function wallPages() {
  const pages = [];
  // The sections render themselves, once, and their cards are read back out. Doing it this
  // way rather than keeping a parallel list of readings is what stops the wall drifting
  // from the page: there is one definition of a Shipping card and this is reading it.
  const holder = document.createElement('div');
  for (const key of ORDER) {
    holder.innerHTML = SECTIONS[key]();
    const cards = [...holder.querySelectorAll('.grid--cards > .card')];
    if (!cards.length) continue;
    pages.push({ key, ...bestGrid(cards.length),
                 html: cards.map(card => card.outerHTML).join('') });
  }
  return pages;
}

function renderWall() {
  const pages = wallPages();
  if (!pages.length) return;
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
      <div class="grid grid--cards"
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
  wallResize = setTimeout(() => { renderWall(); fitCards(); }, 120);
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
    if (kind === 'dept') await saveDepartment(state.location, state.date, first, { [second]: value });
    else if (kind === 'labour') await saveLabour(state.location, state.date, first, { [second]: value });
    else if (kind === 'review') await saveReview(state.location, state.date, first, { [second]: value });
    else if (kind === 'budget') await saveBudget(state.location, dateOf(state.date).getFullYear(), Number(first), value ?? 0);
    else await saveField(state.location, state.date, name, value);
    if (['jobs_shipped', 'late', 'shorts'].includes(name)) {
      const derived = derivedShipping(state.metrics);
      if (derived) {
        state.metrics.otd = derived.otd;
        state.metrics.otif = derived.otif;
        await saveField(state.location, state.date, 'otd', derived.otd);
        await saveField(state.location, state.date, 'otif', derived.otif);
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
  if (kind === 'dept') {
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
document.addEventListener('input', event => {
  const name = event.target.dataset?.field;
  if (!name) return;
  const value = parse(event.target, event.target.value);
  applyLocally(name, value);

  clearTimeout(sendTimer);
  sendTimer = setTimeout(() => persist(name, value), 450);

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
  if (!name || event.target.tagName !== 'SELECT') return;
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
    const [day, budgets, history] = await Promise.all([
      loadDay(location, date),
      loadBudgets(location, dateOf(date).getFullYear()),
      loadHistory(location, from.toISOString().slice(0, 10), date),
    ]);
    Object.assign(state, day, { budgets: budgets || [], history });
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

$('#chartpick').addEventListener('click', event => {
  const button = event.target.closest('[data-kind]');
  if (!button) return;
  state.chart = button.dataset.kind;
  render();
  savePreference(state.me.id, { chart_style: state.chart }).catch(() => {});
});

$('#rail-btn').addEventListener('click', () => {
  const mini = document.documentElement.dataset.rail === 'mini';
  document.documentElement.dataset.rail = mini ? '' : 'mini';
  $('#rail-btn').setAttribute('aria-label', mini ? 'Collapse menu' : 'Expand menu');
  $('#rail-btn').querySelector('path').setAttribute('d', mini ? 'M15 5 L8 12 L15 19' : 'M9 5 L16 12 L9 19');
  savePreference(state.me.id, { rail_collapsed: !mini }).catch(() => {});
});

$('#edit-btn').addEventListener('click', () => {
  // Showing the fields is a personal view. It claims nothing and blocks nobody.
  const on = document.body.classList.toggle('editing');
  $('#edit-btn').textContent = on ? 'Done editing' : 'Edit mode';
  $('#publish-btn').classList.toggle('hide', !on);
  paintPresence();
});

$('#publish-btn').addEventListener('click', async () => {
  try {
    await publish(state.location, state.date);
    if (state.metrics) state.metrics.status = 'published';
    document.body.classList.remove('editing');
    $('#edit-btn').textContent = 'Edit mode';
    $('#publish-btn').classList.add('hide');
    toast('Published — every screen shows this now');
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
  const total = wallPages().length || 1;
  state.wallStep = ((state.wallStep + direction) % total + total) % total;
  renderWall();
  fitCards();
};
$('#tv-btn').addEventListener('click', () => {
  document.body.classList.add('tv');
  state.wallStep = 0;
  render();
});
$('#tv-exit').addEventListener('click', () => { document.body.classList.remove('tv'); render(); });
$('#tv-next').addEventListener('click', () => step(1));
$('#tv-prev').addEventListener('click', () => step(-1));

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
state.chart = profile.chart_style || 'bar';
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

  // What a JSON export turned into, and every key it could not place. A file that
  // half-works has to say which half, or somebody is left diffing two screens.
  const jsonPanel = !p.json ? '' : `
    <div class="sheet__sub">From the old dashboard</div>
    <p class="drop__note">${p.json.days.length} ${p.json.days.length === 1 ? 'morning' : 'mornings'},
      ${shortDate(p.json.days[0].date)} to ${shortDate(p.json.days[p.json.days.length - 1].date)}.
      Only mornings this plant has no reading for are written; anything already entered stays.</p>
    <table class="tbl"><thead><tr><th>Date</th><th class="num">Readings</th>
      <th class="num">Departments</th></tr></thead><tbody>${
      p.json.days.slice(0, 12).map(d => `<tr><td>${shortDate(d.date)}</td>
        <td class="num">${Object.keys(d.metrics).length}</td>
        <td class="num">${Object.keys(d.departments).length}</td></tr>`).join('')}
      ${p.json.days.length > 12 ? `<tr><td colspan="3" class="soft">…and ${p.json.days.length - 12} more</td></tr>` : ''}
    </tbody></table>
    <div class="keys">
      <div><div class="keys__l">Recognised</div>
        <div class="keys__v">${p.json.recognised.length
          ? p.json.recognised.map(k => `<code>${esc(k)}</code>`).join(' ') : '—'}</div></div>
      <div><div class="keys__l keys__l--bad">Not recognised — tell me these and I will add them</div>
        <div class="keys__v">${p.json.unknown.length
          ? p.json.unknown.map(k => `<code>${esc(k)}</code>`).join(' ')
          : 'Nothing. Every key in the file was placed.'}</div></div>
    </div>`;

  const covering = p.covering.length === 1
    ? shortDate(p.covering[0])
    : `${shortDate(p.covering[0])} – ${shortDate(p.covering[p.covering.length - 1])}`;

  const rows = p.departments.map(d => {
    const config = state.config.find(c => c.key === d.dept_key);
    const current = dept(d.dept_key);
    const changed = Number(current.qty) !== d.qty || Number(current.hours) !== d.hours;
    return `<tr>
      <td class="dept">${esc(config?.name || d.dept_key)}</td>
      <td class="num big">${num(d.qty)}</td>
      <td class="num">${d.hours}<em> h</em></td>
      <td class="num big">${d.rate ? num(Math.round(d.rate)) : '—'}</td>
      <td class="num soft">${d.uptime == null ? '—' : (d.uptime * 100).toFixed(1) + '%'}</td>
      <td class="num soft">${d.make_ready == null ? '—' : d.make_ready.toFixed(2) + ' h'}</td>
      <td>${esc(d.machines.join(', '))} · ${d.shifts} shift${d.shifts === 1 ? '' : 's'}</td>
      <td>${changed ? '<span class="pill pill--warn">changes</span>'
                    : '<span class="pill pill--ok">same</span>'}</td></tr>`;
  }).join('');

  const ship = p.shipping ? `<table class="tbl"><thead><tr>
      <th>Jobs shipped</th><th class="num">Late</th><th class="num">Short</th>
      <th class="num">OTD</th><th class="num">OTIF</th></tr></thead>
    <tbody><tr><td class="big">${p.shipping.jobs_shipped}</td>
      <td class="num">${p.shipping.late}</td><td class="num">${p.shipping.shorts}</td>
      <td class="num">${p.shipping.otd.toFixed(1)}%</td>
      <td class="num">${p.shipping.otif.toFixed(2)}%</td></tr></tbody></table>`
    : `<p class="drop__note">No shipping row for ${shortDate(p.span.to)}.</p>`;

  // A JSON history export carries no shift rows, so the workbook half of the preview is
  // omitted rather than printed empty. Either half on its own is a valid import.
  const hasWorkbook = p.departments.length > 0 || p.shipping;
  if (!hasWorkbook && p.json) {
    return `${jsonPanel}
      ${p.notes.length ? `<h3 class="sheet__sub">Notes</h3>
        <ul class="drop__notes">${p.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <div class="sheet__foot">
        <span class="drop__note">${p.sources.map(x => `${esc(x.file)} · ${num(x.rows)} mornings`).join(' · ')}</span>
        <button class="btn" id="import-again">Choose different files</button>
        <button class="btn btn--go" id="import-apply">Write ${p.json.days.length} morning${
          p.json.days.length === 1 ? '' : 's'}</button>
      </div>`;
  }

  return `
    <p class="drop__lead">This morning covers <b>${esc(covering)}</b> — ${p.shiftCount}
      shift${p.shiftCount === 1 ? '' : 's'} across ${p.departments.length} department${
      p.departments.length === 1 ? '' : 's'}.</p>
    <p class="drop__note">A morning reports the production since the last one. On Tuesday to
      Friday that is yesterday; on Monday it is Friday, Saturday and Sunday together.</p>
    <table class="tbl"><thead><tr><th>Department</th><th class="num">Output</th>
      <th class="num">Crew hrs</th><th class="num">Per hr</th><th class="num soft">Uptime*</th>
      <th class="num soft">Make-ready*</th><th>From</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="8">Nothing found for these dates.</td></tr>'}</tbody></table>
    <p class="drop__note">* Uptime and make-ready are shown from the DOR's own columns but
      are <b>not imported</b>. Rolled the same way, 4 August gives printing 68.2% and 1.03 h
      where the plant's own figures for that day are 100% and 0.95 h — so these two come
      from a definition this cannot see. Output and crewed hours reproduce that day exactly.
      Keep entering uptime and make-ready by hand until the definition is confirmed.</p>
    <h3 class="sheet__sub">Shipping</h3>
    ${ship}
    ${p.unknownNames.length ? `<h3 class="sheet__sub">Names not on the operator list</h3>
      <p class="drop__note">Imported as typed. Nothing is dropped and nothing is invented —
      add them to the operator list if they belong there.</p>
      <p class="drop__names">${p.unknownNames.slice(0, 12).map(n =>
        `<span class="pill pill--info">${esc(n.name)} · ${n.count}</span>`).join(' ')}</p>` : ''}
    ${jsonPanel}
    ${p.notes.length ? `<h3 class="sheet__sub">Notes</h3>
      <ul class="drop__notes">${p.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    <div class="sheet__foot">
      <span class="drop__note">${p.sources.map(x => `${esc(x.file)} · ${num(x.rows)} rows`).join(' · ')}</span>
      <button class="btn" id="import-again">Choose different files</button>
      <button class="btn btn--go" id="import-apply"${p.departments.length ? '' : ' disabled'}>
        Apply to ${esc(shortDate(state.date))}</button>
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

async function applyImport() {
  const p = importState.preview;
  if (!p) return;
  const writes = [];
  for (const d of p.departments) {
    // Output and crewed hours only. See rollup() for why the other three are not written.
    writes.push([`dept:${d.dept_key}:qty`, d.qty], [`dept:${d.dept_key}:hours`, d.hours]);
  }
  if (p.shipping) {
    writes.push(['jobs_shipped', p.shipping.jobs_shipped], ['jobs_on_time', p.shipping.jobs_on_time],
                ['late', p.shipping.late], ['shorts', p.shipping.shorts]);
  }
  for (const [name, value] of writes) {
    applyLocally(name, value);
    await persist(name, value);
  }

  // History from the old dashboard goes to the dates it is dated, not to the open morning,
  // and it never overwrites a reading somebody has already entered. A year of exports
  // arriving on top of this week's numbers would be the opposite of a favour.
  let mornings = 0;
  if (p.json?.days.length) {
    for (const day of p.json.days) {
      try {
        await importHistory(state.location, day.date, day.metrics, day.departments);
        mornings += 1;
      } catch (error) {
        toast(`${shortDate(day.date)}: ${error.message}`);
        break;
      }
    }
  }

  importState.preview = null;
  $('#import-sheet').close();
  if (mornings) {
    const [day, history] = await Promise.all([
      loadDay(state.location, state.date),
      loadHistory(state.location, addDays(state.date, -6), state.date),
    ]);
    Object.assign(state, day, { history });
  }
  render();
  toast([writes.length ? `${writes.length} readings imported` : '',
         mornings ? `${mornings} morning${mornings === 1 ? '' : 's'} of history written` : '']
    .filter(Boolean).join(' · ') + '.');
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
