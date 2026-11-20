// 6. 설정 화면 (v1.4: 데이터 백업 카드 · 주 시작 요일 · 용어 도움말)
import * as repo from '../repo.js';
import * as R from '../rules.js';
import { esc, fmtKo, localDateOf } from '../format.js';
import { toast, exportBackup, importBackup } from './shared.js';
import { helpBtn, bindHelp } from './bookActions.js';
import { APP_VERSION } from '../version.js';

const numField = (id, label, value, help = '') => `
  <div class="field">
    <div class="row center" style="justify-content:flex-start;gap:2px"><label for="${id}">${label}</label>${help ? helpBtn(help, `${label} 설명`) : ''}</div>
    <input id="${id}" class="input" type="number" inputmode="numeric" min="1" step="1" value="${esc(value)}">
  </div>`;

export function render(root, d, ctx) {
  const { settings: s, project, subcategories, today } = d;
  const st = { weekStartsOn: s.weekStartsOn === 0 ? 0 : 1 };
  const last = localDateOf(s.lastBackupAt);
  const due = R.backupReminder(last, today);

  root.innerHTML = `
    <form class="page form" novalidate>
      <div class="row">
        <a class="back" href="#/week">← 주간</a>
      </div>
      <div class="h1">설정</div>
      <div class="card backup-card" style="gap:10px">
        <div class="h2">데이터 백업</div>
        <div class="small" ${due ? 'style="color:var(--warn)"' : ''}>마지막 백업: ${last ? `${esc(fmtKo(last))} (${R.daysBetween(last, today)}일 전)` : '아직 없음'} · 7일마다 알려줘요</div>
        <div class="grid3" style="grid-template-columns:repeat(2,minmax(0,1fr))">
          <button type="button" class="btn outline" data-act="export">내보내기</button>
          <button type="button" class="btn" data-act="import">가져오기</button>
        </div>
        <div class="small">기록은 이 휴대폰 안에만 저장됩니다. 앱을 지우거나 휴대폰을 바꾸면 백업 파일로만 되살릴 수 있어요.</div>
      </div>
      <div class="card" style="gap:12px">
        <div class="h2">하루 기준 (쪽)</div>
        <div class="grid3">
          ${numField('s-accept', '인정선', s.acceptPages, 'accept')}
          ${numField('s-min', '최소선', s.minPages, 'min')}
          ${numField('s-goal', '목표선', s.goalPages, 'goal')}
        </div>
        ${numField('s-weekly', '주간 목표 권수', s.weeklyBooks)}
        <div class="field">
          <div class="label-strong" id="wk-label">주 시작 요일</div>
          <div class="modes" role="group" aria-labelledby="wk-label">
            <button type="button" class="pill" data-wk="1">월요일</button>
            <button type="button" class="pill" data-wk="0">일요일</button>
          </div>
          <div class="small">주간 막대·달력·통계·하루 필요량이 모두 이 요일부터 셉니다.</div>
        </div>
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
  const upd = () => root.querySelectorAll('[data-wk]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.wk) === st.weekStartsOn)));
  root.querySelectorAll('[data-wk]').forEach((b) => b.addEventListener('click', () => { st.weekStartsOn = Number(b.dataset.wk); upd(); }));
  upd();

  async function save() {
    const err = q('[data-el="err"]');
    const vals = { acceptPages: int('s-accept'), minPages: int('s-min'), goalPages: int('s-goal'), weeklyBooks: int('s-weekly') };
    const bad = Object.values(vals).some((v) => Number.isNaN(v) || v < 1);
    if (bad) { err.textContent = '숫자 칸은 1 이상의 정수로 적어 주세요.'; return; }
    if (!(vals.acceptPages <= vals.minPages && vals.minPages <= vals.goalPages)) { err.textContent = '인정선 ≤ 최소선 ≤ 목표선 순서가 되어야 해요.'; return; }
    err.textContent = '';
    try {
      await repo.saveSettings({ settings: { ...vals, weekStartsOn: st.weekStartsOn } });
      toast('설정을 저장했어요');
      ctx.go('week');
    } catch (e) {
      err.textContent = `저장하지 못했어요: ${e.message || e}`;
    }
  }
  q('form').addEventListener('submit', (e) => { e.preventDefault(); save(); });
  q('[data-act="save"]').addEventListener('click', save);
  q('[data-act="export"]').addEventListener('click', async () => { if (await exportBackup()) ctx.refresh(); });
  q('[data-act="import"]').addEventListener('click', async () => { if (await importBackup()) ctx.go('today'); });
  bindHelp(root, s);
}
