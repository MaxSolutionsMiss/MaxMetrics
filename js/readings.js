// Judgement and drawing.
//
// Two rules hold this file together.
//
// `band` decides. Nothing else in Metriq is allowed to form an opinion about whether
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

// Which file a reading arrives in, and what to call it.
//
// This lived on the dashboard, where only the entry screen used it. It belongs here, with
// the other things that are true of a reading rather than of a screen, because the cards
// need it too: a number that came out of a workbook and a number somebody typed look exactly
// alike on a card, and when one of them is wrong the meeting stops to work out which kind it
// is before it can work out what to do. That is a question the product can answer in a mark.
export const FROM_FILE = {
  DOR: ['qty', 'hours', 'uptime', 'make_ready', 'mr_count', 'pw_qty', 'pw_hours'],
  KPI: ['coq', 'coq_ytd', 'coq_target', 'coq_ytd_target', 'ncr_today', 'ncr_mtd', 'ncr_ytd',
        'complaints_internal_today', 'complaints_internal_mtd', 'complaints_internal',
        'complaints_external_today', 'complaints_external_mtd', 'complaints_external',
        'mtd_otif', 'ytd_otif', 'mtd_otd', 'ytd_otd', 'fin_actual_mtd', 'fin_actual_ytd'],
  OTIF: ['jobs_shipped', 'jobs_on_time', 'late', 'shorts'],
};
export const SOURCE_NAMES = { DOR: 'DOR', OTIF: 'OTIF sheet', KPI: 'KPI workbook' };
// `dept:printing:qty` is a `qty`. The prefix names the table, not the reading.
export const sourceOf = name => {
  const field = String(name ?? '').split(':').pop();
  return Object.keys(FROM_FILE).find(file => FROM_FILE[file].includes(field)) || '';
};

// Where a reading came from, as a mark on the card.
//
// Two marks, and the absence of one is not a third: a grid for a reading a workbook
// supplied, a pencil for one a person typed. Every card gets one or the other, because
// "nothing here" would be the same thing the product said before and the whole point is that
// a reader should not have to know which cards are which.
//
// It does not claim the figure has not been corrected since. Distinguishing "pulled" from
// "pulled and then typed over" needs the import to mark its own writes, which it does not do
// yet — so this says what kind of reading it is, which is the question asked first and the
// one that decides who to turn to in the room.
export const sourceMark = field => {
  const file = sourceOf(field);
  const said = file ? `Comes from the ${SOURCE_NAMES[file] || file}` : 'Entered by hand';
  const glyph = file
    ? '<path d="M4 4.5h16v15H4zM4 9.5h16M4 14.5h16M9.5 4.5v15M14.5 4.5v15"/>'
    : '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 10-3-3L5 17z"/>';
  return `<span class="smark${file ? '' : ' smark--typed'}" role="img"
    aria-label="${said}" title="${said}"><svg viewBox="0 0 24 24">${glyph}</svg></span>`;
};

// The verdict said without using colour.
//
// Green, amber and red are the whole of what this product has ever said about a reading, and
// on a wall that is not enough. Somewhere between one in twelve and one in twenty men cannot
// separate the two that matter most; a meeting-room projector flattens both towards brown;
// and a person glancing in from the floor at ten metres gets a wash, not a hue. Every one of
// those is a normal Tuesday in a carton plant.
//
// So the tone is also a mark and a word. The mark rides in the card's title bar, where it is
// the same size and the same place on every card and can be read before the number is; the
// word is what a screen reader says, and what the mark means if somebody has to ask once.
// Shapes rather than a tick, a bang and a cross alone, because shape survives distance and
// low contrast better than a glyph does.
export const VERDICT = {
  ok:   { mark: '●', word: 'On target' },
  warn: { mark: '▲', word: 'Near target' },
  stop: { mark: '■', word: 'Off target' },
  info: { mark: '○', word: 'For information' },
};
export const verdictMark = tone => {
  const said = VERDICT[tone];
  return said
    ? `<span class="vmark" role="img" aria-label="${said.word}" title="${said.word}">${said.mark}</span>`
    : '';
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
//
// It is the *fallback* now rather than the answer. A morning opened from August 2026 carries
// the target it is going to be judged against in `daily_metrics.otif_target`, because a
// constant in a browser means that moving the target to 97 next January restates every
// morning back to 2025 — green mornings turning amber, retrospectively, with nothing on the
// screen to say why. Mornings published before the column existed have nothing stored and
// fall back to this, which is what they were actually judged against at the time.
export const SHIPPING_TARGET = 98;
export const otifTarget = metrics => Number(metrics?.otif_target ?? SHIPPING_TARGET);
export const otdTarget  = metrics => Number(metrics?.otd_target ?? SHIPPING_TARGET);

// ── The five states a reading can be in ─────────────────────────────────────────
//
// Nought and nothing are different statements, and for three releases this product only had
// one way of saying either: an em dash. That is survivable on a card, where a dash reads as
// "no number", and it is not survivable in a count — a morning with nine of twenty readings
// entered printed "Everything is on target · All 9 readings within target", which is a
// sentence nobody in the room can act on and everybody in the room believes.
//
//   missing  nobody entered it and no file supplied one
//   stale    a file supplied it, but that file has not arrived since before this morning
//   na       the arithmetic has no denominator — nought jobs shipped has no OTIF
//   ok/warn/stop  present, current, and judged
//
// `na` is a value rather than an absence, so it travels as one. Anything that formats a
// reading has to know about it, which is the point: a percentage of nothing must never be
// drawn as a hundred per cent and must never be drawn as a blank either.
export const NA = 'n/a';
export const isNa = value => value === NA;
export const isMissing = value => value === null || value === undefined || value === '';
export const stateOf = (value, tone) =>
  isMissing(value) ? 'missing' : isNa(value) ? 'na' : (tone || 'ok');

export const MONTHS = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];
export const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// Which morning it is, right now.
//
// Two things were wrong with `new Date().toISOString().slice(0, 10)`, and both pages had
// their own copy of it.
//
// It was UTC. Mississauga is four or five hours behind, so at eight in the evening the
// dashboard quietly moved to tomorrow — a fresh, empty morning, in the middle of the
// afternoon shift, with everything anybody had typed that day apparently gone. Nobody had
// caught it because nobody opens the dashboard at eight at night.
//
// And it rolled at midnight, which is the wrong hour for a plant that runs nights. The
// comment cards — the review, the front of the building, the board for the day ahead — are
// per morning and empty themselves when the morning changes, and the room wants that to
// happen at three, after the night shift has had its say and before anybody arrives to write
// the next one. Subtracting three hours from the local clock says exactly that: until 02:59
// you are still filling in yesterday's morning.
export const MORNING_ROLLS_AT = 3;
export function morningToday(now = new Date()) {
  const at = new Date(now.getTime() - MORNING_ROLLS_AT * 3600000);
  const pad = n => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

export const dateOf = value => new Date(`${value}T00:00:00`);
export const daysBetween = (from, to) => Math.floor((dateOf(to) - dateOf(from)) / 86400000);
export const num = value => Number(value ?? 0).toLocaleString('en-US');

export function shortDate(value) {
  if (!value) return '—';
  const d = dateOf(value);
  return Number.isNaN(+d) ? '—' : `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
}

// Two decimal places on the millions, always.
//
// This used to drop to one above ten million, to keep the widest figure on the product one
// character narrower — the money hero is what `fitCards` shrinks a whole screen around. The
// plant's answer to that trade was no: $21.1M and $21.11M are ten thousand dollars apart,
// and a sales figure that rounds away ten thousand dollars is not a sales figure. The width
// is the cost and it is the right way round.
export function money(value) {
  const v = Number(value || 0), sign = v < 0 ? '-' : '', abs = Math.abs(v);
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
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
// Nought jobs and no jobs figure are two different mornings, and they used to produce the
// same em dash. A plant that shipped nothing on a statutory holiday has an OTIF that does
// not exist — there is no denominator — and that is a fact worth printing as one. A plant
// where nobody has entered the jobs figure has an OTIF nobody knows yet, which is a job for
// somebody before the meeting.
export function derivedShipping(metrics) {
  const jobs = metrics?.jobs_shipped;
  if (isMissing(jobs)) return null;
  if (Number(jobs) === 0) return { otd: NA, otif: NA, na: true };
  const count = Number(jobs);
  const late = Number(metrics?.late || 0), short = Number(metrics?.shorts || 0);
  const round = value => Math.round(value * 10000) / 100;
  return { otd: round((count - late) / count), otif: round((count - late - short) / count) };
}

// A reading of the day, with derived shipping folded in. Every part of Metriq that
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

// Twelve months of a count, drawn the way every other chart here is drawn.
//
// The seven-day line is the right picture for a reading taken every morning and the wrong one
// for a count closed off at month end. NCRs, internal complaints and customer complaints are
// the second kind: a week of them is four zeroes and a one, drawn as a spike that means
// nothing. A year of months answers the question actually asked of these three — is this a bad
// month or a bad year.
//
// It was columns for one draft, which was defensible and looked like nothing else on the
// product: a quality screen had two cards drawn as lines and three as bar charts. Same line,
// same fill, same end point as the seven-day spark, with the months named underneath. A card
// is recognisable across a room because there are only a few shapes on the whole dashboard.
//
// Months the year has not reached are left out entirely: drawing December in August is a
// promise the data cannot keep. A month with no rows breaks the line rather than dropping it
// to nought, because "none logged" and "none happened" are different statements.
const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export function columns(values, tone = '', { through = 11 } = {}) {
  const upto = Math.max(0, Math.min(11, through));
  // `Number(null)` is nought, not NaN, so a month with no row has to be caught before the
  // cast — otherwise a year with nothing in it draws twelve confident zeroes.
  const shown = (values || []).slice(0, upto + 1)
    .map(v => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  if (!shown.some(v => v != null)) return '';
  const w = 200, h = 32, pad = 3.5;
  // Scaled between the year's own low and high, exactly as the seven-day line is. Drawn from
  // nought, twelve months of a count that runs between ten and sixteen is a flat line near the
  // top of the box — honest about the zero and useless about the year.
  const seenV = shown.filter(v => v != null);
  const low = Math.min(...seenV), span = (Math.max(...seenV) - low) || 1;
  const at = i => upto ? (i / upto) * (w - 6) + 3 : w / 2;
  const up = v => h - pad - ((v - low) / span) * (h - pad * 2);
  const seen = shown.map((v, i) => [i, v]).filter(([, v]) => v != null);
  const line = seen.map(([i, v], n) => `${n ? 'L' : 'M'}${at(i).toFixed(1)} ${up(v).toFixed(1)}`).join(' ');
  const [lastI, lastV] = seen[seen.length - 1];
  const area = `${line} L${at(lastI).toFixed(1)} ${h} L${at(seen[0][0]).toFixed(1)} ${h} Z`;
  return `<div class="months">
    <svg class="spark${tone ? ` spark--${tone}` : ''}" viewBox="0 0 ${w} ${h}"
      preserveAspectRatio="none" aria-hidden="true">
      <path class="spark__area" d="${area}"/>
      <path class="spark__line" d="${line}"/>
      <circle class="spark__end" cx="${at(lastI).toFixed(1)}" cy="${up(lastV).toFixed(1)}" r="3"/>
    </svg>
    <div class="months__m" aria-hidden="true">${
      shown.map((v, i) => `<i${i === upto ? ' class="is-now"' : ''}>${MONTH_INITIALS[i]}</i>`).join('')}</div>
  </div>`;
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
export function bullet({ actual, target, tone = '', floor = 0, ceiling = 0, lowerIsBetter = false, bands = true }) {
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
  // A streak has no bands. The ground is banded because most readings are measured against
  // a target they are supposed to reach, so short of it is a miss — but a record is a target
  // to beat, not one to meet, and painting "ten days since the last near-miss" on a red
  // field says the plant is failing at something it is not failing at. The marker alone is
  // the story: here is the record, here is where you are.
  const edges = !bands ? []
    : lowerIsBetter
    ? [['good', 0, at(target)], ['mid', at(target), at(target * 1.18)], ['bad', at(target * 1.18), 100]]
    : [['bad', 0, at(target * 0.9)], ['mid', at(target * 0.9), at(target)], ['good', at(target), 100]];
  // The bands and the fill are clipped to the bar's rounded corners; the target mark is not.
  //
  // It used to be inside the same clip, which quietly removed most of it: the mark is drawn
  // taller than the bar and points at itself with a notch above, and `overflow:hidden`
  // shaved off both. What was left was a short dark tick the length of the bar, sitting on
  // a coloured fill, and the room's verdict was that you cannot see where target is. So the
  // two clipped layers get a wrapper of their own and the mark hangs outside it.
  return `<div class="bullet bullet--${tone}">
    <span class="bullet__in">
      ${edges.map(([kind, from, to]) => `<span class="bullet__band bullet__band--${kind}"
        style="left:${from.toFixed(1)}%;width:${Math.max(0, to - from).toFixed(1)}%"></span>`).join('')}
      <span class="bullet__fill" style="width:${at(Number(actual)).toFixed(1)}%"></span>
    </span>
    <span class="bullet__target" style="left:${at(target).toFixed(1)}%"></span>
  </div>`;
}

export const chip = (tone, text) => `<span class="delta delta--${tone}">${esc(text)}</span>`;

// ── Variance, said one way ──────────────────────────────────────────────────────
//
// Four sections were each inventing their own. Shipping printed "−0.13 pts", cost of
// quality "+0.04 pts", money "▲ 2.3%", and the departments a bare "−240". Points are a
// unit nobody outside a statistics class asks for — "two points off" and "two per cent
// off" are different numbers, and the room reads the first as the second anyway. So every
// variance on the product is now the same thing: how far off target, as a share of the
// target, in a chip the colour of the verdict.
//
// The colour is the sign, not a band, because that is the question being asked of it: over
// is good, under is not, and a little under is worth a different colour from a lot under.
// Four per cent is the line between them — a miss inside four per cent of budget is a week
// of weather, past it is a decision.
export const varianceTone = pct =>
  !Number.isFinite(pct) ? 'none' : pct >= 0 ? 'ok' : pct > -4 ? 'warn' : 'stop';

// The arrow and the sign say the same thing, and both are wanted: the arrow is what the eye
// catches from across a room, the sign is what survives being read out loud.
export const variancePct = (pct, digits = 1) =>
  `${pct >= 0 ? '▲' : '▼'} ${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(digits)}%`;

// `lowerIsBetter` flips which side is green without flipping the sign printed. Cost of
// quality half its target is "−55%" and green: the number says which way it moved, the
// colour says whether that was the way to move.
export const varianceChip = (actual, target, { digits = 1, lowerIsBetter = false } = {}) => {
  const a = Number(actual), t = Number(target);
  if (!Number.isFinite(a) || !Number.isFinite(t) || !t) return null;
  const pct = (a - t) / Math.abs(t) * 100;
  return chip(varianceTone(lowerIsBetter ? -pct : pct), variancePct(pct, digits));
};

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
                           lowerIsBetter = false, bands = true, targetText, deltaText, deltaTone,
                           series, seriesLabel = 'Last 7 days', seriesTrend = true, deltaHtml,
                           months, monthsLabel = 'This year, by month', monthsThrough = 11 }) {
  const bar = chart === 'bar' ? ''
    : bullet({ actual, target, tone, floor, ceiling, lowerIsBetter, bands });
  const points = (series || []).filter(v => Number.isFinite(Number(v))).map(Number);
  const line = points.length > 1 ? spark(points, tone) : '';
  const year = months ? columns(months, tone, { through: monthsThrough }) : '';
  if (!bar && !line && !year) return '';
  const row = (label, right) => `<div class="ctrack__row"><span class="ctrack__l">${esc(label)}</span>
    ${right || ''}</div>`;
  // The bar carries no heading and its movement sits under it, centred.
  //
  // "AGAINST 3,050 SHEETS/HR" restated the target, which the foot already prints, and it
  // pushed the arrow that says which way the reading went out to the right-hand edge - the
  // one part of the card nobody was looking at. The number moved is the story; it goes
  // directly under the bar, on the card's own centre line, where the eye lands after the
  // figure above it.
  // `--vchars` is how long the line turned out, the same trick the figure above uses. The
  // size is set from the card, and capped so `+$1.87M` and `-$12.34M` are the same line
  // rather than one of them running past the border and pulling the page's type down.
  const moved = deltaHtml || (deltaText
    ? `<span class="ctrack__d tone--${deltaTone || tone || 'none'}"
         style="--vchars:${String(deltaText).length}">${esc(deltaText)}</span>`
    : '');
  return `<div class="ctrack">
    ${bar ? bar + (moved ? `<div class="ctrack__mv">${moved}</div>` : '') : ''}
    ${line ? `<div class="ctrack__ser">${row(seriesLabel, seriesTrend
        ? trend(points[points.length - 1], points[0], lowerIsBetter) : '')}${line}</div>` : ''}
    ${year ? `<div class="ctrack__yr">${row(monthsLabel, '')}${year}</div>` : ''}
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
// A third element on a pair makes it editable, and it is edited where it is printed.
//
// Every card used to grow a block of labelled inputs under its foot, which meant the person
// entering a morning read a number in one place and typed it in another, an inch below, with
// the label written out twice. Worse, it doubled the height of every card on the page and
// turned "Everything" into a scroll. The value and the field are the same square of the card
// now: in edit mode the value steps aside and the input stands where it stood.
export const footLine = pairs => {
  const shown = (pairs || []).filter(([, value, edit]) =>
    edit || (value != null && value !== '' && value !== '—'));
  if (!shown.length) return '';
  // The row divides by what it holds, so three facts sit on one line rather than spilling
  // onto a second, and one reads as a sentence rather than as a lonely column.
  // Each fact carries how long it is, for the same reason the hero does: a column of the
  // foot is a fraction of a card, and "Nov 20, 2025" at the size that suits "39" is wider
  // than half of one. Without it the date was the first thing to run out of room on every
  // card, which capped how large the whole card could be drawn.
  // A chip is wider than its own text: it carries padding and a border, and counting only
  // the letters is how "▼ −34.0%" came to be sized as though it were eight bare characters
  // and clipped to "−34.0…". Three characters is what the padding costs at every size,
  // because the padding is in `em` like everything else on a card.
  const chars = text => {
    const raw = String(text ?? '');
    const bare = raw.replace(/<[^>]*>/g, '').trim().length || 1;
    return bare + (/class="chip/.test(raw) ? 3 : 0);
  };
  // A fact whose label is a target is context rather than news, and goes quiet. Naming it
  // here rather than at every call site means a card cannot forget: there are eleven places
  // that print a target and they would not have stayed in step.
  const quiet = label => /^(target|target\/hr|record|budget|elapsed|through|of|expected|hours|crew hrs)$/i
    .test(String(label).trim());
  // The longest label in *this* row, on the row, so all of its labels are drawn at one size.
  // Per cell they would each shrink to their own width and "BUDGET EXPECTED VARIANCE" would
  // come out at three sizes; taken from the grid they would be settled by the longest label
  // anywhere on the page, which on a screen carrying "LAST NEAR-MISS" is every label tiny.
  // The longest label and the longest value in *this* row, on the row. One size per row for
  // each: a row whose three values come out at three sizes is a row that reads as three
  // rows, which is what the fixed line-boxes were put in to prevent and what capping each
  // value by its own length would bring straight back.
  const widest = Math.max(6, ...shown.map(([label]) => chars(label)));
  // And how much the row holds altogether, which is the number that actually decides how
  // large it can be drawn.
  //
  // The cap used to be "the longest value must fit a share of the card", which is the same
  // number only while the values are about the same length. They are not on the money card:
  // "▼ −5.4% (−$63K)" is fifteen characters beside "$3.03M" and "$1.17M", and requiring the
  // long one to fit a third drew all three at a third of the size the row had room for — a
  // foot whose figures came out smaller than their own captions. The columns are `auto`, so
  // the long cell already takes more of the row than the short ones; what has to fit is the
  // sum.
  //
  // One size still, for the same reason as before: three values at three sizes is a row that
  // reads as three rows. This changes what the one size is worked out from, not that there is
  // one of it.
  const across = Math.max(8,
    shown.reduce((total, [, value]) => total + chars(value ?? '—'), 0));
  return `<div class="foot foot--${shown.length}" style="--lc:${widest};--fcs:${across}">${
    shown.map(([label, value, edit]) =>
    `<span class="fs${quiet(label) ? ' fs--quiet' : ''}"><span class="fs__l">${esc(label)}</span>` +
    `<span class="fs__v">${
      edit ? `<span class="view-only">${value ?? '—'}</span>` +
             `<input class="inp inp--foot edit-only" aria-label="${esc(label)}"
                data-field="${esc(edit.field)}" ${edit.attrs || ''}>`
           : value}</span></span>`
  ).join('')}</div>`;
};

// Every reading carries a pictogram, and they are the plant's own — the ones printed on
// the dashboard the room has been reading since January. Keeping them costs nothing and
// means nobody has to learn where anything moved to.
// ── Marks ───────────────────────────────────────────────────────────────────────
//
// One drawn set rather than the operating system's emoji.
//
// Emoji were the right first answer: the plant's own dashboard uses them, the room already
// knows them, and they cost nothing. What killed them was the bar. Knocked back to one
// colour, an emoji is whatever silhouette its designer happened to draw — 🎯 becomes a
// circle, 📦 a hexagon, 🪟 a square — and the set stops reading as a set, because it was
// never drawn as one. They also change shape between Windows, macOS and Android, so the
// meeting-room screen and the laptop beside it were showing different pictures.
//
// These are drawn to one grid: 24 units square, stroke only, one weight, round ends. That
// is what makes twenty marks look like one family at any size, and it is why they hold up
// at 40px on a wall where a re-coloured emoji does not.
const MARK = paths => `<svg viewBox="0 0 24 24" aria-hidden="true">${
  paths.map(d => `<path d="${d}"/>`).join('')}</svg>`;

const BOX = ['M12 3.2 20.6 7.9v8.2L12 20.8 3.4 16.1V7.9z', 'M3.4 7.9 12 12.6l8.6-4.7M12 12.6v8.2'];
const CALENDAR = ['M4.6 6.6h14.8v12.8H4.6z', 'M4.6 10.4h14.8', 'M8.6 4.2v3.4M15.4 4.2v3.4'];
const TARGET = ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 16.4a4.4 4.4 0 1 0 0-8.8 4.4 4.4 0 0 0 0 8.8z',
                'M12 12.6a.6.6 0 1 0 0-1.2.6.6 0 0 0 0 1.2z'];
const DOLLAR = ['M12 5.6v12.8',
                'M15 9.1c-.7-.9-1.8-1.4-3-1.4-1.8 0-3 .9-3 2.3s1.2 2 3 2.3 3.1.7 3.1 2.3-1.3 2.3-3.1 2.3c-1.3 0-2.4-.5-3.1-1.5'];
const FACTORY = ['M3 20.2h18', 'M4.8 20.2V11l4.8 2.9V11l4.8 2.9V6.2l4.8 2.9v11.1'];
const PERSON = ['M12 11.6a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M5 20.2a7 7 0 0 1 14 0'];
const CLOCK = ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7.4V12l3.2 1.9'];

export const ICONS = {
  // Safety
  injury:     MARK(['M12 3.4 20 6.3v5.9c0 4.3-3.2 7.4-8 8.9-4.8-1.5-8-4.6-8-8.9V6.3z',
                    'M12 8.6v6.4M8.8 11.8h6.4']),
  nearmiss:   MARK(['M12 3.8 21.6 20.4H2.4z', 'M12 10v4.1M12 17.4h.01']),
  // Quality
  shortages:  MARK([...BOX, 'M8.4 14.9 12 16.9l3.6-2']),
  coq:        MARK([...DOLLAR, 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z']),
  coqytd:     MARK([...DOLLAR, 'M20.4 12A8.4 8.4 0 1 1 12 3.6', 'M20.4 3.8v3.9h-3.9']),
  ncr:        MARK(['M9.2 3.6h5.6v2.9H9.2z',
                    'M8.4 5.1H6.6A1.6 1.6 0 0 0 5 6.7v12.1a1.6 1.6 0 0 0 1.6 1.6h10.8a1.6 1.6 0 0 0 1.6-1.6V6.7a1.6 1.6 0 0 0-1.6-1.6h-1.8',
                    'M8.6 11h6.8M8.6 14.4h6.8M8.6 17.8h4']),
  cint:       MARK(FACTORY),
  cext:       MARK(['M4 10.4v3.2A1.6 1.6 0 0 0 5.6 15.2H8l6 4.2V4.6L8 8.8H5.6A1.6 1.6 0 0 0 4 10.4z',
                    'M17.6 9.4a4.2 4.2 0 0 1 0 5.2']),
  // Shipping
  jobs_shipped: MARK(['M2.8 6.6h10.6v9.6H2.8z', 'M13.4 9.8h3.9l3.9 3.9v2.5h-7.8',
                      'M7 19.4a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4zM17.4 19.4a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4z']),
  cartons:    MARK(BOX),
  late:       MARK(CLOCK),
  shorts:     MARK(['M12 3.2 20.6 7.9v8.2L12 20.8 3.4 16.1V7.9z', 'M3.4 7.9 12 12.6l8.6-4.7M12 12.6v8.2',
                    'M8.2 5.6 16.8 10.3']),
  otd:        MARK(TARGET),
  otif:       MARK(TARGET),
  mtd_otd:    MARK([...CALENDAR, 'M8.6 15.2 11 17.4l4.4-4.4']),
  ytd_otd:    MARK([...CALENDAR, 'M8.4 16.6v-2.4M12 16.6v-4.6M15.6 16.6v-3.4']),
  mtd_otif:   MARK([...CALENDAR, 'M8.6 15.2 11 17.4l4.4-4.4']),
  ytd_otif:   MARK([...CALENDAR, 'M8.4 16.6v-2.4M12 16.6v-4.6M15.6 16.6v-3.4']),
  // Financials
  'fin-mtd':  MARK(['M3 6.6h18v10.8H3z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M6.4 9.4h.01M17.6 14.6h.01']),
  'fin-ytd':  MARK(['M3.6 19.4h16.8', 'M6.8 19.4v-5.2M11.2 19.4V9.6M15.6 19.4v-7M20 19.4V5.4']),
  // Maintenance
  'maint-overdue': MARK(['M14.8 6.2a3.6 3.6 0 0 1-4.8 4.8l-5 5 3.2 3.2 5-5a3.6 3.6 0 0 0 4.8-4.8l-2.5 2.5-2.2-2.2z']),
  'maint-open': MARK([...CALENDAR, 'M12 12.9v3.4M10.3 14.6h3.4']),
  'maint-list': MARK(['M8.6 6.4h11M8.6 12h11M8.6 17.6h11', 'M4.8 6.4h.01M4.8 12h.01M4.8 17.6h.01']),
  'maint-note': MARK(['M6.2 3.8h8.2l3.6 3.6v12.8H6.2z', 'M14.4 3.8v3.6H18', 'M9 12.4h6M9 15.8h4']),
  // Labour
  'ot-total': MARK(['M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M12 9.2V13l2.6 1.6',
                    'M9.6 2.6h4.8', 'M12 2.6V5']),
  'ot-depts': MARK(['M9.4 11a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2z', 'M3.4 20a6 6 0 0 1 12 0',
                    'M16.4 11.4a2.8 2.8 0 1 0 0-5.6', 'M17 14.2a5.4 5.4 0 0 1 3.6 5.1']),
  'ot-list':  MARK(FACTORY),
  staffing:   MARK(PERSON),
  // Customer service's two: a clock for how long a confirmation takes, and two stacked
  // sheets for the orders logged against the orders booked.
  'csr-confirm': MARK(['M12 5.6a6.4 6.4 0 100 12.8 6.4 6.4 0 100-12.8', 'M12 8.6v3.6l2.6 1.6']),
  'csr-orders':  MARK(['M5.4 7.4h9.2v9.2H5.4z', 'M9.4 5.4h9.2v9.2',
                       'M7.6 10.6h4.8M7.6 13.4h3.2']),
  // Departments, and the fallback for one a plant invents
  printing:   MARK(['M7 4.2h10v4.4H7z', 'M4.6 8.6h14.8v6.2H4.6z', 'M7 14.8h10v5H7z', 'M16.4 11.2h.01']),
  diecutting: MARK(['M7.4 20.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2zM16.6 20.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z',
                    'M9.2 15.6 18 3.8M14.8 15.6 6 3.8']),
  gluing:     MARK(BOX),
  windowing:  MARK(['M4.4 4.4h15.2v15.2H4.4z', 'M12 4.4v15.2M4.4 12h15.2']),
  stamping:   MARK(['M12 3.6 13.9 9.4 20 9.4 15 13l1.9 5.8L12 15.2 7.1 18.8 9 13 4 9.4h6.1z']),
  flexo:      MARK(['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 15.4a3.4 3.4 0 1 0 0-6.8']),
  shipping:   MARK(['M2.8 6.6h10.6v9.6H2.8z', 'M13.4 9.8h3.9l3.9 3.9v2.5h-7.8',
                    'M7 19.4a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4zM17.4 19.4a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4z']),
  uptime:     MARK(CLOCK),
  mr:         MARK(['M14.8 6.2a3.6 3.6 0 0 1-4.8 4.8l-5 5 3.2 3.2 5-5a3.6 3.6 0 0 0 4.8-4.8l-2.5 2.5-2.2-2.2z']),
  maint:      MARK(['M14.8 6.2a3.6 3.6 0 0 1-4.8 4.8l-5 5 3.2 3.2 5-5a3.6 3.6 0 0 0 4.8-4.8l-2.5 2.5-2.2-2.2z']),
  notes:      MARK(['M6.2 3.8h8.2l3.6 3.6v12.8H6.2z', 'M14.4 3.8v3.6H18', 'M9 12.4h6M9 15.8h4']),
  fin:        MARK(DOLLAR),
  week:       MARK(CALENDAR),
  // Anything a plant adds that has no mark of its own: a machine.
  none:       MARK(['M4.6 8.6h14.8v9.4H4.6z', 'M8.2 8.6V5.4h7.6v3.2', 'M8.6 12.4h6.8M8.6 15.4h4']),
};

// A reading's key is `printing`, or `printing-uptime`, or `printing-mr`. The suffix
// decides the pictogram, so a department added later gets sensible icons on all three of
// its cards without anyone editing this map.
export const iconFor = (key, chosen) => {
  const name = String(key || '');
  if (name.endsWith('-uptime')) return ICONS.uptime;
  if (name.endsWith('-mr')) return ICONS.mr;
  // A plant's own pick only counts where the set has no mark of its own. A department it
  // invented gets whatever it chose; printing gets the printing mark, so the row reads as
  // one set rather than as four cards and a sticker.
  return ICONS[name] || chosen || ICONS.none;
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
// Every card the dashboard can draw, and which section it belongs to.
//
// A plant that does not raise NCRs should not carry a card that reads a permanent dash —
// that teaches the room a blank is normal. That was three switches on the `locations` row
// for the three quality cards nobody could agree were universal; every other card was
// hard-wired on. The list is the switch now, and it is here rather than in the dashboard
// because Configure has to draw the same names without importing the page that renders
// them.
// The sections a morning is made of, in the order it is walked, with what each is called.
//
// Both pages need this and neither owned it: the dashboard kept the order and the titles, and
// Configure needed the same pair to offer "which of these goes on a screen". A second copy in
// Configure would be a list that drifts the first time a section is added, and the symptom
// would be a tick that governs nothing.
// The third entry is what the card catalogue below calls the same section, where the two
// differ — the walk says "Upcoming maintenance" over a screen and the catalogue heads a list
// of cards "Maintenance". One list still, rather than a lookup table in Configure that would
// be wrong the first time either name changed.
export const WALK = [
  ['safety',      'Safety'],
  ['quality',     'Quality'],
  // Customer service — with the die shop, prepress and supply chain alongside it: a section,
  // because it is a place somebody comes to rather than a card somebody scrolls past.
  //
  // It was one card at the foot of Production's grid, and the argument for promoting it is
  // the argument that promoted the board. A CSR opening Metriq has exactly one thing to
  // do on it and had to walk through four departments and their last twenty-four hours to
  // reach it, on a screen that is not theirs and mostly not about them. A section is a door
  // with their name on it: it appears in the rail, it has its own screen, and Enter's
  // sub-rail and the wall walk pick it up from the same list as everything else instead of
  // naming it as an exception in three places.
  //
  // Named for customer service rather than for the counter they all stand behind. "Front of
  // house" was the building's phrase for the four of them together, and it read as a place
  // rather than as a subject — a room the meeting walked past on the way to Production.
  // The readings on it are customer service's readings, the people who open it are CSRs,
  // and the plant asks about it by that name.
  //
  // Before Production, not after. It sits with Quality because that is the order the
  // morning actually runs in: what the customer asked for, then how well it was made, then
  // what the floor made. Reading the plant's output before reading the orders it came from
  // put the answer ahead of the question.
  ['support',     'Pre-production'],
  ['production',  'Production'],
  // Last week is Production's, not a section of its own.
  //
  // It was in the rail because it is a different question from the last twenty-four hours,
  // and it sat under its own heading on Mondays and vanished on every other day. But
  // Production's grid has drawn the week card down its right-hand side all along, so the
  // rail entry opened a screen showing a card the reader had already scrolled past. One
  // heading, one card, and a section that no longer appears and disappears by weekday.
  ['shipping',    'Shipping'],
  ['financials',  'Financials'],
  ['maintenance', 'Upcoming maintenance', 'Maintenance'],
  ['labour',      'Labour & Overtime',    'Labour'],
  // Last, and a section rather than a card on one.
  //
  // It began as a card in Labour's grid and every screen it had to appear on wanted it
  // special-cased: pulled out of Labour's slide so it could have its own, named in the fill
  // tabs because `order()` did not know it, missing from the rail because the rail is built
  // from `order()`. Three exceptions for one card is the product telling you what it is. It
  // is a section with one card in it, and every one of those exceptions goes away.
  ['attention',   'Watch list'],
];
export const walkKeyFor = section =>
  (WALK.find(([, name, catalogue]) => (catalogue || name) === section) || [])[0] || '';

export const CARD_CATALOGUE = [
  { section: 'Safety',      key: 'injury',        name: 'Days since last injury' },
  { section: 'Safety',      key: 'nearmiss',      name: 'Days since near-miss' },
  { section: 'Quality',     key: 'shortages',     name: 'Shortage count' },
  // Named "last closed month" rather than after a month, because this list is a catalogue of
  // cards and the month on the card changes as the year runs.
  { section: 'Quality',     key: 'coq',           name: 'COQ \u2014 last closed month' },
  { section: 'Quality',     key: 'coqytd',        name: 'COQ \u2014 year to date' },
  { section: 'Quality',     key: 'ncr',           name: 'NCRs received' },
  { section: 'Quality',     key: 'cint',          name: 'Internal complaints' },
  { section: 'Quality',     key: 'cext',          name: 'Customer complaints' },
  // The rest of Production is the plant's own departments, set on the Departments screen.
  // These two are not departments, so they are the production cards that live here.
  { section: 'Production',  key: 'pw-week',       name: "Last week's productivity" },
  { section: 'Pre-production', key: 'csr-confirm', name: 'Order confirmation' },
  { section: 'Pre-production', key: 'csr-orders',  name: 'Orders booked vs logged in GT' },
  { section: 'Pre-production', key: 'support',    name: 'Pre-production notes' },
  // One card, one section. A plant that reviews its week off a spreadsheet on Monday can
  // untick it here and the section goes with it, the same as any other.
  { section: 'Production',  key: 'week',          name: 'Last week by department' },
  { section: 'Shipping',    key: 'jobs_shipped',  name: 'Jobs shipped' },
  { section: 'Shipping',    key: 'cartons',       name: 'Cartons' },
  { section: 'Shipping',    key: 'late',          name: 'Late' },
  { section: 'Shipping',    key: 'shorts',        name: 'Shorts' },
  { section: 'Shipping',    key: 'otd',           name: 'OTD' },
  { section: 'Shipping',    key: 'otif',          name: 'OTIF' },
  // On time, and on time in full. OTIF fails a job that shipped on the day three cartons
  // short, so a plant can hit every truck in the month and still read ninety-two — which is
  // an argument the room has been having with one of the two numbers missing from it.
  { section: 'Shipping',    key: 'mtd_otd',       name: 'MTD OTD' },
  { section: 'Shipping',    key: 'ytd_otd',       name: 'YTD OTD' },
  { section: 'Shipping',    key: 'mtd_otif',      name: 'MTD OTIF' },
  { section: 'Shipping',    key: 'ytd_otif',      name: 'YTD OTIF' },
  { section: 'Financials',  key: 'fin-mtd',       name: 'Month to date' },
  { section: 'Financials',  key: 'fin-ytd',       name: 'Year to date' },
  // Off unless a plant asks for them. All three answer a question the morning meeting does
  // not ask — what happened to today's schedule — and the one it does ask is what is coming.
  { section: 'Maintenance', key: 'maint-overdue', name: 'Overdue items', off: true },
  { section: 'Maintenance', key: 'maint-open',    name: 'Open work', off: true },
  { section: 'Maintenance', key: 'maint-list',    name: "Today's schedule", off: true },
  { section: 'Maintenance', key: 'maint-upcoming', name: 'Upcoming maintenance' },
  { section: 'Maintenance', key: 'maint-note',    name: 'Maintenance notes' },
  // Off by default. "Which departments, how many shifts, which machines" is the whole
  // question, and it is one card; a count of shifts and a count of machines beside it are
  // the same answer twice more.
  { section: 'Labour',      key: 'ot-total',      name: 'Overtime shifts', off: true },
  { section: 'Labour',      key: 'ot-depts',      name: 'Machines on OT', off: true },
  { section: 'Labour',      key: 'ot-list',       name: 'Overtime by department' },
  { section: 'Labour',      key: 'staffing',      name: 'Staffing notes' },
  // Not a reading. Everything on it is already on another card; what it adds is the order
  // they have to be dealt with in, which is the one thing the room writes down.
  // The one card on the product that faces forwards, and the only one the whole building
  // writes on. It belongs in this list for the same reason the others do: a plant that runs
  // its morning without it should be able to say so once.
  { section: 'Watch list', key: 'attention',  name: 'Watch list' },
];

// A card is turned off in one place rather than at each of its call sites, because a card
// that is switched off has to leave nothing behind — not an empty grid cell, not a gap in a
// row of four. Returning nothing from the one function that builds them does exactly that,
// and the arrangement is worked out afterwards from what is left.
let hidden = new Set();
// A plant that has never opened Configure gets the catalogue's own defaults, and one that
// has gets exactly what it chose. Without the distinction a card marked off by default
// could never be turned on: the plant's list says which cards are off, and "not in the
// list" would keep meaning "off" for those three for ever.
export const DEFAULT_OFF = CARD_CATALOGUE.filter(c => c.off).map(c => c.key);
export const hideCards = keys => { hidden = new Set(keys ?? DEFAULT_OFF); };
// The same question, asked from outside.
//
// A card that is off is off everywhere, and the entry screen is a place it was still on:
// Shipping's cards showed four percentages and Shipping's entry screen asked for six,
// because the two rollups the plant had switched off still had a row apiece. A figure with
// nowhere to be shown is a figure nobody should be asked to key.
export const cardOn = key => !hidden.has(key);

// How wide the number is about to be, in characters, so the card can cap its own type.
//
// The hero was sized purely as a share of the card — 31.5% of its width — which is right
// for "262" and wrong for "$1.42M": six glyphs at that size are wider than the card, and
// the money ran under its own border and into the card beside it. Character count is the
// missing half of the sum. The unit rides at .3em, so it counts for about a third.
const heroChars = (value, unit) => (String(value ?? '').length
  + (unit ? String(unit).length * 0.35 : 0)).toFixed(2);

// A card whose reading is a list rather than a number.
//
// Maintenance's schedule and Labour's department breakdown lived in tables, and a table
// does not reach the wall — it is a thing you lean in for, so those two sections went up
// with two cards on them and half a screen of nothing. They are readings like any other:
// which departments, and what state each one is in. Same bar, same body, same grid, so a
// screen of them is still a screen of cards.
export function listCard({ pkey, icon, label, tone, rows, empty = 'Nothing to report.',
                           cap = 8, edit, wide = false }) {
  if (hidden.has(pkey)) return '';
  const shown = (rows || []).slice(0, cap);
  const over = (rows || []).length - shown.length;
  return `<div class="card card--${tone || ''}${wide ? ' card--wide' : ''}" data-pkey="${esc(pkey)}">
    <div class="card__head">
      <span class="card__ico" aria-hidden="true">${icon || iconFor(pkey)}</span>
      <span class="card__label">${esc(label)}</span>
      ${verdictMark(tone)}
    </div>
    <div class="card__body">
      <div class="card__mid">${shown.length
        // A row is a name, optionally a quieter line under it, and a value. The second line
      // is what stops "Gluing" being cut to "Gl\u2026" so that "3 shifts \u00b7 Heidelberg, Omega"
      // can have the width: the two facts are not competing for one line any more.
      ? `<ul class="clist">${shown.map(([left, right, kind, sub]) =>
            `<li class="clist__row"><span class="clist__l"><b>${esc(left)}</b>${
               sub ? `<i>${esc(sub)}</i>` : ''}</span>
             <span class="clist__r${kind ? ` tone--${kind}` : ''}">${right ?? ''}</span></li>`).join('')}
           ${over > 0 ? `<li class="clist__more">and ${over} more</li>` : ''}</ul>`
        : `<p class="clist__none">${esc(empty)}</p>`}</div>
      ${edit ? `<div class="ez">${edit}</div>` : ''}
    </div>
  </div>`;
}

// A card whose reading is a sentence somebody wrote.
//
// `html` is for the one case the plain paragraph cannot serve: a note that is a list. The
// last twenty-four hours are entered a line at a time and read back as bullets, and that is
// the only reading on the product whose body is markup rather than a string — everything
// else that takes markup takes it as a whole card.
export function noteCard({ pkey, icon, label, text, html, tone = '', blank,
                           prompt = 'Nothing entered.', edit, wide = false, tall = false }) {
  if (hidden.has(pkey)) return '';
  // A note nobody wrote says so on the page, where the prompt is an invitation to write one,
  // and says nothing at all on a wall. Four cards reading "No issues reported" on a screen
  // the floor walks past is four cards of nothing where four readings could have been, so
  // the wall drops them — and it can only do that if the card admits it is empty.
  // `blank` is "there is nothing here worth a slot on a wall", which is not always the same
  // as "there is no text". A department that has answered and had no issues is blank; a
  // department nobody has asked yet has an answer outstanding, and the meeting wants to see
  // that even though the card carries no sentence.
  const nothing = blank ?? !(text || html);
  // A card two columns wide. Sentences need width in a way readings do not — the height is
  // still one card's, because a row of cards that share a top and a bottom is the whole of
  // why the page reads as one thing.
  return `<div class="card card--${tone}${wide ? ' card--wide' : ''}${
    tall ? ' card--tall' : ''}" data-pkey="${esc(pkey)}"${
    nothing ? ' data-empty="1"' : ''}>
    <div class="card__head">
      <span class="card__ico" aria-hidden="true">${icon || iconFor(pkey)}</span>
      <span class="card__label">${esc(label)}</span>
      ${verdictMark(tone)}
    </div>
    <div class="card__body">
      <div class="card__mid">${html || `<p class="cnote${text ? '' : ' cnote--none'}">${
        esc(text || prompt)}</p>`}</div>
      ${edit ? `<div class="ez">${edit}</div>` : ''}
    </div>
  </div>`;
}

// A card that is two readings rather than one.
//
// Everything else on this product answers one question with one figure, and that is the right
// shape for nearly all of it: a card with two numbers on it makes the reader choose which one
// the card is about. Two of customer service's readings are not like that. "Month to date 2.8
// days, year to date 2.9" is one fact about one thing said over two windows, and "42 logged,
// 38 booked" is one fact whose whole meaning is the gap between the halves — split across two
// cards, the reader has to hold the first while finding the second, which is precisely the
// arithmetic the card exists to do for them.
//
// So: one bar, one verdict, one foot, and the body divided down the middle. Each half carries
// its own caption above its figure, because without them a pair of numbers side by side is a
// riddle. `each` is `[caption, value, unit]`.
//
// The figures are sized off the longer of the two rather than each off itself. Two readings
// at two sizes on one card reads as a big number and a footnote, which is the opposite of
// what a pair is for — they are equals or they are not a pair.
export function pairCard({ pkey, icon, label, tone, each, foot, edit, wide = false, stack = false }) {
  if (hidden.has(pkey)) return '';
  const shown = (each || []).filter(Boolean);
  const chars = Math.max(1, ...shown.map(([, value]) => String(value ?? '').length));
  return `<div class="card card--${tone || ''}${wide ? ' card--wide' : ''}"
    data-pkey="${esc(pkey)}">
    <div class="card__head">
      <span class="card__ico" aria-hidden="true">${icon || iconFor(pkey)}</span>
      <span class="card__label">${esc(label)}</span>
      ${verdictMark(tone)}
    </div>
    <div class="card__body">
      <div class="card__mid">
        <div class="duo${stack ? ' duo--stack' : ''}" style="--dchars:${chars}">${shown.map(([caption, value, unit, sub]) =>
          `<div class="duo__c">
             <span class="duo__l">${esc(caption)}</span>
             <b class="duo__v">${esc(String(value ?? '\u2014'))}${
               unit ? `<small class="duo__u">${esc(unit)}</small>` : ''}</b>${
             sub ? `<span class="duo__s">${esc(sub)}</span>` : ''}
           </div>`).join('')}</div>
      </div>
      ${foot || ''}
      ${edit ? `<div class="ez">${edit}</div>` : ''}
    </div>
  </div>`;
}

export function metricCard({ chart, pkey, icon, label, tone, value, unit, percent, markPercent,
                             markLabel, sub, subTone, flag, foot, edit, medium, track, heroEdit,
                             total, wide = false }) {
  const hero = showsHeroNumber(chart);
  const drawn = drawReading(chart, { percent, markPercent, markLabel, value, unit });
  // `subTone` colours the caption under the figure and is how the money says its pace: an
  // arrow and a percentage, red under and green over, rather than a sentence. It is the one
  // caption on the product that is a reading in its own right, so it is the one that gets a
  // colour; everything else under a figure is a unit or an explanation and stays quiet.
  const caption = hero
    ? (sub ? `<div class="unit${subTone ? ` unit--pace tone--${subTone}` : ''}">${
        esc(sub)}</div>` : '')
    : ((unit && !ridesInside(unit)) || sub
        ? `<div class="unit unit--under">${esc([unit && !ridesInside(unit) ? unit : '', sub]
            .filter(Boolean).join(' · '))}</div>`
        : '');
  // The title rides in a bar across the top of the card rather than floating above the
  // number. Three things fall out of that and all three were asked for: every title on the
  // page sits at the same height, because the bar is the first thing in every card; every
  // title is the same size, because the bar is the same height; and a card stops being a
  // column of text, because the heaviest line on it is now a shape. The pictogram sits in a
  // white disc on the bar, which is what lets it stay the plant's own colourful icon
  // instead of being flattened to a white glyph.
  if (hidden.has(pkey)) return '';
  // A second figure under the first, explaining it. Only production asks for one so far —
  // the total the rate was made out of — and it takes an editable field like any other
  // reading rather than being a caption the morning cannot correct.
  const totalLine = !total?.text ? '' : `<div class="total${total.edit ? ' view-only' : ''}"
      >${esc(total.text)}</div>${total.edit
    ? `<input class="inp inp--total edit-only" aria-label="${esc(total.label || 'Total')}"
        data-field="${esc(total.edit.field)}" ${total.edit.attrs || ''}>` : ''}`;
  return `<div class="card card--${tone}${wide ? ' card--wide' : ''}" data-pkey="${esc(pkey)}">
    <div class="card__head">
      <span class="card__ico" aria-hidden="true">${icon || iconFor(pkey)}</span>
      <span class="card__label">${esc(label)}</span>
      ${sourceMark(heroEdit?.field || total?.edit?.field)}${verdictMark(tone)}
    </div>
    <div class="card__body">
      <div class="card__flag">${flag || ''}</div>
      <div class="card__mid">
        ${hero ? `<div class="hero${medium ? ' hero--md' : ''}${
            heroEdit ? ' view-only' : ''}" style="--hchars:${
          heroChars(value, unit)}">${esc(value)}${
          unit ? `<i>${esc(unit)}</i>` : ''}</div>${
          heroEdit ? `<input class="inp inp--hero edit-only" aria-label="${esc(label)}"
            data-field="${esc(heroEdit.field)}" ${heroEdit.attrs || ''}>` : ''}${caption}${
          totalLine}${drawn}` : `${drawn}${caption}${totalLine}`}
        ${track || ''}
      </div>
      ${foot || '<div class="foot foot--0"></div>'}
      ${edit ? `<div class="ez">${edit}</div>` : ''}
    </div>
  </div>`;
}
