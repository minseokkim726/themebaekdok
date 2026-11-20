// D. 추천 도서: 전체 추천 목록 화면(#/recs) + 카테고리 상세·책 추가 화면이 함께 쓰는 도우미
import * as repo from '../repo.js';
import * as R from '../rules.js';
import { esc, projectLine } from '../format.js';
import { toast, openDialog, copyText } from './shared.js';
import { openBookPreview } from './preview.js';

// 추천 한 줄들(숨긴 것 제외)
export function recRowsHtml(list, books) {
  return list.map((r) => {
    const added = r.addedBookId && books.find((b) => b.id === r.addedBookId);
    return `
      <div class="rec-row">
        <button type="button" class="st-plain" data-rec-preview="${esc(r.id)}" aria-label="${esc(r.title)} 미리보기">
          <span class="st-item-title">${esc(r.title)}</span>
          ${r.author ? `<span class="st-meta">${esc(r.author)}</span>` : ''}
          ${r.note ? `<span class="st-body">${esc(r.note)}</span>` : ''}
        </button>
        <div class="rec-btns">
          ${added
            ? `<span class="rec-tag">${added.status === 'done' ? '완독함' : added.status === 'reading' ? '읽는 중' : '목록에 있음'}</span>`
            : `<button type="button" class="btn outline small" data-rec-add="${esc(r.id)}">읽을 목록에 추가</button>`}
          <button type="button" class="btn small link" data-rec-hide="${esc(r.id)}">숨기기</button>
        </div>
      </div>`;
  }).join('');
}

export function bindRecRows(root, d, ctx) {
  const find = (id) => d.recommendations.find((r) => r.id === id);
  const goAdd = (id) => ctx.go(`add/${encodeURIComponent(id)}`);
  root.querySelectorAll('[data-rec-preview]').forEach((b) => b.addEventListener('click', () => {
    const r = find(b.dataset.recPreview);
    if (!r) return;
    const added = r.addedBookId && d.books.some((x) => x.id === r.addedBookId);
    openBookPreview(r, added ? null : () => goAdd(r.id));
  }));
  root.querySelectorAll('[data-rec-add]').forEach((b) => b.addEventListener('click', () => goAdd(b.dataset.recAdd)));
  root.querySelectorAll('[data-rec-hide]').forEach((b) => b.addEventListener('click', async () => {
    await repo.hideRecommendation(b.dataset.recHide);
    toast('추천을 숨겼어요');
    ctx.refresh();
  }));
}

// [추천 요청 문구 복사] [추천 목록 붙여넣기]
export function recToolsHtml() {
  return `
    <div class="grid3" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <button type="button" class="btn small" data-act="copy-prompt">추천 요청 문구 복사</button>
      <button type="button" class="btn small outline" data-act="paste-recs">추천 목록 붙여넣기</button>
    </div>`;
}

export function bindRecTools(root, d, ctx, focusId = null) {
  const copyBtn = root.querySelector('[data-act="copy-prompt"]');
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    const text = R.recommendationPrompt({ project: d.project, subcategories: d.subcategories, books: d.allBooks, recommendations: d.recommendations, focusId });
    const ok = await copyText(text);
    toast(ok ? '추천 요청 문구를 복사했어요. Claude 대화에 붙여 넣으세요' : '복사하지 못했어요');
  });
  const pasteBtn = root.querySelector('[data-act="paste-recs"]');
  if (pasteBtn) pasteBtn.addEventListener('click', () => openPasteDialog(d, ctx));
}

// 붙여넣기 창: 붙여 넣기 → [읽어 보기] → 미리보기(저장할 책 / 건너뛸 책 / 읽지 못한 줄 따로) → [N권 저장]
export async function openPasteDialog(d, ctx) {
  const catName = (id) => (d.subcategories.find((c) => c.id === id) || {}).name || '공통';
  let plan = null;
  const html = `
    <p class="title">추천 목록 붙여넣기</p>
    <p class="msg" style="margin-bottom:8px">Claude가 준 "카테고리 | 제목 | 저자 | 추천 이유" 목록을 그대로 붙여 넣으세요.</p>
    <label for="paste-text" class="visually-hidden">추천 목록</label>
    <textarea id="paste-text" class="textarea" rows="7" placeholder="독서·문해력 | 책 제목 | 저자 | 추천 이유"></textarea>
    <div data-el="result" class="paste-result"></div>
    <div class="choices" style="margin-top:12px">
      <button type="button" class="btn primary" data-a="parse">읽어 보기</button>
      <button type="button" class="btn primary" data-a="save" hidden></button>
      <button type="button" class="btn link" data-a="cancel">취소</button>
    </div>`;
  const result = await openDialog(html, (dlg, close) => {
    const ta = dlg.querySelector('#paste-text');
    const out = dlg.querySelector('[data-el="result"]');
    const parseBtn = dlg.querySelector('[data-a="parse"]');
    const saveBtn = dlg.querySelector('[data-a="save"]');
    ta.addEventListener('input', () => { plan = null; out.innerHTML = ''; saveBtn.hidden = true; parseBtn.hidden = false; });
    parseBtn.addEventListener('click', () => {
      const parsed = R.parseRecommendationText(ta.value, d.subcategories);
      const p = R.planRecommendationImport(parsed.items, d.recommendations, d.allBooks);
      plan = p;
      out.innerHTML = `
        ${p.toAdd.length ? `<div class="paste-h">저장할 책 ${p.toAdd.length}권</div>
          <ul class="paste-list">${p.toAdd.map((it) => `<li><span class="st-meta">${esc(it.matched ? catName(it.subcategoryId) : '공통')}${it.matched ? '' : ` <span class="rec-flag">카테고리 "${esc(it.categoryName)}" 없음 → 공통</span>`}</span><br><b>${esc(it.title)}</b>${it.author ? ` · ${esc(it.author)}` : ''}</li>`).join('')}</ul>`
          : '<div class="paste-h">저장할 책이 없어요</div>'}
        ${p.skipped.length ? `<div class="paste-h sub">건너뛸 책 ${p.skipped.length}권</div>
          <ul class="paste-list">${p.skipped.map((it) => `<li>${esc(it.title)} <span class="st-meta">(${esc(it.reason)})</span></li>`).join('')}</ul>` : ''}
        ${parsed.errors.length ? `<div class="paste-h warn">${parsed.errors.length}줄을 읽지 못했어요</div>
          <ul class="paste-list">${parsed.errors.map((e) => `<li><span class="st-meta">${e.line}번째 줄 · ${esc(e.reason)}</span><br>${esc(e.text)}</li>`).join('')}</ul>` : ''}`;
      saveBtn.hidden = p.toAdd.length === 0;
      saveBtn.textContent = `${p.toAdd.length}권 저장`;
      parseBtn.hidden = p.toAdd.length > 0;
    });
    saveBtn.addEventListener('click', () => close('save'));
    dlg.querySelector('[data-a="cancel"]').addEventListener('click', () => close(null));
  });
  if (result !== 'save' || !plan) return;
  const n = await repo.addRecommendations(plan.toAdd);
  toast(`추천 ${n}권을 넣었어요`);
  ctx.refresh();
}

// 전체 추천 목록 화면: 카테고리별 묶음(+ 공통)
export function render(root, d, ctx) {
  const visible = R.visibleRecommendations(d.recommendations, d.allBooks);
  const groups = [
    ...d.subcategories.map((c) => ({ id: c.id, name: c.name, list: visible.filter((r) => r.subcategoryId === c.id) })),
    { id: null, name: '공통', list: visible.filter((r) => !r.subcategoryId || !d.subcategories.some((c) => c.id === r.subcategoryId)) },
  ].filter((g) => g.list.length);

  root.innerHTML = `
    <div class="page status-page">
      <div class="row">
        <a class="back" href="#/add">← 책 추가</a>
        <div class="st-meta">${esc(projectLine(d.project, d.ordinal))}</div>
      </div>
      <div><div class="h1">추천에서 고르기</div><div class="st-meta">누르면 서점 링크와 함께 미리 볼 수 있어요.</div></div>
      <div class="card roomy">${recToolsHtml()}</div>
      ${groups.length === 0 ? '<div class="card roomy"><div class="st-body">아직 추천이 없어요. 위 버튼으로 Claude에게 추천을 받아 붙여 넣으세요.</div></div>' : ''}
      ${groups.map((g) => `
        <div class="card roomy">
          <div class="row"><div class="st-card-title">${esc(g.name)}</div><div class="st-meta">${g.list.length}권</div></div>
          ${recRowsHtml(g.list, d.books)}
        </div>`).join('')}
      <div class="page-bottom-space"></div>
    </div>`;
  bindRecTools(root, d, ctx);
  bindRecRows(root, d, ctx);
}
