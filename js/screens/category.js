// D-3. 카테고리 상세: 완독/목표, 읽는 중·읽을 목록, 추천 도서, 완독한 책
import * as R from '../rules.js';
import { esc, projectLine, fmtMD } from '../format.js';
import { recRowsHtml, bindRecRows, recToolsHtml, bindRecTools } from './recs.js';
import { startPlanned, carryNote } from './status.js';
import { bookHref } from './bookActions.js';

export function render(root, d, ctx) {
  const cat = d.subcategories.find((c) => c.id === ctx.param);
  if (!cat) {
    root.innerHTML = `<div class="page"><a class="back" href="#/status">← 현황</a><div class="st-body">카테고리를 찾을 수 없어요.</div></div>`;
    return;
  }
  const mine = d.books.filter((b) => b.subcategoryId === cat.id);
  const done = mine.filter((b) => b.status === 'done').sort((a, b) => ((a.finishDate || '') < (b.finishDate || '') ? 1 : -1));
  const reading = mine.filter((b) => b.status === 'reading');
  const planned = mine.filter((b) => b.status === 'planned');
  const recs = R.visibleRecommendations(d.recommendations, d.allBooks).filter((r) => r.subcategoryId === cat.id);
  const p = cat.targetBooks ? Math.min(100, (done.length / cat.targetBooks) * 100) : 0;

  root.innerHTML = `
    <div class="page status-page">
      <div class="row">
        <a class="back" href="#/status">← 현황</a>
        <div class="st-meta">${esc(projectLine(d.project, d.ordinal))}</div>
      </div>
      <div class="card roomy">
        <div class="h1" style="font-size:21px">${esc(cat.name)}</div>
        <div class="row center"><span class="st-strong num">완독 ${done.length} / ${cat.targetBooks}권</span><span class="st-meta num">${Math.round(p)}%</span></div>
        <div class="bar thick"><div style="width:${p}%"></div></div>
      </div>
      <div class="card roomy">
        <div class="st-card-title">읽는 중·읽을 목록</div>
        ${reading.length + planned.length === 0 ? '<div class="st-body">이 카테고리에 읽는 중이거나 읽을 책이 없어요.</div>' : ''}
        ${reading.map((b) => `
          <div class="planned-row">
            <a class="st-plain" href="${bookHref(b.id)}" aria-label="${esc(b.title)} 책 상세·메모">
              <span class="st-item-title">${esc(b.title)}</span>
              <span class="st-meta">${esc([b.author, `${b.currentPage}/${b.totalPages}쪽`].filter(Boolean).join(' · '))}</span>
              ${carryNote(b)}
            </a>
            <span class="rec-tag">읽는 중</span>
          </div>`).join('')}
        ${planned.map((b) => `
          <div class="planned-row">
            <a class="st-plain" href="${bookHref(b.id)}" aria-label="${esc(b.title)} 책 상세·메모">
              <span class="st-item-title">${esc(b.title)}</span>
              <span class="st-meta">${esc([b.author, `${b.totalPages}쪽`].filter(Boolean).join(' · '))}</span>
            </a>
            <button type="button" class="btn outline small" data-start="${esc(b.id)}" style="flex:none">읽기 시작</button>
          </div>`).join('')}
      </div>
      <div class="card roomy">
        <div class="row"><div class="st-card-title">추천 도서</div>${recs.length ? `<div class="st-meta">${recs.length}권</div>` : ''}</div>
        ${recs.length ? recRowsHtml(recs, d.books) : '<div class="st-body">아직 추천이 없어요</div>'}
        <div style="margin-top:6px">${recToolsHtml()}</div>
      </div>
      <div class="card roomy">
        <div class="row"><div class="st-card-title">완독한 책</div><div class="st-meta">${done.length}권</div></div>
        ${done.length === 0 ? '<div class="st-body">아직 없어요.</div>' : `<div class="st-done-list">${done.map((b) => `
          <a class="st-done" href="${bookHref(b.id)}" aria-label="${esc(b.title)} 책 상세·메모">
            <span class="t"><span class="st-item-title">${esc(b.title)}</span><span class="st-meta num">${b.finishDate ? esc(fmtMD(b.finishDate)) : ''}</span></span>
            <span class="st-body">${b.thought ? esc(b.thought) : '<span class="st-meta">한 줄 생각 없음</span>'}</span>
          </a>`).join('')}</div>`}
      </div>
      <div class="page-bottom-space"></div>
    </div>`;

  bindRecRows(root, d, ctx);
  bindRecTools(root, d, ctx, cat.id);
  root.querySelectorAll('[data-start]').forEach((b) => b.addEventListener('click', () => startPlanned(b.dataset.start, d.readingBook, ctx)));
}
