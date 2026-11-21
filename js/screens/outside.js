// v1.4 A4. 백독 외 독서 화면(#/outside): 읽는 중 / 읽을 목록 / 완독(최근순). 현황 탭 소속.
import * as R from '../rules.js';
import { esc, pct, fmtMD } from '../format.js';
import { startPlanned, carryNote } from './status.js';
import { manageBook, bookHref } from './bookActions.js';

export function render(root, d, ctx) {
  const all = d.outsideBooks || [];
  const reading = all.filter((b) => b.status === 'reading');
  const planned = all.filter((b) => b.status === 'planned');
  const done = all.filter((b) => b.status === 'done').sort((a, b) => ((a.finishDate || '') < (b.finishDate || '') ? 1 : -1));
  const dropped = all.filter((b) => b.status === 'dropped').length;

  root.innerHTML = `
    <div class="page status-page">
      <div class="row center">
        <a class="back" href="#/status">← 현황</a>
        <a class="btn outline small" href="#/add/outside" style="font-size:15px">+ 백독 외 책 추가</a>
      </div>
      <div>
        <div class="h1">백독 외 독서</div>
        <div class="st-meta">테마백독 달성률에는 들어가지 않지만, 읽은 쪽수·읽은 날·연속일수에는 들어가요.</div>
      </div>
      <div class="card roomy">
        <div class="row"><div class="st-card-title">읽는 중</div><div class="st-meta">${reading.length}권</div></div>
        ${reading.length ? reading.map((b) => {
          const p = pct(b.currentPage, b.totalPages);
          return `
          <div class="outside-book">
            <a class="st-item-title book-link" href="${bookHref(b.id)}">${esc(b.title)}</a>
            ${carryNote(b)}
            <div class="bar thick"><div style="width:${p}%"></div></div>
            <div class="st-meta num">${b.currentPage} / ${b.totalPages}쪽 · ${p}%</div>
            <div class="grid3">
              <a class="btn primary small span2" href="#/finish/${encodeURIComponent(b.id)}">완독 처리</a>
              <button type="button" class="btn small" data-manage="${esc(b.id)}">중단·교체</button>
            </div>
          </div>`;
        }).join('') : '<div class="st-body">읽는 중인 백독 외 책이 없어요.</div>'}
      </div>
      <div class="card roomy">
        <div class="row"><div class="st-card-title">읽을 목록</div><div class="st-meta">${planned.length}권</div></div>
        ${planned.length ? planned.map((b) => `
          <div class="planned-row">
            <a class="st-plain" href="${bookHref(b.id)}" aria-label="${esc(b.title)} 책 상세·메모">
              <span class="st-item-title">${esc(b.title)}</span>
              <span class="st-meta">${esc([b.author, `${b.totalPages}쪽`].filter(Boolean).join(' · '))}</span>
            </a>
            <button type="button" class="btn outline small" data-start="${esc(b.id)}" style="flex:none">읽기 시작</button>
          </div>`).join('') : '<div class="st-body">비어 있어요.</div>'}
      </div>
      <div class="card roomy">
        <div class="row"><div class="st-card-title">완독</div><div class="st-meta">${done.length}권 · 중단 ${dropped}권</div></div>
        ${done.length ? `<div class="st-done-list">${done.map((b) => `
          <a class="st-done" href="${bookHref(b.id)}" aria-label="${esc(b.title)} 책 상세·메모">
            <span class="t"><span class="st-item-title">${esc(b.title)}</span><span class="st-meta num">${b.finishDate ? esc(fmtMD(b.finishDate)) : ''}</span></span>
            <span class="st-body">${b.thought ? esc(b.thought) : '<span class="st-meta">한 줄 생각 없음</span>'}</span>
          </a>`).join('')}</div>` : '<div class="st-body">아직 없어요.</div>'}
      </div>
      <div class="page-bottom-space"></div>
    </div>`;

  root.querySelectorAll('[data-manage]').forEach((b) => b.addEventListener('click', () => {
    const bk = reading.find((x) => x.id === b.dataset.manage);
    if (bk) manageBook(bk, d, ctx);
  }));
  root.querySelectorAll('[data-start]').forEach((b) => b.addEventListener('click', () => startPlanned(b.dataset.start, null, ctx)));
  void R;
}
