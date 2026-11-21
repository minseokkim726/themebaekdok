// 규칙 계산 (순수 함수). DOM·저장소에 접근하지 않는다.
// 날짜는 모두 'YYYY-MM-DD' 문자열(기기 현지 날짜)로 주고받는다.

export const DEFAULT_SETTINGS = Object.freeze({
  minPages: 20,
  acceptPages: 10,
  goalPages: 50,
  minMinutes: 30,
  weeklyBooks: 1,
  weekStartsOn: 1, // 0=일, 1=월
  lastBackupAt: null,
});

// 명세 4장: 목표선은 50쪽 또는 60분 (60분은 설정 항목이 아님)
export const GOAL_MINUTES = 60;

export const GRADES = ['none', 'accept', 'min', 'goal'];
const RANK = { none: 0, accept: 1, min: 2, goal: 3 };
export const gradeRank = (g) => RANK[g] ?? 0;
export const atLeast = (g, target) => gradeRank(g) >= gradeRank(target);

// ---------- 날짜 ----------
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateStr(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  return fromUTC(toUTC(s)) === s;
}
function toUTC(s) {
  const [, y, m, d] = DATE_RE.exec(s);
  return Date.UTC(+y, +m - 1, +d);
}
function fromUTC(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
export function addDays(s, n) {
  return fromUTC(toUTC(s) + n * 86400000);
}
export function daysBetween(a, b) {
  // b - a (일 수)
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}
export function dayOfWeek(s) {
  return new Date(toUTC(s)).getUTCDay(); // 0=일
}
export function weekStart(s, weekStartsOn = 1) {
  const diff = (dayOfWeek(s) - weekStartsOn + 7) % 7;
  return addDays(s, -diff);
}
export function weekDays(s, weekStartsOn = 1) {
  const start = weekStart(s, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
export function weekEnd(s, weekStartsOn = 1) {
  return addDays(weekStart(s, weekStartsOn), 6);
}
// 이번 주 남은 날 수(오늘 포함)
export function daysLeftInWeek(s, weekStartsOn = 1) {
  return daysBetween(s, weekEnd(s, weekStartsOn)) + 1;
}

// ---------- 등급 ----------
export function gradeOf(record, settings = DEFAULT_SETTINGS) {
  if (!record) return 'none';
  const pages = Number(record.pages) || 0;
  const minutes = Number(record.minutes) || 0;
  const s = { ...DEFAULT_SETTINGS, ...settings };
  if (pages >= s.goalPages || minutes >= GOAL_MINUTES) return 'goal';
  if (pages >= s.minPages || minutes >= s.minMinutes) return 'min';
  if (pages >= s.acceptPages) return 'accept';
  return 'none';
}

// 날짜별 합계: 같은 날 여러 책 기록의 쪽수·분을 더한 하루 기록 { date, pages, minutes, mode, records }
// (v1.4부터 하루에 책마다 1건씩 기록할 수 있다. 등급·연속·주간·달력은 모두 이 합계를 쓴다)
export function recordMap(records) {
  const m = new Map();
  for (const r of records || []) {
    const cur = m.get(r.date);
    const pages = Number(r.pages) || 0;
    const minutes = Number(r.minutes) || 0;
    if (!cur) {
      m.set(r.date, { date: r.date, pages, minutes, mode: r.mode === 'time' ? 'time' : 'pages', records: [r] });
    } else {
      cur.pages += pages;
      cur.minutes += minutes;
      if (r.mode !== 'time') cur.mode = 'pages';
      cur.records.push(r);
    }
  }
  return m;
}

// 하루 기록의 열쇠: 날짜 + 책
export const recordKey = (date, bookId) => `${date}|${bookId}`;

// ---------- 연속일수 ----------
// 오늘부터 거꾸로 세어 accept 이상인 날의 수.
// 하루 쉰 것은 끊지 않고, 이틀 연속 none이면 끊는다.
// 오늘 아직 기록하지 않은 것(또는 오늘 기록이 인정선 미만)은 쉰 날로 치지 않는다.
export function streak(records, settings, today) {
  const m = recordMap(records);
  let earliest = today;
  for (const d of m.keys()) if (d < earliest) earliest = d;
  let count = 0;
  let restRun = 0;
  let d = today;
  if (atLeast(gradeOf(m.get(today), settings), 'accept')) count++;
  d = addDays(today, -1);
  while (d >= earliest) {
    if (atLeast(gradeOf(m.get(d), settings), 'accept')) {
      count++;
      restRun = 0;
    } else {
      restRun++;
      if (restRun >= 2) break;
    }
    d = addDays(d, -1);
  }
  return count;
}

// 누적 읽은 날: startDate 이후 accept 이상인 날의 수
export function totalReadDays(records, settings, startDate) {
  let n = 0;
  for (const r of recordMap(records).values()) {
    if (startDate && r.date < startDate) continue;
    if (atLeast(gradeOf(r, settings), 'accept')) n++;
  }
  return n;
}

// 하루 쉰 다음 날 안내. 없으면 null.
export function restNotice(records, settings, today, startDate) {
  const m = recordMap(records);
  if (m.has(today)) return null;
  const readDays = totalReadDays(records, settings, startDate);
  if (readDays === 0) return null;
  const y = addDays(today, -1);
  const y2 = addDays(today, -2);
  if (startDate && y < startDate) return null;
  if (atLeast(gradeOf(m.get(y), settings), 'accept')) return null;
  const y2Rest = !(startDate && y2 < startDate) && !atLeast(gradeOf(m.get(y2), settings), 'accept');
  if (!y2Rest) {
    return { type: 'oneDay', text: `어제 하루 쉬었어요. 오늘 ${settings.acceptPages}쪽이면 연속이 이어집니다.` };
  }
  return { type: 'restart', text: `다시 시작해요. 지금까지 읽은 날 ${readDays}일.` };
}

// ---------- 쪽수 ----------
export function clampEndPage(v, totalPages) {
  let n = Math.round(Number(v));
  if (!Number.isFinite(n)) n = 0;
  const max = Math.max(0, Math.round(Number(totalPages)) || 0);
  return Math.min(max, Math.max(0, n));
}

// 그 책의 date 이전 마지막 기록의 endPage (없으면 출발점 base = 앱에 넣기 전 이미 읽은 쪽수, 기본 0)
export function prevEndPage(records, bookId, date, base = 0) {
  let best = null;
  for (const r of records || []) {
    if (r.bookId !== bookId || r.date >= date) continue;
    if (!best || r.date > best.date) best = r;
  }
  return best ? Number(best.endPage) || 0 : Number(base) || 0;
}

export function pagesRead(endPage, prev) {
  return Math.max(0, (Number(endPage) || 0) - (Number(prev) || 0));
}

export function makePagesRecord({ date, projectId, bookId, endPage, totalPages, records, base = 0 }) {
  const e = clampEndPage(endPage, totalPages);
  const prev = prevEndPage(records, bookId, date, base);
  return { id: recordKey(date, bookId), date, projectId: projectId ?? null, bookId, endPage: e, pages: pagesRead(e, prev), minutes: null, mode: 'pages' };
}

export function makeTimeRecord({ date, projectId, bookId, records, settings, base = 0 }) {
  const prev = prevEndPage(records, bookId, date, base);
  const minutes = (settings && settings.minMinutes) || DEFAULT_SETTINGS.minMinutes;
  return { id: recordKey(date, bookId), date, projectId: projectId ?? null, bookId, endPage: prev, pages: 0, minutes, mode: 'time' };
}

// 한 책의 기록을 날짜순으로 다시 계산한다(지난 날짜를 고쳤을 때 뒤 기록의 쪽수를 맞춤).
// 바뀐 기록만 돌려준다.
export function recomputeBook(records, bookId, base = 0) {
  const list = (records || []).filter((r) => r.bookId === bookId).sort((a, b) => (a.date < b.date ? -1 : 1));
  const changed = [];
  let prev = Number(base) || 0;
  for (const r of list) {
    let next;
    if (r.mode === 'time') next = { ...r, endPage: prev, pages: 0 };
    else next = { ...r, pages: pagesRead(r.endPage, prev) };
    if (next.endPage !== r.endPage || next.pages !== r.pages) changed.push(next);
    prev = Number(next.endPage) || 0;
  }
  return changed;
}

// 그 책의 가장 최근 기록 endPage (현재 쪽). 기록이 없으면 출발점(이미 읽은 쪽수)
export function latestEndPage(records, bookId, base = 0) {
  let best = null;
  for (const r of records || []) if (r.bookId === bookId && (!best || r.date > best.date)) best = r;
  return best ? Number(best.endPage) || 0 : Number(base) || 0;
}

// ---------- 오늘 상태 문구 ----------
export function todayStatus({ pages, timeOnly }, settings) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  if (timeOnly) return { text: `${s.minMinutes}분 읽음으로 기록 · 최소선 달성`, tone: 'ok' };
  if (pages >= s.goalPages) return { text: `목표선 달성 · ${s.goalPages}쪽 이상`, tone: 'ok' };
  if (pages >= s.minPages) return { text: `최소선 달성 · 목표선까지 ${s.goalPages - pages}쪽`, tone: 'ok' };
  if (pages >= s.acceptPages) return { text: `인정선(${s.acceptPages}쪽) 달성 · 최소선까지 ${s.minPages - pages}쪽`, tone: 'warn' };
  return { text: `최소선까지 ${s.minPages - pages}쪽`, tone: 'muted' };
}

// ---------- 주간 ----------
export function inWeek(date, today, weekStartsOn = 1) {
  return !!date && date >= weekStart(today, weekStartsOn) && date <= weekEnd(today, weekStartsOn);
}

export function doneThisWeek(books, today, weekStartsOn = 1) {
  return (books || []).filter((b) => b.status === 'done' && inWeek(b.finishDate, today, weekStartsOn)).length;
}

// 이번 주 몇 권째 = 이번 주 완독 권수 + (읽는 중 책이 있으면 1)
export function weekBookOrdinal(books, today, weekStartsOn = 1) {
  const reading = (books || []).some((b) => b.status === 'reading');
  return doneThisWeek(books, today, weekStartsOn) + (reading ? 1 : 0);
}

// 하루 필요량 = ceil(남은 쪽수 / 이번 주 남은 날 수(오늘 포함))
export function dailyNeed(remaining, today, weekStartsOn = 1) {
  const daysLeft = daysLeftInWeek(today, weekStartsOn);
  const rem = Math.max(0, Number(remaining) || 0);
  return { remaining: rem, daysLeft, perDay: rem === 0 ? 0 : Math.ceil(rem / daysLeft) };
}

// 완독 예상일: 최근 7일(책 시작 이후로 한정) 하루 평균 쪽수로 계산. 평균 0이면 null.
export function finishEstimate(records, book, today) {
  if (!book) return null;
  let from = addDays(today, -6);
  if (book.startDate && book.startDate > from) from = book.startDate;
  if (from > today) from = today;
  const days = daysBetween(from, today) + 1;
  let sum = 0;
  for (const r of records || []) {
    if (r.bookId === book.id && r.date >= from && r.date <= today) sum += Number(r.pages) || 0;
  }
  const avg = sum / days;
  if (!(avg > 0)) return null;
  const remaining = Math.max(0, (Number(book.totalPages) || 0) - (Number(book.currentPage) || 0));
  const daysNeeded = Math.ceil(remaining / avg);
  return { avg, date: addDays(today, daysNeeded), remaining };
}

// 백업 알림: lastBackupAt(ISO 시각)이 없거나 7일 지났으면 { days } (없으면 days=null), 아니면 null
export function backupReminder(lastBackupDate, today) {
  if (!lastBackupDate) return { days: null };
  const d = daysBetween(lastBackupDate, today);
  return d >= 7 ? { days: d } : null;
}

// 주간 집계. 오늘 이후·프로젝트 시작 전 날짜는 세지 않는다.
// 오늘은 기록이 있을 때만 센다(오늘 미기록은 쉰 날이 아님).
export function weekStats(records, settings, today, startDate) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const m = recordMap(records);
  const days = weekDays(today, s.weekStartsOn).map((date) => {
    const r = m.get(date) || null;
    const future = date > today;
    const beforeStart = !!startDate && date < startDate;
    const grade = gradeOf(r, s);
    const counted = !future && !beforeStart && (date < today || !!r);
    const rest = counted && grade === 'none';
    return { date, record: r, grade, future, beforeStart, counted, rest, pages: r ? Number(r.pages) || 0 : 0 };
  });
  const counted = days.filter((d) => d.counted);
  return {
    days,
    start: days[0].date,
    end: days[6].date,
    pages: days.reduce((a, d) => a + d.pages, 0),
    countedDays: counted.length,
    minDays: counted.filter((d) => atLeast(d.grade, 'min')).length,
    goalDays: counted.filter((d) => d.grade === 'goal').length,
    restDays: counted.filter((d) => d.rest).map((d) => d.date),
  };
}

// 최근 4주 달력(이번 주 포함 28칸)
export function calendarCells(records, settings, today, startDate) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const m = recordMap(records);
  const first = addDays(weekStart(today, s.weekStartsOn), -21);
  const cells = [];
  for (let i = 0; i < 28; i++) {
    const date = addDays(first, i);
    const r = m.get(date);
    let kind;
    if (date > today) kind = 'future';
    else if (startDate && date < startDate && !r) kind = 'before';
    else {
      const g = gradeOf(r, s);
      if (g !== 'none') kind = g;
      else if (date === today) kind = 'today';
      else kind = 'rest';
    }
    cells.push({ date, kind });
  }
  return cells;
}

// 서브카테고리별 완독 수와 목표 합계 일치 여부
export function categoryProgress(subcategories, books, projectTarget) {
  const rows = [...(subcategories || [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((c) => ({
      id: c.id,
      name: c.name,
      goal: Number(c.targetBooks) || 0,
      done: (books || []).filter((b) => b.status === 'done' && b.subcategoryId === c.id).length,
    }));
  const goalSum = rows.reduce((a, r) => a + r.goal, 0);
  const done = (books || []).filter((b) => b.status === 'done').length;
  return { rows, goalSum, done, matches: goalSum === (Number(projectTarget) || 0) };
}

// ---------- 통계 (v1.1 E) ----------
const round1 = (x) => Math.round(x * 10) / 10;

// 최장 연속: 연속일수와 같은 규칙(하루 쉼은 이어짐, 이틀 연속 쉬면 끊김, 오늘 미기록은 쉼 아님)
export function longestStreak(records, settings, today) {
  const m = recordMap(records);
  const dates = [...m.keys()].filter((d) => d <= today).sort();
  if (!dates.length) return 0;
  let best = 0, count = 0, rest = 0;
  for (let d = dates[0]; d <= today; d = addDays(d, 1)) {
    if (atLeast(gradeOf(m.get(d), settings), 'accept')) { count++; rest = 0; }
    else if (d !== today) { rest++; if (rest >= 2) count = 0; }
    if (count > best) best = count;
  }
  return best;
}

// 세는 날: 프로젝트 시작일 ~ 오늘(오늘은 기록이 있을 때만)
function countedDates(records, startDate, today) {
  const m = recordMap(records);
  const out = [];
  if (!startDate || startDate > today) return out;
  for (let d = startDate; d < today; d = addDays(d, 1)) out.push(d);
  if (m.has(today)) out.push(today);
  return out;
}

export function cycleStats({ project, subcategories, books, records, settings, today, allRecords = null }) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const start = project.startDate;
  const recs = (records || []).filter((r) => !start || r.date >= start);
  const m = recordMap(recs);
  const done = (books || []).filter((b) => b.status === 'done');
  const target = Number(project.targetBooks) || 0;
  const sinceStart = start && start <= today ? daysBetween(start, today) + 1 : 0;

  // 1. 한눈에
  const totalPages = recs.reduce((a, r) => a + (Number(r.pages) || 0), 0);
  const readDays = totalReadDays(recs, s, start);
  let milestone = null;
  if (done.length < target) {
    const next = Math.min(target, (Math.floor(done.length / 25) + 1) * 25);
    milestone = { next, left: next - done.length };
  }

  // 2. 속도
  const withDays = done.filter((b) => isDateStr(b.startDate) && isDateStr(b.finishDate) && b.finishDate >= b.startDate)
    .map((b) => ({ ...b, days: daysBetween(b.startDate, b.finishDate) + 1 }));
  const avgDaysPerBook = withDays.length ? round1(withDays.reduce((a, b) => a + b.days, 0) / withDays.length) : null;
  const pageDays = [...m.values()].filter((r) => r.pages > 0);
  const pagesPerReadDay = pageDays.length ? round1(pageDays.reduce((a, r) => a + r.pages, 0) / pageDays.length) : null;
  let weekly = null, weeklyReason = '';
  const days4 = Math.min(28, sinceStart);
  if (days4 < 7) weeklyReason = '시작 1주 뒤부터 표시';
  else {
    const from = addDays(today, -(days4 - 1));
    const n = done.filter((b) => b.finishDate >= from && b.finishDate <= today).length;
    const perWeek = round1(n / (days4 / 7));
    weekly = { perWeek, diff: round1(perWeek - s.weeklyBooks), weeks: round1(days4 / 7) };
  }
  let eta = null, etaReason = '';
  if (done.length < 2) etaReason = '완독 2권부터 표시';
  else if (done.length >= target) eta = { finished: true };
  else {
    const days8 = Math.max(7, Math.min(56, sinceStart));
    const from = addDays(today, -(days8 - 1));
    const n = done.filter((b) => b.finishDate >= from && b.finishDate <= today).length;
    if (n === 0) etaReason = '최근 8주 완독이 없어요';
    else {
      const rate = n / (days8 / 7);
      eta = { date: addDays(today, Math.ceil(((target - done.length) / rate) * 7)), perWeek: round1(rate) };
    }
  }

  // 3. 꾸준함
  const counted = countedDates(recs, start, today);
  const grades = counted.map((d) => gradeOf(m.get(d), s));
  const consistency = {
    // 연속은 백독과 무관하게 전체 기록 기준(홈과 같은 값). 나머지는 이 백독 기준.
    current: streak(allRecords || recs, s, today),
    longest: longestStreak(allRecords || recs, s, today),
    countedDays: counted.length,
    minRate: counted.length ? grades.filter((g) => atLeast(g, 'min')).length / counted.length : null,
    goalRate: counted.length ? grades.filter((g) => g === 'goal').length / counted.length : null,
    restDays: grades.filter((g) => g === 'none').length,
  };

  // 4. 월별(최근 6개월)
  const [ty, tm] = today.split('-').map(Number);
  const monthly = [];
  for (let i = 5; i >= 0; i--) {
    const idx = ty * 12 + (tm - 1) - i;
    const ym = `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
    monthly.push({
      ym, label: `${(idx % 12) + 1}월`,
      pages: recs.filter((r) => r.date.startsWith(ym)).reduce((a, r) => a + (Number(r.pages) || 0), 0),
      done: done.filter((b) => (b.finishDate || '').startsWith(ym)).length,
    });
  }

  // 5. 요일별 평균 쪽수
  const wd = Array.from({ length: 7 }, (_, i) => (s.weekStartsOn + i) % 7).map((dow) => {
    const ds = counted.filter((d) => dayOfWeek(d) === dow);
    const sum = ds.reduce((a, d) => a + (Number((m.get(d) || {}).pages) || 0), 0);
    return { dow, days: ds.length, avg: ds.length ? round1(sum / ds.length) : 0 };
  });
  const bestAvg = Math.max(0, ...wd.map((w) => w.avg));
  const weekday = { rows: wd, best: bestAvg > 0 ? wd.find((w) => w.avg === bestAvg).dow : null };

  // 6. 카테고리별
  const cp = categoryProgress(subcategories, books, target);
  const rated = cp.rows.filter((r) => r.goal > 0).map((r) => ({ ...r, ratio: r.done / r.goal }));
  let leading = null, lagging = null;
  if (cp.done > 0 && rated.length) {
    leading = rated.reduce((a, b) => (b.ratio > a.ratio ? b : a));
    lagging = rated.reduce((a, b) => (b.ratio < a.ratio ? b : a));
  }

  // 7. 책
  const list = withDays.concat(done.filter((b) => !withDays.some((w) => w.id === b.id)).map((b) => ({ ...b, days: null })))
    .sort((a, b) => ((a.finishDate || '') < (b.finishDate || '') ? 1 : -1))
    .map((b) => ({ id: b.id, title: b.title, pages: Number(b.totalPages) || 0, days: b.days, finishDate: b.finishDate }));
  const thickest = list.length ? list.reduce((a, b) => (b.pages > a.pages ? b : a)) : null;
  const timed = list.filter((b) => b.days != null);
  const fastest = timed.length ? timed.reduce((a, b) => (b.days < a.days || (b.days === a.days && b.pages > a.pages) ? b : a)) : null;

  return {
    overview: { done: done.length, target, totalPages, readDays, milestone },
    speed: { avgDaysPerBook, pagesPerReadDay, weekly, weeklyReason, eta, etaReason },
    consistency,
    monthly,
    weekday,
    categories: { rows: cp.rows, leading, lagging },
    books: {
      list,
      avgPages: list.length ? round1(list.reduce((a, b) => a + b.pages, 0) / list.length) : null,
      thickest, fastest,
      dropped: (books || []).filter((b) => b.status === 'dropped').length,
    },
  };
}

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const pctText = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const signed = (x) => (x > 0 ? `+${x}` : `${x}`);

// [통계 복사] 글
export function statsText(st, project, settings, ordinal = 1, today = null) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const o = st.overview, sp = st.speed, c = st.consistency, b = st.books;
  const lines = [
    `[테마백독 통계] ${project.name} · ${ordinal}번째 백독`,
    `완독 ${o.done}/${o.target}권 · 누적 ${o.totalPages}쪽 · 읽은 날 ${o.readDays}일 · ${o.milestone ? `${o.milestone.next}권까지 ${o.milestone.left}권` : '목표 달성'}`,
    `속도: 권당 ${sp.avgDaysPerBook == null ? '—' : `${sp.avgDaysPerBook}일`} · 읽은 날 하루 ${sp.pagesPerReadDay == null ? '—' : `${sp.pagesPerReadDay}쪽`} · 최근 주당 ${sp.weekly ? `${sp.weekly.perWeek}권(주 ${s.weeklyBooks}권 기준 ${signed(sp.weekly.diff)}권)` : '—'}`,
    `백독 예상 완료: ${sp.eta ? (sp.eta.finished ? '완료' : koDate(sp.eta.date, today)) : `— (${sp.etaReason})`}`,
    `꾸준함: 현재 연속 ${c.current}일 · 최장 ${c.longest}일 · 최소선 ${pctText(c.minRate)} · 목표선 ${pctText(c.goalRate)} · 쉰 날 ${c.restDays}일`,
    `월별 쪽수: ${st.monthly.map((x) => `${x.label} ${x.pages}`).join(', ')}`,
    `가장 많이 읽는 요일: ${st.weekday.best == null ? '—' : WD[st.weekday.best]}`,
    `카테고리: ${st.categories.rows.map((r) => `${r.name} ${r.done}/${r.goal}`).join(', ')}`,
  ];
  if (st.categories.leading) lines.push(`앞선 카테고리 ${st.categories.leading.name} · 뒤처진 카테고리 ${st.categories.lagging.name}`);
  lines.push(`책: 평균 ${b.avgPages == null ? '—' : `${b.avgPages}쪽`} · 가장 두꺼운 책 ${b.thickest ? `${b.thickest.title}(${b.thickest.pages}쪽)` : '—'} · 가장 빨리 읽은 책 ${b.fastest ? `${b.fastest.title}(${b.fastest.days}일)` : '—'} · 중단 ${b.dropped}권`);
  return lines.join('\n');
}

// ---------- 서점 검색 주소 (2026-11-20 실제로 열어 형식 확인) ----------
export function bookstoreLinks(title, author) {
  const q = encodeURIComponent([title, author].map((s) => String(s || '').trim()).filter(Boolean).join(' '));
  return {
    aladin: `https://www.aladin.co.kr/search/wsearchresult.aspx?SearchTarget=Book&SearchWord=${q}`,
    kyobo: `https://search.kyobobook.co.kr/search?keyword=${q}&gbCode=TOT&target=total`,
  };
}

// ---------- 추천 도서 ----------
// 제목 비교용: 공백 없애고 소문자
export const normTitle = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

// 초안 목록 → 추천 항목. 카테고리 이름이 같은 것끼리 연결, 못 찾으면 공통(null)
export function seedRecommendations(seed, project, subcategories, makeId) {
  if (!seed || !Array.isArray(seed.items) || !project || seed.project !== project.name) return [];
  return seed.items.filter((it) => it && it.title).map((it) => {
    const sub = (subcategories || []).find((c) => normName(c.name) === normName(it.category));
    return {
      id: makeId(), projectId: project.id, subcategoryId: sub ? sub.id : null,
      title: String(it.title).trim(), author: String(it.author || '').trim(), note: String(it.note || '').trim(),
      source: 'seed', hidden: false, addedBookId: null,
    };
  });
}

// Claude에서 받아 온 "카테고리 | 제목 | 저자 | 추천 이유" 글을 읽는다.
// 빈 줄은 건너뛰고, 번호·글머리 기호·마크다운 표 형식도 읽는다. 읽지 못한 줄은 errors로 따로 모은다.
export function parseRecommendationText(text, subcategories) {
  const items = [];
  const errors = [];
  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    let line = raw.trim();
    if (!line) return;
    if (/^[\s|:\-]+$/.test(line) && line.includes('-')) return; // 표 구분선 |---|---|
    line = line.replace(/^(?:[-*•]\s+|\d{1,3}[.)]\s+)/, '');
    if (line.startsWith('|')) line = line.slice(1);
    if (line.endsWith('|')) line = line.slice(0, -1);
    const cells = line.split('|').map((c) => c.replace(/\*\*|__/g, '').trim());
    if (cells.length < 3) { errors.push({ line: i + 1, text: raw.trim(), reason: '칸이 모자라요(카테고리 | 제목 | 저자)' }); return; }
    const [cat, title, author, ...rest] = cells;
    if (normName(cat) === '카테고리' && normName(title) === '제목') return; // 표 머리줄
    if (!title) { errors.push({ line: i + 1, text: raw.trim(), reason: '제목이 비었어요' }); return; }
    const sub = (subcategories || []).find((c) => normName(c.name) === normName(cat));
    items.push({
      line: i + 1, categoryName: cat, subcategoryId: sub ? sub.id : null, matched: !!sub,
      title, author, note: rest.filter(Boolean).join(' | '),
    });
  });
  return { items, errors };
}

// 화면에 보일 추천: 숨기지 않았고, 이미 내 목록에 있는 책(모든 백독, 예정·읽는 중·완독·중단, 제목 일치)이 아닌 것
export function visibleRecommendations(recommendations, books) {
  const mine = new Set((books || []).map((b) => normTitle(b.title)));
  return (recommendations || []).filter((r) => !r.hidden && !mine.has(normTitle(r.title)));
}

// 이미 있는 책(추천·내 책 목록, 제목 일치)과 글 안의 중복은 건너뛴다
export function planRecommendationImport(items, recommendations, books) {
  const have = new Set([...(recommendations || []), ...(books || [])].map((x) => normTitle(x.title)));
  const seen = new Set();
  const toAdd = [];
  const skipped = [];
  for (const it of items || []) {
    const k = normTitle(it.title);
    if (have.has(k)) skipped.push({ ...it, reason: '이미 있는 책' });
    else if (seen.has(k)) skipped.push({ ...it, reason: '붙여 넣은 글 안에서 중복' });
    else { seen.add(k); toAdd.push(it); }
  }
  return { toAdd, skipped };
}

// Claude에게 보낼 추천 요청 문구. focusId가 있으면 그 카테고리 하나만.
export function recommendationPrompt({ project, subcategories, books, recommendations, focusId = null }) {
  const subs = [...(subcategories || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .filter((c) => !focusId || c.id === focusId);
  const left = subs.map((c) => {
    const done = (books || []).filter((b) => b.status === 'done' && b.subcategoryId === c.id).length;
    return `${c.name} ${Math.max(0, (Number(c.targetBooks) || 0) - done)}권`;
  });
  const titles = [];
  const seen = new Set();
  for (const x of [...(books || []), ...(recommendations || [])]) {
    const k = normTitle(x.title);
    if (k && !seen.has(k)) { seen.add(k); titles.push(x.title.trim()); }
  }
  return [
    `테마백독 "${project.name}" (${project.targetBooks}권 목표)의 책을 추천해 줘.`,
    `카테고리와 남은 권수: ${left.join(', ')}`,
    `이미 읽었거나 목록에 있는 책(제외): ${titles.length ? titles.join(', ') : '없음'}`,
    focusId ? '이 카테고리로 5권, 한국어로 구할 수 있는 책 위주로.' : '카테고리마다 5권씩, 한국어로 구할 수 있는 책 위주로.',
    '아래 형식으로 한 줄에 한 권씩만 답해 줘(다른 설명 없이):',
    '카테고리 | 제목 | 저자 | 추천 이유 한 줄',
  ].join('\n');
}

// ---------- 서브카테고리 편집 ----------
// 합계 문구: "합계 95권 / 백독 목표 100권 · 5권 부족" / "· 5권 초과" / "· ✓ 일치"
export function categorySumText(goalSum, target) {
  const diff = goalSum - target;
  const tail = diff === 0 ? '✓ 일치' : diff < 0 ? `${-diff}권 부족` : `${diff}권 초과`;
  return { text: `합계 ${goalSum}권 / 백독 목표 ${target}권 · ${tail}`, matches: diff === 0 };
}

const normName = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

// 이름이 겹치는 줄의 이름 목록(경고용)
export function duplicateNames(rows) {
  const seen = new Map();
  for (const r of rows || []) {
    const k = normName(r.name);
    if (!k) continue;
    seen.set(k, (seen.get(k) || []).concat(r.name.trim()));
  }
  return [...seen.values()].filter((v) => v.length > 1).map((v) => v[0]);
}

// 삭제된 카테고리가 옮겨 갈 최종 카테고리 id (삭제→삭제로 이어진 경우도 따라간다)
export function resolveCategory(id, moves, keepIds) {
  let cur = id;
  const seen = new Set();
  while (cur && moves && moves[cur] && !seen.has(cur)) { seen.add(cur); cur = moves[cur]; }
  return keepIds.has(cur) ? cur : null;
}

// 편집 결과를 적용한다. rows: 남길 카테고리(순서대로), moves: { 지운 id: 옮길 id }
// 책은 지우지 않고 옮긴다. 옮길 곳이 없으면 첫 카테고리로. 추천은 옮길 곳이 없으면 공통(null).
export function applyCategoryEdit({ projectId, subcategories, books, recommendations = [], rows, moves = {} }) {
  if (!rows || rows.length === 0) throw new Error('카테고리는 최소 1개 남겨야 합니다.');
  const keepIds = new Set(rows.map((r) => r.id));
  const oldById = new Map((subcategories || []).map((c) => [c.id, c]));
  const next = rows.map((r, order) => ({
    ...(oldById.get(r.id) || {}),
    id: r.id, projectId, name: String(r.name).trim(),
    targetBooks: Math.max(0, Math.round(Number(r.targetBooks) || 0)), order,
  }));
  const deletedIds = (subcategories || []).map((c) => c.id).filter((id) => !keepIds.has(id));
  const fallback = rows[0].id;
  const changedBooks = [];
  for (const b of books || []) {
    if (keepIds.has(b.subcategoryId)) continue;
    const to = resolveCategory(b.subcategoryId, moves, keepIds) || fallback;
    changedBooks.push({ ...b, subcategoryId: to });
  }
  const changedRecs = [];
  for (const r of recommendations) {
    if (r.subcategoryId == null || keepIds.has(r.subcategoryId)) continue;
    changedRecs.push({ ...r, subcategoryId: resolveCategory(r.subcategoryId, moves, keepIds) });
  }
  return { subcategories: next, deletedIds, books: changedBooks, recommendations: changedRecs };
}

// ---------- 백업 파일 확인 ----------
// 버전 2: recommendations(추천 도서) 추가. 버전 1 파일은 추천 없음으로 가져온다.
// 버전 3: 테마백독 여러 개(프로젝트에 endDate, 진행 중은 1개).
// 버전 4: 가져온 책 표시(책에 carriedFromPage·carriedFromProjectId).
// 버전 5(v1.4): 하루 기록 열쇠 날짜 → 날짜+책(같은 날 여러 책), 책에 scope(project|outside)·readBefore·prevSubcategoryId,
//               프로젝트에 endType(완료|중단)·endNote. 버전 1~4 파일도 그대로 가져온다(모든 책 project, readBefore 0).
// 버전 6(v1.5): 책별 메모(memos) 추가. 버전 1~5 파일은 메모 없음으로 가져온다.
export const SCHEMA_VERSION = 6;
const STORES = ['projects', 'subcategories', 'books', 'dayRecords'];

export function validateBackup(obj) {
  const fail = (error) => ({ ok: false, error });
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return fail('백업 파일 형식이 아닙니다.');
  if (obj.app !== 'themebaekdok') return fail('테마백독 백업 파일이 아닙니다.');
  if (!Number.isInteger(obj.schemaVersion)) return fail('버전 정보가 없습니다.');
  if (obj.schemaVersion > SCHEMA_VERSION) return fail(`더 새 버전(${obj.schemaVersion})의 앱에서 만든 파일입니다. 앱을 먼저 업데이트하세요.`);
  if (obj.schemaVersion < 1) return fail('알 수 없는 버전입니다.');
  const data = obj.data;
  if (!data || typeof data !== 'object') return fail('데이터 부분이 없습니다.');
  for (const k of STORES) if (!Array.isArray(data[k])) return fail(`"${k}" 목록이 없습니다.`);
  if (!data.settings || typeof data.settings !== 'object') return fail('설정 정보가 없습니다.');
  if (data.projects.length < 1) return fail('테마백독 정보가 없습니다.');
  if (data.projects.filter((p) => p && (p.status || '진행') === '진행').length > 1) return fail('진행 중인 테마백독이 2개 이상입니다.');
  if (obj.schemaVersion >= 2 && !Array.isArray(data.recommendations)) return fail('"recommendations" 목록이 없습니다.');
  const keyed = ['projects', 'subcategories', 'books'];
  if (Array.isArray(data.recommendations)) keyed.push('recommendations');
  for (const k of keyed) {
    const ids = new Set();
    for (const it of data[k]) {
      if (!it || typeof it.id !== 'string' || !it.id) return fail(`"${k}"에 id가 없는 항목이 있습니다.`);
      if (ids.has(it.id)) return fail(`"${k}"에 같은 id가 두 번 있습니다.`);
      ids.add(it.id);
    }
  }
  const bookIds = new Set(data.books.map((b) => b.id));
  const keys = new Set();
  for (const r of data.dayRecords) {
    if (!r || !isDateStr(r.date)) return fail('날짜 형식이 틀린 기록이 있습니다.');
    // 버전 4까지는 날짜당 1건, 버전 5부터는 날짜+책당 1건
    const k = obj.schemaVersion >= 5 ? recordKey(r.date, r.bookId) : r.date;
    if (keys.has(k)) return fail(`같은 날짜(${r.date}) 기록이 두 번 있습니다.`);
    keys.add(k);
    if (!bookIds.has(r.bookId)) return fail(`${r.date} 기록의 책을 찾을 수 없습니다.`);
  }
  if (obj.schemaVersion >= 6 && !Array.isArray(data.memos)) return fail('"memos" 목록이 없습니다.');
  if (Array.isArray(data.memos)) {
    const ids = new Set();
    for (const m of data.memos) {
      if (!m || typeof m.id !== 'string' || !m.id) return fail('"memos"에 id가 없는 항목이 있습니다.');
      if (ids.has(m.id)) return fail('"memos"에 같은 id가 두 번 있습니다.');
      ids.add(m.id);
      if (!bookIds.has(m.bookId)) return fail('메모의 책을 찾을 수 없습니다.');
      if (typeof m.text !== 'string') return fail('메모 본문이 없습니다.');
    }
  }
  for (const b of data.books) {
    if (!['planned', 'reading', 'done', 'dropped'].includes(b.status)) return fail('책 상태 값이 틀렸습니다.');
    if (b.scope != null && !['project', 'outside'].includes(b.scope)) return fail('책 소속 값이 틀렸습니다.');
  }
  return { ok: true };
}

// 확인을 통과한 백업 파일을 지금 버전의 저장 형태로 바꾼다.
// - 마지막 백업 시각은 파일의 exportedAt(없거나 틀리면 가져온 시각)으로 둔다(복원 직후 백업 알림 방지).
export function normalizeBackup(obj, nowIso) {
  const d = obj.data;
  const { id, ...settings } = d.settings || {};
  const exportedOk = typeof obj.exportedAt === 'string' && !Number.isNaN(Date.parse(obj.exportedAt));
  const books = migrateBooks(inferCarried(d.books, d.dayRecords));
  return {
    projects: migrateProjects(d.projects, books),
    subcategories: d.subcategories,
    books,
    dayRecords: migrateRecords(d.dayRecords),
    recommendations: Array.isArray(d.recommendations) ? d.recommendations : [],
    memos: Array.isArray(d.memos) ? migrateMemos(d.memos) : [], // 버전 5 이하 파일은 메모 없음
    settings: { ...DEFAULT_SETTINGS, ...settings, lastBackupAt: exportedOk ? obj.exportedAt : nowIso },
  };
}


// ---------- 테마백독 여러 개 (v1.2) ----------
export const ACTIVE = '진행';
export const DONE_STATUS = '완료';
export const END_DONE = '완료';   // endType: 목표를 이루고 마침
export const END_STOP = '중단';   // endType: 도중에 마침

// 예전 데이터 정리: endDate 칸 추가, 상태 기본값, 예전 기본 설명 "1사이클"은 비운다(이제 몇 번째인지는 계산한다)
// v1.4: 이미 마친 백독에 endType이 없으면 완독 수 ≥ 목표면 '완료', 아니면 '중단'(books를 줄 때)
export function migrateProjects(projects, books = null) {
  return (projects || []).map((p) => {
    const out = {
      ...p,
      description: /^\s*\d+\s*사이클\s*$/.test(p.description || '') ? '' : (p.description || ''),
      status: p.status || ACTIVE,
      endDate: p.endDate || null,
    };
    if (out.status !== ACTIVE && !out.endType && books) {
      const done = books.filter((b) => b.projectId === p.id && b.status === 'done').length;
      out.endType = done >= (Number(p.targetBooks) || 0) ? END_DONE : END_STOP;
      out.endNote = out.endNote || '';
    }
    return out;
  });
}

// v1.4 책 정리: 소속(scope) 없으면 이번 테마백독(project), 이미 읽은 쪽수(readBefore) 없으면 0
export function migrateBooks(books) {
  return (books || []).map((b) => (b.scope && b.readBefore != null ? b : {
    ...b,
    scope: b.scope || (b.projectId ? 'project' : 'outside'),
    readBefore: Number(b.readBefore) || 0,
  }));
}

// v1.4 기록 정리: 열쇠(id = 날짜|책)와 projectId 칸
export function migrateRecords(records) {
  return (records || []).map((r) => (r.id === recordKey(r.date, r.bookId) && r.projectId !== undefined ? r : {
    ...r, id: recordKey(r.date, r.bookId), projectId: r.projectId ?? null,
  }));
}

// 시작일 순. 같은 날 시작했으면 먼저 만든 것(createdAt, 없으면 예전 데이터라 가장 먼저)이 앞이다.
// 마치기·되돌리기를 해도 번호가 바뀌지 않는다.
const byStart = (a, b) => {
  const sa = a.startDate || '', sb = b.startDate || '';
  if (sa !== sb) return sa < sb ? -1 : 1;
  const ca = a.createdAt || '', cb = b.createdAt || '';
  if (ca !== cb) return ca < cb ? -1 : 1;
  return a.id < b.id ? -1 : 1;
};

// 몇 번째 백독인지: 시작일 순으로 센다. { id: 번호 }
export function projectOrdinals(projects) {
  const out = {};
  [...(projects || [])].sort(byStart).forEach((p, i) => { out[p.id] = i + 1; });
  return out;
}

export function activeProject(projects) {
  const act = (projects || []).filter((p) => p.status === ACTIVE).sort(byStart);
  return act.length ? act[act.length - 1] : null;
}

function addMonths(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  const yy = Math.floor(idx / 12), mm = (idx % 12) + 1;
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  return `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

// 기간 글: 31일 미만은 "N일", 그 이상은 개월(남는 날이 있으면 올림). 2026-11-20~2028-09-30 → "23개월"
export function durationText(start, end) {
  if (!isDateStr(start) || !isDateStr(end) || end < start) return '';
  const days = daysBetween(start, end) + 1;
  if (days < 31) return `${days}일`;
  const [y1, m1, d1] = start.split('-').map(Number);
  const [y2, m2, d2] = end.split('-').map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (addMonths(start, months) < end) months += 1;
  return `${months}개월`;
}

// 마치기: 읽는 중 책 처리 'carry'(다음 백독으로 가져가기) | 'finish'(완독 처리) | 'drop'(중단). 바뀐 책만 돌려준다.
// 읽을 목록(planned) 책은 이전 백독에 그대로 남는다. 일일 기록은 건드리지 않는다.
export function planFinishProject({ project, books, today, readingAction, endType = END_DONE, endNote = '' }) {
  const changed = [];
  for (const b of books || []) {
    if (b.projectId !== project.id || b.status !== 'reading') continue;
    if (readingAction === 'finish') changed.push({ ...b, status: 'done', finishDate: today, currentPage: b.totalPages });
    else if (readingAction === 'drop') changed.push({ ...b, status: 'dropped' });
    else if (readingAction === 'carry') changed.push({ ...b, carryOver: true });
    else throw new Error('읽는 중인 책을 어떻게 할지 정해야 합니다.');
  }
  return {
    project: { ...project, status: DONE_STATUS, endDate: today, endType: endType === END_STOP ? END_STOP : END_DONE, endNote: endType === END_STOP ? String(endNote || '').trim() : '' },
    books: changed,
  };
}

// 새 백독 시작: structure 'empty'(→ "미분류" 1개) | 'copy'(직전 백독 구성 복사).
// "가져가기"로 표시된 책은 새 백독의 첫 카테고리로 옮긴다(일일 기록의 projectId는 그대로).
export function planStartProject({ projects, subcategories, books, input, structure, makeId, today, now = null }) {
  if (activeProject(projects)) throw new Error('진행 중인 테마백독이 있습니다. 먼저 마쳐 주세요.');
  const name = String(input.name || '').trim();
  if (!name) throw new Error('주제를 적어 주세요.');
  const target = Math.max(1, Math.round(Number(input.targetBooks) || 100));
  const project = {
    id: makeId('p'), name, description: String(input.description || '').trim(),
    targetBooks: target, startDate: isDateStr(input.startDate) ? input.startDate : today,
    status: ACTIVE, endDate: null, createdAt: now || `${today}T00:00:00.000Z`,
  };
  const prev = [...(projects || [])].sort(byStart).pop() || null;
  let subs = [];
  if (structure === 'copy' && prev) {
    subs = (subcategories || []).filter((c) => c.projectId === prev.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((c, order) => ({ id: makeId('c'), projectId: project.id, name: c.name, targetBooks: c.targetBooks, order }));
  }
  if (!subs.length) subs = [{ id: makeId('c'), projectId: project.id, name: '미분류', targetBooks: target, order: 0 }];
  const moved = (books || []).filter((b) => b.carryOver && b.status === 'reading')
    .map((b) => ({
      ...b, projectId: project.id, subcategoryId: subs[0].id, carryOver: false,
      carriedFromProjectId: b.projectId, carriedFromPage: Number(b.currentPage) || 0,
    }));
  return { project, subcategories: subs, books: moved };
}

// 되돌리기: 진행 중인 백독이 없을 때만. "가져가기" 표시가 남은 책은 원래 백독의 읽는 중으로 되돌린다.
export function planReopenProject({ projects, books, projectId }) {
  if (activeProject(projects)) throw new Error('지금 진행 중인 백독을 먼저 마쳐야 합니다.');
  const p = (projects || []).find((x) => x.id === projectId);
  if (!p) throw new Error('백독을 찾을 수 없습니다.');
  return {
    project: { ...p, status: ACTIVE, endDate: null, endType: null, endNote: '' },
    books: (books || []).filter((b) => b.projectId === projectId && b.carryOver).map((b) => ({ ...b, carryOver: false })),
  };
}

// 한 백독(기간)의 요약 통계: 지난 백독 상세용. records에서 그 백독의 기록(projectId 일치, 종료일까지)만 쓴다.
export function periodStats({ project, subcategories, books, records, settings, today }) {
  const end = project.endDate || today;
  const mine = (records || []).filter((r) => r.projectId === project.id && r.date <= end);
  const st = cycleStats({ project, subcategories, books, records: mine, settings, today: end });
  const months = [];
  if (isDateStr(project.startDate) && end >= project.startDate) {
    const [ys, ms] = project.startDate.split('-').map(Number);
    const [ye, me] = end.split('-').map(Number);
    for (let i = ys * 12 + ms - 1; i <= ye * 12 + me - 1; i++) {
      const ym = `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
      months.push({ ym, done: (books || []).filter((b) => b.status === 'done' && (b.finishDate || '').startsWith(ym)).length });
    }
  }
  return {
    pages: st.overview.totalPages, readDays: st.overview.readDays,
    avgDaysPerBook: st.speed.avgDaysPerBook, pagesPerReadDay: st.speed.pagesPerReadDay,
    longest: longestStreak(mine, settings, end), months, categories: st.categories.rows,
  };
}

// 히스토리 전체 합계(진행 중 포함)
export function historyTotals({ projects, books, records, settings }) {
  const recs = records || [];
  const first = recs.reduce((m, r) => (!m || r.date < m ? r.date : m), null);
  return {
    count: (projects || []).length,
    done: (books || []).filter((b) => b.status === 'done').length,
    // v1.4: 완독 권수를 백독 / 백독 외로 나눠서도 준다. 마친 백독은 완료 / 중단으로 나눠 센다.
    doneProject: (books || []).filter((b) => b.status === 'done' && b.scope !== 'outside').length,
    doneOutside: (books || []).filter((b) => b.status === 'done' && b.scope === 'outside').length,
    completed: (projects || []).filter((p) => p.status !== ACTIVE && p.endType !== END_STOP).length,
    stopped: (projects || []).filter((p) => p.status !== ACTIVE && p.endType === END_STOP).length,
    active: (projects || []).filter((p) => p.status === ACTIVE).length,
    pages: recs.reduce((a, r) => a + (Number(r.pages) || 0), 0),
    readDays: totalReadDays(recs, settings, null),
    firstDate: first,
  };
}

const dotDate = (s) => (s ? s.replaceAll('-', '.') : '');

// [이 백독 정리 복사] 글
export function projectSummaryText({ project, ordinal, subcategories, books, stats }) {
  const catName = (id) => ((subcategories || []).find((c) => c.id === id) || {}).name || '';
  const done = (books || []).filter((b) => b.status === 'done').sort((a, b) => ((a.finishDate || '') < (b.finishDate || '') ? -1 : 1));
  const lines = [`[테마백독 정리] ${ordinal}번째 테마백독 · ${project.name}`];
  if (project.description) lines.push(project.description);
  lines.push(`기간 ${dotDate(project.startDate)} ~ ${project.endDate ? `${dotDate(project.endDate)} (${durationText(project.startDate, project.endDate)})` : '진행 중'}`);
  lines.push(`완독 ${done.length} / ${project.targetBooks}권 · 읽은 쪽수 ${stats.pages}쪽 · 읽은 날 ${stats.readDays}일 · 최장 연속 ${stats.longest}일`);
  lines.push(`권당 평균 ${stats.avgDaysPerBook == null ? '—' : `${stats.avgDaysPerBook}일`} · 읽은 날 하루 평균 ${stats.pagesPerReadDay == null ? '—' : `${stats.pagesPerReadDay}쪽`}`);
  lines.push(`카테고리: ${(stats.categories || []).map((c) => `${c.name} ${c.done}/${c.goal}`).join(', ')}`);
  lines.push('', '완독한 책');
  done.forEach((b, i) => {
    lines.push(`${i + 1}. ${b.title}${b.author ? ` (${b.author})` : ''} · ${catName(b.subcategoryId)} · ${dotDate(b.finishDate)}`);
    if (b.thought) lines.push(`   한 줄 생각: ${b.thought}`);
    if (b.reviewUrl) lines.push(`   독서평: ${b.reviewUrl}`);
  });
  if (!done.length) lines.push('(없음)');
  return lines.join('\n');
}


// ---------- v1.3 ----------
// 날짜 글: 올해면 "10월 19일", 아니면 "2028년 10월 19일"
export function koDate(date, today) {
  if (!isDateStr(date)) return '';
  const [y, m, d] = date.split('-').map(Number);
  return today && date.slice(0, 4) === String(today).slice(0, 4) ? `${m}월 ${d}일` : `${y}년 ${m}월 ${d}일`;
}

// 이미 다음 백독으로 옮긴 책에 "가져온 책" 정보를 채운다(예전 데이터용).
// 그 책의 기록 중 다른 백독(projectId가 다름) 소속이 있으면 가져온 책이다. 가져올 때 쪽수 = 그 기록들의 마지막 endPage.
// 이미 정보가 있거나, 아직 가져가는 중(carryOver)인 책은 그대로 둔다. 기록은 바꾸지 않는다.
export function inferCarried(books, records) {
  return (books || []).map((b) => {
    if (b.carriedFromProjectId || b.carryOver) return b;
    const prev = (records || []).filter((r) => r.bookId === b.id && r.projectId && r.projectId !== b.projectId)
      .sort((x, y) => (x.date < y.date ? -1 : 1));
    if (!prev.length) return b;
    const last = prev[prev.length - 1];
    return { ...b, carriedFromProjectId: last.projectId, carriedFromPage: Number(last.endPage) || 0 };
  });
}

// ---------- v1.4 백독 외 독서 ----------
export const isOutside = (b) => !!b && b.scope === 'outside';

// 소속 바꾸기: 'project'(진행 중인 테마백독, 카테고리 필수) ↔ 'outside'(백독 외, 카테고리 비우고 이전 값 보관)
// 마친 테마백독의 책은 바꿀 수 없다. 이 책의 기록 중 지금 소속의 기록만 새 소속(projectId)으로 옮긴다.
export function planScopeChange({ book, toScope, project, subcategoryId = null, records = [] }) {
  if (!book) throw new Error('책을 찾을 수 없습니다.');
  const fromScope = isOutside(book) ? 'outside' : 'project';
  if (fromScope === toScope) return { book, records: [] };
  if (fromScope === 'project' && (!project || book.projectId !== project.id)) throw new Error('마친 테마백독의 책은 소속을 바꿀 수 없어요.');
  let next;
  if (toScope === 'project') {
    if (!project) throw new Error('진행 중인 테마백독이 없어요. 먼저 테마백독을 시작하세요.');
    if (!subcategoryId) throw new Error('카테고리를 골라 주세요.');
    next = { ...book, scope: 'project', projectId: project.id, subcategoryId };
  } else if (toScope === 'outside') {
    next = { ...book, scope: 'outside', projectId: null, subcategoryId: null, prevSubcategoryId: book.subcategoryId || book.prevSubcategoryId || null };
  } else {
    throw new Error('소속 값이 틀렸습니다.');
  }
  const from = fromScope === 'outside' ? null : book.projectId;
  const to = next.projectId ?? null;
  const moved = (records || []).filter((r) => r.bookId === book.id && (r.projectId ?? null) === from).map((r) => ({ ...r, projectId: to }));
  return { book: next, records: moved };
}

// 주간 쪽수 목표(B-M5): 목표 = 목표선×7, 최소 = 최소선×7
export function weekPageGoal(settings) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  return { goal: s.goalPages * 7, min: s.minPages * 7 };
}

// ---------- v1.5 책별 메모 ----------
export const MEMO_TYPES = ['thought', 'quote', 'question'];
export const MEMO_TYPE_LABEL = { thought: '생각', quote: '인용', question: '질문' };

// 쪽수 칸 값 → 양의 정수 또는 null(빈칸·0·숫자 아님)
export function memoPage(v) {
  if (v == null || v === '') return null;
  const n = Math.round(Number(String(v).replace(/[^\d.]/g, '')));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// v1.5.1 말한 쪽수: 본문 맨 앞의 쪽수 표기("37쪽", "37 쪽", "37페이지", "p.37", "P. 37", "p37")를 읽는다.
// 뒤에 붙은 , . : 공백은 함께 뗀다. 한글 숫자("삼십칠 쪽")·본문 중간 표기는 읽지 않는다.
// 뗀 뒤 본문이 비면(쪽수만 말함) 읽지 않는다. { text, page } (못 읽으면 page null, text 그대로)
const LEAD_PAGE_RE = /^\s*(?:p\.?\s*(\d{1,5})(?!\d)|(\d{1,5})\s*(?:쪽|페이지))[\s,.:]*/i;
export function leadingMemoPage(text) {
  const s = String(text ?? '');
  const m = LEAD_PAGE_RE.exec(s);
  if (!m) return { text: s, page: null };
  const page = memoPage(m[1] || m[2]);
  const rest = s.slice(m[0].length);
  if (page == null || !rest.trim()) return { text: s, page: null };
  return { text: rest, page };
}

// 메모 저장 값: 쪽수 칸을 직접 고쳤으면 칸 값 우선(본문 그대로), 아니면 본문 앞 쪽수 → 없으면 칸 값
export function resolveMemoInput({ text, pageField, pageTouched }) {
  if (!pageTouched) {
    const lead = leadingMemoPage(text);
    if (lead.page != null) return { text: lead.text, page: lead.page };
  }
  return { text: String(text ?? ''), page: memoPage(pageField) };
}

// 메모 정리(예전 데이터·백업 파일): 종류·출처 기본값, 쪽수는 숫자 또는 null
export function migrateMemos(memos) {
  return (memos || []).filter((m) => m && m.id && m.bookId).map((m) => ({
    ...m,
    page: memoPage(m.page),
    type: MEMO_TYPES.includes(m.type) ? m.type : 'thought',
    text: String(m.text ?? ''),
    source: m.source === 'paste' ? 'paste' : 'typed',
    createdAt: m.createdAt || null,
    updatedAt: m.updatedAt || m.createdAt || null,
  }));
}

// 메모 입력 시트의 쪽수 기본값: 그 책의 마지막 기록 쪽 → 없으면 이미 읽은 쪽수 → 그것도 없으면 null(빈칸)
export function defaultMemoPage(records, book) {
  if (!book) return null;
  return memoPage(latestEndPage(records, book.id, Number(book.readBefore) || 0));
}

// 쪽수순, 같은 쪽은 만든 시각순, 쪽 없는 메모는 맨 뒤(그 안에서도 시각순)
export function sortMemos(memos) {
  return [...(memos || [])].sort((a, b) => {
    const pa = a.page == null ? Infinity : a.page;
    const pb = b.page == null ? Infinity : b.page;
    if (pa !== pb) return pa - pb;
    const ca = a.createdAt || '', cb = b.createdAt || '';
    if (ca !== cb) return ca < cb ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// 책 id → 메모 개수
export function memoCountMap(memos) {
  const out = {};
  for (const m of memos || []) out[m.bookId] = (out[m.bookId] || 0) + 1;
  return out;
}

const QUOTE_PAIRS = [['"', '"'], ['“', '”'], ['‘', '’'], ["'", "'"], ['「', '」'], ['『', '』'], ['”', '”'], ['“', '“']];
// 양쪽을 감싼 따옴표 한 겹을 뗀다
export function stripQuotes(s) {
  let t = String(s || '').trim();
  for (const [o, c] of QUOTE_PAIRS) {
    if (t.length >= 2 && t.startsWith(o) && t.endsWith(c)) return t.slice(o.length, t.length - c.length).trim();
  }
  return t;
}
const BULLET_RE = /^(?:[-•*·▪◦‣–—]+\s*|\d{1,3}[.)]\s+|\(\d{1,3}\)\s+)/;
// 줄 끝 쪽수: "(p.37)" "p.37" "P. 37" "37쪽" "(37쪽)" "[p.37]"
const PAGE_RE = /(?:^|[\s,·(\[])\(?\[?\s*(?:p\.\s*(\d{1,5})|(\d{1,5})\s*쪽)\s*[)\]]?\s*$/i;
function takePage(s) {
  const m = PAGE_RE.exec(s);
  if (!m) return { text: s, page: null };
  return { text: s.slice(0, m.index).replace(/[\s,·–—-]+$/, ''), page: memoPage(m[1] || m[2]) };
}
const normSpace = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// 하이라이트 붙여넣기 나누기(E): 빈 줄이 하나라도 있으면 빈 줄 단위(덩어리 안 줄바꿈은 공백), 없으면 줄 단위.
// 글머리 기호·번호와 감싼 따옴표를 떼고, 줄 끝 쪽수 표기를 쪽수로 읽는다. [{ text, page }]
export function parseHighlights(text) {
  const src = String(text || '').replace(/\r\n?/g, '\n');
  const blocks = /\n[ \t 　]*\n/.test(src) ? src.split(/\n(?:[ \t 　]*\n)+/) : src.split('\n');
  const out = [];
  for (const block of blocks) {
    let s = normSpace(block.split('\n').map((l) => l.trim()).join(' '));
    s = s.replace(BULLET_RE, '').trim();
    let { text: body, page } = takePage(s);
    body = stripQuotes(body);
    if (page == null) ({ text: body, page } = takePage(body));
    body = normSpace(stripQuotes(body));
    if (body) out.push({ text: body, page });
  }
  return out;
}

// 같은 본문 비교용(공백·감싼 따옴표 무시)
const quoteKey = (t) => normSpace(stripQuotes(normSpace(t)));

// 붙여넣은 인용 중 이 책에 이미 있는 인용(같은 본문)과 붙여넣기 안의 중복은 건너뛴다. { add, skipped }
export function planHighlightImport(items, existingMemos) {
  const seen = new Set((existingMemos || []).filter((m) => m.type === 'quote').map((m) => quoteKey(m.text)));
  const add = [];
  let skipped = 0;
  for (const it of items || []) {
    const k = quoteKey(it.text);
    if (!k) continue;
    if (seen.has(k)) { skipped++; continue; }
    seen.add(k);
    add.push(it);
  }
  return { add, skipped };
}

// 내보내기 파일 이름: 테마백독-메모-<책 제목>.md (파일 이름에 못 쓰는 글자는 뺀다)
export function memoFileName(title) {
  const t = String(title || '').replace(/[\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  return `테마백독-메모-${t || '책'}.md`;
}

const isoLocalDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// AI 정리용 내보내기 글(F). 데이터가 없는 항목은 그 부분만 뺀다.
// book: 책, projectName: 소속 테마백독 이름(백독 외면 무시), categoryName: 카테고리 이름,
// memos: 이 책 메모, dateOf: ISO 시각 → 'YYYY-MM-DD'(기본: 기기 현지 날짜)
export function buildMemoExport({ book, projectName = '', categoryName = '', memos = [], dateOf = isoLocalDate }) {
  const lines = [];
  lines.push(`# 『${normSpace(book.title)}』${book.author ? ` — ${normSpace(book.author)}` : ''}`);
  const info = [];
  if (isOutside(book)) info.push('백독 외 독서');
  else {
    if (projectName) info.push(`테마백독: ${projectName}`);
    if (categoryName) info.push(`카테고리: ${categoryName}`);
  }
  if (Number(book.totalPages) > 0) info.push(`${book.totalPages}쪽`);
  if (info.length) lines.push(`- ${info.join(' · ')}`);
  if (book.startDate) {
    const end = book.status === 'done' && book.finishDate ? book.finishDate
      : book.status === 'dropped' ? '중단' : book.status === 'planned' ? '' : '읽는 중';
    lines.push(`- 읽은 기간: ${book.startDate} ~${end ? ` ${end}` : ''}`);
  }
  if (book.thought && normSpace(book.thought)) lines.push(`- 한 줄 생각: ${normSpace(book.thought)}`);
  const list = sortMemos(memos);
  lines.push('', `## 메모 (쪽수순, ${list.length}개)`);
  for (const m of list) {
    let body = normSpace(m.text);
    if (m.type === 'quote' && !/^["“].*["”]$/.test(body)) body = `"${body}"`;
    const date = dateOf(m.createdAt);
    lines.push(`- ${m.page != null ? `p.${m.page}` : '(쪽 없음)'} [${MEMO_TYPE_LABEL[m.type] || '생각'}] ${body}${date ? ` (${date})` : ''}`);
  }
  lines.push('', '## AI에게 요청',
    '위 메모와 인용으로 다음을 만들어 줘:',
    '1. 인용 카드(문장·쪽·내 메모)',
    '2. 주제별 묶음과 내가 반응한 패턴',
    '3. 이 메모에서 출발한 독서평 인터뷰 질문 5개',
    "4. 카페용 '독후감 + AI 책토론' 글 초안",
    '"이 책에서 내 생각은 무엇인가" 한 줄은 내가 직접 쓸 것이니 쓰지 말 것.');
  return `${lines.join('\n')}\n`;
}
