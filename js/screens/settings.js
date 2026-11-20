// 6. 설정 화면 (간단한 폼)
import * as repo from '../repo.js';
import { esc } from '../format.js';
import { toast } from './shared.js';
import { APP_VERSION } from '../version.js';

const numField = (id, label, value) => `
  <div class="field">
    <label for="${id}">${label}</label>
    <input id="${id}" class="input" type="number" inputmode="numeric" min="1" step="1" value="${esc(value)}">
  </div>`;

export function render(root, d, ctx) {
  const { settings: s, project, subcategories } = d;

  root.innerHTML = `
    <form class="page form" novalidate>
      <div class="row">
        <a class="back" href="#/week">← 주간</a>
      </div>
      <div class="h1">설정</div>
      <div class="card" style="gap:12px">
        <div class="h2">하루 기준 (쪽)</div>
        <div class="grid3">
          ${numField('s-accept', '인정선', s.acceptPages)}
          ${numField('s-min', '최소선', s.minPages)}
          ${numField('s-goal', '목표선', s.goalPages)}
        </div>
        ${numField('s-weekly', '주간 목표 권수', s.weeklyBooks)}
      </div>
      ${project ? `<a class="card link-card" href="#/categories">
        <span><span class="h2">서브카테고리 편집</span><br><span class="small">${subcategories.length}개 · 추가·삭제·이름·목표 권수·순서</span></span>
        <span class="chev" aria-hidden="true">›</span>
      </a>` : ''}
      <div class="error" data-el="err" role="alert"></div>
    </form>
    <div class="actions form-actions">
      <button type="button" class="btn primary big" data-act="save">저장</button>
      <div class="app-version" data-el="version">앱 버전 ${esc(APP_VERSION)}</div>
    </div>`;

  const q = (sel) => root.querySelector(sel);
  const int = (id) => { const v = Number(q(`#${id}`).value); return Number.isInteger(v) ? v : NaN; };

  async function save() {
    const err = q('[data-el="err"]');
    const vals = { acceptPages: int('s-accept'), minPages: int('s-min'), goalPages: int('s-goal'), weeklyBooks: int('s-weekly') };
    const bad = Object.values(vals).some((v) => Number.isNaN(v) || v < 1);
    if (bad) { err.textContent = '숫자 칸은 1 이상의 정수로 적어 주세요.'; return; }
    if (!(vals.acceptPages <= vals.minPages && vals.minPages <= vals.goalPages)) { err.textContent = '인정선 ≤ 최소선 ≤ 목표선 순서가 되어야 해요.'; return; }
    err.textContent = '';
    try {
      await repo.saveSettings({ settings: vals });
      toast('설정을 저장했어요');
      ctx.go('week');
    } catch (e) {
      err.textContent = `저장하지 못했어요: ${e.message || e}`;
    }
  }
  q('form').addEventListener('submit', (e) => { e.preventDefault(); save(); });
  q('[data-act="save"]').addEventListener('click', save);
}
