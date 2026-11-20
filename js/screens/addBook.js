// 5. 책 추가 화면 (v1.4: 소속 선택 · 이미 읽은 쪽수 · 시작일)
import * as repo from '../repo.js';
import { esc, projectLine } from '../format.js';
import { toast, importBackup } from './shared.js';
import { recToolsHtml, bindRecTools } from './recs.js';

const HINTS = [
  '읽는 중인 다른 책은 그대로 두고 함께 읽어요.',
  '읽을 목록에 넣어 두고, 나중에 "읽기 시작"을 누르면 됩니다.',
];

export function render(root, d, ctx) {
  // #/add/<추천 id>: 추천에서 왔으면 제목·저자·카테고리를 채우고 "읽을 목록에만"으로 연다
  // #/add/outside: 백독 외 화면에서 왔으면 "백독 외 독서"로 연다
  const rec = ctx.param && ctx.param !== 'outside' ? d.recommendations.find((r) => r.id === ctx.param) : null;
  const recCat = rec && d.subcategories.some((c) => c.id === rec.subcategoryId) ? rec.subcategoryId : null;
  const canProject = !!d.project && d.subcategories.length > 0;
  const st = {
    scope: !canProject || ctx.param === 'outside' ? 'outside' : 'project',
    cat: recCat || (d.subcategories[0] ? d.subcategories[0].id : null), mode: rec ? 1 : 0, busy: false,
  };

  root.innerHTML = `
    <form class="page form" novalidate>
      <div class="row">
        <a class="back" href="#/status">← 현황</a>
        <div class="sub">${d.project ? esc(projectLine(d.project, d.ordinal)) : '진행 중인 테마백독 없음'}</div>
      </div>
      <div>
        <div class="h1">책 추가</div>
        <div class="small">${rec ? '추천에서 가져왔어요. 전체 쪽수만 넣으면 됩니다.' : '제목과 전체 쪽수만 있으면 됩니다. 나머지는 나중에 고칠 수 있어요.'}</div>
      </div>
      <div class="field">
        <div class="label-strong" id="scope-label">어디에 넣을까요?</div>
        <div class="modes" role="group" aria-labelledby="scope-label">
          <button type="button" class="pill" data-scope="project" ${canProject ? '' : 'disabled'}>이번 테마백독에 포함</button>
          <button type="button" class="pill" data-scope="outside">백독 외 독서</button>
        </div>
        ${canProject ? '' : '<div class="small">진행 중인 테마백독이 없어서 "백독 외 독서"로만 넣을 수 있어요.</div>'}
      </div>
      ${rec ? '' : '<a class="link-btn rec-link" href="#/recs" data-el="rec-link">추천에서 고르기 ›</a>'}
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
      <div class="field" data-el="cat-field">
        <div class="label-strong" id="cat-label">카테고리</div>
        <div class="pills" role="group" aria-labelledby="cat-label">
          ${d.subcategories.map((c) => `<button type="button" class="pill" data-cat="${esc(c.id)}">${esc(c.name)}</button>`).join('')}
        </div>
        <div class="small">맞는 카테고리가 없으면 '백독 외 독서'로 두세요.</div>
      </div>
      <div class="field">
        <div class="label-strong" id="mode-label">어떻게 추가할까요?</div>
        <div class="modes" role="group" aria-labelledby="mode-label">
          <button type="button" class="pill" data-mode="0">지금 읽기 시작</button>
          <button type="button" class="pill" data-mode="1">읽을 목록에만</button>
        </div>
        <div class="small" style="line-height:1.5" data-el="hint"></div>
      </div>
      <div class="grid3" data-el="start-fields">
        <div class="field">
          <label for="bb">이미 읽은 쪽수</label>
          <input id="bb" class="input" type="number" inputmode="numeric" min="0" step="1" placeholder="0">
        </div>
        <div class="field span2">
          <label for="bs">시작일</label>
          <input id="bs" class="input" type="date" value="${esc(d.today)}">
        </div>
      </div>
      <div class="small" data-el="before-hint">이미 읽은 쪽수는 진행률의 출발점일 뿐, 오늘·주간 쪽수에는 더하지 않아요.</div>
      <div class="error" data-el="err" role="alert"></div>
      ${rec ? '' : `<div class="card" style="gap:8px" data-el="rec-tools"><div class="label-strong">Claude에게 추천 받기</div>${recToolsHtml()}</div>`}
      ${d.allBooks.length === 0 ? `<button type="button" class="link-btn" data-act="restore" style="align-self:center">쓰던 기록이 있나요? 백업에서 가져오기</button>` : ''}
    </form>
    <div class="actions form-actions">
      <button type="button" class="btn primary big" data-act="save">저장</button>
    </div>`;

  const q = (s) => root.querySelector(s);
  const show = (sel, on) => { const e = q(sel); if (e) e.hidden = !on; };

  function update() {
    root.querySelectorAll('[data-scope]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scope === st.scope)));
    root.querySelectorAll('[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === st.cat)));
    root.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.mode) === st.mode)));
    q('[data-el="hint"]').textContent = HINTS[st.mode];
    const proj = st.scope === 'project';
    show('[data-el="cat-field"]', proj);   // 백독 외를 고르면 카테고리 영역을 숨긴다
    show('[data-el="rec-link"]', proj);
    show('[data-el="rec-tools"]', proj);
  }

  root.querySelectorAll('[data-scope]').forEach((b) => b.addEventListener('click', () => { st.scope = b.dataset.scope; update(); }));
  root.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { st.cat = b.dataset.cat; update(); }));
  root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { st.mode = Number(b.dataset.mode); update(); }));
  q('form').addEventListener('submit', (e) => { e.preventDefault(); save(); });

  async function save() {
    if (st.busy) return;
    const title = q('#bt').value.trim();
    const author = q('#ba').value.trim();
    const pages = Number(q('#bp').value);
    const beforeRaw = q('#bb').value.trim();
    const before = beforeRaw === '' ? 0 : Number(beforeRaw);
    const err = q('[data-el="err"]');
    if (!title) { err.textContent = '제목을 적어 주세요.'; q('#bt').focus(); return; }
    if (!Number.isInteger(pages) || pages < 1 || pages > 100000) { err.textContent = '전체 쪽수를 1 이상의 숫자로 적어 주세요.'; q('#bp').focus(); return; }
    if (st.scope === 'project' && !st.cat) { err.textContent = '카테고리를 골라 주세요. 맞는 것이 없으면 "백독 외 독서"로 두세요.'; return; }
    if (!Number.isInteger(before) || before < 0 || before > pages) { err.textContent = '이미 읽은 쪽수는 0부터 전체 쪽수까지의 숫자로 적어 주세요.'; q('#bb').focus(); return; }
    err.textContent = '';
    const startNow = st.mode === 0;
    st.busy = true;
    try {
      await repo.addBook({
        title, author, totalPages: pages, subcategoryId: st.cat, startNow,
        scope: st.scope, readBefore: before, startDate: q('#bs').value || d.today,
        recommendationId: rec ? rec.id : null,
      });
      toast(startNow ? '읽기 시작!' : '읽을 목록에 넣었어요');
      ctx.go(startNow ? 'today' : (st.scope === 'outside' ? 'outside' : 'status'));
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
