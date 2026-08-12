// A stand-in for js/db.js so the dashboard can be driven in a browser without a network.
const DATE = '2026-08-11';
const ok = v => Promise.resolve(v);

export const client = { channel: () => ({ on: () => ({ subscribe: () => {} }), subscribe: () => {} }),
  removeChannel: () => {}, auth: { onAuthStateChange: () => {} } };
export const connection = () => 'online';
export const signIn = () => ok({});
export const signOut = () => ok({});
export const resetPassword = () => ok({});
export const currentSession = () => ok({ user: { id: 'u1', email: 'test@example.com' } });
export const myProfile = () => ok({ id: 'u1', full_name: 'Test Person', chart_style: 'bar', is_admin: true });
export const savePreference = () => ok({});
export const myLocations = () => ok([{ location_id: 'mississauga', can_edit: true,
  locations: { id: 'mississauga', name: 'Mississauga', sort_order: 1 } }]);
export const openDay = () => ok({});

const CONFIG = [
  { id: 1, key: 'printing', name: 'Printing', unit: 'sheets', target: 3050, icon: '🖨️', on_metrics: true, active: true, sort_order: 1 },
  { id: 2, key: 'diecutting', name: 'Die Cutting', unit: 'sheets', target: 2025, icon: '✂️', on_metrics: true, active: true, sort_order: 2 },
  { id: 3, key: 'gluing', name: 'Gluing', unit: 'cartons', target: 11933, icon: '📦', on_metrics: true, active: true, sort_order: 3 },
  { id: 4, key: 'windowing', name: 'Windowing', unit: 'panes', rate_label: 'panes/hr', target: 4200, icon: '🪟', on_metrics: true, active: true, sort_order: 4 },
];

export const loadDay = () => ok({
  metrics: {
    metric_date: DATE, status: 'draft',
    injury_last: '2025-11-20', injury_record: 136,
    near_miss_last: '2026-07-31', near_miss_record: 89,
    shortages: null, coq: 0.92, coq_target: 0.85, coq_ytd: 0.78, coq_ytd_target: 0.85,
    ncr_ytd: 94, complaints_internal: 83, complaints_external: 23,
    ncr_today: 3, ncr_mtd: 11,
    complaints_internal_today: 1, complaints_internal_mtd: 7,
    complaints_external_today: 0, complaints_external_mtd: 4,
    jobs_shipped: 41, jobs_on_time: 39, late: 2, shorts: 1, cartons: null,
    mtd_otif: 97.4, ytd_otif: 98.2,
    fin_actual_mtd: 1420000, fin_actual_ytd: 11850000,
    maintenance_note: 'Gluer 3 belt replaced overnight.', staffing_note: '',
  },
  departments: [
    { dept_key: 'printing', qty: 96000, hours: 32, target: 3050, pw_qty: 92000, pw_hours: 31, uptime: 0.94 },
    { dept_key: 'diecutting', qty: 44000, hours: 24, target: 2025, pw_qty: 47000, pw_hours: 24, uptime: 0.90 },
    { dept_key: 'gluing', qty: 286000, hours: 24, target: 11933, pw_qty: 274000, pw_hours: 24, uptime: 0.94 },
    { dept_key: 'windowing', qty: 71000, hours: 16, target: 4200, pw_qty: 66000, pw_hours: 16, uptime: 0.91 },
  ],
  review: CONFIG.map((c, i) => ({ dept_key: c.key, status: ['ok', 'warn', 'ok', 'ok'][i],
    note: i === 1 ? 'Die 4 ran slow through the night shift.\nWaiting on a plate for job 8841.' : '' })),
  maintenance: [
    { id: 'm1', dept: 'Printing', machine: '40" Press', hours: 4, note: 'Monthly PM',
      item_type: 'PM', frequency: 'Monthly', scheduled: '2026-08-11', scheduled_on: '2026-08-11', status: 'Overdue' },
  ],
  labour: [
    { dept_key: 'printing', ot_shifts: 2, machines: ['40'] },
    { dept_key: 'gluing', ot_shifts: 3, machines: ['Hdlbrg', 'Omega'] },
  ],
  plant: { id: 'mississauga', name: 'Mississauga', show_ncr: true, show_internal: true,
           show_external: true,
           hidden_cards: ['maint-overdue', 'maint-open', 'maint-list', 'maint-note',
                          'ot-total', 'ot-depts'],
           split_upkeep: false, wall_hidden: [], card_order: {} },
  config: CONFIG,
});

const back = n => { const d = new Date(DATE); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
export const loadHistory = () => ok({
  metrics: Array.from({ length: 7 }, (_, i) => ({ metric_date: back(7 - i),
    otd: [96.1, 97.3, 95.8, 98.2, 97.9, 96.4, 95.1][i],
    otif: [95.2, 96.8, 94.9, 97.4, 97.1, 95.6, 94.4][i],
    coq: [1.1, 0.98, 1.2, 0.87, 0.91, 1.05, 0.92][i],
    coq_ytd: [0.71, 0.72, 0.74, 0.75, 0.76, 0.77, 0.78][i],
    mtd_otif: [96.9, 97.0, 97.1, 97.3, 97.4, 97.4, 97.4][i],
    ytd_otif: [98.0, 98.0, 98.1, 98.1, 98.2, 98.2, 98.2][i],
    shortages: [1, 3, 0, 2, 4, 1, 2][i],
    late: [1, 0, 3, 2, 1, 0, 2][i],
    shorts: [0, 1, 1, 0, 2, 1, 1][i],
    jobs_shipped: [38, 44, 36, 47, 41, 39, 41][i],
    cartons: [11800, 13200, 10900, 14100, 12800, 12100, 12400][i],
    fin_actual_mtd: [820000, 940000, 1050000, 1160000, 1240000, 1330000, 1420000][i],
    fin_actual_ytd: [11250000, 11370000, 11480000, 11590000, 11670000, 11760000, 11850000][i] })),
  departments: CONFIG.flatMap(c => Array.from({ length: 7 }, (_, i) => ({
    metric_date: back(7 - i), dept_key: c.key,
    qty: Math.round(c.target * [0.94, 1.02, 0.97, 1.05, 0.99, 1.01, 0.96][i] * 8), hours: 8 }))),
});
export const loadYearCounts = () => ok([
  { metric_date: '2026-01-31', ncr_mtd: 15, complaints_internal_mtd: 15, complaints_external_mtd: 2 },
  { metric_date: '2026-02-28', ncr_mtd: 15, complaints_internal_mtd: 15, complaints_external_mtd: 4 },
  { metric_date: '2026-03-31', ncr_mtd: 16, complaints_internal_mtd: 16, complaints_external_mtd: 6 },
  { metric_date: '2026-04-30', ncr_mtd: 13, complaints_internal_mtd: 13, complaints_external_mtd: 3 },
  { metric_date: '2026-05-31', ncr_mtd: 14, complaints_internal_mtd: 14, complaints_external_mtd: 1 },
  { metric_date: '2026-06-30', ncr_mtd: 10, complaints_internal_mtd: 10, complaints_external_mtd: 4 },
  { metric_date: '2026-07-31', ncr_mtd: 11, complaints_internal_mtd: 11, complaints_external_mtd: 3 },
  { metric_date: '2026-08-11', ncr_mtd: 7, complaints_internal_mtd: 7, complaints_external_mtd: 4 },
]);
export const loadBudgets = () => ok(Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amount: 1500000 })));
export const loadOperators = () => ok([]);
export const loadReportedDates = () => ok([]);
export const loadUpcoming = () => ok([
  { id: 'm1', dept: 'Printing', machine: '40" Press', hours: 4, note: 'Monthly PM',
    scheduled_on: '2026-08-11', status: 'Overdue' },
  { id: 'm2', dept: 'Gluing', machine: 'Heidelberg', hours: 2.5, note: 'Belt replacement',
    scheduled_on: '2026-08-13', status: 'Scheduled' },
  { id: 'm4', dept: 'Die Cutting', machine: 'Die Cutter 2018', hours: 6, note: 'Bearing service',
    scheduled_on: '2026-08-14', status: 'Scheduled' },
]);
export const addMaintenance = () => ok({ id: 'new', dept: '', machine: '', hours: null, note: '',
  scheduled_on: DATE, status: 'Scheduled' });
export const saveMaintenance = () => ok({});
export const removeMaintenance = () => ok({});
export const loadMachines = () => ok([
  { id: '1', dept_key: 'printing', code: '40', name: '40" Press', active: true, sort_order: 1 },
  { id: '2', dept_key: 'printing', code: '41', name: '41" Press', active: true, sort_order: 2 },
  { id: '3', dept_key: 'diecutting', code: '2017', name: 'Die Cutter 2017', active: true, sort_order: 1 },
  { id: '4', dept_key: 'diecutting', code: '2018', name: 'Die Cutter 2018', active: true, sort_order: 2 },
  { id: '5', dept_key: 'gluing', code: 'Hdlbrg', name: 'Heidelberg', active: true, sort_order: 1 },
  { id: '6', dept_key: 'gluing', code: 'Bobst', name: 'Bobst', active: true, sort_order: 2 },
  { id: '7', dept_key: 'gluing', code: 'Omega', name: 'Omega', active: true, sort_order: 3 },
]);
export const saveMachineTarget = () => ok({});
export const loadPlant = () => ok([]);
export const savePlant = (loc, patch) => { globalThis.__savedPlant = patch; return ok({}); };
export const loadDepartmentConfig = () => ok(CONFIG);
export const saveDepartmentConfig = () => ok({});
export const addDepartmentConfig = () => ok({});
export const ensureDepartmentRows = () => ok({});
export const saveField = () => ok({});
export const saveDepartment = () => ok({});
export const saveLabour = () => ok({});
export const saveReview = () => ok({});
export const saveBudget = () => ok({});
export const importHistory = () => ok({});
export const publish = () => ok({});
export const recordEdit = () => ok({});
export const joinDay = () => ({ unsubscribe: () => {} });

export const peopleAt = () => ok([
  { profile_id: 'u1', full_name: 'Test Person', email: 'test@maxsolutions.ca',
    job_title: 'Production Coordinator', is_admin: true, can_edit: true, has_access: true, pending: false },
  { profile_id: 'u2', full_name: 'Rahul Sharma', email: 'rahul@maxsolutions.ca',
    job_title: 'Press Lead', is_admin: false, can_edit: false, has_access: true, pending: false },
  { profile_id: 'u3', full_name: 'Dana Whitfield', email: 'dana@maxsolutions.ca',
    job_title: 'Quality Manager', is_admin: false, can_edit: false, has_access: false, pending: false },
  { profile_id: null, full_name: 'newhire@maxsolutions.ca', email: 'newhire@maxsolutions.ca',
    job_title: 'Invited', is_admin: false, can_edit: true, has_access: true, pending: true },
]);
export const grantAccess = () => ok('granted');
export const revokeAccess = () => ok(null);
export const setAdmin = () => ok(null);
export const createPerson = ({ email }) => ok({ email, password: 'quni-vasp-473', reused: false });
export const mustChangePassword = () => Promise.resolve(false);
export const chooseOwnPassword = () => ok(null);
export const loadSources = () => ok([
  { id: 's1', kind: 'dor', name: 'DOR', url: '', enabled: true,
    last_pulled_at: null, last_status: null, last_note: null, sort_order: 1 },
  { id: 's2', kind: 'otif', name: 'OTD / OTIF sheet',
    url: 'https://maxsolutions.sharepoint.com/:x:/g/otd.xlsx', enabled: true,
    last_pulled_at: '2026-08-11T07:41:00Z', last_status: 'ok', last_note: '312 KB', sort_order: 2 },
  { id: 's3', kind: 'kpi', name: 'Monthly KPI workbook',
    url: 'https://maxsolutions.sharepoint.com/:x:/r/kpi.xlsx', enabled: true,
    last_pulled_at: '2026-08-11T07:41:00Z', last_status: 'failed',
    last_note: 'that address returned a web page rather than a workbook', sort_order: 3 },
]);
export const saveSource = () => ok(null);
export const pullSources = () => ok({ at: new Date().toISOString(), sources: [] });
export const updatePerson = () => ok({ ok: true });
export const resetPersonPassword = () => ok({ email: 'x@y.ca', password: 'mopa-vine-284', reused: true });
export const removePerson = () => ok({ ok: true });
export const addSource = () => ok({ id: 's9', kind: 'other', name: 'Another file', url: '',
  enabled: true, last_pulled_at: null, last_status: null, last_note: null, sort_order: 9 });
export const dropSource = () => ok(null);
export const resetMorning = () => ok(null);
