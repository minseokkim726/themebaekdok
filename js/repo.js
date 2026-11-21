// 데이터 접근 계층. 화면 코드는 저장소(IndexedDB)에 직접 접근하지 않고 이 모듈만 호출한다.
// 나중에 서버 저장으로 바꿀 때 이 파일만 교체하면 되도록 함수 이름을 일(업무) 단위로 둔다.

import * as R from './rules.js';
import { todayStr } from './format.js';

const DB_NAME = 'themebaekdok';
// 저장소 버전 기록(기존 저장소·데이터는 지우지 않는다):
//  1 = 1단계
//  2 = v1.1 추천 도서(recommendations) 추가
//  3 = v1.4 하루 기록을 '날짜+책' 열쇠의 records로 옮김(같은 날 여러 책). 예전 dayRecords(날짜 열쇠)는
//      그대로 남겨 두는 안전용 사본이고 더 이상 읽거나 쓰지 않는다.
//  4 = v1.5 책별 메모(memos) 추가. 없는 저장소만 만들고 기존 데이터는 건드리지 않는다.
const DB_VERSION = 4;
const STORES = ['projects', 'subcategories', 'books', 'records', 'settings', 'meta', 'recommendations', 'memos'];

const FIRST_SUBCATEGORIES = [
  ['독서·문해력', 25],
  ['인지·학습과학', 25],
  ['미디어·기술이 사고를 바꾼 역사', 20],
  ['AI와 지식노동의 미래', 15],
  ['위대한 독서가들의 삶', 15],
];

// ---------- IndexedDB 작은 래퍼 ----------
let dbPromise = null;
let blockedHandler = null;
// 저장소 형식을 올려야 하는데 다른 창·탭이 옛 버전으로 열어 두고 있을 때 부를 함수(main.js가 안내를 띄운다)
export function onBlocked(fn) { blockedHandler = fn; }

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    // 없는 저장소만 만든다(예전 버전에서 올라올 때 기존 데이터를 건드리지 않음)
    req.onupgradeneeded = (e) => {
      const db = req.result;
      const make = (name, keyPath) => { if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath }); };
      make('projects', 'id');
      make('subcategories', 'id');
      make('books', 'id');
      make('settings', 'id');
      make('meta', 'id');
      make('recommendations', 'id');
      make('memos', 'id');
      const fresh = !db.objectStoreNames.contains('records');
      make('records', 'id');
      // v1.3 이하(저장소 버전 1·2)에서 올라오면: 날짜 열쇠 기록을 '날짜|책' 열쇠로 한 건도 빠짐없이 복사한다.
      // 같은 업그레이드 안에서 처리되므로 중간에 끊기면 전체가 취소되고 예전 상태가 그대로 남는다.
      if (fresh && e.oldVersion > 0 && db.objectStoreNames.contains('dayRecords')) {
        const tx = req.transaction;
        const getAll = tx.objectStore('dayRecords').getAll();
        getAll.onsuccess = () => {
          const out = tx.objectStore('records');
          for (const r of R.migrateRecords(getAll.result)) out.put(r);
        };
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    // 예전 버전이 다른 탭에 열려 있으면 그 탭이 저장소를 닫을 때까지 기다린다(예전 코드도 스스로 닫는다).
    // v1.5 A: 기다리는 동안 화면에 안내를 띄운다(옛 탭을 닫으면 이 요청이 이어서 성공한다).
    req.onblocked = () => { try { if (blockedHandler) blockedHandler(); } catch { /* 안내만 빠진다 */ } };
  });
  return dbPromise;
}

// 여러 저장소를 한 번에 읽는다
async function readAll(names = STORES) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(names, 'readonly');
    const out = {};
    for (const n of names) {
      const r = t.objectStore(n).getAll();
      r.onsuccess = () => { out[n] = r.result; };
    }
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('저장 취소됨'));
  });
}

// 한 트랜잭션으로 쓴다. ops: { put: {store: [items]}, del: {store: [keys]}, clear: [stores] }
async function write({ put = {}, del = {}, clear = [] }) {
  const names = [...new Set([...Object.keys(put), ...Object.keys(del), ...clear])];
  if (!names.length) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(names, 'readwrite');
    for (const n of clear) t.objectStore(n).clear();
    for (const [n, keys] of Object.entries(del)) for (const k of keys) t.objectStore(n).delete(k);
    for (const [n, items] of Object.entries(put)) for (const it of items) t.objectStore(n).put(it);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('저장 취소됨'));
  });
}

function newId(prefix) {
  if (globalThis.crypto && typeof crypto.randomUUID === 'function') return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function settingsOf(rows) {
  const s = (rows || []).find((r) => r.id === 'settings') || {};
  const { id, ...rest } = s;
  return { ...R.DEFAULT_SETTINGS, ...rest };
}

const base = (book) => Number(book && book.readBefore) || 0;

// ---------- 시작 ----------
// 저장소를 열고, 처음이면 기본 프로젝트를 만든다. { firstRun } 반환
export async function init() {
  // 저장 공간 보존 요청. 브라우저가 답을 늦게 줄 수 있으므로 기다리지 않는다.
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch { /* 지원하지 않는 브라우저는 그냥 넘어간다 */ }

  const all = await readAll(['projects', 'meta', 'books', 'records']);
  if (all.projects.length > 0) {
    const meta = all.meta.find((m) => m.id === 'meta') || { id: 'meta' };
    if ((meta.schemaVersion || 1) < R.SCHEMA_VERSION) {
      // 최신 형식으로 올림(다른 데이터는 그대로, 바뀐 것만 다시 쓴다):
      //  버전 3 - 프로젝트에 endDate 칸 추가, 예전 기본 설명 "1사이클" 비우기
      //  버전 4 - 이미 다음 백독으로 옮긴 책에 가져온 쪽수·원래 백독 채우기(기록에서 계산)
      //  버전 5 - 책에 소속(모두 project)·이미 읽은 쪽수(0), 마친 백독에 완료/중단, 기록에 열쇠(id)
      const books = R.migrateBooks(R.inferCarried(all.books, all.records));
      const changedBooks = books.filter((b, i) => JSON.stringify(b) !== JSON.stringify(all.books[i]));
      const records = R.migrateRecords(all.records);
      const changedRecs = records.filter((r, i) => r !== all.records[i]);
      await write({ put: {
        projects: R.migrateProjects(all.projects, books), books: changedBooks, records: changedRecs,
        meta: [{ ...meta, schemaVersion: R.SCHEMA_VERSION }],
      } });
    }
    return { firstRun: false };
  }

  const today = todayStr();
  const project = { id: newId('p'), name: '읽기와 사고', description: '', targetBooks: 100, startDate: today, status: R.ACTIVE, endDate: null, createdAt: new Date().toISOString() };
  const subcategories = FIRST_SUBCATEGORIES.map(([name, targetBooks], order) => ({
    id: newId('c'), projectId: project.id, name, targetBooks, order,
  }));
  await write({
    put: {
      projects: [project],
      subcategories,
      settings: [{ id: 'settings', ...R.DEFAULT_SETTINGS }],
      meta: [{ id: 'meta', schemaVersion: R.SCHEMA_VERSION }],
    },
  });
  return { firstRun: true };
}

// 화면에 필요한 모든 데이터를 한 번에 돌려준다(데이터가 작아서 통째로 읽는다)
// project: 진행 중인 백독(없으면 null).
// books: 진행 중인 백독의 책(달성률·카테고리용). outsideBooks: 백독 외 책(어느 백독에도 묶이지 않음).
// readingBooks: 읽는 중인 책 전부(백독 + 백독 외), 가장 최근에 기록한 책이 앞. readingBook = 그 첫 책.
// records: 전체 기록(연속·쉰 날·주간 막대). projectRecords: 진행 중인 백독 기간의 기록(백독 외 책 포함, 통계용).
export async function load() {
  const all = await readAll(['projects', 'subcategories', 'books', 'records', 'settings', 'recommendations', 'memos']);
  const allBooks = R.migrateBooks(all.books).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const projects = R.migrateProjects(all.projects, allBooks);
  const project = R.activeProject(projects);
  const pid = project ? project.id : null;
  const ordinals = R.projectOrdinals(projects);
  const books = allBooks.filter((b) => !R.isOutside(b) && b.projectId === pid && pid);
  const outsideBooks = allBooks.filter((b) => R.isOutside(b));
  const records = R.migrateRecords(all.records).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const lastTouch = (bookId) => records.reduce((m, r) => {
    if (r.bookId !== bookId) return m;
    const k = `${r.date}|${r.savedAt || ''}`;
    return k > m ? k : m;
  }, '');
  const readingBooks = [...books, ...outsideBooks].filter((b) => b.status === 'reading')
    .map((b) => ({ b, k: lastTouch(b.id) || `0|${b.startDate || ''}` }))
    .sort((x, y) => (x.k < y.k ? 1 : x.k > y.k ? -1 : 0))
    .map((x) => x.b);
  return {
    project,
    ordinal: project ? ordinals[project.id] : null,
    projects,
    ordinals,
    subcategories: all.subcategories.filter((c) => c.projectId === pid).sort((a, b) => a.order - b.order),
    allSubcategories: all.subcategories,
    books,
    outsideBooks,
    allBooks,
    records,
    projectRecords: project ? records.filter((r) => (r.projectId === pid || r.projectId == null) && r.date >= project.startDate) : [],
    firstStart: [...projects.map((p) => p.startDate), ...records.map((r) => r.date)].filter(Boolean).sort()[0] || null,
    settings: settingsOf(all.settings),
    readingBooks,
    readingBook: readingBooks[0] || null,
    recommendations: all.recommendations.filter((r) => r.projectId === pid),
    memos: R.migrateMemos(all.memos),
    memoCounts: R.memoCountMap(all.memos),
  };
}

// ---------- 테마백독(주제) ----------
export async function updateProject({ name, description, startDate, targetBooks }) {
  const d = await load();
  if (!d.project) throw new Error('진행 중인 테마백독이 없습니다.');
  const n = String(name || '').trim();
  if (!n) throw new Error('주제를 적어 주세요.');
  await write({ put: { projects: [{
    ...d.project, name: n, description: String(description || '').trim(),
    startDate: R.isDateStr(startDate) ? startDate : d.project.startDate,
    targetBooks: Math.max(1, Math.round(Number(targetBooks) || d.project.targetBooks)),
  }] } });
}

// 이 테마백독 마치기. readingAction: 'carry' | 'finish' | 'drop' (읽는 중인 백독 책에만, 백독 외 책은 그대로)
// endType: '완료' | '중단', endNote: 중단 메모(선택)
export async function finishProject(readingAction, endType = R.END_DONE, endNote = '') {
  const d = await load();
  if (!d.project) throw new Error('진행 중인 테마백독이 없습니다.');
  const hasReading = d.books.some((b) => b.status === 'reading');
  const plan = R.planFinishProject({ project: d.project, books: d.books, today: todayStr(), readingAction: hasReading ? readingAction : 'drop', endType, endNote });
  await write({ put: { projects: [plan.project], books: plan.books } });
  return plan.project;
}

// 새 테마백독 시작. structure: 'empty' | 'copy'
export async function startProject(input, structure) {
  const d = await load();
  const plan = R.planStartProject({
    projects: d.projects, subcategories: d.allSubcategories, books: d.allBooks.filter((b) => !R.isOutside(b)),
    input, structure, makeId: newId, today: todayStr(), now: new Date().toISOString(),
  });
  await write({ put: { projects: [plan.project], subcategories: plan.subcategories, books: plan.books } });
  return plan.project;
}

// 지난 백독을 다시 진행 중으로(진행 중인 백독이 없을 때만)
export async function reopenProject(projectId) {
  const d = await load();
  const plan = R.planReopenProject({ projects: d.projects, books: d.allBooks, projectId });
  await write({ put: { projects: [plan.project], books: plan.books } });
}

// 지난 백독의 완독한 책: 한 줄 생각과 독서평 링크만 고친다
export async function updateBookNotes(bookId, { thought, reviewUrl }) {
  const d = await load();
  const b = d.allBooks.find((x) => x.id === bookId);
  if (!b) throw new Error('책을 찾을 수 없습니다.');
  await write({ put: { books: [{ ...b, thought: String(thought || '').trim(), reviewUrl: String(reviewUrl || '').trim() }] } });
}

// ---------- 추천 도서 ----------
// 초안 목록을 한 번만 넣는다: 프로젝트 이름이 "읽기와 사고"이고 추천이 하나도 없고 아직 넣은 적이 없을 때.
// 넣었으면 넣은 개수, 아니면 0. 파일을 못 읽으면(오프라인 첫 실행 등) 조용히 다음 기회로 미룬다.
export async function seedRecommendations() {
  const all = await readAll(['projects', 'subcategories', 'recommendations', 'meta']);
  const project = R.activeProject(R.migrateProjects(all.projects));
  const meta = all.meta.find((m) => m.id === 'meta') || { id: 'meta', schemaVersion: R.SCHEMA_VERSION };
  if (!project || project.name !== '읽기와 사고' || all.recommendations.length > 0 || meta.recSeeded) return 0;
  let seed;
  try {
    const res = await fetch(new URL('../data/recommendations-seed.json', import.meta.url));
    if (!res.ok) return 0;
    seed = await res.json();
  } catch { return 0; }
  const items = R.seedRecommendations(seed, project, all.subcategories.filter((c) => c.projectId === project.id), () => newId('r'));
  await write({ put: { recommendations: items, meta: [{ ...meta, recSeeded: true }] } });
  return items.length;
}

// Claude에서 붙여 넣은 추천 저장. items: parseRecommendationText의 항목
export async function addRecommendations(items) {
  const d = await load();
  const recs = items.map((it) => ({
    id: newId('r'), projectId: d.project.id, subcategoryId: it.subcategoryId || null,
    title: String(it.title).trim(), author: String(it.author || '').trim(), note: String(it.note || '').trim(),
    source: 'import', hidden: false, addedBookId: null,
  }));
  if (recs.length) await write({ put: { recommendations: recs } });
  return recs.length;
}

export async function hideRecommendation(id) {
  const d = await load();
  const r = d.recommendations.find((x) => x.id === id);
  if (r) await write({ put: { recommendations: [{ ...r, hidden: true }] } });
}

// 책 기록을 다시 계산하고, 완독하지 않은 책의 현재 쪽을 맞춘다(출발점 = 이미 읽은 쪽수)
function reconcile(records, books, bookIds) {
  const recPut = [];
  const bookPut = [];
  let list = records;
  for (const bookId of bookIds) {
    if (!bookId) continue;
    const book = books.find((b) => b.id === bookId);
    const changed = R.recomputeBook(list, bookId, base(book));
    if (changed.length) {
      const byId = new Map(changed.map((r) => [r.id, r]));
      list = list.map((r) => byId.get(r.id) || r);
      recPut.push(...changed);
    }
    if (book && book.status !== 'done') {
      const cur = R.latestEndPage(list, bookId, base(book));
      if (cur !== book.currentPage) bookPut.push({ ...book, currentPage: cur });
    }
  }
  return { recPut, bookPut };
}

// ---------- 하루 기록 ----------
// mode 'pages'면 endPage(현재 쪽)를 저장, 'time'이면 30분 읽음으로 저장. 같은 날 같은 책은 덮어쓴다.
// 같은 날 다른 책 기록은 그대로 둔다(하루 등급은 rules.js가 그날 합계로 계산).
export async function saveDay({ date, bookId, mode, endPage }) {
  const d = await load();
  const book = d.allBooks.find((b) => b.id === bookId);
  if (!book) throw new Error('책을 찾을 수 없습니다.');
  const key = R.recordKey(date, bookId);
  const others = d.records.filter((r) => r.id !== key);
  const projectId = R.isOutside(book) ? null : book.projectId;
  const made = mode === 'time'
    ? R.makeTimeRecord({ date, projectId, bookId, records: others, settings: d.settings, base: base(book) })
    : R.makePagesRecord({ date, projectId, bookId, endPage, totalPages: book.totalPages, records: others, base: base(book) });
  const rec = { ...made, savedAt: new Date().toISOString() };
  const { recPut, bookPut } = reconcile([...others, rec], d.allBooks, [bookId]);
  // 새 기록 자체도 다시 계산된 값이 있으면 그것을 쓴다
  const finalRec = recPut.find((r) => r.id === key) || rec;
  await write({ put: { records: [finalRec, ...recPut.filter((r) => r.id !== key)], books: bookPut } });
  return finalRec;
}

// ---------- 책 ----------
// 책 추가. scope 'project'(진행 중인 테마백독, 카테고리 필수) | 'outside'(백독 외)
// readBefore: 앱에 넣기 전 이미 읽은 쪽수(진행률 출발점, 오늘·주간·누적 쪽수에는 더하지 않음)
// 읽는 중인 책은 여러 권일 수 있다(v1.4).
export async function addBook({ title, author, totalPages, subcategoryId, startNow, scope = 'project', readBefore = 0, startDate = null, recommendationId = null }) {
  const d = await load();
  const outside = scope === 'outside';
  if (!outside && !d.project) throw new Error('진행 중인 테마백독이 없습니다. "백독 외 독서"로 추가하거나 새 테마백독을 시작하세요.');
  if (!outside && !subcategoryId) throw new Error('카테고리를 골라 주세요.');
  const today = todayStr();
  const total = Math.round(Number(totalPages));
  const before = Math.min(Math.max(0, Math.round(Number(readBefore) || 0)), total);
  const order = d.allBooks.reduce((m, b) => Math.max(m, b.order ?? 0), 0) + 1;
  const book = {
    id: newId('b'), projectId: outside ? null : d.project.id, subcategoryId: outside ? null : subcategoryId,
    scope: outside ? 'outside' : 'project', readBefore: before,
    title: String(title).trim(), author: String(author || '').trim(),
    totalPages: total, order,
    status: startNow ? 'reading' : 'planned',
    startDate: startNow ? (R.isDateStr(startDate) ? startDate : today) : null, finishDate: null,
    thought: '', reviewUrl: '', currentPage: before,
  };
  const rec = recommendationId && d.recommendations.find((r) => r.id === recommendationId);
  await write({ put: { books: [book], ...(rec ? { recommendations: [{ ...rec, addedBookId: book.id }] } : {}) } });
  return book;
}

function findOpenBook(d, bookId) {
  return d.books.find((b) => b.id === bookId) || d.outsideBooks.find((b) => b.id === bookId) || null;
}

// 읽을 목록의 책을 읽기 시작(다른 읽는 중 책은 그대로)
export async function startReading(bookId) {
  const d = await load();
  const book = findOpenBook(d, bookId);
  if (!book) throw new Error('책을 찾을 수 없습니다.');
  await write({ put: { books: [{ ...book, status: 'reading', startDate: book.startDate || todayStr(), currentPage: R.latestEndPage(d.records, bookId, base(book)) }] } });
}

// 읽는 중인 책을 중단(dropped, 기록은 남음)하거나 읽을 목록(planned)으로 되돌린다
export async function setBookStatus(bookId, status) {
  if (!['dropped', 'planned'].includes(status)) throw new Error('바꿀 수 없는 상태입니다.');
  const d = await load();
  const book = findOpenBook(d, bookId);
  if (!book) throw new Error('책을 찾을 수 없습니다.');
  await write({ put: { books: [{ ...book, status }] } });
}

// 소속 바꾸기: 'project'(카테고리 필수) ↔ 'outside'
export async function changeScope(bookId, toScope, subcategoryId = null) {
  const d = await load();
  const book = d.allBooks.find((b) => b.id === bookId);
  const plan = R.planScopeChange({ book, toScope, project: d.project, subcategoryId, records: d.records });
  await write({ put: { books: [plan.book], records: plan.records } });
  return plan.book;
}

// 완독 처리(또는 완독한 책 정보 수정). 백독 외 책은 카테고리 없음.
export async function finishBook(bookId, { finishDate, subcategoryId, thought, reviewUrl }) {
  const d = await load();
  const book = findOpenBook(d, bookId);
  if (!book) throw new Error('책을 찾을 수 없습니다.');
  const done = {
    ...book, status: 'done',
    finishDate: R.isDateStr(finishDate) ? finishDate : todayStr(),
    subcategoryId: R.isOutside(book) ? null : (subcategoryId || book.subcategoryId),
    thought: String(thought || '').trim(),
    reviewUrl: String(reviewUrl || '').trim(),
    currentPage: book.totalPages,
  };
  await write({ put: { books: [done] } });
  return done;
}

// ---------- 책별 메모 (v1.5) ----------
function cleanMemoFields({ text, page, type }) {
  return {
    text: String(text ?? '').trim(),
    page: R.memoPage(page),
    type: R.MEMO_TYPES.includes(type) ? type : 'thought',
  };
}

// 메모 한 건 추가. 본문이 비어 있으면 저장하지 않는다(오류).
export async function addMemo({ bookId, text, page = null, type = 'thought', source = 'typed' }) {
  const all = await readAll(['books']);
  if (!all.books.some((b) => b.id === bookId)) throw new Error('책을 찾을 수 없습니다.');
  const f = cleanMemoFields({ text, page, type });
  if (!f.text) throw new Error('메모 내용을 적어 주세요.');
  const now = new Date().toISOString();
  const memo = { id: newId('m'), bookId, ...f, createdAt: now, updatedAt: now, source: source === 'paste' ? 'paste' : 'typed' };
  await write({ put: { memos: [memo] } });
  return memo;
}

// 하이라이트 붙여넣기: 이미 있는 같은 본문 인용은 건너뛴다. { added, skipped }
export async function addHighlights(bookId, items) {
  const existing = await listMemos(bookId);
  const plan = R.planHighlightImport(items, existing);
  const base = Date.now();
  // 같은 쪽 안에서 붙여 넣은 순서가 유지되도록 1ms씩 늦춘 시각을 쓴다
  const memos = plan.add.map((it, i) => {
    const t = new Date(base + i).toISOString();
    return { id: newId('m'), bookId, text: String(it.text).trim(), page: R.memoPage(it.page), type: 'quote', createdAt: t, updatedAt: t, source: 'paste' };
  });
  if (memos.length) await write({ put: { memos } });
  return { added: memos.length, skipped: plan.skipped };
}

export async function updateMemo(id, fields) {
  const all = await readAll(['memos']);
  const m = all.memos.find((x) => x.id === id);
  if (!m) throw new Error('메모를 찾을 수 없습니다.');
  const f = cleanMemoFields({ text: fields.text ?? m.text, page: 'page' in fields ? fields.page : m.page, type: fields.type ?? m.type });
  if (!f.text) throw new Error('메모 내용을 적어 주세요.');
  const next = { ...m, ...f, updatedAt: new Date().toISOString() };
  await write({ put: { memos: [next] } });
  return next;
}

export async function deleteMemo(id) {
  await write({ del: { memos: [id] } });
}

// 한 책의 메모(쪽수순, 쪽 없는 메모는 맨 뒤)
export async function listMemos(bookId) {
  const all = await readAll(['memos']);
  return R.sortMemos(R.migrateMemos(all.memos).filter((m) => m.bookId === bookId));
}

// { 책 id: 메모 개수 }
export async function memoCounts() {
  const all = await readAll(['memos']);
  return R.memoCountMap(all.memos);
}

// ---------- 설정 ----------
export async function saveSettings({ settings, project, subcategories }) {
  const d = await load();
  const put = {};
  if (settings) put.settings = [{ id: 'settings', ...d.settings, ...settings }];
  if (project) put.projects = [{ ...d.project, ...project }];
  if (subcategories) {
    put.subcategories = subcategories.map((c) => {
      const old = d.subcategories.find((o) => o.id === c.id);
      return { ...old, ...c };
    });
  }
  await write({ put });
}

// 카테고리 편집 저장(한 번에). rows: [{id|null, name, targetBooks}] 순서대로, moves: { 지운 id: 옮길 id }
export async function saveCategories({ targetBooks, rows, moves }) {
  const d = await load();
  const ids = new Map();
  const fixed = rows.map((r) => {
    const id = r.id && !String(r.id).startsWith('new:') ? r.id : newId('c');
    ids.set(r.id, id);
    return { ...r, id };
  });
  const fixedMoves = {};
  for (const [from, to] of Object.entries(moves || {})) fixedMoves[from] = ids.get(to) || to;
  const res = R.applyCategoryEdit({
    projectId: d.project.id, subcategories: d.subcategories, books: d.books,
    recommendations: d.recommendations || [], rows: fixed, moves: fixedMoves,
  });
  const put = { subcategories: res.subcategories, books: res.books, projects: [{ ...d.project, targetBooks: Math.max(1, Math.round(targetBooks)) }] };
  if (res.recommendations.length) put.recommendations = res.recommendations;
  await write({ put, del: { subcategories: res.deletedIds } });
}

// ---------- 백업 ----------
export async function exportData() {
  const all = await readAll();
  const exportedAt = new Date().toISOString();
  return {
    app: 'themebaekdok',
    schemaVersion: R.SCHEMA_VERSION,
    exportedAt,
    data: {
      projects: all.projects,
      subcategories: all.subcategories,
      books: all.books,
      dayRecords: all.records, // 파일 속 이름은 예전과 같이 dayRecords(버전 5부터 날짜+책당 1건)
      recommendations: all.recommendations,
      memos: all.memos, // 버전 6(v1.5)부터
      // 파일 안의 마지막 백업 시각 = 내보낸 시각(이 파일로 복원하면 알림이 바로 뜨지 않게)
      settings: { ...settingsOf(all.settings), lastBackupAt: exportedAt },
    },
  };
}

export async function markBackedUp(iso = new Date().toISOString()) {
  await saveSettings({ settings: { lastBackupAt: iso } });
}

// 형식이 틀리면 아무것도 바꾸지 않고 { ok:false, error } 반환
export async function importData(obj) {
  const v = R.validateBackup(obj);
  if (!v.ok) return v;
  const data = R.normalizeBackup(obj, new Date().toISOString());
  await write({
    clear: STORES,
    put: {
      projects: data.projects,
      subcategories: data.subcategories,
      books: data.books,
      records: data.dayRecords,
      recommendations: data.recommendations,
      memos: data.memos, // 버전 5 이하 파일은 [] (메모 없음)
      settings: [{ id: 'settings', ...data.settings }],
      // 버전 2 이상 파일은 추천을 그대로 가져온다. 버전 1 파일은 추천 없음 → 다음 시작 때 초안을 한 번 넣는다.
      meta: [{ id: 'meta', schemaVersion: R.SCHEMA_VERSION, recSeeded: obj.schemaVersion >= 2 }],
    },
  });
  return { ok: true };
}
