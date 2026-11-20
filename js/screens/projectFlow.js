// v1.2 C. 테마백독 마치기 흐름과 "Claude에게 추천 받기" 안내
import * as repo from '../repo.js';
import * as R from '../rules.js';
import { toast, ask, copyText, openDialog } from './shared.js';

// 새 백독의 카테고리를 정한 뒤 한 번 보여줄 안내(프로젝트 id). 화면 사이에서만 기억한다.
let pendingGuide = null;
export const setPendingGuide = (projectId) => { pendingGuide = projectId; };
export const takePendingGuide = (projectId) => {
  if (pendingGuide && pendingGuide === projectId) { pendingGuide = null; return true; }
  return false;
};

export async function showRecGuide() {
  const yes = await ask({
    title: 'Claude에게 추천 받기',
    message: '새 주제의 카테고리에 맞는 책을 Claude에게 추천받을 수 있어요.\n요청 문구를 복사해 Claude 대화에 붙여 넣고, 받은 목록은 현황 → 카테고리 → [추천 목록 붙여넣기]로 넣으세요.',
    choices: [{ label: '추천 요청 문구 복사', value: true, kind: 'primary' }, { label: '나중에', value: false }],
  });
  if (!yes) return;
  const d = await repo.load();
  if (!d.project) return;
  const ok = await copyText(R.recommendationPrompt({ project: d.project, subcategories: d.subcategories, books: d.allBooks, recommendations: d.recommendations }));
  toast(ok ? '추천 요청 문구를 복사했어요' : '복사하지 못했어요. 카테고리 화면의 버튼으로 다시 해 보세요');
}

// [이 테마백독 마치기] (v1.4: 읽는 중인 백독 책만 묻고, 완료/중단을 고르며, 중단 메모를 받는다)
export async function finishProjectFlow(d, ctx) {
  const { project } = d;
  const reading = d.books.filter((b) => b.status === 'reading');           // 백독 책만(백독 외 책은 묻지 않고 그대로)
  const outsideReading = (d.outsideBooks || []).filter((b) => b.status === 'reading');
  const done = d.books.filter((b) => b.status === 'done').length;
  let action = null;
  if (reading.length) {
    action = await ask({
      title: '읽는 중인 백독 책이 있어요',
      message: `${reading.map((b) => `「${b.title}」`).join(', ')}을(를) 어떻게 할까요?
가져가기를 권해요: 다음 백독에서 이어 읽고, 지금까지의 기록은 그대로 남습니다.${outsideReading.length ? `
백독 외 책 ${outsideReading.length}권은 그대로 남아요.` : ''}`,
      choices: [
        { label: '다음 백독으로 가져가기 (권장)', value: 'carry', kind: 'primary' },
        { label: '완독 처리하고 마치기', value: 'finish' },
        { label: '중단으로 두고 마치기', value: 'drop' },
        { label: '취소', value: null, kind: 'link' },
      ],
    });
    if (!action) return;
  }
  const doneAfter = done + (action === 'finish' ? reading.length : 0);
  const reached = doneAfter >= project.targetBooks;
  const endType = await ask({
    title: '이 테마백독을 마칠까요?',
    message: `목표 ${project.targetBooks}권 중 ${doneAfter}권을 완독했습니다.
기록은 히스토리에 남고, 나중에 되돌릴 수도 있어요.`,
    choices: [
      { label: '완료로 마치기', value: R.END_DONE, kind: reached ? 'primary' : '' },
      { label: '중단으로 마치기', value: R.END_STOP, kind: reached ? '' : 'primary' },
      { label: '취소', value: null, kind: 'link' },
    ],
  });
  if (!endType) return;
  let note = '';
  if (endType === R.END_STOP) {
    const res = await openDialog(`
      <p class="title">중단 메모 (선택)</p>
      <p class="msg">왜 멈추는지 한 줄 남겨 두면 히스토리에서 볼 수 있어요.</p>
      <label for="end-note" class="visually-hidden">중단 메모</label>
      <input id="end-note" class="input" type="text" maxlength="200" placeholder="예: 주제를 바꿔 다시 시작" autocomplete="off">
      <div class="choices" style="margin-top:12px">
        <button type="button" class="btn primary" data-a="ok">중단으로 마치기</button>
        <button type="button" class="btn link" data-a="cancel">취소</button>
      </div>`, (dlg, close) => {
      dlg.querySelector('[data-a="ok"]').addEventListener('click', () => close(dlg.querySelector('#end-note').value));
      dlg.querySelector('[data-a="cancel"]').addEventListener('click', () => close(null));
    });
    if (res === null) return;
    note = res;
  }
  try {
    await repo.finishProject(action, endType, note);
    toast(`${d.ordinal}번째 테마백독을 ${endType === R.END_STOP ? '중단으로' : '완료로'} 마쳤어요`);
    ctx.go('newproject');
  } catch (e) {
    toast(`마치지 못했어요: ${e.message || e}`);
  }
}
