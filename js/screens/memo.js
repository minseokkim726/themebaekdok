// v1.5 책별 메모: 입력 시트(D), 고치기·삭제, 하이라이트 붙여넣기(E), AI 정리용 내보내기(F)
// 앱 안에 음성 인식·녹음·AI 기능은 없다. 말하기는 휴대폰 키보드의 받아쓰기(마이크)를 그대로 쓴다.
import * as repo from '../repo.js';
import * as R from '../rules.js';
import { esc, fmtMDShort, localDateOf } from '../format.js';
import { toast, ask, openDialog, copyText } from './shared.js';

const TYPE_CHIPS = R.MEMO_TYPES.map((t) => [t, R.MEMO_TYPE_LABEL[t]]);

// 아래에서 올라오는 창. 바깥(어두운 곳)을 누르면 닫히고, 키보드가 올라오면 창을 키보드 위로 올린다.
function openSheet(html, bind, { focus = null } = {}) {
  const dlg = document.getElementById('dialog');
  dlg.classList.add('sheet');
  let undoKb = () => {};
  let onBackdrop = null;
  const p = openDialog(html, (d, close) => {
    onBackdrop = (e) => {
      if (e.target !== d) return;
      const r = d.getBoundingClientRect(); // 창 안의 빈 곳을 누른 것은 닫지 않는다
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
      close(null);
    };
    d.addEventListener('click', onBackdrop);
    bind(d, close);
  });
  // openDialog는 여기까지 동기로 showModal()을 마친다 → 누른 그 순간 안에서 커서를 넣어야 키보드가 바로 뜬다
  if (focus) {
    const el = dlg.querySelector(focus);
    if (el) { try { el.focus({ preventScroll: true }); } catch { el.focus(); } }
  }
  undoKb = keepAboveKeyboard(dlg);
  return p.then((v) => {
    undoKb();
    if (onBackdrop) dlg.removeEventListener('click', onBackdrop);
    dlg.classList.remove('sheet');
    return v;
  });
}

// 휴대폰 키보드가 화면 아래를 덮으면 그만큼 창을 올리고, 높이를 보이는 영역에 맞춘다
function keepAboveKeyboard(dlg) {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  const fit = () => {
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    dlg.style.marginBottom = kb > 40 ? `${kb}px` : '';
    dlg.style.maxHeight = kb > 40 ? `${Math.max(200, Math.round(vv.height) - 8)}px` : '';
  };
  vv.addEventListener('resize', fit);
  vv.addEventListener('scroll', fit);
  fit();
  return () => {
    vv.removeEventListener('resize', fit);
    vv.removeEventListener('scroll', fit);
    dlg.style.marginBottom = '';
    dlg.style.maxHeight = '';
  };
}

const shortTitle = (t) => (t.length > 14 ? `${t.slice(0, 13)}…` : t);

function memoFormHtml({ heading, book, memo, page }) {
  const type = memo ? memo.type : 'thought';
  return `
    <div class="memo-head">
      <p class="title">${esc(heading)} <span class="memo-book">· ${esc(shortTitle(book.title))}</span></p>
      <button type="button" class="btn primary small memo-save" data-a="save">저장</button>
    </div>
    <textarea id="memo-text" class="textarea memo-text" rows="4" autofocus aria-label="메모 내용" placeholder="키보드의 마이크로 말해도 됩니다">${esc(memo ? memo.text : '')}</textarea>
    <div class="memo-opts">
      <label class="memo-page" for="memo-page"><span>p.</span>
        <input id="memo-page" class="num-input" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" enterkeyhint="done" value="${page == null ? '' : esc(page)}" aria-label="쪽수(비워도 됨)">
      </label>
      <div class="memo-types" role="group" aria-label="메모 종류">
        ${TYPE_CHIPS.map(([t, label]) => `<button type="button" class="pill" data-type="${t}" aria-pressed="${t === type}">${label}</button>`).join('')}
      </div>
    </div>
    <div class="memo-foot">
      <span class="small">키보드의 마이크로 말해도 됩니다</span>
      ${memo ? '<button type="button" class="btn small memo-del" data-a="delete">삭제</button>' : ''}
      <button type="button" class="btn link" data-a="close">닫기</button>
    </div>`;
}

function readForm(dlg, st) {
  // v1.5.1: 쪽수 칸을 건드리지 않았으면 본문 맨 앞에 말한 쪽수("37쪽, …")를 쪽수로 쓴다
  const { text, page } = R.resolveMemoInput({
    text: dlg.querySelector('#memo-text').value,
    pageField: dlg.querySelector('#memo-page').value,
    pageTouched: st.pageTouched,
  });
  return { text, page, type: st.type };
}

function bindForm(dlg, close, st, onSave) {
  dlg.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => {
    st.type = b.dataset.type;
    dlg.querySelectorAll('[data-type]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.type === st.type)));
  }));
  const pageInput = dlg.querySelector('#memo-page');
  pageInput.addEventListener('input', () => {
    st.pageTouched = true; // 칸을 직접 고침 → 칸 값 우선
    const digits = pageInput.value.replace(/\D/g, '');
    if (digits !== pageInput.value) pageInput.value = digits;
  });
  const saveBtn = dlg.querySelector('[data-a="save"]');
  saveBtn.addEventListener('click', async () => {
    if (st.busy) return;
    const f = readForm(dlg, st);
    if (!f.text.trim()) { toast('내용을 적어 주세요'); dlg.querySelector('#memo-text').focus(); return; }
    st.busy = true;
    saveBtn.disabled = true;
    try {
      const res = await onSave(f);
      close({ saved: res });
    } catch (e) {
      st.busy = false;
      saveBtn.disabled = false;
      toast(`저장하지 못했어요: ${e.message || e}`);
    }
  });
  dlg.querySelector('[data-a="close"]').addEventListener('click', () => close(null));
  const del = dlg.querySelector('[data-a="delete"]');
  if (del) del.addEventListener('click', () => close({ delete: true }));
}

// D. 새 메모. 누른 그 순간에 불러야 한다(키보드가 바로 뜨게). 저장하면 메모를, 아니면 null을 돌려준다.
export async function openMemoSheet({ book, page = null }) {
  const st = { type: 'thought', busy: false };
  const res = await openSheet(memoFormHtml({ heading: '메모', book, memo: null, page }), (dlg, close) =>
    bindForm(dlg, close, st, (f) => repo.addMemo({ bookId: book.id, ...f, source: 'typed' })), { focus: '#memo-text' });
  if (res && res.saved) { toast('메모 저장됨'); return res.saved; }
  return null;
}

// 메모 고치기(본문·쪽수·종류) / 삭제(확인 한 번). 바뀌었으면 true
export async function openMemoEdit({ book, memo }) {
  const st = { type: memo.type, busy: false };
  const res = await openSheet(memoFormHtml({ heading: '메모 고치기', book, memo, page: memo.page }), (dlg, close) =>
    bindForm(dlg, close, st, (f) => repo.updateMemo(memo.id, f)));
  if (res && res.saved) { toast('고쳤어요'); return true; }
  if (res && res.delete) {
    const yes = await ask({
      title: '이 메모를 지울까요?',
      message: memo.text.length > 60 ? `${memo.text.slice(0, 59)}…` : memo.text,
      choices: [{ label: '삭제', value: true, kind: 'primary' }, { label: '취소', value: false }],
    });
    if (!yes) return false;
    await repo.deleteMemo(memo.id);
    toast('지웠어요');
    return true;
  }
  return false;
}

// E. 하이라이트 붙여넣기 → 미리보기 → 저장. 저장했으면 { added, skipped }
export async function openPasteSheet({ book, memos }) {
  let plan = null;
  const res = await openSheet(`
    <div data-step="input">
      <p class="title">하이라이트 붙여넣기 <span class="memo-book">· ${esc(shortTitle(book.title))}</span></p>
      <p class="msg">전자책 앱에서 복사한 문장을 붙여 넣으세요. 빈 줄이 있으면 빈 줄마다, 없으면 줄마다 인용 하나로 나눕니다. 줄 끝의 "(p.37)", "p.37", "37쪽"은 쪽수로 읽어요.</p>
      <textarea id="hl-text" class="textarea" rows="8" aria-label="붙여 넣을 문장"></textarea>
      <div class="choices" style="margin-top:12px">
        <button type="button" class="btn primary" data-a="preview">나누어 보기</button>
        <button type="button" class="btn link" data-a="close">닫기</button>
      </div>
    </div>
    <div data-step="preview" hidden>
      <p class="title" data-el="hl-title"></p>
      <p class="msg" data-el="hl-skip"></p>
      <div class="paste-result"><ul class="paste-list" data-el="hl-list"></ul></div>
      <div class="choices" style="margin-top:12px">
        <button type="button" class="btn primary" data-a="save">저장</button>
        <button type="button" class="btn" data-a="back">다시 고치기</button>
      </div>
    </div>`, (dlg, close) => {
    const step = (name) => dlg.querySelectorAll('[data-step]').forEach((s) => { s.hidden = s.dataset.step !== name; });
    dlg.querySelector('[data-a="close"]').addEventListener('click', () => close(null));
    dlg.querySelector('[data-a="back"]').addEventListener('click', () => step('input'));
    dlg.querySelector('[data-a="preview"]').addEventListener('click', () => {
      const items = R.parseHighlights(dlg.querySelector('#hl-text').value);
      if (!items.length) { toast('붙여 넣은 문장이 없어요'); return; }
      plan = R.planHighlightImport(items, memos);
      dlg.querySelector('[data-el="hl-title"]').textContent = plan.add.length
        ? `${plan.add.length}개의 인용으로 저장합니다` : '새로 저장할 인용이 없어요';
      dlg.querySelector('[data-el="hl-skip"]').textContent = plan.skipped ? `이미 있는 같은 문장 ${plan.skipped}개는 건너뜁니다.` : '';
      dlg.querySelector('[data-el="hl-list"]').innerHTML = plan.add.map((it) =>
        `<li>${it.page != null ? `<b>p.${it.page}</b> ` : '<span class="st-meta">(쪽 없음)</span> '}${esc(it.text)}</li>`).join('');
      dlg.querySelector('[data-a="save"]').disabled = !plan.add.length;
      step('preview');
    });
    dlg.querySelector('[data-a="save"]').addEventListener('click', () => close('save'));
  }, { focus: '#hl-text' });
  if (res !== 'save' || !plan || !plan.add.length) return null;
  try {
    const out = await repo.addHighlights(book.id, plan.add);
    toast(`인용 ${out.added}개 저장${out.skipped ? ` · 같은 문장 ${out.skipped}개 건너뜀` : ''}`);
    return out;
  } catch (e) {
    toast(`저장하지 못했어요: ${e.message || e}`);
    return null;
  }
}

// F. AI 정리용 내보내기 글
export function memoExportText(d, book, memos) {
  const project = book.projectId ? (d.projects || []).find((p) => p.id === book.projectId) : null;
  const cat = book.subcategoryId ? (d.allSubcategories || []).find((c) => c.id === book.subcategoryId) : null;
  return R.buildMemoExport({ book, projectName: project ? project.name : '', categoryName: cat ? cat.name : '', memos, dateOf: localDateOf });
}

function shareableFile(text, name) {
  if (!(navigator.canShare && navigator.share && typeof File === 'function')) return null;
  for (const type of ['text/markdown', 'text/plain']) {
    try {
      const f = new File([text], name, { type });
      if (navigator.canShare({ files: [f] })) return f;
    } catch { /* 다음 형식 */ }
  }
  return null;
}

// F. 미리보기 + [복사] [파일로 공유](되는 환경만) [다운로드]
export async function openMemoExport(d, book, memos) {
  if (!memos.length) { toast('메모가 있어야 내보낼 수 있어요'); return; }
  const text = memoExportText(d, book, memos);
  const name = R.memoFileName(book.title);
  const file = shareableFile(text, name);
  await openSheet(`
    <p class="title">AI 정리용 내보내기</p>
    <p class="msg">메모 ${memos.length}개를 아래 글로 만들었어요. 복사해서 Claude 대화에 붙여 넣으세요.</p>
    <textarea class="textarea memo-export" rows="10" readonly aria-label="내보낼 글">${esc(text)}</textarea>
    <div class="choices" style="margin-top:12px">
      <button type="button" class="btn primary" data-a="copy">복사</button>
      ${file ? '<button type="button" class="btn" data-a="share">파일로 공유</button>' : ''}
      <button type="button" class="btn" data-a="download">다운로드 (${esc(name)})</button>
      <button type="button" class="btn link" data-a="close">닫기</button>
    </div>`, (dlg, close) => {
    const ta = dlg.querySelector('.memo-export');
    dlg.querySelector('[data-a="close"]').addEventListener('click', () => close(null));
    dlg.querySelector('[data-a="copy"]').addEventListener('click', async () => {
      const ok = await copyText(text);
      if (ok) { toast('복사했어요'); return; }
      // 복사가 막힌 환경: 글을 선택해 두고 직접 복사하게 한다
      ta.removeAttribute('readonly');
      ta.focus();
      ta.select();
      toast('복사하지 못했어요. 선택된 글을 길게 눌러 복사하세요');
    });
    const share = dlg.querySelector('[data-a="share"]');
    if (share) share.addEventListener('click', async () => {
      try { await navigator.share({ files: [file], title: name }); } catch (err) {
        if (!err || err.name !== 'AbortError') toast('공유하지 못했어요. 복사나 다운로드를 써 주세요');
      }
    });
    dlg.querySelector('[data-a="download"]').addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast('다운로드했어요');
    });
  });
}

// 메모 한 줄: "p.37 · 생각 · 11/25"
export function memoMetaLine(m, today) {
  const date = localDateOf(m.createdAt);
  return [m.page != null ? `p.${m.page}` : '쪽 없음', R.MEMO_TYPE_LABEL[m.type] || '생각', date ? fmtMDShort(date, today) : ''].filter(Boolean).join(' · ');
}
