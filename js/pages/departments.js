// Configure departments.
//
// Mississauga prints, die cuts and glues, and those three were seeded by a migration. Every
// other plant runs something Mississauga does not — Guelph windows and foil stamps — and
// until this screen existed the only way for a plant to see its own floor was for somebody
// to write SQL. A dashboard the plant cannot shape is a dashboard about somebody else.
//
// Three rules carried over from the daily page, because they are the same rules:
//
//   Each field saves itself, one column at a time. Two people configuring two departments
//   are two independent writes. Nothing here locks anything either.
//
//   The database decides who may write. `departments_write` is granted to whoever can edit
//   the plant, so this screen only has to avoid *offering* what would be refused — a
//   read-only grant gets the list and no fields.
//
//   Nothing is deleted. A department taken out of use keeps its row, because the mornings
//   it appeared on are still in `daily_departments` and deleting it would leave them
//   holding a key with no name.

import {
  currentSession, signOut, myProfile, myLocations, savePreference,
  loadDepartmentConfig, saveDepartmentConfig, addDepartmentConfig, ensureDepartmentRows,
} from '../db.js?v=cae52088bd70';
import {
  esc, num, metricCard, footStat, iconFor, cardTrack,
  volumeLabel, rateLabel, hoursLabel,
} from '../readings.js?v=cae52088bd70';

const $ = selector => document.querySelector(selector);

const session = await currentSession();
if (!session) location.replace('../index.html');

const today = () => new Date().toISOString().slice(0, 10);

const state = { me: null, locations: [], location: null, config: [], draft: null };

// ── What a plant is likely to be adding ─────────────────────────────────────────
//
// Not a fixed list — the fields underneath are all free text, and "Something else" starts
// blank. These are the finishing departments a folding-carton plant actually runs, filled
// in with the words that department uses for its own numbers, so the common case is two
// clicks rather than eight fields. Windowing counts panes and is crewed by the machine;
// foil stamping counts impressions like a press. Getting those two right is the whole
// point of the labels being per-department.
const PRESETS = [
  { name: 'Windowing',      icon: '🪟', unit: 'panes',        rate_label: 'panes/hr',        hours_label: 'Machine hours' },
  { name: 'Foil Stamping',  icon: '✨', unit: 'impressions',  rate_label: 'impressions/hr',  hours_label: 'Machine hours' },
  { name: 'Embossing',      icon: '🔷', unit: 'impressions',  rate_label: 'impressions/hr',  hours_label: 'Machine hours' },
  { name: 'Laminating',     icon: '📄', unit: 'sheets',       rate_label: 'sheets/hr',       hours_label: 'Crew hours' },
  { name: 'Flexo Printing', icon: '🎨', unit: 'impressions',  rate_label: 'impressions/hr',  hours_label: 'Crew hours' },
  { name: 'Sheeting',       icon: '🪚', unit: 'sheets',       rate_label: 'sheets/hr',       hours_label: 'Machine hours' },
  { name: 'Assembly',       icon: '🧰', unit: 'cartons',      rate_label: 'cartons/hr',      hours_label: 'Crew hours' },
  { name: 'Something else', icon: '📊', unit: '',             rate_label: '',                hours_label: '' },
];

// The pictogram is the first thing the eye finds on a card, so it is worth choosing rather
// than deriving. These are the ones already printed on this plant's dashboard plus the
// finishing departments above; anything not here falls back to the key-based map.
const ICON_CHOICES = ['🖨️','✂️','📦','🪟','✨','🔷','📄','🎨','🪚','🧰','🔍','📐','🚚','⚙️','🏭','📊'];

// A key is permanent. It is what `daily_departments`, `daily_review` and `machines` carry,
// and what the dashboard's `dept:key:field` routing splits on — so a colon or a space in
// it would send a save to the wrong table. The database refuses a bad one; this makes one
// that cannot be bad, and never offers it for editing afterwards.
function keyFrom(name) {
  const slug = String(name || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 39);
  const led = /^[a-z]/.test(slug) ? slug : `d-${slug}`.slice(0, 39);
  return led.replace(/-+$/, '');
}

const keyTaken = key => state.config.some(c => c.key === key);

// A name whose key is already in use gets a number, so adding a second "Assembly" is a
// thing a person can do rather than an error they have to understand.
function freeKey(name) {
  const base = keyFrom(name);
  if (!base || base.length < 2) return '';
  if (!keyTaken(base)) return base;
  for (let n = 2; n < 50; n += 1) {
    const tried = `${base.slice(0, 36)}-${n}`;
    if (!keyTaken(tried)) return tried;
  }
  return '';
}

const nextSort = () =>
  state.config.reduce((highest, row) => Math.max(highest, Number(row.sort_order) || 0), 0) + 1;

const canEdit = () => state.locations.find(l => l.id === state.location)?.canEdit ?? false;

// ── Drawing ─────────────────────────────────────────────────────────────────────

const saved = message => { $('#saved').textContent = message; };
let savedTimer;
function noteSaved() {
  saved('Saving…');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => saved('All changes saved'), 700);
}

let toastTimer;
function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('on'), 2600);
}

const row = (label, name, attrs = '', hint = '') =>
  `<div class="er"><label>${esc(label)}</label>
   <input class="inp" data-field="${esc(name)}" ${attrs}>
   ${hint ? `<span class="er__hint">${esc(hint)}</span>` : ''}</div>`;

const toggle = (label, name, on) =>
  `<label class="tog"><input type="checkbox" data-field="${esc(name)}"${on ? ' checked' : ''}>
   <span>${esc(label)}</span></label>`;

// What the department will look like tomorrow morning, drawn with the same function the
// dashboard draws it with. The number is the target, because a card showing its target is
// the one arrangement that is true before any volume has ever been entered — and it puts
// every label the person is typing in the place they will read it.
function preview(config) {
  return metricCard({
    chart: 'bar', pkey: `preview-${config.key}`, label: config.name || 'Untitled',
    icon: config.icon || iconFor(config.key), tone: 'ok', medium: true,
    value: num(Math.round(Number(config.target) || 0)), sub: rateLabel(config),
    percent: 80, markPercent: 100 / 1.25, markLabel: 'target',
    track: cardTrack({
      chart: 'bar', tone: 'ok',
      series: [0.94, 0.97, 0.95, 1.01, 0.99, 1.03, 1.0].map(f => (Number(config.target) || 1) * f),
      seriesLabel: 'Last 7 mornings',
    }),
    foot: footStat(`Target ${rateLabel(config)}`, num(Math.round(Number(config.target) || 0)))
        + footStat(volumeLabel(config), '—', true)
        + footStat(hoursLabel(config), '—', true),
  });
}

// Volume, rate and hours describe a department that produces something and is measured
// per hour. Shipping does not — it is in the 24-hour review for its note and its status —
// so a review-only entry is not asked what it counts.
const labelFields = (config, prefix) => `
  ${row('Name', `${prefix}name`, `value="${esc(config.name || '')}" maxlength="40"`)}
  ${config.on_metrics ? `
    ${row('Volume', `${prefix}unit`, `value="${esc(config.unit || '')}" placeholder="sheets" maxlength="24"`,
          'What this department counts')}
    ${row('Per hour', `${prefix}rate_label`, `value="${esc(config.rate_label || '')}" placeholder="${esc(rateLabel(config))}" maxlength="24"`,
          'Blank uses the volume word')}
    ${row('Hours', `${prefix}hours_label`, `value="${esc(config.hours_label || '')}" placeholder="Hours" maxlength="24"`,
          'Crew hours, machine hours')}` : ''}`;

const targetFields = (config, prefix) => `
  ${row('Target / hr', `${prefix}target`, `type="number" step="1" value="${config.target ?? ''}"`)}
  ${row('Uptime', `${prefix}uptime_target`, `type="number" step="0.001" placeholder="0.88" value="${config.uptime_target ?? ''}"`,
        'A fraction, not a percentage')}
  ${row('Make-ready', `${prefix}mr_target`, `type="number" step="0.01" placeholder="hours" value="${config.mr_target ?? ''}"`)}`;

const iconPicker = (config, prefix) => `<div class="icons" role="group" aria-label="Pictogram">
  ${ICON_CHOICES.map(choice => `<button type="button" class="icons__b" data-icon="${esc(prefix)}"
      data-value="${esc(choice)}" aria-pressed="${config.icon === choice}"
      title="${esc(choice)}">${choice}</button>`).join('')}</div>`;

function departmentCard(config) {
  const prefix = `dept:${config.id}:`;
  return `<div class="cfg" data-id="${esc(config.id)}">
    <div class="cfg__head">
      <span class="card__ico" aria-hidden="true">${config.icon || iconFor(config.key)}</span>
      <h3 class="cfg__name">${esc(config.name)}</h3>
      <code class="cfg__key" title="Permanent — every morning already recorded uses it">${esc(config.key)}</code>
    </div>
    <div class="cfg__body">
      <div class="cfg__fields">
        ${labelFields(config, prefix)}
        ${iconPicker(config, prefix)}
        ${config.on_metrics ? targetFields(config, prefix) : ''}
        ${row('Order', `${prefix}sort_order`, `type="number" min="1" step="1" value="${config.sort_order ?? ''}"`,
              'Where it sits in the meeting')}
        <div class="cfg__togs">
          ${toggle('A card in Production', `${prefix}on_metrics`, config.on_metrics)}
          ${toggle('A card in the 24-hour review', `${prefix}on_review`, config.on_review)}
        </div>
        <button class="btn btn--quiet" data-retire="${esc(config.id)}">Take out of use</button>
      </div>
      <div class="cfg__preview">
        <span class="eyebrow">Tomorrow morning</span>
        ${config.on_metrics ? preview(config)
          : `<p class="cfg__none">Review only — this one gets a note and a status in
             Production, not a card with a rate.</p>`}
      </div>
    </div>
  </div>`;
}

function addPanel() {
  const draft = state.draft;
  const key = draft.name ? freeKey(draft.name) : '';
  const problem = !draft.name ? 'Give it a name.'
    : !key ? 'That name has no letters or digits in it to build a key from.'
    : '';
  return `<div class="panel">
    <div class="panel__head"><span class="card__ico" aria-hidden="true">➕</span>
      <h3 class="panel__title">Add a department</h3></div>
    <div class="panel__body">
      <div class="presets">${PRESETS.map((preset, index) =>
        `<button type="button" class="preset" data-preset="${index}">
          <span class="preset__i" aria-hidden="true">${preset.icon}</span>
          <span class="preset__n">${esc(preset.name)}</span></button>`).join('')}</div>
      <div class="cfg cfg--new">
        <div class="cfg__body">
          <div class="cfg__fields">
            ${labelFields(draft, 'dept:new:')}
            ${iconPicker(draft, 'dept:new:')}
            ${targetFields(draft, 'dept:new:')}
            <div class="cfg__togs">
              ${toggle('A card in Production', 'dept:new:on_metrics', draft.on_metrics)}
              ${toggle('A card in the 24-hour review', 'dept:new:on_review', draft.on_review)}
            </div>
            <div class="cfg__add">
              <button class="btn btn--go" id="add-btn"${problem ? ' disabled' : ''}>Add ${esc(draft.name || 'department')}</button>
              <span class="cfg__note">${problem ? esc(problem)
                : `Key <code>${esc(key)}</code> · order ${nextSort()}`}</span>
            </div>
          </div>
          <div class="cfg__preview">
            <span class="eyebrow">Tomorrow morning</span>
            ${draft.on_metrics ? preview(draft)
              : `<p class="cfg__none">Review only — a note and a status, no rate.</p>`}
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function retiredPanel(retired) {
  if (!retired.length) return '';
  return `<div class="panel">
    <div class="panel__head"><span class="card__ico" aria-hidden="true">📁</span>
      <h3 class="panel__title">Not in use</h3>
      <span class="panel__actions chip">${retired.length}</span></div>
    <div class="panel__body">
      <p class="cfg__none" style="margin-top:0">Kept, not deleted. Every morning these
      appeared on still refers to them by key, and a key with no name behind it turns a
      recorded reading into an orphan.</p>
      <div class="retired">${retired.map(config => `<div class="retired__r">
        <span class="card__ico" aria-hidden="true">${config.icon || iconFor(config.key)}</span>
        <b>${esc(config.name)}</b>
        <code class="cfg__key">${esc(config.key)}</code>
        <button class="btn btn--quiet" data-restore="${esc(config.id)}">Put back in use</button>
      </div>`).join('')}</div>
    </div>
  </div>`;
}

function render() {
  const plant = state.locations.find(l => l.id === state.location);
  $('#foot-loc').textContent = plant?.name || '—';
  $('#foot-user').textContent = [state.me?.full_name, state.me?.job_title].filter(Boolean).join(' · ');
  $('#loc').value = state.location || '';

  const live = state.config.filter(c => c.active);
  const retired = state.config.filter(c => !c.active);

  if (!canEdit()) {
    $('#content').innerHTML = `<section class="sec">
      <div class="sec__head"><h2 class="sec__title">Departments</h2><div class="sec__rule"></div></div>
      <p class="verdict verdict--none">Your account can read ${esc(plant?.name || 'this plant')}
      but not change it, so its departments are shown and not offered for editing.</p>
      <div class="retired">${live.map(config => `<div class="retired__r">
        <span class="card__ico" aria-hidden="true">${config.icon || iconFor(config.key)}</span>
        <b>${esc(config.name)}</b>
        <code class="cfg__key">${esc(config.key)}</code>
        <span class="cfg__note">${esc(rateLabel(config))} · ${esc(hoursLabel(config))}</span>
      </div>`).join('')}</div>
    </section>`;
    return;
  }

  $('#content').innerHTML = `<section class="sec">
    <div class="sec__head"><h2 class="sec__title">In use at ${esc(plant?.name || '')}</h2>
      <div class="sec__rule"></div></div>
    <p class="verdict verdict--none">${live.length
      ? `${live.length} department${live.length === 1 ? '' : 's'}, in the order the meeting walks them.
         Every field saves as you type it, and the card beside it is the one the room sees tomorrow.`
      : `This plant has no departments yet. Add the ones it runs and they appear on tomorrow's
         dashboard — or on this morning's, as soon as you go back to it.`}</p>
    ${live.length ? `<div class="cfgs">${live.map(departmentCard).join('')}</div>` : ''}
  </section>
  <section class="sec">${addPanel()}</section>
  ${retired.length ? `<section class="sec">${retiredPanel(retired)}</section>` : ''}`;
}

// ── Saving ──────────────────────────────────────────────────────────────────────

// Blank is a real answer for a label — it means "use the fall-back" — so an empty text
// field is stored as an empty string rather than as null, which the column forbids.
// A blank number is a genuine absence and stays null.
const parse = (element, raw) => {
  if (element.type === 'checkbox') return element.checked;
  if (element.type === 'number') return raw === '' ? null : Number(raw);
  return raw;
};

let sendTimer, redrawTimer;

function applyLocally(id, column, value) {
  if (id === 'new') { state.draft[column] = value; return; }
  const config = state.config.find(c => String(c.id) === id);
  if (config) config[column] = value;
}

async function persist(id, column, value) {
  if (id === 'new') return;
  try {
    await saveDepartmentConfig(id, { [column]: value });
    noteSaved();
  } catch (error) {
    saved(error.message);
    toast(error.message);
  }
}

function redrawSoon() {
  clearTimeout(redrawTimer);
  redrawTimer = setTimeout(() => {
    const focused = document.activeElement?.dataset?.field;
    const caret = document.activeElement?.selectionStart;
    render();
    if (!focused) return;
    const back = document.querySelector(`[data-field="${CSS.escape(focused)}"]`);
    if (!back) return;
    back.focus();
    if (caret != null && back.setSelectionRange) {
      try { back.setSelectionRange(caret, caret); } catch { /* not a text input */ }
    }
  }, 700);
}

document.addEventListener('input', event => {
  const name = event.target.dataset?.field;
  // A checkbox raises both `input` and `change`. It is answered on `change`, where the
  // page redraws immediately rather than after a typing pause.
  if (!name || event.target.type === 'checkbox') return;
  const [, id, column] = name.split(':');
  const value = parse(event.target, event.target.value);
  applyLocally(id, column, value);
  clearTimeout(sendTimer);
  sendTimer = setTimeout(() => persist(id, column, value), 450);
  redrawSoon();
});

document.addEventListener('change', event => {
  const name = event.target.dataset?.field;
  if (!name || event.target.type !== 'checkbox') return;
  const [, id, column] = name.split(':');
  applyLocally(id, column, event.target.checked);
  persist(id, column, event.target.checked);
  render();
});

document.addEventListener('click', async event => {
  const icon = event.target.closest('[data-icon]');
  if (icon) {
    const [, id] = icon.dataset.icon.split(':');
    applyLocally(id, 'icon', icon.dataset.value);
    persist(id, 'icon', icon.dataset.value);
    render();
    return;
  }

  const preset = event.target.closest('[data-preset]');
  if (preset) {
    const chosen = PRESETS[Number(preset.dataset.preset)];
    state.draft = { ...state.draft, ...chosen };
    render();
    return;
  }

  const retire = event.target.closest('[data-retire]');
  if (retire) {
    const config = state.config.find(c => String(c.id) === retire.dataset.retire);
    if (!config) return;
    config.active = false;
    render();
    await persist(config.id, 'active', false);
    toast(`${config.name} is out of use — its recorded mornings are untouched`);
    return;
  }

  const restore = event.target.closest('[data-restore]');
  if (restore) {
    const config = state.config.find(c => String(c.id) === restore.dataset.restore);
    if (!config) return;
    config.active = true;
    render();
    await persist(config.id, 'active', true);
    await ensureDepartmentRows(state.location, today()).catch(() => {});
    toast(`${config.name} is back on the dashboard`);
    return;
  }

  if (event.target.closest('#add-btn')) await addDepartment();
});

async function addDepartment() {
  const draft = state.draft;
  const key = freeKey(draft.name);
  if (!key || key.length < 2) return toast('Give the department a name first.');
  try {
    const created = await addDepartmentConfig({
      location_id: state.location, key,
      name: draft.name.trim(), unit: draft.unit || 'units',
      rate_label: draft.rate_label || '', hours_label: draft.hours_label || '',
      icon: draft.icon || '', target: Number(draft.target) || 0,
      uptime_target: draft.uptime_target ?? null, mr_target: draft.mr_target ?? null,
      sort_order: nextSort(), on_metrics: draft.on_metrics, on_review: draft.on_review,
      active: true,
    });
    if (created) state.config.push(created);
    // The morning is already open, so the new department has no row on today's date.
    // Asking for the day again is idempotent and means the card can be typed into now
    // rather than tomorrow.
    await ensureDepartmentRows(state.location, today()).catch(() => {});
    state.draft = blankDraft();
    render();
    toast(`${created?.name || 'Department'} added — it is on the dashboard now`);
  } catch (error) {
    toast(error.message);
  }
}

const blankDraft = () => ({
  name: '', unit: '', rate_label: '', hours_label: '', icon: '',
  target: '', uptime_target: '', mr_target: '', on_metrics: true, on_review: true,
});

// ── Controls ────────────────────────────────────────────────────────────────────

$('#loc').addEventListener('change', event => openPlant(event.target.value));

$('#theme-btn').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  savePreference(state.me.id, { theme: next }).catch(() => {});
});

$('#signout-btn').addEventListener('click', async () => {
  await signOut();
  location.replace('../index.html');
});

addEventListener('maxmetrics:connection', event => {
  document.body.dataset.connection = event.detail.state;
});

// ── Loading ─────────────────────────────────────────────────────────────────────

async function openPlant(location) {
  state.location = location;
  state.draft = blankDraft();
  $('#content').innerHTML = '<div class="loading">Loading this plant…</div>';
  try {
    state.config = (await loadDepartmentConfig(location)) || [];
  } catch (error) {
    $('#content').innerHTML = `<div class="loading">${esc(error.message)}</div>`;
    return;
  }
  saved('All changes saved');
  render();
}

const [profile, grants] = await Promise.all([myProfile(), myLocations()]);
if (!profile) location.replace('../index.html');

state.me = profile;
if (profile.theme === 'dark' || profile.theme === 'light') document.documentElement.dataset.theme = profile.theme;

state.locations = (grants || []).map(grant => ({
  id: grant.location_id, name: grant.locations?.name || grant.location_id,
  sort: grant.locations?.sort_order ?? 0, canEdit: grant.can_edit,
})).sort((a, b) => a.sort - b.sort);

if (!state.locations.length) {
  document.body.classList.add('no-access');
  $('#content').innerHTML = `<div class="state"><div class="state__inner">
    <h1 class="state__title">Waiting on access</h1>
    <p class="state__body">Your account is signed in, but it has not been assigned to a plant
    yet, so there are no departments to configure.</p>
    <a class="btn" href="dashboard.html">Back to the dashboard</a>
  </div></div>`;
} else {
  $('#loc').innerHTML = state.locations.map(plant =>
    `<option value="${esc(plant.id)}">${esc(plant.name)}</option>`).join('');
  // The dashboard hands over the plant it was showing, so the person lands on the one they
  // were just reading rather than on the first one they happen to be granted.
  const asked = new URLSearchParams(location.search).get('loc');
  const start = state.locations.find(plant => plant.id === asked) || state.locations[0];
  $('#loc').value = start.id;
  await openPlant(start.id);
}
