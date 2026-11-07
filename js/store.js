// Lưu trữ local (localStorage) – hoạt động hoàn toàn offline.
const KEY = 'timesheet.v1';
const SYNC_KEY = 'timesheet.sync'; // token GitHub để riêng, KHÔNG bao giờ upload

export const DEFAULT_SETTINGS = {
  weeklyLimitH: 28,
  windowDays: 7,
  maxContH: 7,
  minBreakMin: 60,
  minShiftH: 2,
  maxPerDayH: 8,
  targetWeeklyH: 28,
  horizon: 14,
  mode: 'balanced',
  weekStart: 1,
  showMarker: true,
  lang: 'vi',
  ownerName: '',
  reportTitle: '勤務表',
  schema: 2,
  // Khung giờ có thể làm việc theo thứ (0 = CN ... 6 = T7); rỗng = không đi làm ngày đó
  workStart: '07:00',
  workEnd: '22:00',
  availability: {
    0: '07:00-22:00', 1: '07:00-22:00', 2: '07:00-22:00', 3: '07:00-22:00',
    4: '07:00-22:00', 5: '07:00-22:00', 6: '07:00-22:00',
  },
  // Thời gian bận lặp lại hằng tuần: { id, days:[thứ], s:'HH:MM', e:'HH:MM', label }
  busyRules: [],
  preferred: '07:00-12:00, 17:00-20:00',
  templates: '07:00-12:00, 08:00-12:00, 13:00-20:00, 17:00-20:00, 18:00-20:00',
  updatedAt: 0,
};

function normalize(s = {}) {
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(s.settings || {}),
    availability: { ...DEFAULT_SETTINGS.availability, ...(s.settings?.availability || {}) },
  };
  if ((s.settings?.schema || 0) < 2) { // nâng cấp từ bản cũ
    settings.availability = { ...DEFAULT_SETTINGS.availability };
    if (+settings.maxContH === 6) settings.maxContH = 7;
    settings.schema = 2;
  }
  return {
    entries: s.entries || {},
    overrides: s.overrides || {},
    settings,
    meta: { dirty: false, lastSync: 0, ...(s.meta || {}) },
  };
}

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s) return normalize(s);
  } catch { /* dữ liệu hỏng -> dùng mặc định */ }
  return normalize();
}
export const save = (state) => localStorage.setItem(KEY, JSON.stringify(state));

/** Gộp 2 bộ dữ liệu: mỗi ngày lấy bản có updatedAt mới hơn. */
export function merge(a, b) {
  const pick = (x = {}, y = {}) => {
    const out = { ...x };
    for (const k in y) if (!out[k] || (y[k]?.updatedAt || 0) > (out[k]?.updatedAt || 0)) out[k] = y[k];
    return out;
  };
  const useRemote = (b.settings?.updatedAt || 0) > (a.settings?.updatedAt || 0);
  return {
    entries: pick(a.entries, b.entries),
    overrides: pick(a.overrides, b.overrides),
    settings: useRemote ? normalize({ settings: b.settings }).settings : a.settings,
  };
}

export const payload = (s) => ({
  app: 'timesheet-pwa', version: 1, exportedAt: Date.now(),
  entries: s.entries, overrides: s.overrides, settings: s.settings,
});

export const loadSync = () => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch { return {}; } };
export const saveSync = (c) => localStorage.setItem(SYNC_KEY, JSON.stringify(c));
export const resetAll = () => localStorage.removeItem(KEY);

