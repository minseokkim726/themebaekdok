// 카테고리(서브카테고리) 편집 화면: 추가·삭제·이름·목표 권수·순서. [저장] 한 번에 반영.
import * as repo from '../repo.js';
import * as R from '../rules.js';
import { esc, projectLine } from '../format.js';
import { toast, ask, alertMsg } from './shared.js';
import { takePendingGuide, showRecGuide } from './projectFlow.js';

let tempSeq = 0;

export function render(root, d, ctx) {
  const st = {
    rows: d.subcategories.map((c) => ({ id: c.id, name: c.name, targetBooks: c.targetBooks })),
    target: d.project.targetBooks,
    moves: {},
    busy: false,
  };
  const keepIds = () => new Set(st.rows.map((r) => r.id));
  // 편집 중 상태에서 그 카테고리에 속하게 될 책 수
  const bookCount = (id) => d.books.filter((b) => R.resolveCategory(b.subcategoryId, st.moves, keepIds()) === id).length;

  root.innerHTML = `
    <div class="page form">
      <div class="row">
        <a class="back" href="#/status">← 현황</a>
        <div class="sub">${esc(projectLine(d.project, d.ordinal))}</div>
      </div>
      <div>
        <div class="h1">카테고리 편집</div>
        <div class="small">저장을 눌러야 반영됩니다. 책과 기록은 지워지지 않아요.</div>
      </div>
      <div class="card" style="gap:10px">
        <div class="row center">
          <div class="h2">백독 목표</div>
          <div class="mini-stepper">
            <button type="button" class="round sm" data-act="t-dec" aria-label="백독 목표 1권 줄이기">−</button>
            <input class="num-input" data-el="target" type="text" inputmode="numeric" pattern="[0-9]*" aria-label="백독 목표 권수">
            <button type="button" class="round sm" data-act="t-inc" aria-label="백독 목표 1권 늘리기">+</button>
          </div>
        </div>
      </div>
      <div class="card" style="gap:0" data-el="list"></div>
      <button type="button" class="btn outline" data-act="add">+ 카테고리 추가</button>
      <div class="error" data-el="err" role="alert"></div>
    </div>
    <div class="actions form-actions">
      <div class="sum-line" data-el="sum" aria-live="polite"></div>
      <div class="warn-line" data-el="dup"></div>
      <button type="button" class="btn primary big" data-act="save">저장</button>
    </div>`;

  const q = (s) => root.querySelector(s);
  const list = q('[data-el="list"]');
  const targetInput = q('[data-el="target"]');

  function updateSum() {
    const sum = st.rows.reduce((a, r) => a + (Number(r.targetBooks) || 0), 0);
    const s = R.categorySumText(sum, st.target);
    const el = q('[data-el="sum"]');
    el.textContent = s.text;
    el.classList.toggle('ok', s.matches);
    const dups = R.duplicateNames(st.rows);
    q('[data-el="dup"]').textContent = dups.length ? `같은 이름이 있어요: ${dups.join(', ')} (저장은 됩니다)` : '';
  }

  function draw(focusIndex = -1) {
    list.innerHTML = st.rows.map((r, i) => `
      <div class="cat-edit" data-i="${i}">
        <label class="visually-hidden" for="cn-${i}">카테고리 ${i + 1} 이름</label>
        <input id="cn-${i}" class="input" data-f="name" type="text" value="${esc(r.name)}" placeholder="카테고리 이름" autocomplete="off">
        <div class="cat-edit-tools">
          <div class="mini-stepper">
            <button type="button" class="round sm" data-a="dec" aria-label="${esc(r.name || '새 카테고리')} 목표 1권 줄이기">−</button>
            <input class="num-input" data-f="target" type="text" inputmode="numeric" pattern="[0-9]*" value="${r.targetBooks}" aria-label="${esc(r.name || '새 카테고리')} 목표 권수">
            <button type="button" class="round sm" data-a="inc" aria-label="${esc(r.name || '새 카테고리')} 목표 1권 늘리기">+</button>
          </div>
          <div class="tool-btns">
            <button type="button" class="icon-btn" data-a="up" aria-label="위로" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="icon-btn" data-a="down" aria-label="아래로" ${i === st.rows.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="icon-btn danger" data-a="del">삭제</button>
          </div>
        </div>
      </div>`).join('');
    list.querySelectorAll('.cat-edit').forEach((rowEl) => {
      const i = Number(rowEl.dataset.i);
      const r = st.rows[i];
      const name = rowEl.querySelector('[data-f="name"]');
      const num = rowEl.querySelector('[data-f="target"]');
      name.addEventListener('input', () => { r.name = name.value; updateSum(); });
      num.addEventListener('focus', () => num.select());
      num.addEventListener('input', () => {
        const digits = num.value.replace(/\D/g, '');
        if (digits !== num.value) num.value = digits;
        r.targetBooks = digits === '' ? 0 : Number(digits);
        updateSum();
      });
      num.addEventListener('change', () => { num.value = String(r.targetBooks); });
      const step = (n) => { r.targetBooks = Math.max(0, (Number(r.targetBooks) || 0) + n); num.value = String(r.targetBooks); updateSum(); };
      rowEl.querySelector('[data-a="dec"]').addEventListener('click', () => step(-1));
      rowEl.querySelector('[data-a="inc"]').addEventListener('click', () => step(1));
      rowEl.querySelector('[data-a="up"]').addEventListener('click', () => swap(i, i - 1));
      rowEl.querySelector('[data-a="down"]').addEventListener('click', () => swap(i, i + 1));
      rowEl.querySelector('[data-a="del"]').addEventListener('click', () => remove(i));
    });
    updateSum();
    if (focusIndex >= 0) {
      const el = list.querySelector(`#cn-${focusIndex}`);
      if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); }
    }
  }

  function swap(a, b) {
    if (b < 0 || b >= st.rows.length) return;
    [st.rows[a], st.rows[b]] = [st.rows[b], st.rows[a]];
    draw();
  }

  async function remove(i) {
    const r = st.rows[i];
    const label = r.name.trim() || '새 카테고리';
    if (st.rows.length <= 1) { await alertMsg('지울 수 없어요', '카테고리는 최소 1개 남겨야 해요.'); return; }
    const n = bookCount(r.id);
    if (n === 0) {
      const yes = await ask({
        title: `「${label}」을(를) 지울까요?`,
        message: '이 카테고리에는 책이 없어요. 저장을 눌러야 실제로 지워집니다.',
        choices: [{ label: '삭제', value: true, kind: 'primary' }, { label: '취소', value: false }],
      });
      if (!yes) return;
    } else {
      const others = st.rows.filter((o) => o !== r);
      const to = await ask({
        title: `이 카테고리의 책 ${n}권을 어디로 옮길까요?`,
        message: `「${label}」을(를) 지우고 책을 옮깁니다. 책과 기록은 지우지 않아요.`,
        choices: [...others.map((o) => ({ label: o.name.trim() || '새 카테고리', value: o.id })), { label: '취소', value: null, kind: 'link' }],
      });
      if (!to) return;
      st.moves[r.id] = to;
    }
    st.rows.splice(i, 1);
    draw();
  }

  function setTarget(v) {
    st.target = Math.max(1, Math.round(Number(v)) || 1);
    targetInput.value = String(st.target);
    updateSum();
  }
  targetInput.value = String(st.target);
  targetInput.addEventListener('focus', () => targetInput.select());
  targetInput.addEventListener('input', () => {
    const digits = targetInput.value.replace(/\D/g, '');
    if (digits !== targetInput.value) targetInput.value = digits;
    st.target = Math.max(1, Number(digits) || 1);
    updateSum();
  });
  targetInput.addEventListener('change', () => setTarget(st.target));
  q('[data-act="t-dec"]').addEventListener('click', () => setTarget(st.target - 1));
  q('[data-act="t-inc"]').addEventListener('click', () => setTarget(st.target + 1));

  q('[data-act="add"]').addEventListener('click', () => {
    st.rows.push({ id: `new:${++tempSeq}`, name: '', targetBooks: 10 });
    draw(st.rows.length - 1);
  });

  q('[data-act="save"]').addEventListener('click', async () => {
    if (st.busy) return;
    const err = q('[data-el="err"]');
    const empty = st.rows.findIndex((r) => !r.name.trim());
    if (empty >= 0) {
      err.textContent = '이름이 빈 카테고리가 있어요. 이름을 적거나 삭제해 주세요.';
      const el = list.querySelector(`#cn-${empty}`);
      if (el) el.focus();
      return;
    }
    err.textContent = '';
    st.busy = true;
    try {
      await repo.saveCategories({ targetBooks: st.target, rows: st.rows, moves: st.moves });
      toast('카테고리를 저장했어요');
      ctx.go('status');
      if (takePendingGuide(d.project.id)) showRecGuide(); // 새 백독을 빈 구성으로 시작한 경우 한 번
    } catch (e) {
      st.busy = false;
      err.textContent = `저장하지 못했어요: ${e.message || e}`;
    }
  });

  draw();
}
