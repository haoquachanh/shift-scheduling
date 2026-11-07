// Tiện ích thời gian / ngày tháng. Ngày luôn dạng chuỗi "YYYY-MM-DD", giờ tính bằng phút.
export const pad = (n) => String(n).padStart(2, '0');

export function toMin(s) {
  if (s == null || s === '') return null;
  const m = String(s).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return +m[1] * 60 + +m[2];
}

/** 450 -> "07:30" ; 1440 -> "24:00" (chỉ để hiển thị) */
export const hm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
/** Giá trị cho <input type="time"> (24:00 -> 00:00) */
export const timeValue = (m) => hm(((m % 1440) + 1440) % 1440);

export function fmtDur(m) {
  m = Math.max(0, Math.round(m || 0));
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h${pad(r)}` : `${h}h`;
}
export const fmtJP = (m) => `${Math.floor(m / 60)} 時間 ${Math.round(m % 60)} 分`;

export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const utc = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export function addDays(s, n) {
  const t = new Date(utc(s) + n * 864e5);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export const dow = (s) => new Date(utc(s)).getUTCDay();
export const diffDays = (a, b) => Math.round((utc(a) - utc(b)) / 864e5);
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1..12
export const todayStr = () => ymd(new Date());
export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
