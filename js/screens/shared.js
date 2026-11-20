// 여러 화면이 함께 쓰는 작은 도우미: 대화 상자, 알림, 내보내기
import * as repo from '../repo.js';
import * as R from '../rules.js';
import { esc, todayStr, compactDate, localDateOf, fmtKo } from '../format.js';

const $ = (sel, root = document) => root.querySelector(sel);
export { $ };

let toastTimer = null;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// 선택 대화 상자. choices: [{ label, value, kind: 'primary'|'outline'|'' }]
// 고른 value를 돌려준다(닫으면 null).
export function ask({ title, message = '', choices }) {
  const dlg = $('#dialog');
  dlg.innerHTML = `
    <p class="title">${esc(title)}</p>
    ${message ? `<p class="msg">${esc(message)}</p>` : ''}
    <div class="choices">
      ${choices.map((c, i) => `<button type="button" class="btn ${c.kind || ''}" data-i="${i}">${esc(c.label)}</button>`).join('')}
    </div>`;
  return new Promise((resolve) => {
    let result = null;
    dlg.querySelectorAll('[data-i]').forEach((b) =>
      b.addEventListener('click', () => { result = choices[+b.dataset.i].value; dlg.close(); }));
    dlg.addEventListener('close', () => resolve(result), { once: true });
    dlg.showModal();
  });
}

// 직접 만든 내용을 넣는 대화 상자. build(dlg, close)로 내용을 채운다.
export function openDialog(html, bind) {
  const dlg = $('#dialog');
  dlg.innerHTML = html;
  return new Promise((resolve) => {
    let result = null;
    const close = (v) => { result = v; dlg.close(); };
    dlg.addEventListener('close', () => resolve(result), { once: true });
    bind(dlg, close);
    dlg.showModal();
  });
}

export function alertMsg(title, message) {
  return ask({ title, message, choices: [{ label: '확인', value: true, kind: 'primary' }] });
}

// 읽는 중인 책을 어떻게 할지 묻는다. 'finish' | 'drop' | 'planned' | null(취소)
export function askReplace(readingTitle) {
  return ask({
    title: '읽는 중인 책이 있어요',
    message: `「${readingTitle}」을(를) 어떻게 할까요?`,
    choices: [
      { label: '완독 처리', value: 'finish', kind: 'primary' },
      { label: '중단 (읽은 쪽수는 기록에 남음)', value: 'drop' },
      { label: '읽을 목록으로 되돌리기', value: 'planned' },
      { label: '취소', value: null, kind: 'link' },
    ],
  });
}

// 가져오기: 파일을 고르게 하고 → 형식 확인 → "덮어씁니다" 확인 → 교체. 바꿨으면 true.
// 버튼을 누른 그 순간에 불러야 한다(브라우저가 파일 선택 창을 막지 않도록).
export function importBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.className = 'visually-hidden';
  input.dataset.el = 'import-file';
  document.body.appendChild(input);
  return new Promise((resolve) => {
    const done = (v) => { input.remove(); resolve(v); };
    input.addEventListener('cancel', () => done(false));
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      if (!f) { done(false); return; }
      let obj;
      try { obj = JSON.parse(await f.text()); } catch {
        await alertMsg('가져오지 못했어요', '백업 파일(JSON)이 아닙니다. 아무것도 바꾸지 않았어요.');
        done(false); return;
      }
      const v = R.validateBackup(obj);
      if (!v.ok) { await alertMsg('가져오지 못했어요', `${v.error}\n아무것도 바꾸지 않았어요.`); done(false); return; }
      const when = obj.exportedAt ? localDateOf(obj.exportedAt) : null;
      const yes = await ask({
        title: '현재 데이터를 덮어씁니다',
        message: `백업 파일(${when ? fmtKo(when) : '날짜 모름'} · 책 ${obj.data.books.length}권 · 기록 ${obj.data.dayRecords.length}건)로 지금 데이터를 모두 바꿉니다.`,
        choices: [{ label: '덮어쓰기', value: true, kind: 'primary' }, { label: '취소', value: false }],
      });
      if (!yes) { done(false); return; }
      const res = await repo.importData(obj);
      if (!res.ok) { await alertMsg('가져오지 못했어요', res.error); done(false); return; }
      await repo.seedRecommendations().catch(() => 0); // 버전 1 파일이면 추천 초안을 넣는다
      toast('가져왔어요');
      done(true);
    });
    input.click();
  });
}

// 내보내기: 공유가 되면 공유 시트, 아니면 다운로드. 성공하면 마지막 백업 시각을 저장한다.
export async function exportBackup() {
  const data = await repo.exportData();
  const name = `themebaekdok-backup-${compactDate(todayStr())}.json`;
  const text = JSON.stringify(data, null, 2);
  const file = new File([text], name, { type: 'application/json' });
  let done = false;
  if (navigator.canShare && navigator.share) {
    let can = false;
    try { can = navigator.canShare({ files: [file] }); } catch { can = false; }
    if (can) {
      try {
        await navigator.share({ files: [file], title: name });
        done = true;
      } catch (err) {
        if (err && err.name === 'AbortError') { toast('내보내기를 취소했어요'); return false; }
        // 공유가 실패하면 다운로드로 넘어간다
      }
    }
  }
  if (!done) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    done = true;
  }
  await repo.markBackedUp();
  toast('내보냈어요');
  return true;
}

// 클립보드 복사(안 되면 예전 방식으로). 성공하면 true
export async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* 아래 방법으로 */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}
