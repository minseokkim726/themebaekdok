// D-4 책 미리보기: 아래에서 올라오는 창. 제목·저자·추천 이유 + 서점(알라딘·교보문고) 검색 링크.
// 온라인 책 정보(Google Books)는 확인 결과 키 없이 쓸 수 없어 넣지 않았다(docs 보고 참고).
// 앱은 아무것도 자동으로 내보내지 않는다. 서점 링크는 사용자가 누를 때만 새 탭으로 열린다.
import * as R from '../rules.js';
import { esc } from '../format.js';
import { openDialog } from './shared.js';

// item: { title, author, note }, onAdd: [읽을 목록에 추가]를 눌렀을 때 부를 함수(없으면 버튼 숨김)
export async function openBookPreview(item, onAdd, { addLabel = '읽을 목록에 추가' } = {}) {
  const links = R.bookstoreLinks(item.title, item.author);
  const dlg = document.getElementById('dialog');
  dlg.classList.add('sheet');
  const html = `
    <div class="sheet-grip" aria-hidden="true"></div>
    <p class="title" style="font-size:19px">${esc(item.title)}</p>
    ${item.author ? `<p class="pv-author">${esc(item.author)}</p>` : ''}
    ${item.note ? `<p class="pv-note">${esc(item.note)}</p>` : ''}
    <p class="pv-hint">서점 페이지에서 책 소개와 미리보기를 볼 수 있어요.</p>
    <div class="choices">
      <div class="grid3" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <a class="btn" href="${esc(links.aladin)}" target="_blank" rel="noopener noreferrer">알라딘에서 보기</a>
        <a class="btn" href="${esc(links.kyobo)}" target="_blank" rel="noopener noreferrer">교보문고에서 보기</a>
      </div>
      ${onAdd ? `<button type="button" class="btn primary" data-a="add">${esc(addLabel)}</button>` : ''}
      <button type="button" class="btn link" data-a="close">닫기</button>
    </div>`;
  const result = await openDialog(html, (d, close) => {
    const add = d.querySelector('[data-a="add"]');
    if (add) add.addEventListener('click', () => close('add'));
    d.querySelector('[data-a="close"]').addEventListener('click', () => close(null));
    d.addEventListener('click', (e) => { if (e.target === d) close(null); }); // 바깥(어두운 곳) 누르면 닫기
  });
  dlg.classList.remove('sheet');
  if (result === 'add' && onAdd) onAdd();
}
