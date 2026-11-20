// v1.2 B. 주제 편집 창 (주제·설명·키워드·시작일·목표 권수)
import * as repo from '../repo.js';
import { esc } from '../format.js';
import { toast, openDialog } from './shared.js';

export async function openTopicEditor(d, ctx) {
  const p = d.project;
  const st = { target: p.targetBooks };
  const html = `
    <p class="title">주제 편집</p>
    <div class="field" style="margin-bottom:10px">
      <label for="tp-name">주제</label>
      <input id="tp-name" class="input" type="text" value="${esc(p.name)}" autocomplete="off">
    </div>
    <div class="field" style="margin-bottom:10px">
      <label for="tp-desc">설명·키워드 <span style="font-weight:400;color:var(--muted)">(선택)</span></label>
      <textarea id="tp-desc" class="textarea" rows="3" placeholder="이 주제로 무엇을 알고 싶은지, 키워드 등">${esc(p.description || '')}</textarea>
    </div>
    <div class="field" style="margin-bottom:10px">
      <label for="tp-start">시작일</label>
      <input id="tp-start" class="input" type="date" value="${esc(p.startDate || d.today)}">
    </div>
    <div class="row center" style="margin-bottom:12px">
      <div class="label-strong" id="tp-target-label">목표 권수</div>
      <div class="mini-stepper">
        <button type="button" class="round sm" data-a="dec" aria-label="목표 1권 줄이기">−</button>
        <input class="num-input" data-el="target" type="text" inputmode="numeric" pattern="[0-9]*" aria-labelledby="tp-target-label">
        <button type="button" class="round sm" data-a="inc" aria-label="목표 1권 늘리기">+</button>
      </div>
    </div>
    <div class="error" data-el="err" role="alert"></div>
    <div class="choices">
      <button type="button" class="btn primary" data-a="save">저장</button>
      <button type="button" class="btn link" data-a="cancel">취소</button>
    </div>`;
  let values = null;
  const result = await openDialog(html, (dlg, close) => {
    const num = dlg.querySelector('[data-el="target"]');
    const setT = (v) => { st.target = Math.max(1, Math.round(Number(v)) || 1); num.value = String(st.target); };
    setT(st.target);
    num.addEventListener('input', () => { const dg = num.value.replace(/\D/g, ''); if (dg !== num.value) num.value = dg; st.target = Math.max(1, Number(dg) || 1); });
    num.addEventListener('change', () => setT(st.target));
    dlg.querySelector('[data-a="dec"]').addEventListener('click', () => setT(st.target - 1));
    dlg.querySelector('[data-a="inc"]').addEventListener('click', () => setT(st.target + 1));
    dlg.querySelector('[data-a="cancel"]').addEventListener('click', () => close(null));
    dlg.querySelector('[data-a="save"]').addEventListener('click', () => {
      const name = dlg.querySelector('#tp-name').value.trim();
      if (!name) { dlg.querySelector('[data-el="err"]').textContent = '주제를 적어 주세요.'; dlg.querySelector('#tp-name').focus(); return; }
      values = { name, description: dlg.querySelector('#tp-desc').value, startDate: dlg.querySelector('#tp-start').value, targetBooks: st.target };
      close('save');
    });
  });
  if (result !== 'save' || !values) return;
  try {
    await repo.updateProject(values);
    toast('주제를 저장했어요');
    ctx.refresh();
  } catch (e) {
    toast(`저장하지 못했어요: ${e.message || e}`);
  }
}
