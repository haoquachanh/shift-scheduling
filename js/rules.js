// Luật tính giờ:
//  (1) Mọi cửa sổ N ngày liên tục (mặc định 7) không vượt quá giới hạn (mặc định 28h).
//  (2) Làm liên tục tối đa maxCont (7h) thì phải nghỉ ít nhất minBreak (60 phút) mới được làm tiếp.
import { toMin, addDays, fmtDur, hm } from './util.js';

export function settingsMin(s) {
  const limitH = +s.weeklyLimitH || 28;
  return {
    weeklyLimit: Math.round(limitH * 60),
    target: Math.round(Math.min(+s.targetWeeklyH || limitH, limitH) * 60),
    windowDays: Math.max(1, Math.round(+s.windowDays || 7)),
    maxCont: Math.max(30, Math.round((+s.maxContH || 7) * 60)),
    minBreak: Math.max(1, Math.round(+s.minBreakMin || 60)),
    minShift: Math.max(30, Math.round((+s.minShiftH || 2) * 60)),
    maxPerDay: Math.max(0, Math.round((+s.maxPerDayH || 24) * 60)),
    step: 30,
  };
}

/** Trả về danh sách ca [{s,e,b}] (phút, e có thể > 1440 nếu qua đêm), sắp theo giờ bắt đầu. */
export function shiftsOf(entry) {
  if (!entry || entry.deleted) return [];
  const out = [];
  for (const k of [1, 2]) {
    const s = toMin(entry['s' + k]), en = toMin(entry['e' + k]);
    if (s == null || en == null || en === s) continue;
    const e = en < s ? en + 1440 : en;
    const b = Math.max(0, Math.min(+entry['b' + k] || 0, e - s));
    out.push({ s, e, b });
  }
  return out.sort((a, b) => a.s - b.s);
}

export const workOfShifts = (sh) => sh.reduce((t, x) => t + (x.e - x.s - x.b), 0);
export const workOf = (entry) => workOfShifts(shiftsOf(entry));

/** Kiểm tra luật nghỉ giải lao trong 1 ngày. Trả về mảng thông báo lỗi (rỗng = hợp lệ). */
export function breakIssues(shifts, st, t) {
  const issues = [];
  const sh = [...shifts].sort((a, b) => a.s - b.s);
  for (let i = 1; i < sh.length; i++) {
    if (sh[i].s < sh[i - 1].e) issues.push(t ? t.issuesOverlap : 'Hai ca bị chồng giờ nhau');
  }
  // Gộp các ca có khoảng cách < minBreak thành 1 "khối liên tục"
  const blocks = [];
  let cur = null;
  for (const x of sh) {
    const w = x.e - x.s - x.b;
    const brk = Math.floor(x.b / st.minBreak); // số lần nghỉ hợp lệ (mỗi lần >= minBreak)
    if (cur && x.s - cur.end < st.minBreak) {
      cur.work += w; cur.breaks += brk; cur.end = Math.max(cur.end, x.e);
    } else {
      cur = { start: x.s, end: x.e, work: w, breaks: brk };
      blocks.push(cur);
    }
  }
  for (const b of blocks) {
    const need = Math.max(0, Math.ceil(b.work / st.maxCont) - 1);
    if (b.breaks < need) {
      issues.push(t
        ? t.issuesBreak(fmtDur(b.work), hm(b.start % 1440), hm(b.end % 1440), need, st.minBreak)
        : `Làm liên tục ${fmtDur(b.work)} (${hm(b.start % 1440)}–${hm(b.end % 1440)}) – cần nghỉ ít nhất ${need} lần × ${st.minBreak} phút`
      );
    }
  }
  return issues;
}

/** Tổng giờ của cửa sổ `days` ngày kết thúc tại `date`. */
export function rollingSum(date, getWork, days) {
  let t = 0;
  for (let i = 0; i < days; i++) t += getWork(addDays(date, -i));
  return t;
}

/**
 * Số phút còn được phép làm thêm trong `date` theo luật N ngày,
 * xét MỌI cửa sổ chứa `date` (kể cả các ngày tương lai đã lên lịch).
 */
export function legalRemaining(date, getWork, st, limit = st.weeklyLimit) {
  const w = getWork(date);
  let cap = Infinity;
  for (let k = 0; k < st.windowDays; k++) {
    const sum = rollingSum(addDays(date, k), getWork, st.windowDays);
    cap = Math.min(cap, limit - (sum - w));
  }
  return Math.max(0, cap - w);
}

/** Tất cả vi phạm của 1 ngày (luật nghỉ + cửa sổ N ngày kết thúc tại ngày đó). */
export function dayIssues(date, ctx, t) {
  const st = ctx.st;
  const issues = breakIssues(shiftsOf(ctx.entries[date]), st, t);
  const roll = rollingSum(date, ctx.work, st.windowDays);
  if (roll > st.weeklyLimit) {
    issues.push(t
      ? t.issuesWindow(st.windowDays, fmtDur(roll), fmtDur(st.weeklyLimit))
      : `${st.windowDays} ngày liên tục (đến ngày này) = ${fmtDur(roll)} > ${fmtDur(st.weeklyLimit)}`
    );
  }
  return issues;
}
