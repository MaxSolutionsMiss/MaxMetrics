// Data Bank — where the numbers come from.
//
// This page reads the same row-level-secured tables everything else does, so it shows
// what THIS person's plants are feeding in, not what the system holds in total. It makes
// two claims and both are read rather than asserted: what is connected, and how fresh it
// is. A source that has never pulled says so; a table with no rows says so.

import {
  currentSession, signOut, myProfile, myLocations,
  dataSources, bankCounts,
} from '../db.js?v=9113db7bfac5';
import { esc, shortDate } from '../readings.js?v=9113db7bfac5';

const $ = s => document.querySelector(s);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};

const TABLE_NAMES = {
  daily_metrics: ['The morning', 'safety, shipping, quality and the money — one row per plant per day'],
  daily_departments: ['Departments', 'output, uptime and make-ready — one row per department per day'],
  daily_review: ['Section notes', 'the written state of each section'],
  daily_labour: ['Labour', 'overtime shifts and who ran what'],
};

const ago = iso => {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return days + ' days ago';
  const m = Math.floor(days / 30);
  return m === 1 ? 'a month ago' : m + ' months ago';
};

function drawSources(list, plants) {
  const byPlant = new Map(plants.map(p => [p.id, p.name]));
  const card = el('div', 'card');
  card.append(el('div', 'ct', 'Connected'));

  if (!list.length) {
    card.append(el('p', 'kpinote',
      'No source is registered for your plants. The morning is being typed in, or imported by hand.'));
    return card;
  }

  const wrap = el('div', 'banklist');
  for (const s of list) {
    const ok = s.last_status === 'ok';
    const never = !s.last_pulled_at;
    const tone = never ? 'is-idle' : ok ? 'is-ok' : 'is-off';
    // A pull that failed still stamps last_pulled_at, so "read a month ago" would report
    // a success that never happened.
    const when = never ? 'never pulled'
      : ok ? `read ${ago(s.last_pulled_at)}`
      : `failed, last tried ${ago(s.last_pulled_at)}`;
    wrap.append(el('div', 'bankrow', `
      <span class="bankrow__dot ${tone}"></span>
      <span class="bankrow__n">${esc(s.name || s.kind || 'Source')}
        <span class="bankrow__k">${esc(byPlant.get(s.location_id) || '')}${
          s.kind ? ' · ' + esc(s.kind) : ''}</span></span>
      <span class="bankrow__s">${esc(when)}${
        s.enabled === false ? ' · switched off' : ''}</span>
      ${s.last_note ? `<span class="bankrow__note">${esc(s.last_note)}</span>` : ''}`));
  }
  card.append(wrap);
  return card;
}

function drawHolding(counts) {
  const card = el('div', 'card');
  card.append(el('div', 'ct', 'What that has put in the bank'));
  const grid = el('div', 'bankgrid');
  for (const c of counts) {
    const [name, hint] = TABLE_NAMES[c.table] || [c.table, ''];
    grid.append(el('div', 'bankcell', `
      <span class="bankcell__v">${c.rows.toLocaleString()}</span>
      <span class="bankcell__n">${esc(name)}</span>
      <span class="bankcell__h">${esc(hint)}</span>
      <span class="bankcell__f">${c.newest
        ? 'newest ' + esc(shortDate(c.newest))
        : 'nothing yet'}</span>`));
  }
  card.append(grid);
  return card;
}

const BRIDGE = [
  ['The systems', 'MIS on SQL Server, workbooks on SharePoint, a folder on a plant PC. Each behind its own login.'],
  ['The bridge', 'Reads on a schedule with an account that can only read. Credentials stay on the server — never in a page, never in the repository.'],
  ['One shape', 'Everything lands as the same measures against the same plants, days and departments, which is what makes one picker possible.'],
  ['A browser', 'Anywhere. No VPN, no MIS licence, no install — which only works because of the line above.'],
];

function drawBridge() {
  const card = el('div', 'card');
  card.append(el('div', 'ct', 'How it reaches you'));
  const flow = el('div', 'bankflow');
  BRIDGE.forEach(([n, d], i) => {
    flow.append(el('div', 'bankstep' + (i === 1 ? ' is-key' : ''),
      `<span class="bankstep__n">${esc(n)}</span><span class="bankstep__d">${esc(d)}</span>`));
  });
  card.append(flow);
  return card;
}

function drawGaps() {
  return el('div', 'card kpigap', `
    <div class="ct">Not connected yet</div>
    <p class="kpinote"><b>MIS, direct</b> — reading SQL Server straight, with no workbook in the
      middle. It is the only route to press-level and shift-level numbers, which is why the
      KPI picker greys those two out.</p>
    <p class="kpinote"><b>Inventory</b> — nothing in Metriq holds stock. Not an empty column;
      there is no table for it. It needs a source before it can be asked about.</p>`);
}

async function boot() {
  const session = await currentSession();
  if (!session) { location.replace('../index.html'); return; }

  const [profile, grants] = await Promise.all([myProfile(), myLocations()]);
  const plants = (grants || []).map(g => g.locations).filter(Boolean)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
    .map(l => ({ id: l.id, name: l.name }));

  $('#foot-user').textContent = profile?.full_name || session.user.email || '';
  $('#foot-loc').textContent = plants.length > 1 ? `${plants.length} plants` : (plants[0]?.name ?? 'No plant');
  $('#signout-btn').onclick = async () => { await signOut(); location.replace('../index.html'); };

  const rail = $('#areas');
  rail.innerHTML = '';
  for (const p of plants) rail.append(el('div', 'rail__link', esc(p.name)));

  if (!plants.length) {
    $('#content').innerHTML =
      `<p class="cfg__none">No plant has been granted to this account yet.</p>`;
    return;
  }

  const ids = plants.map(p => p.id);
  const [sources, counts] = await Promise.all([dataSources(ids), bankCounts(ids)]);

  $('#bank-sub').textContent = plants.length > 1
    ? `${plants.length} plants` : plants[0].name;

  const box = $('#content');
  box.innerHTML = '';
  box.append(drawSources(sources || [], plants));
  box.append(drawHolding(counts));
  box.append(drawBridge());
  box.append(drawGaps());
}

boot();
