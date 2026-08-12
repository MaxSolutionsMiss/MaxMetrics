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
  currentSession, signOut, myProfile, myLocations,
  loadDepartmentConfig, saveDepartmentConfig, addDepartmentConfig, ensureDepartmentRows,
  loadBudgets, saveBudget, loadPlant, savePlant,
  peopleAt, grantAccess, revokeAccess, setAdmin, accessMatrix, allLocations,
  createPerson, updatePerson, resetPersonPassword, removePerson,
  loadSources, saveSource, addSource, dropSource, pullSources,
} from '../db.js';
import {
  esc, money, MONTHS, iconFor,
  volumeLabel, rateLabel, hoursLabel, CARD_CATALOGUE,
} from '../readings.js';

const $ = selector => document.querySelector(selector);

const session = await currentSession();
if (!session) location.replace('../index.html');

const today = () => new Date().toISOString().slice(0, 10);

const state = { me: null, locations: [], location: null, config: [], draft: null, plant: null,
                pane: 'departments', budgets: [], year: new Date().getFullYear(), people: null,
                madePerson: null, editing: null, adding: false, editingPerson: null,
                sources: null, dataTab: 'linked', cardTab: '_screens', peopleTab: 'all' };

// ── The panes ───────────────────────────────────────────────────────────────────
//
// Configure is not one screen. It is everything about a plant that is not a reading of a
// morning, and those are separate subjects with separate audiences — the shape of the
// floor, the year's budget, what shipping is judged against, and getting data in and out.
// A single scrolling page of all four is the settings screen this exists to avoid, so the
// rail carries them the same way the dashboard's rail carries its sections.
const PANES = [
  { key: 'departments', name: 'Departments', sub: 'The shape of this plant',
    icon: 'M4 20V9l5 3V9l5 3V4l6 4v12z' },
  { key: 'financials',  name: 'Financials',  sub: 'The budget the month is read against',
    icon: 'M12 3v18M8.5 7.5h6M8.5 7.5a2.6 2.6 0 000 5.2h3a2.6 2.6 0 010 5.2h-6' },
  { key: 'quality',     name: 'Cards',       sub: 'Which readings this plant carries',
    icon: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.9z' },
  { key: 'shipping',    name: 'Shipping',    sub: 'What on-time is measured against',
    icon: 'M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19a1.6 1.6 0 100-3.2A1.6 1.6 0 007 19zM17.5 19a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2z' },
  { key: 'data',        name: 'Data',        sub: 'Getting a morning in and out',
    icon: 'M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3' },
  // Administrators only, and it is the database that decides that rather than this list:
  // every call the pane makes checks `is_admin()` for itself, so hiding the door is a
  // courtesy and not the lock.
  { key: 'people',      name: 'People',      sub: 'Who may see this plant, and who may change it',
    admin: true,
    icon: 'M9 11.5a3.4 3.4 0 100-6.8 3.4 3.4 0 000 6.8M3 20a6 6 0 0112 0M16.4 11.6a2.9 2.9 0 100-5.8M17 14.4a5.4 5.4 0 013.8 5.2' },
];

// The rail somebody actually gets. An account that is not an administrator is not shown a
// door it cannot open — but the filter is a courtesy, not the lock, and the comment above
// is the load-bearing part: every write the People pane makes is checked in the database.
const panes = () => PANES.filter(p => !p.admin || state.me?.is_admin);

// ── A second rail, inside the pane ──────────────────────────────────────────────
//
// Every Configure pane was one long scrolling page. Cards was the worst of them: twenty-four
// rows of tick boxes over nine sections, all of it on screen at once, which is exactly the
// settings screen the rest of this product exists to avoid. So the subject splits down the
// left — the same shape as the rail outside it, the same shape the plant already knows from
// MaxDock — and what is in front of you is one subject.
//
// `tag` is the count that belongs on the rail rather than in the body: "6 of 7 on" is the
// answer somebody came to this screen for, and putting it next to the name means they often
// do not have to open the section at all.
function subRail(tabs, current, attr, body) {
  const now = tabs.find(t => t.key === current) || tabs[0];
  return `<div class="sub">
    <nav class="sub__rail" aria-label="Sections">
      ${tabs.map(t => `<button class="sub__b" data-${attr}="${esc(t.key)}"
        aria-current="${t.key === now.key}">
        <b>${esc(t.name)}${t.tag ? `<i class="sub__t">${esc(t.tag)}</i>` : ''}</b>
        ${t.sub ? `<span>${esc(t.sub)}</span>` : ''}</button>`).join('')}
    </nav>
    <div class="sub__body">${body(now)}</div>
  </div>`;
}

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

// The caption and the box are two elements, so the caption is repeated as the box's own
// name — a `<label>` that does not wrap and has no `for` labels nothing.
const row = (label, name, attrs = '', hint = '') =>
  `<div class="er"><label>${esc(label)}</label>
   <input class="inp" aria-label="${esc(label)}" data-field="${esc(name)}" ${attrs}>
   ${hint ? `<span class="er__hint">${esc(hint)}</span>` : ''}</div>`;

const toggle = (label, name, on) =>
  `<label class="tog"><input type="checkbox" data-field="${esc(name)}"${on ? ' checked' : ''}>
   <span>${esc(label)}</span></label>`;

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

// One department at a time, chosen from a list.
//
// Every department was drawn open, one under another, each with a preview card beside it
// made of invented numbers — four departments came out four screens long and the way to
// change Gluing's target was to scroll past three others looking for it. Nothing about
// configuring a department benefits from seeing the other three while you do it.
//
// So: pick one, edit it, and the rest are a line in a dropdown. Adding is a button rather
// than a permanently open form, for the same reason — it is the rarest thing on the screen
// and it was taking the most room.
function departmentsPane() {
  const plant = state.locations.find(l => l.id === state.location);
  const live = state.config.filter(c => c.active);
  const retired = state.config.filter(c => !c.active);
  if (!canEdit()) return readOnlyList(live, plant);

  const chosen = live.find(c => String(c.id) === String(state.editing)) || live[0];
  return `<section class="sec">
    <div class="sec__head"><h2 class="sec__title">Departments at ${esc(plant?.name || '')}</h2>
      <div class="sec__rule"></div></div>

    <div class="picker">
      <label class="picker__l" for="dept-pick">Which department</label>
      <select class="inp picker__s" id="dept-pick" aria-label="Which department to edit"
        ${live.length ? '' : 'disabled'}>
        ${live.map(config => `<option value="${esc(config.id)}"${
          config === chosen ? ' selected' : ''}>${esc(config.name)}</option>`).join('')
          || '<option>No departments yet</option>'}
      </select>
      <span class="picker__c">${live.length} in use${
        retired.length ? ` · ${retired.length} out of use` : ''}</span>
      <button class="btn btn--go" id="show-add">${
        state.adding ? 'Close' : 'Add a department'}</button>
    </div>

    ${state.adding ? `<section class="sec">${addPanel()}</section>` : ''}

    ${chosen ? `<div class="cfgs">${departmentCard(chosen)}</div>`
      : `<p class="verdict verdict--none">This plant has no departments yet. Add the ones it
         runs and they appear on tomorrow's dashboard — or on this morning's, as soon as you
         go back to it.</p>`}
  </section>
  ${retired.length ? `<section class="sec">${retiredPanel(retired)}</section>` : ''}`;
}

function readOnlyList(live, plant) {
  return `<section class="sec">
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
}

// ── Financials ──
// Twelve numbers a year, entered once. They are what the month is read against every
// morning, so the pane shows what they add up to rather than only asking for them.
function financialsPane() {
  const amount = month => Number(state.budgets.find(b => b.month === month + 1)?.amount || 0);
  const year = Array.from({ length: 12 }, (_, i) => amount(i)).reduce((a, b) => a + b, 0);
  const set = Array.from({ length: 12 }, (_, i) => amount(i)).filter(Boolean).length;
  return `<section class="sec">
    <div class="sec__head"><h2 class="sec__title">Sales budget · ${state.year}</h2>
      <div class="sec__rule"></div></div>
    <p class="verdict verdict--${set === 12 ? 'ok' : 'none'}">${set === 12
      ? `Twelve months set, ${money(year)} for the year. The morning reads each month
         prorated by elapsed days, so a budget entered here is the plan every card is measured against.`
      : `${set} of 12 months set. A month with no budget reports no variance, so the
         financials card simply says nothing for it.`}</p>
    <div class="panel"><div class="panel__head">
      <span class="card__ico" aria-hidden="true">💰</span>
      <h3 class="panel__title">Monthly budget</h3>
      <div class="panel__actions">
        <select class="inp" id="year-pick" style="width:auto">${
          [state.year - 1, state.year, state.year + 1].map(y =>
            `<option value="${y}"${y === state.year ? ' selected' : ''}>${y}</option>`).join('')}</select>
        <span class="pill pill--info">${money(year)}</span></div></div>
      <div class="panel__body">
        <div class="cfg__fields">${MONTHS.map((name, i) => `
          <div class="er"><label>${esc(name)}</label>
            <input class="inp" data-field="budget:${i + 1}:amount" type="number" step="0.01"
              value="${amount(i) || ''}" ${canEdit() ? '' : 'disabled'}
              aria-label="${esc(name)} budget"></div>`).join('')}
        </div>
      </div></div>
  </section>`;
}

// ── Shipping ──
// The two thresholds every shipping reading is judged against, and the note that they are
// the plant's own rather than mine to move.
function shippingPane() {
  return `<section class="sec">
    <div class="sec__head"><h2 class="sec__title">Shipping</h2><div class="sec__rule"></div></div>
    <p class="verdict verdict--none">OTD and OTIF are worked out from jobs shipped, late and
      short — they are arithmetic, not typed, so there is nothing here to set them to.
      What is configurable is what counts as shipping, which is a department like any other.</p>
    <div class="panel"><div class="panel__head">
      <span class="card__ico" aria-hidden="true">🚚</span>
      <h3 class="panel__title">How shipping is judged</h3></div>
      <div class="panel__body">
        <table class="tbl"><thead><tr><th>Reading</th><th>Worked out from</th>
          <th>Green</th><th>Amber</th></tr></thead><tbody>
          <tr><td class="dept">OTD</td><td>(jobs − late) ÷ jobs</td>
            <td>98% and over</td><td>90% and over</td></tr>
          <tr><td class="dept">OTIF</td><td>(jobs − late − short) ÷ jobs</td>
            <td>98% and over</td><td>90% and over</td></tr>
          <tr><td class="dept">Late</td><td>typed</td><td>none</td><td>one</td></tr>
          <tr><td class="dept">Short</td><td>typed</td><td>none</td><td>one</td></tr>
        </tbody></table>
        <p class="cfg__none">These four are the plant's own thresholds, carried over from the
        dashboard it has been running since January. The room already reads a colour and
        knows what it means, so moving a line here would change what the meeting believes
        without anyone being told — which is why they are shown and not offered as fields.</p>
      </div></div>
  </section>`;
}

// ── Cards ──
// Which readings this plant carries. It was three switches for the three quality cards
// nobody could agree were universal — NCRs, internal complaints, customer complaints — and
// every other card on the dashboard was hard-wired on. A plant that ships on pallets and
// does not count cartons has the same problem those three had: a card that reads a
// permanent dash teaches the room that a blank is normal.
//
// Turning one off removes it rather than blanking it, and the section rearranges around
// what is left — six quality cards become five and the row re-deals itself, because the
// arrangement is worked out after the cards are built and not before.
// The seven families, in the order the meeting walks them, so the one-page switches read in
// the same order as the screen they govern.
const FAMILIES = [
  ['safety', 'Safety'], ['quality', 'Quality'], ['production', 'Production'],
  ['shipping', 'Shipping'], ['financials', 'Financials'],
  ['maintenance', 'Maintenance'], ['labour', 'Labour & Overtime'],
];

function qualityPane() {
  const hidden = new Set(state.plant?.hidden_cards || []);
  // Two different questions about the same card, so two ticks rather than one.
  //
  // The first is whether this plant counts the thing at all; the second is whether it goes
  // up on a screen the floor walks past. A plant that reads its sales every morning and
  // does not want them on a corridor TV had no way to say so, and the only workaround —
  // turning the card off — took it off the dashboard as well.
  const wallOff = new Set(state.plant?.wall_hidden || []);
  const sections = [];
  for (const card of CARD_CATALOGUE) {
    let group = sections.find(g => g.name === card.section);
    if (!group) sections.push(group = { name: card.section, cards: [] });
    group.cards.push(card);
  }
  const tick = (attr, key, on) => `<input type="checkbox" data-${attr}="${esc(key)}"${
    on ? ' checked' : ''}${canEdit() ? '' : ' disabled'}>`;
  const row = card => `<div class="cfg__two">
    <span class="cfg__two-n">${esc(card.name)}</span>
    <label class="tog">${tick('card', card.key, !hidden.has(card.key))}</label>
    <label class="tog">${tick('wall', card.key, !wallOff.has(card.key))}</label>
  </div>`;
  const on = sections.reduce((n, g) => n + g.cards.filter(c => !hidden.has(c.key)).length, 0);

  // One entry per section, plus the two questions that are about the screens rather than
  // about any one card. The count rides on the rail because "6 of 7 on" is usually the whole
  // answer somebody came here for.
  const tabs = [
    { key: '_screens', name: 'Screens', sub: 'How the sections are laid out',
      tag: `${on} of ${CARD_CATALOGUE.length}` },
    ...sections.map(group => ({
      key: group.name, name: group.name, sub: `${group.cards.length} card${
        group.cards.length === 1 ? '' : 's'}`,
      tag: `${group.cards.filter(c => !hidden.has(c.key)).length} of ${group.cards.length}` })),
  ];

  const screens = () => `<div class="panel"><div class="panel__head">
      <span class="card__ico" aria-hidden="true">\u{1F3AF}</span>
      <h3 class="panel__title">What this plant shows</h3></div>
      <div class="panel__body"><p class="cfg__none" style="font-style:normal;color:var(--ink-muted)">
        <b>Dashboard</b> is whether this plant carries the card at all — unticked, it is
        gone from the page and from present mode, and the section rearranges around what is
        left. <b>One page</b> is whether it goes up on the single broadcast screen, which is
        a different room: the corridor TV is read by the floor, and sales usually are not.
        Production's cards are the plant's departments and are set on the Departments
        screen. Targets stay on the card itself, in Edit mode.</p>
        <label class="tog cfg__card" style="margin-top:var(--s2)">
          <input type="checkbox" data-plant="merge_upkeep"${
            state.plant?.merge_upkeep ? ' checked' : ''}${canEdit() ? '' : ' disabled'}>
          <span>Put Labour and Maintenance on one screen</span></label>
        <p class="cfg__none" style="font-style:normal;color:var(--ink-faint)">
          Off, each gets its own screen. On, they share one, which suits a plant with two
          bookings a week and nothing else to say about either.</p>
      </div></div>
    <div class="panel" style="margin-top:var(--s3)"><div class="panel__head">
      <h3 class="panel__title">Whole sections, off the one page</h3>
      <div class="panel__actions"><span class="pill pill--info">${
        FAMILIES.filter(([key]) => !wallOff.has(key)).length} of ${FAMILIES.length}</span></div></div>
      <div class="panel__body">
        <p class="cfg__none" style="font-style:normal;color:var(--ink-muted)">
          Faster than unticking a section's cards one at a time, and it takes the family off
          the legend as well. The walk — one section at a screen — skips it too.</p>
        <div class="cfg__fams">${FAMILIES.map(([key, name]) => `<label class="tog">
          ${tick('wall', key, !wallOff.has(key))}<span>${esc(name)}</span></label>`).join('')}</div>
      </div></div>`;

  const one = tab => {
    const group = sections.find(g => g.name === tab.key);
    if (!group) return screens();
    return `<div class="panel"><div class="panel__head">
        <h3 class="panel__title">${esc(group.name)}</h3>
        <div class="panel__actions"><span class="pill pill--info">${
          group.cards.filter(c => !hidden.has(c.key)).length} of ${group.cards.length} on the
          dashboard</span></div></div>
      <div class="panel__body">
        <div class="cfg__two cfg__two--head"><span></span>
          <span>Dashboard</span><span>One page</span></div>
        ${group.cards.map(row).join('')}</div></div>`;
  };

  return `<section class="sec">
    <div class="sec__head"><h2 class="sec__title">Cards</h2><div class="sec__rule"></div></div>
    ${subRail(tabs, state.cardTab, 'cardtab', one)}
  </section>`;
}

// ── Data ──
// Import, export and print used to sit in a bar along the foot of the dashboard. They are
// not part of a morning; they are things done to one, a few times a month. The import
// itself still runs on the dashboard because it writes into the morning being looked at —
// so this pane is the door to it rather than a second copy of it.
// ── Linked files ────────────────────────────────────────────────────────────────
//
// The three places this plant's numbers live, named once, so that Pull data on the dashboard
// means what it says. A source is a URL that returns the bytes of a workbook — that is
// deliberately the whole contract, because it is the one thing every place these files live
// can do.
//
// SharePoint and OneDrive: open the file, Share, change the permission to **Anyone with the
// link**, copy, and paste it here. A link that says "People in Max Solutions" needs a
// Microsoft sign-in, and a signed-out server gets a sign-in page rather than a workbook —
// the pull records exactly that against the source rather than failing quietly.
const SOURCE_HELP = {
  dor: 'DOR_V9.xlsx — production. Everything on the Production cards, and last week\u2019s.',
  otif: 'OTD / OTIF sheet — jobs shipped, late, short.',
  kpi: 'Monthly KPI workbook — cost of quality, NCRs, complaints, sales, OTIF roll-ups.',
};

// What shape of SharePoint address this is, judged before anybody waits on a pull.
//
// `/:x:/r/sites/…/Shared Documents/…` is the file's own path inside the library. It is what
// the address bar shows and what Copy link hands you when the permission is still "People in
// Max Solutions" — the `csf=1&web=1` flags are that button's fingerprint. SharePoint refuses
// it to anything without a Microsoft session, which is the 401.
//
// A real "Anyone with the link" share is a different URL entirely: `/:x:/s/` or `/:x:/g/`
// followed by an opaque token. So the shape alone answers the question, and answering it in
// the box beats answering it three minutes later in a failed pull.
function linkShape(raw) {
  const url = (raw || '').trim();
  if (!url) return null;
  if (!/sharepoint\.com|1drv\.ms|onedrive\.live\.com/i.test(url)) return null;
  if (/\/:[a-z]:\/[sg]\//i.test(url)) return { ok: true, say: 'This is a sharing link.' };
  // Three shapes of the same mistake. `/:x:/r/` is Copy link with the audience left as
  // "People in Max Solutions"; `_layouts/15/Doc.aspx?sourcedoc=` is what the address bar
  // shows once the file is open; `csf=1` is the Copy link button's own fingerprint.
  if (/\/:[a-z]:\/r\//i.test(url) || /_layouts\/\d+\/doc\.aspx/i.test(url)
      || /csf=1/i.test(url)) {
    return { ok: false, say: 'This is the file\u2019s address inside the library, not a '
      + 'sharing link \u2014 SharePoint will answer 401 to anyone without a Microsoft '
      + 'session. Use Share \u2192 Anyone with the link, or register MaxMetrics in your '
      + 'tenant (below) and this address will start working exactly as it is.' };
  }
  return null;
}

function sourcesPanel() {
  const sources = state.sources || [];
  const when = source => {
    if (!source.last_pulled_at) return 'never pulled';
    const at = new Date(source.last_pulled_at);
    return `${source.last_status === 'ok' ? 'pulled' : 'tried'} ${at.toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  };
  const linked = sources.filter(s => (s.url || '').trim()).length;
  return `<div class="panel"><div class="panel__head">
    <span class="card__ico" aria-hidden="true">\u{1F517}</span>
    <h3 class="panel__title">Linked files</h3>
    <div class="panel__actions">
      <span class="pill pill--${linked ? 'ok' : 'warn'}">${linked} of ${sources.length} linked</span>
      <button class="btn btn--ghost" id="add-source">Add a file</button></div>
    </div>
    <div class="panel__body">
      ${sources.map(source => `<div class="src">
        <div class="src__h">
          <input class="inp src__n" type="text" data-source-name="${esc(source.id)}"
            value="${esc(source.name)}" aria-label="What this file is called">
          <select class="inp src__t" data-source-kind="${esc(source.id)}"
            aria-label="What kind of file">
            ${[['dor', 'Production (DOR)'], ['otif', 'Shipping (OTD / OTIF)'],
               ['kpi', 'Quality and money (KPI)'], ['other', 'Something else']].map(([v, t]) =>
              `<option value="${v}"${source.kind === v ? ' selected' : ''}>${t}</option>`).join('')}
          </select>
          <label class="tog"><input type="checkbox" data-source-on="${esc(source.id)}"${
            source.enabled ? ' checked' : ''}><span>Pull it</span></label>
          <button class="lnk src__x" data-drop-source="${esc(source.id)}"
            aria-label="Remove ${esc(source.name)}">\u00d7</button>
        </div>
        <div class="src__u">
          <input class="inp" type="url" data-source="${esc(source.id)}"
            aria-label="${esc(source.name)} link"
            placeholder="https://maxsolutionsinc.sharepoint.com/..." value="${esc(source.url || '')}">
          <button class="btn btn--go" data-save-source="${esc(source.id)}">Save</button>
          <button class="btn" data-test-source="${esc(source.id)}">Test</button>
        </div>
        ${(shape => shape ? `<span class="src__k${shape.ok ? ' src__k--ok' : ''}">${
          shape.ok ? '\u2713 ' : '\u26a0 '}${esc(shape.say)}</span>` : '')(linkShape(source.url))}
        <span class="src__w${source.last_status === 'failed' ? ' src__w--bad' : ''}">${
          esc(when(source))}${source.last_note ? ` \u00b7 ${esc(source.last_note)}` : ''}</span>
      </div>`).join('') || '<p class="cfg__none">No files linked yet.</p>'}
    </div></div>

  <details class="panel help"><summary class="panel__head help__s">
    <h3 class="panel__title">Why a link is refused, and how to fix it</h3></summary>
    <div class="panel__body help__b">
  <div class="hp"><div class="hp__h">
    <h3 class="panel__title">Telling a good link from a bad one</h3></div>
    <div class="hp__b">
      <div class="lnkq">
        <div class="lnkq__b lnkq__b--no"><b>\u2717 Will always answer 401</b>
          <code>\u2026/:x:/<b>r</b>/sites/MaxSolutions-Mississauga/Shared%20Documents/\u2026</code>
          <code>\u2026/_layouts/15/<b>Doc.aspx</b>?sourcedoc=\u2026</code>
          <span>Both are the file\u2019s address inside the library \u2014 what the address bar
            shows, and what <i>Copy link</i> gives you while the permission is still
            <i>People in Max Solutions</i>. <code>csf=1</code> and <code>web=1</code> are that
            button\u2019s fingerprint. SharePoint refuses these to anything without a Microsoft
            session, and <code>?download=1</code> changes nothing.</span></div>
        <div class="lnkq__b lnkq__b--yes"><b>\u2713 A real sharing link</b>
          <code>\u2026/:x:/<b>s</b>/MaxSolutions-Mississauga/EbT9x\u2026long\u2026?e=Ab12Cd</code>
          <span><b>/s/</b> or <b>/g/</b>, then a long meaningless token, and no
            <code>Shared%20Documents</code> anywhere in it. That is a link SharePoint will
            answer to a stranger \u2014 which is what MaxMetrics is.</span></div>
      </div>
    </div></div>

  <div class="hp"><div class="hp__h">
    <h3 class="panel__title">Sharing the file — ruled out here</h3>
    <div class="panel__actions"><span class="pill pill--stop">Not available</span></div></div>
    <div class="hp__b">
      <p class="cfg__none" style="font-style:normal;color:var(--ink-muted)">
        The cheap route is a link SharePoint will answer to anybody: <b>Share</b> → the
        audience line at the top → <b>Anyone with the link</b>. It has been checked in
        this tenant and the option is not there. <b>Link settings</b> for DOR V9.xlsx offers
        exactly three:</p>
      <ol class="steps">
        <li><i>People in Max Solutions, Inc</i> — needs a company sign-in.</li>
        <li><i>Only people with existing access</i> — needs a company sign-in.</li>
        <li><i>People you choose</i> — named people, by email, inside Max Solutions.</li>
      </ol>
      <p class="cfg__none" style="font-style:normal;color:var(--ink-muted)">
        All three require a Microsoft account to be signed in, and MaxMetrics has neither an
        account nor a mailbox to be invited with, so none of them can work — including
        <i>People you choose</i>, which is the one that looks closest. Anonymous links are
        switched off for the whole tenant; that is a Microsoft 365 setting, not a per-file
        one, and no amount of re-sharing will produce the link. <b>The panel below is the way in.</b>
        A plant on a tenant that does allow anonymous links can still paste one here and it
        will be used in preference — the check above will say so.</p>
    </div></div>

  <div class="hp"><div class="hp__h">
    <h3 class="panel__title">Give MaxMetrics its own identity</h3>
    <div class="panel__actions"><span class="pill pill--ok">The way in</span></div></div>
    <div class="hp__b">
      <p class="cfg__none" style="font-style:normal;color:var(--ink-muted)">
        This is the \u201cadd them as a user\u201d you have been looking for. MaxMetrics is a
        server, not a person, so there is no mailbox to invite \u2014 it gets an identity in
        your Microsoft tenant instead. Once it has one, <b>every link already pasted above
        starts working, unchanged.</b> It is free \u2014 app registrations are part of any
        Microsoft 365 tenant and cost nothing at this volume.</p>
      <p class="cfg__none" style="font-style:normal;color:var(--ink-muted)">
        <b>Can you do it yourself?</b> Steps 1 to 5 usually yes: most tenants let any signed-in
        person register an application. <b>Steps 6 and 7 need an administrator</b> \u2014
        granting consent and naming the site are the two acts that hand out access, and
        Microsoft reserves them for Global, Application or SharePoint administrators. So the
        realistic ask of IT is two minutes at the end, not the whole job. Try step 1: if
        <b>New registration</b> opens, keep going and stop where you are refused.</p>
      <ol class="steps">
        <li>Go to <b>entra.microsoft.com</b> \u2192 <b>App registrations</b> \u2192
          <b>New registration</b>.</li>
        <li>Name it <b>MaxMetrics</b>. Accounts: <b>this organizational directory only</b>.
          No redirect URI. Press <b>Register</b>.</li>
        <li>On the Overview page copy the <b>Application (client) ID</b> and the
          <b>Directory (tenant) ID</b>.</li>
        <li><b>Certificates &amp; secrets</b> \u2192 <b>New client secret</b> \u2192 24 months.
          Copy the <b>Value</b> straight away \u2014 it is shown once, and it is not the
          Secret ID.</li>
        <li><b>API permissions</b> \u2192 <b>Add a permission</b> \u2192 <b>Microsoft
          Graph</b> \u2192 <b>Application permissions</b> \u2192 tick <b>Sites.Selected</b>,
          then <b>Add</b>.</li>
        <li>Press <b>Grant admin consent for Max Solutions Inc</b> and confirm. The Status
          column must show a green tick.</li>
        <li>Give the app read on this one site, in PowerShell as an administrator:<br>
          <code>Grant-PnPAzureADAppSitePermission -AppId &lt;client id&gt;
          -DisplayName "MaxMetrics" -Permissions Read
          -Site https://maxsolutionsinc.sharepoint.com/sites/MaxSolutions-Mississauga</code></li>
      </ol>
      <p class="cfg__none" style="font-style:normal;color:var(--ink-muted)">
        <b>Why <code>Sites.Selected</code> rather than <code>Sites.Read.All</code>.</b>
        <code>Sites.Read.All</code> lets the app read <i>every</i> SharePoint site in the
        company, which is a fair reason for IT to refuse. <code>Sites.Selected</code> grants
        nothing by itself \u2014 step 7 gives it read on the Mississauga site and nowhere
        else. If your administrator would rather skip step 7, <code>Sites.Read.All</code>
        works too and everything else is the same.</p>
      <p class="cfg__none" style="font-style:normal;color:var(--ink-muted)">
        <b>Where the three values go.</b> Into the server, never into this page and never
        into a browser: Supabase \u2192 this project \u2192 <b>Edge Functions</b> \u2192
        <b>Secrets</b>, as <code>MS_TENANT_ID</code>, <code>MS_CLIENT_ID</code> and
        <code>MS_CLIENT_SECRET</code>. A client secret is a password for your tenant, and the
        only safe place for it is somewhere just the server can read.</p>
    </div></div>

  <div class="hp"><div class="hp__h">
    <h3 class="panel__title">If IT will not do it</h3>
    <div class="panel__actions"><span class="pill pill--info">No Microsoft permission</span></div></div>
    <div class="hp__b">
      <p class="cfg__none" style="font-style:normal;color:var(--ink-muted)">
        There is a third way, and it asks Microsoft for nothing at all. A small scheduled task
        on one Windows PC reads the files that PC <i>can already see</i> \u2014 through OneDrive
        sync or a mapped drive, using the sign-in that person already has \u2014 and posts them
        here. No app registration, no consent, no administrator, and nothing for anyone to
        approve. The parser is the same one the Import screen uses and writes go through the
        same guard, so a figure somebody typed is never overwritten.</p>
      <p class="cfg__none" style="font-style:normal;color:var(--ink-muted)">
        It needs one PC that stays on overnight and has the folders \u2014 usually the office
        machine of whoever assembles the morning. The script and its instructions live in the
        MaxMetrics repository under <code>tools/hotfolder</code>. Two things have to be switched
        on first: the <code>ingest</code> endpoint, and a shared key for it.</p>
    </div></div>
    </div></details>`;
}

// ── Data ────────────────────────────────────────────────────────────────────────
//
// Four subjects that happen to share a heading: where the files live, getting a morning in,
// getting one out, and what the old dashboard's exports are. Drawn as one page they were
// four panels stacked down a screen with the important one — the linked files — the same
// size as a paragraph about printing.
//
// A second rail, the same shape as the one on the left. It is a pattern the plant already
// knows from MaxDock, and it means the pane in front of you is about one thing.
const DATA_TABS = [
  { key: 'linked', name: 'Linked files', sub: 'Where the numbers come from' },
  { key: 'inout',  name: 'Import, export, print', sub: 'A morning, by hand' },
  { key: 'legacy', name: 'The old dashboard', sub: 'Reading its .json exports' },
];

function dataPane() {
  const back = `dashboard.html?do=`;
  const tab = DATA_TABS.find(t => t.key === state.dataTab) || DATA_TABS[0];
  const body = {
    linked: () => sourcesPanel(),
    inout: () => `<div class="grid g3">
      ${[
        ['\u{1F4E5}', 'Import', 'import',
         'The plant\u2019s workbooks for this morning, or a .json export from the old dashboard for its history. Nothing is written until you have seen what the files say.'],
        ['\u{1F4E4}', 'Export', 'export',
         'The morning as a CSV, exactly as it is on screen. It takes what the room just read rather than re-querying, so an export can never disagree with the dashboard it came from.'],
        ['\u{1F5A8}\uFE0F', 'Print', 'print',
         'The morning as paper or a PDF. The rail, the top bar and every control drop out, and the sections run down the page without splitting a card across two sheets.'],
      ].map(([icon, name, action, says]) => `<div class="panel">
        <div class="panel__head"><span class="card__ico" aria-hidden="true">${icon}</span>
          <h3 class="panel__title">${name}</h3></div>
        <div class="panel__body panel__body--act">
          <p class="cfg__none" style="font-style:normal;color:var(--ink-muted)">${says}</p>
          <a class="btn btn--primary" href="${back}${action}">${name} a morning</a>
        </div></div>`).join('')}
      </div>`,
    legacy: () => `<div class="panel">
      <div class="panel__head"><span class="card__ico" aria-hidden="true">\u{1F5C2}\uFE0F</span>
        <h3 class="panel__title">The old dashboard\u2019s JSON</h3></div>
      <div class="panel__body"><p class="cfg__none" style="font-style:normal;color:var(--ink-muted)">
        A <code>.json</code> file written by <code>Daily_Morning_Dashboard_Vr 22.html</code> is
        read as history: each morning it contains is written to the date it happened on, and a
        reading somebody has already entered is never replaced. The preview lists every key it
        recognised <b>and every key it did not</b> \u2014 if a field of yours is in the second
        list, that is the list to send back.</p></div></div>`,
  };
  return `<section class="sec">
    <div class="sec__head"><h2 class="sec__title">Data</h2><div class="sec__rule"></div></div>
    ${subRail(DATA_TABS, tab.key, 'datatab', now => body[now.key]())}
  </section>`;
}

// ── People ──────────────────────────────────────────────────────────────────────
//
// Three levels and no more, because a folding-carton plant does not have a permissions
// problem, it has a "who covers Thursdays" problem:
//
//   No access    the plant is not on their list at all
//   View only    they read the morning and cannot change a number
//   Can edit     they fill it in and publish it
//
// Administrator is a separate question — it is about MaxMetrics rather than about a plant,
// so it is a tick on the person rather than a fourth level. An administrator can add people
// and set levels at every plant; it does not, by itself, give them a plant. There can be as
// many as the plant wants: it is a tick, not a seat.
//
// Somebody who has never signed in can still be added. There is no account to grant
// anything to, so the grant waits in `pending_access` and the signup trigger applies it —
// which means "add the new coordinator" is the same two clicks whether or not they have
// opened the invitation yet.
const LEVELS = [['none', 'No access'], ['view', 'View only'], ['edit', 'Can edit']];
const levelOf = person => !person.has_access ? 'none' : person.can_edit ? 'edit' : 'view';

// Which plants this person may reach, one line each, three states.
//
// The screen used to set access for the plant you happened to be configuring, which makes
// "make sure people cannot get into other locations" a job of visiting nine screens and
// remembering what you did on the other eight. It is one question about one person, so it
// is one list.
function plantAccess(person) {
  const plants = state.plants || [];
  if (!plants.length) return '';
  const who = person.profile_id || `email:${person.email}`;
  return `<div class="pacc">
    <div class="pacc__h">Which plants this account may open</div>
    <div class="pacc__g">${plants.map(pl => {
      const at = levelAt(person, pl.id);
      return `<label class="pacc__r">
        <span class="pacc__n">${esc(pl.name)}</span>
        <select class="inp inp--cell" data-plant-level="${esc(who)}"
          data-plant-id="${esc(pl.id)}"
          aria-label="${esc(pl.name)} access for ${esc(person.full_name || person.email)}">
          ${LEVELS.map(([value, text]) =>
            `<option value="${value}"${value === at ? ' selected' : ''}>${text}</option>`).join('')}
        </select></label>`;
    }).join('')}</div>
  </div>`;
}

const initialsOf = person => {
  const source = person.pending ? person.email : (person.full_name || person.email || '?');
  return source.split(/[\s.@_-]+/).filter(Boolean).slice(0, 2)
    .map(word => word[0].toUpperCase()).join('');
};

function peoplePane() {
  const plant = state.locations.find(l => l.id === state.location);
  const people = state.people || [];
  const withAccess = people.filter(p => p.has_access);

  // One line per person. It was a table row two lines deep with an avatar, a name, a badge
  // and an email stacked under each other, which is a card pretending to be a row: twenty
  // people came out three screens long. Name, email, level, admin — four columns, one line,
  // and the eye runs down the level column looking for the one that is wrong.
  const inRow = person => {
    const level = levelOf(person);
    const key = person.profile_id || `email:${person.email}`;
    // Open for editing: the row becomes the form rather than opening a dialogue over it, so
    // the person you are changing stays in the list you found them in. Everything that can
    // be done to an account is on this one line — rename, re-address, re-issue the password,
    // and remove — because a screen that can add somebody and not remove them is a screen
    // that leaves last year's staff holding a login.
    if (person.profile_id && state.editingPerson === person.profile_id) {
      return `<tr data-person="${esc(key)}" class="ppl--open"><td colspan="5">
        <div class="pplf">
          <input class="inp" id="ed-name" type="text" value="${esc(person.full_name || '')}"
            placeholder="Full name" aria-label="Full name">
          <input class="inp" id="ed-email" type="email" value="${esc(person.email || '')}"
            placeholder="Email" aria-label="Email address">
          <button class="btn btn--go" data-save-person="${esc(person.profile_id)}">Save</button>
          <button class="btn" data-cancel-person="1">Cancel</button>
          <span class="pplf__sp"></span>
          <button class="btn btn--quiet" data-reset-person="${esc(person.profile_id)}">
            New temporary password</button>
          ${person.profile_id === state.me?.id ? ''
            : `<button class="btn btn--quiet pplf__x"
                 data-remove-person="${esc(person.profile_id)}">Remove account</button>`}
        </div>
        ${plantAccess(person)}
      </td></tr>`;
    }
    return `<tr data-person="${esc(key)}">
      <td class="ppl__n">
        <span class="who__a who__a--sm" style="background:${
          person.pending ? '#8A94A6' : '#6C4BB6'}">${esc(initialsOf(person))}</span>
        <b>${esc(person.pending ? person.email.split('@')[0] : person.full_name)}</b>
        ${person.pending ? '<span class="pill pill--info">Invited</span>' : ''}
        ${person.profile_id === state.me?.id ? '<span class="pill pill--ok">You</span>' : ''}
      </td>
      <td class="soft ppl__e">${esc(person.email)}</td>
      <td class="ppl__l">${(() => {
        // Which plants, not what level here. "Can edit" told an administrator nothing about
        // the question they came to answer, which is whether this person can see Guelph.
        const mine = plantsFor(person);
        if (!mine.length) return '<span class="soft">No plants</span>';
        return `<span class="plst">${mine.map(pl =>
          `<span class="plst__p${levelAt(person, pl.id) === 'edit' ? ' plst__p--edit' : ''}"
             title="${esc(levelAt(person, pl.id) === 'edit' ? 'Can edit' : 'View only')}"
             >${esc(pl.name)}</span>`).join('')}</span>`;
      })()}</td>
      <td class="num ppl__a">
        <label class="tog" title="Administrators can add people and set access at every plant">
          <input type="checkbox" data-admin="${esc(person.profile_id || '')}"
            aria-label="Administrator"
            ${person.is_admin ? ' checked' : ''}${person.pending ? ' disabled' : ''}>
          <span class="soft">Admin</span></label>
      </td>
      <td class="num ppl__x">${person.profile_id
        ? `<button class="lnk" data-edit-person="${esc(person.profile_id)}"
             aria-label="Edit ${esc(person.full_name)}">Edit</button>`
        : `<button class="lnk" data-drop-invite="${esc(person.email)}"
             aria-label="Cancel the invitation for ${esc(person.email)}">Cancel</button>`}</td>
    </tr>`;
  };

  // The temporary password, shown once. It is not stored anywhere this screen can read it
  // back from, which is the point — if the administrator loses it before handing it over,
  // pressing Add again for the same address issues a new one.
  const made = state.madePerson;

  const everybody = () => `<div class="panel"><div class="panel__head">
      <h3 class="panel__title">Users</h3>
      <div class="panel__actions">
        <span class="pill pill--ok">${withAccess.length} with access</span>
        <span class="pill pill--info">${people.length} account${people.length === 1 ? '' : 's'}</span>
      </div></div>
      <div class="panel__body">
        ${people.length ? `<table class="tbl tbl--tight tbl--ppl"><thead><tr>
          <th>Name</th><th>Email</th><th>Plants</th><th class="num">MaxMetrics</th><th></th>
        </tr></thead><tbody>${people.map(inRow).join('')}</tbody></table>`
        : '<p class="cfg__none">Nobody yet.</p>'}
      </div></div>`;

  const add = () => `<div class="panel"><div class="panel__head">
      <span class="card__ico" aria-hidden="true">\u{1F464}</span>
      <h3 class="panel__title">Add new user</h3></div>
      <div class="panel__body">
        <div class="addp">
          <input class="inp" id="add-name" type="text" placeholder="Full name"
            aria-label="Full name">
          <input class="inp" id="add-email" type="email" placeholder="name@maxsolutions.ca"
            aria-label="Email address">
          <select class="inp" id="add-plant" aria-label="Which plant">
            ${(state.plants || []).map(pl =>
              `<option value="${esc(pl.id)}"${pl.id === state.location ? ' selected' : ''}
                >${esc(pl.name)}</option>`).join('')}
          </select>
          <select class="inp" id="add-level" aria-label="Access level">
            <option value="view">View only</option>
            <option value="edit">Can edit</option>
          </select>
          <button class="btn btn--go" id="add-person">Add</button>
        </div>
        <p class="cfg__none" style="font-style:normal;color:var(--ink-muted)">
          One plant to start with. Open the account in <b>Users</b> afterwards to give it more
          \u2014 an account can hold a different level at every plant, and holds none at the
          ones it is not given.</p>
        ${made ? `<div class="madep">
          <div class="madep__t">${esc(made.reused ? 'Password reset for' : 'Account created for')}
            <b>${esc(made.email)}</b></div>
          <div class="madep__p"><span>Temporary password</span><code>${esc(made.password)}</code>
            <button class="btn btn--ghost" id="copy-password">Copy</button></div>
          <p class="madep__s">Give them this once. MaxMetrics will require them to choose
            their own password the first time they sign in, and this one stops working the
            moment they do. It is not stored anywhere you can read it back — if it is
            lost, press Add again for the same address and a new one is issued.</p>
        </div>` : `<p class="cfg__none" style="font-style:normal;color:var(--ink-muted)">
          MaxMetrics makes the account and hands you a temporary password to pass on. They
          choose their own the first time they sign in. Nothing is emailed — this project
          has no outbound mail set up, and a sign-in that depends on one silently is a
          sign-in that fails on a Monday. Adding somebody who already has an account resets
          their password and gives them this plant.</p>`}
      </div></div>`;

  const tabs = [
    // Name things the way the people using them do. "Everybody" and "Add somebody" are how
    // this was described in conversation; on a screen they are a category and a verb that
    // neither MaxDock nor anything else in the product uses.
    { key: 'all', name: 'Users', sub: 'Accounts and the plants they may open',
      tag: `${people.length}` },
    { key: 'add', name: 'Add new user', sub: 'Make an account and hand over a password' },
  ];
  // A temporary password has just been issued, so that is the screen to be on: it is shown
  // once and never again, and landing back on the list would throw it away.
  const at = made ? 'add' : (state.peopleTab || 'all');

  return `<section class="sec">
    <div class="sec__head"><h2 class="sec__title">People</h2><div class="sec__rule"></div></div>
    ${subRail(tabs, at, 'peopletab', now => now.key === 'add' ? add() : everybody())}
  </section>`;
}

const PANE_BODY = {
  departments: departmentsPane, financials: financialsPane, quality: qualityPane,
  shipping: shippingPane, data: dataPane, people: peoplePane,
};

function renderNav() {
  $('#nav').innerHTML = `<a class="rail__link" href="dashboard.html" title="Daily dashboard">
      <svg class="rail__ico" viewBox="0 0 24 24"><path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z"/></svg>
      <span class="rail__txt">Daily dashboard</span></a>
    <div class="rail__split"></div>`
    + panes().map(pane => `<button class="rail__link" data-pane="${pane.key}"
        aria-current="${state.pane === pane.key}" title="${esc(pane.name)}">
        <svg class="rail__ico" viewBox="0 0 24 24"><path d="${pane.icon}"/></svg>
        <span class="rail__txt">${esc(pane.name)}</span></button>`).join('');
}

function render() {
  const plant = state.locations.find(l => l.id === state.location);
  const pane = panes().find(p => p.key === state.pane) || PANES[0];
  $('#foot-loc').textContent = plant?.name || '—';
  $('#foot-user').textContent = [state.me?.full_name, state.me?.job_title].filter(Boolean).join(' · ');
  $('#loc').value = state.location || '';
  $('#pane-title').textContent = pane.name;
  $('#pane-sub').textContent = pane.sub;
  renderNav();
  const allowed = panes().some(p => p.key === state.pane);
  $('#content').innerHTML = (allowed ? PANE_BODY[state.pane] : departmentsPane)();
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

async function persistBudget(month, value) {
  try {
    await saveBudget(state.location, state.year, Number(month), value ?? 0);
    const existing = state.budgets.find(b => b.month === Number(month));
    if (existing) existing.amount = value ?? 0;
    else state.budgets.push({ month: Number(month), amount: value ?? 0 });
    noteSaved();
  } catch (error) {
    saved(error.message);
    toast(error.message);
  }
}

async function loadYear() {
  try {
    state.budgets = (await loadBudgets(state.location, state.year)) || [];
  } catch {
    state.budgets = [];
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

let sourceTimer;
document.addEventListener('input', event => {
  const sourceName = event.target.dataset?.sourceName;
  if (sourceName) {
    const name = event.target.value;
    clearTimeout(sourceTimer);
    sourceTimer = setTimeout(async () => {
      try { await saveSource(sourceName, { name }); noteSaved(); }
      catch (error) { toast(error.message); }
    }, 500);
    return;
  }
  const source = event.target.dataset?.source;
  if (source) {
    const url = event.target.value.trim();
    clearTimeout(sourceTimer);
    sourceTimer = setTimeout(async () => {
      try { await saveSource(source, { url }); noteSaved(); }
      catch (error) { toast(error.message); }
    }, 500);
    return;
  }
  const name = event.target.dataset?.field;
  // A checkbox raises both `input` and `change`. It is answered on `change`, where the
  // page redraws immediately rather than after a typing pause.
  if (!name || event.target.type === 'checkbox') return;
  const [kind, id, column] = name.split(':');
  if (kind === 'budget') {
    const value = parse(event.target, event.target.value);
    clearTimeout(sendTimer);
    sendTimer = setTimeout(() => persistBudget(id, value), 450);
    redrawSoon();
    return;
  }
  const value = parse(event.target, event.target.value);
  applyLocally(id, column, value);
  clearTimeout(sendTimer);
  sendTimer = setTimeout(() => persist(id, column, value), 450);
  redrawSoon();
});

document.addEventListener('change', async event => {
  const cardKey = event.target.dataset?.card;
  if (cardKey) {
    const hidden = new Set(state.plant?.hidden_cards || []);
    event.target.checked ? hidden.delete(cardKey) : hidden.add(cardKey);
    const list = [...hidden];
    state.plant = { ...(state.plant || {}), hidden_cards: list };
    render();
    try { await savePlant(state.location, { hidden_cards: list }); noteSaved(); }
    catch (error) { toast(error.message); }
    return;
  }
  const wallKey = event.target.dataset?.wall;
  if (wallKey) {
    const off = new Set(state.plant?.wall_hidden || []);
    event.target.checked ? off.delete(wallKey) : off.add(wallKey);
    const list = [...off];
    state.plant = { ...(state.plant || {}), wall_hidden: list };
    render();
    try { await savePlant(state.location, { wall_hidden: list }); noteSaved(); }
    catch (error) { toast(error.message); }
    return;
  }
  const plantKey = event.target.dataset?.plant;
  if (plantKey) {
    const value = event.target.checked;
    state.plant = { ...(state.plant || {}), [plantKey]: value };
    render();
    try { await savePlant(state.location, { [plantKey]: value }); noteSaved(); }
    catch (error) { toast(error.message); }
    return;
  }
  const name = event.target.dataset?.field;
  if (!name || event.target.type !== 'checkbox') return;
  const [, id, column] = name.split(':');
  applyLocally(id, column, event.target.checked);
  persist(id, column, event.target.checked);
  render();
});

document.addEventListener('click', async event => {
  const pane = event.target.closest('[data-pane]');
  if (pane) {
    state.pane = pane.dataset.pane;
    state.madePerson = null;
    if (state.pane === 'financials' && !state.budgets.length) await loadYear();
    if (state.pane === 'quality' && !state.plant) state.plant = await loadPlant(state.location).catch(() => null);
    if (state.pane === 'people') await loadPeople();
    if (state.pane === 'data') await loadLinked();
    render();
    scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

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

  // Save a linked file.
  //
  // The box already writes half a second after the last keystroke, so this button is not
  // what makes the link stick — but a URL is pasted, not typed, and a field that saves
  // invisibly gives somebody pasting a long SharePoint address no reason to believe it
  // landed. It commits immediately, redraws so the link's shape is judged against what was
  // actually stored, and says so.
  const saveSrc = event.target.closest('[data-save-source]');
  if (saveSrc) {
    const id = saveSrc.dataset.saveSource;
    const box = document.querySelector(`[data-source="${CSS.escape(id)}"]`);
    const url = (box?.value || '').trim();
    clearTimeout(sourceTimer);
    try {
      await saveSource(id, { url });
      const row = (state.sources || []).find(s => s.id === id);
      if (row) row.url = url;
      render();
      const shape = linkShape(url);
      toast(shape && !shape.ok ? 'Saved — but this is a library path, not a sharing link.'
        : 'Saved.');
    } catch (error) { toast(error.message); }
    return;
  }

  // Test one link, now.
  //
  // Pasting a SharePoint address and finding out tomorrow morning whether it works is not a
  // feedback loop, and it is why three rounds of links have been tried and lost. This fetches
  // that one file and says exactly what came back — the size and which route it came by, or
  // the status and what the server said. Nothing is written to the morning: it is a question,
  // not an import.
  const testSrc = event.target.closest('[data-test-source]');
  if (testSrc) {
    const id = testSrc.dataset.testSource;
    testSrc.disabled = true;
    const was = testSrc.textContent;
    testSrc.textContent = 'Testing…';
    try {
      const out = await pullSources(state.location, today(), id);
      const got = (out.sources || [])[0];
      toast(!got ? 'Nothing came back.'
        : got.ok ? `Works — ${got.note}.`
        : `${got.name}: ${got.note}`);
      state.sources = await loadSources(state.location);
      render();
    } catch (error) { toast(error.message); }
    finally { testSrc.disabled = false; testSrc.textContent = was; }
    return;
  }

  // The three sub-rails. Each remembers where it was, so leaving Cards for Data and coming
  // back lands on the section you were working in rather than at the top.
  for (const [attr, key] of [['datatab', 'dataTab'], ['cardtab', 'cardTab'],
                             ['peopletab', 'peopleTab']]) {
    const hit = event.target.closest(`[data-${attr}]`);
    if (!hit) continue;
    state[key] = hit.dataset[attr];
    // Moving off the screen that showed a temporary password is what dismisses it.
    if (key === 'peopleTab') state.madePerson = null;
    render();
    return;
  }
  const addSrc = event.target.closest('#add-source');
  if (addSrc) {
    try {
      const made = await addSource(state.location, 'other', 'Another file',
        (state.sources || []).length + 1);
      if (made) state.sources = [...(state.sources || []), made];
      render();
    } catch (error) { toast(error.message); }
    return;
  }
  const dropSrc = event.target.closest('[data-drop-source]');
  if (dropSrc) {
    try {
      await dropSource(dropSrc.dataset.dropSource);
      await loadLinked();
      render();
      noteSaved();
    } catch (error) { toast(error.message); }
    return;
  }
  if (event.target.closest('#show-add')) {
    state.adding = !state.adding;
    render();
    return;
  }
  if (event.target.closest('#add-btn')) await addDepartment();
  if (event.target.closest('#add-person')) { await addPerson(); return; }

  const openPerson = event.target.closest('[data-edit-person]');
  if (openPerson) {
    state.editingPerson = openPerson.dataset.editPerson;
    state.madePerson = null;
    render();
    return;
  }
  if (event.target.closest('[data-cancel-person]')) {
    state.editingPerson = null;
    render();
    return;
  }
  const savePerson = event.target.closest('[data-save-person]');
  if (savePerson) {
    try {
      await updatePerson({
        id: savePerson.dataset.savePerson,
        name: $('#ed-name').value.trim(),
        email: $('#ed-email').value.trim(),
      });
      state.editingPerson = null;
      await loadPeople();
      render();
      noteSaved();
    } catch (error) { toast(error.message); }
    return;
  }
  const resetPerson = event.target.closest('[data-reset-person]');
  if (resetPerson) {
    try {
      state.madePerson = await resetPersonPassword(resetPerson.dataset.resetPerson);
      state.editingPerson = null;
      await loadPeople();
      render();
    } catch (error) { toast(error.message); }
    return;
  }
  // Removing an account takes the person out of MaxMetrics everywhere, not just off this
  // plant, so it asks — and it names them, because "are you sure" is a question nobody reads.
  const dropPerson = event.target.closest('[data-remove-person]');
  if (dropPerson) {
    const person = (state.people || []).find(x => x.profile_id === dropPerson.dataset.removePerson);
    const said = prompt(`Remove ${person?.full_name || 'this account'} from MaxMetrics `
      + `entirely? They lose access to every plant and their sign-in stops working.\n\n`
      + `Type REMOVE to confirm.`);
    if (said !== 'REMOVE') return;
    try {
      await removePerson(dropPerson.dataset.removePerson);
      state.editingPerson = null;
      await loadPeople();
      render();
      toast(`${person?.full_name || 'That account'} is gone`);
    } catch (error) { toast(error.message); }
    return;
  }
  const dropInvite = event.target.closest('[data-drop-invite]');
  if (dropInvite) {
    try {
      await revokeAccess(null, dropInvite.dataset.dropInvite, state.location);
      await loadPeople();
      render();
      noteSaved();
    } catch (error) { toast(error.message); }
    return;
  }
  if (event.target.closest('#copy-password')) {
    try {
      await navigator.clipboard.writeText(state.madePerson?.password || '');
      toast('Password copied');
    } catch { toast('Select it and copy — this browser refused the clipboard.'); }
  }
});

// ── People ──
//
// The list is re-read after every change rather than patched in place. It is one small
// function call, it is the only screen in the product where being a version behind means
// telling somebody they have access they do not have, and the read is the same one the
// database will use to decide.
async function loadLinked() {
  try { state.sources = await loadSources(state.location); }
  catch (error) { state.sources = []; toast(error.message); }
}

async function loadPeople() {
  try {
    // Three answers, together: who exists, which plants there are, and who can reach which.
    // The third is what makes "this person sees Mississauga and Guelph and nothing else" a
    // thing an administrator can set rather than a thing they have to trust.
    const [people, plants, matrix] = await Promise.all([
      peopleAt(state.location),
      allLocations().catch(() => null),
      accessMatrix().catch(() => null),
    ]);
    state.people = people;
    state.plants = plants?.length ? plants
      : state.locations.map(l => ({ id: l.id, name: l.name }));
    state.access = matrix || [];
  } catch (error) { state.people = []; toast(error.message); }
}

// What this person can reach at one plant: none, view, or edit.
const levelAt = (person, plant) => {
  const row = (state.access || []).find(a => person.profile_id
    ? a.profile_id === person.profile_id && a.location_id === plant
    : a.pending_email === person.email && a.location_id === plant);
  return !row ? 'none' : row.can_edit ? 'edit' : 'view';
};
const plantsFor = person => (state.plants || [])
  .filter(pl => levelAt(person, pl.id) !== 'none');

// Adding somebody is making an account, not sending an invitation.
//
// The first version left the grant waiting in `pending_access` until they signed up, which
// is a sound mechanism and the wrong product: nobody was ever going to sign up, because
// nothing told them to and nothing gave them a password. An administrator wants to type a
// name and hand over credentials, the way they already do for everything else in the plant.
async function addPerson() {
  const email = $('#add-email').value.trim();
  const name = $('#add-name').value.trim();
  const level = $('#add-level').value;
  // Whichever plant was picked, not whichever one happens to be open in Configure.
  const plant = $('#add-plant')?.value || state.location;
  if (!email) return toast('An email address is needed.');
  const button = $('#add-person');
  button.disabled = true;
  button.textContent = 'Adding…';
  try {
    const made = await createPerson({
      email, name, location: plant, canEdit: level === 'edit',
    });
    state.madePerson = made;
    await loadPeople();
    render();
    $('#add-email').value = '';
    $('#add-name').value = '';
  } catch (error) {
    toast(error.message);
    button.disabled = false;
    button.textContent = 'Add';
  }
}

document.addEventListener('change', async event => {
  const sourceKind = event.target.dataset?.sourceKind;
  if (sourceKind) {
    try {
      await saveSource(sourceKind, { kind: event.target.value });
      await loadLinked(); render(); noteSaved();
    } catch (error) { toast(error.message); }
    return;
  }
  const sourceOn = event.target.dataset?.sourceOn;
  if (sourceOn) {
    try {
      await saveSource(sourceOn, { enabled: event.target.checked });
      await loadLinked(); render(); noteSaved();
    } catch (error) { toast(error.message); }
    return;
  }
  if (event.target.id === 'dept-pick') {
    state.editing = event.target.value;
    render();
    return;
  }
  // One plant's level for one person. `grant_access` and `revoke_access` already take a
  // plant, so this is the same two calls the single-plant control made - it just names the
  // plant being changed instead of assuming the one on screen.
  const plantLevel = event.target.dataset?.plantLevel;
  if (plantLevel) {
    const person = (state.people || []).find(p =>
      (p.profile_id || `email:${p.email}`) === plantLevel);
    if (!person) return;
    const plant = event.target.dataset.plantId;
    const chosen = event.target.value;
    try {
      if (chosen === 'none') {
        await revokeAccess(person.profile_id, person.pending ? person.email : null, plant);
      } else {
        await grantAccess(person.email, plant, chosen === 'edit');
      }
      await loadPeople();
      render();
      noteSaved();
    } catch (error) { toast(error.message); await loadPeople(); render(); }
    return;
  }
  const admin = event.target.dataset?.admin;
  if (admin) {
    try {
      await setAdmin(admin, event.target.checked);
      await loadPeople();
      render();
      noteSaved();
    } catch (error) { toast(error.message); await loadPeople(); render(); }
  }
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
    if (created) {
      state.config.push(created);
      // The one somebody just made is the one they want in front of them.
      state.editing = String(created.id);
      state.adding = false;
    }
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

document.addEventListener('change', async event => {
  if (event.target.id !== 'year-pick') return;
  state.year = Number(event.target.value);
  await loadYear();
  render();
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
  state.budgets = [];
  state.plant = null;
  state.people = null;
  state.madePerson = null;
  state.editing = null;
  state.adding = false;
  state.sources = null;
  $('#content').innerHTML = '<div class="loading">Loading this plant…</div>';
  try {
    state.config = (await loadDepartmentConfig(location)) || [];
  } catch (error) {
    $('#content').innerHTML = `<div class="loading">${esc(error.message)}</div>`;
    return;
  }
  if (state.pane === 'financials') await loadYear();
  if (state.pane === 'quality') state.plant = await loadPlant(location).catch(() => null);
  if (state.pane === 'people') await loadPeople();
  if (state.pane === 'data') await loadLinked();
  saved('All changes saved');
  render();
}

const [profile, grants] = await Promise.all([myProfile(), myLocations()]);
if (!profile) location.replace('../index.html');

state.me = profile;
// Light, always — the same rule the dashboard follows.
document.documentElement.dataset.theme = 'light';

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
  const query = new URLSearchParams(location.search);
  const asked = query.get('loc');
  if (panes().some(p => p.key === query.get('pane'))) state.pane = query.get('pane');
  const start = state.locations.find(plant => plant.id === asked) || state.locations[0];
  $('#loc').value = start.id;
  await openPlant(start.id);
}
