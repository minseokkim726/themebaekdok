// v1.2 D. 히스토리: 목록(#/history)과 지난 백독 상세(#/history/<id>, 읽기 전용)
import * as repo from '../repo.js';
import * as R from '../rules.js';
import { esc, fmtDot } from '../format.js';
import { toast, ask, alertMsg, openDialog, copyText } from './shared.js';
import { bookHref } from './bookActions.js';

const isWebLink = (u) => /^https?:\/\/\S+$/i.test(String(u || '').trim());
const pctOf = (n, t) => (t ? Math.min(100, (n / t) * 100) : 0);

export function render(root, d, ctx) {
  if (ctx.param) renderDetail(root, d, ctx);
  else renderList(root, d, ctx);
}

// 진행 중 / 완료 / 중단(v1.4 B-H3)
const endLabel = (p) => (p.status === R.ACTIVE ? '진행 중' : p.endType === R.END_STOP ? '중단' : '완료');

// ---------- 목록 ----------
function renderList(root, d) {
  const tot = R.historyTotals({ projects: d.projects, books: d.allBooks, records: d.records, settings: d.settings });
  const list = [...d.projects].sort((a, b) => d.ordinals[b.id] - d.ordinals[a.id]);
  const hasPast = d.projects.some((p) => p.status !== R.ACTIVE);
  const tile = (k, v) => `<div class="stat-tile"><div class="k">${esc(k)}</div><span class="v num">${esc(v)}</span></div>`;

  root.innerHTML = `
    <div class="page status-page">
      <div class="h1">히스토리</div>
      <div class="card roomy">
        <div class="st-card-title">전체 합계</div>
        <div class="stat-tiles">
          <div class="stat-tile"><div class="k">완료한 테마백독</div><span class="v num">${tot.completed}회</span>${tot.active || tot.stopped ? `<span class="why">${[tot.active ? `진행 중 ${tot.active}` : '', tot.stopped ? `중단 ${tot.stopped}` : ''].filter(Boolean).join(' · ')}</span>` : ''}</div>
          ${tile('완독 총', `백독 ${tot.doneProject} · 백독 외 ${tot.doneOutside}`)}
          ${tile('읽은 쪽수 합계', `${tot.pages.toLocaleString('ko-KR')}쪽`)}
          ${tile('읽은 날 합계', `${tot.readDays}일`)}
          ${tile('첫 기록일', tot.firstDate ? fmtDot(tot.firstDate) : '—')}
        </div>
      </div>
      ${list.map((p) => {
        const books = d.allBooks.filter((b) => b.projectId === p.id);
        const done = books.filter((b) => b.status === 'done').length;
        const active = p.status === R.ACTIVE;
        const period = active
          ? `${fmtDot(p.startDate)} ~ 진행 중 · 완독 ${done} / ${p.targetBooks}권`
          : `${fmtDot(p.startDate)} ~ ${fmtDot(p.endDate)} · 완독 ${done} / ${p.targetBooks}권 · ${R.durationText(p.startDate, p.endDate)}`;
        return `
          <a class="card roomy hist-card" href="${active ? '#/status' : `#/history/${encodeURIComponent(p.id)}`}" aria-label="${d.ordinals[p.id]}번째 테마백독 ${esc(p.name)} ${active ? '진행 중' : '자세히'}">
            <span class="st-eyebrow">${d.ordinals[p.id]}번째 테마백독 · ${endLabel(p)}</span>
            <span class="topic-name">${esc(p.name)}</span>
            <span class="st-meta num">${esc(period)}</span>
            <span class="bar thick"><span style="width:${pctOf(done, p.targetBooks)}%"></span></span>
          </a>`;
      }).join('')}
      ${hasPast ? '' : '<div class="st-body" style="text-align:center">첫 테마백독을 마치면 여기에 쌓입니다.</div>'}
      ${outsideSection(d)}
      ${d.project ? '' : '<a class="btn primary" href="#/newproject">새 테마백독 시작</a>'}
      <div class="page-bottom-space"></div>
    </div>`;
}

// v1.4 A4: 백독 외 독서(전체 기간 완독 목록, 연도별)
function outsideSection(d) {
  const all = d.outsideBooks || [];
  if (!all.length) return '';
  const done = all.filter((b) => b.status === 'done').sort((a, b) => ((a.finishDate || '') < (b.finishDate || '') ? 1 : -1));
  const years = [...new Set(done.map((b) => (b.finishDate || '').slice(0, 4)))];
  return `
      <div class="card roomy">
        <div class="row"><div class="st-card-title">백독 외 독서</div><div class="st-meta">완독 ${done.length}권</div></div>
        ${done.length ? years.map((y) => `
          <div class="st-meta" style="margin-top:4px">${esc(y)}년 · ${done.filter((b) => (b.finishDate || '').startsWith(y)).length}권</div>
          <ul class="paste-list">${done.filter((b) => (b.finishDate || '').startsWith(y)).map((b) => `<li><a class="st-item-title book-link" href="${bookHref(b.id, true)}">${esc(b.title)}</a> <span class="st-meta">· ${esc(fmtDot(b.finishDate))}</span>${b.thought ? `<br><span class="st-body">${esc(b.thought)}</span>` : ''}</li>`).join('')}</ul>`).join('')
          : '<div class="st-body">아직 완독한 백독 외 책이 없어요.</div>'}
        <a class="link-btn" href="#/outside" style="align-self:flex-start;padding:0">백독 외 독서 화면 ›</a>
      </div>`;
}

// ---------- 지난 백독 상세 ----------
function renderDetail(root, d, ctx) {
  const p = d.projects.find((x) => x.id === ctx.param);
  if (!p) {
    root.innerHTML = '<div class="page"><a class="back" href="#/history">← 히스토리</a><div class="st-body">백독을 찾을 수 없어요.</div></div>';
    return;
  }
  const ord = d.ordinals[p.id];
  const active = p.status === R.ACTIVE;
  const subs = d.allSubcategories.filter((c) => c.projectId === p.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const books = d.allBooks.filter((b) => b.projectId === p.id);
  const catName = (id) => (subs.find((c) => c.id === id) || {}).name || '';
  const done = books.filter((b) => b.status === 'done').sort((a, b) => ((a.finishDate || '') < (b.finishDate || '') ? -1 : 1));
  const dropped = books.filter((b) => b.status === 'dropped');
  const planned = books.filter((b) => b.status === 'planned');
  const carried = books.filter((b) => b.status === 'reading' && b.carryOver);
  // 이미 다음 백독으로 옮겨 간 책(완독·중단과 구분해 표시)
  const carriedOut = d.allBooks.filter((b) => b.carriedFromProjectId === p.id);
  const st = R.periodStats({ project: p, subcategories: subs, books, records: d.records, settings: d.settings, today: d.today });
  const maxM = Math.max(1, ...st.months.map((m) => m.done));
  const tile = (k, v) => `<div class="stat-tile"><div class="k">${esc(k)}</div><span class="v num">${esc(v)}</span></div>`;
  const listItem = (b) => `<li><a class="st-item-title book-link" href="${bookHref(b.id, true)}">${esc(b.title)}</a>${b.author ? ` <span class="st-meta">· ${esc(b.author)}</span>` : ''} <span class="st-meta">· ${esc(catName(b.subcategoryId))}</span></li>`;

  root.innerHTML = `
    <div class="page status-page">
      <div class="row"><a class="back" href="#/history">← 히스토리</a></div>
      <div class="card roomy topic-card">
        <div class="st-eyebrow">${ord}번째 테마백독 · ${endLabel(p)}</div>
        ${p.endType === R.END_STOP && p.endNote ? `<div class="st-body end-note">중단 메모: ${esc(p.endNote)}</div>` : ''}
        <div class="topic-name">${esc(p.name)}</div>
        ${p.description ? `<div class="st-body topic-desc">${esc(p.description)}</div>` : ''}
        <div class="st-meta num">${esc(fmtDot(p.startDate))} ~ ${active ? '진행 중' : `${esc(fmtDot(p.endDate))} · ${esc(R.durationText(p.startDate, p.endDate))}`}</div>
        <div class="row center"><span class="st-strong num">완독 ${done.length} / ${p.targetBooks}권</span><span class="st-meta num">${Math.round(pctOf(done.length, p.targetBooks))}%</span></div>
        <div class="bar thick"><div style="width:${pctOf(done.length, p.targetBooks)}%"></div></div>
      </div>
      <div class="card roomy">
        <div class="st-card-title">카테고리별</div>
        <div class="st-cats">
          ${st.categories.map((c) => `
            <div class="st-cat" style="grid-template-columns:minmax(0,1fr) 96px 52px">
              <span class="n">${esc(c.name)}</span>
              <span class="bar thick"><span style="width:${pctOf(c.done, c.goal)}%"></span></span>
              <span class="c num">${c.done}/${c.goal}</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="card roomy">
        <div class="st-card-title">숫자로 보기</div>
        <div class="stat-tiles">
          ${tile('읽은 쪽수', `${st.pages.toLocaleString('ko-KR')}쪽`)}
          ${tile('읽은 날', `${st.readDays}일`)}
          ${tile('권당 평균 걸린 날', st.avgDaysPerBook == null ? '—' : `${st.avgDaysPerBook}일`)}
          ${tile('읽은 날 하루 평균', st.pagesPerReadDay == null ? '—' : `${st.pagesPerReadDay}쪽`)}
          ${tile('최장 연속(이 기간)', `${st.longest}일`)}
        </div>
        <div class="st-card-title" style="font-size:16px;margin-top:6px">월별 완독 권수</div>
        <div class="hist-months">
          ${st.months.map((m) => `
            <div class="hist-month">
              <span class="st-meta num">${esc(m.ym.replace('-', '.'))}</span>
              <span class="bar thick"><span style="width:${(m.done / maxM) * 100}%"></span></span>
              <span class="c num">${m.done}권</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="card roomy">
        <div class="row"><div class="st-card-title">완독한 책</div><div class="st-meta">${done.length}권</div></div>
        ${done.length === 0 ? '<div class="st-body">완독한 책이 없어요.</div>' : `<div class="st-done-list">${done.map((b) => `
          <div class="st-done hist-book">
            <span class="t"><a class="st-item-title book-link" href="${bookHref(b.id, true)}">${esc(b.title)}</a><span class="st-meta num">${esc(fmtDot(b.finishDate))}</span></span>
            <span class="st-meta">${esc([b.author, catName(b.subcategoryId)].filter(Boolean).join(' · '))}</span>
            <span class="st-body">${b.thought ? esc(b.thought) : '<span class="st-meta">한 줄 생각 없음</span>'}</span>
            <span class="hist-book-btns">
              ${isWebLink(b.reviewUrl) ? `<a class="btn small" href="${esc(b.reviewUrl)}" target="_blank" rel="noopener noreferrer">독서평 보기</a>` : (b.reviewUrl ? `<span class="st-meta">${esc(b.reviewUrl)}</span>` : '')}
              <button type="button" class="btn small link" data-notes="${esc(b.id)}">한 줄 생각·링크 고치기</button>
            </span>
          </div>`).join('')}</div>`}
      </div>
      ${carriedOut.length ? `
      <div class="card roomy">
        <div class="row"><div class="st-card-title">다음 백독으로 가져감</div><div class="st-meta">${carriedOut.length}권</div></div>
        <ul class="paste-list">${carriedOut.map((b) => `<li><a class="st-item-title book-link" href="${bookHref(b.id, true)}">${esc(b.title)}</a> <span class="st-meta">· 이 백독에서 ${Number(b.carriedFromPage) || 0}/${b.totalPages}쪽까지 읽음 · ${d.ordinals[b.projectId] ? `${d.ordinals[b.projectId]}번째 백독으로` : ''}</span></li>`).join('')}</ul>
      </div>` : ''}
      ${dropped.length + planned.length + carried.length ? `
      <details class="card roomy hist-more">
        <summary>중단한 책 ${dropped.length}권 · 읽지 않은 목록 ${planned.length}권${carried.length ? ` · 가져가기로 둔 책 ${carried.length}권` : ''}</summary>
        ${dropped.length ? `<div class="st-meta">중단한 책</div><ul class="paste-list">${dropped.map(listItem).join('')}</ul>` : ''}
        ${planned.length ? `<div class="st-meta">읽지 않은 목록</div><ul class="paste-list">${planned.map(listItem).join('')}</ul>` : ''}
        ${carried.length ? `<div class="st-meta">가져가기로 둔 책(다음 백독을 시작하면 옮겨져요)</div><ul class="paste-list">${carried.map(listItem).join('')}</ul>` : ''}
      </details>` : ''}
      <button type="button" class="btn primary" data-act="copy-summary">이 백독 정리 복사</button>
      ${active ? '' : '<button type="button" class="link-btn quiet" data-act="reopen">다시 진행 중으로 되돌리기</button>'}
      <div class="page-bottom-space"></div>
    </div>`;

  root.querySelector('[data-act="copy-summary"]').addEventListener('click', async () => {
    const ok = await copyText(R.projectSummaryText({ project: p, ordinal: ord, subcategories: subs, books, stats: st }));
    toast(ok ? '이 백독 정리를 복사했어요' : '복사하지 못했어요');
  });

  root.querySelectorAll('[data-notes]').forEach((btn) => btn.addEventListener('click', () => editNotes(books.find((b) => b.id === btn.dataset.notes), ctx)));

  const reopen = root.querySelector('[data-act="reopen"]');
  if (reopen) reopen.addEventListener('click', async () => {
    if (d.project) { await alertMsg('되돌릴 수 없어요', '지금 진행 중인 백독을 먼저 마쳐야 합니다.'); return; }
    const yes = await ask({
      title: '다시 진행 중으로 되돌릴까요?',
      message: `${ord}번째 테마백독 「${p.name}」을(를) 다시 진행 중으로 둡니다. 종료일은 지워집니다.`,
      choices: [{ label: '되돌리기', value: true, kind: 'primary' }, { label: '취소', value: false }],
    });
    if (!yes) return;
    try {
      await repo.reopenProject(p.id);
      toast('다시 진행 중으로 되돌렸어요');
      ctx.go('status');
    } catch (e) {
      await alertMsg('되돌릴 수 없어요', e.message || String(e));
    }
  });
}

// 지난 백독의 완독한 책: 한 줄 생각과 독서평 링크만 고친다(v1.5 책 상세에서도 쓴다)
export async function editNotes(book, ctx) {
  if (!book) return;
  let vals = null;
  const res = await openDialog(`
    <p class="title">${esc(book.title)}</p>
    <div class="field" style="margin-bottom:10px">
      <label for="hn-thought">한 줄 생각</label>
      <textarea id="hn-thought" class="textarea" rows="3">${esc(book.thought || '')}</textarea>
    </div>
    <div class="field" style="margin-bottom:12px">
      <label for="hn-link">독서평 링크</label>
      <input id="hn-link" class="input" type="url" inputmode="url" placeholder="https://" value="${esc(book.reviewUrl || '')}" autocomplete="off">
    </div>
    <div class="choices">
      <button type="button" class="btn primary" data-a="save">저장</button>
      <button type="button" class="btn link" data-a="cancel">취소</button>
    </div>`, (dlg, close) => {
    dlg.querySelector('[data-a="save"]').addEventListener('click', () => {
      vals = { thought: dlg.querySelector('#hn-thought').value, reviewUrl: dlg.querySelector('#hn-link').value };
      close('save');
    });
    dlg.querySelector('[data-a="cancel"]').addEventListener('click', () => close(null));
  });
  if (res !== 'save') return;
  await repo.updateBookNotes(book.id, vals);
  toast('고쳤어요');
  ctx.refresh();
}
