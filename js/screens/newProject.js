// v1.2 C-2. 새 테마백독 시작 (#/newproject)
import * as repo from '../repo.js';
import * as R from '../rules.js';
import { esc } from '../format.js';
import { toast } from './shared.js';
import { setPendingGuide, showRecGuide } from './projectFlow.js';

export function render(root, d, ctx) {
  if (d.project) {
    root.innerHTML = `
      <div class="page form">
        <a class="back" href="#/status">← 현황</a>
        <div class="h1">새 테마백독 시작</div>
        <div class="st-body">진행 중인 테마백독(${esc(d.project.name)})이 있어요. 먼저 현황 맨 아래 [이 테마백독 마치기]로 마쳐 주세요.</div>
      </div>`;
    return;
  }
  const ords = d.ordinals;
  const prev = [...d.projects].sort((a, b) => (ords[a.id] || 0) - (ords[b.id] || 0)).pop() || null;
  const prevSubs = prev ? d.allSubcategories.filter((c) => c.projectId === prev.id) : [];
  const carry = d.allBooks.filter((b) => b.carryOver && b.status === 'reading');
  const next = d.projects.length + 1;
  const st = { target: 100, structure: 'empty', busy: false };

  root.innerHTML = `
    <form class="page form" novalidate>
      <div class="row">
        <a class="back" href="#/history">← 히스토리</a>
      </div>
      <div>
        <div class="small">${next}번째 테마백독</div>
        <div class="h1">새 테마백독 시작</div>
      </div>
      <div class="field">
        <label for="np-name">주제</label>
        <input id="np-name" class="input" type="text" placeholder="예: 글쓰기와 생각" autocomplete="off">
      </div>
      <div class="field">
        <label for="np-desc">설명·키워드 <span style="font-weight:400;color:var(--muted)">(선택)</span></label>
        <textarea id="np-desc" class="textarea" rows="3" placeholder="이 주제로 무엇을 알고 싶은지, 키워드 등"></textarea>
      </div>
      <div class="row center">
        <div class="label-strong" id="np-target-label">목표 권수</div>
        <div class="mini-stepper">
          <button type="button" class="round sm" data-a="dec" aria-label="목표 1권 줄이기">−</button>
          <input class="num-input" data-el="target" type="text" inputmode="numeric" pattern="[0-9]*" aria-labelledby="np-target-label">
          <button type="button" class="round sm" data-a="inc" aria-label="목표 1권 늘리기">+</button>
        </div>
      </div>
      <div class="field">
        <label for="np-start">시작일</label>
        <input id="np-start" class="input" type="date" value="${esc(d.today)}">
      </div>
      <div class="field">
        <div class="label-strong" id="np-struct-label">서브카테고리</div>
        <div class="modes" role="group" aria-labelledby="np-struct-label">
          <button type="button" class="pill" data-structure="empty">빈 상태로 시작</button>
          ${prevSubs.length ? `<button type="button" class="pill" data-structure="copy">직전 백독 구성 복사</button>` : ''}
        </div>
        <div class="small" style="line-height:1.5" data-el="hint"></div>
      </div>
      ${carry.length ? `<div class="card" style="gap:4px"><div class="label-strong">가져오는 책</div><div class="st-body">${carry.map((b) => `「${esc(b.title)}」`).join(', ')} — 새 백독의 첫 카테고리에 들어가요. 나중에 옮길 수 있어요.</div></div>` : ''}
      <div class="error" data-el="err" role="alert"></div>
    </form>
    <div class="actions form-actions">
      <button type="button" class="btn primary big" data-act="save">시작하기</button>
    </div>`;

  const q = (s) => root.querySelector(s);
  const num = q('[data-el="target"]');
  const setT = (v) => { st.target = Math.max(1, Math.round(Number(v)) || 1); num.value = String(st.target); };
  setT(100);
  num.addEventListener('input', () => { const dg = num.value.replace(/\D/g, ''); if (dg !== num.value) num.value = dg; st.target = Math.max(1, Number(dg) || 1); });
  num.addEventListener('change', () => setT(st.target));
  q('[data-a="dec"]').addEventListener('click', () => setT(st.target - 1));
  q('[data-a="inc"]').addEventListener('click', () => setT(st.target + 1));
  const hints = {
    empty: '카테고리 편집 화면으로 바로 갑니다. 정하지 못했으면 "미분류" 1개로 시작하고 나중에 고칠 수 있어요.',
    copy: `직전 백독의 카테고리 ${prevSubs.length}개(이름·목표 권수)를 그대로 씁니다: ${prevSubs.sort((a, b) => a.order - b.order).map((c) => c.name).join(', ')}`,
  };
  const update = () => {
    root.querySelectorAll('[data-structure]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.structure === st.structure)));
    q('[data-el="hint"]').textContent = hints[st.structure];
  };
  root.querySelectorAll('[data-structure]').forEach((b) => b.addEventListener('click', () => { st.structure = b.dataset.structure; update(); }));
  update();

  async function save() {
    if (st.busy) return;
    const name = q('#np-name').value.trim();
    const err = q('[data-el="err"]');
    if (!name) { err.textContent = '주제를 적어 주세요.'; q('#np-name').focus(); return; }
    err.textContent = '';
    st.busy = true;
    try {
      const p = await repo.startProject({ name, description: q('#np-desc').value, targetBooks: st.target, startDate: q('#np-start').value }, st.structure);
      toast(`${next}번째 테마백독을 시작했어요`);
      if (st.structure === 'empty') {
        setPendingGuide(p.id); // 카테고리 편집을 마치면 추천 안내를 한 번 보여준다
        ctx.go('categories');
      } else {
        ctx.go('status');
        showRecGuide();
      }
    } catch (e) {
      st.busy = false;
      err.textContent = `시작하지 못했어요: ${e.message || e}`;
    }
  }
  q('form').addEventListener('submit', (e) => { e.preventDefault(); save(); });
  q('[data-act="save"]').addEventListener('click', save);
}
