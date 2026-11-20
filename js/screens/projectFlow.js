// v1.2 C. 테마백독 마치기 흐름과 "Claude에게 추천 받기" 안내
import * as repo from '../repo.js';
import * as R from '../rules.js';
import { toast, ask, copyText } from './shared.js';

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

// [이 테마백독 마치기]
export async function finishProjectFlow(d, ctx) {
  const { project, readingBook } = d;
  const done = d.books.filter((b) => b.status === 'done').length;
  let action = null;
  if (readingBook) {
    action = await ask({
      title: '읽는 중인 책이 있어요',
      message: `「${readingBook.title}」을(를) 어떻게 할까요?\n가져가기를 권해요: 다음 백독에서 이어 읽고, 지금까지의 기록은 그대로 남습니다.`,
      choices: [
        { label: '다음 백독으로 가져가기 (권장)', value: 'carry', kind: 'primary' },
        { label: '완독 처리하고 마치기', value: 'finish' },
        { label: '중단으로 두고 마치기', value: 'drop' },
        { label: '취소', value: null, kind: 'link' },
      ],
    });
    if (!action) return;
  }
  const yes = await ask({
    title: '이 테마백독을 마칠까요?',
    message: `완독 ${done + (action === 'finish' ? 1 : 0)} / ${project.targetBooks}권에서 마칩니다. 기록은 히스토리에 남습니다.`,
    choices: [{ label: '마치기', value: true, kind: 'primary' }, { label: '취소', value: false }],
  });
  if (!yes) return;
  try {
    await repo.finishProject(action);
    toast(`${d.ordinal}번째 테마백독을 마쳤어요`);
    ctx.go('newproject');
  } catch (e) {
    toast(`마치지 못했어요: ${e.message || e}`);
  }
}
