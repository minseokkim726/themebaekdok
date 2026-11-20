// 5. 책 추가 화면
import * as repo from '../repo.js';
import { esc, projectLine } from '../format.js';
import { toast, askReplace, importBackup } from './shared.js';
import { recToolsHtml, bindRecTools } from './recs.js';

const HINTS = [
  '읽는 중인 책이 있으면 그 책을 어떻게 할지 묻습니다: 완독 / 중단(읽은 쪽수는 기록에 남음) / 읽을 목록으로 되돌리기.',
  '읽을 목록에 넣어 두고, 지금 책이 끝나면 다음 책으로 고를 수 있습니다.',
];

export function render(root, d, ctx) {
  // 추천에서 왔으면(#/add/<추천 id>) 제목·저자·카테고리를 채우고 "읽을 목록에만"으로 연다
  const rec = ctx.param ? d.recommendations.find((r) => r.id === ctx.param) : null;
  const recCat = rec && d.subcategories.some((c) => c.id === rec.subcategoryId) ? rec.subcategoryId : null;
  const st = { cat: recCat || (d.subcategories[0] ? d.subcategories[0].id : null), mode: rec ? 1 : 0, busy: false };

  root.innerHTML = `
    <form class="page form" novalidate>
      <div class="row">
        <a class="back" href="#/status">← 현황</a>
        <div class="sub">${esc(projectLine(d.project, d.ordinal))}</div>
      </div>
      <div>
        <div class="h1">책 추가</div>
        <div class="small">${rec ? '추천에서 가져왔어요. 전체 쪽수만 넣으면 됩니다.' : '네 칸만 채우면 됩니다. 나머지는 나중에 고칠 수 있어요.'}</div>
      </div>
      ${rec ? '' : '<a class="link-btn rec-link" href="#/recs">추천에서 고르기 ›</a>'}
      <div class="field">
        <label for="bt">제목</label>
        <input id="bt" class="input" type="text" placeholder="책 제목" autocomplete="off" value="${esc(rec ? rec.title : '')}">
      </div>
      <div class="grid3">
        <div class="field span2">
          <label for="ba">저자</label>
          <input id="ba" class="input" type="text" placeholder="저자" autocomplete="off" value="${esc(rec ? rec.author : '')}">
        </div>
        <div class="field">
          <label for="bp">전체 쪽수</label>
          <input id="bp" class="input" type="number" inputmode="numeric" min="1" step="1" placeholder="312">
        </div>
      </div>
      <div class="field">
        <div class="label-strong" id="cat-label">서브카테고리</div>
        <div class="pills" role="group" aria-labelledby="cat-label">
          ${d.subcategories.map((c) => `<button type="button" class="pill" data-cat="${esc(c.id)}">${esc(c.name)}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <div class="label-strong" id="mode-label">어떻게 추가할까요?</div>
        <div class="modes" role="group" aria-labelledby="mode-label">
          <button type="button" class="pill" data-mode="0">지금 읽기 시작</button>
          <button type="button" class="pill" data-mode="1">읽을 목록에만</button>
        </div>
        <div class="small" style="line-height:1.5" data-el="hint"></div>
      </div>
      <div class="error" data-el="err" role="alert"></div>
      ${rec ? '' : `<div class="card" style="gap:8px"><div class="label-strong">Claude에게 추천 받기</div>${recToolsHtml()}</div>`}
      ${d.books.length === 0 ? `<button type="button" class="link-btn" data-act="restore" style="align-self:center">쓰던 기록이 있나요? 백업에서 가져오기</button>` : ''}
    </form>
    <div class="actions form-actions">
      <button type="button" class="btn primary big" data-act="save">저장</button>
    </div>`;

  const q = (s) => root.querySelector(s);

  function update() {
    root.querySelectorAll('[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === st.cat)));
    root.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.mode) === st.mode)));
    q('[data-el="hint"]').textContent = HINTS[st.mode];
  }

  root.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { st.cat = b.dataset.cat; update(); }));
  root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { st.mode = Number(b.dataset.mode); update(); }));
  q('form').addEventListener('submit', (e) => { e.preventDefault(); save(); });

  async function save() {
    if (st.busy) return;
    const title = q('#bt').value.trim();
    const author = q('#ba').value.trim();
    const pages = Number(q('#bp').value);
    const err = q('[data-el="err"]');
    if (!title) { err.textContent = '제목을 적어 주세요.'; q('#bt').focus(); return; }
    if (!Number.isInteger(pages) || pages < 1 || pages > 100000) { err.textContent = '전체 쪽수를 1 이상의 숫자로 적어 주세요.'; q('#bp').focus(); return; }
    err.textContent = '';
    const startNow = st.mode === 0;
    let replace = null;
    if (startNow && d.readingBook) {
      replace = await askReplace(d.readingBook.title);
      if (!replace) return;
    }
    st.busy = true;
    try {
      await repo.addBook({ title, author, totalPages: pages, subcategoryId: st.cat, startNow, replace, recommendationId: rec ? rec.id : null });
      toast(startNow ? '읽기 시작!' : '읽을 목록에 넣었어요');
      ctx.go(startNow ? 'today' : 'status');
    } catch (e) {
      st.busy = false;
      err.textContent = `저장하지 못했어요: ${e.message || e}`;
    }
  }
  q('[data-act="save"]').addEventListener('click', save);
  const restore = q('[data-act="restore"]');
  bindRecTools(root, d, ctx);
  if (rec) setTimeout(() => q('#bp').focus(), 0);
  if (restore) restore.addEventListener('click', async () => { if (await importBackup()) ctx.go('today'); });
  update();
}
