// Judgement and drawing.
//
// Two rules hold this file together.
//
// `band` decides. Nothing else in MaxMetrics is allowed to form an opinion about whether
// a number is good, so a card, the dot beside a section in the rail, and the colour of a
// ring can never disagree about the same reading.
//
// The draw functions draw. Each takes a verdict that has already been reached and renders
// it. That is why the chart style can be a free choice: swapping a bar for a ring changes
// the shape and cannot change the answer.

export const esc = value =>
  String(value ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const band = {
  // A streak is a counter that only goes up, so its length is never a fault. The
  // exception is an incident today — not a streak that has yet to beat the record.
  // Judging it against the record put safety in the exception list on almost every
  // day of the year, and a warning that is always on is wallpaper. Worse, the morning
  // after an injury the counter reads 1 and the old rule painted it red, which is the
  // dashboard telling a plant it is failing on the day it most needs the opposite.
  streak: days => days === 0 ? 'stop' : 'ok',
  // These four thresholds are the plant's, carried over from the dashboard it has been
  // running since January. They are not mine to improve: the room already reads a colour
  // and knows what it means, and quietly moving a line would change what the meeting
  // believes without anyone being told.
  //
  // A shortage is red at one, not amber — a job short is a customer waiting.
  shortage: count => Number(count) === 0 ? 'ok' : 'stop',
  // A late or short shipment is amber at one and red at two.
  count:  value => value === 0 ? 'ok' : value === 1 ? 'warn' : 'stop',
  // Cost of quality is amber up to one per cent of sales whatever the target is set to.
  coq:    (value, target) => value <= target ? 'ok' : value <= 1.0 ? 'warn' : 'stop',
  rate:   (actual, target) => !actual || !target ? '' : actual >= target ? 'ok' : actual >= target * 0.9 ? 'warn' : 'stop',
  // Shipping percentages are amber down to ninety, not down to three points off target.
  pct:    (value, target) => value >= target ? 'ok' : value >= 90 ? 'warn' : 'stop',
  money:  percent => percent > 0 ? 'ok' : percent >= -3 ? 'warn' : 'stop',
  // Make-ready is the one production reading where less is better: an hour saved
  // setting up is an hour running.
  lower:  (actual, target) => !actual || !target ? ''
            : actual <= target ? 'ok' : actual <= target * 1.2 ? 'warn' : 'stop',
  maint:  status => status === 'Complete' ? 'ok' : status === 'Overdue' ? 'stop'
                  : status === 'Due Today' ? 'warn' : 'info',
  // A section reports the worst thing in it, so a closed rail still tells the truth.
  worst: list => list.includes('stop') ? 'stop' : list.includes('warn') ? 'warn' : 'ok',
};

export const MONTHS = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];
export const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export const dateOf = value => new Date(`${value}T00:00:00`);
export const daysBetween = (from, to) => Math.floor((dateOf(to) - dateOf(from)) / 86400000);
export const num = value => Number(value ?? 0).toLocaleString('en-US');

export function shortDate(value) {
  if (!value) return '—';
  const d = dateOf(value);
  return Number.isNaN(+d) ? '—' : `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
}

export function money(value) {
  const v = Number(value || 0), sign = v < 0 ? '-' : '', abs = Math.abs(v);
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(abs >= 1e7 ? 1 : 2)}M`;
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3).toLocaleString()}K`;
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

export function trend(current, previous) {
  if (!current || !previous) return '<span class="trend trend--flat">—</span>';
  const percent = (current - previous) / previous * 100, up = current >= previous;
  return `<span class="trend trend--${up ? 'up' : 'dn'}">${up ? '▲' : '▼'} ${Math.abs(percent).toFixed(1)}%</span>`;
}

// ── The four drawings ───────────────────────────────────────────────────────────
//
// Text inside an SVG scales with the viewBox, so a caption that fits on a laptop collides
// with the arc on a 48" screen. Only the reading itself goes inside a drawing; every label
// around it is HTML and scales with the type ramp instead.

const vizFont = value => String(value).length > 5 ? 15 : String(value).length > 3 ? 19 : 24;
const ridesInside = unit => unit === '%';

function drawBar({ percent, markPercent, markLabel }) {
  const mark = markPercent == null ? ''
    : `<span class="track__mark${markPercent >= 99 ? ' track__mark--end' : ''}"
        style="left:${markPercent}%" data-lbl="${esc(markLabel)}"></span>`;
  return `<div class="track"><span class="track__fill"
    style="width:${Math.min(100, percent).toFixed(1)}%"></span>${mark}</div>`;
}

function drawDonut({ percent, value, unit }) {
  const r = 38, circumference = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, percent)) / 100 * circumference;
  return `<svg class="viz" viewBox="0 0 100 100" role="img" aria-label="${esc(`${value} ${unit || ''}`)}">
    <circle class="viz-track" cx="50" cy="50" r="${r}" stroke-width="10"/>
    ${filled > 0.5 ? `<circle class="viz-fill" cx="50" cy="50" r="${r}" stroke-width="10"
      stroke-linecap="round" stroke-dasharray="${filled.toFixed(2)} ${(circumference - filled).toFixed(2)}"
      transform="rotate(-90 50 50)"/>` : ''}
    <text class="viz-v" x="50" y="50" dominant-baseline="central" font-size="${vizFont(value)}">${esc(value)}${
      ridesInside(unit) ? `<tspan font-size="${vizFont(value) * 0.52}">${esc(unit)}</tspan>` : ''}</text>
  </svg>`;
}

function drawGauge({ percent, value, unit, markPercent }) {
  const r = 38, cx = 50, cy = 58, length = Math.PI * r;
  const filled = Math.max(0, Math.min(100, percent)) / 100 * length;
  const path = `M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  let mark = '';
  if (markPercent != null) {
    const angle = Math.PI * (1 - Math.min(100, markPercent) / 100);
    const x1 = cx + Math.cos(angle) * (r - 6.5), y1 = cy - Math.sin(angle) * (r - 6.5);
    const x2 = cx + Math.cos(angle) * (r + 6.5), y2 = cy - Math.sin(angle) * (r + 6.5);
    mark = `<line class="viz-mark" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}"
      x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke-width="2"/>`;
  }
  return `<svg class="viz" viewBox="0 0 100 66" role="img" aria-label="${esc(`${value} ${unit || ''}`)}">
    <path class="viz-track" d="${path}" stroke-width="10" stroke-linecap="round"/>
    ${filled > 0.5 ? `<path class="viz-fill" d="${path}" stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${filled.toFixed(2)} ${length.toFixed(2)}"/>` : ''}
    ${mark}
    <text class="viz-v" x="50" y="${cy}" font-size="${vizFont(value)}">${esc(value)}${
      ridesInside(unit) ? `<tspan font-size="${vizFont(value) * 0.52}">${esc(unit)}</tspan>` : ''}</text>
  </svg>`;
}

// A week behind the number. "1,900" is a reading; "1,900 and falling for five days" is
// the thing worth two minutes of a meeting. The last point is marked because that is
// today, and today is the one being discussed.
export function spark(values, tone = '') {
  const points = (values || []).filter(v => Number.isFinite(Number(v))).map(Number);
  if (points.length < 2) return '';
  const w = 200, h = 30;
  const min = Math.min(...points), max = Math.max(...points), span = (max - min) || 1;
  const xy = points.map((v, i) => [i / (points.length - 1) * w, h - ((v - min) / span) * (h - 7) - 3.5]);
  const line = xy.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const [ex, ey] = xy[xy.length - 1];
  return `<svg class="spark spark--${tone}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <path class="spark__area" d="${line} L${w} ${h} L0 ${h} Z"/>
    <path class="spark__line" d="${line}"/>
    <circle class="spark__end" cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="3"/>
  </svg>`;
}

// Actual against target, with the bands that decided the verdict drawn behind it.
//
// `floor` is doing more work than it looks. OTIF of 97.87 against a target of 98, drawn
// from zero, is a bar 99% full and coloured red — which reads as catastrophe for a miss
// of 0.13 of a point. Readings that live in the high nineties get a floor, so the bar
// shows the part of the range anyone actually argues about.
export function bullet({ actual, target, tone = '', floor = 0, lowerIsBetter = false }) {
  if (!Number.isFinite(Number(actual)) || !Number.isFinite(Number(target)) || !target) return '';
  const top = target * (lowerIsBetter ? 2 : 1.35);
  const at = v => Math.max(0, Math.min(100, (v - floor) / (top - floor) * 100));
  const good = lowerIsBetter ? at(target) : 100;
  const mid = lowerIsBetter ? at(target * 1.18) : at(target);
  return `<div class="bullet bullet--${tone}">
    <span class="bullet__band bullet__band--bad"></span>
    <span class="bullet__band bullet__band--mid" style="width:${(lowerIsBetter ? mid : 100).toFixed(1)}%"></span>
    <span class="bullet__band bullet__band--good" style="width:${(lowerIsBetter ? good : mid).toFixed(1)}%"></span>
    <span class="bullet__fill" style="width:${at(Number(actual)).toFixed(1)}%"></span>
    <span class="bullet__target" style="left:${at(target).toFixed(1)}%"></span>
  </div>`;
}

export const chip = (tone, text) => `<span class="delta delta--${tone}">${esc(text)}</span>`;

export const CHART_NAMES = { number: 'Number only', bar: 'Bar', donut: 'Ring', gauge: 'Gauge' };

export const CHART_ICONS = {
  number: `<svg viewBox="0 0 24 24"><text x="12" y="17" font-size="15" font-weight="700"
    text-anchor="middle" fill="currentColor" stroke="none">7</text></svg>`,
  bar: `<svg viewBox="0 0 24 24"><path d="M3 16h18"/><path d="M3 16h11" stroke-width="4"/></svg>`,
  donut: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.5"/>
    <path d="M12 4.5A7.5 7.5 0 0 1 19.5 12" stroke-width="3.6"/></svg>`,
  gauge: `<svg viewBox="0 0 24 24"><path d="M4 17a8 8 0 0 1 16 0"/>
    <path d="M4 17a8 8 0 0 1 5-7.4" stroke-width="3.4"/></svg>`,
};

// One entry point. A card asks for its reading to be drawn and gets whichever form the
// reader picked, without knowing which that is.
export function drawReading(style, options) {
  if (style === 'number') return '';
  if (style === 'donut') return drawDonut(options);
  if (style === 'gauge') return drawGauge(options);
  return drawBar(options);
}

export const showsHeroNumber = style => style === 'number' || style === 'bar';

export const footStat = (label, value, small) =>
  `<div class="fstat"><span class="fstat__l">${esc(label)}</span>
   <span class="fstat__v${small ? ' fstat__v--sm' : ''}">${value}</span></div>`;

// Every reading carries a pictogram, and they are the plant's own — the ones printed on
// the dashboard the room has been reading since January. Keeping them costs nothing and
// means nobody has to learn where anything moved to.
export const ICONS = {
  injury: '⚕️', nearmiss: '⚠️', shortages: '🚫', coq: '🎯', coqytd: '🎯',
  printing: '🖨️', diecutting: '✂️', gluing: '📦', windowing: '🪟',
  stamping: '✨', flexo: '🎨', shipping: '🚚',
  late: '🚚', otif: '🚚', otd: '🚚', jobs: '🚚',
  uptime: '⏱️', mr: '🛠️',
  maint: '🔧', notes: '📝', staffing: '👷', fin: '💰', week: '📅',
};

// A reading's key is `printing`, or `printing-uptime`, or `printing-mr`. The suffix
// decides the pictogram, so a department added later gets sensible icons on all three of
// its cards without anyone editing this map.
export const iconFor = key => {
  const name = String(key || '');
  if (name.endsWith('-uptime')) return ICONS.uptime;
  if (name.endsWith('-mr')) return ICONS.mr;
  return ICONS[name] || '📊';
};

// A card is an icon, a label, a verdict, a reading drawn some way, and the numbers that
// give the reading its context. Everything that varies between cards arrives as an
// argument.
export function metricCard({ chart, pkey, icon, label, tone, value, unit, percent, markPercent,
                             markLabel, sub, flag, foot, edit, medium }) {
  const hero = showsHeroNumber(chart);
  const drawn = drawReading(chart, { percent, markPercent, markLabel, value, unit });
  const caption = hero
    ? (sub ? `<div class="unit">${esc(sub)}</div>` : '')
    : ((unit && !ridesInside(unit)) || sub
        ? `<div class="unit unit--under">${esc([unit && !ridesInside(unit) ? unit : '', sub]
            .filter(Boolean).join(' · '))}</div>`
        : '');
  return `<div class="card card--${tone}" data-pkey="${esc(pkey)}">
    <div class="card__head">
      <span class="card__ico" aria-hidden="true">${icon || iconFor(pkey)}</span>
      <span class="card__label">${esc(label)}</span>
    </div>
    ${flag || ''}
    <div class="card__mid">
      ${hero ? `<div class="hero${medium ? ' hero--md' : ''}">${esc(value)}${
        unit ? `<i>${esc(unit)}</i>` : ''}</div>${caption}${drawn}` : `${drawn}${caption}`}
    </div>
    <div class="foot">${foot}</div>
    ${edit ? `<div class="ez">${edit}</div>` : ''}
  </div>`;
}
