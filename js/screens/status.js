// 2. 현황 화면 (v1.1 글자 키움 · v1.2 주제 카드 · v1.4 여러 권·백독 외 독서)
import * as repo from '../repo.js';
import * as R from '../rules.js';
import { esc, pct, fmtKo, fmtMD, fmtDot } from '../format.js';
import { toast } from './shared.js';
import { openBookPreview } from './preview.js';
import { openTopicEditor } from './topic.js';
import { finishProjectFlow } from './projectFlow.js';
import { noProjectHtml } from './today.js';
import { scopeBadge, manageBook, helpBtn, bindHelp } from './bookActions.js';

export function render(root, d, ctx) {
  const { project, settings: s, books, records, today, subcategories } = d;
  if (!project) {
    root.innerHTML = `<div class="page status-page"><div class="h1">현황</div></div>${noProjectHtml()}`;
    return;
  }
  const catName = (id) => (subcategories.find((c) => c.id === id) || {}).name || '';
  const prog = R.categoryProgress(subcategories, books, project.targetBooks);
  const outsideAll = d.outsideBooks || [];
  // 완독 카드: 이 테마백독 책 + 이 테마백독 기간에 완독한 백독 외 책
  const doneProject = books.filter((b) => b.status === 'done');
  const doneOutside = outsideAll.filter((b) => b.status === 'done' && (b.finishDate || '') >= project.startDate);
  const done = [...doneProject, ...doneOutside].sort((a, b) => ((a.finishDate || '') < (b.finishDate || '') ? 1 : -1));
  const dropped = books.filter((b) => b.status === 'dropped').length;
  const planned = books.filter((b) => b.status === 'planned');
  const reading = d.readingBooks || [];
  const ordinal = R.weekBookOrdinal(books, today, s.weekStartsOn);
  const outsideCount = outsideAll.filter((b) => b.status !== 'dropped').length;

  const readingCard = (book, i) => {
    const outside = R.isOutside(book);
    const est = R.finishEstimate(records, book, today);
    const p = pct(book.currentPage, book.totalPages);
    let estLine = '';
    if (est) {
      estLine = `지금 속도면 ${fmtKo(est.date)} 완독 예상`;
      const late = R.daysBetween(R.weekEnd(today, s.weekStartsOn), est.date);
      if (!outside && late > 0) estLine += ` · 주 ${s.weeklyBooks}권 기준 ${late}일 늦음`;
    }
    return `
      <div class="card roomy" style="gap:8px">
        <div class="row center">
          <div class="st-eyebrow">읽는 중${!outside && i === reading.findIndex((b) => !R.isOutside(b)) ? ` · 이번 주 ${ordinal}권째` : ''}</div>
          ${scopeBadge(book, subcategories)}
        </div>
        <div class="st-book-title">${esc(book.title)}</div>
        ${carryNote(book)}
        <div class="bar thick"><div style="width:${p}%"></div></div>
        <div class="row center">
          <span class="st-strong num">${book.currentPage} / ${book.totalPages}쪽 · ${p}%</span>
          ${est ? `<span class="st-body">하루 평균 약 ${Math.round(est.avg)}쪽</span>` : ''}
        </div>
        ${estLine ? `<div class="st-accent">${esc(estLine)}</div>` : ''}
        <div class="grid3" style="margin-top:4px">
          <a class="btn primary span2" href="#/finish/${encodeURIComponent(book.id)}">완독 처리</a>
          <button type="button" class="btn" data-manage="${esc(book.id)}">중단·교체</button>
        </div>
      </div>`;
  };

  root.innerHTML = `
    <div class="page status-page">
      <div class="row center">
        <div class="h1">현황</div>
        <a class="btn outline small" href="#/add" style="font-size:15px">+ 책 추가</a>
      </div>
      <div class="card roomy topic-card">
        <div class="row center">
          <div class="st-eyebrow">${d.ordinal}번째 테마백독</div>
          <button type="button" class="btn small outline" data-act="topic-edit">주제 편집</button>
        </div>
        <div class="topic-name">${esc(project.name)}</div>
        ${project.description ? `<div class="st-body topic-desc">${esc(project.description)}</div>` : ''}
        <div class="st-meta num">${esc(fmtDot(project.startDate))} 시작 · 목표 ${project.targetBooks}권</div>
        ${prog.done >= project.targetBooks ? `
          <div class="topic-done">
            <span>${project.targetBooks}권을 다 읽었어요. 이 백독을 마치고 다음 주제를 시작할 수 있어요.</span>
            <button type="button" class="btn primary small" data-act="finish-project">이 백독 마치기</button>
          </div>` : ''}
      </div>
      ${reading.length ? reading.map(readingCard).join('') : `
      <div class="card roomy">
        <div class="st-card-title">읽는 중인 책이 없어요</div>
        <div class="st-body">${planned.length ? '아래 읽을 목록에서 고르거나 새 책을 추가하세요.' : '새 책을 추가하세요.'}</div>
      </div>`}
      <div class="card roomy">
        <div class="row center">
          <div class="st-card-title">테마백독 달성률</div>
          <a class="btn small outline" href="#/categories" style="flex:none">카테고리 편집</a>
        </div>
        <div class="st-strong num" style="margin-top:-4px">완독 ${prog.done} / ${project.targetBooks}권</div>
        <div class="st-cats">
          ${prog.rows.map((c) => `
            <a class="st-cat" href="#/category/${encodeURIComponent(c.id)}" aria-label="${esc(c.name)} 완독 ${c.done} / 목표 ${c.goal}권 · 자세히">
              <span class="n">${esc(c.name)}</span>
              <span class="bar thick"><span style="width:${c.goal ? Math.min(100, (c.done / c.goal) * 100) : 0}%"></span></span>
              <span class="c num">${c.done}/${c.goal}</span>
              <span class="chev" aria-hidden="true">›</span>
            </a>`).join('')}
          <a class="st-cat outside-row" href="#/outside" aria-label="백독 외 독서 ${outsideCount}권 · 자세히">
            <span class="n">백독 외 독서 <span class="badge out">달성률 제외</span></span>
            <span></span>
            <span class="c num">${outsideCount}권</span>
            <span class="chev" aria-hidden="true">›</span>
          </a>
        </div>
        ${prog.matches
          ? `<div class="st-meta">${esc(R.categorySumText(prog.goalSum, project.targetBooks).text)}</div>`
          : `<div class="sum-warn">합계 ${prog.goalSum}권 · ${Math.abs(project.targetBooks - prog.goalSum)}권 ${prog.goalSum < project.targetBooks ? '부족' : '초과'} <a href="#/categories">카테고리 편집 ›</a></div>`}
      </div>
      ${planned.length ? `
      <div class="card roomy">
        <div class="row"><div class="st-card-title">읽을 목록</div><div class="st-meta">${planned.length}권</div></div>
        ${planned.map((b) => `
          <div class="planned-row">
            <button type="button" class="st-plain" data-preview="${esc(b.id)}" aria-label="${esc(b.title)} 미리보기">
              <span class="st-item-title">${esc(b.title)}</span>
              <span class="st-meta">${esc([b.author, catName(b.subcategoryId), `${b.totalPages}쪽`].filter(Boolean).join(' · '))}</span>
            </button>
            <button type="button" class="btn outline small" data-start="${esc(b.id)}" style="flex:none">읽기 시작</button>
          </div>`).join('')}
      </div>` : ''}
      <div class="card roomy">
        <div class="row center"><div class="st-card-title">완독한 책</div><div class="st-meta">백독 ${doneProject.length}권 · 백독 외 ${doneOutside.length}권 · 중단 ${dropped}권${helpBtn('drop', '중단이란?')}</div></div>
        ${done.length === 0 ? '<div class="st-body">아직 없어요.</div>' : `<div class="st-done-list">${done.map((b) => `
          <button type="button" class="st-done" data-edit="${esc(b.id)}" aria-label="${esc(b.title)} 완독 정보 고치기">
            <span class="t"><span class="st-item-title">${esc(b.title)}</span><span class="st-meta num">${b.finishDate ? esc(fmtMD(b.finishDate)) : ''}</span></span>
            <span>${scopeBadge(b, subcategories)}</span>
            <span class="st-body">${b.thought ? esc(b.thought) : '<span class="st-meta">한 줄 생각 없음</span>'}</span>
          </button>`).join('')}</div>`}
      </div>
      <button type="button" class="btn small finish-btn" data-act="finish-project">이 테마백독 마치기</button>
      <div class="page-bottom-space"></div>
    </div>`;

  root.querySelector('[data-act="topic-edit"]').addEventListener('click', () => openTopicEditor(d, ctx));
  root.querySelectorAll('[data-act="finish-project"]').forEach((b) => b.addEventListener('click', () => finishProjectFlow(d, ctx)));
  root.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => ctx.go(`finish/${encodeURIComponent(b.dataset.edit)}`)));
  root.querySelectorAll('[data-manage]').forEach((b) =>
    b.addEventListener('click', () => { const bk = reading.find((x) => x.id === b.dataset.manage); if (bk) manageBook(bk, d, ctx); }));
  root.querySelectorAll('[data-preview]').forEach((b) =>
    b.addEventListener('click', () => {
      const bk = books.find((x) => x.id === b.dataset.preview);
      if (bk) openBookPreview({ title: bk.title, author: bk.author, note: '' }, null);
    }));
  root.querySelectorAll('[data-start]').forEach((btn) =>
    btn.addEventListener('click', () => startPlanned(btn.dataset.start, null, ctx)));
  bindHelp(root, s);
}

// 가져온 책 설명(A-2): "이전 백독에서 30쪽까지 읽고 가져왔어요"
export function carryNote(book) {
  return book && book.carriedFromProjectId
    ? `<div class="carry-note">이전 백독에서 ${Number(book.carriedFromPage) || 0}쪽까지 읽고 가져왔어요</div>`
    : '';
}

// 읽을 목록의 책을 읽기 시작. 카테고리 상세·백독 외 화면에서도 쓴다.
// v1.4: 읽는 중인 책이 여러 권일 수 있으므로 기존 책을 어떻게 할지 묻지 않는다
export async function startPlanned(bookId, _unused, ctx) {
  try {
    await repo.startReading(bookId);
    toast('읽기 시작!');
    ctx.go('today');
  } catch (e) {
    toast(`바꾸지 못했어요: ${e.message || e}`);
  }
}
