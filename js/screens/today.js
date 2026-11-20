// 1. 오늘(홈) 화면 — 앱 열기 → 칩 한 번 → 기록하기
import * as repo from '../repo.js';
import * as R from '../rules.js';
import { esc, fmtLong, projectLine, pct, localDateOf, WEEKDAYS } from '../format.js';
import { toast, exportBackup } from './shared.js';
import { helpBtn, bindHelp } from './bookActions.js';

const CHIPS = [10, 20, 30, 50];

// 읽는 책이 여러 권일 때 고른 책(앱을 다시 열면 가장 최근에 기록한 책으로 돌아간다)
let selectedBookId = null;

export function render(root, d, ctx) {
  const { project, settings: s, books, records, today } = d;
  const readingBooks = d.readingBooks || [];
  const book = readingBooks.find((b) => b.id === selectedBookId) || readingBooks[0] || null;
  const multi = readingBooks.length > 1;

  // 진행 중인 테마백독도, 읽는 중인 백독 외 책도 없으면 새로 시작 안내
  if (!project && !book) {
    root.innerHTML = noProjectHtml();
    return;
  }

  if (books.length + (d.outsideBooks || []).length === 0) {
    root.innerHTML = `
      <div class="empty">
        <div class="h1">첫 책을 추가하세요</div>
        <div class="st-body">오늘의 최소선은 ${s.minPages}쪽, 목표선은 ${s.goalPages}쪽이에요.</div>
        <a class="btn primary big" href="#/add" style="max-width:320px">+ 책 추가</a>
      </div>`;
    return;
  }

  const streak = R.streak(records, s, today);
  const ordinal = project ? R.weekBookOrdinal(books, today, s.weekStartsOn) : null;
  const doneCount = books.filter((b) => b.status === 'done').length;
  const notice = R.restNotice(records, s, today, d.firstStart); // 백독과 무관하게 전체 기록 기준
  const backup = R.backupReminder(localDateOf(s.lastBackupAt), today);

  const header = `
    <div class="row">
      <div class="sub">${project ? esc(projectLine(project, d.ordinal)) : '<a href="#/newproject" style="text-decoration:underline">진행 중인 테마백독 없음 · 새로 시작</a>'}</div>
      <div class="small">${esc(fmtLong(today))}</div>
    </div>
    ${backup ? `
      <div class="band">
        <span>${backup.days == null ? '아직 백업하지 않았어요' : `백업한 지 ${backup.days}일 됐어요`}</span>
        <button type="button" data-act="export">내보내기</button>
      </div>` : ''}
    <div class="tiles">
      <div class="tile"><div class="k">연속</div><div class="v num">${streak}일</div></div>
      <div class="tile"><div class="k">이번 주</div><div class="v num">${ordinal == null ? '—' : `${ordinal}권째`}</div></div>
      <div class="tile"><div class="k">완독</div><div class="v num">${project ? `${doneCount} / ${project.targetBooks}` : '—'}</div></div>
    </div>
    ${notice ? `<div class="notice">${esc(notice.text)}</div>` : ''}`;

  if (!book) {
    root.innerHTML = `
      <div class="page">
        ${header}
        <div class="card roomy">
          <div class="h2">읽는 중인 책이 없어요</div>
          <div class="small">읽을 목록에서 고르거나 새 책을 추가하세요.</div>
          <div class="grid3" style="grid-template-columns:repeat(2,minmax(0,1fr))">
            <a class="btn" href="#/status">읽을 목록 보기</a>
            <a class="btn outline" href="#/add">+ 책 추가</a>
          </div>
        </div>
      </div>`;
    bindExport(root, ctx);
    return;
  }

  const outside = R.isOutside(book);
  const cat = d.subcategories.find((c) => c.id === book.subcategoryId);
  const todayRec = records.find((r) => r.date === today && r.bookId === book.id) || null;
  // 어제까지 쪽: 이 책의 이전 기록, 없으면 이미 읽은 쪽수(readBefore)
  const prev = R.prevEndPage(records, book.id, today, book.readBefore);
  const total = book.totalPages;
  // 오늘 다른 책 기록(하루 상태는 오늘 전체 합계로 판단)
  const otherToday = records.filter((r) => r.date === today && r.bookId !== book.id);
  const otherPages = otherToday.reduce((a, r) => a + (Number(r.pages) || 0), 0);
  const otherMinutes = otherToday.reduce((a, r) => a + (Number(r.minutes) || 0), 0);
  const badge = (b) => (R.isOutside(b) ? '백독 외' : '백독');
  const shortTitle = (t) => (t.length > 9 ? `${t.slice(0, 8)}…` : t);

  // 화면 상태
  const st = {
    cur: todayRec && todayRec.mode === 'pages' ? todayRec.endPage : prev,
    timeOnly: !!(todayRec && todayRec.mode === 'time'),
    saved: !!todayRec,
    saving: false,
  };

  const minPos = Math.min(100, (s.minPages / s.goalPages) * 100);
  const weekEndName = WEEKDAYS[(s.weekStartsOn + 6) % 7];

  root.innerHTML = `
    <div class="page">
      ${header}
      <div class="card${multi ? ' multi' : ''}">
        ${multi ? `
        <div class="book-switch" role="group" aria-label="읽는 중인 책 고르기">
          ${readingBooks.map((b) => `<button type="button" class="book-chip" data-book="${esc(b.id)}" aria-pressed="${b.id === book.id}"><span>${esc(shortTitle(b.title))}</span><span class="badge${R.isOutside(b) ? ' out' : ''}">${badge(b)}</span></button>`).join('')}
        </div>` : `
        <div class="row">
          <div class="eyebrow">읽는 중</div>
          <div class="tiny">${outside ? '<span class="badge out">백독 외</span>' : esc(cat ? cat.name : '')}</div>
        </div>`}
        <div style="font-size:18px;font-weight:700">${esc(book.title)}</div>
        <div class="bar"><div data-el="bookFill"></div></div>
        <div class="small num" data-el="bookLine"></div>
        <div class="accent" data-el="paceLine"></div>
      </div>
      <div class="card" style="gap:10px">
        <label for="cur" class="sub">오늘 어디까지 읽었나요? (현재 쪽)</label>
        <div class="stepper">
          <button type="button" class="round" data-act="dec" aria-label="1쪽 줄이기">−</button>
          <input id="cur" class="bignum" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" enterkeyhint="done">
          <button type="button" class="round" data-act="inc" aria-label="1쪽 늘리기">+</button>
        </div>
        <div style="text-align:center;font-size:14px;color:var(--muted)" class="num" data-el="todayLine"></div>
        <div class="chips4">
          ${CHIPS.map((n) => `<button type="button" class="chip" data-chip="${n}" aria-pressed="false">+${n}</button>`).join('')}
        </div>
        <div>
          <div class="bar thick"><div data-el="todayFill"></div></div>
          <div class="scale">
            <span style="left:0">오늘 0</span>
            <span style="left:${minPos}%;transform:translateX(-50%)">최소 ${s.minPages}</span>
            <span style="right:24px">목표 ${s.goalPages}</span>
            ${helpBtn('lines', '목표선·최소선·인정선 설명')}
          </div>
        </div>
        <div class="status-text" data-el="status" aria-live="polite"></div>
      </div>
      <div class="page-bottom-space"></div>
    </div>
    <div class="actions">
      <button type="button" class="btn primary big" data-act="save"></button>
      <button type="button" class="link-btn" data-act="time">쪽수 없이 「${s.minMinutes}분 읽음」으로 기록</button>
    </div>`;

  const el = (name) => root.querySelector(`[data-el="${name}"]`);
  const input = root.querySelector('#cur');
  const saveBtn = root.querySelector('[data-act="save"]');

  function update({ keepInput = false } = {}) {
    const cur = R.clampEndPage(st.cur, total);
    const pages = st.timeOnly ? 0 : R.pagesRead(cur, prev);
    const shownCur = st.timeOnly ? prev : cur;
    if (!keepInput) input.value = String(shownCur);
    const p = pct(shownCur, total);
    el('bookFill').style.width = `${p}%`;
    el('bookLine').textContent = `${shownCur} / ${total}쪽 · ${p}%`;
    const need = R.dailyNeed(total - shownCur, today, s.weekStartsOn);
    const pace = el('paceLine');
    if (outside && need.remaining > 0) {
      pace.textContent = '백독 외 독서 · 테마백독 달성률에는 들어가지 않아요';
    } else if (need.remaining === 0) {
      pace.innerHTML = `<a href="#/status" style="text-decoration:underline">마지막 쪽까지 읽었어요 · 현황에서 완독 처리</a>`;
    } else {
      pace.textContent = `${weekEndName}요일까지 완독하려면 하루 ${need.perDay}쪽`;
    }
    // 오늘 전체 합계(다른 책 기록 + 이 책)
    const sumPages = otherPages + pages;
    const sumMinutes = otherMinutes + (st.timeOnly ? s.minMinutes : 0);
    const who = multi || otherToday.length ? '이 책 오늘' : '오늘';
    const mine = st.timeOnly ? `${s.minMinutes}분` : `${pages}쪽`;
    el('todayLine').textContent = `${who} ${mine} · 어제까지 ${prev}쪽${otherToday.length ? ` · 합계 ${sumPages}쪽` : ''}`;
    root.querySelectorAll('[data-chip]').forEach((b) => {
      b.setAttribute('aria-pressed', String(!st.timeOnly && pages === Number(b.dataset.chip)));
    });
    const timeish = sumMinutes >= s.minMinutes;
    const fill = el('todayFill');
    fill.style.width = `${Math.max(timeish ? minPos : 0, Math.min(100, (sumPages / s.goalPages) * 100))}%`;
    fill.style.background = timeish || sumPages >= s.minPages ? 'var(--primary)' : 'var(--warn-bar)';
    // 상태 문구는 오늘 전체 합계 기준(분 기록만으로 최소선이면 "30분 읽음" 문구)
    const status = sumPages < s.minPages && timeish
      ? R.todayStatus({ pages: 0, timeOnly: true }, s)
      : R.todayStatus({ pages: sumPages, timeOnly: false }, s);
    const stEl = el('status');
    stEl.textContent = status.text;
    stEl.className = `status-text tone-${status.tone}`;
    saveBtn.textContent = st.saved ? '기록됨 · 바꾸려면 다시 누르세요' : '기록하기';
    saveBtn.classList.toggle('done', st.saved);
    saveBtn.disabled = st.saving;
  }

  function setCur(v) {
    st.cur = R.clampEndPage(v, total);
    st.timeOnly = false;
    st.saved = false;
    update();
  }

  async function save(mode) {
    if (st.saving) return;
    st.saving = true;
    update({ keepInput: true });
    try {
      await repo.saveDay({ date: today, bookId: book.id, mode, endPage: R.clampEndPage(st.cur, total) });
      selectedBookId = book.id;
      toast(mode === 'time' ? `${s.minMinutes}분 읽음으로 기록했어요` : '기록했어요');
      ctx.refresh();
    } catch (err) {
      st.saving = false;
      update();
      toast(`저장하지 못했어요: ${err.message || err}`);
    }
  }

  root.querySelector('[data-act="dec"]').addEventListener('click', () => setCur((st.timeOnly ? prev : st.cur) - 1));
  root.querySelector('[data-act="inc"]').addEventListener('click', () => setCur((st.timeOnly ? prev : st.cur) + 1));
  root.querySelectorAll('[data-chip]').forEach((b) =>
    b.addEventListener('click', () => setCur(prev + Number(b.dataset.chip))));
  input.addEventListener('focus', () => input.select());
  input.addEventListener('input', () => {
    const digits = input.value.replace(/\D/g, '');
    if (digits !== input.value) input.value = digits;
    st.cur = digits === '' ? prev : Number(digits);
    st.timeOnly = false;
    st.saved = false;
    update({ keepInput: true });
  });
  input.addEventListener('change', () => update());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  saveBtn.addEventListener('click', () => { st.cur = R.clampEndPage(st.cur, total); save(st.timeOnly ? 'time' : 'pages'); });
  root.querySelector('[data-act="time"]').addEventListener('click', () => save('time'));
  root.querySelectorAll('[data-book]').forEach((b) => b.addEventListener('click', () => {
    selectedBookId = b.dataset.book;
    ctx.refresh();
  }));
  bindExport(root, ctx);
  bindHelp(root, s);
  update();
}

// 진행 중인 테마백독이 없을 때(기록 입력은 숨긴다)
export function noProjectHtml() {
  return `
    <div class="empty">
      <div class="h1">진행 중인 테마백독이 없어요</div>
      <div class="st-body">새 주제로 다음 테마백독을 시작하세요. 지난 백독은 히스토리에 있어요.</div>
      <a class="btn primary big" href="#/newproject" style="max-width:320px">새 테마백독 시작</a>
      <a class="link-btn" href="#/history">히스토리 보기</a>
    </div>`;
}

function bindExport(root, ctx) {
  const b = root.querySelector('[data-act="export"]');
  if (b) b.addEventListener('click', async () => { if (await exportBackup()) ctx.refresh(); });
}
