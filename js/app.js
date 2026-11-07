import { pad, toMin, hm, timeValue, fmtDur, fmtJP, addDays, dow, diffDays, daysInMonth, todayStr, nowMin } from './util.js';
import { settingsMin, shiftsOf, workOf, breakIssues, rollingSum, legalRemaining, dayIssues } from './rules.js';
import { makePlan, parseRanges } from './planner.js';
import { load, save, merge, payload, loadSync, saveSync, resetAll } from './store.js';
import { pull, push } from './sync.js';
import { renderPdf } from './pdf.js';
import { getT, LANGS } from './i18n.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const JP_DOW = ['日', '月', '火', '水', '木', '金', '土'];
const MARKS = [['☆', '#f6d55c'], ['◆', '#6fbf73'], ['○', '#4fc3e8'], ['■', '#e25b5b'], ['△', '#9b7fd1'], ['※', '#c8c8c8']];
const MARK_ANCHOR = '2026-10-01';
const BREAKS = [0, 15, 30, 45, 60, 75, 90, 120];

let state = load();
const t0 = todayStr();
const view = { tab: 'cal', y: +t0.slice(0, 4), m: +t0.slice(5, 7) };
{ // deep link: #plan, #table, #settings, #table/2026-10
  const [tab, ym] = location.hash.slice(1).split('/');
  if (['cal', 'table', 'plan', 'settings'].includes(tab)) view.tab = tab;
  if (/^\d{4}-\d{2}$/.test(ym || '')) { view.y = +ym.slice(0, 4); view.m = +ym.slice(5); }
}

const T = () => getT(state.settings.lang);

/* ---------- ngữ cảnh tính toán (có cache) ---------- */
let ctxCache = null, planCache = null, planKey = '';
function ctx() {
  if (ctxCache) return ctxCache;
  const memo = new Map();
  ctxCache = {
    settings: state.settings, st: settingsMin(state.settings), entries: state.entries, overrides: state.overrides,
    work(d) { let v = memo.get(d); if (v === undefined) { v = workOf(state.entries[d]); memo.set(d, v); } return v; },
  };
  return ctxCache;
}
function getPlan() {
  const key = `${todayStr()}|${Math.floor(nowMin() / 15)}`;
  if (!planCache || key !== planKey) {
    planKey = key;
    planCache = makePlan(ctx(), { start: todayStr(), nowMin: nowMin(), days: +state.settings.horizon || 14, mode: state.settings.mode });
  }
  return planCache;
}
function commit() {
  state.meta.dirty = true;
  save(state);
  ctxCache = null; planCache = null;
  render();
  scheduleSync();
}

/* ---------- định dạng ---------- */
const dateLoc = (d) => {
  const tr = T(), wd = dow(d);
  return tr.dateFormat(tr.dow[wd], d.slice(8), d.slice(5, 7));
};
const shiftTxt = (x) => `${hm(x.s % 1440)}–${hm(x.e % 1440)}${x.b ? T().shiftDurBreak(x.b) : ''}`;
const rangesTxt = (r) => (r.length ? r.map(([a, b]) => `${hm(a)}–${hm(b)}`).join(', ') : '—');
const jpTime = (s) => { const m = toMin(s); return m == null ? '' : m % 60 ? `${Math.floor(m / 60)}:${pad(m % 60)}` : String(m / 60); };
const jpHours = (m) => (m ? String(+(m / 60).toFixed(2)) : '');
const marker = (d) => MARKS[((diffDays(d, MARK_ANCHOR) % 6) + 6) % 6];

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- ghi dữ liệu ---------- */
function setEntry(date, data) {
  const empty = !data.s1 && !data.e1 && !data.s2 && !data.e2 && !data.note;
  state.entries[date] = empty ? { deleted: true, updatedAt: Date.now() } : { ...data, updatedAt: Date.now() };
}
function setOverride(date, off, busy) {
  state.overrides[date] = { off: !!off, busy: busy || '', updatedAt: Date.now() };
}
function entryWithShifts(date, add) {
  const e = { ...(state.entries[date]?.deleted ? {} : state.entries[date] || {}) };
  for (const x of add) {
    const k = !e.s1 && !e.e1 ? 1 : !e.s2 && !e.e2 ? 2 : 0;
    if (!k) break;
    e['s' + k] = timeValue(x.s); e['e' + k] = timeValue(x.e); e['b' + k] = x.b || 0;
  }
  return e;
}
function applySuggestion(day) {
  if (!day.suggested.length) return;
  setEntry(day.date, entryWithShifts(day.date, day.suggested));
}

/* =================================================================== */
/*                               RENDER                                */
/* =================================================================== */
function render() {
  const tr = T();
  document.documentElement.lang = state.settings.lang || 'vi';
  document.title = tr.appTitle;

  const topLang = $('#top-lang');
  if (topLang) topLang.value = state.settings.lang || 'vi';
  $('#go-today').textContent = tr.today;
  if ($('#install-text')) $('#install-text').innerHTML = tr.installPrompt;
  if ($('#lbl-tab-cal')) $('#lbl-tab-cal').textContent = tr.tabCal;
  if ($('#lbl-tab-table')) $('#lbl-tab-table').textContent = tr.tabTable;
  if ($('#lbl-tab-plan')) $('#lbl-tab-plan').textContent = tr.tabPlan;
  if ($('#lbl-tab-settings')) $('#lbl-tab-settings').textContent = tr.tabSettings;

  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === view.tab));
  const showMonth = view.tab === 'cal' || view.tab === 'table';
  $('#month-nav').hidden = !showMonth;
  $('#title').textContent = showMonth ? tr.monthFormat(view.y, view.m) : { plan: tr.tabPlan, settings: tr.tabSettings }[view.tab];
  const main = $('#main');
  main.innerHTML = { cal: renderCal, table: renderTable, plan: renderPlan, settings: renderSettings }[view.tab]();
  if (view.tab === 'settings') bindSettings();
  updateSyncBadge();
}

/* ---------- Tab Lịch (lưới) ---------- */
function renderCal() {
  const c = ctx(), st = c.st, { y, m } = view, tr = T();
  const ws = +state.settings.weekStart;
  const first = `${y}-${pad(m)}-01`;
  const off = (dow(first) - ws + 7) % 7;
  const start = addDays(first, -off);
  const n = daysInMonth(y, m);
  const cells = Math.ceil((off + n) / 7) * 7;
  const today = todayStr();
  const plan = getPlan();
  const sugg = Object.fromEntries(plan.days.map((d) => [d.date, d]));

  const mode = state.settings.calMode === 'roll' ? 'roll' : 'day';
  let html = `<div class="cal-toggle seg" role="tablist">
    <button data-calmode="day" class="${mode === 'day' ? 'on' : ''}">${tr.calToggleDay}</button>
    <button data-calmode="roll" class="${mode === 'roll' ? 'on' : ''}">${tr.calToggleRoll(st.windowDays)}</button></div>
  <div class="cal-head">${Array.from({ length: 7 }, (_, i) => `<span class="${[0, 6].includes((ws + i) % 7) ? 'we' : ''}">${tr.dow[(ws + i) % 7]}</span>`).join('')}</div><div class="cal-grid" id="cal-grid" data-mode="${mode}">`;
  for (let i = 0; i < cells; i++) {
    const d = addDays(start, i);
    const w = c.work(d);
    const viol = dayIssues(d, c, tr).length > 0;
    const s = sugg[d];
    const hint = s && s.extra > 0 ? `+${fmtDur(s.extra)}` : '';
    const ov = state.overrides[d];
    const roll = rollingSum(d, c.work, st.windowDays);
    const cls = [
      'cell', d.slice(0, 7) !== first.slice(0, 7) && 'other', d === today && 'today',
      [0, 6].includes(dow(d)) && 'we', w && 'has', viol && 'viol', d > today && w && 'future', ov?.off && 'off',
    ].filter(Boolean).join(' ');
    html += `<button class="${cls}" data-date="${d}" data-level="${Math.min(4, Math.ceil(w / 120))}">
      <span class="num">${+d.slice(8)}</span><span class="hrs">${w ? fmtDur(w) : ov?.off ? tr.offDay : ''}</span><span class="roll ${roll > st.weeklyLimit ? 'over' : ''}" title="${tr.calToggleRoll(st.windowDays)}">${roll ? `<i>${tr.calRollLine(st.windowDays)}</i> ${fmtDur(roll)}` : ''}</span><span class="hint">${hint}</span></button>`;
  }
  html += '</div>';

  // Tổng kết tháng
  let total = 0, daysWorked = 0, maxRoll = 0, viols = 0;
  for (let i = 1; i <= n; i++) {
    const d = `${y}-${pad(m)}-${pad(i)}`, w = c.work(d);
    total += w; if (w) daysWorked++;
    maxRoll = Math.max(maxRoll, rollingSum(d, c.work, st.windowDays));
    if (dayIssues(d, c, tr).length) viols++;
  }
  const t = plan.today;
  html += `
  <section class="card today-card" data-goto="plan">
    <div class="row"><b>${tr.today} ${dateLoc(t.date)}</b><span class="muted">${tr.worked} ${fmtDur(t.worked)}</span></div>
    <div class="big-stats">
      <div><small>${tr.legalAllowed}</small><strong>${fmtDur(t.legal)}</strong></div>
      <div><small>${tr.practicalCapacity}</small><strong>${fmtDur(t.practical)}</strong></div>
      <div><small>${tr.recommended}</small><strong class="accent">${fmtDur(t.recommended)}</strong></div>
    </div>
    ${t.suggested.length ? `<div class="muted">${tr.suggestionPrefix} ${t.suggested.map(shiftTxt).join(' + ')}</div>` : ''}
  </section>
  <section class="card stats">
    <div><small>${tr.monthTotal}</small><strong>${fmtDur(total)}</strong></div>
    <div><small>${tr.workDays}</small><strong>${daysWorked}</strong></div>
    <div><small>${tr.maxRolling(st.windowDays)}</small><strong class="${maxRoll > st.weeklyLimit ? 'bad' : ''}">${fmtDur(maxRoll)}</strong></div>
    <div><small>${tr.violations}</small><strong class="${viols ? 'bad' : 'good'}">${viols}</strong></div>
  </section>
  <p class="legend"><span class="lg l2"></span>${tr.workedLegend} <span class="lg hintlg">+4h</span>${tr.suggestLegend} <span class="lg violg"></span>${tr.violationLegend} · ${tr.swipeHint}</p>`;
  return html;
}

/* ---------- Tab Bảng tháng (giống mẫu báo cáo) ---------- */
function reportTable(y, m, forPdf = false) {
  const c = ctx(), st = c.st, tr = T();
  const n = daysInMonth(y, m);
  const showMark = state.settings.showMarker;
  let total = 0, dw = 0, rows = '';
  for (let i = 1; i <= n; i++) {
    const d = `${y}-${pad(m)}-${pad(i)}`;
    const e = state.entries[d]?.deleted ? {} : state.entries[d] || {};
    const w = c.work(d); total += w; if (w) dw++;
    const roll = rollingSum(d, c.work, st.windowDays);
    const wd = dow(d);
    const bad = dayIssues(d, c, tr).length > 0;
    const [mk, col] = marker(d);
    rows += `<tr class="${i % 2 ? '' : 'alt'} ${bad ? 'bad-row' : ''}" data-date="${forPdf ? '' : d}">
      <td class="dt">${m}月 ${i} 日</td><td class="wd ${wd === 0 || wd === 6 ? 'we' : ''}">${JP_DOW[wd]}</td>
      <td>${jpTime(e.s1)}</td><td class="t">~</td><td>${jpTime(e.e1)}</td><td class="br">${jpHours(+e.b1 || 0)}</td>
      <td>${jpTime(e.s2)}</td><td class="t">~</td><td>${jpTime(e.e2)}</td><td class="br">${jpHours(+e.b2 || 0)}</td>
      <td class="num">${+(w / 60).toFixed(2)}</td><td class="u">${tr.rtableHours}</td>
      ${showMark ? `<td class="mk"><span style="background:${col}">${mk}</span></td>` : ''}
      <td class="roll ${roll > st.weeklyLimit ? 'over' : ''}">${fmtJP(roll)}</td></tr>`;
  }
  return `<div class="report" ${forPdf ? 'id="pdf-report"' : ''}>
    <div class="report-title"><b>${esc(state.settings.reportTitle)} ${y}年${m}月</b><span>${esc(state.settings.ownerName)}</span></div>
    <table class="rtable"><thead><tr>
      <th>${tr.rtableDate}</th><th>${tr.rtableDow}</th><th colspan="3">${tr.rtableShift1}</th><th>${tr.rtableBreak}</th><th colspan="3">${tr.rtableShift2}</th><th>${tr.rtableBreak}</th>
      <th colspan="2">${tr.rtableWork}</th>${showMark ? '<th></th>' : ''}<th>${tr.rtableRolling(st.windowDays)}</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <div class="report-foot">${tr.rtableFootTotal}: <b>${fmtJP(total)}</b> ・ ${tr.rtableFootDays}: <b>${dw} ${tr.rtableFootDaysUnit}</b> ・ ${tr.rtableFootLimit}: ${st.windowDays}日間 ${fmtDur(st.weeklyLimit)}</div>
  </div>`;
}
function renderTable() {
  const tr = T();
  return `<div class="toolbar"><button class="btn primary" id="btn-pdf">${tr.exportPdfBtn(view.m)}</button><button class="btn" id="btn-print">${tr.printBtn}</button></div>
    <div class="table-scroll">${reportTable(view.y, view.m)}</div>
    <p class="muted small">${tr.tableFooterHint(ctx().st.windowDays)}</p>`;
}

async function exportPdf() {
  const tr = T();
  const host = $('#pdf-host');
  host.innerHTML = reportTable(view.y, view.m, true);
  toast(tr.generatingPdf);
  try {
    const blob = await renderPdf($('#pdf-report'));
    const name = `timesheet-${view.y}-${pad(view.m)}.pdf`;
    const file = new File([blob], name, { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    openModal(`<h3>${tr.pdfReady(view.m, view.y)}</h3>
      <div class="col">
        ${navigator.canShare?.({ files: [file] }) ? `<button class="btn primary" id="pdf-share">${tr.pdfShareBtn}</button>` : ''}
        <a class="btn" href="${url}" download="${name}" target="_blank" rel="noopener">${tr.pdfOpenBtn}</a>
        <button class="btn ghost" data-close>${tr.closeBtn}</button></div>`);
    $('#pdf-share')?.addEventListener('click', () => navigator.share({ files: [file], title: name }).catch(() => {}));
  } catch (e) {
    toast(tr.pdfError(e.message));
  } finally {
    host.innerHTML = '';
  }
}
function printReport() {
  $('#pdf-host').innerHTML = reportTable(view.y, view.m, true);
  document.body.classList.add('printing');
  setTimeout(() => { window.print(); document.body.classList.remove('printing'); $('#pdf-host').innerHTML = ''; }, 50);
}

/* ---------- Tab Gợi ý ---------- */
function renderPlan() {
  const c = ctx(), st = c.st, s = state.settings, tr = T();
  const p = getPlan(), t = p.today;
  const maxBar = Math.max(st.weeklyLimit, ...p.days.map((d) => d.rolling));
  const bars = p.days.map((d) => `<div class="bar ${d.rolling > st.weeklyLimit ? 'over' : ''}" title="${d.date}">
      <span style="height:${(d.rolling / maxBar) * 100}%"></span><small>${+d.date.slice(8)}</small></div>`).join('');
  const limitPos = (st.weeklyLimit / maxBar) * 100;
  const targetPos = (st.target / maxBar) * 100;

  const rows = p.days.map((d) => {
    const fixed = d.existing.map(shiftTxt).join(' + ');
    const sug = d.suggested.map(shiftTxt).join(' + ');
    return `<li class="${d.date === t.date ? 'is-today' : ''}">
      <div class="d"><b>${dateLoc(d.date)}</b><small>${st.windowDays}d: ${fmtDur(d.rolling)}</small></div>
      <div class="s">
        ${fixed ? `<div>📌 ${fixed}</div>` : ''}
        ${sug ? `<div class="sug">✨ ${sug} <b>+${fmtDur(d.extra)}</b></div>` : ''}
        ${!fixed && !sug ? `<div class="muted">${tr.offSchedule}</div>` : ''}
      </div>
      <div class="a">${sug ? `<button class="btn sm" data-apply="${d.date}">${tr.applyBtn}</button>` : `<button class="btn sm ghost" data-date="${d.date}">${tr.editBtn}</button>`}</div></li>`;
  }).join('');

  const free = p.days.map((d) => `<li><b>${dateLoc(d.date)}</b><span>${rangesTxt(d.freeAfter)}</span></li>`).join('');

  return `
  <section class="card today-card">
    <div class="row"><b>${tr.today} ${dateLoc(t.date)}</b><span class="muted">${tr.worked} ${fmtDur(t.worked)}</span></div>
    <div class="big-stats">
      <div><small>${tr.legalAllowed}</small><strong>${fmtDur(t.legal)}</strong></div>
      <div><small>${tr.practicalCapacity} ${tr.practicalSub}</small><strong>${fmtDur(t.practical)}</strong></div>
      <div><small>${tr.recommended}</small><strong class="accent">${fmtDur(t.recommended)}</strong></div>
    </div>
    ${t.suggested.length ? `<div class="row"><span>✨ ${t.suggested.map(shiftTxt).join(' + ')}</span><button class="btn sm primary" data-apply="${t.date}">${tr.applyBtn}</button></div>` : ''}
    <p class="muted small">${tr.legalHelpText(st.windowDays)}</p>
  </section>

  <section class="card">
    <div class="seg" role="tablist">
      <button data-mode="balanced" class="${s.mode !== 'early' ? 'on' : ''}">${tr.modeBalanced}</button>
      <button data-mode="early" class="${s.mode === 'early' ? 'on' : ''}">${tr.modeEarly}</button>
    </div>
    <div class="row gap wrap">
      <label>${tr.horizonLabel} <select id="pl-horizon">${[7, 14, 21, 28, 42].map((v) => `<option ${+s.horizon === v ? 'selected' : ''} value="${v}">${tr.daysUnit(v)}</option>`).join('')}</select></label>
      <label>${tr.targetLabel(st.windowDays)} <input id="pl-target" type="number" inputmode="decimal" min="0" max="${s.weeklyLimitH}" step="0.5" value="${s.targetWeeklyH}">${tr.unitH}</label>
    </div>
    <div class="chart"><div class="limit" style="bottom:${limitPos}%"><em>${fmtDur(st.weeklyLimit)}</em></div>
      ${st.target < st.weeklyLimit ? `<div class="limit target" style="bottom:${targetPos}%"></div>` : ''}${bars}</div>
    <p class="muted small center">${tr.chartFoot(st.windowDays, fmtDur(p.totalSuggested))}</p>
  </section>

  <section class="card">
    <div class="row"><h3>${tr.upcomingPlan}</h3>${p.totalSuggested ? `<button class="btn sm primary" id="apply-all">${tr.applyAllBtn}</button>` : ''}</div>
    <ul class="plan-list">${rows}</ul>
  </section>
  <section class="card">
    <h3>${tr.upcomingFree}</h3>
    <ul class="free-list">${free}</ul>
    <p class="muted small">${tr.freeFootHint}</p>
  </section>`;
}

/* ---------- Mẫu ca nhanh (có thể chỉnh sửa) ---------- */
const tplList = () => parseRanges(state.settings.templates);
function tplSave(list) {
  state.settings.templates = list.map(([a, b]) => `${hm(a)}-${hm(b)}`).join(', ');
  state.settings.updatedAt = Date.now();
  state.meta.dirty = true;
  save(state);
  scheduleSync();
}
function tplEditorHTML(list, tr, withDone) {
  return `<div class="tpl-edit">${list.map(([a, b], i) => `<div class="tpl-row">
      <input type="time" data-tpl-s value="${timeValue(a)}" step="900"><span>→</span>
      <input type="time" data-tpl-e value="${timeValue(b)}" step="900">
      <button type="button" class="x" data-tpl-del="${i}" aria-label="Delete">🗑</button></div>`).join('')}
    <div class="row gap"><button type="button" class="btn sm" data-tpl-add>${tr.tplAdd}</button>${withDone ? `<button type="button" class="btn sm primary" data-tpl-done>${tr.tplDone}</button>` : ''}</div></div>`;
}
/** Gắn sự kiện cho bộ sửa mẫu ca. onChange(list, rerender) được gọi khi dữ liệu hợp lệ thay đổi. */
function bindTplEditor(root, onChange) {
  const tr = T();
  const raw = () => $$('.tpl-row', root).map((r) => {
    const s = toMin($('[data-tpl-s]', r).value), e0 = toMin($('[data-tpl-e]', r).value);
    return [s, e0 === 0 ? 1440 : e0];
  });
  const valid = (l) => l.every(([s, e]) => s != null && e != null && e > s);
  $$('[data-tpl-s], [data-tpl-e]', root).forEach((el) => el.addEventListener('change', () => {
    const l = raw();
    if (!valid(l)) { toast(tr.timeInvalid); return; }
    onChange(l, false);
  }));
  $$('[data-tpl-del]', root).forEach((b) => b.addEventListener('click', () => {
    const l = raw(); l.splice(+b.dataset.tplDel, 1);
    if (!valid(l)) { toast(tr.timeInvalid); return; }
    onChange(l, true);
  }));
  $$('[data-tpl-add]', root).forEach((b) => b.addEventListener('click', () => {
    const l = raw();
    if (!valid(l)) { toast(tr.timeInvalid); return; }
    l.push([480, 720]); onChange(l, true);
  }));
}

/* ---------- Tab Cài đặt ---------- */
const DAYS_ORDER = [1, 2, 3, 4, 5, 6, 0];
const endStr = (v) => (v === '00:00' ? '24:00' : v);
const endMin = (v) => (v === '00:00' ? 1440 : toMin(v));
function getAvail(d) {
  const r = parseRanges(state.settings.availability[d]);
  if (r.length) return { on: true, s: r[0][0], e: r[r.length - 1][1] };
  return { on: false, s: toMin(state.settings.workStart) ?? 420, e: endMin(state.settings.workEnd) ?? 1320 };
}

function renderSettings() {
  const s = state.settings, sc = loadSync(), tr = T();
  const num = (k, label, step = 0.5, unit = tr.unitH) => `<label class="f"><span>${label}</span><span><input data-set="${k}" type="number" inputmode="decimal" step="${step}" value="${esc(s[k])}"> ${unit}</span></label>`;
  const langOpts = LANGS.map((l) => `<option value="${l.code}" ${(s.lang || 'vi') === l.code ? 'selected' : ''}>${l.name}</option>`).join('');
  const locCode = { vi: 'vi-VN', en: 'en-US', ja: 'ja-JP' }[s.lang || 'vi'] || 'vi-VN';

  const avRows = DAYS_ORDER.map((d) => {
    const a = getAvail(d);
    return `<div class="av-row${a.on ? '' : ' off'}">
      <label class="av-day"><input type="checkbox" data-av-on="${d}" ${a.on ? 'checked' : ''}><span>${tr.dow[d]}</span></label>
      <input type="time" data-av-s="${d}" value="${timeValue(a.s)}" step="900" ${a.on ? '' : 'disabled'}><span>→</span>
      <input type="time" data-av-e="${d}" value="${timeValue(a.e)}" step="900" ${a.on ? '' : 'disabled'}></div>`;
  }).join('');

  const busy = (s.busyRules || []).map((r) => `<div class="busy-card" data-rule="${esc(r.id)}">
      <div class="row"><input class="grow" data-b-label placeholder="${esc(tr.busyLabelPh)}" value="${esc(r.label || '')}"><button type="button" class="x" data-b-del aria-label="Delete">🗑</button></div>
      <div class="day-chips">${DAYS_ORDER.map((d) => `<button type="button" class="dchip ${(r.days || []).includes(d) ? 'on' : ''}" data-b-day="${d}">${tr.dow[d]}</button>`).join('')}</div>
      <div class="row gap"><input type="time" data-b-s value="${esc(r.s)}" step="900"><span>→</span><input type="time" data-b-e value="${esc(r.e)}" step="900"></div></div>`).join('');

  return `
  <section class="card"><h3>${tr.secWorkTime}</h3>
    <p class="muted small">${tr.workTimeHelp}</p>
    <div class="av-default"><span>${tr.workDefaultLabel}</span>
      <input type="time" data-set="workStart" value="${esc(s.workStart)}" step="900"><span>→</span>
      <input type="time" data-set="workEnd" value="${esc(s.workEnd)}" step="900"></div>
    ${avRows}
    <button class="btn sm" id="av-all">${tr.applyToEnabled}</button>
  </section>
  <section class="card"><h3>${tr.secBusy}</h3>
    <p class="muted small">${tr.busyHelp}</p>
    ${busy || `<p class="muted small center">${tr.busyNone}</p>`}
    <button class="btn" id="busy-add">${tr.busyAdd}</button>
  </section>
  <section class="card"><h3>${tr.secRules}</h3>
    ${num('weeklyLimitH', tr.weeklyLimitH)}
    ${num('windowDays', tr.windowDays, 1, tr.unitDays)}
    ${num('maxContH', tr.maxContH)}
    ${num('minBreakMin', tr.minBreakMin, 5, tr.unitMin)}
  </section>
  <section class="card"><h3>${tr.secAlgorithm}</h3>
    ${num('targetWeeklyH', tr.targetWeeklyH)}
    ${num('maxPerDayH', tr.maxPerDayH)}
    ${num('minShiftH', tr.minShiftH)}
    <label class="f col"><span>${tr.prefRanges}</span><input data-set="preferred" value="${esc(s.preferred)}"></label>
  </section>
  <section class="card"><h3>${tr.secInputReport}</h3>
    <label class="f"><span>${tr.langLabel}</span><select data-set="lang">${langOpts}</select></label>
    <h4>${tr.templates}</h4>
    <div id="tpl-settings">${tplEditorHTML(tplList(), tr, false)}</div>
    <label class="f"><span>${tr.reportTitle}</span><input data-set="reportTitle" value="${esc(s.reportTitle)}"></label>
    <label class="f"><span>${tr.ownerName}</span><input data-set="ownerName" value="${esc(s.ownerName)}"></label>
    <label class="f"><span>${tr.weekStart}</span><select data-set="weekStart"><option value="1" ${+s.weekStart === 1 ? 'selected' : ''}>${tr.mon}</option><option value="0" ${+s.weekStart === 0 ? 'selected' : ''}>${tr.sun}</option></select></label>
    <label class="f"><span>${tr.showMarker}</span><input type="checkbox" data-set="showMarker" ${s.showMarker ? 'checked' : ''}></label>
  </section>
  <section class="card"><h3>${tr.secBackup}</h3>
    <p class="muted small">${tr.backupHelp}</p>
    <label class="f col"><span>${tr.githubToken}</span><input id="sync-token" type="password" autocomplete="off" value="${esc(sc.token || '')}" placeholder="github_pat_…"></label>
    <label class="f col"><span>${tr.gistIdLabel}</span><input id="sync-gist" value="${esc(sc.gistId || '')}"></label>
    <div class="row gap wrap">
      <button class="btn primary" id="sync-now">${tr.syncNow}</button>
      <button class="btn" id="exp-json">${tr.exportJson}</button>
      <label class="btn">${tr.importJson}<input type="file" id="imp-json" accept="application/json,.json" hidden></label>
    </div>
    <p class="muted small">${tr.lastSync}: ${state.meta.lastSync ? new Date(state.meta.lastSync).toLocaleString(locCode) : tr.never} ${state.meta.dirty ? tr.dirtyPending : ''}</p>
  </section>
  <section class="card"><button class="btn danger" id="reset">${tr.resetLocalBtn}</button></section>
  <p class="muted small center">${tr.footerText}</p>`;
}

function bindSettings() {
  const tr = T();
  const touch = () => { state.settings.updatedAt = Date.now(); };

  $$('[data-set]').forEach((el) => el.addEventListener('change', () => {
    const k = el.dataset.set;
    state.settings[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' || k === 'weekStart' ? +el.value : el.value;
    touch(); commit();
  }));

  // Khung giờ làm việc theo thứ
  $$('[data-av-on]').forEach((el) => el.addEventListener('change', () => {
    const d = el.dataset.avOn;
    state.settings.availability[d] = el.checked ? `${state.settings.workStart}-${endStr(state.settings.workEnd)}` : '';
    touch(); commit();
  }));
  const setAv = (d) => {
    const s = $(`[data-av-s="${d}"]`).value, e = $(`[data-av-e="${d}"]`).value;
    if (toMin(s) == null || endMin(e) == null || endMin(e) <= toMin(s)) { toast(tr.timeInvalid); render(); return; }
    state.settings.availability[d] = `${s}-${endStr(e)}`;
    touch(); commit();
  };
  $$('[data-av-s], [data-av-e]').forEach((el) => el.addEventListener('change', () => setAv(el.dataset.avS ?? el.dataset.avE)));
  $('#av-all').addEventListener('click', () => {
    const { workStart, workEnd } = state.settings;
    if (toMin(workStart) == null || endMin(workEnd) == null || endMin(workEnd) <= toMin(workStart)) { toast(tr.timeInvalid); return; }
    DAYS_ORDER.forEach((d) => { if (getAvail(d).on) state.settings.availability[d] = `${workStart}-${endStr(workEnd)}`; });
    touch(); commit();
  });

  // Thời gian bận lặp lại
  const rules = () => (state.settings.busyRules ||= []);
  $('#busy-add').addEventListener('click', () => {
    rules().push({ id: Date.now().toString(36), days: [1, 2, 3, 4, 5], s: '12:00', e: '13:00', label: '' });
    touch(); commit();
  });
  $$('[data-rule]').forEach((card) => {
    const rule = () => rules().find((x) => x.id === card.dataset.rule);
    $('[data-b-label]', card).addEventListener('change', (ev) => { rule().label = ev.target.value; touch(); commit(); });
    $('[data-b-del]', card).addEventListener('click', () => {
      state.settings.busyRules = rules().filter((x) => x.id !== card.dataset.rule); touch(); commit();
    });
    $$('[data-b-day]', card).forEach((b) => b.addEventListener('click', () => {
      const r = rule(), d = +b.dataset.bDay;
      r.days = (r.days || []).includes(d) ? r.days.filter((v) => v !== d) : [...(r.days || []), d];
      touch(); commit();
    }));
    const setTime = () => {
      const s = $('[data-b-s]', card).value, e = $('[data-b-e]', card).value;
      if (toMin(s) == null || endMin(e) == null || endMin(e) <= toMin(s)) { toast(tr.timeInvalid); render(); return; }
      const r = rule(); r.s = s; r.e = endStr(e);
      touch(); commit();
    };
    $('[data-b-s]', card).addEventListener('change', setTime);
    $('[data-b-e]', card).addEventListener('change', setTime);
  });

  // Mẫu ca nhanh
  bindTplEditor($('#tpl-settings'), (list, rerender) => { tplSave(list); if (rerender) commit(); });

  // Sao lưu / đồng bộ
  const saveCfg = () => saveSync({ ...loadSync(), token: $('#sync-token').value.trim(), gistId: $('#sync-gist').value.trim() });
  $('#sync-token').addEventListener('change', saveCfg);
  $('#sync-gist').addEventListener('change', saveCfg);
  $('#sync-now').addEventListener('click', () => { saveCfg(); syncNow(true); });
  $('#exp-json').addEventListener('click', exportJson);
  $('#imp-json').addEventListener('change', importJson);
  $('#reset').addEventListener('click', () => {
    if (!confirm(tr.resetConfirm)) return;
    const curLang = state.settings.lang;
    resetAll(); state = load(); state.settings.lang = curLang; save(state); ctxCache = planCache = null; render();
  });
}

/* ---------- Sửa một ngày (bottom sheet) ---------- */
function openEditor(date) {
  const tr = T();
  const e = state.entries[date]?.deleted ? {} : state.entries[date] || {};
  const ov = state.overrides[date] || {};
  const day = getPlan().days.find((d) => d.date === date);
  const tpl = parseRanges(state.settings.templates);
  const wd = dow(date);
  const brSel = (id, v) => `<select id="${id}">${BREAKS.map((b) => `<option value="${b}" ${+v === b ? 'selected' : ''}>${b ? b + "'" : '0'}</option>`).join('')}</select>`;
  const shiftRow = (k) => `<div class="shift"><span class="lbl">${tr.shift(k)}</span>
      <input type="time" id="s${k}" value="${esc(e['s' + k] || '')}" step="300"><span>→</span>
      <input type="time" id="e${k}" value="${esc(e['e' + k] || '')}" step="300">
      <label class="brk">${tr.breakWord} ${brSel('b' + k, e['b' + k] || 0)}</label>
      <button class="x" data-clear="${k}" aria-label="Clear ${k}">✕</button></div>`;

  const headTitle = tr.editorHeaderDate(tr.dowFull[wd], date.slice(8), date.slice(5, 7), date.slice(0, 4), JP_DOW[wd]);

  openModal(`
    <div class="sheet-head"><b>${headTitle}</b><button class="x" data-close>✕</button></div>
    <div id="chips-wrap"></div>
    ${shiftRow(1)}${shiftRow(2)}
    <textarea id="note" rows="2" placeholder="${esc(tr.notePlaceholder)}">${esc(e.note || '')}</textarea>
    <details ${ov.off || ov.busy ? 'open' : ''}><summary>${tr.busySection}</summary>
      <label class="f"><span>${tr.offAllDay}</span><input type="checkbox" id="ov-off" ${ov.off ? 'checked' : ''}></label>
      <label class="f col"><span>${tr.busyRangesLabel}</span><input id="ov-busy" value="${esc(ov.busy || '')}" placeholder="${esc(tr.busyRangesPlaceholder)}"></label>
    </details>
    <div id="live" class="live"></div>
    <div class="row gap sheet-actions"><button class="btn danger ghost" id="ed-del">${tr.delDayBtn}</button><button class="btn primary grow" id="ed-save">${tr.saveBtn}</button></div>
  `, 'sheet');

  const read = () => ({
    s1: $('#s1').value, e1: $('#e1').value, b1: +$('#b1').value,
    s2: $('#s2').value, e2: $('#e2').value, b2: +$('#b2').value, note: $('#note').value.trim(),
  });
  const live = () => {
    const tmp = read(), c = ctx(), st = c.st;
    const w = workOf(tmp);
    const gw = (d) => (d === date ? w : c.work(d));
    const roll = rollingSum(date, gw, st.windowDays);
    const rem = legalRemaining(date, gw, st);
    const issues = breakIssues(shiftsOf(tmp), st, tr);
    let maxWin = 0;
    for (let k = 0; k < st.windowDays; k++) maxWin = Math.max(maxWin, rollingSum(addDays(date, k), gw, st.windowDays));
    if (maxWin > st.weeklyLimit) issues.push(tr.issuesWindowAny(st.windowDays, fmtDur(maxWin), fmtDur(st.weeklyLimit)));
    $('#live').innerHTML = `<div class="big-stats sm">
        <div><small>${tr.editorWork}</small><strong>${fmtDur(w)}</strong></div>
        <div><small>${tr.editorRolling(st.windowDays)}</small><strong class="${roll > st.weeklyLimit ? 'bad' : ''}">${fmtDur(roll)}</strong></div>
        <div><small>${tr.editorRemaining}</small><strong class="accent">${fmtDur(rem)}</strong></div></div>
      ${issues.length ? `<ul class="issues">${issues.map((x) => `<li>⚠️ ${esc(x)}</li>`).join('')}</ul>` : w ? `<div class="ok">${tr.validOk}</div>` : ''}`;
  };
  const fill = (shifts) => {
    for (const x of shifts) {
      const k = !$('#s1').value && !$('#e1').value ? 1 : !$('#s2').value && !$('#e2').value ? 2 : 0;
      if (!k) { toast(tr.twoShiftsLimit); break; }
      $('#s' + k).value = timeValue(x.s); $('#e' + k).value = timeValue(x.e); $('#b' + k).value = String(x.b || 0);
    }
    live();
  };
  const sheet = $('#modal');
  sheet.addEventListener('input', live);
  sheet.addEventListener('change', live);
  // Mẫu ca nhanh: bấm để điền, nút ✏️ để chỉnh sửa danh sách mẫu
  const renderChips = (editing = false) => {
    const wrap = $('#chips-wrap');
    if (editing) {
      wrap.innerHTML = `<div class="tpl-box">${tplEditorHTML(tplList(), tr, true)}</div>`;
      bindTplEditor(wrap, (list, rerender) => { tplSave(list); if (rerender) renderChips(true); });
      $('[data-tpl-done]', wrap).addEventListener('click', () => renderChips(false));
      return;
    }
    const list = tplList();
    wrap.innerHTML = `<div class="chips">${list.map(([a, b]) => `<button class="chip" data-tpl="${a}-${b}">${hm(a)}–${hm(b)}</button>`).join('')}
      ${day?.suggested.length ? `<button class="chip accent" id="use-sugg">${tr.suggestionPrefix} ${day.suggested.map(shiftTxt).join(' + ')}</button>` : ''}
      <button class="chip edit" id="tpl-edit" aria-label="${esc(tr.tplEditBtn)}">✏️ ${tr.tplEditBtn}</button></div>`;
    $$('[data-tpl]', wrap).forEach((b) => b.addEventListener('click', () => {
      const [a, z] = b.dataset.tpl.split('-').map(Number);
      const L = z - a, st = ctx().st;
      const br = L > st.maxCont ? Math.ceil((L - st.maxCont) / (st.maxCont + st.minBreak)) * st.minBreak : 0;
      fill([{ s: a, e: z, b: br }]);
    }));
    $('#use-sugg')?.addEventListener('click', () => fill(day.suggested));
    $('#tpl-edit').addEventListener('click', () => renderChips(true));
  };
  renderChips(false);
  $$('[data-clear]', sheet).forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.clear; $('#s' + k).value = ''; $('#e' + k).value = ''; $('#b' + k).value = '0'; live();
  }));
  $('#ed-save').addEventListener('click', () => {
    const data = read();
    if ((!!data.s1 !== !!data.e1) || (!!data.s2 !== !!data.e2)) { toast(tr.needBothTimes); return; }
    setEntry(date, data);
    const off = $('#ov-off').checked, busy = $('#ov-busy').value.trim();
    if (off !== !!ov.off || busy !== (ov.busy || '')) setOverride(date, off, busy);
    closeModal(); commit(); toast(tr.savedToast);
  });
  $('#ed-del').addEventListener('click', () => {
    setEntry(date, {}); closeModal(); commit(); toast(tr.deletedToast);
  });
  live();
}

/* ---------- Modal ---------- */
function openModal(html, kind = 'dialog') {
  const m = $('#modal');
  m.className = `modal ${kind}`;
  m.innerHTML = html;
  $('#backdrop').hidden = false; m.hidden = false;
  requestAnimationFrame(() => { $('#backdrop').classList.add('show'); m.classList.add('show'); });
  $$('[data-close]', m).forEach((b) => b.addEventListener('click', closeModal));
}
function closeModal() {
  const m = $('#modal');
  m.replaceWith(m.cloneNode(false)); // bỏ toàn bộ listener cũ
  const n = $('#modal'); n.hidden = true; n.className = 'modal';
  $('#backdrop').classList.remove('show'); $('#backdrop').hidden = true;
}

/* ---------- Sao lưu / đồng bộ ---------- */
let syncing = false, syncTimer = null;
function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(false), 3000); }
function updateSyncBadge(st) {
  const b = $('#sync-badge'), cfg = loadSync(), tr = T();
  const s = st || (!navigator.onLine ? 'offline' : !cfg.token ? 'local' : state.meta.dirty ? 'dirty' : 'ok');
  b.dataset.state = s;
  b.title = tr.syncStates[s];
  b.textContent = { offline: '📴', local: '💾', dirty: '⏫', ok: '☁️', syncing: '🔄', error: '⚠️' }[s];
}
async function syncNow(manual) {
  const cfg = loadSync(), tr = T();
  if (!cfg.token) { if (manual) toast(tr.syncNoToken); return updateSyncBadge(); }
  if (!navigator.onLine) { if (manual) toast(tr.syncOffline); return updateSyncBadge(); }
  if (syncing) return;
  syncing = true; updateSyncBadge('syncing');
  try {
    if (cfg.gistId) {
      const remote = await pull(cfg);
      if (remote) Object.assign(state, merge(state, remote));
    }
    const id = await push(cfg, payload(state));
    if (!cfg.gistId) saveSync({ ...cfg, gistId: id });
    state.meta.dirty = false; state.meta.lastSync = Date.now();
    save(state); ctxCache = planCache = null;
    render();
    if (manual) toast(tr.syncSuccess);
  } catch (e) {
    updateSyncBadge('error');
    if (manual) toast(tr.syncError(e.message));
  } finally { syncing = false; }
}
function exportJson() {
  const blob = new Blob([JSON.stringify(payload(state), null, 1)], { type: 'application/json' });
  const name = `timesheet-backup-${todayStr()}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) navigator.share({ files: [file], title: name }).catch(() => {});
  else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); }
}
async function importJson(ev) {
  const f = ev.target.files[0], tr = T();
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data.entries) throw new Error('Invalid JSON format');
    Object.assign(state, merge(state, data));
    commit(); toast(tr.importSuccess);
  } catch (e) { toast(tr.importError(e.message)); }
}

/* ---------- Sự kiện chung ---------- */
function shiftMonth(delta) {
  let m = view.m + delta, y = view.y;
  if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
  view.m = m; view.y = y; render();
}
document.addEventListener('click', (ev) => {
  const t = ev.target.closest('button, [data-goto], tr[data-date]');
  if (!t || t.closest('#modal')) return;
  if (t.dataset.tab) { view.tab = t.dataset.tab; planCache = null; render(); window.scrollTo(0, 0); return; }
  if (t.dataset.goto) { view.tab = t.dataset.goto; render(); return; }
  if (t.dataset.date) return openEditor(t.dataset.date);
  if (t.dataset.apply) {
    const d = getPlan().days.find((x) => x.date === t.dataset.apply);
    if (d) { applySuggestion(d); commit(); toast(T().appliedSuggestion(dateLoc(d.date))); }
    return;
  }
  if (t.dataset.calmode) { state.settings.calMode = t.dataset.calmode; save(state); render(); return; }
  if (t.dataset.mode) { state.settings.mode = t.dataset.mode; state.settings.updatedAt = Date.now(); commit(); return; }
  switch (t.id) {
    case 'prev': return shiftMonth(-1);
    case 'next': return shiftMonth(1);
    case 'go-today': { const d = todayStr(); view.y = +d.slice(0, 4); view.m = +d.slice(5, 7); return render(); }
    case 'btn-pdf': return exportPdf();
    case 'btn-print': return printReport();
    case 'apply-all':
      getPlan().days.forEach(applySuggestion); commit(); toast(T().appliedAll); return;
    case 'sync-badge': return syncNow(true);
  }
});
document.addEventListener('change', (ev) => {
  if (ev.target.closest('#modal')) return;
  if (ev.target.id === 'top-lang') { state.settings.lang = ev.target.value; state.settings.updatedAt = Date.now(); commit(); }
  if (ev.target.id === 'pl-horizon') { state.settings.horizon = +ev.target.value; state.settings.updatedAt = Date.now(); commit(); }
  if (ev.target.id === 'pl-target') { state.settings.targetWeeklyH = +ev.target.value; state.settings.updatedAt = Date.now(); commit(); }
});
$('#backdrop').addEventListener('click', closeModal);

// Vuốt ngang trên lưới lịch để đổi tháng
let tx = null, ty = null;
document.addEventListener('touchstart', (e) => {
  if (!e.target.closest('#cal-grid')) return;
  tx = e.touches[0].clientX; ty = e.touches[0].clientY;
}, { passive: true });
document.addEventListener('touchend', (e) => {
  if (tx == null) return;
  const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
  tx = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) shiftMonth(dx < 0 ? 1 : -1);
}, { passive: true });

window.addEventListener('online', () => { updateSyncBadge(); if (state.meta.dirty) syncNow(false); });
window.addEventListener('offline', () => updateSyncBadge());
document.addEventListener('visibilitychange', () => { if (!document.hidden) { planCache = null; render(); } });

// Gợi ý cài lên màn hình chính trên iOS
const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
if (!standalone && /iphone|ipad|ipod/i.test(navigator.userAgent) && !localStorage.getItem('hideInstall')) {
  $('#install').hidden = false;
  $('#install button').addEventListener('click', () => { localStorage.setItem('hideInstall', '1'); $('#install').hidden = true; });
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
syncNow(false);
