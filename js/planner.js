// Thuật toán đề xuất lịch làm (chạy offline, miễn phí, không cần AI server).
//
// Bước 1 – Năng lực từng ngày: từ "giờ rảnh" (lịch rảnh theo thứ – lịch bận – ca đã có),
//          tìm tổ hợp tối đa 2 ca hợp lệ (luật 6h/nghỉ 1h, độ dài ca tối thiểu) cho nhiều giờ nhất.
// Bước 2 – Phân bổ giờ theo luật 7 ngày cuốn chiếu (rolling), có tính cả quá khứ & lịch tương lai:
//          • "balanced": rót nước (water-filling) – luôn cộng thêm 30' vào ngày đang ít giờ nhất
//            còn hợp lệ → giờ làm đều nhau, không ngày nào quá tải.
//          • "early": tham lam từ hôm nay → làm tối đa sớm nhất có thể.
// Bước 3 – Xếp ca cụ thể cho từng ngày, ưu tiên khung giờ yêu thích & ít ca nhất.
import { addDays, dow } from './util.js';
import { shiftsOf, breakIssues, rollingSum, legalRemaining, workOfShifts } from './rules.js';

export function parseRanges(str) {
  return String(str || '')
    .split(/[,;\n、]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*[-~–〜]\s*(\d{1,2})(?::(\d{2}))?$/);
      if (!m) return null;
      const a = +m[1] * 60 + (+m[2] || 0), b = +m[3] * 60 + (+m[4] || 0);
      return b > a && b <= 1440 ? [a, b] : null;
    })
    .filter(Boolean)
    .sort((x, y) => x[0] - y[0]);
}

export function subtract(ranges, cuts) {
  let out = ranges.map((r) => [...r]);
  for (const [a, b] of cuts) {
    const next = [];
    for (const [x, y] of out) {
      if (b <= x || a >= y) { next.push([x, y]); continue; }
      if (a > x) next.push([x, a]);
      if (b < y) next.push([b, y]);
    }
    out = next;
  }
  return out;
}

/** Khung giờ rảnh có thể đi làm của 1 ngày (đã trừ lịch bận lặp lại, bận riêng ngày đó, ca đã có, giờ đã qua). */
export function freeWindows(date, ctx, fromMin = 0, extraShifts = []) {
  const ov = ctx.overrides[date] || {};
  if (ov.off) return [];
  const step = ctx.st.step;
  const base = parseRanges(ctx.settings.availability?.[dow(date)]);
  const wd = dow(date);
  const recurring = (ctx.settings.busyRules || [])
    .filter((r) => (r.days || []).includes(wd))
    .flatMap((r) => parseRanges(`${r.s}-${r.e}`));
  const cuts = [
    ...recurring,
    ...parseRanges(ov.busy),
    ...shiftsOf(ctx.entries[date]).map((x) => [x.s, x.e]),
    ...extraShifts.map((x) => [x.s, x.e]),
  ];
  if (fromMin > 0) cuts.push([0, fromMin]);
  return subtract(base, cuts)
    .map(([a, b]) => [Math.ceil(a / step) * step, Math.floor(b / step) * step])
    .filter(([a, b]) => b > a);
}

const needBreaks = (L, st) => Math.max(0, Math.ceil((L - st.maxCont) / (st.maxCont + st.minBreak)));

function shiftCandidates(free, st, maxWork) {
  const c = [];
  for (const [a, b] of free) {
    for (let s = a; s + st.minShift <= b; s += st.step) {
      for (let e = s + st.minShift; e <= b; e += st.step) {
        const L = e - s, br = needBreaks(L, st) * st.minBreak, w = L - br;
        if (w > maxWork) break;
        if (w >= st.minShift) c.push({ s, e, b: br, w });
      }
    }
  }
  return c;
}

const overlap = (set, pref) =>
  set.reduce((t, x) => t + pref.reduce((u, [a, b]) => u + Math.max(0, Math.min(x.e, b) - Math.max(x.s, a)), 0), 0);

/** Xếp tối đa (2 - số ca đã có) ca mới, tổng giờ <= H, hợp lệ luật nghỉ. */
export function bestDayPlan(free, existing, H, st, pref = []) {
  let best = { shifts: [], work: 0, score: 0 };
  const slots = 2 - existing.length;
  if (slots <= 0 || H < st.minShift || !free.length) return best;
  const cands = shiftCandidates(free, st, H);
  const tryset = (set) => {
    const w = set.reduce((t, x) => t + x.w, 0);
    if (w > H) return;
    const sc = w * 1000 + overlap(set, pref) - set.length * 200 - set[0].s * 0.01;
    if (sc <= best.score) return;
    if (breakIssues([...existing, ...set], st).length) return;
    best = { shifts: set.map(({ s, e, b }) => ({ s, e, b })), work: w, score: sc };
  };
  for (const c of cands) tryset([c]);
  if (slots >= 2) {
    for (let i = 0; i < cands.length; i++) {
      for (let j = i + 1; j < cands.length; j++) {
        if (cands[j].s >= cands[i].e) tryset([cands[i], cands[j]]);
      }
    }
  }
  return best;
}

/**
 * Lập kế hoạch cho `days` ngày bắt đầu từ `start` (hôm nay).
 * Ngày tương lai đã có ca do người dùng nhập được giữ nguyên (cố định).
 */
export function makePlan(ctx, { start, nowMin = 0, days = 14, mode = 'balanced' }) {
  const st = ctx.st;
  const limit = st.target;
  const pref = parseRanges(ctx.settings.preferred);
  const dates = Array.from({ length: days }, (_, i) => addDays(start, i));
  const extra = {}, info = {};
  const W = (d) => ctx.work(d) + (extra[d] || 0);

  for (const d of dates) {
    const existing = shiftsOf(ctx.entries[d]);
    const isToday = d === start;
    const fixed = existing.length > 0 && !isToday;
    const from = isToday ? Math.ceil(nowMin / st.step) * st.step : 0;
    const free = fixed ? [] : freeWindows(d, ctx, from);
    const room = Math.max(0, st.maxPerDay - ctx.work(d));
    const cap = fixed ? 0 : bestDayPlan(free, existing, room, st, pref).work;
    info[d] = { existing, free, cap, fixed, plan: [] };
  }

  const slack = (d) => {
    let m = Infinity;
    for (let k = 0; k < st.windowDays; k++) m = Math.min(m, limit - rollingSum(addDays(d, k), W, st.windowDays));
    return m;
  };
  const place = (d, H) => {
    const p = bestDayPlan(info[d].free, info[d].existing, H, st, pref);
    info[d].plan = p.shifts; extra[d] = p.work;
  };

  if (mode === 'early') {
    for (const d of dates) {
      let x = Math.floor(Math.min(info[d].cap, slack(d)) / st.step) * st.step;
      if (x >= st.minShift) place(d, x);
    }
  } else {
    const done = new Set(dates.filter((d) => info[d].cap <= 0));
    for (let guard = 0; guard < 5000; guard++) {
      const open = dates.filter((d) => !done.has(d));
      if (!open.length) break;
      open.sort((a, b) => W(a) - W(b) || (a < b ? -1 : 1));
      const d = open[0], cur = extra[d] || 0;
      const inc = cur === 0 ? st.minShift : st.step;
      if (cur + inc <= info[d].cap && inc <= slack(d)) extra[d] = cur + inc;
      else done.add(d);
    }
    for (const d of dates) if (extra[d] > 0) place(d, extra[d]);
  }

  const out = dates.map((d) => {
    const i = info[d];
    return {
      date: d,
      fixed: i.fixed,
      existing: i.existing,
      suggested: i.plan,
      extra: extra[d] || 0,
      total: W(d),
      rolling: rollingSum(d, W, st.windowDays),
      freeAfter: subtract(i.fixed ? freeWindows(d, ctx) : i.free, i.plan.map((x) => [x.s, x.e])),
    };
  });

  const t = info[start];
  const legal = legalRemaining(start, ctx.work, st);
  const room = Math.max(0, st.maxPerDay - ctx.work(start));
  const practical = bestDayPlan(t.free, t.existing, Math.min(legal, room), st, pref).work;
  return {
    days: out,
    today: { date: start, worked: ctx.work(start), legal, practical, recommended: extra[start] || 0, suggested: t.plan },
    totalSuggested: workOfShifts(out.flatMap((d) => d.suggested)),
  };
}
