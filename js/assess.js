// What the morning amounts to.
//
// One pass over the loaded day produces one list of readings, each already judged, each
// already knowing its owner, its target and its seven days. The three views then differ
// only in what they *do* with that list:
//
//   The Line  shows the ones that are not ok, and counts the rest.
//   The Board shows all of them, grouped by who answers for them.
//   The Wall  shows them a few at a time, very large.
//
// None of the three may judge anything itself. A reading that is amber on the Board and
// green on the Wall would destroy trust in both, and the only way to guarantee that
// cannot happen is for the verdict to be reached once, here, before any view sees it.

import { band, daysBetween, num, money, readingOf, rateLabel, MONTHS,
         otifTarget, otdTarget, isNa } from './readings.js?v=39112490925c';

// ── What a complete morning contains ────────────────────────────────────────────
//
// This list is the difference between "everything is on target" being a statement and being
// a lie. Until now a reading that was absent was simply not assessed: a morning with nine of
// twenty readings entered produced nine findings, every one of them within target, and Today
// printed "Everything is on target · All 9 readings within target this morning". Eleven
// readings nobody had entered were not wrong, they were not there — and not being there is
// exactly the thing the room needed to be told before the meeting started.
//
// So absence is a reading now. It has a title, a section and an owner like every other one,
// it appears in the count at the top of the summary, and it stops the sentence being
// printed. What it does not have is a tone: a missing number is not amber, because amber
// means somebody looked and it was short.
//
// Departments and the last twenty-four hours are not in the table because they are not
// fixed — they come from the plant's own configuration and are added below.
const REQUIRED = [
  { key: 'injury',    section: 'safety',     area: 'Safety',    owner: 'JR',
    title: 'Days since last injury', field: 'injury_last' },
  { key: 'nearmiss',  section: 'safety',     area: 'Safety',    owner: 'JR',
    title: 'Days since near-miss',   field: 'near_miss_last' },
  { key: 'shortages', section: 'quality',    area: 'Quality',   owner: 'QA',
    title: 'Jobs short today',       field: 'shortages' },
  { key: 'coq',       section: 'quality',    area: 'Quality',   owner: 'QA',
    title: 'Cost of quality',        field: 'coq' },
  { key: 'jobs',      section: 'shipping',   area: 'Shipping',  owner: 'CS',
    title: 'Jobs shipped',           field: 'jobs_shipped' },
  { key: 'cartons',   section: 'shipping',   area: 'Shipping',  owner: 'CS',
    title: 'Cartons',                field: 'cartons' },
  { key: 'late',      section: 'shipping',   area: 'Shipping',  owner: 'CS',
    title: 'Late shipments',         field: 'late' },
  { key: 'shorts',    section: 'shipping',   area: 'Shipping',  owner: 'CS',
    title: 'Short shipments',        field: 'shorts' },
  { key: 'fin',       section: 'financials', area: 'Financial', owner: 'FN',
    title: 'Sales month to date',    field: 'fin_actual_mtd' },
];

// One shape for a reading nobody has entered, wherever the absence was noticed.
const notEntered = ({ key, section, area, owner, title, field, say }) => ({
  key, section, area, owner, title, field,
  state: 'missing', tone: '', value: '—', quiet: false,
  say: say || 'has not been entered yet',
  note: null,
});

// The meeting runs two to three minutes, so a reading earns its place by being either
// off target or genuinely load-bearing. Everything else is a tick in a strip.
//
// `section` and `say` are carried by every reading for the benefit of the section
// verdicts below. `section` is where the reading is drawn; `say` is the clause that names
// what is wrong with it, written here beside the number rather than in the view, because
// this is the only place that knows a shortfall is measured in sheets and a streak in
// days.
export function assess({ date, metrics, departments, review, maintenance, labour, config, budgets, history }) {
  const out = [];
  const m = field => readingOf(metrics, field);
  const has = value => value !== null && value !== undefined && value !== '';

  const seriesFor = (key, field = null) => (history?.departments || [])
    .filter(r => r.dept_key === key && (field ? has(r[field]) : Number(r.hours)))
    .map(r => field ? Number(r[field]) : Number(r.qty) / Number(r.hours));
  // A day with nought jobs shipped has no OTIF; it is left out of the line rather than
  // drawn as a nought that never happened.
  const metricSeries = field => (history?.metrics || [])
    .map(r => readingOf(r, field))
    .filter(v => v !== null && v !== undefined && v !== '' && !isNa(v)).map(Number);
  // How long the streak stood on each of the mornings behind this one. A counter that only
  // goes up draws a staircase, and the step down is the day something happened.
  const streakSeries = field => (history?.metrics || [])
    .filter(r => r[field]).map(r => daysBetween(r[field], r.metric_date));

  // ── Safety ──
  if (has(m('injury_last'))) {
    const days = daysBetween(m('injury_last'), date), record = Number(m('injury_record') || 0);
    out.push({ key:'injury', section:'safety', area:'Safety', owner:'JR',
      title:'Days since last injury',
      tone: band.streak(days), value: days, unit:'days',
      // Only an incident today belongs in the exception list. Every other day the
      // counter is context the room wants to see, not a problem it has to solve.
      quiet: days !== 0,
      target: record, targetLabel: record ? `record ${record}` : null,
      percent: record ? days / record * 100 : 0, series: streakSeries('injury_last'),
      say: 'an injury was recorded today',
      note: days === 0 ? 'Injury recorded today.'
          : record && days >= record ? `Record broken by ${days - record} days.` : null });
  }
  if (has(m('near_miss_last'))) {
    const days = daysBetween(m('near_miss_last'), date), record = Number(m('near_miss_record') || 0);
    out.push({ key:'nearmiss', section:'safety', area:'Safety', owner:'JR',
      title:'Days since near-miss',
      tone: band.streak(days), value: days, unit:'days', quiet: days !== 0,
      target: record, targetLabel: record ? `record ${record}` : null,
      percent: record ? days / record * 100 : 0, series: streakSeries('near_miss_last'),
      say: 'a near-miss was recorded today',
      note: days === 0 ? 'Near-miss recorded today.'
          : record && days >= record ? `Record broken by ${days - record} days.` : null });
  }
  if (has(m('shortages'))) {
    const count = Number(m('shortages'));
    out.push({ key:'shortages', section:'quality', area:'Quality', owner:'QA', title:'Shortages',
      tone: band.shortage(count), value: count, unit: count === 1 ? 'job short' : 'jobs short',
      target: 0, targetLabel:'target 0', percent: count ? 100 : 0,
      series: metricSeries('shortages'),
      say: count === 1 ? 'one job is short' : `${count} jobs are short` });
  }
  if (has(m('coq'))) {
    const value = Number(m('coq')), target = Number(m('coq_target') || 0.85);
    out.push({ key:'coq', section:'quality', area:'Quality', owner:'QA', title:'Cost of quality',
      tone: band.coq(value, target), value: value.toFixed(2), unit:'%',
      target, targetLabel:`target ≤ ${target}%`, lowerIsBetter: true,
      percent: value / (target * 1.6) * 100, series: metricSeries('coq'),
      say: `cost of quality is ${value.toFixed(2)}% against a target of ${target}%`,
      note: `Year to date ${has(m('coq_ytd')) ? Number(m('coq_ytd')).toFixed(2) + '%' : 'not entered'}.` });
  }

  // ── Production ──
  for (const c of (config || []).filter(x => x.on_metrics)) {
    const row = (departments || []).find(d => d.dept_key === c.key) || {};
    if (!Number(row.hours) || !Number(row.qty)) continue;
    const rate = Number(row.qty) / Number(row.hours);
    const target = Number(row.target ?? c.target);
    const previous = Number(row.pw_hours) ? Number(row.pw_qty) / Number(row.pw_hours) : 0;
    const said = (review || []).find(r => r.dept_key === c.key);
    out.push({ key:c.key, section:'production', area:c.name, owner:'ML', title:c.name,
      tone: band.rate(rate, target) || '', value: num(Math.round(rate)), unit: rateLabel(c),
      target, targetLabel:`target ${num(target)}`, percent: target ? rate / (target * 1.25) * 100 : 0,
      series: seriesFor(c.key), raw: rate, previous, department: true,
      shortfall: rate < target ? Math.round((target - rate) * Number(row.hours)) : 0,
      unitWord: c.unit,
      say: `${c.name} is running ${num(Math.round(Math.abs(target - rate)))} ${rateLabel(c)} under target`,
      note: said?.note || null });

    // Uptime and make-ready ride with the department they belong to, so a press running
    // at rate but losing an hour a shift to setup still shows up.
    // The target the morning was opened with, not the one Configure holds today.
    const upT = row.uptime_target ?? c.uptime_target;
    const mrT = row.mr_target ?? c.mr_target;
    if (row.uptime != null && upT) {
      const up = Number(row.uptime) * 100, target = Number(upT) * 100;
      out.push({ key:`${c.key}-uptime`, section:'production', area:c.name, owner:'ML',
        title:`${c.name} uptime`,
        tone: band.rate(up, target), value: up.toFixed(1), unit:'%',
        target, targetLabel:`target ${target.toFixed(0)}%`, floor: 50, ceiling: 100, percent: up,
        series: seriesFor(c.key, 'uptime').map(v => v * 100),
        say: `${c.name} ran ${up.toFixed(1)}% of its crewed hours against ${target.toFixed(0)}%` });
    }
    if (row.make_ready != null && mrT) {
      const mr = Number(row.make_ready), target = Number(mrT);
      out.push({ key:`${c.key}-mr`, section:'production', area:c.name, owner:'ML',
        title:`${c.name} make-ready`,
        tone: band.lower(mr, target), value: mr.toFixed(2), unit:'hrs',
        target, targetLabel:`target ${target.toFixed(2)} hrs`, lowerIsBetter: true,
        percent: target ? mr / (target * 2) * 100 : 0,
        series: seriesFor(c.key, 'make_ready'),
        say: `${c.name} make-ready averaged ${mr.toFixed(2)} hours against ${target.toFixed(2)}`,
        note: row.mr_count ? `${row.mr_count} make-${row.mr_count === 1 ? 'ready' : 'readies'}.` : null });
    }
  }

  // ── Shipping ──
  if (has(m('late'))) {
    const late = Number(m('late'));
    const said = (review || []).find(r => r.dept_key === 'shipping');
    out.push({ key:'late', section:'shipping', area:'Shipping', owner:'CS',
      title:'Late shipments',
      tone: band.count(late), value: late, unit: late === 1 ? 'late shipment' : 'late shipments',
      target: 0, targetLabel:'target 0', percent: late ? 100 : 0,
      series: metricSeries('late'),
      say: `${late} shipment${late === 1 ? '' : 's'} went late`,
      note: said?.note || null });
  }
  if (has(m('shorts'))) {
    const short = Number(m('shorts'));
    out.push({ key:'shorts', section:'shipping', area:'Shipping', owner:'CS',
      title:'Short shipments',
      tone: band.count(short), value: short,
      unit: short === 1 ? 'short shipment' : 'short shipments',
      target: 0, targetLabel:'target 0', percent: short ? 100 : 0,
      series: metricSeries('shorts'),
      say: `${short} shipment${short === 1 ? '' : 's'} went short` });
  }
  // Both targets come off the morning rather than out of the browser — see `otifTarget`.
  // A day with nought jobs shipped has no OTD and no OTIF to judge; it is not nought per
  // cent and it is not a blank, it is arithmetic with no denominator, and it says so.
  const otdT = otdTarget(metrics), otifT = otifTarget(metrics);
  const shipped = m('otd');
  if (isNa(shipped)) {
    out.push({ key:'otd', section:'shipping', area:'Shipping', owner:'CS', title:'OTD today',
      state:'na', tone:'', value:'N/A', unit:'', quiet: true,
      targetLabel:'no jobs shipped', say: null });
  } else if (has(shipped)) {
    const value = Number(shipped);
    out.push({ key:'otd', section:'shipping', area:'Shipping', owner:'CS', title:'OTD today',
      tone: band.pct(value, otdT), value: value.toFixed(2), unit:'%',
      target: otdT, targetLabel:`target \u2265 ${otdT}%`,
      floor: 90, ceiling: 100, percent: value, series: metricSeries('otd'),
      say: `on-time delivery is ${value.toFixed(2)}% against ${otdT}%` });
  }
  const full = m('otif');
  if (isNa(full)) {
    out.push({ key:'otif', section:'shipping', area:'Shipping', owner:'CS', title:'OTIF today',
      state:'na', tone:'', value:'N/A', unit:'', quiet: true,
      targetLabel:'no jobs shipped', say: null });
  } else if (has(full)) {
    const value = Number(full);
    out.push({ key:'otif', section:'shipping', area:'Shipping', owner:'CS', title:'OTIF today',
      tone: band.pct(value, otifT), value: value.toFixed(2), unit:'%',
      target: otifT, targetLabel:`target \u2265 ${otifT}%`,
      floor: 90, ceiling: 100, percent: value, series: metricSeries('otif'),
      say: `OTIF is ${value.toFixed(2)}% against ${otifT}%`,
      note: has(m('mtd_otif')) ? `Month to date ${Number(m('mtd_otif')).toFixed(2)}%.` : null });
  }
  if (has(m('jobs_shipped'))) {
    out.push({ key:'jobs', section:'shipping', area:'Shipping', owner:'CS', title:'Jobs shipped',
      tone:'ok', value: num(m('jobs_shipped')), unit:'jobs', quiet: true,
      series: metricSeries('jobs_shipped'),
      targetLabel: has(m('jobs_on_time')) ? `${m('jobs_on_time')} on time` : null });
  }

  // ── Maintenance ──
  const overdue = (maintenance || []).filter(x => x.status === 'Overdue');
  if ((maintenance || []).length) {
    const open = maintenance.filter(x => x.status !== 'Complete').length;
    out.push({ key:'maint', section:'maintenance', area:'Maintenance', owner:'MT',
      title:'Maintenance',
      tone: overdue.length ? 'stop' : 'ok',
      value: overdue.length || open, unit: overdue.length ? 'overdue' : 'open',
      targetLabel: `${open} open`, percent: overdue.length ? 100 : 0,
      say: overdue.length
        ? `${overdue.map(x => x.dept || x.item_type).join(', ')} ${overdue.length === 1 ? 'is' : 'are'} overdue`
        : null,
      note: overdue.length
        ? `${overdue.map(x => x.dept || x.item_type).join(', ')} overdue.`
        : null });
  }

  // ── Labour ──
  //
  // Overtime is amber the moment there is any of it. That is not a judgement that overtime
  // is a failure — a plant that has to run Saturday to hold a delivery is doing the right
  // thing — it is that the room has agreed to spend money and the meeting should say so
  // out loud rather than let it pass in a table.
  if ((labour || []).some(r => r.ot_shifts != null)) {
    const running = (labour || []).filter(r => Number(r.ot_shifts) > 0);
    const total = (labour || []).reduce((sum, r) => sum + Number(r.ot_shifts || 0), 0);
    const named = running.map(r => (config || []).find(c => c.key === r.dept_key)?.name || r.dept_key);
    out.push({ key:'overtime', section:'labour', area:'Labour', owner:'HR',
      title:'Overtime shifts',
      tone: total > 0 ? 'warn' : 'ok', value: total, quiet: total === 0,
      unit: total === 1 ? 'shift' : 'shifts',
      targetLabel: running.length ? named.join(', ') : 'none today',
      say: `${total} overtime ${total === 1 ? 'shift is' : 'shifts are'} running in ${
        named.length < 2 ? (named[0] || 'no department')
          : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`}` });
  }

  // ── Financial ──
  if (has(m('fin_actual_mtd')) && (budgets || []).length) {
    // Billing is reviewed the next morning, so this reports through the day before.
    const report = new Date(`${date}T00:00:00`);
    report.setDate(report.getDate() - 1);
    const month = report.getMonth();
    const inMonth = new Date(report.getFullYear(), month + 1, 0).getDate();
    const budget = Number(budgets.find(b => b.month === month + 1)?.amount || 0);
    const plan = budget * (Math.max(1, report.getDate()) / inMonth);
    const actual = Number(m('fin_actual_mtd'));
    const variance = actual - plan, percent = plan ? variance / plan * 100 : 0;
    out.push({ key:'fin', section:'financials', area:'Financial', owner:'FN',
      title:'Sales month to date',
      tone: band.money(percent), value: money(actual), unit:'MTD',
      target: plan, targetLabel:`plan ${money(plan)}`,
      percent: plan ? actual / (plan * 1.3) * 100 : 0,
      series: metricSeries('fin_actual_mtd'),
      say: `sales are ${money(Math.abs(variance))} behind plan for ${MONTHS[month]}`,
      delta: `${variance >= 0 ? '▲' : '▼'} ${money(Math.abs(variance))} (${Math.abs(percent).toFixed(1)}%)`,
      deltaTone: band.money(percent) });

    // The year to date is a reading in its own right, and leaving it out was a real
    // disagreement rather than an omission: the financials card is washed by the worse of
    // the two, so a month running ahead of plan inside a year running behind it printed a
    // red card over a section reporting everything on target. A section may summarise a
    // reading or omit a card, but it may never summarise a card it cannot see.
    if (has(m('fin_actual_ytd'))) {
      const planYtd = Array.from({ length: month }, (_, i) =>
        Number(budgets.find(b => b.month === i + 1)?.amount || 0)).reduce((a, b) => a + b, 0) + plan;
      const actualYtd = Number(m('fin_actual_ytd'));
      const varianceYtd = actualYtd - planYtd;
      const percentYtd = planYtd ? varianceYtd / planYtd * 100 : 0;
      out.push({ key:'fin-ytd', section:'financials', area:'Financial', owner:'FN',
        title:'Sales year to date',
        tone: band.money(percentYtd), value: money(actualYtd), unit:'YTD',
        target: planYtd, targetLabel:`plan ${money(planYtd)}`,
        percent: planYtd ? actualYtd / (planYtd * 1.3) * 100 : 0,
        say: `the year is ${money(Math.abs(varianceYtd))} behind plan`,
        delta: `${varianceYtd >= 0 ? '▲' : '▼'} ${money(Math.abs(varianceYtd))} (${Math.abs(percentYtd).toFixed(1)}%)`,
        deltaTone: band.money(percentYtd) });
    }
  }

  // ── What is not here ──
  //
  // Run last, so it can see what the passes above produced rather than repeating their
  // conditions. A reading that made it into the list is present by definition.
  const drawn = new Set(out.map(r => r.key));
  for (const want of REQUIRED) {
    if (drawn.has(want.key) || has(m(want.field))) continue;
    out.push(notEntered(want));
  }
  for (const c of (config || []).filter(x => x.on_metrics)) {
    if (drawn.has(c.key)) continue;
    out.push(notEntered({ key: c.key, section: 'production', area: c.name, owner: 'ML',
      title: c.name, field: `dept:${c.key}:qty`,
      say: 'has no output or hours entered yet' }));
  }
  // A department that has not answered has not said it is fine. `daily_review.status` used
  // to default to 'ok', so every department reported "No issues reported" the moment the
  // morning was opened — twenty people reading a statement nobody had made. Unanswered is
  // null now, and null is a missing reading like any other.
  for (const c of (config || []).filter(x => x.on_review !== false)) {
    const said = (review || []).find(r => r.dept_key === c.key);
    if (said?.status) continue;
    out.push(notEntered({ key: `rev-${c.key}`, section: 'production', area: c.name, owner: 'ML',
      title: `${c.name} — last 24 hours`, field: `review:${c.key}:status`,
      say: 'has not confirmed the last twenty-four hours' }));
  }

  return out;
}

// What the room has to deal with, and what it can simply confirm. `quiet` readings are
// context rather than performance — jobs shipped is worth showing and not worth judging —
// so they never raise an exception no matter what the number is.
//
// One exception per area, not one per reading. A late shipment and the OTIF it dented are
// the same event told twice, and a meeting with three minutes in it cannot afford to hear
// both. The worst reading in an area leads and the rest ride along underneath it, so
// nothing is hidden and nothing is said twice.
const severity = tone => tone === 'stop' ? 2 : tone === 'warn' ? 1 : 0;

export function attention(list) {
  const live = (list || []).filter(r =>
    !r.quiet && r.state !== 'missing' && r.tone && r.tone !== 'ok');
  const byArea = new Map();
  for (const reading of live) {
    const held = byArea.get(reading.area);
    if (!held) { byArea.set(reading.area, { ...reading, also: [] }); continue; }
    if (severity(reading.tone) > severity(held.tone)) {
      const { also, ...previous } = held;
      byArea.set(reading.area, { ...reading, also: [...also, previous] });
    } else {
      held.also.push(reading);
    }
  }
  return [...byArea.values()].sort((a, b) => severity(b.tone) - severity(a.tone));
}
// A missing reading is not settled. It has no tone, so the old test — "no tone means it is
// fine" — swept every absent number into the on-target strip and into the count beside it.
// Nor is a reading that does not apply: a day with nought jobs shipped has no OTIF, and
// counting "no OTIF" among the readings that are within target is the same class of lie in
// a smaller font. It appears on its own card saying N/A and in none of the four counts.
export const settled = list => (list || []).filter(r =>
  r.state !== 'missing' && r.state !== 'na' && (r.quiet || !r.tone || r.tone === 'ok'));

export const absent = list => (list || []).filter(r => r.state === 'missing');

// The four numbers the morning is summarised by, counted once so no two screens can
// disagree about how complete a morning is.
export const counts = list => {
  const flags = attention(list);
  return {
    stop:    flags.filter(r => r.tone === 'stop').length,
    warn:    flags.filter(r => r.tone === 'warn').length,
    missing: absent(list).length,
    ok:      settled(list).length,
  };
};

// The one question Publish has to ask, and the one Today has to answer before it may say
// everything is fine.
export const isComplete = list => absent(list).length === 0;

// ── What a section amounts to, in one line ──────────────────────────────────────
//
// A section is five cards and a table, and reading it takes a moment the meeting does not
// have. The line at the top of it says what the whole section comes to, so a person can
// take the section without reading it and read it only if the line gives them a reason to.
//
// It states, it does not judge. Every word in it comes from a reading that assess() has
// already decided about, and the tone it carries is the same tone the dot beside the
// section in the rail carries — because the rail now asks this function for it rather than
// working it out again. That was the last place two parts of MaxMetrics could have formed
// separate opinions about the same morning.
const capitalise = text => text ? text[0].toUpperCase() + text.slice(1) : '';
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

const EMPTY = {
  safety:      'No injury or near-miss dates entered yet.',
  quality:     'Nothing entered for quality yet.',
  production:  'No department has reported volume and hours yet.',
  shipping:    'Nothing shipped has been entered yet.',
  maintenance: 'Nothing scheduled for today.',
  labour:      'No overtime entered yet.',
  financials:  'No sales figure has been entered yet.',
};

// What "everything is fine" sounds like where the plant is standing. A count of readings
// is the honest general answer; production and shipping have a better one because the room
// is already counting departments and shipments.
function allClear(section, readings) {
  if (section === 'production') {
    const departments = readings.filter(r => r.department).length;
    if (departments) return `${plural(departments, 'department is', 'departments are')} at or above target.`;
  }
  if (section === 'safety') {
    const streak = readings.find(r => r.key === 'injury');
    if (streak) {
      return `No injury today — ${plural(Number(streak.value), 'day', 'days')} clear, and everything else on target.`;
    }
  }
  if (section === 'quality') {
    const short = readings.find(r => r.key === 'shortages');
    return short && Number(short.value) === 0
      ? 'Nothing short, and cost of quality inside target.'
      : `All ${readings.length} readings on target.`;
  }
  if (section === 'financials') return 'Sales are on or ahead of plan, month and year to date.';
  if (section === 'labour') return 'No overtime running this morning.';
  return readings.length === 1
    ? 'The one reading entered is on target.'
    : `All ${readings.length} readings on target.`;
}

export function verdictFor(section, readings, extraTones = []) {
  const mine = (readings || []).filter(r => r.section === section);
  const tones = mine.filter(r => r.tone).map(r => r.tone).concat(extraTones.filter(Boolean));
  const tone = tones.length ? band.worst(tones) : '';
  // A section can be judged before it has a single reading of its own: a department gets
  // flagged in the 24-hour review before anyone has typed its volume. The dot reports
  // that; the line still says the readings are missing, because they are.
  if (!mine.length) return { tone, line: EMPTY[section] || 'Nothing entered for this morning yet.' };

  const off = mine.filter(r => !r.quiet && r.tone && r.tone !== 'ok')
                  .sort((a, b) => severity(b.tone) - severity(a.tone));
  const on = mine.length - off.length;
  if (!off.length) return { tone, line: allClear(section, mine) };

  // The worst thing leads, because it is the thing the room is about to talk about. The
  // rest are counted rather than listed: a line that names four problems is a paragraph,
  // and the cards underneath are already naming them.
  const lead = off[0], rest = off.length - 1;
  const said = lead.say || `${lead.title} is ${lead.value} against ${lead.targetLabel || 'target'}`;
  const tail = rest && on ? ` ${plural(rest, 'other reading is', 'other readings are')} also off target, ${on} on target.`
             : rest      ? ` ${plural(rest, 'other reading is', 'other readings are')} also off target.`
             : on        ? ` ${plural(on, 'other reading is', 'other readings are')} on target.`
             : '';
  return { tone, line: `${capitalise(said)}.${tail}` };
}

// Every section's verdict in one pass, including the tones the readings themselves do not
// carry: a department can be flagged in the 24-hour review without its rate being off, and
// a section whose dot went green while somebody had written "Bobst down since 3am" under
// it would be lying.
export function verdicts(state, readings) {
  // An unanswered department is not a green one. It used to arrive here as 'ok' from a
  // column default; it arrives as null now and is left out of the verdict rather than
  // counted as clear — the missing count on the summary is where it is reported.
  const reviewTones = (state.review || []).map(r => r.status).filter(Boolean);
  const maintTones = (state.maintenance || []).map(r => {
    const tone = band.maint(r.status);
    return tone === 'info' ? 'ok' : tone;
  });
  return {
    safety:      verdictFor('safety', readings),
    quality:     verdictFor('quality', readings),
    production:  verdictFor('production', readings, reviewTones),
    shipping:    verdictFor('shipping', readings),
    financials:  verdictFor('financials', readings),
    maintenance: verdictFor('maintenance', readings, maintTones),
    labour:      verdictFor('labour', readings),
  };
}
