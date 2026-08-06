// The daily dashboard.
//
// Three people work a morning at once, so nothing here claims the day. "Enter data" shows
// the input fields and is a preference belonging to the person who pressed it; two people
// can have it on together. Each field saves itself as it is typed, and every save is a
// write to one column, so two people filling in two readings never overwrite each other.

import {
  currentSession, signOut, myProfile, myLocations, savePreference,
  openDay, loadDay, loadHistory, loadBudgets, saveField, saveDepartment, saveReview,
  saveBudget, publish, recordEdit, joinDay,
} from '../db.js';
import { assess, attention, settled } from '../assess.js';
import {
  esc, band, MONTHS, DAYS, dateOf, daysBetween, num, shortDate, money, trend,
  metricCard, footStat, drawReading, showsHeroNumber, CHART_ICONS, CHART_NAMES, iconFor,
  spark, bullet, chip,
} from '../readings.js';

const $ = selector => document.querySelector(selector);

const session = await currentSession();
if (!session) location.replace('../index.html');

const today = () => new Date().toISOString().slice(0, 10);

const state = {
  me: null, locations: [], canEdit: true,
  location: null, date: today(), active: 'overview',
  metrics: null, departments: [], review: [], maintenance: [], config: [], budgets: [],
  history: { metrics: [], departments: [] }, findings: [],
  chart: 'bar', team: [], live: null, wallStep: 0,
};

// ── Reading the loaded morning ──────────────────────────────────────────────────

// OTD and OTIF are not opinions, they are arithmetic on three counts the plant already
// enters. Deriving them removes two fields from the morning and removes any chance of the
// percentages disagreeing with the shipment counts printed beside them. Checked against
// 149 rows of the plant's own OTD sheet: 148 agree exactly, and the one that does not is a
// row recording 100% against 5 jobs with 1 late — an error this would have caught.
function derivedShipping(m) {
  const jobs = Number(m?.jobs_shipped);
  if (!jobs) return null;
  const late = Number(m?.late || 0), short = Number(m?.shorts || 0);
  const round = v => Math.round(v * 10000) / 100;
  return { otd: round((jobs - late) / jobs), otif: round((jobs - late - short) / jobs) };
}

const metric = field => {
  if (field === 'otd' || field === 'otif') {
    const derived = derivedShipping(state.metrics);
    if (derived) return derived[field];
  }
  return state.metrics?.[field];
};
const dept = key => state.departments.find(d => d.dept_key === key) || {};
const rateOf = row => Number(row?.hours) ? Number(row.qty) / Number(row.hours) : 0;
const configured = () => state.config.filter(c => c.on_metrics);
const budgetFor = month => Number(state.budgets.find(b => b.month === month + 1)?.amount || 0);

function sectionTone(key) {
  if (key === 'safety') {
    const tones = [band.shortage(Number(metric('shortages') || 0))];
    if (metric('injury_last')) tones.push(band.streak(daysBetween(metric('injury_last'), state.date)));
    if (metric('near_miss_last')) tones.push(band.streak(daysBetween(metric('near_miss_last'), state.date)));
    if (metric('coq') != null) tones.push(band.coq(Number(metric('coq')), Number(metric('coq_target') || 0.85)));
    return band.worst(tones);
  }
  if (key === 'production') {
    return band.worst(configured().map(c => band.rate(rateOf(dept(c.key)), Number(c.target)))
      .filter(Boolean).concat(state.review.map(r => r.status)));
  }
  if (key === 'shipping') {
    return band.worst([band.count(Number(metric('late') || 0)), band.count(Number(metric('shorts') || 0)),
      metric('otif') != null ? band.pct(Number(metric('otif')), 98) : 'ok',
      metric('otd') != null ? band.pct(Number(metric('otd')), 98) : 'ok']);
  }
  if (key === 'maintenance') {
    return band.worst(state.maintenance.map(m => {
      const tone = band.maint(m.status); return tone === 'info' ? 'ok' : tone;
    }));
  }
  return 'ok';
}

// ── Sections ────────────────────────────────────────────────────────────────────

const ICONS = {
  overview:    'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  safety:      'M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z',
  production:  'M4 20V9l5 3V9l5 3V4l6 4v12z',
  shipping:    'M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19a1.6 1.6 0 100-3.2A1.6 1.6 0 007 19zM17.5 19a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2z',
  maintenance: 'M14.5 6.5a3.5 3.5 0 01-4.6 4.6L5 16l3 3 4.9-4.9a3.5 3.5 0 004.6-4.6l-2.4 2.4-2.1-2.1z',
  financials:  'M12 3v18M8.5 7.5h6M8.5 7.5a2.6 2.6 0 000 5.2h3a2.6 2.6 0 010 5.2h-6',
};
// Two views over the whole morning, then the five sections for when someone asks a
// question the views do not answer. Today is first because the meeting is two minutes
// long and the fastest possible read is the one that says what needs deciding.
const VIEWS = ['line', 'board'];
// The order the meeting actually walks: what happened to people, what the plant made,
// what left the building, what it earned, and what needs fixing.
const ORDER = ['safety', 'production', 'shipping', 'financials', 'maintenance'];
const TITLES = {
  safety: 'Safety & Quality', production: 'Production', shipping: 'Shipping',
  maintenance: 'Maintenance & Staffing', financials: 'Financials',
};
const NAV = { safety: 'Safety', maintenance: 'Maintenance', line: 'Today', board: 'Board' };
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
               target: r.target, tone: r.tone, floor: r.floor || 0,
               lowerIsBetter: !!r.lowerIsBetter })
    : '';
  return { line, bar };
}

const field = (label, name, attrs = '') =>
  `<div class="er"><label>${esc(label)}</label>
   <input class="inp" data-field="${name}" ${attrs}></div>`;

function streakCard(kind, label, lastField, recordField, word) {
  const last = metric(lastField), record = Number(metric(recordField) || 0);
  const days = last ? daysBetween(last, state.date) : null;
  const beaten = days != null && record > 0 && days >= record;
  return metricCard({
    chart: state.chart, pkey: kind, label,
    tone: days == null ? '' : band.streak(days),
    value: days == null ? '—' : days, unit: 'days',
    percent: record ? (days || 0) / record * 100 : 0,
    markPercent: beaten || !record ? null : 100, markLabel: 'record',
    sub: beaten || !record ? null : `record ${record} days`,
    flag: beaten ? `<div class="flag flag--ok">Record broken · +${days - record} days</div>` : '',
    foot: footStat('Record', record ? `${record}<em> days</em>` : '—')
        + footStat(`Last ${word}`, shortDate(last), true),
    edit: field('Last', lastField, `type="date" value="${last || ''}"`)
        + field('Record', recordField, `type="number" value="${record || ''}"`),
  });
}

function coqCard(kind, label, valueField, targetField) {
  const value = metric(valueField), target = Number(metric(targetField) || 0.85);
  const has = value != null && value !== '';
  return metricCard({
    chart: state.chart, pkey: kind, label,
    tone: has ? band.coq(Number(value), target) : '',
    value: has ? Number(value).toFixed(2) : '—', unit: '%', sub: 'of sales',
    percent: has ? Number(value) / (target * 1.6) * 100 : 0,
    markPercent: 100 / 1.6, markLabel: 'target',
    foot: footStat('Target', `≤ ${target.toFixed(2)}%`)
        + footStat('Variance', has ? `${Number(value) <= target ? '−' : '+'}${Math.abs(Number(value) - target).toFixed(2)} pts` : '—', true),
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

  safety: () => {
    const shortages = metric('shortages');
    return `<div class="grid g5">
      ${streakCard('injury', 'Days since last injury', 'injury_last', 'injury_record', 'injury')}
      ${streakCard('nearmiss', 'Days since near-miss', 'near_miss_last', 'near_miss_record', 'near-miss')}
      ${metricCard({
        chart: state.chart, pkey: 'shortages', label: 'Shortage count',
        tone: shortages == null ? '' : band.shortage(Number(shortages)),
        value: shortages ?? '—', sub: 'jobs short today',
        percent: Number(shortages) ? 100 : 0, markPercent: null,
        foot: footStat('Target', '0'),
        edit: field('Count', 'shortages', `type="number" min="0" value="${shortages ?? ''}"`),
      })}
      ${coqCard('coq', `COQ — ${MONTHS[dateOf(state.date).getMonth()]}`, 'coq', 'coq_target')}
      ${coqCard('coqytd', 'COQ — year to date', 'coq_ytd', 'coq_ytd_target')}
    </div>`;
  },

  production: () => {
    const list = configured();
    if (!list.length) return `<div class="panel"><div class="panel__body">
      No departments are configured for this plant yet.</div></div>`;

    const cards = list.map(config => {
      const row = dept(config.key), rate = rateOf(row);
      const previous = Number(row.pw_hours) ? Number(row.pw_qty) / Number(row.pw_hours) : 0;
      const target = Number(row.target ?? config.target);
      return metricCard({
        chart: state.chart, pkey: config.key, label: config.name, medium: true,
        tone: band.rate(rate, target),
        value: rate ? num(Math.round(rate)) : '—', sub: `${config.unit} / hr`,
        percent: target ? rate / (target * 1.25) * 100 : 0,
        markPercent: 100 / 1.25, markLabel: 'target',
        foot: footStat('Target / hr', num(target))
            + footStat('Total', row.qty ? `${num(row.qty)} · ${row.hours || 0}h` : '—', true)
            + footStat('vs target', rate && target ? trend(rate, target) : '—', true)
            + (row.uptime != null ? footStat('Uptime',
                `<span class="tone--${band.rate(Number(row.uptime) * 100, Number(config.uptime_target || 0) * 100) || 'none'}">${
                  (Number(row.uptime) * 100).toFixed(1)}%</span>`, true) : '')
            + (row.make_ready != null ? footStat('Make-ready',
                `<span class="tone--${band.lower(Number(row.make_ready), Number(config.mr_target || 0)) || 'none'}">${
                  Number(row.make_ready).toFixed(2)} h</span>`, true) : ''),
        edit: field(config.unit, `dept:${config.key}:qty`, `type="number" value="${row.qty ?? ''}"`)
            + field('Hours', `dept:${config.key}:hours`, `type="number" step="0.1" value="${row.hours ?? ''}"`)
            + field('Target', `dept:${config.key}:target`, `type="number" value="${row.target ?? config.target}"`)
            + field('Uptime', `dept:${config.key}:uptime`, `type="number" step="0.001" placeholder="0.88" value="${row.uptime ?? ''}"`)
            + field('Make-ready', `dept:${config.key}:make_ready`, `type="number" step="0.01" placeholder="hours" value="${row.make_ready ?? ''}"`),
      });
    }).join('');

    const rows = list.map(config => {
      const row = dept(config.key), rate = rateOf(row);
      const previous = Number(row.pw_hours) ? Number(row.pw_qty) / Number(row.pw_hours) : 0;
      return `<tr><td class="dept">${esc(config.name)}</td>
        <td class="num">${row.pw_qty ? num(row.pw_qty) : '—'}</td>
        <td class="num">${row.pw_hours ?? '—'}</td>
        <td class="num big">${previous ? num(Math.round(previous)) : '—'}</td>
        <td class="num big">${rate ? num(Math.round(rate)) : '—'}</td>
        <td class="num">${previous ? trend(previous, Number(row.target ?? config.target)) : '—'}</td></tr>`;
    }).join('');

    const weekEdit = list.map(config => {
      const row = dept(config.key);
      return `<div class="er"><label>${esc(config.name)}</label>
        <input class="inp" data-field="dept:${config.key}:pw_qty" type="number"
          value="${row.pw_qty ?? ''}" aria-label="${esc(config.name)} previous week volume">
        <input class="inp" data-field="dept:${config.key}:pw_hours" type="number" step="0.1"
          value="${row.pw_hours ?? ''}" aria-label="${esc(config.name)} previous week hours"></div>`;
    }).join('');

    // Narrow department cards, wide Previous Week. The rates are short numbers and read
    // fine in a tight column; the week table has six and is what breaks when starved.
    return `<div class="grid" style="grid-template-columns:repeat(${list.length},minmax(160px,.68fr)) minmax(500px,1.9fr)">
      ${cards}
      <div class="panel">
        <div class="panel__head"><span class="card__ico" aria-hidden="true">📅</span>
          <h3 class="panel__title">Previous week</h3>
          <span class="panel__actions chip">Same weekday</span></div>
        <div class="panel__body">
          <table class="tbl"><thead><tr><th>Department</th><th class="num">Volume</th>
            <th class="num">Crew hrs</th><th class="num">Per hr</th><th class="num">Today</th>
            <th class="num">vs target</th></tr></thead><tbody>${rows}</tbody></table>
          <div class="ez">${weekEdit}</div>
        </div>
      </div>
    </div>
    <div class="sec__head" style="margin-top:var(--s3)">
      <h3 class="sec__title" style="font-size:var(--t-lead)">Review — last 24 hours</h3>
      <div class="sec__rule"></div></div>
    <div class="grid g4">
      ${state.review.map(row => {
        const name = state.config.find(c => c.key === row.dept_key)?.name || row.dept_key;
        return `<div class="revcard revcard--${row.status}" data-pkey="rev-${esc(row.dept_key)}">
          <div class="revcard__head"><span class="rev__dot rev__dot--${row.status}"></span>
            <span class="card__ico" aria-hidden="true">${iconFor(row.dept_key)}</span>
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
    const cell = (label, value, sub, tone, unit, pkey, icon = '🚚') => {
      const size = String(value).length > 6 ? ' cell__v--xl' : String(value).length > 4 ? ' cell__v--lg' : '';
      return `<div class="cell cell--${tone}" data-pkey="${esc(pkey)}">
        <div class="cell__l"><span class="cell__ico" aria-hidden="true">${icon}</span>${esc(label)}</div>
        <div class="cell__v${size}">${value}${unit ? `<i>${unit}</i>` : ''}</div>
        <div class="cell__s">${sub}</div></div>`;
    };
    const pct = (name, label, sub, icon) => {
      const value = read(name);
      return cell(label, value == null ? '—' : Number(value).toFixed(name === 'otd' ? 1 : 2),
        sub, value == null ? '' : band.pct(Number(value), 98), value == null ? '' : '%', name, icon);
    };
    const count = (name, label, sub, icon) => {
      const value = read(name);
      return cell(label, value ?? '—', sub, value == null ? '' : band.count(Number(value)), '', name, icon);
    };
    return `<div class="strip">
      ${cell('Jobs shipped', read('jobs_shipped') == null ? '—' : num(read('jobs_shipped')),
        read('jobs_on_time') == null ? 'today' : `${read('jobs_on_time')} on time`, 'info', '', 'jobs_shipped', '🚚')}
      ${cell('Cartons', read('cartons') == null ? '—' : num(read('cartons')), 'shipped today', 'info', '', 'cartons', '📦')}
      ${count('late', 'Late', 'shipments', '⏰')}
      ${count('shorts', 'Shorts', 'shipments', '🚫')}
      ${pct('otd', 'OTD', 'Target ≥ 98%', '🎯')}
      ${pct('otif', 'OTIF', 'Target ≥ 98%', '🎯')}
      ${pct('mtd_otif', 'MTD OTIF', 'Month to date', '📅')}
      ${pct('ytd_otif', 'YTD OTIF', 'Year to date', '📅')}
    </div>
    <div class="panel edit-only"><div class="panel__body"><div class="grid g4">
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
    return `<div class="grid" style="grid-template-columns:1.6fr 1fr">
      <div class="panel">
        <div class="panel__head"><span class="card__ico" aria-hidden="true">🔧</span>
          <h3 class="panel__title">Maintenance schedule</h3>
          <div class="panel__actions">
            <span class="pill pill--${overdue ? 'stop' : 'ok'}">${overdue} overdue</span>
            <span class="pill pill--info">${open} open</span></div></div>
        <div class="panel__body"><table class="tbl"><thead><tr><th>Department</th><th>Type</th>
          <th>Frequency</th><th>Scheduled</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>
      </div>
      <div class="panel"><div class="panel__head"><span class="card__ico" aria-hidden="true">📝</span>
        <h3 class="panel__title">Notes</h3></div>
        <div class="panel__body" data-pkey="notes">
          <div class="rev__dept"><span class="card__ico" aria-hidden="true">🔧</span> Maintenance</div>
          <div class="rev__note${metric('maintenance_note') ? '' : ' rev__note--none'}"
            style="margin-bottom:var(--s4)">${esc(metric('maintenance_note') || 'No notes entered.')}</div>
          <div class="rev__dept"><span class="card__ico" aria-hidden="true">👷</span> Staffing</div>
          <div class="rev__note${metric('staffing_note') ? '' : ' rev__note--none'}">${
            esc(metric('staffing_note') || 'No notes entered.')}</div>
          <div class="ez">
            <div class="er"><label>Maint.</label><textarea class="inp"
              data-field="maintenance_note">${esc(metric('maintenance_note') || '')}</textarea></div>
            <div class="er"><label>Staffing</label><textarea class="inp"
              data-field="staffing_note">${esc(metric('staffing_note') || '')}</textarea></div>
          </div></div></div>
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
    const worst = band.worst([toneMtd, toneYtd]);

    // The chart choice reaches the financials too. Sales against plan is a reading like
    // any other, and a page where five cards are rings and the money is a bar reads as
    // two designs rather than one.
    const pane = (title, actual, plan, rows, tone) => {
      const pacePercent = plan ? Math.min(140, actual / plan * 100) : 0;
      const drawn = drawReading(state.chart, {
        percent: pacePercent / 1.4, markPercent: 100 / 1.4, markLabel: 'plan',
        value: `${Math.round(pacePercent)}%`, unit: '',
      });
      return `<div class="fin__pane"><div class="fin__t">${title}</div>
        ${showsHeroNumber(state.chart)
          ? `<div class="fin__v" style="color:var(--${tone})">${money(actual)}</div>${drawn}`
          : `${drawn}<div class="fin__v fin__v--under" style="color:var(--${tone})">${money(actual)}</div>`}
        <div>${rows.map(([label, value, colour]) => `<div class="fin__row"><span>${label}</span>
          <strong${colour ? ` style="color:var(--${colour})"` : ''}>${value}</strong></div>`).join('')}</div></div>`;
    };

    const monthSeries = (state.history?.metrics || [])
      .map(r => Number(r.fin_actual_mtd)).filter(v => Number.isFinite(v) && v > 0);
    const pace = planMtd ? actualMtd / planMtd * 100 : 0;
    return `<div class="card card--${worst}" data-pkey="financials" style="padding:var(--s5)">
      <div class="card__head">
        <span class="card__ico" aria-hidden="true">💰</span>
        <span class="card__label">Sales against budget · through ${
          shortDate(reportDate.toISOString().slice(0, 10))}</span>
      </div>
      <div class="fin">
        ${pane('Month to date', actualMtd, planMtd, [
          [`${MONTHS[month]} budget`, money(monthBudget)],
          ['Expected by today', money(planMtd)],
          ['Variance', `${varianceMtd >= 0 ? '▲' : '▼'} ${money(Math.abs(varianceMtd))} (${Math.abs(percentMtd).toFixed(1)}%)`, toneMtd],
        ], toneMtd)}
        ${pane('Year to date', actualYtd, planYtd, [
          ['Full-year budget', money(yearBudget)],
          ['Expected by today', money(planYtd)],
          ['Variance', `${varianceYtd >= 0 ? '▲' : '▼'} ${money(Math.abs(varianceYtd))} (${Math.abs(percentYtd).toFixed(1)}%)`, toneYtd],
        ], toneYtd)}
      </div>
      <div class="finbars">
        <div class="finbar">
          <div class="finbar__l">Month to date against plan
            <b class="tone--${toneMtd}">${pace.toFixed(0)}% of pace</b></div>
          ${bullet({ actual: actualMtd, target: planMtd, tone: toneMtd })}
        </div>
        <div class="finbar">
          <div class="finbar__l">Year to date against plan
            <b class="tone--${toneYtd}">${(planYtd ? actualYtd / planYtd * 100 : 0).toFixed(0)}% of pace</b></div>
          ${bullet({ actual: actualYtd, target: planYtd, tone: toneYtd })}
        </div>
        <div class="finbar">
          <div class="finbar__l">Month so far
            <b>${MONTHS[month]} · day ${elapsed} of ${inMonth}</b></div>
          <div class="finmonth"><span style="width:${(elapsed / inMonth * 100).toFixed(1)}%"></span></div>
        </div>
      </div>
      <div class="ez">
        ${field('Actual MTD', 'fin_actual_mtd', `type="number" value="${metric('fin_actual_mtd') ?? ''}"`)}
        ${field('Actual YTD', 'fin_actual_ytd', `type="number" value="${metric('fin_actual_ytd') ?? ''}"`)}
        <div class="grid" style="grid-template-columns:repeat(6,minmax(0,1fr));gap:var(--s2)">
          ${Array.from({ length: 12 }, (_, i) => `<div class="er"
            style="flex-direction:column;align-items:stretch;gap:2px">
            <label style="min-width:0">${MONTHS[i].slice(0, 3)}</label>
            <input class="inp" data-field="budget:${i + 1}" type="number" value="${budgetFor(i) || ''}"></div>`).join('')}
        </div></div>
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
    + ORDER.map(key => link(key, NAV[key] || TITLES[key], ICONS[key], sectionTone(key))).join('');
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

function renderContent() {
  if (document.body.classList.contains('tv')) return renderWall();
  const one = key => `<section class="sec"><div class="sec__head">
    <h2 class="sec__title">${TITLES[key]}</h2><div class="sec__rule"></div></div>${SECTIONS[key]()}</section>`;
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
  document.body.dataset.view = state.active;
  renderHeader(); renderChartPicker(); renderNav(); renderContent(); renderWho(); paintPresence();
}

// ── The wall ──
// One idea per screen at the size a 48" needs, with the sentence that says what it means.
// It shows the exceptions first and then the rest, because a plant walking past the screen
// should learn what is wrong before it learns what is fine.
function renderWall() {
  const flags = attention(state.findings), fine = settled(state.findings);
  const cards = flags.concat(fine.filter(r => !r.quiet)).slice(0, 6);
  if (!cards.length) {
    $('#content').className = 'content wall';
    $('#content').innerHTML = `<div class="wall__empty">Nothing entered for this morning yet.</div>`;
    return;
  }
  const r = cards[state.wallStep % cards.length];
  const others = cards.filter(x => x.key !== r.key).slice(0, 3);
  $('#content').className = 'content wall';
  $('#content').innerHTML = `
    <div class="wall__top">
      <h2>${esc(r.area)} · ${esc(state.locations.find(l => l.id === state.location)?.name || '')}</h2>
      <span class="wall__date">${$('#date-long').textContent}</span>
    </div>
    <div class="wall__hero">
      <div>
        <div class="wall__l"><span class="wall__ico" aria-hidden="true">${iconFor(r.key)}</span>${esc(r.title)}</div>
        <div class="wall__n tone--${r.tone || 'none'}">${esc(r.value)}<small> ${esc(r.unit || '')}</small></div>
        ${r.note ? `<p class="wall__say">${esc(r.note)}</p>`
          : r.targetLabel ? `<p class="wall__say">${esc(r.targetLabel)}</p>` : ''}
        ${r.series?.length > 1
          ? `<div class="wall__trend">${spark(r.series, r.tone)}
             <span class="wall__trendl">last seven mornings</span></div>` : ''}
      </div>
      <div class="wall__side">${others.map(o => `<div class="wall__row">
        <span class="wall__rl">${esc(o.title)}</span>
        <span class="wall__rn tone--${o.tone || 'none'}">${esc(o.value)}</span></div>`).join('')}</div>
    </div>
    <div class="wall__dots">${cards.map((_, i) =>
      `<span class="wall__dot${i === state.wallStep % cards.length ? ' wall__dot--on' : ''}"></span>`).join('')}</div>`;
}

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
  $('#edit-btn').textContent = on ? 'Hide fields' : 'Enter data';
  $('#publish-btn').classList.toggle('hide', !on);
  paintPresence();
});

$('#publish-btn').addEventListener('click', async () => {
  try {
    await publish(state.location, state.date);
    if (state.metrics) state.metrics.status = 'published';
    document.body.classList.remove('editing');
    $('#edit-btn').textContent = 'Enter data';
    $('#publish-btn').classList.add('hide');
    toast('Published — every screen shows this now');
    render();
  } catch (error) { toast(error.message); }
});

$('#loc').addEventListener('change', event => open(event.target.value, state.date));
$('#date').addEventListener('change', event => { if (event.target.value) open(state.location, event.target.value); });

$('#theme-btn').addEventListener('click', () => {
  // Light is the design and the default. The button is how someone gets dark, not the
  // operating system, so the wall and the laptop show the same dashboard.
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  savePreference(state.me.id, { theme: next }).catch(() => {});
});

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

let rotation = null;
const stopRotation = () => { clearInterval(rotation); rotation = null; $('#tv-play').textContent = 'Auto'; };
const step = direction => {
  const count = Math.max(1, attention(state.findings).length
    + settled(state.findings).filter(r => !r.quiet).length);
  state.wallStep = (state.wallStep + direction + count) % count;
  renderWall();
};
$('#tv-btn').addEventListener('click', () => {
  document.body.classList.add('tv');
  state.wallStep = 0;
  render();
});
$('#tv-exit').addEventListener('click', () => { stopRotation(); document.body.classList.remove('tv'); render(); });
$('#tv-next').addEventListener('click', () => step(1));
$('#tv-prev').addEventListener('click', () => step(-1));
$('#tv-play').addEventListener('click', () => {
  if (rotation) return stopRotation();
  rotation = setInterval(() => step(1), 9000);
  $('#tv-play').textContent = 'Stop';
});
document.addEventListener('keydown', event => {
  if (!document.body.classList.contains('tv')) return;
  if (event.key === 'ArrowRight') step(1);
  if (event.key === 'ArrowLeft') step(-1);
  if (event.key === 'Escape') { stopRotation(); document.body.classList.remove('tv'); render(); }
});

addEventListener('maxmetrics:connection', event => {
  document.body.dataset.connection = event.detail.state;
});

// ── Start ───────────────────────────────────────────────────────────────────────

const [profile, grants] = await Promise.all([myProfile(), myLocations()]);
if (!profile) { location.replace('../index.html'); }

state.me = profile;
state.chart = profile.chart_style || 'bar';
if (profile.theme === 'dark' || profile.theme === 'light') document.documentElement.dataset.theme = profile.theme;
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
  state.canEdit = state.locations[0].canEdit;
  await open(state.locations[0].id, state.date);
}
