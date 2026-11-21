// v1.5 C. 책 상세(#/book/<id>, 히스토리에서 들어오면 #/book/<id>/h)
// 책 정보 + 메모 목록(쪽수순, 쪽 없는 메모는 맨 뒤) + [+ 메모] [하이라이트 붙여넣기] [AI 정리용 내보내기]
import * as R from '../rules.js';
import { esc, pct, fmtDot } from '../format.js';
import { scopeBadge } from './bookActions.js';
import { editNotes } from './history.js';
import { openMemoSheet, openMemoEdit, openPasteSheet, openMemoExport, memoMetaLine } from './memo.js';

const STATUS_LABEL = { reading: '읽는 중', done: '완독', dropped: '중단', planned: '읽을 목록' };
const isWebLink = (u) => /^https?:\/\/\S+$/i.test(String(u || '').trim());

// 들어온 화면으로 돌아가는 주소(책 상세·완독 고치기 화면은 건너뛴다)
function backHref(ctx) {
  const prev = ctx.prev || '';
  if (prev && !/^#\/(book|finish)\//.test(prev)) return prev;
  return ctx.sub === 'h' ? '#/history' : '#/status';
}

export function render(root, d, ctx) {
  const book = (d.allBooks || []).find((b) => b.id === ctx.param);
  const back = backHref(ctx);
  if (!book) {
    root.innerHTML = `<div class="page status-page"><a class="back" href="${esc(back)}">← 뒤로</a><div class="st-body">책을 찾을 수 없어요.</div></div>`;
    return;
  }
  const memos = R.sortMemos((d.memos || []).filter((m) => m.bookId === book.id));
  const cur = book.status === 'done' ? book.totalPages : (Number(book.currentPage) || Number(book.readBefore) || 0);
  const p = pct(cur, book.totalPages);
  const editable = (d.books || []).some((b) => b.id === book.id) || (d.outsideBooks || []).some((b) => b.id === book.id);
  const period = book.startDate
    ? `${fmtDot(book.startDate)} ~ ${book.status === 'done' && book.finishDate ? fmtDot(book.finishDate) : book.status === 'dropped' ? '중단' : '읽는 중'}`
    : '';
  const badge = scopeBadge(book, d.allSubcategories);

  root.innerHTML = `
    <div class="page status-page book-page">
      <div class="row center"><a class="back" href="${esc(back)}">← 뒤로</a></div>
      <div class="card roomy">
        <div class="row center">
          <div class="st-eyebrow">${STATUS_LABEL[book.status] || ''}</div>
          ${badge}
        </div>
        <div class="st-book-title">${esc(book.title)}</div>
        ${book.author ? `<div class="st-body book-author">${esc(book.author)}</div>` : ''}
        <div class="bar thick"><div style="width:${p}%"></div></div>
        <div class="st-strong num">${cur} / ${book.totalPages}쪽 · ${p}%</div>
        ${period ? `<div class="st-meta num">읽은 기간 ${esc(period)}</div>` : ''}
        ${book.status === 'done' ? `
        <div class="book-notes">
          <div class="st-body">${book.thought ? esc(book.thought) : '<span class="st-meta">한 줄 생각 없음</span>'}</div>
          <div class="hist-book-btns">
            ${isWebLink(book.reviewUrl) ? `<a class="btn small" href="${esc(book.reviewUrl)}" target="_blank" rel="noopener noreferrer">독서평 보기</a>` : (book.reviewUrl ? `<span class="st-meta">${esc(book.reviewUrl)}</span>` : '')}
            <button type="button" class="btn small outline" data-act="notes">고치기</button>
          </div>
        </div>` : ''}
      </div>
      <div class="card roomy">
        <div class="row center">
          <div class="st-card-title">메모 <span class="num">${memos.length}</span>개</div>
          <button type="button" class="btn primary small" data-act="memo">+ 메모</button>
        </div>
        <div class="memo-tools">
          <button type="button" class="btn small" data-act="paste">하이라이트 붙여넣기</button>
          <button type="button" class="btn small outline" data-act="export" ${memos.length ? '' : 'disabled aria-describedby="export-why"'}>AI 정리용 내보내기</button>
        </div>
        ${memos.length ? '' : '<div class="st-meta" id="export-why">메모가 있어야 내보낼 수 있어요</div>'}
        ${memos.length ? `<div class="memo-list">${memos.map((m) => `
          <button type="button" class="memo-row" data-memo="${esc(m.id)}">
            <span class="st-meta num">${esc(memoMetaLine(m, d.today))}</span>
            <span class="st-body">${esc(m.text)}</span>
          </button>`).join('')}</div>`
          : '<div class="st-body memo-empty">아직 메모가 없어요. 읽다가 걸리는 곳을 한마디로 남겨 보세요.</div>'}
      </div>
      <div class="page-bottom-space"></div>
    </div>`;

  const on = (act, fn) => { const b = root.querySelector(`[data-act="${act}"]`); if (b) b.addEventListener('click', fn); };
  on('memo', async () => {
    if (await openMemoSheet({ book, page: R.defaultMemoPage(d.records, book) })) ctx.refresh();
  });
  on('paste', async () => { if (await openPasteSheet({ book, memos })) ctx.refresh(); });
  on('export', () => openMemoExport(d, book, memos));
  on('notes', async () => {
    // 이번 테마백독·백독 외 책은 완독 정보 고치기 화면(완독일·카테고리·소속 포함), 지난 백독의 책은 한 줄 생각·링크만
    if (editable) ctx.go(`finish/${encodeURIComponent(book.id)}/b`);
    else await editNotes(book, ctx);
  });
  root.querySelectorAll('[data-memo]').forEach((b) => b.addEventListener('click', async () => {
    const m = memos.find((x) => x.id === b.dataset.memo);
    if (m && await openMemoEdit({ book, memo: m })) ctx.refresh();
  }));
}
