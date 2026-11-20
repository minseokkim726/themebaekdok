// E. 통계 (주간 탭 안, #/week/stats)
import * as R from '../rules.js';
import { esc, fmtKo, fmtMD, WEEKDAYS } from '../format.js';
import { toast, copyText } from './shared.js';

// [이번 주 | 통계] 전환 버튼
export function switchHtml(active) {
  return `
    <div class="seg" role="tablist" aria-label="주간 화면 보기">
      <a href="#/week" role="tab" ${active === 'week' ? 'aria-selected="true"' : 'aria-selected="false"'}>이번 주</a>
      <a href="#/week/stats" role="tab" ${active === 'stats' ? 'aria-selected="true"' : 'aria-selected="false"'}>통계</a>
    </div>`;
}

const dash = (reason) => `<span class="v">—</span>${reason ? `<span class="why">${esc(reason)}</span>` : ''}`;
const tile = (k, v) => `<div class="stat-tile"><div class="k">${esc(k)}</div>${v}</div>`;
const val = (x) => `<span class="v num">${esc(x)}</span>`;
const pct = (x) => `${Math.round(x * 100)}%`;

function bars(rows, { label, value, sub, highlight }) {
  const max = Math.max(1, ...rows.map(value));
  return `
    <div class="mchart" style="grid-template-columns:repeat(${rows.length},minmax(0,1fr))">
      ${rows.map((r) => {
        const v = value(r);
        const h = v > 0 ? Math.max(4, Math.round((v / max) * 100)) : 3;
        return `<div class="mcol${highlight && highlight(r) ? ' hi' : ''}">
          <span class="mval num">${v > 0 ? esc(String(v)) : ''}</span>
          <span class="mbar" style="height:${h}px"></span>
          <span class="mlab">${esc(label(r))}</span>
          ${sub ? `<span class="msub">${esc(sub(r))}</span>` : ''}
        </div>`;
      }).join('')}
    </div>`;
}

export function render(root, d) {
  const { project, settings: s, today } = d;
  if (!project) {
    root.innerHTML = `<div class="page stats-page">${switchHtml('stats')}<div class="card roomy"><div class="st-body">진행 중인 테마백독이 없어요. 지난 백독의 숫자는 히스토리에서 볼 수 있어요.</div><a class="btn primary" href="#/newproject">새 테마백독 시작</a></div></div>`;
    return;
  }
  // 연속은 전체 기록(홈과 같은 값), 나머지는 진행 중인 백독 기준
  const st = R.cycleStats({ project, subcategories: d.subcategories, books: d.books, records: d.projectRecords, settings: s, today, allRecords: d.records });
  const hasCarried = d.books.some((b) => b.carriedFromProjectId);
  const o = st.overview, sp = st.speed, c = st.consistency, b = st.books;

  root.innerHTML = `
    <div class="page stats-page">
      ${switchHtml('stats')}
      <div class="card roomy">
        <div class="st-card-title">한눈에</div>
        <div class="stat-tiles">
          ${tile('완독', val(`${o.done}/${o.target}권`))}
          ${tile('누적 읽은 쪽수', val(`${o.totalPages.toLocaleString('ko-KR')}쪽`))}
          ${tile('누적 읽은 날', val(`${o.readDays}일`))}
          ${tile(o.milestone ? `${o.milestone.next}권까지` : '다음 목표', o.milestone ? val(`${o.milestone.left}권`) : dash('목표 달성'))}
        </div>
        ${hasCarried ? '<div class="carry-note">누적 쪽수는 이 백독을 시작한 뒤 읽은 양입니다</div>' : ''}
      </div>
      <div class="card roomy">
        <div class="st-card-title">속도</div>
        <div class="stat-tiles">
          ${tile('권당 평균 걸린 날', sp.avgDaysPerBook == null ? dash('완독 1권부터 표시') : val(`${sp.avgDaysPerBook}일`))}
          ${tile('읽은 날 하루 평균', sp.pagesPerReadDay == null ? dash('쪽수 기록부터 표시') : val(`${sp.pagesPerReadDay}쪽`))}
          ${tile('최근 4주 주당 완독', sp.weekly ? `${val(`${sp.weekly.perWeek}권`)}<span class="why">주 ${s.weeklyBooks}권 기준 대비 ${sp.weekly.diff > 0 ? '+' : sp.weekly.diff < 0 ? '−' : '±'}${Math.abs(sp.weekly.diff)}권</span>` : dash(sp.weeklyReason))}
          ${tile('백독 예상 완료일', sp.eta ? (sp.eta.finished ? val('완료') : `${val(fmtKo(sp.eta.date, today))}<span class="why">최근 8주 주 ${sp.eta.perWeek}권 속도</span>`) : dash(sp.etaReason))}
        </div>
      </div>
      <div class="card roomy">
        <div class="st-card-title">꾸준함</div>
        <div class="stat-tiles">
          ${tile('현재 연속', val(`${c.current}일`))}
          ${tile('최장 연속', val(`${c.longest}일`))}
          ${tile('최소선 달성률', c.minRate == null ? dash('기록부터 표시') : val(pct(c.minRate)))}
          ${tile('목표선 달성률', c.goalRate == null ? dash('기록부터 표시') : val(pct(c.goalRate)))}
        </div>
        <div class="st-body">시작일 이후 ${c.countedDays}일 중 쉰 날 ${c.restDays}일</div>
      </div>
      <div class="card roomy">
        <div class="st-card-title">월별 읽은 쪽수</div>
        ${bars(st.monthly, { label: (r) => r.label, value: (r) => r.pages, sub: (r) => `완독 ${r.done}` })}
      </div>
      <div class="card roomy">
        <div class="st-card-title">요일별 평균 쪽수</div>
        ${st.weekday.best == null ? '<div class="st-body">— 쪽수 기록부터 표시</div>'
          : `${bars(st.weekday.rows, { label: (r) => WEEKDAYS[r.dow], value: (r) => r.avg, highlight: (r) => r.dow === st.weekday.best })}
             <div class="st-body">가장 많이 읽는 요일: <b>${WEEKDAYS[st.weekday.best]}요일</b></div>`}
      </div>
      <div class="card roomy">
        <div class="st-card-title">카테고리별</div>
        <div class="st-cats">
          ${st.categories.rows.map((r) => `
            <div class="st-cat" style="grid-template-columns:minmax(0,1fr) 96px 52px">
              <span class="n">${esc(r.name)}</span>
              <span class="bar thick"><span style="width:${r.goal ? Math.min(100, (r.done / r.goal) * 100) : 0}%"></span></span>
              <span class="c num">${r.done}/${r.goal}</span>
            </div>`).join('')}
        </div>
        <div class="st-body">${st.categories.leading
          ? `가장 앞선 카테고리: <b>${esc(st.categories.leading.name)}</b> · 가장 뒤처진 카테고리: <b>${esc(st.categories.lagging.name)}</b>`
          : '— 완독 1권부터 표시'}</div>
      </div>
      <div class="card roomy">
        <div class="st-card-title">책</div>
        ${b.list.length ? `
          <table class="stat-table">
            <thead><tr><th>제목</th><th>쪽수</th><th>걸린 날</th><th>완독일</th></tr></thead>
            <tbody>${b.list.map((x) => `<tr><td>${esc(x.title)}</td><td class="num">${x.pages}</td><td class="num">${x.days == null ? '—' : `${x.days}일`}</td><td class="num">${x.finishDate ? esc(fmtMD(x.finishDate)) : '—'}</td></tr>`).join('')}</tbody>
          </table>` : '<div class="st-body">아직 완독한 책이 없어요.</div>'}
        <div class="stat-lines">
          <div><span class="st-meta">평균 쪽수</span> ${b.avgPages == null ? '—' : `${b.avgPages}쪽`}</div>
          <div><span class="st-meta">가장 두꺼운 책</span> ${b.thickest ? `${esc(b.thickest.title)} (${b.thickest.pages}쪽)` : '—'}</div>
          <div><span class="st-meta">가장 빨리 읽은 책</span> ${b.fastest ? `${esc(b.fastest.title)} (${b.fastest.days}일)` : '—'}</div>
          <div><span class="st-meta">중단한 책</span> ${b.dropped}권</div>
        </div>
      </div>
      <button type="button" class="btn primary" data-act="copy-stats">통계 복사</button>
      <div class="page-bottom-space"></div>
    </div>`;

  root.querySelector('[data-act="copy-stats"]').addEventListener('click', async () => {
    const ok = await copyText(R.statsText(st, project, s, d.ordinal, today));
    toast(ok ? '통계를 복사했어요. Claude 대화에 붙여 넣으세요' : '복사하지 못했어요');
  });
}
