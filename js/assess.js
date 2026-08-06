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

import { band, daysBetween, num, money } from './readings.js';

// The meeting runs two to three minutes, so a reading earns its place by being either
// off target or genuinely load-bearing. Everything else is a tick in a strip.
export function assess({ date, metrics, departments, review, maintenance, config, budgets, history }) {
  const out = [];
  const m = field => metrics?.[field];
  const has = value => value !== null && value !== undefined && value !== '';

  const seriesFor = key => (history?.departments || [])
    .filter(r => r.dept_key === key && Number(r.hours))
    .map(r => Number(r.qty) / Number(r.hours));
  const metricSeries = field => (history?.metrics || [])
    .map(r => r[field]).filter(v => v !== null && v !== undefined).map(Number);

  // ── Safety ──
  if (has(m('injury_last'))) {
    const days = daysBetween(m('injury_last'), date), record = Number(m('injury_record') || 0);
    out.push({ key:'injury', area:'Safety', owner:'JR', title:'Days since last injury',
      tone: band.streak(days), value: days, unit:'days',
      // Only an incident today belongs in the exception list. Every other day the
      // counter is context the room wants to see, not a problem it has to solve.
      quiet: days !== 0,
      target: record, targetLabel: record ? `record ${record}` : null,
      percent: record ? days / record * 100 : 0,
      note: days === 0 ? 'Injury recorded today.'
          : record && days >= record ? `Record broken by ${days - record} days.` : null });
  }
  if (has(m('near_miss_last'))) {
    const days = daysBetween(m('near_miss_last'), date), record = Number(m('near_miss_record') || 0);
    out.push({ key:'nearmiss', area:'Safety', owner:'JR', title:'Days since near-miss',
      tone: band.streak(days), value: days, unit:'days', quiet: days !== 0,
      target: record, targetLabel: record ? `record ${record}` : null,
      percent: record ? days / record * 100 : 0,
      note: days === 0 ? 'Near-miss recorded today.'
          : record && days >= record ? `Record broken by ${days - record} days.` : null });
  }
  if (has(m('shortages'))) {
    const count = Number(m('shortages'));
    out.push({ key:'shortages', area:'Quality', owner:'QA', title:'Shortages',
      tone: band.count(count), value: count, unit: count === 1 ? 'job short' : 'jobs short',
      target: 0, targetLabel:'target 0', percent: count ? 100 : 0 });
  }
  if (has(m('coq'))) {
    const value = Number(m('coq')), target = Number(m('coq_target') || 0.85);
    out.push({ key:'coq', area:'Quality', owner:'QA', title:'Cost of quality',
      tone: band.coq(value, target), value: value.toFixed(2), unit:'%',
      target, targetLabel:`target ≤ ${target}%`, lowerIsBetter: true,
      percent: value / (target * 1.6) * 100, series: metricSeries('coq'),
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
    out.push({ key:c.key, area:c.name, owner:'ML', title:c.name,
      tone: band.rate(rate, target) || '', value: num(Math.round(rate)), unit:`${c.unit}/hr`,
      target, targetLabel:`target ${num(target)}`, percent: target ? rate / (target * 1.25) * 100 : 0,
      series: seriesFor(c.key), raw: rate, previous,
      shortfall: rate < target ? Math.round((target - rate) * Number(row.hours)) : 0,
      unitWord: c.unit, note: said?.note || null });
  }

  // ── Shipping ──
  if (has(m('late'))) {
    const late = Number(m('late'));
    const said = (review || []).find(r => r.dept_key === 'shipping');
    out.push({ key:'late', area:'Shipping', owner:'CS', title:'Late shipments',
      tone: band.count(late), value: late, unit: late === 1 ? 'late shipment' : 'late shipments',
      target: 0, targetLabel:'target 0', percent: late ? 100 : 0, note: said?.note || null });
  }
  if (has(m('otif'))) {
    const value = Number(m('otif'));
    out.push({ key:'otif', area:'Shipping', owner:'CS', title:'OTIF today',
      tone: band.pct(value, 98), value: value.toFixed(2), unit:'%',
      target: 98, targetLabel:'target ≥ 98%', floor: 90, percent: value,
      series: metricSeries('otif'),
      note: has(m('mtd_otif')) ? `Month to date ${Number(m('mtd_otif')).toFixed(2)}%.` : null });
  }
  if (has(m('jobs_shipped'))) {
    out.push({ key:'jobs', area:'Shipping', owner:'CS', title:'Jobs shipped',
      tone:'ok', value: num(m('jobs_shipped')), unit:'jobs', quiet: true,
      targetLabel: has(m('jobs_on_time')) ? `${m('jobs_on_time')} on time` : null });
  }

  // ── Maintenance ──
  const overdue = (maintenance || []).filter(x => x.status === 'Overdue');
  if ((maintenance || []).length) {
    const open = maintenance.filter(x => x.status !== 'Complete').length;
    out.push({ key:'maint', area:'Maintenance', owner:'MT', title:'Maintenance',
      tone: overdue.length ? 'stop' : 'ok',
      value: overdue.length || open, unit: overdue.length ? 'overdue' : 'open',
      targetLabel: `${open} open`, percent: overdue.length ? 100 : 0,
      note: overdue.length
        ? `${overdue.map(x => x.dept || x.item_type).join(', ')} overdue.`
        : null });
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
    out.push({ key:'fin', area:'Financial', owner:'FN', title:'Sales month to date',
      tone: band.money(percent), value: money(actual), unit:'MTD',
      targetLabel:`plan ${money(plan)}`, percent: plan ? actual / (plan * 1.3) * 100 : 0,
      delta: `${variance >= 0 ? '▲' : '▼'} ${money(Math.abs(variance))} (${Math.abs(percent).toFixed(1)}%)`,
      deltaTone: band.money(percent) });
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
  const live = (list || []).filter(r => !r.quiet && r.tone && r.tone !== 'ok');
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
export const settled  = list => list.filter(r => r.quiet || !r.tone || r.tone === 'ok');
