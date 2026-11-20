// v1.4 책 관리(여러 화면 공용): 소속 뱃지, 중단·교체, 소속 바꾸기, 용어 도움말(ⓘ)
import * as repo from '../repo.js';
import * as R from '../rules.js';
import { esc } from '../format.js';
import { toast, ask, alertMsg } from './shared.js';

// 소속 뱃지: 백독 책은 카테고리 이름, 백독 외 책은 회색 "백독 외"
export function scopeBadge(book, subcategories) {
  if (R.isOutside(book)) return '<span class="badge out">백독 외</span>';
  const c = (subcategories || []).find((x) => x.id === book.subcategoryId);
  return c ? `<span class="badge">${esc(c.name)}</span>` : '';
}

// [중단·교체]: 중단 / 읽을 목록으로 / 소속 바꾸기 / 새 책 추가
export async function manageBook(book, d, ctx) {
  const toOutside = !R.isOutside(book);
  const choice = await ask({
    title: `「${book.title}」`,
    message: '이 책을 어떻게 할까요? 지금까지 기록은 그대로 남아요.',
    choices: [
      { label: '중단 (읽은 쪽수는 기록에 남음)', value: 'drop' },
      { label: '읽을 목록으로 되돌리기', value: 'planned' },
      { label: toOutside ? '소속 바꾸기 → 백독 외 독서' : '소속 바꾸기 → 이번 테마백독', value: 'scope' },
      { label: '새 책 추가', value: 'add' },
      { label: '취소', value: null, kind: 'link' },
    ],
  });
  if (!choice) return;
  if (choice === 'add') { ctx.go('add'); return; }
  if (choice === 'scope') { await changeScopeFlow(book, d, ctx); return; }
  try {
    await repo.setBookStatus(book.id, choice === 'drop' ? 'dropped' : 'planned');
    toast(choice === 'drop' ? '중단했어요. 기록은 남아 있어요' : '읽을 목록으로 옮겼어요');
    ctx.refresh();
  } catch (e) {
    await alertMsg('바꾸지 못했어요', e.message || String(e));
  }
}

// 소속 바꾸기. 백독 외 → 이번 테마백독은 카테고리를 꼭 고른다(이전 카테고리가 있으면 맨 앞).
// 끝나면 바뀐 책을 돌려준다(취소·실패면 null).
export async function changeScopeFlow(book, d, ctx, { refresh = true } = {}) {
  try {
    let res;
    if (R.isOutside(book)) {
      if (!d.project) { await alertMsg('바꿀 수 없어요', '진행 중인 테마백독이 없어요. 먼저 테마백독을 시작하세요.'); return null; }
      const subs = [...d.subcategories];
      const prevIdx = subs.findIndex((c) => c.id === book.prevSubcategoryId);
      if (prevIdx > 0) subs.unshift(...subs.splice(prevIdx, 1));
      const cat = await ask({
        title: '이번 테마백독의 어느 카테고리에 넣을까요?',
        message: '고르면 바로 테마백독 달성률에 들어가요.',
        choices: [...subs.map((c) => ({ label: c.name + (c.id === book.prevSubcategoryId ? ' (이전 카테고리)' : ''), value: c.id })), { label: '취소', value: null, kind: 'link' }],
      });
      if (!cat) return null;
      res = await repo.changeScope(book.id, 'project', cat);
      toast('이번 테마백독에 넣었어요');
    } else {
      const yes = await ask({
        title: '백독 외 독서로 바꿀까요?',
        message: '테마백독 달성률·카테고리에서 빠지고, 읽은 쪽수·연속일수에는 그대로 들어가요.',
        choices: [{ label: '백독 외로 바꾸기', value: true, kind: 'primary' }, { label: '취소', value: false }],
      });
      if (!yes) return null;
      res = await repo.changeScope(book.id, 'outside');
      toast('백독 외 독서로 바꿨어요');
    }
    if (refresh) ctx.refresh();
    return res;
  } catch (e) {
    await alertMsg('바꾸지 못했어요', e.message || String(e));
    return null;
  }
}

// ---------- 용어 도움말(B-M2) ----------
export const HELP = {
  goal: (s) => `목표선: 하루 목표 쪽수예요(설정값, 지금 ${s.goalPages}쪽 또는 60분).`,
  min: (s) => `최소선: 꼭 지킬 하루 기준이에요(지금 ${s.minPages}쪽 또는 ${s.minMinutes}분).`,
  accept: (s) => `인정선: 바쁜 날에도 '읽은 날'로 인정하는 하한이에요(지금 ${s.acceptPages}쪽).`,
  rest: () => '쉰 날: 기록이 인정선에 못 미친 날이에요. 하루는 연속이 이어지고, 이틀 연속이면 끊깁니다.',
  drop: () => '중단: 읽다가 그만둔 책이에요. 읽은 쪽수는 기록에 남습니다.',
  lines: (s) => `목표선 ${s.goalPages}쪽(또는 60분) · 최소선 ${s.minPages}쪽(또는 ${s.minMinutes}분) · 인정선 ${s.acceptPages}쪽. 쉰 날은 인정선에 못 미친 날이고, 하루는 연속이 이어지고 이틀 연속이면 끊겨요.`,
  minDays: () => '최소선 달성 N / M일: M은 이번 주 중 테마백독 시작 이후의 지난 날 수(어제까지)에, 오늘 기록했으면 오늘을 더한 날 수예요.',
};

export const helpBtn = (key, label = '도움말') => `<button type="button" class="help-btn" data-help="${key}" aria-label="${esc(label)}">ⓘ</button>`;

export function bindHelp(root, settings) {
  root.querySelectorAll('[data-help]').forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const f = HELP[b.dataset.help];
    if (f) alertMsg('용어 도움말', f(settings));
  }));
}
