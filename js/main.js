// 앱 시작, 화면 전환(주소의 # 부분), 서비스 워커 등록
import * as repo from './repo.js';
import { todayStr } from './format.js';
import * as today from './screens/today.js';
import * as status from './screens/status.js';
import * as week from './screens/week.js';
import * as addBook from './screens/addBook.js';
import * as finish from './screens/finish.js';
import * as settings from './screens/settings.js';
import * as categories from './screens/categories.js';
import * as category from './screens/category.js';
import * as recs from './screens/recs.js';
import * as history from './screens/history.js';
import * as newProject from './screens/newProject.js';

const ROUTES = {
  today: { screen: today, tabs: true },
  status: { screen: status, tabs: true },
  week: { screen: week, tabs: true },
  add: { screen: addBook, tabs: false, needsProject: true },
  finish: { screen: finish, tabs: false, needsProject: true },
  settings: { screen: settings, tabs: false },
  categories: { screen: categories, tabs: true, tab: 'status', needsProject: true },
  category: { screen: category, tabs: true, tab: 'status', needsProject: true },
  recs: { screen: recs, tabs: false, needsProject: true },
  history: { screen: history, tabs: true },
  newproject: { screen: newProject, tabs: false },
};

const root = document.getElementById('screen');
const tabs = document.getElementById('tabs');

function parseHash() {
  const [name, param] = location.hash.replace(/^#\/?/, '').split('/');
  return ROUTES[name] ? { name, param: param ? decodeURIComponent(param) : null } : { name: 'today', param: null };
}

export function go(path) {
  if (location.hash === `#/${path}`) render();
  else location.hash = `#/${path}`;
}

let renderSeq = 0;
let lastRoute = '';
let renderedDate = null;

async function render() {
  const seq = ++renderSeq;
  const route = parseHash();
  const def = ROUTES[route.name];
  const data = await repo.load();
  if (seq !== renderSeq) return; // 더 최근 요청이 있으면 버린다
  data.today = todayStr();
  renderedDate = data.today;
  tabs.hidden = !def.tabs;
  tabs.querySelectorAll('a').forEach((a) => {
    if (a.dataset.tab === (def.tab || route.name)) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const key = `${route.name}/${route.param || ''}`;
  const keepScroll = key === lastRoute ? root.scrollTop : 0;
  lastRoute = key;
  root.innerHTML = '';
  // 진행 중인 테마백독이 있어야 하는 화면: 없으면 안내로 대신한다
  if (def.needsProject && !data.project) {
    tabs.hidden = false;
    root.innerHTML = today.noProjectHtml();
  } else {
    def.screen.render(root, data, { param: route.param, go, refresh: render });
  }
  root.dataset.screen = key;
  root.scrollTop = keepScroll;
}

// 앱으로 다시 돌아왔을 때: 날짜가 바뀌었거나 오래 떠나 있었으면 오늘 화면으로
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
  const route = parseHash().name;
  const away = hiddenAt ? Date.now() - hiddenAt : 0;
  const dateChanged = renderedDate && renderedDate !== todayStr();
  if (away > 5 * 60 * 1000) checkForUpdate(); // 오래 쉬었다가 다시 켜면 새 버전 확인
  if ((dateChanged || away > 5 * 60 * 1000) && ['status', 'week', 'history', 'category'].includes(route)) go('today');
  else if (dateChanged && ROUTES[route].tabs) render();
});

async function start() {
  try {
    const { firstRun } = await repo.init();
    if (firstRun) location.hash = '#/add';
    else if (!ROUTES[location.hash.replace(/^#\/?/, '').split('/')[0]]) location.hash = '#/today';
    window.addEventListener('hashchange', render);
    await render();
    // 추천 초안은 첫 화면을 띄운 뒤 넣는다(홈이 늦게 뜨지 않게). 넣었으면 추천이 보이는 화면만 다시 그린다.
    repo.seedRecommendations().then((n) => {
      if (n && ['status', 'category', 'recs'].includes(parseHash().name)) render();
    }).catch(() => {});
  } catch (err) {
    root.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'loading';
    p.textContent = `앱을 열지 못했습니다: ${err && err.message ? err.message : err}`;
    root.appendChild(p);
  }
}

// 서비스 워커 등록. 열 때마다 새 버전이 있는지 직접 확인한다(휴대폰 홈 화면 앱은 브라우저가 스스로
// 확인하지 않는 경우가 있다). 새 버전은 뒤에서 받아 두고 다음 번 열 때 적용된다. 오프라인이면 조용히 넘어간다.
let swReg = null;
function checkForUpdate() {
  if (swReg) swReg.update().catch(() => {});
}
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then((reg) => { swReg = reg; checkForUpdate(); })
      .catch(() => { /* 오프라인 기능만 빠진다 */ });
  });
}

start();
