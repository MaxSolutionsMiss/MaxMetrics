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

// What a department calls its own numbers.
//
// Windowing counts panes and foil stamping counts impressions. A plant reading "sheets"
// over both is being shown a dashboard built for somebody else's floor, and the labels are
// the cheapest possible way for it to be theirs. Every fall-back is exactly what the
// department displayed before there was anywhere to set them, so a plant that never opens
// Configure sees no change at all.
export const volumeLabel = config => config?.unit || 'volume';
export const rateLabel   = config => config?.rate_label || `${volumeLabel(config)}/hr`;
export const hoursLabel  = config => config?.hours_label || 'Hours';

// The plant's on-time target, in one place. `band.pct` is told what to compare against
// rather than knowing it, so the number belongs beside the bands that read it — and the
// conformance check exists to stop a copy of it appearing on a card.
export const SHIPPING_TARGET = 98;

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

// The arrow says which way it went; the colour says whether that was good. They are not
// the same question, and treating them as one printed a green ▲ 51% over a cost of quality
// climbing away from its target — the number's own card red, and the movement beside it
// congratulating the plant on it.
export function trend(current, previous, lowerIsBetter = false) {
  if (!current || !previous) return '<span class="trend trend--flat">—</span>';
  const percent = (current - previous) / previous * 100, up = current >= previous;
  // A change that rounds to nothing is not a direction, and "▲ 0.0%" in red over a
  // make-ready that did not move is the drawing inventing news.
  if (Math.abs(percent) < 0.05) return '<span class="trend trend--flat">—</span>';
  const good = lowerIsBetter ? !up : up;
  return `<span class="trend trend--${good ? 'good' : 'bad'}">${
    up ? '▲' : '▼'} ${Math.abs(percent).toFixed(1)}%</span>`;
}

// OTD and OTIF are not opinions, they are arithmetic on three counts the plant already
// enters. Deriving them removes two fields from the morning and removes any chance of the
// percentages disagreeing with the shipment counts printed beside them. Checked against
// 149 rows of the plant's own OTD sheet: 148 agree exactly, and the one that does not is a
// row recording 100% against 5 jobs with 1 late — an error this would have caught.
//
// It lives here, next to band(), for the same reason band() does. The page derived these
// and the assessment did not, so for the few seconds between a keystroke and the write
// landing, a card could print one OTIF and the section beside it judge another.
export function derivedShipping(metrics) {
  const jobs = Number(metrics?.jobs_shipped);
  if (!jobs) return null;
  const late = Number(metrics?.late || 0), short = Number(metrics?.shorts || 0);
  const round = value => Math.round(value * 10000) / 100;
  return { otd: round((jobs - late) / jobs), otif: round((jobs - late - short) / jobs) };
}

// A reading of the day, with derived shipping folded in. Every part of MaxMetrics that
// asks a morning for a field goes through this, so nothing has to remember which two of
// them are worked out rather than typed.
export const readingOf = (metrics, field) => {
  if (field === 'otd' || field === 'otif') {
    const derived = derivedShipping(metrics);
    if (derived) return derived[field];
  }
  return metrics?.[field];
};

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
  // No modifier at all when there is no verdict. `spark--` is still a class matching
  // `[class*="spark--"]`, so writing it out defeated the neutral-colour fallback and left
  // an unjudged line inheriting whatever colour it happened to land in.
  return `<svg class="spark${tone ? ` spark--${tone}` : ''}" viewBox="0 0 ${w} ${h}"
    preserveAspectRatio="none" aria-hidden="true">
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
// `ceiling` is the other half of `floor`. A rate can run to a third above target and the
// bar has to leave room for it, but a percentage cannot pass a hundred — and scaling OTIF
// to 132 put its target marker a fifth of the way along and gave the room a wide green
// field nobody can ever reach. Between a floor of ninety and a ceiling of a hundred the
// bar shows the ten points that are actually in play.
export function bullet({ actual, target, tone = '', floor = 0, ceiling = 0, lowerIsBetter = false }) {
  if (!Number.isFinite(Number(actual)) || !Number.isFinite(Number(target)) || !target) return '';
  const top = ceiling || target * (lowerIsBetter ? 2 : 1.35);
  const at = v => Math.max(0, Math.min(100, (v - floor) / (top - floor) * 100));
  // Each band is placed rather than stacked. Stacking them left-anchored got make-ready
  // right and put the higher-is-better case exactly backwards — green washed the ground
  // from nought up to target and amber everything past it, so a department beating its
  // target sat on an amber field and one missing it by half sat on a green one. On a
  // dashboard where colour is the verdict, that is the worst thing a drawing can do.
  //
  // The edges are band()'s thresholds: below nine tenths of target is a miss, the last
  // tenth is the warning, target and over is clear — mirrored for the readings where less
  // is better. Shipping percentages turn amber at ninety rather than at nine tenths of
  // ninety-eight, which is 88.2 — close enough that the ground under the bar is right to
  // within a fifth of a point, and the bar's own colour is the verdict either way.
  const edges = lowerIsBetter
    ? [['good', 0, at(target)], ['mid', at(target), at(target * 1.18)], ['bad', at(target * 1.18), 100]]
    : [['bad', 0, at(target * 0.9)], ['mid', at(target * 0.9), at(target)], ['good', at(target), 100]];
  return `<div class="bullet bullet--${tone}">
    ${edges.map(([kind, from, to]) => `<span class="bullet__band bullet__band--${kind}"
      style="left:${from.toFixed(1)}%;width:${Math.max(0, to - from).toFixed(1)}%"></span>`).join('')}
    <span class="bullet__fill" style="width:${at(Number(actual)).toFixed(1)}%"></span>
    <span class="bullet__target" style="left:${at(target).toFixed(1)}%"></span>
  </div>`;
}

export const chip = (tone, text) => `<span class="delta delta--${tone}">${esc(text)}</span>`;

// ── What every card carries under its number ────────────────────────────────────
//
// A figure on its own answers "what is it" and nothing else. The two questions the room
// actually asks next are "against what" and "which way is it going", and until now only
// Today and the Board answered them — the sections themselves printed a number, a caption
// and a row of foot stats, and left two thirds of the page empty underneath.
//
// So the bar and the line are not decoration to fill height. They are the two follow-up
// questions, answered on the card where the number is, which is also what gives a section
// enough to say to fill the page it is given.
//
// The bar is dropped when the reader has chosen the bar chart style: the drawing already
// is a bar against a target, and printing a second one under it would have the same card
// answer the same question twice.
export function cardTrack({ chart, actual, target, tone = '', floor = 0, ceiling = 0,
                           lowerIsBetter = false, targetText, deltaText, deltaTone,
                           series, seriesLabel = 'Last 7 mornings' }) {
  const bar = chart === 'bar' ? ''
    : bullet({ actual, target, tone, floor, ceiling, lowerIsBetter });
  const points = (series || []).filter(v => Number.isFinite(Number(v))).map(Number);
  const line = points.length > 1 ? spark(points, tone) : '';
  if (!bar && !line) return '';
  const row = (label, right) => `<div class="ctrack__row"><span class="ctrack__l">${esc(label)}</span>
    ${right || ''}</div>`;
  return `<div class="ctrack">
    ${bar ? row(targetText || 'Against target',
        deltaText ? `<span class="ctrack__d tone--${deltaTone || tone || 'none'}">${esc(deltaText)}</span>` : '')
      + bar : ''}
    ${line ? row(seriesLabel, trend(points[points.length - 1], points[0], lowerIsBetter)) + line : ''}
  </div>`;
}

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

// One line under the rule, not a grid of them.
//
// The grid was four readings in two rows of two, each with its own uppercase label, and on
// five cards across that is forty separate things competing for a glance that lasts two
// seconds. A card carries one number; everything else is the sentence that qualifies it,
// and a sentence belongs on a line. Pairs are dropped rather than printed as dashes —
// "Record —" tells nobody anything and still costs a slot.
export const footLine = pairs => {
  const shown = (pairs || []).filter(([, value]) => value != null && value !== '' && value !== '—');
  if (!shown.length) return '';
  // The row divides by what it holds, so three facts sit on one line rather than spilling
  // onto a second, and one reads as a sentence rather than as a lonely column.
  return `<div class="foot foot--${shown.length}">${shown.map(([label, value]) =>
    `<span class="fs"><span class="fs__l">${esc(label)}</span><span class="fs__v">${value}</span></span>`
  ).join('')}</div>`;
};

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
// A card is read in about two seconds from across a room, and everything on it is
// competing for those two seconds. So it is four things in a fixed order and nothing else:
//
//   the title, on one line, never wrapped
//   the flag, when there is something to announce
//   the number
//   a fine rule, and under it one line of what qualifies the number
//
// The bar and the trend sit between the number and the rule, and both are optional per
// card. A safety streak has no trend worth drawing — a counter that goes up by one a day
// is a diagonal line — and printing one on every card taught the eye to ignore all of
// them, including the ones that meant something.
export function metricCard({ chart, pkey, icon, label, tone, value, unit, percent, markPercent,
                             markLabel, sub, flag, foot, edit, medium, track }) {
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
    <div class="card__flag">${flag || ''}</div>
    <div class="card__mid">
      ${hero ? `<div class="hero${medium ? ' hero--md' : ''}">${esc(value)}${
        unit ? `<i>${esc(unit)}</i>` : ''}</div>${caption}${drawn}` : `${drawn}${caption}`}
      ${track || ''}
    </div>
    ${foot || ''}
    ${edit ? `<div class="ez">${edit}</div>` : ''}
  </div>`;
}
