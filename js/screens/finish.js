// 3. 완독 처리 화면 (완독한 책 정보 고치기에도 쓴다)
import * as repo from '../repo.js';
import { esc, projectLine, fmtKo } from '../format.js';
import * as R from '../rules.js';
import { toast } from './shared.js';
import { changeScopeFlow } from './bookActions.js';

// 소속을 바꾸면 화면을 다시 그리므로, 적던 내용을 잠깐 보관한다
let draft = null;

export function render(root, d, ctx) {
  // 이 테마백독의 책 또는 백독 외 책(마친 테마백독의 책은 히스토리에서 한 줄 생각·링크만 고친다)
  const book = d.books.find((b) => b.id === ctx.param) || (d.outsideBooks || []).find((b) => b.id === ctx.param);
  if (!book || (book.status !== 'reading' && book.status !== 'done')) {
    root.innerHTML = `
      <div class="page form">
        <a class="back" href="#/status">← 현황</a>
        <div class="h2">완독 처리할 책을 찾을 수 없어요.</div>
      </div>`;
    return;
  }
  const editing = book.status === 'done';
  const outside = R.isOutside(book);
  const st = { cat: book.subcategoryId || (d.subcategories[0] || {}).id, busy: false };
  const date0 = book.finishDate || d.today;

  root.innerHTML = `
    <form class="page form" novalidate>
      <div class="row">
        <a class="back" href="#/status">← 현황</a>
        <div class="sub">${d.project ? esc(projectLine(d.project, d.ordinal)) : ''}</div>
      </div>
      <div>
        <div class="small">${editing ? '완독 기록 고치기' : '완독 처리'}</div>
        <div class="h1">${esc(book.title)}</div>
        <div class="small">${book.totalPages}쪽${book.startDate ? ` · 시작 ${esc(fmtKo(book.startDate))}` : ''}</div>
      </div>
      <div class="field">
        <label for="fd">완독일</label>
        <input id="fd" class="input" type="date" value="${esc(date0)}" max="${esc(d.today)}">
      </div>
      <div class="field">
        <div class="row center">
          <div class="label-strong">소속 · ${outside ? '백독 외 독서' : '이번 테마백독'}</div>
          <button type="button" class="btn small outline" data-act="scope" ${outside && !d.project ? 'disabled' : ''}>${outside ? '테마백독에 포함하기' : '백독 외로 바꾸기'}</button>
        </div>
        ${outside ? '<div class="small">테마백독 달성률에는 들어가지 않아요.</div>' : ''}
      </div>
      ${outside ? '' : `<div class="field">
        <div class="label-strong" id="cat-label">카테고리</div>
        <div class="pills" role="group" aria-labelledby="cat-label">
          ${d.subcategories.map((c) => `<button type="button" class="pill" data-cat="${esc(c.id)}">${esc(c.name)}</button>`).join('')}
        </div>
      </div>`}
      <div class="field">
        <label for="thought">한 줄 생각 · 이 책에서 내 생각은 무엇인가</label>
        <textarea id="thought" class="textarea" rows="3" placeholder="직접 한 줄로 적어요">${esc(book.thought || '')}</textarea>
      </div>
      <div class="field">
        <label for="link">독서평 링크 <span style="font-weight:400;color:var(--muted)">(선택 · 카페 글 등)</span></label>
        <input id="link" class="input" type="url" inputmode="url" placeholder="https://" value="${esc(book.reviewUrl || '')}" autocomplete="off">
      </div>
      <div class="small" style="line-height:1.5">인터뷰·독서평 초안은 앱 밖 Claude 대화에서 만들고, 완성되면 링크만 여기에 붙입니다. 지금 못 채워도 완독 처리는 됩니다.</div>
    </form>
    <div class="actions form-actions">
      <button type="button" class="btn primary big" data-act="save">${editing ? '저장' : '완독으로 저장'}</button>
    </div>`;

  const q = (s) => root.querySelector(s);
  if (draft && draft.id === book.id) {
    q('#thought').value = draft.thought; q('#link').value = draft.link; if (draft.date) q('#fd').value = draft.date;
    draft = null;
  }
  const update = () => root.querySelectorAll('[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === st.cat)));
  root.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { st.cat = b.dataset.cat; update(); }));

  async function save() {
    if (st.busy) return;
    st.busy = true;
    try {
      await repo.finishBook(book.id, {
        finishDate: q('#fd').value || d.today,
        subcategoryId: st.cat,
        thought: q('#thought').value,
        reviewUrl: q('#link').value,
      });
      toast(editing ? '고쳤어요' : `완독! ${book.title}`);
      ctx.go(R.isOutside(book) ? 'outside' : 'status');
    } catch (e) {
      st.busy = false;
      toast(`저장하지 못했어요: ${e.message || e}`);
    }
  }
  q('form').addEventListener('submit', (e) => { e.preventDefault(); save(); });
  // 소속 바꾸기(적어 둔 한 줄 생각·링크는 바꾼 뒤에도 남게 저장해 둔다)
  q('[data-act="scope"]').addEventListener('click', async () => {
    const keep = { thought: q('#thought').value, link: q('#link').value, date: q('#fd').value };
    const res = await changeScopeFlow(book, d, ctx, { refresh: false });
    if (!res) return;
    draft = { id: book.id, ...keep };
    ctx.refresh();
  });
  q('[data-act="save"]').addEventListener('click', save);
  update();
}
