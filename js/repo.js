// 데이터 접근 계층. 화면 코드는 저장소(IndexedDB)에 직접 접근하지 않고 이 모듈만 호출한다.
// 나중에 서버 저장으로 바꿀 때 이 파일만 교체하면 되도록 함수 이름을 일(업무) 단위로 둔다.

import * as R from './rules.js';
import { todayStr } from './format.js';

const DB_NAME = 'themebaekdok';
// 저장소 버전 기록: 1 = 1단계, 2 = v1.1 추천 도서(recommendations) 추가. 기존 저장소·데이터는 그대로 둔다.
const DB_VERSION = 2;
const STORES = ['projects', 'subcategories', 'books', 'dayRecords', 'settings', 'meta', 'recommendations'];

const FIRST_SUBCATEGORIES = [
  ['독서·문해력', 25],
  ['인지·학습과학', 25],
  ['미디어·기술이 사고를 바꾼 역사', 20],
  ['AI와 지식노동의 미래', 15],
  ['위대한 독서가들의 삶', 15],
];

// ---------- IndexedDB 작은 래퍼 ----------
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    // 없는 저장소만 만든다(버전 1에서 올라올 때 기존 데이터를 건드리지 않음)
    req.onupgradeneeded = () => {
      const db = req.result;
      const make = (name, keyPath) => { if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath }); };
      make('projects', 'id');
      make('subcategories', 'id');
      make('books', 'id');
      make('dayRecords', 'date');
      make('settings', 'id');
      make('meta', 'id');
      make('recommendations', 'id');
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    // 예전 버전이 다른 탭에 열려 있으면 그 탭이 저장소를 닫을 때까지 기다린다(1단계 코드도 스스로 닫는다)
    req.onblocked = () => {};
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

// ---------- 시작 ----------
// 저장소를 열고, 처음이면 기본 프로젝트를 만든다. { firstRun } 반환
export async function init() {
  // 저장 공간 보존 요청. 브라우저가 답을 늦게 줄 수 있으므로 기다리지 않는다.
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch { /* 지원하지 않는 브라우저는 그냥 넘어간다 */ }

  const all = await readAll(['projects', 'meta', 'books', 'dayRecords']);
  if (all.projects.length > 0) {
    const meta = all.meta.find((m) => m.id === 'meta') || { id: 'meta' };
    if ((meta.schemaVersion || 1) < R.SCHEMA_VERSION) {
      // 최신 형식으로 올림(다른 데이터는 그대로):
      //  버전 3 - 프로젝트에 endDate 칸 추가, 예전 기본 설명 "1사이클" 비우기
      //  버전 4 - 이미 다음 백독으로 옮긴 책에 가져온 쪽수·원래 백독 채우기(기록에서 계산)
      const books = R.inferCarried(all.books, all.dayRecords);
      const changedBooks = books.filter((b, i) => b !== all.books[i]);
      await write({ put: { projects: R.migrateProjects(all.projects), books: changedBooks, meta: [{ ...meta, schemaVersion: R.SCHEMA_VERSION }] } });
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
// project: 진행 중인 백독(없으면 null). 책·카테고리·추천은 진행 중인 백독의 것만.
// records: 전체 기록(연속일수·쉰 날 안내는 백독과 무관하게 계산), projectRecords: 진행 중인 백독의 기록.
export async function load() {
  const all = await readAll(['projects', 'subcategories', 'books', 'dayRecords', 'settings', 'recommendations']);
  const projects = R.migrateProjects(all.projects);
  const project = R.activeProject(projects);
  const pid = project ? project.id : null;
  const ordinals = R.projectOrdinals(projects);
  const allBooks = all.books.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const books = allBooks.filter((b) => b.projectId === pid);
  const records = all.dayRecords.sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    project,
    ordinal: project ? ordinals[project.id] : null,
    projects,
    ordinals,
    subcategories: all.subcategories.filter((c) => c.projectId === pid).sort((a, b) => a.order - b.order),
    allSubcategories: all.subcategories,
    books,
    allBooks,
    records,
    projectRecords: records.filter((r) => r.projectId === pid),
    firstStart: projects.reduce((m, p) => (!m || (p.startDate && p.startDate < m) ? p.startDate : m), null),
    settings: settingsOf(all.settings),
    readingBook: books.find((b) => b.status === 'reading') || null,
    recommendations: all.recommendations.filter((r) => r.projectId === pid),
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

// 이 테마백독 마치기. readingAction: 'carry' | 'finish' | 'drop' (읽는 중 책이 없으면 무시)
export async function finishProject(readingAction) {
  const d = await load();
  if (!d.project) throw new Error('진행 중인 테마백독이 없습니다.');
  const plan = R.planFinishProject({ project: d.project, books: d.allBooks, today: todayStr(), readingAction: d.readingBook ? readingAction : 'drop' });
  await write({ put: { projects: [plan.project], books: plan.books } });
  return plan.project;
}

// 새 테마백독 시작. structure: 'empty' | 'copy'
export async function startProject(input, structure) {
  const d = await load();
  const plan = R.planStartProject({
    projects: d.projects, subcategories: d.allSubcategories, books: d.allBooks,
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

// 책 기록을 다시 계산하고, 읽는 중·읽을 목록·중단 책의 현재 쪽을 맞춘다
function reconcile(records, books, bookIds) {
  const recPut = [];
  const bookPut = [];
  let list = records;
  for (const bookId of bookIds) {
    if (!bookId) continue;
    const changed = R.recomputeBook(list, bookId);
    if (changed.length) {
      const byDate = new Map(changed.map((r) => [r.date, r]));
      list = list.map((r) => byDate.get(r.date) || r);
      recPut.push(...changed);
    }
    const book = books.find((b) => b.id === bookId);
    if (book && book.status !== 'done') {
      const cur = R.latestEndPage(list, bookId);
      if (cur !== book.currentPage) bookPut.push({ ...book, currentPage: cur });
    }
  }
  return { recPut, bookPut };
}

// ---------- 하루 기록 ----------
// mode 'pages'면 endPage(현재 쪽)를 저장, 'time'이면 30분 읽음으로 저장. 같은 날짜는 덮어쓴다.
export async function saveDay({ date, bookId, mode, endPage }) {
  const d = await load();
  const book = d.allBooks.find((b) => b.id === bookId);
  if (!book) throw new Error('책을 찾을 수 없습니다.');
  const old = d.records.find((r) => r.date === date);
  const others = d.records.filter((r) => r.date !== date);
  const rec = mode === 'time'
    ? R.makeTimeRecord({ date, projectId: book.projectId, bookId, records: others, settings: d.settings })
    : R.makePagesRecord({ date, projectId: book.projectId, bookId, endPage, totalPages: book.totalPages, records: others });
  const records = [...others, rec];
  const { recPut, bookPut } = reconcile(records, d.allBooks, [bookId, old && old.bookId !== bookId ? old.bookId : null]);
  // 새 기록 자체도 다시 계산된 값이 있으면 그것을 쓴다
  const finalRec = recPut.find((r) => r.date === date) || rec;
  await write({ put: { dayRecords: [finalRec, ...recPut.filter((r) => r.date !== date)], books: bookPut } });
  return finalRec;
}

// ---------- 책 ----------
// 읽는 중인 책을 정리한다: 'finish' 완독 / 'drop' 중단 / 'planned' 읽을 목록으로
function retire(book, how, today) {
  if (!book) return [];
  if (how === 'finish') return [{ ...book, status: 'done', finishDate: today, currentPage: book.totalPages }];
  if (how === 'drop') return [{ ...book, status: 'dropped' }];
  if (how === 'planned') return [{ ...book, status: 'planned' }];
  throw new Error('읽는 중인 책을 어떻게 할지 정해야 합니다.');
}

export async function addBook({ title, author, totalPages, subcategoryId, startNow, replace, recommendationId = null }) {
  const d = await load();
  if (!d.project) throw new Error('진행 중인 테마백독이 없습니다. 먼저 새 테마백독을 시작하세요.');
  const today = todayStr();
  const order = d.allBooks.reduce((m, b) => Math.max(m, b.order ?? 0), 0) + 1;
  const book = {
    id: newId('b'), projectId: d.project.id, subcategoryId,
    title: String(title).trim(), author: String(author || '').trim(),
    totalPages: Math.round(Number(totalPages)), order,
    status: startNow ? 'reading' : 'planned',
    startDate: startNow ? today : null, finishDate: null,
    thought: '', reviewUrl: '', currentPage: 0,
  };
  const put = [book];
  if (startNow && d.readingBook) put.push(...retire(d.readingBook, replace, today));
  const rec = recommendationId && d.recommendations.find((r) => r.id === recommendationId);
  await write({ put: { books: put, ...(rec ? { recommendations: [{ ...rec, addedBookId: book.id }] } : {}) } });
  return book;
}

export async function startReading(bookId, replace) {
  const d = await load();
  const today = todayStr();
  const book = d.books.find((b) => b.id === bookId);
  if (!book) throw new Error('책을 찾을 수 없습니다.');
  const put = [{ ...book, status: 'reading', startDate: book.startDate || today, currentPage: R.latestEndPage(d.records, bookId) }];
  if (d.readingBook && d.readingBook.id !== bookId) put.push(...retire(d.readingBook, replace, today));
  await write({ put: { books: put } });
}

// 완독 처리(또는 완독한 책 정보 수정)
export async function finishBook(bookId, { finishDate, subcategoryId, thought, reviewUrl }) {
  const d = await load();
  const book = d.books.find((b) => b.id === bookId);
  if (!book) throw new Error('책을 찾을 수 없습니다.');
  const done = {
    ...book, status: 'done',
    finishDate: R.isDateStr(finishDate) ? finishDate : todayStr(),
    subcategoryId: subcategoryId || book.subcategoryId,
    thought: String(thought || '').trim(),
    reviewUrl: String(reviewUrl || '').trim(),
    currentPage: book.totalPages,
  };
  await write({ put: { books: [done] } });
  return done;
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
      dayRecords: all.dayRecords,
      recommendations: all.recommendations,
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
      dayRecords: data.dayRecords,
      recommendations: data.recommendations,
      settings: [{ id: 'settings', ...data.settings }],
      // 버전 2 파일은 추천을 그대로 가져온다. 버전 1 파일은 추천 없음 → 다음 시작 때 초안을 한 번 넣는다.
      meta: [{ id: 'meta', schemaVersion: R.SCHEMA_VERSION, recSeeded: obj.schemaVersion >= 2 }],
    },
  });
  return { ok: true };
}
