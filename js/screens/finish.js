// 3. 완독 처리 화면 (완독한 책 정보 고치기에도 쓴다)
import * as repo from '../repo.js';
import { esc, projectLine, fmtKo } from '../format.js';
import { toast } from './shared.js';

export function render(root, d, ctx) {
  const book = d.books.find((b) => b.id === ctx.param);
  if (!book || (book.status !== 'reading' && book.status !== 'done')) {
    root.innerHTML = `
      <div class="page form">
        <a class="back" href="#/status">← 현황</a>
        <div class="h2">완독 처리할 책을 찾을 수 없어요.</div>
      </div>`;
    return;
  }
  const editing = book.status === 'done';
  const st = { cat: book.subcategoryId || (d.subcategories[0] || {}).id, busy: false };
  const date0 = book.finishDate || d.today;

  root.innerHTML = `
    <form class="page form" novalidate>
      <div class="row">
        <a class="back" href="#/status">← 현황</a>
        <div class="sub">${esc(projectLine(d.project, d.ordinal))}</div>
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
        <div class="label-strong" id="cat-label">서브카테고리</div>
        <div class="pills" role="group" aria-labelledby="cat-label">
          ${d.subcategories.map((c) => `<button type="button" class="pill" data-cat="${esc(c.id)}">${esc(c.name)}</button>`).join('')}
        </div>
      </div>
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
      ctx.go('status');
    } catch (e) {
      st.busy = false;
      toast(`저장하지 못했어요: ${e.message || e}`);
    }
  }
  q('form').addEventListener('submit', (e) => { e.preventDefault(); save(); });
  q('[data-act="save"]').addEventListener('click', save);
  update();
}
