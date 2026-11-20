// 4. 주간 화면: 7일 막대, 타일, 최근 4주 달력, 요약 복사, 백업, 설정
import * as repo from '../repo.js';
import * as R from '../rules.js';
import { esc, projectLine, fmtMD, fmtMDShort, fmtLong, fmtKo, weekdayOf, localDateOf, WEEKDAYS } from '../format.js';
import { toast, ask, alertMsg, openDialog, exportBackup, importBackup, copyText } from './shared.js';
import * as stats from './stats.js';
import { helpBtn, bindHelp } from './bookActions.js';

// Claude 대화에 붙여 넣을 주간 요약(v1.4 B-M7: 읽은 날·연속·완독 책·쪽수 목표 대비)
export function weekSummaryText(d) {
  const { project, settings: s, books, records, today } = d;
  const w = R.weekStats(records, s, today, d.firstStart);
  const goal = R.weekPageGoal(s);
  const readDays = w.days.filter((x) => x.counted && R.atLeast(x.grade, 'accept')).length;
  const streak = R.streak(records, s, today);
  const outside = d.outsideBooks || [];
  const doneWeek = R.doneThisWeek(books, today, s.weekStartsOn);
  const doneWeekOutside = R.doneThisWeek(outside, today, s.weekStartsOn);
  const doneAll = books.filter((b) => b.status === 'done').length;
  const rest = w.restDays.length ? `쉰 날 ${w.restDays.length} (${w.restDays.map(weekdayOf).join(', ')})` : '쉰 날 0';
  const catName = (b) => ((d.subcategories || []).find((c) => c.id === b.subcategoryId) || {}).name || '';
  const reading = (d.readingBooks || []).map((b) => {
    const est = R.finishEstimate(records, b, today);
    return `${b.title}${R.isOutside(b) ? '(백독 외)' : ''} ${b.currentPage}/${b.totalPages}쪽${est ? ` · ${fmtMDShort(est.date)} 완독 예상` : ''}`;
  });
  const doneList = [...books, ...outside].filter((b) => b.status === 'done' && R.inWeek(b.finishDate, today, s.weekStartsOn))
    .map((b) => `- ${b.title} (${R.isOutside(b) ? '백독 외' : `백독 · ${catName(b)}`})`);
  return [
    `[테마백독 주간 요약] ${project ? projectLine(project, d.ordinal) : '진행 중인 테마백독 없음'}`,
    `기간 ${fmtMD(w.start)}~${fmtMD(w.end)} · 읽은 쪽수 ${w.pages} / ${goal.goal}쪽 (최소 ${goal.min}쪽, ${w.pages >= goal.min ? '최소 달성' : `최소까지 ${goal.min - w.pages}쪽`})`,
    `읽은 날 ${readDays}일 · 연속 ${streak}일`,
    `최소선 ${w.minDays}/${w.countedDays}일 · 목표선 ${w.goalDays}/${w.countedDays}일 · ${rest}`,
    `읽는 중: ${reading.length ? reading.join(' / ') : '없음'}`,
    `이번 주 완독 ${doneWeek}권 (주간 목표 ${s.weeklyBooks}권)${doneWeekOutside ? ` + 백독 외 ${doneWeekOutside}권` : ''}${project ? ` · 누적 ${doneAll}/${project.targetBooks}권` : ''}`,
    ...doneList,
  ].join('\n');
}

export function render(root, d, ctx) {
  if (ctx.param === 'stats') { stats.render(root, d, ctx); return; }
  const { project, settings: s, books, records, today } = d;
  const w = R.weekStats(records, s, today, d.firstStart);
  const cells = R.calendarCells(records, s, today, d.firstStart);
  const doneWeek = R.doneThisWeek(books, today, s.weekStartsOn);
  const doneWeekOutside = R.doneThisWeek(d.outsideBooks || [], today, s.weekStartsOn);
  const goal = R.weekPageGoal(s);
  const readDays = project ? R.totalReadDays(d.projectRecords, s, project.startDate) : 0;
  const restIn4 = cells.filter((c) => c.kind === 'rest').length;
  const summary = weekSummaryText(d);
  const lastBackup = localDateOf(s.lastBackupAt);
  const backupDue = R.backupReminder(lastBackup, today);

  // 막대: 목표선이 75px 높이가 되게 맞춘다(시안 비율)
  const scale = 75 / s.goalPages;
  const minLine = Math.round(s.minPages * scale);
  const bars = w.days.map((day) => {
    const r = day.record;
    let val = '';
    let bar = 'height:3px;border-radius:2px;background:var(--line)';
    if (r && r.mode === 'time' && !r.pages) {
      val = `${r.minutes}분`;
      bar = `height:${minLine}px;border-radius:4px 4px 0 0;background:var(--primary)`;
    } else if (r && r.pages > 0) {
      val = String(r.pages);
      const h = Math.max(4, Math.min(100, Math.round(r.pages * scale)));
      bar = `height:${h}px;border-radius:4px 4px 0 0;background:${R.atLeast(day.grade, 'min') ? 'var(--primary)' : 'var(--warn-bar)'}`;
    } else if (r && day.rest) {
      val = String(r.pages || 0);
      bar = `height:${Math.max(4, Math.round((r.pages || 0) * scale))}px;border-radius:4px 4px 0 0;background:var(--warn-bar)`;
    } else if (!r && !day.future && day.date < today) {
      val = day.rest ? '쉼' : '';
      bar = `height:${minLine}px;border-radius:4px;border:1.5px dashed var(--rest);background:transparent;box-sizing:border-box`;
    }
    const label = `${fmtLong(day.date)} ${val || '기록 없음'}`;
    const inner = `<span class="val">${esc(val)}</span><span class="b" style="${bar}"></span>`;
    return day.future
      ? `<div class="col" aria-hidden="true">${inner}</div>`
      : `<button type="button" class="col" data-day="${day.date}" aria-label="${esc(label)} · 기록 넣기/고치기">${inner}</button>`;
  }).join('');

  const dayNames = w.days.map((day) => `<span class="${day.date === today ? 'today' : ''}">${WEEKDAYS[R.dayOfWeek(day.date)]}</span>`).join('');

  const calHead = Array.from({ length: 7 }, (_, i) => `<span>${WEEKDAYS[(s.weekStartsOn + i) % 7]}</span>`).join('');
  const cellHtml = cells.map((c, i) => {
    const day = Number(c.date.slice(8));
    const n = day === 1 ? `${Number(c.date.slice(5, 7))}/1` : String(day);
    const wk = i >= 21 ? ' this-week' : '';
    if (c.kind === 'future' || c.kind === 'before') return `<div class="cell ${c.kind}${wk}" aria-hidden="true">${n}</div>`;
    return `<button type="button" class="cell ${c.kind}${wk}" data-day="${c.date}" aria-label="${esc(fmtLong(c.date))} 기록 넣기/고치기">${n}</button>`;
  }).join('');

  root.innerHTML = `
    <div class="page">
      ${stats.switchHtml('week')}
      <div class="row">
        <div class="h1">주간 요약</div>
        <div class="sub">${fmtMD(w.start)} ~ ${fmtMD(w.end)}</div>
      </div>
      <div class="card week-goal" style="gap:6px">
        <div class="row center">
          <div class="h2">이번 주 쪽수</div>
          <div class="wg-num num"><b>${w.pages}</b> / ${goal.goal}쪽 <span class="small">(최소 ${goal.min})</span></div>
        </div>
        <div class="wg-bar" role="img" aria-label="이번 주 ${w.pages}쪽, 목표 ${goal.goal}쪽, 최소 ${goal.min}쪽">
          <div class="wg-fill" style="width:${Math.min(100, (w.pages / goal.goal) * 100)}%;background:${w.pages >= goal.min ? 'var(--primary)' : 'var(--warn-bar)'}"></div>
          <div class="wg-min" style="left:${(goal.min / goal.goal) * 100}%"></div>
        </div>
        <div class="tiny">목표 = 목표선 ${s.goalPages}쪽 × 7일 · 최소 = 최소선 ${s.minPages}쪽 × 7일</div>
      </div>
      <div class="card" style="gap:6px">
        <div class="chart">
          <div class="line" style="bottom:75px;border-color:var(--primary)"></div>
          <div class="line-label" style="bottom:75px;color:var(--primary-dark)">목표<br>${s.goalPages}</div>
          <div class="line" style="bottom:${minLine}px;border-color:var(--warn-bar)"></div>
          <div class="line-label" style="bottom:${minLine}px;color:var(--warn)">최소<br>${s.minPages}</div>
          <div class="cols">${bars}</div>
        </div>
        <div class="days">${dayNames}</div>
        <div class="row center"><div class="tiny">점선 칸 = 기록 없는 날 · 막대나 달력의 날을 누르면 그날 기록을 넣거나 고칠 수 있어요</div>${helpBtn('lines', '목표선·최소선·쉰 날 설명')}</div>
      </div>
      <div class="tiles" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <div class="tile"><div class="k">최소선 달성 ${helpBtn('minDays', '최소선 달성 일수 설명')}</div>${w.countedDays
          ? `<div class="v num">${w.minDays} / ${w.countedDays}일</div>`
          : '<div class="v">—</div><div class="tiny">오늘 기록부터 셉니다</div>'}</div>
        <div class="tile"><div class="k">이번 주 완독</div><div class="v num">${doneWeek} / ${s.weeklyBooks}권</div>${doneWeekOutside ? `<div class="tiny">+ 백독 외 ${doneWeekOutside}권</div>` : ''}</div>
      </div>
      <div class="card" style="gap:10px">
        <div class="row"><div class="h2">최근 4주</div><div class="small">누적 읽은 날 ${readDays}일 · 쉰 날 ${restIn4}일</div></div>
        <div class="cal cal-head" aria-hidden="true">${calHead}</div>
        <div class="cal">${cellHtml}</div>
        <div class="legend">
          <span><i style="background:var(--cal-goal)"></i>목표선</span>
          <span><i style="background:var(--cal-min)"></i>최소선</span>
          <span><i style="background:var(--cal-accept)"></i>인정선</span>
          <span><i style="box-sizing:border-box;border:1.5px solid var(--rest)"></i>쉰 날</span>
          ${helpBtn('lines', '목표선·최소선·인정선·쉰 날 설명')}
        </div>
      </div>
      <div class="card" style="gap:10px">
        <div class="h2">Claude 대화에 붙여 넣을 요약</div>
        <pre class="summary" data-el="summary">${esc(summary)}</pre>
        <button type="button" class="btn primary" data-act="copy">요약 복사</button>
      </div>
      <div class="card backup">
        <div>
          <div class="h2">데이터 백업</div>
          <div class="tiny" style="margin-top:2px;${backupDue ? 'color:var(--warn)' : ''}">마지막 백업: ${lastBackup ? `${esc(fmtKo(lastBackup))} (${R.daysBetween(lastBackup, today)}일 전)` : '아직 없음'} · 7일마다 알려줘요</div>
        </div>
        <div class="btns">
          <button type="button" class="btn small" data-act="import">가져오기</button>
          <button type="button" class="btn small outline" data-act="export">내보내기</button>
        </div>
      </div>
      <a class="btn" href="#/settings">설정</a>
      <div class="page-bottom-space"></div>
    </div>`;

  const q = (sel) => root.querySelector(sel);

  q('[data-act="copy"]').addEventListener('click', async () => {
    const ok = await copyText(summary);
    toast(ok ? '요약을 복사했어요' : '복사하지 못했어요. 요약을 길게 눌러 복사하세요');
  });

  q('[data-act="export"]').addEventListener('click', async () => { if (await exportBackup()) ctx.refresh(); });

  q('[data-act="import"]').addEventListener('click', async () => { if (await importBackup()) ctx.refresh(); });

  bindHelp(root, s);
  root.querySelectorAll('[data-day]').forEach((b) =>
    b.addEventListener('click', () => editDay(d, b.dataset.day, ctx)));
}

// 지난 날짜(또는 오늘)의 기록을 넣거나 고친다
async function editDay(d, date, ctx) {
  const { records, settings: s } = d;
  // 고를 수 있는 책: 그날 기록이 있는 책 + 읽는 중인 책(v1.4부터 하루에 책마다 1건)
  const dayRecs = records.filter((r) => r.date === date);
  const cands = [];
  for (const r of dayRecs) { const b = d.allBooks.find((x) => x.id === r.bookId); if (b && !cands.includes(b)) cands.push(b); }
  for (const b of d.readingBooks || []) if (!cands.includes(b)) cands.push(b);
  if (!cands.length) {
    await alertMsg(fmtLong(date), '읽는 중인 책이 없어 기록할 수 없어요. 먼저 책을 추가하거나 읽기 시작하세요.');
    return;
  }
  let book = cands[0];
  if (cands.length > 1) {
    const pick = await ask({
      title: `${fmtLong(date)} · 어느 책의 기록인가요?`,
      choices: [...cands.map((b) => {
        const r = dayRecs.find((x) => x.bookId === b.id);
        return { label: `${b.title}${r ? (r.mode === 'time' ? ` (${r.minutes}분)` : ` (${r.pages}쪽)`) : ''}`, value: b.id };
      }), { label: '취소', value: null, kind: 'link' }],
    });
    if (!pick) return;
    book = cands.find((b) => b.id === pick);
  }
  const rec = dayRecs.find((r) => r.bookId === book.id) || null;
  const others = records.filter((r) => !(r.date === date && r.bookId === book.id));
  const prev = R.prevEndPage(others, book.id, date, book.readBefore);
  const st = { cur: rec && rec.mode === 'pages' ? rec.endPage : prev };

  const html = `
    <p class="title">${esc(fmtLong(date))} 기록</p>
    <p class="msg" style="margin-bottom:6px">${esc(book.title)} · 지금 기록: ${rec ? (rec.mode === 'time' ? `${rec.minutes}분 읽음` : `${rec.pages}쪽 (${rec.endPage}쪽까지)`) : '없음'}</p>
    <label for="dcur" class="sub">그날 어디까지 읽었나요? (현재 쪽)</label>
    <div class="stepper">
      <button type="button" class="round" data-a="dec" aria-label="1쪽 줄이기">−</button>
      <input id="dcur" class="bignum" style="font-size:44px;width:140px" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off">
      <button type="button" class="round" data-a="inc" aria-label="1쪽 늘리기">+</button>
    </div>
    <p class="msg num" data-el="line" style="text-align:center"></p>
    <div class="choices">
      <button type="button" class="btn primary" data-a="save">저장</button>
      <button type="button" class="btn" data-a="time">${s.minMinutes}분 읽음으로 저장</button>
      <button type="button" class="btn link" data-a="cancel">취소</button>
    </div>`;

  const result = await openDialog(html, (dlg, close) => {
    const input = dlg.querySelector('#dcur');
    const line = dlg.querySelector('[data-el="line"]');
    const upd = (keep) => {
      st.cur = R.clampEndPage(st.cur, book.totalPages);
      if (!keep) input.value = String(st.cur);
      line.textContent = `그날 ${R.pagesRead(st.cur, prev)}쪽 · 전날까지 ${prev}쪽`;
    };
    dlg.querySelector('[data-a="dec"]').addEventListener('click', () => { st.cur -= 1; upd(); });
    dlg.querySelector('[data-a="inc"]').addEventListener('click', () => { st.cur += 1; upd(); });
    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '');
      if (digits !== input.value) input.value = digits;
      st.cur = digits === '' ? prev : Number(digits);
      upd(true);
    });
    input.addEventListener('change', () => upd());
    dlg.querySelector('[data-a="save"]').addEventListener('click', () => close('pages'));
    dlg.querySelector('[data-a="time"]').addEventListener('click', () => close('time'));
    dlg.querySelector('[data-a="cancel"]').addEventListener('click', () => close(null));
    upd();
  });
  if (!result) return;
  try {
    await repo.saveDay({ date, bookId: book.id, mode: result, endPage: st.cur });
    toast(`${fmtKo(date)} 기록을 저장했어요`);
    ctx.refresh();
  } catch (e) {
    toast(`저장하지 못했어요: ${e.message || e}`);
  }
}
